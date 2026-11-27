"""Free Binance Spot & Futures market data loader (historical + incremental)."""

from datetime import datetime, timezone
import time
from typing import Dict, List, Optional
import pandas as pd
import requests

from ai_engine.config import SYMBOL

SPOT_ENDPOINTS = [
    "https://data-api.binance.vision/api/v3/klines",
    "https://api.binance.com/api/v3/klines",
]
FUTURES_FUNDING_URL = "https://fapi.binance.com/fapi/v1/fundingRate"
FUTURES_OI_URL = "https://fapi.binance.com/fapi/v1/openInterest"
FUTURES_TOP_LS_URL = "https://fapi.binance.com/futures/data/topLongShortAccountRatio"
FUTURES_GLOBAL_LS_URL = "https://fapi.binance.com/futures/data/globalLongShortAccountRatio"
OKX_FUNDING_URL = "https://www.okx.com/api/v5/public/funding-rate-history"
OKX_OI_URL = "https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume"
OKX_LS_URL = "https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio"

INTERVAL_MS = {
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
}


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": "BTC-AI-Engine/1.0"})
    return s


def _get_json_with_fallback(session: requests.Session, urls: List[str], params: dict, timeout: int = 15):
    last_err = None
    for url in urls:
        for attempt in range(3):
            try:
                resp = session.get(url, params=params, timeout=timeout)
                if resp.status_code == 200:
                    return resp.json()
                last_err = RuntimeError(f"HTTP {resp.status_code} from {url}")
            except Exception as exc:
                last_err = exc
            time.sleep(0.4 * (attempt + 1))
    raise RuntimeError(f"Failed fetching {urls}: {last_err}")


def fetch_binance_klines(
    symbol: str = SYMBOL,
    interval: str = "1h",
    days: int = 365,
    start_ms: Optional[int] = None,
    end_ms: Optional[int] = None,
) -> pd.DataFrame:
    """Download Spot OHLCV + taker buy flow candles from Binance Vision / Binance API."""
    if interval not in INTERVAL_MS:
        raise ValueError(f"Unsupported interval: {interval}")

    now_ms = end_ms or int(datetime.now(timezone.utc).timestamp() * 1000)
    cursor_ms = start_ms if start_ms is not None else now_ms - (days * 86_400_000)
    step_ms = INTERVAL_MS[interval]
    sess = _session()
    rows: List[list] = []

    while cursor_ms < now_ms:
        params = {
            "symbol": symbol,
            "interval": interval,
            "startTime": cursor_ms,
            "endTime": now_ms,
            "limit": 1000,
        }
        batch = _get_json_with_fallback(sess, SPOT_ENDPOINTS, params=params)
        if not batch:
            break
        rows.extend(batch)
        last_open_ms = int(batch[-1][0])
        if last_open_ms <= cursor_ms:
            break
        cursor_ms = last_open_ms + step_ms
        if len(batch) < 1000:
            break
        time.sleep(0.08)

    if not rows:
        return pd.DataFrame()

    cols = [
        "timestamp_ms", "open", "high", "low", "close", "volume",
        "close_time_ms", "quote_volume", "trades",
        "taker_buy_base", "taker_buy_quote", "ignore",
    ]
    df = pd.DataFrame(rows, columns=cols)
    num_cols = ["open", "high", "low", "close", "volume", "quote_volume", "taker_buy_base", "taker_buy_quote"]
    for c in num_cols:
        df[c] = df[c].astype(float)
    df["timestamp_ms"] = df["timestamp_ms"].astype("int64")
    df["close_time_ms"] = df["close_time_ms"].astype("int64")
    df["trades"] = df["trades"].astype("int64")

    # Exclude currently unfinished candle so indicators only see closed bars
    df = df[df["close_time_ms"] <= now_ms].copy()
    df["open_time"] = pd.to_datetime(df["timestamp_ms"], unit="ms", utc=True)
    df["taker_sell_quote"] = (df["quote_volume"] - df["taker_buy_quote"]).clip(lower=0.0)
    df["delta_quote"] = df["taker_buy_quote"] - df["taker_sell_quote"]
    df["buy_ratio"] = (df["taker_buy_quote"] / df["quote_volume"].replace(0, pd.NA)).fillna(0.5)
    return df.drop(columns=["ignore"]).drop_duplicates(subset=["timestamp_ms"]).sort_values("timestamp_ms").reset_index(drop=True)


def fetch_funding_history(symbol: str = SYMBOL, days: int = 540, start_ms: Optional[int] = None) -> pd.DataFrame:
    """Download 8h Funding Rate history from Binance Futures; gracefully returns empty if geo-blocked."""
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    cursor_ms = start_ms if start_ms is not None else now_ms - (days * 86_400_000)
    sess = _session()
    records = []

    try:
        while cursor_ms < now_ms:
            resp = sess.get(
                FUTURES_FUNDING_URL,
                params={"symbol": symbol, "startTime": cursor_ms, "endTime": now_ms, "limit": 1000},
                timeout=12,
            )
            if resp.status_code != 200:
                break
            batch = resp.json()
            if not batch:
                break
            records.extend(batch)
            last_ts = int(batch[-1]["fundingTime"])
            if last_ts <= cursor_ms:
                break
            cursor_ms = last_ts + 1
            if len(batch) < 1000:
                break
            time.sleep(0.08)
    except Exception:
        pass

    if records:
        df = pd.DataFrame(records)
        df["timestamp_ms"] = df["fundingTime"].astype("int64")
        df["funding_rate"] = df["fundingRate"].astype(float)
        df["open_time"] = pd.to_datetime(df["timestamp_ms"], unit="ms", utc=True)
        return df[["timestamp_ms", "open_time", "funding_rate"]].drop_duplicates(subset=["timestamp_ms"]).sort_values("timestamp_ms").reset_index(drop=True)

    # US-friendly fallback: OKX BTC-USDT-SWAP funding rate history
    okx_records = []
    try:
        after_param = None
        for _ in range(max(1, (days * 3) // 100 + 1)):
            params = {"instId": "BTC-USDT-SWAP", "limit": "100"}
            if after_param:
                params["after"] = str(after_param)
            resp = sess.get(OKX_FUNDING_URL, params=params, timeout=12)
            if resp.status_code != 200:
                break
            batch = resp.json().get("data", [])
            if not batch:
                break
            okx_records.extend(batch)
            oldest = int(batch[-1]["fundingTime"])
            if start_ms and oldest <= start_ms:
                break
            after_param = oldest
            time.sleep(0.08)
    except Exception:
        pass

    if not okx_records:
        return pd.DataFrame(columns=["timestamp_ms", "open_time", "funding_rate"])

    df = pd.DataFrame(okx_records)
    df["timestamp_ms"] = df["fundingTime"].astype("int64")
    df["funding_rate"] = df["fundingRate"].astype(float)
    df["open_time"] = pd.to_datetime(df["timestamp_ms"], unit="ms", utc=True)
    return df[["timestamp_ms", "open_time", "funding_rate"]].drop_duplicates(subset=["timestamp_ms"]).sort_values("timestamp_ms").reset_index(drop=True)


def fetch_okx_derivatives_history(period: str = "1H") -> pd.DataFrame:
    """
    Fetch global/US-accessible BTC Open Interest (USD) and Long/Short Account Ratio from OKX.
    """
    sess = _session()
    oi_rows = []
    ls_rows = []
    try:
        r_oi = sess.get(OKX_OI_URL, params={"ccy": "BTC", "period": period}, timeout=12)
        if r_oi.status_code == 200:
            for item in r_oi.json().get("data", []):
                oi_rows.append({"timestamp_ms": int(item[0]), "oi_usd": float(item[1])})
    except Exception:
        pass
    try:
        r_ls = sess.get(OKX_LS_URL, params={"ccy": "BTC", "period": period}, timeout=12)
        if r_ls.status_code == 200:
            for item in r_ls.json().get("data", []):
                ls_rows.append({"timestamp_ms": int(item[0]), "ls_ratio": float(item[1])})
    except Exception:
        pass

    if not oi_rows and not ls_rows:
        return pd.DataFrame(columns=["timestamp_ms", "open_time", "oi_usd", "ls_ratio"])

    df_oi = pd.DataFrame(oi_rows) if oi_rows else pd.DataFrame(columns=["timestamp_ms", "oi_usd"])
    df_ls = pd.DataFrame(ls_rows) if ls_rows else pd.DataFrame(columns=["timestamp_ms", "ls_ratio"])
    merged = pd.merge(df_oi, df_ls, on="timestamp_ms", how="outer")
    merged["timestamp_ms"] = merged["timestamp_ms"].astype("int64")
    merged["open_time"] = pd.to_datetime(merged["timestamp_ms"], unit="ms", utc=True)
    return merged.drop_duplicates(subset=["timestamp_ms"]).sort_values("timestamp_ms").reset_index(drop=True)


def fetch_futures_live_metrics(symbol: str = SYMBOL) -> Dict[str, Optional[float]]:
    """Fetch current Open Interest and Whale vs Retail L/S ratio; safe fallback if unavailable."""
    sess = _session()
    out: Dict[str, Optional[float]] = {
        "open_interest_btc": None,
        "top_ls_ratio": None,
        "global_ls_ratio": None,
    }
    try:
        r_oi = sess.get(FUTURES_OI_URL, params={"symbol": symbol}, timeout=8)
        if r_oi.status_code == 200:
            out["open_interest_btc"] = float(r_oi.json().get("openInterest", 0.0))
    except Exception:
        pass
    try:
        r_top = sess.get(FUTURES_TOP_LS_URL, params={"symbol": symbol, "period": "1h", "limit": 1}, timeout=8)
        if r_top.status_code == 200 and r_top.json():
            out["top_ls_ratio"] = float(r_top.json()[0].get("longShortRatio", 0.0))
    except Exception:
        pass
    try:
        r_glob = sess.get(FUTURES_GLOBAL_LS_URL, params={"symbol": symbol, "period": "1h", "limit": 1}, timeout=8)
        if r_glob.status_code == 200 and r_glob.json():
            out["global_ls_ratio"] = float(r_glob.json()[0].get("longShortRatio", 0.0))
    except Exception:
        pass
    return out
