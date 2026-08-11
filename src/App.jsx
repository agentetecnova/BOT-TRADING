import React, { useState, useEffect, useRef } from 'react';
import technicalAnalysisService from './services/TechnicalAnalysisService';
import BTCMasterSheet from './components/BTCMasterSheet';
import BTCDivergenceQuantSheet from './components/BTCDivergenceQuantSheet';
import SignalHistoryService from './services/SignalHistoryService';
import StrategyRankingComponent from './components/StrategyRankingComponent';
import StrategyGridComponent from './components/StrategyGridComponent';
import './App.css';

class SheetErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[SheetErrorBoundary] Error detectado:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2.5rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '16px', color: '#ef4444', textAlign: 'center', margin: '1rem 0' }}>
          <h3>⚠️ Advertencia en el Componente de Hoja 2</h3>
          <p style={{ fontSize: '0.85rem', color: '#fca5a5', marginTop: '0.5rem' }}>
            {this.state.error ? this.state.error.message : 'Error inesperado'}
          </p>
          <button 
            onClick={() => this.setState({ hasError: false })}
            style={{ marginTop: '1.25rem', padding: '0.6rem 1.2rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}
          >
            🔄 Reintentar Carga
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  // Navigation State for Independent Sheets
  const [selectedSheet, setSelectedSheet] = useState('sheet1'); // 'sheet1' | 'sheet2'

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
  const [allAnalysisMap, setAllAnalysisMap] = useState({});
  const [renderServerStatus, setRenderServerStatus] = useState('syncing'); // 'connected' | 'syncing' | 'local'
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [analysisError, setAnalysisError] = useState(null);

  // Signals History state
  const [signalsHistory, setSignalsHistory] = useState(() => SignalHistoryService.loadFromLocalStorage('btc_signals_history_backup'));
  const [selectedStratFilter, setSelectedStratFilter] = useState('ALL');
  const [dateRangeFilter, setDateRangeFilter] = useState('ALL');

  // Auto-scroll logs
  const consoleRef = useRef(null);

  // Load signals from local backup cache on mount
  useEffect(() => {
    const loaded = SignalHistoryService.loadFromLocalStorage('btc_signals_history_backup');
    if (loaded.length > 0) {
      setSignalsHistory(loaded);
    }
    addLog('Sistema', 'Terminal de Análisis Técnico de BTC Inicializada (Persistencia Nube Resiliente 24/7)');
  }, []);

  // Poll & Sync Render 24/7 API for background signals and server state
  useEffect(() => {
    const fetchRenderSignals = async () => {
      try {
        const localCache = SignalHistoryService.loadFromLocalStorage('btc_signals_history_backup');

        const renderUrl = 'https://bot-trading-2.onrender.com/api/signals/sync';
        const res = await fetch(renderUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientHistory: localCache })
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.history && Array.isArray(data.history)) {
            setSignalsHistory(prev => {
              const merged = SignalHistoryService.unionMerge(prev, data.history, 2000);
              SignalHistoryService.saveToLocalStorage('btc_signals_history_backup', merged, 2000);
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

      // Run Institutional & Scalping Strategies (Strategies 8, 9, 10, 11, 12, 13)
      const res8 = technicalAnalysisService.runStrategy8(k1h);
      const res9 = technicalAnalysisService.runStrategy9(k4h);
      const res10 = technicalAnalysisService.runStrategy10(k1h);
      const res11 = technicalAnalysisService.runStrategy11(k5m, 0);
      const res12 = technicalAnalysisService.runStrategy12(k5m);
      const res13 = technicalAnalysisService.runStrategy13(k15m);

      // Run Strategies 14 to 24
      const res14 = technicalAnalysisService.runStrategy14(k1h);
      const res15 = technicalAnalysisService.runStrategy15(k4h);
      const res16 = technicalAnalysisService.runStrategy16(k1h);
      const res17 = technicalAnalysisService.runStrategy17(k15m);
      const res18 = technicalAnalysisService.runStrategy18(k1d);
      const res19 = technicalAnalysisService.runStrategy19(k15m);
      const res20 = technicalAnalysisService.runStrategy20(k1h);
      const res21 = technicalAnalysisService.runStrategy21(k15m);
      const res22 = technicalAnalysisService.runStrategy22(k1h);
      const res23 = technicalAnalysisService.runStrategy23(klinesMap);
      const res24 = technicalAnalysisService.runStrategy24(k15m);

      const partialResults = {
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
        'Estrategia 14': res14,
        'Estrategia 15': res15,
        'Estrategia 16': res16,
        'Estrategia 17': res17,
        'Estrategia 18': res18,
        'Estrategia 19': res19,
        'Estrategia 20': res20,
        'Estrategia 21': res21,
        'Estrategia 22': res22,
        'Estrategia 23': res23,
        'Estrategia 24': res24,
      };

      const res25 = technicalAnalysisService.runStrategy25(partialResults);
      const resultsMap = { ...partialResults, 'Estrategia 25': res25 };

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
      setAllAnalysisMap(resultsMap);
      setAnalysisError(null);

      // Calcular Consenso Maestro de forma transparente e independiente
      const masterConsensus = technicalAnalysisService.calculateMasterConsensus(resultsMap);
      setMasterConsensusData(masterConsensus);

      // Procesar nuevas señales para las 25 estrategias
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

  // Las señales se evalúan de forma pura hasta tocar su Take Profit (TP) o Stop Loss (SL) para registrar Win Rate real.

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
        createdAt: Date.now(),
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

      const next = SignalHistoryService.unionMerge([newSignal], prev, 2000);
      SignalHistoryService.saveToLocalStorage('btc_signals_history_backup', next, 2000);
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
      
      {/* 🟢 SELECTOR PRINCIPAL DE HOJAS (MODO TOTALMENTE INDEPENDIENTE) */}
      <div className="glass-panel" style={{
        display: 'flex',
        gap: '0.75rem',
        background: 'rgba(15, 23, 42, 0.85)',
        padding: '0.6rem 0.85rem',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        alignItems: 'center',
        flexWrap: 'wrap',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', flex: 1, width: '100%' }}>
          <button
            onClick={() => setSelectedSheet('sheet1')}
            style={{
              flex: 1,
              minWidth: '200px',
              padding: '0.75rem 1.25rem',
              borderRadius: '12px',
              fontWeight: 800,
              fontSize: '0.9rem',
              background: selectedSheet === 'sheet1' ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(245, 158, 11, 0.08) 100%)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${selectedSheet === 'sheet1' ? '#f59e0b' : 'rgba(255,255,255,0.05)'}`,
              color: selectedSheet === 'sheet1' ? '#fff' : 'var(--color-text-muted)',
              cursor: 'pointer',
              transition: 'all 0.25 ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            🛸 HOJA 1: Bot Multi-Estrategia (13 Algoritmos)
          </button>
          <button
            onClick={() => setSelectedSheet('sheet2')}
            style={{
              flex: 1,
              minWidth: '180px',
              padding: '0.75rem 1.25rem',
              borderRadius: '12px',
              fontWeight: 800,
              fontSize: '0.9rem',
              background: selectedSheet === 'sheet2' ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(168, 85, 247, 0.08) 100%)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${selectedSheet === 'sheet2' ? '#a855f7' : 'rgba(255,255,255,0.05)'}`,
              color: selectedSheet === 'sheet2' ? '#fff' : 'var(--color-text-muted)',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            👑 HOJA 2: BTC Master Pro
          </button>
          <button
            onClick={() => setSelectedSheet('sheet3')}
            style={{
              flex: 1,
              minWidth: '180px',
              padding: '0.75rem 1.25rem',
              borderRadius: '12px',
              fontWeight: 800,
              fontSize: '0.9rem',
              background: selectedSheet === 'sheet3' ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(59, 130, 246, 0.08) 100%)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${selectedSheet === 'sheet3' ? '#3b82f6' : 'rgba(255,255,255,0.05)'}`,
              color: selectedSheet === 'sheet3' ? '#fff' : 'var(--color-text-muted)',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            ⚡ HOJA 3: Divergencias + Quant Squeeze
          </button>
        </div>
      </div>

      {selectedSheet === 'sheet2' ? (
        <SheetErrorBoundary>
          <BTCMasterSheet />
        </SheetErrorBoundary>
      ) : selectedSheet === 'sheet3' ? (
        <SheetErrorBoundary>
          <BTCDivergenceQuantSheet />
        </SheetErrorBoundary>
      ) : (
        <>
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

      {/* TAB SYSTEM NAV SELECTOR (Pro Command Dashboard) */}
      <div className="tab-switcher" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <button 
          onClick={() => setActiveTab('ranking')}
          className="tab-button"
          style={{
            background: activeTab === 'ranking' ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(245, 158, 11, 0.08) 100%)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${activeTab === 'ranking' ? '#f59e0b' : 'rgba(255,255,255,0.05)'}`,
            color: activeTab === 'ranking' ? '#fff' : 'var(--color-text-muted)',
            padding: '0.65rem 1.25rem',
            borderRadius: '10px',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.88rem',
            transition: 'all 0.3s ease'
          }}
        >
          🏆 Ranking 25 Estrategias
        </button>
        <button 
          onClick={() => setActiveTab('core')}
          className="tab-button"
          style={{
            background: activeTab === 'core' ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(59, 130, 246, 0.08) 100%)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${activeTab === 'core' ? '#3b82f6' : 'rgba(255,255,255,0.05)'}`,
            color: activeTab === 'core' ? '#fff' : 'var(--color-text-muted)',
            padding: '0.65rem 1.25rem',
            borderRadius: '10px',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.88rem',
            transition: 'all 0.3s ease'
          }}
        >
          🎯 Consenso & Modelos Activos (25-in-1)
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className="tab-button"
          style={{
            background: activeTab === 'history' ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(168, 85, 247, 0.08) 100%)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${activeTab === 'history' ? '#a855f7' : 'rgba(255,255,255,0.05)'}`,
            color: activeTab === 'history' ? '#fff' : 'var(--color-text-muted)',
            padding: '0.65rem 1.25rem',
            borderRadius: '10px',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.88rem',
            transition: 'all 0.3s ease'
          }}
        >
          📜 Historial Completo ({signalsHistory.length})
        </button>
      </div>

      {activeTab === 'ranking' ? (
        <StrategyRankingComponent 
          signalsHistory={signalsHistory} 
          onSelectStrategy={(stratKey) => {
            setSelectedStratFilter(stratKey);
            setActiveTab('history');
          }} 
        />
      ) : activeTab === 'core' ? (
        <section className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Section Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.4rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                🧠 25 Modelos Predictivos Cuantitativos BTC en Tiempo Real
              </h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                25 estrategias profesionales analizando simultáneamente el flujo, momentum y volatilidad de Bitcoin.
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
                25 Algoritmos Activos 24/7
              </span>
            )}
          </div>

          <StrategyGridComponent 
            allAnalysisMap={allAnalysisMap} 
            signalsHistory={signalsHistory} 
            analysisLoading={analysisLoading} 
            formatPrice={formatPrice} 
          />
        </section>
      ) : null}

      {/* HISTORIAL GENERAL DE LAS 25 ESTRATEGIAS (activeTab === 'history') */}
      {activeTab === 'history' ? (
        <section className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📜 Historial Global de Señales & Efectividad (25 Estrategias)
              </h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                Registro histórico completo de señales autogestionadas por el motor cuantitativo de Bitcoin.
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

          {/* Date & Strategy Filter Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, marginRight: '0.3rem' }}>📅 Rango Fecha:</span>
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

            <div className="strategy-filter-bar" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Estrategia:</span>
              {['ALL', ...Array.from({ length: 25 }, (_, i) => `Estrategia ${i + 1}`)].map((strat) => (
                <button
                  key={strat}
                  onClick={() => setSelectedStratFilter(strat)}
                  className="strategy-filter-btn"
                  style={{
                    padding: '0.3rem 0.6rem',
                    borderRadius: '6px',
                    fontSize: '0.73rem',
                    fontWeight: 600,
                    background: selectedStratFilter === strat ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${selectedStratFilter === strat ? '#f59e0b' : 'rgba(255,255,255,0.06)'}`,
                    color: selectedStratFilter === strat ? '#fff' : 'var(--color-text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {strat === 'ALL' ? 'Todas (E1-E25)' : strat.replace('Estrategia ', 'E')}
                </button>
              ))}
            </div>
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
                {SignalHistoryService.filterSignalsByDateRange(signalsHistory, dateRangeFilter)
                  .filter((sig) => selectedStratFilter === 'ALL' || sig.strategy === selectedStratFilter)
                  .slice(0, 1000)
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
                {SignalHistoryService.filterSignalsByDateRange(signalsHistory, dateRangeFilter)
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
        </>
      )}
    </div>
  );
}
