import React, { useState, useMemo } from 'react';
import StrategyRankingService from '../services/StrategyRankingService';
import SignalHistoryService from '../services/SignalHistoryService';

// Definición de las 25 estrategias con categorización de temporalidad y tesis técnica
export const STRATEGY_CATALOG = [
  { key: 'Estrategia 1', title: 'Cruzamiento Triple EMA (8, 21, 55)', tf: '15m', style: 'SCALPING', styleLabel: '⚡ Scalping', desc: 'Identifica momentum rápido y alineación de medias exponenciales en 15m.' },
  { key: 'Estrategia 2', title: 'Divergencias RSI + MACD Shift', tf: '1H', style: 'INTRADAY', styleLabel: '🎯 Intradía', desc: 'Detección de divergencias regulares y ocultas con confirmación de histograma MACD.' },
  { key: 'Estrategia 3', title: 'Barrido de Liquidez (Liquidation Sweep)', tf: '1H', style: 'INTRADAY', styleLabel: '🎯 Intradía', desc: 'Captura tomas de liquidez institucional sobre máximos/mínimos previos.' },
  { key: 'Estrategia 4', title: 'Macro Tendencia & Squeeze TTMS', tf: '1D/1W', style: 'MACRO', styleLabel: '🏔️ Macro', desc: 'Compresión de volatilidad y dirección de tendencia semanal/diaria.' },
  { key: 'Estrategia 5', title: 'Z-Score Reversión a VWAP', tf: '1H', style: 'INTRADAY', styleLabel: '🎯 Intradía', desc: 'Desviaciones extremas estadísticas respecto al precio promedio ponderado por volumen.' },
  { key: 'Estrategia 6', title: 'Supertrend Multitemporal Cuantitativo', tf: '15m', style: 'SCALPING', styleLabel: '⚡ Scalping', desc: 'Seguimiento de tendencia basado en volatilidad ATR y soporte dinámico.' },
  { key: 'Estrategia 7', title: 'Smart Money Concepts (FVG + Order Block)', tf: '1H', style: 'INTRADAY', styleLabel: '🎯 Intradía', desc: 'Entradas de precisión en Fair Value Gaps y bloques de órdenes institucionales.' },
  { key: 'Estrategia 8', title: 'Volume Profile POC & Value Area Rebound', tf: '1H', style: 'INTRADAY', styleLabel: '🎯 Intradía', desc: 'Rebotes y rechazos en el Point of Control (POC) y extremos de la Value Area.' },
  { key: 'Estrategia 9', title: 'Ichimoku Cloud Breakout & Kumo Twist', tf: '4H', style: 'MACRO', styleLabel: '🏔️ Macro', desc: 'Rupturas de nube Kumo con confirmación de Tenkan-sen y Kijun-sen en 4H.' },
  { key: 'Estrategia 10', title: 'Bollinger-Keltner Volatility Squeeze Expansion', tf: '1H', style: 'INTRADAY', styleLabel: '🎯 Intradía', desc: 'Explosión direccional tras compresión de Bandas dentro de Canales de Keltner.' },
  { key: 'Estrategia 11', title: 'Order Flow CVD Delta Divergence', tf: '5m', style: 'SCALPING', styleLabel: '⚡ Scalping', desc: 'Divergencias entre precio y volumen agresivo comprador/vendedor.' },
  { key: 'Estrategia 12', title: 'Estructura Wyckoff (Spring/Upthrust)', tf: '5m/15m', style: 'SCALPING', styleLabel: '⚡ Scalping', desc: 'Trampas de mercado y confirmación de fases de acumulación/distribución.' },
  { key: 'Estrategia 13', title: 'Patrones Armónicos Fibonacci (Gartley/Bat)', tf: '15m', style: 'SCALPING', styleLabel: '⚡ Scalping', desc: 'Relaciones geométricas de retrocesos Fibonacci para giros de alta probabilidad.' },
  { key: 'Estrategia 14', title: 'Chaikin Money Flow & OBV Accumulation', tf: '1H', style: 'INTRADAY', styleLabel: '🎯 Intradía', desc: 'Monitoreo de flujo de capital institucional y presión compradora.' },
  { key: 'Estrategia 15', title: 'MACD Histogram Momentum Shift (4H)', tf: '4H', style: 'MACRO', styleLabel: '🏔️ Macro', desc: 'Cambios de aceleración y aceleradores de tendencia en marcos de 4 horas.' },
  { key: 'Estrategia 16', title: 'Parabolic SAR + ADX Trend Strength Filter', tf: '1H', style: 'INTRADAY', styleLabel: '🎯 Intradía', desc: 'Filtro de fuerza direccional (ADX > 25) con paradas SAR dinámicas.' },
  { key: 'Estrategia 17', title: 'Keltner Channel Mean Reversion Scalp', tf: '15m', style: 'SCALPING', styleLabel: '⚡ Scalping', desc: 'Scalping rápido de reversión a la media en extremos de canales Keltner.' },
  { key: 'Estrategia 18', title: 'Puntos Pivote Camarilla Confluence', tf: '1D', style: 'MACRO', styleLabel: '🏔️ Macro', desc: 'Rupturas y rebotes en niveles matemáticos institucionales H4/L4.' },
  { key: 'Estrategia 19', title: 'Stochastic RSI Extreme Cross', tf: '15m', style: 'SCALPING', styleLabel: '⚡ Scalping', desc: 'Cruces en zonas de sobreventa (<20) y sobrecompra (>80) con confirmación de volumen.' },
  { key: 'Estrategia 20', title: 'Donchian Channel 20 Breakout (Turtle)', tf: '1H', style: 'INTRADAY', styleLabel: '🎯 Intradía', desc: 'Ruptura clásica de canales Donchian de 20 períodos con trailing stop.' },
  { key: 'Estrategia 21', title: 'Hull Moving Average (HMA) Zero-Lag Cross', tf: '15m', style: 'SCALPING', styleLabel: '⚡ Scalping', desc: 'Filtro de media móvil ultra rápida ponderada sin retardo.' },
  { key: 'Estrategia 22', title: 'Agotamiento Volatilidad ATR Spike', tf: '1H', style: 'INTRADAY', styleLabel: '🎯 Intradía', desc: 'Identifica velas de clímax y picos de rango verdadero para contratendencia.' },
  { key: 'Estrategia 23', title: 'Multi-Timeframe Ribbon Convergence (5m-4h)', tf: '4H', style: 'MACRO', styleLabel: '🏔️ Macro', desc: 'Alineación de 8 medias móviles a través de todas las temporalidades mayores.' },
  { key: 'Estrategia 24', title: 'Liquidity Pool Impulse & MSS Breakout', tf: '15m', style: 'SCALPING', styleLabel: '⚡ Scalping', desc: 'Quiebre de estructura de mercado (Market Structure Shift) con impulso.' },
  { key: 'Estrategia 25', title: 'Consenso Maestro Quant Ensemble 2.0', tf: 'MULTI', style: 'MACRO', styleLabel: '👑 Consenso', desc: 'Meta-modelo ensamblado que combina los votos ponderados de las 24 estrategias.' }
];

export default function StrategyMatrixComponent({
  signalsHistory = [],
  allAnalysisMap = {},
  btcPrice,
  analysisLoading = false,
  onFilterHistory
}) {
  const [selectedStyle, setSelectedStyle] = useState('ALL'); // ALL | SCALPING | INTRADAY | MACRO | ACTIVE | TOP
  const [viewMode, setViewMode] = useState('matrix'); // 'matrix' | 'cards'
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('winRate'); // 'winRate' | 'mfe' | 'pnl' | 'signals' | 'id'
  const [sortAsc, setSortAsc] = useState(false);
  const [inspectingStrategy, setInspectingStrategy] = useState(null);

  // Calcular rankings e indicadores
  const rankings = useMemo(() => {
    return StrategyRankingService.calculateStrategyRankings(signalsHistory);
  }, [signalsHistory]);

  const rankingMap = useMemo(() => {
    const map = new Map();
    rankings.forEach(r => map.set(r.shortName, r));
    return map;
  }, [rankings]);

  // Formatear precios
  const formatPrice = (p) => {
    if (typeof p !== 'number' || isNaN(p)) return '--';
    return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Filtrar y ordenar catálogo de estrategias
  const filteredCatalog = useMemo(() => {
    return STRATEGY_CATALOG.filter(item => {
      const stats = rankingMap.get(item.key) || {};
      const activeSignal = signalsHistory.find(s => s.strategy === item.key && s.status === 'PENDING');

      // 1. Filtro por estilo
      if (selectedStyle === 'SCALPING' && item.style !== 'SCALPING') return false;
      if (selectedStyle === 'INTRADAY' && item.style !== 'INTRADAY') return false;
      if (selectedStyle === 'MACRO' && item.style !== 'MACRO') return false;
      if (selectedStyle === 'ACTIVE' && !activeSignal) return false;
      if (selectedStyle === 'TOP' && (stats.winRatePercent || 0) < 60) return false;

      // 2. Filtro por búsqueda
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchKey = item.key.toLowerCase().includes(q);
        const matchDesc = item.desc.toLowerCase().includes(q);
        if (!matchTitle && !matchKey && !matchDesc) return false;
      }

      return true;
    }).sort((a, b) => {
      const statsA = rankingMap.get(a.key) || { winRatePercent: 0, avgMfePercent: 0, totalPnlPercent: 0, totalSignals: 0 };
      const statsB = rankingMap.get(b.key) || { winRatePercent: 0, avgMfePercent: 0, totalPnlPercent: 0, totalSignals: 0 };

      let diff = 0;
      if (sortField === 'winRate') diff = statsB.winRatePercent - statsA.winRatePercent;
      else if (sortField === 'mfe') diff = statsB.avgMfePercent - statsA.avgMfePercent;
      else if (sortField === 'pnl') diff = statsB.totalPnlPercent - statsA.totalPnlPercent;
      else if (sortField === 'signals') diff = statsB.totalSignals - statsA.totalSignals;
      else if (sortField === 'id') {
        const idA = parseInt(a.key.replace(/\D/g, '')) || 0;
        const idB = parseInt(b.key.replace(/\D/g, '')) || 0;
        diff = idA - idB;
      }

      return sortAsc ? -diff : diff;
    });
  }, [selectedStyle, searchQuery, sortField, sortAsc, rankingMap, signalsHistory]);

  // Conteo de activas
  const activeCount = signalsHistory.filter(s => s.status === 'PENDING').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* BARRA DE CONTROL & FILTROS SUPERIORES */}
      <div className="glass-panel" style={{
        padding: '1.25rem 1.5rem',
        borderRadius: '18px',
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.8) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        
        {/* FILA 1: BUSCADOR & SELECTOR DE VISTA */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '280px' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '380px' }}>
              <input
                type="text"
                placeholder="🔍 Buscar por nombre, indicador o concepto..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 1rem',
                  borderRadius: '10px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '0.82rem',
                  outline: 'none'
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  ✖
                </button>
              )}
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
              Mostrando <b>{filteredCatalog.length}</b> de 25
            </span>
          </div>

          {/* TOGGLE MODO DE VISTA */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: '0.25rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={() => setViewMode('matrix')}
              style={{
                padding: '0.35rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                background: viewMode === 'matrix' ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                color: viewMode === 'matrix' ? '#fff' : 'var(--color-text-muted)',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              📋 Matriz Compacta
            </button>
            <button
              onClick={() => setViewMode('cards')}
              style={{
                padding: '0.35rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                background: viewMode === 'cards' ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                color: viewMode === 'cards' ? '#fff' : 'var(--color-text-muted)',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              🃏 Modo Tarjetas
            </button>
          </div>
        </div>

        {/* FILA 2: BOTONES DE FILTRO POR CATEGORÍA */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { key: 'ALL', label: '🌐 Todas (25)' },
            { key: 'SCALPING', label: '⚡ Scalping (5m-15m)' },
            { key: 'INTRADAY', label: '🎯 Intradía & Swing (1H)' },
            { key: 'MACRO', label: '🏔️ Macro (4H-1D)' },
            { key: 'ACTIVE', label: `🟢 En Curso (${activeCount})` },
            { key: 'TOP', label: '👑 Top Rentables (>60%)' }
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setSelectedStyle(f.key)}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: 700,
                background: selectedStyle === f.key ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${selectedStyle === f.key ? '#f59e0b' : 'rgba(255,255,255,0.06)'}`,
                color: selectedStyle === f.key ? '#fff' : 'var(--color-text-muted)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

      </div>

      {/* VISTA 1: MATRIZ EJECUTIVA COMPACTA (TABLA) */}
      {viewMode === 'matrix' ? (
        <div className="glass-panel" style={{
          padding: '1.25rem',
          borderRadius: '18px',
          background: 'rgba(15, 23, 42, 0.7)',
          border: '1px solid rgba(255,255,255,0.06)',
          overflowX: 'auto'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--color-text-muted)' }}>
                <th style={{ padding: '0.75rem 0.5rem', cursor: 'pointer' }} onClick={() => { setSortField('id'); setSortAsc(!sortAsc); }}>
                  Estrategia {sortField === 'id' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Temporalidad</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Sesgo Actual</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Operación en Curso</th>
                <th style={{ padding: '0.75rem 0.5rem', cursor: 'pointer' }} onClick={() => { setSortField('winRate'); setSortAsc(!sortAsc); }}>
                  Win Rate % {sortField === 'winRate' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th style={{ padding: '0.75rem 0.5rem', cursor: 'pointer' }} onClick={() => { setSortField('mfe'); setSortAsc(!sortAsc); }}>
                  Máx. a Favor (MFE) {sortField === 'mfe' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th style={{ padding: '0.75rem 0.5rem' }}>TP / SL</th>
                <th style={{ padding: '0.75rem 0.5rem', cursor: 'pointer' }} onClick={() => { setSortField('pnl'); setSortAsc(!sortAsc); }}>
                  PnL Total {sortField === 'pnl' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>Auditar</th>
              </tr>
            </thead>
            <tbody>
              {filteredCatalog.map((item) => {
                const stats = rankingMap.get(item.key) || {
                  winRatePercent: 0,
                  avgMfePercent: 0,
                  totalPnlPercent: 0,
                  tpCount: 0,
                  slCount: 0,
                  totalSignals: 0
                };
                const stratData = allAnalysisMap[item.key];
                const activeSignal = signalsHistory.find(s => s.strategy === item.key && s.status === 'PENDING');
                const barColor = stats.winRatePercent >= 75 ? '#10b981' : stats.winRatePercent >= 50 ? '#3b82f6' : '#f59e0b';

                return (
                  <tr
                    key={item.key}
                    onClick={() => setInspectingStrategy(item)}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      background: activeSignal ? 'rgba(245, 158, 11, 0.04)' : 'transparent',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = activeSignal ? 'rgba(245, 158, 11, 0.04)' : 'transparent'}
                  >
                    {/* Nombre y Estilo */}
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <div style={{ fontWeight: 800, color: '#fff' }}>{item.key}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{item.title}</div>
                    </td>

                    {/* Temporalidad */}
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <span style={{
                        padding: '0.15rem 0.45rem',
                        borderRadius: '6px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        background: item.style === 'SCALPING' ? 'rgba(245, 158, 11, 0.12)' : item.style === 'INTRADAY' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(168, 85, 247, 0.12)',
                        color: item.style === 'SCALPING' ? '#f59e0b' : item.style === 'INTRADAY' ? '#60a5fa' : '#c084fc'
                      }}>
                        {item.styleLabel} ({item.tf})
                      </span>
                    </td>

                    {/* Sesgo */}
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      {stratData && stratData.bias ? (
                        <span style={{
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          color: stratData.bias.includes('ALCISTA') || stratData.bias.includes('COMPRA') ? 'var(--color-up)' : 'var(--color-down)'
                        }}>
                          {stratData.bias}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>--</span>
                      )}
                    </td>

                    {/* Operación en curso */}
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      {activeSignal ? (
                        <span style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          fontWeight: 800,
                          fontSize: '0.72rem',
                          background: activeSignal.type === 'LONG' ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 23, 68, 0.15)',
                          color: activeSignal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}>
                          <span className="pulse-yellow" style={{ width: '6px', height: '6px', borderRadius: '50%', background: activeSignal.type === 'LONG' ? '#00e676' : '#ff1744' }}></span>
                          {activeSignal.type} @ ${formatPrice(activeSignal.entry)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>⚪ Sin orden</span>
                      )}
                    </td>

                    {/* Win Rate */}
                    <td style={{ padding: '0.75rem 0.5rem', minWidth: '110px' }}>
                      <div style={{ fontWeight: 800, color: barColor, fontSize: '0.85rem' }}>
                        {stats.winRatePercent}%
                      </div>
                      <div style={{ width: '80px', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.2rem' }}>
                        <div style={{ width: `${Math.min(stats.winRatePercent, 100)}%`, height: '100%', background: barColor }} />
                      </div>
                    </td>

                    {/* MFE */}
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 800, color: '#38bdf8' }}>
                      +{stats.avgMfePercent}% 🚀
                    </td>

                    {/* TP / SL */}
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <span style={{ color: '#10b981', fontWeight: 700 }}>{stats.tpCount} TP</span>
                      <span style={{ color: 'var(--color-text-muted)', margin: '0 0.2rem' }}>/</span>
                      <span style={{ color: '#ef4444', fontWeight: 700 }}>{stats.slCount} SL</span>
                    </td>

                    {/* PnL Total */}
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 800, color: stats.totalPnlPercent >= 0 ? '#10b981' : '#ef4444' }}>
                      {stats.totalPnlPercent >= 0 ? `+${stats.totalPnlPercent}%` : `${stats.totalPnlPercent}%`}
                    </td>

                    {/* Botón Auditar */}
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectingStrategy(item);
                        }}
                        style={{
                          padding: '0.25rem 0.6rem',
                          borderRadius: '6px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        🔍 Ver Ficha
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* VISTA 2: MODO TARJETAS */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {filteredCatalog.map(item => {
            const stats = rankingMap.get(item.key) || { winRatePercent: 0, tpCount: 0, slCount: 0, avgMfePercent: 0 };
            const stratData = allAnalysisMap[item.key];
            const activeSignal = signalsHistory.find(s => s.strategy === item.key && s.status === 'PENDING');

            return (
              <div
                key={item.key}
                onClick={() => setInspectingStrategy(item)}
                style={{
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: activeSignal ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease, border-color 0.15s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#f59e0b', fontWeight: 800 }}>
                      {item.key} • {item.styleLabel} ({item.tf})
                    </span>
                    <h3 style={{ fontSize: '1rem', color: '#fff', margin: '0.2rem 0 0', fontWeight: 700 }}>{item.title}</h3>
                  </div>
                  <span style={{
                    padding: '0.2rem 0.5rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    background: stats.winRatePercent >= 60 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                    color: stats.winRatePercent >= 60 ? '#10b981' : '#60a5fa'
                  }}>
                    WR: {stats.winRatePercent}%
                  </span>
                </div>

                <p style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.3 }}>
                  {item.desc}
                </p>

                {activeSignal ? (
                  <div style={{ padding: '0.6rem', borderRadius: '8px', background: activeSignal.type === 'LONG' ? 'rgba(0,230,118,0.08)' : 'rgba(255,23,68,0.08)', border: `1px solid ${activeSignal.type === 'LONG' ? 'rgba(0,230,118,0.25)' : 'rgba(255,23,68,0.25)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: activeSignal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)' }}>
                      🟢 EN CURSO: {activeSignal.type} @ ${formatPrice(activeSignal.entry)}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700 }}>
                      +{stats.avgMfePercent}% MFE
                    </span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    <span>{stats.tpCount} TP / {stats.slCount} SL</span>
                    <span>MFE Prom: +{stats.avgMfePercent}%</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL / DRAWER DE INSPECCIÓN DETALLADA DE ESTRATEGIA */}
      {inspectingStrategy && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '1.5rem'
        }} onClick={() => setInspectingStrategy(null)}>
          <div style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '20px',
            maxWidth: '650px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
          }} onClick={e => e.stopPropagation()}>
            
            {/* Header del Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 800, textTransform: 'uppercase' }}>
                  {inspectingStrategy.key} • {inspectingStrategy.styleLabel} ({inspectingStrategy.tf})
                </span>
                <h2 style={{ fontSize: '1.3rem', color: '#fff', margin: '0.2rem 0 0', fontWeight: 800 }}>
                  {inspectingStrategy.title}
                </h2>
              </div>
              <button
                onClick={() => setInspectingStrategy(null)}
                style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#fff', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>

            {/* Tesis Técnica */}
            <div style={{ padding: '0.85rem', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.4 }}>
              <b>💡 Tesis Cuantitativa:</b> {inspectingStrategy.desc}
            </div>

            {/* KPIs de Rendimiento */}
            {(() => {
              const s = rankingMap.get(inspectingStrategy.key) || {};
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
                  <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Win Rate %</span>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981', marginTop: '0.2rem' }}>{s.winRatePercent || 0}%</div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{s.tpCount || 0} TP / {s.slCount || 0} SL</span>
                  </div>
                  <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Máx a Favor (MFE)</span>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.2rem' }}>+{s.avgMfePercent || 0}%</div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Avance promedio</span>
                  </div>
                  <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>PnL Total</span>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: (s.totalPnlPercent || 0) >= 0 ? '#10b981' : '#ef4444', marginTop: '0.2rem' }}>
                      {(s.totalPnlPercent || 0) >= 0 ? `+${s.totalPnlPercent || 0}%` : `${s.totalPnlPercent}%`}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{s.totalSignals || 0} señales</span>
                  </div>
                </div>
              );
            })()}

            {/* Historial Exclusivo de Esta Estrategia */}
            <div>
              <h4 style={{ fontSize: '0.95rem', color: '#fff', margin: '0 0 0.5rem 0' }}>
                📜 Historial de Operaciones de {inspectingStrategy.key}
              </h4>
              <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.02)', color: 'var(--color-text-muted)' }}>
                      <th style={{ padding: '0.5rem' }}>Fecha</th>
                      <th style={{ padding: '0.5rem' }}>Tipo</th>
                      <th style={{ padding: '0.5rem' }}>Entrada</th>
                      <th style={{ padding: '0.5rem' }}>MFE</th>
                      <th style={{ padding: '0.5rem' }}>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signalsHistory.filter(sig => sig.strategy === inspectingStrategy.key).map(sig => {
                      const d = new Date(sig.timestamp);
                      const dateStr = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                      return (
                        <tr key={sig.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '0.5rem' }}>{dateStr}</td>
                          <td style={{ padding: '0.5rem', fontWeight: 700, color: sig.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)' }}>{sig.type}</td>
                          <td style={{ padding: '0.5rem' }}>${formatPrice(sig.entry)}</td>
                          <td style={{ padding: '0.5rem', color: '#38bdf8' }}>{typeof sig.maxFavorablePercent === 'number' ? `+${sig.maxFavorablePercent}%` : '--'}</td>
                          <td style={{ padding: '0.5rem' }}>
                            <span style={{ fontWeight: 700, color: sig.status === 'TP' ? '#10b981' : sig.status === 'SL' ? '#ef4444' : '#eab308' }}>
                              {sig.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {signalsHistory.filter(sig => sig.strategy === inspectingStrategy.key).length === 0 && (
                      <tr>
                        <td colSpan="5" style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                          Sin historial registrado para esta estrategia.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Botón Filtrar en Historial Global */}
            {onFilterHistory && (
              <button
                onClick={() => {
                  onFilterHistory(inspectingStrategy.key);
                  setInspectingStrategy(null);
                }}
                style={{
                  padding: '0.65rem',
                  borderRadius: '10px',
                  background: 'rgba(245, 158, 11, 0.2)',
                  border: '1px solid #f59e0b',
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                🔍 Ver todas las señales de {inspectingStrategy.key} en la Tabla Global
              </button>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
