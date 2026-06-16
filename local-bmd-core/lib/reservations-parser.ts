import { ReservationData } from './invoice-data-merger';

// Reservation CSV field mappings for different export formats
const FIELD_MAPPINGS = {
  reservationNumber: [
    'Book number', 'Booking number', 'Reservation number', 'Reservation ID', 
    'Reference number', 'Booking ID', 'BookingID', 'ReservationID'
  ],
  bookerName: [
    'Guest name(s)', 'Guest name', 'Guest Name', 'Booker name', 'Customer name',
    'Name', 'Guest', 'Customer'
  ],
  propertyName: [
    'Property', 'Property name', 'Property Name', 'Listing', 'Accommodation',
    'Object', 'Listing name'
  ],
  arrival: [
    'Check-in', 'Check-in Date', 'Arrival', 'CheckIn', 'Start date', 'Arrival Date'
  ],
  departure: [
    'Check-out', 'Check-out Date', 'Departure', 'CheckOut', 'End date', 'Departure Date'
  ],
  totalPayment: [
    'Price', 'Total', 'Amount', 'Total payment', 'Gross amount', 'Total Amount',
    'Payment', 'Revenue', 'Earnings'
  ],
  currency: ['Currency', 'Curr', 'Currency code'],
  status: ['Status', 'Reservation status', 'Booking status'],
};

// Property name normalization patterns
const PROPERTY_NAME_PATTERNS = {
  'BEGA': [
    'bechardgasse', 'vienna central', 'home sweet home vienna central',
    'bechardgasse 8', 'central vienna'
  ],
  'WAFG': [
    'walfischgasse', 'state opera', 'home sweet home state opera',
    'walfischgasse 4', 'opera vienna'
  ],
  'LAS': [
    'lassallestraße', 'leopold', 'home sweet home leopold',
    'lassallestraße 7a', 'leopoldstadt'
  ],
  'KRA': [
    'kramergasse', 'stephansdom', 'home sweet home stephansdom',
    'kramergasse 10', 'stephansdom vienna'
  ],
  'BM': [
    'bauernmarkt', 'stephansdom ii', 'home sweet home stephansdom ii',
    'bauernmarkt 2', 'stephansdom 2'
  ],
  'KLIE': [
    'kliebergasse', 'margot', 'kliebergasse 7', 'margot apartment'
  ],
  'LAM': [
    'lambrechtgasse', 'denube suites', 'danube suites', 'lambrechtgasse 59'
  ],
  'ZIM': [
    'zimmermanngasse', 'céleste suites', 'celeste suites', 'zimmermanngasse 6'
  ],
};

/**
 * Enhanced CSV parser for reservation data with better error handling
 */
function parseReservationCSVLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      // Handle escaped quotes
      if (i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

/**
 * Find column index by trying multiple possible names
 */
function findColumnIndex(headers: string[], possibleNames: string[]): number {
  for (const name of possibleNames) {
    const index = headers.findIndex(header => 
      header.toLowerCase().trim() === name.toLowerCase().trim()
    );
    if (index !== -1) return index;
  }
  return -1;
}

/**
 * Parse date string to ISO format
 */
function parseReservationDate(dateString: string): string {
  const formatLocalDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  if (!dateString || dateString.trim() === '') {
    return formatLocalDate(new Date());
  }
  
  const cleaned = dateString.trim();
  
  // If already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }
  
  // Handle "1 August 2025" format
  if (/^\d{1,2}\s+\w+\s+\d{4}$/.test(cleaned)) {
    const date = new Date(cleaned);
    if (!isNaN(date.getTime())) {
      return formatLocalDate(date);
    }
  }
  
  // Handle DD/MM/YYYY format (European)
  const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(cleaned);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Handle DD.MM.YYYY format
  const ddmmyyyy2 = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(cleaned);
  if (ddmmyyyy2) {
    const [, day, month, year] = ddmmyyyy2;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Fallback to Date parsing
  try {
    const date = new Date(cleaned);
    if (!isNaN(date.getTime())) {
      return formatLocalDate(date);
    }
  } catch {
    // Ignore parsing errors
  }
  
  console.warn(`Could not parse date: "${dateString}"`);
  return formatLocalDate(new Date());
}

/**
 * Parse amount string (handles different number formats)
 */
function parseReservationAmount(amountString: string): number {
  if (!amountString || typeof amountString !== 'string') {
    return 0;
  }
  
  // Remove currency symbols and quotes
  let cleaned = amountString.replace(/[€$£¥₹"]/g, '').trim();
  
  // Remove thousand separators (but preserve decimal separators)
  // Handle European format: 1.234,56 -> 1234.56
  if (cleaned.includes('.') && cleaned.includes(',')) {
    // If both exist, assume European format
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',') && !cleaned.includes('.')) {
    // Only comma, could be decimal separator
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      // Likely decimal separator
      cleaned = cleaned.replace(',', '.');
    } else {
      // Likely thousand separator
      cleaned = cleaned.replace(/,/g, '');
    }
  }
  
  const amount = parseFloat(cleaned);
  return isNaN(amount) ? 0 : amount;
}

/**
 * Detect property code from property name
 */
function detectPropertyCode(propertyName: string): string | undefined {
  if (!propertyName) return undefined;
  
  const normalized = propertyName.toLowerCase().trim();
  
  for (const [code, patterns] of Object.entries(PROPERTY_NAME_PATTERNS)) {
    for (const pattern of patterns) {
      if (normalized.includes(pattern.toLowerCase())) {
        return code;
      }
    }
  }
  
  return undefined;
}

/**
 * Parse reservation CSV with enhanced error handling and validation
 */
export function parseReservationsCSV(csvContent: string): {
  reservations: ReservationData[];
  errors: string[];
  stats: {
    totalRows: number;
    validRows: number;
    skippedRows: number;
    detectedFormat: string;
    propertyDistribution: Record<string, number>;
  };
} {
  const reservations: ReservationData[] = [];
  const errors: string[] = [];
  const stats = {
    totalRows: 0,
    validRows: 0,
    skippedRows: 0,
    detectedFormat: 'unknown',
    propertyDistribution: {} as Record<string, number>,
  };
  
  try {
    if (!csvContent || csvContent.trim().length === 0) {
      throw new Error('Reservations CSV content is empty');
    }
    
    // Handle multi-line quoted fields
    const lines: string[] = [];
    let currentLine = '';
    let inQuotes = false;
    
    for (const line of csvContent.split('\n')) {
      currentLine += (currentLine ? '\n' : '') + line;
      
      // Count quotes to determine if we're inside a quoted field
      const quoteCount = (currentLine.match(/"/g) || []).length;
      inQuotes = quoteCount % 2 === 1;
      
      if (!inQuotes && currentLine.trim()) {
        lines.push(currentLine.trim());
        currentLine = '';
      }
    }
    
    // Add remaining content
    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }
    
    stats.totalRows = lines.length;
    
    if (lines.length < 2) {
      throw new Error('CSV must contain at least a header and one data row');
    }
    
    // Detect delimiter
    const headerLine = lines[0];
    const delimiter = headerLine.includes(';') && !headerLine.includes(',') ? ';' : ',';
    stats.detectedFormat = `${delimiter === ';' ? 'semicolon' : 'comma'}-delimited`;
    
    // Parse headers
    const headers = parseReservationCSVLine(headerLine, delimiter);
    console.log(`Reservations Parser: ${lines.length} lines, delimiter: "${delimiter}"`);
    console.log(`Headers: [${headers.join(', ')}]`);
    
    // Map column indices
    const columnIndices = {
      reservationNumber: findColumnIndex(headers, FIELD_MAPPINGS.reservationNumber),
      bookerName: findColumnIndex(headers, FIELD_MAPPINGS.bookerName),
      propertyName: findColumnIndex(headers, FIELD_MAPPINGS.propertyName),
      arrival: findColumnIndex(headers, FIELD_MAPPINGS.arrival),
      departure: findColumnIndex(headers, FIELD_MAPPINGS.departure),
      totalPayment: findColumnIndex(headers, FIELD_MAPPINGS.totalPayment),
      currency: findColumnIndex(headers, FIELD_MAPPINGS.currency),
      status: findColumnIndex(headers, FIELD_MAPPINGS.status),
    };
    
    console.log('Column mapping:', columnIndices);
    
    // Validate required columns
    const requiredColumns = ['reservationNumber', 'totalPayment'];
    const missingColumns = requiredColumns.filter(col => columnIndices[col as keyof typeof columnIndices] === -1);
    
    if (missingColumns.length > 0) {
      errors.push(`Missing required columns: ${missingColumns.join(', ')}`);
      console.log('Available columns:', headers);
    }
    
    // Process data rows
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = parseReservationCSVLine(lines[i], delimiter);
        
        if (values.length < Math.max(...Object.values(columnIndices).filter(idx => idx !== -1))) {
          stats.skippedRows++;
          errors.push(`Row ${i}: Insufficient columns (${values.length})`);
          continue;
        }
        
        // Extract data
        const reservationNumber = columnIndices.reservationNumber !== -1 ? 
          values[columnIndices.reservationNumber]?.trim() : '';
        const totalPaymentStr = columnIndices.totalPayment !== -1 ? 
          values[columnIndices.totalPayment]?.trim() : '0';
        const status = columnIndices.status !== -1 ? 
          values[columnIndices.status]?.trim() : '';
        
        // Skip if missing critical data
        if (!reservationNumber) {
          stats.skippedRows++;
          if (i <= 10) console.log(`Row ${i}: Missing reservation number`);
          continue;
        }
        
        const totalPayment = parseReservationAmount(totalPaymentStr);
        if (totalPayment <= 0) {
          stats.skippedRows++;
          if (i <= 10) console.log(`Row ${i}: Invalid amount "${totalPaymentStr}" -> ${totalPayment}`);
          continue;
        }
        
        // Extract optional fields with defaults
        const bookerName = columnIndices.bookerName !== -1 ? 
          values[columnIndices.bookerName]?.trim() || 'Guest' : 'Guest';
        const propertyName = columnIndices.propertyName !== -1 ? 
          values[columnIndices.propertyName]?.trim() || 'Unknown Property' : 'Unknown Property';
        const arrival = columnIndices.arrival !== -1 ? 
          parseReservationDate(values[columnIndices.arrival] || '') : 
          parseReservationDate('');
        const departure = columnIndices.departure !== -1 ? 
          parseReservationDate(values[columnIndices.departure] || '') : 
          parseReservationDate('');
        const currency = columnIndices.currency !== -1 ? 
          values[columnIndices.currency]?.trim() || 'EUR' : 'EUR';
        
        const propertyCode = detectPropertyCode(propertyName);
        
        // Track property distribution
        const propKey = propertyCode || propertyName;
        stats.propertyDistribution[propKey] = (stats.propertyDistribution[propKey] || 0) + 1;
        
        const reservation: ReservationData = {
          reservationNumber,
          propertyName,
          propertyCode,
          bookerName,
          arrival,
          departure,
          totalPayment,
          currency,
          status,
          source: 'CSV_IMPORT',
        };
        
        reservations.push(reservation);
        stats.validRows++;
        
        // Log first few entries
        if (stats.validRows <= 5) {
          console.log(`✓ Reservation ${stats.validRows}: ${reservationNumber} - ${bookerName} - ${totalPayment}${currency} (${propertyCode || 'Unknown'})`);
        }
        
      } catch (error) {
        stats.skippedRows++;
        const errorMsg = error instanceof Error ? error.message : 'Parse error';
        errors.push(`Row ${i}: ${errorMsg}`);
      }
    }
    
    console.log(`Reservations Parse Summary:
      - Total lines: ${stats.totalRows}
      - Valid reservations: ${stats.validRows}
      - Skipped rows: ${stats.skippedRows}
      - Errors: ${errors.length}
      - Properties: ${Object.keys(stats.propertyDistribution).join(', ')}`);
    
    return { reservations, errors, stats };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown parsing error';
    errors.push(`Reservations Parse Error: ${errorMsg}`);
    return { reservations: [], errors, stats };
  }
}

/**
 * Validate reservation data quality
 */
export function validateReservations(reservations: ReservationData[]): {
  valid: ReservationData[];
  invalid: Array<{ reservation: ReservationData; issues: string[] }>;
  warnings: string[];
} {
  const valid: ReservationData[] = [];
  const invalid: Array<{ reservation: ReservationData; issues: string[] }> = [];
  const warnings: string[] = [];
  
  for (const reservation of reservations) {
    const issues: string[] = [];
    
    // Validate required fields
    if (!reservation.reservationNumber || reservation.reservationNumber.length < 3) {
      issues.push('Invalid or missing reservation number');
    }
    
    if (reservation.totalPayment <= 0) {
      issues.push('Invalid total payment amount');
    }
    
    // Validate dates
    if (reservation.arrival && reservation.departure) {
      const arrivalDate = new Date(reservation.arrival);
      const departureDate = new Date(reservation.departure);
      
      if (arrivalDate >= departureDate) {
        issues.push('Arrival date must be before departure date');
      }
      
      const stayDays = (departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24);
      if (stayDays > 365) {
        warnings.push(`${reservation.reservationNumber}: Very long stay (${Math.round(stayDays)} days)`);
      }
    }
    
    // Warn about missing optional data
    if (!reservation.propertyCode) {
      warnings.push(`${reservation.reservationNumber}: Could not detect property code`);
    }
    
    if (reservation.bookerName === 'Guest') {
      warnings.push(`${reservation.reservationNumber}: Missing guest name`);
    }
    
    // Check for potential data issues
    if (reservation.totalPayment > 10000) {
      warnings.push(`${reservation.reservationNumber}: High amount (${reservation.totalPayment}${reservation.currency})`);
    }
    
    if (issues.length === 0) {
      valid.push(reservation);
    } else {
      invalid.push({ reservation, issues });
    }
  }
  
  return { valid, invalid, warnings };
}