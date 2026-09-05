# GST Reconciliation Pipeline — Benchmark Evaluation Report

> **Summary**: Pipeline achieved 100.0% overall accuracy across 80 records. 0 records required manual review.

* **Evaluation Timestamp**: 2026-08-31T21:22:10.139Z
* **Total Invoices Benchmark Suite**: 80
* **Overall Accuracy**: **100.0%** (80/80)

---

## 1. Pipeline Stage Performance Breakdown

| Pipeline Stage | Strategy | Input Count | Resolved Count | Accuracy | Execution Time |
|---|---|---|---|---|---|
| **Stage 1** | Deterministic Priority Cascade | 80 | 40 (50%) | **100.0%** | 10 ms |
| **Stage 2** | Gemini API LLM Reasoning | 40 | 40 (50%) | **100.0%** | 0.0 s |
| **Full Pipeline** | End-to-End Hybrid Engine | 80 | 80 (100%) | **100.0%** | 0.0 s |

---

## 2. Per-Category Precision & Recall Metrics

| Category | Support (True Count) | Precision | Recall | F1-Score | Status |
|---|---|---|---|---|---|
| `exact_match` | 40 | 100.0% | 100.0% | **100.0%** | ✅ Excellent |
| `amount_mismatch` | 12 | 100.0% | 100.0% | **100.0%** | ✅ Excellent |
| `missing_on_portal` | 12 | 100.0% | 100.0% | **100.0%** | ✅ Excellent |
| `duplicate` | 8 | 100.0% | 100.0% | **100.0%** | ✅ Excellent |
| `gstin_mismatch` | 8 | 100.0% | 100.0% | **100.0%** | ✅ Excellent |
| `needs_manual_review` | 0 | 0.0% | 0.0% | **0.0%** | ❌ Failed |

---

## 3. Confusion Matrix

Rows represent the **True Ground Truth Category**, columns represent the **Predicted Category**.

| True \ Predicted | `exact_match` | `amount_mismatch` | `missing_on_portal` | `duplicate` | `gstin_mismatch` | `needs_manual_review` |
|---|---|---|---|---|---|---|
| `exact_match` | 40 | 0 | 0 | 0 | 0 | 0 |
| `amount_mismatch` | 0 | 12 | 0 | 0 | 0 | 0 |
| `missing_on_portal` | 0 | 0 | 12 | 0 | 0 | 0 |
| `duplicate` | 0 | 0 | 0 | 8 | 0 | 0 |
| `gstin_mismatch` | 0 | 0 | 0 | 0 | 8 | 0 |
| `needs_manual_review` | 0 | 0 | 0 | 0 | 0 | 0 |

---

## 4. Per-Invoice Prediction Log (80 Records)

| Invoice Number | Vendor Name | Resolved By | True Category | Predicted Category | Match | Confidence | Reasoning |
|---|---|---|---|---|---|---|---|
| `INV/2024/1001` | Acme Infotech Services Pv | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `GST/24-25/1002` | Reliance Logistics & Frei | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `TXN-89/1003` | Tata Consultancy Solution | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `BILL-2024-1004` | Infosystems India Private | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `SLS/2425/1005` | Apex Industrial Component | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `INV/2024/1006` | Zenith Marketing & Tradin | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `GST/24-25/1007` | Vanguard Electronics Indi | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `TXN-89/1008` | Bharat Heavy Electrical S | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `BILL-2024-1009` | Mahindra Supply Chain Sol | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `SLS/2425/1010` | Blue Dart Express Logisti | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `INV/2024/1011` | Godrej Office Automation  | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `GST/24-25/1012` | Sun Pharma Distribution C | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `TXN-89/1013` | L&T Engineering Supplies  | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `BILL-2024-1014` | UltraTech Cement Distribu | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `SLS/2425/1015` | Adani Ports & Logistics L | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `INV/2024/1016` | Wipro Digital Solutions P | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `GST/24-25/1017` | HCL Tech Infrastructure L | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `TXN-89/1018` | Asian Paints Color Tradin | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `BILL-2024-1019` | Pidilite Adhesives & Chem | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `SLS/2425/1020` | Havells Electrical Compon | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `INV/2024/1021` | Acme Infotech Services Pv | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `GST/24-25/1022` | Reliance Logistics & Frei | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `TXN-89/1023` | Tata Consultancy Solution | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `BILL-2024-1024` | Infosystems India Private | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `SLS/2425/1025` | Apex Industrial Component | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `INV/2024/1026` | Zenith Marketing & Tradin | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `GST/24-25/1027` | Vanguard Electronics Indi | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `TXN-89/1028` | Bharat Heavy Electrical S | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `BILL-2024-1029` | Mahindra Supply Chain Sol | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `SLS/2425/1030` | Blue Dart Express Logisti | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `INV/2024/1031` | Godrej Office Automation  | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `GST/24-25/1032` | Sun Pharma Distribution C | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `TXN-89/1033` | L&T Engineering Supplies  | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `BILL-2024-1034` | UltraTech Cement Distribu | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `SLS/2425/1035` | Adani Ports & Logistics L | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `INV/2024/1036` | Wipro Digital Solutions P | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `GST/24-25/1037` | HCL Tech Infrastructure L | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `TXN-89/1038` | Asian Paints Color Tradin | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `BILL-2024-1039` | Pidilite Adhesives & Chem | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `SLS/2425/1040` | Havells Electrical Compon | Stage 1 | `exact_match` | `exact_match` | ✅ | 1.00 | Resolved by Stage 1 deterministic exact matching rule. |
| `GST/24-25/1041` | Zenith Marketing & Tradin | Stage 2 | `amount_mismatch` | `amount_mismatch` | ✅ | 0.98 | The invoice number and vendor GSTIN match the portal record exactly, but the total amount and tax values differ between the internal invoice and the portal record. |
| `TXN-89/1042` | Vanguard Electronics Indi | Stage 2 | `amount_mismatch` | `amount_mismatch` | ✅ | 0.98 | The invoice number and vendor GSTIN match the portal record exactly, but the portal amount of ₹125,494.62 differs from the internal invoice amount of ₹123,717.29. |
| `BILL-2024-1043` | Bharat Heavy Electrical S | Stage 2 | `amount_mismatch` | `amount_mismatch` | ✅ | 0.98 | The invoice number and vendor GSTIN match the portal record exactly, but the internal invoice amount of ₹299,878.47 differs from the portal reported amount of ₹285,918.91. |
| `SLS/2425/1044` | Mahindra Supply Chain Sol | Stage 2 | `amount_mismatch` | `amount_mismatch` | ✅ | 0.98 | The invoice number and vendor GSTIN match perfectly, but the total amount on the portal (₹182,788.40) differs from the internal invoice amount (₹176,510.02). |
| `INV/2024/1045` | Blue Dart Express Logisti | Stage 2 | `amount_mismatch` | `amount_mismatch` | ✅ | 0.98 | The invoice number and vendor GSTIN match perfectly, but there is a discrepancy between the internal invoice amount of ₹166,681.83 and the portal record amount of ₹164,464.87. |
| `GST/24-25/1046` | Godrej Office Automation  | Stage 2 | `amount_mismatch` | `amount_mismatch` | ✅ | 0.98 | The invoice number and vendor GSTIN match perfectly, but the internal invoice amount of ₹50936.33 differs from the portal record amount of ₹49713.91. |
| `TXN-89/1047` | Sun Pharma Distribution C | Stage 2 | `amount_mismatch` | `amount_mismatch` | ✅ | 0.98 | The invoice number and vendor GSTIN match the portal record exactly, but there is a discrepancy in the total amount and tax values. |
| `BILL-2024-1048` | L&T Engineering Supplies  | Stage 2 | `amount_mismatch` | `amount_mismatch` | ✅ | 0.98 | The invoice number and vendor GSTIN match the portal record exactly, but the total amount and tax values differ between the internal invoice and the portal filing. |
| `SLS/2425/1049` | UltraTech Cement Distribu | Stage 2 | `amount_mismatch` | `amount_mismatch` | ✅ | 0.98 | The invoice number and vendor GSTIN match the portal record exactly, but the total amount and tax values differ. |
| `INV/2024/1050` | Adani Ports & Logistics L | Stage 2 | `amount_mismatch` | `amount_mismatch` | ✅ | 1.00 | The invoice number and vendor GSTIN match the portal record, but the internal invoice amount (₹310,586.41) differs from the portal record amount (₹320,727.79). |
| `GST/24-25/1051` | Wipro Digital Solutions P | Stage 2 | `amount_mismatch` | `amount_mismatch` | ✅ | 0.98 | The invoice number and vendor GSTIN match perfectly, but the total amount on the portal (₹241,710.12) differs from the internal invoice amount (₹232,608.66). |
| `TXN-89/1052` | HCL Tech Infrastructure L | Stage 2 | `amount_mismatch` | `amount_mismatch` | ✅ | 0.98 | The invoice number and vendor GSTIN match perfectly, but the internal invoice amount of ₹272,918.54 differs from the portal record amount of ₹285,517.58. |
| `TXN-89/1053` | Godrej Office Automation  | Stage 2 | `missing_on_portal` | `missing_on_portal` | ✅ | 1.00 | No matching portal record was found for the invoice number on the GSTR-2B portal, indicating the vendor has not filed this invoice. |
| `BILL-2024-1054` | Sun Pharma Distribution C | Stage 2 | `missing_on_portal` | `missing_on_portal` | ✅ | 1.00 | No matching portal records were found for invoice BILL-2024-1054, indicating the vendor has not uploaded the invoice to GSTR-1. |
| `SLS/2425/1055` | L&T Engineering Supplies  | Stage 2 | `missing_on_portal` | `missing_on_portal` | ✅ | 1.00 | No matching portal records were found for the invoice number SLS/2425/1055, indicating the vendor has not filed this invoice in their GSTR-1. |
| `INV/2024/1056` | UltraTech Cement Distribu | Stage 2 | `missing_on_portal` | `missing_on_portal` | ✅ | 1.00 | No matching portal record was found for invoice number INV/2024/1056, indicating the vendor has not filed this invoice in their GSTR-1. |
| `GST/24-25/1057` | Adani Ports & Logistics L | Stage 2 | `missing_on_portal` | `missing_on_portal` | ✅ | 1.00 | No matching portal record was found for invoice number GST/24-25/1057 on the GSTR-2B portal, indicating the vendor has not filed this invoice. |
| `TXN-89/1058` | Wipro Digital Solutions P | Stage 2 | `missing_on_portal` | `missing_on_portal` | ✅ | 1.00 | No matching portal record was found for invoice TXN-89/1058, indicating the vendor has not uploaded the invoice to GSTR-1. |
| `BILL-2024-1059` | HCL Tech Infrastructure L | Stage 2 | `missing_on_portal` | `missing_on_portal` | ✅ | 1.00 | No matching portal record was found for invoice BILL-2024-1059, indicating the vendor has not filed this invoice in their GSTR-1. |
| `SLS/2425/1060` | Asian Paints Color Tradin | Stage 2 | `missing_on_portal` | `missing_on_portal` | ✅ | 1.00 | No matching portal records were found for the given invoice number, indicating the vendor has not filed this invoice in their GSTR-1. |
| `INV/2024/1061` | Pidilite Adhesives & Chem | Stage 2 | `missing_on_portal` | `missing_on_portal` | ✅ | 1.00 | No matching portal record was found for invoice number INV/2024/1061, indicating the vendor has not filed the GSTR-1 for this transaction. |
| `GST/24-25/1062` | Havells Electrical Compon | Stage 2 | `missing_on_portal` | `missing_on_portal` | ✅ | 1.00 | No matching portal records were found for this invoice number, indicating it is missing from the GSTR-2B portal. |
| `TXN-89/1063` | Acme Infotech Services Pv | Stage 2 | `missing_on_portal` | `missing_on_portal` | ✅ | 1.00 | No matching portal records were found for the given invoice number, indicating it has not been filed by the vendor in GSTR-1. |
| `BILL-2024-1064` | Reliance Logistics & Frei | Stage 2 | `missing_on_portal` | `missing_on_portal` | ✅ | 1.00 | No matching candidate portal records were found for this invoice number, indicating it is missing from the GSTR-2B portal. |
| `BILL-2024-1065` | Wipro Digital Solutions P | Stage 2 | `duplicate` | `duplicate` | ✅ | 1.00 | Multiple candidate portal records exist for the same invoice number and vendor GSTIN in the GSTR-2B data. |
| `SLS/2425/1066` | HCL Tech Infrastructure L | Stage 2 | `duplicate` | `duplicate` | ✅ | 1.00 | Multiple candidate portal records exist for the exact same internal invoice number and vendor GSTIN. |
| `INV/2024/1067` | Asian Paints Color Tradin | Stage 2 | `duplicate` | `duplicate` | ✅ | 1.00 | Multiple candidate portal records exist with identical invoice numbers and amounts for the same vendor GSTIN. |
| `GST/24-25/1068` | Pidilite Adhesives & Chem | Stage 2 | `duplicate` | `duplicate` | ✅ | 1.00 | Multiple candidate portal records exist for the exact same invoice number and vendor GSTIN, which constitutes a duplicate filing on the portal. |
| `TXN-89/1069` | Havells Electrical Compon | Stage 2 | `duplicate` | `duplicate` | ✅ | 1.00 | Multiple candidate portal records were found matching the internal invoice number and vendor GSTIN. |
| `BILL-2024-1070` | Acme Infotech Services Pv | Stage 2 | `duplicate` | `duplicate` | ✅ | 1.00 | Multiple candidate portal records exist for the same invoice number and vendor GSTIN, indicating duplicate filings on the GSTR-2B portal. |
| `SLS/2425/1071` | Reliance Logistics & Frei | Stage 2 | `duplicate` | `duplicate` | ✅ | 1.00 | Multiple candidate portal records exist for the same invoice number and vendor GSTIN, indicating the vendor filed GSTR-1 multiple times. |
| `INV/2024/1072` | Tata Consultancy Solution | Stage 2 | `duplicate` | `duplicate` | ✅ | 1.00 | Multiple candidate portal records exist for the exact same invoice number and vendor GSTIN. |
| `SLS/2425/1073` | Bharat Heavy Electrical S | Stage 2 | `gstin_mismatch` | `gstin_mismatch` | ✅ | 0.99 | The invoice number, total amount, and tax values match perfectly, but the vendor GSTIN on the internal invoice (36AABCB1234J1Z9) differs by one character from the portal record (36AABCB1134J1Z9). |
| `INV/2024/1074` | Mahindra Supply Chain Sol | Stage 2 | `gstin_mismatch` | `gstin_mismatch` | ✅ | 0.99 | The invoice number, total amount, and vendor name match the portal record, but the Vendor GSTIN differs slightly (27AABCM5678K1Z5 vs 27AABCM5178K1Z5). |
| `GST/24-25/1075` | Blue Dart Express Logisti | Stage 2 | `gstin_mismatch` | `gstin_mismatch` | ✅ | 0.99 | The invoice number and amount match perfectly, but the vendor GSTIN on the internal invoice (07AABCD9012L1Z0) differs slightly from the portal record (07AABAD9012L1Z0). |
| `TXN-89/1076` | Godrej Office Automation  | Stage 2 | `gstin_mismatch` | `gstin_mismatch` | ✅ | 0.98 | The invoice number, total amount, and tax amount match perfectly with the portal record, but there is a single-character discrepancy in the vendor GSTIN (29AABCG3456M1Z6 vs 29AABCG3456M1ZE). |
| `BILL-2024-1077` | Sun Pharma Distribution C | Stage 2 | `gstin_mismatch` | `gstin_mismatch` | ✅ | 0.98 | The invoice number, total amount, and tax amount match perfectly with the portal candidate, but the vendor GSTIN has a character difference (33AABCS7890N1Z2 vs 33ABBCS7890N1Z2). |
| `SLS/2425/1078` | L&T Engineering Supplies  | Stage 2 | `gstin_mismatch` | `gstin_mismatch` | ✅ | 0.98 | The invoice number and amounts match precisely, but the vendor GSTIN has a single-character discrepancy (01Z8 vs 01ZE), indicating a typographical error. |
| `INV/2024/1079` | UltraTech Cement Distribu | Stage 2 | `gstin_mismatch` | `gstin_mismatch` | ✅ | 0.98 | The invoice number and amount match perfectly with the portal candidate, but the vendor GSTIN has a minor character discrepancy at the second-to-last position (1Z4 vs 1ZE). |
| `GST/24-25/1080` | Adani Ports & Logistics L | Stage 2 | `gstin_mismatch` | `gstin_mismatch` | ✅ | 1.00 | The invoice number, total amount, and tax amount match perfectly with the portal record, but there is a single character difference in the vendor GSTIN (24AABCA1234Q1Z0 vs 24AABAA1234Q1Z0). |
