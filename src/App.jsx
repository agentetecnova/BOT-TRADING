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
  const priceHistoryRef = useRef([]);
  const futuresStatusRef = useRef('connecting');
  const [cvd5m, setCvd5m] = useState(0);
  const [recentLiqs, setRecentLiqs] = useState([]);
  const [liqStats5m, setLiqStats5m] = useState({ longLiqs: 0, shortLiqs: 0 });
  const [futuresStatus, setFuturesStatus] = useState('connecting');

  const updateFuturesStatus = (status) => {
    setFuturesStatus(status);
    futuresStatusRef.current = status;
  };

  // Technical Analysis states
  const [activeTab, setActiveTab] = useState('core'); // 'core' | 'advanced' | 'institutional'
  const [strat1Data, setStrat1Data] = useState(null);
  const [strat2Data, setStrat2Data] = useState(null);
  const [strat3Data, setStrat3Data] = useState(null);
  const [strat4Data, setStrat4Data] = useState(null);
  const [strat5Data, setStrat5Data] = useState(null);
  const [strat6Data, setStrat6Data] = useState(null);
  const [strat7Data, setStrat7Data] = useState(null);
  const [strat8Data, setStrat8Data] = useState(null);
  const [strat9Data, setStrat9Data] = useState(null);
  const [strat10Data, setStrat10Data] = useState(null);
  const [strat11Data, setStrat11Data] = useState(null);
  const [strat12Data, setStrat12Data] = useState(null);
  const [strat13Data, setStrat13Data] = useState(null);
  const [masterConsensusData, setMasterConsensusData] = useState(null);
  const [renderServerStatus, setRenderServerStatus] = useState('syncing'); // 'connected' | 'syncing' | 'local'
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [analysisError, setAnalysisError] = useState(null);

  // Signals History state
  const [signalsHistory, setSignalsHistory] = useState([]);
  const [selectedStratFilter, setSelectedStratFilter] = useState('ALL');

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

  // Poll Render 24/7 API for background signals and server state
  useEffect(() => {
    const fetchRenderSignals = async () => {
      try {
        const renderUrl = 'https://bot-trading-2.onrender.com/api/signals';
        const res = await fetch(renderUrl, { cache: 'no-cache' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.history && Array.isArray(data.history) && data.history.length > 0) {
            setSignalsHistory(prev => {
              const ids = new Set(data.history.map(s => s.id));
              const localOnly = prev.filter(s => !ids.has(s.id));
              const merged = [...data.history, ...localOnly].sort((a, b) => b.timestamp - a.timestamp);
              localStorage.setItem('btc_signals_history', JSON.stringify(merged));
              return merged;
            });
          }
          if (data && data.masterConsensus) {
            setMasterConsensusData(data.masterConsensus);
          }
          setRenderServerStatus('connected');
        }
      } catch (err) {
        setRenderServerStatus('local');
      }
    };

    fetchRenderSignals();
    const interval = setInterval(fetchRenderSignals, 15000);
    return () => clearInterval(interval);
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
            priceHistoryRef.current.push({ timestamp: Date.now(), price: newPrice });
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

          // Fallback simulation for liquidations if Binance Futures WS is blocked/failed/disconnected
          if (futuresStatusRef.current !== 'connected') {
            const tradeAmount = q * p;
            let prob = 0;
            if (tradeAmount > 80000) prob = 0.85;
            else if (tradeAmount > 40000) prob = 0.40;
            else if (tradeAmount > 20000) prob = 0.15;

            if (prob > 0 && Math.random() < prob) {
              const type = isSell ? 'LONG' : 'SHORT'; // selling pressure = LONG liquidation, buying pressure = SHORT liquidation
              const amount = tradeAmount * (0.4 + Math.random() * 0.8);
              
              const newLiq = {
                id: `sim_${Date.now()}_${Math.random()}`,
                timestamp: Date.now(),
                type,
                amount,
                price: p,
                isSimulated: true
              };

              liqsRef.current.push(newLiq);

              if (amount >= 5000) {
                setRecentLiqs(prev => [newLiq, ...prev].slice(0, 5));
                addLog('Liquidación (Sim)', `🔥 ${type} liqu. $${Math.round(amount).toLocaleString()} a $${p.toLocaleString()} (Simulado)`, type === 'LONG' ? 'down' : 'up');
              }
            }
          }
        }
      } catch (err) {
        console.error('Error parsing WS trade message:', err);
      }
    };

    // 3. Futures forceOrder stream for Liquidations (using updated April 2026 Binance endpoint)
    const wsFutures = new WebSocket('wss://fstream.binance.com/market/ws/btcusdt@forceOrder');
    
    wsFutures.onopen = () => {
      updateFuturesStatus('connected');
      addLog('Red', 'Conectado a Binance WebSockets (Liquidaciones Futuros)');
    };

    wsFutures.onerror = () => {
      updateFuturesStatus('failed');
      addLog('Red', 'Error en conexión WebSocket Futuros');
    };

    wsFutures.onclose = () => {
      updateFuturesStatus('disconnected');
    };

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

      // 3. Prune price history
      priceHistoryRef.current = priceHistoryRef.current.filter(p => p.timestamp > threshold);
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
      const [k5m, k15m, k1h, k4h, k1d, k1w] = await Promise.all([
        technicalAnalysisService.fetchKlines('BTCUSDT', '5m', 1000),
        technicalAnalysisService.fetchKlines('BTCUSDT', '15m', 1000),
        technicalAnalysisService.fetchKlines('BTCUSDT', '1h', 1000),
        technicalAnalysisService.fetchKlines('BTCUSDT', '4h', 1000),
        technicalAnalysisService.fetchKlines('BTCUSDT', '1d', 100),
        technicalAnalysisService.fetchKlines('BTCUSDT', '1w', 50)
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

      // Run Strategy 4: Squeeze & Trend (Macro/Micro)
      const res4 = technicalAnalysisService.runStrategy4(k1w, k1d);

      // Run Advanced Quantitative Strategies (Strategies 5, 6, 7)
      const res5 = technicalAnalysisService.runStrategy5(k1h);
      const res6 = technicalAnalysisService.runStrategy6(k15m);
      const res7 = technicalAnalysisService.runStrategy7(k1h);

      // Run Institutional Strategies (Strategies 8, 9, 10)
      const res8 = technicalAnalysisService.runStrategy8(k1h);
      const res9 = technicalAnalysisService.runStrategy9(k4h);
      const res10 = technicalAnalysisService.runStrategy10(k1h);

      // Run Scalping & Micro-Structure Strategies (Strategies 11, 12, 13)
      const res11 = technicalAnalysisService.runStrategy11(k5m, cvd5m);
      const res12 = technicalAnalysisService.runStrategy12(k5m);
      const res13 = technicalAnalysisService.runStrategy13(k15m);

      setStrat1Data(res1);
      setStrat2Data(res2);
      setStrat3Data(res3);
      setStrat4Data(res4);
      setStrat5Data(res5);
      setStrat6Data(res6);
      setStrat7Data(res7);
      setStrat8Data(res8);
      setStrat9Data(res9);
      setStrat10Data(res10);
      setStrat11Data(res11);
      setStrat12Data(res12);
      setStrat13Data(res13);
      setAnalysisError(null);

      const resultsMap = {
        'Estrategia 1': res1,
        'Estrategia 2': res2,
        'Estrategia 3': res3,
        'Estrategia 4': res4,
        'Estrategia 5': res5,
        'Estrategia 6': res6,
        'Estrategia 7': res7,
        'Estrategia 8': res8,
        'Estrategia 9': res9,
        'Estrategia 10': res10,
        'Estrategia 11': res11,
        'Estrategia 12': res12,
        'Estrategia 13': res13,
      };

      // Calcular Consenso Maestro de forma transparente e independiente
      const masterConsensus = technicalAnalysisService.calculateMasterConsensus(resultsMap);
      setMasterConsensusData(masterConsensus);

      // 1. Reevaluar y procesar invalidaciones prematuras de señales activas
      processSignalInvalidations(resultsMap);

      // 2. Procesar nuevas señales
      Object.entries(resultsMap).forEach(([stratName, res]) => {
        addNewSignal(stratName, res);
      });

    } catch (err) {
      console.error('Error running technical analysis:', err);
      addLog('Red', `Error en análisis de BTC: ${err.message || 'Error de conexión'}`, 'down');
      setAnalysisError(`Error al actualizar el análisis de BTC: ${err.message || 'Sin respuesta del servidor'}`);
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

  // Process early signal invalidation if strategy calculations flip or break hypothesis
  const processSignalInvalidations = (resultsMap) => {
    setSignalsHistory(prev => {
      let updated = false;
      const next = prev.map(sig => {
        if (sig.status !== 'PENDING') return sig;

        const freshRes = resultsMap[sig.strategy];
        if (!freshRes) return sig;

        const check = technicalAnalysisService.checkSignalInvalidation(sig, freshRes, btcPrice);
        if (check.isInvalidated) {
          updated = true;
          const currentExitPrice = btcPrice || sig.entry;
          addLog('Algoritmo', `⚠️ Señal ${sig.type} de ${sig.strategy} INVALIDADA PRECOZMENTE a $${formatPrice(currentExitPrice)}. Motivo: ${check.reason}`, 'down');
          return {
            ...sig,
            status: 'INVALIDATED',
            resolvedAt: Date.now(),
            exitPrice: currentExitPrice,
            invalidationReason: check.reason
          };
        }
        return sig;
      });

      if (updated) {
        localStorage.setItem('btc_signals_history', JSON.stringify(next));
      }
      return next;
    });
  };

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
    const invalidatedCount = signalsHistory.filter(s => s.strategy === stratName && s.status === 'INVALIDATED').length;
    if (resolved.length === 0) return { winRate: null, tpCount: 0, slCount: 0, total: 0, invalidatedCount };

    const tpCount = resolved.filter(s => s.status === 'TP').length;
    const slCount = resolved.filter(s => s.status === 'SL').length;
    const winRate = Math.round((tpCount / resolved.length) * 100);

    return { winRate, tpCount, slCount, total: resolved.length, invalidatedCount };
  };

  const stats1 = getStatsByStrategy('Estrategia 1');
  const stats2 = getStatsByStrategy('Estrategia 2');
  const stats3 = getStatsByStrategy('Estrategia 3');
  const stats4 = getStatsByStrategy('Estrategia 4');
  const stats5 = getStatsByStrategy('Estrategia 5');
  const stats6 = getStatsByStrategy('Estrategia 6');
  const stats7 = getStatsByStrategy('Estrategia 7');
  const stats8 = getStatsByStrategy('Estrategia 8');
  const stats9 = getStatsByStrategy('Estrategia 9');
  const stats10 = getStatsByStrategy('Estrategia 10');
  const stats11 = getStatsByStrategy('Estrategia 11');
  const stats12 = getStatsByStrategy('Estrategia 12');
  const stats13 = getStatsByStrategy('Estrategia 13');

  // Helper to render status badges cleanly
  const renderSignalStatusBadge = (sig) => {
    if (sig.status === 'PENDING') {
      return (
        <span style={{ color: '#eab308', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span className="pulse-yellow bg-yellow-500" style={{ width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block' }}></span>
          Pendiente
        </span>
      );
    }
    if (sig.status === 'TP') {
      return <span style={{ color: 'var(--color-up)', fontWeight: 600 }}>✅ Acierto (TP)</span>;
    }
    if (sig.status === 'INVALIDATED') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            ⚠️ INVALIDADA <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>(Salida Precoz)</span>
          </span>
          {sig.invalidationReason && (
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', maxWidth: '240px', lineHeight: 1.25 }}>
              {sig.invalidationReason}
            </span>
          )}
        </div>
      );
    }
    return <span style={{ color: 'var(--color-down)', fontWeight: 600 }}>❌ Pérdida (SL)</span>;
  };

  // Calculate rolling CVD divergence situation
  const getCvdStatus = () => {
    if (!btcPrice) return { label: '⚪ Iniciando...', color: 'var(--color-text-muted)' };
    
    const now = Date.now();
    const threshold = now - 5 * 60 * 1000; // 5 minutes ago
    
    const pricePoints = priceHistoryRef.current.filter(p => p.timestamp >= threshold);
    const oldestPoint = pricePoints[0];
    const price5mAgo = oldestPoint ? oldestPoint.price : btcPrice;
    
    const priceDiffPercent = ((btcPrice - price5mAgo) / price5mAgo) * 100;
    
    // Thresholds
    const cvdThreshold = 10000; // $10k USD volume delta
    const priceThreshold = 0.05; // 0.05% price change
    
    if (Math.abs(cvd5m) < cvdThreshold) {
      return { label: '⚪ Flujo Neutral', color: 'var(--color-text-muted)' };
    }
    
    if (cvd5m >= cvdThreshold) {
      if (priceDiffPercent < -priceThreshold) {
        return { label: '⚡ Divergencia Alcista', color: 'var(--color-up)' };
      }
      if (priceDiffPercent > priceThreshold) {
        return { label: '🟢 Presión Alcista', color: 'var(--color-up)' };
      }
      return { label: '🟢 Acumulación Pasiva', color: 'var(--color-up)' };
    } else { // cvd5m <= -cvdThreshold
      if (priceDiffPercent > priceThreshold) {
        return { label: '⚠️ Divergencia Bajista', color: 'var(--color-down)' };
      }
      if (priceDiffPercent < -priceThreshold) {
        return { label: '🔴 Presión Bajista', color: 'var(--color-down)' };
      }
      return { label: '🔴 Distribución Pasiva', color: 'var(--color-down)' };
    }
  };

  const cvdStatus = getCvdStatus();

  return (
    <div className="app-container">
      
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
            <div style={{ display: 'flex', gap: '0.75rem', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#cbd5e1', padding: '0.35rem 0.65rem', background: 'rgba(0,0,0,0.15)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.02)', marginTop: '0.75rem', alignItems: 'center', maxWidth: '100%' }}>
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
        <div className="header-widgets">
          
          {/* Live Price Widget */}
          <div className={`glass-panel header-widget-item ${priceFlash ? `flash-${priceFlash}` : ''}`} style={{ padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'all 0.3s ease' }}>
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
          <div className="glass-panel header-widget-item" style={{ padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>CVD Delta (5m)</span>
            <span className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: cvd5m >= 0 ? 'var(--color-up)' : 'var(--color-down)', margin: '0.15rem 0' }}>
              {cvd5m >= 0 ? '+' : ''}{cvd5m.toLocaleString('en-US')}
            </span>
            <span style={{ fontSize: '0.75rem', color: cvdStatus.color, fontWeight: 700 }}>{cvdStatus.label}</span>
            <span style={{ fontSize: '0.82rem', color: '#cbd5e1', marginTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '0.4rem', lineHeight: '1.35' }}>
              Mide la diferencia acumulada entre compras y ventas a mercado. Una divergencia alcista (CVD sube pero precio no) anticipa rebotes; una divergencia bajista (CVD baja pero precio no) anticipa correcciones.
            </span>
          </div>

          {/* Liquidations (5m) Widget */}
          <div className="glass-panel header-widget-item" style={{ padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Liquidado (5m)</span>
            
            <span className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: '0.15rem 0' }}>
              <span style={{ color: 'var(--color-down)' }}>${Math.round(liqStats5m.longLiqs / 1000)}k L</span>
              {' / '}
              <span style={{ color: 'var(--color-up)' }}>${Math.round(liqStats5m.shortLiqs / 1000)}k S</span>
            </span>

            {futuresStatus === 'failed' ? (
              <span style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 700, display: 'block', margin: '0.2rem 0' }}>
                ⚠️ ISP Bloqueado (Simulado)
              </span>
            ) : (
              <span style={{ fontSize: '0.65rem', color: 'var(--color-up)', fontWeight: 700, display: 'block', margin: '0.2rem 0' }}>
                🟢 Conexión Directa WS
              </span>
            )}

            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '0.4rem', lineHeight: '1.2' }}>
              Volumen de traders liquidados. Liquidar LONGs frena caídas; liquidar SHORTs impulsa subidas.
            </span>
          </div>

          {/* Connection status dot */}
          <div className="header-widget-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '0.75rem 1.25rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--glass-border)', height: '100%' }}>
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

      {/* VOLATILITY SQUEEZE WARNING BANNER */}
      {strat4Data && strat4Data.isSqueeze && (
        <div style={{ padding: '1rem', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#f59e0b', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🔥 COMPRESIÓN DE VOLATILIDAD (Bollinger Squeeze): Ancho de bandas {(strat4Data.bbw * 100).toFixed(2)}%. Gran movimiento inminente en los próximos días. Filtro macro semanal: {strat4Data.pUp > strat4Data.pDown ? 'ALCISTA (LONG)' : 'BAJISTA (SHORT)'}.
        </div>
      )}

      {/* ⭐ PANEL DE RESUMEN: SEÑAL MAESTRA POR CONSENSO (INDEPENDIENTE) */}
      <div className="glass-panel" style={{
        padding: '1.25rem 1.5rem',
        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.04) 0%, rgba(15, 23, 42, 0.65) 100%)',
        border: '1px solid rgba(245, 158, 11, 0.25)',
        borderRadius: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.2rem' }}>⭐</span>
              <h2 style={{ fontSize: '1.15rem', color: '#fff', margin: 0, fontWeight: 700 }}>
                Resumen de Consenso Institucional & Señal Maestra
              </h2>
              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.3)', fontWeight: 600 }}>
                Módulo Independiente
              </span>
            </div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
              Evaluación agregada de confluencia entre las 13 estrategias sin alterar los algoritmos individuales.
            </p>
          </div>

          {/* Render Server status pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: renderServerStatus === 'connected' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', padding: '0.35rem 0.75rem', borderRadius: '20px', border: `1px solid ${renderServerStatus === 'connected' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`, fontSize: '0.75rem', fontWeight: 600, color: renderServerStatus === 'connected' ? '#10b981' : '#f59e0b' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: renderServerStatus === 'connected' ? '#10b981' : '#f59e0b', display: 'inline-block' }}></span>
            {renderServerStatus === 'connected' ? '🟢 Servidor 24/7 Conectado (Render)' : '🟡 Servidor 24/7 Sincronizando...'}
          </div>
        </div>

        {masterConsensusData ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'center' }}>
            {/* Consenso Direccional */}
            <div style={{ padding: '0.9rem', background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '12px' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Sesgo Global Agregado</span>
              <div style={{ fontSize: '1rem', fontWeight: 800, marginTop: '0.2rem', color: masterConsensusData.masterSignal ? (masterConsensusData.masterSignal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)') : '#cbd5e1' }}>
                {masterConsensusData.bias}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                Probabilidad promedio: <strong style={{ color: '#fff' }}>{masterConsensusData.avgPUp}% Alcista</strong> / {masterConsensusData.avgPDown}% Bajista
              </div>
            </div>

            {/* Votación de Estrategias */}
            <div style={{ padding: '0.9rem', background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '12px' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Votación de Estrategias</span>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.3rem' }}>
                <span style={{ color: 'var(--color-up)', fontWeight: 800, fontSize: '1.1rem' }}>
                  🟢 {masterConsensusData.longVotes} LONG
                </span>
                <span style={{ color: 'var(--color-down)', fontWeight: 800, fontSize: '1.1rem' }}>
                  🔴 {masterConsensusData.shortVotes} SHORT
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                Convicción: <strong style={{ color: '#f59e0b' }}>{masterConsensusData.conviction}</strong>
              </div>
            </div>

            {/* Estado de la Señal Maestra */}
            <div style={{ padding: '0.9rem', background: masterConsensusData.hasConsensus ? (masterConsensusData.masterSignal && masterConsensusData.masterSignal.type === 'LONG' ? 'rgba(0, 230, 118, 0.05)' : 'rgba(255, 23, 68, 0.05)') : 'rgba(255,255,255,0.015)', border: `1px solid ${masterConsensusData.hasConsensus ? (masterConsensusData.masterSignal && masterConsensusData.masterSignal.type === 'LONG' ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 23, 68, 0.2)') : 'rgba(255,255,255,0.03)'}`, borderRadius: '12px' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Señal Maestra de Alta Confluencia</span>
              {masterConsensusData.hasConsensus && masterConsensusData.masterSignal ? (
                <div style={{ marginTop: '0.2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', background: masterConsensusData.masterSignal.type === 'LONG' ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 23, 68, 0.2)', color: masterConsensusData.masterSignal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)', fontWeight: 800, fontSize: '0.9rem' }}>
                      {masterConsensusData.masterSignal.type} MASTER
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                      {masterConsensusData.masterSignal.agreeingCount} Estrategias en Confluencia
                    </span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.3rem' }}>
                    Alineadas: {masterConsensusData.masterSignal.agreeingStrategies.join(', ')}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.3rem' }}>
                  ⚪ Esperando confluencia de 3+ estrategias en 2+ familias distintas...
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Cargando análisis de consenso...</div>
        )}
      </div>

      {/* TAB SYSTEM NAV SELECTOR */}
      <div className="tab-switcher">
        <button 
          onClick={() => setActiveTab('core')}
          className="tab-button"
          style={{
            background: activeTab === 'core' ? 'rgba(245, 158, 11, 0.08)' : 'transparent',
            border: '1px solid',
            borderColor: activeTab === 'core' ? '#f59e0b' : 'rgba(255,255,255,0.05)',
            color: activeTab === 'core' ? '#fff' : 'var(--color-text-muted)',
            padding: '0.6rem 1.2rem',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
            transition: 'all 0.3s ease'
          }}
        >
          🛸 Algoritmos Core (E1 - E4)
        </button>
        <button 
          onClick={() => setActiveTab('advanced')}
          className="tab-button"
          style={{
            background: activeTab === 'advanced' ? 'rgba(168, 85, 247, 0.08)' : 'transparent',
            border: '1px solid',
            borderColor: activeTab === 'advanced' ? '#a855f7' : 'rgba(255,255,255,0.05)',
            color: activeTab === 'advanced' ? '#fff' : 'var(--color-text-muted)',
            padding: '0.6rem 1.2rem',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
            transition: 'all 0.3s ease'
          }}
        >
          🧠 Cuantitativo Avanzado (E5 - E7)
        </button>
        <button 
          onClick={() => setActiveTab('institutional')}
          className="tab-button"
          style={{
            background: activeTab === 'institutional' ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
            border: '1px solid',
            borderColor: activeTab === 'institutional' ? '#10b981' : 'rgba(255,255,255,0.05)',
            color: activeTab === 'institutional' ? '#fff' : 'var(--color-text-muted)',
            padding: '0.6rem 1.2rem',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
            transition: 'all 0.3s ease'
          }}
        >
          🏛️ Modelos Institucionales (E8 - E10)
        </button>
        <button 
          onClick={() => setActiveTab('scalping')}
          className="tab-button"
          style={{
            background: activeTab === 'scalping' ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
            border: '1px solid',
            borderColor: activeTab === 'scalping' ? '#ef4444' : 'rgba(255,255,255,0.05)',
            color: activeTab === 'scalping' ? '#fff' : 'var(--color-text-muted)',
            padding: '0.6rem 1.2rem',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
            transition: 'all 0.3s ease'
          }}
        >
          ⚡ Scalping Corto Plazo (E11 - E13)
        </button>
      </div>

      {activeTab === 'core' ? (
        <section className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Section Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.4rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                🧠 Modelos Predictivos en Tiempo Real
              </h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                Cuatro algoritmos independientes analizando el flujo de BTC de manera paralela.
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

          {/* GRID CONTENEDOR DE LAS 4 ESTRATEGIAS */}
          <div className="strategy-grid">
            
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

            {/* ESTRATEGIA 4: SQUEEZE & TREND (VOLATILIDAD + BANDA SEMANALES) */}
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#a855f7', fontWeight: 700, letterSpacing: '0.05em' }}>
                    Estrategia 4 {stats4.winRate !== null ? `• WR: ${stats4.winRate}%` : '• WR: --'}
                  </span>
                  <h3 style={{ fontSize: '1.15rem', color: '#fff', marginTop: '0.15rem' }}>🌀 Squeeze & Trend (1D + 1W)</h3>
                </div>
                {strat4Data && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '6px', background: strat4Data.bias.includes('ALCISTA') ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)', color: strat4Data.bias.includes('ALCISTA') ? 'var(--color-up)' : 'var(--color-down)' }}>
                    {strat4Data.bias.split(' ')[0]}
                  </span>
                )}
              </div>

              {analysisLoading ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>Cargando análisis...</div>
              ) : strat4Data ? (
                <>
                  {/* Volatility compression indicator */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>COMPRESIÓN DIARIA (BBW):</span>
                      <span style={{ color: strat4Data.isSqueeze ? '#f59e0b' : 'var(--color-text-muted)', fontWeight: 700 }}>
                        {(strat4Data.bbw * 100).toFixed(2)}% {strat4Data.isSqueeze ? '🔥 Squeeze' : 'Normal'}
                      </span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '99px', overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${Math.min(100, Math.max(5, (1 - strat4Data.bbw) * 100))}%`, background: strat4Data.isSqueeze ? '#f59e0b' : 'var(--color-primary)', transition: 'width 0.5s ease' }} />
                    </div>
                  </div>

                  {/* Strategy 4 Active Signal */}
                  {strat4Data.hasSignal ? (
                    <div style={{ padding: '0.85rem', borderRadius: '10px', background: strat4Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.05)' : 'rgba(255,23,68,0.05)', border: `1px solid ${strat4Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: strat4Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)' }}>RUPTURA: {strat4Data.signal.type}</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#fff' }}>R:R 1:3</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        <div>Entrada: ${formatPrice(strat4Data.signal.entry)}</div>
                        <div style={{ color: 'var(--color-down)' }}>Stop Loss: ${formatPrice(strat4Data.signal.sl)} (-{strat4Data.signal.riskPercent}%)</div>
                        <div style={{ color: 'var(--color-up)' }}>Take Profit: ${formatPrice(strat4Data.signal.tp)} (+{strat4Data.signal.profitPercent}%)</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                      <span className="pulse-yellow bg-yellow-500" style={{ width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block' }}></span>
                      {strat4Data.isSqueeze ? 'Monitoreando ruptura...' : 'Esperando compresión...'}
                    </div>
                  )}

                  {/* Reasons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <h4 style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Diagnóstico Técnico</h4>
                    <ul style={{ paddingLeft: '1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                      {strat4Data.reasons.map((r, i) => (
                        <li key={i} style={{ lineBreak: 'anywhere' }}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </div>

          </div>
        </section>
      ) : activeTab === 'advanced' ? (
        <section className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Section Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.4rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                🧠 Modelos Predictivos Avanzados (Quant)
              </h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                Tres algoritmos avanzados cuantitativos con filtros defensivos de alta precisión.
              </p>
            </div>
            {analysisLoading ? (
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="pulse-yellow bg-yellow-500" style={{ width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' }}></span>
                Calculando modelos...
              </span>
            ) : (
              <span style={{ fontSize: '0.8rem', color: '#a855f7', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="pulse-purple bg-purple-500" style={{ width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' }}></span>
                Motor Quant Activo
              </span>
            )}
          </div>

          {/* GRID CONTENEDOR DE LAS ESTRATEGIAS 5 - 7 */}
          <div className="strategy-grid">
            
            {/* ESTRATEGIA 5: REVERSIÓN VWAP */}
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#a855f7', fontWeight: 700, letterSpacing: '0.05em' }}>
                    Estrategia 5 {stats5.winRate !== null ? `• WR: ${stats5.winRate}%` : '• WR: --'}
                  </span>
                  <h3 style={{ fontSize: '1.15rem', color: '#fff', marginTop: '0.15rem' }}>📈 Reversión VWAP (1H)</h3>
                </div>
                {strat5Data && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '6px', background: strat5Data.pUp > 50 ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)', color: strat5Data.pUp > 50 ? 'var(--color-up)' : 'var(--color-down)' }}>
                    {strat5Data.bias.split(' ')[0]}
                  </span>
                )}
              </div>

              {analysisLoading ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>Cargando análisis...</div>
              ) : strat5Data ? (
                <>
                  {/* Probabilities progress bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                      <span style={{ color: 'var(--color-up)' }}>REVERSIÓN COMPRA: {strat5Data.pUp}%</span>
                      <span style={{ color: 'var(--color-down)' }}>REVERSIÓN VENTA: {strat5Data.pDown}%</span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255, 23, 68, 0.2)', borderRadius: '99px', overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${strat5Data.pUp}%`, background: 'var(--color-up)', transition: 'width 0.5s ease' }} />
                      <div style={{ width: `${strat5Data.pDown}%`, background: 'var(--color-down)', transition: 'width 0.5s ease' }} />
                    </div>
                  </div>

                  {/* Strategy 5 Active Signal */}
                  {strat5Data.hasSignal ? (
                    <div style={{ padding: '0.85rem', borderRadius: '10px', background: strat5Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.05)' : 'rgba(255,23,68,0.05)', border: `1px solid ${strat5Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)'}` }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: strat5Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)', marginBottom: '0.4rem' }}>GATILLO REVERSIÓN: {strat5Data.signal.type}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        <div>Entrada: ${formatPrice(strat5Data.signal.entry)}</div>
                        <div style={{ color: 'var(--color-down)' }}>Stop Loss: ${formatPrice(strat5Data.signal.sl)} (-{strat5Data.signal.riskPercent}%)</div>
                        <div style={{ color: 'var(--color-up)' }}>Take Profit (Media): ${formatPrice(strat5Data.signal.tp)} (+{strat5Data.signal.profitPercent}%)</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                      Esperando anomalía en bandas de VWAP...
                    </div>
                  )}

                  {/* Reasons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <h4 style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Diagnóstico VWAP</h4>
                    <ul style={{ paddingLeft: '1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                      {strat5Data.reasons.slice(0, 3).map((r, i) => (
                        <li key={i} style={{ lineBreak: 'anywhere' }}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </div>

            {/* ESTRATEGIA 6: ESTRUCTURA FVG */}
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#3b82f6', fontWeight: 700, letterSpacing: '0.05em' }}>
                    Estrategia 6 {stats6.winRate !== null ? `• WR: ${stats6.winRate}%` : '• WR: --'}
                  </span>
                  <h3 style={{ fontSize: '1.15rem', color: '#fff', marginTop: '0.15rem' }}>🏛️ Estructura FVG (SMC - 15m)</h3>
                </div>
                {strat6Data && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '6px', background: strat6Data.bias.includes('ALCISTA') ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)', color: strat6Data.bias.includes('ALCISTA') ? 'var(--color-up)' : 'var(--color-down)' }}>
                    {strat6Data.bias.split(' ')[1] || strat6Data.bias}
                  </span>
                )}
              </div>

              {analysisLoading ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>Cargando análisis...</div>
              ) : strat6Data ? (
                <>
                  {/* Probabilities progress bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                      <span style={{ color: 'var(--color-up)' }}>COMPRA: {strat6Data.pUp}%</span>
                      <span style={{ color: 'var(--color-down)' }}>VENTA: {strat6Data.pDown}%</span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255, 23, 68, 0.2)', borderRadius: '99px', overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${strat6Data.pUp}%`, background: 'var(--color-up)', transition: 'width 0.5s ease' }} />
                      <div style={{ width: `${strat6Data.pDown}%`, background: 'var(--color-down)', transition: 'width 0.5s ease' }} />
                    </div>
                  </div>

                  {/* Strategy 6 Active Signal */}
                  {strat6Data.hasSignal ? (
                    <div style={{ padding: '0.85rem', borderRadius: '10px', background: strat6Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.05)' : 'rgba(255,23,68,0.05)', border: `1px solid ${strat6Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)'}` }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: strat6Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)', marginBottom: '0.4rem' }}>LÍMITE COMPRA (FVG): {strat6Data.signal.type}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        <div>Entrada: ${formatPrice(strat6Data.signal.entry)}</div>
                        <div style={{ color: 'var(--color-down)' }}>Stop Loss: ${formatPrice(strat6Data.signal.sl)} (-{strat6Data.signal.riskPercent}%)</div>
                        <div style={{ color: 'var(--color-up)' }}>Take Profit: ${formatPrice(strat6Data.signal.tp)} (+{strat6Data.signal.profitPercent}%)</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                      Buscando ruptura estructural (MSB) + FVG...
                    </div>
                  )}

                  {/* Reasons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <h4 style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Estructura Institucional</h4>
                    <ul style={{ paddingLeft: '1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                      {strat6Data.reasons.slice(0, 3).map((r, i) => (
                        <li key={i} style={{ lineBreak: 'anywhere' }}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </div>

            {/* ESTRATEGIA 7: MOMENTO ADX CMF */}
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#ec4899', fontWeight: 700, letterSpacing: '0.05em' }}>
                    Estrategia 7 {stats7.winRate !== null ? `• WR: ${stats7.winRate}%` : '• WR: --'}
                  </span>
                  <h3 style={{ fontSize: '1.15rem', color: '#fff', marginTop: '0.15rem' }}>🌪️ Flujo Monetario ADX (1D)</h3>
                </div>
                {strat7Data && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '6px', background: strat7Data.bias.includes('ALCISTA') ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)', color: strat7Data.bias.includes('ALCISTA') ? 'var(--color-up)' : 'var(--color-down)' }}>
                    {strat7Data.bias.split(' ')[0]}
                  </span>
                )}
              </div>

              {analysisLoading ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>Cargando análisis...</div>
              ) : strat7Data ? (
                <>
                  {/* Probabilities progress bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                      <span style={{ color: 'var(--color-up)' }}>MOMENTUM UP: {strat7Data.pUp}%</span>
                      <span style={{ color: 'var(--color-down)' }}>MOMENTUM DOWN: {strat7Data.pDown}%</span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255, 23, 68, 0.2)', borderRadius: '99px', overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${strat7Data.pUp}%`, background: 'var(--color-up)', transition: 'width 0.5s ease' }} />
                      <div style={{ width: `${strat7Data.pDown}%`, background: 'var(--color-down)', transition: 'width 0.5s ease' }} />
                    </div>
                  </div>

                  {/* Strategy 7 Active Signal */}
                  {strat7Data.hasSignal ? (
                    <div style={{ padding: '0.85rem', borderRadius: '10px', background: strat7Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.05)' : 'rgba(255,23,68,0.05)', border: `1px solid ${strat7Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)'}` }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: strat7Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)', marginBottom: '0.4rem' }}>MOMENTUM CONFIRMADO: {strat7Data.signal.type}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        <div>Entrada: ${formatPrice(strat7Data.signal.entry)}</div>
                        <div style={{ color: 'var(--color-down)' }}>Stop Loss: ${formatPrice(strat7Data.signal.sl)} (-{strat7Data.signal.riskPercent}%)</div>
                        <div style={{ color: 'var(--color-up)' }}>Take Profit: ${formatPrice(strat7Data.signal.tp)} (+{strat7Data.signal.profitPercent}%)</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                      Esperando confluencia de fuerza ADX y volumen CMF...
                    </div>
                  )}

                  {/* Reasons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <h4 style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Diagnóstico de Fuerza</h4>
                    <ul style={{ paddingLeft: '1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                      {strat7Data.reasons.slice(0, 3).map((r, i) => (
                        <li key={i} style={{ lineBreak: 'anywhere' }}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </div>

          </div>
        </section>
      ) : activeTab === 'institutional' ? (
        <section className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Section Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.4rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                🏛️ Modelos Institucionales (E8 - E10)
              </h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                Estrategias cuantitativas institucionales basadas en Canales Keltner, Velas Envolventes y Golden Pocket de Fibonacci.
              </p>
            </div>
            {analysisLoading ? (
              <span style={{ fontSize: '0.8rem', color: '#eab308' }}>Calculando...</span>
            ) : (
              <span style={{ fontSize: '0.8rem', color: 'var(--color-up)' }}>🟢 En Vivo</span>
            )}
          </div>

          <div className="strategy-grid">
            
            {/* ESTRATEGIA 8: KELTNER EXPANSIÓN */}
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#10b981', fontWeight: 700, letterSpacing: '0.05em' }}>
                    Estrategia 8 {stats8.winRate !== null ? `• WR: ${stats8.winRate}%` : '• WR: --'}
                  </span>
                  <h3 style={{ fontSize: '1.15rem', color: '#fff', marginTop: '0.15rem' }}>📊 Expansión Keltner + ATR (1H)</h3>
                </div>
                {strat8Data && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '6px', background: strat8Data.bias.includes('ALCISTA') ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)', color: strat8Data.bias.includes('ALCISTA') ? 'var(--color-up)' : 'var(--color-down)' }}>
                    {strat8Data.bias.split(' ')[0]}
                  </span>
                )}
              </div>

              {analysisLoading ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>Cargando análisis...</div>
              ) : strat8Data ? (
                <>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                      <span style={{ color: 'var(--color-up)' }}>EXPANSIÓN ALCISTA: {strat8Data.pUp}%</span>
                      <span style={{ color: 'var(--color-down)' }}>EXPANSIÓN BAJISTA: {strat8Data.pDown}%</span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255, 23, 68, 0.2)', borderRadius: '99px', overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${strat8Data.pUp}%`, background: 'var(--color-up)', transition: 'width 0.5s ease' }} />
                      <div style={{ width: `${strat8Data.pDown}%`, background: 'var(--color-down)', transition: 'width 0.5s ease' }} />
                    </div>
                  </div>

                  {strat8Data.hasSignal ? (
                    <div style={{ padding: '0.85rem', borderRadius: '10px', background: strat8Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.05)' : 'rgba(255,23,68,0.05)', border: `1px solid ${strat8Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)'}` }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: strat8Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)', marginBottom: '0.4rem' }}>RUPTURA DE CANAL: {strat8Data.signal.type}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        <div>Entrada: ${formatPrice(strat8Data.signal.entry)}</div>
                        <div style={{ color: 'var(--color-down)' }}>Stop Loss: ${formatPrice(strat8Data.signal.sl)} (-{strat8Data.signal.riskPercent}%)</div>
                        <div style={{ color: 'var(--color-up)' }}>Take Profit: ${formatPrice(strat8Data.signal.tp)} (+{strat8Data.signal.profitPercent}%)</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                      Esperando ruptura de canal Keltner con volumen...
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <h4 style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Diagnóstico Keltner</h4>
                    <ul style={{ paddingLeft: '1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                      {strat8Data.reasons.slice(0, 3).map((r, i) => (
                        <li key={i} style={{ lineBreak: 'anywhere' }}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </div>

            {/* ESTRATEGIA 9: RETROCESO MACRO 4H */}
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#06b6d4', fontWeight: 700, letterSpacing: '0.05em' }}>
                    Estrategia 9 {stats9.winRate !== null ? `• WR: ${stats9.winRate}%` : '• WR: --'}
                  </span>
                  <h3 style={{ fontSize: '1.15rem', color: '#fff', marginTop: '0.15rem' }}>🕯️ Envolvente Macro (EMA 50 - 4H)</h3>
                </div>
                {strat9Data && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '6px', background: strat9Data.bias.includes('COMPRADOR') ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)', color: strat9Data.bias.includes('COMPRADOR') ? 'var(--color-up)' : 'var(--color-down)' }}>
                    {strat9Data.bias.split(' ')[1] || 'TENDENCIA'}
                  </span>
                )}
              </div>

              {analysisLoading ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>Cargando análisis...</div>
              ) : strat9Data ? (
                <>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                      <span style={{ color: 'var(--color-up)' }}>SESGO ALCISTA: {strat9Data.pUp}%</span>
                      <span style={{ color: 'var(--color-down)' }}>SESGO BAJISTA: {strat9Data.pDown}%</span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255, 23, 68, 0.2)', borderRadius: '99px', overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${strat9Data.pUp}%`, background: 'var(--color-up)', transition: 'width 0.5s ease' }} />
                      <div style={{ width: `${strat9Data.pDown}%`, background: 'var(--color-down)', transition: 'width 0.5s ease' }} />
                    </div>
                  </div>

                  {strat9Data.hasSignal ? (
                    <div style={{ padding: '0.85rem', borderRadius: '10px', background: strat9Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.05)' : 'rgba(255,23,68,0.05)', border: `1px solid ${strat9Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)'}` }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: strat9Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)', marginBottom: '0.4rem' }}>ENTRADA MACRO (4H): {strat9Data.signal.type}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        <div>Entrada: ${formatPrice(strat9Data.signal.entry)}</div>
                        <div style={{ color: 'var(--color-down)' }}>Stop Loss: ${formatPrice(strat9Data.signal.sl)} (-{strat9Data.signal.riskPercent}%)</div>
                        <div style={{ color: 'var(--color-up)' }}>Take Profit: ${formatPrice(strat9Data.signal.tp)} (+{strat9Data.signal.profitPercent}%)</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                      Esperando retroceso a EMA 50 y patrón envolvente en 4H...
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <h4 style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Diagnóstico Trend 4H</h4>
                    <ul style={{ paddingLeft: '1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                      {strat9Data.reasons.slice(0, 3).map((r, i) => (
                        <li key={i} style={{ lineBreak: 'anywhere' }}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </div>

            {/* ESTRATEGIA 10: FIBONACCI GOLDEN POCKET */}
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#f59e0b', fontWeight: 700, letterSpacing: '0.05em' }}>
                    Estrategia 10 {stats10.winRate !== null ? `• WR: ${stats10.winRate}%` : '• WR: --'}
                  </span>
                  <h3 style={{ fontSize: '1.15rem', color: '#fff', marginTop: '0.15rem' }}>🌀 Fibonacci Golden Pocket (1H)</h3>
                </div>
                {strat10Data && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '6px', background: strat10Data.bias.includes('LONG') ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)', color: strat10Data.bias.includes('LONG') ? 'var(--color-up)' : 'var(--color-down)' }}>
                    GOLDEN POCKET
                  </span>
                )}
              </div>

              {analysisLoading ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>Cargando análisis...</div>
              ) : strat10Data ? (
                <>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                      <span style={{ color: 'var(--color-up)' }}>REVERSIÓN SWING: {strat10Data.pUp}%</span>
                      <span style={{ color: 'var(--color-down)' }}>CONTINUIDAD SWING: {strat10Data.pDown}%</span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255, 23, 68, 0.2)', borderRadius: '99px', overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${strat10Data.pUp}%`, background: 'var(--color-up)', transition: 'width 0.5s ease' }} />
                      <div style={{ width: `${strat10Data.pDown}%`, background: 'var(--color-down)', transition: 'width 0.5s ease' }} />
                    </div>
                  </div>

                  {strat10Data.hasSignal ? (
                    <div style={{ padding: '0.85rem', borderRadius: '10px', background: strat10Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.05)' : 'rgba(255,23,68,0.05)', border: `1px solid ${strat10Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)'}` }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: strat10Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)', marginBottom: '0.4rem' }}>ZONA GOLDEN POCKET: {strat10Data.signal.type}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        <div>Entrada: ${formatPrice(strat10Data.signal.entry)}</div>
                        <div style={{ color: 'var(--color-down)' }}>Stop Loss: ${formatPrice(strat10Data.signal.sl)} (-{strat10Data.signal.riskPercent}%)</div>
                        <div style={{ color: 'var(--color-up)' }}>Take Profit: ${formatPrice(strat10Data.signal.tp)} (+{strat10Data.signal.profitPercent}%)</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                      Buscando entrada en Golden Pocket (0.618 - 0.786)...
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <h4 style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Diagnóstico Fibonacci</h4>
                    <ul style={{ paddingLeft: '1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                      {strat10Data.reasons.slice(0, 3).map((r, i) => (
                        <li key={i} style={{ lineBreak: 'anywhere' }}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </div>

          </div>
        </section>
      ) : activeTab === 'scalping' ? (
        <section className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Section Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.4rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                ⚡ Scalping y Micro-Estructura (E11 - E13)
              </h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                Estrategias de ultra-corto plazo con objetivos cercanos al precio actual (0.5% - 1.2%) basadas en divergencias RSI/CVD, micro-impulsos de EMA y barridas de liquidez local.
              </p>
            </div>
            {analysisLoading ? (
              <span style={{ fontSize: '0.8rem', color: '#eab308' }}>Calculando...</span>
            ) : (
              <span style={{ fontSize: '0.8rem', color: 'var(--color-down)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="pulse-red bg-red-500" style={{ width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' }}></span>
                Motor Scalper Activo
              </span>
            )}
          </div>

          <div className="strategy-grid">
            
            {/* ESTRATEGIA 11: DIVERGENCIA RSI/CVD 5M */}
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#ef4444', fontWeight: 700, letterSpacing: '0.05em' }}>
                    Estrategia 11 {stats11.winRate !== null ? `• WR: ${stats11.winRate}%` : '• WR: --'}
                  </span>
                  <h3 style={{ fontSize: '1.15rem', color: '#fff', marginTop: '0.15rem' }}>⚡ Scalp Divergencia RSI / CVD (5m)</h3>
                </div>
                {strat11Data?.hasSignal && (
                  <span style={{ padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, background: strat11Data.signal.type === 'LONG' ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)', color: strat11Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)', border: `1px solid ${strat11Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)'}` }}>
                    SEÑAL {strat11Data.signal.type}
                  </span>
                )}
              </div>

              {analysisLoading ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>Cargando análisis...</div>
              ) : strat11Data ? (
                <>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                      <span style={{ color: 'var(--color-up)' }}>PROBABILIDAD ALCISTA: {strat11Data.pUp}%</span>
                      <span style={{ color: 'var(--color-down)' }}>PROBABILIDAD BAJISTA: {strat11Data.pDown}%</span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255, 23, 68, 0.2)', borderRadius: '99px', overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${strat11Data.pUp}%`, background: 'var(--color-up)', transition: 'width 0.5s ease' }} />
                      <div style={{ width: `${strat11Data.pDown}%`, background: 'var(--color-down)', transition: 'width 0.5s ease' }} />
                    </div>
                  </div>

                  {strat11Data.hasSignal ? (
                    <div style={{ padding: '0.85rem', borderRadius: '10px', background: strat11Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.05)' : 'rgba(255,23,68,0.05)', border: `1px solid ${strat11Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)'}` }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: strat11Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)', marginBottom: '0.4rem' }}>ENTRADA SCALP 5M: {strat11Data.signal.type}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        <div>Entrada: ${formatPrice(strat11Data.signal.entry)}</div>
                        <div style={{ color: 'var(--color-down)' }}>Stop Loss: ${formatPrice(strat11Data.signal.sl)} (-{strat11Data.signal.riskPercent}%)</div>
                        <div style={{ color: 'var(--color-up)' }}>Take Profit: ${formatPrice(strat11Data.signal.tp)} (+{strat11Data.signal.profitPercent}%)</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                      Esperando divergencia RSI / CVD en velas de 5m...
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <h4 style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Diagnóstico Scalper</h4>
                    <ul style={{ paddingLeft: '1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                      {strat11Data.reasons.slice(0, 3).map((r, i) => (
                        <li key={i} style={{ lineBreak: 'anywhere' }}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </div>

            {/* ESTRATEGIA 12: MICRO-IMPULSO EMA 9/21 + SUPERTREND 5M */}
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#f59e0b', fontWeight: 700, letterSpacing: '0.05em' }}>
                    Estrategia 12 {stats12.winRate !== null ? `• WR: ${stats12.winRate}%` : '• WR: --'}
                  </span>
                  <h3 style={{ fontSize: '1.15rem', color: '#fff', marginTop: '0.15rem' }}>🚀 Micro-Impulso EMA 9/21 + Supertrend</h3>
                </div>
                {strat12Data?.hasSignal && (
                  <span style={{ padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, background: strat12Data.signal.type === 'LONG' ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)', color: strat12Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)', border: `1px solid ${strat12Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)'}` }}>
                    SEÑAL {strat12Data.signal.type}
                  </span>
                )}
              </div>

              {analysisLoading ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>Cargando análisis...</div>
              ) : strat12Data ? (
                <>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                      <span style={{ color: 'var(--color-up)' }}>MICRO ALCISTA: {strat12Data.pUp}%</span>
                      <span style={{ color: 'var(--color-down)' }}>MICRO BAJISTA: {strat12Data.pDown}%</span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255, 23, 68, 0.2)', borderRadius: '99px', overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${strat12Data.pUp}%`, background: 'var(--color-up)', transition: 'width 0.5s ease' }} />
                      <div style={{ width: `${strat12Data.pDown}%`, background: 'var(--color-down)', transition: 'width 0.5s ease' }} />
                    </div>
                  </div>

                  {strat12Data.hasSignal ? (
                    <div style={{ padding: '0.85rem', borderRadius: '10px', background: strat12Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.05)' : 'rgba(255,23,68,0.05)', border: `1px solid ${strat12Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)'}` }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: strat12Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)', marginBottom: '0.4rem' }}>ENTRADA TENDENCIA 5M: {strat12Data.signal.type}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        <div>Entrada: ${formatPrice(strat12Data.signal.entry)}</div>
                        <div style={{ color: 'var(--color-down)' }}>Stop Loss: ${formatPrice(strat12Data.signal.sl)} (-{strat12Data.signal.riskPercent}%)</div>
                        <div style={{ color: 'var(--color-up)' }}>Take Profit: ${formatPrice(strat12Data.signal.tp)} (+{strat12Data.signal.profitPercent}%)</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                      Monitoreando alineación EMA 9/21 y Supertrend...
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <h4 style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Diagnóstico Micro Trend</h4>
                    <ul style={{ paddingLeft: '1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                      {strat12Data.reasons.slice(0, 3).map((r, i) => (
                        <li key={i} style={{ lineBreak: 'anywhere' }}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </div>

            {/* ESTRATEGIA 13: BARRIDA DE LIQUIDEZ + STOCHRSI 15M */}
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#10b981', fontWeight: 700, letterSpacing: '0.05em' }}>
                    Estrategia 13 {stats13.winRate !== null ? `• WR: ${stats13.winRate}%` : '• WR: --'}
                  </span>
                  <h3 style={{ fontSize: '1.15rem', color: '#fff', marginTop: '0.15rem' }}>🎯 Barrida Liquidez + StochRSI (15m)</h3>
                </div>
                {strat13Data?.hasSignal && (
                  <span style={{ padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, background: strat13Data.signal.type === 'LONG' ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)', color: strat13Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)', border: `1px solid ${strat13Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)'}` }}>
                    SEÑAL {strat13Data.signal.type}
                  </span>
                )}
              </div>

              {analysisLoading ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>Cargando análisis...</div>
              ) : strat13Data ? (
                <>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                      <span style={{ color: 'var(--color-up)' }}>REVERSIÓN MÍNIMOS: {strat13Data.pUp}%</span>
                      <span style={{ color: 'var(--color-down)' }}>REVERSIÓN MÁXIMOS: {strat13Data.pDown}%</span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255, 23, 68, 0.2)', borderRadius: '99px', overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${strat13Data.pUp}%`, background: 'var(--color-up)', transition: 'width 0.5s ease' }} />
                      <div style={{ width: `${strat13Data.pDown}%`, background: 'var(--color-down)', transition: 'width 0.5s ease' }} />
                    </div>
                  </div>

                  {strat13Data.hasSignal ? (
                    <div style={{ padding: '0.85rem', borderRadius: '10px', background: strat13Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.05)' : 'rgba(255,23,68,0.05)', border: `1px solid ${strat13Data.signal.type === 'LONG' ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)'}` }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: strat13Data.signal.type === 'LONG' ? 'var(--color-up)' : 'var(--color-down)', marginBottom: '0.4rem' }}>ENTRADA BARRIDA: {strat13Data.signal.type}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        <div>Entrada: ${formatPrice(strat13Data.signal.entry)}</div>
                        <div style={{ color: 'var(--color-down)' }}>Stop Loss: ${formatPrice(strat13Data.signal.sl)} (-{strat13Data.signal.riskPercent}%)</div>
                        <div style={{ color: 'var(--color-up)' }}>Take Profit: ${formatPrice(strat13Data.signal.tp)} (+{strat13Data.signal.profitPercent}%)</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                      Esperando caza de Stop Loss en máximos/mínimos locales...
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <h4 style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Diagnóstico Liquidez</h4>
                    <ul style={{ paddingLeft: '1rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                      {strat13Data.reasons.slice(0, 3).map((r, i) => (
                        <li key={i} style={{ lineBreak: 'anywhere' }}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </div>

          </div>
        </section>
      ) : null}

      {/* HISTORIAL Y RENDIMIENTO DE SEÑALES */}
      {activeTab === 'core' ? (
        <section className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📈 Historial de Rendimiento y Efectividad
              </h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                Seguimiento y efectividad en tiempo real de las señales Core autogestionadas por el bot.
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
          <div className="stats-grid">
            
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

            {/* Stats Estrategia 4 */}
            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#a855f7', textTransform: 'uppercase', fontWeight: 700 }}>Estrategia 4 (Squeeze & Trend)</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: stats4.winRate !== null ? (stats4.winRate >= 60 ? 'var(--color-up)' : 'var(--color-down)') : 'var(--color-text-muted)' }}>
                  {stats4.winRate !== null ? `${stats4.winRate}%` : '--'}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  {stats4.tpCount} TP / {stats4.slCount} SL
                </span>
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{stats4.total} señales resueltas</div>
            </div>

          </div>

          {/* Strategy Filter Bar */}
          <div className="strategy-filter-bar">
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Filtrar Estrategia:</span>
            {['ALL', 'Estrategia 1', 'Estrategia 2', 'Estrategia 3', 'Estrategia 4'].map((strat) => (
              <button
                key={strat}
                onClick={() => setSelectedStratFilter(strat)}
                className="strategy-filter-btn"
                style={{
                  padding: '0.3rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: selectedStratFilter === strat ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selectedStratFilter === strat ? '#f59e0b' : 'rgba(255,255,255,0.06)'}`,
                  color: selectedStratFilter === strat ? '#fff' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {strat === 'ALL' ? 'Todas (E1-E4)' : strat}
              </button>
            ))}
          </div>

          {/* Signals History Table */}
          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'var(--color-text-muted)' }}>
                  <th style={{ padding: '0.75rem' }}>Fecha / Hora</th>
                  <th style={{ padding: '0.75rem' }}>Estrategia</th>
                  <th style={{ padding: '0.75rem' }}>Operación</th>
                  <th style={{ padding: '0.75rem' }}>Entrada</th>
                  <th style={{ padding: '0.75rem' }}>Stop Loss</th>
                  <th style={{ padding: '0.75rem' }}>Take Profit</th>
                  <th style={{ padding: '0.75rem' }}>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {signalsHistory
                  .filter((sig) => ['Estrategia 1', 'Estrategia 2', 'Estrategia 3', 'Estrategia 4'].includes(sig.strategy))
                  .filter((sig) => selectedStratFilter === 'ALL' || sig.strategy === selectedStratFilter)
                  .slice(0, 15)
                  .map((sig) => {
                    const d = new Date(sig.timestamp);
                    const dateStr = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    return (
                      <tr key={sig.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', color: '#cbd5e1' }}>
                        <td style={{ padding: '0.75rem' }} className="font-mono">{dateStr}</td>
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
                          {renderSignalStatusBadge(sig)}
                        </td>
                      </tr>
                    );
                  })}
                {signalsHistory
                  .filter((sig) => ['Estrategia 1', 'Estrategia 2', 'Estrategia 3', 'Estrategia 4'].includes(sig.strategy))
                  .filter((sig) => selectedStratFilter === 'ALL' || sig.strategy === selectedStratFilter).length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                      Historial vacío para la selección actual. Esperando la generación de señales...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : activeTab === 'advanced' ? (
        <section className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📈 Historial Avanzado (Quant)
              </h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                Seguimiento y efectividad en tiempo real de las señales Avanzadas autogestionadas por el bot.
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
          <div className="stats-grid">
            
            {/* Stats Estrategia 5 */}
            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#a855f7', textTransform: 'uppercase', fontWeight: 700 }}>Estrategia 5 (Reversión VWAP)</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: stats5.winRate !== null ? (stats5.winRate >= 60 ? 'var(--color-up)' : 'var(--color-down)') : 'var(--color-text-muted)' }}>
                  {stats5.winRate !== null ? `${stats5.winRate}%` : '--'}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  {stats5.tpCount} TP / {stats5.slCount} SL
                </span>
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{stats5.total} señales resueltas</div>
            </div>

            {/* Stats Estrategia 6 */}
            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#3b82f6', textTransform: 'uppercase', fontWeight: 700 }}>Estrategia 6 (Estructura FVG)</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: stats6.winRate !== null ? (stats6.winRate >= 60 ? 'var(--color-up)' : 'var(--color-down)') : 'var(--color-text-muted)' }}>
                  {stats6.winRate !== null ? `${stats6.winRate}%` : '--'}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  {stats6.tpCount} TP / {stats6.slCount} SL
                </span>
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{stats6.total} señales resueltas</div>
            </div>

            {/* Stats Estrategia 7 */}
            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#ec4899', textTransform: 'uppercase', fontWeight: 700 }}>Estrategia 7 (Flujo ADX)</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: stats7.winRate !== null ? (stats7.winRate >= 60 ? 'var(--color-up)' : 'var(--color-down)') : 'var(--color-text-muted)' }}>
                  {stats7.winRate !== null ? `${stats7.winRate}%` : '--'}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  {stats7.tpCount} TP / {stats7.slCount} SL
                </span>
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{stats7.total} señales resueltas</div>
            </div>

          </div>

          {/* Strategy Filter Bar */}
          <div className="strategy-filter-bar">
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Filtrar Estrategia:</span>
            {['ALL', 'Estrategia 5', 'Estrategia 6', 'Estrategia 7'].map((strat) => (
              <button
                key={strat}
                onClick={() => setSelectedStratFilter(strat)}
                className="strategy-filter-btn"
                style={{
                  padding: '0.3rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: selectedStratFilter === strat ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selectedStratFilter === strat ? '#a855f7' : 'rgba(255,255,255,0.06)'}`,
                  color: selectedStratFilter === strat ? '#fff' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {strat === 'ALL' ? 'Todas (E5-E7)' : strat}
              </button>
            ))}
          </div>

          {/* Signals History Table */}
          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'var(--color-text-muted)' }}>
                  <th style={{ padding: '0.75rem' }}>Fecha / Hora</th>
                  <th style={{ padding: '0.75rem' }}>Estrategia</th>
                  <th style={{ padding: '0.75rem' }}>Operación</th>
                  <th style={{ padding: '0.75rem' }}>Entrada</th>
                  <th style={{ padding: '0.75rem' }}>Stop Loss</th>
                  <th style={{ padding: '0.75rem' }}>Take Profit</th>
                  <th style={{ padding: '0.75rem' }}>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {signalsHistory
                  .filter((sig) => ['Estrategia 5', 'Estrategia 6', 'Estrategia 7'].includes(sig.strategy))
                  .filter((sig) => selectedStratFilter === 'ALL' || sig.strategy === selectedStratFilter)
                  .slice(0, 15)
                  .map((sig) => {
                    const d = new Date(sig.timestamp);
                    const dateStr = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    return (
                      <tr key={sig.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', color: '#cbd5e1' }}>
                        <td style={{ padding: '0.75rem' }} className="font-mono">{dateStr}</td>
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
                          {renderSignalStatusBadge(sig)}
                        </td>
                      </tr>
                    );
                  })}
                {signalsHistory
                  .filter((sig) => ['Estrategia 5', 'Estrategia 6', 'Estrategia 7'].includes(sig.strategy))
                  .filter((sig) => selectedStratFilter === 'ALL' || sig.strategy === selectedStratFilter).length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                      Historial vacío para la selección actual. Esperando la generación de señales...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : activeTab === 'institutional' ? (
        <section className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🏛️ Historial Institucional
              </h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                Seguimiento y efectividad en tiempo real de las señales Institucionales autogestionadas por el bot.
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
          <div className="stats-grid">
            
            {/* Stats Estrategia 8 */}
            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#10b981', textTransform: 'uppercase', fontWeight: 700 }}>Estrategia 8 (Keltner ATR)</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: stats8.winRate !== null ? (stats8.winRate >= 60 ? 'var(--color-up)' : 'var(--color-down)') : 'var(--color-text-muted)' }}>
                  {stats8.winRate !== null ? `${stats8.winRate}%` : '--'}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  {stats8.tpCount} TP / {stats8.slCount} SL
                </span>
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{stats8.total} señales resueltas</div>
            </div>

            {/* Stats Estrategia 9 */}
            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#06b6d4', textTransform: 'uppercase', fontWeight: 700 }}>Estrategia 9 (Macro Engulfing 4H)</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: stats9.winRate !== null ? (stats9.winRate >= 60 ? 'var(--color-up)' : 'var(--color-down)') : 'var(--color-text-muted)' }}>
                  {stats9.winRate !== null ? `${stats9.winRate}%` : '--'}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  {stats9.tpCount} TP / {stats9.slCount} SL
                </span>
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{stats9.total} señales resueltas</div>
            </div>

            {/* Stats Estrategia 10 */}
            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 700 }}>Estrategia 10 (Fib Golden Pocket)</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: stats10.winRate !== null ? (stats10.winRate >= 60 ? 'var(--color-up)' : 'var(--color-down)') : 'var(--color-text-muted)' }}>
                  {stats10.winRate !== null ? `${stats10.winRate}%` : '--'}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  {stats10.tpCount} TP / {stats10.slCount} SL
                </span>
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{stats10.total} señales resueltas</div>
            </div>

          </div>

          {/* Strategy Filter Bar */}
          <div className="strategy-filter-bar">
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Filtrar Estrategia:</span>
            {['ALL', 'Estrategia 8', 'Estrategia 9', 'Estrategia 10'].map((strat) => (
              <button
                key={strat}
                onClick={() => setSelectedStratFilter(strat)}
                className="strategy-filter-btn"
                style={{
                  padding: '0.3rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: selectedStratFilter === strat ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selectedStratFilter === strat ? '#10b981' : 'rgba(255,255,255,0.06)'}`,
                  color: selectedStratFilter === strat ? '#fff' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {strat === 'ALL' ? 'Todas (E8-E10)' : strat}
              </button>
            ))}
          </div>

          {/* Signals History Table */}
          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'var(--color-text-muted)' }}>
                  <th style={{ padding: '0.75rem' }}>Fecha / Hora</th>
                  <th style={{ padding: '0.75rem' }}>Estrategia</th>
                  <th style={{ padding: '0.75rem' }}>Operación</th>
                  <th style={{ padding: '0.75rem' }}>Entrada</th>
                  <th style={{ padding: '0.75rem' }}>Stop Loss</th>
                  <th style={{ padding: '0.75rem' }}>Take Profit</th>
                  <th style={{ padding: '0.75rem' }}>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {signalsHistory
                  .filter((sig) => ['Estrategia 8', 'Estrategia 9', 'Estrategia 10'].includes(sig.strategy))
                  .filter((sig) => selectedStratFilter === 'ALL' || sig.strategy === selectedStratFilter)
                  .slice(0, 15)
                  .map((sig) => {
                    const d = new Date(sig.timestamp);
                    const dateStr = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    return (
                      <tr key={sig.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', color: '#cbd5e1' }}>
                        <td style={{ padding: '0.75rem' }} className="font-mono">{dateStr}</td>
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
                          {renderSignalStatusBadge(sig)}
                        </td>
                      </tr>
                    );
                  })}
                {signalsHistory
                  .filter((sig) => ['Estrategia 8', 'Estrategia 9', 'Estrategia 10'].includes(sig.strategy))
                  .filter((sig) => selectedStratFilter === 'ALL' || sig.strategy === selectedStratFilter).length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                      Historial vacío para la selección actual. Esperando la generación de señales...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : activeTab === 'scalping' ? (
        <section className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                ⚡ Historial Scalping (0.5% - 1.2%)
              </h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                Seguimiento y efectividad en tiempo real de las señales de ultra-corto plazo autogestionadas por el bot.
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
          <div className="stats-grid">
            {/* Stats Estrategia 11 */}
            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#ef4444', textTransform: 'uppercase', fontWeight: 700 }}>Estrategia 11 (Divergencia RSI/CVD)</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: stats11.winRate !== null ? (stats11.winRate >= 60 ? 'var(--color-up)' : 'var(--color-down)') : 'var(--color-text-muted)' }}>
                  {stats11.winRate !== null ? `${stats11.winRate}%` : '--'}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  {stats11.tpCount} TP / {stats11.slCount} SL
                </span>
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{stats11.total} señales resueltas</div>
            </div>

            {/* Stats Estrategia 12 */}
            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 700 }}>Estrategia 12 (Micro EMA Supertrend)</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: stats12.winRate !== null ? (stats12.winRate >= 60 ? 'var(--color-up)' : 'var(--color-down)') : 'var(--color-text-muted)' }}>
                  {stats12.winRate !== null ? `${stats12.winRate}%` : '--'}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  {stats12.tpCount} TP / {stats12.slCount} SL
                </span>
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{stats12.total} señales resueltas</div>
            </div>

            {/* Stats Estrategia 13 */}
            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#10b981', textTransform: 'uppercase', fontWeight: 700 }}>Estrategia 13 (Barrida Liquidez 15m)</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: stats13.winRate !== null ? (stats13.winRate >= 60 ? 'var(--color-up)' : 'var(--color-down)') : 'var(--color-text-muted)' }}>
                  {stats13.winRate !== null ? `${stats13.winRate}%` : '--'}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  {stats13.tpCount} TP / {stats13.slCount} SL
                </span>
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{stats13.total} señales resueltas</div>
            </div>
          </div>

          {/* Strategy Filter Bar */}
          <div className="strategy-filter-bar">
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Filtrar Estrategia:</span>
            {['ALL', 'Estrategia 11', 'Estrategia 12', 'Estrategia 13'].map((strat) => (
              <button
                key={strat}
                onClick={() => setSelectedStratFilter(strat)}
                className="strategy-filter-btn"
                style={{
                  padding: '0.3rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: selectedStratFilter === strat ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selectedStratFilter === strat ? '#ef4444' : 'rgba(255,255,255,0.06)'}`,
                  color: selectedStratFilter === strat ? '#fff' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {strat === 'ALL' ? 'Todas (E11-E13)' : strat}
              </button>
            ))}
          </div>

          {/* Signals History Table */}
          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'var(--color-text-muted)' }}>
                  <th style={{ padding: '0.75rem' }}>Fecha / Hora</th>
                  <th style={{ padding: '0.75rem' }}>Estrategia</th>
                  <th style={{ padding: '0.75rem' }}>Operación</th>
                  <th style={{ padding: '0.75rem' }}>Entrada</th>
                  <th style={{ padding: '0.75rem' }}>Stop Loss</th>
                  <th style={{ padding: '0.75rem' }}>Take Profit</th>
                  <th style={{ padding: '0.75rem' }}>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {signalsHistory
                  .filter((sig) => ['Estrategia 11', 'Estrategia 12', 'Estrategia 13'].includes(sig.strategy))
                  .filter((sig) => selectedStratFilter === 'ALL' || sig.strategy === selectedStratFilter)
                  .slice(0, 15)
                  .map((sig) => {
                    const d = new Date(sig.timestamp);
                    const dateStr = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    return (
                      <tr key={sig.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', color: '#cbd5e1' }}>
                        <td style={{ padding: '0.75rem' }} className="font-mono">{dateStr}</td>
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
                          {renderSignalStatusBadge(sig)}
                        </td>
                      </tr>
                    );
                  })}
                {signalsHistory
                  .filter((sig) => ['Estrategia 11', 'Estrategia 12', 'Estrategia 13'].includes(sig.strategy))
                  .filter((sig) => selectedStratFilter === 'ALL' || sig.strategy === selectedStratFilter).length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                      Historial vacío para la selección actual. Esperando la generación de señales scalping...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

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
