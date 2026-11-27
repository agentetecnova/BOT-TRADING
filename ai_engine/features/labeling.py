"""Triple Barrier labeling with round-trip fees and conservative intra-bar tie-breaking."""

from typing import Tuple
import numpy as np
import pandas as pd

from ai_engine.config import ROUND_TRIP_FEE_PCT


def _eval_barrier_direction(
    entry: float,
    tp_price: float,
    sl_price: float,
    direction: int,
    future_highs: np.ndarray,
    future_lows: np.ndarray,
    exit_close: float,
    fee_pct: float,
) -> Tuple[float, float]:
    """Evaluate a single LONG (+1) or SHORT (-1) triple-barrier trajectory."""
    for h, l in zip(future_highs, future_lows):
        hit_sl = (l <= sl_price) if direction == 1 else (h >= sl_price)
        hit_tp = (h >= tp_price) if direction == 1 else (l <= tp_price)
        if hit_sl:
            # Conservative tie-breaker: if both hit in the same bar, assume SL hit first
            ret = ((sl_price - entry) / entry if direction == 1 else (entry - sl_price) / entry) - fee_pct
            return 0.0, ret
        if hit_tp:
            ret = ((tp_price - entry) / entry if direction == 1 else (entry - tp_price) / entry) - fee_pct
            return 1.0, ret

    net_ret = ((exit_close - entry) / entry if direction == 1 else (entry - exit_close) / entry) - fee_pct
    win = 1.0 if net_ret > 0.002 else 0.0
    return win, net_ret


def label_triple_barrier(
    df: pd.DataFrame,
    tp_atr_mult: float,
    sl_atr_mult: float,
    max_bars: int,
    fee_pct: float = ROUND_TRIP_FEE_PCT,
) -> pd.DataFrame:
    """
    Simulate causal LONG and SHORT trades entered at `close[i]` using ATR-based
    Take Profit and Stop Loss barriers over the next `max_bars` candles.
    """
    n = len(df)
    out = df.copy()

    long_win = np.full(n, np.nan)
    short_win = np.full(n, np.nan)
    long_net_ret = np.full(n, np.nan)
    short_net_ret = np.full(n, np.nan)
    fwd_ret_horizon = np.full(n, np.nan)

    highs = df["high"].to_numpy(dtype=float)
    lows = df["low"].to_numpy(dtype=float)
    closes = df["close"].to_numpy(dtype=float)
    atrs = df["atr_14"].to_numpy(dtype=float) if "atr_14" in df.columns else np.full(n, np.nan)

    last_evaluable = n - max_bars
    for i in range(max(0, last_evaluable)):
        entry = closes[i]
        atr = atrs[i]
        if not np.isfinite(entry) or not np.isfinite(atr) or entry <= 0:
            continue

        eff_atr = max(atr, entry * 0.004)
        tp_dist = tp_atr_mult * eff_atr
        sl_dist = sl_atr_mult * eff_atr

        f_highs = highs[i + 1 : i + max_bars + 1]
        f_lows = lows[i + 1 : i + max_bars + 1]
        exit_close = closes[i + max_bars]
        fwd_ret_horizon[i] = (exit_close - entry) / entry

        lw, lr = _eval_barrier_direction(entry, entry + tp_dist, entry - sl_dist, 1, f_highs, f_lows, exit_close, fee_pct)
        sw, sr = _eval_barrier_direction(entry, entry - tp_dist, entry + sl_dist, -1, f_highs, f_lows, exit_close, fee_pct)
        long_win[i], long_net_ret[i] = lw, lr
        short_win[i], short_net_ret[i] = sw, sr

    out["long_win"] = long_win
    out["short_win"] = short_win
    out["long_net_ret"] = long_net_ret
    out["short_net_ret"] = short_net_ret
    out["fwd_ret_horizon"] = fwd_ret_horizon
    return out
