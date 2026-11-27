"""Anti-look-ahead feature engineering combining technicals, orderflow, funding, and on-chain."""

from typing import Dict, List, Optional
import numpy as np
import pandas as pd

FEATURE_COLUMNS: List[str] = [
    # Technical momentum & trend structure
    "ret_1",
    "ret_3",
    "ret_6",
    "ret_12",
    "ret_24",
    "atr_14_pct",
    "rsi_14",
    "ema_21_dist",
    "ema_50_dist",
    "ema_200_dist",
    "ema_cross_21_50",
    "bb_width_20",
    "bb_pos_20",
    # Microstructure & aggressive spot orderflow
    "vol_ratio_20",
    "buy_ratio",
    "cvd_6_norm",
    "cvd_24_norm",
    "body_pct",
    "wick_upper_pct",
    "wick_lower_pct",
    "session_sin",
    "session_cos",
    # Higher-timeframe 1D macro context
    "htf_1d_trend",
    "htf_1d_ret_7d",
    "htf_1d_ret_30d",
    "htf_1d_rsi_14",
    # Derivatives funding sentiment
    "funding_rate",
    "funding_z_30",
    # Public blockchain / on-chain & liquidity
    "onchain_addr_chg_7d",
    "onchain_addr_z_30d",
    "onchain_txval_z_30d",
    "onchain_nvt_proxy",
    "onchain_stablecoin_chg_7d",
    "onchain_stablecoin_chg_30d",
    "onchain_fear_greed",
    "onchain_fg_chg_7d",
]

FEATURE_LABELS_ES: Dict[str, str] = {
    "ret_1": "Impulso de la última vela",
    "ret_3": "Impulso de corto plazo (3 velas)",
    "ret_6": "Impulso reciente (6 velas)",
    "ret_12": "Tendencia de las últimas 12 velas",
    "ret_24": "Tendencia de las últimas 24 velas",
    "atr_14_pct": "Volatilidad real (ATR%)",
    "rsi_14": "Fuerza relativa (RSI 14)",
    "ema_21_dist": "Distancia a la media rápida (EMA 21)",
    "ema_50_dist": "Distancia a la media intermedia (EMA 50)",
    "ema_200_dist": "Distancia a la tendencia de fondo (EMA 200)",
    "ema_cross_21_50": "Cruce de medias (EMA 21 vs EMA 50)",
    "bb_width_20": "Compresión/Expansión de volatilidad (Bollinger)",
    "bb_pos_20": "Posición dentro del rango de Bollinger",
    "vol_ratio_20": "Volumen relativo vs promedio 20 velas",
    "buy_ratio": "Proporción de compras agresivas (Spot Taker)",
    "cvd_6_norm": "Flujo agresivo neto (CVD 6 velas)",
    "cvd_24_norm": "Flujo agresivo acumulado (CVD 24 velas)",
    "body_pct": "Cuerpo de la vela (convicción direccional)",
    "wick_upper_pct": "Mecha superior (rechazo en máximos)",
    "wick_lower_pct": "Mecha inferior (rechazo/absorción en mínimos)",
    "session_sin": "Ciclo horario de sesión (Asia/Londres/NY)",
    "session_cos": "Ciclo horario de sesión (fase)",
    "htf_1d_trend": "Tendencia diaria macro (Precio vs EMA50 1D)",
    "htf_1d_ret_7d": "Rendimiento BTC últimos 7 días",
    "htf_1d_ret_30d": "Rendimiento BTC últimos 30 días",
    "htf_1d_rsi_14": "RSI diario (1D)",
    "funding_rate": "Tasa de financiamiento futuros (Funding)",
    "funding_z_30": "Extremo de apalancamiento en Funding",
    "onchain_addr_chg_7d": "Direcciones activas on-chain (cambio 7d)",
    "onchain_addr_z_30d": "Actividad de red BTC vs promedio 30d",
    "onchain_txval_z_30d": "Volumen transferido en blockchain (USD)",
    "onchain_nvt_proxy": "Valoración de red vs flujo on-chain (NVT proxy)",
    "onchain_stablecoin_chg_7d": "Liquidez de stablecoins en mercado (7d)",
    "onchain_stablecoin_chg_30d": "Liquidez de stablecoins en mercado (30d)",
    "onchain_fear_greed": "Índice de Miedo y Codicia (Fear & Greed)",
    "onchain_fg_chg_7d": "Cambio semanal de sentimiento",
}


def _compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)
    avg_gain = gain.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return rsi.fillna(50.0)


def _compute_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    prev_close = df["close"].shift(1)
    tr = pd.concat(
        [
            df["high"] - df["low"],
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return tr.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()


def _prepare_daily_context(daily_klines: Optional[pd.DataFrame]) -> pd.DataFrame:
    if daily_klines is None or daily_klines.empty:
        return pd.DataFrame()
    d = daily_klines.sort_values("timestamp_ms").reset_index(drop=True).copy()
    ema50 = d["close"].ewm(span=50, adjust=False).mean()
    d["htf_1d_trend"] = (d["close"] - ema50) / ema50.replace(0.0, np.nan)
    d["htf_1d_ret_7d"] = np.log(d["close"] / d["close"].shift(7))
    d["htf_1d_ret_30d"] = np.log(d["close"] / d["close"].shift(30))
    d["htf_1d_rsi_14"] = _compute_rsi(d["close"], 14)
    return d[["close_time_ms", "htf_1d_trend", "htf_1d_ret_7d", "htf_1d_ret_30d", "htf_1d_rsi_14"]].dropna(subset=["close_time_ms"])


def _prepare_onchain_features(onchain_daily: Optional[pd.DataFrame]) -> pd.DataFrame:
    if onchain_daily is None or onchain_daily.empty:
        return pd.DataFrame()
    oc = onchain_daily.sort_values("available_from_ms").reset_index(drop=True).copy()

    if "active_addresses" in oc.columns:
        addr = pd.to_numeric(oc["active_addresses"], errors="coerce")
        oc["onchain_addr_chg_7d"] = addr.pct_change(7)
        mean30 = addr.rolling(30, min_periods=7).mean()
        std30 = addr.rolling(30, min_periods=7).std().replace(0.0, np.nan)
        oc["onchain_addr_z_30d"] = (addr - mean30) / std30
    else:
        oc["onchain_addr_chg_7d"] = np.nan
        oc["onchain_addr_z_30d"] = np.nan

    if "tx_transfer_usd" in oc.columns and "market_cap_usd" in oc.columns:
        txv = pd.to_numeric(oc["tx_transfer_usd"], errors="coerce")
        mcap = pd.to_numeric(oc["market_cap_usd"], errors="coerce")
        tx_mean30 = txv.rolling(30, min_periods=7).mean()
        tx_std30 = txv.rolling(30, min_periods=7).std().replace(0.0, np.nan)
        oc["onchain_txval_z_30d"] = (txv - tx_mean30) / tx_std30
        tx_ma7 = txv.rolling(7, min_periods=3).mean().replace(0.0, np.nan)
        oc["onchain_nvt_proxy"] = np.log((mcap / tx_ma7).clip(lower=1e-3))
    else:
        oc["onchain_txval_z_30d"] = np.nan
        oc["onchain_nvt_proxy"] = np.nan

    if "stablecoin_mcap_usd" in oc.columns:
        st = pd.to_numeric(oc["stablecoin_mcap_usd"], errors="coerce")
        oc["onchain_stablecoin_chg_7d"] = st.pct_change(7)
        oc["onchain_stablecoin_chg_30d"] = st.pct_change(30)
    else:
        oc["onchain_stablecoin_chg_7d"] = np.nan
        oc["onchain_stablecoin_chg_30d"] = np.nan

    if "fear_greed" in oc.columns:
        fg = pd.to_numeric(oc["fear_greed"], errors="coerce")
        oc["onchain_fear_greed"] = fg
        oc["onchain_fg_chg_7d"] = fg - fg.shift(7)
    else:
        oc["onchain_fear_greed"] = np.nan
        oc["onchain_fg_chg_7d"] = np.nan

    keep = [
        "available_from_ms",
        "onchain_addr_chg_7d",
        "onchain_addr_z_30d",
        "onchain_txval_z_30d",
        "onchain_nvt_proxy",
        "onchain_stablecoin_chg_7d",
        "onchain_stablecoin_chg_30d",
        "onchain_fear_greed",
        "onchain_fg_chg_7d",
    ]
    return oc[keep].dropna(subset=["available_from_ms"]).sort_values("available_from_ms").reset_index(drop=True)


def build_feature_matrix(
    base_klines: pd.DataFrame,
    daily_klines: Optional[pd.DataFrame] = None,
    funding_df: Optional[pd.DataFrame] = None,
    onchain_daily: Optional[pd.DataFrame] = None,
) -> pd.DataFrame:
    """
    Construct a causal, zero-look-ahead feature DataFrame indexed by `base_klines`.
    Every feature at row i strictly uses data finalized at or before `close_time_ms[i]`.
    """
    if base_klines is None or base_klines.empty:
        return pd.DataFrame()

    df = base_klines.sort_values("timestamp_ms").reset_index(drop=True).copy()
    close = df["close"]

    # Base OHLCV & momentum features
    for w in (1, 3, 6, 12, 24):
        df[f"ret_{w}"] = np.log(close / close.shift(w))

    df["atr_14"] = _compute_atr(df, 14)
    df["atr_14_pct"] = df["atr_14"] / close.replace(0.0, np.nan)
    df["rsi_14"] = _compute_rsi(close, 14)

    ema21 = close.ewm(span=21, adjust=False).mean()
    ema50 = close.ewm(span=50, adjust=False).mean()
    ema200 = close.ewm(span=200, adjust=False).mean()
    df["ema_21_dist"] = (close - ema21) / ema21.replace(0.0, np.nan)
    df["ema_50_dist"] = (close - ema50) / ema50.replace(0.0, np.nan)
    df["ema_200_dist"] = (close - ema200) / ema200.replace(0.0, np.nan)
    df["ema_cross_21_50"] = (ema21 - ema50) / close.replace(0.0, np.nan)

    sma20 = close.rolling(20, min_periods=10).mean()
    std20 = close.rolling(20, min_periods=10).std()
    bb_upper = sma20 + 2.0 * std20
    bb_lower = sma20 - 2.0 * std20
    df["bb_width_20"] = (bb_upper - bb_lower) / sma20.replace(0.0, np.nan)
    df["bb_pos_20"] = (close - bb_lower) / (bb_upper - bb_lower).replace(0.0, np.nan)

    # Orderflow & candlestick anatomy
    vol_mean20 = df["volume"].rolling(20, min_periods=5).mean().replace(0.0, np.nan)
    df["vol_ratio_20"] = df["volume"] / vol_mean20
    if "buy_ratio" not in df.columns:
        df["buy_ratio"] = 0.5
    if "delta_quote" not in df.columns:
        df["delta_quote"] = 0.0

    for w in (6, 24):
        qv_sum = df["quote_volume"].rolling(w, min_periods=3).sum().replace(0.0, np.nan)
        df[f"cvd_{w}_norm"] = df["delta_quote"].rolling(w, min_periods=3).sum() / qv_sum

    candle_range = (df["high"] - df["low"]).replace(0.0, np.nan)
    df["body_pct"] = (df["close"] - df["open"]) / close.replace(0.0, np.nan)
    df["wick_upper_pct"] = (df["high"] - df[["open", "close"]].max(axis=1)) / candle_range
    df["wick_lower_pct"] = (df[["open", "close"]].min(axis=1) - df["low"]) / candle_range

    dt = pd.to_datetime(df["timestamp_ms"], unit="ms", utc=True)
    hour_frac = dt.dt.hour + (dt.dt.minute / 60.0)
    df["session_sin"] = np.sin(2.0 * np.pi * hour_frac / 24.0)
    df["session_cos"] = np.cos(2.0 * np.pi * hour_frac / 24.0)

    # Align merge key: every external datum must be finalized <= close_time_ms
    df = df.sort_values("close_time_ms").reset_index(drop=True)

    # 1. Higher timeframe 1D context (closed bars only)
    daily_ctx = _prepare_daily_context(daily_klines)
    if not daily_ctx.empty:
        df = pd.merge_asof(
            df,
            daily_ctx.sort_values("close_time_ms"),
            on="close_time_ms",
            direction="backward",
        )
    else:
        for col in ("htf_1d_trend", "htf_1d_ret_7d", "htf_1d_ret_30d", "htf_1d_rsi_14"):
            df[col] = np.nan

    # 2. Funding rate context
    if funding_df is not None and not funding_df.empty:
        fdf = funding_df.sort_values("timestamp_ms").reset_index(drop=True).copy()
        f_mean = fdf["funding_rate"].rolling(30, min_periods=5).mean()
        f_std = fdf["funding_rate"].rolling(30, min_periods=5).std().replace(0.0, np.nan)
        fdf["funding_z_30"] = (fdf["funding_rate"] - f_mean) / f_std
        df = pd.merge_asof(
            df,
            fdf[["timestamp_ms", "funding_rate", "funding_z_30"]].rename(columns={"timestamp_ms": "funding_ts"}),
            left_on="close_time_ms",
            right_on="funding_ts",
            direction="backward",
        ).drop(columns=["funding_ts"])
    else:
        df["funding_rate"] = np.nan
        df["funding_z_30"] = np.nan

    # 3. On-chain & stablecoin liquidity (available_from_ms <= close_time_ms)
    oc_ctx = _prepare_onchain_features(onchain_daily)
    if not oc_ctx.empty:
        df = pd.merge_asof(
            df,
            oc_ctx,
            left_on="close_time_ms",
            right_on="available_from_ms",
            direction="backward",
        ).drop(columns=["available_from_ms"])
    else:
        for col in (
            "onchain_addr_chg_7d",
            "onchain_addr_z_30d",
            "onchain_txval_z_30d",
            "onchain_nvt_proxy",
            "onchain_stablecoin_chg_7d",
            "onchain_stablecoin_chg_30d",
            "onchain_fear_greed",
            "onchain_fg_chg_7d",
        ):
            df[col] = np.nan

    # Restore ascending timestamp_ms order
    return df.sort_values("timestamp_ms").reset_index(drop=True)
