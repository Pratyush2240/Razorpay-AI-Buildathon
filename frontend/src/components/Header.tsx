import React from 'react';

interface HeaderProps {
  currentView: 'summary' | 'exceptions' | 'all';
  onViewChange: (view: 'summary' | 'exceptions' | 'all') => void;
  onRunReconciliation: () => void;
  isRunning?: boolean;
  showLivePipeline: boolean;
  onToggleLivePipeline: (show: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onViewChange,
  onRunReconciliation,
  isRunning = false,
  showLivePipeline,
  onToggleLivePipeline,
}) => {
  return (
    <header className="bg-white border-b border-[#e2e8f0] flex justify-between items-center w-full px-6 h-14 flex-shrink-0 z-10">
      <div className="flex items-center gap-6">
        <div className="text-lg font-bold text-[#166534] flex items-center gap-2">
          GSTMatch
        </div>
        <nav className="hidden md:flex gap-4 h-full items-end">
          <button
            onClick={() => onViewChange('summary')}
            className={`text-xs font-semibold uppercase tracking-wider px-3 py-3 transition-colors ${
              currentView === 'summary'
                ? 'text-[#166534] border-b-2 border-[#166534]'
                : 'text-[#404940] hover:bg-[#f8f9ff]'
            }`}
          >
            Summary
          </button>
          <button
            onClick={() => onViewChange('exceptions')}
            className={`text-xs font-semibold uppercase tracking-wider px-3 py-3 transition-colors ${
              currentView === 'exceptions'
                ? 'text-[#166534] border-b-2 border-[#166534]'
                : 'text-[#404940] hover:bg-[#f8f9ff]'
            }`}
          >
            Exceptions
          </button>
          <button
            onClick={() => onViewChange('all')}
            className={`text-xs font-semibold uppercase tracking-wider px-3 py-3 transition-colors ${
              currentView === 'all'
                ? 'text-[#166534] border-b-2 border-[#166534]'
                : 'text-[#404940] hover:bg-[#f8f9ff]'
            }`}
          >
            All Records
          </button>
        </nav>
      </div>

      <div className="flex items-center gap-4">
        {/* Toggle option to see live pipeline execution desk */}
        <label className="flex items-center gap-2 text-xs font-semibold text-[#404940] cursor-pointer select-none border-r border-[#e2e8f0] pr-4">
          <span className="material-symbols-outlined text-base text-[#166534]">
            {showLivePipeline ? 'visibility' : 'visibility_off'}
          </span>
          <span>Live Observability Desk</span>
          <input
            type="checkbox"
            checked={showLivePipeline}
            onChange={(e) => onToggleLivePipeline(e.target.checked)}
            className="rounded border-[#e2e8f0] text-[#166534] focus:ring-[#166534] cursor-pointer ml-1"
          />
        </label>

        <button
          onClick={onRunReconciliation}
          disabled={isRunning}
          className="bg-[#166534] text-white px-4 py-1.5 rounded-md text-xs font-bold tracking-wide uppercase flex items-center gap-2 hover:bg-[#004c22] transition-all disabled:opacity-50 shadow-xs"
        >
          <span className="material-symbols-outlined text-base">
            {isRunning ? 'sync' : 'play_arrow'}
          </span>
          <span>{isRunning ? 'Executing Pipeline...' : 'Run Automated Reconciliation'}</span>
        </button>
      </div>
    </header>
  );
};
