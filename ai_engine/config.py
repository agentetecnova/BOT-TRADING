"""Configuration for the AI On-Chain + Technical Engine (BTCUSDT)."""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent
STORAGE_DIR = BASE_DIR / "storage"
RAW_PARQUET_DIR = STORAGE_DIR / "raw"
FEATURE_PARQUET_DIR = STORAGE_DIR / "features"
ARTIFACTS_DIR = BASE_DIR / "artifacts"
DB_PATH = STORAGE_DIR / "market_ai.duckdb"
DEFAULT_SNAPSHOT_PATH = REPO_ROOT / "public" / "ai_oracle_snapshot.json"

SYMBOL = "BTCUSDT"
ONCHAIN_ASSET = "btc"

# Realistic round-trip trading cost (maker/taker blended + slippage)
ROUND_TRIP_FEE_PCT = 0.0010  # 0.10%

# How many days of historical data to pull when bootstrapping locally
INTRADAY_HISTORY_DAYS = 540   # ~18 months of 1h / 4h candles for fast training
SWING_HISTORY_DAYS = 1800     # ~5 years of 1d + on-chain history


@dataclass(frozen=True)
class HorizonSpec:
    name: str
    timeframe: str
    max_bars: int
    tp_atr_mult: float
    sl_atr_mult: float
    embargo_bars: int
    prob_threshold: float
    label_es: str


HORIZONS: Dict[str, HorizonSpec] = {
    "intraday": HorizonSpec(
        name="intraday",
        timeframe="1h",
        max_bars=12,          # up to 12h resolution
        tp_atr_mult=2.2,
        sl_atr_mult=1.3,
        embargo_bars=16,
        prob_threshold=0.45,  # breakeven ~37.1% at 2.2/1.3 RR + margin
        label_es="Rápido (Intraday 1h–12h)",
    ),
    "swing": HorizonSpec(
        name="swing",
        timeframe="4h",
        max_bars=30,          # up to 5 days (30 * 4h = 120h)
        tp_atr_mult=2.6,
        sl_atr_mult=1.4,
        embargo_bars=36,
        prob_threshold=0.44,  # breakeven ~35.0% at 2.6/1.4 RR + margin
        label_es="Tendencia (Swing 1–5+ días)",
    ),
}

# Minimum statistical criteria to avoid forcing bad trades
MIN_EDGE_PROB = 0.44
MIN_EXPECTED_VALUE = 0.0015  # +0.15% net expected return threshold
MIN_WF_TRADES = 15
ANALOG_TOP_K = 10


def ensure_dirs() -> None:
    """Create storage and artifact directories if missing."""
    for d in (STORAGE_DIR, RAW_PARQUET_DIR, FEATURE_PARQUET_DIR, ARTIFACTS_DIR, DEFAULT_SNAPSHOT_PATH.parent):
        d.mkdir(parents=True, exist_ok=True)
