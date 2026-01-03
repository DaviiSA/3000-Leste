
import React, { useState } from 'react';
import { Material, MaterialRequest } from '../types';
import { Search, Plus, Minus, CheckCircle, XCircle, Download, Database, ClipboardList } from 'lucide-react';
import { exportToExcel, syncToGoogleSheets } from '../services/dataService';
import { ENERGISA_COLORS } from '../constants';

interface AdminPanelProps {
  materials: Material[];
  requests: MaterialRequest[];
  onUpdateStock: (id: string, newStock: number) => void;
  onUpdateRequestStatus: (requestId: string, status: 'Atendido' | 'Cancelado') => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ materials, requests, onUpdateStock, onUpdateRequestStatus }) => {
  const [activeTab, setActiveTab] = useState<'stock' | 'requests'>('stock');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredMaterials = materials.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.code.includes(searchTerm)
  );

  const handleExportStock = () => {
    exportToExcel(materials, 'estoque_linha_viva_leste');
  };

  const handleExportRequests = () => {
    const flatten = requests.map(r => ({
      ID: r.id,
      Data: new Date(r.timestamp).toLocaleString(),
      VTR: r.vtr,
      Status: r.status,
      Itens: r.items.map(i => {
        const mat = materials.find(m => m.id === i.materialId);
        return `${mat?.name} (${i.quantity})`;
      }).join('; ')
    }));
    exportToExcel(flatten, 'solicitacoes_linha_viva_leste');
  };

  const handleSync = async () => {
    const success = await syncToGoogleSheets({ materials, requests });
    if (success) alert('Dados sincronizados com sucesso!');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex p-1 bg-gray-100 rounded-lg w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('stock')}
            className={`flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'stock' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Estoque
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'requests' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Solicitações
          </button>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <button 
            onClick={handleSync}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
          >
            <Database size={16} />
            Sincronizar
          </button>
          <button 
            onClick={activeTab === 'stock' ? handleExportStock : handleExportRequests}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-green-50 text-green-600 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors"
          >
            <Download size={16} />
            XLSX
          </button>
        </div>
      </div>

      {activeTab === 'stock' ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Buscar material ou código..."
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500 font-medium uppercase text-xs">
                <tr>
                  <th className="px-6 py-3">Código</th>
                  <th className="px-6 py-3">Descrição</th>
                  <th className="px-6 py-3">Saldo</th>
                  <th className="px-6 py-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredMaterials.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-gray-500">{item.code}</td>
                    <td className="px-6 py-4 font-medium text-gray-800">{item.name}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${item.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {item.stock}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => onUpdateStock(item.id, item.stock - 1)}
                          className="p-1.5 hover:bg-red-100 text-red-600 rounded-md transition-colors"
                        >
                          <Minus size={16} />
                        </button>
                        <button 
                          onClick={() => onUpdateStock(item.id, item.stock + 1)}
                          className="p-1.5 hover:bg-green-100 text-green-600 rounded-md transition-colors"
                        >
                          <Plus size={16} />
                        </button>
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
            <div className="bg-white p-12 text-center rounded-xl border border-dashed border-gray-300">
              <ClipboardList className="mx-auto text-gray-300 mb-4" size={48} />
              <p className="text-gray-500 font-medium">Nenhuma solicitação encontrada.</p>
            </div>
          ) : (
            requests.slice().reverse().map(req => (
              <div key={req.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded mb-1 inline-block">VTR {req.vtr}</span>
                    <h3 className="font-bold text-gray-800">Solicitação #{req.id.slice(-4).toUpperCase()}</h3>
                    <p className="text-xs text-gray-400">{new Date(req.timestamp).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      req.status === 'Atendido' ? 'bg-green-100 text-green-700' : 
                      req.status === 'Cancelado' ? 'bg-red-100 text-red-700' : 
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {req.status}
                    </span>
                    {req.status === 'Pendente' && (
                      <div className="flex gap-1">
                        <button 
                          onClick={() => onUpdateRequestStatus(req.id, 'Atendido')}
                          className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors shadow-sm"
                          title="Marcar como Atendido"
                        >
                          <CheckCircle size={18} />
                        </button>
                        <button 
                          onClick={() => onUpdateRequestStatus(req.id, 'Cancelado')}
                          className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shadow-sm"
                          title="Marcar como Cancelado"
                        >
                          <XCircle size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  {req.items.map((item, idx) => {
                    const material = materials.find(m => m.id === item.materialId);
                    return (
                      <div key={idx} className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">{material?.name}</span>
                        <span className="font-bold text-gray-800">x{item.quantity}</span>
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
