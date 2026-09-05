import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';
import { getReconciliationData } from './reconciliationService';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export async function explainExceptionWithGemini(
  prisma: PrismaClient,
  recordId: string,
  userMessage: string,
  chatHistory: ChatMessage[] = []
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing');
  }

  const data = await getReconciliationData(prisma);
  const record = data.records.find((r) => r.id === recordId);

  if (!record) {
    throw new Error(`Record with ID ${recordId} not found in reconciliation dataset.`);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.5-flash-lite',
    generationConfig: {
      temperature: 0.2,
    },
  });

  const promptContext = `You are an expert Indian GST & Tax Compliance Auditor acting as a senior AI Financial Copilot.
You are assisting a financial controller reviewing an exception record from a GSTR-2B reconciliation run.

--- EXCEPTION RECORD AUDIT CONTEXT ---
- Internal Invoice Number: ${record.invoiceNumber}
- Vendor Name: ${record.vendorName}
- Our Books GSTIN: ${record.ourVendorGstin}
- GSTR-2B Portal GSTIN: ${record.portalVendorGstin || 'Not Found on GSTR-2B Portal'}
- Our Taxable Value: ₹${record.ourTaxableValue.toLocaleString('en-IN')} | GSTR-2B Taxable Value: ${record.portalTaxableValue != null ? '₹' + record.portalTaxableValue.toLocaleString('en-IN') : 'N/A'}
- Our Tax Amount: ₹${record.ourTaxAmount.toLocaleString('en-IN')} | GSTR-2B Tax Amount: ${record.portalTaxAmount != null ? '₹' + record.portalTaxAmount.toLocaleString('en-IN') : 'N/A'}
- Our Total Amount: ₹${record.ourTotalAmount.toLocaleString('en-IN')} | GSTR-2B Total Amount: ${record.portalTotalAmount != null ? '₹' + record.portalTotalAmount.toLocaleString('en-IN') : 'N/A'}
- Discrepancy Category: ${record.category.toUpperCase().replace(/_/g, ' ')}
- Audit Confidence Score: ${record.confidence ? (record.confidence * 100).toFixed(0) + '%' : 'Deterministic Rule'}
- Stage 2 Gemini Audit Reasoning: "${record.reasoning}"
- Invoice Date: ${record.invoiceDate}
- Description: ${record.description}
- Review Status: ${record.reviewStatus}

--- PREVIOUS CONVERSATION ---
${chatHistory.map((m) => `${m.role === 'user' ? 'User' : 'Copilot'}: ${m.text}`).join('\n')}

--- USER REQUEST ---
User Question: "${userMessage}"

--- RESPONSE GUIDELINES ---
1. Be authoritative, professional, concise, and helpful like a senior tax controller.
2. If the user asks for a vendor communication or dispute draft, provide a structured email with Subject Line, Salutation, Invoice Discrepancy Breakdown Table, Specific Action Required, and Sign-off.
3. If the user asks why amounts differ or what the risk is, analyze tax rates, ITC eligible amount, potential vendor filing mistakes (e.g. GSTR-1 amendment needed, credit note missing, tax rate mismatch, or character typo).
4. Use clean Markdown formatting with clear bullet points and bold headers. Do not use conversational fluff.`;

  const result = await model.generateContent(promptContext);
  return result.response.text().trim();
}
