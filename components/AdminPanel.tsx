
import React, { useState, useMemo, useEffect } from 'react';
import { Material, MaterialRequest, StockMovement, VtrStock } from '../types';
import { Search, Plus, Minus, CheckCircle, XCircle, Download, Database, ClipboardList, Loader2, History, ArrowUpRight, ArrowDownLeft, AlertCircle, LayoutDashboard, Truck, ChevronRight, TrendingUp, Filter, Calendar, RotateCcw, Bell, X, User, Clock, Menu } from 'lucide-react';
import { exportToExcel, syncToGoogleSheets } from '../services/dataService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';

interface AdminPanelProps {
  materials: Material[];
  requests: MaterialRequest[];
  movements: StockMovement[];
  vtrStocks: VtrStock[];
  onUpdateStock: (id: string, newStock: number) => void;
  onUpdateRequestStatus: (requestId: string, status: 'Atendido' | 'Cancelado') => void;
  onUpdateItemInRequest: (requestId: string, materialId: string, action: 'update' | 'cancel', newQuantity?: number) => void;
  onUpdateVtrStock?: (vtr: string, materialId: string, delta: number) => void;
  onLogout?: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ materials, requests, movements, vtrStocks, onUpdateStock, onUpdateRequestStatus, onUpdateItemInRequest, onUpdateVtrStock, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'stock' | 'requests' | 'history' | 'vtr_stock'>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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

  const movementData = useMemo(() => {
    const data = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      
      const dayEntries = movements
        .filter(m => {
          const mDate = new Date(m.timestamp);
          return mDate.toDateString() === d.toDateString() && m.type === 'Entrada';
        })
        .reduce((sum, m) => sum + m.quantity, 0);

      const dayExits = movements
        .filter(m => {
          const mDate = new Date(m.timestamp);
          return mDate.toDateString() === d.toDateString() && m.type === 'Saída';
        })
        .reduce((sum, m) => sum + m.quantity, 0);
        
      data.push({
        date: dateStr,
        entradas: dayEntries,
        saidas: dayExits
      });
    }
    return data;
  }, [movements]);

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
    <div className="flex h-screen bg-[#F8FAFC] text-zinc-900 font-sans overflow-hidden relative">
      {/* Sidebar Refined - Mobile Responsive */}
      <AnimatePresence>
        {(isMobileMenuOpen || window.innerWidth >= 1024) && (
          <motion.aside 
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={`fixed lg:relative w-72 h-full bg-white border-r border-zinc-200 flex flex-col z-50 shadow-[4px_0_24px_rgba(0,0,0,0.05)] lg:shadow-[4px_0_24px_rgba(0,0,0,0.02)]`}
          >
            <div className="p-8 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-600 rounded-xl shadow-lg shadow-blue-100">
                  <Database className="text-white" size={22} />
                </div>
                <div>
                  <h1 className="text-xl font-black tracking-tight text-zinc-900 leading-none">LV LESTE</h1>
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mt-1">DCMD</p>
                </div>
              </div>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="lg:hidden p-2 text-zinc-400 hover:text-zinc-900 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 px-4 mt-4 space-y-1.5 overflow-y-auto custom-scrollbar">
              {[
                { id: 'dashboard', icon: LayoutDashboard, label: 'Painel Geral' },
                { id: 'stock', icon: Database, label: 'Controle de Estoque' },
                { id: 'requests', icon: ClipboardList, label: 'Solicitações', count: stats.pendingRequests },
                { id: 'vtr_stock', icon: Truck, label: 'Estoque VTR' },
                { id: 'history', icon: History, label: 'Histórico' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as any);
                    if (window.innerWidth < 1024) setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all relative group ${
                    activeTab === item.id 
                      ? 'bg-blue-50 text-blue-700 font-semibold' 
                      : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
                  }`}
                >
                  <item.icon size={20} strokeWidth={activeTab === item.id ? 2.5 : 2} />
                  <span className="text-sm">{item.label}</span>
                  {item.count ? (
                    <span className="ml-auto bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full ring-4 ring-white">
                      {item.count}
                    </span>
                  ) : (
                    <ChevronRight size={14} className={`ml-auto opacity-0 group-hover:opacity-100 transition-all ${activeTab === item.id ? 'opacity-100' : ''}`} />
                  )}
                  {activeTab === item.id && (
                    <motion.div 
                      layoutId="activeTabIndicator"
                      className="absolute left-0 w-1 h-6 bg-blue-600 rounded-full"
                    />
                  )}
                </button>
              ))}
            </nav>

            <div className="p-6 mt-auto border-t border-zinc-100 space-y-4">
              <div className="bg-zinc-50 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold border-2 border-white shadow-sm">
                  <User size={18} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-xs font-bold text-zinc-900 truncate">Administrador</p>
                  <p className="text-[10px] text-zinc-500 truncate">DCMD - Leste</p>
                </div>
              </div>

              {onLogout && (
                <button 
                  onClick={onLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-rose-600 hover:bg-rose-50 transition-all font-bold text-xs uppercase tracking-widest"
                >
                  <XCircle size={18} />
                  Sair do Painel
                </button>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Overlay for mobile menu */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-[#F8FAFC]">
        {/* Header Refined */}
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-zinc-200 px-6 lg:px-10 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2.5 bg-zinc-100 text-zinc-600 rounded-xl hover:bg-zinc-200 transition-all active:scale-95"
            >
              <Menu size={20} />
            </button>
            <h2 className="text-base lg:text-lg font-bold text-zinc-900 capitalize font-display truncate">
              {activeTab.replace('_', ' ')}
            </h2>
            <div className="hidden sm:block h-4 w-px bg-zinc-200" />
            <div className="hidden sm:flex items-center gap-2 text-zinc-400 text-xs font-medium">
              <Calendar size={14} />
              {new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <button 
              onClick={handleSync}
              disabled={isBusy}
              className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs transition-all active:scale-95 shadow-sm ${
                isBusy ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed' : 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-zinc-200'
              }`}
            >
              {isBusy ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
              <span className="hidden xs:inline">SINCRONIZAR</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 lg:p-10">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="max-w-[1400px] mx-auto space-y-8"
          >

            {/* Search and Filters Header */}
            {activeTab !== 'dashboard' && (
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 lg:p-6 rounded-3xl shadow-sm border border-zinc-200/50">
                <div className="relative w-full md:w-96 group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                  <input 
                    type="text" 
                    placeholder="Pesquisar..." 
                    className="w-full pl-12 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:bg-white transition-all outline-none font-medium"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <button 
                    onClick={activeTab === 'stock' ? handleExportStock : activeTab === 'requests' ? handleExportRequests : activeTab === 'vtr_stock' ? handleExportVtrStock : handleExportHistory} 
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-emerald-50 text-emerald-700 rounded-2xl text-sm font-bold hover:bg-emerald-100 transition-all active:scale-95"
                  >
                    <Download size={18} /> <span className="hidden sm:inline">Exportar</span> Excel
                  </button>
                </div>
              </div>
            )}

            {/* Tab Contents */}
            {activeTab === 'dashboard' && (
              <div className="space-y-8">
                {/* KPI Cards Refined */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    { label: 'Itens Requisitados', value: stats.totalItems, unit: 'UNIDADES', color: 'bg-emerald-500', text: 'text-emerald-600' },
                    { label: 'Total de Pedidos', value: stats.totalRequests, unit: 'FINALIZADOS', color: 'bg-blue-500', text: 'text-blue-600' },
                    { label: 'Solicitações Pendentes', value: stats.pendingRequests, unit: 'AGUARDANDO', color: 'bg-orange-500', text: 'text-orange-600', highlight: stats.pendingRequests > 0 },
                    { label: 'Maior Solicitante', value: stats.topRequester, unit: 'TOP VTR', color: 'bg-purple-500', text: 'text-purple-600' },
                  ].map((kpi, idx) => (
                    <div key={idx} className="bg-white p-6 rounded-[2rem] shadow-sm border border-zinc-200/50 relative overflow-hidden group hover:shadow-xl hover:shadow-zinc-200/50 transition-all duration-300">
                      <div className={`absolute top-0 right-0 w-1.5 h-full ${kpi.highlight ? kpi.color : 'bg-transparent'}`} />
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.15em] mb-3">{kpi.label}</p>
                      <div className="flex items-end gap-2">
                        <span className="text-3xl font-black text-zinc-900 tracking-tight">{kpi.value}</span>
                        <span className={`text-[10px] font-black mb-1.5 ${kpi.text}`}>{kpi.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-zinc-200/50">
                    <div className="flex items-center gap-4 mb-10">
                      <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><ArrowDownLeft size={24} /></div>
                      <div>
                        <h3 className="text-xl font-bold text-zinc-900">Fluxo de Movimentação</h3>
                        <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Últimos 7 dias (Entradas vs Saídas)</p>
                      </div>
                    </div>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={movementData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorEntradas" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorSaidas" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 700 }} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 700 }} />
                          <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                          <Area type="monotone" dataKey="entradas" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorEntradas)" />
                          <Area type="monotone" dataKey="saidas" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorSaidas)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-zinc-200/50">
                    <div className="flex items-center gap-4 mb-10">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><TrendingUp size={24} /></div>
                      <div>
                        <h3 className="text-xl font-bold text-zinc-900">Consumo Mensal</h3>
                        <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Evolução dos últimos 6 meses</p>
                      </div>
                    </div>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 700 }} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 700 }} />
                          <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                          <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-sm border border-zinc-200/50">
                    <div className="flex items-center justify-between mb-10">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><TrendingUp size={24} /></div>
                        <div>
                          <h3 className="text-xl font-bold text-zinc-900">Demanda de Materiais</h3>
                          <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Fluxo dos últimos 30 dias</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="h-[400px] w-full">
                      {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                            <XAxis 
                              dataKey="name" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 700 }}
                              dy={10}
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 700 }}
                            />
                            <Tooltip 
                              cursor={{ fill: '#F8FAFC' }}
                              contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '12px' }}
                            />
                            <Bar dataKey="total" radius={[6, 6, 0, 0]} barSize={40}>
                              {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#2563EB' : '#60A5FA'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-zinc-400 text-sm font-medium italic bg-zinc-50 rounded-3xl border-2 border-dashed border-zinc-100">
                          Nenhum dado disponível para o gráfico
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-zinc-200/50">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl"><TrendingUp size={24} /></div>
                      <div>
                        <h3 className="text-xl font-bold text-zinc-900">Histórico Recente</h3>
                        <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Top Requisitantes</p>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      {chartData.slice(0, 5).map((item, idx) => (
                        <div key={idx} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-zinc-50 transition-colors group">
                          <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-500 font-black text-sm group-hover:bg-white group-hover:shadow-sm transition-all">
                            {idx + 1}
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <p className="text-sm font-bold text-zinc-900 truncate">{item.name}</p>
                            <div className="w-full h-1.5 bg-zinc-100 rounded-full mt-2 overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: chartData[0]?.total ? `${(item.total / chartData[0].total) * 100}%` : 0 }}
                                className="h-full bg-blue-500 rounded-full"
                              />
                            </div>
                          </div>
                          <span className="text-sm font-black text-zinc-900">{item.total}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Stock Tab */}
            {activeTab === 'stock' && (
              <div className="bg-white rounded-[2rem] lg:rounded-[2.5rem] shadow-sm border border-zinc-200/50 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar max-h-[70vh] overflow-y-auto">
                  <table className="w-full text-left text-sm border-collapse min-w-[600px]">
                    <thead className="bg-zinc-50/50 text-zinc-400 font-bold uppercase text-[10px] tracking-widest sticky top-0 z-10 backdrop-blur-md">
                      <tr>
                        <th className="px-6 lg:px-10 py-6 border-b border-zinc-100">Código</th>
                        <th className="px-6 lg:px-10 py-6 border-b border-zinc-100">Material</th>
                        <th className="px-6 lg:px-10 py-6 border-b border-zinc-100">Saldo Atual</th>
                        <th className="px-6 lg:px-10 py-6 border-b border-zinc-100 text-center">Gestão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {filteredMaterials.map(item => (
                        <tr key={item.id} className="hover:bg-zinc-50/50 transition-colors group">
                          <td className="px-6 lg:px-10 py-5 font-mono text-[10px] text-zinc-400 font-bold uppercase">{item.code}</td>
                          <td className="px-6 lg:px-10 py-5">
                            <p className="font-bold text-zinc-900 leading-tight">{item.name}</p>
                            <p className="text-[10px] text-zinc-400 font-medium mt-0.5">DCMD Leste - Central</p>
                          </td>
                          <td className="px-6 lg:px-10 py-5">
                            <span className={`inline-flex items-center justify-center px-4 py-1 rounded-full text-[10px] font-black ${
                              item.stock > 10 ? 'bg-emerald-50 text-emerald-700' : 
                              item.stock > 0 ? 'bg-orange-50 text-orange-700' : 
                              'bg-red-50 text-red-700'
                            }`}>
                              {item.stock} UN
                            </span>
                          </td>
                          <td className="px-6 lg:px-10 py-5">
                            <div className="flex items-center justify-center gap-3">
                              <div className="relative group/input">
                                <input
                                  type="number"
                                  min="0"
                                  className="w-20 lg:w-24 px-3 lg:px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-center font-black text-zinc-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:bg-white transition-all outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  value={item.stock}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    onUpdateStock(item.id, val);
                                    showNotification(`Saldo atualizado: ${item.name}`, 'info');
                                  }}
                                />
                              </div>
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
              <div className="space-y-6">
                {/* Filter Bar Refined */}
                <div className="bg-white p-4 lg:p-6 rounded-[2rem] shadow-sm border border-zinc-200/50 flex flex-col xl:flex-row gap-6 items-end">
                  <div className="flex-1 w-full space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                      <Filter size={14} className="text-blue-600" /> Status do Fluxo
                    </label>
                    <div className="flex p-1.5 bg-zinc-50 rounded-2xl border border-zinc-100 overflow-x-auto no-scrollbar">
                      {(['Todos', 'Pendente', 'Atendido', 'Cancelado'] as const).map(status => (
                        <button
                          key={status}
                          onClick={() => setFilterStatus(status)}
                          className={`flex-1 px-3 lg:px-5 py-2.5 rounded-xl text-[10px] font-black transition-all whitespace-nowrap uppercase tracking-widest ${
                            filterStatus === status 
                              ? 'bg-white shadow-sm text-blue-700 ring-1 ring-zinc-200' 
                              : 'text-zinc-400 hover:text-zinc-600'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="w-full xl:w-auto space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                      <Calendar size={14} className="text-blue-600" /> Período
                    </label>
                    <div className="flex items-center gap-3">
                      <input 
                        type="date" 
                        value={startDate} 
                        onChange={(e) => setStartDate(e.target.value)}
                        className="flex-1 xl:flex-none bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-2.5 text-xs font-bold text-zinc-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all"
                      />
                      <span className="text-zinc-300 font-bold">-</span>
                      <input 
                        type="date" 
                        value={endDate} 
                        onChange={(e) => setEndDate(e.target.value)}
                        className="flex-1 xl:flex-none bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-2.5 text-xs font-bold text-zinc-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <button 
                    onClick={() => { setFilterStatus('Todos'); setStartDate(''); setEndDate(''); setSearchTerm(''); }}
                    className="p-3 bg-zinc-900 text-white hover:bg-zinc-800 rounded-2xl shadow-lg shadow-zinc-200 transition-all active:scale-95 group"
                    title="Resetar Filtros"
                  >
                    <RotateCcw size={20} className="group-active:rotate-180 transition-transform duration-500" />
                  </button>
                </div>

                {filteredRequests.length === 0 ? (
                  <div className="bg-white p-24 text-center rounded-[3rem] border-2 border-dashed border-zinc-100 flex flex-col items-center justify-center">
                    <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-200 mb-6">
                      <ClipboardList size={40} />
                    </div>
                    <p className="text-zinc-400 font-black uppercase text-xs tracking-[0.2em]">Nenhuma solicitação encontrada no período</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6">
                    {filteredRequests.map(req => (
                      <motion.div 
                        layout
                        key={req.id} 
                        className={`bg-white rounded-[2.5rem] shadow-sm border transition-all overflow-hidden ${
                          req.status === 'Pendente' ? 'border-blue-200 ring-4 ring-blue-500/5' : 'border-zinc-200/50'
                        }`}
                      >
                        <div className="p-4 lg:p-8">
                          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-8">
                            <div className="flex items-start gap-4 lg:gap-5">
                              <div className={`p-3 lg:p-4 rounded-2xl shadow-lg ${
                                req.status === 'Pendente' ? 'bg-blue-600 shadow-blue-100 text-white' : 
                                req.status === 'Atendido' ? 'bg-emerald-600 shadow-emerald-100 text-white' : 
                                'bg-zinc-400 text-white'
                              }`}>
                                <ClipboardList size={20} className="lg:w-6 lg:h-6" />
                              </div>
                              <div>
                                <div className="flex flex-wrap items-center gap-2 lg:gap-3 mb-2">
                                  <span className="text-[10px] lg:text-xs font-black text-blue-700 bg-blue-50 px-2.5 lg:px-3 py-1 rounded-lg uppercase tracking-wider">{req.vtr}</span>
                                  <span className="text-[9px] lg:text-[10px] text-zinc-400 font-mono font-bold tracking-widest truncate max-w-[100px] sm:max-w-none">ID {req.id.slice(-8).toUpperCase()}</span>
                                </div>
                                <div className="flex items-center gap-2 text-zinc-500 text-[9px] lg:text-[10px] font-bold uppercase tracking-widest">
                                  <Clock size={12} />
                                  {new Date(req.timestamp).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-3 lg:gap-4 self-start xl:self-center">
                              <span className={`px-4 lg:px-5 py-1.5 lg:py-2 rounded-full text-[9px] lg:text-[10px] font-black uppercase tracking-[0.15em] border ${
                                req.status === 'Atendido' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                                req.status === 'Cancelado' ? 'bg-red-50 text-red-700 border-red-100' : 
                                'bg-orange-50 text-orange-700 border-orange-100'
                              }`}>{req.status}</span>
                              
                              <div className="hidden sm:block h-8 w-px bg-zinc-100 mx-2" />
                              
                              {req.status === 'Pendente' && (
                                <div className="flex gap-2 lg:gap-3 w-full sm:w-auto">
                                  <button 
                                    onClick={() => {
                                      onUpdateRequestStatus(req.id, 'Atendido');
                                      showNotification(`Pedido ${req.id.slice(-5)} atendido!`);
                                    }} 
                                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 lg:px-6 py-2.5 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95 text-[10px] lg:text-xs font-black uppercase tracking-widest"
                                  >
                                    <CheckCircle size={14} className="lg:w-4 lg:h-4" /> <span className="sm:inline">Atender</span>
                                  </button>
                                  <button 
                                    onClick={() => {
                                      onUpdateRequestStatus(req.id, 'Cancelado');
                                      showNotification(`Pedido ${req.id.slice(-5)} cancelado.`, 'error');
                                    }} 
                                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 lg:px-6 py-2.5 bg-zinc-100 text-zinc-500 hover:bg-red-50 hover:text-red-600 rounded-2xl transition-all active:scale-95 text-[10px] lg:text-xs font-black uppercase tracking-widest"
                                  >
                                    <XCircle size={14} className="lg:w-4 lg:h-4" /> <span className="sm:inline">Cancelar</span>
                                  </button>
                                </div>
                              )}
                              
                              {req.status === 'Atendido' && (
                                <button 
                                  onClick={() => {
                                    if(confirm("Deseja realmente cancelar este atendimento? O saldo será devolvido ao estoque.")) {
                                      onUpdateRequestStatus(req.id, 'Cancelado');
                                      showNotification(`Atendimento ${req.id.slice(-5)} estornado.`, 'info');
                                    }
                                  }} 
                                  className="p-3 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                  title="Estornar Atendimento"
                                >
                                  <XCircle size={20} />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="bg-zinc-50 rounded-[1.5rem] lg:rounded-[2rem] p-4 lg:p-8 border border-zinc-100 space-y-4">
                            <div className="flex items-center justify-between mb-4 border-b border-zinc-200 pb-4">
                              <p className="text-[9px] lg:text-[10px] font-black text-zinc-400 uppercase tracking-widest">Materiais</p>
                              <p className="text-[9px] lg:text-[10px] font-black text-zinc-400 uppercase tracking-widest">Gestão</p>
                            </div>
                            
                            {req.items.map((item, idx) => {
                              const material = materials.find(m => m.id === item.materialId);
                              return (
                                <div key={idx} className={`flex justify-between items-center py-2 ${item.cancelled ? 'opacity-40 grayscale' : ''}`}>
                                  <div className="flex items-center gap-3 lg:gap-4 flex-1">
                                    <div className="w-1.5 lg:w-2 h-1.5 lg:h-2 rounded-full bg-blue-500 shadow-sm shadow-blue-200 flex-shrink-0" />
                                    <div className="overflow-hidden">
                                      <p className={`font-bold text-xs lg:text-sm text-zinc-900 truncate ${item.cancelled ? 'line-through text-zinc-400' : ''}`}>
                                        {material?.name || `Item ${item.materialId}`}
                                      </p>
                                      <p className="text-[9px] lg:text-[10px] font-mono text-zinc-400 font-bold uppercase truncate">{material?.code || item.materialId}</p>
                                    </div>
                                    {item.cancelled && <span className="hidden xs:inline text-[8px] lg:text-[9px] bg-zinc-200 text-zinc-600 px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">OFF</span>}
                                  </div>

                                  <div className="flex items-center gap-3 lg:gap-6">
                                    {!item.cancelled && req.status === 'Pendente' ? (
                                      <div className="flex items-center bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden p-0.5 lg:p-1">
                                        <button 
                                          onClick={() => {
                                            const newQty = Math.max(1, item.quantity - 1);
                                            onUpdateItemInRequest(req.id, item.materialId, 'update', newQty);
                                          }}
                                          className="p-1 lg:p-1.5 hover:bg-zinc-50 text-zinc-400 rounded-lg transition-colors"
                                        >
                                          <Minus size={12} className="lg:w-3.5 lg:h-3.5" />
                                        </button>
                                        <span className="min-w-[30px] lg:min-w-[40px] text-center font-black text-zinc-900 text-[10px] lg:text-xs tracking-tight">x{item.quantity}</span>
                                        <button 
                                          onClick={() => {
                                            onUpdateItemInRequest(req.id, item.materialId, 'update', item.quantity + 1);
                                          }}
                                          className="p-1 lg:p-1.5 hover:bg-zinc-50 text-zinc-400 rounded-lg transition-colors"
                                        >
                                          <Plus size={12} className="lg:w-3.5 lg:h-3.5" />
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="bg-zinc-200/50 px-2.5 lg:px-4 py-1 lg:py-1.5 rounded-lg lg:rounded-xl font-black text-zinc-700 text-[10px] lg:text-xs shadow-inner">x{item.quantity}</span>
                                    )}

                                    {req.status === 'Pendente' && (
                                      <button 
                                        onClick={() => {
                                          onUpdateItemInRequest(req.id, item.materialId, 'cancel');
                                        }}
                                        className={`p-2.5 rounded-xl transition-all ${
                                          item.cancelled 
                                            ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' 
                                            : 'text-zinc-300 hover:text-red-600 hover:bg-red-50'
                                        }`}
                                        title={item.cancelled ? "Reativar Item" : "Remover Item"}
                                      >
                                        {item.cancelled ? <RotateCcw size={16} /> : <X size={16} />}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* VTR Stock Tab */}
            {activeTab === 'vtr_stock' && (
              <div className="space-y-8">
                {!selectedVtr ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredVtrStocks.length === 0 ? (
                      <div className="col-span-full bg-white p-24 text-center rounded-[3rem] border-2 border-dashed border-zinc-100 flex flex-col items-center justify-center">
                        <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-200 mb-6">
                          <Truck size={40} />
                        </div>
                        <p className="text-zinc-400 font-black uppercase text-xs tracking-[0.2em]">Nenhum estoque em viaturas</p>
                      </div>
                    ) : (
                      filteredVtrStocks.map(vs => (
                        <button 
                          key={vs.vtr} 
                          onClick={() => setSelectedVtr(vs.vtr)}
                          className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-zinc-200/50 flex items-center justify-between group hover:shadow-xl hover:shadow-zinc-200/50 hover:border-blue-200 transition-all duration-300"
                        >
                          <div className="flex items-center gap-5">
                            <div className="p-4 bg-zinc-50 text-zinc-400 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all duration-500 shadow-sm shadow-zinc-100 group-hover:shadow-blue-200">
                              <Truck size={28} />
                            </div>
                            <div className="text-left">
                              <h4 className="font-black text-zinc-900 uppercase tracking-tight text-lg leading-tight">{vs.vtr}</h4>
                              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-[0.1em] mt-1">{vs.items.length} ITENS CADASTRADOS</p>
                            </div>
                          </div>
                          <ChevronRight className="text-zinc-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" size={20} />
                        </button>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-[2.5rem] shadow-sm border border-zinc-200/50 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
                    <div className="p-8 bg-zinc-50/50 border-b border-zinc-100 flex items-center justify-between">
                      <div className="flex items-center gap-5">
                        <button 
                          onClick={() => setSelectedVtr(null)} 
                          className="p-3 bg-white text-zinc-400 hover:text-blue-600 rounded-2xl shadow-sm border border-zinc-100 hover:border-blue-100 transition-all active:scale-95 group"
                        >
                          <ArrowDownLeft size={20} className="rotate-45 group-hover:-translate-x-0.5 transition-transform" />
                        </button>
                        <div>
                          <h3 className="text-xl font-black text-zinc-900 uppercase tracking-tight">Viatura {selectedVtr}</h3>
                          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-[0.2em] mt-0.5">Detalhamento de estoque embarcado</p>
                        </div>
                      </div>
                    </div>
                    <div className="overflow-x-auto max-h-[60vh] overflow-y-auto custom-scrollbar">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-zinc-50/50 text-zinc-400 font-bold uppercase text-[10px] tracking-widest sticky top-0 z-10 backdrop-blur-md">
                          <tr>
                            <th className="px-10 py-6 border-b border-zinc-100">Código</th>
                            <th className="px-10 py-6 border-b border-zinc-100">Material</th>
                            <th className="px-10 py-6 border-b border-zinc-100">Quantidade</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {vtrStocks.find(v => v.vtr === selectedVtr)?.items.filter(i => i.quantity >= 0).map(item => {
                            const mat = materials.find(m => m.id === item.materialId);
                            if (!mat && item.quantity === 0) return null;
                            return (
                              <tr key={item.materialId} className="hover:bg-zinc-50/50 transition-colors">
                                <td className="px-10 py-5 font-mono text-[10px] text-zinc-400 font-bold uppercase">{mat?.code || item.materialId}</td>
                                <td className="px-10 py-5 font-bold text-zinc-900">{mat?.name || 'Material Desconhecido'}</td>
                                <td className="px-10 py-5">
                                  <div className="flex items-center gap-3">
                                    <button 
                                      onClick={() => onUpdateVtrStock?.(selectedVtr!, item.materialId, -1)}
                                      className="p-1.5 hover:bg-zinc-100 text-zinc-400 rounded-lg transition-colors border border-zinc-100"
                                    >
                                      <Minus size={14} />
                                    </button>
                                    <span className="inline-flex items-center justify-center min-w-[48px] px-3.5 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-xs font-black shadow-sm ring-1 ring-blue-100">
                                      x{item.quantity}
                                    </span>
                                    <button 
                                      onClick={() => onUpdateVtrStock?.(selectedVtr!, item.materialId, 1)}
                                      className="p-1.5 hover:bg-zinc-100 text-zinc-400 rounded-lg transition-colors border border-zinc-100"
                                    >
                                      <Plus size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    
                    <div className="p-8 bg-zinc-50/30 border-t border-zinc-100">
                      <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="relative flex-1 w-full">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                          <select 
                            className="w-full pl-12 pr-4 py-3 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-bold appearance-none cursor-pointer"
                            onChange={(e) => {
                              if (e.target.value) {
                                onUpdateVtrStock?.(selectedVtr!, e.target.value, 1);
                                e.target.value = '';
                              }
                            }}
                          >
                            <option value="">Adicionar novo material...</option>
                            {materials
                              .filter(m => !vtrStocks.find(v => v.vtr === selectedVtr)?.items.some(i => i.materialId === m.id))
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map(m => (
                                <option key={m.id} value={m.id}>{m.code} - {m.name}</option>
                              ))
                            }
                          </select>
                        </div>
                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest hidden sm:block">Selecione para adicionar ao estoque</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* History Tab */}
            {activeTab === 'history' && (
              <div className="bg-white rounded-[2rem] lg:rounded-[2.5rem] shadow-sm border border-zinc-200/50 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar max-h-[70vh] overflow-y-auto">
                  <table className="w-full text-left text-sm border-collapse min-w-[700px]">
                    <thead className="bg-zinc-50/50 text-zinc-400 font-bold uppercase text-[10px] tracking-widest sticky top-0 z-10 backdrop-blur-md">
                      <tr>
                        <th className="px-6 lg:px-10 py-6 border-b border-zinc-100">Data/Hora</th>
                        <th className="px-6 lg:px-10 py-6 border-b border-zinc-100">Material</th>
                        <th className="px-6 lg:px-10 py-6 border-b border-zinc-100">Operação</th>
                        <th className="px-6 lg:px-10 py-6 border-b border-zinc-100">Volume</th>
                        <th className="px-6 lg:px-10 py-6 border-b border-zinc-100">Motivo/Destino</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {filteredMovements.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-10 py-20 text-center text-zinc-400 italic font-medium">Sem registros.</td>
                        </tr>
                      ) : (
                        filteredMovements.map(mov => {
                          const mat = materials.find(m => m.id === mov.materialId);
                          return (
                            <tr key={mov.id} className="hover:bg-zinc-50/50 transition-colors group">
                              <td className="px-6 lg:px-10 py-5 whitespace-nowrap">
                                <div className="text-xs font-bold text-zinc-900">{new Date(mov.timestamp).toLocaleDateString('pt-BR')}</div>
                                <div className="text-[10px] text-zinc-400 font-mono font-bold mt-0.5">{new Date(mov.timestamp).toLocaleTimeString('pt-BR')}</div>
                              </td>
                              <td className="px-6 lg:px-10 py-5">
                                <div className="text-sm font-bold text-zinc-900 leading-tight line-clamp-1">{mat?.name || 'Material Removido'}</div>
                                <div className="text-[10px] text-zinc-400 font-mono font-bold uppercase mt-0.5">{mat?.code}</div>
                              </td>
                              <td className="px-6 lg:px-10 py-5">
                                {mov.type === 'Entrada' ? (
                                  <div className="flex items-center gap-2 text-emerald-600 font-black text-[10px] uppercase tracking-widest">
                                    <div className="p-1 bg-emerald-50 rounded-lg"><ArrowDownLeft size={14} /></div>
                                    <span className="hidden sm:inline">Entrada</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-rose-600 font-black text-[10px] uppercase tracking-widest">
                                    <div className="p-1 bg-rose-50 rounded-lg"><ArrowUpRight size={14} /></div>
                                    <span className="hidden sm:inline">Saída</span>
                                  </div>
                                )}
                              </td>
                              <td className="px-6 lg:px-10 py-5">
                                <span className={`font-black text-xs ${mov.type === 'Entrada' ? 'text-emerald-700' : 'text-rose-700'}`}>
                                  {mov.type === 'Entrada' ? '+' : '-'}{mov.quantity}
                                </span>
                              </td>
                              <td className="px-6 lg:px-10 py-5">
                                <span className="text-[10px] bg-zinc-100 text-zinc-500 px-3 py-1 rounded-lg font-black uppercase tracking-tight shadow-inner truncate block max-w-[150px]">{mov.reason}</span>
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
          </motion.div>
        </div>
      </main>

      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
            className={`fixed bottom-8 right-8 z-50 flex items-center gap-4 px-6 py-4 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border-l-4 ${
              notification.type === 'success' ? 'bg-white border-green-500' : 
              notification.type === 'error' ? 'bg-white border-red-500' : 
              'bg-white border-blue-500'
            }`}
          >
            <div className={`p-2 rounded-xl ${
              notification.type === 'success' ? 'bg-green-50 text-green-600' : 
              notification.type === 'error' ? 'bg-red-50 text-red-600' : 
              'bg-blue-50 text-blue-600'
            }`}>
              {notification.type === 'success' ? <CheckCircle size={20} /> : notification.type === 'error' ? <AlertCircle size={20} /> : <Bell size={20} />}
            </div>
            <div className="flex-1 min-w-[200px]">
              <p className="text-[9px] font-black uppercase tracking-[0.15em] text-zinc-400 leading-none mb-1.5">{notification.type}</p>
              <p className="text-sm font-bold text-zinc-900 leading-tight">{notification.message}</p>
            </div>
            <button onClick={() => setNotification(null)} className="p-1 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-400">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminPanel;
