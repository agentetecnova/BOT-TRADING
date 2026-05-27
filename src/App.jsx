import React, { useState, useEffect, useRef } from 'react';
import priceSyncEngine from './services/PriceSyncEngine';

// Default list of cryptos
const DEFAULT_SYMBOLS = [
  { symbol: 'BTCUSDT', label: 'BTC', exchange: 'binance' },
  { symbol: 'ETHUSDT', label: 'ETH', exchange: 'binance' },
  { symbol: 'SOLUSDT', label: 'SOL', exchange: 'binance' },
  { symbol: 'ADAUSDT', label: 'ADA', exchange: 'binance' },
  { symbol: 'PEPEUSDT', label: 'PEPE', exchange: 'mexc' }
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

  // Auto-scroll logs
  const logsEndRef = useRef(null);

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

    return () => {
      priceSyncEngine.stop();
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

      <footer style={{ marginTop: 'auto', padding: '1.5rem 0 0', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
        <div>Antigravity Multi-Exchange Streamer v1.0.0</div>
        <div>Sincronización híbrida de baja latencia</div>
      </footer>
    </div>
  );
}
