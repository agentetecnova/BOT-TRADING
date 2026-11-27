"""CLI entrypoint to bootstrap or incrementally sync free BTCUSDT market & on-chain datasets."""

import argparse
from typing import Dict

from ai_engine.config import (
    INTRADAY_HISTORY_DAYS,
    SWING_HISTORY_DAYS,
    SYMBOL,
)
from ai_engine.data.market_loader import (
    INTERVAL_MS,
    fetch_binance_klines,
    fetch_funding_history,
)
from ai_engine.data.onchain_loader import fetch_combined_onchain_daily
from ai_engine.data.store import MarketStore


def sync_all(mode: str = "incremental") -> Dict[str, int]:
    """Download or update Spot klines (1h, 4h, 1d), funding, and daily on-chain fundamentals."""
    store = MarketStore()
    counts: Dict[str, int] = {}

    timeframe_days = {
        "1h": INTRADAY_HISTORY_DAYS if mode == "full" else 20,
        "4h": SWING_HISTORY_DAYS if mode == "full" else 45,
        "1d": SWING_HISTORY_DAYS if mode == "full" else 120,
    }

    for tf, default_days in timeframe_days.items():
        table = f"klines_{tf}"
        existing = store.load_dataframe(table)
        start_ms = None
        if mode != "full" and not existing.empty:
            last_ts = int(existing["timestamp_ms"].max())
            # Overlap 3 bars to safely capture finalized close updates
            start_ms = max(0, last_ts - (3 * INTERVAL_MS[tf]))

        fresh = fetch_binance_klines(
            symbol=SYMBOL,
            interval=tf,
            days=default_days,
            start_ms=start_ms,
        )
        merged = store.upsert_dataframe(fresh, table, key_col="timestamp_ms")
        counts[table] = len(merged)

    # Funding rate history
    existing_funding = store.load_dataframe("funding_rates")
    funding_start = None
    if mode != "full" and not existing_funding.empty:
        funding_start = int(existing_funding["timestamp_ms"].max()) - (24 * 60 * 60 * 1000)
    fresh_funding = fetch_funding_history(
        symbol=SYMBOL,
        days=INTRADAY_HISTORY_DAYS if mode == "full" else 30,
        start_ms=funding_start,
    )
    merged_funding = store.upsert_dataframe(fresh_funding, "funding_rates", key_col="timestamp_ms")
    counts["funding_rates"] = len(merged_funding)

    # On-chain daily metrics (CoinMetrics + DefiLlama + Alternative.me)
    onchain = fetch_combined_onchain_daily(start_date="2020-01-01")
    if not onchain.empty:
        store.save_dataframe(onchain, "onchain_daily", key_col="date")
    counts["onchain_daily"] = len(onchain)

    store.register_duckdb_views()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync BTCUSDT market and on-chain datasets.")
    parser.add_argument("--mode", choices=["full", "incremental"], default="incremental")
    args = parser.parse_args()
    counts = sync_all(mode=args.mode)
    for k, v in counts.items():
        print(f"{k}: {v} rows")


if __name__ == "__main__":
    main()
