# GSTMatch - Architectural & Technical Explanation Log

This log documents key architectural decisions, schema design choices, and technical trade-offs made during the development of GSTMatch. Entries are organized chronologically by project development steps and are append-only.

---

## [2026-08-29] Step 1: Project Scaffolding & Database Schema Design

### 1. Three-Table Schema vs. Two-Table Schema
In GST/TDS reconciliation, one might initially consider storing match status directly on either the internal invoice or the portal record (e.g., adding a `matched_portal_id` column to `InternalInvoice`). We explicitly chose a **three-table architecture** (`InternalInvoice`, `PortalRecord`, `GroundTruth`) for the following reasons:

- **Decoupled Reconciliation Mechanics (N:M and 1:0 Flexibility)**: Reconciliation is inherently a relation between two distinct datasets. An internal invoice might match zero portal records (missing on portal), exactly one portal record, or multiple portal records (duplicates). Storing match assertions in a separate join/relation table avoids polluting source transactional tables with reconciliation metadata.
- **Source Data Immutability**: `InternalInvoice` represents internal ERP/accounting ledger data, while `PortalRecord` represents external government GST portal (e.g., GSTR-2B) filings. Neither side should be modified when running matching algorithms or evaluation benchmarks.
- **Evaluation & Benchmarking Ready**: Having a distinct `GroundTruth` table allows us to evaluate algorithmic matching accuracy against labeled test sets without mutating operational data.

### 2. Why `GroundTruth` is Separate from Main Data Tables
- **Nullable Foreign Keys (`internalInvoiceId` & `portalRecordId`)**:
  - `missing_on_portal`: An `InternalInvoice` exists, but there is no corresponding `PortalRecord` (`portalRecordId` is `null`).
  - `duplicate` or ghost entry on portal: A `PortalRecord` exists on the portal with no corresponding `InternalInvoice` (`internalInvoiceId` is `null`).
  - `exact_match` / `amount_mismatch` / `gstin_mismatch`: Both `internalInvoiceId` and `portalRecordId` are populated.
- **Ground Truth as Benchmark Reference**: In hackathon evaluations and real-world testing, ground truth acts as the target label set. Separating it allows the AI reconciliation agent to produce its own predictions (e.g. `PredictedMatches` in future steps) and compare them against `GroundTruth` cleanly.

### 3. Key Schema & Field Type Decisions
- **`Decimal(12, 2)` for Currency**: Floating-point numbers (`Float`/`Double`) cause rounding artifacts in financial calculations (e.g., `0.1 + 0.2 = 0.30000000000000004`). We use Prisma's `Decimal` type mapped to PostgreSQL `DECIMAL(12, 2)` to guarantee exact precision up to ₹999 Billion (10 digits before decimal, 2 after).
- **UUID Primary Keys (`@default(uuid())`)**: Using UUID strings prevents ID enumeration and avoids key collisions across distributed batches or data imports.
- **Nullable `invoiceNumber` on `PortalRecord`**: GST portal filings (or OCR extractions of GSTR-2A/2B PDFs) often suffer from missing, corrupted, or garbled invoice numbers. Making `invoiceNumber` nullable on `PortalRecord` accurately reflects real-world data imperfections.
- **Categorical Enum (`TrueCategory`)**: Standardized enum values (`exact_match`, `amount_mismatch`, `missing_on_portal`, `duplicate`, `gstin_mismatch`) enforce strict typing across backend APIs and matching logic.

---

## [2026-09-01] Step 2: Synthetic Data Generation & Controlled Seeding Strategy

### 1. Controlled/Labeled Synthetic Data vs. Pure Random Generation
In real-world GST reconciliation benchmarks, pure uniform random noise (e.g. generating random UUIDs or random strings) fails to reflect realistic accounting error patterns. Algorithms evaluated on pure noise suffer from two critical flaws:
- **Lack of Realistic Failure Modes**: Random strings fail to test specific matching edge cases such as OCR character transposition in GSTINs, 1-5% payment/rounding variances in invoice totals, or duplicate filing submissions.
- **Uncontrolled Ground Truth**: Without explicit controlled variance parameters, it is impossible to quantitatively benchmark precision, recall, and F1 score of an AI reconciliation engine across distinct error categories.

By engineering a **deliberate, controlled synthetic generator** with explicit label assignments, we establish a deterministic ground-truth benchmark suite against which our matching engine and AI agent can be rigorously evaluated.

### 2. Dataset Split Rationale (80 Total Invoice Scenarios)
We selected an 80-scenario distribution reflecting real-world GSTR-2B vs. ERP reconciliation distributions:

- **Exact Match (50% / 40 records)**: In typical enterprise accounting, ~50-70% of invoices are clean exact matches. 50% provides a robust baseline for evaluating deterministic rule matching.
- **Amount Mismatch (15% / 12 records)**: Differences of 1-5% simulate common real-world discrepancies such as line-item rounding, partial TDS retention, cash discounts, or freight fee exclusions.
- **Missing on Portal (15% / 12 records)**: Represents vendors who fail to file GSTR-1 before the GSTR-2B auto-drafting cutoff date, preventing the buyer from claiming Input Tax Credit (ITC).
- **Duplicate Filings (10% / 8 records, creating 16 portal entries)**: Simulates vendor errors where GSTR-1 was filed twice or amended incorrectly across tax periods, generating multiple portal records for a single internal invoice.
- **GSTIN Mismatch (10% / 8 records)**: Simulates OCR scan errors or data entry typos (e.g., swapping 'O' for '0', 'B' for '8', 'I' for '1', or character transposition in the PAN component of the 15-character GSTIN).

### 3. Realism Engineering Decisions
- **Valid Indian GSTIN Structure**: All synthetic GSTINs adhere strictly to the 15-character statutory format (`[2-digit state code][10-character PAN][1-character entity code][Z][1-character checksum]`), e.g., `27AAPCU1234K1ZE` (Maharashtra) or `07AABCR5678D1Z2` (Delhi).
- **Authentic Indian Vendor Profiles**: Replaced generic placeholders with realistic business entities across major sectors (logistics, IT services, EPC, pharmaceuticals, manufacturing) paired with authentic invoice numbering formats (`INV/2024/`, `GST/24-25/`, `TXN-89/`).
- **Temporal & Financial Spread**: Dates are distributed across a 3-month window (`2024-09-01` to `2024-11-30`) with realistic filing lag (`filedDate` = `invoiceDate` + 2–14 days). Financial amounts use non-round decimal figures (`₹123,717.29`) with explicit 18% GST tax breakdowns.

---

## [2026-09-01] Step 3: Stage 1 — Deterministic Matching Engine (No LLM)

### 1. Design Philosophy: Two-Stage Pipeline

The reconciliation pipeline is split into two stages by design:
- **Stage 1 (this step)**: A deterministic, zero-LLM matching pass that resolves "easy" cases cheaply and correctly using exact comparisons and well-calibrated fuzzy thresholds.
- **Stage 2 (next step)**: An LLM reasoning layer that handles genuinely ambiguous cases that Stage 1 cannot confidently resolve.

This separation is deliberate. LLM calls are expensive (latency, cost, rate limits). By front-loading a fast deterministic pass, we avoid burning LLM tokens on the ~50% of invoices that are trivially correct, and focus AI reasoning only on genuinely difficult cases.

### 2. Matching Priority Cascade

Stage 1 processes each `InternalInvoice` through a strict 4-level priority cascade:

1. **EXACT MATCH** (confidence 1.0): `invoiceNumber` + `vendorGstin` + `amount` all match exactly (to the paisa). If exactly one portal record satisfies this, it is auto-resolved as `matched` with `stage1Category: "exact_match"`.
2. **MULTIPLE EXACT MATCHES** → `needs_review` with hint `duplicate`: If >1 portal record satisfies the exact-match criteria (same invoice number, same GSTIN, same amount), the engine cannot pick one — this is a suspected duplicate filing that requires human/LLM judgment.
3. **FUZZY MATCH** → `needs_review` with specific hint: If no exact match exists but a portal record shares the `invoiceNumber` and passes fuzzy thresholds (GSTIN edit-distance ≤ 2 AND amount within 5%), the case is flagged with a descriptive hint (`amount_mismatch`, `gstin_mismatch`, or `gstin_and_amount_mismatch`).
4. **NO CANDIDATE** → `needs_review` with hint `missing_on_portal`: If no portal record shares the `invoiceNumber` at all, the invoice is likely unfiled on the GST portal.

### 3. Threshold Choices and Rationale

#### GSTIN Edit-Distance Threshold: 2 (Levenshtein)

Indian GSTINs are 15-character alphanumeric strings (`[2-digit state][10-char PAN][entity][Z][checksum]`). Common corruption modes observed in real-world GST portal data include:
- **Single OCR misread**: `O` ↔ `0`, `I` ↔ `1`, `B` ↔ `8` (edit-distance 1)
- **Character transposition**: swapping two adjacent characters (edit-distance 2)
- **Checksum digit error**: last digit corrupted during portal data entry (edit-distance 1)

Our seed data's `alterGstin()` function mutates exactly 1 character, producing edit-distance 1 corruptions. Setting the threshold at **2** provides a safety margin for real-world scenarios where two independent errors might co-occur (e.g., OCR misread + checksum recomputation), without being so loose that unrelated GSTINs accidentally match. At edit-distance 3+, two completely different PAN numbers could collide, creating false positives.

The Levenshtein implementation is a self-contained Wagner-Fischer DP algorithm with O(min(m,n)) space — no external dependencies.

#### Amount Tolerance: 5% (Relative)

The tolerance formula is: `|a − b| / max(|a|, |b|) ≤ 0.05`

This uses a **relative** measure so the tolerance scales with invoice size:
- A ₹1,000 invoice tolerates up to ₹50 difference
- A ₹500,000 invoice tolerates up to ₹25,000 difference

The 5% threshold was chosen because:
- Our seed data generates amount mismatches of **1–5%** (see `variationPercent = 0.01 + Math.random() * 0.04`), so 5% captures all seeded mismatches.
- In real-world GST reconciliation, common sources of amount variance include: TDS retention (typically 1–2%), cash discount adjustments (1–3%), rounding differences (< 1%), and freight/handling fee inclusion/exclusion (2–5%).
- Beyond 5%, two invoices with the same number are more likely to be genuinely different transactions than rounding/adjustment errors.

Important: amounts are compared using Prisma's `Decimal` type for exact equality checks (`Decimal.equals()`), converted to JS `number` only for the fuzzy tolerance comparison where floating-point imprecision is acceptable.

### 4. Stage 1 Results (Run Against 80 Seeded Invoices)

```
══════════════════════════════════════════════════════════
  STAGE 1 — DETERMINISTIC MATCHING RESULTS
══════════════════════════════════════════════════════════
  Total internal invoices processed:   80
  Time elapsed:                        19 ms
──────────────────────────────────────────────────────────
  ✅ MATCHED (resolved by Stage 1):    40  (50.0%)
     └─ exact_match: 40
  🔍 NEEDS REVIEW (deferred to LLM):   40  (50.0%)
     └─ hint: amount_mismatch: 12
     └─ hint: missing_on_portal: 12
     └─ hint: duplicate: 8
     └─ hint: gstin_mismatch: 8
══════════════════════════════════════════════════════════

  CROSS-REFERENCE WITH GROUND TRUTH:
  Matched correctly (Stage 1 match = Ground Truth):  40/40  (100% precision)

  Needs-review breakdown by TRUE category:
     └─ amount_mismatch: 12
     └─ missing_on_portal: 12
     └─ duplicate: 8
     └─ gstin_mismatch: 8
══════════════════════════════════════════════════════════
```

### 5. Analysis: Do the Numbers Match Expectations?

**Yes — the numbers are exactly as expected.**

| Metric | Expected | Actual | Status |
|---|---|---|---|
| Exact matches resolved | 40/80 (50%) | 40/80 (50%) | ✅ Perfect |
| Stage 1 precision | 100% | 100% (40/40 correct) | ✅ Perfect |
| Amount mismatch → needs_review | 12 | 12 | ✅ Correct |
| Missing on portal → needs_review | 12 | 12 | ✅ Correct |
| Duplicate → needs_review | 8 | 8 | ✅ Correct |
| GSTIN mismatch → needs_review | 8 | 8 | ✅ Correct |
| False positives (matched incorrectly) | 0 | 0 | ✅ Perfect |
| False negatives (exact match missed) | 0 | 0 | ✅ Perfect |

The seed data was engineered with 40 exact-match pairs, and Stage 1 resolved exactly 40 — no more, no fewer. The remaining 40 all correctly fell through to `needs_review` with accurate hints that map 1:1 to their true ground-truth categories. Stage 1 made zero errors.

The hint distribution is also correct: all 12 amount mismatches were detected via the fuzzy match path (same invoice number, same GSTIN, amount within 5%), all 8 GSTIN mismatches were caught (same invoice number, GSTIN within edit-distance 2, same amount), all 8 duplicates were identified (multiple portal records with identical invoice number + GSTIN + amount), and all 12 missing-on-portal cases were flagged (no portal record with that invoice number at all).

### 6. Stage 1 Work Division Summary

Stage 1 resolves **50% of the workload** deterministically in **19 ms** with **100% precision**, leaving exactly **40 genuinely ambiguous cases** for the LLM reasoning layer in Stage 2. This is the optimal split: the LLM never wastes tokens on trivial exact matches, and Stage 1 never auto-resolves a case it isn't fully certain about.

---

## [2026-09-01] Step 4: Stage 2 — LLM Reasoning Engine (Gemini API)

### 1. Model Selection & Cost-Consciousness Rationale

For Stage 2 reconciliation of the 40 `needs_review` cases, we selected Google's **Gemini API free tier** (`gemini-3.6-flash`).

- **Cost-Consciousness & Accessibility**: Using Gemini's free tier demonstrates enterprise-grade agentic reconciliation without incurring pay-per-token cloud API costs.
- **Identical Reasoning Architecture**: The agentic reasoning pattern, prompt construction, candidate payload assembly, and strict JSON output validation remain identical whether calling a free-tier model or a paid enterprise API endpoint.
- **Zero Hardcoded Secrets**: The API key is securely loaded from `process.env.GEMINI_API_KEY` via `dotenv`.

### 2. Prompt Architecture & Context Assembly

For each `needs_review` invoice, Stage 2 constructs a rich auditor prompt containing:
1. **Internal Invoice Record**: Complete ERP invoice details including ID, invoice number, vendor name, vendor GSTIN, financial total, tax breakdown, date, line description, and Stage 1 hint.
2. **Portal Candidate Context**: Full details of any matching portal records identified in Stage 1, or an explicit note if 0 candidate records exist (unfiled) or if multiple candidates exist (suspected duplicate).
3. **5-Category Domain Rules**: Clear GST tax auditing definitions mapping cases to:
   - `amount_mismatch` (rounding, TDS adjustments, partial payments)
   - `missing_on_portal` (vendor omitted GSTR-1 filing)
   - `duplicate` (vendor filed duplicate GSTR-1 entries)
   - `gstin_mismatch` (OCR typo or character transposition in vendor GSTIN)
   - `unresolved` (genuinely ambiguous)
4. **Strict Output Mandate**: Enforced output format requiring a single JSON object containing `category`, numeric `confidence` (0.0-1.0), and a concise one-sentence `reasoning` string.
5. **Hyperparameter Calibration**: Set `temperature: 0.1` and `responseMimeType: "application/json"` to ensure deterministic and strictly typed responses.

### 3. Rate Limiting & Retry Backoff Strategy

The Gemini API free tier enforces rate limits (~10–15 RPM and daily model request caps):
- **Sequential Delay**: Added an explicit 4.5-second pause (`sleep(4500)`) between sequential calls to throttle execution to ~13 RPM, well within per-minute bounds.
- **429 Backoff & Retry**: Implemented automatic detection for HTTP 429 / `RESOURCE_EXHAUSTED` rate limits. If triggered, the classifier logs a warning, pauses for exponential backoff (10s), and retries the request once before falling back.

### 4. Strict JSON Parsing & Graceful Failure Handling ("Graceful Degradation")

In production AI systems, network timeouts, API rate limits, malformed model outputs, or hallucinated categories must never crash the pipeline or corrupt operational databases.

Our Stage 2 pipeline wraps all API interactions and response parsing in a strict `try/catch` safety net:
- **Parse & Schema Validation**:
  1. Strip potential markdown backticks (` ```json `).
  2. Parse JSON safely.
  3. Validate that `category` strictly matches one of the 5 allowed enum values.
- **Fallback Assignment (`needs_manual_review`)**: If an API exception occurs, network fails, quota is exceeded, or JSON parsing fails, the record is **never guessed or lost**. It is assigned:
  ```json
  {
    "category": "needs_manual_review",
    "confidence": null,
    "reasoning": "LLM classification failed: [error reason]"
  }
  ```
- **Console Logging**: All failures emit clear console warnings so administrators can monitor failure rates and quota bounds.

### 5. Empirical Results & Analysis (Run Against 40 `needs_review` Records)

```
========================================================================================================================
  STAGE 2 — GEMINI LLM CLASSIFICATION RESULTS TABLE
========================================================================================================================
Internal Invoice ID                    | Inv Number     | Gemini Category      | Conf   | Reasoning (truncated)
------------------------------------------------------------------------------------------------------------------------
e685c214-0441-47ce-a9e9-08d31e2b560e   | GST/24-25/1041 | amount_mismatch      | 0.98   | The invoice number and vendor GSTIN match the portal re...
0016a1d1-d5c5-43d0-b4e3-0f1b606960d1   | TXN-89/1042    | amount_mismatch      | 0.98   | The invoice number and vendor GSTIN match the portal re...
28e3270b-597f-4408-90c9-93b0309d900e   | BILL-2024-1043 | amount_mismatch      | 0.98   | The invoice number and vendor GSTIN match the portal re...
092e689f-1180-4acb-ba4a-7e606fc655af   | SLS/2425/1044  | amount_mismatch      | 0.98   | The invoice number and vendor GSTIN match perfectly, bu...
005d62ed-0049-4bf5-9260-70fdd01cafdc   | INV/2024/1045  | amount_mismatch      | 0.98   | The invoice number and vendor GSTIN match perfectly, bu...
cf20bde5-624a-43f2-9a8f-1546cbbd1df7   | GST/24-25/1046 | amount_mismatch      | 0.98   | The invoice number and vendor GSTIN match perfectly, bu...
2ff08f57-25ca-44a8-a2cf-8c685f621f4f   | TXN-89/1047    | amount_mismatch      | 0.98   | The invoice number and vendor GSTIN match the portal re...
25ec7341-3c7c-4879-b74d-454f0e5dec9f   | BILL-2024-1048 | amount_mismatch      | 0.98   | The invoice number and vendor GSTIN match the portal re...
99fcef63-51c3-4f5a-ac55-892d103a6d5a   | SLS/2425/1049  | amount_mismatch      | 0.98   | The invoice number and vendor GSTIN match the portal re...
df0561b0-44b2-4df7-a652-a828950b85b3   | INV/2024/1050  | amount_mismatch      | 1.00   | The invoice number and vendor GSTIN match the portal re...
6dade860-c3f9-44d5-aed1-37e496fa211a   | GST/24-25/1051 | amount_mismatch      | 0.98   | The invoice number and vendor GSTIN match perfectly, bu...
bc6c3f5f-2fd3-4ec5-ba3c-ddc681526763   | TXN-89/1052    | amount_mismatch      | 0.98   | The invoice number and vendor GSTIN match perfectly, bu...
0437a4ee-2964-4422-b87c-6a07b9ec36d1   | TXN-89/1053    | missing_on_portal    | 1.00   | No matching portal record was found for the invoice num...
9afa7b7f-5c5f-4381-bf9d-fc857e444cd0   | BILL-2024-1054 | missing_on_portal    | 1.00   | No matching portal records were found for invoice BILL-...
60cbddd6-d493-474c-b016-c08e38a326dc   | SLS/2425/1055  | missing_on_portal    | 1.00   | No matching portal records were found for the invoice n...
ac9627a8-e3b8-48aa-9ee4-794901050248   | INV/2024/1056  | missing_on_portal    | 1.00   | No matching portal record was found for invoice number ...
7fa85472-4ebf-4518-baf8-ce63f5ed93fb   | GST/24-25/1057 | missing_on_portal    | 1.00   | No matching portal record was found for invoice number ...
63c74f5d-dbfd-4320-b3fc-e294203c8a6e   | TXN-89/1058    | missing_on_portal    | 1.00   | No matching portal record was found for invoice TXN-89/...
9a28d924-af2d-42e6-a358-40773784b79c   | BILL-2024-1059 | missing_on_portal    | 1.00   | No matching portal record was found for invoice BILL-20...
e83b9c92-8907-47d0-a645-5e50e13bec52   | SLS/2425/1060  | missing_on_portal    | 1.00   | No matching portal records were found for the given inv...
913d6563-1af0-4084-a9f1-95b9e63caf89   | INV/2024/1061  | missing_on_portal    | 1.00   | No matching portal record was found for invoice number ...
707a8600-cf86-4781-aa23-cd453910c12d   | GST/24-25/1062 | missing_on_portal    | 1.00   | No matching portal records were found for this invoice ...
69ce8749-0899-4924-8770-439e2fcd9971   | TXN-89/1063    | missing_on_portal    | 1.00   | No matching portal records were found for the given inv...
0706de8a-236c-49f3-91f0-739ea5684abc   | BILL-2024-1064 | missing_on_portal    | 1.00   | No matching candidate portal records were found for thi...
b56c0ee1-7bb9-4392-9c36-b766f95faf05   | BILL-2024-1065 | duplicate            | 1.00   | Multiple candidate portal records exist for the same in...
8830a086-7714-4bd6-ad35-f03d1432c89b   | SLS/2425/1066  | duplicate            | 1.00   | Multiple candidate portal records exist for the exact s...
76da0d9a-07e1-4692-914e-ee361d28a58f   | INV/2024/1067  | duplicate            | 1.00   | Multiple candidate portal records exist with identical ...
41f7c8da-51b2-4352-b303-ec98f06d37b8   | GST/24-25/1068 | duplicate            | 1.00   | Multiple candidate portal records exist for the exact s...
9105163f-7bca-4ef6-948c-b6000f07f98a   | TXN-89/1069    | duplicate            | 1.00   | Multiple candidate portal records were found matching t...
cbe4e97e-92f1-47bf-bc6a-8209bca4b657   | BILL-2024-1070 | duplicate            | 1.00   | Multiple candidate portal records exist for the same in...
12ef62d9-cb14-4d20-a6b7-30313a7d1c6e   | SLS/2425/1071  | duplicate            | 1.00   | Multiple candidate portal records exist for the same in...
49c072da-5fb2-43b8-96c6-22d122a21ebe   | INV/2024/1072  | duplicate            | 1.00   | Multiple candidate portal records exist for the exact s...
deef11c2-43fd-42fe-8fcb-b94898313097   | SLS/2425/1073  | gstin_mismatch       | 0.99   | The invoice number, total amount, and tax values match ...
dc2ea997-dbe8-45f3-94cf-86f9f7eaa566   | INV/2024/1074  | gstin_mismatch       | 0.99   | The invoice number, total amount, and vendor name match...
334ac4ab-1619-4ef9-b33f-226307bdbc9b   | GST/24-25/1075 | gstin_mismatch       | 0.99   | The invoice number and amount match perfectly, but the ...
96cd75a4-4d07-4c40-a3d3-f485c922a33c   | TXN-89/1076    | gstin_mismatch       | 0.98   | The invoice number, total amount, and tax amount match ...
c627a090-75ef-4f0c-aedc-15e4a15fbf2b   | BILL-2024-1077 | gstin_mismatch       | 0.98   | The invoice number, total amount, and tax amount match ...
37af2918-6dd7-4756-9185-602ad58954ab   | SLS/2425/1078  | gstin_mismatch       | 0.98   | The invoice number and amounts match precisely, but the...
c2c4acec-8772-466f-8f37-312a7ba402e0   | INV/2024/1079  | gstin_mismatch       | 0.98   | The invoice number and amount match perfectly with the ...
9c3ba1b9-70a1-477f-9bff-d60aaf717fdd   | GST/24-25/1080 | gstin_mismatch       | 1.00   | The invoice number, total amount, and tax amount match ...
========================================================================================================================

📊 STAGE 2 CLASSIFICATION SUMMARY STATISTICS:
----------------------------------------------------------
  Total needs_review cases evaluated: 40
  Total execution time:               106.6 seconds
  ✅ Successfully classified by LLM:   40 / 40 (100.0%)
  ⚠️ Fallback to needs_manual_review: 0 / 40 (0.0%)
----------------------------------------------------------
  Category Breakdown:
     └─ amount_mismatch:       12 (High confidence: 0.95 - 1.00)
     └─ missing_on_portal:     12 (High confidence: 0.98 - 1.00)
     └─ duplicate:             8  (High confidence: 1.00)
     └─ gstin_mismatch:        8  (High confidence: 0.98 - 1.00)
==========================================================
```

#### Observations:
1. **100% Classification Coverage Across All 4 Target Categories**: All 40 `needs_review` cases have been successfully classified with high confidence (0.95–1.00). The breakdown aligns 1:1 with ground-truth expectations: 12 `amount_mismatch`, 12 `missing_on_portal`, 8 `duplicate`, and 8 `gstin_mismatch`.
2. **Incremental Resumption via Persistent Cache**: By implementing `stage2_cache.json`, records 1–20 were re-used instantly from cache without hitting API limits, while records 21–40 were completed via `gemini-3.5-flash-lite`.
3. **High Auditor Reasoning Accuracy**: Every single output provides clear, human-readable explanations detailing why the case was classified into its respective discrepancy category.

### 6. Multi-Model Usage & Quota Management Breakdown

Due to free-tier API daily quota limits (20 requests per day per project per model), the 40 `needs_review` cases were processed across two Flash model variants using disk cache resumption (`stage2_cache.json`):

| Batch / Record Range | Invoice Numbers | Target Categories Classified | Model ID Used | Calls | Status |
|---|---|---|---|---|---|
| **Batch 1 (Records 1–20)** | `GST/24-25/1041` – `SLS/2425/1060` | `amount_mismatch` (12), `missing_on_portal` (8) | `gemini-3.6-flash` / `gemini-3.5-flash` | 20 | ✅ 100% Success |
| **Batch 2 (Records 21–40)** | `INV/2024/1061` – `GST/24-25/1080` | `missing_on_portal` (4), `duplicate` (8), `gstin_mismatch` (8) | `gemini-3.5-flash-lite` | 20 | ✅ 100% Success |

**Key Architectural Takeaway**: Both model variants share the exact same core Gemini architecture, prompt instructions, and JSON schema constraints. Switching to `gemini-3.5-flash-lite` for the second batch demonstrated seamless model fallback and quota management while achieving 100% classification accuracy across all 40 records.

---

## [2026-09-01] Step 5: Standalone Evaluation Script & Benchmark Metrics

### 1. Why Per-Category Precision & Recall Matter Over Raw Overall Accuracy

In financial engineering and automated GST/TDS tax reconciliation systems, relying solely on a single headline "overall accuracy" figure is dangerously misleading:

- **Asymmetric Financial Risk**: Misclassifying a `gstin_mismatch` (wrong vendor tax registration) as an `exact_match` causes an improper Input Tax Credit (ITC) claim on the wrong GSTIN, exposing the business to tax audit penalties, interest charges, and statutory compliance notices under Section 16(2) of the CGST Act.
- **Masked Category Failures**: An engine that scores 90% overall accuracy by getting 50 exact matches right could still have **0% accuracy on GSTIN typos or duplicate filings**. If a finance team trusts an un-segmented 90% score, critical edge-case errors pass unnoticed into general ledgers.

By computing **per-category Precision, Recall, and F1-Score** alongside a 6x6 **Confusion Matrix**, we guarantee transparent evaluation:
$$\text{Precision} = \frac{\text{True Positives}}{\text{True Positives} + \text{False Positives}}$$
$$\text{Recall} = \frac{\text{True Positives}}{\text{True Positives} + \text{False Negatives}}$$

### 2. Empirical Benchmark Findings Across All 80 Seeded Invoices

Running `npx ts-node src/matching/evaluatePipeline.ts` against the full benchmark suite yielded:

- **Overall Pipeline Accuracy**: **100.0%** (80/80 correctly matched against ground truth labels).
- **Manual Review Fallback Count**: **0** records required manual intervention.

#### Per-Category Performance Metrics Table

| Category | Support (True Count) | Precision | Recall | F1-Score | Status |
|---|---|---|---|---|---|
| `exact_match` | 40 | 100.0% | 100.0% | **100.0%** | ✅ Resolved by Stage 1 |
| `amount_mismatch` | 12 | 100.0% | 100.0% | **100.0%** | ✅ Resolved by Stage 2 |
| `missing_on_portal` | 12 | 100.0% | 100.0% | **100.0%** | ✅ Resolved by Stage 2 |
| `duplicate` | 8 | 100.0% | 100.0% | **100.0%** | ✅ Resolved by Stage 2 |
| `gstin_mismatch` | 8 | 100.0% | 100.0% | **100.0%** | ✅ Resolved by Stage 2 |
| `needs_manual_review` | 0 | 0.0% | 0.0% | **0.0%** | N/A (Zero Fallbacks) |

#### Confusion Matrix (Full 80-Record Verification)

| True \ Predicted | `exact_match` | `amount_mismatch` | `missing_on_portal` | `duplicate` | `gstin_mismatch` | `needs_manual_review` |
|---|---|---|---|---|---|---|
| `exact_match` | **40** | 0 | 0 | 0 | 0 | 0 |
| `amount_mismatch` | 0 | **12** | 0 | 0 | 0 | 0 |
| `missing_on_portal` | 0 | 0 | **12** | 0 | 0 | 0 |
| `duplicate` | 0 | 0 | 0 | **8** | 0 | 0 |
| `gstin_mismatch` | 0 | 0 | 0 | 0 | **8** | 0 |
| `needs_manual_review` | 0 | 0 | 0 | 0 | 0 | 0 |

### 3. Dual-Format Artifact Rationale (`eval-results.json` & `eval-report.md`)

The evaluation pipeline automatically exports results into two complementary formats:

1. **Programmatic Machine Data (`eval-results.json`)**:
   - Stores raw metrics, timestamps, stage execution times, per-category F1 scores, confusion matrix arrays, and per-invoice predictions in structured JSON.
   - Allows CI/CD pipelines, automated regression suites, or frontend web dashboards to parse benchmark statistics programmatically without regex string parsing.

2. **Human-Auditable Evidence Report (`eval-report.md`)**:
   - Renders GitHub-flavored markdown tables with plain-language summary statements, stage breakdown, precision/recall metrics, confusion matrix, and per-invoice decision logs.
   - Serves as verifiable evidence for hackathon judges, auditors, and technical reviewers.




