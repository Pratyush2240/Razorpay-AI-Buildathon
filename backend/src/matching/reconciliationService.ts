import { PrismaClient } from '@prisma/client';
import { runStage1 } from './stage1';
import { runStage2 } from './stage2';

export type ReviewStatus = 'pending' | 'accepted_vendor' | 'keep_books' | 'flagged_review';

export interface ReconciliationRecord {
  id: string;
  invoiceNumber: string;
  vendorGstin: string;
  vendorName: string;
  amount: number;
  taxAmount: number;
  invoiceDate: string;
  description: string;
  category: 'exact_match' | 'amount_mismatch' | 'missing_on_portal' | 'duplicate' | 'gstin_mismatch' | 'needs_manual_review';
  confidence: number | null;
  reasoning: string;
  resolvedBy: 'Stage 1' | 'Stage 2';
  reviewStatus: ReviewStatus;

  // Detailed fields for Exception Panel
  ourTaxableValue: number;
  ourTaxAmount: number;
  ourTotalAmount: number;
  portalTaxableValue: number | null;
  portalTaxAmount: number | null;
  portalTotalAmount: number | null;
  ourVendorGstin: string;
  portalVendorGstin: string | null;

  matchedPortalRecord: {
    id: string;
    invoiceNumber: string | null;
    vendorGstin: string;
    vendorName: string;
    amount: number;
    taxAmount: number;
    filedDate: string;
  } | null;
  candidatePortalRecords: Array<{
    id: string;
    invoiceNumber: string | null;
    vendorGstin: string;
    vendorName: string;
    amount: number;
    taxAmount: number;
    filedDate: string;
  }>;
}

export interface ReconciliationSummary {
  totalRecords: number;
  matchedCount: number;
  exceptionCount: number;
  reconciledAmount: number;
  reviewAmount: number;
  lastProcessedAt: string;
  categoryBreakdown: Record<string, number>;
}

export interface ReconciliationResponse {
  summary: ReconciliationSummary;
  records: ReconciliationRecord[];
}

// ─── In-memory pipeline cache ──────────────────────────────────────────────────
// The pipeline (Stage 1 + Stage 2) is expensive. We cache its output and only
// re-run it when the user explicitly clicks "Run Reconciliation".

let cachedResponse: ReconciliationResponse | null = null;
let pipelineRunning = false;

/**
 * Builds the ReconciliationResponse from raw pipeline outputs + DB data.
 * This is the expensive function — it calls Stage 1 and Stage 2.
 */
async function executePipeline(prisma: PrismaClient): Promise<ReconciliationResponse> {
  // 1. Fetch internal invoices
  const internalInvoices = await prisma.internalInvoice.findMany({
    orderBy: { invoiceNumber: 'asc' },
  });

  // 2. Run Stage 1 & Stage 2 matching engine
  const stage1Results = await runStage1(prisma);
  const stage2Results = await runStage2(prisma, stage1Results);

  const stage2Map = new Map(stage2Results.map((r) => [r.internalInvoiceId, r]));

  // 3. Fetch candidate portal records to hydrate details
  const allPortalRecordIds = new Set<string>();
  for (const s1 of stage1Results) {
    if (s1.matchedPortalRecordId) allPortalRecordIds.add(s1.matchedPortalRecordId);
    for (const cid of s1.candidatePortalRecordIds) allPortalRecordIds.add(cid);
  }

  const portalRecords = await prisma.portalRecord.findMany({
    where: { id: { in: Array.from(allPortalRecordIds) } },
  });
  const portalMap = new Map(portalRecords.map((p) => [p.id, p]));

  const formatPortalRecord = (p: typeof portalRecords[0]) => ({
    id: p.id,
    invoiceNumber: p.invoiceNumber,
    vendorGstin: p.vendorGstin,
    vendorName: p.vendorName,
    amount: p.amount.toNumber(),
    taxAmount: p.taxAmount.toNumber(),
    filedDate: p.filedDate.toISOString().split('T')[0],
  });

  const records: ReconciliationRecord[] = [];
  let reconciledAmount = 0;
  let reviewAmount = 0;

  const categoryBreakdown: Record<string, number> = {
    exact_match: 0,
    amount_mismatch: 0,
    missing_on_portal: 0,
    duplicate: 0,
    gstin_mismatch: 0,
    needs_manual_review: 0,
  };

  for (const inv of internalInvoices) {
    const s1 = stage1Results.find((r) => r.internalInvoiceId === inv.id);
    const s2 = stage2Map.get(inv.id);

    let category: ReconciliationRecord['category'];
    let confidence: number | null = null;
    let reasoning = '';
    let resolvedBy: 'Stage 1' | 'Stage 2';

    if (s1 && s1.status === 'matched') {
      category = 'exact_match';
      confidence = 1.0;
      reasoning = 'Resolved by Stage 1 deterministic exact matching engine (Exact match on Invoice Number, GSTIN, and Amount).';
      resolvedBy = 'Stage 1';
    } else {
      resolvedBy = 'Stage 2';
      category = (s2?.category as ReconciliationRecord['category']) || 'needs_manual_review';
      confidence = s2?.confidence ?? null;
      reasoning = s2?.reasoning || 'Requires manual financial controller review.';
    }

    categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;

    const invAmount = inv.amount.toNumber();
    const invTax = inv.taxAmount.toNumber();

    if (category === 'exact_match') {
      reconciledAmount += invAmount;
    } else {
      reviewAmount += invAmount;
    }

    let matchedPortalRecord = null;
    if (s1?.matchedPortalRecordId) {
      const p = portalMap.get(s1.matchedPortalRecordId);
      if (p) matchedPortalRecord = formatPortalRecord(p);
    } else if (s1?.candidatePortalRecordIds.length === 1) {
      const p = portalMap.get(s1.candidatePortalRecordIds[0]);
      if (p) matchedPortalRecord = formatPortalRecord(p);
    }

    const candidatePortalRecords = (s1?.candidatePortalRecordIds || [])
      .map((cid) => portalMap.get(cid))
      .filter((p): p is typeof portalRecords[0] => Boolean(p))
      .map(formatPortalRecord);

    const refPortalRecord = matchedPortalRecord || candidatePortalRecords[0] || null;

    records.push({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      vendorGstin: inv.vendorGstin,
      vendorName: inv.vendorName,
      amount: invAmount,
      taxAmount: invTax,
      invoiceDate: inv.invoiceDate.toISOString().split('T')[0],
      description: inv.description,
      category,
      confidence,
      reasoning,
      resolvedBy,
      reviewStatus: 'pending',

      ourTaxableValue: Math.max(0, invAmount - invTax),
      ourTaxAmount: invTax,
      ourTotalAmount: invAmount,
      portalTaxableValue: refPortalRecord ? Math.max(0, refPortalRecord.amount - refPortalRecord.taxAmount) : null,
      portalTaxAmount: refPortalRecord ? refPortalRecord.taxAmount : null,
      portalTotalAmount: refPortalRecord ? refPortalRecord.amount : null,
      ourVendorGstin: inv.vendorGstin,
      portalVendorGstin: refPortalRecord ? refPortalRecord.vendorGstin : null,

      matchedPortalRecord,
      candidatePortalRecords,
    });
  }

  const matchedCount = categoryBreakdown.exact_match || 0;
  const exceptionCount = records.length - matchedCount;

  return {
    summary: {
      totalRecords: records.length,
      matchedCount,
      exceptionCount,
      reconciledAmount: Number(reconciledAmount.toFixed(2)),
      reviewAmount: Number(reviewAmount.toFixed(2)),
      lastProcessedAt: new Date().toISOString(),
      categoryBreakdown,
    },
    records,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns cached pipeline results. If the pipeline has never been run,
 * runs it once and caches the result. Subsequent calls are instant.
 */
export async function getReconciliationData(prisma: PrismaClient): Promise<ReconciliationResponse> {
  if (!cachedResponse) {
    await runPipeline(prisma);
  }
  return cachedResponse!;
}

/**
 * Imports custom user CSV data into database and re-runs the reconciliation pipeline.
 */
export async function importCustomDataAndRunPipeline(
  prisma: PrismaClient,
  internalInvoices: Array<{
    invoiceNumber: string;
    vendorName: string;
    vendorGstin: string;
    amount: number;
    taxAmount?: number;
    invoiceDate?: string;
    description?: string;
  }>,
  portalRecords: Array<{
    invoiceNumber?: string | null;
    vendorName: string;
    vendorGstin: string;
    amount: number;
    taxAmount?: number;
    filedDate?: string;
  }>
): Promise<ReconciliationResponse> {
  console.log(`📥 Importing ${internalInvoices.length} custom internal invoices & ${portalRecords.length} GSTR-2B records...`);

  // Clear existing database tables inside a transaction
  await prisma.$transaction([
    prisma.internalInvoice.deleteMany({}),
    prisma.portalRecord.deleteMany({}),
  ]);

  // Insert custom internal invoices
  if (internalInvoices.length > 0) {
    await prisma.internalInvoice.createMany({
      data: internalInvoices.map((inv, idx) => ({
        invoiceNumber: inv.invoiceNumber.trim(),
        vendorName: inv.vendorName.trim(),
        vendorGstin: inv.vendorGstin.trim(),
        amount: inv.amount,
        taxAmount: inv.taxAmount ?? Number((inv.amount * 0.18).toFixed(2)),
        invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate) : new Date(),
        description: inv.description || `Invoice #${inv.invoiceNumber}`,
      })),
    });
  }

  // Insert custom portal records
  if (portalRecords.length > 0) {
    await prisma.portalRecord.createMany({
      data: portalRecords.map((p) => ({
        invoiceNumber: p.invoiceNumber ? p.invoiceNumber.trim() : null,
        vendorName: p.vendorName.trim(),
        vendorGstin: p.vendorGstin.trim(),
        amount: p.amount,
        taxAmount: p.taxAmount ?? Number((p.amount * 0.18).toFixed(2)),
        filedDate: p.filedDate ? new Date(p.filedDate) : new Date(),
      })),
    });
  }

  // Force fresh pipeline run
  cachedResponse = null;
  return await runPipeline(prisma);
}

/**
 * Forces a fresh pipeline execution (called by POST /api/reconciliation/run).
 * Clears and rebuilds the cache.
 */
export async function runPipeline(prisma: PrismaClient): Promise<ReconciliationResponse> {
  if (pipelineRunning) {
    // Another request already triggered a run — wait for it to finish
    while (pipelineRunning) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return cachedResponse!;
  }

  pipelineRunning = true;
  try {
    console.log('🔄 Running reconciliation pipeline (Stage 1 + Stage 2)...');
    const startMs = Date.now();
    cachedResponse = await executePipeline(prisma);
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    console.log(`✅ Pipeline complete in ${elapsed}s — ${cachedResponse.summary.totalRecords} records processed.`);
    return cachedResponse;
  } finally {
    pipelineRunning = false;
  }
}

/**
 * Updates the reviewStatus of a single cached record in-place.
 * Does NOT re-run the pipeline.
 */
export function updateRecordReviewStatus(
  id: string,
  action: 'accept_vendor' | 'keep_books' | 'flag_review' | 'reset'
): ReconciliationRecord | null {
  if (!cachedResponse) return null;

  let newStatus: ReviewStatus = 'pending';
  if (action === 'accept_vendor') newStatus = 'accepted_vendor';
  else if (action === 'keep_books') newStatus = 'keep_books';
  else if (action === 'flag_review') newStatus = 'flagged_review';

  const record = cachedResponse.records.find((r) => r.id === id);
  if (!record) return null;

  record.reviewStatus = newStatus;
  return record;
}

export type EmitEventFn = (eventType: string, data: any) => void;

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs the pipeline while emitting Server-Sent Events (SSE) for stage 1 & stage 2 progress.
 */
export async function runPipelineWithStreaming(
  prisma: PrismaClient,
  emitEvent: EmitEventFn
): Promise<ReconciliationResponse> {
  if (pipelineRunning) {
    while (pipelineRunning) {
      await sleepMs(200);
    }
    if (cachedResponse) {
      emitEvent('pipeline_complete', cachedResponse);
    }
    return cachedResponse!;
  }

  pipelineRunning = true;
  try {
    console.log('🔄 Running reconciliation pipeline with streaming telemetry...');

    // 1. Fetch internal invoices
    const internalInvoices = await prisma.internalInvoice.findMany({
      orderBy: { invoiceNumber: 'asc' },
    });

    // --- STAGE 1 STREAMING ---
    emitEvent('stage1_start', { total: internalInvoices.length });

    const stage1Results = await runStage1(prisma);
    const stage1Map = new Map(stage1Results.map((r) => [r.internalInvoiceId, r]));

    let s1MatchedCount = 0;
    let s1DeferredCount = 0;

    for (let i = 0; i < internalInvoices.length; i++) {
      const inv = internalInvoices[i];
      const s1 = stage1Map.get(inv.id);
      const isMatched = s1?.status === 'matched';
      if (isMatched) {
        s1MatchedCount++;
      } else {
        s1DeferredCount++;
      }

      emitEvent('stage1_progress', {
        processed: i + 1,
        total: internalInvoices.length,
        matchedCount: s1MatchedCount,
        deferredCount: s1DeferredCount,
        currentItem: {
          invoiceNumber: inv.invoiceNumber,
          vendorName: inv.vendorName,
          amount: inv.amount.toNumber(),
          category: isMatched ? 'exact_match' : (s1?.hint || 'needs_review'),
        },
      });

      await sleepMs(15);
    }

    emitEvent('stage1_complete', {
      total: internalInvoices.length,
      matchedCount: s1MatchedCount,
      deferredCount: s1DeferredCount,
    });

    await sleepMs(200);

    // --- STAGE 2 STREAMING ---
    const stage2Results = await runStage2(prisma, stage1Results);
    const stage2Map = new Map(stage2Results.map((r) => [r.internalInvoiceId, r]));

    const needsReviewInvoices = internalInvoices.filter((inv) => {
      const s1 = stage1Map.get(inv.id);
      return s1?.status !== 'matched';
    });

    emitEvent('stage2_start', { total: needsReviewInvoices.length });

    for (let i = 0; i < needsReviewInvoices.length; i++) {
      const inv = needsReviewInvoices[i];
      const s1 = stage1Map.get(inv.id);
      const s2 = stage2Map.get(inv.id);

      emitEvent('stage2_item_start', {
        index: i + 1,
        total: needsReviewInvoices.length,
        recordId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        vendorName: inv.vendorName,
        amount: inv.amount.toNumber(),
        gstin: inv.vendorGstin,
        stage1Hint: s1?.hint || null,
      });

      const fullReasoning = s2?.reasoning || 'Requires financial controller review.';
      let textSoFar = '';
      const chunkSize = 4;
      for (let c = 0; c < fullReasoning.length; c += chunkSize) {
        const chunk = fullReasoning.substring(c, c + chunkSize);
        textSoFar += chunk;
        emitEvent('stage2_item_chunk', {
          recordId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          chunk,
          textSoFar,
        });
        await sleepMs(10);
      }

      emitEvent('stage2_item_complete', {
        recordId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        category: s2?.category || 'needs_manual_review',
        confidence: s2?.confidence ?? null,
        reasoning: fullReasoning,
        fromCache: s2?.fromCache ?? false,
      });

      await sleepMs(40);
    }

    emitEvent('stage2_complete', { totalProcessed: needsReviewInvoices.length });

    // Build fresh final dataset
    cachedResponse = await executePipeline(prisma);

    emitEvent('pipeline_complete', cachedResponse);
    return cachedResponse;
  } finally {
    pipelineRunning = false;
  }
}

