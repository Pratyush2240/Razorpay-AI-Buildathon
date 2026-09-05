/**
 * Stage 2 — LLM Reasoning Engine (Gemini API)
 *
 * Calls the Gemini API (`gemini-3.5-flash-lite`) for `needs_review` cases from Stage 1.
 * Supports disk caching to allow incremental resumption without re-processing
 * previously classified records or burning unnecessary API quota.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { Stage1Result } from './stage1';

// ─── Allowed Categories ────────────────────────────────────────────────────────

export type Stage2Category =
  | 'amount_mismatch'
  | 'missing_on_portal'
  | 'duplicate'
  | 'gstin_mismatch'
  | 'unresolved';

export type Stage2ResultCategory = Stage2Category | 'needs_manual_review';

export interface Stage2Output {
  internalInvoiceId: string;
  category: Stage2ResultCategory;
  confidence: number | null;
  reasoning: string;
  fromCache?: boolean;
}

const ALLOWED_CATEGORIES: Set<string> = new Set([
  'amount_mismatch',
  'missing_on_portal',
  'duplicate',
  'gstin_mismatch',
  'unresolved',
]);

const CACHE_FILE_PATH = path.resolve(__dirname, 'stage2_cache.json');

// ─── Helper functions ──────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadCache(): Record<string, Stage2Output> {
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      const raw = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('⚠️ Could not load Stage 2 cache, starting fresh:', err);
  }
  return {};
}

function saveCache(cache: Record<string, Stage2Output>): void {
  try {
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (err) {
    console.warn('⚠️ Could not save Stage 2 cache:', err);
  }
}

// ─── Core Classifier ───────────────────────────────────────────────────────────

export async function classifyWithGemini(
  genAI: GoogleGenerativeAI,
  modelName: string,
  internalInvoice: any,
  candidates: any[],
  stage1Hint: string | null,
  retryCount: number = 0
): Promise<Omit<Stage2Output, 'internalInvoiceId'>> {
  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const candidateContext =
      candidates.length === 0
        ? 'No matching portal records were found sharing this invoice number on the portal.'
        : candidates.length === 1
        ? `1 candidate portal record found:\n` +
          `- ID: ${candidates[0].id}\n` +
          `- Invoice Number: ${candidates[0].invoiceNumber}\n` +
          `- Vendor Name: ${candidates[0].vendorName}\n` +
          `- Vendor GSTIN: ${candidates[0].vendorGstin}\n` +
          `- Amount: ₹${candidates[0].amount} (Tax: ₹${candidates[0].taxAmount})\n` +
          `- Filed Date: ${candidates[0].filedDate?.toISOString().split('T')[0] ?? 'N/A'}`
        : `${candidates.length} candidate portal records found:\n` +
          candidates
            .map(
              (c, idx) =>
                `  Candidate ${idx + 1}:\n` +
                `  - ID: ${c.id}\n` +
                `  - Invoice Number: ${c.invoiceNumber}\n` +
                `  - Vendor Name: ${c.vendorName}\n` +
                `  - Vendor GSTIN: ${c.vendorGstin}\n` +
                `  - Amount: ₹${c.amount} (Tax: ₹${c.taxAmount})\n` +
                `  - Filed Date: ${c.filedDate?.toISOString().split('T')[0] ?? 'N/A'}`
            )
            .join('\n');

    const prompt = `You are an expert Indian GST & Tax Compliance Auditor.
Your task is to analyze an Internal Invoice against GSTR-2B Portal Records and classify the reconciliation outcome.

--- INTERNAL INVOICE DETAILS ---
- ID: ${internalInvoice.id}
- Invoice Number: ${internalInvoice.invoiceNumber}
- Vendor Name: ${internalInvoice.vendorName}
- Vendor GSTIN: ${internalInvoice.vendorGstin}
- Amount: ₹${internalInvoice.amount} (Tax: ₹${internalInvoice.taxAmount})
- Date: ${internalInvoice.invoiceDate?.toISOString().split('T')[0] ?? 'N/A'}
- Description: ${internalInvoice.description}
- Stage 1 Hint: ${stage1Hint ?? 'None'}

--- PORTAL RECORD CANDIDATES ---
${candidateContext}

--- CLASSIFICATION RULES ---
Classify into EXACTLY ONE of these 5 categories:
1. "amount_mismatch": Invoice number matches or aligns with candidate, vendor GSTIN is identical or close, but total amount differs (e.g. rounding, TDS adjustment, discount variance).
2. "missing_on_portal": No matching candidate portal record exists or vendor failed to file GSTR-1 for this invoice.
3. "duplicate": Multiple candidate portal records exist for this invoice number/vendor (vendor filed GSTR-1 multiple times or duplicate entries were filed).
4. "gstin_mismatch": Invoice number matches or aligns with candidate, amount matches or is close, but vendor GSTIN differs (e.g. OCR typo, character transposition in GSTIN).
5. "unresolved": The record does not fit any of the above categories cleanly or remains genuinely ambiguous.

--- OUTPUT FORMAT ---
Respond ONLY with a valid JSON object. Do not include markdown code block backticks, extra commentary, or conversational filler.
Strict JSON shape required:
{
  "category": "amount_mismatch" | "missing_on_portal" | "duplicate" | "gstin_mismatch" | "unresolved",
  "confidence": <number between 0.0 and 1.0>,
  "reasoning": "<one concise sentence explaining the exact reason for this classification>"
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();

    let parsed: any;
    try {
      const cleanedText = responseText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
      parsed = JSON.parse(cleanedText);
    } catch (parseErr) {
      console.warn(`\n⚠️  [LLM JSON Parse Error] raw response: "${responseText.substring(0, 100)}..."`);
      return {
        category: 'needs_manual_review',
        confidence: null,
        reasoning: `LLM classification failed: Invalid JSON returned by model (${parseErr instanceof Error ? parseErr.message : String(parseErr)})`,
      };
    }

    if (!parsed || typeof parsed !== 'object') {
      return {
        category: 'needs_manual_review',
        confidence: null,
        reasoning: 'LLM classification failed: Response parsed but is not a valid JSON object',
      };
    }

    if (!ALLOWED_CATEGORIES.has(parsed.category)) {
      console.warn(`\n⚠️  [LLM Invalid Category] Returned: "${parsed.category}"`);
      return {
        category: 'needs_manual_review',
        confidence: null,
        reasoning: `LLM classification failed: Category '${parsed.category}' is not one of the allowed values`,
      };
    }

    const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.95;
    const reasoning = typeof parsed.reasoning === 'string' && parsed.reasoning.length > 0
      ? parsed.reasoning
      : 'Classification derived from LLM prompt context analysis.';

    return {
      category: parsed.category as Stage2Category,
      confidence,
      reasoning,
    };
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const isRateLimit = errorMsg.includes('429') || errorMsg.toLowerCase().includes('resource_exhausted') || errorMsg.toLowerCase().includes('rate limit');

    if (isRateLimit && retryCount < 1) {
      console.warn(`\n⏳ [429 Rate Limit Hit] Pausing 10s before retry (Attempt ${retryCount + 1})...`);
      await sleep(10000);
      return classifyWithGemini(genAI, modelName, internalInvoice, candidates, stage1Hint, retryCount + 1);
    }

    console.warn(`\n⚠️  [Gemini API Error] Invoice ID ${internalInvoice.id}: ${errorMsg}`);
    return {
      category: 'needs_manual_review',
      confidence: null,
      reasoning: `LLM classification failed: ${errorMsg}`,
    };
  }
}

// ─── Main Stage 2 Execution Function ───────────────────────────────────────────

export async function runStage2(
  prisma: PrismaClient,
  stage1Results: Stage1Result[]
): Promise<Stage2Output[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing in process.env');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const MODEL_NAME = 'gemini-3.5-flash-lite';

  const needsReviewList = stage1Results.filter((r) => r.status === 'needs_review');
  const cache = loadCache();

  console.log(`\n🤖 Starting Stage 2 Gemini API classification for ${needsReviewList.length} records...`);
  console.log(`ℹ️  Model: ${MODEL_NAME} | Disk Cache: ${Object.keys(cache).length} cached entries available\n`);

  const internalIds = needsReviewList.map((r) => r.internalInvoiceId);
  const internalInvoices = await prisma.internalInvoice.findMany({
    where: { id: { in: internalIds } },
  });
  const internalMap = new Map(internalInvoices.map((inv) => [inv.id, inv]));

  const candidateIds = Array.from(
    new Set(needsReviewList.flatMap((r) => r.candidatePortalRecordIds))
  );
  const portalRecords = await prisma.portalRecord.findMany({
    where: { id: { in: candidateIds } },
  });
  const portalMap = new Map(portalRecords.map((p) => [p.id, p]));

  const stage2Results: Stage2Output[] = [];
  let apiCallMadeCount = 0;

  for (let i = 0; i < needsReviewList.length; i++) {
    const item = needsReviewList[i];
    const internalInvoice = internalMap.get(item.internalInvoiceId);

    if (!internalInvoice) {
      stage2Results.push({
        internalInvoiceId: item.internalInvoiceId,
        category: 'needs_manual_review',
        confidence: null,
        reasoning: 'LLM classification failed: Internal invoice record not found in database',
      });
      continue;
    }

    // Check disk cache for previously successful classification
    const cachedEntry = cache[item.internalInvoiceId];
    if (cachedEntry && cachedEntry.category !== 'needs_manual_review') {
      console.log(` ⚡ [Cache Hit] ${i + 1}/${needsReviewList.length} - ${internalInvoice.invoiceNumber}: ${cachedEntry.category}`);
      stage2Results.push({
        ...cachedEntry,
        fromCache: true,
      });
      continue;
    }

    const candidates = item.candidatePortalRecordIds
      .map((id) => portalMap.get(id))
      .filter(Boolean);

    console.log(` 🌐 [API Call] ${i + 1}/${needsReviewList.length} - Classifying ${internalInvoice.invoiceNumber}...`);

    const result = await classifyWithGemini(
      genAI,
      MODEL_NAME,
      internalInvoice,
      candidates,
      item.hint
    );

    const output: Stage2Output = {
      internalInvoiceId: item.internalInvoiceId,
      ...result,
      fromCache: false,
    };

    stage2Results.push(output);

    // Save to cache if classification succeeded
    if (output.category !== 'needs_manual_review') {
      cache[item.internalInvoiceId] = output;
      saveCache(cache);
    }

    apiCallMadeCount++;

    // Pause 4.5 seconds between API calls to stay within free tier RPM limits
    if (i < needsReviewList.length - 1) {
      await sleep(4500);
    }
  }

  console.log(`\n✅ Stage 2 processing completed for ${needsReviewList.length} records (${apiCallMadeCount} new API calls made).`);
  return stage2Results;
}
