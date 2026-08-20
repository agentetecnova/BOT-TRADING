/**
 * StrategyRankingService.js
 * 
 * Servicio cuantitativo para calcular métricas de efectividad (Win Rate %, PnL Total, 
 * Operaciones Totales, TP/SL Ratio) para las 25 estrategias de Bitcoin.
 * 
 * Permite identificar al instante cuáles son las estrategias más rentables y con mejor desempeño.
 */

export class StrategyRankingService {
  /**
   * Lista de nombres oficiales de las 25 estrategias
   */
  static getStrategyNames() {
    return [
      'Estrategia 1: Cruzamiento Triple EMA (8, 21, 55)',
      'Estrategia 2: Divergencias RSI + MACD Shift',
      'Estrategia 3: Barrido de Liquidez (Liquidation Sweep)',
      'Estrategia 4: Macro Tendencia & Squeeze TTMS',
      'Estrategia 5: Z-Score Reversión a VWAP',
      'Estrategia 6: Supertrend Multitemporal Cuantitativo',
      'Estrategia 7: Smart Money Concepts (FVG + Order Block)',
      'Estrategia 8: Volume Profile POC & Value Area Rebound',
      'Estrategia 9: Ichimoku Cloud Breakout & Kumo Twist',
      'Estrategia 10: Bollinger-Keltner Volatility Squeeze Expansion',
      'Estrategia 11: Order Flow CVD Delta Divergence',
      'Estrategia 12: Estructura Wyckoff (Spring/Upthrust)',
      'Estrategia 13: Patrones Armónicos Fibonacci (Gartley/Bat)',
      'Estrategia 14: Chaikin Money Flow & OBV Accumulation',
      'Estrategia 15: MACD Histogram Momentum Shift (4H)',
      'Estrategia 16: Parabolic SAR + ADX Trend Strength Filter',
      'Estrategia 17: Keltner Channel Mean Reversion Scalp',
      'Estrategia 18: Puntos Pivote Camarilla Confluence',
      'Estrategia 19: Stochastic RSI Extreme Cross',
      'Estrategia 20: Donchian Channel 20 Breakout (Turtle)',
      'Estrategia 21: Hull Moving Average (HMA) Zero-Lag Cross',
      'Estrategia 22: Agotamiento Volatilidad ATR Spike',
      'Estrategia 23: Multi-Timeframe Ribbon Convergence (5m-4h)',
      'Estrategia 24: Liquidity Pool Impulse & MSS Breakout',
      'Estrategia 25: Consenso Maestro Quant Ensemble 2.0',
      'Estrategia 26: Derivatives Squeeze Regime (Funding Rate + Open Interest Climax)',
      'Estrategia 27: London & NY Judas Swing (Manipulación del Rango Asiático)',
      'Estrategia 28: Monday Open & Weekly Value Deviation (Rebalanceo Semanal)',
      'Estrategia 29: CME Gap Fill & Weekend Anomaly (Futuros Institucionales Chicago)',
      'Estrategia 30: Order Book Iceberg Absorption (Absorción Pasiva Institucional)'
    ];
  }

  /**
   * Calcula el ranking de rendimiento de las 25 estrategias basándose en el historial de señales.
   * 
   * @param {Array} signalsHistory 
   * @returns {Array} Arreglo ordenado por Win Rate % y PnL acumulado
   */
  static calculateStrategyRankings(signalsHistory = []) {
    const safeHistory = Array.isArray(signalsHistory) ? signalsHistory : [];
    const stratNames = this.getStrategyNames();

    const rankingMap = new Map();

    // Inicializar mapa para las 25 estrategias
    stratNames.forEach((fullName, idx) => {
      const shortName = `Estrategia ${idx + 1}`;
      rankingMap.set(shortName, {
        id: idx + 1,
        shortName,
        fullName,
        totalSignals: 0,
        pendingCount: 0,
        tpCount: 0,
        slCount: 0,
        timeoutCount: 0,
        invalidatedCount: 0,
        winRatePercent: 0,
        totalPnlPercent: 0,
        mfeSum: 0,
        mfeCount: 0,
        directionalSuccessCount: 0,
        avgMfePercent: 0,
        directionalAccuracyPercent: 0,
        avgRiskReward: 1.8,
        tier: 'STANDARD'
      });
    });

    // Procesar cada señal registrada en el historial
    safeHistory.forEach(sig => {
      if (!sig || !sig.strategy) return;

      // Extraer clave de estrategia (ej. "Estrategia 1")
      let key = sig.strategy;
      const match = sig.strategy.match(/Estrategia\s+(\d+)/i);
      if (match) {
        key = `Estrategia ${match[1]}`;
      }

      if (!rankingMap.has(key)) {
        rankingMap.set(key, {
          id: match ? parseInt(match[1]) : 99,
          shortName: key,
          fullName: sig.strategy,
          totalSignals: 0,
          pendingCount: 0,
          tpCount: 0,
          slCount: 0,
          timeoutCount: 0,
          invalidatedCount: 0,
          winRatePercent: 0,
          totalPnlPercent: 0,
          mfeSum: 0,
          mfeCount: 0,
          directionalSuccessCount: 0,
          avgMfePercent: 0,
          directionalAccuracyPercent: 0,
          avgRiskReward: 1.8,
          tier: 'STANDARD'
        });
      }

      const stat = rankingMap.get(key);
      stat.totalSignals += 1;

      // Calcular o extraer MFE (% máximo a favor)
      let mfe = typeof sig.maxFavorablePercent === 'number' ? sig.maxFavorablePercent : null;
      if (mfe === null) {
        if (sig.status === 'TP') mfe = sig.profitPercent || 2.0;
        else if (sig.status === 'SL') mfe = 0.3;
        else if (sig.status === 'TIMEOUT') mfe = Math.max(0, sig.pnlPercent || 0.5);
        else mfe = 0;
      }
      stat.mfeSum += Math.max(0, mfe);
      stat.mfeCount += 1;

      // Se considera acierto direccional si el precio avanzó al menos +0.6% a favor
      if (mfe >= 0.6 || sig.status === 'TP') {
        stat.directionalSuccessCount += 1;
      }

      if (sig.status === 'TP') {
        stat.tpCount += 1;
        const pnl = sig.profitPercent || sig.pnlPercent || 2.0;
        stat.totalPnlPercent += Math.abs(pnl);
      } else if (sig.status === 'SL') {
        stat.slCount += 1;
        const pnl = sig.riskPercent || sig.pnlPercent || 1.0;
        stat.totalPnlPercent -= Math.abs(pnl);
      } else if (sig.status === 'TIMEOUT') {
        stat.timeoutCount += 1;
        const pnl = sig.pnlPercent || 0;
        stat.totalPnlPercent += pnl;
      } else if (sig.status === 'INVALIDATED') {
        stat.invalidatedCount += 1;
      } else if (sig.status === 'PENDING') {
        stat.pendingCount += 1;
      }
    });

    // Calcular porcentajes, MFE promedio y asignar Tiers de efectividad
    const rankingList = Array.from(rankingMap.values()).map(stat => {
      const completed = stat.tpCount + stat.slCount + stat.timeoutCount;
      const resolvedTpSl = stat.tpCount + stat.slCount;
      
      const winRate = resolvedTpSl > 0 
        ? parseFloat(((stat.tpCount / resolvedTpSl) * 100).toFixed(1)) 
        : (stat.totalSignals > 0 && stat.tpCount > 0 ? 100.0 : 0.0);

      const avgMfe = stat.mfeCount > 0 
        ? parseFloat((stat.mfeSum / stat.mfeCount).toFixed(2)) 
        : 0;

      const directionalAccuracy = stat.totalSignals > 0
        ? parseFloat(((stat.directionalSuccessCount / stat.totalSignals) * 100).toFixed(1))
        : 0;

      let tier = 'STANDARD ⚙️';
      if (winRate >= 75 && stat.totalSignals >= 2) tier = 'ELITE S-TIER 👑';
      else if (winRate >= 60 || directionalAccuracy >= 75) tier = 'GOLD A-TIER 🥇';
      else if (winRate >= 45 || directionalAccuracy >= 55) tier = 'SILVER B-TIER 🥈';
      else tier = 'EN PRUEBA 🧪';

      return {
        ...stat,
        completedCount: completed,
        winRatePercent: winRate,
        avgMfePercent: avgMfe,
        directionalAccuracyPercent: directionalAccuracy,
        totalPnlPercent: parseFloat(stat.totalPnlPercent.toFixed(2)),
        tier
      };
    });

    // Ordenar ranking por Win Rate descendente, luego por MFE y PnL total
    rankingList.sort((a, b) => {
      if (b.winRatePercent !== a.winRatePercent) {
        return b.winRatePercent - a.winRatePercent;
      }
      if (b.avgMfePercent !== a.avgMfePercent) {
        return b.avgMfePercent - a.avgMfePercent;
      }
      if (b.totalPnlPercent !== a.totalPnlPercent) {
        return b.totalPnlPercent - a.totalPnlPercent;
      }
      return b.totalSignals - a.totalSignals;
    });

    return rankingList;
  }
}

export default StrategyRankingService;
