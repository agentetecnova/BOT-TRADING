/**
 * strategyHealth.js
 *
 * Shared health semaphore evaluation (PROFITABLE / TESTING / LOSING / DISABLED)
 * and persistent storage for silenced strategies.
 */

const DISABLED_STORAGE_KEY = 'btc_disabled_strategies_v1';

export function loadDisabledStrategies() {
  try {
    const raw = localStorage.getItem(DISABLED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

export function saveDisabledStrategies(disabledSet) {
  try {
    localStorage.setItem(DISABLED_STORAGE_KEY, JSON.stringify(Array.from(disabledSet)));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

/**
 * Combines walk-forward historical backtest and live closed signals to classify
 * whether a strategy is statistically profitable, still in testing, or losing.
 */
export function evaluateStrategyHealth({ bt = null, liveStats = null, isDisabled = false }) {
  if (isDisabled) {
    return {
      status: 'DISABLED',
      badge: '🚫 Silenciada',
      color: '#64748b',
      bg: 'rgba(100, 116, 139, 0.16)',
      effectivePf: null,
      effectiveWr: null,
      totalSamples: (bt?.totalTrades || 0) + ((liveStats?.tpCount || 0) + (liveStats?.slCount || 0))
    };
  }

  const btTrades = bt?.totalTrades || 0;
  const btPf = typeof bt?.profitFactor === 'number' ? bt.profitFactor : null;
  const btPnl = typeof bt?.totalPnl === 'number' ? bt.totalPnl : 0;

  const liveResolved = (liveStats?.tpCount || 0) + (liveStats?.slCount || 0);
  const livePnl = typeof liveStats?.totalPnl === 'number'
    ? liveStats.totalPnl
    : (typeof liveStats?.totalPnlPercent === 'number' ? liveStats.totalPnlPercent : 0);

  // Estimate live Profit Factor conservatively from TP vs SL counts & PnL if >= 3 resolved live signals
  let livePf = null;
  if (liveResolved >= 3) {
    if ((liveStats?.slCount || 0) === 0) {
      livePf = 3.0;
    } else {
      const approxWinPnl = Math.max(0.1, (liveStats.tpCount || 0) * 1.8);
      const approxLossPnl = Math.max(0.1, (liveStats.slCount || 0) * 1.0);
      livePf = parseFloat((approxWinPnl / approxLossPnl).toFixed(2));
    }
  }

  const totalSamples = btTrades + liveResolved;
  const effectivePf = liveResolved >= 6 && livePf !== null ? livePf : (btPf ?? livePf);
  const effectivePnl = liveResolved >= 6 ? livePnl : (btTrades > 0 ? btPnl : livePnl);
  const effectiveWr = liveResolved >= 3
    ? (liveStats?.winRate ?? liveStats?.winRatePercent ?? null)
    : (bt?.winRate ?? null);

  if (totalSamples < 6 || effectivePf === null) {
    return {
      status: 'TESTING',
      badge: '🟡 En Prueba',
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.14)',
      effectivePf,
      effectiveWr,
      totalSamples
    };
  }

  if (effectivePf >= 1.20 && effectivePnl > 0) {
    return {
      status: 'PROFITABLE',
      badge: '🟢 Rentable',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.14)',
      effectivePf,
      effectiveWr,
      totalSamples
    };
  }

  if (effectivePf < 1.0 || effectivePnl < -0.5) {
    return {
      status: 'LOSING',
      badge: '🔴 Perdedora',
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.14)',
      effectivePf,
      effectiveWr,
      totalSamples
    };
  }

  return {
    status: 'TESTING',
    badge: '🟡 Neutral',
    color: '#fbbf24',
    bg: 'rgba(245, 158, 11, 0.12)',
    effectivePf,
    effectiveWr,
    totalSamples
  };
}
