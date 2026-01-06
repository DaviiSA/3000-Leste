
import * as XLSX from 'xlsx';
import { Material, MaterialRequest, RequestedItem } from '../types';
import { RAW_MATERIALS as RAW_STRING, GOOGLE_SHEETS_WEBAPP_URL } from '../constants';

const STORAGE_KEYS = {
  MATERIALS: 'lv_leste_materials',
  REQUESTS: 'lv_leste_requests',
};

/**
 * Busca dados da planilha com timeout de segurança e remove duplicidade
 */
export const fetchRemoteData = async (): Promise<{ materials: Material[], requests: MaterialRequest[] } | null> => {
  const url = GOOGLE_SHEETS_WEBAPP_URL;
  if (!url) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 segundos

  try {
    const response = await fetch(`${url}?t=${Date.now()}`, { 
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) throw new Error('Servidor indisponível');
    
    const data = await response.json();
    
    // Processamento de materiais com DEDUPLICAÇÃO por código
    const materialsMap = new Map<string, Material>();
    
    (data.materials || []).forEach((m: any) => {
      const codeStr = String(m.code || '').trim();
      if (!codeStr) return;
      
      // Se o código já existe, mantemos apenas um (ou poderíamos somar, mas geralmente é erro de cadastro na planilha)
      if (!materialsMap.has(codeStr)) {
        materialsMap.set(codeStr, {
          id: codeStr,
          code: codeStr,
          name: String(m.name || 'Sem descrição').trim(),
          stock: Number(m.stock) || 0
        });
      }
    });

    const materials = Array.from(materialsMap.values());

    // Processamento de solicitações
    const requests: MaterialRequest[] = (data.requests || []).map((r: any) => {
      let items: RequestedItem[] = [];
      try {
        if (r.details) {
          const detailsRaw = typeof r.details === 'string' ? JSON.parse(r.details) : r.details;
          items = Array.isArray(detailsRaw) ? detailsRaw : [];
        }
      } catch (e) {
        console.warn('Erro itens pedido:', r.id);
      }

      return {
        id: String(r.id || 'N/A'),
        vtr: String(r.vtr || 'S/V'),
        timestamp: r.timestamp || new Date().toISOString(),
        status: (r.status || 'Pendente') as any,
        items: items
      };
    });

    localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(materials));
    localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(requests));

    return { materials, requests };
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Erro ao buscar dados:', error);
    return null;
  }
};

export const initializeMaterials = (): Material[] => {
  const stored = localStorage.getItem(STORAGE_KEYS.MATERIALS);
  if (stored) return JSON.parse(stored);

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
        itemDetails: JSON.stringify(r.items)
      }))
    };

    // Usando text/plain para evitar problemas de CORS preflight no Google Script
    const blob = new Blob([JSON.stringify(payload)], { type: 'text/plain;charset=utf-8' });
    
    const response = await fetch(url, {
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
