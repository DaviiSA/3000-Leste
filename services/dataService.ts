
import * as XLSX from 'xlsx';
import { Material, MaterialRequest, RequestedItem, StockMovement } from '../types';
import { RAW_MATERIALS as RAW_STRING, GOOGLE_SHEETS_WEBAPP_URL } from '../constants';

const STORAGE_KEYS = {
  MATERIALS: 'lv_leste_materials',
  REQUESTS: 'lv_leste_requests',
  MOVEMENTS: 'lv_leste_movements',
  VTR_STOCKS: 'lv_leste_vtr_stocks',
};

/**
 * Busca dados da planilha com timeout e proteção contra duplicidade
 */
export const fetchRemoteData = async (): Promise<{ 
  materials?: Material[], 
  requests?: MaterialRequest[],
  movements?: StockMovement[],
  vtrStocks?: any[]
} | null> => {
  const url = GOOGLE_SHEETS_WEBAPP_URL;
  if (!url) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${url}?t=${Date.now()}`, { 
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) throw new Error('Servidor indisponível');
    
    const data = await response.json();
    const result: { materials?: Material[], requests?: MaterialRequest[], movements?: StockMovement[], vtrStocks?: any[] } = {};

    // 1. Materiais
    if (data.materials && Array.isArray(data.materials)) {
      const materialsMap = new Map<string, Material>();
      data.materials.forEach((m: any) => {
        const codeStr = String(m.code || '').trim();
        if (!codeStr || codeStr === 'undefined' || codeStr === 'null') return;
        if (!materialsMap.has(codeStr)) {
          materialsMap.set(codeStr, {
            id: codeStr,
            code: codeStr,
            name: String(m.name || 'Sem Descrição').trim(),
            stock: Math.max(0, Number(m.stock) || 0)
          });
        }
      });
      result.materials = Array.from(materialsMap.values());
      localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(result.materials));
    }

    // 2. Solicitações
    if (data.requests && Array.isArray(data.requests)) {
      result.requests = data.requests.map((r: any) => {
        let items: RequestedItem[] = [];
        try {
          if (r.details) {
            const detailsRaw = typeof r.details === 'string' ? JSON.parse(r.details) : r.details;
            items = Array.isArray(detailsRaw) ? detailsRaw : [];
          }
        } catch (e) {
          console.warn('Erro ao processar itens:', r.id);
        }
        return {
          id: String(r.id || `PED-${Date.now()}`),
          vtr: String(r.vtr || 'S/V'),
          timestamp: r.timestamp || new Date().toISOString(),
          status: (r.status || 'Pendente') as any,
          items: items
        };
      }).filter((r: MaterialRequest) => r.items.length > 0);
      localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(result.requests));
    }

    // 3. Movimentações (Histórico)
    if (data.movements && Array.isArray(data.movements)) {
      result.movements = data.movements.map((m: any) => ({
        id: String(m.id),
        materialId: String(m.materialId),
        type: m.type as 'Entrada' | 'Saída',
        quantity: Number(m.quantity),
        timestamp: m.timestamp,
        reason: String(m.reason || '')
      }));
      localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(result.movements));
    }

    // 4. Estoque VTR
    if (data.vtrStocks && Array.isArray(data.vtrStocks)) {
      const vtrMap = new Map<string, RequestedItem[]>();
      data.vtrStocks.forEach((vs: any) => {
        const vtr = String(vs.vtr);
        let items: RequestedItem[] = [];
        try {
          if (vs.items) {
            const itemsRaw = typeof vs.items === 'string' ? JSON.parse(vs.items) : vs.items;
            items = Array.isArray(itemsRaw) ? itemsRaw : [];
          }
        } catch (e) {
          console.warn('Erro ao processar itens VTR:', vtr);
        }

        if (vtrMap.has(vtr)) {
          // Merge items for the same VTR if multiple rows exist
          const existingItems = vtrMap.get(vtr)!;
          items.forEach(newItem => {
            const idx = existingItems.findIndex(ei => ei.materialId === newItem.materialId);
            if (idx === -1) {
              existingItems.push(newItem);
            } else {
              existingItems[idx].quantity += newItem.quantity;
            }
          });
        } else {
          vtrMap.set(vtr, items);
        }
      });
      
      result.vtrStocks = Array.from(vtrMap.entries()).map(([vtr, items]) => ({
        vtr,
        items
      }));
      localStorage.setItem(STORAGE_KEYS.VTR_STOCKS, JSON.stringify(result.vtrStocks));
    }

    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Erro ao buscar dados remotos:', error);
    return null;
  }
};

export const initializeMaterials = (): Material[] => {
  const stored = localStorage.getItem(STORAGE_KEYS.MATERIALS);
  if (stored) {
    const parsed = JSON.parse(stored) as Material[];
    const map = new Map<string, Material>();
    parsed.forEach(m => { if(!map.has(m.code)) map.set(m.code, m); });
    return Array.from(map.values());
  }

  const materialsMap = new Map<string, Material>();
  RAW_STRING.split('\n').forEach((line) => {
    const parts = line.trim().split('\t');
    const code = parts[0]?.trim() || '';
    if (!code) return;

    if (!materialsMap.has(code)) {
      materialsMap.set(code, {
        id: code,
        code: code,
        name: parts.slice(1).join('\t')?.trim() || 'Material sem nome',
        stock: 0, 
      });
    }
  });

  return Array.from(materialsMap.values());
};

export const saveMaterials = (materials: Material[]) => localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(materials));
export const getRequests = (): MaterialRequest[] => JSON.parse(localStorage.getItem(STORAGE_KEYS.REQUESTS) || '[]');
export const saveRequests = (requests: MaterialRequest[]) => localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(requests));
export const getMovements = (): StockMovement[] => JSON.parse(localStorage.getItem(STORAGE_KEYS.MOVEMENTS) || '[]');
export const saveMovements = (movements: StockMovement[]) => localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(movements));
export const getVtrStocks = (): any[] => JSON.parse(localStorage.getItem(STORAGE_KEYS.VTR_STOCKS) || '[]');
export const saveVtrStocks = (stocks: any[]) => localStorage.setItem(STORAGE_KEYS.VTR_STOCKS, JSON.stringify(stocks));

export const exportToExcel = (data: any[], fileName: string) => {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, `${fileName}.xlsx`);
};

export const syncToGoogleSheets = async (data: { materials: Material[], requests: MaterialRequest[], movements: StockMovement[], vtrStocks: any[] }) => {
  const url = GOOGLE_SHEETS_WEBAPP_URL;
  if (!url) return false;

  try {
    const payload = {
      action: 'sync',
      materials: data.materials.map(m => ({ code: m.code, name: m.name, stock: m.stock })),
      requests: data.requests.map(r => ({ id: r.id, vtr: r.vtr, timestamp: r.timestamp, status: r.status, details: JSON.stringify(r.items) })),
      movements: data.movements.map(m => ({ id: m.id, materialId: m.materialId, type: m.type, quantity: m.quantity, timestamp: m.timestamp, reason: m.reason })),
      vtrStocks: data.vtrStocks.map(vs => ({ vtr: vs.vtr, items: JSON.stringify(vs.items) }))
    };

    const blob = new Blob([JSON.stringify(payload)], { type: 'text/plain;charset=utf-8' });
    await fetch(url, { method: 'POST', mode: 'no-cors', body: blob });
    return true;
  } catch (error) {
    console.error('Erro sync:', error);
    return false;
  }
};
