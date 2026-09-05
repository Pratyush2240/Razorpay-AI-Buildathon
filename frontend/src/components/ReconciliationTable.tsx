import React, { useState } from 'react';
import { ReconciliationRecord, MatchCategory, ReviewStatus } from '../types';

interface ReconciliationTableProps {
  records: ReconciliationRecord[];
  selectedRecordId: string | null;
  onSelectRecord: (record: ReconciliationRecord) => void;
  filterCategory: string;
  onFilterCategoryChange: (category: string) => void;
}

const CATEGORY_NAMES: Record<MatchCategory, { label: string; badge: string; bg: string; text: string }> = {
  exact_match: { label: 'Exact Match', badge: 'Matched', bg: 'bg-[#f0fdf4]', text: 'text-[#166534]' },
  amount_mismatch: { label: 'Amount Mismatch', badge: 'Mismatch', bg: 'bg-[#fff7ed]', text: 'text-[#92400e]' },
  missing_on_portal: { label: 'Missing on Portal', badge: 'Missing', bg: 'bg-[#fef2f2]', text: 'text-[#ba1a1a]' },
  duplicate: { label: 'Duplicate Record', badge: 'Duplicate', bg: 'bg-[#fef2f2]', text: 'text-[#ba1a1a]' },
  gstin_mismatch: { label: 'GSTIN Mismatch', badge: 'GSTIN Error', bg: 'bg-[#fef2f2]', text: 'text-[#ba1a1a]' },
  needs_manual_review: { label: 'Manual Review', badge: 'Draft', bg: 'bg-[#f1f5f9]', text: 'text-[#475569]' },
};

const REVIEW_BADGES: Record<ReviewStatus, { label: string; bg: string; text: string } | null> = {
  pending: null,
  accepted_vendor: { label: 'Accepted Vendor', bg: 'bg-[#f0fdf4]', text: 'text-[#166534]' },
  keep_books: { label: 'Kept Books', bg: 'bg-[#eff4ff]', text: 'text-[#0058c3]' },
  flagged_review: { label: 'Flagged', bg: 'bg-[#fff7ed]', text: 'text-[#92400e]' },
};

function formatCurrency(val: number): string {
  return val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const ReconciliationTable: React.FC<ReconciliationTableProps> = ({
  records,
  selectedRecordId,
  onSelectRecord,
  filterCategory,
  onFilterCategoryChange,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter records by search term and category filter
  const filteredRecords = records.filter((rec) => {
    const matchesCategory =
      filterCategory === 'all' ||
      (filterCategory === 'exceptions' && rec.category !== 'exact_match') ||
      rec.category === filterCategory;

    const query = searchTerm.toLowerCase();
    const matchesSearch =
      rec.invoiceNumber.toLowerCase().includes(query) ||
      rec.vendorName.toLowerCase().includes(query) ||
      rec.vendorGstin.toLowerCase().includes(query);

    return matchesCategory && matchesSearch;
  });

  const handleExportCsv = () => {
    const rows = filteredRecords.map((r) => ([
      r.invoiceNumber,
      r.vendorName,
      r.vendorGstin,
      r.invoiceDate,
      r.amount,
      r.taxAmount,
      r.category,
      r.confidence != null ? Math.round(r.confidence * 100) + '%' : '100%',
      r.reviewStatus,
      r.resolvedBy,
      `"${r.reasoning.replace(/"/g, "'")}"`
    ]));

    const header = [
      'Invoice #', 'Vendor Name', 'Vendor GSTIN', 'Invoice Date',
      'Amount', 'Tax Amount', 'Category', 'Confidence',
      'Review Status', 'Resolved By', 'Reasoning'
    ];

    const csvContent = [header, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gstmatch-reconciliation-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map((r) => r.id)));
    }
  };

  const toggleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white border border-[#e2e8f0] rounded-md overflow-hidden shadow-sm">
      {/* Table Controls Header */}
      <div className="flex flex-wrap justify-between items-center bg-white p-3 border-b border-[#e2e8f0] gap-2">
        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-2 text-[#404940] text-lg">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search exceptions or invoice #..."
              className="pl-8 pr-3 py-1 text-xs border border-[#e2e8f0] rounded focus:border-[#166534] focus:ring-1 focus:ring-[#166534] outline-none h-8 w-64 bg-[#f8f9ff] text-[#0b1c30]"
            />
          </div>

          {/* Category Filter Dropdown */}
          <select
            value={filterCategory}
            onChange={(e) => onFilterCategoryChange(e.target.value)}
            className="border border-[#e2e8f0] bg-white text-[#0b1c30] px-3 py-1 rounded text-xs h-8 outline-none focus:border-[#166534]"
          >
            <option value="all">All Categories ({records.length})</option>
            <option value="exceptions">
              Exceptions Only ({records.filter((r) => r.category !== 'exact_match').length})
            </option>
            <option value="exact_match">Exact Match</option>
            <option value="amount_mismatch">Amount Mismatch</option>
            <option value="missing_on_portal">Missing on Portal</option>
            <option value="duplicate">Duplicate Record</option>
            <option value="gstin_mismatch">GSTIN Mismatch</option>
            <option value="needs_manual_review">Needs Manual Review</option>
          </select>
        </div>

        <div className="flex gap-2 text-xs text-[#404940] items-center">
          <span>Showing {filteredRecords.length} of {records.length} records</span>
          <button
            onClick={handleExportCsv}
            className="border border-[#e2e8f0] bg-white text-[#0b1c30] px-3 py-1 rounded text-xs flex items-center gap-1 hover:bg-[#eff4ff] transition-colors h-8"
            title={`Export ${filteredRecords.length} records as CSV`}
          >
            <span className="material-symbols-outlined text-base">download</span>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#f8f9ff] border-b border-[#e2e8f0] text-[11px] font-semibold uppercase tracking-wider text-[#404940] sticky top-0 z-10">
            <tr>
              <th className="p-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={selectedIds.size > 0 && selectedIds.size === filteredRecords.length}
                  onChange={toggleSelectAll}
                  className="rounded border-[#bfc9bd] text-[#166534] focus:ring-[#166534]"
                />
              </th>
              <th className="p-3">Invoice #</th>
              <th className="p-3">Vendor</th>
              <th className="p-3 text-right">Amount (₹)</th>
              <th className="p-3">Status</th>
              <th className="p-3">Category</th>
              <th className="p-3 text-center">Confidence</th>
              <th className="p-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="text-xs divide-y divide-[#e2e8f0]">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-[#404940]">
                  No matching records found for the current search and filter criteria.
                </td>
              </tr>
            ) : (
              filteredRecords.map((rec) => {
                const isSelected = selectedRecordId === rec.id;
                const isChecked = selectedIds.has(rec.id);
                const catMeta = CATEGORY_NAMES[rec.category] || CATEGORY_NAMES.needs_manual_review;
                const reviewBadge = REVIEW_BADGES[rec.reviewStatus];
                const confidencePct = rec.confidence != null ? Math.round(rec.confidence * 100) : null;

                let confBarColor = 'bg-[#166534]';
                if (confidencePct !== null) {
                  if (confidencePct < 50) confBarColor = 'bg-[#ba1a1a]';
                  else if (confidencePct < 85) confBarColor = 'bg-[#92400e]';
                  else if (confidencePct < 95) confBarColor = 'bg-[#eab308]';
                }

                return (
                  <tr
                    key={rec.id}
                    onClick={() => onSelectRecord(rec)}
                    className={`transition-colors cursor-pointer group ${
                      isSelected
                        ? 'bg-[#eff4ff] hover:bg-[#dce9ff]'
                        : 'zebra-row bg-hover'
                    }`}
                  >
                    <td className="p-2.5 text-center" onClick={(e) => toggleSelectRow(rec.id, e)}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        className="rounded border-[#bfc9bd] text-[#166534] focus:ring-[#166534]"
                      />
                    </td>
                    <td className={`p-2.5 font-mono font-bold ${isSelected ? 'text-[#004c22]' : 'text-[#0b1c30]'}`}>
                      {rec.invoiceNumber}
                    </td>
                    <td className="p-2.5 font-sans text-[#0b1c30] max-w-[180px] truncate" title={rec.vendorName}>
                      {rec.vendorName}
                    </td>
                    <td className="p-2.5 font-mono text-right font-medium text-[#0b1c30]">
                      {formatCurrency(rec.amount)}
                    </td>
                    <td className="p-2.5">
                      <div className="flex items-center gap-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${catMeta.bg} ${catMeta.text}`}>
                          {catMeta.badge}
                        </span>
                        {reviewBadge && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${reviewBadge.bg} ${reviewBadge.text}`}>
                            {reviewBadge.label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2.5 font-sans text-[#404940]">
                      {catMeta.label}
                    </td>
                    <td className="p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-14 bg-[#cbdbf5] h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${confBarColor}`}
                            style={{ width: `${confidencePct ?? 100}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px] text-[#404940]">
                          {confidencePct !== null ? `${confidencePct}%` : '100%'}
                        </span>
                      </div>
                    </td>
                    <td className="p-2.5 text-center">
                      <button className="text-[#404940] hover:text-[#166534] opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="material-symbols-outlined text-base">chevron_right</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
