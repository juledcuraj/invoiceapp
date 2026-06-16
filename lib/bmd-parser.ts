import { z } from 'zod';

// BMD CSV structure - each row is an accounting entry, not an invoice
export const BMDEntrySchema = z.object({
  konto: z.string(),           // Account code (200000 = revenue)
  belegnr: z.string(),         // Document number (invoice number)
  belegdat: z.string(),        // Document date (YYYYMMDD)
  symbol: z.string(),          // Transaction symbol
  betrag: z.number(),          // Amount (European decimal format)
  steuer: z.number().optional(), // Tax amount
  text: z.string(),            // Description text with embedded data
});

export type BMDEntry = z.infer<typeof BMDEntrySchema>;

// Structured invoice data extracted from BMD entries
export const BMDInvoiceSchema = z.object({
  belegnr: z.string(),                    // Invoice number from BMD
  grossAmount: z.number(),                // Total gross amount (what guest pays - brutto)
  netAmount: z.number().default(0),       // Net amount (what business gets - netto)
  vatAmount: z.number().default(0),       // VAT amount (MwSt 10%)
  cityTaxAmount: z.number().default(0),   // City tax amount (Ortstaxe 3.2%)
  documentDate: z.string(),               // Invoice date (ISO format)
  reservationNumber: z.string().optional(), // Extracted from text field
  guestName: z.string().optional(),       // Extracted from text field
  propertyCode: z.string().optional(),    // Extracted from text field
  platform: z.string().optional(),       // Source platform (Booking.com, AirBnB, etc.)
  rawText: z.string(),                   // Original text for debugging
});

export type BMDInvoice = z.infer<typeof BMDInvoiceSchema>;

// Property mapping for text-based detection
const PROPERTY_PATTERNS = {
  'BEGA': ['bechardgasse', 'vienna central', 'home sweet home vienna central'],
  'WAFG': ['walfischgasse', 'state opera', 'home sweet home state opera'],
  'LAS': ['lassallestraße', 'leopold', 'home sweet home leopold'],
  'KRA': ['kramergasse', 'stephansdom', 'home sweet home stephansdom'],
  'BM': ['bauernmarkt', 'stephansdom ii', 'home sweet home stephansdom ii'],
  'KLIE': ['kliebergasse', 'margot'],
  'LAM': ['lambrechtgasse', 'denube suites', 'danube'],
  'ZIM': ['zimmermanngasse', 'céleste suites', 'celeste'],
};

// Platform detection patterns - updated for exact BMD text format
const PLATFORM_PATTERNS = {
  'Booking.com': ['booking.com', 'Booking.com'],
  'AirBnB': ['airbnb.com', 'AirBnb.com', 'airbnb', 'AirBnB'],
  'Direct': ['direct', 'direkt'],
  'Expedia': ['expedia', 'exp'],
};

/**
 * Enhanced CSV parser that handles quoted fields and multiple delimiters
 */
function parseCSVLine(line: string, delimiter: string = ';'): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  // Handle case where entire line is wrapped in quotes (common in BMD exports)
  let processLine = line.trim();
  if (processLine.startsWith('"') && processLine.endsWith('"') && delimiter === ';') {
    processLine = processLine.slice(1, -1);
    return processLine.split(';').map(field => field.trim());
  }

  while (i < processLine.length) {
    const char = processLine[i];

    if (char === '"') {
      // Handle escaped quotes ("")
      if (i + 1 < processLine.length && processLine[i + 1] === '"') {
        current += '"';
        i += 2;
      } else {
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === delimiter && !inQuotes) {
      // Field boundary
      result.push(current.trim());
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }

  // Add the last field
  result.push(current.trim());
  return result;
}

/**
 * Convert European decimal format to number (e.g., "238,02" -> 238.02)
 */
function parseEuropeanNumber(value: string): number {
  if (!value || typeof value !== 'string') return 0;
  
  // Remove quotes and whitespace
  const cleaned = value.replace(/"/g, '').trim();
  if (!cleaned) return 0;
  
  // Handle European decimal format (comma as decimal separator)
  const normalized = cleaned.replace(',', '.');
  const number = parseFloat(normalized);
  
  return isNaN(number) ? 0 : number;
}

/**
 * Convert BMD date format (YYYYMMDD) to ISO format (YYYY-MM-DD)
 */
function formatBMDDate(bmdDate: string): string {
  if (!bmdDate || bmdDate.length !== 8) {
    console.warn(`Invalid BMD date format: ${bmdDate}`);
    return new Date().toISOString().split('T')[0];
  }
  
  const year = bmdDate.substring(0, 4);
  const month = bmdDate.substring(4, 6);
  const day = bmdDate.substring(6, 8);
  
  // Validate date components
  if (parseInt(month) < 1 || parseInt(month) > 12 || 
      parseInt(day) < 1 || parseInt(day) > 31) {
    console.warn(`Invalid date components: ${year}-${month}-${day}`);
    return new Date().toISOString().split('T')[0];
  }
  
  return `${year}-${month}-${day}`;
}

/**
 * Extract structured information from BMD text field
 * 
 * Enhanced parser for BMD text patterns like:
 * - "1 BEGA/2 Viitmann Booking.com" → guest: "Viitmann", property: "BEGA", platform: "Booking.com"
 * - "3 KRA/4 Smith AirBnB" → guest: "Smith", property: "KRA", platform: "AirBnB"
 * - Long reservation numbers and other embedded data
 */
function parseTextField(text: string): {
  reservationNumber?: string;
  guestName?: string;
  propertyCode?: string;
  platform?: string;
} {
  const result: any = {};
  
  if (!text || typeof text !== 'string') {
    return result;
  }
  
  const normalizedText = text.toLowerCase().trim();
  const originalText = text.trim();

  // Primary parser for known BMD format:
  // "<belegnr> <PROPERTY_ALIAS/...> <guest name tokens...> <platform>"
  // Examples:
  // "6 BEGA/3 Hou Booking.com"
  // "32 LAS/6/15 Senekovic Booking.com"
  // "40 LAS/5 Campini AirBnB.com"
  const collapsed = originalText.replace(/\s+/g, ' ').trim();
  const platformMatch = collapsed.match(/\b(Booking\.com|AirBnb\.com|AirBnB\.com|airbnb\.com|AirBnB|airbnb|Direct|direkt|Expedia|expedia)\b/i);

  if (platformMatch && platformMatch.index !== undefined) {
    const platformToken = platformMatch[1];
    const core = collapsed.slice(0, platformMatch.index).trim();
    const coreTokens = core.split(' ').filter(Boolean);

    // Platform normalization
    if (/booking/i.test(platformToken)) {
      result.platform = 'Booking.com';
    } else if (/airbnb/i.test(platformToken)) {
      result.platform = 'AirBnB';
    } else if (/direct|direkt/i.test(platformToken)) {
      result.platform = 'Direct';
    } else if (/expedia|exp/i.test(platformToken)) {
      result.platform = 'Expedia';
    }

    if (coreTokens.length >= 2) {
      // Token 0 is usually the belegnr marker in text (e.g. "6", "21a")
      // Token 1 is usually property alias block (e.g. "BEGA/3", "LAS/6/15", "KRA")
      const propertyToken = coreTokens[1];
      const aliasMatch = propertyToken.match(/^([A-Za-z]+)/);
      if (aliasMatch) {
        const alias = aliasMatch[1].toUpperCase();
        if (Object.prototype.hasOwnProperty.call(PROPERTY_PATTERNS, alias)) {
          result.propertyCode = alias;
        }
      }

      // Guest name is everything after property token and before platform token
      const guestTokens = coreTokens.slice(2);
      if (guestTokens.length > 0) {
        result.guestName = guestTokens.join(' ').replace(/[^\p{L}\p{N}\-\.'\s]/gu, '').trim();
      }
    }

    // Optional reservation number extraction (long numeric token in text)
    const longNumber = collapsed.match(/\b\d{8,}\b/);
    if (longNumber) {
      result.reservationNumber = longNumber[0];
    }

    // If primary format extraction found at least platform+one identity field, use it.
    if (result.platform || result.propertyCode || result.guestName) {
      console.log('BMD Primary Text Parse Result:', result);
      return result;
    }
  }
  
  // Pattern 1 fallback: handle simplified structure when primary parser doesn't trigger
  // Example: "1 BEGA/2 Viitmann Booking.com", "3 KRA/4 Smith AirBnB"
  const structuredPattern = /(\d+[A-Za-z]?\s+([A-Z]+)(?:\/\d+(?:\/\d+)*)?\s+([A-Za-z\-\.]+))\s+(.*)/;
  const structuredMatch = originalText.match(structuredPattern);
  
  if (structuredMatch) {
    const propertyCode = structuredMatch[2]; // "BEGA", "KRA", etc.
    const guestName = structuredMatch[3]; // "Viitmann", "Smith", etc.
    const remaining = structuredMatch[4]; // "Booking.com", "AirBnB", etc.
    
    console.log(`BMD Text Parser: Structured match found - Property: ${propertyCode}, Guest: ${guestName}, Remaining: ${remaining}`);
    
    // Validate property code against known patterns
    const validPropertyCode = Object.keys(PROPERTY_PATTERNS).find(code => 
      code === propertyCode || PROPERTY_PATTERNS[code as keyof typeof PROPERTY_PATTERNS].some(pattern => 
        propertyCode.toLowerCase().includes(pattern.toLowerCase())
      )
    );
    
    if (validPropertyCode) {
      result.propertyCode = validPropertyCode;
    }
    
    // Extract guest name (clean up any trailing characters)
    result.guestName = guestName.replace(/[^\w\-\.\s]/g, '').trim();
    
    // Extract platform from remaining text - check both case-sensitive and case-insensitive
    for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
      for (const pattern of patterns) {
        // First try exact case match
        if (remaining.includes(pattern)) {
          result.platform = platform;
          console.log(`BMD Structured Parser: Found platform: ${platform} (exact match: "${pattern}" in "${remaining}")`);
          break;
        }
        // Then try case-insensitive match
        if (remaining.toLowerCase().includes(pattern.toLowerCase())) {
          result.platform = platform;
          console.log(`BMD Structured Parser: Found platform: ${platform} (case-insensitive match: "${pattern}" in "${remaining}")`);
          break;
        }
      }
      if (result.platform) break;
    }
    
    console.log(`BMD Structured Parse Result:`, result);
    return result;
  }
  
  // Pattern 2: Fallback to general parsing for other text formats  
  console.log(`BMD Text Parser: Using fallback parsing for: "${originalText}"`);
  
  const words = originalText.split(/\s+/);
  
  // Extract reservation number (look for long numeric strings - 8+ digits)
  for (const word of words) {
    if (/^\d{8,}$/.test(word)) {
      result.reservationNumber = word;
      console.log(`BMD Text Parser: Found reservation number: ${word}`);
      break;
    }
  }
  
  // Extract property code by matching against known patterns
  for (const [code, patterns] of Object.entries(PROPERTY_PATTERNS)) {
    for (const pattern of patterns) {
      if (normalizedText.includes(pattern.toLowerCase())) {
        result.propertyCode = code;
        console.log(`BMD Text Parser: Found property code: ${code} (matched pattern: ${pattern})`);
        break;
      }
    }
    if (result.propertyCode) break;
  }
  
  // Extract platform - check both case-sensitive and case-insensitive matches
  for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
    for (const pattern of patterns) {
      // First try exact case match (for "Booking.com" and "AirBnb.com")
      if (originalText.includes(pattern)) {
        result.platform = platform;
        console.log(`BMD Text Parser: Found platform: ${platform} (exact match: "${pattern}")`);
        break;
      }
      // Then try case-insensitive match
      if (normalizedText.includes(pattern.toLowerCase())) {
        result.platform = platform;
        console.log(`BMD Text Parser: Found platform: ${platform} (case-insensitive match: "${pattern}")`);
        break;
      }
    }
    if (result.platform) break;
  }
  
  // Extract guest name using improved heuristics
  if (result.reservationNumber) {
    // Method 1: Words after reservation number, before platform
    const reservationIndex = words.findIndex(word => word === result.reservationNumber);
    if (reservationIndex !== -1) {
      const guestWords: string[] = [];
      for (let i = reservationIndex + 1; i < words.length; i++) {
        const word = words[i];
        // Stop at platform indicators or known suffixes
        if (word.includes('.com') || 
            word.toLowerCase().includes('airbnb') || 
            word.toLowerCase().includes('booking') ||
            word.toLowerCase().includes('expedia')) {
          break;
        }
        // Only include word-like strings (letters, hyphens, dots)
        if (/^[A-Za-z\-\.]+$/.test(word)) {
          guestWords.push(word);
        }
      }
      if (guestWords.length > 0) {
        result.guestName = guestWords.join(' ').trim();
        console.log(`BMD Text Parser: Extracted guest name after reservation: ${result.guestName}`);
      }
    }
  }
  
  // Method 2: If no reservation number, extract likely guest names (capitalized words)
  if (!result.guestName) {
    const potentialNames: string[] = [];
    for (const word of words) {
      // Look for capitalized words that could be names (exclude property codes and platforms)
      if (/^[A-Z][a-z\-\.]{1,}$/.test(word) && 
          word.length > 2 && 
          !Object.keys(PROPERTY_PATTERNS).includes(word.toUpperCase()) &&
          !word.toLowerCase().includes('booking') &&
          !word.toLowerCase().includes('airbnb')) {
        potentialNames.push(word);
      }
    }
    if (potentialNames.length > 0) {
      result.guestName = potentialNames.slice(0, 2).join(' '); // Take first 2 words as name
      console.log(`BMD Text Parser: Extracted guest name from potential names: ${result.guestName}`);
    }
  }
  
  console.log(`BMD Fallback Parse Result:`, result);
  return result;
}

/**
 * Enhanced BMD CSV parser that extracts pre-calculated tax amounts
 * 
 * The BMD file contains different account codes (konto) that represent:
 * - Gross amount (brutto) - what the guest pays (yellow in BMD)
 * - Net amount (netto) - what the business gets (green in BMD)  
 * - VAT amount (MwSt 10%) - tax amount (blue in BMD)
 * - City tax amount (Ortstaxe 3.2%) - city tax (pink in BMD)
 * 
 * This parser groups entries by invoice number (belegnr) and extracts
 * these pre-calculated amounts instead of doing manual tax calculations.
 */
export function parseBMDCSV(csvContent: string): {
  invoices: BMDInvoice[];
  errors: string[];
  warnings: string[];
  stats: {
    totalRows: number;
    processedRows: number;
    revenueEntries: number;
    uniqueInvoices: number;
    skippedAccounts: Record<string, number>;
    taxEntriesFound: Record<string, number>;
  };
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const invoices: BMDInvoice[] = [];
  const invoiceEntries = new Map<string, {
    belegnr: string;
    documentDate: string;
    grossAmount: number;
    netAmount: number;
    vatAmount: number;
    cityTaxAmount: number;
    textData: any;
    rawText: string;
  }>();
  const stats = {
    totalRows: 0,
    processedRows: 0,
    revenueEntries: 0,
    uniqueInvoices: 0,
    skippedAccounts: {} as Record<string, number>,
    taxEntriesFound: {} as Record<string, number>,
  };
  
  try {
    if (!csvContent || csvContent.trim().length === 0) {
      throw new Error('BMD CSV content is empty');
    }
    
    const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    stats.totalRows = lines.length;
    
    if (lines.length < 2) {
      throw new Error('BMD CSV must contain at least a header and one data row');
    }
    
    // Detect delimiter (semicolon is common in BMD exports)
    const headerLine = lines[0];
    const delimiter = headerLine.includes(';') && !headerLine.includes(',') ? ';' : ',';
    
    console.log(`BMD Parser: Processing ${lines.length} lines with delimiter "${delimiter}"`);
    
    // Parse header to understand structure
    const headers = parseCSVLine(headerLine, delimiter);
    console.log(`🔍 BMD Headers Found: [${headers.map((h, i) => `${i}:"${h}"`).join(', ')}]`);
    console.log(`📋 Total Columns: ${headers.length}`);
    
    // Show first few data rows for debugging  
    if (lines.length > 1) {
      console.log(`📊 First Data Row Example:`);
      const firstDataValues = parseCSVLine(lines[1], delimiter);
      firstDataValues.forEach((value, i) => {
        console.log(`  Column ${i} ("${headers[i] || 'UNKNOWN'}"): "${value}"`);
      });
    }
    
    // Validate expected columns exist
    const expectedColumns = ['konto', 'belegnr', 'belegdat', 'betrag', 'text'];
    const missingColumns = expectedColumns.filter(col => 
      !headers.some(h => h && h.toLowerCase().includes(col.toLowerCase()))
    );
    
    if (missingColumns.length > 0) {
      errors.push(`❌ Missing expected columns: ${missingColumns.join(', ')}`);
      console.log(`⚠️ Expected columns not found. Looking for: ${expectedColumns.join(', ')}`);
      console.log(`📋 Available headers: ${headers.join(', ')}`);
    }
    
    // Dynamic column mapping based on actual headers
    const getColumnIndex = (columnName: string): number => {
      const possibleNames: { [key: string]: string[] } = {
        'konto': ['konto', 'account', 'account_code', 'accountcode'],
        'belegnr': ['belegnr', 'beleg-nr', 'beleg_nr', 'invoice_number', 'invoicenumber', 'invoice', 'nummer', 'nr'],
        'belegdat': ['belegdat', 'beleg-dat', 'beleg_dat', 'date', 'datum', 'invoice_date', 'doc_date'],
        'betrag': ['betrag', 'amount', 'summe', 'sum', 'total', 'value', 'wert'],
        'text': ['text', 'description', 'desc', 'comment', 'kommentar', 'beschreibung', 'details']
      };
      
      const searchNames = possibleNames[columnName] || [columnName];
      
      for (let i = 0; i < headers.length; i++) {
        const header = (headers[i] || '').toLowerCase().trim();
        if (searchNames.some(name => header.includes(name.toLowerCase()))) {
          return i;
        }
      }
      return -1;
    };
    
    const kontoIndex = getColumnIndex('konto');
    const belegnrIndex = getColumnIndex('belegnr'); 
    const belegdatIndex = getColumnIndex('belegdat');
    const betragIndex = getColumnIndex('betrag');
    const textIndex = getColumnIndex('text');
    
    console.log(`🗂️ Column Mapping:`);
    console.log(`   Konto (Account): ${kontoIndex >= 0 ? kontoIndex + ' ✅' : 'NOT FOUND ❌'}`);
    console.log(`   Belegnr (Invoice#): ${belegnrIndex >= 0 ? belegnrIndex + ' ✅' : 'NOT FOUND ❌'}`);
    console.log(`   Belegdat (Date): ${belegdatIndex >= 0 ? belegdatIndex + ' ✅' : 'NOT FOUND ❌'}`);
    console.log(`   Betrag (Amount): ${betragIndex >= 0 ? betragIndex + ' ✅' : 'NOT FOUND ❌'}`);
    console.log(`   Text (Description): ${textIndex >= 0 ? textIndex + ' ✅' : 'NOT FOUND ❌'}`);
    
    // Update missing columns check
    const columnMappings = { kontoIndex, belegnrIndex, belegdatIndex, betragIndex, textIndex };
    const missingMappings = Object.entries(columnMappings)
      .filter(([key, index]) => index === -1)
      .map(([key]) => key.replace('Index', ''));
    
    if (missingMappings.length > 0) {
      errors.push(`❌ Could not map columns: ${missingMappings.join(', ')}`);
    }
    
    // Process data rows - group by invoice number (belegnr)
    for (let i = 1; i < lines.length; i++) {
      try {
        stats.processedRows++;
        
        const values = parseCSVLine(lines[i], delimiter);
        
        if (values.length === 0) {
          continue; // Skip empty rows
        }
        
        // Use dynamic column indices instead of hardcoded positions
        const konto = kontoIndex >= 0 ? (values[kontoIndex]?.trim() || '') : '';
        const belegnr = belegnrIndex >= 0 ? (values[belegnrIndex]?.trim() || '') : '';
        const belegdat = belegdatIndex >= 0 ? (values[belegdatIndex]?.trim() || '') : '';
        const betragRaw = betragIndex >= 0 ? (values[betragIndex] || '0') : '0';
        const text = textIndex >= 0 ? (values[textIndex]?.trim() || '') : '';
        
        const betrag = parseEuropeanNumber(betragRaw);
        
        // Debug first few rows
        if (i <= 3) {
          console.log(`📊 Row ${i} parsed:`, {
            konto: `"${konto}"`,
            belegnr: `"${belegnr}"`,
            belegdat: `"${belegdat}"`,
            betrag: betrag,
            text: `"${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`
          });
        }
        
        // Track all account codes for analysis
        if (konto) {
          stats.skippedAccounts[konto] = (stats.skippedAccounts[konto] || 0) + 1;
        }
        
        // Skip entries without valid invoice number
        if (!belegnr || belegnr.trim() === '') {
          continue;
        }
        
        // Initialize invoice entry if first time seeing this invoice number
        if (!invoiceEntries.has(belegnr)) {
          invoiceEntries.set(belegnr, {
            belegnr,
            documentDate: formatBMDDate(belegdat),
            grossAmount: 0,
            netAmount: 0,
            vatAmount: 0,
            cityTaxAmount: 0,
            textData: parseTextField(text),
            rawText: text,
          });
        }
        
        const invoice = invoiceEntries.get(belegnr)!;
        
        // USER'S SPECIFIC BMD FORMAT:
        // konto 200000: gross amount (positive)
        // konto 8001: betrag = net amount (negative, remove -), steuer = VAT 10% (negative, remove -)
        // konto 8003: betrag = city tax 3.2% (negative, remove -)
        
        // Get steuer (tax) column if available for konto 8001
        const steuerIndex = headers.findIndex(h => 
          h && h.toLowerCase().includes('steuer') || h.toLowerCase().includes('tax')
        );
        const steuer = steuerIndex >= 0 && values[steuerIndex] ? parseEuropeanNumber(values[steuerIndex]) : 0;
        
        if (konto === '200000') {
          // Row 1: Gross total amount (what guest pays)
          invoice.grossAmount = Math.abs(betrag);
          stats.revenueEntries++;
          stats.taxEntriesFound['gross'] = (stats.taxEntriesFound['gross'] || 0) + 1;
          console.log(`BMD: Invoice ${belegnr} - Gross amount: ${invoice.grossAmount}€ (konto ${konto})`);
          
        } else if (konto === '8001') {
          // Row 2: Net amount in betrag + 10% VAT in steuer (both negative, remove -)
          invoice.netAmount = Math.abs(betrag);
          invoice.vatAmount = Math.abs(steuer);
          stats.taxEntriesFound['net'] = (stats.taxEntriesFound['net'] || 0) + 1;
          stats.taxEntriesFound['vat'] = (stats.taxEntriesFound['vat'] || 0) + 1;
          console.log(`BMD: Invoice ${belegnr} - Net: ${invoice.netAmount}€, VAT 10%: ${invoice.vatAmount}€ (konto ${konto})`);
          
        } else if (konto === '8003') {
          // Row 3: 3.2% city tax in betrag (negative, remove -)
          invoice.cityTaxAmount = Math.abs(betrag);
          stats.taxEntriesFound['cityTax'] = (stats.taxEntriesFound['cityTax'] || 0) + 1;
          console.log(`BMD: Invoice ${belegnr} - City tax 3.2%: ${invoice.cityTaxAmount}€ (konto ${konto})`);
          
        } else {
          // Other account codes - track for analysis but don't process
          console.log(`BMD: Invoice ${belegnr} - Skipping unknown konto ${konto} with amount ${betrag}`);
          stats.skippedAccounts[`other_${konto}`] = (stats.skippedAccounts[`other_${konto}`] || 0) + 1;
        }
        
        // Validation: Verify the accounting equation (gross = net + vat + cityTax)
        // This is already calculated by BMD, so we just verify for sanity check
        if (invoice.grossAmount > 0 && invoice.netAmount > 0) {
          const calculatedGross = invoice.netAmount + invoice.vatAmount + invoice.cityTaxAmount;
          const difference = Math.abs(invoice.grossAmount - calculatedGross);
          
          if (difference > 0.02) { // Allow 2 cent rounding difference
            console.warn(`BMD: Invoice ${belegnr} - Amount mismatch: Gross=${invoice.grossAmount}€ vs Calculated=${calculatedGross}€ (diff=${difference}€)`);
          }
        }
        
      } catch (error) {
        errors.push(`Row ${i}: ${error instanceof Error ? error.message : 'Parse error'}`);
      }
    }
    
    // Convert entries to final invoices
    invoiceEntries.forEach((entry, belegnr) => {
      // All amounts should be already calculated from BMD multi-row format
      // No estimation needed - BMD provides exact amounts
      
      // Skip entries without gross amount (incomplete BMD entries)
      if (entry.grossAmount <= 0) {
        console.warn(`Invoice ${belegnr} skipped: No gross amount found (missing konto 200000 row)`);
        warnings.push(`Invoice ${belegnr}: No gross amount found - skipped (incomplete BMD entry)`);
        return;
      }
      
      const invoice: BMDInvoice = {
        belegnr: entry.belegnr,
        grossAmount: entry.grossAmount,
        netAmount: entry.netAmount,
        vatAmount: entry.vatAmount,
        cityTaxAmount: entry.cityTaxAmount,
        documentDate: entry.documentDate,
        reservationNumber: entry.textData.reservationNumber,
        guestName: entry.textData.guestName,
        propertyCode: entry.textData.propertyCode,
        platform: entry.textData.platform,
        rawText: entry.rawText,
      };
      
      invoices.push(invoice);
      console.log(`🧾 BMD Invoice ${belegnr} processed:
        📊 Amounts: Gross=${invoice.grossAmount.toFixed(2)}€, Net=${invoice.netAmount.toFixed(2)}€, VAT=${invoice.vatAmount.toFixed(2)}€, CityTax=${invoice.cityTaxAmount.toFixed(2)}€
        👤 Guest: "${invoice.guestName || 'N/A'}", Property: "${invoice.propertyCode || 'N/A'}", Platform: "${invoice.platform || 'N/A'}"
        📅 Date: ${invoice.documentDate}`);
    });
    stats.uniqueInvoices = invoices.length;
    
    console.log(`BMD Parse Summary:
      - Total rows: ${stats.totalRows}
      - Processed: ${stats.processedRows}
      - Unique invoices: ${stats.uniqueInvoices}
      - Tax entries found: ${JSON.stringify(stats.taxEntriesFound)}
      - Account codes found: ${Object.keys(stats.skippedAccounts).join(', ')}
      - Account code distribution: ${JSON.stringify(stats.skippedAccounts)}
      - Errors: ${errors.length}`
    );
    
    return { invoices, errors, warnings, stats };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown parsing error';
    errors.push(`BMD Parse Error: ${errorMsg}`);
    return { invoices: [], errors, warnings: [], stats };
  }
}

/**
 * Validate BMD invoice data quality
 */
export function validateBMDInvoices(invoices: BMDInvoice[]): {
  valid: BMDInvoice[];
  invalid: Array<{ invoice: BMDInvoice; issues: string[] }>;
  warnings: string[];
} {
  const valid: BMDInvoice[] = [];
  const invalid: Array<{ invoice: BMDInvoice; issues: string[] }> = [];
  const warnings: string[] = [];
  
  for (const invoice of invoices) {
    const issues: string[] = [];
    
    // Check required fields
    if (!invoice.belegnr || invoice.belegnr.length < 3) {
      issues.push('Invalid or missing invoice number');
    }
    
    if (invoice.grossAmount <= 0) {
      issues.push('Invalid gross amount');
    }
    
    if (!invoice.documentDate || !/^\d{4}-\d{2}-\d{2}$/.test(invoice.documentDate)) {
      issues.push('Invalid document date format');
    }
    
    // Warn about missing optional data
    if (!invoice.reservationNumber) {
      warnings.push(`Invoice ${invoice.belegnr}: No reservation number found`);
    }
    
    if (!invoice.propertyCode) {
      warnings.push(`Invoice ${invoice.belegnr}: Could not detect property`);
    }
    
    if (!invoice.guestName) {
      warnings.push(`Invoice ${invoice.belegnr}: No guest name extracted`);
    }
    
    if (issues.length === 0) {
      valid.push(invoice);
    } else {
      invalid.push({ invoice, issues });
    }
  }
  
  return { valid, invalid, warnings };
}