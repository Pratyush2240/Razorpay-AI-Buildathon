export type MatchCategory =
  | 'exact_match'
  | 'amount_mismatch'
  | 'missing_on_portal'
  | 'duplicate'
  | 'gstin_mismatch'
  | 'needs_manual_review';

export type ReviewStatus = 'pending' | 'accepted_vendor' | 'keep_books' | 'flagged_review';

export interface PortalRecordSummary {
  id: string;
  invoiceNumber: string | null;
  vendorGstin: string;
  vendorName: string;
  amount: number;
  taxAmount: number;
  filedDate: string;
}

export interface ReconciliationRecord {
  id: string;
  invoiceNumber: string;
  vendorGstin: string;
  vendorName: string;
  amount: number;
  taxAmount: number;
  invoiceDate: string;
  description: string;
  category: MatchCategory;
  confidence: number | null;
  reasoning: string;
  resolvedBy: 'Stage 1' | 'Stage 2';
  reviewStatus: ReviewStatus;

  // Comparison fields for Exception Panel
  ourTaxableValue: number;
  ourTaxAmount: number;
  ourTotalAmount: number;
  portalTaxableValue: number | null;
  portalTaxAmount: number | null;
  portalTotalAmount: number | null;
  ourVendorGstin: string;
  portalVendorGstin: string | null;

  matchedPortalRecord: PortalRecordSummary | null;
  candidatePortalRecords: PortalRecordSummary[];
}

export interface ReconciliationSummary {
  totalRecords: number;
  matchedCount: number;
  exceptionCount: number;
  reconciledAmount: number;
  reviewAmount: number;
  lastProcessedAt: string;
  categoryBreakdown: Record<MatchCategory, number>;
}

export interface ReconciliationResponse {
  summary: ReconciliationSummary;
  records: ReconciliationRecord[];
}
