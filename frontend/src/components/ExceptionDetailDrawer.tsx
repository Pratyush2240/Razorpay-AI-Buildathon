import React, { useState } from 'react';
import { ReconciliationRecord, MatchCategory, ReviewStatus } from '../types';

interface ExceptionDetailDrawerProps {
  record: ReconciliationRecord | null;
  onClose: () => void;
  onUpdateReviewStatus: (recordId: string, action: 'accept_vendor' | 'keep_books' | 'flag_review' | 'reset') => Promise<void>;
}

const CATEGORY_LABEL: Record<MatchCategory, { name: string; bg: string; text: string }> = {
  exact_match: { name: 'Exact Match', bg: 'bg-[#f0fdf4]', text: 'text-[#166534]' },
  amount_mismatch: { name: 'Amount Mismatch', bg: 'bg-[#fff7ed]', text: 'text-[#92400e]' },
  missing_on_portal: { name: 'Missing on Portal', bg: 'bg-[#fef2f2]', text: 'text-[#ba1a1a]' },
  duplicate: { name: 'Duplicate Record', bg: 'bg-[#fef2f2]', text: 'text-[#ba1a1a]' },
  gstin_mismatch: { name: 'GSTIN Mismatch', bg: 'bg-[#fef2f2]', text: 'text-[#ba1a1a]' },
  needs_manual_review: { name: 'Manual Review', bg: 'bg-[#f1f5f9]', text: 'text-[#475569]' },
};

const REVIEW_STATUS_LABEL: Record<ReviewStatus, { name: string; bg: string; text: string }> = {
  pending: { name: 'Pending Review', bg: 'bg-[#f1f5f9]', text: 'text-[#475569]' },
  accepted_vendor: { name: 'Accepted Vendor', bg: 'bg-[#f0fdf4]', text: 'text-[#166534]' },
  keep_books: { name: 'Keep Books Value', bg: 'bg-[#eff4ff]', text: 'text-[#0058c3]' },
  flagged_review: { name: 'Flagged for Review', bg: 'bg-[#fff7ed]', text: 'text-[#92400e]' },
};

function formatCurrency(val: number | null | undefined): string {
  if (val == null) return '—';
  return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const ExceptionDetailDrawer: React.FC<ExceptionDetailDrawerProps> = ({
  record,
  onClose,
  onUpdateReviewStatus,
}) => {
  const [updating, setUpdating] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'model'; text: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!record) return null;

  const catStyle = CATEGORY_LABEL[record.category] || CATEGORY_LABEL.needs_manual_review;
  const reviewStyle = REVIEW_STATUS_LABEL[record.reviewStatus] || REVIEW_STATUS_LABEL.pending;
  const confidencePct = record.confidence != null ? Math.round(record.confidence * 100) : null;

  const isAmountDiff =
    record.portalTotalAmount != null &&
    Math.abs(record.ourTotalAmount - record.portalTotalAmount) > 0.01;
  const isTaxDiff =
    record.portalTaxAmount != null &&
    Math.abs(record.ourTaxAmount - record.portalTaxAmount) > 0.01;
  const isGstinDiff =
    record.portalVendorGstin != null &&
    record.ourVendorGstin !== record.portalVendorGstin;

  const handleActionClick = async (action: 'accept_vendor' | 'keep_books' | 'flag_review') => {
    try {
      setUpdating(true);
      await onUpdateReviewStatus(record.id, action);
    } catch (err) {
      console.error('Failed to update review status:', err);
    } finally {
      setUpdating(false);
    }
  };

  const handleSendChat = async (overridePrompt?: string) => {
    const text = (overridePrompt || chatInput).trim();
    if (!text || chatLoading) return;

    const userMsg = { role: 'user' as const, text };
    const updatedHistory = [...chatHistory, userMsg];
    setChatHistory(updatedHistory);
    if (!overridePrompt) setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch('http://localhost:5000/api/chat/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordId: record.id,
          userMessage: text,
          chatHistory,
        }),
      });

      if (!res.ok) throw new Error('Chat API call failed');
      const data = await res.json();

      setChatHistory([...updatedHistory, { role: 'model', text: data.reply }]);
    } catch (err) {
      console.error('Copilot chat error:', err);
      setChatHistory([
        ...updatedHistory,
        { role: 'model', text: '⚠️ Unable to connect to Gemini Copilot. Ensure backend server is active.' },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleCopyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <aside className="w-[440px] bg-white border-l border-[#e2e8f0] flex flex-col h-full shadow-[-4px_0_15px_rgba(0,0,0,0.03)] z-10 overflow-y-auto font-sans">
      {/* Panel Header */}
      <div className="p-4 border-b border-[#e2e8f0] bg-[#f8f9ff] sticky top-0 z-20 flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-bold text-[#0b1c30] text-base font-serif">Exception Details</h2>
            {record.reviewStatus !== 'pending' && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${reviewStyle.bg} ${reviewStyle.text}`}>
                {reviewStyle.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${catStyle.bg} ${catStyle.text}`}>
              {catStyle.name}
            </span>
            <span className="font-mono text-xs text-[#404940]">{record.invoiceNumber}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-[#404940] hover:text-[#0b1c30] p-1.5 rounded hover:bg-[#e5eeff] transition-colors"
          title="Close panel"
        >
          <span className="material-symbols-outlined text-xl">close</span>
        </button>
      </div>

      {/* Panel Content */}
      <div className="p-5 flex flex-col gap-6 flex-1">
        {/* Audit Assessment / Reasoning Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 shadow-2xs">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[#166534] mt-0.5 text-xl">
              fact_check
            </span>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#166534] mb-1">
                Reconciliation Audit Diagnostic ({confidencePct !== null ? `${confidencePct}% Confidence` : 'Deterministic Rule'})
              </h3>
              <p className="text-xs text-[#0b1c30] leading-relaxed font-normal">
                {record.reasoning}
              </p>
            </div>
          </div>
        </div>

        {/* Real Field Comparison Table */}
        <div>
          <h4 className="text-xs font-semibold text-[#404940] uppercase tracking-wider mb-2">
            Data Comparison (Our Books vs GSTR-2B)
          </h4>
          <div className="border border-[#e2e8f0] rounded overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#f8f9ff] text-[#404940] uppercase text-[11px] font-semibold">
                <tr>
                  <th className="p-2 border-b border-[#e2e8f0]">Field</th>
                  <th className="p-2 border-b border-l border-[#e2e8f0] text-right w-1/3">Our Books</th>
                  <th className="p-2 border-b border-l border-[#e2e8f0] text-right w-1/3">GSTR-2B</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-b border-[#e2e8f0]">
                  <td className="p-2 font-sans text-[#404940]">Taxable Value</td>
                  <td className="p-2 border-l border-[#e2e8f0] text-right">
                    {formatCurrency(record.ourTaxableValue)}
                  </td>
                  <td className="p-2 border-l border-[#e2e8f0] text-right">
                    {formatCurrency(record.portalTaxableValue)}
                  </td>
                </tr>
                <tr className={`border-b border-[#e2e8f0] ${isTaxDiff ? 'bg-[#fff7ed]' : ''}`}>
                  <td className="p-2 font-sans text-[#404940]">Tax Amount</td>
                  <td className={`p-2 border-l border-[#e2e8f0] text-right ${isTaxDiff ? 'text-[#92400e] font-semibold' : ''}`}>
                    {formatCurrency(record.ourTaxAmount)}
                  </td>
                  <td className={`p-2 border-l border-[#e2e8f0] text-right ${isTaxDiff ? 'text-[#92400e] font-semibold' : ''}`}>
                    {formatCurrency(record.portalTaxAmount)}
                  </td>
                </tr>
                <tr className={`font-semibold ${isAmountDiff ? 'bg-[#fff7ed]' : 'bg-[#f8f9ff]'}`}>
                  <td className="p-2 font-sans text-[#0b1c30]">Total Amount</td>
                  <td className={`p-2 border-l border-[#e2e8f0] text-right ${isAmountDiff ? 'text-[#92400e]' : ''}`}>
                    {formatCurrency(record.ourTotalAmount)}
                  </td>
                  <td className={`p-2 border-l border-[#e2e8f0] text-right ${isAmountDiff ? 'text-[#92400e]' : ''}`}>
                    {formatCurrency(record.portalTotalAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Real Vendor Details & GSTINs */}
        <div>
          <h4 className="text-xs font-semibold text-[#404940] uppercase tracking-wider mb-2">
            Vendor &amp; Invoice Metadata
          </h4>
          <div className="bg-[#f8f9ff] rounded p-3 border border-[#e2e8f0] text-xs flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-[#404940] font-sans">Vendor Name</span>
              <span className="font-medium text-[#0b1c30]">{record.vendorName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#404940] font-sans">Our Books GSTIN</span>
              <span className="font-mono">{record.ourVendorGstin}</span>
            </div>
            <div className={`flex justify-between ${isGstinDiff ? 'bg-[#fff7ed] p-1 rounded' : ''}`}>
              <span className="text-[#404940] font-sans">GSTR-2B GSTIN</span>
              <span className={`font-mono ${isGstinDiff ? 'text-[#92400e] font-bold' : ''}`}>
                {record.portalVendorGstin || 'Not Found'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#404940] font-sans">Invoice Date</span>
              <span className="font-mono">{record.invoiceDate}</span>
            </div>
            <div className="flex justify-between border-t border-[#e2e8f0] pt-2 mt-1">
              <span className="text-[#404940] font-sans">Description</span>
              <span className="text-right text-[#0b1c30] max-w-[200px] truncate" title={record.description}>
                {record.description}
              </span>
            </div>
          </div>
        </div>

        {/* Interactive Gemini Financial Copilot Chat Desk */}
        <div className="border border-[#E5DFD3] rounded-lg p-4 bg-[#FAF8F3] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#166534] text-lg">auto_awesome</span>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#1E293B]">
                Ask Gemini Financial Copilot
              </h4>
            </div>
            <span className="text-[10px] text-[#64748B] font-mono">gemini-3.5-flash-lite</span>
          </div>

          {/* Quick Prompt Chips */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => handleSendChat('Why is this amount different?')}
              className="text-[11px] bg-white border border-[#E5DFD3] text-[#334155] px-2.5 py-1 rounded-full hover:border-[#166534] hover:text-[#166534] transition-colors"
            >
              💬 Why is this different?
            </button>
            <button
              onClick={() => handleSendChat('Draft a formal vendor dispute email to resolve this discrepancy.')}
              className="text-[11px] bg-white border border-[#E5DFD3] text-[#334155] px-2.5 py-1 rounded-full hover:border-[#166534] hover:text-[#166534] transition-colors"
            >
              📧 Draft vendor email
            </button>
            <button
              onClick={() => handleSendChat('What is the Input Tax Credit (ITC) liability impact?')}
              className="text-[11px] bg-white border border-[#E5DFD3] text-[#334155] px-2.5 py-1 rounded-full hover:border-[#166534] hover:text-[#166534] transition-colors"
            >
              ⚖️ What is the ITC impact?
            </button>
          </div>

          {/* Chat Messages Log */}
          {chatHistory.length > 0 && (
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {chatHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#166534] text-white ml-6 font-medium'
                      : 'bg-white border border-[#E5DFD3] text-[#1E293B] mr-2 shadow-2xs space-y-2'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                  {msg.role === 'model' && (
                    <button
                      onClick={() => handleCopyText(msg.text, idx)}
                      className="text-[10px] text-[#166534] hover:underline font-semibold flex items-center gap-1 pt-1"
                    >
                      <span className="material-symbols-outlined text-xs">
                        {copiedIndex === idx ? 'check' : 'content_copy'}
                      </span>
                      <span>{copiedIndex === idx ? 'Copied to Clipboard!' : 'Copy to Clipboard'}</span>
                    </button>
                  )}
                </div>
              ))}

              {chatLoading && (
                <div className="bg-white border border-[#E5DFD3] p-3 rounded-lg text-xs text-[#64748B] flex items-center gap-2 animate-pulse">
                  <span className="material-symbols-outlined text-sm animate-spin text-[#166534]">sync</span>
                  <span>Gemini Copilot is auditing and drafting explanation...</span>
                </div>
              )}
            </div>
          )}

          {/* Chat Input Control */}
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
              placeholder="Ask Copilot a question about this invoice..."
              className="flex-1 bg-white border border-[#E5DFD3] rounded px-3 py-1.5 text-xs outline-none focus:border-[#166534] text-[#1E293B]"
            />
            <button
              onClick={() => handleSendChat()}
              disabled={chatLoading || !chatInput.trim()}
              className="bg-[#166534] hover:bg-[#004c22] text-white px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-50 transition-colors flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-sm">send</span>
            </button>
          </div>
        </div>
      </div>

      {/* Action Footer — Interactive PATCH call buttons */}
      <div className="p-4 border-t border-[#e2e8f0] bg-[#f8f9ff] mt-auto flex flex-col gap-2">
        <button
          onClick={() => handleActionClick('accept_vendor')}
          disabled={updating || record.reviewStatus === 'accepted_vendor'}
          className="w-full bg-[#166534] text-white py-2 rounded text-xs font-semibold hover:bg-[#004c22] transition-colors disabled:opacity-50 shadow-sm flex items-center justify-center gap-1.5"
        >
          {record.reviewStatus === 'accepted_vendor' && (
            <span className="material-symbols-outlined text-base">check_circle</span>
          )}
          <span>{record.reviewStatus === 'accepted_vendor' ? 'Vendor Values Accepted' : 'Accept Vendor Values'}</span>
        </button>

        <div className="flex gap-2">
          <button
            onClick={() => handleActionClick('keep_books')}
            disabled={updating || record.reviewStatus === 'keep_books'}
            className="flex-1 border border-[#e2e8f0] bg-white text-[#0b1c30] py-2 rounded text-xs font-semibold hover:bg-[#eff4ff] transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
          >
            {record.reviewStatus === 'keep_books' && (
              <span className="material-symbols-outlined text-base text-[#0058c3]">check</span>
            )}
            <span>{record.reviewStatus === 'keep_books' ? 'Books Kept' : 'Keep Our Books'}</span>
          </button>

          <button
            onClick={() => handleActionClick('flag_review')}
            disabled={updating || record.reviewStatus === 'flagged_review'}
            className="flex-1 border border-[#92400e] bg-white text-[#92400e] py-2 rounded text-xs font-semibold hover:bg-[#fff7ed] transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
          >
            {record.reviewStatus === 'flagged_review' && (
              <span className="material-symbols-outlined text-base">flag</span>
            )}
            <span>{record.reviewStatus === 'flagged_review' ? 'Flagged' : 'Flag for Review'}</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
