"""
config.py — Parámetros y constantes para BTC TA Bot (Python 3.11+)
"""

CONFIG = {
    "symbol":           "BTCUSDT",
    "report_time_utc":  "00:05",          # Hora del reporte diario
    "primary_tf":       "4h",             # Timeframe principal para señales
    "confirmation_tf":  "1d",             # Timeframe de confirmación
    "macro_tf":         "1w",             # Timeframe macro
    "rsi_period":       14,
    "ema_periods":      [8, 21, 50, 100, 200, 800],
    "bb_period":        20,
    "bb_std":           2.0,
    "atr_period":       14,
    "macd_fast":        12,
    "macd_slow":        26,
    "macd_signal":      9,
    "min_rr":           2.0,
    "sl_atr_mult":      1.5,
    "tp1_atr_mult":     2.0,
    "tp2_atr_mult":     3.5,
    "min_confluences":  3,
    "min_score":        5.5,
    "email_to":         "TU_EMAIL_AQUI",
}

TIMEFRAMES = {
    "1m":  {"limit": 500, "use": "scalping signals, liquidations"},
    "5m":  {"limit": 500, "use": "entrada precisa"},
    "15m": {"limit": 500, "use": "confirmación de señal"},
    "1h":  {"limit": 500, "use": "análisis intradiario"},
    "4h":  {"limit": 300, "use": "tendencia principal"},
    "1d":  {"limit": 200, "use": "estructura macro"},
    "1w":  {"limit": 100, "use": "ciclo y tendencia mayor"},
}
