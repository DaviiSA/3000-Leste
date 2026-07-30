
import React, { useState, useMemo, useEffect } from 'react';
import { Material, MaterialRequest, StockMovement, VtrStock } from '../types';
import { Search, Plus, Minus, CheckCircle, XCircle, Download, Database, ClipboardList, Loader2, History, ArrowUpRight, ArrowDownLeft, AlertCircle, LayoutDashboard, Truck, ChevronRight, TrendingUp, Filter, Calendar, RotateCcw, Bell, X } from 'lucide-react';
import { exportToExcel, syncToGoogleSheets } from '../services/dataService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts';

interface AdminPanelProps {
  materials: Material[];
  requests: MaterialRequest[];
  movements: StockMovement[];
  vtrStocks: VtrStock[];
  onUpdateStock: (id: string, newStock: number) => void;
  onUpdateRequestStatus: (requestId: string, status: 'Atendido' | 'Cancelado') => void;
  onUpdateItemInRequest: (requestId: string, materialId: string, action: 'update' | 'cancel', newQuantity?: number) => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ materials, requests, movements, vtrStocks, onUpdateStock, onUpdateRequestStatus, onUpdateItemInRequest }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'stock' | 'requests' | 'history' | 'vtr_stock'>('dashboard');
  const [selectedVtr, setSelectedVtr] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Filtros de Solicitações
  const [filterStatus, setFilterStatus] = useState<'Todos' | 'Pendente' | 'Atendido' | 'Cancelado'>('Todos');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const stats = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recent = requests.filter(req => new Date(req.timestamp) >= thirtyDaysAgo && req.status !== 'Cancelado');
    
    const totalItems = recent.reduce((acc, req) => acc + req.items.reduce((sum, i) => sum + i.quantity, 0), 0);
    const totalRequests = recent.length;
    
    const requesterCounts: Record<string, number> = {};
    recent.forEach(req => {
      requesterCounts[req.vtr] = (requesterCounts[req.vtr] || 0) + 1;
    });
    
    const topRequester = Object.entries(requesterCounts)
      .sort(([, a], [, b]) => b - a)[0];

    const pendingRequests = requests.filter(req => req.status === 'Pendente').length;

    return { totalItems, totalRequests, topRequester: topRequester?.[0] || '---', pendingRequests };
  }, [requests]);

  const trendData = useMemo(() => {
    const data = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = d.toLocaleString('pt-BR', { month: 'short' }).toUpperCase();
      const year = d.getFullYear();
      
      const monthTotal = requests
        .filter(req => {
          const reqDate = new Date(req.timestamp);
          return reqDate.getMonth() === d.getMonth() && reqDate.getFullYear() === year && req.status !== 'Cancelado';
        })
        .reduce((sum, req) => sum + req.items.reduce((iSum, i) => iSum + i.quantity, 0), 0);
        
      data.push({
        month: monthLabel,
        total: monthTotal
      });
    }
    return data;
  }, [requests]);

  const chartData = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentRequests = requests.filter(req => 
      new Date(req.timestamp) >= thirtyDaysAgo && req.status !== 'Cancelado'
    );

    const materialCounts: Record<string, number> = {};
    
    recentRequests.forEach(req => {
      req.items.forEach(item => {
        const material = materials.find(m => m.id === item.materialId);
        const name = material?.name || item.materialId;
        materialCounts[name] = (materialCounts[name] || 0) + item.quantity;
      });
    });

    return Object.entries(materialCounts)
      .map(([name, total]) => ({ 
        name: name.length > 25 ? name.substring(0, 22) + '...' : name, 
        fullName: name,
        total 
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [requests, materials]);

  const filteredMaterials = useMemo(() => materials.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.code.includes(searchTerm)
  ), [materials, searchTerm]);

  const filteredMovements = useMemo(() => {
    const sorted = [...movements].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (!searchTerm) return sorted;
    
    return sorted.filter(m => {
      const mat = materials.find(mat => mat.id === m.materialId);
      return mat?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
             mat?.code.includes(searchTerm) ||
             m.reason.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [movements, materials, searchTerm]);

  const filteredVtrStocks = useMemo(() => {
    if (!searchTerm) return vtrStocks;
    return vtrStocks.filter(vs => 
      vs.vtr.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vs.items.some(i => {
        const mat = materials.find(m => m.id === i.materialId);
        return mat?.name.toLowerCase().includes(searchTerm.toLowerCase()) || mat?.code.includes(searchTerm);
      })
    );
  }, [vtrStocks, searchTerm, materials]);

  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      const matchesSearch = r.vtr.toLowerCase().includes(searchTerm.toLowerCase()) || 
        r.items.some(i => {
          const mat = materials.find(m => m.id === i.materialId);
          return mat?.name.toLowerCase().includes(searchTerm.toLowerCase());
        });
      
      const matchesStatus = filterStatus === 'Todos' || r.status === filterStatus;
      
      const reqDate = new Date(r.timestamp);
      reqDate.setHours(0,0,0,0);
      
      const start = startDate ? new Date(startDate + 'T00:00:00') : null;
      const end = endDate ? new Date(endDate + 'T23:59:59') : null;
      
      const matchesStartDate = !start ? true : new Date(r.timestamp) >= start;
      const matchesEndDate = !end ? true : new Date(r.timestamp) <= end;
      
      return matchesSearch && matchesStatus && matchesStartDate && matchesEndDate;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [requests, searchTerm, materials, filterStatus, startDate, endDate]);

  const handleExportStock = () => {
    showNotification('Iniciando exportação de estoque...');
    exportToExcel(materials, 'estoque_lv_leste');
  };
  
  const handleExportRequests = () => {
    showNotification('Iniciando exportação de pedidos...');
    const flatten = requests.map(r => ({
      ID: r.id,
      Data: new Date(r.timestamp).toLocaleString(),
      Destino: r.vtr,
      Status: r.status,
      Itens: r.items.map(i => {
        const mat = materials.find(m => m.id === i.materialId);
        return `${mat?.name || 'Item ('+i.materialId+')'} [${i.quantity}]`;
      }).join('; ')
    }));
    exportToExcel(flatten, 'pedidos_lv_leste');
  };

  const handleExportHistory = () => {
    showNotification('Iniciando exportação de histórico...');
    const flatten = movements.map(m => {
      const mat = materials.find(mat => mat.id === m.materialId);
      return {
        ID: m.id,
        Data: new Date(m.timestamp).toLocaleString(),
        Código: mat?.code || '',
        Material: mat?.name || 'Material Removido',
        Tipo: m.type,
        Quantidade: m.quantity,
        Motivo: m.reason
      };
    });
    exportToExcel(flatten, 'historico_movimentacoes_lv_leste');
  };

  const handleExportVtrStock = () => {
    showNotification('Iniciando exportação de estoque VTR...');
    const flatten: any[] = [];
    vtrStocks.forEach(vs => {
      vs.items.forEach(item => {
        const mat = materials.find(m => m.id === item.materialId);
        flatten.push({
          Destinatário: vs.vtr,
          Código: mat?.code || '',
          Material: mat?.name || '---',
          Quantidade: item.quantity
        });
      });
    });
    exportToExcel(flatten, 'estoque_destinatarios_lv_leste');
  };

  const handleSync = async () => {
    setIsBusy(true);
    try {
      const success = await syncToGoogleSheets({ materials, requests, movements, vtrStocks });
      setIsBusy(false);
      if (success) {
        showNotification('Dados sincronizados com sucesso!', 'success');
      } else {
        showNotification('Falha na sincronização.', 'error');
      }
    } catch (error) {
      setIsBusy(false);
      showNotification('Erro ao conectar com o serviço.', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Tab Selector & Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex p-1 bg-gray-100 rounded-xl w-full sm:w-auto overflow-x-auto no-scrollbar">
          <button onClick={() => {setActiveTab('dashboard'); setSearchTerm('');}} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500'}`}>Dashboard</button>
          <button onClick={() => {setActiveTab('stock'); setSearchTerm('');}} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'stock' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500'}`}>Estoque</button>
          <button onClick={() => {setActiveTab('vtr_stock'); setSearchTerm(''); setSelectedVtr(null);}} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'vtr_stock' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500'}`}>Estoque VTR</button>
          <button onClick={() => {setActiveTab('requests'); setSearchTerm('');}} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'requests' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500'}`}>Pedidos ({requests.length})</button>
          <button onClick={() => {setActiveTab('history'); setSearchTerm('');}} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'history' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500'}`}>Histórico</button>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <button disabled={isBusy} onClick={handleSync} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-100 uppercase transition-all">
            {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />} Sincronizar
          </button>
          <button onClick={activeTab === 'stock' ? handleExportStock : activeTab === 'requests' ? handleExportRequests : activeTab === 'vtr_stock' ? handleExportVtrStock : handleExportHistory} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-green-50 text-green-600 rounded-xl text-xs font-bold hover:bg-green-100 uppercase transition-all">
            <Download size={14} /> Excel
          </button>
        </div>
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Itens Requisitados</p>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold text-gray-800">{stats.totalItems}</span>
                <span className="text-[10px] text-green-600 font-bold mb-1">UNIDADES</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total de Pedidos</p>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold text-gray-800">{stats.totalRequests}</span>
                <span className="text-[10px] text-blue-600 font-bold mb-1">FINALIZADOS</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
              <div className={`absolute top-0 right-0 w-1.5 h-full ${stats.pendingRequests > 0 ? 'bg-orange-500' : 'bg-gray-100'}`}></div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Solicitações Pendentes</p>
              <div className="flex items-end gap-2">
                <span className={`text-2xl font-bold ${stats.pendingRequests > 0 ? 'text-orange-600' : 'text-gray-800'}`}>{stats.pendingRequests}</span>
                <span className="text-[10px] text-orange-600 font-bold mb-1">AGUARDANDO</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Maior Solicitante</p>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold text-gray-800 truncate max-w-[150px]">{stats.topRequester}</span>
                <span className="text-[10px] text-purple-600 font-bold mb-1">TOP</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><LayoutDashboard size={24} /></div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800">Materiais mais Requisitados</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Últimos 30 dias</p>
                </div>
              </div>
              
              <div className="h-[400px] w-full">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 60, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                      <XAxis type="number" hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={180} 
                        tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip 
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                        formatter={(value: any, name: any, props: any) => [value, props.payload.fullName]}
                      />
                      <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={24} label={{ position: 'right', fill: '#64748b', fontSize: 12, fontWeight: 800, offset: 10 }}>
                        {chartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? '#2563eb' : '#3b82f6'} fillOpacity={1 - (index * 0.1)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-300">
                    <AlertCircle size={48} className="mb-2 opacity-20" />
                    <p className="text-sm font-bold uppercase tracking-widest opacity-50">Sem dados suficientes</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-green-50 text-green-600 rounded-xl"><TrendingUp size={24} /></div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800">Tendência de Consumo</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Últimos 6 Meses (unidades)</p>
                </div>
              </div>
              
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="month" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="total" 
                      stroke="#22c55e" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorTotal)" 
                      animationDuration={1500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Input */}
      {activeTab !== 'dashboard' && (
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder={activeTab === 'stock' ? "Pesquisar material..." : activeTab === 'requests' ? "Buscar por destino ou item..." : activeTab === 'vtr_stock' ? "Buscar por VTR ou Material..." : "Filtrar histórico por material ou motivo..."}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Stock Tab */}
      {activeTab === 'stock' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar max-h-[60vh] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-400 font-bold uppercase text-[10px] tracking-widest sticky top-0 z-10">
                <tr><th className="px-6 py-4">Cód</th><th className="px-6 py-4">Material</th><th className="px-6 py-4">Saldo</th><th className="px-6 py-4 text-center">Gestão</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredMaterials.map(item => (
                  <tr key={item.id} className="hover:bg-blue-50/20 transition-colors">
                    <td className="px-6 py-4 font-mono text-[10px] text-gray-400">{item.code}</td>
                    <td className="px-6 py-4 font-semibold text-gray-800">{item.name}</td>
                    <td className="px-6 py-4"><span className={`inline-flex items-center justify-center min-w-[32px] px-2 py-1 rounded-full text-[10px] font-black ${item.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.stock}</span></td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center">
                        <input
                          type="number"
                          min="0"
                          className="w-20 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-center font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={item.stock}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            onUpdateStock(item.id, val);
                            showNotification(`Saldo atualizado: ${item.name}`, 'info');
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Requests Tab */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                <Filter size={12} /> Status
              </label>
              <div className="flex p-1 bg-gray-50 rounded-xl border border-gray-100 overflow-x-auto no-scrollbar">
                {(['Todos', 'Pendente', 'Atendido', 'Cancelado'] as const).map(status => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${filterStatus === status ? 'bg-white shadow-sm text-blue-700' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="w-full md:w-auto space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                <Calendar size={12} /> Período
              </label>
              <div className="flex items-center gap-2">
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <span className="text-gray-300 font-bold">à</span>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <button 
              onClick={() => { setFilterStatus('Todos'); setStartDate(''); setEndDate(''); setSearchTerm(''); }}
              className="p-2.5 bg-gray-50 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-gray-100 transition-all active:scale-95"
              title="Limpar Filtros"
            >
              <RotateCcw size={18} />
            </button>
          </div>

          {filteredRequests.length === 0 ? (
            <div className="bg-white p-16 text-center rounded-2xl border-2 border-dashed border-gray-200">
              <ClipboardList className="mx-auto text-gray-200 mb-4" size={56} />
              <p className="text-gray-400 font-black uppercase text-xs tracking-widest">Nenhum pedido encontrado</p>
            </div>
          ) : (
            filteredRequests.map(req => (
              <div key={req.id} className={`bg-white p-6 rounded-2xl shadow-sm border-2 transition-all animate-in slide-in-from-bottom-2 ${req.status === 'Pendente' ? 'border-blue-100 bg-blue-50/10' : 'border-gray-100'}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div className="flex items-start gap-4">
                    <div className={`${req.status === 'Pendente' ? 'bg-blue-600 shadow-blue-100' : req.status === 'Atendido' ? 'bg-green-600 shadow-green-100' : 'bg-gray-400'} text-white p-3 rounded-2xl shadow-lg transition-colors`}><ClipboardList size={20} /></div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded uppercase">{req.vtr}</span>
                        <span className="text-[10px] text-gray-300 font-mono">#{req.id.slice(-5)}</span>
                      </div>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">{new Date(req.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      req.status === 'Atendido' ? 'bg-green-100 text-green-700' : 
                      req.status === 'Cancelado' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700 shadow-inner'
                    }`}>{req.status}</span>
                    
                    {req.status === 'Pendente' && (
                      <div className="flex gap-2">
                        <button 
                          title="Confirmar Atendimento"
                          onClick={() => {
                            onUpdateRequestStatus(req.id, 'Atendido');
                            showNotification(`Pedido ${req.id.slice(-5)} atendido!`);
                          }} 
                          className="flex items-center gap-1.5 px-3 py-2 bg-green-500 text-white rounded-xl shadow-lg shadow-green-100 hover:bg-green-600 transition-all active:scale-95 text-[10px] font-bold uppercase"
                        >
                          <CheckCircle size={14} /> Atender
                        </button>
                        <button 
                          title="Cancelar e Devolver Saldo"
                          onClick={() => {
                            onUpdateRequestStatus(req.id, 'Cancelado');
                            showNotification(`Pedido ${req.id.slice(-5)} cancelado.`, 'error');
                          }} 
                          className="flex items-center gap-1.5 px-3 py-2 bg-red-500 text-white rounded-xl shadow-lg shadow-red-100 hover:bg-red-600 transition-all active:scale-95 text-[10px] font-bold uppercase"
                        >
                          <XCircle size={14} /> Cancelar
                        </button>
                      </div>
                    )}
                    
                    {req.status === 'Atendido' && (
                       <button 
                        title="Estornar Atendimento"
                        onClick={() => {
                          if(confirm("Deseja realmente cancelar este atendimento e devolver os itens ao estoque?")) {
                            onUpdateRequestStatus(req.id, 'Cancelado');
                            showNotification(`Atendimento ${req.id.slice(-5)} estornado.`, 'info');
                          }
                        }} 
                        className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <XCircle size={18} />
                      </button>
                    )}
                  </div>
                </div>
                
                {req.status === 'Pendente' && (
                  <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-4 py-2 rounded-xl mb-3 border border-blue-100 text-[10px] font-bold">
                    <AlertCircle size={14} /> 
                    <span>SOLICITAÇÃO AGUARDANDO CONFERÊNCIA. O SALDO FOI RESERVADO.</span>
                  </div>
                )}

                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
                  {req.items.map((item, idx) => {
                    const material = materials.find(m => m.id === item.materialId);
                    return (
                      <div key={idx} className={`flex justify-between items-center text-xs ${item.cancelled ? 'opacity-40' : ''}`}>
                        <div className="flex items-center gap-3 flex-1">
                          <span className={`text-gray-700 font-bold line-clamp-1 ${item.cancelled ? 'line-through' : ''}`}>
                            {material?.name || `Item ${item.materialId}`}
                          </span>
                          {item.cancelled && <span className="text-[8px] bg-gray-200 text-gray-500 px-1 rounded font-black uppercase">Cancelado</span>}
                        </div>
                        <div className="flex items-center gap-3">
                           <span className="text-[9px] text-gray-400 font-mono">{material?.code || item.materialId}</span>
                           
                           {!item.cancelled && req.status !== 'Cancelado' ? (
                             <div className="flex items-center bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                               <button 
                                onClick={() => {
                                  const newQty = Math.max(1, item.quantity - 1);
                                  onUpdateItemInRequest(req.id, item.materialId, 'update', newQty);
                                  showNotification(`Qtd reduzida: ${material?.name}`, 'info');
                                }}
                                className="px-1.5 py-1 hover:bg-gray-50 text-gray-400 transition-colors"
                               >
                                 <Minus size={10} />
                               </button>
                               <span className="px-2 font-black text-gray-900 text-[10px]">x{item.quantity}</span>
                               <button 
                                onClick={() => {
                                  onUpdateItemInRequest(req.id, item.materialId, 'update', item.quantity + 1);
                                  showNotification(`Qtd aumentada: ${material?.name}`, 'info');
                                }}
                                className="px-1.5 py-1 hover:bg-gray-50 text-gray-400 transition-colors"
                               >
                                 <Plus size={10} />
                               </button>
                             </div>
                           ) : (
                             <span className="bg-white px-2.5 py-1 rounded-lg border border-gray-200 font-black text-gray-900 shadow-sm">x{item.quantity}</span>
                           )}

                           {req.status !== 'Cancelado' && (
                             <button 
                              onClick={() => {
                                onUpdateItemInRequest(req.id, item.materialId, 'cancel');
                                showNotification(item.cancelled ? `Item reativado: ${material?.name}` : `Item cancelado: ${material?.name}`, item.cancelled ? 'success' : 'error');
                              }}
                              className={`p-1.5 rounded-lg transition-all ${item.cancelled ? 'text-blue-500 hover:bg-blue-50' : 'text-gray-300 hover:text-red-500 hover:bg-red-50'}`}
                              title={item.cancelled ? "Reativar Item" : "Cancelar Item"}
                             >
                               {item.cancelled ? <RotateCcw size={14} /> : <X size={14} />}
                             </button>
                           )}
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

      {/* VTR Stock Tab */}
      {activeTab === 'vtr_stock' && (
        <div className="space-y-4">
          {!selectedVtr ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filteredVtrStocks.length === 0 ? (
                <div className="col-span-full bg-white p-12 text-center rounded-2xl border-2 border-dashed border-gray-100">
                  <Truck className="mx-auto text-gray-200 mb-4 opacity-50" size={48} />
                  <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Nenhum estoque distribuído</p>
                </div>
              ) : (
                filteredVtrStocks.map(vs => (
                  <button 
                    key={vs.vtr} 
                    onClick={() => setSelectedVtr(vs.vtr)}
                    className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between group hover:border-blue-300 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors"><Truck size={24} /></div>
                      <div className="text-left">
                        <h4 className="font-bold text-gray-800 uppercase">{vs.vtr}</h4>
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-tight">{vs.items.length} ITENS DISTINTOS</p>
                      </div>
                    </div>
                    <ChevronRight className="text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-in slide-in-from-right-4">
              <div className="p-6 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedVtr(null)} className="p-2 hover:bg-white rounded-lg text-gray-400 hover:text-blue-600 transition-all"><Minus size={20} className="rotate-90" /></button>
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 uppercase">Estoque: {selectedVtr}</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Saldo Atual na Viatura</p>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[50vh] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50/50 text-gray-400 font-bold uppercase text-[10px] tracking-widest sticky top-0 z-10 backdrop-blur-sm">
                    <tr><th className="px-6 py-4">Código</th><th className="px-6 py-4">Material</th><th className="px-6 py-4">Quantidade</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {vtrStocks.find(v => v.vtr === selectedVtr)?.items.filter(i => i.quantity > 0).map(item => {
                      const mat = materials.find(m => m.id === item.materialId);
                      return (
                        <tr key={item.materialId} className="hover:bg-blue-50/10 transition-colors">
                          <td className="px-6 py-4 font-mono text-[10px] text-gray-400 uppercase">{mat?.code || item.materialId}</td>
                          <td className="px-6 py-4 font-bold text-gray-700">{mat?.name || 'Material Desconhecido'}</td>
                          <td className="px-6 py-4"><span className="inline-flex items-center justify-center min-w-[32px] px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-black">x{item.quantity}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar max-h-[60vh] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-400 font-bold uppercase text-[10px] tracking-widest sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4">Data/Hora</th>
                  <th className="px-6 py-4">Material</th>
                  <th className="px-6 py-4">Mov</th>
                  <th className="px-6 py-4">Qtd</th>
                  <th className="px-6 py-4">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredMovements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">Nenhum histórico encontrado.</td>
                  </tr>
                ) : (
                  filteredMovements.map(mov => {
                    const mat = materials.find(m => m.id === mov.materialId);
                    return (
                      <tr key={mov.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-[10px] font-bold text-gray-800">{new Date(mov.timestamp).toLocaleDateString()}</div>
                          <div className="text-[9px] text-gray-400 font-mono">{new Date(mov.timestamp).toLocaleTimeString()}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs font-bold text-gray-800 line-clamp-1">{mat?.name || 'Material Removido'}</div>
                          <div className="text-[9px] text-gray-400 font-mono uppercase">{mat?.code}</div>
                        </td>
                        <td className="px-6 py-4">
                          {mov.type === 'Entrada' ? (
                            <div className="flex items-center gap-1 text-green-600 font-black text-[10px] uppercase">
                              <ArrowDownLeft size={14} /> Entrada
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-red-600 font-black text-[10px] uppercase">
                              <ArrowUpRight size={14} /> Saída
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`font-black text-xs ${mov.type === 'Entrada' ? 'text-green-700' : 'text-red-700'}`}>
                            {mov.type === 'Entrada' ? '+' : '-'}{mov.quantity}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded-md font-bold uppercase tracking-tight">{mov.reason}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border animate-in slide-in-from-right-8 duration-300 ${
          notification.type === 'success' ? 'bg-green-600 border-green-500 text-white' : 
          notification.type === 'error' ? 'bg-red-600 border-red-500 text-white' : 
          'bg-blue-600 border-blue-500 text-white'
        }`}>
          <div className="p-2 bg-white/20 rounded-xl">
            {notification.type === 'success' ? <CheckCircle size={20} /> : notification.type === 'error' ? <AlertCircle size={20} /> : <Bell size={20} />}
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-70 leading-none mb-1">{notification.type}</p>
            <p className="text-sm font-bold leading-tight">{notification.message}</p>
          </div>
          <button onClick={() => setNotification(null)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
