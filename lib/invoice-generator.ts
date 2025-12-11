import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import archiver from 'archiver';
import { format } from 'date-fns';
import { Invoice, CSVRow, Property, Company, InvoiceGenerationResult } from './types';
import { calculateTaxes, formatCurrency } from './tax-calculator';
import { getNextInvoiceNumber } from './storage';

const TEMPLATE_PATH = path.join(process.cwd(), 'templates', 'invoice-template.html');

async function loadInvoiceTemplate(): Promise<string> {
  try {
    return await fs.readFile(TEMPLATE_PATH, 'utf-8');
  } catch (error) {
    throw new Error('Invoice template not found. Please ensure templates/invoice-template.html exists.');
  }
}

function createInvoiceData(
  csvRow: CSVRow,
  property: Property,
  company: Company,
  invoiceNumber: string
): Invoice {
  const checkInDate = new Date(csvRow.checkInDate);
  const checkOutDate = new Date(csvRow.checkOutDate);
  const invoiceDate = format(checkOutDate, 'yyyy-MM-dd'); // Use checkout date as invoice date
  
  // Calculate nights if not provided
  let nights = csvRow.nights;
  if (!nights) {
    const diffTime = checkOutDate.getTime() - checkInDate.getTime();
    nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Calculate taxes
  const amounts = calculateTaxes(
    csvRow.amountPaidGross,
    property.vatRate,
    property.cityTaxRate,
    property.cityTaxHandling
  );

  const invoice: Invoice = {
    invoiceNumber,
    invoiceDate,
    property,
    company,
    guest: {
      name: csvRow.guestName,
      address: csvRow.guestAddress,
      country: csvRow.country,
    },
    service: {
      description: 'Beherbergung / Nächtigung',
      period: `${format(checkInDate, 'dd.MM.yyyy')} - ${format(checkOutDate, 'dd.MM.yyyy')}`,
      checkInDate: csvRow.checkInDate,
      checkOutDate: csvRow.checkOutDate,
      nights,
    },
    amounts: {
      ...amounts,
      currency: csvRow.currency,
    },
    reservationId: csvRow.reservationId,
  };

  return invoice;
}

function renderInvoiceHTML(invoice: Invoice, template: string): string {
  const formatAmount = (amount: number) => formatCurrency(amount, invoice.amounts.currency);
  
  return template
    // Company details
    .replace(/{{company\.legalName}}/g, invoice.company.legalName)
    .replace(/{{company\.address}}/g, invoice.company.address.replace(/\n/g, '<br>'))
    .replace(/{{company\.email}}/g, invoice.company.email)
    .replace(/{{company\.phone}}/g, invoice.company.phone)
    .replace(/{{company\.taxId}}/g, invoice.company.taxId)
    .replace(/{{company\.bankName}}/g, invoice.company.bankDetails.bankName)
    .replace(/{{company\.iban}}/g, invoice.company.bankDetails.iban)
    .replace(/{{company\.bic}}/g, invoice.company.bankDetails.bic)
    .replace(/{{company\.footerText}}/g, invoice.company.footerText || '')
    
    // Property details
    .replace(/{{property\.name}}/g, invoice.property.name)
    .replace(/{{property\.address}}/g, invoice.property.address.replace(/\n/g, '<br>'))
    .replace(/{{property\.serviceFee}}/g, formatCurrency(invoice.property.serviceFee || 0, invoice.amounts.currency))
    
    // Invoice details
    .replace(/{{invoice\.number}}/g, invoice.invoiceNumber)
    .replace(/{{invoice\.date}}/g, format(new Date(invoice.invoiceDate), 'dd.MM.yyyy'))
    
    // Guest details
    .replace(/{{guest\.name}}/g, invoice.guest.name)
    .replace(/{{guest\.address}}/g, invoice.guest.address || '')
    .replace(/{{guest\.country}}/g, invoice.guest.country || '')
    
    // Service details
    .replace(/{{service\.description}}/g, invoice.service.description)
    .replace(/{{service\.period}}/g, invoice.service.period)
    .replace(/{{service\.nights}}/g, invoice.service.nights?.toString() || '1')
    
    // Amounts
    .replace(/{{amounts\.net}}/g, formatAmount(invoice.amounts.netAmount))
    .replace(/{{amounts\.vat}}/g, formatAmount(invoice.amounts.vatAmount))
    .replace(/{{amounts\.gross}}/g, formatAmount(invoice.amounts.grossAmount))
    .replace(/{{amounts\.cityTax}}/g, formatAmount(invoice.amounts.cityTaxAmount))
    .replace(/{{amounts\.total}}/g, formatAmount(invoice.amounts.totalAmount))
    .replace(/{{amounts\.currency}}/g, invoice.amounts.currency)
    
    // Tax rates
    .replace(/{{vatRate}}/g, (invoice.property.vatRate * 100).toFixed(1))
    .replace(/{{cityTaxRate}}/g, (invoice.property.cityTaxRate * 100).toFixed(1))
    
    // Reservation ID
    .replace(/{{reservationId}}/g, invoice.reservationId);
}

async function generatePDFFromHTML(html: string): Promise<Buffer> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.setContent(html, { waitUntil: 'networkidle' });
  
  const pdfBuffer = await page.pdf({
    format: 'A4',
    margin: {
      top: '1cm',
      right: '1cm',
      bottom: '1cm',
      left: '1cm'
    },
    printBackground: true,
  });
  
  await browser.close();
  return pdfBuffer;
}

function generateSummaryCSV(invoices: Invoice[]): string {
  const headers = [
    'Invoice Number',
    'Invoice Date',
    'Reservation ID',
    'Guest Name',
    'Check-in Date',
    'Check-out Date',
    'Nights',
    'Net Amount',
    'VAT Amount',
    'Gross Amount',
    'City Tax Amount',
    'Total Amount',
    'Currency'
  ];

  const rows = invoices.map(invoice => [
    invoice.invoiceNumber,
    format(new Date(invoice.invoiceDate), 'dd.MM.yyyy'),
    invoice.reservationId,
    invoice.guest.name,
    format(new Date(invoice.service.checkInDate), 'dd.MM.yyyy'),
    format(new Date(invoice.service.checkOutDate), 'dd.MM.yyyy'),
    invoice.service.nights?.toString() || '1',
    invoice.amounts.netAmount.toFixed(2),
    invoice.amounts.vatAmount.toFixed(2),
    invoice.amounts.grossAmount.toFixed(2),
    invoice.amounts.cityTaxAmount.toFixed(2),
    invoice.amounts.totalAmount.toFixed(2),
    invoice.amounts.currency
  ]);

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

export async function generateInvoices(
  csvRows: CSVRow[],
  property: Property,
  company: Company
): Promise<InvoiceGenerationResult> {
  const errors: string[] = [];
  const invoices: Invoice[] = [];
  const pdfBuffers: { filename: string; buffer: Buffer }[] = [];

  try {
    const template = await loadInvoiceTemplate();

    for (const csvRow of csvRows) {
      try {
        // Generate invoice number
        const invoiceNumber = await getNextInvoiceNumber(property.id);
        
        // Create invoice data
        const invoice = createInvoiceData(csvRow, property, company, invoiceNumber);
        invoices.push(invoice);

        // Generate PDF
        const html = renderInvoiceHTML(invoice, template);
        const pdfBuffer = await generatePDFFromHTML(html);
        
        pdfBuffers.push({
          filename: `${invoice.invoiceNumber}.pdf`,
          buffer: pdfBuffer
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Error processing reservation ${csvRow.reservationId}: ${errorMessage}`);
      }
    }

    // Generate summary CSV
    const summaryCSV = generateSummaryCSV(invoices);

    // Create ZIP file
    const zipBuffer = await createZipFile(pdfBuffers, summaryCSV);

    return {
      success: errors.length === 0,
      invoices,
      errors,
      zipBuffer,
      summaryCSV
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      invoices: [],
      errors: [errorMessage]
    };
  }
}

async function createZipFile(
  pdfBuffers: { filename: string; buffer: Buffer }[],
  summaryCSV: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    // Add PDF files
    pdfBuffers.forEach(({ filename, buffer }) => {
      archive.append(buffer, { name: filename });
    });

    // Add summary CSV
    archive.append(summaryCSV, { name: 'invoice-summary.csv' });

    archive.finalize();
  });
}