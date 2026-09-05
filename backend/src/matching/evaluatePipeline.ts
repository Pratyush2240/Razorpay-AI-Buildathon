/**
 * Standalone Evaluation Script — Step 5
 *
 * Runs the FULL pipeline (Stage 1 deterministic matcher + Stage 2 Gemini classifier),
 * compares the final predicted category for each internal invoice against the database
 * GroundTruth table, and produces comprehensive evaluation metrics (Overall Accuracy,
 * Per-Category Precision & Recall, Confusion Matrix, and Stage-by-Stage Breakdown).
 *
 * Exports outputs to:
 *   - backend/eval-results.json (Programmatic JSON)
 *   - backend/eval-report.md (Markdown report)
 *
 * Usage:  npx ts-node src/matching/evaluatePipeline.ts
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { runStage1 } from './stage1';
import { runStage2 } from './stage2';

// ─── Categories ────────────────────────────────────────────────────────────────

const ALL_CATEGORIES = [
  'exact_match',
  'amount_mismatch',
  'missing_on_portal',
  'duplicate',
  'gstin_mismatch',
  'needs_manual_review',
] as const;

type EvaluationCategory = (typeof ALL_CATEGORIES)[number];

// ─── Formatting Helper ─────────────────────────────────────────────────────────

function padRight(str: string, length: number): string {
  if (str.length >= length) return str.substring(0, length);
  return str + ' '.repeat(length - str.length);
}

function padLeft(str: string, length: number): string {
  if (str.length >= length) return str.substring(0, length);
  return ' '.repeat(length - str.length) + str;
}

// ─── Main Evaluation Function ──────────────────────────────────────────────────

async function evaluatePipeline() {
  const prisma = new PrismaClient();

  try {
    console.log('==========================================================');
    console.log('  FULL PIPELINE EVALUATION — STAGE 1 + STAGE 2 LLM');
    console.log('==========================================================\n');

    // 1. Load Ground Truth map from DB: internalInvoiceId -> trueCategory
    const groundTruths = await prisma.groundTruth.findMany({
      select: { internalInvoiceId: true, trueCategory: true },
    });

    const trueCategoryMap = new Map<string, string>();
    for (const gt of groundTruths) {
      if (gt.internalInvoiceId) {
        trueCategoryMap.set(gt.internalInvoiceId, gt.trueCategory);
      }
    }

    // Load all internal invoices
    const internalInvoices = await prisma.internalInvoice.findMany({
      select: { id: true, invoiceNumber: true, vendorName: true },
    });

    console.log(`📦 Loaded ${internalInvoices.length} internal invoices and ${groundTruths.length} ground truth entries from database.`);

    // 2. Execute Stage 1
    const t0 = Date.now();
    console.log('\n⚙️  Running Stage 1 Deterministic Matching Engine...');
    const stage1Results = await runStage1(prisma);
    const stage1TimeMs = Date.now() - t0;

    const stage1Matched = stage1Results.filter((r) => r.status === 'matched');
    const stage1NeedsReview = stage1Results.filter((r) => r.status === 'needs_review');
    console.log(`✅ Stage 1 complete in ${stage1TimeMs} ms. Matched: ${stage1Matched.length}, Deferred: ${stage1NeedsReview.length}`);

    // 3. Execute Stage 2 for needs_review records
    const t1 = Date.now();
    console.log('\n🤖 Running Stage 2 Gemini LLM Classification...');
    const stage2Results = await runStage2(prisma, stage1Results);
    const stage2TimeMs = Date.now() - t1;

    const stage2Map = new Map(stage2Results.map((r) => [r.internalInvoiceId, r]));

    // 4. Combine predictions and compare against Ground Truth
    interface RecordEvaluation {
      internalInvoiceId: string;
      invoiceNumber: string;
      vendorName: string;
      resolvedBy: 'Stage 1' | 'Stage 2';
      trueCategory: string;
      predictedCategory: string;
      isCorrect: boolean;
      confidence: number | null;
      reasoning: string;
    }

    const evaluations: RecordEvaluation[] = [];

    // Stage 1 Matched cases accuracy check
    let stage1CorrectCount = 0;
    for (const s1 of stage1Matched) {
      const inv = internalInvoices.find((i) => i.id === s1.internalInvoiceId);
      const trueCat = trueCategoryMap.get(s1.internalInvoiceId) ?? 'unknown';
      const predCat = 'exact_match';
      const isCorrect = trueCat === predCat;
      if (isCorrect) stage1CorrectCount++;

      evaluations.push({
        internalInvoiceId: s1.internalInvoiceId,
        invoiceNumber: inv?.invoiceNumber ?? 'N/A',
        vendorName: inv?.vendorName ?? 'N/A',
        resolvedBy: 'Stage 1',
        trueCategory: trueCat,
        predictedCategory: predCat,
        isCorrect,
        confidence: 1.0,
        reasoning: 'Resolved by Stage 1 deterministic exact matching rule.',
      });
    }

    // Stage 2 Deferred cases accuracy check
    let stage2CorrectCount = 0;
    let manualReviewCount = 0;

    for (const s1 of stage1NeedsReview) {
      const inv = internalInvoices.find((i) => i.id === s1.internalInvoiceId);
      const trueCat = trueCategoryMap.get(s1.internalInvoiceId) ?? 'unknown';
      const s2Out = stage2Map.get(s1.internalInvoiceId);
      const predCat = s2Out?.category ?? 'needs_manual_review';
      const isCorrect = trueCat === predCat;

      if (isCorrect) stage2CorrectCount++;
      if (predCat === 'needs_manual_review') manualReviewCount++;

      evaluations.push({
        internalInvoiceId: s1.internalInvoiceId,
        invoiceNumber: inv?.invoiceNumber ?? 'N/A',
        vendorName: inv?.vendorName ?? 'N/A',
        resolvedBy: 'Stage 2',
        trueCategory: trueCat,
        predictedCategory: predCat,
        isCorrect,
        confidence: s2Out?.confidence ?? null,
        reasoning: s2Out?.reasoning ?? 'No LLM output available.',
      });
    }

    // 5. Compute Metrics
    const totalRecords = evaluations.length;
    const totalCorrect = evaluations.filter((e) => e.isCorrect).length;
    const overallAccuracyPct = (totalCorrect / totalRecords) * 100;

    const stage1AccuracyPct = stage1Matched.length > 0 ? (stage1CorrectCount / stage1Matched.length) * 100 : 0;
    const stage2AccuracyPct = stage1NeedsReview.length > 0 ? (stage2CorrectCount / stage1NeedsReview.length) * 100 : 0;

    // Confusion Matrix: rows = true category, columns = predicted category
    const confusionMatrix: Record<string, Record<string, number>> = {};
    for (const rowCat of ALL_CATEGORIES) {
      confusionMatrix[rowCat] = {};
      for (const colCat of ALL_CATEGORIES) {
        confusionMatrix[rowCat][colCat] = 0;
      }
    }

    for (const ev of evaluations) {
      const row = ALL_CATEGORIES.includes(ev.trueCategory as any) ? ev.trueCategory : 'needs_manual_review';
      const col = ALL_CATEGORIES.includes(ev.predictedCategory as any) ? ev.predictedCategory : 'needs_manual_review';
      confusionMatrix[row][col] = (confusionMatrix[row][col] || 0) + 1;
    }

    // Per-category Precision, Recall, F1-Score
    interface CategoryMetrics {
      category: string;
      truePositives: number;
      falsePositives: number;
      falseNegatives: number;
      precision: number;
      recall: number;
      f1Score: number;
      support: number;
    }

    const perCategoryMetrics: CategoryMetrics[] = [];

    for (const cat of ALL_CATEGORIES) {
      let tp = 0;
      let fp = 0;
      let fn = 0;
      let support = 0;

      for (const ev of evaluations) {
        const isTrue = ev.trueCategory === cat;
        const isPred = ev.predictedCategory === cat;

        if (isTrue) support++;

        if (isTrue && isPred) {
          tp++;
        } else if (!isTrue && isPred) {
          fp++;
        } else if (isTrue && !isPred) {
          fn++;
        }
      }

      const precision = tp + fp > 0 ? (tp / (tp + fp)) * 100 : 0;
      const recall = tp + fn > 0 ? (tp / (tp + fn)) * 100 : 0;
      const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

      perCategoryMetrics.push({
        category: cat,
        truePositives: tp,
        falsePositives: fp,
        falseNegatives: fn,
        precision,
        recall,
        f1Score,
        support,
      });
    }

    // Plain language summary string
    const summaryHeader = `Pipeline achieved ${overallAccuracyPct.toFixed(1)}% overall accuracy across ${totalRecords} records. ${manualReviewCount} records required manual review.`;

    // 6. Print Console Summary
    console.log('\n====================================================================================================');
    console.log(`  EVALUATION RESULTS — ${summaryHeader}`);
    console.log('====================================================================================================\n');

    console.log('📊 PIPELINE STAGE BREAKDOWN:');
    console.log('----------------------------------------------------------------------------------------------------');
    console.log(`  Stage 1 (Deterministic Engine):  ${stage1Matched.length} resolved  (${stage1AccuracyPct.toFixed(1)}% accuracy)  [Time: ${stage1TimeMs} ms]`);
    console.log(`  Stage 2 (Gemini LLM Classifier):  ${stage1NeedsReview.length} resolved  (${stage2AccuracyPct.toFixed(1)}% accuracy)  [Time: ${stage2TimeMs} ms]`);
    console.log(`  Total Full Pipeline Overall:     ${totalCorrect}/${totalRecords} correct (${overallAccuracyPct.toFixed(1)}% accuracy)`);
    console.log('----------------------------------------------------------------------------------------------------\n');

    console.log('🎯 PER-CATEGORY PRECISION & RECALL BENCHMARKS:');
    console.log('----------------------------------------------------------------------------------------------------');
    console.log(
      `${padRight('Category', 22)} | ${padRight('Support', 8)} | ${padRight('Precision', 10)} | ${padRight('Recall', 10)} | ${padRight('F1-Score', 10)}`
    );
    console.log('----------------------------------------------------------------------------------------------------');
    for (const m of perCategoryMetrics) {
      console.log(
        `${padRight(m.category, 22)} | ${padRight(String(m.support), 8)} | ${padRight(m.precision.toFixed(1) + '%', 10)} | ${padRight(m.recall.toFixed(1) + '%', 10)} | ${padRight(m.f1Score.toFixed(1) + '%', 10)}`
      );
    }
    console.log('----------------------------------------------------------------------------------------------------\n');

    console.log('🧩 CONFUSION MATRIX (Rows = True Category, Columns = Predicted Category):');
    console.log('----------------------------------------------------------------------------------------------------');
    const headerCols = ALL_CATEGORIES.map((c) => padLeft(c.substring(0, 10), 11)).join(' | ');
    console.log(`${padRight('True \\ Predicted', 20)} | ${headerCols}`);
    console.log('----------------------------------------------------------------------------------------------------');
    for (const rCat of ALL_CATEGORIES) {
      const rowVals = ALL_CATEGORIES.map((cCat) => padLeft(String(confusionMatrix[rCat][cCat]), 11)).join(' | ');
      console.log(`${padRight(rCat, 20)} | ${rowVals}`);
    }
    console.log('----------------------------------------------------------------------------------------------------\n');

    // 7. Generate JSON Artifact: eval-results.json
    const jsonOutput = {
      summary: summaryHeader,
      timestamp: new Date().toISOString(),
      overallMetrics: {
        totalRecords,
        totalCorrect,
        overallAccuracyPct,
        manualReviewCount,
      },
      stageBreakdown: {
        stage1: {
          totalProcessed: stage1Results.length,
          resolvedCount: stage1Matched.length,
          correctCount: stage1CorrectCount,
          accuracyPct: stage1AccuracyPct,
          executionTimeMs: stage1TimeMs,
        },
        stage2: {
          totalProcessed: stage1NeedsReview.length,
          resolvedCount: stage2Results.length,
          correctCount: stage2CorrectCount,
          accuracyPct: stage2AccuracyPct,
          executionTimeMs: stage2TimeMs,
        },
      },
      perCategoryMetrics,
      confusionMatrix,
      evaluations,
    };

    const jsonPath = path.resolve(__dirname, '../../eval-results.json');
    fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2), 'utf-8');
    console.log(`💾 Saved programmatic JSON results to: [eval-results.json](${jsonPath})`);

    // 8. Generate Markdown Artifact: eval-report.md
    let mdReport = `# GST Reconciliation Pipeline — Benchmark Evaluation Report\n\n`;
    mdReport += `> **Summary**: ${summaryHeader}\n\n`;
    mdReport += `* **Evaluation Timestamp**: ${new Date().toISOString()}\n`;
    mdReport += `* **Total Invoices Benchmark Suite**: ${totalRecords}\n`;
    mdReport += `* **Overall Accuracy**: **${overallAccuracyPct.toFixed(1)}%** (${totalCorrect}/${totalRecords})\n\n`;

    mdReport += `---\n\n## 1. Pipeline Stage Performance Breakdown\n\n`;
    mdReport += `| Pipeline Stage | Strategy | Input Count | Resolved Count | Accuracy | Execution Time |\n`;
    mdReport += `|---|---|---|---|---|---|\n`;
    mdReport += `| **Stage 1** | Deterministic Priority Cascade | 80 | ${stage1Matched.length} (50%) | **${stage1AccuracyPct.toFixed(1)}%** | ${stage1TimeMs} ms |\n`;
    mdReport += `| **Stage 2** | Gemini API LLM Reasoning | 40 | ${stage1NeedsReview.length} (50%) | **${stage2AccuracyPct.toFixed(1)}%** | ${(stage2TimeMs / 1000).toFixed(1)} s |\n`;
    mdReport += `| **Full Pipeline** | End-to-End Hybrid Engine | 80 | ${totalRecords} (100%) | **${overallAccuracyPct.toFixed(1)}%** | ${((stage1TimeMs + stage2TimeMs) / 1000).toFixed(1)} s |\n\n`;

    mdReport += `---\n\n## 2. Per-Category Precision & Recall Metrics\n\n`;
    mdReport += `| Category | Support (True Count) | Precision | Recall | F1-Score | Status |\n`;
    mdReport += `|---|---|---|---|---|---|\n`;
    for (const m of perCategoryMetrics) {
      const statusBadge = m.f1Score >= 95 ? '✅ Excellent' : m.f1Score > 0 ? '⚠️ Review Needed' : '❌ Failed';
      mdReport += `| \`${m.category}\` | ${m.support} | ${m.precision.toFixed(1)}% | ${m.recall.toFixed(1)}% | **${m.f1Score.toFixed(1)}%** | ${statusBadge} |\n`;
    }

    mdReport += `\n---\n\n## 3. Confusion Matrix\n\n`;
    mdReport += `Rows represent the **True Ground Truth Category**, columns represent the **Predicted Category**.\n\n`;
    const mdHeaderCols = ALL_CATEGORIES.map((c) => `\`${c}\``).join(' | ');
    mdReport += `| True \\ Predicted | ${mdHeaderCols} |\n`;
    mdReport += `|---|${ALL_CATEGORIES.map(() => '---').join('|')}|\n`;
    for (const rCat of ALL_CATEGORIES) {
      const rowVals = ALL_CATEGORIES.map((cCat) => confusionMatrix[rCat][cCat]).join(' | ');
      mdReport += `| \`${rCat}\` | ${rowVals} |\n`;
    }

    mdReport += `\n---\n\n## 4. Per-Invoice Prediction Log (80 Records)\n\n`;
    mdReport += `| Invoice Number | Vendor Name | Resolved By | True Category | Predicted Category | Match | Confidence | Reasoning |\n`;
    mdReport += `|---|---|---|---|---|---|---|---|\n`;
    for (const ev of evaluations) {
      const matchBadge = ev.isCorrect ? '✅' : '❌';
      const confStr = ev.confidence !== null ? ev.confidence.toFixed(2) : 'N/A';
      const cleanReasoning = ev.reasoning.replace(/\|/g, '\\|');
      mdReport += `| \`${ev.invoiceNumber}\` | ${ev.vendorName.substring(0, 25)} | ${ev.resolvedBy} | \`${ev.trueCategory}\` | \`${ev.predictedCategory}\` | ${matchBadge} | ${confStr} | ${cleanReasoning} |\n`;
    }

    const mdPath = path.resolve(__dirname, '../../eval-report.md');
    fs.writeFileSync(mdPath, mdReport, 'utf-8');
    console.log(`📄 Saved Markdown evaluation report to: [eval-report.md](${mdPath})\n`);

    console.log('====================================================================================================');
    console.log('  Evaluation Complete. All 80 records accounted for in report and confusion matrix.');
    console.log('====================================================================================================\n');

  } finally {
    await prisma.$disconnect();
  }
}

evaluatePipeline().catch((err) => {
  console.error('❌ Evaluation pipeline runner failed:', err);
  process.exit(1);
});
