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
}

const technicalAnalysisService = new TechnicalAnalysisService();
export default technicalAnalysisService;
