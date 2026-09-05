import React, { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { KpiCards } from './components/KpiCards';
import { ReconciliationTable } from './components/ReconciliationTable';
import { ExceptionDetailDrawer } from './components/ExceptionDetailDrawer';
import { PipelineObservabilityModal } from './components/PipelineObservabilityModal';
import { CsvUploadModal } from './components/CsvUploadModal';
import { CopilotView } from './components/CopilotView';
import { ReconciliationRecord, ReconciliationResponse, ReconciliationSummary } from './types';

export default function App() {
  const [activeNavTab, setActiveNavTab] = useState('reconciliations');
  const [headerView, setHeaderView] = useState<'summary' | 'exceptions' | 'all'>('exceptions');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [records, setRecords] = useState<ReconciliationRecord[]>([]);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<ReconciliationRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [running, setRunning] = useState<boolean>(false);
  const [isPipelineModalOpen, setIsPipelineModalOpen] = useState<boolean>(false);
  const [isCsvUploadModalOpen, setIsCsvUploadModalOpen] = useState<boolean>(false);
  const [showLivePipeline, setShowLivePipeline] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Helper: apply fetched data to state
  const applyData = (summaryData: ReconciliationSummary, recordsData: ReconciliationRecord[]) => {
    setSummary(summaryData);
    setRecords(recordsData);

    // Auto-select first exception record if nothing is selected
    if (recordsData.length > 0 && !selectedRecord) {
      const firstException = recordsData.find((r) => r.category !== 'exact_match') || recordsData[0];
      setSelectedRecord(firstException);
    }
  };

  // Fetches cached pipeline data from backend (two parallel GET calls, both served from cache — instant)
  const fetchReconciliationData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [sumRes, recRes] = await Promise.all([
        fetch('http://localhost:5000/api/summary'),
        fetch('http://localhost:5000/api/records'),
      ]);

      if (!sumRes.ok || !recRes.ok) {
        throw new Error(`API error: summary=${sumRes.status}, records=${recRes.status}`);
      }

      applyData(await sumRes.json(), await recRes.json());
    } catch (err: any) {
      console.error('Error fetching reconciliation data:', err);
      setError('Could not connect to backend. Make sure the backend is running on port 5000.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReconciliationData();
  }, []);

  // Triggers pipeline run (either live telemetry modal or background POST call)
  const handleRunReconciliation = async () => {
    if (showLivePipeline) {
      setIsPipelineModalOpen(true);
    } else {
      try {
        setRunning(true);
        setError(null);
        const res = await fetch('http://localhost:5000/api/reconciliation/run', {
          method: 'POST',
        });
        if (!res.ok) throw new Error('Reconciliation run failed');
        const data = await res.json();
        applyData(data.summary, data.records);
      } catch (err: any) {
        console.error('Error running reconciliation:', err);
        setError('Pipeline execution failed. Check backend logs.');
      } finally {
        setRunning(false);
      }
    }
  };

  const handleUpdateReviewStatus = async (
    recordId: string,
    action: 'accept_vendor' | 'keep_books' | 'flag_review' | 'reset'
  ) => {
    try {
      const res = await fetch(`http://localhost:5000/api/records/${recordId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) throw new Error('PATCH review status failed');

      const data = await res.json();
      const updatedRecord: ReconciliationRecord = data.record;

      // Update state in records array
      setRecords((prev) =>
        prev.map((r) => (r.id === recordId ? updatedRecord : r))
      );

      // Update currently selected record
      if (selectedRecord && selectedRecord.id === recordId) {
        setSelectedRecord(updatedRecord);
      }
    } catch (err) {
      console.error('Error updating review status:', err);
    }
  };

  const handleHeaderViewChange = (view: 'summary' | 'exceptions' | 'all') => {
    setHeaderView(view);
    if (view === 'exceptions') {
      setFilterCategory('exceptions');
    } else if (view === 'all') {
      setFilterCategory('all');
    } else {
      setFilterCategory('all');
    }
  };

  const handleSidebarTabSelect = (tab: string) => {
    if (tab === 'upload') {
      setIsCsvUploadModalOpen(true);
    } else if (tab === 'dashboard') {
      // Dashboard is the same as the reconciliation view
      setActiveNavTab('reconciliations');
    } else {
      setActiveNavTab(tab);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9ff] text-[#0b1c30] font-sans">
      {/* 1. Left Fixed Sidebar */}
      <Sidebar activeTab={activeNavTab} onTabSelect={handleSidebarTabSelect} />

      {/* 2. Main Content Area */}
      <div className="ml-60 flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header Bar */}
        <Header
          currentView={headerView}
          onViewChange={handleHeaderViewChange}
          onRunReconciliation={handleRunReconciliation}
          isRunning={running}
          showLivePipeline={showLivePipeline}
          onToggleLivePipeline={setShowLivePipeline}
        />

        {/* View Switcher: Copilot Audit Desk vs Main Reconciliation Dashboard */}
        {activeNavTab === 'copilot' ? (
          <CopilotView records={records} />
        ) : (
          /* Layout Content (Split View with Main Table & Right Drawer) */
          <div className="flex-1 flex overflow-hidden">
            {/* Center Canvas */}
            <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
              {/* KPI Summary Banner */}
              <KpiCards summary={summary} />

              {/* Error / Loading Indicators */}
              {error && (
                <div className="bg-[#fef2f2] border border-[#ba1a1a] text-[#ba1a1a] p-4 rounded-md text-xs font-semibold flex items-center justify-between">
                  <span>{error}</span>
                  <button
                    onClick={fetchReconciliationData}
                    className="bg-[#ba1a1a] text-white px-3 py-1 rounded text-xs hover:opacity-90"
                  >
                    Retry Connection
                  </button>
                </div>
              )}

              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-white border border-[#e2e8f0] rounded-md p-12 text-[#404940] gap-3">
                  <span className="material-symbols-outlined text-3xl animate-spin text-[#166534]">
                    sync
                  </span>
                  <span className="text-sm font-medium">Loading live reconciliation pipeline records...</span>
                </div>
              ) : (
                /* Main Data Table */
                <ReconciliationTable
                  records={records}
                  selectedRecordId={selectedRecord?.id ?? null}
                  onSelectRecord={(rec) => setSelectedRecord(rec)}
                  filterCategory={filterCategory}
                  onFilterCategoryChange={setFilterCategory}
                />
              )}
            </main>

            {/* Right Sidebar: Exceptions Detail Panel */}
            {selectedRecord && (
              <ExceptionDetailDrawer
                record={selectedRecord}
                onClose={() => setSelectedRecord(null)}
                onUpdateReviewStatus={handleUpdateReviewStatus}
              />
            )}
          </div>
        )}
      </div>

      {/* Live Pipeline Observability Telemetry Modal */}
      <PipelineObservabilityModal
        isOpen={isPipelineModalOpen}
        onClose={() => setIsPipelineModalOpen(false)}
        onPipelineComplete={(data) => {
          applyData(data.summary, data.records);
        }}
      />

      {/* Custom CSV Upload Modal */}
      <CsvUploadModal
        isOpen={isCsvUploadModalOpen}
        onClose={() => setIsCsvUploadModalOpen(false)}
        onUploadSuccess={(data) => {
          applyData(data.summary, data.records);
          setActiveNavTab('reconciliations');
        }}
      />
    </div>
  );
}
