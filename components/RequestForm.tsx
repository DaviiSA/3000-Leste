
import React, { useState } from 'react';
import { Material, RequestedItem } from '../types';
import { VTRS } from '../constants';
import { Search, Plus, Trash2, Send, ChevronRight, PackageOpen, Loader2, Minus } from 'lucide-react';

interface RequestFormProps {
  materials: (Material & { availableStock: number })[];
  onSubmit: (vtr: string, items: RequestedItem[]) => Promise<void> | void;
}

const RequestForm: React.FC<RequestFormProps> = ({ materials, onSubmit }) => {
  const [step, setStep] = useState(1);
  const [selectedVtr, setSelectedVtr] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<RequestedItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableMaterials = materials.filter(m => 
    m.availableStock > 0 && (
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      m.code.includes(searchTerm)
    )
  );

  const addToCart = (materialId: string) => {
    const material = materials.find(m => m.id === materialId);
    if (!material) return;

    const existing = cart.find(i => i.materialId === materialId);
    if (existing) {
      if (existing.quantity < material.availableStock) {
        setCart(cart.map(i => i.materialId === materialId ? { ...i, quantity: i.quantity + 1 } : i));
      } else {
        alert(`Saldo insuficiente! Há apenas ${material.availableStock} unidades livres.`);
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

  const handleFinish = async () => {
    if (!selectedVtr) {
      alert('Selecione uma viatura.');
      setStep(1);
      return;
    }
    if (cart.length === 0) {
      alert('Selecione ao menos um material.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      await onSubmit(selectedVtr, cart);
      setCart([]);
      setSelectedVtr('');
      setStep(1);
    } catch (e) {
      alert("Falha ao enviar solicitação. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="animate-in slide-in-from-right duration-500">
      {/* Progress Stepper */}
      <div className="flex items-center justify-center mb-8">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>1</div>
        <div className={`w-12 h-0.5 transition-colors ${step >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>2</div>
        <div className={`w-12 h-0.5 transition-colors ${step >= 3 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>3</div>
      </div>

      {step === 1 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
          <h2 className="text-xl font-bold mb-6 text-gray-800">Selecione sua VTR</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {VTRS.map(vtr => (
              <button
                key={vtr}
                onClick={() => { setSelectedVtr(vtr); setStep(2); }}
                className={`py-3 rounded-xl border-2 font-bold transition-all ${
                  selectedVtr === vtr 
                  ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-inner' 
                  : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-blue-300'
                }`}
              >
                {vtr}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
            <span className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-lg uppercase tracking-wider">VTR {selectedVtr}</span>
            <div className="h-4 w-px bg-gray-200"></div>
            <button onClick={() => setStep(1)} className="text-xs text-gray-500 hover:underline">Trocar VTR</button>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Qual material você precisa?"
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {availableMaterials.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <PackageOpen size={48} className="mx-auto mb-2 opacity-20" />
                  <p>Nenhum material disponível no estoque.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableMaterials.map(mat => (
                    <div key={mat.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all">
                      <div className="flex-1 mr-4">
                        <p className="text-sm font-bold text-gray-800 line-clamp-1">{mat.name}</p>
                        <p className="text-[10px] text-gray-400 font-mono uppercase">
                          Cod: {mat.code} • <span className="text-green-600 font-bold">SALDO: {mat.availableStock}</span>
                        </p>
                      </div>
                      <button
                        onClick={() => addToCart(mat.id)}
                        className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-95 transition-all shadow-md"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => setStep(3)}
            disabled={cart.length === 0}
            className={`w-full py-4 rounded-2xl flex items-center justify-center gap-2 font-bold shadow-lg transition-all ${
              cart.length > 0 ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            Ver Itens Selecionados ({cart.length})
            <ChevronRight size={20} />
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold mb-6 text-gray-800 flex items-center gap-2">
              <ClipboardList size={24} className="text-blue-600" />
              Resumo da Solicitação
            </h2>
            
            <div className="space-y-4 mb-8">
              {cart.map(item => {
                const material = materials.find(m => m.id === item.materialId);
                return (
                  <div key={item.materialId} className="flex items-center justify-between bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800">{material?.name}</p>
                      <p className="text-xs text-gray-500">Saldo Livre: {material?.availableStock}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center bg-white rounded-lg border border-gray-200 p-1">
                        <button 
                          onClick={() => updateQuantity(item.materialId, -1)}
                          className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
                        <button 
                          onClick={() => updateQuantity(item.materialId, 1)}
                          className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <button 
                        onClick={() => removeFromCart(item.materialId)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleFinish}
                disabled={isSubmitting}
                className="w-full py-4 bg-green-600 text-white rounded-2xl flex items-center justify-center gap-2 font-bold shadow-lg hover:bg-green-700 transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Send size={20} />
                )}
                {isSubmitting ? 'Enviando...' : 'Confirmar e Enviar'}
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={isSubmitting}
                className="w-full py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all"
              >
                Adicionar mais itens
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ClipboardList = ({ size, className }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><path d="M12 11h4"></path><path d="M12 16h4"></path><path d="M8 11h.01"></path><path d="M8 16h.01"></path></svg>
);

export default RequestForm;
