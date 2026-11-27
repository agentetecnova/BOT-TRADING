import React, { useState } from 'react';

function fmtUsd(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '--';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function fmtBillions(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '--';
  return `$${(n / 1e9).toFixed(1)}B`;
}

function fmtThousands(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '--';
  return `${Math.round(n / 1000).toLocaleString('en-US')}k`;
}

function timeAgoLabel(isoStr) {
  if (!isoStr) return '--';
  const diffMin = Math.max(0, Math.round((Date.now() - Date.parse(isoStr)) / 60000));
  if (diffMin < 2) return 'hace instantes';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const hrs = Math.floor(diffMin / 60);
  if (hrs < 24) return `hace ${hrs}h ${diffMin % 60}m`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

function HorizonCard({ data, isSwing }) {
  const [showAnalogs, setShowAnalogs] = useState(false);
  if (!data) return null;

  const isLong = data.verdict === 'LONG';
  const isShort = data.verdict === 'SHORT';
  const accent = isLong ? '#10b981' : isShort ? '#ef4444' : '#f59e0b';
  const badgeIcon = isSwing ? '🌊' : '⚡';

  const bestWf = data.probLongPct >= data.probShortPct ? data.walkForward?.long : data.walkForward?.short;
  const bestSideLabel = data.probLongPct >= data.probShortPct ? 'LONG' : 'SHORT';
  const analogs = data.historicalAnalogs?.analogs || [];
  const analogSummary = data.historicalAnalogs?.summary || {};

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.72)',
      border: `1px solid ${accent}44`,
      borderRadius: '14px',
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem'
    }}>
      {/* Encabezado de horizonte */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#e2e8f0' }}>
          {badgeIcon} {data.labelEs}
        </span>
        <span style={{
          fontSize: '0.7rem',
          fontWeight: 800,
          padding: '0.18rem 0.55rem',
          borderRadius: '99px',
          background: `${accent}22`,
          color: accent,
          border: `1px solid ${accent}55`
        }}>
          {data.verdictEs}
        </span>
      </div>

      {/* Probabilidades calibradas + Valor Esperado neto */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.45rem', textAlign: 'center' }}>
        <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '0.45rem', borderRadius: '8px' }}>
          <span style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block' }}>Prob. Compra</span>
          <b className="font-mono" style={{ fontSize: '0.92rem', color: '#34d399' }}>{data.probLongPct}%</b>
          <span style={{ fontSize: '0.63rem', color: data.evLongPct > 0 ? '#6ee7b7' : '#94a3b8', display: 'block' }}>
            EV: {data.evLongPct >= 0 ? '+' : ''}{data.evLongPct}%
          </span>
        </div>
        <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '0.45rem', borderRadius: '8px' }}>
          <span style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block' }}>Prob. Venta</span>
          <b className="font-mono" style={{ fontSize: '0.92rem', color: '#f87171' }}>{data.probShortPct}%</b>
          <span style={{ fontSize: '0.63rem', color: data.evShortPct > 0 ? '#fca5a5' : '#94a3b8', display: 'block' }}>
            EV: {data.evShortPct >= 0 ? '+' : ''}{data.evShortPct}%
          </span>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.45rem', borderRadius: '8px' }}>
          <span style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block' }}>Histórico IA ({bestSideLabel})</span>
          <b className="font-mono" style={{ fontSize: '0.88rem', color: bestWf?.edgeValidated ? '#6ee7b7' : '#cbd5e1' }}>
            {bestWf?.winRatePct ?? '--'}% WR
          </b>
          <span style={{ fontSize: '0.63rem', color: '#94a3b8', display: 'block' }}>
            PF {bestWf?.profitFactor ?? '--'} ({bestWf?.trades ?? 0} ops)
          </span>
        </div>
      </div>

      {/* Plan sugerido si EV > 0 */}
      {data.plan ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem', textAlign: 'center', fontSize: '0.75rem' }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.4rem', borderRadius: '6px' }}>
            <span style={{ fontSize: '0.62rem', color: '#94a3b8', display: 'block' }}>Entrada</span>
            <b className="font-mono" style={{ color: '#fff' }}>{fmtUsd(data.plan.entry)}</b>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.08)', padding: '0.4rem', borderRadius: '6px' }}>
            <span style={{ fontSize: '0.62rem', color: '#fca5a5', display: 'block' }}>Stop Loss</span>
            <b className="font-mono" style={{ color: '#ef4444' }}>{fmtUsd(data.plan.sl)}</b>
          </div>
          <div style={{ background: 'rgba(16,185,129,0.08)', padding: '0.4rem', borderRadius: '6px' }}>
            <span style={{ fontSize: '0.62rem', color: '#6ee7b7', display: 'block' }}>TP 1</span>
            <b className="font-mono" style={{ color: '#10b981' }}>{fmtUsd(data.plan.tp1)}</b>
          </div>
          <div style={{ background: 'rgba(16,185,129,0.12)', padding: '0.4rem', borderRadius: '6px' }}>
            <span style={{ fontSize: '0.62rem', color: '#6ee7b7', display: 'block' }}>TP 2 (R:R {data.plan.rr})</span>
            <b className="font-mono" style={{ color: '#00e676' }}>{fmtUsd(data.plan.tp2)}</b>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '0.76rem', color: '#cbd5e1', background: 'rgba(245, 158, 11, 0.08)', padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
          ⏳ La IA no detecta ventaja positiva neta después de comisiones en <b>{data.timeframe.toUpperCase()}</b>. Conviene esperar mejor precio.
        </div>
      )}

      {/* Razones activas (On-Chain + Técnico) */}
      {data.topDrivers && data.topDrivers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem', fontSize: '0.74rem' }}>
          <span style={{ color: '#93c5fd', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>
            Factores dominantes ahora:
          </span>
          {data.topDrivers.slice(0, 3).map((d) => (
            <div key={d.feature} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', color: '#e2e8f0' }}>
              <span>• {d.label} <span style={{ color: '#64748b' }}>({d.category})</span></span>
              <b style={{ color: d.zScore >= 0 ? '#34d399' : '#f87171', whiteSpace: 'nowrap' }}>
                {d.state} ({d.zScore >= 0 ? '+' : ''}{d.zScore}σ)
              </b>
            </div>
          ))}
        </div>
      )}

      {/* Análogos Históricos (k-NN) */}
      {analogs.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.55rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>
              🕰️ En los <b>{analogSummary.count} momentos más parecidos</b>: promedio{' '}
              <b style={{ color: analogSummary.avgReturnPct >= 0 ? '#34d399' : '#f87171' }}>
                {analogSummary.avgReturnPct >= 0 ? '+' : ''}{analogSummary.avgReturnPct}%
              </b>{' '}
              ({analogSummary.positiveRatePct}% subió)
            </span>
            <button
              onClick={() => setShowAnalogs(v => !v)}
              style={{
                background: 'rgba(59, 130, 246, 0.14)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#93c5fd',
                fontSize: '0.69rem',
                fontWeight: 700,
                padding: '0.2rem 0.5rem',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              {showAnalogs ? 'Ocultar fechas' : 'Ver 10 fechas'}
            </button>
          </div>

          {showAnalogs && (
            <div style={{ marginTop: '0.5rem', maxHeight: '165px', overflowY: 'auto', fontSize: '0.71rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: '#cbd5e1' }}>
                <thead>
                  <tr style={{ color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'left' }}>
                    <th style={{ padding: '0.25rem' }}>Fecha</th>
                    <th style={{ padding: '0.25rem' }}>Similitud</th>
                    <th style={{ padding: '0.25rem' }}>BTC entonces</th>
                    <th style={{ padding: '0.25rem', textAlign: 'right' }}>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {analogs.map((a) => (
                    <tr key={a.date} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '0.25rem' }}>{a.date}</td>
                      <td style={{ padding: '0.25rem' }}>{a.similarityPct}%</td>
                      <td style={{ padding: '0.25rem' }}>{fmtUsd(a.price)}</td>
                      <td style={{ padding: '0.25rem', textAlign: 'right', fontWeight: 700, color: a.fwdReturnPct >= 0 ? '#34d399' : '#f87171' }}>
                        {a.fwdReturnPct >= 0 ? '+' : ''}{a.fwdReturnPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AiHorizonSection({ aiSnapshot }) {
  if (!aiSnapshot || !aiSnapshot.horizons) {
    return null;
  }

  const oc = aiSnapshot.onchainContext || {};
  const mempool = oc.mempool || {};

  return (
    <div style={{
      borderTop: '1px solid rgba(255,255,255,0.08)',
      paddingTop: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.85rem'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#93c5fd' }}>
            🧠 Motor IA On-Chain + Histórica (Walk-Forward BTCUSDT)
          </span>
          <span style={{ fontSize: '0.69rem', color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '0.15rem 0.45rem', borderRadius: '6px' }}>
            Actualizado {timeAgoLabel(aiSnapshot.generatedAtUtc)} ({aiSnapshot.sourceUrl === 'github-hourly' ? 'Nube cada 1h' : 'Snapshot local'})
          </span>
        </div>

        {/* Métricas On-Chain Reales */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', fontSize: '0.7rem' }}>
          {oc.stablecoinMcapUsd && (
            <span style={{ padding: '0.18rem 0.45rem', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', color: (oc.stablecoin7dChgPct || 0) >= 0 ? '#34d399' : '#f87171' }}>
              Stablecoins: <b>{fmtBillions(oc.stablecoinMcapUsd)}</b> ({oc.stablecoin7dChgPct >= 0 ? '+' : ''}{oc.stablecoin7dChgPct ?? '--'}% 7d)
            </span>
          )}
          {oc.activeAddresses && (
            <span style={{ padding: '0.18rem 0.45rem', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', color: '#cbd5e1' }}>
              Red BTC: <b>{fmtThousands(oc.activeAddresses)} dir/día</b>
            </span>
          )}
          {mempool.fastest_fee_sat && (
            <span style={{ padding: '0.18rem 0.45rem', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', color: '#cbd5e1' }}>
              Mempool: <b>{mempool.fastest_fee_sat} sat/vB</b>
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '0.9rem' }}>
        <HorizonCard data={aiSnapshot.horizons.intraday} isSwing={false} />
        <HorizonCard data={aiSnapshot.horizons.swing} isSwing={true} />
      </div>
    </div>
  );
}
