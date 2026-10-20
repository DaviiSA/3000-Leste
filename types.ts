
export interface Material {
  id: string;
  code: string;
  name: string;
  stock: number;
}

export interface RequestedItem {
  materialId: string;
  quantity: number;
  cancelled?: boolean;
  collected?: boolean;
}

export interface MaterialRequest {
  id: string;
  vtr: string;
  timestamp: string;
  items: RequestedItem[];
  status: 'Pendente' | 'Atendido' | 'Cancelado';
  collected?: boolean;
  collectedAt?: string;
  collectedBy?: string;
  pickupStatus?: 'retirado' | 'pendente_retirada';
  pickupNote?: string;
}

export interface StockMovement {
  id: string;
  materialId: string;
  type: 'Entrada' | 'Saída';
  quantity: number;
  timestamp: string;
  reason: string;
}

export interface VtrStock {
  vtr: string;
  items: RequestedItem[];
}

export type View = 'Home' | 'Admin' | 'Request' | 'Other';
