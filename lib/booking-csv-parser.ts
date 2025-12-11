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

// Input CSV row schema for Airbnb export
export const AirbnbCSVRowSchema = z.object({
  guestName: z.string().min(1, 'Guest name is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  listing: z.string().min(1, 'Listing is required'),
  earnings: z.number().positive('Earnings must be positive'),
  // Optional fields for compatibility
  confirmationCode: z.string().default(''),
  status: z.string().default(''),
  contact: z.string().default(''),
  adults: z.number().default(0),
  children: z.number().default(0),
  infants: z.number().default(0),
  nights: z.number().default(0),
});

export type AirbnbCSVRow = z.infer<typeof AirbnbCSVRowSchema>;

// Unified reservation interface for processing
export interface UnifiedReservation {
  propertyName: string;
  bookerName: string;
  departure: string;
  totalPayment: number;
  source: 'Booking.com' | 'AirBnB';
  arrival?: string;
  currency?: string;
  reservationNumber?: string;
}

export type ReservationSource = 'booking' | 'airbnb';

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

export function parseAirbnbCSV(csvContent: string): AirbnbCSVRow[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have at least header and one data row');
  }

  // Parse header row with proper quote handling
  const headerRow = lines[0];
  const header: string[] = [];
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

  console.log('DEBUG Airbnb CSV Headers:', header);
  
  // Map exact column names from Airbnb CSV
  const columnMapping: Record<string, string> = {
    'guest name': 'guestName',
    'start date': 'startDate', 
    'end date': 'endDate',
    'listing': 'listing',
    'earnings': 'earnings',
    'confirmation code': 'confirmationCode',
    'status': 'status',
    'contact': 'contact',
    '# of adults': 'adults',
    '# of children': 'children', 
    '# of infants': 'infants',
    '# of nights booked': 'nights',
  };

  // Find column indices
  const columnIndices: Record<string, number> = {};
  header.forEach((col, index) => {
    const normalizedCol = col.toLowerCase().trim();
    console.log(`DEBUG Airbnb Column "${col}" (index ${index}) normalized to "${normalizedCol}"`);
    
    if (columnMapping[normalizedCol]) {
      const mappedName = columnMapping[normalizedCol];
      columnIndices[mappedName] = index;
      console.log(`DEBUG Airbnb Mapped: "${col}" (index ${index}) -> ${mappedName}`);
    }
  });
  
  console.log('DEBUG Airbnb Final column indices:', columnIndices);

  // Parse data rows similar to booking parser
  const rows = csvContent.split('\n').map(line => {
    const fields: string[] = [];
    let currentField = '';
    let insideQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        insideQuotes = !insideQuotes;
        currentField += char;
      } else if (char === ',' && !insideQuotes) {
        fields.push(currentField.replace(/^"|"$/g, ''));
        currentField = '';
      } else {
        currentField += char;
      }
    }
    
    if (currentField) {
      fields.push(currentField.replace(/^"|"$/g, ''));
    }
    
    return fields;
  });

  const results: AirbnbCSVRow[] = [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || row.every(cell => !cell.trim())) continue;
    
    try {
      const rowData: any = {};
      
      // Extract required fields
      Object.entries(columnIndices).forEach(([fieldName, columnIndex]) => {
        const cellValue = row[columnIndex]?.trim() || '';
        
        if (fieldName === 'earnings') {
          // Parse earnings like "â‚¬297.5" or "€297.5" to number
          const numericValue = cellValue.replace(/[^0-9.,]/g, '').replace(',', '.');
          rowData[fieldName] = parseFloat(numericValue) || 0;
        } else if (['adults', 'children', 'infants', 'nights'].includes(fieldName)) {
          rowData[fieldName] = parseInt(cellValue) || 0;
        } else {
          rowData[fieldName] = cellValue;
        }
      });
      
      // Validate and add to results
      const validatedRow = AirbnbCSVRowSchema.parse(rowData);
      results.push(validatedRow);
    } catch (error) {
      console.warn(`Skipping invalid Airbnb row ${i}: ${error}`);
    }
  }
  
  if (results.length === 0) {
    throw new Error('No valid Airbnb reservation rows found in CSV');
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

export function getLocationShort(propertyName: string, source: 'Booking.com' | 'AirBnB' = 'Booking.com'): string {
  const name = propertyName.trim();
  
  if (source === 'AirBnB') {
    // Map Airbnb listing names to short codes
    const airbnbMapping: Record<string, string> = {
      '2 Bedroom + Balcony, Leopold': 'LAS',
      '2 Bedroom Flat with Terrace, Close to U1': 'LAMM',
      '2 Bedroom Superior Apt + Balcony': 'LAS',
      '5 Star Apartment – 7 Min to Center': 'LAS',
      'Central Vienna Stay Near Main Station': 'LAS',
      'Elegant 2 Bedroom Flat, Bright & Peaceful': 'LAMM',
      'Grand Viennese Apartment with Balcony': 'ZIMM',
      'Large Apartment with a Balcony – 7 Min to Center': 'LAS',
      'Spacious Central Penthouse': 'LAS',
      'Spacious Gem in Vienna\'s Center': 'BEGA',
    };
    
    if (airbnbMapping[name]) {
      return airbnbMapping[name];
    }
    
    // Fallback for partial matches
    const lowerName = name.toLowerCase();
    if (lowerName.includes('central') && lowerName.includes('penthouse')) return 'LAS';
    if (lowerName.includes('spacious') && lowerName.includes('gem')) return 'BEGA';
    if (lowerName.includes('grand') && lowerName.includes('viennese')) return 'ZIMM';
    if (lowerName.includes('elegant') && lowerName.includes('peaceful')) return 'LAMM';
    if (lowerName.includes('terrace') && lowerName.includes('u1')) return 'LAMM';
    if (lowerName.includes('leopold')) return 'LAS';
    if (lowerName.includes('7 min') || lowerName.includes('center')) return 'LAS';
    
    return name; // Fallback to original name
  }
  
  // Map Booking.com property names to short codes as specified
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

export function convertToUnifiedReservations(
  bookingRows: BookingCSVRow[] = [],
  airbnbRows: AirbnbCSVRow[] = []
): UnifiedReservation[] {
  const unified: UnifiedReservation[] = [];
  
  // Convert Booking.com rows
  bookingRows.forEach(booking => {
    unified.push({
      propertyName: booking.propertyName,
      bookerName: booking.bookerName,
      departure: booking.departure,
      totalPayment: booking.totalPayment,
      source: 'Booking.com',
      arrival: booking.arrival,
      currency: booking.currency,
      reservationNumber: booking.reservationNumber,
    });
  });
  
  // Convert Airbnb rows
  airbnbRows.forEach(airbnb => {
    unified.push({
      propertyName: airbnb.listing,
      bookerName: airbnb.guestName,
      departure: airbnb.endDate,
      totalPayment: airbnb.earnings,
      source: 'AirBnB',
      arrival: airbnb.startDate,
      currency: 'EUR',
      reservationNumber: airbnb.confirmationCode,
    });
  });
  
  // Sort by departure date
  unified.sort((a, b) => {
    const dateA = new Date(a.departure);
    const dateB = new Date(b.departure);
    return dateA.getTime() - dateB.getTime();
  });
  
  return unified;
}

export function generateAccountingCSV(
  unifiedReservations: UnifiedReservation[],
  startBelegnr: number,
  useCommaDecimal: boolean = false
): string {
  const accountingRows: AccountingRow[] = [];
  let currentBelegnr = startBelegnr;
  
  for (const reservation of unifiedReservations) {
    const belegnr = currentBelegnr.toString();
    const belegdat = formatDate(reservation.departure);
    const taxes = calculateAccountingTaxes(reservation.totalPayment);
    // Use property name from reservation to get the correct property code
    const propertyCode = getLocationShort(reservation.propertyName, reservation.source);
    const text = `${belegnr} ${propertyCode} ${reservation.bookerName} ${reservation.source}`;
    
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

// Legacy function for backward compatibility
export function generateAccountingCSVFromBooking(
  bookingRows: BookingCSVRow[],
  startBelegnr: number,
  useCommaDecimal: boolean = false
): string {
  const unified = convertToUnifiedReservations(bookingRows, []);
  return generateAccountingCSV(unified, startBelegnr, useCommaDecimal);
}