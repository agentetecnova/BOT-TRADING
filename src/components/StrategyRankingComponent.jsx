import React from 'react';
import StrategyRankingService from '../services/StrategyRankingService';

export default function StrategyRankingComponent({ signalsHistory, onSelectStrategy }) {
  const rankings = StrategyRankingService.calculateStrategyRankings(signalsHistory);

  // Calcular métricas globales de resumen
  const totalTpAll = rankings.reduce((acc, r) => acc + r.tpCount, 0);
  const totalSlAll = rankings.reduce((acc, r) => acc + r.slCount, 0);
  const totalSignalsAll = rankings.reduce((acc, r) => acc + r.totalSignals, 0);
  const globalWinRate = (totalTpAll + totalSlAll) > 0 ? Math.round((totalTpAll / (totalTpAll + totalSlAll)) * 100) : 0;
  
  const topStrategy = rankings[0] || null;
  const bestMfeStrategy = [...rankings].sort((a, b) => b.avgMfePercent - a.avgMfePercent)[0] || null;

  return (
    <div className="glass-panel" style={{
      padding: '1.75rem',
      borderRadius: '20px',
      background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.85) 100%)',
      border: '1px solid rgba(245, 158, 11, 0.25)',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem'
    }}>
      
      {/* HEADER DE RANKING */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.6rem' }}>🏆</span>
            <h3 style={{ fontSize: '1.3rem', color: '#fff', margin: 0, fontWeight: 800 }}>
              Ranking de Efectividad & Auditoría Predictiva (25 Estrategias BTC)
            </h3>
          </div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.3rem' }}>
            Auditoría matemática del acierto a Take Profit, avance potencial a favor (MFE) y precisión direccional de cada modelo.
          </p>
        </div>

        <div style={{
          padding: '0.5rem 1rem',
          borderRadius: '12px',
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          color: '#f59e0b',
          fontSize: '0.82rem',
          fontWeight: 800
        }}>
          ⚡ 25 Modelos Cuantitativos Activos
        </div>
      </div>

      {/* TOP KPI SUMMARY CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        
        {/* Card 1: Mejor Win Rate */}
        <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>🥇 Mejor Tasa de Acierto (TP)</span>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#10b981', marginTop: '0.2rem' }}>
            {topStrategy ? `${topStrategy.shortName} (${topStrategy.winRatePercent}%)` : '--'}
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
            {topStrategy ? `${topStrategy.tpCount} TP alcanzados de ${topStrategy.totalSignals} señales` : '--'}
          </span>
        </div>

        {/* Card 2: Mayor MFE Promedio */}
        <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>🚀 Mayor Ganancia a Favor (MFE)</span>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#3b82f6', marginTop: '0.2rem' }}>
            {bestMfeStrategy ? `${bestMfeStrategy.shortName} (+${bestMfeStrategy.avgMfePercent}%)` : '--'}
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
            Avance promedio máximo alcanzado a favor
          </span>
        </div>

        {/* Card 3: Balance Global de TPs */}
        <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>🎯 Balance Global de Señales</span>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f59e0b', marginTop: '0.2rem' }}>
            {totalTpAll} TP / {totalSlAll} SL
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
            {totalSignalsAll} señales registradas en total ({globalWinRate}% Win Rate global)
          </span>
        </div>

      </div>

      {/* TABLA DE LEADERBOARD & AUDITORÍA */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--color-text-muted)' }}>
              <th style={{ padding: '0.85rem 0.5rem' }}>Pos.</th>
              <th style={{ padding: '0.85rem 0.5rem' }}>Estrategia</th>
              <th style={{ padding: '0.85rem 0.5rem' }}>Win Rate % (TP)</th>
              <th style={{ padding: '0.85rem 0.5rem' }}>Máx. a Favor (MFE)</th>
              <th style={{ padding: '0.85rem 0.5rem' }}>Acierto Direccional</th>
              <th style={{ padding: '0.85rem 0.5rem' }}>TP / SL / Timeouts</th>
              <th style={{ padding: '0.85rem 0.5rem' }}>PnL Acum.</th>
              <th style={{ padding: '0.85rem 0.5rem' }}>Tier</th>
              <th style={{ padding: '0.85rem 0.5rem' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((item, idx) => {
              const isTop3 = idx < 3;
              const posBadge = idx === 0 ? '🥇 #1' : idx === 1 ? '🥈 #2' : idx === 2 ? '🥉 #3' : `#${idx + 1}`;
              const barColor = item.winRatePercent >= 75 ? '#10b981' : item.winRatePercent >= 50 ? '#3b82f6' : '#f59e0b';

              return (
                <tr key={item.shortName} style={{
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  background: isTop3 ? 'rgba(245, 158, 11, 0.04)' : 'transparent',
                  transition: 'background 0.2s ease'
                }}>
                  {/* Posición */}
                  <td style={{ padding: '0.85rem 0.5rem', fontWeight: 800, color: isTop3 ? '#f59e0b' : '#94a3b8' }}>
                    {posBadge}
                  </td>

                  {/* Nombre Estrategia */}
                  <td style={{ padding: '0.85rem 0.5rem' }}>
                    <div style={{ fontWeight: 700, color: '#fff' }}>{item.shortName}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{item.fullName}</div>
                  </td>

                  {/* Win Rate y Barra Visual */}
                  <td style={{ padding: '0.85rem 0.5rem', minWidth: '130px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 800, color: barColor, fontSize: '0.9rem' }}>{item.winRatePercent}%</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{item.completedCount} resueltas</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(item.winRatePercent, 100)}%`,
                        height: '100%',
                        background: barColor,
                        borderRadius: '3px',
                        transition: 'width 0.4s ease'
                      }} />
                    </div>
                  </td>

                  {/* MFE Promedio */}
                  <td style={{ padding: '0.85rem 0.5rem', fontWeight: 800, color: '#38bdf8' }}>
                    +{item.avgMfePercent}% 🚀
                  </td>

                  {/* Acierto Direccional */}
                  <td style={{ padding: '0.85rem 0.5rem' }}>
                    <span style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: '6px',
                      background: item.directionalAccuracyPercent >= 70 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.04)',
                      color: item.directionalAccuracyPercent >= 70 ? '#10b981' : '#cbd5e1',
                      fontWeight: 700,
                      fontSize: '0.78rem'
                    }}>
                      {item.directionalAccuracyPercent}%
                    </span>
                  </td>

                  {/* TP vs SL vs Timeouts */}
                  <td style={{ padding: '0.85rem 0.5rem' }}>
                    <span style={{ color: '#10b981', fontWeight: 700 }}>{item.tpCount} TP</span>
                    <span style={{ color: 'var(--color-text-muted)', margin: '0 0.3rem' }}>/</span>
                    <span style={{ color: '#ef4444', fontWeight: 700 }}>{item.slCount} SL</span>
                    {item.timeoutCount > 0 && (
                      <span style={{ marginLeft: '0.35rem', color: '#94a3b8', fontSize: '0.72rem' }}>
                        ({item.timeoutCount} exp)
                      </span>
                    )}
                    {item.pendingCount > 0 && (
                      <span style={{ marginLeft: '0.35rem', fontSize: '0.72rem', color: '#f59e0b' }}>
                        [{item.pendingCount} activa]
                      </span>
                    )}
                  </td>

                  {/* PnL Acumulado */}
                  <td style={{ padding: '0.85rem 0.5rem', fontWeight: 800, color: item.totalPnlPercent >= 0 ? '#10b981' : '#ef4444' }}>
                    {item.totalPnlPercent >= 0 ? `+${item.totalPnlPercent}%` : `${item.totalPnlPercent}%`}
                  </td>

                  {/* Tier Badge */}
                  <td style={{ padding: '0.85rem 0.5rem' }}>
                    <span style={{
                      padding: '0.25rem 0.55rem',
                      borderRadius: '6px',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      background: item.winRatePercent >= 75 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                      border: `1px solid ${item.winRatePercent >= 75 ? '#10b981' : '#3b82f6'}`,
                      color: item.winRatePercent >= 75 ? '#10b981' : '#60a5fa'
                    }}>
                      {item.tier}
                    </span>
                  </td>

                  {/* Botón Ver Señales */}
                  <td style={{ padding: '0.85rem 0.5rem' }}>
                    {onSelectStrategy && (
                      <button
                        onClick={() => onSelectStrategy(item.shortName)}
                        style={{
                          padding: '0.35rem 0.75rem',
                          borderRadius: '8px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={e => e.target.style.background = 'rgba(245, 158, 11, 0.2)'}
                        onMouseLeave={e => e.target.style.background = 'rgba(255,255,255,0.05)'}
                      >
                        🔍 Ver Historial
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
