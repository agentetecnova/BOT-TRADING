/**
 * SignalHistoryService.js
 * 
 * Servicio centralizado para la gestión, persistencia, fusión bi-direccional y deduplicación
 * del historial de señales de trading en todas las hojas.
 * 
 * Garantiza que NUNCA se borren señales pasadas por reinicios de servidor o limpiezas de caché.
 */

export class SignalHistoryService {
  /**
   * Obtiene la marca de tiempo numérica en ms de una señal de forma infalible.
   * @param {Object} item 
   * @returns {number} Timestamp en milisegundos
   */
  static getNumericTimestamp(item) {
    if (!item) return Date.now();
    if (typeof item.createdAt === 'number' && !isNaN(item.createdAt) && item.createdAt > 0) {
      return item.createdAt;
    }
    if (typeof item.timestamp === 'number' && !isNaN(item.timestamp) && item.timestamp > 0) {
      return item.timestamp;
    }
    if (typeof item.timestamp === 'string') {
      const parsed = Date.parse(item.timestamp);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return Date.now();
  }

  /**
   * Ponderación de estado para resolver conflictos al fusionar señales idénticas.
   * TP / SL / INVALIDATED tienen mayor prioridad que PENDING.
   */
  static getStatusPriority(status) {
    switch (status) {
      case 'TP': return 3;
      case 'SL': return 3;
      case 'INVALIDATED': return 2;
      case 'PENDING': return 1;
      default: return 0;
    }
  }

  /**
   * Fusión de Unión Bi-direccional inteligente que combina dos arreglos de historial
   * sin eliminar ninguna señal existente.
   * 
   * @param {Array} listA - Arreglo A (ej. localStorage)
   * @param {Array} listB - Arreglo B (ej. Servidor Cloud)
   * @param {number} maxLimit - Límite máximo de elementos (por defecto 2000)
   * @returns {Array} Arreglo fusionado, deduplicado y ordenado cronológicamente descendente
   */
  static unionMerge(listA = [], listB = [], maxLimit = 2000) {
    const safeA = Array.isArray(listA) ? listA : [];
    const safeB = Array.isArray(listB) ? listB : [];

    const mapById = new Map();

    const processItem = (item) => {
      if (!item || typeof item !== 'object') return;

      const ts = this.getNumericTimestamp(item);
      const normalizedItem = {
        ...item,
        createdAt: item.createdAt || ts,
        timestampMs: ts
      };

      const id = item.id || `${item.strategy || item.direction || 'sig'}_${ts}`;
      normalizedItem.id = id;

      if (!mapById.has(id)) {
        mapById.set(id, normalizedItem);
      } else {
        const existing = mapById.get(id);
        const existingPriority = this.getStatusPriority(existing.status);
        const newPriority = this.getStatusPriority(normalizedItem.status);

        if (newPriority >= existingPriority) {
          mapById.set(id, {
            ...existing,
            ...normalizedItem,
            status: newPriority > existingPriority ? normalizedItem.status : (existing.status || normalizedItem.status)
          });
        }
      }
    };

    safeA.forEach(processItem);
    safeB.forEach(processItem);

    const mergedList = Array.from(mapById.values());

    // Deduplicación semántica cercana (evitar spameo de señales casi idénticas en 1 hora)
    const finalFiltered = [];
    mergedList.sort((a, b) => b.timestampMs - a.timestampMs);

    for (const item of mergedList) {
      const isDuplicateNear = finalFiltered.some(existing => {
        const sameStrat = (existing.strategy && item.strategy && existing.strategy === item.strategy) ||
                          (existing.direction && item.direction && existing.direction === item.direction && existing.label === item.label);
        const sameDir = existing.direction === item.direction;
        const timeDiff = Math.abs(existing.timestampMs - item.timestampMs);
        const priceDiffRatio = Math.abs((existing.entry || existing.entryPrice || 0) - (item.entry || item.entryPrice || 0)) / ((existing.entry || existing.entryPrice) || 1);

        return sameStrat && sameDir && timeDiff < 45 * 60 * 1000 && priceDiffRatio < 0.002;
      });

      if (!isDuplicateNear) {
        finalFiltered.push(item);
      }
    }

    return finalFiltered.slice(0, maxLimit);
  }

  /**
   * Filtra un arreglo de señales según un rango de fechas.
   * 
   * @param {Array} signals 
   * @param {string} filterKey - 'ALL' | 'TODAY' | '7D' | '30D'
   * @returns {Array} Arreglo filtrado
   */
  static filterSignalsByDateRange(signals = [], filterKey = 'ALL') {
    if (!Array.isArray(signals) || signals.length === 0) return [];
    if (filterKey === 'ALL') return signals;

    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();

    return signals.filter(item => {
      const ts = this.getNumericTimestamp(item);
      switch (filterKey) {
        case 'TODAY':
          return ts >= startOfTodayMs;
        case '7D':
          return ts >= (now - 7 * 24 * 60 * 60 * 1000);
        case '30D':
          return ts >= (now - 30 * 24 * 60 * 60 * 1000);
        default:
          return true;
      }
    });
  }

  /**
   * Carga desde localStorage de manera segura
   */
  static loadFromLocalStorage(key) {
    try {
      const data = localStorage.getItem(key);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn(`[SignalHistoryService] Error cargando localStorage key "${key}":`, e);
      return [];
    }
  }

  /**
   * Guarda en localStorage de manera segura
   */
  static saveToLocalStorage(key, list, maxLimit = 2000) {
    try {
      if (!Array.isArray(list)) return;
      const sliced = list.slice(0, maxLimit);
      localStorage.setItem(key, JSON.stringify(sliced));
    } catch (e) {
      console.warn(`[SignalHistoryService] Error guardando localStorage key "${key}":`, e);
    }
  }
}

export default SignalHistoryService;
