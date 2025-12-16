import csv from 'csv-parser';
import { Readable } from 'stream';
import { CSVRow, CSVRowSchema, CSVParseResult } from './types';

// Column mapping for Booking.com CSV formats (including payout format)
const COLUMN_MAPPINGS = {
  reservationId: [
    'Reference number', 'Reservation ID', 'Booking ID', 'ReservationID', 'BookingID', 'ID'
  ],
  guestName: [
    'Guest name', 'Guest Name', 'Guest', 'Customer Name', 'Customer', 'Name'
  ],
  checkInDate: [
    'Check-in', 'Check-in Date', 'Arrival', 'CheckIn', 'Check In Date'
  ],
  checkOutDate: [
    'Checkout', 'Check-out Date', 'Departure', 'Check-out', 'CheckOut', 'Check Out Date'
  ],
  amountPaidGross: [
    'Amount', 'Gross Amount', 'Total', 'Total Amount', 'Price', 'Gross Price'
  ],
  currency: ['Currency', 'Curr'],
  guestAddress: ['Address', 'Guest Address', 'Customer Address'],
  country: ['Country', 'Guest Country', 'Customer Country'],
  nights: ['Nights', 'Number of Nights', 'Stay Duration']
};

// Additional columns that might be present but we don't need for invoice generation
const IGNORED_COLUMNS = [
  'Type', 'Reservation status', 'Payment status', 'Commission', 
  'Payments Service Fee', 'Net', 'Payout date', 'Payout ID'
];

function findColumnName(headers: string[], possibleNames: string[]): string | null {
  for (const possible of possibleNames) {
    const found = headers.find(header => 
      header.toLowerCase().trim() === possible.toLowerCase().trim()
    );
    if (found) return found;
  }
  return null;
}

function parseDate(dateString: string): string {
  if (!dateString) return '';
  
  // Try different date formats
  const formats = [
    /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
    /^\d{2}\/\d{2}\/\d{4}$/, // DD/MM/YYYY or MM/DD/YYYY
    /^\d{2}\.\d{2}\.\d{4}$/, // DD.MM.YYYY
    /^\d{1,2}\s+\w{3}\s+\d{4}$/, // D MMM YYYY or DD MMM YYYY (e.g., "30 Jun 2025")
  ];

  const cleaned = dateString.trim();
  
  // If already in ISO format, return as is
  if (formats[0].test(cleaned)) {
    return cleaned;
  }

  // Handle "D MMM YYYY" format (e.g., "30 Jun 2025")
  if (formats[3].test(cleaned)) {
    const date = new Date(cleaned);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }

  // Try to parse other formats
  let date: Date;
  
  if (formats[1].test(cleaned)) {
    // Assume DD/MM/YYYY for European format
    const [day, month, year] = cleaned.split('/');
    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  } else if (formats[2].test(cleaned)) {
    // DD.MM.YYYY
    const [day, month, year] = cleaned.split('.');
    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  } else {
    // Fallback to native parsing
    date = new Date(cleaned);
  }

  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateString}`);
  }

  return date.toISOString().split('T')[0];
}

function parseAmount(amountString: string): number {
  if (!amountString) return 0;
  
  // Remove any currency symbols and thousands separators
  const cleaned = amountString.replace(/[€$£¥₹,]/g, '').trim();
  const amount = parseFloat(cleaned);
  return isNaN(amount) ? 0 : amount;
}

function extractCurrency(priceString: string): string {
  if (!priceString) return 'EUR';
  
  // Look for currency codes
  const currencyMatch = priceString.match(/\b(EUR|USD|GBP|CHF|CAD|AUD|JPY|CNY)\b/i);
  if (currencyMatch) {
    return currencyMatch[1].toUpperCase();
  }
  
  // Look for currency symbols
  if (priceString.includes('€')) return 'EUR';
  if (priceString.includes('$')) return 'USD';
  if (priceString.includes('£')) return 'GBP';
  
  return 'EUR'; // Default fallback
}

function mapRow(rawRow: any, columnMapping: Record<string, string>): any {
  const mapped: any = {};
  
  // Map known columns
  for (const [fieldName, columnName] of Object.entries(columnMapping)) {
    if (columnName && rawRow[columnName] !== undefined) {
      mapped[fieldName] = rawRow[columnName];
    }
  }
  
  return mapped;
}

function validateAndTransformRow(mappedRow: any): CSVRow {
  // Extract currency from price field if currency column is not available
  let currency = mappedRow.currency?.toString() || '';
  if (!currency && mappedRow.amountPaidGross) {
    currency = extractCurrency(mappedRow.amountPaidGross.toString());
  }
  
  // Transform data before validation
  const transformed = {
    reservationId: mappedRow.reservationId?.toString() || '',
    guestName: mappedRow.guestName?.toString() || 'Booking.com Guest',
    checkInDate: mappedRow.checkInDate ? parseDate(mappedRow.checkInDate.toString()) : '',
    checkOutDate: mappedRow.checkOutDate ? parseDate(mappedRow.checkOutDate.toString()) : '',
    amountPaidGross: mappedRow.amountPaidGross ? parseAmount(mappedRow.amountPaidGross.toString()) : 0,
    currency: currency || 'EUR',
    guestAddress: mappedRow.guestAddress?.toString() || undefined,
    country: mappedRow.country?.toString() || undefined,
    nights: mappedRow.nights ? parseInt(mappedRow.nights.toString()) : undefined,
  };

  // Validate with Zod schema
  return CSVRowSchema.parse(transformed);
}

export async function parseCSV(fileBuffer: Buffer): Promise<CSVParseResult> {
  const validRows: CSVRow[] = [];
  const invalidRows: { row: any; errors: string[] }[] = [];
  
  return new Promise((resolve, reject) => {
    const stream = Readable.from(fileBuffer);
    let headers: string[] = [];
    let columnMapping: Record<string, string> = {};
    let isFirstRow = true;
    
    stream
      .pipe(csv())
      .on('headers', (headerList: string[]) => {
        headers = headerList;
        
        // Create column mapping
        for (const [fieldName, possibleNames] of Object.entries(COLUMN_MAPPINGS)) {
          const foundColumn = findColumnName(headers, possibleNames);
          if (foundColumn) {
            columnMapping[fieldName] = foundColumn;
          }
        }
      })
      .on('data', (rawRow) => {
        if (isFirstRow) {
          isFirstRow = false;
          // Skip if it looks like a header row repeated
          const firstValue = Object.values(rawRow)[0]?.toString().toLowerCase();
          if (firstValue && headers.some(h => h.toLowerCase().includes(firstValue))) {
            return;
          }
        }

        try {
          // Skip non-reservation rows (e.g., other types in payout CSV)
          if (rawRow.Type && rawRow.Type !== 'Reservation') {
            return;
          }

          const mappedRow = mapRow(rawRow, columnMapping);
          
          // Skip negative amounts (refunds/cancellations)
          const amount = parseAmount(mappedRow.amountPaidGross?.toString() || '0');
          if (amount <= 0) {
            invalidRows.push({
              row: rawRow,
              errors: ['Skipped: Negative amount (likely refund/cancellation)']
            });
            return;
          }

          const validRow = validateAndTransformRow(mappedRow);
          validRows.push(validRow);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
          invalidRows.push({
            row: rawRow,
            errors: [errorMessage]
          });
        }
      })
      .on('end', () => {
        resolve({
          validRows,
          invalidRows,
          summary: {
            total: validRows.length + invalidRows.length,
            valid: validRows.length,
            invalid: invalidRows.length,
          }
        });
      })
      .on('error', reject);
  });
}

export function generateColumnMappingReport(fileBuffer: Buffer): Promise<{
  detectedHeaders: string[];
  suggestedMapping: Record<string, string | null>;
  unmappedHeaders: string[];
}> {
  return new Promise((resolve, reject) => {
    const stream = Readable.from(fileBuffer);
    
    stream
      .pipe(csv())
      .on('headers', (headers: string[]) => {
        const suggestedMapping: Record<string, string | null> = {};
        const unmappedHeaders: string[] = [];
        
        // Find mappings for known fields
        for (const [fieldName, possibleNames] of Object.entries(COLUMN_MAPPINGS)) {
          const foundColumn = findColumnName(headers, possibleNames);
          suggestedMapping[fieldName] = foundColumn;
        }
        
        // Find unmapped headers
        const mappedColumns = Object.values(suggestedMapping).filter(Boolean);
        for (const header of headers) {
          if (!mappedColumns.includes(header)) {
            unmappedHeaders.push(header);
          }
        }
        
        resolve({
          detectedHeaders: headers,
          suggestedMapping,
          unmappedHeaders
        });
      })
      .on('error', reject);
  });
}