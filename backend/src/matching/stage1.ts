/**
 * Stage 1 — Deterministic Matching Engine
 *
 * A pure-logic, zero-LLM matching pass that resolves the "easy" reconciliation
 * cases cheaply and correctly. Ambiguous cases are tagged for the LLM stage.
 *
 * Matching priority:
 *   1. EXACT MATCH  — invoiceNumber + vendorGstin + amount (to the paisa)
 *   2. FUZZY MATCH  — invoiceNumber exact + GSTIN edit-dist ≤ 2 + amount within 5%
 *   3. NO CANDIDATE — no portal record shares the invoiceNumber at all
 *   4. MULTIPLE     — >1 portal record matched on invoiceNumber + vendorGstin
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { levenshteinDistance } from './levenshtein';

// ─── Result type ───────────────────────────────────────────────────────────────

export interface Stage1Result {
  internalInvoiceId: string;
  status: 'matched' | 'needs_review';
  matchedPortalRecordId: string | null;
  candidatePortalRecordIds: string[];
  stage1Category: string | null;   // only set when status === 'matched'
  hint: string | null;             // rough guess for needs_review cases
}

// ─── Thresholds ────────────────────────────────────────────────────────────────

/** Maximum Levenshtein edit-distance to still consider a GSTIN a fuzzy match. */
const GSTIN_EDIT_DISTANCE_THRESHOLD = 2;

/** Maximum fractional tolerance for amount comparison (5 % = 0.05). */
const AMOUNT_TOLERANCE_FRACTION = 0.05;

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Compare two Prisma Decimal values for exact equality (to the paisa).
 * Prisma returns `Prisma.Decimal` objects, not JS numbers.
 */
function decimalsEqual(a: Prisma.Decimal, b: Prisma.Decimal): boolean {
  return a.equals(b);
}

/**
 * Check whether two Decimal amounts are within `tolerance` fraction of
 * each other:  |a − b| / max(|a|, |b|) ≤ tolerance
 *
 * Uses the *relative* measure so the tolerance scales with invoice size.
 */
function amountsWithinTolerance(
  a: Prisma.Decimal,
  b: Prisma.Decimal,
  tolerance: number
): boolean {
  const aNum = a.toNumber();
  const bNum = b.toNumber();
  const denom = Math.max(Math.abs(aNum), Math.abs(bNum));
  if (denom === 0) return true; // both zero → match
  return Math.abs(aNum - bNum) / denom <= tolerance;
}

// ─── Types for internal intermediate state ─────────────────────────────────────

interface InternalInvoice {
  id: string;
  invoiceNumber: string;
  vendorGstin: string;
  amount: Prisma.Decimal;
}

interface PortalRecord {
  id: string;
  invoiceNumber: string | null;
  vendorGstin: string;
  amount: Prisma.Decimal;
}

// ─── Core engine ───────────────────────────────────────────────────────────────

export async function runStage1(prisma: PrismaClient): Promise<Stage1Result[]> {
  // 1. Load all data into memory (80 invoices — trivially fits)
  const internals: InternalInvoice[] = await prisma.internalInvoice.findMany({
    select: { id: true, invoiceNumber: true, vendorGstin: true, amount: true },
  });

  const portals: PortalRecord[] = await prisma.portalRecord.findMany({
    select: { id: true, invoiceNumber: true, vendorGstin: true, amount: true },
  });

  // 2. Build lookup: invoiceNumber → PortalRecord[]
  const portalByInvoiceNum = new Map<string, PortalRecord[]>();
  for (const p of portals) {
    if (p.invoiceNumber === null) continue; // skip portal records without an invoice number
    const key = p.invoiceNumber;
    const list = portalByInvoiceNum.get(key);
    if (list) {
      list.push(p);
    } else {
      portalByInvoiceNum.set(key, [p]);
    }
  }

  const results: Stage1Result[] = [];

  for (const inv of internals) {
    const candidates = portalByInvoiceNum.get(inv.invoiceNumber);

    // ── Priority 3: No candidate found ──────────────────────────────────
    if (!candidates || candidates.length === 0) {
      results.push({
        internalInvoiceId: inv.id,
        status: 'needs_review',
        matchedPortalRecordId: null,
        candidatePortalRecordIds: [],
        stage1Category: null,
        hint: 'missing_on_portal',
      });
      continue;
    }

    // ── Priority 1: Exact match ─────────────────────────────────────────
    // Find portal records with exact invoiceNumber + exact vendorGstin + exact amount
    const exactMatches = candidates.filter(
      (p) =>
        p.vendorGstin === inv.vendorGstin &&
        decimalsEqual(p.amount, inv.amount)
    );

    if (exactMatches.length === 1) {
      results.push({
        internalInvoiceId: inv.id,
        status: 'matched',
        matchedPortalRecordId: exactMatches[0].id,
        candidatePortalRecordIds: [exactMatches[0].id],
        stage1Category: 'exact_match',
        hint: null,
      });
      continue;
    }

    // ── Priority 4: Multiple exact matches → duplicate ──────────────────
    if (exactMatches.length > 1) {
      results.push({
        internalInvoiceId: inv.id,
        status: 'needs_review',
        matchedPortalRecordId: null,
        candidatePortalRecordIds: exactMatches.map((p) => p.id),
        stage1Category: null,
        hint: 'duplicate',
      });
      continue;
    }

    // ── Priority 2: Fuzzy match ─────────────────────────────────────────
    // exactMatches.length === 0 here.
    // Check all candidates sharing the invoiceNumber for fuzzy GSTIN + amount.
    const fuzzyMatches = candidates.filter((p) => {
      const gstinDist = levenshteinDistance(inv.vendorGstin, p.vendorGstin);
      const amountClose = amountsWithinTolerance(
        inv.amount,
        p.amount,
        AMOUNT_TOLERANCE_FRACTION
      );
      return gstinDist <= GSTIN_EDIT_DISTANCE_THRESHOLD && amountClose;
    });

    if (fuzzyMatches.length > 0) {
      // Determine a more specific hint based on what diverged
      let hint = 'fuzzy_match';
      if (fuzzyMatches.length === 1) {
        const p = fuzzyMatches[0];
        const gstinDiff = p.vendorGstin !== inv.vendorGstin;
        const amountDiff = !decimalsEqual(p.amount, inv.amount);
        if (gstinDiff && amountDiff) {
          hint = 'gstin_and_amount_mismatch';
        } else if (gstinDiff) {
          hint = 'gstin_mismatch';
        } else if (amountDiff) {
          hint = 'amount_mismatch';
        }
      }

      results.push({
        internalInvoiceId: inv.id,
        status: 'needs_review',
        matchedPortalRecordId: null,
        candidatePortalRecordIds: fuzzyMatches.map((p) => p.id),
        stage1Category: null,
        hint,
      });
      continue;
    }

    // ── Fallback: invoice number matched but nothing else aligned ───────
    results.push({
      internalInvoiceId: inv.id,
      status: 'needs_review',
      matchedPortalRecordId: null,
      candidatePortalRecordIds: candidates.map((p) => p.id),
      stage1Category: null,
      hint: 'invoice_number_only_match',
    });
  }

  return results;
}
