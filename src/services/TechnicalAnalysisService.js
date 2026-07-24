/**
 * TechnicalAnalysisService
 * 
 * Engine to fetch historical data from Binance and perform advanced calculations:
 * - EMAs (9, 21, 50, 350, 700)
 * - RSI (7 and 14)
 * - MACD
 * - Bollinger Bands
 * - Pivot High/Low & RSI Divergence Detection
 */

class TechnicalAnalysisService {
  /**
   * Fetch historical candles (klines) from Binance API
   * @param {string} symbol - e.g. 'BTCUSDT'
   * @param {string} interval - '5m', '15m', '1h', '4h'
   * @param {number} limit - default 1000 to stabilize high-period EMAs (like EMA 700)
   */
  async fetchKlines(symbol = 'BTCUSDT', interval = '15m', limit = 1000) {
    try {
      const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch klines for ${interval}: ${response.statusText}`);
      }
      const rawData = await response.json();
      
      // Map to clean candlestick structures
      return rawData.map(item => ({
        openTime: item[0],
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
        volume: parseFloat(item[5]),
        closeTime: item[6]
      }));
    } catch (error) {
      console.error(`[Analysis Service] Error fetching ${interval} candles:`, error);
      throw error;
    }
  }

  // ==========================================
  // MATHEMATICAL INDICATORS
  // ==========================================

  calculateEMA(prices, period) {
    if (prices.length < period) return new Array(prices.length).fill(null);
    const k = 2 / (period + 1);
    const ema = new Array(prices.length).fill(null);
    
    // Simple SMA for first value
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += prices[i];
    }
    let currentEma = sum / period;
    ema[period - 1] = currentEma;
    
    for (let i = period; i < prices.length; i++) {
      currentEma = (prices[i] * k) + (currentEma * (1 - k));
      ema[i] = currentEma;
    }
    return ema;
  }

  calculateRSI(prices, period = 14) {
    if (prices.length <= period) return new Array(prices.length).fill(null);
    const rsi = new Array(prices.length).fill(null);
    
    let gains = 0;
    let losses = 0;
    
    // First period change averages
    for (let i = 1; i <= period; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff > 0) {
        gains += diff;
      } else {
        losses -= diff;
      }
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;
    
    rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
    
    for (let i = period + 1; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      let gain = 0;
      let loss = 0;
      if (diff > 0) gain = diff;
      else loss = -diff;
      
      avgGain = ((avgGain * (period - 1)) + gain) / period;
      avgLoss = ((avgLoss * (period - 1)) + loss) / period;
      
      rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
    }
    
    return rsi;
  }

  calculateMACD(prices) {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    
    const macdLine = new Array(prices.length).fill(null);
    for (let i = 0; i < prices.length; i++) {
      if (ema12[i] !== null && ema26[i] !== null) {
        macdLine[i] = ema12[i] - ema26[i];
      }
    }
    
    // Filter non-null MACD to feed EMA 9
    const validMacd = macdLine.filter(v => v !== null);
    const validMacdOffset = prices.length - validMacd.length;
    const signalEma = this.calculateEMA(validMacd, 9);
    
    const signalLine = new Array(prices.length).fill(null);
    const histogram = new Array(prices.length).fill(null);
    
    for (let i = 0; i < validMacd.length; i++) {
      const idx = i + validMacdOffset;
      const sigVal = signalEma[i];
      if (sigVal !== null && sigVal !== undefined) {
        signalLine[idx] = sigVal;
        histogram[idx] = macdLine[idx] - sigVal;
      }
    }
    
    return { macdLine, signalLine, histogram };
  }

  calculateBollingerBands(prices, period = 20, multiplier = 2) {
    if (prices.length < period) {
      return { 
        upper: new Array(prices.length).fill(null), 
        middle: new Array(prices.length).fill(null), 
        lower: new Array(prices.length).fill(null) 
      };
    }
    
    const upper = new Array(prices.length).fill(null);
    const middle = new Array(prices.length).fill(null);
    const lower = new Array(prices.length).fill(null);
    
    for (let i = period - 1; i < prices.length; i++) {
      const window = prices.slice(i - period + 1, i + 1);
      const sum = window.reduce((a, b) => a + b, 0);
      const mean = sum / period;
      
      const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
      const stdDev = Math.sqrt(variance);
      
      middle[i] = mean;
      upper[i] = mean + (multiplier * stdDev);
      lower[i] = mean - (multiplier * stdDev);
    }
    
    return { upper, middle, lower };
  }

  // ==========================================
  // DIVERGENCES DETECTION (RSI 7)
  // ==========================================

  /**
   * Scans candlesticks for regular RSI divergences.
   * Pivot point detection uses a window of leftStrength/rightStrength to confirm a peak or valley.
   */
  detectDivergences(candles, rsiValues, leftStrength = 4, rightStrength = 2) {
    const pricesHigh = candles.map(c => c.high);
    const pricesLow = candles.map(c => c.low);
    const len = candles.length;
    
    // Find pivot peaks (highs)
    const pivotHighs = [];
    for (let i = len - 50; i < len - rightStrength; i++) {
      if (i < leftStrength) continue;
      let isPivot = true;
      for (let l = 1; l <= leftStrength; l++) {
        if (pricesHigh[i] <= pricesHigh[i - l]) isPivot = false;
      }
      for (let r = 1; r <= rightStrength; r++) {
        if (pricesHigh[i] < pricesHigh[i + r]) isPivot = false;
      }
      if (isPivot && rsiValues[i] !== null) {
        pivotHighs.push({ index: i, price: pricesHigh[i], rsi: rsiValues[i] });
      }
    }
    
    // Find pivot troughs (lows)
    const pivotLows = [];
    for (let i = len - 50; i < len - rightStrength; i++) {
      if (i < leftStrength) continue;
      let isPivot = true;
      for (let l = 1; l <= leftStrength; l++) {
        if (pricesLow[i] >= pricesLow[i - l]) isPivot = false;
      }
      for (let r = 1; r <= rightStrength; r++) {
        if (pricesLow[i] > pricesLow[i + r]) isPivot = false;
      }
      if (isPivot && rsiValues[i] !== null) {
        pivotLows.push({ index: i, price: pricesLow[i], rsi: rsiValues[i] });
      }
    }

    let bullishDivergence = false;
    let bearishDivergence = false;

    // Check Bearish Divergence (Price Higher High, RSI Lower High)
    if (pivotHighs.length >= 2) {
      const p1 = pivotHighs[pivotHighs.length - 1]; // Recent
      const p2 = pivotHighs[pivotHighs.length - 2]; // Older
      
      // Make sure the pivot is relatively fresh (within last 15 bars)
      if (len - p1.index <= 15) {
        if (p1.price > p2.price && p1.rsi < p2.rsi) {
          bearishDivergence = true;
        }
      }
    }

    // Check Bullish Divergence (Price Lower Low, RSI Higher Low)
    if (pivotLows.length >= 2) {
      const p1 = pivotLows[pivotLows.length - 1]; // Recent
      const p2 = pivotLows[pivotLows.length - 2]; // Older
      
      if (len - p1.index <= 15) {
        if (p1.price < p2.price && p1.rsi > p2.rsi) {
          bullishDivergence = true;
        }
      }
    }

    return { bullishDivergence, bearishDivergence };
  }

  // ==========================================
  // STRATEGY CALCULATIONS
  // ==========================================

  /**
   * Run Strategy 1: Confluence Multifactorial on a single candle set (defaults to 15m)
   */
  runStrategy1(candles) {
    if (!candles || candles.length < 50) {
      return { success: false, error: 'Insufficient data' };
    }

    const prices = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    const lastPrice = prices[prices.length - 1];
    
    // Indicators
    const ema9 = this.calculateEMA(prices, 9);
    const ema21 = this.calculateEMA(prices, 21);
    const rsi14 = this.calculateRSI(prices, 14);
    const macd = this.calculateMACD(prices);
    const bb = this.calculateBollingerBands(prices, 20, 2);

    const lastIdx = prices.length - 1;

    let upPoints = 0;
    let downPoints = 0;
    const reasons = [];

    // EMA 9/21 cross
    const lastEma9 = ema9[lastIdx];
    const lastEma21 = ema21[lastIdx];
    if (lastEma9 !== null && lastEma21 !== null) {
      if (lastEma9 > lastEma21) {
        upPoints += 25;
        reasons.push('EMA 9/21 Alcista (Cruzadas)');
      } else {
        downPoints += 25;
        reasons.push('EMA 9/21 Bajista (Cruzadas)');
      }
    }

    // RSI 14
    const lastRsi = rsi14[lastIdx];
    if (lastRsi !== null) {
      if (lastRsi < 30) {
        upPoints += 25;
        reasons.push(`RSI 14 Sobreventa (${lastRsi.toFixed(1)})`);
      } else if (lastRsi >= 30 && lastRsi < 45) {
        upPoints += 10;
        reasons.push(`RSI 14 Alcista Moderado (${lastRsi.toFixed(1)})`);
      } else if (lastRsi > 70) {
        downPoints += 25;
        reasons.push(`RSI 14 Sobrecompra (${lastRsi.toFixed(1)})`);
      } else if (lastRsi > 55 && lastRsi <= 70) {
        downPoints += 10;
        reasons.push(`RSI 14 Bajista Moderado (${lastRsi.toFixed(1)})`);
      }
    }

    // MACD
    const lastHist = macd.histogram[lastIdx];
    const lastLine = macd.macdLine[lastIdx];
    const lastSignal = macd.signalLine[lastIdx];
    if (lastHist !== null && lastLine !== null && lastSignal !== null) {
      if (lastLine > lastSignal && lastHist > 0) {
        upPoints += 20;
        reasons.push('MACD Cruzado al Alza');
      } else if (lastLine < lastSignal && lastHist < 0) {
        downPoints += 20;
        reasons.push('MACD Cruzado a la Baja');
      }
    }

    // Bollinger Bands
    const lastBB = { upper: bb.upper[lastIdx], lower: bb.lower[lastIdx] };
    if (lastBB.upper !== null && lastBB.lower !== null) {
      if (lastPrice <= lastBB.lower) {
        upPoints += 15;
        reasons.push('Precio en Banda BB Inferior (Soporte)');
      } else if (lastPrice >= lastBB.upper) {
        downPoints += 15;
        reasons.push('Precio en Banda BB Superior (Resistencia)');
      }
    }

    // Volume
    const lastVol = volumes[volumes.length - 1];
    const pastVols = volumes.slice(volumes.length - 11, volumes.length - 1);
    const avgVol = pastVols.reduce((a, b) => a + b, 0) / pastVols.length;
    const lastCandleGreen = lastPrice >= candles[candles.length - 1].open;

    if (lastVol > avgVol * 1.5) {
      if (lastCandleGreen) {
        upPoints += 15;
        reasons.push('Alto Volumen de Velas Alcistas');
      } else {
        downPoints += 15;
        reasons.push('Alto Volumen de Velas Bajistas');
      }
    }

    // Probabilities
    let pUp = 50;
    let pDown = 50;
    const totalPoints = upPoints + downPoints;
    if (totalPoints > 0) {
      pUp = Math.round((upPoints / totalPoints) * 100);
      pDown = 100 - pUp;
    }

    let bias = 'NEUTRO';
    if (pUp >= 70) bias = 'ALCISTA FUERTE';
    else if (pUp >= 55) bias = 'ALCISTA MODERADO';
    else if (pDown >= 70) bias = 'BAJISTA FUERTE';
    else if (pDown >= 55) bias = 'BAJISTA MODERADO';

    // Generate signal
    let hasSignal = false;
    let signal = null;

    if (pUp > 50) {
      hasSignal = true;
      const recentLows = candles.slice(candles.length - 5).map(c => c.low);
      let sl = Math.min(...recentLows);
      if (lastPrice - sl < lastPrice * 0.003) {
        sl = lastPrice * 0.997; // 0.3% min distance
      }
      const risk = lastPrice - sl;
      const tp = lastPrice + (2 * risk); // R:R 1:2
      const riskPercent = parseFloat(((risk / lastPrice) * 100).toFixed(2));
      const profitPercent = parseFloat((((tp - lastPrice) / lastPrice) * 100).toFixed(2));

      signal = {
        type: 'LONG',
        entry: lastPrice,
        sl,
        tp,
        riskPercent,
        profitPercent,
        reasons: [...reasons]
      };
    } else if (pDown > 50) {
      hasSignal = true;
      const recentHighs = candles.slice(candles.length - 5).map(c => c.high);
      let sl = Math.max(...recentHighs);
      if (sl - lastPrice < lastPrice * 0.003) {
        sl = lastPrice * 1.003; // 0.3% min distance
      }
      const risk = sl - lastPrice;
      const tp = lastPrice - (2 * risk); // R:R 1:2
      const riskPercent = parseFloat(((risk / lastPrice) * 100).toFixed(2));
      const profitPercent = parseFloat((((lastPrice - tp) / lastPrice) * 100).toFixed(2));

      signal = {
        type: 'SHORT',
        entry: lastPrice,
        sl,
        tp,
        riskPercent,
        profitPercent,
        reasons: [...reasons]
      };
    }

    return {
      success: true,
      pUp,
      pDown,
      bias,
      reasons,
      hasSignal,
      signal,
      indicators: {
        rsi: lastRsi,
        macdHist: lastHist,
        ema9: lastEma9,
        ema21: lastEma21
      }
    };
  }

  /**
   * Run Strategy 2: Pro Trader (Multi-timeframe EMAs 50/350/700 + RSI 7 Divergences)
   * @param {Object} klinesMap - Map of timeframes to candle arrays: { '5m': [...], '15m': [...], '1h': [...], '4h': [...] }
   */
  runStrategy2(klinesMap) {
    const timeframes = ['5m', '15m', '1h', '4h'];
    
    // Check if we have data for all timeframes
    for (const tf of timeframes) {
      if (!klinesMap[tf] || klinesMap[tf].length < 750) {
        return { success: false, error: `Falta información o hay datos insuficientes en la temporalidad ${tf}` };
      }
    }

    let totalUp = 0;
    let totalDown = 0;
    const details = [];

    // Weights per timeframe
    const weights = {
      '4h': { ema: 20, div: 25 },
      '1h': { ema: 15, div: 15 },
      '15m': { ema: 10, div: 7 },
      '5m': { ema: 5, div: 3 }
    };

    let emaValues15m = { ema50: null, ema350: null, ema700: null };

    timeframes.forEach(tf => {
      const candles = klinesMap[tf];
      const prices = candles.map(c => c.close);
      const lastPrice = prices[prices.length - 1];
      const lastIdx = prices.length - 1;

      // Indicators
      const ema50 = this.calculateEMA(prices, 50);
      const ema350 = this.calculateEMA(prices, 350);
      const ema700 = this.calculateEMA(prices, 700);
      const rsi7 = this.calculateRSI(prices, 7);

      const lastE50 = ema50[lastIdx];
      const lastE350 = ema350[lastIdx];
      const lastE700 = ema700[lastIdx];
      
      const emaWeight = weights[tf].ema;
      const divWeight = weights[tf].div;

      if (tf === '15m') {
        emaValues15m.ema50 = lastE50;
        emaValues15m.ema350 = lastE350;
        emaValues15m.ema700 = lastE700;
      }

      // 1. Structure EMAs
      if (lastE50 !== null && lastE350 !== null && lastE700 !== null) {
        if (lastPrice > lastE50 && lastE50 > lastE350 && lastE350 > lastE700) {
          totalUp += emaWeight;
          details.push(`[${tf}] Estructura EMA 50 > 350 > 700 Alcista (+${emaWeight} pts)`);
        } else if (lastPrice < lastE50 && lastE50 < lastE350 && lastE350 < lastE700) {
          totalDown += emaWeight;
          details.push(`[${tf}] Estructura EMA 50 < 350 < 700 Bajista (+${emaWeight} pts)`);
        } else {
          // Complex or flat trend
          // Check price interaction with EMA 700
          const distTo700 = ((lastPrice - lastE700) / lastE700) * 100;
          const oversoldThreshold = tf === '4h' || tf === '1h' ? -3 : -1;
          const overboughtThreshold = tf === '4h' || tf === '1h' ? 3 : 1;

          if (distTo700 < oversoldThreshold) {
            totalUp += emaWeight * 0.8;
            details.push(`[${tf}] Sobreextendido abajo de EMA 700 (Rebote)`);
          } else if (distTo700 > overboughtThreshold) {
            totalDown += emaWeight * 0.8;
            details.push(`[${tf}] Sobreextendido arriba de EMA 700 (Corrección)`);
          } else if (lastPrice > lastE700) {
            totalUp += emaWeight * 0.4;
            details.push(`[${tf}] Soporte en EMA 700`);
          } else {
            totalDown += emaWeight * 0.4;
            details.push(`[${tf}] Resistencia en EMA 700`);
          }
        }
      }

      // 2. Divergences RSI 7
      const divs = this.detectDivergences(candles, rsi7);
      if (divs.bullishDivergence) {
        totalUp += divWeight;
        details.push(`[${tf}] Divergencia Alcista RSI 7 (+${divWeight} pts)`);
      }
      if (divs.bearishDivergence) {
        totalDown += divWeight;
        details.push(`[${tf}] Divergencia Bajista RSI 7 (+${divWeight} pts)`);
      }
    });

    let pUp = 50;
    let pDown = 50;
    const totalPoints = totalUp + totalDown;
    if (totalPoints > 0) {
      pUp = Math.round((totalUp / totalPoints) * 100);
      pDown = 100 - pUp;
    }

    let bias = 'NEUTRO';
    if (pUp >= 65) bias = 'COMPRA INSTITUCIONAL';
    else if (pUp >= 55) bias = 'SESGO COMPRADOR';
    else if (pDown >= 65) bias = 'VENTA INSTITUCIONAL';
    else if (pDown >= 55) bias = 'SESGO VENDEDOR';

    // Generate signal
    let hasSignal = false;
    let signal = null;
    const lastPrice15m = klinesMap['15m'][klinesMap['15m'].length - 1].close;

    if (pUp > 50 && emaValues15m.ema50 !== null && emaValues15m.ema350 !== null && emaValues15m.ema700 !== null) {
      hasSignal = true;
      const minEma = Math.min(emaValues15m.ema50, emaValues15m.ema350, emaValues15m.ema700);
      let sl = minEma * 0.998; // 0.2% below min EMA
      if (lastPrice15m - sl < lastPrice15m * 0.003) {
        sl = lastPrice15m * 0.997; // min 0.3%
      } else if (lastPrice15m - sl > lastPrice15m * 0.02) {
        sl = lastPrice15m * 0.98; // max 2.0%
      }
      const risk = lastPrice15m - sl;
      const tp = lastPrice15m + (3 * risk); // R:R 1:3
      const riskPercent = parseFloat(((risk / lastPrice15m) * 100).toFixed(2));
      const profitPercent = parseFloat((((tp - lastPrice15m) / lastPrice15m) * 100).toFixed(2));

      signal = {
        type: 'LONG',
        entry: lastPrice15m,
        sl,
        tp,
        riskPercent,
        profitPercent,
        reasons: [...details].filter(d => d.includes('[15m]') || d.includes('[1h]') || d.includes('[4h]'))
      };
    } else if (pDown > 50 && emaValues15m.ema50 !== null && emaValues15m.ema350 !== null && emaValues15m.ema700 !== null) {
      hasSignal = true;
      const maxEma = Math.max(emaValues15m.ema50, emaValues15m.ema350, emaValues15m.ema700);
      let sl = maxEma * 1.002; // 0.2% above max EMA
      if (sl - lastPrice15m < lastPrice15m * 0.003) {
        sl = lastPrice15m * 1.003; // min 0.3%
      } else if (sl - lastPrice15m > lastPrice15m * 0.02) {
        sl = lastPrice15m * 1.02; // max 2.0%
      }
      const risk = sl - lastPrice15m;
      const tp = lastPrice15m - (3 * risk); // R:R 1:3
      const riskPercent = parseFloat(((risk / lastPrice15m) * 100).toFixed(2));
      const profitPercent = parseFloat((((lastPrice15m - tp) / lastPrice15m) * 100).toFixed(2));

      signal = {
        type: 'SHORT',
        entry: lastPrice15m,
        sl,
        tp,
        riskPercent,
        profitPercent,
        reasons: [...details].filter(d => d.includes('[15m]') || d.includes('[1h]') || d.includes('[4h]'))
      };
    }

    return {
      success: true,
      pUp,
      pDown,
      bias,
      details,
      hasSignal,
      signal
    };
  }

  /**
   * Run Strategy 3: Algoritmo de Alta Probabilidad (Señales de Trading)
   * Analyzes liquidity sweeps on 15m, trend on 1h (EMA 350), and RSI 7 divergences
   */
  runStrategy3(klinesMap, liqStats5m = { longLiqs: 0, shortLiqs: 0 }) {
    const k1h = klinesMap['1h'];
    const k15m = klinesMap['15m'];

    if (!k1h || k1h.length < 360 || !k15m || k15m.length < 50) {
      return { success: false, error: 'Datos insuficientes para la Estrategia 3' };
    }

    // 1. Trend Filter on 1h (EMA 350)
    const close1h = k1h.map(c => c.close);
    const ema350_1h = this.calculateEMA(close1h, 350);
    const lastPrice1h = close1h[close1h.length - 1];
    const lastEma350_1h = ema350_1h[ema350_1h.length - 1];

    if (lastEma350_1h === null) {
      return { success: false, error: 'Calculando EMA 350...' };
    }

    const isBullishMacro = lastPrice1h > lastEma350_1h;
    const macroBias = isBullishMacro ? 'ALCISTA' : 'BAJISTA';

    // 2. Liquidity Sweep Scan on 15m
    const closes15m = k15m.map(c => c.close);
    const highs15m = k15m.map(c => c.high);
    const lows15m = k15m.map(c => c.low);
    const volumes15m = k15m.map(c => c.volume);
    
    const rsi7 = this.calculateRSI(closes15m, 7);

    // Scan the latest completed 15m candle (index len - 2)
    const i = k15m.length - 2;
    const currentPrice = closes15m[closes15m.length - 1]; // Live price for Entry

    // Scan prior window (i - 40 to i - 1)
    const priorStartIndex = i - 40;
    const priorEndIndex = i - 1;
    
    let lowestLowPrior = Infinity;
    let idxLowPrior = -1;
    let highestHighPrior = -Infinity;
    let idxHighPrior = -1;

    for (let k = priorStartIndex; k <= priorEndIndex; k++) {
      if (lows15m[k] < lowestLowPrior) {
        lowestLowPrior = lows15m[k];
        idxLowPrior = k;
      }
      if (highs15m[k] > highestHighPrior) {
        highestHighPrior = highs15m[k];
        idxHighPrior = k;
      }
    }

    // Detect sweeps on candle i (latest completed candle)
    const isBullishSweep = lows15m[i] < lowestLowPrior && closes15m[i] > lowestLowPrior;
    const isBearishSweep = highs15m[i] > highestHighPrior && closes15m[i] < highestHighPrior;

    // 3. Divergence in RSI 7
    let isBullishDiv = false;
    let isBearishDiv = false;

    if (isBullishSweep && idxLowPrior !== -1 && rsi7[i] !== null && rsi7[idxLowPrior] !== null) {
      if (rsi7[i] > rsi7[idxLowPrior]) {
        isBullishDiv = true;
      }
    }

    if (isBearishSweep && idxHighPrior !== -1 && rsi7[i] !== null && rsi7[idxHighPrior] !== null) {
      if (rsi7[i] < rsi7[idxHighPrior]) {
        isBearishDiv = true;
      }
    }

    // 4. Volume Confirmation (> 1.3x avg of previous 10 candles)
    let isVolConfirm = false;
    const volStartIdx = i - 11;
    const volEndIdx = i - 2;
    let volSum = 0;
    for (let k = volStartIdx; k <= volEndIdx; k++) {
      volSum += volumes15m[k];
    }
    const avgVol = volSum / 10;
    if (volumes15m[i] > avgVol * 1.3) {
      isVolConfirm = true;
    }

    // Evaluate Signals matching Macro Trend
    let activeSignal = null;
    const reasons = [];

    if (isBullishMacro && isBullishSweep) {
      let stars = 1;
      reasons.push('Filtro Macro Alcista Confirmado (Precio > EMA 350 en 1h)');
      reasons.push(`Barrida de Mínimo Local de 40 velas en 15m ($${lowestLowPrior.toFixed(2)})`);
      
      if (isBullishDiv) {
        stars++;
        reasons.push(`Divergencia Alcista en RSI 7 (RSI actual ${rsi7[i].toFixed(1)} > RSI anterior ${rsi7[idxLowPrior].toFixed(1)})`);
      }
      if (isVolConfirm) {
        stars++;
        const ratio = (volumes15m[i] / avgVol).toFixed(2);
        reasons.push(`Volumen institucional superior (${ratio}x promedio)`);
      }

      // Calculate levels
      const entry = currentPrice;
      const sl = lows15m[i] * 0.998; // 0.2% below sweep low
      const risk = entry - sl;
      const tp = entry + (3 * risk); // Risk-Reward 1:3
      
      const riskPercent = parseFloat(((risk / entry) * 100).toFixed(2));
      const profitPercent = parseFloat((((tp - entry) / entry) * 100).toFixed(2));
      
      let prob = 60;
      if (stars === 2) prob = 73;
      if (stars === 3) prob = 85;

      if (liqStats5m.longLiqs >= 30000) {
        stars = 3;
        prob = 85;
        reasons.push(`Pánico Minorista: $${liqStats5m.longLiqs.toLocaleString()} liquidados en LONGs (5m)`);
      }

      activeSignal = {
        type: 'LONG',
        stars,
        probability: prob,
        entry,
        sl,
        tp,
        riskPercent,
        profitPercent,
        reasons
      };
    } else if (!isBullishMacro && isBearishSweep) {
      let stars = 1;
      reasons.push('Filtro Macro Bajista Confirmado (Precio < EMA 350 en 1h)');
      reasons.push(`Barrida de Máximo Local de 40 velas en 15m ($${highestHighPrior.toFixed(2)})`);

      if (isBearishDiv) {
        stars++;
        reasons.push(`Divergencia Bajista en RSI 7 (RSI actual ${rsi7[i].toFixed(1)} < RSI anterior ${rsi7[idxHighPrior].toFixed(1)})`);
      }
      if (isVolConfirm) {
        stars++;
        const ratio = (volumes15m[i] / avgVol).toFixed(2);
        reasons.push(`Volumen institucional superior (${ratio}x promedio)`);
      }

      // Calculate levels
      const entry = currentPrice;
      const sl = highs15m[i] * 1.002; // 0.2% above sweep high
      const risk = sl - entry;
      const tp = entry - (3 * risk); // Risk-Reward 1:3

      const riskPercent = parseFloat(((risk / entry) * 100).toFixed(2));
      const profitPercent = parseFloat((((entry - tp) / entry) * 100).toFixed(2));

      let prob = 60;
      if (stars === 2) prob = 73;
      if (stars === 3) prob = 85;

      if (liqStats5m.shortLiqs >= 30000) {
        stars = 3;
        prob = 85;
        reasons.push(`Pánico Minorista: $${liqStats5m.shortLiqs.toLocaleString()} liquidados en SHORTs (5m)`);
      }

      activeSignal = {
        type: 'SHORT',
        stars,
        probability: prob,
        entry,
        sl,
        tp,
        riskPercent,
        profitPercent,
        reasons
      };
    }

    return {
      success: true,
      macroBias,
      hasSignal: activeSignal !== null,
      signal: activeSignal
    };
  }
  calculateSMA(prices, period) {
    if (prices.length < period) return new Array(prices.length).fill(null);
    const sma = new Array(prices.length).fill(null);
    for (let i = period - 1; i < prices.length; i++) {
      const window = prices.slice(i - period + 1, i + 1);
      const sum = window.reduce((a, b) => a + b, 0);
      sma[i] = sum / period;
    }
    return sma;
  }

  runStrategy4(weeklyCandles, dailyCandles) {
    if (!weeklyCandles || weeklyCandles.length < 25 || !dailyCandles || dailyCandles.length < 25) {
      return { success: false, error: 'Datos semanales o diarios insuficientes para la Estrategia 4' };
    }

    const weeklyCloses = weeklyCandles.map(c => c.close);
    const dailyCloses = dailyCandles.map(c => c.close);
    const lastPrice = dailyCloses[dailyCloses.length - 1];

    // 1. Weekly Support Band (EMA 20 + SMA 21)
    const wEma20 = this.calculateEMA(weeklyCloses, 20);
    const wSma21 = this.calculateSMA(weeklyCloses, 21);

    const lastEma20 = wEma20[wEma20.length - 1];
    const lastSma21 = wSma21[wSma21.length - 1];
    const bandAvg = (lastEma20 + lastSma21) / 2;
    const isBullishMacro = lastPrice > bandAvg;

    // 2. Daily Bollinger Squeeze
    const bb = this.calculateBollingerBands(dailyCloses, 20, 2);
    const lastUpper = bb.upper[bb.upper.length - 1];
    const lastLower = bb.lower[bb.lower.length - 1];
    const lastMiddle = bb.middle[bb.middle.length - 1];
    
    // Width = (Upper - Lower) / Middle
    const bbw = (lastUpper - lastLower) / lastMiddle;
    const isSqueeze = bbw < 0.05; // Volatility Squeeze if width < 5%

    // 3. Probability & Scoring based on alignment
    let pUp = 50;
    let pDown = 50;
    if (isBullishMacro) {
      pUp = isSqueeze ? 65 : 55;
      pDown = 100 - pUp;
    } else {
      pDown = isSqueeze ? 65 : 55;
      pUp = 100 - pDown;
    }

    // 4. Signal trigger (above average > 50%, matching Strategy 1 & 2 logic)
    let hasSignal = false;
    let signal = null;
    const reasons = [];

    reasons.push(isBullishMacro 
      ? 'Filtro Macro Alcista: Precio sobre Banda de Soporte Semanal (EMA 20/SMA 21)' 
      : 'Filtro Macro Bajista: Precio debajo de Banda de Soporte Semanal (EMA 20/SMA 21)'
    );

    if (isSqueeze) {
      reasons.push(`Compresión de Volatilidad Extrema activa (Ancho de bandas: ${(bbw * 100).toFixed(2)}%)`);
    } else {
      reasons.push(`Volatilidad normal (Ancho de bandas: ${(bbw * 100).toFixed(2)}%)`);
    }

    if (pUp > 50) {
      hasSignal = true;
      let sl = bandAvg;
      // Clamp stop loss between 1% and 3.5% for daily swing limits
      if (lastPrice - sl < lastPrice * 0.01 || lastPrice - sl > lastPrice * 0.035) {
        sl = lastPrice * 0.98; // 2% standard swing stop loss
      }
      const risk = lastPrice - sl;
      const tp = lastPrice + (2 * risk); // R:R 1:2
      const riskPercent = parseFloat(((risk / lastPrice) * 100).toFixed(2));
      const profitPercent = parseFloat((((tp - lastPrice) / lastPrice) * 100).toFixed(2));

      signal = {
        type: 'LONG',
        entry: lastPrice,
        sl,
        tp,
        riskPercent,
        profitPercent,
        reasons: [...reasons, 'Ruptura / Continuidad de Tendencia Macro Alcista']
      };
    } else if (pDown > 50) {
      hasSignal = true;
      let sl = bandAvg;
      // Clamp stop loss between 1% and 3.5% for daily swing limits
      if (sl - lastPrice < lastPrice * 0.01 || sl - lastPrice > lastPrice * 0.035) {
        sl = lastPrice * 1.02; // 2% standard swing stop loss
      }
      const risk = sl - lastPrice;
      const tp = lastPrice - (2 * risk); // R:R 1:2
      const riskPercent = parseFloat(((risk / lastPrice) * 100).toFixed(2));
      const profitPercent = parseFloat((((lastPrice - tp) / lastPrice) * 100).toFixed(2));

      signal = {
        type: 'SHORT',
        entry: lastPrice,
        sl,
        tp,
        riskPercent,
        profitPercent,
        reasons: [...reasons, 'Ruptura / Continuidad de Tendencia Macro Bajista']
      };
    }

    return {
      success: true,
      pUp,
      pDown,
      bias: isBullishMacro ? (isSqueeze ? 'COMPRESIÓN ALCISTA' : 'ALCISTA MACRO') : (isSqueeze ? 'COMPRESIÓN BAJISTA' : 'BAJISTA MACRO'),
      isSqueeze,
      bbw,
      weeklyBand: bandAvg,
      hasSignal,
      signal,
      reasons
    };
  }

  calculateVWAPAndBands(candles, period = 24, stdDevDeviations = 2.5) {
    if (candles.length < period) {
      return { 
        vwap: new Array(candles.length).fill(null), 
        upper: new Array(candles.length).fill(null), 
        lower: new Array(candles.length).fill(null) 
      };
    }
    const vwap = new Array(candles.length).fill(null);
    const upper = new Array(candles.length).fill(null);
    const lower = new Array(candles.length).fill(null);

    for (let i = period - 1; i < candles.length; i++) {
      const window = candles.slice(i - period + 1, i + 1);
      let sumTypicalPriceVolume = 0;
      let sumVolume = 0;
      for (let j = 0; j < window.length; j++) {
        const tp = (parseFloat(window[j].high) + parseFloat(window[j].low) + parseFloat(window[j].close)) / 3;
        const vol = parseFloat(window[j].volume);
        sumTypicalPriceVolume += tp * vol;
        sumVolume += vol;
      }
      const currentVwap = sumVolume > 0 ? sumTypicalPriceVolume / sumVolume : parseFloat(window[window.length - 1].close);
      vwap[i] = currentVwap;

      let sumSqDiff = 0;
      for (let j = 0; j < window.length; j++) {
        const close = parseFloat(window[j].close);
        sumSqDiff += Math.pow(close - currentVwap, 2);
      }
      const variance = sumSqDiff / window.length;
      const stdDev = Math.sqrt(variance);

      upper[i] = currentVwap + (stdDevDeviations * stdDev);
      lower[i] = currentVwap - (stdDevDeviations * stdDev);
    }
    return { vwap, upper, lower };
  }

  calculateStochRSI(rsiValues, period = 14, smoothK = 3, smoothD = 3) {
    if (rsiValues.length < period + smoothK + smoothD) {
      return { k: new Array(rsiValues.length).fill(null), d: new Array(rsiValues.length).fill(null) };
    }
    const stochRsi = new Array(rsiValues.length).fill(null);
    for (let i = period - 1; i < rsiValues.length; i++) {
      const window = rsiValues.slice(i - period + 1, i + 1);
      const validWindow = window.filter(x => x !== null);
      if (validWindow.length < period) continue;
      const minRsi = Math.min(...validWindow);
      const maxRsi = Math.max(...validWindow);
      const diff = maxRsi - minRsi;
      const lastRsi = rsiValues[i];
      stochRsi[i] = diff > 0 ? (lastRsi - minRsi) / diff : 0.5;
    }

    const k = new Array(rsiValues.length).fill(null);
    for (let i = period - 1 + smoothK - 1; i < rsiValues.length; i++) {
      const window = stochRsi.slice(i - smoothK + 1, i + 1);
      const valid = window.filter(x => x !== null);
      if (valid.length === smoothK) {
        k[i] = (valid.reduce((a, b) => a + b, 0) / smoothK) * 100;
      }
    }

    const d = new Array(rsiValues.length).fill(null);
    for (let i = period - 1 + smoothK - 1 + smoothD - 1; i < rsiValues.length; i++) {
      const window = k.slice(i - smoothD + 1, i + 1);
      const valid = window.filter(x => x !== null);
      if (valid.length === smoothD) {
        d[i] = valid.reduce((a, b) => a + b, 0) / smoothD;
      }
    }
    return { k, d };
  }

  detectSwingPoints(candles) {
    const swingHighs = [];
    const swingLows = [];
    
    // Using a window of 5 candles (2 left, 1 center, 2 right)
    for (let i = 2; i < candles.length - 2; i++) {
      const prev2 = candles[i-2];
      const prev1 = candles[i-1];
      const curr = candles[i];
      const next1 = candles[i+1];
      const next2 = candles[i+2];

      if (curr.high > prev2.high && curr.high > prev1.high && curr.high > next1.high && curr.high > next2.high) {
        swingHighs.push({ index: i, price: curr.high });
      }
      if (curr.low < prev2.low && curr.low < prev1.low && curr.low < next1.low && curr.low < next2.low) {
        swingLows.push({ index: i, price: curr.low });
      }
    }
    return { swingHighs, swingLows };
  }

  calculateCMF(candles, period = 20) {
    if (candles.length < period) return new Array(candles.length).fill(null);
    const cmf = new Array(candles.length).fill(null);
    for (let i = period - 1; i < candles.length; i++) {
      const window = candles.slice(i - period + 1, i + 1);
      let sumMFV = 0;
      let sumVol = 0;
      for (let j = 0; j < window.length; j++) {
        const c = window[j];
        const high = parseFloat(c.high);
        const low = parseFloat(c.low);
        const close = parseFloat(c.close);
        const vol = parseFloat(c.volume);
        const range = high - low;
        const multiplier = range > 0 ? ((close - low) - (high - close)) / range : 0;
        sumMFV += multiplier * vol;
        sumVol += vol;
      }
      cmf[i] = sumVol > 0 ? sumMFV / sumVol : 0;
    }
    return cmf;
  }

  calculateADX(candles, period = 14) {
    if (candles.length < period * 2) {
      return { 
        adx: new Array(candles.length).fill(null), 
        plusDI: new Array(candles.length).fill(null), 
        minusDI: new Array(candles.length).fill(null) 
      };
    }
    const tr = new Array(candles.length).fill(0);
    const plusDM = new Array(candles.length).fill(0);
    const minusDM = new Array(candles.length).fill(0);

    for (let i = 1; i < candles.length; i++) {
      const h = parseFloat(candles[i].high);
      const l = parseFloat(candles[i].low);
      const cPrev = parseFloat(candles[i-1].close);
      const hPrev = parseFloat(candles[i-1].high);
      const lPrev = parseFloat(candles[i-1].low);

      tr[i] = Math.max(h - l, Math.abs(h - cPrev), Math.abs(l - cPrev));
      
      const diffH = h - hPrev;
      const diffL = lPrev - l;

      plusDM[i] = (diffH > diffL && diffH > 0) ? diffH : 0;
      minusDM[i] = (diffL > diffH && diffL > 0) ? diffL : 0;
    }

    const smoothedTR = new Array(candles.length).fill(0);
    const smoothedPlusDM = new Array(candles.length).fill(0);
    const smoothedMinusDM = new Array(candles.length).fill(0);

    let sumTR = 0;
    let sumPlusDM = 0;
    let sumMinusDM = 0;
    for (let i = 1; i <= period; i++) {
      sumTR += tr[i];
      sumPlusDM += plusDM[i];
      sumMinusDM += minusDM[i];
    }
    smoothedTR[period] = sumTR;
    smoothedPlusDM[period] = sumPlusDM;
    smoothedMinusDM[period] = sumMinusDM;

    for (let i = period + 1; i < candles.length; i++) {
      smoothedTR[i] = smoothedTR[i-1] - (smoothedTR[i-1] / period) + tr[i];
      smoothedPlusDM[i] = smoothedPlusDM[i-1] - (smoothedPlusDM[i-1] / period) + plusDM[i];
      smoothedMinusDM[i] = smoothedMinusDM[i-1] - (smoothedMinusDM[i-1] / period) + minusDM[i];
    }

    const plusDI = new Array(candles.length).fill(null);
    const minusDI = new Array(candles.length).fill(null);
    const dx = new Array(candles.length).fill(null);

    for (let i = period; i < candles.length; i++) {
      const trVal = smoothedTR[i];
      plusDI[i] = trVal > 0 ? (smoothedPlusDM[i] / trVal) * 100 : 0;
      minusDI[i] = trVal > 0 ? (smoothedMinusDM[i] / trVal) * 100 : 0;

      const sumDI = plusDI[i] + minusDI[i];
      const diffDI = Math.abs(plusDI[i] - minusDI[i]);
      dx[i] = sumDI > 0 ? (diffDI / sumDI) * 100 : 0;
    }

    const adx = new Array(candles.length).fill(null);
    let sumDX = 0;
    for (let i = period; i < period * 2; i++) {
      sumDX += dx[i];
    }
    adx[period * 2 - 1] = sumDX / period;

    for (let i = period * 2; i < candles.length; i++) {
      adx[i] = ((adx[i-1] * (period - 1)) + dx[i]) / period;
    }

    return { adx, plusDI, minusDI };
  }

  runStrategy5(candles1h) {
    if (!candles1h || candles1h.length < 50) {
      return { success: false, error: 'Datos insuficientes para la Estrategia 5' };
    }
    const prices = candles1h.map(c => c.close);
    const lastPrice = prices[prices.length - 1];

    // 1. VWAP and Bands
    const vwapData = this.calculateVWAPAndBands(candles1h, 24, 2.5);
    const lastVwap = vwapData.vwap[prices.length - 1];
    const lastUpper = vwapData.upper[prices.length - 1];
    const lastLower = vwapData.lower[prices.length - 1];

    // 2. RSI and StochRSI
    const rsi14 = this.calculateRSI(prices, 14);
    const lastRsi = rsi14[prices.length - 1];
    const stochRsi = this.calculateStochRSI(rsi14, 14, 3, 3);
    const lastK = stochRsi.k[prices.length - 1];
    const lastD = stochRsi.d[prices.length - 1];

    let hasSignal = false;
    let signal = null;
    const reasons = [];
    let pUp = 50;
    let pDown = 50;

    reasons.push(`Precio: $${lastPrice.toLocaleString()} (VWAP: $${Math.round(lastVwap).toLocaleString()})`);
    if (lastRsi !== null) {
      reasons.push(`RSI 14: ${lastRsi.toFixed(1)}`);
    }
    if (lastK !== null && lastD !== null) {
      reasons.push(`StochRSI K/D: ${lastK.toFixed(1)} / ${lastD.toFixed(1)}`);
    }

    // Signals conditions
    const isOverBought = lastPrice >= lastUpper && lastRsi > 70 && lastK > 80;
    const isOverSold = lastPrice <= lastLower && lastRsi < 30 && lastK < 20;

    if (isOverSold) {
      pUp = 75;
      pDown = 25;
      hasSignal = true;
      const sl = lastPrice * 0.98; // 2% Stop Loss below deviation
      const tp = lastVwap; // Target VWAP line
      const riskPercent = 2;
      const profitPercent = parseFloat((((tp - lastPrice) / lastPrice) * 100).toFixed(2));

      signal = {
        type: 'LONG',
        entry: lastPrice,
        sl,
        tp,
        riskPercent,
        profitPercent,
        reasons: [...reasons, 'Desviación Extrema VWAP (Banda Inferior 2.5) + Agotamiento en StochRSI']
      };
    } else if (isOverBought) {
      pUp = 25;
      pDown = 75;
      hasSignal = true;
      const sl = lastPrice * 1.02; // 2% Stop Loss
      const tp = lastVwap; // Target VWAP line
      const riskPercent = 2;
      const profitPercent = parseFloat((((lastPrice - tp) / lastPrice) * 100).toFixed(2));

      signal = {
        type: 'SHORT',
        entry: lastPrice,
        sl,
        tp,
        riskPercent,
        profitPercent,
        reasons: [...reasons, 'Desviación Extrema VWAP (Banda Superior 2.5) + Agotamiento en StochRSI']
      };
    } else {
      // Passive scoring
      const distToUpper = lastUpper - lastPrice;
      const distToLower = lastPrice - lastLower;
      const totalWidth = lastUpper - lastLower;
      if (totalWidth > 0) {
        pUp = Math.round((distToUpper / totalWidth) * 100);
        pDown = 100 - pUp;
      }
    }

    return {
      success: true,
      pUp,
      pDown,
      bias: pUp > 50 ? 'REVERSIÓN COMPRADORA' : 'REVERSIÓN VENDEDORA',
      hasSignal,
      signal,
      reasons,
      vwap: lastVwap,
      upper: lastUpper,
      lower: lastLower
    };
  }

  runStrategy6(candles15m) {
    if (!candles15m || candles15m.length < 50) {
      return { success: false, error: 'Datos insuficientes para la Estrategia 6' };
    }
    const prices = candles15m.map(c => c.close);
    const lastPrice = prices[prices.length - 1];

    // 1. EMA 200 Filter
    const ema200 = this.calculateEMA(prices, 200);
    const lastEma200 = ema200[prices.length - 1];
    const isAboveEma = lastEma200 !== null ? lastPrice > lastEma200 : true;

    // 2. Swing Points (Highs and Lows)
    const { swingHighs, swingLows } = this.detectSwingPoints(candles15m);

    // 3. FVG Imbalance (Look for a recent FVG in the last 15 candles)
    let fvgLong = null;
    let fvgShort = null;

    for (let i = candles15m.length - 15; i < candles15m.length - 1; i++) {
      if (i < 2) continue;
      const cPrev2 = candles15m[i-2];
      const cCurr = candles15m[i];

      // FVG LONG: Low of current candle is higher than High of candle 2 steps back
      if (parseFloat(cCurr.low) > parseFloat(cPrev2.high)) {
        fvgLong = {
          high: parseFloat(cCurr.low),
          low: parseFloat(cPrev2.high),
          midpoint: (parseFloat(cCurr.low) + parseFloat(cPrev2.high)) / 2
        };
      }
      // FVG SHORT: High of current is lower than Low of candle 2 steps back
      if (parseFloat(cCurr.high) < parseFloat(cPrev2.low)) {
        fvgShort = {
          high: parseFloat(cPrev2.low),
          low: parseFloat(cCurr.high),
          midpoint: (parseFloat(cPrev2.low) + parseFloat(cCurr.high)) / 2
        };
      }
    }

    // 4. Market Structure Break (MSB)
    const lastSwingHigh = swingHighs.length > 0 ? swingHighs[swingHighs.length - 1].price : null;
    const lastSwingLow = swingLows.length > 0 ? swingLows[swingLows.length - 1].price : null;

    let hasSignal = false;
    let signal = null;
    const reasons = [];

    reasons.push(isAboveEma 
      ? 'Filtro Tendencia EMA 200: Alcista (Operar solo LONGs)' 
      : 'Filtro Tendencia EMA 200: Bajista (Operar solo SHORTs)'
    );

    if (lastSwingHigh) reasons.push(`Último Máximo Estructural (Swing High): $${lastSwingHigh.toLocaleString()}`);
    if (lastSwingLow) reasons.push(`Último Mínimo Estructural (Swing Low): $${lastSwingLow.toLocaleString()}`);

    const isBullishMSB = lastSwingHigh && lastPrice > lastSwingHigh;
    const isBearishMSB = lastSwingLow && lastPrice < lastSwingLow;

    if (isBullishMSB && isAboveEma && fvgLong) {
      hasSignal = true;
      const entry = fvgLong.midpoint;
      const sl = lastSwingLow ? lastSwingLow : entry * 0.985;
      const risk = entry - sl;
      const tp = entry + (2 * risk); // R:R 1:2
      const riskPercent = parseFloat(((risk / entry) * 100).toFixed(2));
      const profitPercent = parseFloat((((tp - entry) / entry) * 100).toFixed(2));

      signal = {
        type: 'LONG',
        entry,
        sl,
        tp,
        riskPercent,
        profitPercent,
        reasons: [...reasons, `Quiebre Estructural Alcista (MSB) + Entrada límite en FVG al 50% ($${Math.round(entry).toLocaleString()})`]
      };
    } else if (isBearishMSB && !isAboveEma && fvgShort) {
      hasSignal = true;
      const entry = fvgShort.midpoint;
      const sl = lastSwingHigh ? lastSwingHigh : entry * 1.015;
      const risk = sl - entry;
      const tp = entry - (2 * risk); // R:R 1:2
      const riskPercent = parseFloat(((risk / entry) * 100).toFixed(2));
      const profitPercent = parseFloat((((entry - tp) / entry) * 100).toFixed(2));

      signal = {
        type: 'SHORT',
        entry,
        sl,
        tp,
        riskPercent,
        profitPercent,
        reasons: [...reasons, `Quiebre Estructural Bajista (MSB) + Entrada límite en FVG al 50% ($${Math.round(entry).toLocaleString()})`]
      };
    }

    return {
      success: true,
      pUp: isAboveEma ? 65 : 35,
      pDown: isAboveEma ? 35 : 65,
      bias: isAboveEma ? 'ESTRUCTURA ALCISTA' : 'ESTRUCTURA BAJISTA',
      hasSignal,
      signal,
      reasons
    };
  }

  runStrategy7(candles1d) {
    if (!candles1d || candles1d.length < 50) {
      return { success: false, error: 'Datos insuficientes para la Estrategia 7' };
    }
    const prices = candles1d.map(c => c.close);
    const lastPrice = prices[prices.length - 1];

    // 1. ADX for Trend Strength
    const adxData = this.calculateADX(candles1d, 14);
    const lastAdx = adxData.adx[prices.length - 1];
    const lastPlusDI = adxData.plusDI[prices.length - 1];
    const lastMinusDI = adxData.minusDI[prices.length - 1];

    // 2. Chaikin Money Flow (CMF) for Institutional Money
    const cmf = this.calculateCMF(candles1d, 20);
    const lastCmf = cmf[prices.length - 1];

    // 3. RSI 14 to avoid overextension
    const rsi14 = this.calculateRSI(prices, 14);
    const lastRsi = rsi14[prices.length - 1];

    let hasSignal = false;
    let signal = null;
    const reasons = [];

    if (lastAdx !== null) reasons.push(`Fuerza de Tendencia ADX: ${lastAdx.toFixed(1)} ${lastAdx > 25 ? '(Tendencia Fuerte)' : '(Rango)'}`);
    if (lastCmf !== null) reasons.push(`Flujo Monetario Chaikin (CMF): ${lastCmf.toFixed(2)} ${lastCmf > 0.15 ? '(Acumulación)' : lastCmf < -0.15 ? '(Distribución)' : '(Neutro)'}`);
    if (lastRsi !== null) reasons.push(`RSI 14 Diario: ${lastRsi.toFixed(1)}`);

    const isStrongTrend = lastAdx !== null && lastAdx > 25;
    const isAccumulating = lastCmf !== null && lastCmf > 0.15;
    const isDistributing = lastCmf !== null && lastCmf < -0.15;
    
    // Rules:
    // LONG: Strong trend, DI+ > DI-, accumulating, and RSI is not overbought yet (< 68)
    const longTrigger = isStrongTrend && lastPlusDI > lastMinusDI && isAccumulating && lastRsi !== null && lastRsi < 68;
    // SHORT: Strong trend, DI- > DI+, distributing, and RSI is not oversold yet (> 32)
    const shortTrigger = isStrongTrend && lastMinusDI > lastPlusDI && isDistributing && lastRsi !== null && lastRsi > 32;

    if (longTrigger) {
      hasSignal = true;
      const sl = lastPrice * 0.965; // 3.5% Swing Stop Loss
      const tp = lastPrice * 1.07; // 7% Take Profit (R:R 1:2)
      const riskPercent = 3.5;
      const profitPercent = 7;

      signal = {
        type: 'LONG',
        entry: lastPrice,
        sl,
        tp,
        riskPercent,
        profitPercent,
        reasons: [...reasons, 'Ruptura Alcista por Flujo Monetario (ADX + CMF) con RSI saludable']
      };
    } else if (shortTrigger) {
      hasSignal = true;
      const sl = lastPrice * 1.035; // 3.5% Swing Stop Loss
      const tp = lastPrice * 0.93; // 7% Take Profit (R:R 1:2)
      const riskPercent = 3.5;
      const profitPercent = 7;

      signal = {
        type: 'SHORT',
        entry: lastPrice,
        sl,
        tp,
        riskPercent,
        profitPercent,
        reasons: [...reasons, 'Ruptura Bajista por Flujo Monetario (ADX + CMF) con RSI saludable']
      };
    }

    let pUp = 50;
    let pDown = 50;
    if (lastPlusDI !== null && lastMinusDI !== null) {
      const sumDI = lastPlusDI + lastMinusDI;
      if (sumDI > 0) {
        pUp = Math.round((lastPlusDI / sumDI) * 100);
        pDown = 100 - pUp;
      }
    }

    return {
      success: true,
      pUp,
      pDown,
      bias: pUp > 50 ? 'MOMENTUM ALCISTA' : 'MOMENTUM BAJISTA',
      hasSignal,
      signal,
      reasons
    };
  }
}

const technicalAnalysisService = new TechnicalAnalysisService();
export default technicalAnalysisService;
