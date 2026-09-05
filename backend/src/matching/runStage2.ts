/**
 * Stage 2 Runner — Execute Stage 1 matching engine, extract the 40 needs_review cases,
 * run Stage 2 Gemini API classification, and print detailed results table and summary.
 *
 * Usage:  npx ts-node src/matching/runStage2.ts
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { runStage1 } from './stage1';
import { runStage2, Stage2Output } from './stage2';

function padRight(str: string, length: number): string {
  if (str.length >= length) return str.substring(0, length);
  return str + ' '.repeat(length - str.length);
}

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log('==========================================================');
    console.log('  STAGE 1 & 2 PIPELINE — Deterministic + Gemini LLM');
    console.log('==========================================================\n');

    // ── 1. Run Stage 1 ──────────────────────────────────────────────────
    console.log('⚙️  Executing Stage 1 Deterministic Engine...');
    const stage1Results = await runStage1(prisma);

    const matchedCount = stage1Results.filter((r) => r.status === 'matched').length;
    const needsReviewList = stage1Results.filter((r) => r.status === 'needs_review');

    console.log(`✅ Stage 1 complete. Matched: ${matchedCount}, Deferred to LLM: ${needsReviewList.length}\n`);

    if (needsReviewList.length === 0) {
      console.log('No records require Stage 2 review.');
      return;
    }

    // ── 2. Run Stage 2 ──────────────────────────────────────────────────
    const startTime = Date.now();
    const stage2Results: Stage2Output[] = await runStage2(prisma, stage1Results);
    const totalTimeSec = ((Date.now() - startTime) / 1000).toFixed(1);

    // Fetch invoice numbers for clear display in table
    const internalInvoices = await prisma.internalInvoice.findMany({
      where: { id: { in: stage2Results.map((r) => r.internalInvoiceId) } },
      select: { id: true, invoiceNumber: true },
    });
    const invNumMap = new Map(internalInvoices.map((inv) => [inv.id, inv.invoiceNumber]));

    // ── 3. Print Results Table ──────────────────────────────────────────
    console.log('\n========================================================================================================================');
    console.log('  STAGE 2 — GEMINI LLM CLASSIFICATION RESULTS TABLE');
    console.log('========================================================================================================================');
    console.log(
      `${padRight('Internal Invoice ID', 38)} | ${padRight('Inv Number', 14)} | ${padRight('Gemini Category', 20)} | ${padRight('Conf', 6)} | Reasoning (truncated)`
    );
    console.log('------------------------------------------------------------------------------------------------------------------------');

    for (const res of stage2Results) {
      const invNum = invNumMap.get(res.internalInvoiceId) ?? 'N/A';
      const categoryStr = res.category;
      const confStr = res.confidence !== null ? res.confidence.toFixed(2) : 'N/A';
      const truncatedReasoning =
        res.reasoning.length > 58 ? res.reasoning.substring(0, 55) + '...' : res.reasoning;

      console.log(
        `${padRight(res.internalInvoiceId, 38)} | ${padRight(invNum, 14)} | ${padRight(categoryStr, 20)} | ${padRight(confStr, 6)} | ${truncatedReasoning}`
      );
    }
    console.log('========================================================================================================================\n');

    // ── 4. Calculate Summary Statistics ──────────────────────────────────
    const successfulCount = stage2Results.filter((r) => r.category !== 'needs_manual_review').length;
    const fallbackCount = stage2Results.filter((r) => r.category === 'needs_manual_review').length;

    const categoryBreakdown: Record<string, number> = {};
    for (const r of stage2Results) {
      categoryBreakdown[r.category] = (categoryBreakdown[r.category] || 0) + 1;
    }

    console.log('📊 STAGE 2 CLASSIFICATION SUMMARY STATISTICS:');
    console.log('----------------------------------------------------------');
    console.log(`  Total needs_review cases evaluated: ${stage2Results.length}`);
    console.log(`  Total execution time:               ${totalTimeSec} seconds`);
    console.log(`  ✅ Successfully classified by LLM:   ${successfulCount} / ${stage2Results.length} (${((successfulCount / stage2Results.length) * 100).toFixed(1)}%)`);
    console.log(`  ⚠️ Fallback to needs_manual_review: ${fallbackCount} / ${stage2Results.length} (${((fallbackCount / stage2Results.length) * 100).toFixed(1)}%)`);
    console.log('----------------------------------------------------------');
    console.log('  Category Breakdown:');
    for (const [cat, cnt] of Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1])) {
      console.log(`     └─ ${padRight(cat + ':', 22)} ${cnt}`);
    }
    console.log('==========================================================\n');

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌ Stage 2 runner failed:', err);
  process.exit(1);
});
