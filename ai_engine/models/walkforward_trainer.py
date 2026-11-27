"""Purged Walk-Forward training, probability calibration, and honest OOS trading evaluation."""

import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple
import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.frozen import FrozenEstimator
from sklearn.metrics import brier_score_loss, roc_auc_score

from ai_engine.config import (
    ARTIFACTS_DIR,
    HORIZONS,
    MIN_EDGE_PROB,
    MIN_WF_TRADES,
    ROUND_TRIP_FEE_PCT,
    HorizonSpec,
    ensure_dirs,
)
from ai_engine.data.store import MarketStore
from ai_engine.features.feature_builder import FEATURE_COLUMNS, build_feature_matrix
from ai_engine.features.labeling import label_triple_barrier
from ai_engine.models.analog_finder import HistoricalAnalogFinder


def _make_base_classifier() -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(
        learning_rate=0.03,
        max_iter=180,
        max_leaf_nodes=15,
        min_samples_leaf=50,
        l2_regularization=5.0,
        early_stopping=True,
        validation_fraction=0.15,
        n_iter_no_change=15,
        random_state=42,
    )


def _sanitize_for_boosting(x_mat: np.ndarray) -> np.ndarray:
    """Replace any column that is 100% NaN in this training fold with 0.0 so binning never fails."""
    clean = x_mat.copy()
    all_nan_cols = np.all(~np.isfinite(clean), axis=0)
    if np.any(all_nan_cols):
        clean[:, all_nan_cols] = 0.0
    return clean


def _fit_calibrated_classifier(x_train: np.ndarray, y_train: np.ndarray) -> Tuple[Any, np.ndarray]:
    """Fit HistGradientBoosting on earlier 80% and calibrate probabilities on chronological tail 20%."""
    n = len(x_train)
    split = int(n * 0.80)
    base = _make_base_classifier()
    if split >= 120 and (n - split) >= 60 and len(np.unique(y_train[split:])) == 2 and len(np.unique(y_train[:split])) == 2:
        x_fit = _sanitize_for_boosting(x_train[:split])
        base.fit(x_fit, y_train[:split])
        cal = CalibratedClassifierCV(FrozenEstimator(base), method="sigmoid")
        cal.fit(_sanitize_for_boosting(x_train[split:]), y_train[split:])
        return cal, base.predict_proba(_sanitize_for_boosting(x_train))[:, 1]
    x_fit = _sanitize_for_boosting(x_train)
    base.fit(x_fit, y_train)
    return base, base.predict_proba(x_fit)[:, 1]


def _simulate_non_overlapping_trades(
    probs: np.ndarray,
    net_rets: np.ndarray,
    threshold: float,
    cooldown_bars: int,
) -> Dict[str, Any]:
    """Simulate sequential non-overlapping out-of-sample trades when calibrated probability >= threshold."""
    trades: List[float] = []
    next_allowed = 0
    for idx, (p, ret) in enumerate(zip(probs, net_rets)):
        if idx < next_allowed or not np.isfinite(p) or not np.isfinite(ret):
            continue
        if p >= threshold:
            trades.append(float(ret))
            next_allowed = idx + max(1, cooldown_bars // 2)

    if not trades:
        return {
            "trades": 0,
            "winRatePct": 0.0,
            "expectancyPct": 0.0,
            "profitFactor": 0.0,
            "totalReturnPct": 0.0,
            "maxDrawdownPct": 0.0,
            "edgeValidated": False,
        }

    arr = np.array(trades, dtype=float)
    wins = arr[arr > 0]
    losses = arr[arr <= 0]
    gross_win = float(wins.sum()) if len(wins) else 0.0
    gross_loss = float(np.abs(losses.sum())) if len(losses) else 0.0
    pf = round(gross_win / gross_loss, 2) if gross_loss > 0 else (9.99 if gross_win > 0 else 0.0)

    equity = np.cumprod(1.0 + arr)
    peaks = np.maximum.accumulate(equity)
    dd = (equity - peaks) / peaks
    max_dd = round(float(np.abs(dd.min())) * 100.0, 2) if len(dd) else 0.0

    exp_pct = round(float(arr.mean()) * 100.0, 3)
    tot_ret_pct = round(float(equity[-1] - 1.0) * 100.0, 2)
    win_rate = round(float((arr > 0).mean()) * 100.0, 1)

    validated = len(trades) >= MIN_WF_TRADES and exp_pct > 0.0 and pf >= 1.08
    return {
        "trades": len(trades),
        "winRatePct": win_rate,
        "expectancyPct": exp_pct,
        "profitFactor": pf,
        "totalReturnPct": tot_ret_pct,
        "maxDrawdownPct": max_dd,
        "edgeValidated": bool(validated),
    }


def _walk_forward_evaluate(
    x_all: np.ndarray,
    y_all: np.ndarray,
    net_rets: np.ndarray,
    horizon: HorizonSpec,
    n_folds: int = 4,
) -> Dict[str, Any]:
    """Expanding-window Purged Walk-Forward evaluation with strict embargo gap."""
    n = len(x_all)
    warmup = max(250, int(n * 0.40))
    remaining = n - warmup - horizon.embargo_bars
    if remaining < 120:
        return {"oosAuc": None, "oosBrier": None, "trades": 0, "expectancyPct": 0.0, "profitFactor": 0.0, "edgeValidated": False}

    fold_size = remaining // n_folds
    oos_probs = np.full(n, np.nan)

    for fold in range(n_folds):
        train_end = warmup + fold * fold_size
        test_start = train_end + horizon.embargo_bars
        test_end = min(n, test_start + fold_size) if fold < n_folds - 1 else n
        if test_end - test_start < 20 or len(np.unique(y_all[:train_end])) < 2:
            continue

        model, _ = _fit_calibrated_classifier(x_all[:train_end], y_all[:train_end])
        oos_probs[test_start:test_end] = model.predict_proba(_sanitize_for_boosting(x_all[test_start:test_end]))[:, 1]

    mask = np.isfinite(oos_probs) & np.isfinite(y_all) & np.isfinite(net_rets)
    if mask.sum() < 40 or len(np.unique(y_all[mask])) < 2:
        return {"oosAuc": None, "oosBrier": None, "trades": 0, "expectancyPct": 0.0, "profitFactor": 0.0, "edgeValidated": False}

    auc = round(float(roc_auc_score(y_all[mask], oos_probs[mask])), 3)
    brier = round(float(brier_score_loss(y_all[mask], oos_probs[mask])), 4)
    sim = _simulate_non_overlapping_trades(oos_probs[mask], net_rets[mask], threshold=horizon.prob_threshold, cooldown_bars=horizon.max_bars)
    sim["oosAuc"] = auc
    sim["oosBrier"] = brier
    sim["oosSamples"] = int(mask.sum())
    return sim


def train_horizon_bundle(
    horizon: HorizonSpec,
    base_klines: pd.DataFrame,
    daily_klines: pd.DataFrame,
    funding_df: pd.DataFrame,
    onchain_daily: pd.DataFrame,
) -> Dict[str, Any]:
    """Build features + Triple Barrier labels, run Walk-Forward validation, and train final LONG/SHORT models."""
    feat_df = build_feature_matrix(
        base_klines=base_klines,
        daily_klines=daily_klines,
        funding_df=funding_df,
        onchain_daily=onchain_daily,
    )
    labeled = label_triple_barrier(
        feat_df,
        tp_atr_mult=horizon.tp_atr_mult,
        sl_atr_mult=horizon.sl_atr_mult,
        max_bars=horizon.max_bars,
        fee_pct=ROUND_TRIP_FEE_PCT,
    )

    valid = labeled.dropna(subset=["long_win", "short_win", "long_net_ret", "short_net_ret"]).reset_index(drop=True)
    if len(valid) < 350:
        raise RuntimeError(f"Insufficient labeled samples for {horizon.name}: {len(valid)} rows.")

    x_all = valid[FEATURE_COLUMNS].to_numpy(dtype=float)
    n_cols = x_all.shape[1]
    medians = np.zeros(n_cols, dtype=float)
    means = np.zeros(n_cols, dtype=float)
    stds = np.ones(n_cols, dtype=float)
    for c_idx in range(n_cols):
        finite = x_all[:, c_idx][np.isfinite(x_all[:, c_idx])]
        if len(finite) > 0:
            medians[c_idx] = float(np.median(finite))
            means[c_idx] = float(np.mean(finite))
            sd = float(np.std(finite))
            stds[c_idx] = sd if sd > 1e-9 else 1.0

    # Walk-Forward Out-of-Sample verification (zero leak)
    wf_long = _walk_forward_evaluate(x_all, valid["long_win"].to_numpy(dtype=int), valid["long_net_ret"].to_numpy(dtype=float), horizon)
    wf_short = _walk_forward_evaluate(x_all, valid["short_win"].to_numpy(dtype=int), valid["short_net_ret"].to_numpy(dtype=float), horizon)

    # Fit final calibrated models on all verified labeled data
    long_model, _ = _fit_calibrated_classifier(x_all, valid["long_win"].to_numpy(dtype=int))
    short_model, _ = _fit_calibrated_classifier(x_all, valid["short_win"].to_numpy(dtype=int))

    analog_finder = HistoricalAnalogFinder(FEATURE_COLUMNS).fit(valid)

    return {
        "horizon": {
            "name": horizon.name,
            "timeframe": horizon.timeframe,
            "maxBars": horizon.max_bars,
            "tpAtrMult": horizon.tp_atr_mult,
            "slAtrMult": horizon.sl_atr_mult,
            "labelEs": horizon.label_es,
        },
        "featureColumns": FEATURE_COLUMNS,
        "featureStats": {"medians": medians, "means": means, "stds": stds},
        "sampleCount": len(valid),
        "trainedAtUtc": datetime.now(timezone.utc).isoformat(),
        "longModel": long_model,
        "shortModel": short_model,
        "walkForward": {"long": wf_long, "short": wf_short},
        "analogFinder": analog_finder,
    }


def train_all_models(output_path: Path = ARTIFACTS_DIR / "btc_ai_models.joblib") -> Path:
    """Train both Intraday (1h) and Swing (4h) AI bundles from local DuckDB/Parquet store."""
    ensure_dirs()
    store = MarketStore()
    k1h = store.load_dataframe("klines_1h")
    k4h = store.load_dataframe("klines_4h")
    k1d = store.load_dataframe("klines_1d")
    funding = store.load_dataframe("funding_rates")
    onchain = store.load_dataframe("onchain_daily")

    if k1h.empty or k4h.empty or k1d.empty:
        raise RuntimeError("Missing historical klines in storage. Run `python -m ai_engine.data.sync_data --mode full` first.")

    bundles = {}
    for key, spec in HORIZONS.items():
        base_df = k1h if spec.timeframe == "1h" else k4h
        bundles[key] = train_horizon_bundle(spec, base_df, k1d, funding, onchain)

    payload = {
        "version": "1.0",
        "symbol": "BTCUSDT",
        "createdAtUtc": datetime.now(timezone.utc).isoformat(),
        "bundles": bundles,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(payload, output_path, compress=3)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Walk-Forward BTCUSDT AI models.")
    parser.add_argument("--dry-run", action="store_true", help="Print metrics without overwriting artifact.")
    args = parser.parse_args()

    out_path = ARTIFACTS_DIR / ("btc_ai_models_dryrun.joblib" if args.dry_run else "btc_ai_models.joblib")
    saved = train_all_models(output_path=out_path)
    bundle = joblib.load(saved)
    for h_key, b in bundle["bundles"].items():
        print(f"=== {h_key.upper()} ({b['sampleCount']} samples) ===")
        for side in ("long", "short"):
            wf = b["walkForward"][side]
            print(
                f"  {side.upper()}: AUC={wf['oosAuc']} | Trades={wf['trades']} | "
                f"WR={wf['winRatePct']}% | Exp={wf['expectancyPct']}% | PF={wf['profitFactor']} | "
                f"MaxDD={wf['maxDrawdownPct']}% | Validated={wf['edgeValidated']}"
            )
    if args.dry_run and out_path.exists():
        out_path.unlink()


if __name__ == "__main__":
    main()
