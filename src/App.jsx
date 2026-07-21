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

  // CVD and Liquidations trackers
  const tradesRef = useRef([]);
  const liqsRef = useRef([]);
  const [cvd5m, setCvd5m] = useState(0);
  const [recentLiqs, setRecentLiqs] = useState([]);
  const [liqStats5m, setLiqStats5m] = useState({ longLiqs: 0, shortLiqs: 0 });

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
    // 1. Spot ticker (Price and 24h change)
    const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');
    setConnectionStatus('connecting');

    ws.onopen = () => {
      setConnectionStatus('connected');
      addLog('Red', 'Conectado a Binance WebSockets (Ticker Spot)');
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
      addLog('Red', 'Error en conexión WebSocket Spot');
    };

    // 2. Spot trade stream for CVD
    const wsTrade = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@trade');
    wsTrade.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.q && data.p) {
          const p = parseFloat(data.p);
          const q = parseFloat(data.q);
          const isSell = data.m; // buyer is market maker = aggressive seller
          const delta = q * p * (isSell ? -1 : 1);
          tradesRef.current.push({ timestamp: Date.now(), delta });
        }
      } catch (err) {
        console.error('Error parsing WS trade message:', err);
      }
    };

    // 3. Futures forceOrder stream for Liquidations
    const wsFutures = new WebSocket('wss://fstream.binance.com/ws/btcusdt@forceOrder');
    wsFutures.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.o) {
          const p = parseFloat(data.o.p);
          const q = parseFloat(data.o.q);
          const amount = q * p;
          const side = data.o.S; // BUY or SELL
          const type = side === 'SELL' ? 'LONG' : 'SHORT'; // SELL liquidation is LONG liquidated, BUY liquidation is SHORT liquidated

          const newLiq = {
            id: `${Date.now()}_${Math.random()}`,
            timestamp: Date.now(),
            type,
            amount,
            price: p
          };

          liqsRef.current.push(newLiq);

          // Alert in logs and UI if it is significant (>= $5,000)
          if (amount >= 5000) {
            setRecentLiqs(prev => [newLiq, ...prev].slice(0, 5));
            addLog('Liquidación', `🔥 ${type} liqu. $${Math.round(amount).toLocaleString()} a $${p.toLocaleString()}`, type === 'LONG' ? 'down' : 'up');
          }
        }
      } catch (err) {
        console.error('Error parsing WS forceOrder message:', err);
      }
    };

    return () => {
      ws.close();
      wsTrade.close();
      wsFutures.close();
    };
  }, []);

  // Sliding window calculations for CVD & Liquidations (1-second loop)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const threshold = now - 5 * 60 * 1000; // 5 minutes ago

      // 1. Calculate CVD
      tradesRef.current = tradesRef.current.filter(t => t.timestamp > threshold);
      const sumCVD = tradesRef.current.reduce((acc, t) => acc + t.delta, 0);
      setCvd5m(Math.round(sumCVD));

      // 2. Calculate Liquidations
      liqsRef.current = liqsRef.current.filter(l => l.timestamp > threshold);
      const longsSum = liqsRef.current.filter(l => l.type === 'LONG').reduce((acc, l) => acc + l.amount, 0);
      const shortsSum = liqsRef.current.filter(l => l.type === 'SHORT').reduce((acc, l) => acc + l.amount, 0);
      setLiqStats5m({ longLiqs: Math.round(longsSum), shortLiqs: Math.round(shortsSum) });
    }, 1000);

    return () => clearInterval(interval);
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

      // Compute fresh liquidation stats for Strategy 3 confluences
      const now = Date.now();
      const threshold = now - 5 * 60 * 1000;
      const recentL = liqsRef.current.filter(l => l.timestamp > threshold);
      const longLiqs = Math.round(recentL.filter(l => l.type === 'LONG').reduce((acc, l) => acc + l.amount, 0));
      const shortLiqs = Math.round(recentL.filter(l => l.type === 'SHORT').reduce((acc, l) => acc + l.amount, 0));
      
      const res3 = technicalAnalysisService.runStrategy3(klinesMap, { longLiqs, shortLiqs });

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

  // Calculate Win Rate statistics by strategy
  const getStatsByStrategy = (stratName) => {
    const resolved = signalsHistory.filter(s => s.strategy === stratName && (s.status === 'TP' || s.status === 'SL'));
    if (resolved.length === 0) return { winRate: null, tpCount: 0, slCount: 0, total: 0 };

    const tpCount = resolved.filter(s => s.status === 'TP').length;
    const slCount = resolved.filter(s => s.status === 'SL').length;
    const winRate = Math.round((tpCount / resolved.length) * 100);

    return { winRate, tpCount, slCount, total: resolved.length };
  };

  const stats1 = getStatsByStrategy('Estrategia 1');
  const stats2 = getStatsByStrategy('Estrategia 2');
  const stats3 = getStatsByStrategy('Estrategia 3');

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
          
          {/* Live Liquidations Ticker */}
          {recentLiqs.length > 0 && (
            <div style={{ display: 'flex', gap: '0.75rem', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#cbd5e1', padding: '0.35rem 0.65rem', background: 'rgba(0,0,0,0.15)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.02)', marginTop: '0.75rem', alignItems: 'center', maxWidth: '500px' }}>
              <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.05em' }}>⚡ RECIENTES:</span>
              <div style={{ display: 'flex', gap: '1rem', overflow: 'hidden' }}>
                {recentLiqs.slice(0, 3).map((l) => (
                  <span key={l.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span style={{ color: l.type === 'LONG' ? 'var(--color-down)' : 'var(--color-up)', fontWeight: 700 }}>{l.type}</span>
                    <span>${Math.round(l.amount).toLocaleString()}</span>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>a ${l.price.toLocaleString()}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Connection status and live price overview */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          
          {/* Live Price Widget */}
          <div className={`glass-panel ${priceFlash ? `flash-${priceFlash}` : ''}`} style={{ padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '160px', transition: 'all 0.3s ease' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Precio BTC/USDT</span>
            <span className="font-mono" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', margin: '0.15rem 0' }}>
              {btcPrice ? `$${formatPrice(btcPrice)}` : 'Cargando...'}
            </span>
            {btcChange24h !== null && (
              <span style={{ fontSize: '0.8rem', color: btcChange24h >= 0 ? 'var(--color-up)' : 'var(--color-down)', fontWeight: 700 }}>
                {btcChange24h >= 0 ? '▲' : '▼'} {Math.abs(btcChange24h).toFixed(2)}%
              </span>
            )}
          </div>

          {/* CVD (5m) Widget */}
          <div className="glass-panel" style={{ padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '150px' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>CVD Delta (5m)</span>
            <span className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: cvd5m >= 0 ? 'var(--color-up)' : 'var(--color-down)', margin: '0.15rem 0' }}>
              {cvd5m >= 0 ? '+' : ''}{cvd5m.toLocaleString('en-US')}
            </span>
            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Fuerza Compra/Venta</span>
          </div>

          {/* Liquidations (5m) Widget */}
          <div className="glass-panel" style={{ padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '170px' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Liquidado (5m)</span>
            <span className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: '0.15rem 0' }}>
              <span style={{ color: 'var(--color-down)' }}>${Math.round(liqStats5m.longLiqs / 1000)}k L</span>
              {' / '}
              <span style={{ color: 'var(--color-up)' }}>${Math.round(liqStats5m.shortLiqs / 1000)}k S</span>
            </span>
            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Futuros Binance</span>
          </div>

          {/* Connection status dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1.25rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--glass-border)', height: '100%' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', background: connectionStatus === 'connected' ? 'var(--color-up)' : connectionStatus === 'connecting' ? '#eab308' : 'var(--color-down)' }}></span>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Binance WS</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{connectionStatus === 'connected' ? 'OK' : connectionStatus === 'connecting' ? 'SYNC' : 'DOWN'}</div>
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

        {/* GRID CONTENEDOR DE LAS 3 ESTRATEGIAS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          
          {/* ESTRATEGIA 1: CONFLUENCIA MULTIFACTORIAL */}
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-primary)', fontWeight: 700, letterSpacing: '0.05em' }}>
                  Estrategia 1 {stats1.winRate !== null ? `• WR: ${stats1.winRate}%` : '• WR: --'}
                </span>
                <h3 style={{ fontSize: '1.15rem', color: '#fff', marginTop: '0.15rem' }}>⚡ Confluencia Rápida (15m)</h3>
              </div>
              {strat1Data && (
                <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '6px', background: strat1Data.bias.includes('ALCISTA') ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)', color: strat1Data.bias.includes('ALCISTA') ? 'var(--color-up)' : 'var(--color-down)' }}>
                  {strat1Data.bias.split(' ')[0]}
                </span>
              )}
            </div>

            {analysisLoading ? (
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>Cargando indicadores...</div>
            ) : strat1Data ? (
              <>
                {/* Probabilities progress bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                      <div>Entrada: ${formatPrice(strat1Data.signal.entry)}</div>
                      <div style={{ color: 'var(--color-down)' }}>Stop Loss: ${formatPrice(strat1Data.signal.sl)} (-{strat1Data.signal.riskPercent}%)</div>
                      <div style={{ color: 'var(--color-up)' }}>Take Profit: ${formatPrice(strat1Data.signal.tp)} (+{strat1Data.signal.profitPercent}%)</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                    Sin señal activa en este momento.
                  </div>
                )}

                {/* Reasons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <h4 style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Señales detectadas</h4>
                  <ul style={{ paddingLeft: '1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                    {strat1Data.reasons.slice(0, 3).map((r, i) => (
                      <li key={i} style={{ lineBreak: 'anywhere' }}>{r}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : null}
          </div>

          {/* ESTRATEGIA 2: PRO TRADER (EMA FRACTAL) */}
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#10b981', fontWeight: 700, letterSpacing: '0.05em' }}>
                  Estrategia 2 {stats2.winRate !== null ? `• WR: ${stats2.winRate}%` : '• WR: --'}
                </span>
                <h3 style={{ fontSize: '1.15rem', color: '#fff', marginTop: '0.15rem' }}>💎 Pro Trader (EMAs + RSI 7)</h3>
              </div>
              {strat2Data && (
                <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '6px', background: strat2Data.bias.includes('COMPRA') || strat2Data.bias.includes('COMPRADOR') ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)', color: strat2Data.bias.includes('COMPRA') || strat2Data.bias.includes('COMPRADOR') ? 'var(--color-up)' : 'var(--color-down)' }}>
                  {strat2Data.bias.split(' ')[0]}
                </span>
              )}
            </div>

            {analysisLoading ? (
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>Cargando análisis...</div>
            ) : strat2Data ? (
              <>
                {/* Probabilities progress bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                      <div>Entrada: ${formatPrice(strat2Data.signal.entry)}</div>
                      <div style={{ color: 'var(--color-down)' }}>Stop Loss: ${formatPrice(strat2Data.signal.sl)} (-{strat2Data.signal.riskPercent}%)</div>
                      <div style={{ color: 'var(--color-up)' }}>Take Profit: ${formatPrice(strat2Data.signal.tp)} (+{strat2Data.signal.profitPercent}%)</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                    Sin señal activa en este momento.
                  </div>
                )}

                {/* Reasons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <h4 style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Estructura</h4>
                  <ul style={{ paddingLeft: '1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                    {strat2Data.details.slice(0, 3).map((d, i) => (
                      <li key={i} style={{ lineBreak: 'anywhere' }}>{d}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : null}
          </div>

          {/* ESTRATEGIA 3: ALTA PROBABILIDAD (BARRIDAS DE LIQUIDEZ) */}
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#f59e0b', fontWeight: 700, letterSpacing: '0.05em' }}>
                  Estrategia 3 {stats3.winRate !== null ? `• WR: ${stats3.winRate}%` : '• WR: --'}
                </span>
                <h3 style={{ fontSize: '1.15rem', color: '#fff', marginTop: '0.15rem' }}>🚨 Barridas de Liquidez (15m)</h3>
              </div>
              {strat3Data && (
                <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '6px', background: strat3Data.macroBias === 'ALCISTA' ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)', color: strat3Data.macroBias === 'ALCISTA' ? 'var(--color-up)' : 'var(--color-down)' }}>
                  {strat3Data.macroBias}
                </span>
              )}
            </div>

            {analysisLoading ? (
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>Cargando análisis...</div>
            ) : strat3Data ? (
              <>
                {/* Macro bias progress bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>SESGO MACRO (1H):</span>
                    <span style={{ color: strat3Data.macroBias === 'ALCISTA' ? 'var(--color-up)' : 'var(--color-down)' }}>
                      {strat3Data.macroBias === 'ALCISTA' ? 'COMPRAS (LONG)' : 'VENTAS (SHORT)'}
                    </span>
                  </div>
                  <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '99px', overflow: 'hidden', display: 'flex' }}>
                    <div style={{ width: strat3Data.macroBias === 'ALCISTA' ? '100%' : '0%', background: 'var(--color-up)', transition: 'width 0.5s ease' }} />
                    <div style={{ width: strat3Data.macroBias === 'BAJISTA' ? '100%' : '0%', background: 'var(--color-down)', transition: 'width 0.5s ease' }} />
                  </div>
                </div>

                {/* Strategy 3 Active Signal */}
                {strat3Data.hasSignal ? (
                  <div style={{ padding: '0.85rem', borderRadius: '10px', background: strat3Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.05)' : 'rgba(255,23,68,0.05)', border: `1px solid ${strat3Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: strat3Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)' }}>SEÑAL {strat3Data.signal.type} ({'⭐'.repeat(strat3Data.signal.stars)})</div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#fff' }}>{strat3Data.signal.probability}%</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                      <div>Entrada: ${formatPrice(strat3Data.signal.entry)}</div>
                      <div style={{ color: 'var(--color-down)' }}>Stop Loss: ${formatPrice(strat3Data.signal.sl)} (-{strat3Data.signal.riskPercent}%)</div>
                      <div style={{ color: 'var(--color-up)' }}>Take Profit: ${formatPrice(strat3Data.signal.tp)} (+{strat3Data.signal.profitPercent}%)</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                    <span className="pulse-yellow bg-yellow-500" style={{ width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block' }}></span>
                    Buscando barridas...
                  </div>
                )}

                {/* Reasons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <h4 style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Argumentación</h4>
                  <ul style={{ paddingLeft: '1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                    {strat3Data.hasSignal ? (
                      strat3Data.signal.reasons.slice(0, 3).map((r, i) => (
                        <li key={i} style={{ lineBreak: 'anywhere' }}>{r}</li>
                      ))
                    ) : (
                      <li style={{ listStyleType: 'none', marginLeft: '-1.0rem', color: 'var(--color-text-muted)' }}>Esperando confluencia institucional...</li>
                    )}
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

        {/* Stats metrics widgets grouped by Strategy */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          
          {/* Stats Estrategia 1 */}
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-primary)', textTransform: 'uppercase', fontWeight: 700 }}>Estrategia 1 (Confluencia)</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.25rem' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: stats1.winRate !== null ? (stats1.winRate >= 60 ? 'var(--color-up)' : 'var(--color-down)') : 'var(--color-text-muted)' }}>
                {stats1.winRate !== null ? `${stats1.winRate}%` : '--'}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                {stats1.tpCount} TP / {stats1.slCount} SL
              </span>
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{stats1.total} señales resueltas</div>
          </div>

          {/* Stats Estrategia 2 */}
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ fontSize: '0.7rem', color: '#10b981', textTransform: 'uppercase', fontWeight: 700 }}>Estrategia 2 (Pro Trader)</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.25rem' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: stats2.winRate !== null ? (stats2.winRate >= 60 ? 'var(--color-up)' : 'var(--color-down)') : 'var(--color-text-muted)' }}>
                {stats2.winRate !== null ? `${stats2.winRate}%` : '--'}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                {stats2.tpCount} TP / {stats2.slCount} SL
              </span>
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{stats2.total} señales resueltas</div>
          </div>

          {/* Stats Estrategia 3 */}
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ fontSize: '0.7rem', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 700 }}>Estrategia 3 (Barridas)</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.25rem' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: stats3.winRate !== null ? (stats3.winRate >= 60 ? 'var(--color-up)' : 'var(--color-down)') : 'var(--color-text-muted)' }}>
                {stats3.winRate !== null ? `${stats3.winRate}%` : '--'}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                {stats3.tpCount} TP / {stats3.slCount} SL
              </span>
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{stats3.total} señales resueltas</div>
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
