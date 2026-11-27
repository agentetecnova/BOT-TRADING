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
      'Estrategia 1: Triple EMA Dynamic Trend Rider (8, 21, 55)',
      'Estrategia 2: Hull Moving Average (HMA) Zero-Lag Momentum',
      'Estrategia 3: Supertrend Multi-ATR Volatility Channel',
      'Estrategia 4: MACD 4H Zero-Cross & Momentum Shift',
      'Estrategia 5: Parabolic SAR + Directional Movement (DMI)',
      'Estrategia 6: Ichimoku Kumo Cloud Breakout & Chikou',
      'Estrategia 7: Donchian 20-50 Channel Turtle Breakout',
      'Estrategia 8: Guppy Multiple Moving Average (GMMA)',
      'Estrategia 9: Vortex Indicator & True Strength (TSI)',
      'Estrategia 10: Kaufman Adaptive Moving Average (KAMA)',
      'Estrategia 11: Bollinger %B + RSI-2 Exhaustion Scalper',
      'Estrategia 12: Z-Score VWAP Standard Deviation Reversal (2.5σ)',
      'Estrategia 13: Keltner Channel Mean Reversion Scalp',
      'Estrategia 14: Stochastic RSI Dynamic Extreme Cross',
      'Estrategia 15: Williams %R Hidden Divergence Reversal',
      'Estrategia 16: Commodity Channel Index (CCI ±200) Hook',
      'Estrategia 17: Ultimate Oscillator (UO) Triple-Timeframe',
      'Estrategia 18: Demarker Dynamic Range Pivot Reversion',
      'Estrategia 19: Rate of Change (ROC) Velocity Reversion',
      'Estrategia 20: Fisher Transform Gaussian Peak Exhaustion',
      'Estrategia 21: Order Flow CVD Delta Divergence',
      'Estrategia 22: Volume Profile POC & Value Area (VAH/VAL)',
      'Estrategia 23: Chaikin Money Flow & OBV Accumulation',
      'Estrategia 24: Volume Spread Analysis (VSA) Stopping Volume',
      'Estrategia 25: Anchored VWAP Session Drift & Bounce',
      'Estrategia 26: Order Book Iceberg Absorption',
      'Estrategia 27: Relative Volume (RVOL) Institutional Breakout',
      'Estrategia 28: Force Index Multi-Period Volume Momentum',
      'Estrategia 29: Ease of Movement (EOM) Low-Resistance Float',
      'Estrategia 30: Money Flow Index (MFI) Volume Divergence',
      'Estrategia 31: Liquidity Pool Sweep & MSS Breakout',
      'Estrategia 32: Fair Value Gap (FVG) & Order Block Retest',
      'Estrategia 33: Wyckoff Phase C Spring & UTAD Capture',
      'Estrategia 34: Fibonacci Golden Pocket (0.618 - 0.65)',
      'Estrategia 35: Camarilla Pivot Points Equation (H4/L4 & H3/L3)',
      'Estrategia 36: Equal Highs / Equal Lows (EQH/EQL) Stop Hunt',
      'Estrategia 37: Breaker Block Retest & Liquidity Retracement',
      'Estrategia 38: London Open Judas Swing (Asian Range Trap)',
      'Estrategia 39: Monday Open & Weekly Value Deviation',
      'Estrategia 40: CME Gap Weekend Anomaly Reversion',
      'Estrategia 41: Bollinger-Keltner Volatility Squeeze (TTM)',
      'Estrategia 42: ATR Volatility Expansion Band Breakout',
      'Estrategia 43: Historical Volatility Percentile (HVP) Squeeze',
      'Estrategia 44: Chaikin Volatility Ratio & Momentum Thrust',
      'Estrategia 45: Derivatives Funding Rate & Open Interest Squeeze',
      'Estrategia 46: Derivatives Sentiment & Long/Short Ratio',
      'Estrategia 47: Session Volume Imbalance & Single Prints Re-Fill',
      'Estrategia 48: Power of Three (AMD) Daily Fractal Reversal',
      'Estrategia 49: Golden / Death Cross Velocity Multi-Period',
      'Estrategia 50: Weekly Range Projection & Standard Deviation',
      'Estrategia 51: Liquidation Heatmap Cascade Magnet',
      'Estrategia 52: Spot vs Perpetuals CVD Divergence (Ballenas)',
      'Estrategia 53: VWAP 3-Sigma Gaussian Exhaustion Climax',
      'Estrategia 54: ICT Silver Bullet 60-Minute Precision Window',
      'Estrategia 55: Coinbase Spot Premium Index Lead-Lag',
      'Estrategia 56: QuantAlpha-1: Triple-Confluence Liquidity Matrix (T-CLAM)',
      'Estrategia 57: QuantAlpha-2: Fractal Order-Flow Exhaustion (FOEIR)',
      'Estrategia 58: QuantAlpha-3: Momentum Ribbon Adaptive ATR (MTM-RAT)',
      'Estrategia 59: QuantAlpha-4: Funding & OI Divergence Cascade (DFOIDC)',
      'Estrategia 60: QuantAlpha-5: The Sovereign BTC Institutional Quant Ensemble',
      'Estrategia 61: ExpertAlpha-1: Regime-Adaptive MTF Pullback (1H/4H)',
      'Estrategia 62: ExpertAlpha-2: Volatility Squeeze + Taker Buy Thrust',
      'Estrategia 63: ExpertAlpha-3: Liquidity Sweep + Mean-Reversion Snap',
      'Estrategia 64: ExpertAlpha-4: Spot CVD Climax Absorption',
      'Estrategia 65: ExpertAlpha-5: Rolling VWAP Institutional Hold',
      'Estrategia 66: ExpertAlpha-6: 4H Swing Keltner Directional Thrust',
      'Estrategia 67: ExpertAlpha-7: Z-Score Overextension & Funding Contrarian',
      'Estrategia 68: ExpertAlpha-8: Institutional Engulfing Order Block',
      'Estrategia 69: ExpertAlpha-9: NY Session Handover & US Premium Lead-Lag',
      'Estrategia 70: ExpertAlpha-10: Asymmetric 2.3:1 Expectancy Sniper'
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

      const formattedPnl = parseFloat((stat.totalPnlPercent || 0).toFixed(2));

      return {
        ...stat,
        completedCount: completed,
        winRate: winRate,
        winRatePercent: winRate,
        avgMfe: avgMfe,
        avgMfePercent: avgMfe,
        totalPnl: formattedPnl,
        totalPnlPercent: formattedPnl,
        directionalAccuracyPercent: directionalAccuracy,
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
