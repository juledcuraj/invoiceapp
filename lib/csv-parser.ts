import { CSVRow, CSVRowSchema, CSVParseResult } from './types';

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
  
  try {
    const content = fileBuffer.toString('utf-8');
    const rows = parseCSVContent(content);
    
    if (rows.length === 0) {
      return {
        validRows: [],
        invalidRows: [],
        summary: { total: 0, valid: 0, invalid: 0 }
      };
    }
    
    // Get headers from first parsed row
    const headers = Object.keys(rows[0]);
    
    // Create column mapping
    const columnMapping: Record<string, string> = {};
    for (const [fieldName, possibleNames] of Object.entries(COLUMN_MAPPINGS)) {
      const foundColumn = findColumnName(headers, possibleNames);
      if (foundColumn) {
        columnMapping[fieldName] = foundColumn;
      }
    }
    
    // Process each row
    for (const rawRow of rows) {
      try {
        // Skip non-reservation rows (e.g., other types in payout CSV)
        if (rawRow.Type && rawRow.Type !== 'Reservation') {
          continue;
        }

        const mappedRow = mapRow(rawRow, columnMapping);
        
        // Skip negative amounts (refunds/cancellations)
        const amount = parseAmount(mappedRow.amountPaidGross?.toString() || '0');
        if (amount <= 0) {
          invalidRows.push({
            row: rawRow,
            errors: ['Skipped: Negative amount (likely refund/cancellation)']
          });
          continue;
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
    }
    
    return {
      validRows,
      invalidRows,
      summary: {
        total: validRows.length + invalidRows.length,
        valid: validRows.length,
        invalid: invalidRows.length,
      }
    };
  } catch (error) {
    throw new Error(`CSV parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function generateColumnMappingReport(fileBuffer: Buffer): Promise<{
  detectedHeaders: string[];
  suggestedMapping: Record<string, string | null>;
  unmappedHeaders: string[];
}> {
  try {
    const content = fileBuffer.toString('utf-8');
    const rows = parseCSVContent(content);
    
    if (rows.length === 0) {
      return {
        detectedHeaders: [],
        suggestedMapping: {},
        unmappedHeaders: []
      };
    }
    
    const headers = Object.keys(rows[0]);
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
    
    return {
      detectedHeaders: headers,
      suggestedMapping,
      unmappedHeaders
    };
  } catch (error) {
    throw new Error(`Column mapping analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}