import { CSVRow, CSVParseResult } from './types';

/**
 * Custom CSV parser to replace csv-parser dependency
 */
function parseCSVContent(content: string): any[] {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  
  const headers = parseCSVLine(lines[0]);
  const rows: any[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;
    
    const row: any = {};
    headers.forEach((header, index) => {
      row[header.trim()] = values[index] || '';
    });
    rows.push(row);
  }
  
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < line.length) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
    i++;
  }
  
  result.push(current.trim());
  return result;
}

// Specific columns we need for invoice generation from Booking.com payout CSV
export interface PayoutCSVRow {
  type: string;
  referenceNumber: string;
  checkIn: string;
  checkout: string;
  guestName: string;
  reservationStatus: string;
  currency: string;
  paymentStatus: string;
  amount: string;
}

// Only extract the columns we need for invoice generation
const REQUIRED_COLUMNS = {
  type: 'Type',
  referenceNumber: 'Reference number',
  checkIn: 'Check-in',
  checkout: 'Checkout',
  guestName: 'Guest name',
  reservationStatus: 'Reservation status',
  currency: 'Currency',
  paymentStatus: 'Payment status',
  amount: 'Amount'
};

function parsePayoutDate(dateString: string): string {
  if (!dateString) return '';
  
  const cleaned = dateString.trim();
  
  // Handle "D MMM YYYY" format (e.g., "30 Jun 2025")
  const date = new Date(cleaned);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }
  
  throw new Error(`Invalid date format: ${dateString}`);
}

function parsePayoutAmount(amountString: string): number {
  if (!amountString) return 0;
  
  // Remove any non-numeric characters except decimal point and minus sign
  const cleaned = amountString.replace(/[^\d.-]/g, '');
  const amount = parseFloat(cleaned);
  
  if (isNaN(amount)) {
    throw new Error(`Invalid amount format: ${amountString}`);
  }
  
  return amount;
}

function transformPayoutRowToCSVRow(payoutRow: PayoutCSVRow): CSVRow {
  // Calculate nights from dates
  const checkInDate = new Date(payoutRow.checkIn);
  const checkOutDate = new Date(payoutRow.checkout);
  const diffTime = checkOutDate.getTime() - checkInDate.getTime();
  const nights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  return {
    reservationId: payoutRow.referenceNumber,
    guestName: payoutRow.guestName || 'Booking.com Guest',
    checkInDate: parsePayoutDate(payoutRow.checkIn),
    checkOutDate: parsePayoutDate(payoutRow.checkout),
    amountPaidGross: parsePayoutAmount(payoutRow.amount),
    currency: payoutRow.currency || 'EUR',
    guestAddress: undefined,
    country: undefined,
    nights: nights
  };
}

export async function parsePayoutCSV(fileBuffer: Buffer): Promise<CSVParseResult> {
  const validRows: CSVRow[] = [];
  const invalidRows: { row: any; errors: string[] }[] = [];
  
  try {
    const content = fileBuffer.toString('utf-8');
    const rows = parseCSVContent(content);
    
    for (const rawRow of rows) {
      try {
        // Only process reservation rows
        if (rawRow.Type !== 'Reservation') {
          continue;
        }

        // Check if reservation status is OK
        if (rawRow['Reservation status'] !== 'ok') {
          invalidRows.push({
            row: rawRow,
            errors: [`Skipped: Reservation status is '${rawRow['Reservation status']}', not 'ok'`]
          });
          continue;
        }

        // Extract only required columns
        const payoutRow: PayoutCSVRow = {
          type: rawRow[REQUIRED_COLUMNS.type] || '',
          referenceNumber: rawRow[REQUIRED_COLUMNS.referenceNumber] || '',
          checkIn: rawRow[REQUIRED_COLUMNS.checkIn] || '',
          checkout: rawRow[REQUIRED_COLUMNS.checkout] || '',
          guestName: rawRow[REQUIRED_COLUMNS.guestName] || '',
          reservationStatus: rawRow[REQUIRED_COLUMNS.reservationStatus] || '',
          currency: rawRow[REQUIRED_COLUMNS.currency] || '',
          paymentStatus: rawRow[REQUIRED_COLUMNS.paymentStatus] || '',
          amount: rawRow[REQUIRED_COLUMNS.amount] || ''
        };

        // Skip if amount is negative or zero (refunds/cancellations)
        const amount = parsePayoutAmount(payoutRow.amount);
        if (amount <= 0) {
          invalidRows.push({
            row: rawRow,
            errors: [`Skipped: Negative or zero amount (${amount}) - likely refund/cancellation`]
          });
          continue;
        }

        // Transform to standard CSV row format
        const csvRow = transformPayoutRowToCSVRow(payoutRow);
        validRows.push(csvRow);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
        invalidRows.push({
          row: rawRow,
          errors: [errorMessage]
        });
      }
    }
    
    return {
      validRows,
      invalidRows,
      summary: {
        total: rows.length,
        valid: validRows.length,
        invalid: invalidRows.length,
      }
    };
  } catch (error) {
    throw new Error(`Payout CSV parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Export both parsers for flexibility
export { parseCSV as parseGenericCSV } from './csv-parser';