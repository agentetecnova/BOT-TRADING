import React, { useState, useEffect, useRef } from 'react';
import technicalAnalysisService from './services/TechnicalAnalysisService';
import './App.css';

export default function App() {
  // Live BTC data
  const [btcPrice, setBtcPrice] = useState(null);
  const [btcChange24h, setBtcChange24h] = useState(null);
  const [priceFlash, setPriceFlash] = useState(null); // 'up' | 'down' | null
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [logs, setLogs] = useState([]);

  // Technical Analysis states
  const [strat1Data, setStrat1Data] = useState(null);
  const [strat2Data, setStrat2Data] = useState(null);
  const [strat3Data, setStrat3Data] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [analysisError, setAnalysisError] = useState(null);

  // Signals History state
  const [signalsHistory, setSignalsHistory] = useState([]);

  // Auto-scroll logs
  const consoleRef = useRef(null);

  // Load signals from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('btc_signals_history');
    if (saved) {
      setSignalsHistory(JSON.parse(saved));
    }
    addLog('Sistema', 'Terminal de Análisis Técnico de BTC Inicializada');
  }, []);

  // Set up live price WebSocket connection (Binance WS for BTCUSDT)
  useEffect(() => {
    const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');
    setConnectionStatus('connecting');

    ws.onopen = () => {
      setConnectionStatus('connected');
      addLog('Red', 'Conectado a Binance WebSockets (BTCUSDT)');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.c) {
          const newPrice = parseFloat(data.c);
          const percent = parseFloat(data.P);

          setBtcPrice(prev => {
            if (prev !== null && prev !== newPrice) {
              setPriceFlash(newPrice > prev ? 'up' : 'down');
            }
            return newPrice;
          });

          setBtcChange24h(percent);
        }
      } catch (err) {
        console.error('Error parsing WS message:', err);
      }
    };

    ws.onerror = () => {
      setConnectionStatus('disconnected');
      addLog('Red', 'Error en conexión WebSocket');
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      addLog('Red', 'Conexión WebSocket cerrada');
    };

    return () => {
      ws.close();
    };
  }, []);

  // Monitor price updates to check and resolve active signals
  useEffect(() => {
    if (btcPrice === null) return;
    
    setSignalsHistory(prev => {
      let updated = false;
      const next = prev.map(sig => {
        if (sig.status !== 'PENDING') return sig;

        if (sig.type === 'LONG') {
          if (btcPrice >= sig.tp) {
            updated = true;
            addLog('Sistema', `Señal LONG de ${sig.strategy} tocó TAKE PROFIT ✅ a $${formatPrice(btcPrice)}`, 'up');
            return { ...sig, status: 'TP', resolvedAt: Date.now(), exitPrice: btcPrice };
          }
          if (btcPrice <= sig.sl) {
            updated = true;
            addLog('Sistema', `Señal LONG de ${sig.strategy} tocó STOP LOSS ❌ a $${formatPrice(btcPrice)}`, 'down');
            return { ...sig, status: 'SL', resolvedAt: Date.now(), exitPrice: btcPrice };
          }
        } else { // SHORT
          if (btcPrice <= sig.tp) {
            updated = true;
            addLog('Sistema', `Señal SHORT de ${sig.strategy} tocó TAKE PROFIT ✅ a $${formatPrice(btcPrice)}`, 'up');
            return { ...sig, status: 'TP', resolvedAt: Date.now(), exitPrice: btcPrice };
          }
          if (btcPrice >= sig.sl) {
            updated = true;
            addLog('Sistema', `Señal SHORT de ${sig.strategy} tocó STOP LOSS ❌ a $${formatPrice(btcPrice)}`, 'down');
            return { ...sig, status: 'SL', resolvedAt: Date.now(), exitPrice: btcPrice };
          }
        }
        return sig;
      });

      if (updated) {
        localStorage.setItem('btc_signals_history', JSON.stringify(next));
      }
      return next;
    });
  }, [btcPrice]);

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
      const res3 = technicalAnalysisService.runStrategy3(klinesMap);

      setStrat1Data(res1);
      setStrat2Data(res2);
      setStrat3Data(res3);
      setAnalysisError(null);

      // Process new signals if any
      addNewSignal('Estrategia 1', res1);
      addNewSignal('Estrategia 2', res2);
      addNewSignal('Estrategia 3', res3);

    } catch (err) {
      console.error('Error running technical analysis:', err);
      setAnalysisError('Error al actualizar el análisis de BTC.');
    } finally {
      setAnalysisLoading(false);
    }
  };

  // Poll analysis every 30 seconds
  useEffect(() => {
    runTechnicalAnalysis();
    const interval = setInterval(runTechnicalAnalysis, 30000);
    return () => clearInterval(interval);
  }, []);

  // Add new trading signal to history
  const addNewSignal = (strategyName, strategyResult) => {
    if (!strategyResult || !strategyResult.hasSignal || !strategyResult.signal) return;

    setSignalsHistory(prev => {
      // Avoid duplicate active signal for the same strategy
      const hasPending = prev.some(sig => sig.strategy === strategyName && sig.status === 'PENDING');
      if (hasPending) return prev;

      const sig = strategyResult.signal;
      const newSignal = {
        id: `${strategyName.replace(/\s+/g, '_')}_${Date.now()}`,
        timestamp: Date.now(),
        strategy: strategyName,
        type: sig.type,
        entry: sig.entry,
        sl: sig.sl,
        tp: sig.tp,
        riskPercent: sig.riskPercent,
        profitPercent: sig.profitPercent,
        status: 'PENDING',
        resolvedAt: null,
        exitPrice: null
      };

      const next = [newSignal, ...prev];
      localStorage.setItem('btc_signals_history', JSON.stringify(next));

      addLog('Algoritmo', `Nueva señal ${sig.type} generada por ${strategyName} a $${formatPrice(sig.entry)}`);
      return next;
    });
  };

  // Scroll terminal logs to bottom
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  // Clear signal history
  const handleClearHistory = () => {
    if (window.confirm('¿Seguro que deseas vaciar el historial de señales?')) {
      setSignalsHistory([]);
      localStorage.removeItem('btc_signals_history');
      addLog('Sistema', 'Historial de señales eliminado');
    }
  };

  // Logger helper
  const addLog = (source, message, type = 'info') => {
    const time = new Date();
    const timestampStr = time.toLocaleTimeString('es-ES', { hour12: false }) + '.' + String(time.getMilliseconds()).padStart(3, '0');
    setLogs(prev => [...prev.slice(-99), { timestamp: timestampStr, source, message, type }]);
  };

  // Format price helper
  const formatPrice = (val) => {
    if (val === null || val === undefined) return '...';
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Calculate Win Rate statistics
  const getStats = () => {
    const resolved = signalsHistory.filter(s => s.status === 'TP' || s.status === 'SL');
    if (resolved.length === 0) return { winRate: 0, tpCount: 0, slCount: 0, total: 0 };

    const tpCount = resolved.filter(s => s.status === 'TP').length;
    const slCount = resolved.filter(s => s.status === 'SL').length;
    const winRate = Math.round((tpCount / resolved.length) * 100);

    return { winRate, tpCount, slCount, total: resolved.length };
  };

  const stats = getStats();

  return (
    <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem', flex: 1 }}>
      
      {/* HEADER PANEL */}
      <header className="glass-panel" style={{ padding: '2rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', background: 'linear-gradient(to right, #ffffff, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🛸 Antigravity BTC Quant Terminal
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem', marginTop: '0.25rem' }}>
            Terminal predictiva especializada y motor de señales en vivo para Bitcoin.
          </p>
        </div>

        {/* Connection status and live price overview */}
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          
          {/* Live Price Widget */}
          <div className={`glass-panel ${priceFlash ? `flash-${priceFlash}` : ''}`} style={{ padding: '0.75rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '180px', transition: 'all 0.3s ease' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Precio BTC/USDT</span>
            <span className="font-mono" style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', margin: '0.15rem 0' }}>
              {btcPrice ? `$${formatPrice(btcPrice)}` : 'Cargando...'}
            </span>
            {btcChange24h !== null && (
              <span style={{ fontSize: '0.8rem', color: btcChange24h >= 0 ? 'var(--color-up)' : 'var(--color-down)', fontWeight: 700 }}>
                {btcChange24h >= 0 ? '▲' : '▼'} {Math.abs(btcChange24h).toFixed(2)}%
              </span>
            )}
          </div>

          {/* Connection badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1.25rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--glass-border)', height: '100%' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block', background: connectionStatus === 'connected' ? 'var(--color-up)' : connectionStatus === 'connecting' ? '#eab308' : 'var(--color-down)' }}></span>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Binance Feed</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{connectionStatus === 'connected' ? 'Conectado' : connectionStatus === 'connecting' ? 'Conectando...' : 'Desconectado'}</div>
            </div>
          </div>

        </div>
      </header>

      {/* ANALYSIS ERROR BLOCK */}
      {analysisError && (
        <div style={{ padding: '1rem', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', fontSize: '0.9rem' }}>
          ⚠️ {analysisError}
        </div>
      )}

      {/* 3 STRATEGIES MAIN ROW (Top Visuals) */}
      <section className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Section Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              🧠 Modelos Predictivos en Tiempo Real
            </h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
              Tres algoritmos independientes analizando el flujo de BTC de manera paralela.
            </p>
          </div>
          {analysisLoading ? (
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="pulse-yellow bg-yellow-500" style={{ width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' }}></span>
              Analizando velas...
            </span>
          ) : (
            <span style={{ fontSize: '0.8rem', color: 'var(--color-up)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="pulse-green bg-green-500" style={{ width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' }}></span>
              Motor Técnico Listo
            </span>
          )}
        </div>

        {/* ESTRATEGIA 3: SEÑALES DE ALTA PROBABILIDAD (INSTITUCIONAL) */}
        <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '16px', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative', overflow: 'hidden' }}>
          {strat3Data && strat3Data.hasSignal && (
            <div style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '150px',
              height: '150px',
              background: strat3Data.signal.type === 'LONG' ? 'radial-gradient(circle, rgba(0, 230, 118, 0.1) 0%, rgba(0,0,0,0) 70%)' : 'radial-gradient(circle, rgba(255, 23, 68, 0.1) 0%, rgba(0,0,0,0) 70%)',
              pointerEvents: 'none'
            }} />
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#f59e0b', fontWeight: 700, letterSpacing: '0.07em' }}>Estrategia 3</span>
              <h3 style={{ fontSize: '1.25rem', color: '#fff', marginTop: '0.15rem' }}>🚨 Señales de Alta Probabilidad (Barridas de Liquidez 15m)</h3>
            </div>
            {strat3Data && (
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', background: 'rgba(255,255,255,0.03)', padding: '0.35rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', fontWeight: 500 }}>
                Sesgo Macro (1h): <strong style={{ color: strat3Data.macroBias === 'ALCISTA' ? 'var(--color-up)' : 'var(--color-down)' }}>{strat3Data.macroBias}</strong>
              </span>
            )}
          </div>

          {analysisLoading ? (
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', padding: '1rem 0' }}>Buscando barridas institucionales...</div>
          ) : strat3Data && strat3Data.hasSignal ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ padding: '1rem 1.25rem', borderRadius: '12px', background: strat3Data.signal.type === 'LONG' ? 'rgba(0, 230, 118, 0.08)' : 'rgba(255, 23, 68, 0.08)', border: `1px solid ${strat3Data.signal.type === 'LONG' ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 23, 68, 0.15)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.15rem', fontWeight: 800, color: strat3Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)' }}>NUEVA SEÑAL: {strat3Data.signal.type}</span>
                    <span>{'⭐'.repeat(strat3Data.signal.stars)}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>Barrida confirmada por {strat3Data.signal.stars} factores.</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff' }}>{strat3Data.signal.probability}%</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Efectividad</div>
                </div>
              </div>

              {/* Levels display */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div style={{ padding: '0.85rem', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>ENTRADA</div>
                  <div className="font-mono" style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff' }}>${formatPrice(strat3Data.signal.entry)}</div>
                </div>
                <div style={{ padding: '0.85rem', background: 'rgba(255, 23, 68, 0.02)', borderRadius: '10px', border: '1px solid rgba(255, 23, 68, 0.05)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--color-down)', marginBottom: '0.25rem' }}>STOP LOSS (SL)</div>
                  <div className="font-mono" style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-down)' }}>${formatPrice(strat3Data.signal.sl)}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>Riesgo: -{strat3Data.signal.riskPercent}%</div>
                </div>
                <div style={{ padding: '0.85rem', background: 'rgba(0, 230, 118, 0.02)', borderRadius: '10px', border: '1px solid rgba(0, 230, 118, 0.05)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--color-up)', marginBottom: '0.25rem' }}>TAKE PROFIT (TP)</div>
                  <div className="font-mono" style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-up)' }}>${formatPrice(strat3Data.signal.tp)}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>Retorno: +{strat3Data.signal.profitPercent}% (1:3)</div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '1rem', borderRadius: '10px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', textAlign: 'center', fontSize: '0.85rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <span className="pulse-yellow bg-yellow-500" style={{ width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' }}></span>
              Buscando confluencia en el mercado... No hay señales de alta probabilidad en este momento (15m).
            </div>
          )}
        </div>

        {/* STRATEGY 1 & 2 GRID LAYOUT */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
          
          {/* ESTRATEGIA 1: CONFLUENCIA MULTIFACTORIAL */}
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-primary)', fontWeight: 700, letterSpacing: '0.05em' }}>Estrategia 1</span>
                <h3 style={{ fontSize: '1.15rem', color: '#fff', marginTop: '0.15rem' }}>⚡ Confluencia Rápida (15m)</h3>
              </div>
              {strat1Data && (
                <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '6px', background: strat1Data.bias.includes('ALCISTA') ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)', color: strat1Data.bias.includes('ALCISTA') ? 'var(--color-up)' : 'var(--color-down)' }}>
                  {strat1Data.bias}
                </span>
              )}
            </div>

            {analysisLoading ? (
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>Cargando indicadores...</div>
            ) : strat1Data ? (
              <>
                {/* Probabilities progress bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--color-up)' }}>COMPRA: {strat1Data.pUp}%</span>
                    <span style={{ color: 'var(--color-down)' }}>VENTA: {strat1Data.pDown}%</span>
                  </div>
                  <div style={{ height: '8px', background: 'rgba(255, 23, 68, 0.2)', borderRadius: '99px', overflow: 'hidden', display: 'flex' }}>
                    <div style={{ width: `${strat1Data.pUp}%`, background: 'var(--color-up)', transition: 'width 0.5s ease' }} />
                    <div style={{ width: `${strat1Data.pDown}%`, background: 'var(--color-down)', transition: 'width 0.5s ease' }} />
                  </div>
                </div>

                {/* Strategy 1 Active Signal */}
                {strat1Data.hasSignal ? (
                  <div style={{ padding: '0.85rem', borderRadius: '10px', background: strat1Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.05)' : 'rgba(255,23,68,0.05)', border: `1px solid ${strat1Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)'}` }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: strat1Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)', marginBottom: '0.4rem' }}>SEÑAL ACTIVA: {strat1Data.signal.type}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                      <div>Entry: ${formatPrice(strat1Data.signal.entry)}</div>
                      <div style={{ color: 'var(--color-down)' }}>SL: ${formatPrice(strat1Data.signal.sl)}</div>
                      <div style={{ color: 'var(--color-up)' }}>TP: ${formatPrice(strat1Data.signal.tp)}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                    Sin señal de confluencia fuerte en este momento.
                  </div>
                )}

                {/* Reasons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <h4 style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Indicadores</h4>
                  <ul style={{ paddingLeft: '1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                    {strat1Data.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : null}
          </div>

          {/* ESTRATEGIA 2: PRO TRADER (EMA FRACTAL) */}
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#10b981', fontWeight: 700, letterSpacing: '0.05em' }}>Estrategia 2</span>
                <h3 style={{ fontSize: '1.15rem', color: '#fff', marginTop: '0.15rem' }}>💎 Pro Trader (Fractal EMAs + RSI 7)</h3>
              </div>
              {strat2Data && (
                <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '6px', background: strat2Data.bias.includes('COMPRA') || strat2Data.bias.includes('COMPRADOR') ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)', color: strat2Data.bias.includes('COMPRA') || strat2Data.bias.includes('COMPRADOR') ? 'var(--color-up)' : 'var(--color-down)' }}>
                  {strat2Data.bias}
                </span>
              )}
            </div>

            {analysisLoading ? (
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>Cargando análisis...</div>
            ) : strat2Data ? (
              <>
                {/* Probabilities progress bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--color-up)' }}>COMPRA: {strat2Data.pUp}%</span>
                    <span style={{ color: 'var(--color-down)' }}>VENTA: {strat2Data.pDown}%</span>
                  </div>
                  <div style={{ height: '8px', background: 'rgba(255, 23, 68, 0.2)', borderRadius: '99px', overflow: 'hidden', display: 'flex' }}>
                    <div style={{ width: `${strat2Data.pUp}%`, background: 'var(--color-up)', transition: 'width 0.5s ease' }} />
                    <div style={{ width: `${strat2Data.pDown}%`, background: 'var(--color-down)', transition: 'width 0.5s ease' }} />
                  </div>
                </div>

                {/* Strategy 2 Active Signal */}
                {strat2Data.hasSignal ? (
                  <div style={{ padding: '0.85rem', borderRadius: '10px', background: strat2Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.05)' : 'rgba(255,23,68,0.05)', border: `1px solid ${strat2Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)'}` }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: strat2Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)', marginBottom: '0.4rem' }}>SEÑAL ACTIVA: {strat2Data.signal.type}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                      <div>Entry: ${formatPrice(strat2Data.signal.entry)}</div>
                      <div style={{ color: 'var(--color-down)' }}>SL: ${formatPrice(strat2Data.signal.sl)}</div>
                      <div style={{ color: 'var(--color-up)' }}>TP: ${formatPrice(strat2Data.signal.tp)}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                    Sin señal de estructura extrema en este momento.
                  </div>
                )}

                {/* Reasons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <h4 style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Estructura</h4>
                  <ul style={{ paddingLeft: '1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                    {strat2Data.details.slice(0, 4).map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : null}
          </div>

        </div>
      </section>

      {/* HISTORIAL Y RENDIMIENTO DE SEÑALES */}
      <section className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📈 Historial de Rendimiento y Efectividad
            </h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
              Seguimiento y efectividad en tiempo real de las señales autogestionadas por el bot.
            </p>
          </div>
          
          <button 
            onClick={handleClearHistory}
            style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '0.4rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}
            onMouseEnter={e => e.target.style.background = 'rgba(239, 68, 68, 0.1)'}
            onMouseLeave={e => e.target.style.background = 'rgba(239, 68, 68, 0.05)'}
          >
            🗑️ Limpiar Historial
          </button>
        </div>

        {/* Stats metrics widgets */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Tasa de Acierto</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: stats.winRate >= 60 ? 'var(--color-up)' : stats.winRate === 0 ? 'var(--color-text-muted)' : 'var(--color-down)', marginTop: '0.25rem' }}>
              {stats.total > 0 ? `${stats.winRate}%` : '--'}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>Basado en {stats.total} operaciones cerradas</div>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(0, 230, 118, 0.01)', border: '1px solid rgba(0, 230, 118, 0.03)', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-up)', textTransform: 'uppercase', fontWeight: 600 }}>Aciertos (Take Profit)</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-up)', marginTop: '0.25rem' }}>{stats.tpCount}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>Trades finalizados con éxito</div>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(255, 23, 68, 0.01)', border: '1px solid rgba(255, 23, 68, 0.03)', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-down)', textTransform: 'uppercase', fontWeight: 600 }}>Pérdidas (Stop Loss)</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-down)', marginTop: '0.25rem' }}>{stats.slCount}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>Trades finalizados en pérdida</div>
          </div>
        </div>

        {/* Signals History Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'var(--color-text-muted)' }}>
                <th style={{ padding: '0.75rem' }}>Hora</th>
                <th style={{ padding: '0.75rem' }}>Estrategia</th>
                <th style={{ padding: '0.75rem' }}>Operación</th>
                <th style={{ padding: '0.75rem' }}>Entrada</th>
                <th style={{ padding: '0.75rem' }}>Stop Loss</th>
                <th style={{ padding: '0.75rem' }}>Take Profit</th>
                <th style={{ padding: '0.75rem' }}>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {signalsHistory.slice(0, 10).map((sig) => {
                const date = new Date(sig.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                return (
                  <tr key={sig.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', color: '#cbd5e1' }}>
                    <td style={{ padding: '0.75rem' }} className="font-mono">{date}</td>
                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>{sig.strategy}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', background: sig.type === 'LONG' ? 'rgba(0, 230, 118, 0.1)' : 'rgba(255, 23, 68, 0.1)', color: sig.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)', fontWeight: 700, fontSize: '0.75rem' }}>
                        {sig.type}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem' }} className="font-mono">${formatPrice(sig.entry)}</td>
                    <td style={{ padding: '0.75rem', color: 'var(--color-down)' }} className="font-mono">${formatPrice(sig.sl)}</td>
                    <td style={{ padding: '0.75rem', color: 'var(--color-up)' }} className="font-mono">${formatPrice(sig.tp)}</td>
                    <td style={{ padding: '0.75rem' }}>
                      {sig.status === 'PENDING' ? (
                        <span style={{ color: '#eab308', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span className="pulse-yellow bg-yellow-500" style={{ width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block' }}></span>
                          Pendiente
                        </span>
                      ) : sig.status === 'TP' ? (
                        <span style={{ color: 'var(--color-up)', fontWeight: 600 }}>✅ Acierto (TP)</span>
                      ) : (
                        <span style={{ color: 'var(--color-down)', fontWeight: 600 }}>❌ Pérdida (SL)</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {signalsHistory.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    Historial vacío. Esperando la generación de señales...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* SYNCHRONIZATION LOGGER TERMINAL */}
      <section className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', minHeight: '260px' }}>
        <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '0.5rem' }}>
          🖥️ Registro de Sincronización y Acciones
        </h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
          Consola interna de eventos del bot de trading cuantitativo.
        </p>

        <div ref={consoleRef} style={{ flex: 1, background: '#030408', borderRadius: '10px', padding: '0.75rem', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '200px' }}>
          {logs.map((log, index) => {
            let color = 'var(--color-text-muted)';
            if (log.type === 'up') color = 'var(--color-up)';
            if (log.type === 'down') color = 'var(--color-down)';
            if (log.source === 'Sistema') color = '#9333ea';
            if (log.source === 'Red') color = '#2563eb';

            return (
              <div key={index} style={{ lineBreak: 'anywhere' }}>
                <span style={{ color: 'rgba(255,255,255,0.2)' }}>[{log.timestamp}]</span>{' '}
                <span style={{ color: log.source === 'Binance WS' ? '#f0b90b' : log.source === 'Algoritmo' ? '#f59e0b' : '#818cf8', fontWeight: 600 }}>[{log.source}]</span>{' '}
                <span style={{ color }}>{log.message}</span>
              </div>
            );
          })}
        </div>
      </section>

      <footer style={{ marginTop: 'auto', padding: '1.5rem 0 0', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
        <div>Antigravity BTC Quant Terminal v2.0.0</div>
        <div>Análisis fractal & Motor de efectividad local</div>
      </footer>
    </div>
  );
}
