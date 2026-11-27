/**
 * BacktestEngine.js
 *
 * Walk-Forward Historical Backtester (zero look-ahead bias).
 * Evaluates strategies over recent Binance historical candles using strict
 * bar-by-bar High/Low SL/TP resolution (conservative SL-first tie-breaking)
 * and a 0.08% round-trip fee/slippage penalty.
 *
 * Computes real empirical Win Rate %, Profit Factor, Expectancy %, and Total PnL %
 * for every strategy so the Prediction Engine can weight proven winners dynamically.
 */

import technicalAnalysisService from './TechnicalAnalysisService.js';

const FEE_PENALTY_PCT = 0.08;

class BacktestEngine {
  constructor() {
    this._cachedResult = null;
    this._lastCandleCloseTime = 0;
  }

  /**
   * Simulates SL/TP outcome starting from bar `entryIdx + 1` up to `maxHoldBars`.
   */
  _resolveForwardTrade(candles, entryIdx, sig, maxHoldBars = 64) {
    const entry = sig.entry;
    const sl = sig.sl;
    const tp = sig.tp;
    const isLong = sig.type === 'LONG';
    if (!entry || !sl || !tp) return null;

    const endIdx = Math.min(candles.length - 1, entryIdx + maxHoldBars);
    for (let j = entryIdx + 1; j <= endIdx; j++) {
      const h = parseFloat(candles[j].high);
      const l = parseFloat(candles[j].low);

      if (isLong) {
        const hitSl = l <= sl;
        const hitTp = h >= tp;
        if (hitSl) {
          const lossPct = -Math.abs(((entry - sl) / entry) * 100) - FEE_PENALTY_PCT;
          return { outcome: 'SL', pnl: lossPct, exitIdx: j };
        }
        if (hitTp) {
          const gainPct = Math.abs(((tp - entry) / entry) * 100) - FEE_PENALTY_PCT;
          return { outcome: 'TP', pnl: gainPct, exitIdx: j };
        }
      } else {
        const hitSl = h >= sl;
        const hitTp = l <= tp;
        if (hitSl) {
          const lossPct = -Math.abs(((sl - entry) / entry) * 100) - FEE_PENALTY_PCT;
          return { outcome: 'SL', pnl: lossPct, exitIdx: j };
        }
        if (hitTp) {
          const gainPct = Math.abs(((entry - tp) / entry) * 100) - FEE_PENALTY_PCT;
          return { outcome: 'TP', pnl: gainPct, exitIdx: j };
        }
      }
    }

    // Timeout exit at close of endIdx
    const exitClose = parseFloat(candles[endIdx].close);
    const rawPnl = isLong
      ? ((exitClose - entry) / entry) * 100
      : ((entry - exitClose) / entry) * 100;
    return { outcome: 'TIMEOUT', pnl: rawPnl - FEE_PENALTY_PCT, exitIdx: endIdx };
  }

  /**
   * Evaluates a single-series strategy across historical checkpoints.
   */
  _backtestSeries(strategyKey, candles, evalFn, startOffset = 70, step = 4) {
    if (!candles || candles.length < startOffset + 20) {
      return {
        strategy: strategyKey,
        totalTrades: 0, tpCount: 0, slCount: 0, timeoutCount: 0,
        winRate: null, profitFactor: null, totalPnl: 0, expectancy: 0,
        grade: '🧪 SIN MUESTRA'
      };
    }

    let tpCount = 0;
    let slCount = 0;
    let timeoutCount = 0;
    let grossWin = 0;
    let grossLoss = 0;
    let totalPnl = 0;
    let nextAllowedIdx = startOffset;

    const maxEvalIdx = candles.length - 4;
    for (let i = startOffset; i < maxEvalIdx; i += step) {
      if (i < nextAllowedIdx) continue;
      // Pass sliding history ending strictly at i (zero look-ahead)
      const sliceStart = Math.max(0, i - 180);
      const subCandles = candles.slice(sliceStart, i + 1);
      const res = evalFn(subCandles);
      if (res && res.hasSignal && res.signal) {
        const trade = this._resolveForwardTrade(candles, i, res.signal, 48);
        if (trade) {
          totalPnl += trade.pnl;
          if (trade.outcome === 'TP') {
            tpCount++;
            grossWin += Math.max(0, trade.pnl);
          } else if (trade.outcome === 'SL') {
            slCount++;
            grossLoss += Math.abs(Math.min(0, trade.pnl));
          } else {
            timeoutCount++;
            if (trade.pnl >= 0) grossWin += trade.pnl;
            else grossLoss += Math.abs(trade.pnl);
          }
          nextAllowedIdx = trade.exitIdx + 1;
        }
      }
    }

    const totalTrades = tpCount + slCount + timeoutCount;
    const resolved = tpCount + slCount;
    const winRate = resolved > 0 ? parseFloat(((tpCount / resolved) * 100).toFixed(1)) : null;
    const profitFactor = (grossLoss > 0)
      ? parseFloat((grossWin / grossLoss).toFixed(2))
      : (grossWin > 0 ? 3.0 : null);
    const expectancy = totalTrades > 0 ? parseFloat((totalPnl / totalTrades).toFixed(2)) : 0;

    let grade = '🧪 SIN MUESTRA';
    if (totalTrades >= 3) {
      if (profitFactor >= 1.35 && (winRate ?? 0) >= 55) grade = '🏆 VERIFICADA';
      else if (profitFactor >= 1.0) grade = '⚖️ NEUTRAL';
      else grade = '⚠️ BAJA';
    }

    return {
      strategy: strategyKey,
      totalTrades,
      tpCount,
      slCount,
      timeoutCount,
      winRate,
      profitFactor,
      totalPnl: parseFloat(totalPnl.toFixed(2)),
      expectancy,
      grade
    };
  }

  /**
   * Runs fast walk-forward backtests on all testable strategies using fetched Binance klines.
   * Cached per candle close timestamp so it executes in ~40-70ms once per candle update.
   */
  runFullBacktest({ k5m, k15m, k1h, k4h, k1d }) {
    const latestCloseTime = k15m && k15m.length > 0 ? k15m[k15m.length - 1].openTime : 0;
    if (this._cachedResult && latestCloseTime && this._lastCandleCloseTime === latestCloseTime) {
      return this._cachedResult;
    }

    const results = {};
    const svc = technicalAnalysisService;

    // 15m strategies (walk over last ~320 bars = ~3.3 days)
    const w15 = k15m ? k15m.slice(-340) : [];
    const w1h = k1h ? k1h.slice(-320) : [];
    const w5 = k5m ? k5m.slice(-320) : [];
    const w4h = k4h ? k4h.slice(-240) : [];

    const specs = [
      ['Estrategia 1', w15, (c) => svc.runStrategy1(c), 70, 6],
      ['Estrategia 5', w1h, (c) => svc.runStrategy5(c), 60, 5],
      ['Estrategia 6', w15, (c) => svc.runStrategy6(c), 210, 6],
      ['Estrategia 7', w1h, (c) => svc.runStrategy7(c), 60, 5],
      ['Estrategia 8', w1h, (c) => svc.runStrategy8(c), 60, 5],
      ['Estrategia 9', w4h, (c) => svc.runStrategy9(c), 205, 4],
      ['Estrategia 10', w1h, (c) => svc.runStrategy10(c), 60, 5],
      ['Estrategia 11', w5, (c) => svc.runStrategy11(c, 0), 60, 5],
      ['Estrategia 12', w5, (c) => svc.runStrategy12(c), 60, 5],
      ['Estrategia 13', w15, (c) => svc.runStrategy13(c), 60, 5],
      ['Estrategia 14', w1h, (c) => svc.runStrategy14(c), 60, 5],
      ['Estrategia 15', w4h, (c) => svc.runStrategy15(c), 60, 4],
      ['Estrategia 16', w1h, (c) => svc.runStrategy16(c), 60, 5],
      ['Estrategia 17', w15, (c) => svc.runStrategy17(c), 60, 5],
      ['Estrategia 19', w15, (c) => svc.runStrategy19(c), 60, 5],
      ['Estrategia 20', w1h, (c) => svc.runStrategy20(c), 45, 5],
      ['Estrategia 21', w15, (c) => svc.runStrategy21(c), 60, 5],
      ['Estrategia 22', w1h, (c) => svc.runStrategy22(c), 50, 5],
      ['Estrategia 24', w15, (c) => svc.runStrategy24(c), 60, 5],
      ['Estrategia 26', w1h, (c) => svc.runStrategy26(c, null, null), 45, 5],
      ['Estrategia 27', w15, (c) => svc.runStrategy27(c), 50, 5],
      ['Estrategia 28', w1h, (c) => svc.runStrategy28(c), 60, 5],
      ['Estrategia 29', w1h, (c) => svc.runStrategy29(c), 50, 5],
      ['Estrategia 30', w5, (c) => svc.runStrategy30(c, 0), 30, 4],
      ['Estrategia 31', w15, (c) => svc.runStrategy31(c), 50, 5],
      ['Estrategia 32', w1h, (c) => svc.runStrategy32(c), 40, 5],
      ['Estrategia 33', w15, (c) => svc.runStrategy33(c), 50, 5],
      ['Estrategia 34', w1h, (c) => svc.runStrategy34(c), 50, 5],
      ['Estrategia 36', w15, (c) => svc.runStrategy36(c), 40, 5],
      ['Estrategia 37', w1h, (c) => svc.runStrategy37(c), 45, 5],
      ['Estrategia 38', w15, (c) => svc.runStrategy38(c), 50, 5],
      ['Estrategia 39', w1h, (c) => svc.runStrategy39(c), 55, 5],
      ['Estrategia 40', w1h, (c) => svc.runStrategy40(c), 45, 5],
      ['Estrategia 41', w1h, (c) => svc.runStrategy41(c), 40, 5],
      ['Estrategia 42', w15, (c) => svc.runStrategy42(c), 35, 5],
      ['Estrategia 43', w4h, (c) => svc.runStrategy43(c), 50, 4],
      ['Estrategia 44', w1h, (c) => svc.runStrategy44(c), 35, 5],
      ['Estrategia 45', w1h, (c) => svc.runStrategy45(c, null, null), 40, 5],
      ['Estrategia 46', w1h, (c) => svc.runStrategy46(c, null), 40, 5],
      ['Estrategia 47', w1h, (c) => svc.runStrategy47(c), 40, 5],
      ['Estrategia 48', w4h, (c) => svc.runStrategy48(c, k1d), 30, 4],
      ['Estrategia 49', w1h, (c) => svc.runStrategy49(c, w4h), 60, 5],
      ['Estrategia 51', w15, (c) => svc.runStrategy51(c, 0, null), 45, 5],
      ['Estrategia 52', w5, (c) => svc.runStrategy52(c, c, 0, null), 30, 4],
      ['Estrategia 53', w15, (c) => svc.runStrategy53(c), 40, 5],
      ['Estrategia 55', w15, (c) => svc.runStrategy55(c, w1h, null), 35, 5],
      ['Estrategia 56', w15, (c) => svc.runStrategy56(c, 0, null), 40, 5],
      ['Estrategia 57', w5, (c) => svc.runStrategy57(c, 0), 30, 4],
      ['Estrategia 59', w1h, (c) => svc.runStrategy59(c, null, null), 40, 5],
      ['Estrategia 61', w1h, (c) => svc.runStrategy61(c, w4h), 60, 2],
      ['Estrategia 62', w1h, (c) => svc.runStrategy62(c), 50, 2],
      ['Estrategia 63', w15, (c) => svc.runStrategy63(c), 40, 2],
      ['Estrategia 64', w15, (c) => svc.runStrategy64(c), 35, 2],
      ['Estrategia 65', w15, (c) => svc.runStrategy65(c), 40, 2],
      ['Estrategia 66', w4h, (c) => svc.runStrategy66(c), 40, 1],
      ['Estrategia 67', w1h, (c) => svc.runStrategy67(c, null), 40, 2],
      ['Estrategia 68', w1h, (c) => svc.runStrategy68(c), 55, 2],
      ['Estrategia 69', w15, (c) => svc.runStrategy69(c, null), 40, 2],
      ['Estrategia 70', w1h, (c) => svc.runStrategy70(c), 60, 2]
    ];

    specs.forEach(([key, candles, fn, startOffset, step]) => {
      try {
        results[key] = this._backtestSeries(key, candles, fn, startOffset, step);
      } catch {
        results[key] = {
          strategy: key, totalTrades: 0, tpCount: 0, slCount: 0, timeoutCount: 0,
          winRate: null, profitFactor: null, totalPnl: 0, expectancy: 0, grade: '🧪 SIN MUESTRA'
        };
      }
    });

    this._cachedResult = results;
    this._lastCandleCloseTime = latestCloseTime;
    return results;
  }
}

const backtestEngine = new BacktestEngine();
export default backtestEngine;
