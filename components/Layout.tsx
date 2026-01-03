
import React from 'react';
import { Truck, Home as HomeIcon, Settings, ClipboardList } from 'lucide-react';
import { ENERGISA_COLORS } from '../constants';

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  onNavigate: (view: 'Home' | 'Admin' | 'Request') => void;
}

const Layout: React.FC<LayoutProps> = ({ children, currentView, onNavigate }) => {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header 
        className="text-white shadow-lg sticky top-0 z-50 px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: ENERGISA_COLORS.primary }}
      >
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => onNavigate('Home')}>
          <div className="bg-white p-1.5 rounded-full shadow-inner">
            <Truck size={28} className="text-[#004a99]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none">Linha Viva Leste</h1>
            <p className="text-[10px] uppercase font-semibold opacity-90 tracking-widest text-yellow-400">DCMD</p>
          </div>
        </div>
        
        {currentView !== 'Home' && (
          <button 
            onClick={() => onNavigate('Home')}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <HomeIcon size={24} />
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-grow container mx-auto px-4 py-6 max-w-4xl">
        {children}
      </main>

      {/* Footer Branding */}
      <footer className="py-4 border-t border-gray-200 bg-white">
        <div className="container mx-auto px-4 flex justify-between items-center opacity-60 text-xs">
          <span>&copy; 2026 Linha Viva Leste</span>
          <div className="flex gap-1">
             <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ENERGISA_COLORS.primary }}></div>
             <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ENERGISA_COLORS.secondary }}></div>
             <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ENERGISA_COLORS.accent }}></div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
