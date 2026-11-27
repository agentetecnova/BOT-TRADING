/**
 * ExpertAlphaStrategies.js
 *
 * 10 Estrategias Cuantitativas Diferenciales (E61 a E70):
 * Diseñadas con mecanismos distintos (sin solapamiento redundante), stops y objetivos
 * dinámicos basados en ATR real, y frecuencia balanceada (calidad sobre ruido horario).
 */

function ema(values, period) {
  if (!values || values.length === 0) return [];
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

function rsi(values, period = 14) {
  const out = new Array(values.length).fill(50);
  if (values.length <= period) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function atr(candles, period = 14) {
  const out = new Array(candles.length).fill(0);
  if (candles.length < 2) return out;
  const trs = [parseFloat(candles[0].high) - parseFloat(candles[0].low)];
  for (let i = 1; i < candles.length; i++) {
    const h = parseFloat(candles[i].high);
    const l = parseFloat(candles[i].low);
    const pc = parseFloat(candles[i - 1].close);
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    if (i < period) {
      sum += trs[i];
      out[i] = sum / (i + 1);
    } else {
      out[i] = (out[i - 1] * (period - 1) + trs[i]) / period;
    }
  }
  return out;
}

function buildSignal(type, entry, slDist, tpDist, reasons) {
  const sl = type === 'LONG' ? entry - slDist : entry + slDist;
  const tp = type === 'LONG' ? entry + tpDist : entry - tpDist;
  return {
    type,
    entry,
    sl,
    tp,
    riskPercent: parseFloat(((slDist / entry) * 100).toFixed(2)),
    profitPercent: parseFloat(((tpDist / entry) * 100).toFixed(2)),
    reasons
  };
}

function wrapResult({ hasSignal, signal, pUp, biasLong, biasShort, biasNeutral, reasons }) {
  const p = Math.max(15, Math.min(85, Math.round(pUp)));
  return {
    success: true,
    pUp: p,
    pDown: 100 - p,
    bias: hasSignal ? (signal.type === 'LONG' ? biasLong : biasShort) : biasNeutral,
    hasSignal,
    signal,
    reasons
  };
}

export class ExpertAlphaStrategies {
  // E61: Regime-Adaptive Pullback (Alineación Tendencia Macro + Retroceso a Zona de Valor)
  static runStrategy61(k1h, k4h = null) {
    if (!k1h || k1h.length < 60) return { success: false, error: 'Datos insuficientes E61' };
    const closes = k1h.map(c => parseFloat(c.close));
    const vols = k1h.map(c => parseFloat(c.volume));
    const n = closes.length - 1;
    const lastPrice = closes[n];
    const e21 = ema(closes, 21);
    const e55 = ema(closes, 55);
    const r = rsi(closes, 14);
    const a = atr(k1h, 14);
    const avgVol = vols.slice(-21, -1).reduce((s, v) => s + v, 0) / 20;

    let macroBull = e21[n] > e55[n];
    let macroBear = e21[n] < e55[n];
    if (k4h && k4h.length >= 55) {
      const c4 = k4h.map(c => parseFloat(c.close));
      const e50_4 = ema(c4, 50);
      macroBull = macroBull && c4[c4.length - 1] > e50_4[e50_4.length - 1];
      macroBear = macroBear && c4[c4.length - 1] < e50_4[e50_4.length - 1];
    }

    const volBoost = vols[n] > avgVol * 1.1;
    const prevLow = parseFloat(k1h[n - 1].low);
    const prevHigh = parseFloat(k1h[n - 1].high);
    const longTrig = macroBull && prevLow <= e21[n - 1] * 1.002 && lastPrice > e21[n] && r[n] >= 42 && r[n] <= 62 && volBoost;
    const shortTrig = macroBear && prevHigh >= e21[n - 1] * 0.998 && lastPrice < e21[n] && r[n] >= 38 && r[n] <= 58 && volBoost;

    const effAtr = Math.max(a[n], lastPrice * 0.005);
    const reasons = [
      `Tendencia 1H/4H: ${macroBull ? 'ALCISTA' : macroBear ? 'BAJISTA' : 'MIXTA'}`,
      `RSI(14): ${r[n].toFixed(1)} | Volumen ${(vols[n] / (avgVol || 1)).toFixed(2)}x`
    ];
    let hasSignal = false;
    let signal = null;
    if (longTrig) {
      hasSignal = true;
      signal = buildSignal('LONG', lastPrice, effAtr * 1.3, effAtr * 2.5, [...reasons, 'Pullback limpio a EMA21 con rebote confirmado']);
    } else if (shortTrig) {
      hasSignal = true;
      signal = buildSignal('SHORT', lastPrice, effAtr * 1.3, effAtr * 2.5, [...reasons, 'Rechazo en EMA21 dentro de tendencia bajista']);
    }
    const pUp = longTrig ? 69 : shortTrig ? 31 : (macroBull ? 57 : macroBear ? 43 : 50);
    return wrapResult({ hasSignal, signal, pUp, biasLong: 'PULLBACK ALCISTA MTF', biasShort: 'PULLBACK BAJISTA MTF', biasNeutral: 'ESPERANDO RETROCESO', reasons });
  }

  // E62: Compression Breakout + Taker Buy Aggression (Salida de Squeeze con Flujo Real)
  static runStrategy62(k1h) {
    if (!k1h || k1h.length < 50) return { success: false, error: 'Datos insuficientes E62' };
    const closes = k1h.map(c => parseFloat(c.close));
    const vols = k1h.map(c => parseFloat(c.volume));
    const n = closes.length - 1;
    const lastPrice = closes[n];
    const a = atr(k1h, 14);

    const win20 = closes.slice(n - 19, n + 1);
    const mean20 = win20.reduce((s, v) => s + v, 0) / 20;
    const std20 = Math.sqrt(win20.reduce((s, v) => s + (v - mean20) ** 2, 0) / 20);
    const bbwNow = (4 * std20) / (mean20 || 1);

    const prevWin = closes.slice(n - 24, n - 4);
    const pMean = prevWin.reduce((s, v) => s + v, 0) / 20;
    const pStd = Math.sqrt(prevWin.reduce((s, v) => s + (v - pMean) ** 2, 0) / 20);
    const bbwPrev = (4 * pStd) / (pMean || 1);

    const avgVol = vols.slice(-21, -1).reduce((s, v) => s + v, 0) / 20;
    const buyRatio = k1h[n].buyRatio ?? 0.5;
    const wasCompressed = bbwPrev < 0.028 || bbwNow < 0.032;
    const longTrig = wasCompressed && lastPrice > mean20 + 1.5 * std20 && vols[n] > avgVol * 1.3 && buyRatio >= 0.54;
    const shortTrig = wasCompressed && lastPrice < mean20 - 1.5 * std20 && vols[n] > avgVol * 1.3 && buyRatio <= 0.46;

    const effAtr = Math.max(a[n], lastPrice * 0.005);
    const reasons = [
      `Ancho Bollinger: ${(bbwNow * 100).toFixed(2)}% | Taker Buy: ${(buyRatio * 100).toFixed(1)}%`,
      `Volumen relativo: ${(vols[n] / (avgVol || 1)).toFixed(2)}x`
    ];
    let hasSignal = false;
    let signal = null;
    if (longTrig) {
      hasSignal = true;
      signal = buildSignal('LONG', lastPrice, effAtr * 1.35, effAtr * 2.6, [...reasons, 'Ruptura de compresión con agresión compradora']);
    } else if (shortTrig) {
      hasSignal = true;
      signal = buildSignal('SHORT', lastPrice, effAtr * 1.35, effAtr * 2.6, [...reasons, 'Ruptura bajista de compresión con presión vendedora']);
    }
    const pUp = longTrig ? 68 : shortTrig ? 32 : 50;
    return wrapResult({ hasSignal, signal, pUp, biasLong: 'EXPANSIÓN ALCISTA TAKER', biasShort: 'EXPANSIÓN BAJISTA TAKER', biasNeutral: 'SIN EXPLOSIÓN DE RANGO', reasons });
  }

  // E63: Liquidity Sweep + Mean-Reversion Snap (Barrida de Stops + Recuperación)
  static runStrategy63(k15m) {
    if (!k15m || k15m.length < 40) return { success: false, error: 'Datos insuficientes E63' };
    const closes = k15m.map(c => parseFloat(c.close));
    const n = closes.length - 1;
    const c = k15m[n];
    const lastPrice = closes[n];
    const open = parseFloat(c.open);
    const high = parseFloat(c.high);
    const low = parseFloat(c.low);
    const range = Math.max(1e-6, high - low);
    const lowerWickPct = (Math.min(open, lastPrice) - low) / range;
    const upperWickPct = (high - Math.max(open, lastPrice)) / range;

    const priorLow = Math.min(...k15m.slice(n - 20, n).map(x => parseFloat(x.low)));
    const priorHigh = Math.max(...k15m.slice(n - 20, n).map(x => parseFloat(x.high)));
    const r = rsi(closes, 14);
    const a = atr(k15m, 14);

    const bullSweep = low < priorLow && lastPrice > priorLow && lowerWickPct >= 0.40 && r[n] <= 42;
    const bearSweep = high > priorHigh && lastPrice < priorHigh && upperWickPct >= 0.40 && r[n] >= 58;
    const effAtr = Math.max(a[n], lastPrice * 0.0035);
    const reasons = [
      `Mecha rechazo inf: ${(lowerWickPct * 100).toFixed(0)}% / sup: ${(upperWickPct * 100).toFixed(0)}%`,
      `RSI(14) 15m: ${r[n].toFixed(1)}`
    ];
    let hasSignal = false;
    let signal = null;
    if (bullSweep) {
      hasSignal = true;
      signal = buildSignal('LONG', lastPrice, effAtr * 1.25, effAtr * 2.25, [...reasons, 'Barrida de mínimos recuperada en el cierre']);
    } else if (bearSweep) {
      hasSignal = true;
      signal = buildSignal('SHORT', lastPrice, effAtr * 1.25, effAtr * 2.25, [...reasons, 'Barrida de máximos rechazada en el cierre']);
    }
    const pUp = bullSweep ? 67 : bearSweep ? 33 : 50;
    return wrapResult({ hasSignal, signal, pUp, biasLong: 'TRAMPA BAJISTA BARRIDA', biasShort: 'TRAMPA ALCISTA BARRIDA', biasNeutral: 'SIN BARRIDA DE LIQUIDEZ', reasons });
  }

  // E64: Spot CVD Climax Absorption (Clímax de Precio con Absorción Pasiva Opuesta)
  static runStrategy64(k15m) {
    if (!k15m || k15m.length < 35) return { success: false, error: 'Datos insuficientes E64' };
    const closes = k15m.map(c => parseFloat(c.close));
    const vols = k15m.map(c => parseFloat(c.volume));
    const n = closes.length - 1;
    const lastPrice = closes[n];
    const a = atr(k15m, 14);
    const effAtr = Math.max(a[n], lastPrice * 0.0035);
    const move3 = closes[n - 1] - closes[n - 4];
    const cur = k15m[n];
    const open = parseFloat(cur.open);
    const high = parseFloat(cur.high);
    const low = parseFloat(cur.low);
    const range = Math.max(1e-6, high - low);
    const closePos = (lastPrice - low) / range;
    const deltaNow = cur.volumeDeltaUsd ?? (lastPrice >= open ? vols[n] * lastPrice * 0.1 : -vols[n] * lastPrice * 0.1);
    const avgVol = vols.slice(-21, -1).reduce((s, v) => s + v, 0) / 20;
    const r = rsi(closes, 14);

    // Sharp prior drop absorbed by positive delta & strong close off lows, or vice versa
    const bullAbsorb = move3 < -1.15 * effAtr && deltaNow > 0 && closePos >= 0.58 && vols[n] > avgVol * 1.05 && r[n] <= 46;
    const bearAbsorb = move3 > 1.15 * effAtr && deltaNow < 0 && closePos <= 0.42 && vols[n] > avgVol * 1.05 && r[n] >= 54;

    const reasons = [
      `Impulso previo 3v: ${((move3 / lastPrice) * 100).toFixed(2)}% | Delta Spot: ${Math.round(deltaNow).toLocaleString()} USD`,
      `Cierre en rango: ${(closePos * 100).toFixed(0)}% | RSI(14): ${r[n].toFixed(1)}`
    ];
    let hasSignal = false;
    let signal = null;
    if (bullAbsorb) {
      hasSignal = true;
      signal = buildSignal('LONG', lastPrice, effAtr * 1.2, effAtr * 2.2, [...reasons, 'Absorción compradora tras caída climática']);
    } else if (bearAbsorb) {
      hasSignal = true;
      signal = buildSignal('SHORT', lastPrice, effAtr * 1.2, effAtr * 2.2, [...reasons, 'Distribución/absorción vendedora tras clímax alcista']);
    }
    const pUp = bullAbsorb ? 66 : bearAbsorb ? 34 : 50;
    return wrapResult({ hasSignal, signal, pUp, biasLong: 'ABSORCIÓN SPOT ALCISTA', biasShort: 'ABSORCIÓN SPOT BAJISTA', biasNeutral: 'FLUJO SIN CLÍMAX', reasons });
  }

  // E65: Rolling VWAP Fair-Value Hold & Rejection (Pivote Institucional de Volumen)
  static runStrategy65(k15m) {
    if (!k15m || k15m.length < 40) return { success: false, error: 'Datos insuficientes E65' };
    const win = k15m.slice(-24);
    let pv = 0;
    let vSum = 0;
    for (const c of win) {
      const tp = (parseFloat(c.high) + parseFloat(c.low) + parseFloat(c.close)) / 3;
      const v = parseFloat(c.volume);
      pv += tp * v;
      vSum += v;
    }
    const vwap = vSum > 0 ? pv / vSum : parseFloat(k15m[k15m.length - 1].close);
    const closes = k15m.map(c => parseFloat(c.close));
    const n = closes.length - 1;
    const lastPrice = closes[n];
    const e9 = ema(closes, 9);
    const a = atr(k15m, 14);
    const effAtr = Math.max(a[n], lastPrice * 0.0035);
    const lastBar = k15m[n];
    const prevPrice = closes[n - 1];

    const longTrig = parseFloat(lastBar.low) <= vwap * 1.001 && lastPrice > vwap && lastPrice > e9[n] && prevPrice >= vwap * 0.996 && lastPrice > parseFloat(lastBar.open);
    const shortTrig = parseFloat(lastBar.high) >= vwap * 0.999 && lastPrice < vwap && lastPrice < e9[n] && prevPrice <= vwap * 1.004 && lastPrice < parseFloat(lastBar.open);

    const reasons = [
      `VWAP 24v: $${Math.round(vwap).toLocaleString()} | Precio: $${Math.round(lastPrice).toLocaleString()}`,
      `Diferencia vs VWAP: ${(((lastPrice - vwap) / vwap) * 100).toFixed(2)}%`
    ];
    let hasSignal = false;
    let signal = null;
    if (longTrig) {
      hasSignal = true;
      signal = buildSignal('LONG', lastPrice, effAtr * 1.3, effAtr * 2.35, [...reasons, 'Soporte institucional defendido sobre VWAP']);
    } else if (shortTrig) {
      hasSignal = true;
      signal = buildSignal('SHORT', lastPrice, effAtr * 1.3, effAtr * 2.35, [...reasons, 'Rechazo vendedor bajo VWAP institucional']);
    }
    const pUp = longTrig ? 66 : shortTrig ? 34 : (lastPrice > vwap ? 55 : 45);
    return wrapResult({ hasSignal, signal, pUp, biasLong: 'SOPORTE EN VWAP', biasShort: 'RECHAZO EN VWAP', biasNeutral: 'EN RANGO DE VWAP', reasons });
  }

  // E66: 4H Swing Keltner + Directional Thrust (Tendencia Swing 1–5 Días)
  static runStrategy66(k4h) {
    if (!k4h || k4h.length < 40) return { success: false, error: 'Datos insuficientes E66' };
    const closes = k4h.map(c => parseFloat(c.close));
    const n = closes.length - 1;
    const lastPrice = closes[n];
    const e20 = ema(closes, 20);
    const a = atr(k4h, 14);
    const effAtr = Math.max(a[n], lastPrice * 0.008);
    const upperK = e20[n] + 1.45 * effAtr;
    const lowerK = e20[n] - 1.45 * effAtr;
    const barRange = Math.max(1e-6, parseFloat(k4h[n].high) - parseFloat(k4h[n].low));
    const bodyRatio = Math.abs(lastPrice - parseFloat(k4h[n].open)) / barRange;

    const longTrig = lastPrice > upperK && closes[n - 1] <= (e20[n - 1] + 1.45 * a[n - 1]) && bodyRatio >= 0.48;
    const shortTrig = lastPrice < lowerK && closes[n - 1] >= (e20[n - 1] - 1.45 * a[n - 1]) && bodyRatio >= 0.48;

    const reasons = [
      `Keltner 4H: [$${Math.round(lowerK).toLocaleString()} – $${Math.round(upperK).toLocaleString()}]`,
      `Fuerza de cuerpo: ${(bodyRatio * 100).toFixed(0)}%`
    ];
    let hasSignal = false;
    let signal = null;
    if (longTrig) {
      hasSignal = true;
      signal = buildSignal('LONG', lastPrice, effAtr * 1.35, effAtr * 3.1, [...reasons, 'Ruptura Swing 4H con cuerpo sólido alcista']);
    } else if (shortTrig) {
      hasSignal = true;
      signal = buildSignal('SHORT', lastPrice, effAtr * 1.35, effAtr * 3.1, [...reasons, 'Ruptura Swing 4H con cuerpo sólido bajista']);
    }
    const pUp = longTrig ? 68 : shortTrig ? 32 : (lastPrice > e20[n] ? 56 : 44);
    return wrapResult({ hasSignal, signal, pUp, biasLong: 'SWING BREAKOUT ALCISTA 4H', biasShort: 'SWING BREAKOUT BAJISTA 4H', biasNeutral: 'DENTRO DE KELTNER 4H', reasons });
  }

  // E67: Overextension Z-Score + Funding Crowding Contrarian
  static runStrategy67(k1h, marketContext = null) {
    if (!k1h || k1h.length < 40) return { success: false, error: 'Datos insuficientes E67' };
    const closes = k1h.map(c => parseFloat(c.close));
    const n = closes.length - 1;
    const lastPrice = closes[n];
    const win = closes.slice(n - 20, n + 1);
    const mean = win.reduce((s, v) => s + v, 0) / win.length;
    const std = Math.sqrt(win.reduce((s, v) => s + (v - mean) ** 2, 0) / win.length) || (lastPrice * 0.005);
    const z = (lastPrice - mean) / std;
    const r = rsi(closes, 14);
    const a = atr(k1h, 14);
    const effAtr = Math.max(a[n], lastPrice * 0.005);

    const funding = marketContext?.fundingRate ?? null;
    const fundingBearBoost = funding !== null ? funding > 0.00025 : true;
    const fundingBullBoost = funding !== null ? funding < 0.00005 : true;

    const longTrig = z <= -1.55 && r[n] <= 38 && lastPrice > closes[n - 1] && fundingBullBoost;
    const shortTrig = z >= 1.55 && r[n] >= 62 && lastPrice < closes[n - 1] && fundingBearBoost;

    const reasons = [
      `Z-Score 1H: ${z.toFixed(2)}σ | RSI(14): ${r[n].toFixed(1)}`,
      funding !== null ? `Funding Futuros: ${(funding * 100).toFixed(4)}%` : 'Filtro estadístico Z-Score puro'
    ];
    let hasSignal = false;
    let signal = null;
    if (longTrig) {
      hasSignal = true;
      signal = buildSignal('LONG', lastPrice, effAtr * 1.25, effAtr * 2.3, [...reasons, 'Sobreventa estadística extrema con giro inicial']);
    } else if (shortTrig) {
      hasSignal = true;
      signal = buildSignal('SHORT', lastPrice, effAtr * 1.25, effAtr * 2.3, [...reasons, 'Sobrecompra estadística / apalancamiento saturado']);
    }
    const pUp = longTrig ? 67 : shortTrig ? 33 : (z < -1 ? 58 : z > 1 ? 42 : 50);
    return wrapResult({ hasSignal, signal, pUp, biasLong: 'REVERSIÓN EXTREMA LONG', biasShort: 'REVERSIÓN EXTREMA SHORT', biasNeutral: 'DESVIACIÓN NORMAL', reasons });
  }

  // E68: Institutional Engulfing Order Block + Volume Confirmation
  static runStrategy68(k1h) {
    if (!k1h || k1h.length < 35) return { success: false, error: 'Datos insuficientes E68' };
    const closes = k1h.map(c => parseFloat(c.close));
    const vols = k1h.map(c => parseFloat(c.volume));
    const n = closes.length - 1;
    const lastPrice = closes[n];
    const cur = k1h[n];
    const prev = k1h[n - 1];
    const curBody = parseFloat(cur.close) - parseFloat(cur.open);
    const prevBody = parseFloat(prev.close) - parseFloat(prev.open);
    const avgVol = vols.slice(-21, -1).reduce((s, v) => s + v, 0) / 20;
    const a = atr(k1h, 14);
    const effAtr = Math.max(a[n], lastPrice * 0.005);
    const e50 = ema(closes, 50);

    const bullEngulf = prevBody < 0 && curBody > Math.abs(prevBody) * 1.15 && vols[n] > avgVol * 1.2 && lastPrice > e50[n] * 0.99;
    const bearEngulf = prevBody > 0 && curBody < -Math.abs(prevBody) * 1.15 && vols[n] > avgVol * 1.2 && lastPrice < e50[n] * 1.01;

    const reasons = [
      `Vela envolvente ratio cuerpo: ${(Math.abs(curBody) / (Math.abs(prevBody) || 1)).toFixed(2)}x`,
      `Volumen: ${(vols[n] / (avgVol || 1)).toFixed(2)}x vs media`
    ];
    let hasSignal = false;
    let signal = null;
    if (bullEngulf) {
      hasSignal = true;
      signal = buildSignal('LONG', lastPrice, effAtr * 1.3, effAtr * 2.6, [...reasons, 'Envolvente alcista institucional con volumen']);
    } else if (bearEngulf) {
      hasSignal = true;
      signal = buildSignal('SHORT', lastPrice, effAtr * 1.3, effAtr * 2.6, [...reasons, 'Envolvente bajista institucional con volumen']);
    }
    const pUp = bullEngulf ? 67 : bearEngulf ? 33 : 50;
    return wrapResult({ hasSignal, signal, pUp, biasLong: 'ENVOLVENTE ALCISTA VOL', biasShort: 'ENVOLVENTE BAJISTA VOL', biasNeutral: 'SIN ENVOLVENTE CLARA', reasons });
  }

  // E69: NY Session Handover + US Premium Lead-Lag
  static runStrategy69(k15m, marketContext = null) {
    if (!k15m || k15m.length < 40) return { success: false, error: 'Datos insuficientes E69' };
    const closes = k15m.map(c => parseFloat(c.close));
    const n = closes.length - 1;
    const lastPrice = closes[n];
    const e9 = ema(closes, 9);
    const e21 = ema(closes, 21);
    const a = atr(k15m, 14);
    const effAtr = Math.max(a[n], lastPrice * 0.0035);
    const openTimeMs = k15m[n].openTime || Date.now();
    const utcHour = new Date(openTimeMs).getUTCHours();
    // Active liquid session window (London/NY overlap & US hours 12:00–20:00 UTC)
    const isNyWindow = utcHour >= 12 && utcHour <= 20;
    const cbPrem = marketContext?.coinbasePremiumPct ?? null;

    const bullCross = e9[n] > e21[n] && e9[n - 1] <= e21[n - 1];
    const bearCross = e9[n] < e21[n] && e9[n - 1] >= e21[n - 1];
    const longTrig = isNyWindow && bullCross && (cbPrem === null || cbPrem >= -0.01);
    const shortTrig = isNyWindow && bearCross && (cbPrem === null || cbPrem <= 0.01);

    const reasons = [
      `Sesión UTC: ${utcHour}:00h (${isNyWindow ? 'Ventana NY/Londres Activa' : 'Fuera de ventana US'})`,
      cbPrem !== null ? `Coinbase US Premium: ${cbPrem >= 0 ? '+' : ''}${cbPrem.toFixed(3)}%` : 'Cruce EMA 9/21 sesión líquida'
    ];
    let hasSignal = false;
    let signal = null;
    if (longTrig) {
      hasSignal = true;
      signal = buildSignal('LONG', lastPrice, effAtr * 1.3, effAtr * 2.4, [...reasons, 'Arranque alcista en liquidez Londres/NY']);
    } else if (shortTrig) {
      hasSignal = true;
      signal = buildSignal('SHORT', lastPrice, effAtr * 1.3, effAtr * 2.4, [...reasons, 'Distribución bajista en liquidez Londres/NY']);
    }
    const pUp = longTrig ? 66 : shortTrig ? 34 : (e9[n] > e21[n] ? 54 : 46);
    return wrapResult({ hasSignal, signal, pUp, biasLong: 'FLUJO NY ALCISTA', biasShort: 'FLUJO NY BAJISTA', biasNeutral: 'FUERA DE IMPULSO NY', reasons });
  }

  // E70: Asymmetric Expectancy Sniper (Triple Confluencia Estricta 2.3:1 R:R)
  static runStrategy70(k1h) {
    if (!k1h || k1h.length < 60) return { success: false, error: 'Datos insuficientes E70' };
    const closes = k1h.map(c => parseFloat(c.close));
    const n = closes.length - 1;
    const lastPrice = closes[n];
    const e12 = ema(closes, 12);
    const e26 = ema(closes, 26);
    const e50 = ema(closes, 50);
    const macd = e12.map((v, i) => v - e26[i]);
    const sigLine = ema(macd, 9);
    const histNow = macd[n] - sigLine[n];
    const histPrev = macd[n - 1] - sigLine[n - 1];
    const r = rsi(closes, 14);
    const a = atr(k1h, 14);
    const effAtr = Math.max(a[n], lastPrice * 0.005);

    const longTrig = lastPrice > e50[n] && e12[n] > e26[n] && histNow > 0 && histPrev <= 0 && r[n] >= 48 && r[n] <= 66;
    const shortTrig = lastPrice < e50[n] && e12[n] < e26[n] && histNow < 0 && histPrev >= 0 && r[n] >= 34 && r[n] <= 52;

    const reasons = [
      `MACD Hist: ${histNow.toFixed(1)} | EMA50: $${Math.round(e50[n]).toLocaleString()}`,
      `RSI(14): ${r[n].toFixed(1)} | Ratio Objetivo 2.3:1`
    ];
    let hasSignal = false;
    let signal = null;
    if (longTrig) {
      hasSignal = true;
      signal = buildSignal('LONG', lastPrice, effAtr * 1.15, effAtr * 2.65, [...reasons, 'Giro de momentum MACD alineado con EMA50 (R:R 2.3:1)']);
    } else if (shortTrig) {
      hasSignal = true;
      signal = buildSignal('SHORT', lastPrice, effAtr * 1.15, effAtr * 2.65, [...reasons, 'Giro bajista MACD bajo EMA50 (R:R 2.3:1)']);
    }
    const pUp = longTrig ? 69 : shortTrig ? 31 : (lastPrice > e50[n] ? 55 : 45);
    return wrapResult({ hasSignal, signal, pUp, biasLong: 'SNIPER ASIMÉTRICO LONG', biasShort: 'SNIPER ASIMÉTRICO SHORT', biasNeutral: 'ESPERANDO CONFLUENCIA SNIPER', reasons });
  }
}

export default ExpertAlphaStrategies;
