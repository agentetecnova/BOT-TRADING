import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import technicalAnalysisService from './src/services/TechnicalAnalysisService.js';
import marketDataService from './src/services/MarketDataService.js';
import backtestEngine from './src/services/BacktestEngine.js';
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

// Las señales se mantienen PENDING hasta tocar estrictamente TP o SL para un cálculo infalible de Win Rate %

// Agregar nuevas señales evitando duplicados PENDING de la misma estrategia
function addNewSignal(strategyName, strategyResult) {
  if (!strategyResult || !strategyResult.hasSignal || !strategyResult.signal) return;

  const hasPending = signalsHistory.some(sig => sig.strategy === strategyName && sig.status === 'PENDING');
  if (hasPending) return;

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
    maxFavorablePercent: 0,
    resolvedAt: null,
    exitPrice: null,
    pnlPercent: 0
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

    const marketContext = await marketDataService.fetchMarketContext(lastBtcPrice);
    const liveCvd = k5m && k5m.length > 0 ? Math.round(k5m[k5m.length - 1].volumeDeltaUsd || 0) : 0;

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
    const res26 = technicalAnalysisService.runStrategy26(k1h, marketContext?.fundingRate ?? null, marketContext);
    const res27 = technicalAnalysisService.runStrategy27(k15m);
    const res28 = technicalAnalysisService.runStrategy28(k1h, k1d);
    const res29 = technicalAnalysisService.runStrategy29(k1h, k15m);
    const res30 = technicalAnalysisService.runStrategy30(k5m, liveCvd);

    // Estrategias 31 a 59
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
    const res51 = technicalAnalysisService.runStrategy51(k15m, lastBtcPrice, marketContext);
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

    const btStats = backtestEngine.runFullBacktest({ k5m, k15m, k1h, k4h, k1d });
    const res25 = technicalAnalysisService.runStrategy25(partialResults, lastBtcPrice, btStats, marketContext);
    const res60 = technicalAnalysisService.runStrategy60(partialResults, signalsHistory, btStats, lastBtcPrice, marketContext);
    const resultsMap = { ...partialResults, 'Estrategia 25': res25, 'Estrategia 60': res60 };

    const masterConsensus = technicalAnalysisService.calculateMasterConsensus(resultsMap, btStats, marketContext);
    latestAnalysis = { ...resultsMap, masterConsensus };

    // Verificar TP / SL / MFE por precio en señales activas
    if (lastBtcPrice) {
      let historyUpdated = false;
      const now = Date.now();

      signalsHistory = signalsHistory.map(sig => {
        if (sig.status !== 'PENDING') return sig;

        const isLong = sig.type === 'LONG';
        const rawGain = isLong
          ? ((lastBtcPrice - sig.entry) / sig.entry) * 100
          : ((sig.entry - lastBtcPrice) / sig.entry) * 100;
        const currentGain = parseFloat(rawGain.toFixed(2));

        const prevMax = typeof sig.maxFavorablePercent === 'number' ? sig.maxFavorablePercent : 0;
        const newMax = Math.max(prevMax, currentGain);
        const sigCreated = sig.createdAt || sig.timestamp || now;
        const elapsedMs = now - sigCreated;

        // 1. Check Take Profit
        if (isLong ? lastBtcPrice >= sig.tp : lastBtcPrice <= sig.tp) {
          historyUpdated = true;
          log('SISTEMA 24/7', `Señal ${sig.type} ${sig.strategy} tocó TP ✅ a $${lastBtcPrice} (+${sig.profitPercent}%)`, 'success');
          return {
            ...sig,
            status: 'TP',
            resolvedAt: now,
            exitPrice: lastBtcPrice,
            pnlPercent: sig.profitPercent || Math.abs(currentGain),
            maxFavorablePercent: Math.max(newMax, sig.profitPercent || 2.0),
            durationMs: elapsedMs
          };
        }

        // 2. Check Stop Loss
        if (isLong ? lastBtcPrice <= sig.sl : lastBtcPrice >= sig.sl) {
          historyUpdated = true;
          log('SISTEMA 24/7', `Señal ${sig.type} ${sig.strategy} tocó SL ❌ a $${lastBtcPrice} (-${sig.riskPercent}%)`, 'error');
          return {
            ...sig,
            status: 'SL',
            resolvedAt: now,
            exitPrice: lastBtcPrice,
            pnlPercent: -(sig.riskPercent || Math.abs(currentGain)),
            maxFavorablePercent: newMax,
            durationMs: elapsedMs
          };
        }

        // 3. Check 72h TTL Timeout
        if (elapsedMs > 72 * 60 * 60 * 1000) {
          historyUpdated = true;
          log('SISTEMA 24/7', `Señal ${sig.type} ${sig.strategy} expiró por tiempo (72h) ⏱️ a $${lastBtcPrice} (${currentGain >= 0 ? '+' : ''}${currentGain}%)`, 'info');
          return {
            ...sig,
            status: 'TIMEOUT',
            resolvedAt: now,
            exitPrice: lastBtcPrice,
            pnlPercent: currentGain,
            maxFavorablePercent: newMax,
            durationMs: elapsedMs
          };
        }

        // 4. Update MFE if price moved further in favor
        if (newMax > prevMax) {
          historyUpdated = true;
          return {
            ...sig,
            maxFavorablePercent: newMax
          };
        }

        return sig;
      });

      if (historyUpdated) {
        saveDiskDatabase();
      }
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
app.get('/api/status', (req, res) => {
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

// Servir archivos estáticos del frontend (dist)
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Iniciar servidor HTTP y bucle 24/7
app.listen(PORT, () => {
  log('INICIO', `🟢 Servidor Bot Trading 24/7 activo en el puerto ${PORT}`);
  runContinuousAnalysis();
  setInterval(runContinuousAnalysis, 30000);
  startAutoKeepAlive();
});
