
export interface Material {
  id: string;
  code: string;
  name: string;
  stock: number;
}

export interface RequestedItem {
  materialId: string;
  quantity: number;
}

export interface MaterialRequest {
  id: string;
  vtr: string;
  timestamp: string;
  items: RequestedItem[];
  status: 'Pendente' | 'Atendido' | 'Cancelado';
}

export interface StockMovement {
  id: string;
  materialId: string;
  type: 'Entrada' | 'Saída';
  quantity: number;
  timestamp: string;
  reason: string;
}

export type View = 'Home' | 'Admin' | 'Request';
