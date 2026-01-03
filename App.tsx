
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import AdminPanel from './components/AdminPanel';
import RequestForm from './components/RequestForm';
import { Material, MaterialRequest, View, RequestedItem } from './types';
import { initializeMaterials, saveMaterials, getRequests, saveRequests, syncToGoogleSheets } from './services/dataService';
import { ADMIN_PASSWORD, ENERGISA_COLORS, GOOGLE_SHEETS_WEBAPP_URL } from './constants';
import { ShieldAlert, UserCheck, Lock, ArrowRight, Database, Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<View>('Home');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    setMaterials(initializeMaterials());
    setRequests(getRequests());
  }, []);

  // Calcula o saldo disponível subtraindo o que já foi solicitado e está pendente
  const materialsWithEffectiveStock = materials.map(m => {
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

  const triggerSync = async (updatedMaterials: Material[], updatedRequests: MaterialRequest[]) => {
    setIsSyncing(true);
    try {
      await syncToGoogleSheets({ materials: updatedMaterials, requests: updatedRequests });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateStock = (id: string, newStock: number) => {
    const updated = materials.map(m => m.id === id ? { ...m, stock: Math.max(0, newStock) } : m);
    setMaterials(updated);
    saveMaterials(updated);
    triggerSync(updated, requests);
  };

  const handleAddRequest = async (vtr: string, items: RequestedItem[]) => {
    const newRequest: MaterialRequest = {
      id: `PED-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
      vtr,
      timestamp: new Date().toISOString(),
      items,
      status: 'Pendente'
    };
    const updatedRequests = [...requests, newRequest];
    setRequests(updatedRequests);
    saveRequests(updatedRequests);
    
    await triggerSync(materials, updatedRequests);
    alert(`Solicitação ${newRequest.id} enviada com sucesso!`);
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

  const renderContent = () => {
    switch (view) {
      case 'Home':
        return (
          <div className="flex flex-col gap-8 items-center justify-center min-h-[60vh] animate-in fade-in zoom-in duration-700">
            <div className="text-center space-y-2">
               <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Linha Viva Leste</h2>
               <p className="text-gray-500 max-w-xs mx-auto text-sm font-medium">Sistema Energisa de Controle de Materiais</p>
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
                  <p className="text-sm text-gray-500 mt-1">Gestão de estoque e baixa de materiais.</p>
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
                  <p className="text-sm text-gray-500 mt-1">Pedir materiais para a sua VTR.</p>
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
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Acesso Administrativo</h2>
                <form onSubmit={handleAdminAuth} className="space-y-4">
                  <input
                    autoFocus
                    type="password"
                    placeholder="Digite sua senha"
                    className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-blue-500 focus:ring-0 transition-all text-center text-lg font-bold"
                    value={passInput}
                    onChange={(e) => setPassInput(e.target.value)}
                  />
                  <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg hover:bg-blue-700 transition-all">
                    Acessar Painel
                  </button>
                  <button type="button" onClick={() => setView('Home')} className="w-full py-2 text-gray-400 text-sm hover:text-gray-600">
                    Cancelar e Voltar
                  </button>
                </form>
              </div>
            </div>
          );
        }
        return (
          <div className="space-y-6">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-wider relative overflow-hidden">
               {isSyncing ? (
                 <>
                   <Loader2 size={16} className="animate-spin" />
                   Sincronizando com Planilha...
                 </>
               ) : (
                 <>
                   <Database size={16} />
                   Planilha Google Conectada
                 </>
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
            {isSyncing && (
              <div className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 animate-pulse mb-4">
                <Loader2 size={14} className="animate-spin" />
                REGISTRANDO SOLICITAÇÃO...
              </div>
            )}
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
