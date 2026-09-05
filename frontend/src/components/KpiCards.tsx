import React from 'react';
import { ReconciliationSummary } from '../types';

interface KpiCardsProps {
  summary: ReconciliationSummary | null;
}

function formatCurrency(val: number | undefined): string {
  if (val == null) return '₹0.00';
  return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const KpiCards: React.FC<KpiCardsProps> = ({ summary }) => {
  const formattedDate = summary?.lastProcessedAt
    ? new Date(summary.lastProcessedAt).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'Live Pipeline Output';

  return (
    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 mb-2">
      <div>
        <h1 className="text-2xl font-bold text-[#0b1c30] tracking-tight mb-1">
          GSTR-2B Automated Reconciliation Engine
        </h1>
        <p className="text-xs text-[#404940] flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
          Rule-Based Deterministic Matching + Gemini Financial Audit Protocol • {formattedDate}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {/* Total Records Card */}
        <div className="bg-white border border-[#e2e8f0] rounded p-3 min-w-[120px]">
          <p className="text-[11px] font-semibold text-[#404940] uppercase tracking-wider mb-1">
            Total Records
          </p>
          <p className="font-mono font-bold text-xl text-[#0b1c30]">
            {summary?.totalRecords ?? 80}
          </p>
        </div>

        {/* Matched Card */}
        <div className="bg-white border border-[#e2e8f0] rounded p-3 min-w-[120px] border-l-4 border-l-[#166534]">
          <p className="text-[11px] font-semibold text-[#404940] uppercase tracking-wider mb-1">
            Matched
          </p>
          <p className="font-mono font-bold text-xl text-[#166534]">
            {summary?.matchedCount ?? 40}
          </p>
        </div>

        {/* Exceptions Card */}
        <div className="bg-white border border-[#e2e8f0] rounded p-3 min-w-[120px] border-l-4 border-l-[#92400e]">
          <p className="text-[11px] font-semibold text-[#404940] uppercase tracking-wider mb-1">
            Exceptions
          </p>
          <p className="font-mono font-bold text-xl text-[#92400e]">
            {summary?.exceptionCount ?? 40}
          </p>
        </div>

        {/* Reconciled Amount Card */}
        <div className="bg-white border border-[#e2e8f0] rounded p-3 min-w-[150px] border-l-4 border-l-[#166534]">
          <p className="text-[11px] font-semibold text-[#404940] uppercase tracking-wider mb-1">
            Reconciled Amount
          </p>
          <p className="font-mono font-bold text-base text-[#166534]">
            {formatCurrency(summary?.reconciledAmount)}
          </p>
        </div>

        {/* Under Review Amount Card */}
        <div className="bg-white border border-[#e2e8f0] rounded p-3 min-w-[150px] border-l-4 border-l-[#92400e]">
          <p className="text-[11px] font-semibold text-[#404940] uppercase tracking-wider mb-1">
            Under Review Amount
          </p>
          <p className="font-mono font-bold text-base text-[#92400e]">
            {formatCurrency(summary?.reviewAmount)}
          </p>
        </div>
      </div>
    </div>
  );
};
