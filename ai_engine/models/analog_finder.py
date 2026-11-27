"""Historical k-NN Analog Finder on technical + derivatives + on-chain regime vectors."""

from typing import Any, Dict, List
import numpy as np
import pandas as pd
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

from ai_engine.config import ANALOG_TOP_K


class HistoricalAnalogFinder:
    """Finds the top-K most similar historical market + on-chain moments and their real outcomes."""

    def __init__(self, feature_cols: List[str], top_k: int = ANALOG_TOP_K):
        self.feature_cols = list(feature_cols)
        self.top_k = top_k
        self.medians: np.ndarray = np.array([])
        self.scaler = StandardScaler()
        self.nn = NearestNeighbors(n_neighbors=min(top_k * 3, 50), metric="cosine")
        self.history_meta: pd.DataFrame = pd.DataFrame()
        self._fitted = False

    def fit(self, labeled_df: pd.DataFrame) -> "HistoricalAnalogFinder":
        valid = labeled_df.dropna(subset=["fwd_ret_horizon", "long_win", "short_win"]).copy()
        if len(valid) < 50:
            raise ValueError(f"Not enough historical rows ({len(valid)}) to fit AnalogFinder.")

        x_raw = valid[self.feature_cols].to_numpy(dtype=float)
        medians = np.zeros(x_raw.shape[1], dtype=float)
        for col_idx in range(x_raw.shape[1]):
            col = x_raw[:, col_idx]
            finite = col[np.isfinite(col)]
            medians[col_idx] = float(np.median(finite)) if len(finite) > 0 else 0.0
        self.medians = medians
        x_clean = np.where(np.isfinite(x_raw), x_raw, self.medians)

        x_scaled = self.scaler.fit_transform(x_clean)
        self.nn.set_params(n_neighbors=min(max(self.top_k * 4, 20), len(valid)))
        self.nn.fit(x_scaled)

        meta_cols = ["timestamp_ms", "close", "fwd_ret_horizon", "long_win", "short_win"]
        if "onchain_fear_greed" in valid.columns:
            meta_cols.append("onchain_fear_greed")
        self.history_meta = valid[meta_cols].reset_index(drop=True)
        self._fitted = True
        return self

    def query(self, row_series: pd.Series, current_ts_ms: int, min_gap_ms: int = 7 * 86_400_000) -> Dict[str, Any]:
        """Find top-K historical episodes strictly older than `current_ts_ms - min_gap_ms`."""
        if not self._fitted or self.history_meta.empty:
            return {"count": 0, "analogs": [], "summary": {}}

        vec = np.array([float(row_series.get(c, np.nan)) for c in self.feature_cols], dtype=float)
        vec = np.where(np.isfinite(vec), vec, self.medians).reshape(1, -1)
        vec_scaled = self.scaler.transform(vec)

        dists, idxs = self.nn.kneighbors(vec_scaled, n_neighbors=min(len(self.history_meta), self.top_k * 8))
        selected = []
        used_day_buckets = set()
        cutoff_ms = current_ts_ms - min_gap_ms

        for dist, idx in zip(dists[0], idxs[0]):
            meta = self.history_meta.iloc[int(idx)]
            ts = int(meta["timestamp_ms"])
            if ts >= cutoff_ms:
                continue
            # Deduplicate neighbors from the exact same 3-day market episode
            episode_bucket = ts // (3 * 86_400_000)
            if episode_bucket in used_day_buckets:
                continue
            used_day_buckets.add(episode_bucket)

            similarity_pct = round(max(0.0, min(99.9, (1.0 - float(dist)) * 100.0)), 1)
            fwd_pct = round(float(meta["fwd_ret_horizon"]) * 100.0, 2)
            dt_str = pd.to_datetime(ts, unit="ms", utc=True).strftime("%Y-%m-%d")
            selected.append(
                {
                    "date": dt_str,
                    "price": round(float(meta["close"]), 2),
                    "similarityPct": similarity_pct,
                    "fwdReturnPct": fwd_pct,
                    "longWon": bool(meta["long_win"] >= 0.5),
                    "shortWon": bool(meta["short_win"] >= 0.5),
                    "fearGreed": round(float(meta["onchain_fear_greed"]), 0)
                    if "onchain_fear_greed" in meta and pd.notna(meta["onchain_fear_greed"])
                    else None,
                }
            )
            if len(selected) >= self.top_k:
                break

        if not selected:
            return {"count": 0, "analogs": [], "summary": {}}

        rets = [a["fwdReturnPct"] for a in selected]
        long_wins = sum(1 for a in selected if a["longWon"])
        short_wins = sum(1 for a in selected if a["shortWon"])
        summary = {
            "count": len(selected),
            "avgReturnPct": round(float(np.mean(rets)), 2),
            "medianReturnPct": round(float(np.median(rets)), 2),
            "positiveRatePct": round(sum(1 for r in rets if r > 0) / len(rets) * 100.0, 1),
            "longTargetHitPct": round(long_wins / len(selected) * 100.0, 1),
            "shortTargetHitPct": round(short_wins / len(selected) * 100.0, 1),
            "bestReturnPct": round(max(rets), 2),
            "worstReturnPct": round(min(rets), 2),
        }
        return {"count": len(selected), "analogs": selected, "summary": summary}
