
import * as XLSX from 'xlsx';
import { Material, MaterialRequest, RequestedItem } from '../types';
import { RAW_MATERIALS as RAW_STRING, GOOGLE_SHEETS_WEBAPP_URL } from '../constants';

const STORAGE_KEYS = {
  MATERIALS: 'lv_leste_materials',
  REQUESTS: 'lv_leste_requests',
};

/**
 * Busca dados da planilha com timeout e proteção contra duplicidade
 */
export const fetchRemoteData = async (): Promise<{ materials?: Material[], requests?: MaterialRequest[] } | null> => {
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
    const result: { materials?: Material[], requests?: MaterialRequest[] } = {};

    // 1. Processamento de materiais com DEDUPLICAÇÃO ABSOLUTA por código
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

    // 2. Processamento de solicitações
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
      }).filter(r => r.items.length > 0); // Filtra pedidos vazios por segurança
      
      localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(result.requests));
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

export const saveMaterials = (materials: Material[]) => {
  localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(materials));
};

export const getRequests = (): MaterialRequest[] => {
  const stored = localStorage.getItem(STORAGE_KEYS.REQUESTS);
  return stored ? JSON.parse(stored) : [];
};

export const saveRequests = (requests: MaterialRequest[]) => {
  localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(requests));
};

export const exportToExcel = (data: any[], fileName: string) => {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, `${fileName}.xlsx`);
};

export const syncToGoogleSheets = async (data: { materials: Material[], requests: MaterialRequest[] }) => {
  const url = GOOGLE_SHEETS_WEBAPP_URL;
  if (!url) return false;

  try {
    const payload = {
      action: 'sync',
      materials: data.materials.map(m => ({
        code: m.code,
        name: m.name,
        stock: m.stock
      })),
      requests: data.requests.map(r => ({
        id: r.id,
        vtr: r.vtr,
        timestamp: r.timestamp,
        status: r.status,
        details: JSON.stringify(r.items)
      }))
    };

    const blob = new Blob([JSON.stringify(payload)], { type: 'text/plain;charset=utf-8' });
    
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors', 
      body: blob,
    });

    return true;
  } catch (error) {
    console.error('Erro sync:', error);
    return false;
  }
};
