/**
 * CoinMarketCapService
 * 
 * Frontend service that fetches crypto market data through
 * the Vercel Serverless Function proxy at /api/coinmarketcap.
 * 
 * Features:
 * - 2-minute cache to conserve API credits
 * - Polling with configurable interval
 * - Clean data transformation
 */

class CoinMarketCapService {
  constructor() {
    this._cache = {
      quotes: { data: null, timestamp: 0 },
      global: { data: null, timestamp: 0 },
    };
    this._cacheDuration = 2 * 60 * 1000; // 2 minutes in ms
    this._pollingTimer = null;
  }

  /**
   * Check if cached data is still fresh
   */
  _isCacheFresh(cacheKey) {
    const entry = this._cache[cacheKey];
    return entry.data !== null && (Date.now() - entry.timestamp) < this._cacheDuration;
  }

  /**
   * Fetch cryptocurrency quotes for given symbols
   * @param {string[]} symbols - Array of symbols like ['BTC', 'ETH', 'SOL']
   * @returns {Promise<Object>} Transformed quotes data keyed by symbol
   */
  async fetchQuotes(symbols) {
    if (!symbols || symbols.length === 0) {
      return {};
    }

    const symbolsKey = symbols.sort().join(',');

    // Return cached data if fresh
    if (this._isCacheFresh('quotes')) {
      return this._cache.quotes.data;
    }

    try {
      const response = await fetch(`/api/coinmarketcap?endpoint=quotes&symbols=${encodeURIComponent(symbolsKey)}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[CMC Service] Quotes API error:', response.status, errorData);
        throw new Error(`API error: ${response.status}`);
      }

      const raw = await response.json();

      // Transform data into clean format
      const transformed = {};

      if (raw.data) {
        for (const [symbol, tokenData] of Object.entries(raw.data)) {
          const quote = tokenData.quote?.USD;
          if (quote) {
            transformed[symbol] = {
              price: quote.price,
              marketCap: quote.market_cap,
              volume24h: quote.volume_24h,
              circulatingSupply: tokenData.circulating_supply,
              maxSupply: tokenData.max_supply,
              totalSupply: tokenData.total_supply,
              percentChange1h: quote.percent_change_1h,
              percentChange24h: quote.percent_change_24h,
              percentChange7d: quote.percent_change_7d,
              cmcRank: tokenData.cmc_rank,
              name: tokenData.name,
              symbol: tokenData.symbol,
              lastUpdated: quote.last_updated,
            };
          }
        }
      }

      // Update cache
      this._cache.quotes = { data: transformed, timestamp: Date.now() };

      return transformed;
    } catch (error) {
      console.error('[CMC Service] Failed to fetch quotes:', error);

      // Return stale cache if available
      if (this._cache.quotes.data) {
        console.warn('[CMC Service] Returning stale cached quotes data');
        return this._cache.quotes.data;
      }

      throw error;
    }
  }

  /**
   * Fetch global crypto market metrics
   * @returns {Promise<Object>} Transformed global metrics
   */
  async fetchGlobalMetrics() {
    // Return cached data if fresh
    if (this._isCacheFresh('global')) {
      return this._cache.global.data;
    }

    try {
      const response = await fetch('/api/coinmarketcap?endpoint=global');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[CMC Service] Global metrics API error:', response.status, errorData);
        throw new Error(`API error: ${response.status}`);
      }

      const raw = await response.json();

      // Transform global metrics
      const metrics = raw.data;
      const usdQuote = metrics?.quote?.USD;

      const transformed = {
        totalMarketCap: usdQuote?.total_market_cap ?? null,
        btcDominance: metrics?.btc_dominance ?? null,
        ethDominance: metrics?.eth_dominance ?? null,
        activeCryptocurrencies: metrics?.active_cryptocurrencies ?? null,
        totalExchanges: metrics?.active_exchanges ?? null,
        lastUpdated: usdQuote?.last_updated ?? null,
      };

      // Update cache
      this._cache.global = { data: transformed, timestamp: Date.now() };

      return transformed;
    } catch (error) {
      console.error('[CMC Service] Failed to fetch global metrics:', error);

      // Return stale cache if available
      if (this._cache.global.data) {
        console.warn('[CMC Service] Returning stale cached global data');
        return this._cache.global.data;
      }

      throw error;
    }
  }

  /**
   * Start polling for quotes and global metrics
   * @param {string[]} symbols - Array of symbols to track
   * @param {Function} callback - Called with { quotes, global } on each poll
   * @param {number} interval - Polling interval in ms (default: 120000 = 2 min)
   */
  startPolling(symbols, callback, interval = 120000) {
    // Stop any existing polling
    this.stopPolling();

    const poll = async () => {
      try {
        const [quotes, global] = await Promise.all([
          this.fetchQuotes(symbols),
          this.fetchGlobalMetrics(),
        ]);

        callback({ quotes, global, error: null, lastUpdated: new Date() });
      } catch (error) {
        console.error('[CMC Service] Polling error:', error);
        callback({ quotes: null, global: null, error: error.message, lastUpdated: new Date() });
      }
    };

    // Fetch immediately
    poll();

    // Set up recurring interval
    this._pollingTimer = setInterval(poll, interval);
  }

  /**
   * Stop the polling loop
   */
  stopPolling() {
    if (this._pollingTimer) {
      clearInterval(this._pollingTimer);
      this._pollingTimer = null;
    }
  }
}

// Export singleton instance
const coinMarketCapService = new CoinMarketCapService();
export default coinMarketCapService;
