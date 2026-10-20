import React, { useState, useMemo } from 'react';
import { Material, RequestedItem, MaterialRequest } from '../types';
import { VTRS } from '../constants';
import { 
  Search, 
  Plus, 
  Trash2, 
  Send, 
  ChevronRight, 
  PackageOpen, 
  Loader2, 
  Minus, 
  UserCircle2,
  CheckCircle2,
  Clock,
  PackageCheck,
  Sparkles,
  ArrowLeft
} from 'lucide-react';

interface RequestFormProps {
  materials: (Material & { availableStock: number })[];
  requests?: MaterialRequest[];
  onSubmit: (vtr: string, items: RequestedItem[], alreadyCollected?: boolean, pickupNote?: string) => Promise<void> | void;
  onTogglePickup?: (requestId: string, collected: boolean, collectedBy?: string) => Promise<void> | void;
  mode?: 'vtr' | 'other';
}

const RequestForm: React.FC<RequestFormProps> = ({ 
  materials, 
  requests = [], 
  onSubmit, 
  onTogglePickup, 
  mode = 'vtr' 
}) => {
  // Passos: 1 = Identificação, 2 = Seleção de Itens, 3 = Tela com Materiais Solicitados & Retirada
  const [step, setStep] = useState(1);
  const [selectedVtr, setSelectedVtr] = useState('');
  const [customRequester, setCustomRequester] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<RequestedItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Opção de autoatendimento na solicitação (Já pegou ou não)
  const [alreadyCollected, setAlreadyCollected] = useState(false);
  const [pickupNote, setPickupNote] = useState('');

  // Estado para confirmação de retirada da solicitação pendente existente
  const [isConfirmingPending, setIsConfirmingPending] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const finalRequester = mode === 'vtr' ? selectedVtr : customRequester;

  const showFeedback = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 3500);
  };

  // Solicitações PENDENTES (apenas status === 'Pendente' e não retiradas) para o solicitante atual
  // IMPORTANTE: Não inclui pedidos já 'Atendidos' ou 'Cancelados'
  const activePendingRequest = useMemo(() => {
    if (!finalRequester) return null;
    return requests.find(r => 
      r.vtr.toLowerCase() === finalRequester.toLowerCase() && 
      r.status === 'Pendente' && 
      !r.collected
    ) || null;
  }, [requests, finalRequester]);

  // Total de itens no carrinho
  const cartItemCount = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.quantity, 0);
  }, [cart]);

  // Materiais disponíveis no catálogo
  const availableMaterials = useMemo(() => {
    return materials.filter(m => 
      m.availableStock > 0 && (
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        m.code.includes(searchTerm)
      )
    );
  }, [materials, searchTerm]);

  // Manipulação do Carrinho
  const addToCart = (materialId: string) => {
    const material = materials.find(m => m.id === materialId);
    if (!material) return;

    const existing = cart.find(i => i.materialId === materialId);
    if (existing) {
      if (existing.quantity < material.availableStock) {
        setCart(cart.map(i => i.materialId === materialId ? { ...i, quantity: i.quantity + 1 } : i));
      } else {
        alert(`Saldo insuficiente! Há apenas ${material.availableStock} unidades livres no almoxarifado.`);
      }
    } else {
      setCart([...cart, { materialId, quantity: 1 }]);
    }
  };

  const removeFromCart = (materialId: string) => {
    setCart(cart.filter(i => i.materialId !== materialId));
  };

  const updateQuantity = (materialId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.materialId === materialId) {
        const material = materials.find(m => m.id === materialId);
        const max = material?.availableStock || 0;
        const newQty = Math.max(1, Math.min(item.quantity + delta, max));
        
        if (delta > 0 && item.quantity >= max) {
          alert(`Limite de saldo atingido (${max}).`);
        }
        
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  // Ao selecionar uma VTR no passo 1
  const handleSelectVtr = (vtr: string) => {
    setSelectedVtr(vtr);
    // Verifica se essa VTR tem solicitação pendente
    const hasPending = requests.some(r => 
      r.vtr.toLowerCase() === vtr.toLowerCase() && 
      r.status === 'Pendente' && 
      !r.collected
    );
    // Se não tiver pendente, avança direto para seleção de materiais (passo 2)
    if (!hasPending) {
      setStep(2);
    }
    // Se tiver pendente, permanece no passo 1 exibindo o card da solicitação com os materiais solicitados
  };

  // Confirmar retirada de solicitação pendente existente dessa VTR/Solicitante
  const handleConfirmExistingPending = async (req: MaterialRequest) => {
    if (!onTogglePickup) return;
    setIsConfirmingPending(true);
    try {
      await onTogglePickup(req.id, true, req.vtr);
      showFeedback(`✅ Retirada confirmada com sucesso para ${req.vtr}! Estoque abastecido.`);
    } catch (e) {
      alert("Erro ao confirmar retirada. Tente novamente.");
    } finally {
      setIsConfirmingPending(false);
    }
  };

  // Envio final da nova solicitação (Passo 3)
  const handleFinish = async () => {
    if (!finalRequester) {
      alert(mode === 'vtr' ? 'Selecione uma viatura.' : 'Informe o destinatário.');
      setStep(1);
      return;
    }
    if (cart.length === 0) {
      alert('Selecione ao menos um material.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      await onSubmit(finalRequester, cart, alreadyCollected, pickupNote);
      setCart([]);
      setSelectedVtr('');
      setCustomRequester('');
      setAlreadyCollected(false);
      setPickupNote('');
      setStep(1);
    } catch (e) {
      alert("Falha ao enviar solicitação. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-right duration-500">
      {/* Toast Feedback */}
      {actionFeedback && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-bold border border-zinc-700 animate-in fade-in slide-in-from-top-4">
          <Sparkles size={18} className="text-yellow-400 shrink-0" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
              mode === 'vtr' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
            }`}>
              {mode === 'vtr' ? 'Linha Viva • Viaturas' : 'Outros Solicitantes'}
            </span>
            <span className="text-xs text-gray-400 font-medium">• DCMD Leste</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-800 mt-1">
            {mode === 'vtr' ? 'Solicitação de Materiais da Viatura' : 'Solicitação de Materiais'}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Faça seu pedido e informe se já retirou na prateleira nos dias sem repositor.
          </p>
        </div>

        {/* Indicador de Etapas */}
        <div className="flex items-center gap-2 bg-gray-50 px-3.5 py-2 rounded-2xl border border-gray-100">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-colors ${
            step === 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
          }`}>1</div>
          <span className="text-[10px] font-bold text-gray-500">VTR</span>
          <ChevronRight size={12} className="text-gray-300" />
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-colors ${
            step === 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
          }`}>2</div>
          <span className="text-[10px] font-bold text-gray-500">Itens</span>
          <ChevronRight size={12} className="text-gray-300" />
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-colors ${
            step === 3 ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-600'
          }`}>3</div>
          <span className="text-[10px] font-bold text-gray-500">Retirada</span>
        </div>
      </div>

      {/* ================================================================ */}
      {/* PASSO 1: IDENTIFICAÇÃO DA VTR / SOLICITANTE                      */}
      {/* ================================================================ */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            {mode === 'vtr' ? (
              <>
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-gray-800">Selecione sua Viatura</h2>
                  <p className="text-xs text-gray-500 mt-1">Toque no número da sua viatura para prosseguir</p>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {VTRS.map(vtr => {
                    // Verifica se tem solicitação estritamente PENDENTE (não atendida)
                    const isPending = requests.some(r => 
                      r.vtr.toLowerCase() === vtr.toLowerCase() && 
                      r.status === 'Pendente' && 
                      !r.collected
                    );
                    const isSelected = selectedVtr === vtr;

                    return (
                      <button
                        key={vtr}
                        onClick={() => handleSelectVtr(vtr)}
                        className={`relative py-3.5 px-2 rounded-2xl border-2 font-black text-sm transition-all flex flex-col items-center justify-center gap-1 ${
                          isSelected 
                            ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-md ring-2 ring-blue-500/20' 
                            : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-blue-400 hover:bg-white hover:shadow-sm'
                        }`}
                      >
                        <span>{vtr}</span>
                        {isPending && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
                            Pendente
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Se a VTR selecionada tiver uma solicitação PENDENTE, exibe aqui a tela com o material solicitado para ela */}
                {selectedVtr && activePendingRequest && (
                  <div className="mt-6 p-5 rounded-3xl bg-amber-50/80 border-2 border-amber-200 animate-in fade-in slide-in-from-top-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-200/60">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-black text-xs uppercase tracking-wider">
                            VTR {selectedVtr}
                          </span>
                          <span className="text-xs font-bold text-amber-900">Possui Solicitação Pendente</span>
                        </div>
                        <p className="text-xs text-amber-700 mt-1">
                          Pedido realizado em: {new Date(activePendingRequest.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                      </div>

                      <span className="px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider bg-amber-200 text-amber-800 self-start sm:self-center">
                        Aguardando Retirada
                      </span>
                    </div>

                    {/* Tela com o material solicitado nesta pendência */}
                    <div className="py-4 space-y-2">
                      <p className="text-[11px] font-black uppercase tracking-wider text-amber-900">
                        Material Solicitado:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {activePendingRequest.items.filter(i => !i.cancelled).map((item, idx) => {
                          const mat = materials.find(m => m.id === item.materialId);
                          return (
                            <div key={idx} className="bg-white p-3 rounded-xl border border-amber-200/80 flex items-center justify-between text-xs">
                              <div className="overflow-hidden pr-2">
                                <p className="font-bold text-gray-800 truncate">{mat?.name || `Item ${item.materialId}`}</p>
                                <p className="text-[10px] text-gray-400 font-mono">CÓD: {mat?.code || item.materialId}</p>
                              </div>
                              <span className="font-black px-2.5 py-1 bg-amber-50 text-amber-900 rounded-lg shrink-0 border border-amber-200">
                                {item.quantity} UN
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Ações diretas para a VTR: Confirmar que já pegou OU Fazer novo pedido */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <button
                        onClick={() => handleConfirmExistingPending(activePendingRequest)}
                        disabled={isConfirmingPending}
                        className="flex-1 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all disabled:opacity-50"
                      >
                        {isConfirmingPending ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={18} />
                        )}
                        <span>Já peguei este material solicitado</span>
                      </button>

                      <button
                        onClick={() => setStep(2)}
                        className="py-3.5 px-5 bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 rounded-2xl font-bold text-xs transition-all"
                      >
                        Fazer Novo Pedido
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="max-w-md mx-auto py-4 text-center">
                <h2 className="text-xl font-bold mb-2 text-gray-800">Destino do Material</h2>
                <p className="text-sm text-gray-500 mb-6">Pessoas, Departamentos ou Empresas</p>
                
                <div className="relative mb-6">
                  <UserCircle2 className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={24} />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Ex: Linha Morta, Iluminação, Carlos..."
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-blue-500 text-lg font-medium transition-all"
                    value={customRequester}
                    onChange={(e) => setCustomRequester(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customRequester.trim()) {
                        const hasPending = requests.some(r => 
                          r.vtr.toLowerCase() === customRequester.trim().toLowerCase() && 
                          r.status === 'Pendente' && 
                          !r.collected
                        );
                        if (!hasPending) setStep(2);
                      }
                    }}
                  />
                </div>

                {/* Se o solicitante digitado tiver uma solicitação PENDENTE */}
                {customRequester.trim() && activePendingRequest && (
                  <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-left">
                    <p className="text-xs font-bold text-amber-900 mb-2">
                      Existe um pedido pendente para {customRequester}:
                    </p>
                    <div className="space-y-1 mb-3">
                      {activePendingRequest.items.filter(i => !i.cancelled).map((item, idx) => {
                        const mat = materials.find(m => m.id === item.materialId);
                        return (
                          <div key={idx} className="text-xs text-amber-800 flex justify-between">
                            <span>{mat?.name || item.materialId}</span>
                            <span className="font-bold">{item.quantity} UN</span>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => handleConfirmExistingPending(activePendingRequest)}
                      disabled={isConfirmingPending}
                      className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 size={16} />
                      <span>Já peguei este material solicitado</span>
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setStep(2)}
                  disabled={!customRequester.trim()}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg hover:bg-blue-700 transition-all disabled:opacity-50 disabled:grayscale"
                >
                  Prosseguir para Seleção
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* PASSO 2: SELEÇÃO DE MATERIAIS NO CATÁLOGO                         */}
      {/* ================================================================ */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Header com VTR selecionada */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl uppercase tracking-wider border border-blue-100">
                {mode === 'vtr' ? `VTR ${selectedVtr}` : customRequester}
              </span>
              <div className="h-4 w-px bg-gray-200"></div>
              <button 
                onClick={() => setStep(1)} 
                className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1 font-medium"
              >
                <ArrowLeft size={14} /> Trocar {mode === 'vtr' ? 'Viatura' : 'Solicitante'}
              </button>
            </div>

            {cart.length > 0 && (
              <button
                onClick={() => setStep(3)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all"
              >
                <span>Ver Materiais Solicitados ({cartItemCount})</span>
                <ChevronRight size={14} />
              </button>
            )}
          </div>

          {/* Barra de Busca de Materiais */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Pesquisar material por nome ou código..."
              className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl shadow-sm text-sm focus:border-blue-500 outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Grid de Materiais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {availableMaterials.length === 0 ? (
              <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-dashed border-gray-200">
                <PackageOpen size={40} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm font-bold text-gray-500">Nenhum material disponível</p>
                <p className="text-xs text-gray-400">Verifique a busca ou o saldo em estoque no DCMD.</p>
              </div>
            ) : (
              availableMaterials.map(mat => {
                const inCart = cart.find(i => i.materialId === mat.id);
                return (
                  <div 
                    key={mat.id}
                    className={`bg-white p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                      inCart ? 'border-blue-500 shadow-md ring-1 ring-blue-500/20' : 'border-gray-100 shadow-sm hover:border-gray-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] font-mono text-gray-400 font-bold uppercase">{mat.code}</span>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                          {mat.availableStock} UN disp.
                        </span>
                      </div>
                      <h3 className="font-bold text-gray-800 text-sm mt-1 leading-snug line-clamp-2">{mat.name}</h3>
                    </div>

                    <div className="pt-2 border-t border-gray-50">
                      {inCart ? (
                        <div className="flex items-center justify-between bg-blue-50/70 p-1 rounded-xl">
                          <button
                            onClick={() => inCart.quantity === 1 ? removeFromCart(mat.id) : updateQuantity(mat.id, -1)}
                            className="p-1.5 hover:bg-white rounded-lg text-blue-700 transition-colors"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="font-black text-xs text-blue-900">{inCart.quantity} UN</span>
                          <button
                            onClick={() => updateQuantity(mat.id, 1)}
                            className="p-1.5 hover:bg-white rounded-lg text-blue-700 transition-colors"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(mat.id)}
                          className="w-full py-2 bg-gray-50 hover:bg-blue-600 hover:text-white text-gray-700 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Plus size={14} />
                          <span>Adicionar</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Barra Fixa Inferior se houver itens no carrinho */}
          {cart.length > 0 && (
            <div className="sticky bottom-4 z-20 bg-zinc-900 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 border border-zinc-800 animate-in fade-in slide-in-from-bottom-2">
              <div>
                <p className="text-xs text-zinc-400 font-medium">Itens selecionados</p>
                <p className="text-base font-black text-white">{cartItemCount} itens no pedido</p>
              </div>

              <button
                onClick={() => setStep(3)}
                className="py-3 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all active:scale-95"
              >
                <span>Avançar para Confirmação</span>
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* PASSO 3: TELA QUE JÁ ESTÁ COM O MATERIAL SOLICITADO & RETIRADA     */}
      {/* ================================================================ */}
      {step === 3 && (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-6">
          {/* Header do Passo 3 */}
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div>
              <span className="text-[10px] font-black uppercase text-blue-600 tracking-wider">
                Passo 3 de 3 • Revisão da Solicitação
              </span>
              <h2 className="text-xl font-black text-gray-800">Materiais Solicitados</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Destino: <strong>{mode === 'vtr' ? `VTR ${selectedVtr}` : customRequester}</strong>
              </p>
            </div>

            <button 
              onClick={() => setStep(2)} 
              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
            >
              <Plus size={14} /> Adicionar mais itens
            </button>
          </div>

          {/* Lista dos Materiais Solicitados */}
          <div className="space-y-3">
            <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider">
              Itens da Solicitação ({cart.length}):
            </label>
            {cart.map(item => {
              const material = materials.find(m => m.id === item.materialId);
              return (
                <div key={item.materialId} className="flex flex-col sm:flex-row sm:items-center justify-between bg-gray-50 p-3.5 rounded-2xl border border-gray-100 gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-800">{material?.name}</p>
                    <p className="text-xs text-gray-400">Cód: {material?.code} • Saldo em estoque: {material?.availableStock}</p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <div className="flex items-center bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
                      <button 
                        onClick={() => updateQuantity(item.materialId, -1)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-10 text-center font-black text-sm text-gray-800">{item.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(item.materialId, 1)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <button 
                      onClick={() => removeFromCart(item.materialId)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                      title="Remover item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ============================================================ */}
          {/* SEÇÃO PRINCIPAL: VOCÊ JÁ PEGOU O MATERIAL SOLICITADO?        */}
          {/* ============================================================ */}
          <div className="p-5 rounded-2xl bg-zinc-50 border-2 border-zinc-200 space-y-4">
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-zinc-700 flex items-center gap-2">
                <PackageCheck size={16} className="text-emerald-600" />
                Situação da Retirada (Dias sem repositor)
              </label>
              <p className="text-xs text-zinc-500 mt-1">
                Você já pegou esse material diretamente na prateleira do almoxarifado?
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Opção 1: JÁ PEGUEI */}
              <button
                type="button"
                onClick={() => setAlreadyCollected(true)}
                className={`p-4 rounded-2xl border-2 text-left transition-all flex items-start gap-3 relative ${
                  alreadyCollected
                    ? 'border-emerald-600 bg-emerald-50/80 text-emerald-900 shadow-md ring-2 ring-emerald-500/20'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-emerald-300'
                }`}
              >
                <div className={`p-2 rounded-xl mt-0.5 ${alreadyCollected ? 'bg-emerald-600 text-white' : 'bg-zinc-100 text-zinc-400'}`}>
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <p className="font-bold text-sm leading-snug">SIM, JÁ PEGUEI O MATERIAL</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                    Retirei direto na prateleira (autoatendimento). O estoque da viatura será atualizado imediatamente.
                  </p>
                </div>
              </button>

              {/* Opção 2: AINDA NÃO PEGUEI */}
              <button
                type="button"
                onClick={() => setAlreadyCollected(false)}
                className={`p-4 rounded-2xl border-2 text-left transition-all flex items-start gap-3 relative ${
                  !alreadyCollected
                    ? 'border-blue-600 bg-blue-50/80 text-blue-900 shadow-md ring-2 ring-blue-500/20'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-blue-300'
                }`}
              >
                <div className={`p-2 rounded-xl mt-0.5 ${!alreadyCollected ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-400'}`}>
                  <Clock size={18} />
                </div>
                <div>
                  <p className="font-bold text-sm leading-snug">AINDA NÃO PEGUEI</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                    Vou retirar depois ou aguardar a reposição pelo responsável do DCMD.
                  </p>
                </div>
              </button>
            </div>

            {/* Observação Opcional */}
            <div className="pt-2">
              <input
                type="text"
                placeholder="Identificação de quem retirou ou observação (opcional)"
                className="w-full px-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs outline-none focus:border-blue-500"
                value={pickupNote}
                onChange={(e) => setPickupNote(e.target.value)}
              />
            </div>
          </div>

          {/* Botões Finais de Ação */}
          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={handleFinish}
              disabled={isSubmitting}
              className={`w-full py-4 rounded-2xl flex items-center justify-center gap-2 font-bold shadow-lg transition-all disabled:opacity-50 text-white ${
                alreadyCollected
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
              }`}
            >
              {isSubmitting ? (
                <Loader2 size={20} className="animate-spin" />
              ) : alreadyCollected ? (
                <CheckCircle2 size={20} />
              ) : (
                <Send size={20} />
              )}
              <span>
                {isSubmitting 
                  ? 'Processando...' 
                  : alreadyCollected 
                    ? 'Confirmar Pedido & Retirada Imediata' 
                    : 'Enviar Pedido (Aguardando Retirada)'}
              </span>
            </button>

            <button
              onClick={() => setStep(2)}
              disabled={isSubmitting}
              className="w-full py-3.5 bg-gray-100 text-gray-700 rounded-2xl font-bold hover:bg-gray-200 transition-all text-xs"
            >
              Voltar e Adicionar Mais Itens
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RequestForm;
