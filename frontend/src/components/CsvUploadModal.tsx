import React, { useState, useEffect } from 'react';
import { ReconciliationResponse } from '../types';

interface CsvUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (data: ReconciliationResponse) => void;
}

interface JobStatus {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  stage: string;
  processedCount: number;
  totalCount: number;
  error?: string;
  result?: ReconciliationResponse;
}

const SAMPLE_INTERNAL_CSV = `invoiceNumber,vendorName,vendorGstin,amount,taxAmount,invoiceDate,description
BILL-2024-9001,Acme Industrial Supplies,27AAACA12341Z1,150000,27000,2024-10-01,Heavy Industrial Transformers
BILL-2024-9002,Zenith Logistics Pvt Ltd,29BBBCC56782Z5,85000,15300,2024-10-05,Freight and Transportation Services
BILL-2024-9003,Starlight Technologies,07CCCDE90123Z9,230000,41400,2024-10-10,Enterprise Software Licensing
BILL-2024-9004,Reliance Energy Solutions,27DDDEF34564Z3,110000,19800,2024-10-12,Substation Electrical Equipment
BILL-2024-9005,Tata Motors Fleet Services,27EEEFG78905Z7,420000,75600,2024-10-15,Commercial Transport Logistics`;

const SAMPLE_PORTAL_CSV = `invoiceNumber,vendorName,vendorGstin,amount,taxAmount,filedDate
BILL-2024-9001,Acme Industrial Supplies,27AAACA12341Z1,150000,27000,2024-10-02
BILL-2024-9002,Zenith Logistics Pvt Ltd,29BBBCC56782Z5,82000,14760,2024-10-06
BILL-2024-9003,Starlight Tech,07CCCDE90123Z9,230000,41400,2024-10-11
BILL-2024-9004,Reliance Energy Solutions,27DDDEF34564Z3,110000,19800,2024-10-13`;

export const CsvUploadModal: React.FC<CsvUploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
}) => {
  const [internalCsvText, setInternalCsvText] = useState<string>('');
  const [portalCsvText, setPortalCsvText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Background Job Progress State
  const [activeJob, setActiveJob] = useState<JobStatus | null>(null);

  useEffect(() => {
    if (!activeJob?.jobId || activeJob.status === 'completed' || activeJob.status === 'failed') {
      return;
    }

    const eventSource = new EventSource(
      `http://localhost:5000/api/reconciliation/jobs/${activeJob.jobId}/stream`
    );

    eventSource.onmessage = (event) => {
      try {
        const data: JobStatus = JSON.parse(event.data);
        setActiveJob(data);

        if (data.status === 'completed' && data.result) {
          onUploadSuccess(data.result);
          setLoading(false);
          eventSource.close();
        } else if (data.status === 'failed') {
          setError(data.error || 'Job failed');
          setLoading(false);
          eventSource.close();
        }
      } catch (err) {
        console.error('Error parsing SSE job telemetry event:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.warn('SSE stream closed or disconnected:', err);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [activeJob?.jobId, activeJob?.status, onUploadSuccess]);

  if (!isOpen) return null;

  const handleLoadSample = () => {
    setInternalCsvText(SAMPLE_INTERNAL_CSV);
    setPortalCsvText(SAMPLE_PORTAL_CSV);
    setError(null);
  };

  const parseCsvToObjects = (csvText: string) => {
    const lines = csvText
      .trim()
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim());
    const records: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      if (cols.length < 3) continue;

      const obj: any = {};
      headers.forEach((h, idx) => {
        const val = cols[idx] || '';
        if (h === 'amount' || h === 'taxAmount') {
          obj[h] = parseFloat(val) || 0;
        } else {
          obj[h] = val;
        }
      });
      records.push(obj);
    }
    return records;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setActiveJob(null);

    if (!internalCsvText.trim() || !portalCsvText.trim()) {
      setError('Please provide CSV data for both Internal Invoices and GSTR-2B Portal Records.');
      return;
    }

    try {
      setLoading(true);
      const internalInvoices = parseCsvToObjects(internalCsvText);
      const portalRecords = parseCsvToObjects(portalCsvText);

      if (internalInvoices.length === 0 || portalRecords.length === 0) {
        throw new Error('CSV parsing failed. Ensure header rows and comma separators are correct.');
      }

      // Enqueue bulk job asynchronously (HTTP 202 Accepted)
      const res = await fetch('http://localhost:5000/api/reconciliation/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalInvoices, portalRecords }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Upload failed');
      }

      const jobData = await res.json();
      setActiveJob({
        jobId: jobData.jobId,
        status: 'queued',
        progress: 5,
        stage: 'queued',
        processedCount: 0,
        totalCount: internalInvoices.length + portalRecords.length,
      });
    } catch (err: any) {
      console.error('Error submitting bulk reconciliation job:', err);
      setError(err?.message || 'Failed to submit bulk reconciliation job.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in font-sans">
      <div className="bg-[#FAF8F3] text-[#1E293B] rounded-xl shadow-2xl border border-[#E5DFD3] w-full max-w-3xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E5DFD3] flex items-center justify-between bg-[#FAF8F3]">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-xl text-[#166534]">
              upload_file
            </span>
            <div>
              <h2 className="text-lg font-bold font-serif text-[#1E293B]">
                Upload Reconciliation Dataset (Bulk CSV Queue)
              </h2>
              <p className="text-xs text-[#64748B]">
                Process large enterprise ledgers asynchronously via BullMQ / Redis worker queue
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-[#64748B] hover:text-[#1E293B] p-1 rounded hover:bg-[#E5DFD3]/40 disabled:opacity-30"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
          {error && (
            <div className="bg-[#FEF2F2] border border-[#FCA5A5] text-[#991B1B] text-xs p-3 rounded-md font-medium">
              {error}
            </div>
          )}

          {/* Active Job Progress Bar */}
          {activeJob && (
            <div className="bg-[#F0FDF4] border border-[#86EFAC] p-4 rounded-lg space-y-2">
              <div className="flex justify-between items-center text-xs font-semibold text-[#166534]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                  <span>
                    Queue Job #{activeJob.jobId} &bull; Stage: {activeJob.stage.replace(/_/g, ' ')}
                  </span>
                </div>
                <span>{activeJob.progress}%</span>
              </div>
              <div className="w-full bg-[#DCFCE7] rounded-full h-2 overflow-hidden border border-[#86EFAC]">
                <div
                  className="bg-[#166534] h-full transition-all duration-300 rounded-full"
                  style={{ width: `${activeJob.progress}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-[#15803D]">
                <span>Status: {activeJob.status.toUpperCase()}</span>
                <span>
                  Items Processed: {activeJob.processedCount} / {activeJob.totalCount}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center bg-[#F2ECDC]/60 border border-[#E5DFD3] p-3 rounded-lg text-xs">
            <span className="text-[#334155]">Want to test custom data instantly?</span>
            <button
              type="button"
              onClick={handleLoadSample}
              disabled={loading}
              className="bg-[#166534] hover:bg-[#004c22] text-white px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm">auto_fix_high</span>
              <span>Load Sample CSV Pair</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Internal Invoices CSV Box */}
            <div>
              <label className="block text-xs font-bold text-[#1E293B] mb-1.5 uppercase tracking-wider">
                1. Internal Invoices CSV (Our Books)
              </label>
              <textarea
                rows={8}
                disabled={loading}
                value={internalCsvText}
                onChange={(e) => setInternalCsvText(e.target.value)}
                placeholder="invoiceNumber,vendorName,vendorGstin,amount,taxAmount,invoiceDate,description..."
                className="w-full bg-[#FFFFFF] border border-[#E5DFD3] rounded p-3 text-xs font-mono focus:outline-none focus:border-[#166534] text-[#1E293B] leading-relaxed shadow-inner disabled:opacity-50"
              />
              <span className="text-[10px] text-[#64748B] block mt-1">
                Headers: invoiceNumber, vendorName, vendorGstin, amount, taxAmount, invoiceDate, description
              </span>
            </div>

            {/* GSTR-2B Portal Records CSV Box */}
            <div>
              <label className="block text-xs font-bold text-[#1E293B] mb-1.5 uppercase tracking-wider">
                2. GSTR-2B Portal Records CSV
              </label>
              <textarea
                rows={8}
                disabled={loading}
                value={portalCsvText}
                onChange={(e) => setPortalCsvText(e.target.value)}
                placeholder="invoiceNumber,vendorName,vendorGstin,amount,taxAmount,filedDate..."
                className="w-full bg-[#FFFFFF] border border-[#E5DFD3] rounded p-3 text-xs font-mono focus:outline-none focus:border-[#166534] text-[#1E293B] leading-relaxed shadow-inner disabled:opacity-50"
              />
              <span className="text-[10px] text-[#64748B] block mt-1">
                Headers: invoiceNumber, vendorName, vendorGstin, amount, taxAmount, filedDate
              </span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-[#E5DFD3] flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="text-xs text-[#64748B] hover:text-[#1E293B] font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-[#166534] hover:bg-[#004c22] text-white text-xs font-bold px-5 py-2.5 rounded-md shadow-xs flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-base">
                {loading ? 'sync' : 'rocket_launch'}
              </span>
              <span>{loading ? 'Enqueueing Async Queue Job...' : 'Enqueue Bulk Job & Run Pipeline'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
