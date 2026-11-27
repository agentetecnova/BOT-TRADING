"""Live/Hourly AI inference script generating public/ai_oracle_snapshot.json."""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Dict, List
import joblib
import numpy as np
import pandas as pd

from ai_engine.config import (
    ARTIFACTS_DIR,
    DEFAULT_SNAPSHOT_PATH,
    HORIZONS,
    MIN_EDGE_PROB,
    MIN_EXPECTED_VALUE,
    ROUND_TRIP_FEE_PCT,
    SYMBOL,
)
from ai_engine.data.market_loader import (
    fetch_binance_klines,
    fetch_funding_history,
    fetch_futures_live_metrics,
)
from ai_engine.data.onchain_loader import (
    fetch_combined_onchain_daily,
    fetch_mempool_live,
)
from ai_engine.features.feature_builder import FEATURE_LABELS_ES, build_feature_matrix


def _explain_top_drivers(latest_row: pd.Series, feature_cols: List[str], stats: Dict[str, np.ndarray], top_n: int = 4) -> List[Dict[str, Any]]:
    """Surface the most extreme active technical + on-chain conditions in plain Spanish."""
    means = stats["means"]
    stds = stats["stds"]
    scored = []
    for idx, col in enumerate(feature_cols):
        val = latest_row.get(col, np.nan)
        if not np.isfinite(val):
            continue
        z = (float(val) - float(means[idx])) / float(stds[idx])
        if col.startswith("session_"):
            continue
        scored.append((abs(z), z, col, float(val)))

    scored.sort(reverse=True, key=lambda x: x[0])
    drivers = []
    for abs_z, z, col, raw_val in scored[:top_n]:
        label = FEATURE_LABELS_ES.get(col, col)
        polarity = "MUY ALTO" if z >= 1.2 else ("ALTO" if z >= 0.4 else ("MUY BAJO" if z <= -1.2 else ("BAJO" if z <= -0.4 else "NEUTRAL")))
        is_onchain = col.startswith("onchain_") or col.startswith("funding_")
        drivers.append(
            {
                "feature": col,
                "label": label,
                "category": "On-Chain / Liquidez" if is_onchain else "Técnico / Flujo",
                "zScore": round(z, 2),
                "state": polarity,
                "rawValue": round(raw_val, 5),
            }
        )
    return drivers


def _evaluate_horizon(
    horizon_key: str,
    bundle: Dict[str, Any],
    base_klines: pd.DataFrame,
    daily_klines: pd.DataFrame,
    funding_df: pd.DataFrame,
    onchain_daily: pd.DataFrame,
) -> Dict[str, Any]:
    spec = HORIZONS[horizon_key]
    feat_df = build_feature_matrix(base_klines, daily_klines, funding_df, onchain_daily)
    latest = feat_df.iloc[-1]
    feature_cols = bundle["featureColumns"]

    x_vec = np.array([float(latest.get(c, np.nan)) for c in feature_cols], dtype=float).reshape(1, -1)
    p_long = float(bundle["longModel"].predict_proba(x_vec)[0, 1])
    p_short = float(bundle["shortModel"].predict_proba(x_vec)[0, 1])

    entry = float(latest["close"])
    atr = float(latest["atr_14"]) if np.isfinite(latest.get("atr_14", np.nan)) else entry * 0.01
    eff_atr = max(atr, entry * 0.004)
    tp_dist = spec.tp_atr_mult * eff_atr
    sl_dist = spec.sl_atr_mult * eff_atr
    tp_pct = tp_dist / entry
    sl_pct = sl_dist / entry

    # Net Expected Value after round-trip trading fees
    ev_long = p_long * (tp_pct - ROUND_TRIP_FEE_PCT) - (1.0 - p_long) * (sl_pct + ROUND_TRIP_FEE_PCT)
    ev_short = p_short * (tp_pct - ROUND_TRIP_FEE_PCT) - (1.0 - p_short) * (sl_pct + ROUND_TRIP_FEE_PCT)

    wf_long = bundle["walkForward"]["long"]
    wf_short = bundle["walkForward"]["short"]

    verdict = "ESPERAR"
    verdict_es = "ESPERAR CONFIRMACIÓN (Sin ventaja estadística neta)"
    plan = None

    long_ok = p_long >= spec.prob_threshold and ev_long >= MIN_EXPECTED_VALUE and ev_long >= ev_short and wf_long.get("edgeValidated", False)
    short_ok = p_short >= spec.prob_threshold and ev_short >= MIN_EXPECTED_VALUE and ev_short > ev_long and wf_short.get("edgeValidated", False)

    # Also allow clear probabilistic tilt only when EV > MIN_EXPECTED_VALUE (noting WF status honestly)
    if not long_ok and not short_ok:
        if p_long >= (spec.prob_threshold + 0.03) and ev_long >= MIN_EXPECTED_VALUE and ev_long >= ev_short:
            long_ok = True
        elif p_short >= (spec.prob_threshold + 0.03) and ev_short >= MIN_EXPECTED_VALUE and ev_short > ev_long:
            short_ok = True

    if long_ok:
        verdict = "LONG"
        verdict_es = "SESGO ALCISTA IA (LONG)"
        sl = round(entry - sl_dist, 2)
        tp1 = round(entry + sl_dist * 1.6, 2)
        tp2 = round(entry + tp_dist, 2)
        plan = {
            "direction": "LONG",
            "entry": round(entry, 2),
            "sl": sl,
            "tp1": tp1,
            "tp2": tp2,
            "riskPct": round(sl_pct * 100.0, 2),
            "rewardPct": round(tp_pct * 100.0, 2),
            "rr": round(tp_dist / sl_dist, 2),
        }
    elif short_ok:
        verdict = "SHORT"
        verdict_es = "SESGO BAJISTA IA (SHORT)"
        sl = round(entry + sl_dist, 2)
        tp1 = round(entry - sl_dist * 1.6, 2)
        tp2 = round(entry - tp_dist, 2)
        plan = {
            "direction": "SHORT",
            "entry": round(entry, 2),
            "sl": sl,
            "tp1": tp1,
            "tp2": tp2,
            "riskPct": round(sl_pct * 100.0, 2),
            "rewardPct": round(tp_pct * 100.0, 2),
            "rr": round(tp_dist / sl_dist, 2),
        }

    analog_finder = bundle["analogFinder"]
    analogs_res = analog_finder.query(latest, current_ts_ms=int(latest["timestamp_ms"]))
    drivers = _explain_top_drivers(latest, feature_cols, bundle["featureStats"], top_n=4)

    return {
        "horizon": horizon_key,
        "labelEs": spec.label_es,
        "timeframe": spec.timeframe,
        "lastCandleCloseUtc": pd.to_datetime(int(latest["close_time_ms"]), unit="ms", utc=True).isoformat(),
        "price": round(entry, 2),
        "verdict": verdict,
        "verdictEs": verdict_es,
        "probLongPct": round(p_long * 100.0, 1),
        "probShortPct": round(p_short * 100.0, 1),
        "evLongPct": round(ev_long * 100.0, 3),
        "evShortPct": round(ev_short * 100.0, 3),
        "plan": plan,
        "walkForward": {"long": wf_long, "short": wf_short},
        "topDrivers": drivers,
        "historicalAnalogs": analogs_res,
    }


def generate_snapshot(
    model_path: Path = ARTIFACTS_DIR / "btc_ai_models.joblib",
    output_path: Path = DEFAULT_SNAPSHOT_PATH,
) -> Path:
    """Fetch fresh public market + on-chain data (~90d window) and produce lightweight JSON snapshot."""
    if not model_path.exists():
        raise FileNotFoundError(f"Trained AI artifact not found at {model_path}")

    artifact = joblib.load(model_path)
    bundles = artifact["bundles"]

    # Fetch only recent window needed for EMA200 & 30d on-chain deltas (~5s total, zero DB needed in CI)
    k1h = fetch_binance_klines(SYMBOL, interval="1h", days=35)
    k4h = fetch_binance_klines(SYMBOL, interval="4h", days=90)
    k1d = fetch_binance_klines(SYMBOL, interval="1d", days=120)
    funding = fetch_funding_history(SYMBOL, days=35)
    onchain = fetch_combined_onchain_daily(start_date="2025-01-01")
    mempool = fetch_mempool_live()
    futures_live = fetch_futures_live_metrics(SYMBOL)

    latest_oc = onchain.iloc[-1] if not onchain.empty else {}
    latest_stables_chg_7d = None
    if not onchain.empty and "stablecoin_mcap_usd" in onchain.columns and len(onchain) >= 8:
        st_now = pd.to_numeric(onchain["stablecoin_mcap_usd"].iloc[-1], errors="coerce")
        st_prev = pd.to_numeric(onchain["stablecoin_mcap_usd"].iloc[-8], errors="coerce")
        if np.isfinite(st_now) and np.isfinite(st_prev) and st_prev > 0:
            latest_stables_chg_7d = round(((st_now - st_prev) / st_prev) * 100.0, 2)

    horizons_out = {
        "intraday": _evaluate_horizon("intraday", bundles["intraday"], k1h, k1d, funding, onchain),
        "swing": _evaluate_horizon("swing", bundles["swing"], k4h, k1d, funding, onchain),
    }

    snapshot = {
        "schemaVersion": "1.0",
        "symbol": SYMBOL,
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "modelTrainedAtUtc": artifact.get("createdAtUtc"),
        "btcPrice": round(float(k1h["close"].iloc[-1]), 2),
        "onchainContext": {
            "asOfDate": str(latest_oc.get("date")) if isinstance(latest_oc, pd.Series) else None,
            "activeAddresses": float(latest_oc["active_addresses"]) if isinstance(latest_oc, pd.Series) and pd.notna(latest_oc.get("active_addresses")) else None,
            "txTransferUsd": float(latest_oc["tx_transfer_usd"]) if isinstance(latest_oc, pd.Series) and pd.notna(latest_oc.get("tx_transfer_usd")) else None,
            "stablecoinMcapUsd": float(latest_oc["stablecoin_mcap_usd"]) if isinstance(latest_oc, pd.Series) and pd.notna(latest_oc.get("stablecoin_mcap_usd")) else None,
            "stablecoin7dChgPct": latest_stables_chg_7d,
            "fearGreed": float(latest_oc["fear_greed"]) if isinstance(latest_oc, pd.Series) and pd.notna(latest_oc.get("fear_greed")) else None,
            "mempool": mempool,
            "futures": futures_live,
        },
        "horizons": horizons_out,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate BTCUSDT AI Oracle JSON snapshot.")
    parser.add_argument("--model", type=Path, default=ARTIFACTS_DIR / "btc_ai_models.joblib")
    parser.add_argument("--output", type=Path, default=DEFAULT_SNAPSHOT_PATH)
    args = parser.parse_args()
    out = generate_snapshot(model_path=args.model, output_path=args.output)
    print(f"Snapshot written to {out}")


if __name__ == "__main__":
    main()
