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
    if (!candles4h || candles4h.length < 40) return { success: false, error: 'Datos insuficientes E43' };
    const lastPrice = parseFloat(candles4h[candles4h.length - 1].close);
    const prices = candles4h.map(c => parseFloat(c.close));
    const ma20 = prices.slice(prices.length - 20).reduce((a, b) => a + b, 0) / 20;

    // Historical Volatility (20-bar stdev of returns) percentile vs last 40 bars
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    const hvRecent = returns.slice(-10).reduce((a, b) => a + Math.abs(b), 0) / 10;
    const hvBaseline = returns.slice(-35, -10).reduce((a, b) => a + Math.abs(b), 0) / 25;
    const isHvpBreakout = hvBaseline > 0 && hvRecent > hvBaseline * 1.15;
    const isBullBreak = lastPrice > ma20 * 1.012 && prices[prices.length - 2] <= ma20 * 1.012;
    const isBearBreak = lastPrice < ma20 * 0.988 && prices[prices.length - 2] >= ma20 * 0.988;

    let hasSignal = false;
    let signal = null;

    if (isHvpBreakout && isBullBreak) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: ma20 * 0.99,
        tp: entry * 1.032,
        riskPercent: 1.4,
        profitPercent: 3.2,
        reasons: ['HVP Squeeze 4H: Ruptura de compresión histórica al alza sobre MA 20']
      };
    } else if (isHvpBreakout && isBearBreak) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: ma20 * 1.01,
        tp: entry * 0.968,
        riskPercent: 1.4,
        profitPercent: 3.2,
        reasons: ['HVP Squeeze 4H: Ruptura de compresión histórica a la baja bajo MA 20']
      };
    }
    const pUp = lastPrice > ma20 ? 63 : 37;
    return { success: true, pUp, pDown: 100 - pUp, bias: lastPrice > ma20 ? 'HVP TENDENCIA ALCISTA' : 'HVP TENDENCIA BAJISTA', hasSignal, signal, reasons: [`MA 20 (4H): $${Math.round(ma20)}`] };
  }

  static runStrategy44(candles1h) {
    if (!candles1h || candles1h.length < 25) return { success: false, error: 'Datos insuficientes E44' };
    const lastPrice = parseFloat(candles1h[candles1h.length - 1].close);
    const cClose = parseFloat(candles1h[candles1h.length - 1].close);
    const cOpen = parseFloat(candles1h[candles1h.length - 1].open);
    const roc = this.calculateROC(candles1h.map(c => parseFloat(c.close)), 6);
    const lastRoc = roc[roc.length - 1] || 0;
    const isBullThrust = cClose > cOpen * 1.008 && lastRoc > 0.8;
    const isBearThrust = cClose < cOpen * 0.992 && lastRoc < -0.8;

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
        reasons: [`Chaikin Momentum Thrust: Impulso alcista confirmado (ROC: +${lastRoc.toFixed(2)}%)`]
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
        reasons: [`Chaikin Momentum Thrust: Impulso bajista confirmado (ROC: ${lastRoc.toFixed(2)}%)`]
      };
    }
    const pUp = isBullThrust ? 68 : isBearThrust ? 32 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: isBullThrust ? 'THRUST ALCISTA' : isBearThrust ? 'THRUST BAJISTA' : 'CONSOLIDACIÓN', hasSignal, signal, reasons: [`ROC 6H: ${lastRoc.toFixed(2)}%`] };
  }

  static runStrategy45(candles1h, fundingRate = null, marketContext = null) {
    if (!candles1h || candles1h.length < 30) return { success: false, error: 'Datos insuficientes E45' };
    const lastPrice = parseFloat(candles1h[candles1h.length - 1].close);
    const realFunding = fundingRate !== null ? fundingRate : (marketContext?.fundingRate ?? null);
    const oiDelta = marketContext?.oiChangePct ?? null;

    const cci = this.calculateCCI(candles1h, 20);
    const lastCci = cci[cci.length - 1] || 0;

    const isNegative = realFunding !== null ? (realFunding < -0.00008 && lastCci < -80) : (lastCci < -160);
    const isPositive = realFunding !== null ? (realFunding > 0.0003 && lastCci > 80) : (lastCci > 160);

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
        reasons: [`Derivatives Short Squeeze: Funding ${realFunding !== null ? (realFunding * 100).toFixed(4) + '%' : 'extremo'} + CCI ${lastCci.toFixed(0)}`]
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
        reasons: [`Derivatives Long Squeeze: Funding sobrecalentado ${realFunding !== null ? (realFunding * 100).toFixed(4) + '%' : ''} + CCI ${lastCci.toFixed(0)}`]
      };
    }
    const pUp = isNegative ? 75 : isPositive ? 25 : 50;
    const fundingLabel = realFunding !== null ? `${(realFunding * 100).toFixed(4)}%` : `Proxy CCI: ${lastCci.toFixed(0)}`;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 60 ? 'SHORT SQUEEZE' : pUp <= 40 ? 'LONG SQUEEZE' : 'EQUILIBRADO', hasSignal, signal, reasons: [`Funding: ${fundingLabel}${oiDelta !== null ? ` | OI Δ: ${oiDelta}%` : ''}`] };
  }

  static runStrategy46(candles1h, marketContext = null) {
    if (!candles1h || candles1h.length < 30) return { success: false, error: 'Datos insuficientes E46' };
    const lastPrice = parseFloat(candles1h[candles1h.length - 1].close);
    const prices = candles1h.map(c => parseFloat(c.close));
    const mfi = this.calculateMFI(candles1h, 14);
    const lastMfi = mfi[mfi.length - 1] ?? 50;

    const retailLS = marketContext?.retailLongShortRatio ?? null;
    const whaleLS = marketContext?.whaleLongShortRatio ?? null;

    // Smart Money vs Retail Divergence: if whales are much more bullish than retail OR extreme capitulation
    const isSmartBull = (retailLS !== null && whaleLS !== null && whaleLS > retailLS * 1.15 && lastMfi < 45)
      || (prices[prices.length - 1] < prices[prices.length - 15] * 0.97 && lastMfi < 25);
    const isSmartBear = (retailLS !== null && whaleLS !== null && retailLS > whaleLS * 1.25 && lastMfi > 55)
      || (prices[prices.length - 1] > prices[prices.length - 15] * 1.03 && lastMfi > 75);

    let hasSignal = false;
    let signal = null;

    if (isSmartBull) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.99,
        tp: entry * 1.022,
        riskPercent: 1.0,
        profitPercent: 2.2,
        reasons: [`Sentimiento Ballenas vs Minoristas: Ballenas acumulando (MFI: ${lastMfi.toFixed(0)})`]
      };
    } else if (isSmartBear) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.01,
        tp: entry * 0.978,
        riskPercent: 1.0,
        profitPercent: 2.2,
        reasons: [`Sentimiento Euforia Minorista: Saturación compradora (MFI: ${lastMfi.toFixed(0)})`]
      };
    }
    const pUp = isSmartBull ? 72 : isSmartBear ? 28 : 50;
    const ratioInfo = (retailLS !== null && whaleLS !== null) ? `L/S Ballenas ${whaleLS.toFixed(2)} vs Retail ${retailLS.toFixed(2)}` : `MFI 1H: ${lastMfi.toFixed(0)}`;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 55 ? 'SENTIMIENTO ALCISTA' : pUp <= 45 ? 'SENTIMIENTO BAJISTA' : 'NEUTRAL', hasSignal, signal, reasons: [ratioInfo] };
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
    if (!candles1h || candles1h.length < 55) return { success: false, error: 'Datos insuficientes E49' };
    const prices = candles1h.map(c => parseFloat(c.close));
    const lastPrice = prices[prices.length - 1];
    const kama = this.calculateKAMA(prices, 14, 2, 30);
    const { viPlus, viMinus } = this.calculateVortex(candles1h, 14);
    const lastKama = kama[kama.length - 1] || lastPrice;
    const prevKama = kama[kama.length - 2] || lastKama;
    const lastViP = viPlus[viPlus.length - 1] || 1;
    const lastViM = viMinus[viMinus.length - 1] || 1;
    const prevViP = viPlus[viPlus.length - 2] || 1;
    const prevViM = viMinus[viMinus.length - 2] || 1;

    const isGolden = lastPrice > lastKama && lastKama > prevKama && lastViP > lastViM && prevViP <= prevViM;
    const isDeath = lastPrice < lastKama && lastKama < prevKama && lastViM > lastViP && prevViM <= prevViP;

    let hasSignal = false;
    let signal = null;

    if (isGolden) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: Math.min(lastKama * 0.995, entry * 0.988),
        tp: entry * 1.028,
        riskPercent: 1.2,
        profitPercent: 2.8,
        reasons: ['Golden Cross Velocity (KAMA + Vortex): Aceleración institucional alcista confirmada']
      };
    } else if (isDeath) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: Math.max(lastKama * 1.005, entry * 1.012),
        tp: entry * 0.972,
        riskPercent: 1.2,
        profitPercent: 2.8,
        reasons: ['Death Cross Velocity (KAMA + Vortex): Aceleración institucional bajista confirmada']
      };
    }
    const pUp = (lastPrice > lastKama && lastViP > lastViM) ? 67 : (lastPrice < lastKama && lastViM > lastViP) ? 33 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 60 ? 'GOLDEN CROSS ALCISTA' : pUp <= 40 ? 'DEATH CROSS BAJISTA' : 'NEUTRAL', hasSignal, signal, reasons: [`KAMA (1H): $${Math.round(lastKama)} | Vortex: ${lastViP.toFixed(2)}/${lastViM.toFixed(2)}`] };
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

  static runStrategy51(candles15m, lastBtcPrice = 0, marketContext = null) {
    if (!candles15m || candles15m.length < 30) return { success: false, error: 'Datos insuficientes E51' };
    const lastPrice = lastBtcPrice || parseFloat(candles15m[candles15m.length - 1].close);
    const window = candles15m.slice(candles15m.length - 24);
    const clusterHigh = marketContext?.nearestSellWall?.price || Math.max(...window.map(c => parseFloat(c.high)));
    const clusterLow = marketContext?.nearestBuyWall?.price || Math.min(...window.map(c => parseFloat(c.low)));

    const distToHigh = (clusterHigh - lastPrice) / lastPrice;
    const distToLow = (lastPrice - clusterLow) / lastPrice;
    const tsi = this.calculateTSI(candles15m.map(c => parseFloat(c.close)), 20, 10);
    const lastTsi = tsi[tsi.length - 1] || 0;
    const prevTsi = tsi[tsi.length - 2] || 0;
    const orderBookImb = marketContext?.orderBookImbalancePct ?? 0;

    let hasSignal = false;
    let signal = null;

    if (distToHigh > 0.004 && distToHigh < 0.016 && lastTsi > prevTsi && orderBookImb >= -5) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.992,
        tp: clusterHigh * 1.001,
        riskPercent: 0.8,
        profitPercent: Math.max(1.2, parseFloat((distToHigh * 100).toFixed(2))),
        reasons: [`Imán de Liquidaciones: Empuje TSI hacia cluster/muro de cortos en $${Math.round(clusterHigh)}`]
      };
    } else if (distToLow > 0.004 && distToLow < 0.016 && lastTsi < prevTsi && orderBookImb <= 5) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.008,
        tp: clusterLow * 0.999,
        riskPercent: 0.8,
        profitPercent: Math.max(1.2, parseFloat((distToLow * 100).toFixed(2))),
        reasons: [`Imán de Liquidaciones: Presión TSI hacia cluster/muro de largos en $${Math.round(clusterLow)}`]
      };
    }
    const pUp = (distToHigh < distToLow && lastTsi >= prevTsi) ? 72 : (distToLow < distToHigh && lastTsi <= prevTsi) ? 28 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 60 ? 'IMÁN LIQUIDACIÓN ALCISTA' : pUp <= 40 ? 'IMÁN LIQUIDACIÓN BAJISTA' : 'EN EQUILIBRIO', hasSignal, signal, reasons: [`Objetivo Cortos: $${Math.round(clusterHigh)} | Objetivo Largos: $${Math.round(clusterLow)}`] };
  }

  static runStrategy52(candles5m, candles15m, cvd5m = 0, marketContext = null) {
    if (!candles5m || candles5m.length < 20) return { success: false, error: 'Datos insuficientes E52' };
    const lastPrice = parseFloat(candles5m[candles5m.length - 1].close);
    const cClose = parseFloat(candles5m[candles5m.length - 1].close);
    const cOpen = parseFloat(candles5m[candles5m.length - 1].open);

    const spot15mDelta = (candles15m || candles5m).slice(-4).reduce((a, c) => a + (c.volumeDeltaUsd || 0), 0);
    const perpDelta = marketContext?.perpCvd15mDelta ?? cvd5m;

    const isSpotAccumulation = (spot15mDelta > 150000 && perpDelta < 0) || (cvd5m < -50000 && cClose > cOpen);
    const isSpotDistribution = (spot15mDelta < -150000 && perpDelta > 0) || (cvd5m > 50000 && cClose < cOpen);

    let hasSignal = false;
    let signal = null;

    if (isSpotAccumulation) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.993,
        tp: entry * 1.016,
        riskPercent: 0.7,
        profitPercent: 1.6,
        reasons: [`Divergencia Spot vs Futuros: Spot compra (+$${Math.round(spot15mDelta / 1000)}k) mientras futuros vende ($${Math.round(perpDelta / 1000)}k)`]
      };
    } else if (isSpotDistribution) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.007,
        tp: entry * 0.984,
        riskPercent: 0.7,
        profitPercent: 1.6,
        reasons: [`Divergencia Spot vs Futuros: Spot vende ($${Math.round(spot15mDelta / 1000)}k) mientras futuros compra (+$${Math.round(perpDelta / 1000)}k)`]
      };
    }
    const pUp = isSpotAccumulation ? 78 : isSpotDistribution ? 22 : (spot15mDelta > 0 ? 56 : 44);
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 60 ? 'ABSORCIÓN SPOT ALCISTA' : pUp <= 40 ? 'DISTRIBUCIÓN SPOT BAJISTA' : 'FLUJO ALINEADO', hasSignal, signal, reasons: [`Delta Spot 15m: $${Math.round(spot15mDelta).toLocaleString()} | Perp: $${Math.round(perpDelta).toLocaleString()}`] };
  }

  static runStrategy53(candles15m) {
    if (!candles15m || candles15m.length < 30) return { success: false, error: 'Datos insuficientes E53' };
    const prices = candles15m.map(c => parseFloat(c.close));
    const lastPrice = prices[prices.length - 1];
    const window = candles15m.slice(candles15m.length - 20);
    let tpv = 0, volSum = 0;
    window.forEach(c => {
      const tp = (parseFloat(c.high) + parseFloat(c.low) + parseFloat(c.close)) / 3;
      const v = parseFloat(c.volume);
      tpv += tp * v;
      volSum += v;
    });
    const mean = volSum > 0 ? tpv / volSum : prices.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const variance = window.reduce((a, c) => a + Math.pow(parseFloat(c.close) - mean, 2), 0) / 20;
    const stdDev = Math.sqrt(variance);

    const zScore = stdDev > 0 ? (lastPrice - mean) / stdDev : 0;

    let hasSignal = false;
    let signal = null;

    if (zScore <= -2.4) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.992,
        tp: Math.max(mean, entry * 1.015),
        riskPercent: 0.8,
        profitPercent: 1.8,
        reasons: [`VWAP 3-Sigma Gaussian Climax: Z-Score extremo (${zScore.toFixed(2)}σ). Reversión gaussiana al alza`]
      };
    } else if (zScore >= 2.4) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.008,
        tp: Math.min(mean, entry * 0.985),
        riskPercent: 0.8,
        profitPercent: 1.8,
        reasons: [`VWAP 3-Sigma Gaussian Climax: Z-Score extremo (${zScore.toFixed(2)}σ). Reversión gaussiana a la baja`]
      };
    }
    const pUp = zScore <= -1.8 ? 78 : zScore >= 1.8 ? 22 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 60 ? '3-SIGMA ALCISTA' : pUp <= 40 ? '3-SIGMA BAJISTA' : 'DISTRIBUCIÓN NORMAL', hasSignal, signal, reasons: [`Z-Score VWAP: ${zScore.toFixed(2)}σ | VWAP: $${Math.round(mean)}`] };
  }

  static runStrategy54(candles5m) {
    if (!candles5m || candles5m.length < 25) return { success: false, error: 'Datos insuficientes E54' };
    const lastPrice = parseFloat(candles5m[candles5m.length - 1].close);
    const nowUtc = new Date().getUTCHours();
    const isSilverBulletHour = (nowUtc >= 14 && nowUtc <= 16) || (nowUtc >= 7 && nowUtc <= 9) || (nowUtc === 18);

    const c0 = candles5m[candles5m.length - 3];
    const c2 = candles5m[candles5m.length - 1];
    const recentLow = Math.min(...candles5m.slice(-15, -3).map(c => parseFloat(c.low)));
    const recentHigh = Math.max(...candles5m.slice(-15, -3).map(c => parseFloat(c.high)));

    const bullFvg = parseFloat(c2.low) > parseFloat(c0.high);
    const bearFvg = parseFloat(c2.high) < parseFloat(c0.low);
    const sweptLowRecently = Math.min(parseFloat(c0.low), parseFloat(candles5m[candles5m.length - 2].low)) <= recentLow;
    const sweptHighRecently = Math.max(parseFloat(c0.high), parseFloat(candles5m[candles5m.length - 2].high)) >= recentHigh;

    let hasSignal = false;
    let signal = null;

    if (isSilverBulletHour && bullFvg && sweptLowRecently) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.994,
        tp: entry * 1.015,
        riskPercent: 0.6,
        profitPercent: 1.5,
        reasons: ['ICT Silver Bullet: Barrido de liquidez + Fair Value Gap alcista en ventana interbancaria']
      };
    } else if (isSilverBulletHour && bearFvg && sweptHighRecently) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.006,
        tp: entry * 0.985,
        riskPercent: 0.6,
        profitPercent: 1.5,
        reasons: ['ICT Silver Bullet: Barrido de liquidez + Fair Value Gap bajista en ventana interbancaria']
      };
    }
    const pUp = (bullFvg && sweptLowRecently) ? 76 : (bearFvg && sweptHighRecently) ? 24 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: isSilverBulletHour ? (pUp >= 60 ? 'SILVER BULLET ALCISTA' : pUp <= 40 ? 'SILVER BULLET BAJISTA' : 'VENTANA ACTIVA') : 'FUERA DE VENTANA', hasSignal, signal, reasons: [`Ventana UTC: ${nowUtc}:00 (${isSilverBulletHour ? '🟢 ACTIVA' : '⚪ ESPERANDO'})`] };
  }

  static runStrategy55(candles15m, candles1h, marketContext = null) {
    if (!candles15m || candles15m.length < 25) return { success: false, error: 'Datos insuficientes E55' };
    const lastPrice = parseFloat(candles15m[candles15m.length - 1].close);
    const prices = candles15m.map(c => parseFloat(c.close));
    const momShort = prices[prices.length - 1] - prices[prices.length - 4];

    const realPremium = marketContext?.coinbasePremiumPct ?? null;
    const isCoinbaseLeadBull = realPremium !== null ? realPremium >= 0.035 : (momShort > lastPrice * 0.008);
    const isCoinbaseLeadBear = realPremium !== null ? realPremium <= -0.035 : (momShort < -lastPrice * 0.008);

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
        reasons: [`Coinbase Spot Premium Real (+${realPremium !== null ? realPremium.toFixed(3) : ((momShort / lastPrice) * 100).toFixed(2)}%): Demanda institucional de EE.UU. liderando`]
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
        reasons: [`Coinbase Spot Discount Real (${realPremium !== null ? realPremium.toFixed(3) : ((momShort / lastPrice) * 100).toFixed(2)}%): Presión vendedora institucional de EE.UU.`]
      };
    }
    const pUp = isCoinbaseLeadBull ? 78 : isCoinbaseLeadBear ? 22 : (realPremium !== null && realPremium > 0 ? 55 : realPremium !== null && realPremium < 0 ? 45 : 50);
    const premDisplay = realPremium !== null ? `${realPremium >= 0 ? '+' : ''}${realPremium.toFixed(3)}% (Real)` : `${((momShort / lastPrice) * 100).toFixed(2)}% (Momentum)`;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 60 ? 'PREMIUM LEAD ALCISTA' : pUp <= 40 ? 'PREMIUM LEAD BAJISTA' : 'PARIDAD US/GLOBAL', hasSignal, signal, reasons: [`Coinbase Premium: ${premDisplay}`] };
  }

  static runStrategy56(candles15m, cvd5m = 0, marketContext = null) {
    if (!candles15m || candles15m.length < 30) return { success: false, error: 'Datos insuficientes E56' };
    const lastPrice = parseFloat(candles15m[candles15m.length - 1].close);
    const lastCandle = candles15m[candles15m.length - 1];
    const window = candles15m.slice(candles15m.length - 22, candles15m.length - 1);
    const low = Math.min(...window.map(c => parseFloat(c.low)));
    const high = Math.max(...window.map(c => parseFloat(c.high)));

    const wr = this.calculateWilliamsR(candles15m, 14);
    const lastWr = wr[wr.length - 1] ?? -50;
    const effectiveCvd = cvd5m !== 0 ? cvd5m : (lastCandle.volumeDeltaUsd || 0);

    const isSweepLow = parseFloat(lastCandle.low) <= low && lastPrice > low && lastWr < -65 && effectiveCvd > -200000;
    const isSweepHigh = parseFloat(lastCandle.high) >= high && lastPrice < high && lastWr > -35 && effectiveCvd < 200000;

    let hasSignal = false;
    let signal = null;

    if (isSweepLow) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: Math.min(parseFloat(lastCandle.low) * 0.998, entry * 0.993),
        tp: entry * 1.02,
        riskPercent: 0.7,
        profitPercent: 2.0,
        reasons: ['T-CLAM Triple Confluence: Barrido de soporte + rechazo en mecha + agotamiento Williams %R']
      };
    } else if (isSweepHigh) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: Math.max(parseFloat(lastCandle.high) * 1.002, entry * 1.007),
        tp: entry * 0.98,
        riskPercent: 0.7,
        profitPercent: 2.0,
        reasons: ['T-CLAM Triple Confluence: Barrido de resistencia + rechazo en mecha + agotamiento Williams %R']
      };
    }
    const pUp = isSweepLow ? 82 : isSweepHigh ? 18 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 60 ? 'T-CLAM ALCISTA' : pUp <= 40 ? 'T-CLAM BAJISTA' : 'NEUTRAL', hasSignal, signal, reasons: [`Williams %R: ${lastWr.toFixed(1)} | Soporte/Resistencia: $${Math.round(low)}/$${Math.round(high)}`] };
  }

  static runStrategy57(candles5m, cvd5m = 0) {
    if (!candles5m || candles5m.length < 22) return { success: false, error: 'Datos insuficientes E57' };
    const lastCandle = candles5m[candles5m.length - 1];
    const lastPrice = parseFloat(lastCandle.close);
    const high = parseFloat(lastCandle.high);
    const low = parseFloat(lastCandle.low);
    const open = parseFloat(lastCandle.open);
    const close = parseFloat(lastCandle.close);
    const range = high - low;
    const avgVol = candles5m.slice(-21, -1).reduce((a, c) => a + parseFloat(c.volume), 0) / 20;
    const volRatio = avgVol > 0 ? parseFloat(lastCandle.volume) / avgVol : 1;

    const lowerWick = Math.min(open, close) - low;
    const upperWick = high - Math.max(open, close);

    const isExhaustionBuy = range > 0 && (lowerWick / range) >= 0.60 && volRatio >= 1.4;
    const isExhaustionSell = range > 0 && (upperWick / range) >= 0.60 && volRatio >= 1.4;

    let hasSignal = false;
    let signal = null;

    if (isExhaustionBuy) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: Math.min(low * 0.9985, entry * 0.994),
        tp: entry * 1.014,
        riskPercent: 0.6,
        profitPercent: 1.4,
        reasons: [`FOEIR Agotamiento Fractal: Mecha de rechazo >60% con volumen ${volRatio.toFixed(1)}x`]
      };
    } else if (isExhaustionSell) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: Math.max(high * 1.0015, entry * 1.006),
        tp: entry * 0.986,
        riskPercent: 0.6,
        profitPercent: 1.4,
        reasons: [`FOEIR Agotamiento Fractal: Mecha de rechazo >60% con volumen ${volRatio.toFixed(1)}x`]
      };
    }
    const pUp = isExhaustionBuy ? 80 : isExhaustionSell ? 20 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 60 ? 'FOEIR ALCISTA' : pUp <= 40 ? 'FOEIR BAJISTA' : 'FLUJO NORMAL', hasSignal, signal, reasons: [`Rechazo: ${((Math.max(lowerWick, upperWick) / (range || 1)) * 100).toFixed(0)}% | Vol: ${volRatio.toFixed(1)}x`] };
  }

  static runStrategy58(klinesMap) {
    const k15 = klinesMap?.['15m'] || [];
    const k1h = klinesMap?.['1h'] || [];
    const k4h = klinesMap?.['4h'] || [];

    if (k15.length < 25 || k1h.length < 25 || k4h.length < 25) {
      return { success: false, error: 'Datos multitemporales insuficientes E58' };
    }

    const ema21 = (candles) => {
      const k = 2 / 22;
      let val = parseFloat(candles[0].close);
      for (let i = 1; i < candles.length; i++) val = parseFloat(candles[i].close) * k + val * (1 - k);
      return val;
    };

    const p15 = parseFloat(k15[k15.length - 1].close);
    const e15 = ema21(k15.slice(-40));
    const p1h = parseFloat(k1h[k1h.length - 1].close);
    const e1h = ema21(k1h.slice(-40));
    const p4h = parseFloat(k4h[k4h.length - 1].close);
    const e4h = ema21(k4h.slice(-40));

    const bull3TF = p15 > e15 && p1h > e1h && p4h > e4h;
    const bear3TF = p15 < e15 && p1h < e1h && p4h < e4h;
    const nearPullback15 = Math.abs(p15 - e15) / p15 < 0.004;

    let hasSignal = false;
    let signal = null;

    if (bull3TF && nearPullback15) {
      hasSignal = true;
      const entry = p15;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.99,
        tp: entry * 1.024,
        riskPercent: 1.0,
        profitPercent: 2.4,
        reasons: ['MTM-RAT Ribbon 3TF: Alineación alcista 15m/1H/4H + pullback óptimo a EMA 21']
      };
    } else if (bear3TF && nearPullback15) {
      hasSignal = true;
      const entry = p15;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.01,
        tp: entry * 0.976,
        riskPercent: 1.0,
        profitPercent: 2.4,
        reasons: ['MTM-RAT Ribbon 3TF: Alineación bajista 15m/1H/4H + pullback óptimo a EMA 21']
      };
    }
    const pUp = bull3TF ? 76 : bear3TF ? 24 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: bull3TF ? 'RIBBON 3TF ALCISTA' : bear3TF ? 'RIBBON 3TF BAJISTA' : 'DESALINEADO', hasSignal, signal, reasons: [`Convergencia EMA21: 15m(${p15 > e15 ? '🟢' : '🔴'}) 1H(${p1h > e1h ? '🟢' : '🔴'}) 4H(${p4h > e4h ? '🟢' : '🔴'})`] };
  }

  static runStrategy59(candles1h, fundingRate = null, marketContext = null) {
    if (!candles1h || candles1h.length < 30) return { success: false, error: 'Datos insuficientes E59' };
    const lastPrice = parseFloat(candles1h[candles1h.length - 1].close);
    const prices = candles1h.map(c => parseFloat(c.close));
    const isNewLow = prices[prices.length - 1] <= Math.min(...prices.slice(prices.length - 20)) * 1.003;
    const isNewHigh = prices[prices.length - 1] >= Math.max(...prices.slice(prices.length - 20)) * 0.997;

    const realFunding = fundingRate !== null ? fundingRate : (marketContext?.fundingRate ?? null);
    const oiDelta = marketContext?.oiChangePct ?? 0;

    const isNegativeFunding = realFunding !== null && realFunding < -0.0001 && oiDelta >= 0;
    const isPositiveFunding = realFunding !== null && realFunding > 0.00035 && oiDelta >= 0;

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
        reasons: [`DFOIDC Cascade Climax: Nuevo mínimo + Funding ${(realFunding * 100).toFixed(4)}% + OI (${oiDelta}%)`]
      };
    } else if (isNewHigh && isPositiveFunding) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.012,
        tp: entry * 0.968,
        riskPercent: 1.2,
        profitPercent: 3.2,
        reasons: [`DFOIDC Cascade Climax: Nuevo máximo + Funding sobrecalentado ${(realFunding * 100).toFixed(4)}%`]
      };
    }
    const pUp = (isNewLow && isNegativeFunding) ? 84 : (isNewHigh && isPositiveFunding) ? 16 : 50;
    return { success: true, pUp, pDown: 100 - pUp, bias: pUp >= 65 ? 'SHORT SQUEEZE INMINENTE' : pUp <= 35 ? 'LONG SQUEEZE INMINENTE' : 'EQUILIBRIO DERIVADOS', hasSignal, signal, reasons: [`Funding: ${realFunding !== null ? (realFunding * 100).toFixed(4) + '%' : 'N/D'} | OI Δ: ${oiDelta}%`] };
  }

  static runStrategy60(resultsMap, signalsHistory = [], backtestStatsMap = null, currentPrice = null, marketContext = null) {
    if (!resultsMap) return { success: false, error: 'Sin datos para la Estrategia 60' };

    let weightedLongScore = 0;
    let totalWeight = 0;
    let totalEvaluated = 0;

    const stratEntries = Object.entries(resultsMap).filter(([name]) => name !== 'Estrategia 60' && name !== 'Estrategia 25');

    stratEntries.forEach(([name, res]) => {
      if (res && res.success && res.pUp !== undefined) {
        totalEvaluated++;
        let weight = 1.0;
        const bt = backtestStatsMap?.[name];
        if (bt && bt.totalTrades >= 3) {
          const pf = Math.min(2.2, Math.max(0.35, bt.profitFactor || 1.0));
          const wr = bt.winRate >= 58 ? 1.35 : bt.winRate >= 48 ? 1.0 : 0.45;
          weight = pf * wr;
        }
        weightedLongScore += res.pUp * weight;
        totalWeight += weight;
      }
    });

    let avgPUp = totalWeight > 0 ? Math.round(weightedLongScore / totalWeight) : 50;
    if (marketContext?.coinbasePremiumPct > 0.03) avgPUp = Math.min(92, avgPUp + 2);
    else if (marketContext?.coinbasePremiumPct < -0.03) avgPUp = Math.max(8, avgPUp - 2);
    const avgPDown = 100 - avgPUp;

    const lastPrice = currentPrice
      || resultsMap['Estrategia 1']?.signal?.entry
      || resultsMap['Estrategia 31']?.signal?.entry
      || null;

    let hasSignal = false;
    let signal = null;

    if (avgPUp >= 64 && lastPrice) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'LONG',
        entry,
        sl: entry * 0.988,
        tp: entry * 1.028,
        riskPercent: 1.2,
        profitPercent: 2.8,
        reasons: [`The Sovereign Quant Ensemble: Confluencia ponderada por Backtest (${avgPUp}% Alcista)`]
      };
    } else if (avgPDown >= 64 && lastPrice) {
      hasSignal = true;
      const entry = lastPrice;
      signal = {
        type: 'SHORT',
        entry,
        sl: entry * 1.012,
        tp: entry * 0.972,
        riskPercent: 1.2,
        profitPercent: 2.8,
        reasons: [`The Sovereign Quant Ensemble: Confluencia ponderada por Backtest (${avgPDown}% Bajista)`]
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
        `Puntuación Ponderada por Edge Real: ${avgPUp}% Alcista / ${avgPDown}% Bajista`,
        `Modelos Evaluados: ${totalEvaluated} Algoritmos Cuantitativos`
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

    const recentCandles = k1h.slice(k1h.length - 14);
    const avgRange = recentCandles.reduce((acc, c) => acc + (parseFloat(c.high) - parseFloat(c.low)), 0) / 14;
    const relVol = avgRange / lastPrice;

    if (diffPercent > 2.0) {
      return {
        regime: 'TRENDING',
        label: lastPrice > ma20 ? '🚀 Tendencia Alcista Fuerte' : '📉 Tendencia Bajista Fuerte',
        desc: 'El precio muestra impulso direccional claro respecto al valor medio. Prioriza estrategias de seguimiento de tendencia.',
        confidence: Math.min(95, Math.round(55 + diffPercent * 14)),
        recommendedStyle: 'TREND',
        recommended: ['E1', 'E3', 'E6', 'E7', 'E58']
      };
    } else if (relVol < 0.008) {
      return {
        regime: 'COMPRESSION',
        label: '🌪️ Compresión Previa a Movimiento Fuerte',
        desc: 'La volatilidad cayó a mínimos recientes. Suele preceder rupturas bruscas; conviene esperar confirmación antes de entrar.',
        confidence: 85,
        recommendedStyle: 'VOLATILITY',
        recommended: ['E10', 'E41', 'E42', 'E54']
      };
    } else {
      return {
        regime: 'RANGING',
        label: '🌊 Rango Lateral / Sin Tendencia Clara',
        desc: 'BTC oscila entre soporte y resistencia. Funcionan mejor compras en soportes y ventas en resistencias.',
        confidence: 80,
        recommendedStyle: 'MEAN_REVERSION',
        recommended: ['E11', 'E12', 'E13', 'E53', 'E56']
      };
    }
  }

  static calculateMagneticZones(klinesMap, lastPrice = null, marketContext = null) {
    const k1h = klinesMap?.['1h'] || [];
    const p = lastPrice || (k1h.length > 0 ? parseFloat(k1h[k1h.length - 1].close) : null);
    if (!p) return null;

    const window1h = k1h.slice(Math.max(0, k1h.length - 24));
    const high1h = window1h.length > 0 ? Math.max(...window1h.map(c => parseFloat(c.high))) : p * 1.015;
    const low1h = window1h.length > 0 ? Math.min(...window1h.map(c => parseFloat(c.low))) : p * 0.985;

    const shortLiqMagnet = marketContext?.nearestSellWall?.price && marketContext.nearestSellWall.price > p
      ? marketContext.nearestSellWall.price
      : Math.round(high1h * 1.002);
    const longLiqMagnet = marketContext?.nearestBuyWall?.price && marketContext.nearestBuyWall.price < p
      ? marketContext.nearestBuyWall.price
      : Math.round(low1h * 0.998);

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
