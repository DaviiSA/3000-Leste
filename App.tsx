
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Layout from './components/Layout';
import AdminPanel from './components/AdminPanel';
import RequestForm from './components/RequestForm';
import { Material, MaterialRequest, View, RequestedItem } from './types';
import { 
  initializeMaterials, 
  saveMaterials, 
  getRequests, 
  saveRequests, 
  syncToGoogleSheets,
  fetchRemoteData 
} from './services/dataService';
import { ADMIN_PASSWORD } from './constants';
import { ShieldAlert, UserCheck, Lock, ArrowRight, Database, Loader2, RefreshCw } from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<View>('Home');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Ref para evitar que atualizações de rede sobrescrevam alterações locais pendentes
  const pendingSyncRef = useRef<boolean>(false);

  const loadGlobalData = useCallback(async (isManual = true) => {
    if (pendingSyncRef.current && !isManual) return; // Não carrega se houver sync pendente
    
    if (isManual) setIsSyncing(true);
    
    try {
      const remote = await fetchRemoteData();
      if (remote && remote.materials.length > 0) {
        setMaterials(remote.materials);
        setRequests(remote.requests);
      } else {
        // Fallback local apenas se a lista estiver vazia
        setMaterials(prev => prev.length > 0 ? prev : initializeMaterials());
        setRequests(prev => prev.length > 0 ? prev : getRequests());
      }
    } catch (e) {
      console.error("Erro no carregamento:", e);
    } finally {
      setIsSyncing(false);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGlobalData(true);
    const interval = setInterval(() => loadGlobalData(false), 180000); // 3 min
    return () => clearInterval(interval);
  }, [loadGlobalData]);

  const materialsWithEffectiveStock = useMemo(() => {
    return materials.map(m => {
      const reserved = requests
        .filter(r => r.status === 'Pendente')
        .reduce((acc, req) => {
          const item = req.items.find(i => i.materialId === m.id);
          return acc + (item ? item.quantity : 0);
        }, 0);
      
      return {
        ...m,
        availableStock: Math.max(0, m.stock - reserved)
      };
    });
  }, [materials, requests]);

  const triggerSync = async (updatedMaterials: Material[], updatedRequests: MaterialRequest[]) => {
    setIsSyncing(true);
    pendingSyncRef.current = true;
    
    const success = await syncToGoogleSheets({ materials: updatedMaterials, requests: updatedRequests });
    
    // Aguarda um tempo maior para o Google Sheets processar antes de ler de volta
    setTimeout(() => {
      pendingSyncRef.current = false;
      loadGlobalData(false);
    }, 3000);
  };

  const handleUpdateStock = (id: string, newStock: number) => {
    const val = Math.max(0, newStock);
    const updated = materials.map(m => m.id === id ? { ...m, stock: val } : m);
    
    // Atualiza estado local imediatamente para feedback visual instantâneo
    setMaterials(updated);
    saveMaterials(updated);
    
    // Sincroniza em background
    triggerSync(updated, requests);
  };

  const handleAddRequest = async (vtr: string, items: RequestedItem[]) => {
    const newRequest: MaterialRequest = {
      id: `PED-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      vtr,
      timestamp: new Date().toISOString(),
      items,
      status: 'Pendente'
    };
    const updatedRequests = [...requests, newRequest];
    
    setRequests(updatedRequests);
    saveRequests(updatedRequests);
    
    await triggerSync(materials, updatedRequests);
    alert(`Solicitação ${newRequest.id} enviada!`);
  };

  const handleUpdateRequestStatus = (requestId: string, status: 'Atendido' | 'Cancelado') => {
    let currentMaterials = [...materials];
    const updatedRequests = requests.map(req => {
      if (req.id === requestId) {
        if (status === 'Atendido' && req.status === 'Pendente') {
          req.items.forEach(item => {
            const mIdx = currentMaterials.findIndex(m => m.id === item.materialId);
            if (mIdx !== -1) {
              currentMaterials[mIdx] = {
                ...currentMaterials[mIdx],
                stock: Math.max(0, currentMaterials[mIdx].stock - item.quantity)
              };
            }
          });
        }
        return { ...req, status };
      }
      return req;
    });
    
    setMaterials(currentMaterials);
    setRequests(updatedRequests);
    saveMaterials(currentMaterials);
    saveRequests(updatedRequests);
    triggerSync(currentMaterials, updatedRequests);
  };

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (passInput === ADMIN_PASSWORD) {
      setIsAdminAuthenticated(true);
      setPassInput('');
    } else {
      alert('Senha incorreta!');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <Loader2 size={48} className="text-blue-600 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-gray-800 tracking-tight">Linha Viva Leste</h2>
        <p className="text-sm text-gray-400 font-medium">Sincronizando com servidor DCMD...</p>
      </div>
    );
  }

  const renderContent = () => {
    switch (view) {
      case 'Home':
        return (
          <div className="flex flex-col gap-8 items-center justify-center min-h-[60vh] animate-in fade-in zoom-in duration-700">
            <div className="text-center space-y-2">
               <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Linha Viva Leste</h2>
               <p className="text-gray-500 max-w-xs mx-auto text-sm font-medium">Sistema DCMD de Controle de Materiais</p>
               <div className="mt-4 flex justify-center">
                 <button 
                   onClick={() => loadGlobalData(true)}
                   disabled={isSyncing}
                   className={`inline-flex items-center gap-2 text-[10px] font-bold px-4 py-2 rounded-full uppercase tracking-widest transition-all ${
                     isSyncing ? 'bg-blue-600 text-white animate-pulse' : 'text-blue-600 bg-blue-50 hover:bg-blue-100 shadow-sm'
                   }`}
                 >
                   <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
                   {isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}
                 </button>
               </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">
              <button
                onClick={() => setView('Admin')}
                className="group p-8 bg-white rounded-3xl shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all border-2 border-transparent hover:border-blue-100 flex flex-col items-center text-center gap-4"
              >
                <div className="p-5 rounded-2xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <ShieldAlert size={48} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-800">Administrador</h3>
                  <p className="text-sm text-gray-500 mt-1">Gestão de estoque e solicitações.</p>
                </div>
                <ArrowRight className="mt-2 text-blue-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </button>

              <button
                onClick={() => setView('Request')}
                className="group p-8 bg-white rounded-3xl shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all border-2 border-transparent hover:border-orange-100 flex flex-col items-center text-center gap-4"
              >
                <div className="p-5 rounded-2xl bg-orange-50 text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                  <UserCheck size={48} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-800">Solicitação</h3>
                  <p className="text-sm text-gray-500 mt-1">Pedir materiais para a VTR.</p>
                </div>
                <ArrowRight className="mt-2 text-orange-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </button>
            </div>
          </div>
        );

      case 'Admin':
        if (!isAdminAuthenticated) {
          return (
            <div className="max-w-md mx-auto mt-12 animate-in slide-in-from-bottom duration-500 px-4">
              <div className="bg-white p-8 rounded-3xl shadow-2xl border border-gray-100 text-center">
                <div className="inline-flex p-4 rounded-2xl bg-blue-50 text-blue-600 mb-6">
                  <Lock size={32} />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Acesso Restrito</h2>
                <form onSubmit={handleAdminAuth} className="space-y-4">
                  <input
                    autoFocus
                    type="password"
                    placeholder="Senha DCMD"
                    className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-blue-500 focus:ring-0 transition-all text-center text-lg font-bold"
                    value={passInput}
                    onChange={(e) => setPassInput(e.target.value)}
                  />
                  <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg hover:bg-blue-700 transition-all">
                    Entrar no Painel
                  </button>
                  <button type="button" onClick={() => setView('Home')} className="w-full py-2 text-gray-400 text-sm hover:text-gray-600">
                    Voltar
                  </button>
                </form>
              </div>
            </div>
          );
        }
        return (
          <div className="space-y-6">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-wider">
               {isSyncing ? (
                 <><Loader2 size={16} className="animate-spin" /> SINCRONIZANDO...</>
               ) : (
                 <><Database size={16} /> DADOS EM TEMPO REAL</>
               )}
            </div>
            <AdminPanel 
              materials={materials} 
              requests={requests} 
              onUpdateStock={handleUpdateStock}
              onUpdateRequestStatus={handleUpdateRequestStatus}
            />
          </div>
        );

      case 'Request':
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-2 px-1">
               <button 
                 onClick={() => loadGlobalData(true)}
                 disabled={isSyncing}
                 className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 hover:text-blue-600 transition-colors uppercase tracking-widest disabled:opacity-50"
               >
                 <RefreshCw size={10} className={isSyncing ? 'animate-spin' : ''} />
                 {isSyncing ? 'Sincronizando...' : 'Atualizar Saldo'}
               </button>
               {isSyncing && (
                 <div className="flex items-center gap-2 text-blue-600 text-[10px] font-bold animate-pulse">
                    <Loader2 size={10} className="animate-spin" />
                    ENVIANDO PARA NUVEM
                 </div>
               )}
            </div>
            <RequestForm 
              materials={materialsWithEffectiveStock} 
              onSubmit={handleAddRequest} 
            />
          </div>
        );
    }
  };

  return (
    <Layout currentView={view} onNavigate={(v) => {
      setView(v);
      if (v !== 'Admin') setIsAdminAuthenticated(false);
    }}>
      {renderContent()}
    </Layout>
  );
};

export default App;
