import React, { useEffect, useState, useRef } from 'react';
import { ReconciliationResponse } from '../types';

interface PipelineObservabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPipelineComplete: (data: ReconciliationResponse) => void;
}

interface LogEntry {
  id: string;
  time: string;
  stage: 'STAGE 1' | 'STAGE 2' | 'SYSTEM';
  text: string;
  confidence?: number | null;
  type?: 'info' | 'success' | 'warn' | 'ai';
}

interface ActiveItem {
  invoiceNumber: string;
  vendorName: string;
  amount: number;
  gstin: string;
  stage1Hint: string | null;
  category?: string;
  confidence?: number | null;
  reasoning: string;
  fromCache?: boolean;
}

export const PipelineObservabilityModal: React.FC<PipelineObservabilityModalProps> = ({
  isOpen,
  onClose,
  onPipelineComplete,
}) => {
  const [stage, setStage] = useState<'idle' | 'stage1' | 'stage2' | 'complete'>('idle');
  
  // Stage 1 stats
  const [s1Processed, setS1Processed] = useState<number>(0);
  const [s1Total, setS1Total] = useState<number>(80);
  const [s1Matched, setS1Matched] = useState<number>(0);
  const [s1Deferred, setS1Deferred] = useState<number>(0);

  // Stage 2 stats
  const [s2Processed, setS2Processed] = useState<number>(0);
  const [s2Total, setS2Total] = useState<number>(0);
  const [activeItem, setActiveItem] = useState<ActiveItem | null>(null);

  // Log entries
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Elapsed time
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) {
      setStage('idle');
      setS1Processed(0);
      setS1Matched(0);
      setS1Deferred(0);
      setS2Processed(0);
      setS2Total(0);
      setActiveItem(null);
      setLogs([]);
      setElapsedMs(0);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Start timer
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 100);

    setStage('stage1');
    const eventSource = new EventSource('http://localhost:5000/api/reconciliation/stream');

    const addLog = (
      text: string,
      stage: LogEntry['stage'],
      type: LogEntry['type'] = 'info',
      confidence?: number | null
    ) => {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      const entry: LogEntry = {
        id: Math.random().toString(36).substring(2, 9),
        time: timeStr,
        stage,
        text,
        confidence,
        type,
      };
      setLogs((prev) => [...prev.slice(-100), entry]);
    };

    addLog('Initiating Server-Sent Events (SSE) telemetry connection...', 'SYSTEM', 'info');

    eventSource.addEventListener('stage1_start', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setS1Total(data.total);
      setStage('stage1');
      addLog(`Stage 1 Rule engine sweep started (${data.total} records)...`, 'STAGE 1', 'info');
    });

    eventSource.addEventListener('stage1_progress', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setS1Processed(data.processed);
      setS1Matched(data.matchedCount);
      setS1Deferred(data.deferredCount);

      if (data.currentItem.category === 'exact_match') {
        addLog(`Matched clean ${data.currentItem.invoiceNumber} (${data.currentItem.vendorName})`, 'STAGE 1', 'success', 1.0);
      } else {
        addLog(`Sending ${data.currentItem.invoiceNumber} to audit review (${data.currentItem.vendorName})`, 'STAGE 1', 'warn');
      }
    });

    eventSource.addEventListener('stage1_complete', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      addLog(`Rule engine sweep complete: ${data.matchedCount} clean matches, ${data.deferredCount} sent to audit`, 'STAGE 1', 'success');
    });

    eventSource.addEventListener('stage2_start', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setS2Total(data.total);
      setStage('stage2');
      addLog(`Audit review started: Gemini reviewing ${data.total} exception records...`, 'STAGE 2', 'ai');
    });

    eventSource.addEventListener('stage2_item_start', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setS2Processed(data.index);
      setActiveItem({
        invoiceNumber: data.invoiceNumber,
        vendorName: data.vendorName,
        amount: data.amount,
        gstin: data.gstin,
        stage1Hint: data.stage1Hint,
        reasoning: '',
      });
      addLog(`Sending ${data.invoiceNumber} to audit review (${data.vendorName})`, 'STAGE 2', 'ai');
    });

    eventSource.addEventListener('stage2_item_chunk', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setActiveItem((prev) => (prev ? { ...prev, reasoning: data.textSoFar } : prev));
    });

    eventSource.addEventListener('stage2_item_complete', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setActiveItem((prev) =>
        prev ? { ...prev, category: data.category, confidence: data.confidence, reasoning: data.reasoning, fromCache: data.fromCache } : prev
      );
      addLog(`${data.invoiceNumber} classified as ${data.category.replace(/_/g, ' ')}`, 'STAGE 2', 'success', data.confidence);
    });

    eventSource.addEventListener('stage2_complete', (e: MessageEvent) => {
      addLog(`Audit review complete — all ${s2Total || 40} exceptions processed`, 'STAGE 2', 'success');
    });

    eventSource.addEventListener('pipeline_complete', (e: MessageEvent) => {
      const data: ReconciliationResponse = JSON.parse(e.data);
      setStage('complete');
      if (timerRef.current) clearInterval(timerRef.current);
      addLog(`Reconciliation desk process finished successfully. Data synchronized.`, 'SYSTEM', 'success');
      onPipelineComplete(data);
      eventSource.close();
    });

    eventSource.onerror = (err) => {
      console.error('SSE Error:', err);
      eventSource.close();
    };

    return () => {
      eventSource.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen]);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  if (!isOpen) return null;

  const seconds = (elapsedMs / 1000).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in font-sans">
      <div className="bg-[#FAF8F3] text-[#1E293B] rounded-xl shadow-2xl border border-[#E5DFD3] w-full max-w-4xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header Bar */}
        <div className="px-8 py-6 border-b border-[#E5DFD3] flex items-start justify-between bg-[#FAF8F3]">
          <div>
            <h2 className="text-2xl font-bold font-serif text-[#1E293B] tracking-tight mb-1">
              Reconciliation desk
            </h2>
            <p className="text-xs text-[#64748B]">
              Rule engine sweep, then Gemini audit review on anything it can't resolve on its own
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-3xl font-bold font-serif text-[#1E293B] block leading-none">
                {seconds}s
              </span>
              <span className="text-[11px] font-medium text-[#64748B] tracking-wider block mt-1">
                elapsed
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#166534] bg-[#F0FDF4] px-2.5 py-1 rounded-full border border-[#DCFCE7]">
                <span className="h-2 w-2 rounded-full bg-[#166534] animate-ping" />
                <span>Live</span>
              </div>

              {stage === 'complete' && (
                <button
                  onClick={onClose}
                  className="bg-[#166534] hover:bg-[#004c22] text-white text-xs font-semibold px-4 py-2 rounded-md shadow-xs transition-colors"
                >
                  Close Desk
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-8 overflow-y-auto space-y-6 flex-1 bg-[#FAF8F3]">
          {/* Top Two Column Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Card: Rule engine */}
            <div className="border border-[#E5DFD3] rounded-lg p-5 bg-[#FAF8F3] flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className="font-bold text-sm text-[#1E293B]">Rule engine</h3>
                  <span className="text-xs font-mono font-medium text-[#64748B]">
                    {s1Processed} / {s1Total || 80}
                  </span>
                </div>
                <p className="text-xs text-[#64748B] mb-3">Deterministic pass over every record</p>

                {/* Progress bar */}
                <div className="w-full bg-[#E5DFD3] rounded-full h-1.5 overflow-hidden mb-4">
                  <div
                    className="bg-[#1E293B] h-1.5 rounded-full transition-all duration-150"
                    style={{ width: `${(s1Processed / (s1Total || 1)) * 100}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2 text-xs border-t border-[#E5DFD3] pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-[#64748B]">Matched clean</span>
                  <span className="font-bold text-sm text-[#1E293B]">{s1Matched}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#64748B]">Sent to audit</span>
                  <span className="font-bold text-sm text-[#1E293B]">{s1Deferred}</span>
                </div>
              </div>
            </div>

            {/* Right Card: Audit review */}
            <div className="border border-[#E5DFD3] rounded-lg p-5 bg-[#FAF8F3] flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className="font-bold text-sm text-[#1E293B]">Audit review</h3>
                  <span className="text-xs font-mono font-medium text-[#64748B]">
                    {s2Processed} / {s2Total || 40}
                  </span>
                </div>
                <p className="text-xs text-[#64748B] mb-3">Gemini reasons through what the rules couldn't</p>

                {/* Progress bar */}
                <div className="w-full bg-[#E5DFD3] rounded-full h-1.5 overflow-hidden mb-4">
                  <div
                    className="bg-[#A17937] h-1.5 rounded-full transition-all duration-150"
                    style={{ width: `${(s2Processed / (s2Total || 1)) * 100}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2 text-xs border-t border-[#E5DFD3] pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-[#64748B]">Exceptions confirmed</span>
                  <span className="font-bold text-sm text-[#1E293B]">{s2Processed}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#64748B]">Model on duty</span>
                  <span className="font-serif italic font-semibold text-[#A17937]">gemini-3.5-flash-lite</span>
                </div>
              </div>
            </div>
          </div>

          {/* Middle Box: Reviewing now Spotlight */}
          {activeItem && stage === 'stage2' && (
            <div className="border border-[#E5DFD3] rounded-lg overflow-hidden flex bg-[#FAF8F3]">
              {/* Left Vertical Badge */}
              <div className="bg-[#F2ECDC] border-r border-[#E5DFD3] px-3 py-4 flex items-center justify-center">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#8A6B29] [writing-mode:vertical-lr] rotate-180 select-none whitespace-nowrap">
                  Reviewing now
                </span>
              </div>

              {/* Spotlight Content */}
              <div className="p-5 flex-1 flex flex-col justify-center">
                <div className="mb-2">
                  <h4 className="text-base font-bold text-[#1E293B] font-mono leading-snug">
                    {activeItem.invoiceNumber}
                  </h4>
                  <p className="text-xs text-[#64748B]">{activeItem.vendorName}</p>
                </div>

                <p className="text-sm font-serif italic text-[#334155] leading-relaxed">
                  "{activeItem.reasoning || 'Evaluating invoice data against GSTR-2B portal records...'}"
                  <span className="inline-block w-1.5 h-4 bg-[#A17937] ml-1 animate-pulse align-middle" />
                </p>
              </div>
            </div>
          )}

          {/* Bottom Audit Trail Section */}
          <div>
            <div className="flex justify-between items-baseline mb-2">
              <h3 className="font-bold text-sm text-[#1E293B]">Audit trail</h3>
              <span className="text-xs text-[#64748B]">{logs.length} entries logged</span>
            </div>

            <div
              ref={logContainerRef}
              className="border border-[#E5DFD3] rounded-lg bg-[#FAF8F3] overflow-hidden max-h-56 overflow-y-auto divide-y divide-[#E5DFD3]"
            >
              {logs.length === 0 ? (
                <div className="p-4 text-xs text-[#64748B] text-center">
                  Waiting for telemetry events...
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="px-4 py-2.5 text-xs flex items-center justify-between hover:bg-[#F2ECDC]/40 transition-colors">
                    <div className="flex items-center gap-3 pr-4 min-w-0">
                      <span className="font-mono text-[11px] text-[#64748B] shrink-0">{log.time}</span>
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          log.stage === 'STAGE 1'
                            ? 'bg-[#166534]'
                            : log.stage === 'STAGE 2'
                            ? 'bg-[#A17937]'
                            : 'bg-blue-600'
                        }`}
                      />
                      <span className="text-[#334155] truncate">{log.text}</span>
                    </div>

                    {log.confidence !== undefined && log.confidence !== null && (
                      <span className="font-mono text-xs text-[#64748B] font-medium shrink-0">
                        {Math.round(log.confidence * 100)}%
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-[#E5DFD3] bg-[#FAF8F3] flex items-center justify-between">
          <div className="text-xs text-[#334155] flex items-center gap-2">
            <span className="text-[#64748B]">Pipeline status:</span>
            <span className="font-bold text-[#1E293B]">
              {stage === 'stage1' ? 'Stage 1 Rule Engine' : stage === 'stage2' ? 'Stage 2 Gemini Audit' : 'Complete'}
            </span>
          </div>

          <div>
            {stage === 'complete' ? (
              <button
                onClick={onClose}
                className="bg-[#166534] hover:bg-[#004c22] text-white font-semibold text-xs px-5 py-2 rounded-md shadow-xs flex items-center gap-1.5 transition-colors"
              >
                <span>View Updated Dashboard</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            ) : (
              <div className="text-xs text-[#64748B] flex items-center gap-2">
                <span className="material-symbols-outlined text-sm animate-spin text-[#A17937]">sync</span>
                <span>Streaming live execution metrics</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
