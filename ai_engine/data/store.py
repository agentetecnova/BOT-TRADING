"""Local DuckDB + Parquet storage layer for BTCUSDT market & on-chain datasets."""

from pathlib import Path
from typing import Optional
import duckdb
import pandas as pd

from ai_engine.config import (
    DB_PATH,
    RAW_PARQUET_DIR,
    FEATURE_PARQUET_DIR,
    ensure_dirs,
)


class MarketStore:
    """Manages fast columnar Parquet datasets and DuckDB views."""

    def __init__(self, db_path: Path = DB_PATH, raw_dir: Path = RAW_PARQUET_DIR, feature_dir: Path = FEATURE_PARQUET_DIR):
        self.db_path = Path(db_path)
        self.raw_dir = Path(raw_dir)
        self.feature_dir = Path(feature_dir)
        ensure_dirs()
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.feature_dir.mkdir(parents=True, exist_ok=True)

    def raw_path(self, table_name: str) -> Path:
        return self.raw_dir / f"{table_name}.parquet"

    def feature_path(self, name: str) -> Path:
        return self.feature_dir / f"{name}.parquet"

    def save_dataframe(self, df: pd.DataFrame, table_name: str, key_col: str = "timestamp_ms", is_feature: bool = False) -> Path:
        """Persist DataFrame to Parquet, deduplicating and sorting ascending by key_col."""
        path = self.feature_path(table_name) if is_feature else self.raw_path(table_name)
        if df is None or df.empty:
            return path

        clean = df.copy()
        if key_col in clean.columns:
            clean = clean.drop_duplicates(subset=[key_col], keep="last").sort_values(key_col).reset_index(drop=True)
        clean.to_parquet(path, index=False)
        return path

    def load_dataframe(self, table_name: str, is_feature: bool = False) -> pd.DataFrame:
        """Load Parquet dataset if it exists, otherwise return empty DataFrame."""
        path = self.feature_path(table_name) if is_feature else self.raw_path(table_name)
        if not path.exists():
            return pd.DataFrame()
        return pd.read_parquet(path)

    def upsert_dataframe(self, new_df: pd.DataFrame, table_name: str, key_col: str = "timestamp_ms") -> pd.DataFrame:
        """Merge incremental records with existing Parquet table and save."""
        existing = self.load_dataframe(table_name)
        if new_df is None or new_df.empty:
            return existing
        if existing.empty:
            merged = new_df.copy()
        else:
            merged = pd.concat([existing, new_df], ignore_index=True)
        if key_col in merged.columns:
            merged = merged.drop_duplicates(subset=[key_col], keep="last").sort_values(key_col).reset_index(drop=True)
        self.save_dataframe(merged, table_name, key_col=key_col)
        return merged

    def register_duckdb_views(self) -> Optional[Path]:
        """Register available Parquet files as DuckDB views for fast analytical SQL queries."""
        parquets = sorted(list(self.raw_dir.glob("*.parquet")) + list(self.feature_dir.glob("*.parquet")))
        if not parquets:
            return None
        con = duckdb.connect(str(self.db_path))
        try:
            for p in parquets:
                view_name = p.stem.replace("-", "_")
                posix_path = str(p).replace("\\", "/")
                con.execute(f"CREATE OR REPLACE VIEW {view_name} AS SELECT * FROM read_parquet('{posix_path}');")
        finally:
            con.close()
        return self.db_path
