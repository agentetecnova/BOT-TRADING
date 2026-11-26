/**
 * MarketDataService.js
 *
 * Fetches real-time institutional, derivatives, orderbook, and cross-exchange
 * market microstructure data for BTC/USDT (browser & Node compatible).
 * Zero fabricated or hardcoded mock values: returns explicit availability flags.
 */

class MarketDataService {
  constructor() {
    this._cache = null;
    this._lastFetchTs = 0;
    this._ttlMs = 20000; // 20s cache to respect rate limits while keeping signals fresh
  }

  async _safeFetchJson(url, timeoutMs = 4500) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Fetches live derivatives & microstructure context in parallel.
   * @param {number|null} spotPriceOverride - Current Binance spot BTCUSDT price
   */
  async fetchMarketContext(spotPriceOverride = null) {
    const now = Date.now();
    if (this._cache && (now - this._lastFetchTs) < this._ttlMs) {
      if (spotPriceOverride && this._cache.coinbasePrice) {
        const spread = ((this._cache.coinbasePrice - spotPriceOverride) / spotPriceOverride) * 100;
        return { ...this._cache, coinbasePremiumPct: parseFloat(spread.toFixed(4)) };
      }
      return this._cache;
    }

    const [
      premiumIdx,
      oiCurrent,
      oiHist,
      globalLS,
      topLS,
      takerLS,
      perpKlines,
      depth,
      coinbaseSpot,
      fearGreed
    ] = await Promise.all([
      this._safeFetchJson('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT'),
      this._safeFetchJson('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT'),
      this._safeFetchJson('https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=15m&limit=12'),
      this._safeFetchJson('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=4'),
      this._safeFetchJson('https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=BTCUSDT&period=1h&limit=4'),
      this._safeFetchJson('https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=BTCUSDT&period=15m&limit=6'),
      this._safeFetchJson('https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=15m&limit=30'),
      this._safeFetchJson('https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=100'),
      this._safeFetchJson('https://api.coinbase.com/v2/prices/BTC-USD/spot'),
      this._safeFetchJson('https://api.alternative.me/fng/?limit=1')
    ]);

    // 1. Funding Rate & Mark/Index Basis
    const fundingRate = premiumIdx && premiumIdx.lastFundingRate !== undefined
      ? parseFloat(premiumIdx.lastFundingRate)
      : null;
    const markPrice = premiumIdx?.markPrice ? parseFloat(premiumIdx.markPrice) : null;
    const indexPrice = premiumIdx?.indexPrice ? parseFloat(premiumIdx.indexPrice) : null;
    const futuresBasisPct = (markPrice && indexPrice)
      ? parseFloat((((markPrice - indexPrice) / indexPrice) * 100).toFixed(4))
      : null;

    // 2. Open Interest & 1h/3h Change %
    const openInterestBtc = oiCurrent?.openInterest ? parseFloat(oiCurrent.openInterest) : null;
    let oiChangePct = null;
    if (Array.isArray(oiHist) && oiHist.length >= 4) {
      const oldestOi = parseFloat(oiHist[0].sumOpenInterest);
      const latestOi = parseFloat(oiHist[oiHist.length - 1].sumOpenInterest);
      if (oldestOi > 0) {
        oiChangePct = parseFloat((((latestOi - oldestOi) / oldestOi) * 100).toFixed(2));
      }
    }

    // 3. Retail vs Top Trader Long/Short Positioning
    const retailLongShortRatio = Array.isArray(globalLS) && globalLS.length > 0
      ? parseFloat(globalLS[globalLS.length - 1].longShortRatio)
      : null;
    const whaleLongShortRatio = Array.isArray(topLS) && topLS.length > 0
      ? parseFloat(topLS[topLS.length - 1].longShortRatio)
      : null;

    // 4. Futures Taker Buy/Sell Ratio & Perp Historical CVD Delta
    const takerBuySellRatio = Array.isArray(takerLS) && takerLS.length > 0
      ? parseFloat(takerLS[takerLS.length - 1].buySellRatio)
      : null;

    let perpCvd15mDelta = null;
    if (Array.isArray(perpKlines) && perpKlines.length >= 4) {
      // item[5] = total base vol, item[9] = taker buy base vol
      const recentPerp = perpKlines.slice(-4);
      perpCvd15mDelta = recentPerp.reduce((acc, k) => {
        const vol = parseFloat(k[5]) || 0;
        const buyVol = parseFloat(k[9]) || 0;
        const sellVol = Math.max(0, vol - buyVol);
        const closeP = parseFloat(k[4]) || 0;
        return acc + ((buyVol - sellVol) * closeP);
      }, 0);
      perpCvd15mDelta = Math.round(perpCvd15mDelta);
    }

    // 5. Real Spot Order Book Imbalance & Buy/Sell Walls
    let orderBookImbalancePct = null;
    let nearestBuyWall = null;
    let nearestSellWall = null;
    if (depth && Array.isArray(depth.bids) && Array.isArray(depth.asks)) {
      let bidUsd = 0;
      let askUsd = 0;
      let maxBidWall = { price: null, usd: 0 };
      let maxAskWall = { price: null, usd: 0 };

      depth.bids.forEach(([pStr, qStr]) => {
        const p = parseFloat(pStr);
        const q = parseFloat(qStr);
        const usd = p * q;
        bidUsd += usd;
        if (usd > maxBidWall.usd) maxBidWall = { price: p, usd };
      });
      depth.asks.forEach(([pStr, qStr]) => {
        const p = parseFloat(pStr);
        const q = parseFloat(qStr);
        const usd = p * q;
        askUsd += usd;
        if (usd > maxAskWall.usd) maxAskWall = { price: p, usd };
      });

      const totalDepth = bidUsd + askUsd;
      if (totalDepth > 0) {
        orderBookImbalancePct = parseFloat((((bidUsd - askUsd) / totalDepth) * 100).toFixed(1));
      }
      nearestBuyWall = maxBidWall.price ? { price: Math.round(maxBidWall.price), usdM: parseFloat((maxBidWall.usd / 1e6).toFixed(2)) } : null;
      nearestSellWall = maxAskWall.price ? { price: Math.round(maxAskWall.price), usdM: parseFloat((maxAskWall.usd / 1e6).toFixed(2)) } : null;
    }

    // 6. Real Coinbase Spot Premium Index
    const coinbasePrice = coinbaseSpot?.data?.amount ? parseFloat(coinbaseSpot.data.amount) : null;
    const referenceBinancePrice = spotPriceOverride || indexPrice || markPrice;
    const coinbasePremiumPct = (coinbasePrice && referenceBinancePrice)
      ? parseFloat((((coinbasePrice - referenceBinancePrice) / referenceBinancePrice) * 100).toFixed(4))
      : null;

    // 7. Real Fear & Greed Index
    let fearAndGreed = null;
    if (fearGreed && Array.isArray(fearGreed.data) && fearGreed.data.length > 0) {
      const val = parseInt(fearGreed.data[0].value, 10);
      const classification = fearGreed.data[0].value_classification;
      let labelEs = 'Neutral 😐';
      let color = '#eab308';
      if (val <= 25) { labelEs = 'Miedo Extremo 😱'; color = '#ef4444'; }
      else if (val <= 45) { labelEs = 'Miedo 😨'; color = '#f97316'; }
      else if (val <= 55) { labelEs = 'Neutral 😐'; color = '#eab308'; }
      else if (val <= 75) { labelEs = 'Codicia 🤑'; color = '#10b981'; }
      else { labelEs = 'Codicia Extrema 🚀'; color = '#00e676'; }
      fearAndGreed = { value: val, classification, labelEs, color };
    }

    const context = {
      timestamp: now,
      fundingRate,
      fundingRatePct: fundingRate !== null ? parseFloat((fundingRate * 100).toFixed(4)) : null,
      futuresBasisPct,
      openInterestBtc,
      oiChangePct,
      retailLongShortRatio,
      whaleLongShortRatio,
      takerBuySellRatio,
      perpCvd15mDelta,
      orderBookImbalancePct,
      nearestBuyWall,
      nearestSellWall,
      coinbasePrice,
      coinbasePremiumPct,
      fearAndGreed
    };

    this._cache = context;
    this._lastFetchTs = now;
    return context;
  }
}

const marketDataService = new MarketDataService();
export default marketDataService;
