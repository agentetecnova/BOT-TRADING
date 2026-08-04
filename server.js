import express from 'express';
import cors from 'cors';
import technicalAnalysisService from './src/services/TechnicalAnalysisService.js';
import btcMasterAnalysisService from './src/services/BTCMasterAnalysisService.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Estado del Servidor 24/7
let signalsHistory = [];
let masterSignalsHistory = [];
let latestAnalysis = {};
let latestMasterAnalysis = null;
let isRunningAnalysis = false;
let lastBtcPrice = null;

// Logger interno
function log(source, message, type = 'info') {
  const time = new Date().toISOString();
  console.log(`[${time}] [${source}] [${type.toUpperCase()}] ${message}`);
}

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
      if (score <= -2.5) {
        const pnl = parseFloat((((p - item.entryPrice) / item.entryPrice) * 100).toFixed(2));
        log('HOJA 2 24/7', `⚠️ Señal LONG INVALIDADA a $${p}`, 'warning');
        return {
          ...item,
          status: 'INVALIDATED',
          exitPrice: p,
          pnlPercent: pnl,
          resolvedAt: Date.now(),
          invalidationReason: `Giro de estrategia a bajista (Score: ${score})`
        };
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
      if (score >= 2.5) {
        const pnl = parseFloat((((item.entryPrice - p) / item.entryPrice) * 100).toFixed(2));
        log('HOJA 2 24/7', `⚠️ Señal SHORT INVALIDADA a $${p}`, 'warning');
        return {
          ...item,
          status: 'INVALIDATED',
          exitPrice: p,
          pnlPercent: pnl,
          resolvedAt: Date.now(),
          invalidationReason: `Giro de estrategia a alcista (Score: ${score})`
        };
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
      masterSignalsHistory.unshift(newSignalObj);
      if (masterSignalsHistory.length > 200) masterSignalsHistory.pop();
      log('HOJA 2 24/7', `Nueva Señal Maestra 24/7 registrada: ${newSignalObj.signalLabel} a $${newSignalObj.entryPrice}`, 'success');
    }
  }
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

  signalsHistory.unshift(newSignal);
  if (signalsHistory.length > 200) signalsHistory.pop(); // Mantener últimas 200

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

    // Evaluar invalidaciones
    processSignalInvalidations(resultsMap);

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
    masterHistoryCount: masterSignalsHistory.length
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

app.post('/api/master-signals/clear', (req, res) => {
  masterSignalsHistory = [];
  res.json({ status: 'ok', message: 'Historial de Hoja 2 limpiado en el servidor 24/7' });
});

// Iniciar servidor HTTP y bucle 24/7
app.listen(PORT, () => {
  log('INICIO', `🟢 Servidor Bot Trading 24/7 activo en el puerto ${PORT}`);
  runContinuousAnalysis();
  setInterval(runContinuousAnalysis, 30000);
});
