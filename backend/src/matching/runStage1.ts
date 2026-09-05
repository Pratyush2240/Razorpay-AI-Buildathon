/**
 * Stage 1 Runner — Execute the deterministic matching engine against the
 * seeded database and print a summary of results.
 *
 * Usage:  npx ts-node src/matching/runStage1.ts
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { runStage1, Stage1Result } from './stage1';

async function main() {
  const prisma = new PrismaClient();

  try {
    // ── Verify we have data ──────────────────────────────────────────────
    const internalCount = await prisma.internalInvoice.count();
    const portalCount = await prisma.portalRecord.count();
    console.log(`\n📦 Database contains: ${internalCount} internal invoices, ${portalCount} portal records\n`);

    if (internalCount === 0) {
      console.error('❌ No internal invoices found. Run `npm run seed` first.');
      process.exit(1);
    }

    // ── Run Stage 1 ─────────────────────────────────────────────────────
    console.log('⚙️  Running Stage 1 deterministic matching engine...\n');
    const t0 = Date.now();
    const results = await runStage1(prisma);
    const elapsed = Date.now() - t0;

    // ── Categorize results ──────────────────────────────────────────────
    const matched = results.filter((r) => r.status === 'matched');
    const needsReview = results.filter((r) => r.status === 'needs_review');

    // Sub-categorize needs_review by hint
    const hintCounts: Record<string, number> = {};
    for (const r of needsReview) {
      const h = r.hint ?? 'unknown';
      hintCounts[h] = (hintCounts[h] || 0) + 1;
    }

    // Sub-categorize matched by stage1Category
    const categoryCounts: Record<string, number> = {};
    for (const r of matched) {
      const c = r.stage1Category ?? 'unknown';
      categoryCounts[c] = (categoryCounts[c] || 0) + 1;
    }

    // ── Print summary ───────────────────────────────────────────────────
    console.log('══════════════════════════════════════════════════════════');
    console.log('  STAGE 1 — DETERMINISTIC MATCHING RESULTS');
    console.log('══════════════════════════════════════════════════════════');
    console.log(`  Total internal invoices processed:   ${results.length}`);
    console.log(`  Time elapsed:                        ${elapsed} ms`);
    console.log('──────────────────────────────────────────────────────────');
    console.log(`  ✅ MATCHED (resolved by Stage 1):    ${matched.length}  (${((matched.length / results.length) * 100).toFixed(1)}%)`);
    for (const [cat, count] of Object.entries(categoryCounts)) {
      console.log(`     └─ ${cat}: ${count}`);
    }
    console.log(`  🔍 NEEDS REVIEW (deferred to LLM):   ${needsReview.length}  (${((needsReview.length / results.length) * 100).toFixed(1)}%)`);
    for (const [hint, count] of Object.entries(hintCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`     └─ hint: ${hint}: ${count}`);
    }
    console.log('══════════════════════════════════════════════════════════');

    // ── Cross-reference with ground truth for validation ────────────────
    console.log('\n📊 CROSS-REFERENCE WITH GROUND TRUTH:');
    console.log('──────────────────────────────────────────────────────────');

    // Load ground truth keyed by internalInvoiceId
    const groundTruths = await prisma.groundTruth.findMany({
      include: { internalInvoice: true, portalRecord: true },
    });

    // Build a map: internalInvoiceId → GroundTruth[]
    const gtByInternal = new Map<string, typeof groundTruths>();
    for (const gt of groundTruths) {
      if (!gt.internalInvoiceId) continue;
      const list = gtByInternal.get(gt.internalInvoiceId);
      if (list) {
        list.push(gt);
      } else {
        gtByInternal.set(gt.internalInvoiceId, [gt]);
      }
    }

    // For matched results: check if the matched portal record ID matches ground truth
    let correctMatches = 0;
    let incorrectMatches = 0;
    for (const r of matched) {
      const gts = gtByInternal.get(r.internalInvoiceId);
      if (!gts) {
        incorrectMatches++;
        continue;
      }
      const gtPortalIds = gts.map((g) => g.portalRecordId).filter(Boolean);
      if (r.matchedPortalRecordId && gtPortalIds.includes(r.matchedPortalRecordId)) {
        correctMatches++;
      } else {
        incorrectMatches++;
      }
    }

    // For needs_review: tally by true category
    const reviewByTrueCategory: Record<string, number> = {};
    for (const r of needsReview) {
      const gts = gtByInternal.get(r.internalInvoiceId);
      if (!gts) {
        reviewByTrueCategory['no_ground_truth'] = (reviewByTrueCategory['no_ground_truth'] || 0) + 1;
        continue;
      }
      const trueCat = gts[0].trueCategory;
      reviewByTrueCategory[trueCat] = (reviewByTrueCategory[trueCat] || 0) + 1;
    }

    console.log(`  Matched correctly (Stage 1 match = Ground Truth):  ${correctMatches}/${matched.length}`);
    if (incorrectMatches > 0) {
      console.log(`  ⚠️  Matched INCORRECTLY:                            ${incorrectMatches}/${matched.length}`);
    }
    console.log(`\n  Needs-review breakdown by TRUE category:`);
    for (const [cat, count] of Object.entries(reviewByTrueCategory).sort((a, b) => b[1] - a[1])) {
      console.log(`     └─ ${cat}: ${count}`);
    }

    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  Stage 1 complete. Ambiguous cases ready for LLM Stage 2.');
    console.log('══════════════════════════════════════════════════════════\n');

    // ── Detailed per-invoice output (first 5 of each status) ────────────
    console.log('📋 SAMPLE RESULTS (first 5 matched, first 5 needs_review):');
    console.log('──────────────────────────────────────────────────────────');

    // Fetch invoice details for display
    const allInvoices = await prisma.internalInvoice.findMany({
      select: { id: true, invoiceNumber: true, vendorGstin: true, vendorName: true, amount: true },
    });
    const invoiceMap = new Map(allInvoices.map((i) => [i.id, i]));

    for (const r of matched.slice(0, 5)) {
      const inv = invoiceMap.get(r.internalInvoiceId);
      console.log(`  ✅ ${inv?.invoiceNumber} | ${inv?.vendorName?.substring(0, 30)} | ₹${inv?.amount} → matched (${r.stage1Category})`);
    }
    console.log('');
    for (const r of needsReview.slice(0, 5)) {
      const inv = invoiceMap.get(r.internalInvoiceId);
      console.log(`  🔍 ${inv?.invoiceNumber} | ${inv?.vendorName?.substring(0, 30)} | ₹${inv?.amount} → needs_review (hint: ${r.hint}) [${r.candidatePortalRecordIds.length} candidates]`);
    }
    console.log('');

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('❌ Stage 1 runner failed:', e);
  process.exit(1);
});
