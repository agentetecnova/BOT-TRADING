import React from 'react';
import StrategyRankingService from '../services/StrategyRankingService';

export default function StrategyRankingComponent({ signalsHistory, onSelectStrategy }) {
  const rankings = StrategyRankingService.calculateStrategyRankings(signalsHistory);

  return (
    <div className="glass-panel" style={{
      padding: '1.5rem',
      borderRadius: '18px',
      background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.8) 100%)',
      border: '1px solid rgba(245, 158, 11, 0.25)',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem'
    }}>
      
      {/* HEADER DE RANKING */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🏆</span>
            <h3 style={{ fontSize: '1.2rem', color: '#fff', margin: 0, fontWeight: 800 }}>
              Ranking de Efectividad: 25 Estrategias Profesionales BTC
            </h3>
          </div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem', marginTop: '0.3rem' }}>
            Clasificación automática en tiempo real basada en la tasa de aciertos (% Win Rate) y rendimiento acumulado.
          </p>
        </div>

        <div style={{
          padding: '0.5rem 1rem',
          borderRadius: '10px',
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          color: '#f59e0b',
          fontSize: '0.8rem',
          fontWeight: 700
        }}>
          ⚡ Total Estrategias Activas: 25 / 25
        </div>
      </div>

      {/* TABLA DE LEADERBOARD */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--color-text-muted)' }}>
              <th style={{ padding: '0.75rem 0.5rem' }}>Pos.</th>
              <th style={{ padding: '0.75rem 0.5rem' }}>Estrategia</th>
              <th style={{ padding: '0.75rem 0.5rem' }}>Win Rate %</th>
              <th style={{ padding: '0.75rem 0.5rem' }}>TP / SL</th>
              <th style={{ padding: '0.75rem 0.5rem' }}>PnL Acumulado</th>
              <th style={{ padding: '0.75rem 0.5rem' }}>Categoría / Tier</th>
              <th style={{ padding: '0.75rem 0.5rem' }}>Acción</th>
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
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 800, color: isTop3 ? '#f59e0b' : '#94a3b8' }}>
                    {posBadge}
                  </td>

                  {/* Nombre Estrategia */}
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <div style={{ fontWeight: 700, color: '#fff' }}>{item.shortName}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{item.fullName}</div>
                  </td>

                  {/* Win Rate y Barra Visual */}
                  <td style={{ padding: '0.75rem 0.5rem', minWidth: '140px' }}>
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

                  {/* TP vs SL */}
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <span style={{ color: '#10b981', fontWeight: 700 }}>{item.tpCount} TP</span>
                    <span style={{ color: 'var(--color-text-muted)', margin: '0 0.3rem' }}>/</span>
                    <span style={{ color: '#ef4444', fontWeight: 700 }}>{item.slCount} SL</span>
                    {item.pendingCount > 0 && (
                      <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: '#f59e0b' }}>
                        ({item.pendingCount} en curso)
                      </span>
                    )}
                  </td>

                  {/* PnL Acumulado */}
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 800, color: item.totalPnlPercent >= 0 ? '#10b981' : '#ef4444' }}>
                    {item.totalPnlPercent >= 0 ? `+${item.totalPnlPercent}%` : `${item.totalPnlPercent}%`}
                  </td>

                  {/* Tier Badge */}
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <span style={{
                      padding: '0.2rem 0.55rem',
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
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    {onSelectStrategy && (
                      <button
                        onClick={() => onSelectStrategy(item.shortName)}
                        style={{
                          padding: '0.3rem 0.65rem',
                          borderRadius: '6px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff',
                          fontSize: '0.73rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        🔍 Filtrar
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
