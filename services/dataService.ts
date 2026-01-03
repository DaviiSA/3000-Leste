
import * as XLSX from 'xlsx';
import { Material, MaterialRequest } from '../types';
import { RAW_MATERIALS as RAW_STRING, GOOGLE_SHEETS_WEBAPP_URL } from '../constants';

const STORAGE_KEYS = {
  MATERIALS: 'lv_leste_materials',
  REQUESTS: 'lv_leste_requests',
};

export const initializeMaterials = (): Material[] => {
  const stored = localStorage.getItem(STORAGE_KEYS.MATERIALS);
  if (stored) return JSON.parse(stored);

  const initial = RAW_STRING.split('\n').map((line, index) => {
    const parts = line.trim().split('\t');
    const code = parts[0];
    const name = parts.slice(1).join('\t');
    return {
      id: `m-${index}`,
      code: code?.trim() || 'S/C',
      name: name?.trim() || 'Material sem nome',
      stock: 0, 
    };
  });
  
  localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(initial));
  return initial;
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

/**
 * Sincroniza os dados com a planilha do Google de forma robusta.
 */
export const syncToGoogleSheets = async (data: { materials: Material[], requests: MaterialRequest[] }) => {
  const url = GOOGLE_SHEETS_WEBAPP_URL;
  if (!url) {
    console.warn('URL da planilha não definida.');
    return false;
  }

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
        timestamp: new Date(r.timestamp).toLocaleString('pt-BR'),
        status: r.status,
        itemDetails: r.items.map(i => {
          const m = data.materials.find(mat => mat.id === i.materialId);
          return `${m?.name || 'Item'} (x${i.quantity})`;
        }).join(' | ')
      }))
    };

    // Usar Blob de texto plano para evitar problemas de pré-venda (OPTIONS) do CORS no Script do Google
    const blob = new Blob([JSON.stringify(payload)], { type: 'text/plain' });
    
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors', // Necessário para o Google Apps Script lidar com redirecionamento
      body: blob,
    });

    console.log('Dados enviados para sincronização.');
    return true;
  } catch (error) {
    console.error('Erro na sincronização:', error);
    return false;
  }
};
