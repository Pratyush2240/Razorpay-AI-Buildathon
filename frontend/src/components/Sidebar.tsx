import React from 'react';

interface SidebarProps {
  activeTab?: string;
  onTabSelect?: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab = 'reconciliations', onTabSelect }) => {
  const primaryItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'reconciliations', label: 'Reconciliations Desk', icon: 'account_balance_wallet' },
  ];

  const intelligenceItems = [
    { id: 'copilot', label: 'AI Financial Copilot', icon: 'auto_awesome' },
    { id: 'upload', label: 'Upload CSV Dataset', icon: 'upload_file' },
  ];

  return (
    <nav className="fixed left-0 top-0 h-full w-60 bg-[#eff4ff] text-[#004c22] border-r border-[#bfc9bd] flex flex-col z-20 font-sans">
      {/* Brand Header */}
      <div className="px-6 py-6 border-b border-[#bfc9bd] mb-4 flex items-center gap-3">
        <span className="material-symbols-outlined text-2xl text-[#166534]" style={{ fontVariationSettings: "'FILL' 1" }}>
          account_balance
        </span>
        <div className="flex flex-col">
          <span className="text-[#166534] font-bold text-lg leading-tight font-serif">GSTMatch Admin</span>
          <span className="text-xs text-[#404940]">Verified Enterprise</span>
        </div>
      </div>

      {/* Primary Functional Navigation */}
      <div className="flex-1 px-3 flex flex-col gap-1 overflow-y-auto">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#707a6f] px-4 pt-2 pb-1">
          Core Desk
        </div>
        {primaryItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabSelect && onTabSelect(item.id)}
              className={`w-full text-left cursor-pointer flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? 'bg-[#166534] text-white font-medium shadow-sm'
                  : 'text-[#404940] hover:bg-[#dce9ff]'
              }`}
            >
              <span
                className="material-symbols-outlined text-xl"
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}

        {/* Intelligence & Data Tools */}
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#707a6f] px-4 pt-4 pb-1">
          Copilot &amp; Data
        </div>
        {intelligenceItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabSelect && onTabSelect(item.id)}
              className={`w-full text-left cursor-pointer flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? 'bg-[#166534] text-white font-medium shadow-sm'
                  : 'text-[#404940] hover:bg-[#dce9ff]'
              }`}
            >
              <span
                className="material-symbols-outlined text-xl text-[#166534]"
                style={isActive ? { fontVariationSettings: "'FILL' 1", color: '#ffffff' } : undefined}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Footer Navigation */}
      <div className="mt-auto px-3 py-4 border-t border-[#bfc9bd] flex flex-col gap-1">
        <div className="text-[#404940] flex items-center gap-3 px-4 py-2 text-xs">
          <span className="material-symbols-outlined text-base">verified</span>
          <span>GST & TDS Engine v1.0</span>
        </div>
      </div>
    </nav>
  );
};
