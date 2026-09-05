import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import {
  getReconciliationData,
  importCustomDataAndRunPipeline,
  runPipeline,
  runPipelineWithStreaming,
  updateRecordReviewStatus,
} from './matching/reconciliationService';
import { explainExceptionWithGemini } from './matching/chatService';
import {
  addBulkReconciliationJob,
  getJobProgress,
  subscribeJobProgressStream,
} from './queue/reconciliationQueue';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'GSTMatch Backend', timestamp: new Date().toISOString() });
});

// GET /api/summary — Returns cached summary statistics
app.get('/api/summary', async (req: Request, res: Response) => {
  try {
    const data = await getReconciliationData(prisma);
    res.json(data.summary);
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to retrieve summary' });
  }
});

// GET /api/records — Returns all cached records
app.get('/api/records', async (req: Request, res: Response) => {
  try {
    const data = await getReconciliationData(prisma);
    res.json(data.records);
  } catch (error) {
    console.error('Error fetching records:', error);
    res.status(500).json({ error: 'Failed to retrieve records' });
  }
});

// GET /api/records/:id — Returns detail for a single cached record
app.get('/api/records/:id', async (req: Request, res: Response) => {
  try {
    const data = await getReconciliationData(prisma);
    const record = data.records.find((r) => r.id === req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json(record);
  } catch (error) {
    console.error(`Error fetching record ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to retrieve record detail' });
  }
});

// PATCH /api/records/:id/review — Updates reviewStatus in cache (no pipeline re-run)
app.patch('/api/records/:id/review', (req: Request, res: Response) => {
  try {
    const { action } = req.body;
    if (!action || !['accept_vendor', 'keep_books', 'flag_review', 'reset'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Use: accept_vendor | keep_books | flag_review | reset' });
    }
    const updatedRecord = updateRecordReviewStatus(req.params.id, action);
    if (!updatedRecord) {
      return res.status(404).json({ error: 'Record not found or pipeline has not been run yet' });
    }
    res.json({ message: 'Review status updated', record: updatedRecord, newStatus: updatedRecord.reviewStatus });
  } catch (error) {
    console.error(`Error updating review status for ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to update review status' });
  }
});

// POST /api/reconciliation/run — Force a fresh pipeline execution
app.post('/api/reconciliation/run', async (req: Request, res: Response) => {
  try {
    const data = await runPipeline(prisma);
    res.json({ message: 'Reconciliation pipeline completed successfully', ...data });
  } catch (error) {
    console.error('Error running reconciliation pipeline:', error);
    res.status(500).json({ error: 'Pipeline execution failed' });
  }
});

// POST /api/reconciliation/upload — Custom CSV data import and pipeline execution
app.post('/api/reconciliation/upload', async (req: Request, res: Response) => {
  try {
    const { internalInvoices, portalRecords } = req.body;
    if (!Array.isArray(internalInvoices) || !Array.isArray(portalRecords)) {
      return res.status(400).json({ error: 'Payload must contain internalInvoices and portalRecords arrays' });
    }

    const data = await importCustomDataAndRunPipeline(prisma, internalInvoices, portalRecords);
    res.json({ message: `Imported ${internalInvoices.length} internal invoices & ${portalRecords.length} portal records successfully`, ...data });
  } catch (error: any) {
    console.error('Error uploading custom reconciliation data:', error);
    res.status(500).json({ error: error?.message || 'Failed to upload and process custom dataset' });
  }
});

// POST /api/reconciliation/bulk — Async background queue bulk ingestion (HTTP 202 Accepted)
app.post('/api/reconciliation/bulk', async (req: Request, res: Response) => {
  try {
    const { internalInvoices, portalRecords } = req.body;
    if (!Array.isArray(internalInvoices) || !Array.isArray(portalRecords)) {
      return res.status(400).json({ error: 'Payload must contain internalInvoices and portalRecords arrays' });
    }

    const jobInfo = await addBulkReconciliationJob(prisma, { internalInvoices, portalRecords });
    res.status(202).json({
      message: `Enqueued bulk reconciliation job for ${internalInvoices.length} internal invoices & ${portalRecords.length} portal records.`,
      ...jobInfo,
    });
  } catch (error: any) {
    console.error('Error enqueuing bulk job:', error);
    res.status(500).json({ error: error?.message || 'Failed to enqueue bulk reconciliation job' });
  }
});

// GET /api/reconciliation/jobs/:jobId — Check background job status
app.get('/api/reconciliation/jobs/:jobId', (req: Request, res: Response) => {
  const progress = getJobProgress(req.params.jobId);
  if (!progress) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(progress);
});

// GET /api/reconciliation/jobs/:jobId/stream — Real-time SSE telemetry for background job
app.get('/api/reconciliation/jobs/:jobId/stream', (req: Request, res: Response) => {
  subscribeJobProgressStream(req.params.jobId, res);
});

// POST /api/chat/explain — Interactive Gemini AI Financial Copilot chat
app.post('/api/chat/explain', async (req: Request, res: Response) => {
  try {
    const { recordId, userMessage, chatHistory } = req.body;
    if (!recordId || !userMessage) {
      return res.status(400).json({ error: 'recordId and userMessage are required' });
    }

    const reply = await explainExceptionWithGemini(prisma, recordId, userMessage, chatHistory || []);
    res.json({ reply });
  } catch (error: any) {
    console.error('Error in Gemini chat assistant:', error);
    res.status(500).json({ error: error?.message || 'Failed to generate AI financial explanation' });
  }
});

// GET /api/reconciliation/stream — SSE endpoint for live pipeline execution telemetry
app.get('/api/reconciliation/stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const emitEvent = (eventType: string, data: any) => {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await runPipelineWithStreaming(prisma, emitEvent);
    res.end();
  } catch (error) {
    console.error('Error in streaming pipeline:', error);
    emitEvent('error', { error: 'Pipeline execution failed' });
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`GSTMatch Backend running on port ${PORT}`);
});
