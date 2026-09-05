import React, { useState } from 'react';
import { ReconciliationRecord, MatchCategory } from '../types';

interface CopilotViewProps {
  records: ReconciliationRecord[];
}

const CATEGORY_NAMES: Record<MatchCategory, { label: string; badge: string; bg: string; text: string }> = {
  exact_match: { label: 'Exact Match', badge: 'Matched', bg: 'bg-[#f0fdf4]', text: 'text-[#166534]' },
  amount_mismatch: { label: 'Amount Mismatch', badge: 'Mismatch', bg: 'bg-[#fff7ed]', text: 'text-[#92400e]' },
  missing_on_portal: { label: 'Missing on Portal', badge: 'Missing', bg: 'bg-[#fef2f2]', text: 'text-[#ba1a1a]' },
  duplicate: { label: 'Duplicate Record', badge: 'Duplicate', bg: 'bg-[#fef2f2]', text: 'text-[#ba1a1a]' },
  gstin_mismatch: { label: 'GSTIN Mismatch', badge: 'GSTIN Error', bg: 'bg-[#fef2f2]', text: 'text-[#ba1a1a]' },
  needs_manual_review: { label: 'Manual Review', badge: 'Draft', bg: 'bg-[#f1f5f9]', text: 'text-[#475569]' },
};

function formatCurrency(val: number | null | undefined): string {
  if (val == null) return '—';
  return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const CopilotView: React.FC<CopilotViewProps> = ({ records }) => {
  const exceptionsOnly = records.filter((r) => r.category !== 'exact_match');
  const [selectedRecord, setSelectedRecord] = useState<ReconciliationRecord | null>(
    exceptionsOnly[0] || records[0] || null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'model'; text: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const filtered = (exceptionsOnly.length > 0 ? exceptionsOnly : records).filter(
    (r) =>
      r.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.vendorName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectRecord = (rec: ReconciliationRecord) => {
    setSelectedRecord(rec);
    setChatHistory([]);
    setChatInput('');
  };

  const handleSendChat = async (overridePrompt?: string) => {
    if (!selectedRecord) return;
    const text = (overridePrompt || chatInput).trim();
    if (!text || loading) return;

    const userMsg = { role: 'user' as const, text };
    const updatedHistory = [...chatHistory, userMsg];
    setChatHistory(updatedHistory);
    if (!overridePrompt) setChatInput('');
    setLoading(true);

    try {
      const res = await fetch('http://localhost:5000/api/chat/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordId: selectedRecord.id,
          userMessage: text,
          chatHistory,
        }),
      });

      if (!res.ok) throw new Error('Chat API call failed');
      const data = await res.json();
      setChatHistory([...updatedHistory, { role: 'model', text: data.reply }]);
    } catch (err) {
      console.error('Copilot error:', err);
      setChatHistory([
        ...updatedHistory,
        { role: 'model', text: '⚠️ Unable to connect to Gemini Copilot. Make sure backend port 5000 is active.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[#FAF8F3] font-sans">
      {/* Left Invoices Selector Panel */}
      <div className="w-80 border-r border-[#E5DFD3] flex flex-col bg-[#FAF8F3]">
        <div className="p-4 border-b border-[#E5DFD3]">
          <h2 className="text-base font-bold font-serif text-[#1E293B] mb-1">
            Exception Desk ({exceptionsOnly.length})
          </h2>
          <p className="text-xs text-[#64748B] mb-3">Select an invoice exception to launch AI Financial Copilot</p>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search invoice or vendor..."
            className="w-full bg-white border border-[#E5DFD3] rounded px-3 py-1.5 text-xs outline-none focus:border-[#166534] text-[#1E293B]"
          />
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#E5DFD3]">
          {filtered.map((rec) => {
            const isSelected = selectedRecord?.id === rec.id;
            const catMeta = CATEGORY_NAMES[rec.category] || CATEGORY_NAMES.needs_manual_review;
            return (
              <div
                key={rec.id}
                onClick={() => handleSelectRecord(rec)}
                className={`p-3.5 cursor-pointer transition-colors ${
                  isSelected ? 'bg-[#F2ECDC] font-medium' : 'hover:bg-[#F2ECDC]/40'
                }`}
              >
                <div className="flex justify-between items-baseline mb-1">
                  <span className="font-mono text-xs font-bold text-[#1E293B]">{rec.invoiceNumber}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${catMeta.bg} ${catMeta.text}`}>
                    {catMeta.badge}
                  </span>
                </div>
                <div className="text-xs text-[#334155] truncate font-sans mb-1">{rec.vendorName}</div>
                <div className="flex justify-between items-center text-[11px] font-mono text-[#64748B]">
                  <span>{formatCurrency(rec.amount)}</span>
                  <span>{rec.confidence ? `${Math.round(rec.confidence * 100)}% Match` : '100%'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Copilot Workspace Panel */}
      {selectedRecord ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#FAF8F3] p-6 space-y-4">
          {/* Record Overview Banner */}
          <div className="bg-white border border-[#E5DFD3] rounded-lg p-5 flex items-center justify-between shadow-2xs">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-bold font-mono text-[#1E293B]">{selectedRecord.invoiceNumber}</h1>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#FFF7ED] text-[#92400e] border border-[#FDE68A]">
                  {selectedRecord.category.toUpperCase().replace(/_/g, ' ')}
                </span>
                <span className="text-xs font-mono text-[#166534] font-bold">
                  {selectedRecord.confidence ? `${Math.round(selectedRecord.confidence * 100)}% Confidence` : 'Deterministic Rule'}
                </span>
              </div>
              <p className="text-xs text-[#64748B]">Vendor: <span className="font-medium text-[#1E293B]">{selectedRecord.vendorName}</span> • GSTIN: <span className="font-mono">{selectedRecord.ourVendorGstin}</span></p>
            </div>

            <div className="text-right font-mono">
              <span className="text-xs text-[#64748B] block">Total Amount</span>
              <span className="text-lg font-bold text-[#166534]">{formatCurrency(selectedRecord.ourTotalAmount)}</span>
            </div>
          </div>

          {/* Copilot Chat Studio */}
          <div className="flex-1 border border-[#E5DFD3] rounded-lg bg-white flex flex-col overflow-hidden shadow-2xs">
            {/* Studio Header */}
            <div className="p-4 border-b border-[#E5DFD3] bg-[#FAF8F3] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#166534] text-xl">auto_awesome</span>
                <div>
                  <h3 className="text-sm font-bold font-serif text-[#1E293B]">Gemini Financial Copilot Studio</h3>
                  <p className="text-xs text-[#64748B]">Context-aware GST compliance audit &amp; vendor resolution assistant</p>
                </div>
              </div>

              {/* Quick Prompt Chips */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleSendChat('Why is this amount different? Explain line-item variance.')}
                  className="text-xs bg-[#FAF8F3] border border-[#E5DFD3] text-[#334155] px-3 py-1 rounded-full hover:border-[#166534] hover:text-[#166534] transition-colors"
                >
                  💬 Explain Variance
                </button>
                <button
                  onClick={() => handleSendChat('Draft a formal vendor dispute email asking them to issue a credit note or GSTR-1 amendment.')}
                  className="text-xs bg-[#FAF8F3] border border-[#E5DFD3] text-[#334155] px-3 py-1 rounded-full hover:border-[#166534] hover:text-[#166534] transition-colors"
                >
                  📧 Draft Vendor Dispute Email
                </button>
                <button
                  onClick={() => handleSendChat('What is the Input Tax Credit (ITC) liability impact under Section 16(2)?')}
                  className="text-xs bg-[#FAF8F3] border border-[#E5DFD3] text-[#334155] px-3 py-1 rounded-full hover:border-[#166534] hover:text-[#166534] transition-colors"
                >
                  ⚖️ ITC Tax Risk
                </button>
              </div>
            </div>

            {/* Conversation Area */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-[#FAF8F3]">
              {/* Initial Diagnostic Note */}
              <div className="bg-white border border-[#E5DFD3] p-4 rounded-lg text-xs leading-relaxed shadow-2xs">
                <div className="font-bold text-[#166534] uppercase tracking-wider mb-1 text-[11px] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">fact_check</span>
                  Initial Stage 2 Gemini Audit Diagnostic
                </div>
                <p className="text-[#334155] font-serif italic text-sm">{selectedRecord.reasoning}</p>
              </div>

              {/* Message Thread */}
              {chatHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg text-xs leading-relaxed max-w-3xl ${
                    msg.role === 'user'
                      ? 'bg-[#166534] text-white ml-auto font-medium shadow-2xs'
                      : 'bg-white border border-[#E5DFD3] text-[#1E293B] mr-auto shadow-2xs space-y-2'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                  {msg.role === 'model' && (
                    <button
                      onClick={() => handleCopy(msg.text, idx)}
                      className="text-[11px] text-[#166534] hover:underline font-semibold flex items-center gap-1 pt-2 border-t border-[#E5DFD3] mt-2"
                    >
                      <span className="material-symbols-outlined text-sm">
                        {copiedIndex === idx ? 'check' : 'content_copy'}
                      </span>
                      <span>{copiedIndex === idx ? 'Copied to Clipboard!' : 'Copy Response / Vendor Email'}</span>
                    </button>
                  )}
                </div>
              ))}

              {loading && (
                <div className="bg-white border border-[#E5DFD3] p-4 rounded-lg text-xs text-[#64748B] flex items-center gap-2 animate-pulse max-w-md">
                  <span className="material-symbols-outlined text-base animate-spin text-[#166534]">sync</span>
                  <span>Gemini Copilot is evaluating invoice data and generating audit response...</span>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <div className="p-4 border-t border-[#E5DFD3] bg-white flex gap-3">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                placeholder="Ask Gemini Financial Copilot anything about this invoice (e.g. 'Draft vendor email', 'Why tax amount differs')..."
                className="flex-1 bg-[#FAF8F3] border border-[#E5DFD3] rounded-lg px-4 py-2.5 text-xs outline-none focus:border-[#166534] text-[#1E293B]"
              />
              <button
                onClick={() => handleSendChat()}
                disabled={loading || !chatInput.trim()}
                className="bg-[#166534] hover:bg-[#004c22] text-white px-5 py-2.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
              >
                <span>Send</span>
                <span className="material-symbols-outlined text-base">send</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-xs text-[#64748B]">
          Select an invoice from the exception desk on the left to start AI Copilot audit.
        </div>
      )}
    </div>
  );
};
