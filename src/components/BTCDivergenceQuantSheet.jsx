import React, { useState, useEffect } from 'react';
import divergenceQuantService from '../services/DivergenceQuantService';
import SignalHistoryService from '../services/SignalHistoryService';

export default function BTCDivergenceQuantSheet() {
  const [data, setData] = useState(() => divergenceQuantService.getFallbackData());
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [masterHistory, setMasterHistory] = useState(() => {
    return SignalHistoryService.loadFromLocalStorage('btc_hoja3_history_v1');
  });
  const [historyFilter, setHistoryFilter] = useState('ALL');
  const [dateRangeFilter, setDateRangeFilter] = useState('ALL');

  const RENDER_API = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
    ? 'http://localhost:3000'
    : 'https://bot-trading-2.onrender.com';

  const updateHistoryFromData = (freshData) => {
    if (!freshData || !freshData.activeSignals) return;
    const sigs = freshData.activeSignals;

    setMasterHistory(prev => {
      let updated = [...prev];
      const p = freshData.currentPrice;

      // 1. Evaluar PENDING existentes
      updated = updated.map(item => {
        if (item.status !== 'PENDING') return item;

        if (item.direction === 'LONG') {
          if (p >= item.tp1) {
            const pnl = parseFloat((((p - item.entry) / item.entry) * 100).toFixed(2));
            return { ...item, status: 'TP', exitPrice: p, pnlPercent: pnl, resolvedAt: Date.now() };
          }
          if (p <= item.sl) {
            const pnl = parseFloat((((p - item.entry) / item.entry) * 100).toFixed(2));
            return { ...item, status: 'SL', exitPrice: p, pnlPercent: pnl, resolvedAt: Date.now() };
          }
        } else if (item.direction === 'SHORT') {
          if (p <= item.tp1) {
            const pnl = parseFloat((((item.entry - p) / item.entry) * 100).toFixed(2));
            return { ...item, status: 'TP', exitPrice: p, pnlPercent: pnl, resolvedAt: Date.now() };
          }
          if (p >= item.sl) {
            const pnl = parseFloat((((item.entry - p) / item.entry) * 100).toFixed(2));
            return { ...item, status: 'SL', exitPrice: p, pnlPercent: pnl, resolvedAt: Date.now() };
          }
        }
        return item;
      });

      // 2. Agregar nuevas señales si no existen activas
      let newItems = [];
      sigs.forEach(newSig => {
        const hasPending = updated.some(item => item.strategy === newSig.strategy && item.status === 'PENDING');
        if (!hasPending) {
          const nowStr = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'medium' });
          newItems.push({
            ...newSig,
            timestamp: nowStr,
            createdAt: Date.now(),
            pnlPercent: 0
          });
        }
      });

      const merged = SignalHistoryService.unionMerge(newItems, updated, 2000);
      SignalHistoryService.saveToLocalStorage('btc_hoja3_history_v1', merged, 2000);
      return merged;
    });
  };

  const runAnalysis = async () => {
    let currentHistory = SignalHistoryService.loadFromLocalStorage('btc_hoja3_history_v1');

    try {
      const res = await divergenceQuantService.runFullDivergenceQuantAnalysis();
      if (res && res.data) {
        setData(res.data);
        updateHistoryFromData(res.data);
      }
    } catch (e) {
      console.warn('[BTCDivergenceQuantSheet] Local update warning:', e);
    }

    // Sincronización BIDIRECCIONAL AUTO-RECUPERABLE con la nube de Render
    try {
      const response = await fetch(`${RENDER_API}/api/hoja3-signals/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientHistory: currentHistory })
      });

      if (response.ok) {
        const json = await response.json();
        if (json && Array.isArray(json.history)) {
          setMasterHistory(prev => {
            const merged = SignalHistoryService.unionMerge(prev, json.history, 2000);
            SignalHistoryService.saveToLocalStorage('btc_hoja3_history_v1', merged, 2000);
            return merged;
          });
        }
        if (json && json.data && json.data.currentPrice) {
          setData(json.data);
        }
      }
    } catch (err) {
      console.warn('[Cloud Hoja 3 Sync Warning]:', err);
    }
  };

  const clearMasterHistory = async () => {
    if (window.confirm('¿Seguro que deseas borrar el historial de señales de Hoja 3?')) {
      setMasterHistory([]);
      try {
        localStorage.removeItem('btc_hoja3_history_v1');
        await fetch(`${RENDER_API}/api/hoja3-signals/clear`, { method: 'POST' });
      } catch (e) {}
    }
  };

  useEffect(() => {
    runAnalysis();
    const interval = setInterval(runAnalysis, 30000);
    return () => clearInterval(interval);
  }, []);

  const copyReportToClipboard = () => {
    if (!data || !data.markdownReport) return;
    navigator.clipboard.writeText(data.markdownReport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const p = data?.currentPrice || 65200;
  const s1 = data?.strat1Divergence || { strategyName: 'Estrategia 1: Divergencias + Volumen', hasSignal: false };
  const s2 = data?.strat2QuantSqueeze || { strategyName: 'Estrategia 2: Quant Volatility Squeeze', hasSignal: false };
  const radar = data?.radar || { divergence15m: { type: 'NONE' }, divergence1h: { type: 'NONE' }, squeeze1h: { inSqueeze: false } };

  // Métricas de Historial
  const totalSignals = masterHistory.length;
  const tpSignals = masterHistory.filter(item => item.status === 'TP').length;
  const slSignals = masterHistory.filter(item => item.status === 'SL').length;
  const pendingSignals = masterHistory.filter(item => item.status === 'PENDING').length;
  const completedSignals = tpSignals + slSignals;

  const winRate = completedSignals > 0 
    ? ((tpSignals / completedSignals) * 100).toFixed(1) 
    : (totalSignals > 0 ? '100.0' : '0.0');

  const totalPnl = masterHistory.reduce((acc, curr) => acc + (curr.pnlPercent || 0), 0).toFixed(2);

  const dateFilteredHistory = SignalHistoryService.filterSignalsByDateRange(masterHistory, dateRangeFilter);
  const filteredHistory = dateFilteredHistory.filter(item => {
    if (historyFilter === 'ALL') return true;
    if (historyFilter === 'STRAT1') return item.strategy?.includes('Estrategia 1') || item.label?.includes('Divergencia');
    if (historyFilter === 'STRAT2') return item.strategy?.includes('Estrategia 2') || item.label?.includes('Quant');
    return item.status === historyFilter;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      
      {/* ⚡ HEADER PRINCIPAL HOJA 3 */}
      <div className="glass-panel" style={{
        padding: '1.5rem',
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(15, 23, 42, 0.85) 100%)',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        borderRadius: '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <span style={{ fontSize: '1.4rem' }}>⚡</span>
              <h1 style={{ fontSize: '1.4rem', color: '#fff', margin: 0, fontWeight: 800, letterSpacing: '-0.02em' }}>
                HOJA 3: Divergencias + Quant Squeeze (2 Estrategias Especializadas)
              </h1>
            </div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.3rem' }}>
              Sistema especializado en Divergencias RSI/MACD + Volumen y Ruptura Institucional de Compresión de Volatilidad.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button 
              onClick={runAnalysis}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '10px',
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#60a5fa',
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
              {copied ? '✅ ¡Reporte Copiado!' : '📋 Copiar Reporte H3'}
            </button>
          </div>
        </div>

        {/* METRICAS Y METRICAS DE HISTORIAL DE HOJA 3 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginTop: '0.5rem'
        }}>
          
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '14px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Precio Spot BTC</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, margin: '0.2rem 0', color: '#60a5fa' }}>
              ${Math.round(p).toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Binance BTC/USDT</div>
          </div>

          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '14px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Tasa de Acierto H3</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, margin: '0.2rem 0', color: '#10b981' }}>
              {winRate}%
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{tpSignals} TP / {slSignals} SL</div>
          </div>

          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '14px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>PnL Acumulado H3</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, margin: '0.2rem 0', color: parseFloat(totalPnl) >= 0 ? '#10b981' : '#ef4444' }}>
              {parseFloat(totalPnl) >= 0 ? `+${totalPnl}%` : `${totalPnl}%`}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>Rendimiento Total</div>
          </div>

          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '14px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Señales Activas</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, margin: '0.2rem 0', color: '#f59e0b' }}>
              {pendingSignals}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>En Seguimiento en Vivo</div>
          </div>

        </div>

      </div>

      {/* PESTAÑAS INTERNAS DE HOJA 3 */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {[
          { id: 'overview', label: '🎯 Setups & Señales Activas' },
          { id: 'history', label: `📜 Historial & Aciertos (${masterHistory.length})` },
          { id: 'radar', label: '🔍 Radar de Divergencias & Volatilidad' },
          { id: 'report', label: '📊 Reporte Cuantitativo' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: activeTab === tab.id ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${activeTab === tab.id ? '#3b82f6' : 'rgba(255,255,255,0.05)'}`,
              color: activeTab === tab.id ? '#fff' : 'var(--color-text-muted)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTENIDO DE PESTAÑA: OVERVIEW / SETUPS */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          
          {/* ESTRATEGIA 1: DIVERGENCIAS + VOLUMEN */}
          <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.25)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.05rem', color: '#60a5fa', margin: 0, fontWeight: 800 }}>
                1️⃣ Estrategia 1: Divergencias + Volumen
              </h3>
              <span style={{
                padding: '0.25rem 0.6rem',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 700,
                background: s1.hasSignal ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                color: s1.hasSignal ? '#10b981' : 'var(--color-text-muted)'
              }}>
                {s1.hasSignal ? 'SEÑAL ACTIVA 🟢' : 'SIN SEÑAL'}
              </span>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>
              Identifica divergencias regulares y ocultas entre precio y osciladores (RSI/MACD) confirmadas con picos de volumen.
            </p>

            {s1.hasSignal && s1.signal ? (
              <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: s1.signal.direction === 'LONG' ? '#10b981' : '#ef4444' }}>
                  {s1.signal.label}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <div>Entrada: <strong>${s1.signal.entry.toLocaleString()}</strong></div>
                  <div>Stop Loss: <strong style={{ color: '#ef4444' }}>${s1.signal.sl.toLocaleString()}</strong></div>
                  <div>Target 1 (TP1): <strong style={{ color: '#10b981' }}>${s1.signal.tp1.toLocaleString()}</strong></div>
                  <div>Target 2 (TP2): <strong style={{ color: '#10b981' }}>${s1.signal.tp2.toLocaleString()}</strong></div>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#a855f7', fontWeight: 700 }}>
                  Ratio Riesgo/Beneficio: 1:{s1.signal.rr}
                </div>
              </div>
            ) : (
              <div style={{ padding: '1rem', textAlign: 'center', background: 'rgba(255,255,255,0.01)', borderRadius: '12px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                ⚪ {s1.details || 'Buscando divergencias en tiempo real...'}
              </div>
            )}
          </div>

          {/* ESTRATEGIA 2: QUANT VOLATILITY SQUEEZE */}
          <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(168, 85, 247, 0.25)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.05rem', color: '#c084fc', margin: 0, fontWeight: 800 }}>
                2️⃣ Estrategia 2: Quant Volatility Squeeze
              </h3>
              <span style={{
                padding: '0.25rem 0.6rem',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 700,
                background: s2.hasSignal ? 'rgba(16, 185, 129, 0.2)' : s2.squeezeState === 'IN_SQUEEZE_PREPARATION' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                color: s2.hasSignal ? '#10b981' : s2.squeezeState === 'IN_SQUEEZE_PREPARATION' ? '#f59e0b' : 'var(--color-text-muted)'
              }}>
                {s2.hasSignal ? 'RUPTURA ACTIVA 🚀' : s2.squeezeState === 'IN_SQUEEZE_PREPARATION' ? 'COMPRESIÓN ⚠️' : 'VOLATILIDAD NORMAL'}
              </span>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>
              Detecta períodos de compresión de volatilidad extrema (Bollinger inside Keltner) y dispara en la expansión de volumen.
            </p>

            {s2.hasSignal && s2.signal ? (
              <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: s2.signal.direction === 'LONG' ? '#10b981' : '#ef4444' }}>
                  {s2.signal.label}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <div>Entrada: <strong>${s2.signal.entry.toLocaleString()}</strong></div>
                  <div>Stop Loss: <strong style={{ color: '#ef4444' }}>${s2.signal.sl.toLocaleString()}</strong></div>
                  <div>Target 1 (TP1): <strong style={{ color: '#10b981' }}>${s2.signal.tp1.toLocaleString()}</strong></div>
                  <div>Target 2 (TP2): <strong style={{ color: '#10b981' }}>${s2.signal.tp2.toLocaleString()}</strong></div>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: 700 }}>
                  Ratio Riesgo/Beneficio Institucional: 1:{s2.signal.rr}
                </div>
              </div>
            ) : (
              <div style={{ padding: '1rem', textAlign: 'center', background: 'rgba(255,255,255,0.01)', borderRadius: '12px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                {s2.squeezeState === 'IN_SQUEEZE_PREPARATION' ? '⚠️ Acumulación Institucional Detectada: Bandas de Bollinger comprimidas dentro del Canal Keltner. Atento a la ruptura.' : '⚪ Volatilidad en rangos normales.'}
              </div>
            )}
          </div>

        </div>
      )}

      {/* CONTENIDO DE PESTAÑA: HISTORIAL & ACIERTOS */}
      {activeTab === 'history' && (
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', color: '#fff', margin: 0, fontWeight: 700 }}>
                📜 Registro de Señales & Desempeño en el Tiempo (Hoja 3)
              </h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                Registro continuo de aciertos y desempeño de las 2 estrategias cuantitativas de Hoja 3.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={clearMasterHistory}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                🗑️ Limpiar Historial H3
              </button>
            </div>
          </div>

          {/* FILTROS DE HISTORIAL (Rango de Fecha y Estrategia/Estado) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, marginRight: '0.3rem' }}>📅 Rango:</span>
              {[
                { key: 'ALL', label: '🌐 Historial Completo' },
                { key: 'TODAY', label: '☀️ Hoy' },
                { key: '7D', label: '📆 Últimos 7 Días' },
                { key: '30D', label: '📊 Últimos 30 Días' }
              ].map(df => (
                <button
                  key={df.key}
                  onClick={() => setDateRangeFilter(df.key)}
                  style={{
                    padding: '0.3rem 0.65rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background: dateRangeFilter === df.key ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${dateRangeFilter === df.key ? '#3b82f6' : 'rgba(255,255,255,0.05)'}`,
                    color: dateRangeFilter === df.key ? '#fff' : 'var(--color-text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  {df.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, marginRight: '0.3rem' }}>🎯 Filtro:</span>
              {[
                { id: 'ALL', label: `Todas (${dateFilteredHistory.length})` },
                { id: 'STRAT1', label: '1️⃣ Divergencias' },
                { id: 'STRAT2', label: '2️⃣ Quant Squeeze' },
                { id: 'PENDING', label: '⏳ En Curso' },
                { id: 'TP', label: '✅ Ganadoras (TP)' },
                { id: 'SL', label: '❌ Pérdidas (SL)' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setHistoryFilter(f.id)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background: historyFilter === f.id ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${historyFilter === f.id ? '#3b82f6' : 'rgba(255,255,255,0.05)'}`,
                    color: historyFilter === f.id ? '#fff' : 'var(--color-text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* TABLA DE HISTORIAL */}
          {filteredHistory.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
              No hay señales registradas en el historial de Hoja 3 aún.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--color-text-muted)' }}>
                    <th style={{ padding: '0.75rem' }}>Fecha</th>
                    <th style={{ padding: '0.75rem' }}>Estrategia / Tipo</th>
                    <th style={{ padding: '0.75rem' }}>Entrada</th>
                    <th style={{ padding: '0.75rem' }}>TP1 / SL</th>
                    <th style={{ padding: '0.75rem' }}>Riesgo/Beneficio</th>
                    <th style={{ padding: '0.75rem' }}>Estado</th>
                    <th style={{ padding: '0.75rem' }}>PnL %</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((item, idx) => (
                    <tr key={item.id || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>{item.timestamp || 'N/A'}</td>
                      <td style={{ padding: '0.75rem', fontWeight: 700, color: '#fff' }}>{item.label || item.strategy}</td>
                      <td style={{ padding: '0.75rem' }}>${item.entry?.toLocaleString()}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ color: '#10b981' }}>${item.tp1?.toLocaleString()}</span> / <span style={{ color: '#ef4444' }}>${item.sl?.toLocaleString()}</span>
                      </td>
                      <td style={{ padding: '0.75rem', color: '#a855f7', fontWeight: 700 }}>1:{item.rr}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontWeight: 700,
                          fontSize: '0.72rem',
                          background: item.status === 'TP' ? 'rgba(16,185,129,0.2)' : item.status === 'SL' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                          color: item.status === 'TP' ? '#10b981' : item.status === 'SL' ? '#ef4444' : '#f59e0b'
                        }}>
                          {item.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', fontWeight: 800, color: (item.pnlPercent || 0) >= 0 ? '#10b981' : '#ef4444' }}>
                        {(item.pnlPercent || 0) >= 0 ? `+${item.pnlPercent}%` : `${item.pnlPercent}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CONTENIDO DE PESTAÑA: RADAR DE DIVERGENCIAS */}
      {activeTab === 'radar' && (
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3 style={{ fontSize: '1.1rem', color: '#fff', margin: 0, fontWeight: 800 }}>
            🔍 Radar Multi-Timeframe de Divergencias & Compresión
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div style={{ padding: '1.2rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>Divergencia 15M</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0.4rem 0', color: radar.divergence15m.type !== 'NONE' ? '#10b981' : '#cbd5e1' }}>
                {radar.divergence15m.type}
              </div>
            </div>

            <div style={{ padding: '1.2rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>Divergencia 1H</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0.4rem 0', color: radar.divergence1h.type !== 'NONE' ? '#10b981' : '#cbd5e1' }}>
                {radar.divergence1h.type}
              </div>
            </div>

            <div style={{ padding: '1.2rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>Estado Squeeze 1H</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0.4rem 0', color: radar.squeeze1h.inSqueeze ? '#f59e0b' : '#10b981' }}>
                {radar.squeeze1h.inSqueeze ? 'COMPRESIÓN ⚠️' : 'NORMAL / EXPANSION 🟢'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO DE PESTAÑA: REPORTE */}
      {activeTab === 'report' && (
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', color: '#fff', margin: '0 0 1rem 0', fontWeight: 800 }}>
            📊 Reporte Estructurado de Hoja 3
          </h3>
          <pre style={{
            background: 'rgba(0,0,0,0.4)',
            padding: '1.2rem',
            borderRadius: '12px',
            color: '#e2e8f0',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            fontSize: '0.85rem'
          }}>
            {data?.markdownReport || 'Cargando reporte...'}
          </pre>
        </div>
      )}

    </div>
  );
}
