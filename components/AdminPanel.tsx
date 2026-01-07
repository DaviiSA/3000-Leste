
import React, { useState } from 'react';
import { Material, MaterialRequest } from '../types';
import { Search, Plus, Minus, CheckCircle, XCircle, Download, Database, ClipboardList, Loader2 } from 'lucide-react';
import { exportToExcel, syncToGoogleSheets } from '../services/dataService';

interface AdminPanelProps {
  materials: Material[];
  requests: MaterialRequest[];
  onUpdateStock: (id: string, newStock: number) => void;
  onUpdateRequestStatus: (requestId: string, status: 'Atendido' | 'Cancelado') => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ materials, requests, onUpdateStock, onUpdateRequestStatus }) => {
  const [activeTab, setActiveTab] = useState<'stock' | 'requests'>('stock');
  const [searchTerm, setSearchTerm] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const filteredMaterials = materials.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.code.includes(searchTerm)
  );

  const handleExportStock = () => exportToExcel(materials, 'estoque_lv_leste');
  
  const handleExportRequests = () => {
    const flatten = requests.map(r => ({
      ID: r.id,
      Data: new Date(r.timestamp).toLocaleString(),
      VTR: r.vtr,
      Status: r.status,
      Itens: r.items.map(i => {
        const mat = materials.find(m => m.id === i.materialId);
        return `${mat?.name || 'Item ('+i.materialId+')'} [${i.quantity}]`;
      }).join('; ')
    }));
    exportToExcel(flatten, 'pedidos_lv_leste');
  };

  const handleSync = async () => {
    setIsBusy(true);
    const success = await syncToGoogleSheets({ materials, requests });
    setIsBusy(false);
    if (success) alert('Dados sincronizados com a planilha Google!');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex p-1 bg-gray-100 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('stock')}
            className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'stock' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Estoque
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'requests' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Pedidos ({requests.length})
          </button>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <button 
            disabled={isBusy}
            onClick={handleSync}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors uppercase disabled:opacity-50"
          >
            {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
            Sincronizar
          </button>
          <button 
            onClick={activeTab === 'stock' ? handleExportStock : handleExportRequests}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-green-50 text-green-600 rounded-xl text-xs font-bold hover:bg-green-100 transition-colors uppercase"
          >
            <Download size={14} />
            Excel
          </button>
        </div>
      </div>

      {activeTab === 'stock' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Pesquisar estoque..."
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-x-auto custom-scrollbar max-h-[60vh] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-400 font-bold uppercase text-[10px] tracking-widest sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4">Cód</th>
                  <th className="px-6 py-4">Material</th>
                  <th className="px-6 py-4">Saldo</th>
                  <th className="px-6 py-4 text-center">Gestão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredMaterials.map(item => (
                  <tr key={item.id} className="hover:bg-blue-50/20 transition-colors">
                    <td className="px-6 py-4 font-mono text-[10px] text-gray-400">{item.code}</td>
                    <td className="px-6 py-4 font-semibold text-gray-800">{item.name}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center justify-center min-w-[32px] px-2 py-1 rounded-full text-[10px] font-black ${item.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {item.stock}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => onUpdateStock(item.id, item.stock - 1)} className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-all active:scale-90"><Minus size={16} /></button>
                        <button onClick={() => onUpdateStock(item.id, item.stock + 1)} className="p-1.5 hover:bg-green-50 text-green-600 rounded-lg transition-all active:scale-90"><Plus size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.length === 0 ? (
            <div className="bg-white p-16 text-center rounded-2xl border-2 border-dashed border-gray-200">
              <ClipboardList className="mx-auto text-gray-200 mb-4" size={56} />
              <p className="text-gray-400 font-black uppercase text-xs tracking-widest">Nenhum pedido registrado</p>
            </div>
          ) : (
            requests.slice().reverse().map(req => (
              <div key={req.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all animate-in slide-in-from-bottom-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-blue-600 text-white p-3 rounded-2xl shadow-lg shadow-blue-50"><ClipboardList size={20} /></div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded uppercase">VTR {req.vtr}</span>
                        <span className="text-[10px] text-gray-300 font-mono">#{req.id.slice(-5)}</span>
                      </div>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">{new Date(req.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      req.status === 'Atendido' ? 'bg-green-100 text-green-700' : 
                      req.status === 'Cancelado' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>{req.status}</span>
                    {req.status === 'Pendente' && (
                      <div className="flex gap-2">
                        <button onClick={() => onUpdateRequestStatus(req.id, 'Atendido')} className="p-2 bg-green-500 text-white rounded-xl shadow-lg shadow-green-100"><CheckCircle size={18} /></button>
                        <button onClick={() => onUpdateRequestStatus(req.id, 'Cancelado')} className="p-2 bg-red-500 text-white rounded-xl shadow-lg shadow-red-100"><XCircle size={18} /></button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
                  {req.items.map((item, idx) => {
                    const material = materials.find(m => m.id === item.materialId);
                    return (
                      <div key={idx} className="flex justify-between items-center text-xs">
                        <span className="text-gray-700 font-bold line-clamp-1 flex-1 mr-4">{material?.name || `Item ${item.materialId}`}</span>
                        <div className="flex items-center gap-3">
                           <span className="text-[9px] text-gray-400 font-mono">{material?.code || item.materialId}</span>
                           <span className="bg-white px-2.5 py-1 rounded-lg border border-gray-200 font-black text-gray-900 shadow-sm">x{item.quantity}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
