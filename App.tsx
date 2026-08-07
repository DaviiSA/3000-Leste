
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from './components/Layout';
import AdminPanel from './components/AdminPanel';
import RequestForm from './components/RequestForm';
import { Material, MaterialRequest, View, RequestedItem, StockMovement, VtrStock } from './types';
import { 
  initializeMaterials, 
  saveMaterials, 
  getRequests, 
  saveRequests, 
  getMovements,
  saveMovements,
  getVtrStocks,
  saveVtrStocks,
  syncToGoogleSheets,
  fetchRemoteData 
} from './services/dataService';
import { ADMIN_PASSWORD } from './constants';
import { ShieldAlert, UserCheck, Lock, ArrowRight, Database, Loader2, RefreshCw, Clock, PackageOpen } from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<View>('Home');
  const [materials, setMaterials] = useState<Material[]>(() => initializeMaterials());
  const [requests, setRequests] = useState<MaterialRequest[]>(() => getRequests());
  const [movements, setMovements] = useState<StockMovement[]>(() => getMovements());
  const [vtrStocks, setVtrStocks] = useState<VtrStock[]>(() => getVtrStocks());
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
        if (remote.materials && remote.materials.length > 0) setMaterials(remote.materials);
        if (remote.requests && Array.isArray(remote.requests)) setRequests(remote.requests);
        if (remote.movements && Array.isArray(remote.movements)) setMovements(remote.movements);
        if (remote.vtrStocks && Array.isArray(remote.vtrStocks)) setVtrStocks(remote.vtrStocks);
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
    const interval = setInterval(() => loadGlobalData(false), 30000);
    return () => clearInterval(interval);
  }, [loadGlobalData]);

  const triggerSync = async (mats: Material[], reqs: MaterialRequest[], movs: StockMovement[], vStocks: VtrStock[]) => {
    setIsSyncing(true);
    pendingSyncRef.current = true;
    const success = await syncToGoogleSheets({ materials: mats, requests: reqs, movements: movs, vtrStocks: vStocks });
    
    // Agendar um recarregamento para garantir consistência após o Apps Script processar
    setTimeout(() => {
      pendingSyncRef.current = false;
      loadGlobalData(false);
    }, success ? 10000 : 2000);
  };

  const handleUpdateStock = async (id: string, newStock: number) => {
    setIsSyncing(true);
    const remote = await fetchRemoteData();
    const currentMaterials = remote?.materials || [...materials];
    const currentMovements = remote?.movements || [...movements];

    const material = currentMaterials.find(m => m.id === id);
    if (!material) {
      setIsSyncing(false);
      return;
    }

    const diff = newStock - material.stock;
    if (diff === 0) {
      setIsSyncing(false);
      return;
    }

    const newMovement: StockMovement = {
      id: `MOV-${Date.now()}-${id}`,
      materialId: id,
      type: diff > 0 ? 'Entrada' : 'Saída',
      quantity: Math.abs(diff),
      timestamp: new Date().toISOString(),
      reason: 'Ajuste Manual Administrativo'
    };

    const updatedMats = currentMaterials.map(m => m.id === id ? { ...m, stock: Math.max(0, newStock) } : m);
    const updatedMovs = [...currentMovements, newMovement];

    const finalRequests = remote?.requests || [...requests];
    const finalVtrStocks = remote?.vtrStocks || [...vtrStocks];

    setMaterials(updatedMats);
    setMovements(updatedMovs);
    setRequests(finalRequests);
    setVtrStocks(finalVtrStocks);
    
    saveMaterials(updatedMats);
    saveMovements(updatedMovs);
    saveRequests(finalRequests);
    saveVtrStocks(finalVtrStocks);

    triggerSync(updatedMats, finalRequests, updatedMovs, finalVtrStocks);
  };

  const handleAddRequest = async (vtr: string, items: RequestedItem[]) => {
    setIsSyncing(true);
    const remote = await fetchRemoteData();
    const currentMaterials = remote?.materials || [...materials];
    const currentMovements = remote?.movements || [...movements];
    const currentRequests = remote?.requests || [...requests];

    // 1. Gerar movimentações de saída (Reserva imediata de estoque)
    const newMovements: StockMovement[] = items.map(item => ({
      id: `MOV-${Date.now()}-${item.materialId}`,
      materialId: item.materialId,
      type: 'Saída',
      quantity: item.quantity,
      timestamp: new Date().toISOString(),
      reason: `Reserva ${vtr} (Pendente)`
    }));

    // 2. Abatimento local do estoque (Reserva)
    const updatedMaterials = currentMaterials.map(m => {
      const r = items.find(i => i.materialId === m.id);
      return r ? { ...m, stock: Math.max(0, m.stock - r.quantity) } : m;
    });

    // 3. Novo pedido inicia como PENDENTE
    const newRequest: MaterialRequest = {
      id: `PED-${Date.now().toString(36).toUpperCase()}`,
      vtr,
      timestamp: new Date().toISOString(),
      items,
      status: 'Pendente'
    };
    
    const updatedRequests = [...currentRequests, newRequest];
    const updatedMovs = [...currentMovements, ...newMovements];
    const finalVtrStocks = remote?.vtrStocks || [...vtrStocks];
    
    setMaterials(updatedMaterials);
    setRequests(updatedRequests);
    setMovements(updatedMovs);
    setVtrStocks(finalVtrStocks);

    saveMaterials(updatedMaterials);
    saveRequests(updatedRequests);
    saveMovements(updatedMovs);
    saveVtrStocks(finalVtrStocks);
    
    await triggerSync(updatedMaterials, updatedRequests, updatedMovs, finalVtrStocks);
    alert(`Solicitação para ${vtr} enviada com sucesso! Aguarde a confirmação do administrativo.`);
  };

  const handleUpdateRequestStatus = async (requestId: string, status: 'Atendido' | 'Cancelado') => {
    setIsSyncing(true);
    const remote = await fetchRemoteData();
    
    let currentMaterials = remote?.materials || [...materials];
    let currentMovements = remote?.movements || [...movements];
    let currentVtrStocks = remote?.vtrStocks || [...vtrStocks];
    let currentRequests = remote?.requests || [...requests];

    const updatedRequests = currentRequests.map(req => {
      if (req.id === requestId) {
        if (status === 'Atendido' && req.status === 'Pendente') {
          // 1. Log de confirmação
          currentMovements.push({
            id: `MOV-CONF-${Date.now()}-${req.id}`,
            materialId: req.items[0]?.materialId || '',
            type: 'Saída',
            quantity: 0,
            timestamp: new Date().toISOString(),
            reason: `Atendimento Confirmado VTR ${req.vtr}`
          });

          // 2. Incrementar estoque da VTR (apenas itens não cancelados)
          const vtrIdx = currentVtrStocks.findIndex(vs => vs.vtr === req.vtr);
          const activeItems = req.items.filter(i => !i.cancelled);
          
          if (vtrIdx === -1) {
            currentVtrStocks.push({ vtr: req.vtr, items: [...activeItems] });
          } else {
            const updatedItems = [...currentVtrStocks[vtrIdx].items];
            activeItems.forEach(item => {
              const itemIdx = updatedItems.findIndex(i => i.materialId === item.materialId);
              if (itemIdx === -1) {
                updatedItems.push({ ...item });
              } else {
                updatedItems[itemIdx] = { 
                  ...updatedItems[itemIdx], 
                  quantity: updatedItems[itemIdx].quantity + item.quantity 
                };
              }
            });
            currentVtrStocks[vtrIdx] = { ...currentVtrStocks[vtrIdx], items: updatedItems };
          }
        }
        
        if (status === 'Cancelado' && req.status !== 'Cancelado') {
          // Se estava atendido, remove do estoque da VTR (apenas itens não cancelados)
          if (req.status === 'Atendido') {
            const vtrIdx = currentVtrStocks.findIndex(vs => vs.vtr === req.vtr);
            if (vtrIdx !== -1) {
              const updatedItems = [...currentVtrStocks[vtrIdx].items];
              req.items.filter(i => !i.cancelled).forEach(item => {
                const itemIdx = updatedItems.findIndex(i => i.materialId === item.materialId);
                if (itemIdx !== -1) {
                  updatedItems[itemIdx] = { 
                    ...updatedItems[itemIdx], 
                    quantity: Math.max(0, updatedItems[itemIdx].quantity - item.quantity) 
                  };
                }
              });
              currentVtrStocks[vtrIdx] = { ...currentVtrStocks[vtrIdx], items: updatedItems };
            }
          }

          // Devolver itens ao estoque principal (apenas itens não cancelados)
          req.items.filter(i => !i.cancelled).forEach(item => {
            const mIdx = currentMaterials.findIndex(m => m.id === item.materialId);
            if (mIdx !== -1) {
              currentMaterials[mIdx] = { ...currentMaterials[mIdx], stock: currentMaterials[mIdx].stock + item.quantity };
              currentMovements.push({
                id: `MOV-RECON-${Date.now()}-${item.materialId}`,
                materialId: item.materialId,
                type: 'Entrada',
                quantity: item.quantity,
                timestamp: new Date().toISOString(),
                reason: `Cancelamento/Estorno Pedido VTR ${req.vtr}`
              });
            }
          });
        }
        return { ...req, status };
      }
      return req;
    });
    
    setMaterials(currentMaterials);
    setRequests(updatedRequests);
    setMovements(currentMovements);
    setVtrStocks(currentVtrStocks);
    
    saveMaterials(currentMaterials);
    saveRequests(updatedRequests);
    saveMovements(currentMovements);
    saveVtrStocks(currentVtrStocks);
    
    triggerSync(currentMaterials, updatedRequests, currentMovements, currentVtrStocks);
  };

  const handleUpdateItemInRequest = async (requestId: string, materialId: string, action: 'update' | 'cancel', newQuantity?: number) => {
    setIsSyncing(true);
    const remote = await fetchRemoteData();

    let currentMaterials = remote?.materials || [...materials];
    let currentMovements = remote?.movements || [...movements];
    let currentVtrStocks = remote?.vtrStocks || [...vtrStocks];
    let currentRequests = remote?.requests || [...requests];

    const reqIdx = currentRequests.findIndex(r => r.id === requestId);
    if (reqIdx === -1) {
      setIsSyncing(false);
      return;
    }

    const request = { ...currentRequests[reqIdx] };
    const items = [...request.items];
    const itemIdx = items.findIndex(i => i.materialId === materialId);
    if (itemIdx === -1) {
      setIsSyncing(false);
      return;
    }

    const item = { ...items[itemIdx] };
    const oldQuantity = item.quantity;

    if (action === 'cancel') {
      item.cancelled = !item.cancelled;
      
      if (item.cancelled) {
        const mIdx = currentMaterials.findIndex(m => m.id === materialId);
        if (mIdx !== -1) {
          currentMaterials[mIdx] = { ...currentMaterials[mIdx], stock: currentMaterials[mIdx].stock + oldQuantity };
          currentMovements.push({
            id: `MOV-ITEM-CANCEL-${Date.now()}-${materialId}`,
            materialId: materialId,
            type: 'Entrada',
            quantity: oldQuantity,
            timestamp: new Date().toISOString(),
            reason: `Item cancelado no Pedido ${request.vtr}`
          });
        }
        
        if (request.status === 'Atendido') {
          const vtrIdx = currentVtrStocks.findIndex(vs => vs.vtr === request.vtr);
          if (vtrIdx !== -1) {
            const vItems = [...currentVtrStocks[vtrIdx].items];
            const vItemIdx = vItems.findIndex(vi => vi.materialId === materialId);
            if (vItemIdx !== -1) {
              vItems[vItemIdx] = { ...vItems[vItemIdx], quantity: Math.max(0, vItems[vItemIdx].quantity - oldQuantity) };
              currentVtrStocks[vtrIdx] = { ...currentVtrStocks[vtrIdx], items: vItems };
            }
          }
        }
      } else {
        const mIdx = currentMaterials.findIndex(m => m.id === materialId);
        if (mIdx !== -1) {
          currentMaterials[mIdx] = { ...currentMaterials[mIdx], stock: Math.max(0, currentMaterials[mIdx].stock - oldQuantity) };
          currentMovements.push({
            id: `MOV-ITEM-REACTIVATE-${Date.now()}-${materialId}`,
            materialId: materialId,
            type: 'Saída',
            quantity: oldQuantity,
            timestamp: new Date().toISOString(),
            reason: `Item reativado no Pedido ${request.vtr}`
          });
        }

        if (request.status === 'Atendido') {
           const vtrIdx = currentVtrStocks.findIndex(vs => vs.vtr === request.vtr);
           if (vtrIdx !== -1) {
             const vItems = [...currentVtrStocks[vtrIdx].items];
             const vItemIdx = vItems.findIndex(vi => vi.materialId === materialId);
             if (vItemIdx === -1) {
               vItems.push({ materialId, quantity: oldQuantity });
             } else {
               vItems[vItemIdx] = { ...vItems[vItemIdx], quantity: vItems[vItemIdx].quantity + oldQuantity };
             }
             currentVtrStocks[vtrIdx] = { ...currentVtrStocks[vtrIdx], items: vItems };
           }
        }
      }
    } else if (action === 'update' && typeof newQuantity === 'number') {
      if (item.cancelled) {
        setIsSyncing(false);
        return; 
      }

      const diff = newQuantity - oldQuantity;
      if (diff === 0) {
        setIsSyncing(false);
        return;
      }

      item.quantity = newQuantity;

      const mIdx = currentMaterials.findIndex(m => m.id === materialId);
      if (mIdx !== -1) {
        currentMaterials[mIdx] = { ...currentMaterials[mIdx], stock: Math.max(0, currentMaterials[mIdx].stock - diff) };
        currentMovements.push({
          id: `MOV-ITEM-UPDATE-${Date.now()}-${materialId}`,
          materialId: materialId,
          type: diff > 0 ? 'Saída' : 'Entrada',
          quantity: Math.abs(diff),
          timestamp: new Date().toISOString(),
          reason: `Alteração qtd item no Pedido ${request.vtr}`
        });
      }

      if (request.status === 'Atendido') {
         const vtrIdx = currentVtrStocks.findIndex(vs => vs.vtr === request.vtr);
         if (vtrIdx !== -1) {
           const vItems = [...currentVtrStocks[vtrIdx].items];
           const vItemIdx = vItems.findIndex(vi => vi.materialId === materialId);
           if (vItemIdx !== -1) {
             vItems[vItemIdx] = { ...vItems[vItemIdx], quantity: Math.max(0, vItems[vItemIdx].quantity + diff) };
             currentVtrStocks[vtrIdx] = { ...currentVtrStocks[vtrIdx], items: vItems };
           }
         }
      }
    }

    items[itemIdx] = item;
    request.items = items;
    currentRequests[reqIdx] = request;

    setMaterials(currentMaterials);
    setRequests(currentRequests);
    setMovements(currentMovements);
    setVtrStocks(currentVtrStocks);
    
    saveMaterials(currentMaterials);
    saveRequests(currentRequests);
    saveMovements(currentMovements);
    saveVtrStocks(currentVtrStocks);
    
    triggerSync(currentMaterials, currentRequests, currentMovements, currentVtrStocks);
  };

  const handleUpdateVtrStock = async (vtr: string, materialId: string, delta: number) => {
    setIsSyncing(true);
    const remote = await fetchRemoteData();
    
    let currentVtrStocks = remote?.vtrStocks || [...vtrStocks];
    const vtrIdx = currentVtrStocks.findIndex(vs => vs.vtr === vtr);
    
    if (vtrIdx === -1) {
      if (delta > 0) {
        currentVtrStocks.push({ vtr, items: [{ materialId, quantity: delta }] });
      } else {
        setIsSyncing(false);
        return;
      }
    } else {
      const updatedItems = [...currentVtrStocks[vtrIdx].items];
      const itemIdx = updatedItems.findIndex(i => i.materialId === materialId);
      
      if (itemIdx === -1) {
        if (delta > 0) {
          updatedItems.push({ materialId, quantity: delta });
        } else {
          setIsSyncing(false);
          return;
        }
      } else {
        updatedItems[itemIdx] = { 
          ...updatedItems[itemIdx], 
          quantity: Math.max(0, updatedItems[itemIdx].quantity + delta) 
        };
      }
      currentVtrStocks[vtrIdx] = { ...currentVtrStocks[vtrIdx], items: updatedItems };
    }
    
    const finalMaterials = remote?.materials || [...materials];
    const finalRequests = remote?.requests || [...requests];
    const finalMovements = remote?.movements || [...movements];

    setMaterials(finalMaterials);
    setRequests(finalRequests);
    setMovements(finalMovements);
    setVtrStocks(currentVtrStocks);

    saveMaterials(finalMaterials);
    saveRequests(finalRequests);
    saveMovements(finalMovements);
    saveVtrStocks(currentVtrStocks);

    triggerSync(finalMaterials, finalRequests, finalMovements, currentVtrStocks);
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
    <Layout 
      currentView={view} 
      onNavigate={(v) => {
        setView(v);
        if (v !== 'Admin') setIsAdminAuthenticated(false);
      }}
      fullWidth={view === 'Admin' && isAdminAuthenticated}
      hideHeaderFooter={view === 'Admin' && isAdminAuthenticated}
    >
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-4xl">
            <button onClick={() => setView('Admin')} className="group p-8 bg-white rounded-3xl shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all border-2 border-transparent hover:border-blue-100 flex flex-col items-center text-center gap-4">
              <div className="p-5 rounded-2xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors"><ShieldAlert size={48} /></div>
              <h3 className="text-xl font-bold text-gray-800">Administrador</h3>
              <ArrowRight className="mt-2 text-blue-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </button>
            <button onClick={() => setView('Request')} className="group p-8 bg-white rounded-3xl shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all border-2 border-transparent hover:border-orange-100 flex flex-col items-center text-center gap-4">
              <div className="p-5 rounded-2xl bg-orange-50 text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-colors"><UserCheck size={48} /></div>
              <h3 className="text-xl font-bold text-gray-800">Viatura</h3>
              <ArrowRight className="mt-2 text-orange-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </button>
            <button onClick={() => setView('Other')} className="group p-8 bg-white rounded-3xl shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all border-2 border-transparent hover:border-green-100 flex flex-col items-center text-center gap-4">
              <div className="p-5 rounded-2xl bg-green-50 text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors"><PackageOpen size={48} /></div>
              <h3 className="text-xl font-bold text-gray-800">Outros</h3>
              <ArrowRight className="mt-2 text-green-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
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
                <input autoFocus type="password" placeholder="Senha DCMD" className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-blue-500 text-center text-lg font-bold" value={passInput} onChange={(e) => setPassInput(e.target.value)} />
                <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg hover:bg-blue-700 transition-all">Entrar</button>
              </form>
            </div>
          </div>
        ) : (
          <AdminPanel 
            materials={materials} 
            requests={requests} 
            movements={movements}
            vtrStocks={vtrStocks}
            onUpdateStock={handleUpdateStock}
            onUpdateRequestStatus={handleUpdateRequestStatus}
            onUpdateItemInRequest={handleUpdateItemInRequest}
            onUpdateVtrStock={handleUpdateVtrStock}
            onLogout={() => {
              setIsAdminAuthenticated(false);
              setView('Home');
            }}
          />
        )
      )}

      {view === 'Request' && (
        <RequestForm 
          materials={materials.map(m => ({ ...m, availableStock: m.stock }))} 
          onSubmit={handleAddRequest} 
          mode="vtr"
        />
      )}

      {view === 'Other' && (
        <RequestForm 
          materials={materials.map(m => ({ ...m, availableStock: m.stock }))} 
          onSubmit={handleAddRequest} 
          mode="other"
        />
      )}
    </Layout>
  );
};

export default App;
