-- CreateEnum
CREATE TYPE "TrueCategory" AS ENUM ('exact_match', 'amount_mismatch', 'missing_on_portal', 'duplicate', 'gstin_mismatch');

-- CreateTable
CREATE TABLE "internal_invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "vendorGstin" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_records" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "vendorGstin" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "filedDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ground_truths" (
    "id" TEXT NOT NULL,
    "internalInvoiceId" TEXT,
    "portalRecordId" TEXT,
    "trueCategory" "TrueCategory" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ground_truths_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ground_truths" ADD CONSTRAINT "ground_truths_internalInvoiceId_fkey" FOREIGN KEY ("internalInvoiceId") REFERENCES "internal_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ground_truths" ADD CONSTRAINT "ground_truths_portalRecordId_fkey" FOREIGN KEY ("portalRecordId") REFERENCES "portal_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
