# GSTMatch: Enterprise AI-Powered GST Reconciliation Engine

GSTMatch is an enterprise-grade automated GST (Goods and Services Tax) reconciliation platform designed for corporate finance and tax audit teams. It reconciles internal ERP sales/purchase ledgers (`InternalInvoice`) against government portal filings (`PortalRecord`, e.g., GSTR-2B) to maximize Input Tax Credit (ITC) compliance, detect vendor filing discrepancies, and eliminate audit penalties.

The system utilizes a hybrid two-stage architecture: front-loading deterministic rule-matching for high-throughput zero-cost resolution, followed by an AI agentic reasoning layer powered by Google Gemini for resolving complex financial discrepancies.

---

## Executive Summary & Performance Highlights

* **Overall Benchmark Accuracy**: 100.0% across 80 controlled test scenarios.
* **Manual Review Fallback Rate**: 0.0% (zero manual interventions required).
* **Deterministic Stage Speed**: ~19 ms execution time for 50% of total invoice volume.
* **Async Bulk Job Queue**: BullMQ & Redis worker queue with in-memory fallback for high-volume dataset processing (50,000+ invoices).
* **Real-Time Telemetry**: Server-Sent Events (SSE) streaming live job progress percentages to the frontend.
* **Discrepancy Coverage**: Full resolution across 5 distinct categories (`exact_match`, `amount_mismatch`, `missing_on_portal`, `duplicate`, `gstin_mismatch`).
* **Evaluation Output**: Automatic export of machine-readable `eval-results.json` and human-auditable `eval-report.md`.

---

## System Architecture

GSTMatch employs a decoupled, modular architecture designed for high throughput, data immutability, and statutory audit compliance.

```mermaid
flowchart TD
    A[Internal ERP Ledgers] --> C[Stage 1: Deterministic Engine]
    B[GSTR-2B Portal Records] --> C
    
    C -->|Exact Match: Invoice No + GSTIN + Amount| D[Resolved: Exact Match]
    C -->|Ambiguous Cases / Discrepancy Detected| E[Stage 2: Gemini LLM Engine]
    
    E -->|Context & Candidate Payload| F[Gemini Flash Auditor Model]
    F -->|JSON Output Validation| G[Classification & Reasoning]
    
    G --> H[Amount Mismatch]
    G --> I[Missing on Portal]
    G --> J[Duplicate Filing]
    G --> K[GSTIN Mismatch]
    G -->|API Exception / Quota Limit| L[Fallback: Needs Manual Review]
    
    D --> M[PostgreSQL / Prisma Database]
    H --> M
    I --> M
    J --> M
    K --> M
    L --> M
    
    M --> N[Express REST API]
    N --> O[React & Tailwind Analytics Dashboard]
```

### Three-Table Database Schema Design

Reconciliation mechanics are isolated from transactional source data using a three-table architecture (`InternalInvoice`, `PortalRecord`, `GroundTruth`):

1. **`InternalInvoice`**: Immutably records ERP ledger data (invoice number, vendor name, vendor GSTIN, invoice date, subtotal, tax amount, total amount).
2. **`PortalRecord`**: Stores tax portal filings (GSTR-2B) as reported by vendors (supports nullable invoice numbers for corrupted portal filings).
3. **`GroundTruth`**: Acts as a benchmark reference set mapping `internalInvoiceId` and `portalRecordId` with explicit discrepancy categories to evaluate model accuracy without mutating operational data.

---

## Two-Stage Reconciliation Pipeline

### Stage 1: Deterministic Matching Engine (Zero LLM Cost)

Stage 1 runs a strict 4-level priority cascade before invoking AI models, ensuring high efficiency and zero LLM token consumption on clear records:

1. **Level 1 (Exact Match)**: Matches `invoiceNumber` + `vendorGstin` + `totalAmount` to the exact paisa (`Decimal(12,2)`). Auto-resolves as `exact_match` (confidence 1.0).
2. **Level 2 (Multiple Exact Matches)**: Detects >1 identical portal record sharing the invoice number, GSTIN, and amount. Defers to Stage 2 with a `duplicate` hint.
3. **Level 3 (Fuzzy Match Detection)**: Evaluates candidate records sharing the invoice number against strict thresholds:
   * **GSTIN Edit-Distance Threshold**: Levenshtein edit-distance <= 2 (handles single OCR character transpositions and checksum errors).
   * **Amount Relative Tolerance**: Relative variance <= 5% (`|a - b| / max(|a|, |b|) <= 0.05`), capturing TDS deductions, rounding differences, and partial cash discounts.
   * Passes record to Stage 2 with specific hints (`amount_mismatch`, `gstin_mismatch`, or `gstin_and_amount_mismatch`).
4. **Level 4 (No Candidate Found)**: Flags invoices with no corresponding portal invoice number as `missing_on_portal`.

### Stage 2: Agentic Reasoning Engine (Gemini API)

Stage 2 handles all records flagged as `needs_review` by Stage 1. It constructs auditor prompts containing complete ERP invoice context, candidate portal records, domain rules, and strict output constraints:

* **Model & Hyperparameters**: Powered by Google Gemini (`gemini-3.6-flash` / `gemini-3.5-flash-lite`) configured with `temperature: 0.1` and `responseMimeType: "application/json"`.
* **Structured Output Schema**: Enforces JSON response structure containing `category`, numeric `confidence` (0.0 to 1.0), and single-sentence `reasoning`.
* **Rate Limiting & Backoff**: Features 4.5-second inter-request throttling and automatic HTTP 429 backoff handling.
* **Persistent Disk Cache**: Implements `stage2_cache.json` to cache LLM classifications across runs, reducing redundant API execution time and preventing quota exhaustion.
* **Graceful Degradation**: Network or API parsing errors safely default to `needs_manual_review` with a recorded exception trace, preventing database corruption or pipeline crashes.

---

## Benchmark Metrics & Evaluation Results

The pipeline was evaluated against an 80-scenario benchmark suite covering standard enterprise GST reconciliation cases.

### Per-Category Performance Matrix

| Discrepancy Category | Support Count | Precision | Recall | F1-Score | Resolution Layer |
|---|---|---|---|---|---|
| `exact_match` | 40 | 100.0% | 100.0% | 100.0% | Stage 1 (Deterministic) |
| `amount_mismatch` | 12 | 100.0% | 100.0% | 100.0% | Stage 2 (Gemini LLM) |
| `missing_on_portal` | 12 | 100.0% | 100.0% | 100.0% | Stage 2 (Gemini LLM) |
| `duplicate` | 8 | 100.0% | 100.0% | 100.0% | Stage 2 (Gemini LLM) |
| `gstin_mismatch` | 8 | 100.0% | 100.0% | 100.0% | Stage 2 (Gemini LLM) |
| `needs_manual_review` | 0 | N/A | N/A | N/A | Zero Fallback Errors |

### Confusion Matrix (80 Total Records)

| True \ Predicted | `exact_match` | `amount_mismatch` | `missing_on_portal` | `duplicate` | `gstin_mismatch` | `needs_manual_review` |
|---|---|---|---|---|---|---|
| `exact_match` | 40 | 0 | 0 | 0 | 0 | 0 |
| `amount_mismatch` | 0 | 12 | 0 | 0 | 0 | 0 |
| `missing_on_portal` | 0 | 0 | 12 | 0 | 0 | 0 |
| `duplicate` | 0 | 0 | 0 | 8 | 0 | 0 |
| `gstin_mismatch` | 0 | 0 | 0 | 0 | 8 | 0 |
| `needs_manual_review` | 0 | 0 | 0 | 0 | 0 | 0 |

---

## Tech Stack

### Backend
* **Runtime**: Node.js (v18+), TypeScript
* **API Framework**: Express.js
* **Database & ORM**: PostgreSQL, Prisma ORM
* **AI & LLM Integration**: `@google/genai` SDK (Google Gemini API)
* **Algorithms**: Custom Levenshtein distance algorithm, relative variance calculators

### Frontend
* **UI Framework**: React 18, Vite, TypeScript
* **Styling**: TailwindCSS, Vanilla CSS tokens
* **Icons & Visuals**: Lucide React
* **Data Visualization**: Recharts (discrepancy distribution charts, KPI metrics)

---

## Repository Structure

```
.
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma         # Database schema definition
│   │   └── seed.ts               # Synthetic 80-scenario benchmark generator
│   ├── src/
│   │   ├── index.ts              # Express API server entry point
│   │   └── matching/
│   │       ├── stage1.ts         # Deterministic matching engine
│   │       ├── stage2.ts         # Gemini LLM reasoning classifier
│   │       ├── evaluatePipeline.ts # Standalone evaluation script
│   │       ├── reconciliationService.ts # Orchestrator & pipeline runner
│   │       ├── chatService.ts    # AI Copilot Assistant endpoint
│   │       └── levenshtein.ts    # String edit-distance module
│   ├── .env.example              # Environment variable template
│   ├── eval-report.md            # Markdown benchmark report artifact
│   └── eval-results.json         # Programmatic JSON benchmark results
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Main application component
│   │   ├── components/           # Dashboard, Table, Modal & Copilot views
│   │   └── types.ts              # Shared TypeScript definitions
│   └── package.json
├── .gitignore                    # Master root gitignore file
├── EXPLANATION.md                # Comprehensive architectural decision log
└── README.md                     # Project documentation
```

---

## Installation & Setup Guide

### Prerequisites
* Node.js (v18.0.0 or higher)
* PostgreSQL database instance
* Google Gemini API Key

### 1. Repository Setup
```bash
git clone https://github.com/Pratyush2240/Razorpay-AI-Buildathon.git
cd Razorpay-AI-Buildathon
```

### 2. Backend Configuration
```bash
cd backend
npm install
```

Configure environment variables in `backend/.env`:
```env
PORT=5000
DATABASE_URL="postgresql://user:password@localhost:5432/gstmatch?schema=public"
GEMINI_API_KEY="your_google_gemini_api_key_here"
```

Initialize PostgreSQL database and run migrations:
```bash
npx prisma migrate dev --name init
npx prisma db seed
```

Start the backend API server:
```bash
npm run dev
```

### 3. Frontend Setup
In a separate terminal window:
```bash
cd frontend
npm install
npm run dev
```

Access the frontend dashboard at `http://localhost:5173`.

---

## Running the Benchmark Evaluation Suite

To execute the automated evaluation pipeline against the 80-record test suite and generate benchmark reports:

```bash
cd backend
npx ts-node src/matching/evaluatePipeline.ts
```

This will output benchmark metrics to the console and update `backend/eval-results.json` and `backend/eval-report.md`.

---

## API Documentation

| Endpoint | Method | Description |
|---|---|---|
| `/api/reconciliation/run` | POST | Triggers the complete two-stage reconciliation pipeline |
| `/api/reconciliation/results` | GET | Retrieves current reconciliation records and summary metrics |
| `/api/chat` | POST | Handles interactive AI Copilot queries for invoice audit assistance |
| `/api/upload` | POST | Accepts CSV ledger and portal file uploads for batch processing |

---

## License

Distributed under the MIT License. See `LICENSE` for more information.
