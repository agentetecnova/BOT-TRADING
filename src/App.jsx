import React, { useState, useEffect, useRef } from 'react';
import technicalAnalysisService from './services/TechnicalAnalysisService';
import marketDataService from './services/MarketDataService';
import backtestEngine from './services/BacktestEngine';
import predictiveOracleService from './services/PredictiveOracleService';
import aiSnapshotService from './services/AiSnapshotService';
import BTCMasterSheet from './components/BTCMasterSheet';
import BTCDivergenceQuantSheet from './components/BTCDivergenceQuantSheet';
import SignalHistoryService from './services/SignalHistoryService';
import StrategyRankingComponent from './components/StrategyRankingComponent';
import StrategyGridComponent from './components/StrategyGridComponent';
import StrategyMatrixComponent from './components/StrategyMatrixComponent';
import DecisionOraclePanel from './components/DecisionOraclePanel';
import LiveTradesComponent from './components/LiveTradesComponent';
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
          <h3>⚠️ Advertencia al cargar esta sección</h3>
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
  const [activeTab, setActiveTab] = useState('matrix'); // 'matrix' | 'live' | 'history' | 'telemetry'
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
  const [marketRegime, setMarketRegime] = useState(null);
  const [magneticZones, setMagneticZones] = useState(null);
  const [backtestMap, setBacktestMap] = useState({});
  const [oraclePrediction, setOraclePrediction] = useState(null);
  const [aiSnapshot, setAiSnapshot] = useState(null);

  // Signals History state
  const [signalsHistory, setSignalsHistory] = useState(() => SignalHistoryService.loadFromLocalStorage('btc_signals_history_backup'));
  const [selectedStratFilter, setSelectedStratFilter] = useState('ALL');
  const [dateRangeFilter, setDateRangeFilter] = useState('ALL');

  // Fresh refs to prevent stale closures inside 30s analysis polling
  const btcPriceRef = useRef(null);
  const cvd5mRef = useRef(0);
  const signalsHistoryRef = useRef(signalsHistory);

  useEffect(() => { btcPriceRef.current = btcPrice; }, [btcPrice]);
  useEffect(() => { cvd5mRef.current = cvd5m; }, [cvd5m]);
  useEffect(() => { signalsHistoryRef.current = signalsHistory; }, [signalsHistory]);

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

  // Poll & Sync Server 24/7 API for background signals and server state
  useEffect(() => {
    const fetchServerSignals = async () => {
      try {
        const localCache = SignalHistoryService.loadFromLocalStorage('btc_signals_history_backup');
        const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const urlsToTry = isLocalHost
          ? ['http://localhost:3000/api/signals/sync', 'https://bot-trading-2.onrender.com/api/signals/sync']
          : ['https://bot-trading-2.onrender.com/api/signals/sync'];

        let res = null;
        for (const url of urlsToTry) {
          try {
            res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientHistory: localCache })
            });
            if (res && res.ok) break;
          } catch (e) {
            // Reintentar con siguiente URL
          }
        }

        if (res && res.ok) {
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
        } else {
          setRenderServerStatus('local');
        }
      } catch (err) {
        setRenderServerStatus('local');
      }
    };

    fetchServerSignals();
    const interval = setInterval(fetchServerSignals, 15000);
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

          // Log real whale spot trades (>= $80,000) honestly without fabricating fake liquidations
          if (futuresStatusRef.current !== 'connected') {
            const tradeAmount = q * p;
            if (tradeAmount >= 80000) {
              const whaleSide = isSell ? 'VENTA BALLENA' : 'COMPRA BALLENA';
              addLog('Flujo Spot', `🐋 ${whaleSide} $${Math.round(tradeAmount).toLocaleString()} a $${p.toLocaleString()}`, isSell ? 'down' : 'up');
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

  // Monitor price updates to check and resolve active signals with live MFE tracking
  useEffect(() => {
    if (btcPrice === null) return;
    
    setSignalsHistory(prev => {
      let updated = false;
      const now = Date.now();

      const next = prev.map(sig => {
        if (sig.status !== 'PENDING') return sig;

        const isLong = sig.type === 'LONG';
        const rawGain = isLong
          ? ((btcPrice - sig.entry) / sig.entry) * 100
          : ((sig.entry - btcPrice) / sig.entry) * 100;
        const currentGain = parseFloat(rawGain.toFixed(2));

        const prevMax = typeof sig.maxFavorablePercent === 'number' ? sig.maxFavorablePercent : 0;
        const newMax = Math.max(prevMax, currentGain);
        const sigCreated = sig.createdAt || sig.timestamp || now;
        const elapsedMs = now - sigCreated;

        // 1. Check Take Profit
        if (isLong ? btcPrice >= sig.tp : btcPrice <= sig.tp) {
          updated = true;
          addLog('Sistema', `Señal ${sig.type} de ${sig.strategy} tocó TAKE PROFIT ✅ a $${formatPrice(btcPrice)} (+${sig.profitPercent}%)`, 'up');
          return {
            ...sig,
            status: 'TP',
            resolvedAt: now,
            exitPrice: btcPrice,
            pnlPercent: sig.profitPercent || Math.abs(currentGain),
            maxFavorablePercent: Math.max(newMax, sig.profitPercent || 2.0),
            durationMs: elapsedMs
          };
        }

        // 2. Check Stop Loss
        if (isLong ? btcPrice <= sig.sl : btcPrice >= sig.sl) {
          updated = true;
          addLog('Sistema', `Señal ${sig.type} de ${sig.strategy} tocó STOP LOSS ❌ a $${formatPrice(btcPrice)} (-${sig.riskPercent}%)`, 'down');
          return {
            ...sig,
            status: 'SL',
            resolvedAt: now,
            exitPrice: btcPrice,
            pnlPercent: -(sig.riskPercent || Math.abs(currentGain)),
            maxFavorablePercent: newMax,
            durationMs: elapsedMs
          };
        }

        // 3. Check 72-Hour Expiration (TTL)
        if (elapsedMs > 72 * 60 * 60 * 1000) {
          updated = true;
          addLog('Sistema', `Señal ${sig.type} de ${sig.strategy} finalizó por TIEMPO (72h) ⏱️ a $${formatPrice(btcPrice)} (${currentGain >= 0 ? '+' : ''}${currentGain}%)`, 'Sistema');
          return {
            ...sig,
            status: 'TIMEOUT',
            resolvedAt: now,
            exitPrice: btcPrice,
            pnlPercent: currentGain,
            maxFavorablePercent: newMax,
            durationMs: elapsedMs
          };
        }

        // 4. Update MFE if price moved further in favor
        if (newMax > prevMax) {
          updated = true;
          return {
            ...sig,
            maxFavorablePercent: newMax
          };
        }

        return sig;
      });

      if (updated) {
        SignalHistoryService.saveToLocalStorage('btc_signals_history_backup', next, 2000);
      }
      return updated ? next : prev;
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

      const spotClose = k5m && k5m.length > 0 ? parseFloat(k5m[k5m.length - 1].close) : null;
      const livePrice = btcPriceRef.current || spotClose;
      if (!btcPriceRef.current && spotClose) {
        setBtcPrice(spotClose);
        btcPriceRef.current = spotClose;
      }

      const marketContext = await marketDataService.fetchMarketContext(livePrice);
      const liveCvd = cvd5mRef.current || (k5m && k5m.length > 0 ? Math.round(k5m[k5m.length - 1].volumeDeltaUsd || 0) : 0);

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
      const res11 = technicalAnalysisService.runStrategy11(k5m, liveCvd);
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

      // Run Strategies 26 to 59 with live CVD and real marketContext
      const res26 = technicalAnalysisService.runStrategy26(k1h, marketContext?.fundingRate ?? null, marketContext);
      const res27 = technicalAnalysisService.runStrategy27(k15m);
      const res28 = technicalAnalysisService.runStrategy28(k1h, k1d);
      const res29 = technicalAnalysisService.runStrategy29(k1h, k15m);
      const res30 = technicalAnalysisService.runStrategy30(k5m, liveCvd);
      const res31 = technicalAnalysisService.runStrategy31(k15m);
      const res32 = technicalAnalysisService.runStrategy32(k1h);
      const res33 = technicalAnalysisService.runStrategy33(k15m);
      const res34 = technicalAnalysisService.runStrategy34(k1h);
      const res35 = technicalAnalysisService.runStrategy35(k1d, k1h);
      const res36 = technicalAnalysisService.runStrategy36(k15m);
      const res37 = technicalAnalysisService.runStrategy37(k1h);
      const res38 = technicalAnalysisService.runStrategy38(k15m);
      const res39 = technicalAnalysisService.runStrategy39(k1h);
      const res40 = technicalAnalysisService.runStrategy40(k1h);
      const res41 = technicalAnalysisService.runStrategy41(k1h);
      const res42 = technicalAnalysisService.runStrategy42(k15m);
      const res43 = technicalAnalysisService.runStrategy43(k4h);
      const res44 = technicalAnalysisService.runStrategy44(k1h);
      const res45 = technicalAnalysisService.runStrategy45(k1h, marketContext?.fundingRate ?? null, marketContext);
      const res46 = technicalAnalysisService.runStrategy46(k1h, marketContext);
      const res47 = technicalAnalysisService.runStrategy47(k1h);
      const res48 = technicalAnalysisService.runStrategy48(k4h, k1d);
      const res49 = technicalAnalysisService.runStrategy49(k1h, k4h);
      const res50 = technicalAnalysisService.runStrategy50(k1d);
      const res51 = technicalAnalysisService.runStrategy51(k15m, livePrice, marketContext);
      const res52 = technicalAnalysisService.runStrategy52(k5m, k15m, liveCvd, marketContext);
      const res53 = technicalAnalysisService.runStrategy53(k15m);
      const res54 = technicalAnalysisService.runStrategy54(k5m);
      const res55 = technicalAnalysisService.runStrategy55(k15m, k1h, marketContext);
      const res56 = technicalAnalysisService.runStrategy56(k15m, liveCvd, marketContext);
      const res57 = technicalAnalysisService.runStrategy57(k5m, liveCvd);
      const res58 = technicalAnalysisService.runStrategy58(klinesMap);
      const res59 = technicalAnalysisService.runStrategy59(k1h, marketContext?.fundingRate ?? null, marketContext);

      const partialResults = {
        'Estrategia 1': res1, 'Estrategia 2': res2, 'Estrategia 3': res3, 'Estrategia 4': res4, 'Estrategia 5': res5,
        'Estrategia 6': res6, 'Estrategia 7': res7, 'Estrategia 8': res8, 'Estrategia 9': res9, 'Estrategia 10': res10,
        'Estrategia 11': res11, 'Estrategia 12': res12, 'Estrategia 13': res13, 'Estrategia 14': res14, 'Estrategia 15': res15,
        'Estrategia 16': res16, 'Estrategia 17': res17, 'Estrategia 18': res18, 'Estrategia 19': res19, 'Estrategia 20': res20,
        'Estrategia 21': res21, 'Estrategia 22': res22, 'Estrategia 23': res23, 'Estrategia 24': res24,
        'Estrategia 26': res26, 'Estrategia 27': res27, 'Estrategia 28': res28, 'Estrategia 29': res29, 'Estrategia 30': res30,
        'Estrategia 31': res31, 'Estrategia 32': res32, 'Estrategia 33': res33, 'Estrategia 34': res34, 'Estrategia 35': res35,
        'Estrategia 36': res36, 'Estrategia 37': res37, 'Estrategia 38': res38, 'Estrategia 39': res39, 'Estrategia 40': res40,
        'Estrategia 41': res41, 'Estrategia 42': res42, 'Estrategia 43': res43, 'Estrategia 44': res44, 'Estrategia 45': res45,
        'Estrategia 46': res46, 'Estrategia 47': res47, 'Estrategia 48': res48, 'Estrategia 49': res49, 'Estrategia 50': res50,
        'Estrategia 51': res51, 'Estrategia 52': res52, 'Estrategia 53': res53, 'Estrategia 54': res54, 'Estrategia 55': res55,
        'Estrategia 56': res56, 'Estrategia 57': res57, 'Estrategia 58': res58, 'Estrategia 59': res59
      };

      // Walk-forward historical backtest on downloaded candles (cached per candle close)
      const btStats = backtestEngine.runFullBacktest({ k5m, k15m, k1h, k4h, k1d });
      setBacktestMap(btStats);

      const res25 = technicalAnalysisService.runStrategy25(partialResults, livePrice, btStats, marketContext);
      const res60 = technicalAnalysisService.runStrategy60(partialResults, signalsHistoryRef.current, btStats, livePrice, marketContext);
      const resultsMap = { ...partialResults, 'Estrategia 25': res25, 'Estrategia 60': res60 };

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

      // Calcular Consenso Maestro ponderado por backtest y microestructura real
      const masterConsensus = technicalAnalysisService.calculateMasterConsensus(resultsMap, btStats, marketContext);
      setMasterConsensusData(masterConsensus);

      // Calcular Régimen de Mercado y Zonas Magnéticas reales
      const regime = technicalAnalysisService.calculateMarketRegime(klinesMap);
      const magnetic = technicalAnalysisService.calculateMagneticZones(klinesMap, livePrice, marketContext);
      setMarketRegime(regime);
      setMagneticZones(magnetic);

      // Generar Predicción Unificada del Oráculo (fácil de leer para tomar decisiones)
      const oracle = predictiveOracleService.generateOraclePrediction({
        currentPrice: livePrice,
        k15m,
        k1h,
        k4h,
        k1d,
        k1w,
        cvd5m: liveCvd,
        masterConsensus,
        marketRegime: regime,
        magneticZones: magnetic,
        backtestStatsMap: btStats,
        marketContext
      });
      setOraclePrediction(oracle);

      // Procesar nuevas señales para las 60 estrategias
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

  // Poll hourly AI + On-Chain snapshot (GitHub ai-snapshot branch, zero Vercel rebuilds)
  useEffect(() => {
    let active = true;
    const loadSnapshot = async () => {
      const snap = await aiSnapshotService.fetchLatestSnapshot();
      if (active && snap) {
        setAiSnapshot(snap);
      }
    };
    loadSnapshot();
    const snapInterval = setInterval(loadSnapshot, 300000);
    return () => {
      active = false;
      clearInterval(snapInterval);
    };
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          <span style={{ color: '#eab308', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
            <span className="pulse-yellow bg-yellow-500" style={{ width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block' }}></span>
            En Curso
          </span>
          {typeof sig.maxFavorablePercent === 'number' && sig.maxFavorablePercent > 0 && (
            <span style={{ fontSize: '0.7rem', color: '#38bdf8' }}>
              Máx: +{sig.maxFavorablePercent}%
            </span>
          )}
        </div>
      );
    }
    if (sig.status === 'TP') {
      return (
        <span style={{ color: 'var(--color-up)', fontWeight: 700, background: 'rgba(0, 230, 118, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.78rem' }}>
          ✅ TP (+{sig.profitPercent || 2.0}%)
        </span>
      );
    }
    if (sig.status === 'SL') {
      return (
        <span style={{ color: 'var(--color-down)', fontWeight: 700, background: 'rgba(255, 23, 68, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.78rem' }}>
          ❌ SL (-{sig.riskPercent || 1.0}%)
        </span>
      );
    }
    if (sig.status === 'TIMEOUT') {
      const pnl = sig.pnlPercent || 0;
      return (
        <span style={{ color: '#94a3b8', fontWeight: 700, background: 'rgba(148, 163, 184, 0.12)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.78rem' }}>
          ⏱️ Exp (72h) {pnl >= 0 ? `+${pnl}%` : `${pnl}%`}
        </span>
      );
    }
    if (sig.status === 'INVALIDATED') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.78rem' }}>
            ⚠️ INVALIDADA
          </span>
          {sig.invalidationReason && (
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', maxWidth: '200px' }}>
              {sig.invalidationReason}
            </span>
          )}
        </div>
      );
    }
    return <span style={{ color: 'var(--color-text-muted)' }}>{sig.status}</span>;
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
            🛸 HOJA 1: Motor Cuantitativo (60 Estrategias)
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
          {/* HEADER PANEL STREAMLINED */}
          <header className="glass-panel" style={{ padding: '1.5rem 2rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem' }}>
            <div>
              <h1 style={{ fontSize: '1.8rem', background: 'linear-gradient(to right, #ffffff, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                🛸 Antigravity BTC Quant Terminal (60-in-1)
              </h1>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                Terminal predictiva especializada y motor cuantitativo 24/7 para Bitcoin.
              </p>
            </div>

            {/* Live Price & Status Widget */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div className={`glass-panel ${priceFlash ? `flash-${priceFlash}` : ''}`} style={{ padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', borderRadius: '12px' }}>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Precio Spot BTC</div>
                  <div className="font-mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                    {btcPrice ? `$${formatPrice(btcPrice)}` : 'Cargando...'}
                  </div>
                </div>
                {btcChange24h !== null && (
                  <span style={{ fontSize: '0.85rem', color: btcChange24h >= 0 ? 'var(--color-up)' : 'var(--color-down)', fontWeight: 800, padding: '0.25rem 0.6rem', borderRadius: '6px', background: btcChange24h >= 0 ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)' }}>
                    {btcChange24h >= 0 ? '▲' : '▼'} {Math.abs(btcChange24h).toFixed(2)}%
                  </span>
                )}
              </div>

              {/* Render / Live Engine status pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(16, 185, 129, 0.1)', padding: '0.6rem 1rem', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.25)', fontSize: '0.8rem', fontWeight: 700, color: '#10b981' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                {renderServerStatus === 'connected' ? '🟢 Nube 24/7 + Binance' : '🟢 Motor Binance en Vivo'}
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

          {/* 🎯 PANEL DE DECISIÓN CLARA (PREDICCIÓN UNIFICADA Y PLAN DE OPERACIÓN) */}
          <DecisionOraclePanel
            oracleData={oraclePrediction}
            marketRegime={marketRegime}
            aiSnapshot={aiSnapshot}
            onSelectStrategy={(stratKey) => {
              setSelectedStratFilter(stratKey);
              setActiveTab('history');
            }}
          />

          {/* TAB SYSTEM NAV SELECTOR */}
          <div className="tab-switcher" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            <button 
              onClick={() => setActiveTab('matrix')}
              className="tab-button"
              style={{
                background: activeTab === 'matrix' ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(59, 130, 246, 0.08) 100%)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${activeTab === 'matrix' ? '#3b82f6' : 'rgba(255,255,255,0.05)'}`,
                color: activeTab === 'matrix' ? '#fff' : 'var(--color-text-muted)',
                padding: '0.65rem 1.25rem',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.88rem',
                transition: 'all 0.3s ease'
              }}
            >
              📊 1. Matriz de 60 Modelos & Ranking
            </button>

            <button 
              onClick={() => setActiveTab('live')}
              className="tab-button"
              style={{
                background: activeTab === 'live' ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(16, 185, 129, 0.08) 100%)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${activeTab === 'live' ? '#10b981' : 'rgba(255,255,255,0.05)'}`,
                color: activeTab === 'live' ? '#fff' : 'var(--color-text-muted)',
                padding: '0.65rem 1.25rem',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'all 0.3s ease'
              }}
            >
              ⚡ 2. Operaciones en Vivo
              {signalsHistory.filter(s => s.status === 'PENDING').length > 0 && (
                <span style={{ padding: '0.1rem 0.45rem', borderRadius: '99px', background: '#10b981', color: '#000', fontSize: '0.72rem', fontWeight: 800 }}>
                  {signalsHistory.filter(s => s.status === 'PENDING').length}
                </span>
              )}
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
              📜 3. Historial de Señales ({signalsHistory.length})
            </button>

            <button 
              onClick={() => setActiveTab('telemetry')}
              className="tab-button"
              style={{
                background: activeTab === 'telemetry' ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(245, 158, 11, 0.08) 100%)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${activeTab === 'telemetry' ? '#f59e0b' : 'rgba(255,255,255,0.05)'}`,
                color: activeTab === 'telemetry' ? '#fff' : 'var(--color-text-muted)',
                padding: '0.65rem 1.25rem',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.88rem',
                transition: 'all 0.3s ease'
              }}
            >
              📡 4. Telemetría & Mercado
            </button>
          </div>

          {activeTab === 'matrix' ? (
            <StrategyMatrixComponent
              signalsHistory={signalsHistory}
              allAnalysisMap={allAnalysisMap}
              backtestMap={backtestMap}
              btcPrice={btcPrice}
              analysisLoading={analysisLoading}
              marketRegime={marketRegime}
              magneticZones={magneticZones}
              masterConsensusData={masterConsensusData}
              onFilterHistory={(stratKey) => {
                setSelectedStratFilter(stratKey);
                setActiveTab('history');
              }}
            />
          ) : activeTab === 'live' ? (
            <LiveTradesComponent
              signalsHistory={signalsHistory}
              btcPrice={btcPrice}
              onSelectStrategy={(stratKey) => {
                setSelectedStratFilter(stratKey);
                setActiveTab('history');
              }}
            />
          ) : activeTab === 'history' ? (
            <section className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.4rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    📜 Historial Auditado de Señales BTC
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
                  {['ALL', ...Array.from({ length: 60 }, (_, i) => `Estrategia ${i + 1}`)].map((strat) => (
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
                      {strat === 'ALL' ? 'Todas (E1-E60)' : strat.replace('Estrategia ', 'E')}
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
                      <th style={{ padding: '0.75rem' }}>Máx. a Favor (MFE)</th>
                      <th style={{ padding: '0.75rem' }}>Duración</th>
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
                        const mfe = typeof sig.maxFavorablePercent === 'number' && sig.maxFavorablePercent > 0 ? sig.maxFavorablePercent : (sig.status === 'TP' ? (sig.profitPercent || 2.0) : null);
                        const durationMs = sig.durationMs || (sig.resolvedAt ? (sig.resolvedAt - (sig.createdAt || sig.timestamp)) : (Date.now() - (sig.createdAt || sig.timestamp)));
                        
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
                            <td style={{ padding: '0.75rem', fontWeight: 700, color: '#38bdf8' }}>
                              {mfe !== null ? `+${mfe}% 🚀` : '--'}
                            </td>
                            <td style={{ padding: '0.75rem', color: '#94a3b8', fontSize: '0.78rem' }}>
                              {SignalHistoryService.formatDuration(durationMs)}
                            </td>
                            <td style={{ padding: '0.75rem' }}>
                              {renderSignalStatusBadge(sig)}
                            </td>
                          </tr>
                        );
                      })}
                    {SignalHistoryService.filterSignalsByDateRange(signalsHistory, dateRangeFilter)
                      .filter((sig) => selectedStratFilter === 'ALL' || sig.strategy === selectedStratFilter).length === 0 && (
                      <tr>
                        <td colSpan="9" style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                          Historial vacío para la selección actual. Esperando la generación de señales...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : activeTab === 'telemetry' ? (
            <section className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.4rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  📡 Telemetría Avanzada & Diagnóstico de Red
                </h2>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                  Datos complementarios del mercado (Order Flow CVD, Liquidaciones y Consola de Sync) separados del panel principal de señales.
                </p>
              </div>

              {/* Grid de Métricas de Mercado */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                
                {/* CVD Delta (5m) Widget */}
                <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>CVD Delta Acumulado (5m)</span>
                  <span className="font-mono" style={{ fontSize: '1.6rem', fontWeight: 800, color: cvd5m >= 0 ? 'var(--color-up)' : 'var(--color-down)' }}>
                    {cvd5m >= 0 ? '+' : ''}{cvd5m.toLocaleString('en-US')}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: cvdStatus.color, fontWeight: 700 }}>{cvdStatus.label}</span>
                  <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.5rem', lineHeight: '1.4' }}>
                    Diferencia entre ordenes agresivas de compra y venta. Útil para identificar divergencias de volumen.
                  </p>
                </div>

                {/* Liquidations (5m) Widget */}
                <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Volumen de Liquidados (5m)</span>
                  <div className="font-mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>
                    <span style={{ color: 'var(--color-down)' }}>${Math.round(liqStats5m.longLiqs / 1000)}k L</span>
                    {' / '}
                    <span style={{ color: 'var(--color-up)' }}>${Math.round(liqStats5m.shortLiqs / 1000)}k S</span>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: futuresStatus === 'failed' ? '#f59e0b' : 'var(--color-up)', fontWeight: 700 }}>
                    {futuresStatus === 'failed' ? '⚠️ WebSocket Simulado' : '🟢 WebSocket Directo Binance'}
                  </span>
                  <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.5rem', lineHeight: '1.4' }}>
                    Registra barridas de liquidez de posicionado apalancado en tiempo real.
                  </p>
                </div>

                {/* Estado de Conexión WS */}
                <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Conexión Binance WS</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: connectionStatus === 'connected' ? 'var(--color-up)' : connectionStatus === 'connecting' ? '#eab308' : 'var(--color-down)' }}></span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                      {connectionStatus === 'connected' ? 'Conectado 24/7' : connectionStatus === 'connecting' ? 'Reconectando...' : 'Desconectado'}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.5rem', lineHeight: '1.4' }}>
                    Flujo de ticks en tiempo real de Binance Spot y Futures.
                  </p>
                </div>

              </div>

              {/* SYNCHRONIZATION LOGGER TERMINAL */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: '260px' }}>
                <h3 style={{ fontSize: '1.1rem', color: '#fff', margin: 0 }}>
                  🖥️ Registro de Sincronización y Acciones Internas
                </h3>
                <div ref={consoleRef} style={{ flex: 1, background: '#030408', borderRadius: '10px', padding: '1rem', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '250px' }}>
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
              </div>
            </section>
          ) : null}

          <footer style={{ marginTop: 'auto', padding: '1.5rem 0 0', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            <div>Antigravity BTC Quant Terminal v2.0.0</div>
            <div>Motor Cuantitativo 24/7 de Efectividad Bitcoin</div>
          </footer>
        </>
      )}
    </div>
  );
}
