/**
 * PredictiveOracleService.js
 *
 * Unified BTC Decision & Price Prediction Engine.
 * Synthesizes:
 *   1) Backtest-weighted 60-strategy ensemble
 *   2) Multi-timeframe structural trend alignment (15m, 1H, 4H, 1D, 1W)
 *   3) Real derivatives, Spot vs Perp CVD, Coinbase Premium, and Order Book depth
 *   4) Volatility-normalized ATR price horizon projections & clear trading plan
 *
 * Designed so the user gets ONE unmistakable, jargon-free decision signal
 * ("COMPRAR (LONG)" / "VENDER (SHORT)" / "ESPERAR") with exact entry, SL, TP,
 * and plain-Spanish reasons.
 */

import technicalAnalysisService from './TechnicalAnalysisService.js';

class PredictiveOracleService {
  _emaLast(closes, period) {
    if (!closes || closes.length < period) return null;
    const arr = technicalAnalysisService.calculateEMA(closes, period);
    return arr[arr.length - 1];
  }

  /**
   * Computes multi-timeframe trend score (-100 to +100).
   */
  _computeMultiTimeframeAlignment({ k15m, k1h, k4h, k1d, k1w }) {
    const frames = [
      { key: '15m', label: '15 Min', candles: k15m, weight: 0.15 },
      { key: '1h', label: '1 Hora', candles: k1h, weight: 0.25 },
      { key: '4h', label: '4 Horas', candles: k4h, weight: 0.30 },
      { key: '1d', label: '1 Día', candles: k1d, weight: 0.20 },
      { key: '1w', label: '1 Semana', candles: k1w, weight: 0.10 }
    ];

    let weightedScore = 0;
    let totalWeight = 0;
    const summary = [];

    frames.forEach(tf => {
      if (!tf.candles || tf.candles.length < 25) return;
      const closes = tf.candles.map(c => parseFloat(c.close));
      const p = closes[closes.length - 1];
      const e21 = this._emaLast(closes, 21);
      const e50 = closes.length >= 50 ? this._emaLast(closes, 50) : e21;
      let score = 0;
      let dir = 'NEUTRAL';

      if (e21 !== null && e50 !== null) {
        if (p > e21 && e21 > e50) {
          score = 100;
          dir = 'ALCISTA';
        } else if (p < e21 && e21 < e50) {
          score = -100;
          dir = 'BAJISTA';
        } else if (p > e21) {
          score = 45;
          dir = 'ALCISTA LEVE';
        } else if (p < e21) {
          score = -45;
          dir = 'BAJISTA LEVE';
        }
      }
      weightedScore += score * tf.weight;
      totalWeight += tf.weight;
      summary.push({ key: tf.key, label: tf.label, dir, score });
    });

    const netScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
    return { netScore, summary };
  }

  /**
   * Computes real microstructure & derivatives edge score (-100 to +100).
   */
  _computeMicrostructureScore({ k15m, k1h, cvd5m, marketContext }) {
    let score = 0;
    const notes = [];

    // 1. Real Spot Candle CVD (last 4 bars of 15m)
    const spot15mDelta = k15m && k15m.length >= 4
      ? k15m.slice(-4).reduce((acc, c) => acc + (c.volumeDeltaUsd || 0), 0)
      : 0;
    const effectiveSpotFlow = cvd5m !== 0 ? cvd5m : spot15mDelta;

    if (effectiveSpotFlow > 120000) {
      score += 25;
      notes.push('Flujo Spot comprador dominante (compras agresivas superan ventas)');
    } else if (effectiveSpotFlow < -120000) {
      score -= 25;
      notes.push('Flujo Spot vendedor dominante (ventas agresivas superan compras)');
    }

    if (marketContext) {
      // 2. Coinbase Premium (US institutional spot demand)
      if (marketContext.coinbasePremiumPct !== null) {
        if (marketContext.coinbasePremiumPct >= 0.025) {
          score += 22;
          notes.push(`Demanda institucional EE.UU. positiva (Coinbase +${marketContext.coinbasePremiumPct.toFixed(3)}%)`);
        } else if (marketContext.coinbasePremiumPct <= -0.025) {
          score -= 22;
          notes.push(`Presión vendedora EE.UU. (Coinbase ${marketContext.coinbasePremiumPct.toFixed(3)}%)`);
        }
      }

      // 3. Order Book Imbalance
      if (marketContext.orderBookImbalancePct !== null) {
        if (marketContext.orderBookImbalancePct >= 10) {
          score += 18;
          notes.push(`Libro de órdenes con +${marketContext.orderBookImbalancePct}% más liquidez compradora`);
        } else if (marketContext.orderBookImbalancePct <= -10) {
          score -= 18;
          notes.push(`Libro de órdenes con ${Math.abs(marketContext.orderBookImbalancePct)}% más presión vendedora`);
        }
      }

      // 4. Smart Money Whales vs Retail Long/Short Ratio
      if (marketContext.whaleLongShortRatio !== null && marketContext.retailLongShortRatio !== null) {
        if (marketContext.whaleLongShortRatio > marketContext.retailLongShortRatio * 1.1) {
          score += 20;
          notes.push(`Las ballenas están más largas (${marketContext.whaleLongShortRatio.toFixed(2)}) que los minoristas (${marketContext.retailLongShortRatio.toFixed(2)})`);
        } else if (marketContext.retailLongShortRatio > marketContext.whaleLongShortRatio * 1.15) {
          score -= 20;
          notes.push(`Exceso de apalancamiento minorista en largos (${marketContext.retailLongShortRatio.toFixed(2)}) vs ballenas`);
        }
      }

      // 5. Funding Rate Contrarian Extreme
      if (marketContext.fundingRate !== null) {
        if (marketContext.fundingRate < -0.0001) {
          score += 18;
          notes.push('Funding negativo: shorts pagando — riesgo de Short Squeeze al alza');
        } else if (marketContext.fundingRate > 0.00035) {
          score -= 18;
          notes.push('Funding muy positivo: exceso de longs apalancados — riesgo de barrida bajista');
        }
      }
    }

    return {
      score: Math.max(-100, Math.min(100, Math.round(score))),
      notes
    };
  }

  /**
   * Builds the complete unified prediction & beginner-friendly action card.
   */
  generateOraclePrediction({
    currentPrice,
    k15m,
    k1h,
    k4h,
    k1d,
    k1w,
    cvd5m = 0,
    masterConsensus,
    marketRegime,
    magneticZones,
    backtestStatsMap = {},
    marketContext = null
  }) {
    if (!currentPrice || !k1h || k1h.length < 30) {
      return null;
    }

    // 1. Multi-timeframe structural trend
    const mtf = this._computeMultiTimeframeAlignment({ k15m, k1h, k4h, k1d, k1w });

    // 2. Microstructure & real derivatives score
    const micro = this._computeMicrostructureScore({ k15m, k1h, cvd5m, marketContext });

    // 3. Backtest-weighted 60-strategy ensemble score (-100 to +100)
    const consensusBiasScore = masterConsensus
      ? Math.round((masterConsensus.avgPUp - 50) * 2)
      : 0;

    // 4. Composite Directional Prediction Score (-100 to +100)
    const compositeEdge = Math.round(
      (consensusBiasScore * 0.40) +
      (mtf.netScore * 0.35) +
      (micro.score * 0.25)
    );

    const probUp = Math.max(12, Math.min(88, Math.round(50 + (compositeEdge * 0.38))));
    const probDown = 100 - probUp;

    // 5. ATR-based Expected Price Range & Trading Levels
    const atr1hArr = technicalAnalysisService.calculateATR(k1h, 14);
    const atr1dArr = k1d && k1d.length >= 16 ? technicalAnalysisService.calculateATR(k1d, 14) : null;
    const atr1h = atr1hArr[atr1hArr.length - 1] || currentPrice * 0.009;
    const atr1d = (atr1dArr && atr1dArr[atr1dArr.length - 1]) || atr1h * 3.5;

    const recent1h = k1h.slice(-24);
    const resistance24h = Math.round(magneticZones?.shortLiqMagnet || Math.max(...recent1h.map(c => parseFloat(c.high))));
    const support24h = Math.round(magneticZones?.longLiqMagnet || Math.min(...recent1h.map(c => parseFloat(c.low))));

    const expectedHigh4h = Math.round(currentPrice + atr1h * 1.4);
    const expectedLow4h = Math.round(currentPrice - atr1h * 1.4);
    const expectedHigh24h = Math.round(currentPrice + atr1d * 0.9);
    const expectedLow24h = Math.round(currentPrice - atr1d * 0.9);

    // 6. Count Proven Backtest Winners Voting Together
    let verifiedLongs = 0;
    let verifiedShorts = 0;
    if (masterConsensus) {
      (masterConsensus.agreeingLongStrats || []).forEach(name => {
        const bt = backtestStatsMap?.[name];
        if (bt && bt.totalTrades >= 3 && bt.profitFactor >= 1.2) verifiedLongs++;
      });
      (masterConsensus.agreeingShortStrats || []).forEach(name => {
        const bt = backtestStatsMap?.[name];
        if (bt && bt.totalTrades >= 3 && bt.profitFactor >= 1.2) verifiedShorts++;
      });
    }

    // 7. Determine Clear Action Decision
    const isCompression = marketRegime?.regime === 'COMPRESSION';
    let action = 'ESPERAR';
    let actionTitle = 'ESPERAR CONFIRMACIÓN (NO OPERAR TODAVÍA)';
    let actionEmoji = '🟡';
    let actionColor = '#f59e0b';
    let convictionLabel = 'BAJA / MERCADO INDECISO';
    let plan = null;

    if (compositeEdge >= 18 && !isCompression && probUp >= 57) {
      action = 'LONG';
      actionTitle = compositeEdge >= 38 ? 'OPORTUNIDAD FUERTE DE COMPRA (LONG)' : 'SESGO DE COMPRA MODERADO (LONG)';
      actionEmoji = '🟢';
      actionColor = '#10b981';
      convictionLabel = compositeEdge >= 38 ? 'ALTA' : 'MEDIA';

      const sl = Math.round(Math.max(currentPrice * 0.975, currentPrice - (atr1h * 1.6)));
      const risk = Math.max(currentPrice * 0.005, currentPrice - sl);
      const tp1 = Math.round(currentPrice + (risk * 1.8));
      const tp2 = Math.round(currentPrice + (risk * 2.8));
      plan = {
        direction: 'LONG',
        entry: Math.round(currentPrice),
        sl,
        tp1,
        tp2,
        riskPct: parseFloat(((risk / currentPrice) * 100).toFixed(2)),
        reward1Pct: parseFloat((((tp1 - currentPrice) / currentPrice) * 100).toFixed(2)),
        reward2Pct: parseFloat((((tp2 - currentPrice) / currentPrice) * 100).toFixed(2)),
        rr: '1 : 1.8 / 2.8',
        invalidation: `Si una vela de 1H cierra por debajo de $${sl.toLocaleString()}, la idea alcista queda anulada.`
      };
    } else if (compositeEdge <= -18 && !isCompression && probDown >= 57) {
      action = 'SHORT';
      actionTitle = compositeEdge <= -38 ? 'OPORTUNIDAD FUERTE DE VENTA (SHORT)' : 'SESGO DE VENTA MODERADO (SHORT)';
      actionEmoji = '🔴';
      actionColor = '#ef4444';
      convictionLabel = compositeEdge <= -38 ? 'ALTA' : 'MEDIA';

      const sl = Math.round(Math.min(currentPrice * 1.025, currentPrice + (atr1h * 1.6)));
      const risk = Math.max(currentPrice * 0.005, sl - currentPrice);
      const tp1 = Math.round(currentPrice - (risk * 1.8));
      const tp2 = Math.round(currentPrice - (risk * 2.8));
      plan = {
        direction: 'SHORT',
        entry: Math.round(currentPrice),
        sl,
        tp1,
        tp2,
        riskPct: parseFloat(((risk / currentPrice) * 100).toFixed(2)),
        reward1Pct: parseFloat((((currentPrice - tp1) / currentPrice) * 100).toFixed(2)),
        reward2Pct: parseFloat((((currentPrice - tp2) / currentPrice) * 100).toFixed(2)),
        rr: '1 : 1.8 / 2.8',
        invalidation: `Si una vela de 1H cierra por encima de $${sl.toLocaleString()}, la idea bajista queda anulada.`
      };
    } else {
      convictionLabel = isCompression ? 'COMPRESIÓN (BREAKOUT INMINENTE)' : 'SEÑALES DIVIDIDAS — MEJOR ESPERAR';
    }

    // 8. Build Plain-Spanish Reasons for Easy User Decisions
    const plainReasons = [];
    if (mtf.netScore >= 30) {
      plainReasons.push(`Tendencia general ALCISTA alineada en múltiples temporalidades (${mtf.summary.filter(s => s.score > 0).map(s => s.label).join(', ')}).`);
    } else if (mtf.netScore <= -30) {
      plainReasons.push(`Tendencia general BAJISTA alineada en múltiples temporalidades (${mtf.summary.filter(s => s.score < 0).map(s => s.label).join(', ')}).`);
    } else {
      plainReasons.push('Las temporalidades cortas y largas aún no coinciden en una sola dirección (mercado mixto).');
    }

    if (masterConsensus) {
      plainReasons.push(
        `Consenso de 60 algoritmos: ${masterConsensus.longVotes} en compra vs ${masterConsensus.shortVotes} en venta (${verifiedLongs} ganadores de backtest en LONG / ${verifiedShorts} en SHORT).`
      );
    }

    if (micro.notes.length > 0) {
      plainReasons.push(...micro.notes.slice(0, 2));
    }

    if (isCompression) {
      plainReasons.push(`⚠️ Volatilidad comprimida: espera ruptura clara arriba de $${resistance24h.toLocaleString()} (LONG) o abajo de $${support24h.toLocaleString()} (SHORT).`);
    }

    // Compute overall backtest top performers for quick visibility
    const topBacktest = Object.values(backtestStatsMap || {})
      .filter(b => b && b.totalTrades >= 3 && b.profitFactor !== null)
      .sort((a, b) => (b.profitFactor - a.profitFactor) || ((b.winRate || 0) - (a.winRate || 0)))
      .slice(0, 5);

    return {
      timestamp: Date.now(),
      currentPrice,
      action,
      actionTitle,
      actionEmoji,
      actionColor,
      convictionLabel,
      compositeEdge,
      probUp,
      probDown,
      mtfSummary: mtf.summary,
      mtfNetScore: mtf.netScore,
      microScore: micro.score,
      resistance24h,
      support24h,
      expectedRange4h: { low: expectedLow4h, high: expectedHigh4h },
      expectedRange24h: { low: expectedLow24h, high: expectedHigh24h },
      plan,
      plainReasons,
      topBacktest,
      marketContext
    };
  }
}

const predictiveOracleService = new PredictiveOracleService();
export default predictiveOracleService;
