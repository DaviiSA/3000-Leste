
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { ShieldAlert, UserCheck, Lock, ArrowRight, Database, Loader2, RefreshCw, Clock } from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<View>('Home');
  const [materials, setMaterials] = useState<Material[]>(() => initializeMaterials());
  const [requests, setRequests] = useState<MaterialRequest[]>(() => getRequests());
  const [lastUpdate, setLastUpdate] = useState<string>(new Date().toLocaleTimeString());
  
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const pendingSyncRef = useRef<boolean>(false);

  const loadGlobalData = useCallback(async (isManual = true) => {
    if (pendingSyncRef.current && !isManual) return;
    
    if (isManual) setIsSyncing(true);
    
    try {
      const remote = await fetchRemoteData();
      
      if (remote) {
        if (remote.materials && remote.materials.length > 0) {
          setMaterials(remote.materials);
        }
        // Se a resposta for um array válido (mesmo vazio), atualizamos o estado
        if (remote.requests && Array.isArray(remote.requests)) {
          setRequests(remote.requests);
        }
        setLastUpdate(new Date().toLocaleTimeString());
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
    const interval = setInterval(() => loadGlobalData(false), 60000); // 1 minuto
    return () => clearInterval(interval);
  }, [loadGlobalData]);

  const triggerSync = async (updatedMaterials: Material[], updatedRequests: MaterialRequest[]) => {
    setIsSyncing(true);
    pendingSyncRef.current = true;
    
    await syncToGoogleSheets({ materials: updatedMaterials, requests: updatedRequests });
    
    // Timer para permitir que o servidor processe antes de ler novamente
    setTimeout(() => {
      pendingSyncRef.current = false;
      loadGlobalData(false);
    }, 4000);
  };

  const handleUpdateStock = (id: string, newStock: number) => {
    const val = Math.max(0, newStock);
    const updated = materials.map(m => m.id === id ? { ...m, stock: val } : m);
    setMaterials(updated);
    saveMaterials(updated);
    triggerSync(updated, requests);
  };

  const handleAddRequest = async (vtr: string, items: RequestedItem[]) => {
    // 1. Abatimento local do estoque
    const updatedMaterials = materials.map(m => {
      const r = items.find(i => i.materialId === m.id);
      return r ? { ...m, stock: Math.max(0, m.stock - r.quantity) } : m;
    });

    // 2. Novo pedido
    const newRequest: MaterialRequest = {
      id: `PED-${Date.now().toString(36).toUpperCase()}`,
      vtr,
      timestamp: new Date().toISOString(),
      items,
      status: 'Atendido'
    };
    
    const updatedRequests = [...requests, newRequest];
    
    // 3. Atualizar UI imediatamente
    setMaterials(updatedMaterials);
    setRequests(updatedRequests);
    saveMaterials(updatedMaterials);
    saveRequests(updatedRequests);
    
    // 4. Sincronizar
    await triggerSync(updatedMaterials, updatedRequests);
    alert(`Sucesso! Pedido da VTR ${vtr} enviado.`);
  };

  const handleUpdateRequestStatus = (requestId: string, status: 'Atendido' | 'Cancelado') => {
    let currentMaterials = [...materials];
    const updatedRequests = requests.map(req => {
      if (req.id === requestId) {
        if (status === 'Cancelado' && req.status !== 'Cancelado') {
          req.items.forEach(item => {
            const mIdx = currentMaterials.findIndex(m => m.id === item.materialId);
            if (mIdx !== -1) {
              currentMaterials[mIdx] = { ...currentMaterials[mIdx], stock: currentMaterials[mIdx].stock + item.quantity };
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

  if (isLoading && materials.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <Loader2 size={48} className="text-blue-600 animate-spin mb-4" />
        <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Sincronizando DCMD...</p>
      </div>
    );
  }

  return (
    <Layout currentView={view} onNavigate={(v) => {
      setView(v);
      if (v !== 'Admin') setIsAdminAuthenticated(false);
    }}>
      {view === 'Home' && (
        <div className="flex flex-col gap-8 items-center justify-center min-h-[60vh] animate-in fade-in zoom-in">
          <div className="text-center space-y-2">
             <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Linha Viva Leste</h2>
             <p className="text-gray-500 text-sm font-medium">Controle de Materiais • DCMD</p>
             <div className="mt-4 flex flex-col items-center gap-2">
               <button 
                 onClick={() => loadGlobalData(true)}
                 disabled={isSyncing}
                 className={`inline-flex items-center gap-2 text-[10px] font-bold px-5 py-2.5 rounded-full uppercase tracking-widest transition-all ${
                   isSyncing ? 'bg-blue-600 text-white animate-pulse' : 'text-blue-600 bg-blue-50 hover:bg-blue-100 shadow-sm'
                 }`}
               >
                 <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
                 {isSyncing ? 'Sincronizando...' : 'Atualizar Dados'}
               </button>
               <span className="text-[9px] text-gray-400 font-bold uppercase flex items-center gap-1">
                 <Clock size={10} /> Atualizado às {lastUpdate}
               </span>
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
              <h3 className="text-xl font-bold text-gray-800">Administrador</h3>
              <ArrowRight className="mt-2 text-blue-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </button>

            <button
              onClick={() => setView('Request')}
              className="group p-8 bg-white rounded-3xl shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all border-2 border-transparent hover:border-orange-100 flex flex-col items-center text-center gap-4"
            >
              <div className="p-5 rounded-2xl bg-orange-50 text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                <UserCheck size={48} />
              </div>
              <h3 className="text-xl font-bold text-gray-800">Solicitação</h3>
              <ArrowRight className="mt-2 text-orange-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </button>
          </div>
        </div>
      )}

      {view === 'Admin' && (
        !isAdminAuthenticated ? (
          <div className="max-w-md mx-auto mt-12 px-4">
            <div className="bg-white p-8 rounded-3xl shadow-2xl border border-gray-100 text-center">
              <div className="inline-flex p-4 rounded-2xl bg-blue-50 text-blue-600 mb-6"><Lock size={32} /></div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Painel de Controle</h2>
              <form onSubmit={handleAdminAuth} className="space-y-4">
                <input
                  autoFocus
                  type="password"
                  placeholder="Senha DCMD"
                  className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-blue-500 text-center text-lg font-bold"
                  value={passInput}
                  onChange={(e) => setPassInput(e.target.value)}
                />
                <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg hover:bg-blue-700 transition-all">Entrar</button>
              </form>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between px-6">
               <div className="flex items-center gap-2 text-blue-600 font-bold text-[10px] uppercase tracking-wider">
                  {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
                  {isSyncing ? 'Sincronizando...' : 'Nuvem Conectada'}
               </div>
               <div className="text-[10px] text-gray-400 font-bold uppercase">Última leitura: {lastUpdate}</div>
            </div>
            <AdminPanel 
              materials={materials} 
              requests={requests} 
              onUpdateStock={handleUpdateStock}
              onUpdateRequestStatus={handleUpdateRequestStatus}
            />
          </div>
        )
      )}

      {view === 'Request' && (
        <RequestForm 
          materials={materials.map(m => ({ ...m, availableStock: m.stock }))} 
          onSubmit={handleAddRequest} 
        />
      )}
    </Layout>
  );
};

export default App;
