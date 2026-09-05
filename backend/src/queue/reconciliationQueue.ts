import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { Response } from 'express';
import {
  importCustomDataAndRunPipeline,
  ReconciliationResponse,
} from '../matching/reconciliationService';

export interface BulkReconciliationPayload {
  internalInvoices: Array<{
    invoiceNumber: string;
    vendorName: string;
    vendorGstin: string;
    amount: number;
    taxAmount?: number;
    invoiceDate?: string;
    description?: string;
  }>;
  portalRecords: Array<{
    invoiceNumber?: string | null;
    vendorName: string;
    vendorGstin: string;
    amount: number;
    taxAmount?: number;
    filedDate?: string;
  }>;
}

export interface JobProgress {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number; // 0 to 100
  stage: 'queued' | 'ingesting' | 'stage1_matching' | 'stage2_ai_audit' | 'completed' | 'failed';
  processedCount: number;
  totalCount: number;
  stage1MatchedCount: number;
  stage2ProcessedCount: number;
  error?: string;
  result?: ReconciliationResponse;
  startedAt: string;
  completedAt?: string;
}

const jobStore = new Map<string, JobProgress>();
const sseSubscribers = new Map<string, Set<Response>>();

let redisConnected = false;
let bullQueue: Queue | null = null;

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

try {
  const redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    retryStrategy: (times) => {
      if (times > 2) {
        console.log('⚠️ Redis connection unavailable. Using high-performance in-memory background job queue.');
        return null; // Stop retrying
      }
      return 500;
    },
  });

  redisClient.on('connect', () => {
    console.log('✅ Connected to Redis instance for BullMQ background queue processing.');
    redisConnected = true;
  });

  redisClient.on('error', () => {
    redisConnected = false;
  });

  bullQueue = new Queue('bulk-reconciliation', { connection: redisClient });
} catch (err) {
  console.log('ℹ️ Redis not detected. Initializing in-memory job queue worker.');
}

/**
 * Broadcasts progress update to all active SSE subscribers for a given jobId.
 */
function broadcastJobProgress(progress: JobProgress) {
  jobStore.set(progress.jobId, progress);

  const subscribers = sseSubscribers.get(progress.jobId);
  if (subscribers) {
    const payload = `data: ${JSON.stringify(progress)}\n\n`;
    subscribers.forEach((res) => {
      try {
        res.write(payload);
      } catch (err) {
        // Handle subscriber disconnect
      }
    });

    if (progress.status === 'completed' || progress.status === 'failed') {
      subscribers.forEach((res) => res.end());
      sseSubscribers.delete(progress.jobId);
    }
  }
}

/**
 * Executes bulk reconciliation processing.
 */
async function processBulkJob(prisma: PrismaClient, jobId: string, payload: BulkReconciliationPayload): Promise<ReconciliationResponse> {
  const totalCount = payload.internalInvoices.length + payload.portalRecords.length;

  const currentJob: JobProgress = {
    jobId,
    status: 'processing',
    progress: 10,
    stage: 'ingesting',
    processedCount: 0,
    totalCount,
    stage1MatchedCount: 0,
    stage2ProcessedCount: 0,
    startedAt: new Date().toISOString(),
  };

  broadcastJobProgress(currentJob);

  try {
    currentJob.stage = 'stage1_matching';
    currentJob.progress = 35;
    broadcastJobProgress(currentJob);

    // Import custom dataset into PostgreSQL database and execute pipeline
    const result = await importCustomDataAndRunPipeline(
      prisma,
      payload.internalInvoices,
      payload.portalRecords
    );

    currentJob.status = 'completed';
    currentJob.stage = 'completed';
    currentJob.progress = 100;
    currentJob.processedCount = totalCount;
    currentJob.stage1MatchedCount = result.summary.matchedCount;
    currentJob.stage2ProcessedCount = result.summary.exceptionCount;
    currentJob.result = result;
    currentJob.completedAt = new Date().toISOString();

    broadcastJobProgress(currentJob);
    return result;
  } catch (error: any) {
    console.error(`Job ${jobId} failed:`, error);
    currentJob.status = 'failed';
    currentJob.stage = 'failed';
    currentJob.error = error?.message || 'Job execution failed';
    currentJob.completedAt = new Date().toISOString();
    broadcastJobProgress(currentJob);
    throw error;
  }
}

/**
 * Enqueues a bulk reconciliation job and returns jobId immediately (HTTP 202).
 */
export async function addBulkReconciliationJob(
  prisma: PrismaClient,
  payload: BulkReconciliationPayload
): Promise<{ jobId: string; statusUrl: string }> {
  const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const totalCount = payload.internalInvoices.length + payload.portalRecords.length;

  const initialProgress: JobProgress = {
    jobId,
    status: 'queued',
    progress: 0,
    stage: 'queued',
    processedCount: 0,
    totalCount,
    stage1MatchedCount: 0,
    stage2ProcessedCount: 0,
    startedAt: new Date().toISOString(),
  };

  jobStore.set(jobId, initialProgress);

  if (redisConnected && bullQueue) {
    await bullQueue.add('reconcile', { jobId, payload }, { jobId });
  } else {
    // Asynchronous non-blocking background processing via Event Loop
    setImmediate(async () => {
      try {
        await processBulkJob(prisma, jobId, payload);
      } catch (err) {
        // Exception recorded in jobStore
      }
    });
  }

  return {
    jobId,
    statusUrl: `/api/reconciliation/jobs/${jobId}`,
  };
}

/**
 * Retrieves current job progress status.
 */
export function getJobProgress(jobId: string): JobProgress | null {
  return jobStore.get(jobId) || null;
}

/**
 * Subscribes an HTTP response to Server-Sent Events (SSE) for real-time progress updates.
 */
export function subscribeJobProgressStream(jobId: string, res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!sseSubscribers.has(jobId)) {
    sseSubscribers.set(jobId, new Set());
  }
  sseSubscribers.get(jobId)!.add(res);

  const currentStatus = jobStore.get(jobId);
  if (currentStatus) {
    res.write(`data: ${JSON.stringify(currentStatus)}\n\n`);
  }

  res.on('close', () => {
    const subscribers = sseSubscribers.get(jobId);
    if (subscribers) {
      subscribers.delete(res);
      if (subscribers.size === 0) sseSubscribers.delete(jobId);
    }
  });
}
