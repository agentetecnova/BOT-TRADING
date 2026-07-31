import React, { useState, useEffect } from 'react';
import btcMasterAnalysisService from '../services/BTCMasterAnalysisService';

export default function BTCMasterSheet() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'report' | 'blocks'

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await btcMasterAnalysisService.runFullMasterAnalysis();
      if (res.success) {
        setData(res.data);
      } else {
        setError(res.error || 'Error al calcular el análisis de Hoja 2');
      }
    } catch (err) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAnalysis();
    const interval = setInterval(runAnalysis, 30000); // Actualizar cada 30s
    return () => clearInterval(interval);
  }, []);

  const copyReportToClipboard = () => {
    if (!data || !data.dailyReportMarkdown) return;
    navigator.clipboard.writeText(data.dailyReportMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (loading && !data) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>👑</div>
        <h3>Ejecutando Análisis Cuantitativo Maestro de BTC...</h3>
        <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Calculando 6 bloques de indicadores, SMC, Order Blocks, Wyckoff y Scoring (-10 a +10)...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ padding: '2rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '16px', color: '#ef4444' }}>
        <h3>⚠️ Error en Hoja 2</h3>
        <p>{error}</p>
        <button onClick={runAnalysis} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Reintentar</button>
      </div>
    );
  }

  const p = data.currentPrice || 0;
  const z = data.priceZones || { r1: 0, r2: 0, s1: 0, s2: 0, longSetup: {}, shortSetup: {} };
  const l = z.longSetup || { entry: p, sl: p, tp1: p, tp2: p, rr: 2 };
  const s = z.shortSetup || { entry: p, sl: p, tp1: p, tp2: p, rr: 2 };
  const a4 = data.analysis4h || { trend: { score: 0, details: [] }, momentum: { score: 0, details: [] }, volatility: { score: 0, details: [] }, volume: { score: 0, details: [], cmf: 0, vwap: p }, advanced: { score: 0, details: [], wyckoff: { phase: 'N/A' }, smc: { orderBlocks: [] }, fibs: {}, onchain: { fundingRate: 0 } }, candles: {} };
  const a1d = data.analysis1d || { trend: { score: 0, details: [] }, momentum: { score: 0, details: [] }, volatility: { score: 0, details: [], atr: 0 }, volume: { score: 0, details: [] }, advanced: { score: 0, details: [], fibs: { '0.618': p } }, candles: {} };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      
      {/* 👑 HEADER PRINCIPAL HOJA 2 */}
      <div className="glass-panel" style={{
        padding: '1.5rem',
        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.06) 0%, rgba(15, 23, 42, 0.75) 100%)',
        border: '1px solid rgba(168, 85, 247, 0.3)',
        borderRadius: '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <span style={{ fontSize: '1.4rem' }}>👑</span>
              <h1 style={{ fontSize: '1.4rem', color: '#fff', margin: 0, fontWeight: 800, letterSpacing: '-0.02em' }}>
                HOJA 2: BTC Master Pro — Bot de Análisis Técnico
              </h1>
            </div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.3rem' }}>
              Análisis cuantitativo avanzado especializado en Bitcoin (BTC/USDT). SMC, Wyckoff, Fibonacci & Reporte UTC 00:05.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button 
              onClick={runAnalysis}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '10px',
                background: 'rgba(168, 85, 247, 0.15)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                color: '#a855f7',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              🔄 Recargar Análisis
            </button>
            <button 
              onClick={copyReportToClipboard}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '10px',
                background: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.15)',
                border: `1px solid ${copied ? '#10b981' : '#f59e0b'}`,
                color: copied ? '#10b981' : '#f59e0b',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {copied ? '✅ ¡Reporte Copiado!' : '📋 Copiar Reporte Diario'}
            </button>
          </div>
        </div>

        {/* METRICAS PRINCIPALES MAESTRAS */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginTop: '0.5rem'
        }}>
          
          {/* Tacómetro Score Compuesto */}
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '14px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Score Compuesto (-10 a +10)</span>
            <div style={{ fontSize: '2.2rem', fontWeight: 900, margin: '0.2rem 0', color: data.compositeScore > 0 ? 'var(--color-up)' : data.compositeScore < 0 ? 'var(--color-down)' : '#cbd5e1' }}>
              {data.compositeScore > 0 ? `+${data.compositeScore}` : data.compositeScore}
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a855f7' }}>
              Confianza: {data.confidencePercent}%
            </div>
          </div>

          {/* Señal Principal */}
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '14px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Señal de Dirección</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0.4rem 0', color: data.signal.includes('COMPRA') ? 'var(--color-up)' : data.signal.includes('VENTA') ? 'var(--color-down)' : '#cbd5e1' }}>
              {data.signalEmoji} {data.signal}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              Spot: <strong style={{ color: '#fff' }}>${Math.round(p).toLocaleString()}</strong>
            </div>
          </div>

          {/* Probabilidades 24H */}
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '14px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Probabilidades 24H</span>
            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'baseline', marginTop: '0.5rem' }}>
              <div>
                <div style={{ color: 'var(--color-up)', fontWeight: 800, fontSize: '1.1rem' }}>{data.probabilities.pUp}%</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Subida &gt;2%</div>
              </div>
              <div>
                <div style={{ color: '#cbd5e1', fontWeight: 800, fontSize: '1.1rem' }}>{data.probabilities.pFlat}%</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Lateral</div>
              </div>
              <div>
                <div style={{ color: 'var(--color-down)', fontWeight: 800, fontSize: '1.1rem' }}>{data.probabilities.pDown}%</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Bajada &gt;2%</div>
              </div>
            </div>
          </div>

          {/* Índice Miedo y Codicia (Fear & Greed Index) */}
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '14px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Índice Miedo y Codicia</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, margin: '0.2rem 0', color: data.fearAndGreed ? data.fearAndGreed.color : '#f59e0b' }}>
              {data.fearAndGreed ? `${data.fearAndGreed.value} / 100` : '--'}
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: data.fearAndGreed ? data.fearAndGreed.color : '#f59e0b' }}>
              {data.fearAndGreed ? data.fearAndGreed.labelEs : 'Cargando...'}
            </div>
          </div>

        </div>

      </div>

      {/* NAVEGACION DE PESTAÑAS DENTRO DE HOJA 2 */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {[
          { id: 'overview', label: '🎯 Setups & Zonas de Precio' },
          { id: 'heatmap', label: '🔥 Mapa de Liquidaciones & Miedo' },
          { id: 'report', label: '📊 Reporte Diario UTC 00:05' },
          { id: 'blocks', label: '🔍 Desglose 6 Bloques Indicadores' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: activeTab === tab.id ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${activeTab === tab.id ? '#a855f7' : 'rgba(255,255,255,0.05)'}`,
              color: activeTab === tab.id ? '#fff' : 'var(--color-text-muted)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTENIDO SEGÚN LA PESTAÑA SELECCIONADA */}

      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* ZONAS DE PRECIO */}
          <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', color: '#fff', margin: 0, fontWeight: 700 }}>
              🎯 Zonas Clave de Soporte y Resistencia
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div style={{ padding: '1rem', background: 'rgba(255, 23, 68, 0.05)', border: '1px solid rgba(255, 23, 68, 0.2)', borderRadius: '12px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-down)', textTransform: 'uppercase', fontWeight: 700 }}>🔴 Resistencia Fuerte (R2)</span>
                <div className="font-mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginTop: '0.2rem' }}>
                  ${z.r2.toLocaleString()}
                </div>
              </div>

              <div style={{ padding: '1rem', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '12px' }}>
                <span style={{ fontSize: '0.7rem', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 700 }}>🟠 Resistencia Inmediata (R1)</span>
                <div className="font-mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginTop: '0.2rem' }}>
                  ${z.r1.toLocaleString()}
                </div>
              </div>

              <div style={{ padding: '1rem', background: 'rgba(234, 179, 8, 0.05)', border: '1px solid rgba(234, 179, 8, 0.2)', borderRadius: '12px' }}>
                <span style={{ fontSize: '0.7rem', color: '#eab308', textTransform: 'uppercase', fontWeight: 700 }}>🟡 Soporte Inmediato (S1)</span>
                <div className="font-mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginTop: '0.2rem' }}>
                  ${z.s1.toLocaleString()}
                </div>
              </div>

              <div style={{ padding: '1rem', background: 'rgba(0, 230, 118, 0.05)', border: '1px solid rgba(0, 230, 118, 0.2)', borderRadius: '12px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-up)', textTransform: 'uppercase', fontWeight: 700 }}>🟢 Soporte Fuerte (S2)</span>
                <div className="font-mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginTop: '0.2rem' }}>
                  ${z.s2.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {/* SETUPS DE TRADING (LONG & SHORT) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            
            {/* SETUP LONG */}
            <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(0, 230, 118, 0.25)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '1rem', color: 'var(--color-up)', margin: 0, fontWeight: 800 }}>🟢 SETUP LONG (Alcista)</h4>
                <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', background: 'rgba(0, 230, 118, 0.1)', color: 'var(--color-up)', borderRadius: '6px', fontWeight: 700 }}>RR: {l.rr}:1</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                <div><strong>Entrada:</strong> <span className="font-mono">${Math.round(l.entry).toLocaleString()}</span></div>
                <div><strong>Target 1:</strong> <span className="font-mono" style={{ color: 'var(--color-up)' }}>${l.tp1.toLocaleString()}</span> (+{(((l.tp1 - l.entry)/l.entry)*100).toFixed(1)}%)</div>
                <div><strong>Target 2:</strong> <span className="font-mono" style={{ color: 'var(--color-up)' }}>${l.tp2.toLocaleString()}</span> (+{(((l.tp2 - l.entry)/l.entry)*100).toFixed(1)}%)</div>
                <div><strong>Stop Loss (ATR 1.5x):</strong> <span className="font-mono" style={{ color: 'var(--color-down)' }}>${l.sl.toLocaleString()}</span> (−{(((l.entry - l.sl)/l.entry)*100).toFixed(1)}%)</div>
              </div>
            </div>

            {/* SETUP SHORT */}
            <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(255, 23, 68, 0.25)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '1rem', color: 'var(--color-down)', margin: 0, fontWeight: 800 }}>🔴 SETUP SHORT (Bajista)</h4>
                <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', background: 'rgba(255, 23, 68, 0.1)', color: 'var(--color-down)', borderRadius: '6px', fontWeight: 700 }}>RR: {s.rr}:1</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                <div><strong>Entrada:</strong> <span className="font-mono">${Math.round(s.entry).toLocaleString()}</span></div>
                <div><strong>Target 1:</strong> <span className="font-mono" style={{ color: 'var(--color-down)' }}>${s.tp1.toLocaleString()}</span> (−{(((s.entry - s.tp1)/s.entry)*100).toFixed(1)}%)</div>
                <div><strong>Target 2:</strong> <span className="font-mono" style={{ color: 'var(--color-down)' }}>${s.tp2.toLocaleString()}</span> (−{(((s.entry - s.tp2)/s.entry)*100).toFixed(1)}%)</div>
                <div><strong>Stop Loss (ATR 1.5x):</strong> <span className="font-mono" style={{ color: 'var(--color-up)' }}>${s.sl.toLocaleString()}</span> (+{(((s.sl - s.entry)/s.entry)*100).toFixed(1)}%)</div>
              </div>
            </div>

          </div>

          {/* ADVERTENCIAS DE RIESGO */}
          <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: '14px', background: 'rgba(245, 158, 11, 0.03)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
            <h4 style={{ fontSize: '0.9rem', color: '#f59e0b', margin: 0, fontWeight: 700, marginBottom: '0.5rem' }}>⚠️ Reglas y Filtros de Gestión de Riesgo Hoy:</h4>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.82rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {data.riskFlags.map((flag, idx) => (
                <li key={idx}>{flag}</li>
              ))}
            </ul>
          </div>

        </div>
      )}

      {/* 🔥 MAPA DE DENSIDAD DE LIQUIDACIONES (HEATMAP & COINGLASS) */}
      {(activeTab === 'overview' || activeTab === 'heatmap') && data.liquidationHeatmap && (
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.25)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '1.1rem', color: '#fff', margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  🔥 Mapa de Densidad de Liquidaciones (Liquidation Heatmap)
                </h3>
                <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#f59e0b', borderRadius: '6px', fontWeight: 700 }}>
                  ⏱️ Ventana: 24hs (Intradiario)
                </span>
              </div>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                Zonas de acumulación de stops y liquidaciones de apalancamiento (100x, 50x, 25x) en las últimas 24hs. El precio actúa como imán buscando estas zonas.
              </p>
            </div>

            <a
              href="https://www.coinglass.com/es/pro/futures/LiquidationHeatMap"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '0.45rem 0.9rem',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: '0.8rem',
                fontWeight: 700,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.2s ease'
              }}
            >
              🔗 Abrir Coinglass Heatmap ↗
            </a>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            {/* Short Liquidation Pools */}
            <div>
              <div style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                <span>🔴 LIQUIDACIÓN DE SHORTS (Zonas de Magnetismo Alcista al Subir)</span>
                <span>~$${data.liquidationHeatmap.totalShortRiskM}M USD</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {data.liquidationHeatmap.shortLiqPools.map((pool, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                    <span className="font-mono" style={{ width: '85px', fontWeight: 700, color: pool.color }}>${pool.price.toLocaleString()}</span>
                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', height: '18px', borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
                      <div style={{ width: `${Math.min(100, (pool.estimatedVolM / 650) * 100)}%`, height: '100%', background: `linear-gradient(90deg, ${pool.color}55 0%, ${pool.color} 100%)`, borderRadius: '6px' }}></div>
                    </div>
                    <span className="font-mono" style={{ fontSize: '0.75rem', width: '70px', textAlign: 'right' }}>${pool.estimatedVolM}M</span>
                  </div>
                ))}
              </div>
            </div>

            {/* PRECIO SPOT ACTUAL */}
            <div style={{ padding: '0.5rem 1rem', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '8px', textAlign: 'center', fontWeight: 800, color: '#f59e0b', fontSize: '0.85rem' }}>
              ▶ PRECIO SPOT ACTUAL BTC/USDT: ${Math.round(p).toLocaleString()}
            </div>

            {/* Long Liquidation Pools */}
            <div>
              <div style={{ fontSize: '0.75rem', color: '#4ade80', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                <span>🟢 LIQUIDACIÓN DE LONGS (Zonas de Soporte / Magnetismo al Bajar)</span>
                <span>~$${data.liquidationHeatmap.totalLongRiskM}M USD</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {data.liquidationHeatmap.longLiqPools.map((pool, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                    <span className="font-mono" style={{ width: '85px', fontWeight: 700, color: pool.color }}>${pool.price.toLocaleString()}</span>
                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', height: '18px', borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
                      <div style={{ width: `${Math.min(100, (pool.estimatedVolM / 650) * 100)}%`, height: '100%', background: `linear-gradient(90deg, ${pool.color}55 0%, ${pool.color} 100%)`, borderRadius: '6px' }}></div>
                    </div>
                    <span className="font-mono" style={{ fontSize: '0.75rem', width: '70px', textAlign: 'right' }}>${pool.estimatedVolM}M</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}

      {activeTab === 'report' && (
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.1rem', color: '#fff', margin: 0, fontWeight: 700 }}>
              📊 Reporte Diario Formateado (UTC 00:05)
            </h3>
            <button 
              onClick={copyReportToClipboard}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '8px',
                background: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(168, 85, 247, 0.2)',
                border: `1px solid ${copied ? '#10b981' : '#a855f7'}`,
                color: copied ? '#10b981' : '#a855f7',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {copied ? '✅ ¡Copiado!' : '📋 Copiar Reporte'}
            </button>
          </div>
          <pre className="font-mono" style={{
            background: 'rgba(0,0,0,0.4)',
            padding: '1.25rem',
            borderRadius: '12px',
            color: '#a7f3d0',
            fontSize: '0.82rem',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.45,
            border: '1px solid rgba(255,255,255,0.05)'
          }}>
            {data.dailyReportMarkdown}
          </pre>
        </div>
      )}

      {activeTab === 'blocks' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
          
          {/* BLOQUE 1 */}
          <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4 style={{ fontSize: '0.9rem', color: '#a855f7', margin: 0, fontWeight: 700 }}>📈 BLOQUE 1: Tendencia (25%)</h4>
            <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
              <div>Score: <strong>{a4.trend.score}</strong></div>
              <div>EMAs: <strong>{a1d.trend.details.join(', ')}</strong></div>
              <div>Ichimoku: <strong>{a4.trend.details.filter(d=>d.includes('Ichimoku')).join('') || 'Neutro'}</strong></div>
            </div>
          </div>

          {/* BLOQUE 2 */}
          <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4 style={{ fontSize: '0.9rem', color: '#3b82f6', margin: 0, fontWeight: 700 }}>⚡ BLOQUE 2: Momentum (20%)</h4>
            <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
              <div>Score: <strong>{a4.momentum.score}</strong></div>
              <div>RSI 14 (4H/1D): <strong>{a4.momentum.rsi14 ? a4.momentum.rsi14.toFixed(1) : '--'} / {a1d.momentum.rsi14 ? a1d.momentum.rsi14.toFixed(1) : '--'}</strong></div>
              <div>MACD: <strong>{a4.momentum.details.filter(d=>d.includes('MACD')).join('') || 'Neutro'}</strong></div>
            </div>
          </div>

          {/* BLOQUE 3 */}
          <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4 style={{ fontSize: '0.9rem', color: '#f59e0b', margin: 0, fontWeight: 700 }}>📊 BLOQUE 3: Volatilidad (15%)</h4>
            <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
              <div>Score: <strong>{a4.volatility.score}</strong></div>
              <div>ATR (1D): <strong>${Math.round(a1d.volatility.atr).toLocaleString()}</strong></div>
              <div>Bollinger Squeeze: <strong>{a4.volatility.isSqueeze ? 'ACTIVO 🔥' : 'Inactivo'}</strong></div>
            </div>
          </div>

          {/* BLOQUE 4 */}
          <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4 style={{ fontSize: '0.9rem', color: '#10b981', margin: 0, fontWeight: 700 }}>💧 BLOQUE 4: Volumen (20%)</h4>
            <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
              <div>Score: <strong>{a4.volume.score}</strong></div>
              <div>VWAP (4H): <strong>${Math.round(a4.volume.vwap).toLocaleString()}</strong></div>
              <div>CMF (Chaikin): <strong>{a4.volume.cmf.toFixed(2)}</strong></div>
            </div>
          </div>

          {/* BLOQUE 5 */}
          <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4 style={{ fontSize: '0.9rem', color: '#ec4899', margin: 0, fontWeight: 700 }}>🏛️ BLOQUE 5: SMC & Wyckoff (20%)</h4>
            <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
              <div>Score: <strong>{a4.advanced.score}</strong></div>
              <div>Wyckoff: <strong>{a4.advanced.wyckoff.phase}</strong></div>
              <div>Fibonacci 0.618: <strong>${Math.round(a1d.advanced.fibs['0.618']).toLocaleString()}</strong></div>
            </div>
          </div>

          {/* BLOQUE 6 */}
          <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4 style={{ fontSize: '0.9rem', color: '#06b6d4', margin: 0, fontWeight: 700 }}>🕯️ BLOQUE 6: Patrones Velas (10%)</h4>
            <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
              <div>Patrón Activo: <strong>{a4.candles.pattern || 'Ninguno'}</strong></div>
              <div>Precisión Histórica: <strong>{a4.candles.winrate || '--'}</strong></div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
