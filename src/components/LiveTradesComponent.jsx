import React from 'react';
import SignalHistoryService from '../services/SignalHistoryService';

export default function LiveTradesComponent({ signalsHistory = [], btcPrice, onSelectStrategy }) {
  const activeTrades = signalsHistory.filter(s => s && s.status === 'PENDING');

  const formatPrice = (p) => {
    if (typeof p !== 'number' || isNaN(p)) return '--';
    return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="glass-panel" style={{
      padding: '1.75rem',
      borderRadius: '20px',
      background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.85) 100%)',
      border: '1px solid rgba(16, 185, 129, 0.25)',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem'
    }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.6rem' }}>⚡</span>
            <h3 style={{ fontSize: '1.3rem', color: '#fff', margin: 0, fontWeight: 800 }}>
              Operaciones en Vivo & Posiciones Abiertas
            </h3>
          </div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.3rem' }}>
            Monitoreo en tiempo real de las órdenes que se encuentran activas en el mercado en este segundo.
          </p>
        </div>

        <div style={{
          padding: '0.5rem 1.1rem',
          borderRadius: '12px',
          background: activeTrades.length > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
          border: `1px solid ${activeTrades.length > 0 ? '#10b981' : 'rgba(255,255,255,0.1)'}`,
          color: activeTrades.length > 0 ? '#10b981' : 'var(--color-text-muted)',
          fontSize: '0.85rem',
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          {activeTrades.length > 0 && <span className="pulse-yellow bg-emerald-500" style={{ width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', background: '#10b981' }}></span>}
          {activeTrades.length} {activeTrades.length === 1 ? 'Posición Activa' : 'Posiciones Activas'}
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      {activeTrades.length === 0 ? (
        <div style={{
          padding: '3.5rem 1.5rem',
          textAlign: 'center',
          background: 'rgba(255,255,255,0.01)',
          borderRadius: '16px',
          border: '1px dashed rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.8rem'
        }}>
          <span style={{ fontSize: '2.5rem' }}>🛡️</span>
          <div style={{ fontSize: '1.15rem', color: '#fff', fontWeight: 700 }}>
            Sin Operaciones Abiertas en este Momento
          </div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', maxWidth: '500px', margin: 0 }}>
            Las 25 estrategias cuantitativas están escaneando activamente los libros de órdenes y velas de Bitcoin en espera de confirmaciones de alta probabilidad.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
          {activeTrades.map(trade => {
            const isLong = trade.type === 'LONG';
            const entry = trade.entry || 0;
            const currentPrice = btcPrice || entry;
            
            // Cálculo PnL actual
            const rawPnl = isLong 
              ? ((currentPrice - entry) / entry) * 100 
              : ((entry - currentPrice) / entry) * 100;
            const pnl = parseFloat(rawPnl.toFixed(2));
            const isWinning = pnl >= 0;

            // Tiempo transcurrido
            const now = Date.now();
            const created = trade.createdAt || trade.timestamp || now;
            const durationStr = SignalHistoryService.formatDuration(now - created);

            // Cálculo de porcentaje de avance visual hacia TP vs SL
            let progressPercent = 50;
            if (isLong) {
              const totalRange = trade.tp - trade.sl;
              if (totalRange > 0) {
                progressPercent = Math.min(Math.max(((currentPrice - trade.sl) / totalRange) * 100, 0), 100);
              }
            } else {
              const totalRange = trade.sl - trade.tp;
              if (totalRange > 0) {
                progressPercent = Math.min(Math.max(((trade.sl - currentPrice) / totalRange) * 100, 0), 100);
              }
            }

            return (
              <div key={trade.id} style={{
                background: 'rgba(15, 23, 42, 0.85)',
                borderRadius: '16px',
                border: isLong ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                boxShadow: isLong ? '0 4px 20px rgba(16, 185, 129, 0.08)' : '0 4px 20px rgba(239, 68, 68, 0.08)'
              }}>
                {/* CABECERA DE LA TARJETA */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '6px',
                        fontWeight: 800,
                        fontSize: '0.75rem',
                        background: isLong ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: isLong ? '#10b981' : '#ef4444'
                      }}>
                        {trade.type}
                      </span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fff' }}>
                        {trade.strategy}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '0.2rem', display: 'block' }}>
                      ⏱️ En curso hace {durationStr}
                    </span>
                  </div>

                  {/* PnL FLOTANTE */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: isWinning ? '#10b981' : '#ef4444' }}>
                      {isWinning ? `+${pnl}%` : `${pnl}%`}
                    </div>
                    {typeof trade.maxFavorablePercent === 'number' && trade.maxFavorablePercent > 0 && (
                      <span style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: 700 }}>
                        Máx a favor: +{trade.maxFavorablePercent}% 🚀
                      </span>
                    )}
                  </div>
                </div>

                {/* PRECIOS Y NIVELES */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '0.5rem',
                  background: 'rgba(255,255,255,0.02)',
                  padding: '0.75rem',
                  borderRadius: '10px',
                  fontSize: '0.75rem',
                  textAlign: 'center'
                }}>
                  <div>
                    <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.68rem' }}>Stop Loss</span>
                    <span style={{ color: '#ef4444', fontWeight: 700 }} className="font-mono">${formatPrice(trade.sl)}</span>
                    <span style={{ color: '#ef4444', fontSize: '0.68rem', display: 'block' }}>(-{trade.riskPercent}%)</span>
                  </div>
                  <div style={{ borderLeft: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.68rem' }}>Entrada</span>
                    <span style={{ color: '#fff', fontWeight: 700 }} className="font-mono">${formatPrice(trade.entry)}</span>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.68rem', display: 'block' }}>Actual: ${formatPrice(currentPrice)}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.68rem' }}>Take Profit</span>
                    <span style={{ color: '#10b981', fontWeight: 700 }} className="font-mono">${formatPrice(trade.tp)}</span>
                    <span style={{ color: '#10b981', fontSize: '0.68rem', display: 'block' }}>(+{trade.profitPercent}%)</span>
                  </div>
                </div>

                {/* BARRA DE PROGRESO HACIA TP */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--color-text-muted)', marginBottom: '0.3rem' }}>
                    <span>🛑 SL</span>
                    <span>📍 Entrada</span>
                    <span>🎯 TP</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(239, 68, 68, 0.25)', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{
                      width: `${progressPercent}%`,
                      height: '100%',
                      background: isLong ? 'linear-gradient(90deg, #ef4444 0%, #3b82f6 50%, #10b981 100%)' : 'linear-gradient(90deg, #10b981 0%, #3b82f6 50%, #ef4444 100%)',
                      borderRadius: '4px',
                      transition: 'width 0.4s ease'
                    }} />
                  </div>
                </div>

                {/* BOTÓN VER HISTORIAL COMPLETO */}
                {onSelectStrategy && (
                  <button
                    onClick={() => onSelectStrategy(trade.strategy)}
                    style={{
                      width: '100%',
                      padding: '0.45rem',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#cbd5e1',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.08)'}
                    onMouseLeave={e => e.target.style.background = 'rgba(255,255,255,0.04)'}
                  >
                    🔍 Ver Historial y Reglas de {trade.strategy}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
