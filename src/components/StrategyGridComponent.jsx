import React from 'react';

const ALL_STRATEGY_DEFS = [
  { key: 'Estrategia 1', title: '⚡ Confluencia Rápida (15m)', icon: '⚡' },
  { key: 'Estrategia 2', title: '💎 Pro Trader (EMAs + RSI 7)', icon: '💎' },
  { key: 'Estrategia 3', title: '🛡️ Liquidation Sweep & Reversal', icon: '🛡️' },
  { key: 'Estrategia 4', title: '📊 Trend Squeeze (1D / 1W)', icon: '📊' },
  { key: 'Estrategia 5', title: '📐 Z-Score VWAP Reversión a la Media', icon: '📐' },
  { key: 'Estrategia 6', title: '🚀 Supertrend Multitemporal Cuantitativo', icon: '🚀' },
  { key: 'Estrategia 7', title: '🏛️ Smart Money Concepts (FVG + OB)', icon: '🏛️' },
  { key: 'Estrategia 8', title: '🎯 Perfil de Volumen (Volume Profile POC)', icon: '🎯' },
  { key: 'Estrategia 9', title: '☁️ Ichimoku Cloud Breakout 4H', icon: '☁️' },
  { key: 'Estrategia 10', title: '💥 Bollinger & Keltner Squeeze Expansion', icon: '💥' },
  { key: 'Estrategia 11', title: '🌊 Order Flow CVD Delta Divergence', icon: '🌊' },
  { key: 'Estrategia 12', title: '🧩 Estructura Wyckoff (Spring / Upthrust)', icon: '🧩' },
  { key: 'Estrategia 13', title: '📐 Patrones Armónicos Fibonacci', icon: '📐' },
  { key: 'Estrategia 14', title: '💵 Chaikin Money Flow & OBV Accumulation', icon: '💵' },
  { key: 'Estrategia 15', title: '📈 MACD Histogram Momentum Shift 4H', icon: '📈' },
  { key: 'Estrategia 16', title: '🏹 Parabolic SAR + ADX Trend Strength', icon: '🏹' },
  { key: 'Estrategia 17', title: '📉 Keltner Channel Mean Reversion Scalp', icon: '📉' },
  { key: 'Estrategia 18', title: '📍 Puntos Pivote Camarilla Confluence', icon: '📍' },
  { key: 'Estrategia 19', title: '⚡ Stochastic RSI Extreme Crossover', icon: '⚡' },
  { key: 'Estrategia 20', title: '🐢 Donchian Channel 20 (Turtle Trade)', icon: '🐢' },
  { key: 'Estrategia 21', title: '🌀 Hull Moving Average (HMA 20) Zero-Lag', icon: '🌀' },
  { key: 'Estrategia 22', title: '🌋 Agotamiento Volatilidad ATR Spike', icon: '🌋' },
  { key: 'Estrategia 23', title: '🎗️ Multi-Timeframe Ribbon Convergence', icon: '🎗️' },
  { key: 'Estrategia 24', title: '🌊 Liquidity Pool Impulse & MSS Breakout', icon: '🌊' },
  { key: 'Estrategia 25', title: '👑 Consenso Maestro Quant Ensemble 2.0', icon: '👑' },
];

export default function StrategyGridComponent({ allAnalysisMap, signalsHistory, analysisLoading, formatPrice }) {
  const getStatsByStrategy = (stratName) => {
    if (!signalsHistory) return { winRate: null, tpCount: 0, slCount: 0, total: 0 };
    const resolved = signalsHistory.filter(s => s.strategy === stratName && (s.status === 'TP' || s.status === 'SL'));
    if (resolved.length === 0) return { winRate: null, tpCount: 0, slCount: 0, total: 0 };

    const tpCount = resolved.filter(s => s.status === 'TP').length;
    const slCount = resolved.filter(s => s.status === 'SL').length;
    const winRate = Math.round((tpCount / resolved.length) * 100);

    return { winRate, tpCount, slCount, total: resolved.length };
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
      {ALL_STRATEGY_DEFS.map(stratItem => {
        const stratData = allAnalysisMap[stratItem.key];
        const stats = getStatsByStrategy(stratItem.key);

        return (
          <div key={stratItem.key} style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '14px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#f59e0b', fontWeight: 800, letterSpacing: '0.05em' }}>
                  {stratItem.key} {stats.winRate !== null ? `• WR: ${stats.winRate}% (${stats.tpCount} TP / ${stats.slCount} SL)` : '• WR: --'}
                </span>
                <h3 style={{ fontSize: '1.05rem', color: '#fff', marginTop: '0.15rem', margin: 0, fontWeight: 700 }}>{stratItem.title}</h3>
              </div>
              {stratData && stratData.bias && (
                <span style={{
                  fontSize: '0.73rem',
                  fontWeight: 800,
                  padding: '0.2rem 0.55rem',
                  borderRadius: '6px',
                  background: stratData.bias.includes('ALCISTA') || stratData.bias.includes('COMPRA') ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 23, 68, 0.15)',
                  color: stratData.bias.includes('ALCISTA') || stratData.bias.includes('COMPRA') ? 'var(--color-up)' : 'var(--color-down)'
                }}>
                  {stratData.bias.split(' ')[0]}
                </span>
              )}
            </div>

            {analysisLoading ? (
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem 0' }}>Cargando indicadores...</div>
            ) : stratData ? (
              <>
                {/* Probabilities progress bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--color-up)' }}>COMPRA: {stratData.pUp}%</span>
                    <span style={{ color: 'var(--color-down)' }}>VENTA: {stratData.pDown}%</span>
                  </div>
                  <div style={{ height: '7px', background: 'rgba(255, 23, 68, 0.2)', borderRadius: '99px', overflow: 'hidden', display: 'flex' }}>
                    <div style={{ width: `${stratData.pUp}%`, background: 'var(--color-up)', transition: 'width 0.5s ease' }} />
                    <div style={{ width: `${stratData.pDown}%`, background: 'var(--color-down)', transition: 'width 0.5s ease' }} />
                  </div>
                </div>

                {/* Active Signal */}
                {stratData.hasSignal && stratData.signal ? (
                  <div style={{
                    padding: '0.75rem',
                    borderRadius: '10px',
                    background: stratData.signal.type === 'LONG' ? 'rgba(0,230,118,0.06)' : 'rgba(255,23,68,0.06)',
                    border: `1px solid ${stratData.signal.type === 'LONG' ? 'rgba(0,230,118,0.2)' : 'rgba(255,23,68,0.2)'}`
                  }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: stratData.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)', marginBottom: '0.3rem' }}>
                      SEÑAL ACTIVA: {stratData.signal.type}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                      <div>Entrada: ${formatPrice(stratData.signal.entry)}</div>
                      <div style={{ color: 'var(--color-down)' }}>Stop Loss: ${formatPrice(stratData.signal.sl)} (-{stratData.signal.riskPercent}%)</div>
                      <div style={{ color: 'var(--color-up)' }}>Take Profit: ${formatPrice(stratData.signal.tp)} (+{stratData.signal.profitPercent}%)</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '0.6rem', textAlign: 'center', fontSize: '0.73rem', color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: '8px' }}>
                    Sin señal activa en este momento.
                  </div>
                )}

                {/* Reasons */}
                {stratData.reasons && stratData.reasons.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <ul style={{ paddingLeft: '1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.78rem', color: '#cbd5e1' }}>
                      {stratData.reasons.slice(0, 3).map((r, i) => (
                        <li key={i} style={{ lineBreak: 'anywhere' }}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
