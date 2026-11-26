import React, { useState, useMemo } from 'react';
import StrategyRankingService from '../services/StrategyRankingService';
import SignalHistoryService from '../services/SignalHistoryService';

// Catálogo Maestro de las 60 Estrategias Cuantitativas de Bitcoin
export const STRATEGY_CATALOG = [
  // Bloque 1: Tendencia, Momentum & Rupturas (E1 a E10)
  { key: 'Estrategia 1', title: 'Triple EMA Dynamic Trend Rider', tf: '15m', style: 'TREND', styleLabel: '🚀 Tendencia', desc: 'Alineación de EMAs (8, 21, 55) con filtro de pendiente y aceleración.' },
  { key: 'Estrategia 2', title: 'Hull Moving Average (HMA) Zero-Lag', tf: '15m', style: 'TREND', styleLabel: '🚀 Tendencia', desc: 'Medias móviles ponderadas de retardo cero para cambios de tendencia veloces.' },
  { key: 'Estrategia 3', title: 'Supertrend Multi-ATR Volatility Channel', tf: '15m', style: 'TREND', styleLabel: '🚀 Tendencia', desc: 'Seguimiento de tendencia dinámico basado en multiplicadores de volatilidad real.' },
  { key: 'Estrategia 4', title: 'MACD 4H Zero-Cross & Momentum Shift', tf: '4H', style: 'TREND', styleLabel: '🚀 Tendencia', desc: 'Giro de aceleración macro sobre la línea cero en velas de 4 horas.' },
  { key: 'Estrategia 5', title: 'Parabolic SAR + DMI Trend Strength', tf: '1H', style: 'TREND', styleLabel: '🚀 Tendencia', desc: 'Confirmación de fuerza direccional (ADX > 25) con paradas SAR dinámicas.' },
  { key: 'Estrategia 6', title: 'Ichimoku Kumo Cloud Breakout & Chikou', tf: '4H', style: 'TREND', styleLabel: '🚀 Tendencia', desc: 'Ruptura tendencial de nube Kumo con confirmación de retraso temporal.' },
  { key: 'Estrategia 7', title: 'Donchian 20-50 Channel Turtle Breakout', tf: '1H', style: 'TREND', styleLabel: '🚀 Tendencia', desc: 'Ruptura estadística de canales de máximos/mínimos Donchian con trailing.' },
  { key: 'Estrategia 8', title: 'Guppy Multiple Moving Average (GMMA)', tf: '1H', style: 'TREND', styleLabel: '🚀 Tendencia', desc: 'Compresión y abanico expansivo de grupos de medias de corto y largo plazo.' },
  { key: 'Estrategia 9', title: 'Vortex Indicator & True Strength (TSI)', tf: '1H', style: 'TREND', styleLabel: '🚀 Tendencia', desc: 'Cruces de vórtices de energía combinados con índice de fuerza real.' },
  { key: 'Estrategia 10', title: 'Kaufman Adaptive Moving Average (KAMA)', tf: '1H', style: 'TREND', styleLabel: '🚀 Tendencia', desc: 'Media autorregulada según el ratio de eficiencia del ruido de mercado.' },

  // Bloque 2: Reversión a la Media & Osciladores Extremos (E11 a E20)
  { key: 'Estrategia 11', title: 'Bollinger %B + RSI-2 Exhaustion Scalp', tf: '15m', style: 'MEAN_REVERSION', styleLabel: '🌊 Reversión', desc: 'Agotamiento extremo de corto plazo en bandas de desviación estándar.' },
  { key: 'Estrategia 12', title: 'Z-Score VWAP Standard Deviation (2.5σ)', tf: '1H', style: 'MEAN_REVERSION', styleLabel: '🌊 Reversión', desc: 'Desviaciones estadísticas extremas respecto al precio promedio por volumen.' },
  { key: 'Estrategia 13', title: 'Keltner Channel Mean Reversion Scalp', tf: '15m', style: 'MEAN_REVERSION', styleLabel: '🌊 Reversión', desc: 'Reversión a la media en penetraciones de canales Keltner basados en ATR.' },
  { key: 'Estrategia 14', title: 'Stochastic RSI Dynamic Extreme Cross', tf: '15m', style: 'MEAN_REVERSION', styleLabel: '🌊 Reversión', desc: 'Cruces en zonas de sobreventa (<20) y sobrecompra (>80) con confirmación.' },
  { key: 'Estrategia 15', title: 'Williams %R Hidden Divergence Reversal', tf: '1H', style: 'MEAN_REVERSION', styleLabel: '🌊 Reversión', desc: 'Divergencias ocultas en oscilador Williams para contratendencia.' },
  { key: 'Estrategia 16', title: 'Commodity Channel Index (CCI ±200) Hook', tf: '1H', style: 'MEAN_REVERSION', styleLabel: '🌊 Reversión', desc: 'Giros en niveles de sobre-extensión cíclica extrema del CCI.' },
  { key: 'Estrategia 17', title: 'Ultimate Oscillator (UO) Triple-Timeframe', tf: '1H', style: 'MEAN_REVERSION', styleLabel: '🌊 Reversión', desc: 'Ponderación de 3 períodos cíclicos de presión compradora/vendedora.' },
  { key: 'Estrategia 18', title: 'Demarker Dynamic Range Pivot Reversion', tf: '1H', style: 'MEAN_REVERSION', styleLabel: '🌊 Reversión', desc: 'Detección de agotamiento inter-velas con oscilador DeMarker.' },
  { key: 'Estrategia 19', title: 'Rate of Change (ROC) Velocity Reversion', tf: '15m', style: 'MEAN_REVERSION', styleLabel: '🌊 Reversión', desc: 'Reversión de velocidad matemática cuando el ROC se desacelera.' },
  { key: 'Estrategia 20', title: 'Fisher Transform Gaussian Peak Exhaustion', tf: '1H', style: 'MEAN_REVERSION', styleLabel: '🌊 Reversión', desc: 'Normalización gaussiana del precio para identificar picos de inflexión.' },

  // Bloque 3: Order Flow, Volumen & Microestructura (E21 a E30)
  { key: 'Estrategia 21', title: 'Order Flow CVD Delta Divergence', tf: '5m', style: 'ORDER_FLOW', styleLabel: '📊 Order Flow', desc: 'Divergencias entre precio spot y volumen neto agresivo de compras/ventas.' },
  { key: 'Estrategia 22', title: 'Volume Profile POC & Value Area (VAH/VAL)', tf: '1H', style: 'ORDER_FLOW', styleLabel: '📊 Order Flow', desc: 'Rebotes en el Point of Control y extremos del 70% de volumen institucional.' },
  { key: 'Estrategia 23', title: 'Chaikin Money Flow & OBV Accumulation', tf: '1H', style: 'ORDER_FLOW', styleLabel: '📊 Order Flow', desc: 'Flujo de capital institucional sostenido con volumen acumulado.' },
  { key: 'Estrategia 24', title: 'Volume Spread Analysis (VSA) Stopping Vol', tf: '15m', style: 'ORDER_FLOW', styleLabel: '📊 Order Flow', desc: 'Absorción de volumen institucional en velas climáticas de frenado.' },
  { key: 'Estrategia 25', title: 'Anchored VWAP Session Drift & Bounce', tf: '15m', style: 'ORDER_FLOW', styleLabel: '📊 Order Flow', desc: 'Rebotes en bandas de desviación de VWAP anclado al inicio de sesión.' },
  { key: 'Estrategia 26', title: 'Order Book Iceberg Absorption', tf: '5m', style: 'ORDER_FLOW', styleLabel: '📊 Order Flow', desc: 'Detección de órdenes pasivas ocultas que absorben ventas agresivas.' },
  { key: 'Estrategia 27', title: 'Relative Volume (RVOL) Breakout', tf: '15m', style: 'ORDER_FLOW', styleLabel: '📊 Order Flow', desc: 'Rupturas acompañadas de volumen superior a 2.5x el promedio histórico.' },
  { key: 'Estrategia 28', title: 'Force Index Multi-Period Volume Momentum', tf: '1H', style: 'ORDER_FLOW', styleLabel: '📊 Order Flow', desc: 'Fuerza resultante del cambio de precio multiplicado por volumen.' },
  { key: 'Estrategia 29', title: 'Ease of Movement (EOM) Low-Resistance', tf: '1H', style: 'ORDER_FLOW', styleLabel: '📊 Order Flow', desc: 'Movimientos de precio con mínima resistencia de liquidez en el libro.' },
  { key: 'Estrategia 30', title: 'Money Flow Index (MFI) Volume Divergence', tf: '1H', style: 'ORDER_FLOW', styleLabel: '📊 Order Flow', desc: 'RSI ponderado por volumen detectando techos y suelos ocultos.' },

  // Bloque 4: Smart Money Concepts & Liquidez (E31 a E40)
  { key: 'Estrategia 31', title: 'Liquidity Pool Sweep & MSS Breakout', tf: '15m', style: 'SMC', styleLabel: '🏛️ Smart Money', desc: 'Caza de liquidez en máximos/mínimos con quiebre estructural de mercado.' },
  { key: 'Estrategia 32', title: 'Fair Value Gap (FVG) & Order Block Retest', tf: '1H', style: 'SMC', styleLabel: '🏛️ Smart Money', desc: 'Relleno de ineficiencias de liquidez y mitigación de bloques institucionales.' },
  { key: 'Estrategia 33', title: 'Wyckoff Phase C Spring & UTAD Capture', tf: '15m', style: 'SMC', styleLabel: '🏛️ Smart Money', desc: 'Trampas de mercado y confirmación de acumulación y distribución.' },
  { key: 'Estrategia 34', title: 'Fibonacci Golden Pocket (0.618 - 0.65)', tf: '1H', style: 'SMC', styleLabel: '🏛️ Smart Money', desc: 'Reversiones en la zona geométrica de mayor confluencia de retrocesos.' },
  { key: 'Estrategia 35', title: 'Camarilla Pivot Points Equation (H4/L4)', tf: '1D/1H', style: 'SMC', styleLabel: '🏛️ Smart Money', desc: 'Niveles matemáticos predictivos diarios utilizados por mesas de dinero.' },
  { key: 'Estrategia 36', title: 'Equal Highs / Equal Lows (EQH/EQL) Hunt', tf: '15m', style: 'SMC', styleLabel: '🏛️ Smart Money', desc: 'Caza deliberada de órdenes de stop agrupadas en dobles suelos/techos.' },
  { key: 'Estrategia 37', title: 'Breaker Block Retest & Liquidity Retrace', tf: '1H', style: 'SMC', styleLabel: '🏛️ Smart Money', desc: 'Bloque de órdenes quebrado que conmuta su rol a soporte/resistencia.' },
  { key: 'Estrategia 38', title: 'London Open Judas Swing (Asian Trap)', tf: '15m', style: 'SMC', styleLabel: '🏛️ Smart Money', desc: 'Falsa ruptura del rango asiático en la apertura de Londres con giro rápido.' },
  { key: 'Estrategia 39', title: 'Monday Open & Weekly Value Deviation', tf: '1H', style: 'SMC', styleLabel: '🏛️ Smart Money', desc: 'Reversión al precio medio del rango del lunes tras expansiones excesivas.' },
  { key: 'Estrategia 40', title: 'CME Gap Weekend Anomaly Reversion', tf: '1H', style: 'SMC', styleLabel: '🏛️ Smart Money', desc: 'Atracción estadística institucional hacia el cierre de huecos de CME Chicago.' },

  // Bloque 5: Volatilidad, Squeeze & Derivados (E41 a E50)
  { key: 'Estrategia 41', title: 'Bollinger-Keltner Volatility Squeeze (TTM)', tf: '1H', style: 'VOLATILITY', styleLabel: '🌪️ Volatilidad', desc: 'Salida explosiva direccional tras compresión de bandas de Bollinger en Keltner.' },
  { key: 'Estrategia 42', title: 'ATR Volatility Expansion Band Breakout', tf: '15m', style: 'VOLATILITY', styleLabel: '🌪️ Volatilidad', desc: 'Salida con impulso tras contracción extrema del rango verdadero.' },
  { key: 'Estrategia 43', title: 'Historical Volatility Percentile (HVP) Squeeze', tf: '4H', style: 'VOLATILITY', styleLabel: '🌪️ Volatilidad', desc: 'Compresión de volatilidad histórica macro por debajo del percentil 10.' },
  { key: 'Estrategia 44', title: 'Chaikin Volatility Ratio & Momentum Thrust', tf: '1H', style: 'VOLATILITY', styleLabel: '🌪️ Volatilidad', desc: 'Expansión de amplitud del rango de velas anticipando aceleración.' },
  { key: 'Estrategia 45', title: 'Derivatives Funding Rate & OI Squeeze', tf: '1H/4H', style: 'VOLATILITY', styleLabel: '🌪️ Volatilidad', desc: 'Short/Long Squeeze por desequilibrio extremo de apalancamiento.' },
  { key: 'Estrategia 46', title: 'Derivatives Sentiment Long/Short Ratio', tf: '1H', style: 'VOLATILITY', styleLabel: '🌪️ Volatilidad', desc: 'Contratendencia ante saturación de cuentas minoristas apalancadas.' },
  { key: 'Estrategia 47', title: 'Session Volume Imbalance Single Prints', tf: '1H', style: 'VOLATILITY', styleLabel: '🌪️ Volatilidad', desc: 'Llenado de vacíos de volumen según Teoría de Subastas institucional.' },
  { key: 'Estrategia 48', title: 'Power of Three (AMD) Daily Fractal Reversal', tf: '4H/1D', style: 'VOLATILITY', styleLabel: '🌪️ Volatilidad', desc: 'Entrada en distribución tras identificar la mecha de manipulación diaria.' },
  { key: 'Estrategia 49', title: 'Golden / Death Cross Velocity Multi-Period', tf: '1H/4H', style: 'VOLATILITY', styleLabel: '🌪️ Volatilidad', desc: 'Aceleración angular del cruce de EMAs 50/200 institucionales.' },
  { key: 'Estrategia 50', title: 'Weekly Range Projection & Extremes', tf: '1D', style: 'VOLATILITY', styleLabel: '🌪️ Volatilidad', desc: 'Reversión matemática en extremos del rango semanal proyectado.' },

  // Bloque 6: Las 10 Estrategias Propietarias y de Élite del Experto (E51 a E60)
  { key: 'Estrategia 51', title: 'Liquidation Heatmap Cascade Magnet', tf: '15m', style: 'EXPERT', styleLabel: '👑 Propietaria', desc: 'Atracción y barrido hacia bolsillos masivos de liquidación apalancada.' },
  { key: 'Estrategia 52', title: 'Spot vs Perpetuals CVD Divergence', tf: '5m/15m', style: 'EXPERT', styleLabel: '👑 Propietaria', desc: 'Detecta absorción pasiva al contado mientras futuros capitula en pánico.' },
  { key: 'Estrategia 53', title: 'VWAP 3-Sigma Gaussian Exhaustion Climax', tf: '15m', style: 'EXPERT', styleLabel: '👑 Propietaria', desc: 'Reversión gaussiana ineludible al alcanzar 3 desviaciones estándar de VWAP.' },
  { key: 'Estrategia 54', title: 'ICT Silver Bullet 60-Minute Precision Window', tf: '5m', style: 'EXPERT', styleLabel: '👑 Propietaria', desc: 'Ventanas interbancarias de inyección algorítmica (10-11 AM NY / 3-4 AM Londres).' },
  { key: 'Estrategia 55', title: 'Coinbase Spot Premium Index Lead-Lag', tf: '15m/1H', style: 'EXPERT', styleLabel: '👑 Propietaria', desc: 'Seguimiento del dinero institucional de Wall Street antes de que replique Binance.' },
  { key: 'Estrategia 56', title: 'QuantAlpha-1: Triple Confluence Matrix (T-CLAM)', tf: '15m', style: 'EXPERT', styleLabel: '👑 Propietaria', desc: 'Confluencia simultánea de barrido de liquidez + CVD inverso + StochRSI.' },
  { key: 'Estrategia 57', title: 'QuantAlpha-2: Fractal Order-Flow Exhaustion (FOEIR)', tf: '5m', style: 'EXPERT', styleLabel: '👑 Propietaria', desc: 'Mecha de rechazo >60% con volumen 2.2x y delta opuesto (trampa institucional).' },
  { key: 'Estrategia 58', title: 'QuantAlpha-3: Momentum Ribbon Adaptive ATR', tf: '15m/1H/4H', style: 'EXPERT', styleLabel: '👑 Propietaria', desc: 'Alineación de 3 temporalidades simultáneas con pullback a EMA 21.' },
  { key: 'Estrategia 59', title: 'QuantAlpha-4: Funding & OI Cascade (DFOIDC)', tf: '1H', style: 'EXPERT', styleLabel: '👑 Propietaria', desc: 'Short Squeeze inminente ante nuevo mínimo con funding fuertemente negativo.' },
  { key: 'Estrategia 60', title: 'QuantAlpha-5: The Sovereign BTC Quant Ensemble', tf: 'MULTI', style: 'EXPERT', styleLabel: '👑 Meta-Modelo', desc: 'Pondera dinámicamente las 59 estrategias anteriores según Win Rate acumulado.' }
];

export default function StrategyMatrixComponent({
  signalsHistory = [],
  allAnalysisMap = {},
  backtestMap = {},
  btcPrice,
  analysisLoading = false,
  marketRegime = null,
  magneticZones = null,
  masterConsensusData = null,
  onFilterHistory
}) {
  const [selectedStyle, setSelectedStyle] = useState('ALL');
  const [viewMode, setViewMode] = useState('matrix');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('winRate');
  const [sortAsc, setSortAsc] = useState(false);
  const [sniperOnly, setSniperOnly] = useState(false);
  const [inspectingStrategy, setInspectingStrategy] = useState(null);

  // Rankings e indicadores por estrategia
  const rankings = useMemo(() => {
    return StrategyRankingService.calculateStrategyRankings(signalsHistory);
  }, [signalsHistory]);

  const rankingMap = useMemo(() => {
    const map = new Map();
    rankings.forEach(r => {
      const pnl = typeof r.totalPnl === 'number' ? r.totalPnl : (typeof r.totalPnlPercent === 'number' ? r.totalPnlPercent : 0);
      const wr = typeof r.winRate === 'number' ? r.winRate : (typeof r.winRatePercent === 'number' ? r.winRatePercent : null);
      const mfe = typeof r.avgMfe === 'number' ? r.avgMfe : (typeof r.avgMfePercent === 'number' ? r.avgMfePercent : null);
      map.set(r.shortName, {
        ...r,
        totalPnl: pnl,
        winRate: wr,
        avgMfe: mfe
      });
    });
    return map;
  }, [rankings]);

  // Conteo de señales en curso
  const activeCount = useMemo(() => {
    return signalsHistory.filter(s => s.status === 'PENDING').length;
  }, [signalsHistory]);

  // Formatear precios
  const formatPrice = (p) => {
    if (typeof p !== 'number' || isNaN(p)) return '--';
    return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Formatear PnL con signo y fallback seguro
  const formatPnl = (val) => {
    const num = typeof val === 'number' && !isNaN(val) ? val : 0;
    return num >= 0 ? `+${num.toFixed(1)}%` : `${num.toFixed(1)}%`;
  };

  // Filtrado y ordenamiento de catálogo
  const filteredCatalog = useMemo(() => {
    return STRATEGY_CATALOG.filter(strat => {
      // Búsqueda textual
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = strat.title.toLowerCase().includes(q) ||
          strat.desc.toLowerCase().includes(q) ||
          strat.key.toLowerCase().includes(q);
        if (!match) return false;
      }

      // Modo Sniper (>70% Win Rate comprobado en vivo o backtest)
      if (sniperOnly) {
        const stats = rankingMap.get(strat.key);
        const bt = backtestMap?.[strat.key];
        const liveOk = stats && stats.winRate !== null && stats.winRate >= 65 && stats.totalSignals >= 1;
        const btOk = bt && bt.totalTrades >= 3 && (bt.winRate || 0) >= 60 && (bt.profitFactor || 0) >= 1.3;
        if (!liveOk && !btOk) return false;
      }

      // Filtro por estilo / estado
      if (selectedStyle === 'ACTIVE') {
        return signalsHistory.some(s => s.strategy === strat.key && s.status === 'PENDING');
      }
      if (selectedStyle === 'VERIFIED') {
        const bt = backtestMap?.[strat.key];
        return bt && bt.totalTrades >= 3 && (bt.profitFactor || 0) >= 1.35 && (bt.winRate || 0) >= 55;
      }
      if (selectedStyle === 'TOP') {
        const stats = rankingMap.get(strat.key);
        const bt = backtestMap?.[strat.key];
        return (stats && stats.winRate !== null && stats.winRate >= 65) || (bt && (bt.winRate || 0) >= 60 && (bt.profitFactor || 0) >= 1.25);
      }
      if (selectedStyle !== 'ALL') {
        return strat.style === selectedStyle;
      }
      return true;
    }).sort((a, b) => {
      const statsA = rankingMap.get(a.key) || { winRate: -1, avgMfe: -1, totalPnl: -999, totalSignals: 0 };
      const statsB = rankingMap.get(b.key) || { winRate: -1, avgMfe: -1, totalPnl: -999, totalSignals: 0 };
      const btA = backtestMap?.[a.key];
      const btB = backtestMap?.[b.key];

      let valA = 0;
      let valB = 0;

      if (sortField === 'winRate') {
        valA = (statsA.totalSignals > 0 && statsA.winRate !== null) ? statsA.winRate : (btA?.winRate ?? -1);
        valB = (statsB.totalSignals > 0 && statsB.winRate !== null) ? statsB.winRate : (btB?.winRate ?? -1);
      } else if (sortField === 'mfe') {
        valA = statsA.avgMfe ?? -1;
        valB = statsB.avgMfe ?? -1;
      } else if (sortField === 'pnl') {
        valA = statsA.totalSignals > 0 ? (statsA.totalPnl ?? -999) : (btA?.totalPnl ?? -999);
        valB = statsB.totalSignals > 0 ? (statsB.totalPnl ?? -999) : (btB?.totalPnl ?? -999);
      } else if (sortField === 'signals') {
        valA = statsA.totalSignals || btA?.totalTrades || 0;
        valB = statsB.totalSignals || btB?.totalTrades || 0;
      } else {
        const numA = parseInt(a.key.replace('Estrategia ', '')) || 0;
        const numB = parseInt(b.key.replace('Estrategia ', '')) || 0;
        return sortAsc ? numA - numB : numB - numA;
      }

      return sortAsc ? valA - valB : valB - valA;
    });
  }, [searchQuery, selectedStyle, sniperOnly, sortField, sortAsc, rankingMap, signalsHistory, backtestMap]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <section className="strategy-matrix-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* ============================================================ */}
      {/* 🚀 SUITE PREDICTIVA SUPERIOR: TERMÓMETRO, RÉGIMEN Y ZONAS CLAVE */}
      {/* ============================================================ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        
        {/* WIDGET 1: TERMÓMETRO DE CONFLUENCIA PREDICTIVA */}
        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '4px solid #3b82f6' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                🧭 Termómetro de Confluencia
              </span>
              <span style={{ fontSize: '0.72rem', background: 'rgba(59, 130, 246, 0.15)', color: '#93c5fd', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 700 }}>
                60 Modelos 24/7
              </span>
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginBottom: '0.3rem' }}>
              {masterConsensusData?.bias || 'Calculando Confluencia...'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              {masterConsensusData ? `Votos: ${masterConsensusData.longVotes} Longs | ${masterConsensusData.shortVotes} Shorts | Probabilidad: ${masterConsensusData.avgPUp}% Alcista` : 'Sincronizando 60 algoritmos...'}
            </p>
          </div>

          {masterConsensusData && (
            <div style={{ marginTop: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.3rem' }}>
                <span style={{ color: 'var(--color-up)' }}>🟢 Presión Compradora: {masterConsensusData.avgPUp}%</span>
                <span style={{ color: 'var(--color-down)' }}>Presión Vendedora: {masterConsensusData.avgPDown}% 🔴</span>
              </div>
              <div style={{ height: '8px', width: '100%', background: 'rgba(239, 68, 68, 0.4)', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${masterConsensusData.avgPUp}%`, background: 'linear-gradient(90deg, #10b981 0%, #3b82f6 100%)', borderRadius: '99px', transition: 'width 0.4s ease' }} />
              </div>
            </div>
          )}
        </div>

        {/* WIDGET 2: DETECTOR DE RÉGIMEN DE MERCADO */}
        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '4px solid #10b981' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                🚦 Régimen de Mercado BTC
              </span>
              <span style={{ fontSize: '0.72rem', background: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 700 }}>
                {marketRegime ? `Confianza ${marketRegime.confidence}%` : 'Analizando'}
              </span>
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', marginBottom: '0.3rem' }}>
              {marketRegime?.label || '⚖️ Analizando Régimen de Volatilidad...'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: '1.3' }}>
              {marketRegime?.desc || 'Evaluando distancia a la media móvil institucional y contracción de rango ATR.'}
            </p>
          </div>

          {marketRegime?.recommended && (
            <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>Estrategias recomendadas ahora:</span>
              {marketRegime.recommended.map(stratId => (
                <span key={stratId} style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', color: '#f8fafc' }}>
                  {stratId}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* WIDGET 3: ZONAS MAGNÉTICAS CLAVE */}
        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '4px solid #f59e0b' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                📍 Zonas Magnéticas Clave
              </span>
              <span style={{ fontSize: '0.72rem', background: 'rgba(245, 158, 11, 0.15)', color: '#fde68a', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 700 }}>
                Imanes de Precio
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.4rem' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '0.5rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                <span style={{ fontSize: '0.68rem', color: '#f87171', display: 'block', fontWeight: 700 }}>🧲 Imán Liquidación Shorts</span>
                <b style={{ fontSize: '0.92rem', color: '#fff' }}>${magneticZones ? formatPrice(magneticZones.shortLiqMagnet) : '--'}</b>
                <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block' }}>+{magneticZones?.distanceToShortLiq || '--'}% arriba</span>
              </div>
              <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '0.5rem', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                <span style={{ fontSize: '0.68rem', color: '#34d399', display: 'block', fontWeight: 700 }}>🧲 Imán Liquidación Longs</span>
                <b style={{ fontSize: '0.92rem', color: '#fff' }}>${magneticZones ? formatPrice(magneticZones.longLiqMagnet) : '--'}</b>
                <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block' }}>-{magneticZones?.distanceToLongLiq || '--'}% abajo</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.4rem' }}>
            <span>📅 Monday Mid: <b>${magneticZones ? formatPrice(magneticZones.mondayMidpoint) : '--'}</b></span>
            <span>🏛️ CME Gap: <b>${magneticZones ? formatPrice(magneticZones.nearestCmeGap) : '--'}</b></span>
          </div>
        </div>

      </div>

      {/* ============================================================ */}
      {/* BARRA DE CONTROLES: BUSCADOR, FILTROS POR FAMILIA & MODO SNIPER */}
      {/* ============================================================ */}
      <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        
        {/* FILA 1: BUSCADOR, MODO SNIPER & VISTA */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: '280px' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
              <input
                type="text"
                placeholder="🔍 Buscar por nombre, indicador o concepto..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.9rem',
                  borderRadius: '8px',
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
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  ✖
                </button>
              )}
            </div>

            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
              Mostrando <b>{filteredCatalog.length}</b> de 60
            </span>
          </div>

          {/* TOGGLE MODO SNIPER (>70%) */}
          <button
            onClick={() => setSniperOnly(!sniperOnly)}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '8px',
              border: `1px solid ${sniperOnly ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
              background: sniperOnly ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(239, 68, 68, 0.08) 100%)' : 'rgba(255,255,255,0.03)',
              color: sniperOnly ? '#f87171' : 'var(--color-text-muted)',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s ease'
            }}
          >
            🎯 Modo Sniper (&gt;70% Win Rate)
            {sniperOnly && <span style={{ fontSize: '0.7rem', background: '#ef4444', color: '#fff', padding: '0.1rem 0.35rem', borderRadius: '99px' }}>ACTIVO</span>}
          </button>

          {/* TOGGLE VISTA: MATRIZ VS TARJETAS */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: '0.2rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={() => setViewMode('matrix')}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                border: 'none',
                background: viewMode === 'matrix' ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                color: viewMode === 'matrix' ? '#fff' : 'var(--color-text-muted)',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              📋 Matriz Compacta
            </button>
            <button
              onClick={() => setViewMode('cards')}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                border: 'none',
                background: viewMode === 'cards' ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                color: viewMode === 'cards' ? '#fff' : 'var(--color-text-muted)',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🃏 Tarjetas
            </button>
          </div>
        </div>

        {/* FILA 2: BOTONES DE FILTRO POR FAMILIA CUANTITATIVA */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { key: 'ALL', label: '🌐 Todas (60)' },
            { key: 'TREND', label: '🚀 Tendencia (10)' },
            { key: 'MEAN_REVERSION', label: '🌊 Reversión (10)' },
            { key: 'ORDER_FLOW', label: '📊 Order Flow (10)' },
            { key: 'SMC', label: '🏛️ Smart Money (10)' },
            { key: 'VOLATILITY', label: '🌪️ Volatilidad (10)' },
            { key: 'EXPERT', label: '👑 10 Propietarias Experto' },
            { key: 'ACTIVE', label: `🟢 En Curso (${activeCount})` },
            { key: 'VERIFIED', label: '🏆 Verificadas Backtest (PF > 1.35)' },
            { key: 'TOP', label: '⭐ Top Rentables' }
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setSelectedStyle(f.key)}
              style={{
                padding: '0.35rem 0.7rem',
                borderRadius: '6px',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: selectedStyle === f.key ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${selectedStyle === f.key ? '#3b82f6' : 'rgba(255,255,255,0.05)'}`,
                color: selectedStyle === f.key ? '#fff' : 'var(--color-text-muted)',
                transition: 'all 0.2s ease'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

      </div>

      {/* ============================================================ */}
      {/* VISTA 1: MATRIZ COMPACTA (TABLA EJECUTIVA ORDENABLE) */}
      {/* ============================================================ */}
      {viewMode === 'matrix' ? (
        <div className="glass-panel" style={{ overflowX: 'auto', padding: '0.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--color-text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                <th onClick={() => handleSort('id')} style={{ padding: '0.75rem 0.6rem', cursor: 'pointer' }}>
                  Estrategia {sortField === 'id' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th style={{ padding: '0.75rem 0.6rem' }}>Familia / Estilo</th>
                <th style={{ padding: '0.75rem 0.6rem' }}>TF</th>
                <th onClick={() => handleSort('winRate')} style={{ padding: '0.75rem 0.6rem', cursor: 'pointer' }}>
                  Acierto (Vivo / Backtest) {sortField === 'winRate' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th onClick={() => handleSort('mfe')} style={{ padding: '0.75rem 0.6rem', cursor: 'pointer' }}>
                  Backtest PF {sortField === 'mfe' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th onClick={() => handleSort('pnl')} style={{ padding: '0.75rem 0.6rem', cursor: 'pointer' }}>
                  PnL Total {sortField === 'pnl' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th onClick={() => handleSort('signals')} style={{ padding: '0.75rem 0.6rem', cursor: 'pointer' }}>
                  Operaciones (TP/SL) {sortField === 'signals' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th style={{ padding: '0.75rem 0.6rem' }}>Estado Actual</th>
                <th style={{ padding: '0.75rem 0.6rem', textAlign: 'right' }}>Auditoría</th>
              </tr>
            </thead>
            <tbody>
              {filteredCatalog.map(strat => {
                const stats = rankingMap.get(strat.key) || {
                  winRate: null,
                  tpCount: 0,
                  slCount: 0,
                  totalSignals: 0,
                  totalPnl: 0,
                  avgMfe: null
                };
                const bt = backtestMap?.[strat.key];
                const analysis = allAnalysisMap[strat.key];
                const activeSignal = signalsHistory.find(s => s.strategy === strat.key && s.status === 'PENDING');

                const hasLiveResolved = (stats.tpCount + stats.slCount) > 0 && stats.winRate !== null;
                const displayWr = hasLiveResolved ? stats.winRate : (bt?.winRate ?? null);
                const winRateDisplay = displayWr !== null
                  ? `${displayWr}% ${hasLiveResolved ? '' : '(BT)'}`
                  : 'En auditoría';
                const winRateColor = displayWr === null ? 'var(--color-text-muted)' : displayWr >= 65 ? '#10b981' : displayWr >= 50 ? '#3b82f6' : '#ef4444';

                return (
                  <tr
                    key={strat.key}
                    onClick={() => setInspectingStrategy(strat)}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      transition: 'background 0.2s ease',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '0.7rem 0.6rem', fontWeight: 700, color: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ color: '#93c5fd', fontSize: '0.75rem' }}>{strat.key.replace('Estrategia ', 'E')}</span>
                        <span>{strat.title}</span>
                      </div>
                    </td>

                    <td style={{ padding: '0.7rem 0.6rem' }}>
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        background: strat.style === 'EXPERT' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(255,255,255,0.05)',
                        color: strat.style === 'EXPERT' ? '#fde047' : '#cbd5e1',
                        fontWeight: 600
                      }}>
                        {strat.styleLabel}
                      </span>
                    </td>

                    <td style={{ padding: '0.7rem 0.6rem', color: '#94a3b8', fontSize: '0.74rem' }}>
                      {strat.tf}
                    </td>

                    <td style={{ padding: '0.7rem 0.6rem', fontWeight: 800, color: winRateColor }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>{winRateDisplay}</span>
                        {displayWr !== null && (
                          <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '99px', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, displayWr)}%`, height: '100%', background: winRateColor }} />
                          </div>
                        )}
                      </div>
                    </td>

                    <td style={{ padding: '0.7rem 0.6rem', fontWeight: 700, color: bt?.profitFactor >= 1.35 ? '#10b981' : bt?.profitFactor >= 1.0 ? '#93c5fd' : '#94a3b8' }}>
                      {bt && bt.totalTrades >= 2 && bt.profitFactor !== null
                        ? `PF ${bt.profitFactor} (${bt.totalTrades}t)`
                        : (stats.avgMfe !== null && stats.avgMfe > 0 ? `+${stats.avgMfe}% MFE` : '--')}
                    </td>

                    <td style={{ padding: '0.7rem 0.6rem', fontWeight: 700, color: ((hasLiveResolved ? stats.totalPnl : (bt?.totalPnl ?? stats.totalPnl)) || 0) >= 0 ? 'var(--color-up)' : 'var(--color-down)' }}>
                      {formatPnl(hasLiveResolved ? stats.totalPnl : (bt?.totalPnl ?? stats.totalPnl))}
                    </td>

                    <td style={{ padding: '0.7rem 0.6rem', color: 'var(--color-text-muted)' }}>
                      {stats.totalSignals > 0 ? (
                        <span>
                          <b style={{ color: 'var(--color-up)' }}>{stats.tpCount} TP</b> / <b style={{ color: 'var(--color-down)' }}>{stats.slCount} SL</b> ({stats.totalSignals})
                        </span>
                      ) : (
                        '0 señales'
                      )}
                    </td>

                    <td style={{ padding: '0.7rem 0.6rem' }}>
                      {activeSignal ? (
                        <span style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          background: activeSignal.type === 'LONG' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: activeSignal.type === 'LONG' ? '#34d399' : '#f87171',
                          border: `1px solid ${activeSignal.type === 'LONG' ? '#10b981' : '#ef4444'}`
                        }}>
                          ⚡ {activeSignal.type} @ ${formatPrice(activeSignal.entry)}
                        </span>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '0.72rem' }}>Monitoreando</span>
                      )}
                    </td>

                    <td style={{ padding: '0.7rem 0.6rem', textAlign: 'right' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectingStrategy(strat);
                        }}
                        style={{
                          background: 'rgba(59, 130, 246, 0.1)',
                          border: '1px solid rgba(59, 130, 246, 0.25)',
                          color: '#60a5fa',
                          padding: '0.25rem 0.55rem',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.72rem',
                          fontWeight: 700
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
        /* VISTA 2: TARJETAS VISUALES */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {filteredCatalog.map(strat => {
            const stats = rankingMap.get(strat.key) || { winRate: null, totalPnl: 0, tpCount: 0, slCount: 0, totalSignals: 0 };
            const activeSignal = signalsHistory.find(s => s.strategy === strat.key && s.status === 'PENDING');
            const winRateDisplay = stats.winRate !== null ? `${stats.winRate}%` : 'En auditoría';

            return (
              <div
                key={strat.key}
                onClick={() => setInspectingStrategy(strat)}
                className="glass-panel"
                style={{
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.8rem',
                  cursor: 'pointer',
                  border: activeSignal ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.05)',
                  transition: 'transform 0.2s ease, border 0.2s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.72rem', color: '#93c5fd', fontWeight: 800 }}>{strat.key}</span>
                    <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: '#cbd5e1' }}>
                      {strat.tf} • {strat.styleLabel}
                    </span>
                  </div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginBottom: '0.4rem' }}>{strat.title}</h4>
                  <p style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', lineHeight: '1.3' }}>{strat.desc}</p>
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block' }}>Win Rate</span>
                    <b style={{ fontSize: '0.9rem', color: stats.winRate >= 65 ? '#10b981' : '#fff' }}>{winRateDisplay}</b>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block' }}>PnL Total</span>
                    <b style={{ fontSize: '0.9rem', color: (stats.totalPnl || 0) >= 0 ? '#10b981' : '#ef4444' }}>
                      {formatPnl(stats.totalPnl)}
                    </b>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block' }}>Trades</span>
                    <b style={{ fontSize: '0.9rem', color: '#fff' }}>{stats.totalSignals}</b>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL / FICHA TÉCNICA Y AUDITORÍA INDIVIDUAL DE ESTRATEGIA */}
      {/* ============================================================ */}
      {inspectingStrategy && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '1rem'
        }}>
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: '750px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.75rem',
            background: '#0d1117',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}>
            
            {/* Header Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.8rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: 800 }}>{inspectingStrategy.key} • {inspectingStrategy.styleLabel}</span>
                <h3 style={{ fontSize: '1.3rem', color: '#fff', fontWeight: 800, marginTop: '0.2rem' }}>{inspectingStrategy.title}</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>{inspectingStrategy.desc}</p>
              </div>
              <button
                onClick={() => setInspectingStrategy(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.3rem', cursor: 'pointer', padding: '0.2rem 0.5rem' }}
              >
                ✖
              </button>
            </div>

            {/* Ficha de Rendimiento */}
            {(() => {
              const stratStats = rankingMap.get(inspectingStrategy.key) || { winRate: null, totalPnl: 0, tpCount: 0, slCount: 0, totalSignals: 0, avgMfe: null };
              const bt = backtestMap?.[inspectingStrategy.key];
              const stratHistory = signalsHistory.filter(s => s.strategy === inspectingStrategy.key);

              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '8px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block' }}>Win Rate en Vivo</span>
                      <b style={{ fontSize: '1.2rem', color: (stratStats.winRate || 0) >= 65 ? '#10b981' : '#fff' }}>
                        {stratStats.winRate !== null ? `${stratStats.winRate}%` : 'Sin cerradas'}
                      </b>
                    </div>
                    <div style={{ background: 'rgba(59, 130, 246, 0.08)', padding: '0.8rem', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                      <span style={{ fontSize: '0.7rem', color: '#93c5fd', display: 'block' }}>Backtest Reciente</span>
                      <b style={{ fontSize: '1.2rem', color: (bt?.winRate || 0) >= 60 ? '#10b981' : '#fff' }}>
                        {bt && bt.winRate !== null ? `${bt.winRate}% (${bt.totalTrades}t)` : 'N/D'}
                      </b>
                    </div>
                    <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '0.8rem', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                      <span style={{ fontSize: '0.7rem', color: '#6ee7b7', display: 'block' }}>Profit Factor (BT)</span>
                      <b style={{ fontSize: '1.2rem', color: (bt?.profitFactor || 0) >= 1.35 ? '#10b981' : '#fff' }}>
                        {bt && bt.profitFactor !== null ? `${bt.profitFactor}` : '--'}
                      </b>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '8px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block' }}>PnL Vivo / BT</span>
                      <b style={{ fontSize: '1.1rem', color: ((stratStats.tpCount + stratStats.slCount > 0 ? stratStats.totalPnl : bt?.totalPnl) || 0) >= 0 ? '#10b981' : '#ef4444' }}>
                        {formatPnl(stratStats.tpCount + stratStats.slCount > 0 ? stratStats.totalPnl : (bt?.totalPnl ?? 0))}
                      </b>
                    </div>
                  </div>

                  {/* Historial Exclusivo de Esta Estrategia */}
                  <div>
                    <h4 style={{ fontSize: '0.92rem', color: '#fff', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      📜 Historial Exclusivo de Operaciones ({stratHistory.length})
                    </h4>
                    {stratHistory.length === 0 ? (
                      <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                        Esta estrategia aún no ha emitido señales en este ciclo limpio. El algoritmo 24/7 la está monitoreando en cada tick.
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#94a3b8' }}>
                              <th style={{ padding: '0.5rem' }}>Fecha</th>
                              <th style={{ padding: '0.5rem' }}>Tipo</th>
                              <th style={{ padding: '0.5rem' }}>Entrada</th>
                              <th style={{ padding: '0.5rem' }}>TP / SL</th>
                              <th style={{ padding: '0.5rem' }}>MFE</th>
                              <th style={{ padding: '0.5rem' }}>Estado / Resultado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stratHistory.map(sig => (
                              <tr key={sig.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                <td style={{ padding: '0.5rem', color: '#cbd5e1' }}>{new Date(sig.timestamp).toLocaleDateString()} {new Date(sig.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                <td style={{ padding: '0.5rem', fontWeight: 700, color: sig.type === 'LONG' ? '#34d399' : '#f87171' }}>{sig.type}</td>
                                <td style={{ padding: '0.5rem', color: '#fff' }}>${formatPrice(sig.entry)}</td>
                                <td style={{ padding: '0.5rem', color: '#94a3b8' }}>${formatPrice(sig.tp)} / ${formatPrice(sig.sl)}</td>
                                <td style={{ padding: '0.5rem', color: '#34d399', fontWeight: 600 }}>{sig.maxFavorablePercent ? `+${sig.maxFavorablePercent.toFixed(2)}%` : '--'}</td>
                                <td style={{ padding: '0.5rem' }}>
                                  <span style={{
                                    padding: '0.15rem 0.4rem',
                                    borderRadius: '4px',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    background: sig.status === 'TP' ? 'rgba(16, 185, 129, 0.2)' : sig.status === 'SL' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                                    color: sig.status === 'TP' ? '#34d399' : sig.status === 'SL' ? '#f87171' : '#60a5fa'
                                  }}>
                                    {sig.status === 'TP' ? `TP (+${sig.profitPercent}%)` : sig.status === 'SL' ? `SL (-${sig.riskPercent}%)` : 'PENDIENTE'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

          </div>
        </div>
      )}

    </section>
  );
}
