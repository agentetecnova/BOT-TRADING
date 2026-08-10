import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import technicalAnalysisService from './src/services/TechnicalAnalysisService.js';
import btcMasterAnalysisService from './src/services/BTCMasterAnalysisService.js';
import divergenceQuantService from './src/services/DivergenceQuantService.js';
import SignalHistoryService from './src/services/SignalHistoryService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SIGNALS_FILE = path.join(__dirname, 'signals_history_db.json');
const MASTER_SIGNALS_FILE = path.join(__dirname, 'master_signals_history_db.json');
const HOJA3_SIGNALS_FILE = path.join(__dirname, 'hoja3_signals_history_db.json');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Estado del Servidor 24/7
let signalsHistory = [];
let masterSignalsHistory = [];
let hoja3SignalsHistory = [];
let latestAnalysis = {};
let latestMasterAnalysis = null;
let latestHoja3Analysis = null;
let isRunningAnalysis = false;
let lastBtcPrice = null;

// Logger interno
function log(source, message, type = 'info') {
  const time = new Date().toISOString();
  console.log(`[${time}] [${source}] [${type.toUpperCase()}] ${message}`);
}

// Persistencia en Disco del Servidor
function loadDiskDatabase() {
  try {
    if (fs.existsSync(SIGNALS_FILE)) {
      const data = fs.readFileSync(SIGNALS_FILE, 'utf8');
      const loaded = JSON.parse(data);
      signalsHistory = SignalHistoryService.unionMerge([], loaded, 2000);
      console.log(`[PERSISTENCIA 24/7] Cargadas ${signalsHistory.length} señales de Hoja 1 desde disco.`);
    }
  } catch (e) {
    console.error('[PERSISTENCIA 24/7] Error cargando signals_history_db.json:', e.message);
  }

  try {
    if (fs.existsSync(MASTER_SIGNALS_FILE)) {
      const data = fs.readFileSync(MASTER_SIGNALS_FILE, 'utf8');
      const loaded = JSON.parse(data);
      masterSignalsHistory = SignalHistoryService.unionMerge([], loaded, 2000);
      console.log(`[PERSISTENCIA 24/7] Cargadas ${masterSignalsHistory.length} señales de Hoja 2 desde disco.`);
    }
  } catch (e) {
    console.error('[PERSISTENCIA 24/7] Error cargando master_signals_history_db.json:', e.message);
  }

  try {
    if (fs.existsSync(HOJA3_SIGNALS_FILE)) {
      const data = fs.readFileSync(HOJA3_SIGNALS_FILE, 'utf8');
      const loaded = JSON.parse(data);
      hoja3SignalsHistory = SignalHistoryService.unionMerge([], loaded, 2000);
      console.log(`[PERSISTENCIA 24/7] Cargadas ${hoja3SignalsHistory.length} señales de Hoja 3 desde disco.`);
    }
  } catch (e) {
    console.error('[PERSISTENCIA 24/7] Error cargando hoja3_signals_history_db.json:', e.message);
  }
}

function saveDiskDatabase() {
  try {
    fs.writeFileSync(SIGNALS_FILE, JSON.stringify(signalsHistory.slice(0, 2000), null, 2), 'utf8');
  } catch (e) {
    console.error('[PERSISTENCIA 24/7] Error guardando signals_history_db.json:', e.message);
  }

  try {
    fs.writeFileSync(MASTER_SIGNALS_FILE, JSON.stringify(masterSignalsHistory.slice(0, 2000), null, 2), 'utf8');
  } catch (e) {
    console.error('[PERSISTENCIA 24/7] Error guardando master_signals_history_db.json:', e.message);
  }

  try {
    fs.writeFileSync(HOJA3_SIGNALS_FILE, JSON.stringify(hoja3SignalsHistory.slice(0, 2000), null, 2), 'utf8');
  } catch (e) {
    console.error('[PERSISTENCIA 24/7] Error guardando hoja3_signals_history_db.json:', e.message);
  }
}

// Cargar base de datos al iniciar
loadDiskDatabase();

// Procesar señales de Hoja 2 en el servidor 24/7 (Sincronizado para todos los dispositivos)
function processMasterSignals247(freshData) {
  if (!freshData || !freshData.currentPrice || !freshData.priceZones) return;

  const p = freshData.currentPrice;
  const score = freshData.compositeScore;
  const z = freshData.priceZones;
  const sigText = freshData.signal;
  const sigEmoji = freshData.signalEmoji;
  const isActionable = Math.abs(score) >= 1.0;

  // 1. Evaluar señales PENDING existentes en el servidor
  masterSignalsHistory = masterSignalsHistory.map(item => {
    if (item.status !== 'PENDING') return item;

    if (item.direction === 'LONG') {
      if (p >= item.tp1) {
        const pnl = parseFloat((((p - item.entryPrice) / item.entryPrice) * 100).toFixed(2));
        log('HOJA 2 24/7', `✅ Señal LONG tocó TP a $${p} (+${pnl}%)`, 'success');
        return { ...item, status: 'TP', exitPrice: p, pnlPercent: pnl, resolvedAt: Date.now() };
      }
      if (p <= item.sl) {
        const pnl = parseFloat((((p - item.entryPrice) / item.entryPrice) * 100).toFixed(2));
        log('HOJA 2 24/7', `❌ Señal LONG tocó SL a $${p} (${pnl}%)`, 'error');
        return { ...item, status: 'SL', exitPrice: p, pnlPercent: pnl, resolvedAt: Date.now() };
      }
    } else if (item.direction === 'SHORT') {
      if (p <= item.tp1) {
        const pnl = parseFloat((((item.entryPrice - p) / item.entryPrice) * 100).toFixed(2));
        log('HOJA 2 24/7', `✅ Señal SHORT tocó TP a $${p} (+${pnl}%)`, 'success');
        return { ...item, status: 'TP', exitPrice: p, pnlPercent: pnl, resolvedAt: Date.now() };
      }
      if (p >= item.sl) {
        const pnl = parseFloat((((item.entryPrice - p) / item.entryPrice) * 100).toFixed(2));
        log('HOJA 2 24/7', `❌ Señal SHORT tocó SL a $${p} (${pnl}%)`, 'error');
        return { ...item, status: 'SL', exitPrice: p, pnlPercent: pnl, resolvedAt: Date.now() };
      }
    }
    return item;
  });

  // 2. Registrar nueva señal si es accionable y no hay una PENDING idéntica
  if (isActionable) {
    const direction = score > 0 ? 'LONG' : 'SHORT';
    const setup = direction === 'LONG' ? z.longSetup : z.shortSetup;
    const hasPendingSameDir = masterSignalsHistory.some(item => item.status === 'PENDING' && item.direction === direction);

    if (!hasPendingSameDir && setup && setup.tp1 && setup.sl) {
      const nowStr = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'medium' });
      const newSignalObj = {
        id: `master_${Date.now()}`,
        timestamp: nowStr,
        createdAt: Date.now(),
        direction,
        signalLabel: `${sigText} ${sigEmoji}`,
        score,
        confidencePercent: freshData.confidencePercent || 80,
        entryPrice: Math.round(p),
        tp1: setup.tp1,
        tp2: setup.tp2,
        sl: setup.sl,
        rr: setup.rr,
        status: 'PENDING',
        exitPrice: null,
        pnlPercent: 0,
        invalidationReason: null
      };
      masterSignalsHistory = SignalHistoryService.unionMerge([newSignalObj], masterSignalsHistory, 2000);
      log('HOJA 2 24/7', `Nueva Señal Maestra 24/7 registrada: ${newSignalObj.signalLabel} a $${newSignalObj.entryPrice}`, 'success');
      saveDiskDatabase();
    }
  }
}

// Procesar señales de Hoja 3 (Divergencias + Quant Squeeze 24/7)
function processHoja3Signals247(freshData) {
  if (!freshData || !freshData.currentPrice || !freshData.activeSignals) return;
  const p = freshData.currentPrice;

  hoja3SignalsHistory = hoja3SignalsHistory.map(item => {
    if (item.status !== 'PENDING') return item;
    if (item.direction === 'LONG') {
      if (p >= item.tp1) {
        const pnl = parseFloat((((p - item.entry) / item.entry) * 100).toFixed(2));
        log('HOJA 3 24/7', `✅ Señal HOJA 3 LONG tocó TP a $${p} (+${pnl}%)`, 'success');
        return { ...item, status: 'TP', exitPrice: p, pnlPercent: pnl, resolvedAt: Date.now() };
      }
      if (p <= item.sl) {
        const pnl = parseFloat((((p - item.entry) / item.entry) * 100).toFixed(2));
        log('HOJA 3 24/7', `❌ Señal HOJA 3 LONG tocó SL a $${p} (${pnl}%)`, 'error');
        return { ...item, status: 'SL', exitPrice: p, pnlPercent: pnl, resolvedAt: Date.now() };
      }
    } else if (item.direction === 'SHORT') {
      if (p <= item.tp1) {
        const pnl = parseFloat((((item.entry - p) / item.entry) * 100).toFixed(2));
        log('HOJA 3 24/7', `✅ Señal HOJA 3 SHORT tocó TP a $${p} (+${pnl}%)`, 'success');
        return { ...item, status: 'TP', exitPrice: p, pnlPercent: pnl, resolvedAt: Date.now() };
      }
      if (p >= item.sl) {
        const pnl = parseFloat((((item.entry - p) / item.entry) * 100).toFixed(2));
        log('HOJA 3 24/7', `❌ Señal HOJA 3 SHORT tocó SL a $${p} (${pnl}%)`, 'error');
        return { ...item, status: 'SL', exitPrice: p, pnlPercent: pnl, resolvedAt: Date.now() };
      }
    }
    return item;
  });

  freshData.activeSignals.forEach(newSig => {
    const hasPending = hoja3SignalsHistory.some(item => item.strategy === newSig.strategy && item.status === 'PENDING');
    if (!hasPending) {
      const nowStr = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'medium' });
      const itemToAdd = {
        ...newSig,
        timestamp: nowStr,
        createdAt: Date.now(),
        pnlPercent: 0
      };
      hoja3SignalsHistory = SignalHistoryService.unionMerge([itemToAdd], hoja3SignalsHistory, 2000);
      log('HOJA 3 24/7', `Nueva Señal Hoja 3 registrada: ${newSig.label} a $${newSig.entry}`, 'success');
    }
  });

  saveDiskDatabase();
}

// Reevaluar e invalidar señales en estado PENDING
function processSignalInvalidations(resultsMap) {
  let updated = false;
  signalsHistory = signalsHistory.map(sig => {
    if (sig.status !== 'PENDING') return sig;

    const freshRes = resultsMap[sig.strategy];
    if (!freshRes) return sig;

    const check = technicalAnalysisService.checkSignalInvalidation(sig, freshRes, lastBtcPrice);
    if (check.isInvalidated) {
      updated = true;
      const currentExitPrice = lastBtcPrice || sig.entry;
      log('ALGORITMO 24/7', `⚠️ Señal ${sig.type} de ${sig.strategy} INVALIDADA PRECOZMENTE a $${currentExitPrice}. Motivo: ${check.reason}`, 'warning');
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

  if (updated) saveDiskDatabase();
}

// Agregar nuevas señales evitando duplicados PENDING de la misma estrategia
function addNewSignal(strategyName, strategyResult) {
  if (!strategyResult || !strategyResult.hasSignal || !strategyResult.signal) return;

  const hasPending = signalsHistory.some(sig => sig.strategy === strategyName && sig.status === 'PENDING');
  if (hasPending) return;

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

  signalsHistory = SignalHistoryService.unionMerge([newSignal], signalsHistory, 2000);
  saveDiskDatabase();

  log('ALGORITMO 24/7', `Nueva señal ${sig.type} generada por ${strategyName} a $${sig.entry}`, 'success');
}

// Ciclo de Análisis Técnico continuo (cada 30 segundos)
async function runContinuousAnalysis() {
  if (isRunningAnalysis) return;
  isRunningAnalysis = true;

  try {
    const [k5m, k15m, k1h, k4h, k1d, k1w] = await Promise.all([
      technicalAnalysisService.fetchKlines('BTCUSDT', '5m', 1000),
      technicalAnalysisService.fetchKlines('BTCUSDT', '15m', 1000),
      technicalAnalysisService.fetchKlines('BTCUSDT', '1h', 1000),
      technicalAnalysisService.fetchKlines('BTCUSDT', '4h', 1000),
      technicalAnalysisService.fetchKlines('BTCUSDT', '1d', 100),
      technicalAnalysisService.fetchKlines('BTCUSDT', '1w', 50)
    ]);

    if (k15m && k15m.length > 0) {
      lastBtcPrice = k15m[k15m.length - 1].close;
    }

    const klinesMap = { '5m': k5m, '15m': k15m, '1h': k1h, '4h': k4h };

    const res1 = technicalAnalysisService.runStrategy1(k15m);
    const res2 = technicalAnalysisService.runStrategy2(klinesMap);
    const res3 = technicalAnalysisService.runStrategy3(klinesMap);
    const res4 = technicalAnalysisService.runStrategy4(k1w, k1d);
    const res5 = technicalAnalysisService.runStrategy5(k1h);
    const res6 = technicalAnalysisService.runStrategy6(k15m);
    const res7 = technicalAnalysisService.runStrategy7(k1h);
    const res8 = technicalAnalysisService.runStrategy8(k1h);
    const res9 = technicalAnalysisService.runStrategy9(k4h);
    const res10 = technicalAnalysisService.runStrategy10(k1h);
    const res11 = technicalAnalysisService.runStrategy11(k5m, 0);
    const res12 = technicalAnalysisService.runStrategy12(k5m);
    const res13 = technicalAnalysisService.runStrategy13(k15m);
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

    const masterConsensus = technicalAnalysisService.calculateMasterConsensus(resultsMap);
    latestAnalysis = { ...resultsMap, masterConsensus };

    // Verificar TP / SL por precio en señales activas
    if (lastBtcPrice) {
      signalsHistory = signalsHistory.map(sig => {
        if (sig.status !== 'PENDING') return sig;
        if (sig.type === 'LONG') {
          if (lastBtcPrice >= sig.tp) {
            log('SISTEMA 24/7', `Señal LONG ${sig.strategy} tocó TP ✅ a $${lastBtcPrice}`, 'success');
            return { ...sig, status: 'TP', resolvedAt: Date.now(), exitPrice: lastBtcPrice };
          }
          if (lastBtcPrice <= sig.sl) {
            log('SISTEMA 24/7', `Señal LONG ${sig.strategy} tocó SL ❌ a $${lastBtcPrice}`, 'error');
            return { ...sig, status: 'SL', resolvedAt: Date.now(), exitPrice: lastBtcPrice };
          }
        } else {
          if (lastBtcPrice <= sig.tp) {
            log('SISTEMA 24/7', `Señal SHORT ${sig.strategy} tocó TP ✅ a $${lastBtcPrice}`, 'success');
            return { ...sig, status: 'TP', resolvedAt: Date.now(), exitPrice: lastBtcPrice };
          }
          if (lastBtcPrice >= sig.sl) {
            log('SISTEMA 24/7', `Señal SHORT ${sig.strategy} tocó SL ❌ a $${lastBtcPrice}`, 'error');
            return { ...sig, status: 'SL', resolvedAt: Date.now(), exitPrice: lastBtcPrice };
          }
        }
        return sig;
      });
    }

    // Agregar nuevas señales
    Object.entries(resultsMap).forEach(([stratName, res]) => {
      addNewSignal(stratName, res);
    });

    // Ejecutar Análisis de Hoja 2 (BTC Master Pro 24/7)
    try {
      const masterRes = await btcMasterAnalysisService.runFullMasterAnalysis();
      if (masterRes.success) {
        latestMasterAnalysis = masterRes.data;
        processMasterSignals247(masterRes.data);
      }
    } catch (mErr) {
      log('HOJA 2 24/7', `Error en ciclo de Hoja 2: ${mErr.message}`, 'error');
    }

    // Ejecutar Análisis de Hoja 3 (Divergencias + Quant Squeeze 24/7)
    try {
      const h3Res = await divergenceQuantService.runFullDivergenceQuantAnalysis();
      if (h3Res.success) {
        latestHoja3Analysis = h3Res.data;
        processHoja3Signals247(h3Res.data);
      }
    } catch (h3Err) {
      log('HOJA 3 24/7', `Error en ciclo de Hoja 3: ${h3Err.message}`, 'error');
    }

  } catch (err) {
    log('ERROR 24/7', `Error en ciclo de análisis: ${err.message}`, 'error');
  } finally {
    isRunningAnalysis = false;
  }
}

// Rutas API HTTP
app.get('/', (req, res) => {
  res.json({
    service: 'Bot Trading 24/7 Engine',
    status: 'ONLINE',
    uptimeSeconds: Math.floor(process.uptime()),
    lastBtcPrice,
    pendingSignalsCount: signalsHistory.filter(s => s.status === 'PENDING').length,
    totalSignalsHistory: signalsHistory.length,
    masterConsensus: latestAnalysis.masterConsensus || null,
    hoja2Active: !!latestMasterAnalysis,
    hoja3Active: !!latestHoja3Analysis,
    masterHistoryCount: masterSignalsHistory.length,
    hoja3HistoryCount: hoja3SignalsHistory.length
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/api/signals', (req, res) => {
  res.json({
    btcPrice: lastBtcPrice,
    history: signalsHistory,
    latestAnalysis,
    masterConsensus: latestAnalysis.masterConsensus || null
  });
});

app.get('/api/master-analysis', (req, res) => {
  res.json({
    status: 'ok',
    btcPrice: lastBtcPrice,
    data: latestMasterAnalysis
  });
});

app.get('/api/master-signals', (req, res) => {
  res.json({
    status: 'ok',
    btcPrice: lastBtcPrice,
    history: masterSignalsHistory,
    data: latestMasterAnalysis
  });
});

app.get('/api/hoja3-analysis', (req, res) => {
  res.json({
    status: 'ok',
    btcPrice: lastBtcPrice,
    data: latestHoja3Analysis
  });
});

app.get('/api/hoja3-signals', (req, res) => {
  res.json({
    status: 'ok',
    btcPrice: lastBtcPrice,
    history: hoja3SignalsHistory,
    data: latestHoja3Analysis
  });
});

app.post('/api/hoja3-signals/sync', (req, res) => {
  try {
    const { clientHistory } = req.body;
    if (Array.isArray(clientHistory) && clientHistory.length > 0) {
      hoja3SignalsHistory = SignalHistoryService.unionMerge(hoja3SignalsHistory, clientHistory, 2000);
      saveDiskDatabase();
      log('HOJA 3 24/7', `Sincronizadas ${clientHistory.length} señales de Hoja 3 desde respaldo de cliente. Total: ${hoja3SignalsHistory.length}`, 'info');
    }
  } catch (e) {
    console.error('[Sync Hoja 3 Error]:', e.message);
  }
  res.json({
    status: 'ok',
    history: hoja3SignalsHistory
  });
});

app.post('/api/hoja3-signals/clear', (req, res) => {
  hoja3SignalsHistory = [];
  saveDiskDatabase();
  res.json({ status: 'ok', message: 'Historial de Hoja 3 limpiado en el servidor 24/7' });
});

app.post('/api/master-signals/sync', (req, res) => {
  try {
    const { clientHistory } = req.body;
    if (Array.isArray(clientHistory) && clientHistory.length > 0) {
      masterSignalsHistory = SignalHistoryService.unionMerge(masterSignalsHistory, clientHistory, 2000);
      saveDiskDatabase();
      log('HOJA 2 24/7', `Sincronizadas ${clientHistory.length} señales de Hoja 2 desde respaldo de cliente. Total: ${masterSignalsHistory.length}`, 'info');
    }
  } catch (e) {
    console.error('[Sync Master Error]:', e.message);
  }
  res.json({
    status: 'ok',
    history: masterSignalsHistory
  });
});

app.post('/api/signals/sync', (req, res) => {
  try {
    const { clientHistory } = req.body;
    if (Array.isArray(clientHistory) && clientHistory.length > 0) {
      signalsHistory = SignalHistoryService.unionMerge(signalsHistory, clientHistory, 2000);
      saveDiskDatabase();
      log('ALGORITMO 24/7', `Sincronizadas ${clientHistory.length} señales de Hoja 1 desde respaldo de cliente. Total: ${signalsHistory.length}`, 'info');
    }
  } catch (e) {
    console.error('[Sync Signals Error]:', e.message);
  }
  res.json({
    status: 'ok',
    history: signalsHistory
  });
});

app.post('/api/master-signals/clear', (req, res) => {
  masterSignalsHistory = [];
  saveDiskDatabase();
  res.json({ status: 'ok', message: 'Historial de Hoja 2 limpiado en el servidor 24/7' });
});

// Auto-KeepAlive Pinger Automático (Mantiene el servidor 100% activo 24/7 sin suspensiones)
function startAutoKeepAlive() {
  const SERVER_URL = process.env.RENDER_EXTERNAL_URL || 'https://bot-trading-2.onrender.com';
  
  const sendKeepAlivePing = async () => {
    try {
      // 1. Direct Public HTTP Ping (Genera tráfico entrante público en Render)
      const res = await fetch(`${SERVER_URL}/api/health`, { cache: 'no-cache' });
      if (res.ok) {
        log('AUTO-KEEPALIVE 24/7', '🟢 Ping de mantenimiento automático enviado. Servidor 100% ACTIVO', 'info');
      }
    } catch (err) {
      log('AUTO-KEEPALIVE 24/7', `Reintentando ping secundario por proxy...`, 'warning');
      try {
        // 2. Secondary Proxy Ping via public edge router
        await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(SERVER_URL + '/api/health')}`);
      } catch (e2) {}
    }
  };

  // Enviar un ping a los 10s del inicio y luego cada 4 minutos (240.000 ms)
  setTimeout(sendKeepAlivePing, 10000);
  setInterval(sendKeepAlivePing, 4 * 60 * 1000);
}

// Iniciar servidor HTTP y bucle 24/7
app.listen(PORT, () => {
  log('INICIO', `🟢 Servidor Bot Trading 24/7 activo en el puerto ${PORT}`);
  runContinuousAnalysis();
  setInterval(runContinuousAnalysis, 30000);
  startAutoKeepAlive();
});
