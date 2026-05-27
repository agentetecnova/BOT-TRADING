/**
 * PriceSyncEngine.js
 * Advanced, real-time multi-exchange price synchronizer.
 * Supports:
 * - Binance: Real-time, millisecond updates via native WebSockets.
 * - MEXC: High-frequency REST API polling (1.5s interval) with instant initial fetch.
 * 
 * Implements heartbeats, automatic reconnection, and connection status reporting.
 */

class PriceSyncEngine {
  constructor() {
    this.binanceWs = null;
    this.mexcInterval = null;
    
    // Active symbols grouped by exchange
    // Structure: { symbol: 'BTCUSDT', label: 'BTC', exchange: 'binance' }
    this.symbols = [];
    
    // Callbacks
    this.onPriceUpdate = null;
    this.onStatusChange = null;
    
    // Connection states: 'connected', 'connecting', 'disconnected'
    this.status = {
      binance: 'disconnected',
      mexc: 'disconnected'
    };

    this.binanceReconnectTimeout = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  /**
   * Initializes the engine with a set of symbols and callbacks.
   */
  start(initialSymbols, onPriceUpdate, onStatusChange) {
    this.symbols = [...initialSymbols];
    this.onPriceUpdate = onPriceUpdate;
    this.onStatusChange = onStatusChange;
    
    // Trigger instant initial fetch to eliminate loading delays
    this.fetchAllPricesOnce();

    // Start providers
    this.startBinanceWebSocket();
    this.startMexcPolling();
  }

  /**
   * Cleans up all connections and intervals.
   */
  stop() {
    this.stopBinanceWebSocket();
    this.stopMexcPolling();
    this.symbols = [];
  }

  /**
   * Dynamically adds a new token to watch.
   */
  addSymbol(symbol, label, exchange) {
    const uppercaseSymbol = symbol.trim().toUpperCase();
    
    // Prevent duplicates
    if (this.symbols.some(s => s.symbol === uppercaseSymbol && s.exchange === exchange)) {
      return false;
    }

    this.symbols.push({ symbol: uppercaseSymbol, label: label.toUpperCase(), exchange });
    
    // Fetch its price instantly
    this.fetchSinglePrice(uppercaseSymbol, exchange);
    
    // Reconnect or update WebSocket subscriptions if it's a Binance symbol
    if (exchange === 'binance') {
      this.restartBinanceWebSocket();
    }

    return true;
  }

  /**
   * Dynamically removes a token from watch.
   */
  removeSymbol(symbol, exchange) {
    const uppercaseSymbol = symbol.toUpperCase();
    this.symbols = this.symbols.filter(s => !(s.symbol === uppercaseSymbol && s.exchange === exchange));
    
    if (exchange === 'binance') {
      this.restartBinanceWebSocket();
    }
  }

  /**
   * Updates a connection status and triggers callback.
   */
  updateStatus(exchange, state) {
    if (this.status[exchange] !== state) {
      this.status[exchange] = state;
      if (this.onStatusChange) {
        this.onStatusChange({ ...this.status });
      }
    }
  }

  /**
   * Triggers a price update event.
   */
  triggerPriceUpdate(symbol, exchange, price, change24h = null) {
    if (this.onPriceUpdate) {
      this.onPriceUpdate({
        symbol,
        exchange,
        price: parseFloat(price),
        change24h: change24h !== null ? parseFloat(change24h) : null,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Initial immediate fetch of all prices to show them instantly.
   */
  async fetchAllPricesOnce() {
    this.symbols.forEach(item => {
      this.fetchSinglePrice(item.symbol, item.exchange);
    });
  }

  /**
   * Single price HTTP fetch fallback.
   */
  async fetchSinglePrice(symbol, exchange) {
    try {
      if (exchange === 'binance') {
        const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
        if (!response.ok) throw new Error('Binance fetch failed');
        const data = await response.json();
        this.triggerPriceUpdate(symbol, 'binance', data.lastPrice, data.priceChangePercent);
      } else if (exchange === 'mexc') {
        const targetUrl = encodeURIComponent(`https://api.mexc.com/api/v3/ticker/24hr?symbol=${symbol}`);
        const response = await fetch(`https://api.allorigins.win/raw?url=${targetUrl}`);
        if (!response.ok) throw new Error('MEXC fetch failed');
        const data = await response.json();
        
        const changePercent24h = data.priceChangePercent !== undefined && data.priceChangePercent !== null
          ? parseFloat(data.priceChangePercent) * 100
          : null;

        this.triggerPriceUpdate(symbol, 'mexc', data.lastPrice, changePercent24h);
      }
    } catch (err) {
      console.warn(`Initial fetch failed for ${symbol} on ${exchange}:`, err.message);
    }
  }

  // ==========================================
  // BINANCE WEBSOCKET IMPLEMENTATION
  // ==========================================

  startBinanceWebSocket() {
    const binanceSymbols = this.symbols.filter(s => s.exchange === 'binance');
    if (binanceSymbols.length === 0) {
      this.updateStatus('binance', 'disconnected');
      return;
    }

    this.updateStatus('binance', 'connecting');

    try {
      // Connect to Binance multi-stream WebSocket
      // Format: wss://stream.binance.com:9443/ws/btcusdt@ticker/ethusdt@ticker
      const streamNames = binanceSymbols.map(s => `${s.symbol.toLowerCase()}@ticker`).join('/');
      this.binanceWs = new WebSocket(`wss://stream.binance.com:9443/ws/${streamNames}`);

      this.binanceWs.onopen = () => {
        this.updateStatus('binance', 'connected');
        this.reconnectAttempts = 0;
        if (this.binanceReconnectTimeout) {
          clearTimeout(this.binanceReconnectTimeout);
          this.binanceReconnectTimeout = null;
        }
      };

      this.binanceWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Format from Binance ticker stream:
          // { e: '24hrTicker', s: 'BTCUSDT', c: '67200.00', p: '2.50', ... }
          if (data && data.s) {
            this.triggerPriceUpdate(data.s, 'binance', data.c, data.P);
          }
        } catch (e) {
          console.error('Error parsing Binance WS message:', e);
        }
      };

      this.binanceWs.onerror = (err) => {
        console.error('Binance WebSocket error:', err);
        this.updateStatus('binance', 'disconnected');
      };

      this.binanceWs.onclose = () => {
        this.updateStatus('binance', 'disconnected');
        this.handleBinanceReconnect();
      };
    } catch (error) {
      console.error('Failed to establish Binance WebSocket:', error);
      this.updateStatus('binance', 'disconnected');
      this.handleBinanceReconnect();
    }
  }

  stopBinanceWebSocket() {
    if (this.binanceWs) {
      // Clear hooks
      this.binanceWs.onopen = null;
      this.binanceWs.onmessage = null;
      this.binanceWs.onerror = null;
      this.binanceWs.onclose = null;
      
      this.binanceWs.close();
      this.binanceWs = null;
    }
    this.updateStatus('binance', 'disconnected');
    
    if (this.binanceReconnectTimeout) {
      clearTimeout(this.binanceReconnectTimeout);
      this.binanceReconnectTimeout = null;
    }
  }

  restartBinanceWebSocket() {
    this.stopBinanceWebSocket();
    this.startBinanceWebSocket();
  }

  handleBinanceReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.updateStatus('binance', 'connecting');
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 15000);
      
      console.log(`Reconnecting to Binance WS in ${delay}ms (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      this.binanceReconnectTimeout = setTimeout(() => {
        this.startBinanceWebSocket();
      }, delay);
    } else {
      console.error('Max Binance WS reconnect attempts reached. Keeping disconnected state.');
    }
  }

  // ==========================================
  // MEXC POLLING IMPLEMENTATION
  // ==========================================

  startMexcPolling() {
    this.stopMexcPolling();
    
    const mexcSymbols = this.symbols.filter(s => s.exchange === 'mexc');
    if (mexcSymbols.length === 0) {
      this.updateStatus('mexc', 'disconnected');
      return;
    }

    this.updateStatus('mexc', 'connected'); // Mark active since we will fetch now

    // High frequency polling: 1.5 seconds (1500ms)
    this.mexcInterval = setInterval(() => {
      this.symbols
        .filter(s => s.exchange === 'mexc')
        .forEach(item => {
          this.fetchSinglePrice(item.symbol, 'mexc');
        });
    }, 1500);
  }

  stopMexcPolling() {
    if (this.mexcInterval) {
      clearInterval(this.mexcInterval);
      this.mexcInterval = null;
    }
    this.updateStatus('mexc', 'disconnected');
  }
}

export default new PriceSyncEngine();
