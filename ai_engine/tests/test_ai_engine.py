"""Unit tests guaranteeing anti-look-ahead causality, Triple Barrier accuracy, and analog filtering."""

import numpy as np
import pandas as pd

from ai_engine.features.feature_builder import FEATURE_COLUMNS, build_feature_matrix
from ai_engine.features.labeling import label_triple_barrier
from ai_engine.models.analog_finder import HistoricalAnalogFinder


def _make_klines(n: int = 80, step_ms: int = 3_600_000, start_ms: int = 1_704_067_200_000) -> pd.DataFrame:
    ts = np.arange(n, dtype="int64") * step_ms + start_ms
    close = 40000.0 + np.cumsum(np.sin(np.arange(n) * 0.2) * 120.0 + 15.0)
    return pd.DataFrame(
        {
            "timestamp_ms": ts,
            "open": close - 20.0,
            "high": close + 80.0,
            "low": close - 80.0,
            "close": close,
            "volume": np.linspace(100.0, 200.0, n),
            "close_time_ms": ts + step_ms - 1,
            "quote_volume": np.linspace(4_000_000.0, 8_000_000.0, n),
            "trades": np.full(n, 500, dtype="int64"),
            "taker_buy_base": np.linspace(55.0, 110.0, n),
            "taker_buy_quote": np.linspace(2_200_000.0, 4_400_000.0, n),
            "delta_quote": np.linspace(400_000.0, 800_000.0, n),
            "buy_ratio": np.full(n, 0.55),
        }
    )


def test_anti_lookahead_features_unchanged_when_future_mutated():
    base = _make_klines(n=80)
    daily = _make_klines(n=40, step_ms=86_400_000, start_ms=1_701_388_800_000)

    start_date = pd.to_datetime(1_701_388_800_000, unit="ms", utc=True)
    dates = [(start_date + pd.Timedelta(days=i)).strftime("%Y-%m-%d") for i in range(45)]
    avail = [int((pd.Timestamp(d, tz="UTC") + pd.Timedelta(days=1)).timestamp() * 1000) for d in dates]
    onchain = pd.DataFrame(
        {
            "date": dates,
            "available_from_ms": avail,
            "active_addresses": np.linspace(700_000, 900_000, len(dates)),
            "tx_transfer_usd": np.linspace(5e9, 9e9, len(dates)),
            "market_cap_usd": np.full(len(dates), 8e11),
            "stablecoin_mcap_usd": np.linspace(130e9, 145e9, len(dates)),
            "fear_greed": np.linspace(40, 70, len(dates)),
            "nasdaq_close": np.linspace(16000, 18000, len(dates)),
            "dxy_close": np.linspace(102, 105, len(dates)),
        }
    )
    deriv = pd.DataFrame(
        {
            "timestamp_ms": base["timestamp_ms"],
            "oi_usd": np.linspace(2e9, 3e9, len(base)),
            "ls_ratio": np.linspace(1.2, 2.0, len(base)),
        }
    )

    cut = 50
    cut_close_ms = int(base.loc[cut, "close_time_ms"])

    feats_orig = build_feature_matrix(base, daily_klines=daily, onchain_daily=onchain, derivatives_df=deriv)

    # Corrupt everything strictly in the future relative to `cut`
    base_mut = base.copy()
    base_mut.loc[cut + 1 :, ["open", "high", "low", "close", "volume", "delta_quote"]] *= 3.5

    daily_mut = daily.copy()
    daily_mut.loc[daily_mut["close_time_ms"] > cut_close_ms, "close"] *= 4.0

    deriv_mut = deriv.copy()
    deriv_mut.loc[deriv_mut["timestamp_ms"] > cut_close_ms, ["oi_usd", "ls_ratio"]] *= 5.0

    onchain_mut = onchain.copy()
    onchain_mut.loc[
        onchain_mut["available_from_ms"] > cut_close_ms,
        ["active_addresses", "fear_greed", "stablecoin_mcap_usd", "nasdaq_close", "dxy_close"],
    ] *= 5.0

    feats_mut = build_feature_matrix(base_mut, daily_klines=daily_mut, onchain_daily=onchain_mut, derivatives_df=deriv_mut)

    pd.testing.assert_frame_equal(
        feats_orig.loc[:cut, FEATURE_COLUMNS],
        feats_mut.loc[:cut, FEATURE_COLUMNS],
        check_exact=False,
        atol=1e-12,
    )


def test_triple_barrier_conservative_tiebreak_and_tp_hit():
    # Construct simple series with known ATR and deterministic TP / tie-break hits
    n = 15
    df = pd.DataFrame(
        {
            "timestamp_ms": np.arange(n) * 3_600_000,
            "open": np.full(n, 100.0),
            "high": np.full(n, 101.0),
            "low": np.full(n, 99.0),
            "close": np.full(n, 100.0),
            "atr_14": np.full(n, 1.0),
        }
    )
    # Row 0: Row 1 hits LONG TP (102.0) cleanly
    df.loc[1, "high"] = 102.5
    df.loc[1, "low"] = 99.5

    # Row 2: Row 3 hits BOTH LONG TP (102.0) AND LONG SL (99.0) -> conservative tie-break => loss (0.0)
    df.loc[3, "high"] = 103.0
    df.loc[3, "low"] = 98.0

    labeled = label_triple_barrier(df, tp_atr_mult=2.0, sl_atr_mult=1.0, max_bars=4, fee_pct=0.001)
    assert labeled.loc[0, "long_win"] == 1.0
    assert np.isclose(labeled.loc[0, "long_net_ret"], 0.02 - 0.001, atol=1e-6)
    assert labeled.loc[2, "long_win"] == 0.0
    assert labeled.loc[2, "long_net_ret"] < 0.0


def test_analog_finder_excludes_recent_window():
    df = _make_klines(n=120)
    feats = build_feature_matrix(df)
    feats["fwd_ret_horizon"] = 0.015
    feats["long_win"] = 1.0
    feats["short_win"] = 0.0

    finder = HistoricalAnalogFinder(FEATURE_COLUMNS, top_k=5).fit(feats.iloc[:-5])
    latest = feats.iloc[-1]
    res = finder.query(latest, current_ts_ms=int(latest["timestamp_ms"]), min_gap_ms=48 * 3_600_000)
    assert res["count"] >= 1
    latest_date = pd.to_datetime(int(latest["timestamp_ms"]), unit="ms", utc=True).strftime("%Y-%m-%d")
    assert all(a["date"] <= latest_date for a in res["analogs"])
