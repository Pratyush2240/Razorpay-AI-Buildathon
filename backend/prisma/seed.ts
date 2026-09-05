import { PrismaClient, TrueCategory } from '@prisma/client';

const prisma = new PrismaClient();

// Seed data pools for realism
interface VendorPoolItem {
  name: string;
  gstin: string;
  desc: string;
}

const VENDORS: VendorPoolItem[] = [
  { name: 'Acme Infotech Services Pvt Ltd', gstin: '27AAPCU1234K1ZE', desc: 'IT Support and Cloud Managed Services' },
  { name: 'Reliance Logistics & Freight Ltd', gstin: '07AABCR5678D1Z2', desc: 'Freight Forwarding & Interstate Logistics Charges' },
  { name: 'Tata Consultancy Solutions LLP', gstin: '29AACCT9012E1Z8', desc: 'Software Development and Tech Consulting Services' },
  { name: 'Infosystems India Private Limited', gstin: '33AABCD3456F1Z4', desc: 'Supply of Server Racks and Hardware Equipment' },
  { name: 'Apex Industrial Components Pvt Ltd', gstin: '09AABCA7890G1Z1', desc: 'Industrial Tools and Mechanical Component Supply' },
  { name: 'Zenith Marketing & Trading Co', gstin: '19AABCZ2345H1Z7', desc: 'Quarterly Marketing & Promotional Campaign Expenses' },
  { name: 'Vanguard Electronics India Ltd', gstin: '24AABCV6789I1Z3', desc: 'Semiconductor & Electronic Sub-assembly Components' },
  { name: 'Bharat Heavy Electrical Supplies', gstin: '36AABCB1234J1Z9', desc: 'Heavy Electrical Transformer Equipment & Installation' },
  { name: 'Mahindra Supply Chain Solutions', gstin: '27AABCM5678K1Z5', desc: 'Warehouse Logistics & Storage Management Services' },
  { name: 'Blue Dart Express Logistics Ltd', gstin: '07AABCD9012L1Z0', desc: 'Express Courier & Document Cargo Logistics' },
  { name: 'Godrej Office Automation Pvt Ltd', gstin: '29AABCG3456M1Z6', desc: 'Office Ergonomic Furniture & Printer Leasing' },
  { name: 'Sun Pharma Distribution Corp', gstin: '33AABCS7890N1Z2', desc: 'Pharmaceutical Supplies & Cold Chain Distribution' },
  { name: 'L&T Engineering Supplies Ltd', gstin: '09AABCL2345O1Z8', desc: 'Civil Engineering Raw Materials & Equipment Rental' },
  { name: 'UltraTech Cement Distributors', gstin: '19AABCU6789P1Z4', desc: 'Bulk Cement & Construction Aggregate Supply' },
  { name: 'Adani Ports & Logistics Ltd', gstin: '24AABCA1234Q1Z0', desc: 'Port Handling & Container Stevedoring Charges' },
  { name: 'Wipro Digital Solutions Pvt Ltd', gstin: '36AABCW5678R1Z6', desc: 'Enterprise ERP Software License & Support' },
  { name: 'HCL Tech Infrastructure Ltd', gstin: '27AABCH9012S1Z1', desc: 'Data Center Rack Space & Fiber Optic Connectivity' },
  { name: 'Asian Paints Color Trading Co', gstin: '07AABCP3456T1Z7', desc: 'Industrial Paint & Protective Coating Supply' },
  { name: 'Pidilite Adhesives & Chemicals', gstin: '29AABCP7890U1Z3', desc: 'Adhesives & Specialty Chemical Supply' },
  { name: 'Havells Electrical Components', gstin: '33AABCH2345V1Z9', desc: 'Electrical Cabling & Power Distribution Units' },
];

const PREFIXES = ['INV/2024/', 'GST/24-25/', 'TXN-89/', 'BILL-2024-', 'SLS/2425/'];

// Helper functions
function getRandomDate(startDate: Date, endDate: Date): Date {
  const time = startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime());
  return new Date(time);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function roundTwoDecimals(val: number): number {
  return Math.round(val * 100) / 100;
}

function alterGstin(gstin: string): string {
  // Alter 1-2 characters in GSTIN (OCR/typo simulation)
  const chars = gstin.split('');
  // Alter index 5 (letter in PAN) or index 11 (digit in entity) or index 14 (checksum)
  const choices = [
    { idx: 5, replace: chars[5] === 'A' ? 'O' : 'A' },
    { idx: 8, replace: chars[8] === '1' ? 'I' : '1' },
    { idx: 14, replace: chars[14] === 'E' ? 'F' : 'E' },
    { idx: 3, replace: chars[3] === 'B' ? '8' : 'B' },
  ];
  const choice = choices[Math.floor(Math.random() * choices.length)];
  chars[choice.idx] = choice.replace;
  return chars.join('');
}

async function main() {
  console.log('🧹 Cleaning existing database records...');
  await prisma.groundTruth.deleteMany();
  await prisma.internalInvoice.deleteMany();
  await prisma.portalRecord.deleteMany();

  console.log('🚀 Starting deliberate, controlled synthetic data generation (80 pairs)...');

  const startDate = new Date('2024-09-01T00:00:00Z');
  const endDate = new Date('2024-11-30T23:59:59Z');

  let invoiceCounter = 1001;

  const categoryCounts: Record<TrueCategory, number> = {
    exact_match: 0,
    amount_mismatch: 0,
    missing_on_portal: 0,
    duplicate: 0,
    gstin_mismatch: 0,
  };

  // 1. Exact Match (~40 records)
  for (let i = 0; i < 40; i++) {
    const vendor = VENDORS[i % VENDORS.length];
    const prefix = PREFIXES[i % PREFIXES.length];
    const invNum = `${prefix}${invoiceCounter++}`;
    const baseAmount = roundTwoDecimals(15000 + Math.random() * 450000);
    const taxAmount = roundTwoDecimals(baseAmount * 0.18);
    const invDate = getRandomDate(startDate, endDate);
    const filedDate = addDays(invDate, Math.floor(Math.random() * 10) + 2);

    const internal = await prisma.internalInvoice.create({
      data: {
        invoiceNumber: invNum,
        vendorGstin: vendor.gstin,
        vendorName: vendor.name,
        amount: baseAmount,
        taxAmount: taxAmount,
        invoiceDate: invDate,
        description: vendor.desc,
      },
    });

    const portal = await prisma.portalRecord.create({
      data: {
        invoiceNumber: invNum,
        vendorGstin: vendor.gstin,
        vendorName: vendor.name,
        amount: baseAmount,
        taxAmount: taxAmount,
        filedDate: filedDate,
      },
    });

    await prisma.groundTruth.create({
      data: {
        internalInvoiceId: internal.id,
        portalRecordId: portal.id,
        trueCategory: TrueCategory.exact_match,
        notes: `Exact match for invoice ${invNum} from ${vendor.name}`,
      },
    });

    categoryCounts.exact_match++;
  }

  // 2. Amount Mismatch (~12 records)
  for (let i = 0; i < 12; i++) {
    const vendor = VENDORS[(i + 5) % VENDORS.length];
    const prefix = PREFIXES[(i + 1) % PREFIXES.length];
    const invNum = `${prefix}${invoiceCounter++}`;
    const baseAmount = roundTwoDecimals(20000 + Math.random() * 300000);
    const taxAmount = roundTwoDecimals(baseAmount * 0.18);
    const invDate = getRandomDate(startDate, endDate);
    const filedDate = addDays(invDate, Math.floor(Math.random() * 12) + 3);

    // Amount differs by 1% to 5% (higher or lower)
    const variationPercent = (Math.random() > 0.5 ? 1 : -1) * (0.01 + Math.random() * 0.04);
    const portalAmount = roundTwoDecimals(baseAmount * (1 + variationPercent));
    const portalTaxAmount = roundTwoDecimals(portalAmount * 0.18);

    const internal = await prisma.internalInvoice.create({
      data: {
        invoiceNumber: invNum,
        vendorGstin: vendor.gstin,
        vendorName: vendor.name,
        amount: baseAmount,
        taxAmount: taxAmount,
        invoiceDate: invDate,
        description: vendor.desc,
      },
    });

    const portal = await prisma.portalRecord.create({
      data: {
        invoiceNumber: invNum,
        vendorGstin: vendor.gstin,
        vendorName: vendor.name,
        amount: portalAmount,
        taxAmount: portalTaxAmount,
        filedDate: filedDate,
      },
    });

    const diff = roundTwoDecimals(portalAmount - baseAmount);
    await prisma.groundTruth.create({
      data: {
        internalInvoiceId: internal.id,
        portalRecordId: portal.id,
        trueCategory: TrueCategory.amount_mismatch,
        notes: `Amount mismatch: Internal ₹${baseAmount} vs Portal ₹${portalAmount} (Diff: ₹${diff}, ${(variationPercent * 100).toFixed(2)}%)`,
      },
    });

    categoryCounts.amount_mismatch++;
  }

  // 3. Missing on Portal (~12 records)
  for (let i = 0; i < 12; i++) {
    const vendor = VENDORS[(i + 10) % VENDORS.length];
    const prefix = PREFIXES[(i + 2) % PREFIXES.length];
    const invNum = `${prefix}${invoiceCounter++}`;
    const baseAmount = roundTwoDecimals(10000 + Math.random() * 250000);
    const taxAmount = roundTwoDecimals(baseAmount * 0.18);
    const invDate = getRandomDate(startDate, endDate);

    const internal = await prisma.internalInvoice.create({
      data: {
        invoiceNumber: invNum,
        vendorGstin: vendor.gstin,
        vendorName: vendor.name,
        amount: baseAmount,
        taxAmount: taxAmount,
        invoiceDate: invDate,
        description: vendor.desc,
      },
    });

    await prisma.groundTruth.create({
      data: {
        internalInvoiceId: internal.id,
        portalRecordId: null,
        trueCategory: TrueCategory.missing_on_portal,
        notes: `Missing on Portal: Invoice ${invNum} from ${vendor.name} registered internally but not filed on GSTR portal`,
      },
    });

    categoryCounts.missing_on_portal++;
  }

  // 4. Duplicate Entry (~8 records - 1 Internal, 2 Portal)
  for (let i = 0; i < 8; i++) {
    const vendor = VENDORS[(i + 15) % VENDORS.length];
    const prefix = PREFIXES[(i + 3) % PREFIXES.length];
    const invNum = `${prefix}${invoiceCounter++}`;
    const baseAmount = roundTwoDecimals(30000 + Math.random() * 500000);
    const taxAmount = roundTwoDecimals(baseAmount * 0.18);
    const invDate = getRandomDate(startDate, endDate);
    const filedDate1 = addDays(invDate, 3);
    const filedDate2 = addDays(invDate, 15); // Re-filed later

    const internal = await prisma.internalInvoice.create({
      data: {
        invoiceNumber: invNum,
        vendorGstin: vendor.gstin,
        vendorName: vendor.name,
        amount: baseAmount,
        taxAmount: taxAmount,
        invoiceDate: invDate,
        description: vendor.desc,
      },
    });

    const portal1 = await prisma.portalRecord.create({
      data: {
        invoiceNumber: invNum,
        vendorGstin: vendor.gstin,
        vendorName: vendor.name,
        amount: baseAmount,
        taxAmount: taxAmount,
        filedDate: filedDate1,
      },
    });

    const portal2 = await prisma.portalRecord.create({
      data: {
        invoiceNumber: invNum,
        vendorGstin: vendor.gstin,
        vendorName: vendor.name,
        amount: baseAmount,
        taxAmount: taxAmount,
        filedDate: filedDate2,
      },
    });

    await prisma.groundTruth.create({
      data: {
        internalInvoiceId: internal.id,
        portalRecordId: portal1.id,
        trueCategory: TrueCategory.duplicate,
        notes: `Duplicate filing #1 for ${invNum} filed on ${filedDate1.toISOString().split('T')[0]}`,
      },
    });

    await prisma.groundTruth.create({
      data: {
        internalInvoiceId: internal.id,
        portalRecordId: portal2.id,
        trueCategory: TrueCategory.duplicate,
        notes: `Duplicate filing #2 for ${invNum} re-filed on ${filedDate2.toISOString().split('T')[0]}`,
      },
    });

    categoryCounts.duplicate++;
  }

  // 5. GSTIN Mismatch (~8 records)
  for (let i = 0; i < 8; i++) {
    const vendor = VENDORS[(i + 7) % VENDORS.length];
    const prefix = PREFIXES[(i + 4) % PREFIXES.length];
    const invNum = `${prefix}${invoiceCounter++}`;
    const baseAmount = roundTwoDecimals(25000 + Math.random() * 350000);
    const taxAmount = roundTwoDecimals(baseAmount * 0.18);
    const invDate = getRandomDate(startDate, endDate);
    const filedDate = addDays(invDate, Math.floor(Math.random() * 10) + 2);
    const corruptedGstin = alterGstin(vendor.gstin);

    const internal = await prisma.internalInvoice.create({
      data: {
        invoiceNumber: invNum,
        vendorGstin: vendor.gstin,
        vendorName: vendor.name,
        amount: baseAmount,
        taxAmount: taxAmount,
        invoiceDate: invDate,
        description: vendor.desc,
      },
    });

    const portal = await prisma.portalRecord.create({
      data: {
        invoiceNumber: invNum,
        vendorGstin: corruptedGstin,
        vendorName: vendor.name,
        amount: baseAmount,
        taxAmount: taxAmount,
        filedDate: filedDate,
      },
    });

    await prisma.groundTruth.create({
      data: {
        internalInvoiceId: internal.id,
        portalRecordId: portal.id,
        trueCategory: TrueCategory.gstin_mismatch,
        notes: `GSTIN mismatch for ${invNum}: Internal [${vendor.gstin}] vs Portal [${corruptedGstin}]`,
      },
    });

    categoryCounts.gstin_mismatch++;
  }

  console.log('\n======================================================');
  console.log('📊 SEED SUMMARY BY CATEGORY:');
  console.log('======================================================');
  console.log(`1. Exact Match        (exact_match):       ${categoryCounts.exact_match} invoice pairs`);
  console.log(`2. Amount Mismatch    (amount_mismatch):   ${categoryCounts.amount_mismatch} invoice pairs`);
  console.log(`3. Missing on Portal  (missing_on_portal): ${categoryCounts.missing_on_portal} invoice pairs`);
  console.log(`4. Duplicate Entry    (duplicate):         ${categoryCounts.duplicate} internal invoices (16 portal records)`);
  console.log(`5. GSTIN Mismatch     (gstin_mismatch):    ${categoryCounts.gstin_mismatch} invoice pairs`);
  console.log('------------------------------------------------------');
  console.log(`Total Scenario Sets Generated:              80 internal invoices`);
  console.log('======================================================\n');

  // Print 3 examples from EACH category
  const categories = Object.values(TrueCategory);

  for (const cat of categories) {
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`🔍 3 EXAMPLE RECORDS FOR CATEGORY: [ ${cat.toUpperCase()} ]`);
    console.log(`--------------------------------------------------------------------------------`);

    const groundTruths = await prisma.groundTruth.findMany({
      where: { trueCategory: cat },
      take: 3,
      include: {
        internalInvoice: true,
        portalRecord: true,
      },
    });

    groundTruths.forEach((gt, idx) => {
      console.log(`\nExample #${idx + 1} (GT ID: ${gt.id})`);
      console.log(`  Notes: ${gt.notes}`);
      if (gt.internalInvoice) {
        console.log(`  [Internal Invoice]`);
        console.log(`    ID:             ${gt.internalInvoice.id}`);
        console.log(`    Invoice No:     ${gt.internalInvoice.invoiceNumber}`);
        console.log(`    Vendor Name:    ${gt.internalInvoice.vendorName}`);
        console.log(`    Vendor GSTIN:   ${gt.internalInvoice.vendorGstin}`);
        console.log(`    Amount:         ₹${gt.internalInvoice.amount}`);
        console.log(`    Tax Amount:     ₹${gt.internalInvoice.taxAmount}`);
        console.log(`    Date:           ${gt.internalInvoice.invoiceDate.toISOString().split('T')[0]}`);
      } else {
        console.log(`  [Internal Invoice]: NONE`);
      }

      if (gt.portalRecord) {
        console.log(`  [Portal Record]`);
        console.log(`    ID:             ${gt.portalRecord.id}`);
        console.log(`    Invoice No:     ${gt.portalRecord.invoiceNumber}`);
        console.log(`    Vendor Name:    ${gt.portalRecord.vendorName}`);
        console.log(`    Vendor GSTIN:   ${gt.portalRecord.vendorGstin}`);
        console.log(`    Amount:         ₹${gt.portalRecord.amount}`);
        console.log(`    Tax Amount:     ₹${gt.portalRecord.taxAmount}`);
        console.log(`    Filed Date:     ${gt.portalRecord.filedDate.toISOString().split('T')[0]}`);
      } else {
        console.log(`  [Portal Record]: NONE (Missing on Portal)`);
      }
    });
  }
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
