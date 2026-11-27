"""Free public blockchain (on-chain) and liquidity data loaders without paid API keys."""

from datetime import datetime, timezone
from typing import Dict, List, Optional
import pandas as pd
import requests

COINMETRICS_URL = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics"
BLOCKCHAIN_INFO_CHART_URL = "https://api.blockchain.info/charts/{chart}"
DEFILLAMA_STABLES_URL = "https://stablecoins.llama.app/stablecoincharts/all"
COINGECKO_CHART_URL = "https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart"
FEAR_GREED_URL = "https://api.alternative.me/fng/?limit=0&format=json"
MEMPOOL_FEES_URL = "https://mempool.space/api/v1/fees/recommended"
MEMPOOL_STATE_URL = "https://mempool.space/api/mempool"


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": "BTC-AI-Engine/1.0"})
    return s


def _fetch_blockchain_chart(sess: requests.Session, chart: str, col_name: str, timespan: str = "5years") -> pd.DataFrame:
    """Fetch daily series from Blockchain.com free public Charts API."""
    try:
        resp = sess.get(
            BLOCKCHAIN_INFO_CHART_URL.format(chart=chart),
            params={"timespan": timespan, "format": "json"},
            timeout=15,
        )
        if resp.status_code != 200:
            return pd.DataFrame()
        vals = resp.json().get("values", [])
        if not vals:
            return pd.DataFrame()
        rows = []
        for item in vals:
            ts_sec = int(item.get("x", 0))
            y = item.get("y")
            if ts_sec > 0 and y is not None:
                date_str = datetime.fromtimestamp(ts_sec, tz=timezone.utc).strftime("%Y-%m-%d")
                rows.append({"date": date_str, col_name: float(y)})
        if not rows:
            return pd.DataFrame()
        return pd.DataFrame(rows).drop_duplicates(subset=["date"], keep="last").sort_values("date").reset_index(drop=True)
    except Exception:
        return pd.DataFrame()


def fetch_blockchain_info_btc(timespan: str = "5years") -> pd.DataFrame:
    """Fetch 5-year free BTC blockchain metrics: addresses, USD transfer vol, market cap, hashrate."""
    sess = _session()
    series_specs = [
        ("n-unique-addresses", "active_addresses"),
        ("estimated-transaction-volume-usd", "tx_transfer_usd"),
        ("market-cap", "market_cap_usd"),
        ("hash-rate", "hashrate"),
    ]
    frames = [_fetch_blockchain_chart(sess, chart, col, timespan=timespan) for chart, col in series_specs]
    valid = [f for f in frames if not f.empty]
    if not valid:
        return pd.DataFrame()
    merged = valid[0]
    for nxt in valid[1:]:
        merged = pd.merge(merged, nxt, on="date", how="outer")
    return merged.sort_values("date").drop_duplicates(subset=["date"], keep="last").reset_index(drop=True)


def fetch_coinmetrics_btc(start_date: str = "2020-01-01") -> pd.DataFrame:
    """Fetch free community daily BTC network metrics from CoinMetrics API."""
    sess = _session()
    metrics = "AdrActCnt,CapMrktCurUSD,TxCnt,HashRate"
    params = {
        "assets": "btc",
        "metrics": metrics,
        "frequency": "1d",
        "start_time": start_date,
        "page_size": 10000,
    }
    try:
        resp = sess.get(COINMETRICS_URL, params=params, timeout=20)
        if resp.status_code != 200:
            return pd.DataFrame()
        payload = resp.json().get("data", [])
        if not payload:
            return pd.DataFrame()

        df = pd.DataFrame(payload)
        df["date"] = pd.to_datetime(df["time"]).dt.strftime("%Y-%m-%d")
        rename_map = {
            "AdrActCnt": "active_addresses",
            "CapMrktCurUSD": "market_cap_usd",
            "TxCnt": "tx_count",
            "HashRate": "hashrate",
        }
        for src, dst in rename_map.items():
            df[dst] = pd.to_numeric(df.get(src), errors="coerce")
        keep = ["date", *rename_map.values()]
        return df[keep].drop_duplicates(subset=["date"]).sort_values("date").reset_index(drop=True)
    except Exception:
        return pd.DataFrame()


def fetch_stablecoins_liquidity() -> pd.DataFrame:
    """
    Fetch daily USDT+USDC / total stablecoin circulating supply (macro crypto liquidity).
    Tries DefiLlama first, then falls back cleanly to CoinGecko public market_chart (USDT + USDC).
    """
    sess = _session()
    try:
        resp = sess.get(DEFILLAMA_STABLES_URL, timeout=12)
        if resp.status_code == 200:
            rows = []
            for item in resp.json():
                ts_sec = int(item.get("date", 0))
                mcap = item.get("totalCirculatingUSD", {}).get("peggedUSD")
                if ts_sec > 0 and mcap is not None:
                    date_str = datetime.fromtimestamp(ts_sec, tz=timezone.utc).strftime("%Y-%m-%d")
                    rows.append({"date": date_str, "stablecoin_mcap_usd": float(mcap)})
            if rows:
                return pd.DataFrame(rows).drop_duplicates(subset=["date"], keep="last").sort_values("date").reset_index(drop=True)
    except Exception:
        pass

    # Fallback: CoinGecko daily market_caps of USDT + USDC (last 365 days free, no key)
    coin_frames: List[pd.DataFrame] = []
    for coin_id, col in (("tether", "usdt_mcap"), ("usd-coin", "usdc_mcap")):
        try:
            r = sess.get(
                COINGECKO_CHART_URL.format(coin_id=coin_id),
                params={"vs_currency": "usd", "days": "365", "interval": "daily"},
                timeout=15,
            )
            if r.status_code == 200:
                mcaps = r.json().get("market_caps", [])
                rows = [
                    {
                        "date": datetime.fromtimestamp(float(ts_ms) / 1000.0, tz=timezone.utc).strftime("%Y-%m-%d"),
                        col: float(val),
                    }
                    for ts_ms, val in mcaps
                    if val is not None
                ]
                if rows:
                    coin_frames.append(
                        pd.DataFrame(rows).drop_duplicates(subset=["date"], keep="last")
                    )
        except Exception:
            continue

    if not coin_frames:
        return pd.DataFrame()

    st = coin_frames[0]
    if len(coin_frames) > 1:
        st = pd.merge(st, coin_frames[1], on="date", how="inner")
        st["stablecoin_mcap_usd"] = st["usdt_mcap"] + st["usdc_mcap"]
    else:
        col0 = [c for c in st.columns if c != "date"][0]
        st["stablecoin_mcap_usd"] = st[col0]
    return st[["date", "stablecoin_mcap_usd"]].sort_values("date").reset_index(drop=True)


def fetch_fear_greed_history() -> pd.DataFrame:
    """Fetch daily Crypto Fear & Greed Index from Alternative.me."""
    sess = _session()
    try:
        resp = sess.get(FEAR_GREED_URL, timeout=15)
        if resp.status_code != 200:
            return pd.DataFrame()
        items = resp.json().get("data", [])
        rows = []
        for item in items:
            ts_sec = int(item.get("timestamp", 0))
            val = float(item.get("value", 50))
            if ts_sec > 0:
                date_str = datetime.fromtimestamp(ts_sec, tz=timezone.utc).strftime("%Y-%m-%d")
                rows.append({"date": date_str, "fear_greed": val})
        if not rows:
            return pd.DataFrame()
        return pd.DataFrame(rows).drop_duplicates(subset=["date"], keep="last").sort_values("date").reset_index(drop=True)
    except Exception:
        return pd.DataFrame()


def fetch_mempool_live() -> Dict[str, Optional[float]]:
    """Fetch real-time Bitcoin mempool congestion and fee pressure from Mempool.space."""
    sess = _session()
    out: Dict[str, Optional[float]] = {
        "fastest_fee_sat": None,
        "half_hour_fee_sat": None,
        "hour_fee_sat": None,
        "mempool_tx_count": None,
        "mempool_vsize_mb": None,
    }
    try:
        r_fees = sess.get(MEMPOOL_FEES_URL, timeout=10)
        if r_fees.status_code == 200:
            f = r_fees.json()
            out["fastest_fee_sat"] = float(f.get("fastestFee", 0))
            out["half_hour_fee_sat"] = float(f.get("halfHourFee", 0))
            out["hour_fee_sat"] = float(f.get("hourFee", 0))
    except Exception:
        pass
    try:
        r_state = sess.get(MEMPOOL_STATE_URL, timeout=10)
        if r_state.status_code == 200:
            s = r_state.json()
            out["mempool_tx_count"] = float(s.get("count", 0))
            out["mempool_vsize_mb"] = round(float(s.get("vsize", 0)) / 1_000_000.0, 2)
    except Exception:
        pass
    return out


def fetch_combined_onchain_daily(start_date: str = "2020-01-01", timespan: str = "5years") -> pd.DataFrame:
    """
    Merge Blockchain.com (5y BTC network/USD tx vol), CoinMetrics (daily verification),
    Stablecoins liquidity (DefiLlama / CoinGecko), and Fear & Greed by UTC date.

    Adds strict `available_from_ms` = (date + 1 day at 00:00 UTC) so daily on-chain
    values never leak into same-day intraday bars (anti-look-ahead guarantee).
    """
    bc = fetch_blockchain_info_btc(timespan=timespan)
    cm = fetch_coinmetrics_btc(start_date=start_date)
    stables = fetch_stablecoins_liquidity()
    fng = fetch_fear_greed_history()

    frames = []
    if not bc.empty:
        frames.append(bc)
    if not cm.empty:
        # Supplement with CoinMetrics rows/tx_count without overwriting valid Blockchain.com tx_transfer_usd
        if not bc.empty:
            cm_extra = cm[[c for c in ("date", "tx_count") if c in cm.columns]]
            frames.append(cm_extra)
        else:
            frames.append(cm)
    if not stables.empty:
        frames.append(stables)
    if not fng.empty:
        frames.append(fng)

    if not frames:
        return pd.DataFrame()

    merged = frames[0]
    for nxt in frames[1:]:
        merged = pd.merge(merged, nxt, on="date", how="outer")

    merged = merged.sort_values("date").drop_duplicates(subset=["date"], keep="last").reset_index(drop=True)
    value_cols = [c for c in merged.columns if c != "date"]
    merged[value_cols] = merged[value_cols].ffill()

    dt = pd.to_datetime(merged["date"], utc=True) + pd.Timedelta(days=1)
    merged["available_from_ms"] = (dt.astype("int64") // 1_000_000).astype("int64")
    return merged
