import React, { useState, useEffect, useRef } from 'react';
import priceSyncEngine from './services/PriceSyncEngine';
import coinMarketCapService from './services/CoinMarketCapService';
import technicalAnalysisService from './services/TechnicalAnalysisService';

// Default list of cryptos
const DEFAULT_SYMBOLS = [
  { symbol: 'BTCUSDT', label: 'BTC', exchange: 'binance' },
  { symbol: 'ETHUSDT', label: 'ETH', exchange: 'binance' },
  { symbol: 'SOLUSDT', label: 'SOL', exchange: 'binance' },
  { symbol: 'ADAUSDT', label: 'ADA', exchange: 'binance' }
];

export default function App() {
  const [tokens, setTokens] = useState([]);
  const [statuses, setStatuses] = useState({ binance: 'disconnected', mexc: 'disconnected' });
  const [logs, setLogs] = useState([]);
  const [formSymbol, setFormSymbol] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formExchange, setFormExchange] = useState('binance');
  
  // Track previous prices to determine flash directions
  const prevPricesRef = useRef({});
  // Track flash states for items (key: symbol+exchange, value: 'up' | 'down' | null)
  const [flashStates, setFlashStates] = useState({});
  const flashTimeoutsRef = useRef({});

  // CoinMarketCap state
  const [cmcData, setCmcData] = useState({});
  const [cmcGlobal, setCmcGlobal] = useState(null);
  const [cmcLastUpdated, setCmcLastUpdated] = useState(null);
  const [cmcPulse, setCmcPulse] = useState(false);

  // Auto-scroll logs
  const logsEndRef = useRef(null);

  // Technical Analysis states
  const [strat1Data, setStrat1Data] = useState(null);
  const [strat2Data, setStrat2Data] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [analysisError, setAnalysisError] = useState(null);

  useEffect(() => {
    // Load tokens from localStorage or default
    const saved = localStorage.getItem('crypto_sync_tokens');
    const initialTokens = saved ? JSON.parse(saved) : DEFAULT_SYMBOLS;
    
    // Structure state as:
    // { symbol: 'BTCUSDT', label: 'BTC', exchange: 'binance', price: 0, change24h: 0, lastUpdated: null }
    const mapped = initialTokens.map(t => ({
      ...t,
      price: null,
      change24h: null,
      lastUpdated: null
    }));
    
    setTokens(mapped);

    // Write initial log
    addLog('Sistema', 'Inicializando Motor de Sincronización de Precios...');

    // Start Engine
    priceSyncEngine.start(
      initialTokens,
      // On Price Update
      (update) => {
        setTokens(prev => {
          const itemIndex = prev.findIndex(t => t.symbol === update.symbol && t.exchange === update.exchange);
          if (itemIndex === -1) return prev;

          const updated = [...prev];
          const oldItem = updated[itemIndex];
          const oldPrice = oldItem.price;
          const newPrice = update.price;

          // Determine price flash (up or down)
          if (oldPrice !== null && oldPrice !== newPrice) {
            const key = `${update.symbol}_${update.exchange}`;
            const direction = newPrice > oldPrice ? 'up' : 'down';
            
            // Trigger animation state
            setFlashStates(fPrev => ({ ...fPrev, [key]: direction }));
            
            // Clear any pending timeout for this key
            if (flashTimeoutsRef.current[key]) {
              clearTimeout(flashTimeoutsRef.current[key]);
            }
            
            // Set timeout to clear flash animation after 1s
            flashTimeoutsRef.current[key] = setTimeout(() => {
              setFlashStates(fPrev => ({ ...fPrev, [key]: null }));
            }, 1000);

            // Log update
            const timeStr = new Date().toLocaleTimeString('es-ES', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0');
            const diffPercent = (((newPrice - oldPrice) / oldPrice) * 100).toFixed(4);
            const sign = diffPercent > 0 ? '+' : '';
            addLog(
              update.exchange === 'binance' ? 'Binance WS' : 'MEXC Poll',
              `${update.symbol} actualizado a $${formatPrice(newPrice)} (${sign}${diffPercent}%)`,
              direction
            );
          } else if (oldPrice === null) {
            // First time loading price
            addLog(
              update.exchange === 'binance' ? 'Binance WS' : 'MEXC Poll',
              `${update.symbol} cargado por primera vez: $${formatPrice(newPrice)}`
            );
          }

          updated[itemIndex] = {
            ...oldItem,
            price: newPrice,
            change24h: update.change24h !== null ? update.change24h : oldItem.change24h,
            lastUpdated: update.timestamp
          };
          
          return updated;
        });
      },
      // On Connection Status Change
      (newStatus) => {
        setStatuses(newStatus);
        addLog('Red', `Estados de Conexión actualizados: Binance [${newStatus.binance.toUpperCase()}], MEXC [${newStatus.mexc.toUpperCase()}]`);
      }
    );

    // Start CoinMarketCap polling
    const uniqueLabels = [...new Set(initialTokens.map(t => t.label))];
    coinMarketCapService.startPolling(uniqueLabels, (result) => {
      if (result.quotes) {
        setCmcData(result.quotes);
      }
      if (result.global) {
        setCmcGlobal(result.global);
      }
      setCmcLastUpdated(result.lastUpdated);
      // Trigger pulse animation
      setCmcPulse(true);
      setTimeout(() => setCmcPulse(false), 1200);
    }, 120000);

    return () => {
      priceSyncEngine.stop();
      coinMarketCapService.stopPolling();
      // Clear all active timeouts
      Object.values(flashTimeoutsRef.current).forEach(clearTimeout);
    };
  }, []);

  // Save tokens to localStorage whenever they change structure
  useEffect(() => {
    if (tokens.length > 0) {
      const minimalistList = tokens.map(t => ({
        symbol: t.symbol,
        label: t.label,
        exchange: t.exchange
      }));
      localStorage.setItem('crypto_sync_tokens', JSON.stringify(minimalistList));
    }
  }, [tokens]);

  // Run technical analysis calculations for BTC
  const runTechnicalAnalysis = async () => {
    try {
      const [k5m, k15m, k1h, k4h] = await Promise.all([
        technicalAnalysisService.fetchKlines('BTCUSDT', '5m', 1000),
        technicalAnalysisService.fetchKlines('BTCUSDT', '15m', 1000),
        technicalAnalysisService.fetchKlines('BTCUSDT', '1h', 1000),
        technicalAnalysisService.fetchKlines('BTCUSDT', '4h', 1000)
      ]);

      const res1 = technicalAnalysisService.runStrategy1(k15m);
      
      const klinesMap = {
        '5m': k5m,
        '15m': k15m,
        '1h': k1h,
        '4h': k4h
      };
      const res2 = technicalAnalysisService.runStrategy2(klinesMap);

      setStrat1Data(res1);
      setStrat2Data(res2);
      setAnalysisError(null);
    } catch (err) {
      console.error('Error running technical analysis:', err);
      setAnalysisError('Error al actualizar el análisis de BTC.');
    } finally {
      setAnalysisLoading(false);
    }
  };

  useEffect(() => {
    // Initial analysis load
    runTechnicalAnalysis();

    // Poll every 30 seconds
    const interval = setInterval(runTechnicalAnalysis, 30000);
    return () => clearInterval(interval);
  }, []);

  // Scroll logs to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Add standard logger item
  const addLog = (source, message, type = 'info') => {
    const time = new Date();
    const timestampStr = time.toLocaleTimeString('es-ES', { hour12: false }) + '.' + String(time.getMilliseconds()).padStart(3, '0');
    setLogs(prev => [...prev.slice(-99), { timestamp: timestampStr, source, message, type }]);
  };

  // Format utility
  const formatPrice = (val) => {
    if (val === null || val === undefined) return '...';
    if (val < 0.01) {
      return val.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 8 });
    }
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Format large numbers: 1.2T, 500B, 45M, etc.
  const formatLargeNumber = (num) => {
    if (num === null || num === undefined) return '...';
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
  };

  // Format supply numbers without $ sign
  const formatSupply = (num) => {
    if (num === null || num === undefined) return '∞';
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return num.toFixed(0);
  };

  // Handle addition
  const handleAddSymbol = (e) => {
    e.preventDefault();
    if (!formSymbol) return;

    let cleanSymbol = formSymbol.trim().toUpperCase();
    // Auto-append USDT if user just typed e.g. BTC
    if (!cleanSymbol.endsWith('USDT') && !cleanSymbol.endsWith('BTC') && !cleanSymbol.endsWith('ETH')) {
      cleanSymbol += 'USDT';
    }

    const cleanLabel = formLabel.trim() || cleanSymbol.replace('USDT', '');

    const added = priceSyncEngine.addSymbol(cleanSymbol, cleanLabel, formExchange);
    
    if (added) {
      setTokens(prev => [
        ...prev,
        {
          symbol: cleanSymbol,
          label: cleanLabel.toUpperCase(),
          exchange: formExchange,
          price: null,
          change24h: null,
          lastUpdated: null
        }
      ]);
      addLog('Usuario', `Añadida moneda ${cleanSymbol} de ${formExchange.toUpperCase()}`);
      setFormSymbol('');
      setFormLabel('');
    } else {
      alert('La moneda ya está en la lista.');
    }
  };

  // Remove symbol
  const handleRemoveSymbol = (symbol, exchange) => {
    priceSyncEngine.removeSymbol(symbol, exchange);
    setTokens(prev => prev.filter(t => !(t.symbol === symbol && t.exchange === exchange)));
    addLog('Usuario', `Eliminada moneda ${symbol} de ${exchange.toUpperCase()}`);
  };

  // Reset defaults
  const handleResetDefaults = () => {
    if (window.confirm('¿Restablecer lista de monedas por defecto?')) {
      localStorage.removeItem('crypto_sync_tokens');
      window.location.reload();
    }
  };

  // Get pulse animations based on connection status
  const getPulseClass = (status) => {
    if (status === 'connected') return 'pulse-green bg-green-500';
    if (status === 'connecting') return 'pulse-yellow bg-yellow-500';
    return 'pulse-red bg-red-500';
  };

  const getStatusText = (status) => {
    if (status === 'connected') return 'Conectado';
    if (status === 'connecting') return 'Conectando...';
    return 'Desconectado';
  };

  return (
    <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem', flex: 1 }}>
      
      {/* Header Panel */}
      <header className="glass-panel" style={{ padding: '2rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', background: 'linear-gradient(to right, #ffffff, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🛸 Antigravity Trading Bot
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem', marginTop: '0.25rem' }}>
            Sincronizador de Precios en Tiempo Real y de Alta Precisión.
          </p>
        </div>

        {/* Connections Health Status */}
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {/* Binance Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${getPulseClass(statuses.binance)}`} style={{ width: '10px', height: '10px', borderRadius: '50%' }}></span>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Binance (WebSockets)</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{getStatusText(statuses.binance)}</div>
            </div>
          </div>

          {/* MEXC Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${getPulseClass(statuses.mexc)}`} style={{ width: '10px', height: '10px', borderRadius: '50%' }}></span>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>MEXC (Polling Rápido 1.5s)</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{getStatusText(statuses.mexc)}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        
        {/* Left Side: Cards */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📊 Monitor de Precios en Vivo
            </h2>
            <button 
              onClick={handleResetDefaults}
              style={{ background: 'none', border: '1px solid var(--glass-border)', color: 'var(--color-text-muted)', padding: '0.4rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}
              onMouseEnter={e => e.target.style.borderColor = 'var(--glass-border-hover)'}
              onMouseLeave={e => e.target.style.borderColor = 'var(--glass-border)'}
            >
              🔄 Restablecer Predeterminados
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {tokens.map(token => {
              const key = `${token.symbol}_${token.exchange}`;
              const flash = flashStates[key]; // 'up' | 'down' | null
              const isUp = token.change24h >= 0;
              const hasPrice = token.price !== null;

              let cardBorderClass = '';
              if (flash === 'up') cardBorderClass = 'flash-up';
              if (flash === 'down') cardBorderClass = 'flash-down';

              return (
                <div 
                  key={key} 
                  className={`glass-panel ${cardBorderClass}`} 
                  style={{ 
                    padding: '1.5rem', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden',
                    minHeight: '160px'
                  }}
                >
                  {/* Floating source tag */}
                  <span style={{ 
                    position: 'absolute', 
                    top: '1rem', 
                    right: '1rem', 
                    fontSize: '0.7rem', 
                    textTransform: 'uppercase', 
                    padding: '0.2rem 0.5rem', 
                    borderRadius: '6px', 
                    background: token.exchange === 'binance' ? 'rgba(240, 185, 11, 0.15)' : 'rgba(0, 191, 165, 0.15)',
                    color: token.exchange === 'binance' ? '#f0b90b' : '#00bfa5',
                    fontWeight: 600,
                    letterSpacing: '0.05em'
                  }}>
                    {token.exchange}
                  </span>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff' }}>{token.label}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>{token.symbol}</span>
                    </div>
                    
                    {/* Price with animations */}
                    <div className="font-mono" style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.75rem', letterSpacing: '-0.03em', color: hasPrice ? '#fff' : 'var(--color-text-muted)' }}>
                      {hasPrice ? `$${formatPrice(token.price)}` : 'Sincronizando...'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                    {/* 24h Change */}
                    <div>
                      {token.change24h !== null ? (
                        <span style={{ 
                          color: isUp ? 'var(--color-up)' : 'var(--color-down)', 
                          fontWeight: 600, 
                          fontSize: '0.85rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}>
                          {isUp ? '▲' : '▼'} {Math.abs(token.change24h).toFixed(2)}%
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>--</span>
                      )}
                    </div>

                    <button 
                      onClick={() => handleRemoveSymbol(token.symbol, token.exchange)}
                      style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', fontSize: '0.85rem', cursor: 'pointer' }}
                      onMouseEnter={e => e.target.style.color = 'var(--color-down)'}
                      onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.2)'}
                      title="Eliminar de la lista"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right Side: Form and Logger */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Add Token Form */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '1rem' }}>➕ Añadir Token</h3>
            <form onSubmit={handleAddSymbol} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.4rem', fontWeight: 500 }}>Par o Símbolo (ej: BTCUSDT o BTC)</label>
                <input 
                  type="text" 
                  value={formSymbol} 
                  onChange={e => setFormSymbol(e.target.value)}
                  placeholder="BTCUSDT" 
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.4rem', fontWeight: 500 }}>Etiqueta Visual (Opcional)</label>
                <input 
                  type="text" 
                  value={formLabel} 
                  onChange={e => setFormLabel(e.target.value)}
                  placeholder="BTC" 
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.4rem', fontWeight: 500 }}>Proveedor / Exchange</label>
                <select 
                  value={formExchange} 
                  onChange={e => setFormExchange(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', background: '#0e111d', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '0.9rem', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="binance">Binance (WebSockets - Tiempo Real)</option>
                  <option value="mexc">MEXC (Polling Rápido - 1.5s)</option>
                </select>
              </div>

              <button 
                type="submit" 
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--color-primary)', border: 'none', color: '#fff', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', marginTop: '0.5rem', boxShadow: '0 4px 12px var(--color-primary-glow)' }}
                onMouseEnter={e => e.target.style.opacity = '0.9'}
                onMouseLeave={e => e.target.style.opacity = '1'}
              >
                Añadir al Monitor
              </button>
            </form>
          </div>

          {/* Verification Stream Terminal */}
          <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', flex: 1, minHeight: '320px' }}>
            <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyStyle: 'space-between', width: '100%' }}>
              🖥️ Registro de Sincronización
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
              Muestra las actualizaciones capturadas en el momento exacto.
            </p>

            {/* Terminal console */}
            <div style={{ flex: 1, background: '#030408', borderRadius: '10px', padding: '0.75rem', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '280px' }}>
              {logs.map((log, index) => {
                let color = 'var(--color-text-muted)';
                if (log.type === 'up') color = 'var(--color-up)';
                if (log.type === 'down') color = 'var(--color-down)';
                if (log.source === 'Sistema') color = '#9333ea';
                if (log.source === 'Red') color = '#2563eb';

                return (
                  <div key={index} style={{ lineBreak: 'anywhere' }}>
                    <span style={{ color: 'rgba(255,255,255,0.2)' }}>[{log.timestamp}]</span>{' '}
                    <span style={{ color: log.source === 'Binance WS' ? '#f0b90b' : log.source === 'MEXC Poll' ? '#00bfa5' : '#818cf8', fontWeight: 600 }}>[{log.source}]</span>{' '}
                    <span style={{ color }}>{log.message}</span>
                  </div>
                );
              })}
              <div ref={logsEndRef} />
            </div>
          </div>
        </section>
      </main>

      {/* ═══════════════════════════════════════════════════
          CoinMarketCap Market Analysis Section
          ═══════════════════════════════════════════════════ */}

      {/* Global Stats Bar */}
      {cmcGlobal && (
        <div className={`glass-panel ${cmcPulse ? 'cmc-update-pulse' : ''}`} style={{ padding: '1.25rem 2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center', alignItems: 'stretch' }}>
          <div className="stat-card">
            <span style={{ fontSize: '1.2rem', marginBottom: '0.35rem' }}>🌍</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Market Cap Total</span>
            <span className="font-mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
              {formatLargeNumber(cmcGlobal.totalMarketCap)}
            </span>
          </div>

          <div className="stat-card">
            <span style={{ fontSize: '1.2rem', marginBottom: '0.35rem' }}>👑</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.25rem' }}>BTC Dominance</span>
            <span className="font-mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f0b90b' }}>
              {cmcGlobal.btcDominance !== null ? `${cmcGlobal.btcDominance.toFixed(1)}%` : '...'}
            </span>
          </div>

          <div className="stat-card">
            <span style={{ fontSize: '1.2rem', marginBottom: '0.35rem' }}>💎</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.25rem' }}>ETH Dominance</span>
            <span className="font-mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#627eea' }}>
              {cmcGlobal.ethDominance !== null ? `${cmcGlobal.ethDominance.toFixed(1)}%` : '...'}
            </span>
          </div>

          <div className="stat-card">
            <span style={{ fontSize: '1.2rem', marginBottom: '0.35rem' }}>🔢</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Criptos Activas</span>
            <span className="font-mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
              {cmcGlobal.activeCryptocurrencies !== null ? cmcGlobal.activeCryptocurrencies.toLocaleString() : '...'}
            </span>
          </div>
        </div>
      )}

      {/* Analysis Cards Grid */}
      {Object.keys(cmcData).length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📈 Análisis de Mercado
            </h2>
            {cmcLastUpdated && (
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                Última actualización: {cmcLastUpdated.toLocaleTimeString('es-ES', { hour12: false })}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {Object.entries(cmcData).map(([symbol, data]) => {
              const supplyPercent = data.maxSupply
                ? Math.min((data.circulatingSupply / data.maxSupply) * 100, 100)
                : null;

              return (
                <div
                  key={symbol}
                  className={`glass-panel ${cmcPulse ? 'cmc-update-pulse' : ''}`}
                  style={{
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Top row: Rank + Symbol + Name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className="cmc-rank-badge">#{data.cmcRank}</span>
                    <div>
                      <span style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff' }}>{symbol}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>{data.name}</span>
                    </div>
                  </div>

                  {/* Market Cap & Volume */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div style={{ padding: '0.65rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Market Cap</div>
                      <div className="font-mono" style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>
                        {formatLargeNumber(data.marketCap)}
                      </div>
                    </div>
                    <div style={{ padding: '0.65rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Volumen 24h</div>
                      <div className="font-mono" style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>
                        {formatLargeNumber(data.volume24h)}
                      </div>
                    </div>
                  </div>

                  {/* Supply Bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Supply Circulante</span>
                      <span className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                        {formatSupply(data.circulatingSupply)} / {formatSupply(data.maxSupply)}
                      </span>
                    </div>
                    <div className="supply-bar">
                      <div
                        className="supply-bar-fill"
                        style={{ width: supplyPercent !== null ? `${supplyPercent}%` : '100%' }}
                      />
                    </div>
                    {supplyPercent !== null && (
                      <div style={{ textAlign: 'right', marginTop: '0.25rem' }}>
                        <span className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--color-primary)' }}>
                          {supplyPercent.toFixed(1)}% en circulación
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Change Percentages: 1h, 24h, 7d */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                    {[
                      { label: '1h', value: data.percentChange1h },
                      { label: '24h', value: data.percentChange24h },
                      { label: '7d', value: data.percentChange7d },
                    ].map(({ label, value }) => {
                      const isPositive = value >= 0;
                      return (
                        <div
                          key={label}
                          style={{
                            padding: '0.5rem',
                            background: isPositive ? 'rgba(0, 230, 118, 0.06)' : 'rgba(255, 23, 68, 0.06)',
                            borderRadius: '8px',
                            border: `1px solid ${isPositive ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)'}`,
                            textAlign: 'center',
                          }}
                        >
                          <div style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.2rem' }}>{label}</div>
                          <div className="font-mono" style={{
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            color: isPositive ? 'var(--color-up)' : 'var(--color-down)',
                          }}>
                            {isPositive ? '▲' : '▼'} {Math.abs(value).toFixed(2)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer: Source badge + Last updated */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                    <span className="cmc-source-badge">📊 CoinMarketCap</span>
                    {data.lastUpdated && (
                      <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                        {new Date(data.lastUpdated).toLocaleTimeString('es-ES', { hour12: false })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════
          Bitcoin (BTC) Technical Prediction Dashboard
          ═══════════════════════════════════════════════════ */}
      <section className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              🧠 Predicciones Algorítmicas de Bitcoin (BTC)
            </h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
              Modelos predictivos independientes calculados en tiempo real.
            </p>
          </div>
          {analysisLoading ? (
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="pulse-yellow bg-yellow-500" style={{ width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' }}></span>
              Analizando mercado...
            </span>
          ) : (
            <span style={{ fontSize: '0.8rem', color: 'var(--color-up)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="pulse-green bg-green-500" style={{ width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' }}></span>
              Actualizado
            </span>
          )}
        </div>

        {analysisError && (
          <div style={{ padding: '1rem', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', fontSize: '0.9rem' }}>
            ⚠️ {analysisError}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
          
          {/* ESTRATEGIA 1: CONFLUENCIA MULTIFACTORIAL */}
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-primary)', fontWeight: 700, letterSpacing: '0.05em' }}>Estrategia 1</span>
                <h3 style={{ fontSize: '1.15rem', color: '#fff', marginTop: '0.15rem' }}>⚡ Confluencia Rápida (15m)</h3>
              </div>
              {strat1Data && (
                <span style={{ 
                  fontSize: '0.75rem', 
                  fontWeight: 700, 
                  padding: '0.25rem 0.6rem', 
                  borderRadius: '6px', 
                  background: strat1Data.bias.includes('ALCISTA') ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)', 
                  color: strat1Data.bias.includes('ALCISTA') ? 'var(--color-up)' : 'var(--color-down)' 
                }}>
                  {strat1Data.bias}
                </span>
              )}
            </div>

            {analysisLoading ? (
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>Procesando indicadores...</div>
            ) : strat1Data ? (
              <>
                {/* Progress Bar Display */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--color-up)' }}>📈 COMPRA: {strat1Data.pUp}%</span>
                    <span style={{ color: 'var(--color-down)' }}>📉 VENTA: {strat1Data.pDown}%</span>
                  </div>
                  <div style={{ height: '10px', background: 'rgba(255, 23, 68, 0.2)', borderRadius: '99px', overflow: 'hidden', display: 'flex' }}>
                    <div style={{ width: `${strat1Data.pUp}%`, background: 'var(--color-up)', transition: 'width 0.5s ease-in-out' }} />
                    <div style={{ width: `${strat1Data.pDown}%`, background: 'var(--color-down)', transition: 'width 0.5s ease-in-out' }} />
                  </div>
                </div>

                {/* Reasons List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <h4 style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Señales del Mercado</h4>
                  <ul style={{ paddingLeft: '1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', color: '#cbd5e1' }}>
                    {strat1Data.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                    {strat1Data.reasons.length === 0 && <li style={{ color: 'var(--color-text-muted)', listStyle: 'none', marginLeft: '-1rem' }}>Sin señales claras en este momento.</li>}
                  </ul>
                </div>
              </>
            ) : null}
          </div>

          {/* ESTRATEGIA 2: PRO TRADER (EMA FRACTAL + DIVERGENCIAS) */}
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#f59e0b', fontWeight: 700, letterSpacing: '0.05em' }}>Estrategia 2</span>
                <h3 style={{ fontSize: '1.15rem', color: '#fff', marginTop: '0.15rem' }}>💎 Pro Trader (Fractal EMAs + RSI 7)</h3>
              </div>
              {strat2Data && (
                <span style={{ 
                  fontSize: '0.75rem', 
                  fontWeight: 700, 
                  padding: '0.25rem 0.6rem', 
                  borderRadius: '6px', 
                  background: strat2Data.bias.includes('COMPRA') || strat2Data.bias.includes('COMPRADOR') ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)', 
                  color: strat2Data.bias.includes('COMPRA') || strat2Data.bias.includes('COMPRADOR') ? 'var(--color-up)' : 'var(--color-down)' 
                }}>
                  {strat2Data.bias}
                </span>
              )}
            </div>

            {analysisLoading ? (
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>Escaneando temporalidades (5m, 15m, 1h, 4h)...</div>
            ) : strat2Data ? (
              <>
                {/* Progress Bar Display */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--color-up)' }}>📈 COMPRA: {strat2Data.pUp}%</span>
                    <span style={{ color: 'var(--color-down)' }}>📉 VENTA: {strat2Data.pDown}%</span>
                  </div>
                  <div style={{ height: '10px', background: 'rgba(255, 23, 68, 0.2)', borderRadius: '99px', overflow: 'hidden', display: 'flex' }}>
                    <div style={{ width: `${strat2Data.pUp}%`, background: 'var(--color-up)', transition: 'width 0.5s ease-in-out' }} />
                    <div style={{ width: `${strat2Data.pDown}%`, background: 'var(--color-down)', transition: 'width 0.5s ease-in-out' }} />
                  </div>
                </div>

                {/* Reasons List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <h4 style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Estructuras y Divergencias Detectadas</h4>
                  <ul style={{ paddingLeft: '1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', color: '#cbd5e1' }}>
                    {strat2Data.details.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                    {strat2Data.details.length === 0 && <li style={{ color: 'var(--color-text-muted)', listStyle: 'none', marginLeft: '-1rem' }}>Estructuras en balance. Sin divergencias.</li>}
                  </ul>
                </div>
              </>
            ) : null}
          </div>

        </div>
      </section>

      <footer style={{ marginTop: 'auto', padding: '1.5rem 0 0', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
        <div>Antigravity Multi-Exchange Streamer v1.0.0</div>
        <div>Sincronización híbrida de baja latencia</div>
      </footer>
    </div>
  );
}
