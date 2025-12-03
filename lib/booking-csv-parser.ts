import { z } from 'zod';

// Input CSV row schema for Booking.com export - only required columns
export const BookingCSVRowSchema = z.object({
  propertyName: z.string().min(1, 'Property name is required'),
  bookerName: z.string().min(1, 'Booker name is required'), 
  departure: z.string().min(1, 'Departure date is required'),
  totalPayment: z.number().positive('Total payment must be positive'),
  // Optional fields for compatibility
  location: z.string().default(''),
  arrival: z.string().default(''),
  currency: z.string().default('EUR'),
  reservationNumber: z.string().default(''),
});

export type BookingCSVRow = z.infer<typeof BookingCSVRowSchema>;

// Accounting CSV output row schema
export const AccountingRowSchema = z.object({
  konto: z.string(),
  belegnr: z.string(),
  belegdat: z.string(), // YYYYMMDD format
  symbol: z.string().default('AR'),
  betrag: z.string(), // Formatted number
  steuer: z.string(), // Formatted number
  text: z.string(),
});

export type AccountingRow = z.infer<typeof AccountingRowSchema>;

// Tax calculation following exact formula
export interface TaxBreakdown {
  netto: number;
  vat: number;
  cityTax: number;
  brutto: number;
}

export function calculateAccountingTaxes(brutto: number): TaxBreakdown {
  // Use exact formula: netto = brutto / (1 + 0.032 + 0.10) = brutto / 1.132
  const netto = brutto / 1.132;
  let vat = netto * 0.10;
  const cityTax = netto * 0.032;
  
  // Round to 2 decimals
  const nettoRounded = Math.round(netto * 100) / 100;
  const vatRounded = Math.round(vat * 100) / 100;
  const cityTaxRounded = Math.round(cityTax * 100) / 100;
  
  // Ensure sum matches brutto, adjust VAT if needed
  const calculatedSum = nettoRounded + vatRounded + cityTaxRounded;
  const difference = Math.round((brutto - calculatedSum) * 100) / 100;
  
  const adjustedVat = Math.round((vatRounded + difference) * 100) / 100;
  
  return {
    netto: nettoRounded,
    vat: adjustedVat,
    cityTax: cityTaxRounded,
    brutto: brutto,
  };
}

export function parseBookingCSV(csvContent: string): BookingCSVRow[] {
  // Properly parse CSV content handling quoted fields with line breaks
  const rows = [];
  let currentRow = '';
  let insideQuotes = false;
  
  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    
    if (char === '"') {
      insideQuotes = !insideQuotes;
      currentRow += char;
    } else if (char === '\n' && !insideQuotes) {
      if (currentRow.trim()) {
        rows.push(currentRow.trim());
      }
      currentRow = '';
    } else {
      currentRow += char;
    }
  }
  
  // Add the last row if it exists
  if (currentRow.trim()) {
    rows.push(currentRow.trim());
  }
  
  if (rows.length < 2) {
    throw new Error('CSV must contain at least a header row and one data row');
  }

  // Parse header to identify columns - split by comma but respect quotes
  const headerRow = rows[0];
  const header = [];
  let currentField = '';
  let insideQuotesHeader = false;
  
  for (let i = 0; i < headerRow.length; i++) {
    const char = headerRow[i];
    
    if (char === '"') {
      insideQuotesHeader = !insideQuotesHeader;
    } else if (char === ',' && !insideQuotesHeader) {
      header.push(currentField.trim().replace(/['"]/g, ''));
      currentField = '';
    } else {
      currentField += char;
    }
  }
  
  // Add the last field
  if (currentField) {
    header.push(currentField.trim().replace(/['"]/g, ''));
  }
  
  console.log('DEBUG CSV Headers:', header);
  
  // Map exact column names from your CSV - already lowercase normalized
  const columnMapping: Record<string, string> = {
    'property name': 'propertyName',     
    'booker name': 'bookerName',         
    'departure': 'departure',            
    'total payment': 'totalPayment',     
  };

  // Find column indices
  const columnIndices: Record<string, number> = {};
  header.forEach((col, index) => {
    const normalizedCol = col.toLowerCase().trim();
    console.log(`DEBUG Column "${col}" (index ${index}) normalized to "${normalizedCol}"`);
    
    // Check if this normalized column exists in our mapping
    if (columnMapping[normalizedCol]) {
      const mappedName = columnMapping[normalizedCol];
      columnIndices[mappedName] = index;
      console.log(`DEBUG Mapped: "${col}" (index ${index}) -> ${mappedName}`);
    }
  });
  
  console.log('DEBUG Final column indices:', columnIndices);

  // Parse data rows
  const results: BookingCSVRow[] = [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    
    // Parse each row properly respecting quotes
    const values = [];
    let currentValue = '';
    let insideQuotesRow = false;
    
    for (let j = 0; j < row.length; j++) {
      const char = row[j];
      
      if (char === '"') {
        insideQuotesRow = !insideQuotesRow;
      } else if (char === ',' && !insideQuotesRow) {
        values.push(currentValue.trim().replace(/['"]/g, ''));
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    
    // Add the last value
    if (currentValue) {
      values.push(currentValue.trim().replace(/['"]/g, ''));
    }
    
    try {
      const rowData: any = {};
      
      // Extract values based on column mapping
      Object.keys(columnIndices).forEach(key => {
        const index = columnIndices[key];
        if (index < values.length) {
          let value = values[index];
          
          // Special handling for totalPayment - convert to number
          if (key === 'totalPayment') {
            // Remove currency symbols and convert to number
            // Handle both dot and comma decimal separators
            value = value.replace(/[€$£]/g, '').trim();
            // Replace comma with dot for proper parsing if it's used as decimal separator
            if (value.includes(',') && !value.includes('.')) {
              value = value.replace(',', '.');
            } else if (value.includes(',') && value.includes('.')) {
              // European format like 1.234,56 - remove thousand separator dots, keep comma as decimal
              value = value.replace(/\./g, '').replace(',', '.');
            }
            rowData[key] = parseFloat(value) || 0;
          } else {
            rowData[key] = value;
          }
        }
      });
      
      // Validate and add to results
      const validatedRow = BookingCSVRowSchema.parse(rowData);
      results.push(validatedRow);
    } catch (error) {
      console.warn(`Skipping invalid row ${i}: ${error}`);
    }
  }
  
  if (results.length === 0) {
    throw new Error('No valid reservation rows found in CSV');
  }
  
  return results;
}

export function formatDecimal(num: number, useComma: boolean = false): string {
  // Ensure we have a valid number
  if (isNaN(num) || num === null || num === undefined) {
    return useComma ? '0,00' : '0.00';
  }
  
  const formatted = Number(num).toFixed(2);
  return useComma ? formatted.replace('.', ',') : formatted;
}

export function formatDate(dateStr: string): string {
  // Parse various date formats and convert to YYYYMMDD
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}${month}${day}`;
}

export function getLocationShort(propertyName: string): string {
  const name = propertyName.trim();
  
  // Map property names to short codes as specified
  const propertyMapping: Record<string, string> = {
    'Home Sweet Home - Vienna Central': 'BEGA',
    'Home Sweet Home - State Opera': 'WAFG',
    'Home Sweet Home - Leopold': 'LAS',
    'Home Sweet Home - Stephansdom': 'KRA',
    'Home Sweet Home - Stephansdom II': 'BM',
    'Margot': 'KLIE',
    'Denube Suites': 'LAMM',
    'Céleste Suites': 'ZIMM'
  };
  
  // Check exact match first
  if (propertyMapping[name]) {
    return propertyMapping[name];
  }
  
  // Partial matches as fallback (case insensitive)
  const lowerName = name.toLowerCase();
  if (lowerName.includes('vienna central')) return 'BEGA';
  if (lowerName.includes('state opera')) return 'WAFG';
  if (lowerName.includes('leopold')) return 'LAS';
  if (lowerName.includes('stephansdom ii')) return 'BM';
  if (lowerName.includes('stephansdom')) return 'KRA';
  if (lowerName.includes('margot')) return 'KLIE';
  if (lowerName.includes('denube')) return 'LAMM';
  if (lowerName.includes('céleste') || lowerName.includes('celeste')) return 'ZIMM';
  
  // Fallback - return original name if no match
  return name;
}

export function generateAccountingCSV(
  bookingRows: BookingCSVRow[],
  startBelegnr: number,
  useCommaDecimal: boolean = false
): string {
  const accountingRows: AccountingRow[] = [];
  let currentBelegnr = startBelegnr;
  
  for (const booking of bookingRows) {
    const belegnr = currentBelegnr.toString();
    const belegdat = formatDate(booking.departure);
    const taxes = calculateAccountingTaxes(booking.totalPayment);
    // Use property name from CSV to get the correct property code
    const propertyCode = getLocationShort(booking.propertyName);
    const text = `${belegnr} ${propertyCode} ${booking.bookerName} Booking.com`;
    
    // Row A: Revenue account
    accountingRows.push({
      konto: '200000',
      belegnr,
      belegdat,
      symbol: 'AR',
      betrag: formatDecimal(taxes.brutto, useCommaDecimal),
      steuer: formatDecimal(0, useCommaDecimal),
      text,
    });
    
    // Row B: Net revenue (negative) with VAT
    accountingRows.push({
      konto: '8001',
      belegnr,
      belegdat,
      symbol: 'AR',
      betrag: formatDecimal(-taxes.netto, useCommaDecimal),
      steuer: formatDecimal(-taxes.vat, useCommaDecimal),
      text,
    });
    
    // Row C: City tax (negative)
    accountingRows.push({
      konto: '8003',
      belegnr,
      belegdat,
      symbol: 'AR',
      betrag: formatDecimal(-taxes.cityTax, useCommaDecimal),
      steuer: formatDecimal(0, useCommaDecimal),
      text,
    });
    
    currentBelegnr++;
  }
  
  // Generate CSV as single column with semicolon-separated values
  const csvLines = ['konto;belegnr;belegdat;symbol;betrag;steuer;text'];
  
  for (const row of accountingRows) {
    // Put everything as one quoted cell so semicolons are treated as content
    const line = `"${row.konto};${row.belegnr};${row.belegdat};${row.symbol};${row.betrag};${row.steuer};${row.text}"`;
    csvLines.push(line);
  }
  
  return csvLines.join('\n');
}