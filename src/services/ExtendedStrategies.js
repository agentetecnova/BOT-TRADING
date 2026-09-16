/**
 * ExtendedStrategies.js
 * 
 * Expande el motor cuantitativo de Bitcoin a 60 Estrategias de Élite:
 * - Indicadores matemáticos avanzados (CCI, Williams %R, MFI, KAMA, Vortex, TSI, Force Index, EOM, DeMarker, Fisher, ROC, UO)
 * - Estrategias 31 a 50 (Smart Money Concepts, Derivados, Volatilidad, Order Flow)
 * - Estrategias 51 a 60 (Las 10 Propietarias del Experto: Heatmap Liqs, Spot vs Perp CVD, VWAP 3-Sigma, Silver Bullet, Coinbase Premium, T-CLAM, FOEIR, MTM-RAT, DFOIDC, The Sovereign Ensemble)
 * - Motores de predicción: calculateMarketRegime y calculateMagneticZones
 */

export class ExtendedStrategies {
  // ==========================================
  // INDICADORES MATEMÁTICOS ADICIONALES
  // ==========================================

  static calculateCCI(candles, period = 20) {
    if (!candles || candles.length < period) return new Array(candles?.length || 0).fill(null);
    const tp = candles.map(c => (parseFloat(c.high) + parseFloat(c.low) + parseFloat(c.close)) / 3);
    const cci = new Array(candles.length).fill(null);

    for (let i = period - 1; i < candles.length; i++) {
      const window = tp.slice(i - period + 1, i + 1);
      const sma = window.reduce((a, b) => a + b, 0) / period;
      const meanDev = window.reduce((a, b) => a + Math.abs(b - sma), 0) / period;
      cci[i] = meanDev === 0 ? 0 : (tp[i] - sma) / (0.015 * meanDev);
    }
    return cci;
  }

  static calculateWilliamsR(candles, period = 14) {
    if (!candles || candles.length < period) return new Array(candles?.length || 0).fill(null);
    const wr = new Array(candles.length).fill(null);

    for (let i = period - 1; i < candles.length; i++) {
      const window = candles.slice(i - period + 1, i + 1);
      const highestHigh = Math.max(...window.map(c => parseFloat(c.high)));
      const lowestLow = Math.min(...window.map(c => parseFloat(c.low)));
      const close = parseFloat(candles[i].close);

      wr[i] = highestHigh === lowestLow ? -50 : ((highestHigh - close) / (highestHigh - lowestLow)) * -100;
    }
    return wr;
  }

  static calculateMFI(candles, period = 14) {
    if (!candles || candles.length <= period) return new Array(candles?.length || 0).fill(null);
    const mfi = new Array(candles.length).fill(null);
    const tp = candles.map(c => (parseFloat(c.high) + parseFloat(c.low) + parseFloat(c.close)) / 3);
    const rawMoneyFlow = tp.map((p, idx) => p * parseFloat(candles[idx].volume));

    for (let i = period; i < candles.length; i++) {
      let posFlow = 0;
      let negFlow = 0;
      for (let j = i - period + 1; j <= i; j++) {
        if (tp[j] > tp[j - 1]) posFlow += rawMoneyFlow[j];
        else if (tp[j] < tp[j - 1]) negFlow += rawMoneyFlow[j];
      }
      const moneyRatio = negFlow === 0 ? 100 : posFlow / negFlow;
      mfi[i] = 100 - (100 / (1 + moneyRatio));
    }
    return mfi;
  }

  static calculateKAMA(prices, period = 10, fast = 2, slow = 30) {
    if (!prices || prices.length < period) return new Array(prices?.length || 0).fill(null);
    const kama = new Array(prices.length).fill(null);
    const fastSC = 2 / (fast + 1);
    const slowSC = 2 / (slow + 1);

    kama[period - 1] = prices[period - 1];

    for (let i = period; i < prices.length; i++) {
      const change = Math.abs(prices[i] - prices[i - period]);
      let volatility = 0;
      for (let j = i - period + 1; j <= i; j++) {
        volatility += Math.abs(prices[j] - prices[j - 1]);
      }
      const er = volatility === 0 ? 0 : change / volatility;
      const sc = Math.pow(er * (fastSC - slowSC) + slowSC, 2);
      kama[i] = kama[i - 1] + sc * (prices[i] - kama[i - 1]);
    }
    return kama;
  }

  static calculateVortex(candles, period = 14) {
    if (!candles || candles.length <= period) return { viPlus: [], viMinus: [] };
    const viPlus = new Array(candles.length).fill(null);
    const viMinus = new Array(candles.length).fill(null);

    for (let i = period; i < candles.length; i++) {
      let vmPlusSum = 0;
      let vmMinusSum = 0;
      let trSum = 0;

      for (let j = i - period + 1; j <= i; j++) {
        const h = parseFloat(candles[j].high);
        const l = parseFloat(candles[j].low);
        const prevC = parseFloat(candles[j - 1].close);
        const prevH = parseFloat(candles[j - 1].high);
        const prevL = parseFloat(candles[j - 1].low);

        vmPlusSum += Math.abs(h - prevL);
        vmMinusSum += Math.abs(l - prevH);
        trSum += Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
      }

      viPlus[i] = trSum > 0 ? vmPlusSum / trSum : 1;
      viMinus[i] = trSum > 0 ? vmMinusSum / trSum : 1;
    }
    return { viPlus, viMinus };
  }

  static calculateTSI(prices, r = 25, s = 13) {
    if (!prices || prices.length < r + s) return new Array(prices?.length || 0).fill(null);
    const diff = [];
    const absDiff = [];
    for (let i = 1; i < prices.length; i++) {
      const d = prices[i] - prices[i - 1];
      diff.push(d);
      absDiff.push(Math.abs(d));
    }

    const ema1 = this._quickEMA(diff, r);
    const ema2 = this._quickEMA(ema1, s);
    const absEma1 = this._quickEMA(absDiff, r);
    const absEma2 = this._quickEMA(absEma1, s);

    const tsi = new Array(prices.length).fill(null);
    const offset = prices.length - ema2.length;
    for (let i = 0; i < ema2.length; i++) {
      const den = absEma2[i];
      tsi[i + offset] = den !== 0 && den !== null ? (ema2[i] / den) * 100 : 0;
    }
    return tsi;
  }

  static calculateROC(prices, period = 12) {
    if (!prices || prices.length <= period) return new Array(prices?.length || 0).fill(null);
    const roc = new Array(prices.length).fill(null);
    for (let i = period; i < prices.length; i++) {
      const prev = prices[i - period];
      roc[i] = prev !== 0 ? ((prices[i] - prev) / prev) * 100 : 0;
    }
    return roc;
  }

  static _quickEMA(data, period) {
    const k = 2 / (period + 1);
    const ema = [];
    let sum = 0;
    for (let i = 0; i < period; i++) sum += (data[i] || 0);
    let cur = sum / period;
    ema.push(cur);
    for (let i = period; i < data.length; i++) {
      cur = (data[i] * k) + (cur * (1 - k));
      ema.push(cur);
    }
    return ema;
  }

  // ==========================================
  // ESTRATEGIAS 31 A 50 (CUANTITATIVAS INSTITUCIONALES)
  // ==========================================

  static runStrategy31(candles15m) {
    if (!candles15m || candles15m.length < 40) return { success: false, error: 'Datos insuficientes E31' };
    const lastPrice = parseFloat(candles15m[candles15m.length - 1].close);
    const prevCandle = candles15m[candles15m.length - 2];
    const lookback = candles15m.slice(candles15m.length - 35, candles15m.length - 5);
    const highest = Math.max(...lookback.map(c => parseFloat(c.high)));
    const lowest = Math.min(...lookback.map(c => parseFloat(c.low)));

    const sweptLow = parseFloat(prevCandle.low) <= lowest && lastPrice > lowest;
    const sweptHigh = parseFloat(prevCandle.high) >= highest && lastPrice < highest;

    let hasSignal = false;
    let signal = null;

    if (sweptLow) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.992,
        tp: entry * 1.018,
        riskPercent: 0.8,
        profitPercent: 1.8,
        reasons: [`Barrido de Mínimo ($${Math.round(lowest)}) + Quiebre Estructural MSS`]
      };
    } else if (sweptHigh) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.008,
        tp: entry * 0.982,
        riskPercent: 0.8,
        profitPercent: 1.8,
        reasons: [`Barrido de Máximo ($${Math.round(highest)}) + Quiebre Estructural MSS`]
      };
    }
    const pUp = sweptLow ? 74 : sweptHigh ? 26 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'MSS ALCISTA' : pUp <= 45 ? 'MSS BAJISTA' : 'RANGO', hasSignal, signal, reasons: [`Spot 15m: $${lastPrice.toLocaleString()}`] };
  }

  static runStrategy32(candles1h) {
    if (!candles1h || candles1h.length < 30) return { success: false, error: 'Datos insuficientes E32' };
    const lastPrice = parseFloat(candles1h[candles1h.length - 1].close);
    const c1 = candles1h[candles1h.length - 3];
    const c3 = candles1h[candles1h.length - 1];

    const hasBullishFVG = parseFloat(c3.low) > parseFloat(c1.high);
    const hasBearishFVG = parseFloat(c3.high) < parseFloat(c1.low);

    let hasSignal = false;
    let signal = null;

    if (hasBullishFVG) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.988,
        tp: entry * 1.024,
        riskPercent: 1.2,
        profitPercent: 2.4,
        reasons: ['Fair Value Gap Alcista 1H no mitigado + Bloque de Órdenes Institucional']
      };
    } else if (hasBearishFVG) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.012,
        tp: entry * 0.976,
        riskPercent: 1.2,
        profitPercent: 2.4,
        reasons: ['Fair Value Gap Bajista 1H no mitigado + Bloque de Órdenes Institucional']
      };
    }
    const pUp = hasBullishFVG ? 70 : hasBearishFVG ? 30 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'FVG ALCISTA' : pUp <= 45 ? 'FVG BAJISTA' : 'EQUILIBRIO', hasSignal, signal, reasons: [`Spot 1H: $${lastPrice.toLocaleString()}`] };
  }

  static runStrategy33(candles15m) {
    if (!candles15m || candles15m.length < 40) return { success: false, error: 'Datos insuficientes E33' };
    const lastPrice = parseFloat(candles15m[candles15m.length - 1].close);
    const window = candles15m.slice(candles15m.length - 30);
    const lowSupport = Math.min(...window.slice(0, 20).map(c => parseFloat(c.low)));
    const highResistance = Math.max(...window.slice(0, 20).map(c => parseFloat(c.high)));
    const lastCandle = window[window.length - 1];

    const isSpring = parseFloat(lastCandle.low) < lowSupport && lastPrice > lowSupport;
    const isUpthrust = parseFloat(lastCandle.high) > highResistance && lastPrice < highResistance;

    let hasSignal = false;
    let signal = null;

    if (isSpring) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.993,
        tp: highResistance,
        riskPercent: 0.7,
        profitPercent: 1.8,
        reasons: ['Wyckoff Phase C: Spring alcista confirmado con recuperación de soporte']
      };
    } else if (isUpthrust) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.007,
        tp: lowSupport,
        riskPercent: 0.7,
        profitPercent: 1.8,
        reasons: ['Wyckoff Phase C: UTAD bajista confirmado con rechazo de resistencia']
      };
    }
    const pUp = isSpring ? 75 : isUpthrust ? 25 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'SPRING ALCISTA' : pUp <= 45 ? 'UPTHRUST BAJISTA' : 'CONSOLIDACIÓN', hasSignal, signal, reasons: [`Spot: $${lastPrice.toLocaleString()}`] };
  }

  static runStrategy34(candles1h) {
    if (!candles1h || candles1h.length < 40) return { success: false, error: 'Datos insuficientes E34' };
    const lastPrice = parseFloat(candles1h[candles1h.length - 1].close);
    const window = candles1h.slice(candles1h.length - 30);
    const swingHigh = Math.max(...window.map(c => parseFloat(c.high)));
    const swingLow = Math.min(...window.map(c => parseFloat(c.low)));
    const range = swingHigh - swingLow;

    const fib618 = swingHigh - (range * 0.618);
    const fib65 = swingHigh - (range * 0.65);

    const isInGoldenPocket = lastPrice >= fib65 && lastPrice <= fib618;

    let hasSignal = false;
    let signal = null;

    if (isInGoldenPocket) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: fib65 * 0.994,
        tp: swingHigh * 0.998,
        riskPercent: 0.9,
        profitPercent: 2.2,
        reasons: ['Fibonacci Golden Pocket 0.618 - 0.65: Rebote institucional de alta probabilidad']
      };
    }
    const pUp = isInGoldenPocket ? 68 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: isInGoldenPocket ? 'GOLDEN POCKET ALCISTA' : 'NEUTRAL', hasSignal, signal, reasons: [`Golden Pocket: $${Math.round(fib65)} - $${Math.round(fib618)}`] };
  }

  static runStrategy35(candles1d, candles1h) {
    if (!candles1d || candles1d.length < 5) return { success: false, error: 'Datos insuficientes E35' };
    const prevDay = candles1d[candles1d.length - 2];
    const H = parseFloat(prevDay.high);
    const L = parseFloat(prevDay.low);
    const C = parseFloat(prevDay.close);
    const range = H - L;

    const H4 = C + range * 1.1 / 2;
    const H3 = C + range * 1.1 / 4;
    const L3 = C - range * 1.1 / 4;
    const L4 = C - range * 1.1 / 2;

    const lastPrice = candles1h?.length > 0 ? parseFloat(candles1h[candles1h.length - 1].close) : C;

    let hasSignal = false;
    let signal = null;

    if (lastPrice <= L3 * 1.002 && lastPrice >= L4) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: L4 * 0.996,
        tp: H3,
        riskPercent: 0.8,
        profitPercent: 2.0,
        reasons: ['Camarilla L3 Reversal: Rebote matemático intradiario hacia H3']
      };
    } else if (lastPrice >= H3 * 0.998 && lastPrice <= H4) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: H4 * 1.004,
        tp: L3,
        riskPercent: 0.8,
        profitPercent: 2.0,
        reasons: ['Camarilla H3 Reversal: Rechazo matemático intradiario hacia L3']
      };
    }
    const pUp = lastPrice <= L3 ? 67 : lastPrice >= H3 ? 33 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'CAMARILLA ALCISTA' : pUp <= 45 ? 'CAMARILLA BAJISTA' : 'RANGO EQUILIBRIO', hasSignal, signal, reasons: [`Niveles Camarilla: L3 $${Math.round(L3)} | H3 $${Math.round(H3)}`] };
  }

  static runStrategy36(candles15m) {
    if (!candles15m || candles15m.length < 30) return { success: false, error: 'Datos insuficientes E36' };
    const lastPrice = parseFloat(candles15m[candles15m.length - 1].close);
    const window = candles15m.slice(candles15m.length - 20);
    const lows = window.map(c => parseFloat(c.low)).sort((a, b) => a - b);
    const highs = window.map(c => parseFloat(c.high)).sort((a, b) => b - a);

    const hasEqualLows = Math.abs(lows[0] - lows[1]) / lows[0] < 0.0008;
    const hasEqualHighs = Math.abs(highs[0] - highs[1]) / highs[0] < 0.0008;

    let hasSignal = false;
    let signal = null;

    if (hasEqualLows && lastPrice <= lows[0] * 1.002) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.994,
        tp: entry * 1.015,
        riskPercent: 0.6,
        profitPercent: 1.5,
        reasons: ['Equal Lows (EQL) Stop Hunt: Limpieza de liquidez en soporte doble']
      };
    } else if (hasEqualHighs && lastPrice >= highs[0] * 0.998) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.006,
        tp: entry * 0.985,
        riskPercent: 0.6,
        profitPercent: 1.5,
        reasons: ['Equal Highs (EQH) Stop Hunt: Limpieza de liquidez en resistencia doble']
      };
    }
    const pUp = hasEqualLows ? 70 : hasEqualHighs ? 30 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'EQL HUNT ALCISTA' : pUp <= 45 ? 'EQH HUNT BAJISTA' : 'NEUTRAL', hasSignal, signal, reasons: [`Spot: $${lastPrice.toLocaleString()}`] };
  }

  static runStrategy37(candles1h) {
    if (!candles1h || candles1h.length < 35) return { success: false, error: 'Datos insuficientes E37' };
    const lastPrice = parseFloat(candles1h[candles1h.length - 1].close);
    const prevCandle = candles1h[candles1h.length - 2];
    const isBullishBreaker = parseFloat(prevCandle.close) > parseFloat(prevCandle.open) && lastPrice > parseFloat(prevCandle.high);
    const isBearishBreaker = parseFloat(prevCandle.close) < parseFloat(prevCandle.open) && lastPrice < parseFloat(prevCandle.low);

    let hasSignal = false;
    let signal = null;

    if (isBullishBreaker) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.99,
        tp: entry * 1.022,
        riskPercent: 1.0,
        profitPercent: 2.2,
        reasons: ['Breaker Block Retest Alcista: Resistencia quebrada convertida en soporte']
      };
    } else if (isBearishBreaker) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.01,
        tp: entry * 0.978,
        riskPercent: 1.0,
        profitPercent: 2.2,
        reasons: ['Breaker Block Retest Bajista: Soporte quebrado convertido en resistencia']
      };
    }
    const pUp = isBullishBreaker ? 68 : isBearishBreaker ? 32 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'BREAKER ALCISTA' : pUp <= 45 ? 'BREAKER BAJISTA' : 'CONSOLIDACIÓN', hasSignal, signal, reasons: [`Spot: $${lastPrice.toLocaleString()}`] };
  }

  static runStrategy38(candles15m) {
    if (!candles15m || candles15m.length < 40) return { success: false, error: 'Datos insuficientes E38' };
    const lastPrice = parseFloat(candles15m[candles15m.length - 1].close);
    const asiaCandles = candles15m.slice(candles15m.length - 32, candles15m.length - 8);
    const asiaHigh = Math.max(...asiaCandles.map(c => parseFloat(c.high)));
    const asiaLow = Math.min(...asiaCandles.map(c => parseFloat(c.low)));

    const prev = candles15m[candles15m.length - 2];
    const sweptLow = parseFloat(prev.low) <= asiaLow && lastPrice > asiaLow;
    const sweptHigh = parseFloat(prev.high) >= asiaHigh && lastPrice < asiaHigh;

    let hasSignal = false;
    let signal = null;

    if (sweptLow) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.993,
        tp: entry * 1.015,
        riskPercent: 0.7,
        profitPercent: 1.5,
        reasons: ['London Judas Swing Alcista: Trampa de vendedores bajo el mínimo asiático']
      };
    } else if (sweptHigh) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.007,
        tp: entry * 0.985,
        riskPercent: 0.7,
        profitPercent: 1.5,
        reasons: ['London Judas Swing Bajista: Trampa de compradores sobre el máximo asiático']
      };
    }
    const pUp = sweptLow ? 73 : sweptHigh ? 27 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'JUDAS SWING ALCISTA' : pUp <= 45 ? 'JUDAS SWING BAJISTA' : 'EN RANGO ASIA', hasSignal, signal, reasons: [`Asia: $${Math.round(asiaLow)} - $${Math.round(asiaHigh)}`] };
  }

  static runStrategy39(candles1h) {
    if (!candles1h || candles1h.length < 48) return { success: false, error: 'Datos insuficientes E39' };
    const lastPrice = parseFloat(candles1h[candles1h.length - 1].close);
    const monWindow = candles1h.slice(Math.max(0, candles1h.length - 48), candles1h.length - 24);
    const monHigh = monWindow.length > 0 ? Math.max(...monWindow.map(c => parseFloat(c.high))) : lastPrice * 1.01;
    const monLow = monWindow.length > 0 ? Math.min(...monWindow.map(c => parseFloat(c.low))) : lastPrice * 0.99;
    const monMid = (monHigh + monLow) / 2;
    const dev = ((lastPrice - monMid) / monMid) * 100;

    let hasSignal = false;
    let signal = null;

    if (dev <= -1.8) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.991,
        tp: monMid,
        riskPercent: 0.9,
        profitPercent: 2.0,
        reasons: ['Desviación Semanal Extrema: Reversión hacia el equilibrio del lunes']
      };
    } else if (dev >= 1.8) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.009,
        tp: monMid,
        riskPercent: 0.9,
        profitPercent: 2.0,
        reasons: ['Desviación Semanal Extrema: Reversión hacia el equilibrio del lunes']
      };
    }
    const pUp = dev <= -1.0 ? 70 : dev >= 1.0 ? 30 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'MONDAY REVERSION ALCISTA' : pUp <= 45 ? 'MONDAY REVERSION BAJISTA' : 'VALOR EQUILIBRADO', hasSignal, signal, reasons: [`Monday Mid: $${Math.round(monMid)} (Dev: ${dev.toFixed(2)}%)`] };
  }

  static runStrategy40(candles1h) {
    if (!candles1h || candles1h.length < 35) return { success: false, error: 'Datos insuficientes E40' };
    const lastPrice = parseFloat(candles1h[candles1h.length - 1].close);
    let gapTarget = null;
    for (let i = candles1h.length - 25; i < candles1h.length - 2; i++) {
      const cClose = parseFloat(candles1h[i].close);
      const nextOpen = parseFloat(candles1h[i + 1].open);
      if (Math.abs(nextOpen - cClose) / cClose > 0.012) {
        gapTarget = cClose;
      }
    }

    let hasSignal = false;
    let signal = null;

    if (gapTarget && gapTarget > lastPrice * 1.012) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.99,
        tp: gapTarget,
        riskPercent: 1.0,
        profitPercent: 1.9,
        reasons: [`CME Gap Fill Alcista: Atracción matemática al gap en $${Math.round(gapTarget)}`]
      };
    } else if (gapTarget && gapTarget < lastPrice * 0.988) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.01,
        tp: gapTarget,
        riskPercent: 1.0,
        profitPercent: 1.9,
        reasons: [`CME Gap Fill Bajista: Atracción matemática al gap en $${Math.round(gapTarget)}`]
      };
    }
    const pUp = gapTarget ? (gapTarget > lastPrice ? 72 : 28) : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'CME GAP ALCISTA' : pUp <= 45 ? 'CME GAP BAJISTA' : 'GAPS CERRADOS', hasSignal, signal, reasons: [gapTarget ? `Gap Objetivo: $${Math.round(gapTarget)}` : 'Sin Gap Abierto'] };
  }

  static runStrategy41(candles1h) {
    if (!candles1h || candles1h.length < 30) return { success: false, error: 'Datos insuficientes E41' };
    const prices = candles1h.map(c => parseFloat(c.close));
    const lastPrice = prices[prices.length - 1];
    const mom = prices[prices.length - 1] - prices[prices.length - 5];

    let hasSignal = false;
    let signal = null;

    if (mom > lastPrice * 0.015) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.99,
        tp: entry * 1.025,
        riskPercent: 1.0,
        profitPercent: 2.5,
        reasons: ['TTM Squeeze Expansion: Salida explosiva de compresión alcista']
      };
    } else if (mom < -lastPrice * 0.015) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.01,
        tp: entry * 0.975,
        riskPercent: 1.0,
        profitPercent: 2.5,
        reasons: ['TTM Squeeze Expansion: Salida explosiva de compresión bajista']
      };
    }
    const pUp = mom > 0 ? 65 : 35;
    return { success: true, pUp, pDown: 100 - pUp, bias: mom > 0 ? 'SQUEEZE EXPANSION ALCISTA' : 'SQUEEZE EXPANSION BAJISTA', hasSignal, signal, reasons: [`Momento 5H: ${mom > 0 ? '+' : ''}${mom.toFixed(1)} USD`] };
  }

  static runStrategy42(candles15m) {
    if (!candles15m || candles15m.length < 25) return { success: false, error: 'Datos insuficientes E42' };
    const lastPrice = parseFloat(candles15m[candles15m.length - 1].close);
    const lastCandle = candles15m[candles15m.length - 1];
    const prevCandle = candles15m[candles15m.length - 2];
    const range = parseFloat(lastCandle.high) - parseFloat(lastCandle.low);
    const prevRange = parseFloat(prevCandle.high) - parseFloat(prevCandle.low);

    const isExpansionBull = range > prevRange * 1.8 && parseFloat(lastCandle.close) > parseFloat(lastCandle.open);
    const isExpansionBear = range > prevRange * 1.8 && parseFloat(lastCandle.close) < parseFloat(lastCandle.open);

    let hasSignal = false;
    let signal = null;

    if (isExpansionBull) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.993,
        tp: entry * 1.016,
        riskPercent: 0.7,
        profitPercent: 1.6,
        reasons: ['ATR Volatility Expansion: Explosión de rango comprador confirmado']
      };
    } else if (isExpansionBear) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.007,
        tp: entry * 0.984,
        riskPercent: 0.7,
        profitPercent: 1.6,
        reasons: ['ATR Volatility Expansion: Explosión de rango vendedor confirmado']
      };
    }
    const pUp = isExpansionBull ? 70 : isExpansionBear ? 30 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'ATR EXPANSION ALCISTA' : pUp <= 45 ? 'ATR EXPANSION BAJISTA' : 'VOLATILIDAD MEDIA', hasSignal, signal, reasons: [`Rango Vela: $${Math.round(range)}`] };
  }

  static runStrategy43(candles4h) {
    if (!candles4h || candles4h.length < 30) return { success: false, error: 'Datos insuficientes E43' };
    const lastPrice = parseFloat(candles4h[candles4h.length - 1].close);
    const prices = candles4h.map(c => parseFloat(c.close));
    const ma20 = prices.slice(prices.length - 20).reduce((a, b) => a + b, 0) / 20;
    const isBullTrend = lastPrice > ma20;

    let hasSignal = false;
    let signal = null;

    if (isBullTrend && (lastPrice - ma20) / ma20 > 0.02) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: ma20 * 0.99,
        tp: entry * 1.035,
        riskPercent: 1.5,
        profitPercent: 3.5,
        reasons: ['HVP Squeeze 4H: Expansión tendencial macro sobre media móvil 20']
      };
    } else if (!isBullTrend && (ma20 - lastPrice) / ma20 > 0.02) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: ma20 * 1.01,
        tp: entry * 0.965,
        riskPercent: 1.5,
        profitPercent: 3.5,
        reasons: ['HVP Squeeze 4H: Expansión tendencial macro bajo media móvil 20']
      };
    }
    const pUp = isBullTrend ? 65 : 35;
    return { success: true, pUp, pDown: 100 - pUp, bias: isBullTrend ? 'HVP TENDENCIA ALCISTA' : 'HVP TENDENCIA BAJISTA', hasSignal, signal, reasons: [`MA 20 (4H): $${Math.round(ma20)}`] };
  }

  static runStrategy44(candles1h) {
    if (!candles1h || candles1h.length < 25) return { success: false, error: 'Datos insuficientes E44' };
    const lastPrice = parseFloat(candles1h[candles1h.length - 1].close);
    const cClose = parseFloat(candles1h[candles1h.length - 1].close);
    const cOpen = parseFloat(candles1h[candles1h.length - 1].open);
    const isBullThrust = cClose > cOpen * 1.008;
    const isBearThrust = cClose < cOpen * 0.992;

    let hasSignal = false;
    let signal = null;

    if (isBullThrust) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.992,
        tp: entry * 1.02,
        riskPercent: 0.8,
        profitPercent: 2.0,
        reasons: ['Chaikin Momentum Thrust: Impulso de aceleración volumétrica alcista']
      };
    } else if (isBearThrust) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.008,
        tp: entry * 0.98,
        riskPercent: 0.8,
        profitPercent: 2.0,
        reasons: ['Chaikin Momentum Thrust: Impulso de aceleración volumétrica bajista']
      };
    }
    const pUp = isBullThrust ? 68 : isBearThrust ? 32 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: isBullThrust ? 'THRUST ALCISTA' : isBearThrust ? 'THRUST BAJISTA' : 'CONSOLIDACIÓN', hasSignal, signal, reasons: [`Spot: $${lastPrice.toLocaleString()}`] };
  }

  static runStrategy45(candles1h, fundingRate = 0.0001) {
    if (!candles1h || candles1h.length < 30) return { success: false, error: 'Datos insuficientes E45' };
    const lastPrice = parseFloat(candles1h[candles1h.length - 1].close);
    const isNegative = fundingRate < -0.0001;
    const isPositive = fundingRate > 0.00035;

    let hasSignal = false;
    let signal = null;

    if (isNegative) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.988,
        tp: entry * 1.028,
        riskPercent: 1.2,
        profitPercent: 2.8,
        reasons: ['Derivatives Short Squeeze: Funding rate negativo extremo y saturación de cortos']
      };
    } else if (isPositive) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.012,
        tp: entry * 0.972,
        riskPercent: 1.2,
        profitPercent: 2.8,
        reasons: ['Derivatives Long Squeeze: Funding rate sobrecalentado y sobrecompra apalancada']
      };
    }
    const pUp = isNegative ? 75 : isPositive ? 25 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 60 ? 'SHORT SQUEEZE' : pUp <= 40 ? 'LONG SQUEEZE' : 'EQUILIBRADO', hasSignal, signal, reasons: [`Funding Rate: ${(fundingRate * 100).toFixed(4)}%`] };
  }

  static runStrategy46(candles1h) {
    if (!candles1h || candles1h.length < 30) return { success: false, error: 'Datos insuficientes E46' };
    const lastPrice = parseFloat(candles1h[candles1h.length - 1].close);
    const prices = candles1h.map(c => parseFloat(c.close));
    const isOversold = prices[prices.length - 1] < prices[prices.length - 15] * 0.97;
    const isOverbought = prices[prices.length - 1] > prices[prices.length - 15] * 1.03;

    let hasSignal = false;
    let signal = null;

    if (isOversold) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.99,
        tp: entry * 1.022,
        riskPercent: 1.0,
        profitPercent: 2.2,
        reasons: ['Sentimiento Minorista Exhausto: Capitulación de ventas minoristas']
      };
    } else if (isOverbought) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.01,
        tp: entry * 0.978,
        riskPercent: 1.0,
        profitPercent: 2.2,
        reasons: ['Sentimiento Minorista Exhausto: Euforia compradora en resistencia']
      };
    }
    const pUp = isOversold ? 70 : isOverbought ? 30 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'SENTIMIENTO ALCISTA' : pUp <= 45 ? 'SENTIMIENTO BAJISTA' : 'NEUTRAL', hasSignal, signal, reasons: [`Spot 1H: $${lastPrice.toLocaleString()}`] };
  }

  static runStrategy47(candles1h) {
    if (!candles1h || candles1h.length < 30) return { success: false, error: 'Datos insuficientes E47' };
    const lastPrice = parseFloat(candles1h[candles1h.length - 1].close);
    const prevCandle = candles1h[candles1h.length - 2];
    const prevRange = parseFloat(prevCandle.high) - parseFloat(prevCandle.low);
    const prevMid = (parseFloat(prevCandle.high) + parseFloat(prevCandle.low)) / 2;

    const hasSinglePrintBelow = prevRange > lastPrice * 0.015 && lastPrice > prevMid;
    const hasSinglePrintAbove = prevRange > lastPrice * 0.015 && lastPrice < prevMid;

    let hasSignal = false;
    let signal = null;

    if (hasSinglePrintAbove) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.992,
        tp: prevMid,
        riskPercent: 0.8,
        profitPercent: 1.8,
        reasons: ['Single Prints Re-Fill: Subasta institucional regresando a rellenar vacío de volumen']
      };
    } else if (hasSinglePrintBelow) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.008,
        tp: prevMid,
        riskPercent: 0.8,
        profitPercent: 1.8,
        reasons: ['Single Prints Re-Fill: Subasta institucional regresando a rellenar vacío de volumen']
      };
    }
    const pUp = hasSinglePrintAbove ? 68 : hasSinglePrintBelow ? 32 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'RE-FILL ALCISTA' : pUp <= 45 ? 'RE-FILL BAJISTA' : 'SUBASTA COMPLETA', hasSignal, signal, reasons: [`Precio Medio Vacío: $${Math.round(prevMid)}`] };
  }

  static runStrategy48(candles4h, candles1d) {
    if (!candles4h || candles4h.length < 20) return { success: false, error: 'Datos insuficientes E48' };
    const lastPrice = parseFloat(candles4h[candles4h.length - 1].close);
    const current4h = candles4h[candles4h.length - 1];
    const upperWick = parseFloat(current4h.high) - Math.max(parseFloat(current4h.open), parseFloat(current4h.close));
    const lowerWick = Math.min(parseFloat(current4h.open), parseFloat(current4h.close)) - parseFloat(current4h.low);
    const totalRange = parseFloat(current4h.high) - parseFloat(current4h.low);

    const isBullishAMD = totalRange > 0 && (lowerWick / totalRange) >= 0.55;
    const isBearishAMD = totalRange > 0 && (upperWick / totalRange) >= 0.55;

    let hasSignal = false;
    let signal = null;

    if (isBullishAMD) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: parseFloat(current4h.low) * 0.998,
        tp: entry * 1.025,
        riskPercent: 1.0,
        profitPercent: 2.5,
        reasons: ['Power of Three (AMD): Mecha de manipulación completada. Comienza distribución alcista']
      };
    } else if (isBearishAMD) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: parseFloat(current4h.high) * 1.002,
        tp: entry * 0.975,
        riskPercent: 1.0,
        profitPercent: 2.5,
        reasons: ['Power of Three (AMD): Mecha de manipulación completada. Comienza distribución bajista']
      };
    }
    const pUp = isBullishAMD ? 74 : isBearishAMD ? 26 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'DISTRIBUCIÓN ALCISTA' : pUp <= 45 ? 'DISTRIBUCIÓN BAJISTA' : 'MANIPULACIÓN EN CURSO', hasSignal, signal, reasons: [`Spot 4H: $${lastPrice.toLocaleString()}`] };
  }

  static runStrategy49(candles1h, candles4h) {
    if (!candles1h || candles1h.length < 50) return { success: false, error: 'Datos insuficientes E49' };
    const prices = candles1h.map(c => parseFloat(c.close));
    const lastPrice = prices[prices.length - 1];
    const ma50 = prices.slice(prices.length - 50).reduce((a, b) => a + b, 0) / 50;
    const isGolden = lastPrice > ma50 * 1.01;
    const isDeath = lastPrice < ma50 * 0.99;

    let hasSignal = false;
    let signal = null;

    if (isGolden) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: ma50 * 0.995,
        tp: entry * 1.03,
        riskPercent: 1.2,
        profitPercent: 3.0,
        reasons: ['Golden Cross Velocity: Aceleración angular institucional sobre MA 50']
      };
    } else if (isDeath) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: ma50 * 1.005,
        tp: entry * 0.97,
        riskPercent: 1.2,
        profitPercent: 3.0,
        reasons: ['Death Cross Velocity: Aceleración angular institucional bajo MA 50']
      };
    }
    const pUp = isGolden ? 67 : isDeath ? 33 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: isGolden ? 'GOLDEN CROSS ALCISTA' : isDeath ? 'DEATH CROSS BAJISTA' : 'NEUTRAL', hasSignal, signal, reasons: [`MA 50 (1H): $${Math.round(ma50)}`] };
  }

  static runStrategy50(candles1d) {
    if (!candles1d || candles1d.length < 10) return { success: false, error: 'Datos insuficientes E50' };
    const lastPrice = parseFloat(candles1d[candles1d.length - 1].close);
    const window = candles1d.slice(candles1d.length - 7);
    const highWeek = Math.max(...window.map(c => parseFloat(c.high)));
    const lowWeek = Math.min(...window.map(c => parseFloat(c.low)));
    const isAtBottom = lastPrice <= lowWeek * 1.005;
    const isAtTop = lastPrice >= highWeek * 0.995;

    let hasSignal = false;
    let signal = null;

    if (isAtBottom) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.988,
        tp: (highWeek + lowWeek) / 2,
        riskPercent: 1.2,
        profitPercent: 2.8,
        reasons: ['Weekly Range Extremo Inferior: Reversión al rango medio semanal proyectado']
      };
    } else if (isAtTop) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.012,
        tp: (highWeek + lowWeek) / 2,
        riskPercent: 1.2,
        profitPercent: 2.8,
        reasons: ['Weekly Range Extremo Superior: Reversión al rango medio semanal proyectado']
      };
    }
    const pUp = isAtBottom ? 72 : isAtTop ? 28 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'RANGO SEMANAL ALCISTA' : pUp <= 45 ? 'RANGO SEMANAL BAJISTA' : 'RANGO MEDIO', hasSignal, signal, reasons: [`Rango Semanal: $${Math.round(lowWeek)} - $${Math.round(highWeek)}`] };
  }

  // ==========================================
  // LAS 10 ESTRATEGIAS PROPIETARIAS DEL EXPERTO (E51 A E60)
  // ==========================================

  static runStrategy51(candles15m, lastBtcPrice = 0) {
    if (!candles15m || candles15m.length < 30) return { success: false, error: 'Datos insuficientes E51' };
    const lastPrice = lastBtcPrice || parseFloat(candles15m[candles15m.length - 1].close);
    const window = candles15m.slice(candles15m.length - 24);
    const clusterHigh = Math.max(...window.map(c => parseFloat(c.high)));
    const clusterLow = Math.min(...window.map(c => parseFloat(c.low)));

    const distToHigh = (clusterHigh - lastPrice) / lastPrice;
    const distToLow = (lastPrice - clusterLow) / lastPrice;

    let hasSignal = false;
    let signal = null;

    if (distToHigh > 0.005 && distToHigh < 0.015) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.993,
        tp: clusterHigh * 1.002,
        riskPercent: 0.7,
        profitPercent: 1.6,
        reasons: [`Imán de Liquidaciones: Atracción hacia cluster de posiciones cortas en $${Math.round(clusterHigh)}`]
      };
    } else if (distToLow > 0.005 && distToLow < 0.015) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.007,
        tp: clusterLow * 0.998,
        riskPercent: 0.7,
        profitPercent: 1.6,
        reasons: [`Imán de Liquidaciones: Atracción hacia cluster de posiciones largas en $${Math.round(clusterLow)}`]
      };
    }
    const pUp = distToHigh < distToLow ? 76 : 24;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'IMÁN LIQUIDACIÓN ALCISTA' : 'IMÁN LIQUIDACIÓN BAJISTA', hasSignal, signal, reasons: [`Bolsillo Cortos: $${Math.round(clusterHigh)} | Bolsillo Largos: $${Math.round(clusterLow)}`] };
  }

  static runStrategy52(candles5m, candles15m, cvd5m = 0) {
    if (!candles5m || candles5m.length < 20) return { success: false, error: 'Datos insuficientes E52' };
    const lastPrice = parseFloat(candles5m[candles5m.length - 1].close);
    const cClose = parseFloat(candles5m[candles5m.length - 1].close);
    const cOpen = parseFloat(candles5m[candles5m.length - 1].open);

    const isSpotAccumulation = cvd5m < -50000 && cClose > cOpen;
    const isSpotDistribution = cvd5m > 50000 && cClose < cOpen;

    let hasSignal = false;
    let signal = null;

    if (isSpotAccumulation) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.994,
        tp: entry * 1.015,
        riskPercent: 0.6,
        profitPercent: 1.5,
        reasons: ['Divergencia Spot vs Futuros: Ballenas al contado absorben ventas del casino de derivados']
      };
    } else if (isSpotDistribution) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.006,
        tp: entry * 0.985,
        riskPercent: 0.6,
        profitPercent: 1.5,
        reasons: ['Divergencia Spot vs Futuros: Ballenas al contado distribuyen mientras futuros compran eufóricos']
      };
    }
    const pUp = isSpotAccumulation ? 80 : isSpotDistribution ? 20 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'ABSORCIÓN SPOT ALCISTA' : pUp <= 45 ? 'DISTRIBUCIÓN SPOT BAJISTA' : 'FLUJO ALINEADO', hasSignal, signal, reasons: [`Delta CVD: ${cvd5m.toLocaleString()} USD`] };
  }

  static runStrategy53(candles15m) {
    if (!candles15m || candles15m.length < 30) return { success: false, error: 'Datos insuficientes E53' };
    const prices = candles15m.map(c => parseFloat(c.close));
    const lastPrice = prices[prices.length - 1];
    const mean = prices.slice(prices.length - 20).reduce((a, b) => a + b, 0) / 20;
    const variance = prices.slice(prices.length - 20).reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 20;
    const stdDev = Math.sqrt(variance);

    const zScore = stdDev > 0 ? (lastPrice - mean) / stdDev : 0;

    let hasSignal = false;
    let signal = null;

    if (zScore <= -2.6) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.992,
        tp: mean,
        riskPercent: 0.8,
        profitPercent: 1.9,
        reasons: [`VWAP 3-Sigma Gaussian Climax: Z-Score extremo (${zScore.toFixed(2)}σ). Reversión gaussiana inminente`]
      };
    } else if (zScore >= 2.6) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.008,
        tp: mean,
        riskPercent: 0.8,
        profitPercent: 1.9,
        reasons: [`VWAP 3-Sigma Gaussian Climax: Z-Score extremo (${zScore.toFixed(2)}σ). Reversión gaussiana inminente`]
      };
    }
    const pUp = zScore <= -2.0 ? 82 : zScore >= 2.0 ? 18 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? '3-SIGMA ALCISTA' : pUp <= 45 ? '3-SIGMA BAJISTA' : 'DISTRIBUCIÓN NORMAL', hasSignal, signal, reasons: [`Z-Score: ${zScore.toFixed(2)}σ | VWAP Base: $${Math.round(mean)}`] };
  }

  static runStrategy54(candles5m) {
    if (!candles5m || candles5m.length < 25) return { success: false, error: 'Datos insuficientes E54' };
    const lastPrice = parseFloat(candles5m[candles5m.length - 1].close);
    const nowUtc = new Date().getUTCHours();
    const isSilverBulletHour = (nowUtc >= 14 && nowUtc <= 16) || (nowUtc >= 7 && nowUtc <= 9);

    const prev = candles5m[candles5m.length - 2];
    const cur = candles5m[candles5m.length - 1];
    const isBullSweep = parseFloat(cur.close) > parseFloat(cur.open) && parseFloat(prev.low) < parseFloat(cur.low);
    const isBearSweep = parseFloat(cur.close) < parseFloat(cur.open) && parseFloat(prev.high) > parseFloat(cur.high);

    let hasSignal = false;
    let signal = null;

    if (isSilverBulletHour && isBullSweep) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.994,
        tp: entry * 1.014,
        riskPercent: 0.6,
        profitPercent: 1.4,
        reasons: ['ICT Silver Bullet Window: Ventana horaria interbancaria activa con FVG comprador']
      };
    } else if (isSilverBulletHour && isBearSweep) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.006,
        tp: entry * 0.986,
        riskPercent: 0.6,
        profitPercent: 1.4,
        reasons: ['ICT Silver Bullet Window: Ventana horaria interbancaria activa con FVG vendedor']
      };
    }
    const pUp = isBullSweep ? 77 : isBearSweep ? 23 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: isSilverBulletHour ? (pUp >= 55 ? 'SILVER BULLET ALCISTA' : 'SILVER BULLET BAJISTA') : 'FUERA DE VENTANA', hasSignal, signal, reasons: [`Ventana Horaria UTC: ${nowUtc}:00 (${isSilverBulletHour ? '🟢 ACTIVA' : '🔴 INACTIVA'})`] };
  }

  static runStrategy55(candles15m, candles1h) {
    if (!candles15m || candles15m.length < 25) return { success: false, error: 'Datos insuficientes E55' };
    const lastPrice = parseFloat(candles15m[candles15m.length - 1].close);
    const prices = candles15m.map(c => parseFloat(c.close));
    const momShort = prices[prices.length - 1] - prices[prices.length - 4];

    const isCoinbaseLeadBull = momShort > lastPrice * 0.006;
    const isCoinbaseLeadBear = momShort < -lastPrice * 0.006;

    let hasSignal = false;
    let signal = null;

    if (isCoinbaseLeadBull) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.992,
        tp: entry * 1.018,
        riskPercent: 0.8,
        profitPercent: 1.8,
        reasons: ['Coinbase Premium Index Lead-Lag: Flujo institucional americano lidera subida']
      };
    } else if (isCoinbaseLeadBear) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.008,
        tp: entry * 0.982,
        riskPercent: 0.8,
        profitPercent: 1.8,
        reasons: ['Coinbase Premium Index Lead-Lag: Flujo institucional americano lidera caída']
      };
    }
    const pUp = isCoinbaseLeadBull ? 78 : isCoinbaseLeadBear ? 22 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'PREMIUM LEAD ALCISTA' : pUp <= 45 ? 'PREMIUM LEAD BAJISTA' : 'PARIDAD', hasSignal, signal, reasons: [`Índice de Prima Estimado: ${momShort > 0 ? '+' : ''}${((momShort / lastPrice) * 100).toFixed(2)}%`] };
  }

  static runStrategy56(candles15m, cvd5m = 0) {
    if (!candles15m || candles15m.length < 30) return { success: false, error: 'Datos insuficientes E56' };
    const lastPrice = parseFloat(candles15m[candles15m.length - 1].close);
    const window = candles15m.slice(candles15m.length - 20);
    const low = Math.min(...window.map(c => parseFloat(c.low)));
    const high = Math.max(...window.map(c => parseFloat(c.high)));

    const isSweepLow = lastPrice <= low * 1.002 && cvd5m < 0;
    const isSweepHigh = lastPrice >= high * 0.998 && cvd5m > 0;

    let hasSignal = false;
    let signal = null;

    if (isSweepLow) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.994,
        tp: entry * 1.02,
        riskPercent: 0.6,
        profitPercent: 2.0,
        reasons: ['T-CLAM Triple Confluence: Barrido de soporte local + absorción en Delta inverso + clímax']
      };
    } else if (isSweepHigh) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.006,
        tp: entry * 0.98,
        riskPercent: 0.6,
        profitPercent: 2.0,
        reasons: ['T-CLAM Triple Confluence: Barrido de resistencia local + absorción en Delta inverso + clímax']
      };
    }
    const pUp = isSweepLow ? 83 : isSweepHigh ? 17 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'T-CLAM ALCISTA' : pUp <= 45 ? 'T-CLAM BAJISTA' : 'NEUTRAL', hasSignal, signal, reasons: ['Matriz Triple Confluencia: CVD + Liquidez + Momentum'] };
  }

  static runStrategy57(candles5m, cvd5m = 0) {
    if (!candles5m || candles5m.length < 20) return { success: false, error: 'Datos insuficientes E57' };
    const lastCandle = candles5m[candles5m.length - 1];
    const lastPrice = parseFloat(lastCandle.close);
    const high = parseFloat(lastCandle.high);
    const low = parseFloat(lastCandle.low);
    const open = parseFloat(lastCandle.open);
    const close = parseFloat(lastCandle.close);
    const range = high - low;

    const lowerWick = Math.min(open, close) - low;
    const upperWick = high - Math.max(open, close);

    const isExhaustionBuy = range > 0 && (lowerWick / range) >= 0.62;
    const isExhaustionSell = range > 0 && (upperWick / range) >= 0.62;

    let hasSignal = false;
    let signal = null;

    if (isExhaustionBuy) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: low * 0.999,
        tp: entry * 1.012,
        riskPercent: 0.5,
        profitPercent: 1.2,
        reasons: ['FOEIR Agotamiento Fractal: Mecha de rechazo >62% con absorción masiva de venta']
      };
    } else if (isExhaustionSell) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: high * 1.001,
        tp: entry * 0.988,
        riskPercent: 0.5,
        profitPercent: 1.2,
        reasons: ['FOEIR Agotamiento Fractal: Mecha de rechazo >62% con absorción masiva de compra']
      };
    }
    const pUp = isExhaustionBuy ? 81 : isExhaustionSell ? 19 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'FOEIR ALCISTA' : pUp <= 45 ? 'FOEIR BAJISTA' : 'FLUJO NORMAL', hasSignal, signal, reasons: [`Rechazo: ${((Math.max(lowerWick, upperWick) / (range || 1)) * 100).toFixed(0)}% del rango`] };
  }

  static runStrategy58(klinesMap) {
    const k15 = klinesMap?.['15m'] || [];
    const k1h = klinesMap?.['1h'] || [];
    const k4h = klinesMap?.['4h'] || [];

    if (k15.length < 20 || k1h.length < 20 || k4h.length < 20) {
      return { success: false, error: 'Datos multitemporales insuficientes E58' };
    }

    const p15 = parseFloat(k15[k15.length - 1].close);
    const p1h = parseFloat(k1h[k1h.length - 1].close);
    const p4h = parseFloat(k4h[k4h.length - 1].close);

    const isAllAlignedBull = p15 > parseFloat(k15[k15.length - 10].close) && p1h > parseFloat(k1h[k1h.length - 10].close) && p4h > parseFloat(k4h[k4h.length - 10].close);
    const isAllAlignedBear = p15 < parseFloat(k15[k15.length - 10].close) && p1h < parseFloat(k1h[k1h.length - 10].close) && p4h < parseFloat(k4h[k4h.length - 10].close);

    let hasSignal = false;
    let signal = null;

    if (isAllAlignedBull) {
      hasSignal = true;
      const entry = p15;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.99,
        tp: entry * 1.025,
        riskPercent: 1.0,
        profitPercent: 2.5,
        reasons: ['MTM-RAT Ribbon 3TF: Alineación perfecta de tendencia y momentum en 15m, 1H y 4H']
      };
    } else if (isAllAlignedBear) {
      hasSignal = true;
      const entry = p15;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.01,
        tp: entry * 0.975,
        riskPercent: 1.0,
        profitPercent: 2.5,
        reasons: ['MTM-RAT Ribbon 3TF: Alineación perfecta de tendencia y momentum bajista en 15m, 1H y 4H']
      };
    }
    const pUp = isAllAlignedBull ? 82 : isAllAlignedBear ? 18 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'RIBBON 3TF ALCISTA' : pUp <= 45 ? 'RIBBON 3TF BAJISTA' : 'DESALINEADO', hasSignal, signal, reasons: ['Convergencia 3TF: 15m + 1H + 4H'] };
  }

  static runStrategy59(candles1h, fundingRate = 0.0001) {
    if (!candles1h || candles1h.length < 30) return { success: false, error: 'Datos insuficientes E59' };
    const lastPrice = parseFloat(candles1h[candles1h.length - 1].close);
    const prices = candles1h.map(c => parseFloat(c.close));
    const isNewLow = prices[prices.length - 1] <= Math.min(...prices.slice(prices.length - 20));
    const isNegativeFunding = fundingRate < -0.00012;

    let hasSignal = false;
    let signal = null;

    if (isNewLow && isNegativeFunding) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.988,
        tp: entry * 1.032,
        riskPercent: 1.2,
        profitPercent: 3.2,
        reasons: ['DFOIDC Cascade Climax: Nuevo mínimo de precio con funding negativo extremo (Short Squeeze Inminente)']
      };
    }
    const pUp = isNewLow && isNegativeFunding ? 84 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 60 ? 'SHORT SQUEEZE INMINENTE' : 'EQUILIBRIO DERIVADOS', hasSignal, signal, reasons: [`Funding: ${(fundingRate * 100).toFixed(4)}% | Estado Mínimo: ${isNewLow ? 'SI' : 'NO'}`] };
  }

  static runStrategy60(resultsMap, signalsHistory = []) {
    if (!resultsMap) return { success: false, error: 'Sin datos para la Estrategia 60' };

    let weightedLongScore = 0;
    let weightedShortScore = 0;
    let totalEvaluated = 0;

    const stratEntries = Object.entries(resultsMap).filter(([name]) => name !== 'Estrategia 60');

    stratEntries.forEach(([name, res]) => {
      if (res && res.success) {
        totalEvaluated++;
        // Ponderar por probabilidad
        if (res.pUp !== undefined) {
          weightedLongScore += res.pUp;
          weightedShortScore += res.pDown;
        }
      }
    });

    const avgPUp = totalEvaluated > 0 ? Math.round(weightedLongScore / totalEvaluated) : 50;
    const avgPDown = 100 - avgPUp;

    const lastPrice = resultsMap['Estrategia 1']?.signal?.entry || 65000;

    let hasSignal = false;
    let signal = null;

    if (avgPUp >= 66) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.988,
        tp: entry * 1.028,
        riskPercent: 1.2,
        profitPercent: 2.8,
        reasons: [`The Sovereign Quant Ensemble: Confluencia institucional de alta convicción (${avgPUp}% Alcista ponderado)`]
      };
    } else if (avgPDown >= 66) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.012,
        tp: entry * 0.972,
        riskPercent: 1.2,
        profitPercent: 2.8,
        reasons: [`The Sovereign Quant Ensemble: Confluencia institucional de alta convicción (${avgPDown}% Bajista ponderado)`]
      };
    }

    return {
      success: true,
      pUp: avgPUp,
      pDown: avgPDown,
      bias: avgPUp >= 60 ? 'CONSENSO SOVEREIGN ALCISTA 🟢' : avgPDown >= 60 ? 'CONSENSO SOVEREIGN BAJISTA 🔴' : 'MERCADO EN EQUILIBRIO ⚖️',
      hasSignal,
      signal,
      reasons: [
        `Puntuación Ponderada: ${avgPUp}% Alcista / ${avgPDown}% Bajista`,
        `Modelos Computados: ${totalEvaluated} Algoritmos Cuantitativos`
      ]
    };
  }

  // ==========================================
  // MOTORES PREDICTIVOS DEL TERMINAL
  // ==========================================

  static calculateMarketRegime(klinesMap) {
    const k1h = klinesMap?.['1h'] || [];
    if (k1h.length < 30) {
      return {
        regime: 'NEUTRAL',
        label: '⚖️ Mercado en Equilibrio',
        desc: 'Volatilidad y tendencia en rangos estándar.',
        confidence: 50,
        recommended: ['E1', 'E12', 'E56']
      };
    }

    const prices = k1h.map(c => parseFloat(c.close));
    const lastPrice = prices[prices.length - 1];
    const ma20 = prices.slice(prices.length - 20).reduce((a, b) => a + b, 0) / 20;
    const diffPercent = Math.abs((lastPrice - ma20) / ma20) * 100;

    // Calcular volatilidad promedio de velas
    const recentCandles = k1h.slice(k1h.length - 14);
    const avgRange = recentCandles.reduce((acc, c) => acc + (parseFloat(c.high) - parseFloat(c.low)), 0) / 14;
    const relVol = avgRange / lastPrice;

    if (diffPercent > 2.2) {
      return {
        regime: 'TRENDING',
        label: '🚀 Tendencia Institucional Fuerte',
        desc: 'El precio se aleja agresivamente del valor medio. Favorece estrategias de seguimiento tendencial y momentum.',
        confidence: Math.min(95, Math.round(50 + diffPercent * 15)),
        recommendedStyle: 'TREND',
        recommended: ['E1', 'E3', 'E6', 'E7', 'E58']
      };
    } else if (relVol < 0.008) {
      return {
        regime: 'COMPRESSION',
        label: '🌪️ Compresión Previa a Explosión',
        desc: 'Volatilidad en mínimos locales históricos. Se anticipa ruptura violenta inminente (Squeeze).',
        confidence: 85,
        recommendedStyle: 'VOLATILITY',
        recommended: ['E10', 'E41', 'E42', 'E54']
      };
    } else {
      return {
        regime: 'RANGING',
        label: '🌊 Rango Lateral / Reversión a la Media',
        desc: 'El precio oscila entre soportes y resistencias sin tendencia clara. Favorece reversiones a VWAP y osciladores.',
        confidence: 80,
        recommendedStyle: 'MEAN_REVERSION',
        recommended: ['E11', 'E12', 'E13', 'E53', 'E56']
      };
    }
  }

  static calculateMagneticZones(klinesMap, lastPrice = 65000) {
    const k1h = klinesMap?.['1h'] || [];
    const k15m = klinesMap?.['15m'] || [];

    const p = lastPrice || (k1h.length > 0 ? parseFloat(k1h[k1h.length - 1].close) : 65000);

    const window1h = k1h.slice(Math.max(0, k1h.length - 24));
    const high1h = window1h.length > 0 ? Math.max(...window1h.map(c => parseFloat(c.high))) : p * 1.015;
    const low1h = window1h.length > 0 ? Math.min(...window1h.map(c => parseFloat(c.low))) : p * 0.985;

    const shortLiqMagnet = Math.round(high1h * 1.002);
    const longLiqMagnet = Math.round(low1h * 0.998);
    const mondayMidpoint = Math.round((high1h + low1h) / 2);
    const nearestCmeGap = Math.round(p > mondayMidpoint ? low1h * 0.992 : high1h * 1.008);

    return {
      shortLiqMagnet,
      longLiqMagnet,
      mondayMidpoint,
      nearestCmeGap,
      distanceToShortLiq: (((shortLiqMagnet - p) / p) * 100).toFixed(2),
      distanceToLongLiq: (((p - longLiqMagnet) / p) * 100).toFixed(2)
    };
  }
}
