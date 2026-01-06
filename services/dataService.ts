
import * as XLSX from 'xlsx';
import { Material, MaterialRequest, RequestedItem } from '../types';
import { RAW_MATERIALS as RAW_STRING, GOOGLE_SHEETS_WEBAPP_URL } from '../constants';

const STORAGE_KEYS = {
  MATERIALS: 'lv_leste_materials',
  REQUESTS: 'lv_leste_requests',
};

export const fetchRemoteData = async (): Promise<{ materials: Material[], requests: MaterialRequest[] } | null> => {
  const url = GOOGLE_SHEETS_WEBAPP_URL;
  if (!url) return null;

  try {
    const response = await fetch(`${url}?t=${Date.now()}`);
    const data = await response.json();
    
    // Mapeia materiais usando CODE como ID único e estável
    const materials: Material[] = (data.materials || []).map((m: any) => ({
      id: String(m.code),
      code: String(m.code),
      name: m.name || 'Sem nome',
      stock: Number(m.stock) || 0
    }));

    // Mapeia pedidos tratando a coluna de detalhes (itens)
    const requests: MaterialRequest[] = (data.requests || []).map((r: any) => {
      let items: RequestedItem[] = [];
      try {
        if (r.details) {
          // Se já for um objeto/array, usa direto. Se for string, faz parse.
          items = typeof r.details === 'string' ? JSON.parse(r.details) : r.details;
        }
      } catch (e) {
        console.warn('Erro ao ler itens do pedido:', r.id);
      }

      return {
        id: String(r.id),
        vtr: String(r.vtr),
        timestamp: r.timestamp,
        status: (r.status || 'Pendente') as any,
        items: Array.isArray(items) ? items : []
      };
    });

    // Salva no cache local
    localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(materials));
    localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(requests));

    return { materials, requests };
  } catch (error) {
    console.error('Erro ao buscar dados remotos:', error);
    return null;
  }
};

export const initializeMaterials = (): Material[] => {
  const stored = localStorage.getItem(STORAGE_KEYS.MATERIALS);
  if (stored) return JSON.parse(stored);

  return RAW_STRING.split('\n').map((line) => {
    const parts = line.trim().split('\t');
    const code = parts[0]?.trim() || 'S/C';
    return {
      id: code,
      code: code,
      name: parts.slice(1).join('\t')?.trim() || 'Material sem nome',
      stock: 0, 
    };
  });
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

    // Usamos blob para garantir compatibilidade com o Google Apps Script
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors', // Necessário para evitar pre-flight do Google
      body: blob,
    });

    return true;
  } catch (error) {
    console.error('Erro na sincronização:', error);
    return false;
  }
};
