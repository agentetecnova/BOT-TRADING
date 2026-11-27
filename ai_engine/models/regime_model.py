"""Regime-aware calibrated ensemble combining GBDT, regularized linear anchor, and regime specialists."""

from typing import Any, Optional
import numpy as np
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.frozen import FrozenEstimator
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


def _sanitize_matrix(x_mat: np.ndarray, ref_slice: Optional[np.ndarray] = None) -> np.ndarray:
    """
    Replace columns that lack >=2 distinct finite values (which break HistGradientBoosting binning)
    with 0.0, using `ref_slice` if supplied so early-stopping/calibration splits never see empty bins.
    """
    clean = np.array(x_mat, dtype=float, copy=True)
    probe = ref_slice if ref_slice is not None else clean
    n_cols = clean.shape[1]
    for col_idx in range(n_cols):
        col = probe[:, col_idx]
        finite = col[np.isfinite(col)]
        if len(finite) < 10 or len(np.unique(finite)) < 2:
            clean[:, col_idx] = 0.0
    return clean


def _make_hgb(min_samples_leaf: int = 50) -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(
        learning_rate=0.03,
        max_iter=180,
        max_leaf_nodes=15,
        min_samples_leaf=min_samples_leaf,
        l2_regularization=6.0,
        early_stopping=True,
        validation_fraction=0.15,
        n_iter_no_change=15,
        random_state=42,
    )


def _fit_calibrated(estimator_fn, x_mat: np.ndarray, y_vec: np.ndarray) -> Any:
    n = len(x_mat)
    split = int(n * 0.80)
    est = estimator_fn()
    if split >= 100 and (n - split) >= 50 and len(np.unique(y_vec[:split])) == 2 and len(np.unique(y_vec[split:])) == 2:
        # Check binning safety on the earliest 70% of train slice (accounts for internal 15% early_stopping split)
        x_clean = _sanitize_matrix(x_mat, ref_slice=x_mat[: int(split * 0.75)])
        est.fit(x_clean[:split], y_vec[:split])
        cal = CalibratedClassifierCV(FrozenEstimator(est), method="sigmoid")
        cal.fit(x_clean[split:], y_vec[split:])
        return cal
    x_clean = _sanitize_matrix(x_mat, ref_slice=x_mat[: int(n * 0.75)] if n >= 40 else x_mat)
    est.fit(x_clean, y_vec)
    return est


class RegimeDualEnsemble(BaseEstimator, ClassifierMixin):
    """Blends global GBDT + L2 Logistic anchor + Trending/Ranging specialist GBDTs."""

    def __init__(self, regime_col_idx: int, trend_threshold: float = 1.6):
        self.regime_col_idx = regime_col_idx
        self.trend_threshold = trend_threshold
        self.global_hgb: Any = None
        self.global_linear: Any = None
        self.trend_model: Optional[Any] = None
        self.range_model: Optional[Any] = None
        self.classes_ = np.array([0, 1])

    def fit(self, X: np.ndarray, y: np.ndarray) -> "RegimeDualEnsemble":
        x_clean = _sanitize_matrix(X)
        y_arr = np.asarray(y, dtype=int)

        self.global_hgb = _fit_calibrated(lambda: _make_hgb(50), x_clean, y_arr)
        self.global_linear = _fit_calibrated(
            lambda: Pipeline([
                ("imp", SimpleImputer(strategy="median")),
                ("sc", StandardScaler()),
                ("lr", LogisticRegression(C=0.12, max_iter=500, random_state=42)),
            ]),
            x_clean,
            y_arr,
        )

        # Regime specialists: Trending (|close - ema50|/ATR >= 1.6) vs Ranging (< 1.6)
        reg_vals = x_clean[:, self.regime_col_idx]
        trend_mask = np.isfinite(reg_vals) & (reg_vals >= self.trend_threshold)
        range_mask = np.isfinite(reg_vals) & (reg_vals < self.trend_threshold)

        if trend_mask.sum() >= 220 and len(np.unique(y_arr[trend_mask])) == 2:
            self.trend_model = _fit_calibrated(lambda: _make_hgb(35), x_clean[trend_mask], y_arr[trend_mask])
        else:
            self.trend_model = None

        if range_mask.sum() >= 220 and len(np.unique(y_arr[range_mask])) == 2:
            self.range_model = _fit_calibrated(lambda: _make_hgb(35), x_clean[range_mask], y_arr[range_mask])
        else:
            self.range_model = None

        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        x_clean = _sanitize_matrix(X)
        p_hgb = self.global_hgb.predict_proba(x_clean)[:, 1]
        p_lin = self.global_linear.predict_proba(x_clean)[:, 1]
        p_global = 0.65 * p_hgb + 0.35 * p_lin

        reg_vals = x_clean[:, self.regime_col_idx]
        p_final = p_global.copy()

        trend_mask = np.isfinite(reg_vals) & (reg_vals >= self.trend_threshold)
        range_mask = ~trend_mask

        if self.trend_model is not None and np.any(trend_mask):
            p_tr = self.trend_model.predict_proba(x_clean[trend_mask])[:, 1]
            p_final[trend_mask] = 0.62 * p_global[trend_mask] + 0.38 * p_tr

        if self.range_model is not None and np.any(range_mask):
            p_rg = self.range_model.predict_proba(x_clean[range_mask])[:, 1]
            p_final[range_mask] = 0.62 * p_global[range_mask] + 0.38 * p_rg

        p_final = np.clip(p_final, 0.01, 0.99)
        return np.column_stack([1.0 - p_final, p_final])
