import React from 'react';
import AiHorizonSection from './AiHorizonSection';

export default function DecisionOraclePanel({
  oracleData,
  marketRegime,
  aiSnapshot,
  onSelectStrategy
}) {
  const fmt = (n) => {
    if (typeof n !== 'number' || isNaN(n)) return '--';
    return Math.round(n).toLocaleString('en-US');
  };

  if (!oracleData) {
    return (
      <div className="glass-panel" style={{
        padding: '1.5rem',
        borderRadius: '18px',
        border: '1px solid rgba(59, 130, 246, 0.25)',
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.7) 100%)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🧭</span>
          <div>
            <h2 style={{ fontSize: '1.15rem', color: '#fff', margin: 0 }}>Calculando Predicción y Plan de Decisión...</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
              Descargando velas históricas, ejecutando backtest walk-forward y analizando derivados en vivo.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const {
    action,
    actionTitle,
    actionEmoji,
    actionColor,
    convictionLabel,
    probUp,
    probDown,
    mtfSummary = [],
    resistance24h,
    support24h,
    expectedRange4h,
    expectedRange24h,
    plan,
    plainReasons = [],
    topBacktest = [],
    marketContext
  } = oracleData;

  const isLong = action === 'LONG';
  const isShort = action === 'SHORT';

  return (
    <section className="glass-panel" style={{
      padding: '1.5rem',
      borderRadius: '18px',
      border: `1px solid ${actionColor}55`,
      background: isLong
        ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.92) 55%)'
        : isShort
          ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(15, 23, 42, 0.92) 55%)'
          : 'linear-gradient(135deg, rgba(245, 158, 11, 0.07) 0%, rgba(15, 23, 42, 0.92) 55%)',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem'
    }}>

      {/* FILA 1: VEREDICTO CLARO + PROBABILIDAD CALIBRADA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ flex: '1 1 340px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '0.7rem',
              fontWeight: 800,
              padding: '0.2rem 0.6rem',
              borderRadius: '99px',
              background: `${actionColor}22`,
              color: actionColor,
              border: `1px solid ${actionColor}55`,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              🧭 Decisión Recomendada Ahora
            </span>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700 }}>
              Convicción: <b style={{ color: '#fff' }}>{convictionLabel}</b>
            </span>
          </div>

          <h2 style={{ fontSize: '1.45rem', fontWeight: 900, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>{actionEmoji}</span>
            <span style={{ color: actionColor }}>{actionTitle}</span>
          </h2>
        </div>

        {/* Barra Visual de Probabilidad */}
        <div style={{
          flex: '1 1 280px',
          maxWidth: '420px',
          background: 'rgba(0,0,0,0.28)',
          padding: '0.85rem 1rem',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.06)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.4rem' }}>
            <span style={{ color: '#10b981' }}>📈 Sube: {probUp}%</span>
            <span style={{ color: '#ef4444' }}>Baja: {probDown}% 📉</span>
          </div>
          <div style={{ height: '10px', width: '100%', background: 'rgba(239, 68, 68, 0.5)', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${probUp}%`,
              background: 'linear-gradient(90deg, #10b981 0%, #34d399 100%)',
              borderRadius: '99px',
              transition: 'width 0.4s ease'
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.4rem' }}>
            <span>Soporte: <b style={{ color: '#cbd5e1' }}>${fmt(support24h)}</b></span>
            <span>Resistencia: <b style={{ color: '#cbd5e1' }}>${fmt(resistance24h)}</b></span>
          </div>
        </div>
      </div>

      {/* FILA 2: EXPLICACIÓN SIMPLE + PLAN DE OPERACIÓN LISTO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '1rem' }}>

        {/* Columna Izquierda: Por qué dice esto (español claro) */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#93c5fd', textTransform: 'uppercase' }}>
            💡 ¿Por qué el sistema predice esto?
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.82rem', color: '#e2e8f0', lineHeight: '1.4' }}>
            {plainReasons.map((reason, idx) => (
              <li key={idx}>{reason}</li>
            ))}
          </ul>

          {/* Semáforo Multi-Temporalidad */}
          {mtfSummary.length > 0 && (
            <div style={{ marginTop: '0.35rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>Tendencia por reloj:</span>
              {mtfSummary.map(tf => {
                const badgeCol = tf.score > 0 ? '#10b981' : tf.score < 0 ? '#ef4444' : '#94a3b8';
                const icon = tf.score > 0 ? '▲' : tf.score < 0 ? '▼' : '●';
                return (
                  <span key={tf.key} style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.45rem',
                    borderRadius: '6px',
                    background: 'rgba(255,255,255,0.04)',
                    color: badgeCol,
                    border: `1px solid ${badgeCol}33`
                  }}>
                    {tf.label} {icon}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Columna Derecha: Plan de Operación Paso a Paso */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', border: `1px solid ${actionColor}33`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '0.75rem' }}>
          {plan ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.76rem', fontWeight: 800, color: actionColor, textTransform: 'uppercase' }}>
                  📐 Plan Sugerido ({plan.direction})
                </span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#cbd5e1', background: 'rgba(255,255,255,0.06)', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                  Riesgo / Beneficio {plan.rr}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.5rem', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.66rem', color: '#94a3b8', display: 'block' }}>Entrada</span>
                  <b className="font-mono" style={{ fontSize: '0.88rem', color: '#fff' }}>${fmt(plan.entry)}</b>
                </div>
                <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '0.5rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <span style={{ fontSize: '0.66rem', color: '#f87171', display: 'block' }}>Stop Loss</span>
                  <b className="font-mono" style={{ fontSize: '0.88rem', color: '#ef4444' }}>${fmt(plan.sl)}</b>
                  <span style={{ fontSize: '0.64rem', color: '#fca5a5', display: 'block' }}>-{plan.riskPct}%</span>
                </div>
                <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '0.5rem', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <span style={{ fontSize: '0.66rem', color: '#34d399', display: 'block' }}>Objetivo 1</span>
                  <b className="font-mono" style={{ fontSize: '0.88rem', color: '#10b981' }}>${fmt(plan.tp1)}</b>
                  <span style={{ fontSize: '0.64rem', color: '#6ee7b7', display: 'block' }}>+{plan.reward1Pct}%</span>
                </div>
                <div style={{ background: 'rgba(16, 185, 129, 0.12)', padding: '0.5rem', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <span style={{ fontSize: '0.66rem', color: '#34d399', display: 'block' }}>Objetivo 2</span>
                  <b className="font-mono" style={{ fontSize: '0.88rem', color: '#00e676' }}>${fmt(plan.tp2)}</b>
                  <span style={{ fontSize: '0.64rem', color: '#6ee7b7', display: 'block' }}>+{plan.reward2Pct}%</span>
                </div>
              </div>

              <div style={{ fontSize: '0.74rem', color: '#cbd5e1', background: 'rgba(0,0,0,0.2)', padding: '0.45rem 0.7rem', borderRadius: '8px' }}>
                🛡️ <b>Cuándo salir antes:</b> {plan.invalidation}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase' }}>
                ⏳ ¿Qué esperar para entrar seguro?
              </div>
              <p style={{ fontSize: '0.83rem', color: '#e2e8f0', margin: 0, lineHeight: '1.45' }}>
                Ahora mismo no hay ventaja estadística suficiente. Para evitar pérdidas en ruido lateral, espera a que BTC rompa con fuerza:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '0.55rem', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <span style={{ fontSize: '0.68rem', color: '#34d399', display: 'block', fontWeight: 700 }}>🟢 Activar COMPRA arriba de:</span>
                  <b className="font-mono" style={{ fontSize: '0.95rem', color: '#fff' }}>${fmt(resistance24h)}</b>
                </div>
                <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '0.55rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <span style={{ fontSize: '0.68rem', color: '#f87171', display: 'block', fontWeight: 700 }}>🔴 Activar VENTA abajo de:</span>
                  <b className="font-mono" style={{ fontSize: '0.95rem', color: '#fff' }}>${fmt(support24h)}</b>
                </div>
              </div>
            </div>
          )}

          {/* Rango Esperado 4H y 24H */}
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.73rem', color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
            <span>⏱️ Rango probable 4H: <b style={{ color: '#e2e8f0' }}>${fmt(expectedRange4h?.low)} – ${fmt(expectedRange4h?.high)}</b></span>
            <span>📆 Rango probable 24H: <b style={{ color: '#e2e8f0' }}>${fmt(expectedRange24h?.low)} – ${fmt(expectedRange24h?.high)}</b></span>
          </div>
        </div>
      </div>

      {/* FILA 3: DATOS REALES INSTITUCIONALES + TOP ESTRATEGIAS VERIFICADAS EN BACKTEST */}
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.73rem' }}>
          <span style={{ color: '#94a3b8', fontWeight: 700 }}>📡 Mercado Real:</span>
          {marketContext?.coinbasePremiumPct !== null && marketContext?.coinbasePremiumPct !== undefined && (
            <span style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', color: marketContext.coinbasePremiumPct >= 0 ? '#34d399' : '#f87171' }}>
              Coinbase US: <b>{marketContext.coinbasePremiumPct >= 0 ? '+' : ''}{marketContext.coinbasePremiumPct.toFixed(3)}%</b>
            </span>
          )}
          {marketContext?.fundingRatePct !== null && marketContext?.fundingRatePct !== undefined && (
            <span style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', color: '#cbd5e1' }}>
              Funding: <b>{marketContext.fundingRatePct}%</b>
            </span>
          )}
          {marketContext?.orderBookImbalancePct !== null && marketContext?.orderBookImbalancePct !== undefined && (
            <span style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', color: marketContext.orderBookImbalancePct >= 0 ? '#34d399' : '#f87171' }}>
              Libro Órdenes: <b>{marketContext.orderBookImbalancePct >= 0 ? '+' : ''}{marketContext.orderBookImbalancePct}%</b>
            </span>
          )}
          {marketContext?.whaleLongShortRatio !== null && marketContext?.whaleLongShortRatio !== undefined && (
            <span style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', color: '#cbd5e1' }}>
              Ballenas L/S: <b>{marketContext.whaleLongShortRatio.toFixed(2)}</b>
            </span>
          )}
          {marketContext?.fearAndGreed && (
            <span style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', color: marketContext.fearAndGreed.color }}>
              Sentimiento: <b>{marketContext.fearAndGreed.value} ({marketContext.fearAndGreed.labelEs})</b>
            </span>
          )}
        </div>

        {topBacktest.length > 0 && (
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.72rem' }}>
            <span style={{ color: '#fbbf24', fontWeight: 800 }}>🏆 Top Backtest Ahora:</span>
            {topBacktest.slice(0, 3).map(bt => (
              <button
                key={bt.strategy}
                onClick={() => onSelectStrategy && onSelectStrategy(bt.strategy)}
                style={{
                  padding: '0.2rem 0.5rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  background: 'rgba(16, 185, 129, 0.1)',
                  color: '#6ee7b7',
                  fontSize: '0.71rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {bt.strategy.replace('Estrategia ', 'E')}: {bt.winRate ?? 0}% (PF {bt.profitFactor})
              </button>
            ))}
          </div>
        )}
      </div>

      <AiHorizonSection aiSnapshot={aiSnapshot} />

    </section>
  );
}
