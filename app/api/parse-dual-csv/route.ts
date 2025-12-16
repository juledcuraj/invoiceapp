import { NextRequest, NextResponse } from 'next/server';

interface BMDEntry {
  belegnr: string;
  reservationNumber: string;
  guestName: string;
  bruttoAmount: number; // betrag from 200000 entry
  checkoutDate: string; // belegdat for confirmation matching
}

interface ReservationEntry {
  reservationNumber: string;
  propertyName: string;
  bookerName: string;
  arrival: string;
  departure: string;
  totalPayment: number;
  currency: string;
}

interface MergedReservation {
  reservationId: string;
  invoiceNumber: string; // belegnr from BMD
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  amountPaidGross: number; // Use betrag from BMD (more accurate)
  currency: string;
  property: string;
  propertyId: string; // Auto-detected property ID
}

// Convert BMD date format (YYYYMMDD) to ISO format (YYYY-MM-DD)
function formatBMDDate(bmdDate: string): string {
  if (!bmdDate || bmdDate.length !== 8) {
    return new Date().toISOString().split('T')[0]; // fallback to today
  }
  const year = bmdDate.substring(0, 4);
  const month = bmdDate.substring(4, 6);
  const day = bmdDate.substring(6, 8);
  return `${year}-${month}-${day}`;
}

export async function GET() {
  return NextResponse.json({ message: 'Parse dual CSV API is working' });
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== STARTING DUAL CSV PARSING ===');
    const formData = await request.formData();
    const bmdFile = formData.get('bmdFile') as File;
    const reservationsFile = formData.get('reservationsFile') as File;
    
    console.log('Raw form data keys:', Array.from(formData.keys()));
    console.log('BMD file type:', typeof bmdFile, bmdFile?.constructor.name);
    console.log('Reservations file type:', typeof reservationsFile, reservationsFile?.constructor.name);
    
    console.log('Files received:', {
      bmdFile: bmdFile?.name,
      bmdSize: bmdFile?.size,
      reservationsFile: reservationsFile?.name,
      reservationsSize: reservationsFile?.size
    });
    
    if (!bmdFile || !reservationsFile) {
      console.error('Missing files:', { bmdFile: !!bmdFile, reservationsFile: !!reservationsFile });
      return NextResponse.json(
        { error: 'Both BMD List and Reservations CSV files are required' },
        { status: 400 }
      );
    }
    
    console.log('✓ Both files received successfully');
    console.log('BMD file details:', { name: bmdFile.name, size: bmdFile.size, type: bmdFile.type });
    console.log('Reservations file details:', { name: reservationsFile.name, size: reservationsFile.size, type: reservationsFile.type });
    
    // Parse BMD List CSV
    console.log('Reading BMD file content...');
    const bmdContent = await bmdFile.text();
    console.log('BMD content length:', bmdContent.length);
    console.log('BMD content preview:', bmdContent.substring(0, 200));
    console.log('BMD content line count:', bmdContent.split('\n').length);
    
    console.log('Calling parseBMDList...');
    let bmdEntries: BMDEntry[] = [];
    try {
      bmdEntries = parseBMDList(bmdContent);
      console.log('parseBMDList returned:', bmdEntries.length, 'entries');
    } catch (error) {
      console.error('Error in parseBMDList:', error);
      return NextResponse.json({ error: 'Failed to parse BMD file: ' + error }, { status: 500 });
    }
    
    // Parse Reservations CSV  
    console.log('Reading Reservations file content...');
    const reservationsContent = await reservationsFile.text();
    console.log('Reservations content length:', reservationsContent.length);
    console.log('Reservations content preview:', reservationsContent.substring(0, 200));
    console.log('Reservations content line count:', reservationsContent.split('\n').length);
    
    console.log('Calling parseReservationsCSV...');
    let reservations: ReservationEntry[] = [];
    try {
      reservations = parseReservationsCSV(reservationsContent);
      console.log('parseReservationsCSV returned:', reservations.length, 'entries');
    } catch (error) {
      console.error('Error in parseReservationsCSV:', error);
      return NextResponse.json({ error: 'Failed to parse Reservations file: ' + error }, { status: 500 });
    }
    
    // Match and merge data
    console.log(`Attempting to match ${bmdEntries.length} BMD entries with ${reservations.length} reservations`);
    const mergedData = matchReservations(bmdEntries, reservations);
    console.log(`Matching complete - merged ${mergedData.length} items`);

    // Format for invoice generation (match existing CSV parser output)
    const validRows = mergedData.map(item => ({
      reservationId: item.reservationId,
      guestName: item.guestName,
      checkInDate: item.checkInDate,
      checkOutDate: item.checkOutDate,
      amountPaidGross: item.amountPaidGross,
      currency: item.currency,
      property: item.property,
      propertyId: item.propertyId, // Auto-detected property ID
      invoiceNumber: item.invoiceNumber // This is the key addition - belegnr from BMD
    }));
    
    console.log(`Successfully matched ${validRows.length} reservations with BMD entries`);
    
    if (validRows.length === 0) {
      console.error('⚠️ ZERO RESULTS FOUND!');
      console.log('Debug info:');
      console.log('- BMD entries parsed:', bmdEntries.length);
      console.log('- Reservations parsed:', reservations.length);
      console.log('- Merged data:', mergedData.length);
      console.log('- Valid rows generated:', validRows.length);
    } else {
      console.log('Sample validRows (first 2):', validRows.slice(0, 2));
    }
    
    const response = {
      validRows,
      invalidRows: [],
      summary: {
        total: validRows.length,
        valid: validRows.length,
        invalid: 0
      }
    };
    
    console.log('Final API response summary:', response.summary);
    console.log('=== DUAL CSV PARSING COMPLETE ===');

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error parsing dual CSV files:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse CSV files' },
      { status: 500 }
    );
  }
}

function parseBMDList(csvContent: string): BMDEntry[] {
  console.log('=== STARTING BMD PARSING ===');
  console.log('parseBMDList called with content length:', csvContent.length);
  
  if (!csvContent || csvContent.length === 0) {
    console.error('BMD content is empty or null!');
    return [];
  }
  
  console.log('Parsing BMD List CSV...');
  console.log('BMD CSV content length:', csvContent.length);
  console.log('First 500 chars of BMD CSV:', csvContent.substring(0, 500));
  
  const rows = csvContent.split('\n').map(row => row.trim()).filter(row => row.length > 0);
  
  console.log(`BMD CSV has ${rows.length} rows`);
  
  if (rows.length < 2) {
    throw new Error('BMD List CSV must contain at least a header row and one data row');
  }
  
  const bmdEntries: BMDEntry[] = [];
  const seenBelegnrs = new Set<string>();
  const uniqueKontos = new Set<string>();
  let processedRows = 0;
  let konto200000Count = 0;
  let filtered8001Count = 0;
  let filtered8003Count = 0;
  
  // Detect delimiter type (semicolon vs comma)
  const headerRow = rows[0];
  const useSemicolon = headerRow.includes(';') && !headerRow.includes(',');
  const delimiter = useSemicolon ? ';' : ',';
  console.log(`Detected delimiter: "${delimiter}" (semicolon format: ${useSemicolon})`);
  
  // Log header for debugging
  console.log('BMD Header:', headerRow);
  const headerColumns = parseCSVRow(headerRow, delimiter);
  console.log('BMD Header columns count:', headerColumns.length);
  console.log('BMD Header columns:', headerColumns);
  console.log('BMD available columns:', headerColumns.map((h, i) => `[${i}]: "${h}"`).join(', '));
  
  for (let i = 1; i < rows.length; i++) {
    try {
      processedRows++;
      // Parse BMD row with detected delimiter (semicolon or comma format)
      const values = parseCSVRow(rows[i], delimiter);
      
      if (values.length < 7) {
        if (i <= 5) console.warn(`BMD row ${i} has insufficient columns: ${values.length}, values:`, values);
        continue;
      }
      
      // Track all konto values
      uniqueKontos.add(values[0] || 'EMPTY');
      
      // Log some example rows to understand structure
      if (i <= 10) {
        console.log(`BMD Row ${i} (${values.length} cols):`, values);
        console.log(`  konto: "${values[0]}", belegnr: "${values[1]}", betrag: "${values[4]}", text: "${values[6]}"`);
      }
      
      // Only process rows with konto = 200000 (revenue entries)
      // Skip rows starting with 8001, 8003 (unwanted BMD entries)
      const kontoValue = values[0]?.trim();
      if (kontoValue !== '200000') {
        if (kontoValue === '8001') {
          filtered8001Count++;
          if (i <= 20) console.log(`Skipping row ${i}, konto: "${kontoValue}" (8001 - unwanted entry)`);
        } else if (kontoValue === '8003') {
          filtered8003Count++;
          if (i <= 20) console.log(`Skipping row ${i}, konto: "${kontoValue}" (8003 - unwanted entry)`);
        } else {
          if (i <= 20) console.log(`Skipping row ${i}, konto: "${kontoValue}" (not 200000)`);
        }
        continue;
      }
      
      console.log(`✓ Found konto 200000 row ${i}!`);
      
      konto200000Count++;
      
      const belegnr = values[1]?.trim();
      const betragStr = values[4]?.trim();
      const text = values[6]?.trim();
      
      console.log(`Processing konto 200000 entry #${konto200000Count}: belegnr="${belegnr}", betrag="${betragStr}"`);
      
      if (!belegnr) {
        console.warn(`Row ${i}: Missing belegnr`);
        continue;
      }
      
      // Skip if we've already processed this belegnr  
      if (seenBelegnrs.has(belegnr)) {
        console.log(`Row ${i}: Duplicate belegnr "${belegnr}"`);
        continue;
      }
      seenBelegnrs.add(belegnr);
      
      // Parse the amount from values[4] (betrag column) - handle European decimal format
      // Convert European format (238,02) to standard format (238.02)
      let amountStr = betragStr?.replace(/"/g, '') || '0'; // Remove quotes
      amountStr = amountStr.replace(',', '.'); // Replace decimal comma with dot
      const bruttoAmount = parseFloat(amountStr) || 0;
      
      if (bruttoAmount <= 0) {
        console.warn(`Invalid brutto amount for belegnr ${belegnr}: "${betragStr}" -> ${bruttoAmount}`);
        continue;
      }
      
      // Extract info from text field format: "{belegnr} Property {reservationNumber} {guestName} {source}"
      let extractedReservationNumber = '';
      let extractedGuestName = '';
      
      // Try to parse the text field to extract reservation info
      const textParts = text.trim().split(' ');
      if (textParts.length >= 4) {
        // Look for reservation number (numeric, usually 10+ digits)
        for (let j = 0; j < textParts.length; j++) {
          if (/^\d+$/.test(textParts[j]) && textParts[j].length >= 8) {
            extractedReservationNumber = textParts[j];
            
            // Extract guest name (everything between reservation number and source)
            const guestParts = [];
            for (let k = j + 1; k < textParts.length - 1; k++) {
              if (!textParts[k].includes('.com') && !textParts[k].includes('AirBnB')) {
                guestParts.push(textParts[k]);
              }
            }
            extractedGuestName = guestParts.join(' ');
            break;
          }
        }
      }
      
      if (konto200000Count <= 10) {
        console.log(`BMD entry #${konto200000Count}:`);
        console.log(`  Text: "${text}"`);
        console.log(`  Extracted reservation number: "${extractedReservationNumber}"`);
        console.log(`  Extracted guest name: "${extractedGuestName}"`);
        console.log(`  Text parts:`, textParts);
      }
      
      // Extract checkout date from column 2 (belegdat) for confirmation matching
      const belegdat = values[2]?.trim() || '';
      
      bmdEntries.push({
        belegnr,
        reservationNumber: extractedReservationNumber,
        guestName: extractedGuestName,
        bruttoAmount,
        checkoutDate: formatBMDDate(belegdat)
      });
      
      if (bmdEntries.length <= 3) {
        console.log(`✓ Added BMD entry ${bmdEntries.length}: belegnr="${belegnr}", reservationNumber="${extractedReservationNumber}", amount=${bruttoAmount}`);
      }
      
    } catch (error) {
      console.warn(`Error parsing BMD row ${i}:`, error);
      continue;
    }
  }
  
  const entriesWithReservationNumbers = bmdEntries.filter(e => e.reservationNumber && e.reservationNumber.length >= 8);
  console.log(`BMD parsing summary: processed ${processedRows} rows, found ${konto200000Count} konto 200000 entries, created ${bmdEntries.length} BMD entries`);
  console.log(`Filtered out: ${filtered8001Count} rows with konto 8001, ${filtered8003Count} rows with konto 8003`);
  console.log(`Unique konto values found: ${Array.from(uniqueKontos).slice(0, 20).join(', ')}`);
  console.log(`Total unique konto values: ${uniqueKontos.size}`);
  console.log(`BMD entries with reservation numbers: ${entriesWithReservationNumbers.length}`);
  if (entriesWithReservationNumbers.length > 0) {
    console.log(`Sample BMD reservation numbers: ${entriesWithReservationNumbers.slice(0, 5).map(e => e.reservationNumber).join(', ')}`);
  } else {
    console.log('⚠️ No reservation numbers extracted from BMD entries - will use sequential pairing');
  }

  console.log(`Parsed ${bmdEntries.length} BMD entries`);
  return bmdEntries;
}

function parseReservationsCSV(csvContent: string): ReservationEntry[] {
  console.log('Parsing Reservations CSV...');
  
  // Handle multi-line quoted fields by parsing the entire CSV content properly
  const lines = csvContent.split('\n');
  const rows: string[] = [];
  let currentRow = '';
  let inQuotes = false;
  
  // Reconstruct proper CSV rows handling multi-line quoted fields
  for (const line of lines) {
    if (currentRow) {
      currentRow += '\n' + line;
    } else {
      currentRow = line;
    }
    
    // Count quotes to determine if we're inside a quoted field
    const quoteCount = (currentRow.match(/"/g) || []).length;
    inQuotes = quoteCount % 2 === 1;
    
    if (!inQuotes && currentRow.trim()) {
      rows.push(currentRow.trim());
      currentRow = '';
    }
  }
  
  // Add the last row if there's any remaining content
  if (currentRow.trim()) {
    rows.push(currentRow.trim());
  }
  
  console.log(`Reservations CSV has ${rows.length} proper rows`);
  
  if (rows.length < 2) {
    throw new Error('Reservations CSV must contain at least a header row and one data row');
  }
  
  // Detect delimiter type for reservations CSV
  const headerRow = rows[0];
  const useSemicolon = headerRow.includes(';') && !headerRow.includes(',');
  const delimiter = useSemicolon ? ';' : ',';
  console.log(`Reservations CSV - Detected delimiter: "${delimiter}" (semicolon format: ${useSemicolon})`);
  
  const header = parseCSVRow(headerRow, delimiter);
  console.log('Reservations CSV headers:', header);
  console.log('Available columns:', header.map((h, i) => `[${i}]: "${h}"`).join(', '));
  
  // Check if required columns exist
  const hasBookNumber = header.some(h => h.toLowerCase().includes('book number'));
  console.log('Has book number column?', hasBookNumber);
  if (!hasBookNumber) {
    console.log('⚠️ No "Book number" column found! Available columns:', header);
  }
  
  const reservations: ReservationEntry[] = [];
  
  for (let i = 1; i < rows.length; i++) {
    try {
      const values = parseCSVRow(rows[i], delimiter);
      const rowData: { [key: string]: string } = {};
      
      header.forEach((h, index) => {
        rowData[h] = values[index] || '';
      });
      
      // Debug first few rows
      if (i <= 3) {
        console.log(`Reservations row ${i} (${values.length} cols):`, values.slice(0, 7));
        console.log(`  Book number: "${rowData['Book number']}"`);
        console.log(`  Status: "${rowData['Status']}"`);
        console.log(`  Price: "${rowData['Price']}"`);
      }
      
      const reservationNumber = rowData['Book number'];
      const status = rowData['Status'] || '';
      const totalPaymentStr = rowData['Price'] || '0';
      
      // Skip cancelled reservations
      if (status.includes('cancelled')) {
        if (i <= 10) console.log(`Row ${i}: Skipping cancelled reservation ${reservationNumber} (${status})`);
        continue;
      }
      const totalPayment = parseFloat(totalPaymentStr.replace(/[",]/g, '')) || 0;
      
      if (!reservationNumber) {
        if (i <= 5) console.log(`Row ${i}: Missing reservation number`);
        continue;
      }
      
      if (totalPayment <= 0) {
        if (i <= 5) console.log(`Row ${i}: Invalid payment "${totalPaymentStr}" -> ${totalPayment}`);
        continue;
      }
      
      reservations.push({
        reservationNumber,
        propertyName: 'KLIE', // This appears to be KLIE property based on filename
        bookerName: rowData['Guest name(s)'] || '',
        arrival: parseDate(rowData['Check-in'] || ''),
        departure: parseDate(rowData['Check-out'] || ''),
        totalPayment,
        currency: 'EUR' // Default to EUR
      });
      
      if (reservations.length <= 3) {
        console.log(`✓ Added reservation ${reservations.length}: ${reservationNumber} (${rowData['Guest name(s)']}) - ${totalPayment}€`);
      }
    } catch (error) {
      console.warn(`Error parsing reservations row ${i}:`, error);
      continue;
    }
  }
  
  console.log(`Parsed ${reservations.length} reservations`);
  if (reservations.length > 0) {
    console.log(`Sample reservation numbers: ${reservations.slice(0, 5).map(r => r.reservationNumber).join(', ')}`);
  }
  return reservations;
}

// Helper function to parse BMD rows with semicolon delimiters
function parseBMDRow(row: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ';' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, '')); // Remove surrounding quotes
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

// Helper function to properly parse CSV rows with quoted fields
function parseCSVRow(row: string, delimiter: string = ','): string[] {
  // Handle special case where entire row is wrapped in quotes (semicolon BMD format)
  let processRow = row.trim();
  if (processRow.startsWith('"') && processRow.endsWith('"') && delimiter === ';') {
    // Remove outer quotes and split by semicolon
    processRow = processRow.slice(1, -1);
    return processRow.split(';').map(field => field.trim());
  }
  
  // Standard CSV parsing for comma-delimited or normal semicolon files
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < processRow.length; i++) {
    const char = processRow[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      // Remove surrounding quotes and trim
      let value = current.trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      result.push(value);
      current = '';
    } else {
      current += char;
    }
  }
  
  // Handle last field
  let value = current.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }
  result.push(value);
  return result;
}

// Map property names to property IDs
function getPropertyId(propertyName: string): string {
  const propertyMap: { [key: string]: string } = {
    'Home Sweet Home - Vienna Central': 'BEGA',
    'Home Sweet Home - State Opera': 'WAFG', 
    'Home Sweet Home - Leopold': 'LAS',
    'Home Sweet Home - Stephansdom': 'KRA',
    'Home Sweet Home - Stephansdom II': 'BM',
    'Margot': 'KLIE',
    'Denube Suites': 'LAMM',
    'Céleste Suites': 'ZIMM'
  };
  
  // Direct match first
  if (propertyMap[propertyName]) {
    return propertyMap[propertyName];
  }
  
  // Fallback: try to match by keywords
  const name = propertyName.toLowerCase();
  if (name.includes('vienna central') || name.includes('bechardgasse')) return 'BEGA';
  if (name.includes('state opera') || name.includes('walfischgasse')) return 'WAFG';
  if (name.includes('leopold') || name.includes('lassallestraße')) return 'LAS';
  if (name.includes('stephansdom') && name.includes('kramergasse')) return 'KRA';
  if (name.includes('stephansdom') && name.includes('bauernmarkt')) return 'BM';
  if (name.includes('margot') || name.includes('kliebergasse')) return 'KLIE';
  if (name.includes('denube')) return 'LAMM';
  if (name.includes('céleste')) return 'ZIMM';
  
  console.warn(`Unknown property: ${propertyName}`);
  return propertyName || 'UNKNOWN'; // Return the property name itself if no mapping found
}

function matchReservations(bmdEntries: BMDEntry[], reservations: ReservationEntry[]): MergedReservation[] {
  // Check if we have reservation numbers to do direct matching
  const bmdEntriesWithReservationNumbers = bmdEntries.filter(entry => entry.reservationNumber && entry.reservationNumber.length >= 8);
  
  if (bmdEntriesWithReservationNumbers.length > 0) {
    console.log(`Using direct reservation number matching for ${bmdEntriesWithReservationNumbers.length} BMD entries...`);
    const directMatches: MergedReservation[] = [];
    const reservationMap = new Map<string, ReservationEntry>();
    
    reservations.forEach(res => {
      reservationMap.set(res.reservationNumber, res);
    });
    
    console.log(`Available reservation numbers: ${Array.from(reservationMap.keys()).slice(0, 5).join(', ')}... (total: ${reservationMap.size})`);
    console.log(`BMD reservation numbers: ${bmdEntriesWithReservationNumbers.slice(0, 5).map(e => e.reservationNumber).join(', ')}... (total: ${bmdEntriesWithReservationNumbers.length})`);
    
    for (const bmdEntry of bmdEntriesWithReservationNumbers) {
      const reservation = reservationMap.get(bmdEntry.reservationNumber);
      
      if (reservation) {
        const propertyId = getPropertyId(reservation.propertyName);
        
        // Validate and use consistent checkout date (prefer reservation departure)
        const checkoutDate = reservation.departure || bmdEntry.checkoutDate || new Date().toISOString().split('T')[0];
        const checkinDate = reservation.arrival || (() => {
          // Fallback: estimate check-in date as 1 day before checkout
          const checkoutDateObj = new Date(checkoutDate);
          const checkinDateObj = new Date(checkoutDateObj.getTime() - 24 * 60 * 60 * 1000);
          return checkinDateObj.toISOString().split('T')[0];
        })();
        
        directMatches.push({
          reservationId: bmdEntry.reservationNumber,
          invoiceNumber: bmdEntry.belegnr,
          guestName: reservation.bookerName,
          checkInDate: checkinDate,
          checkOutDate: checkoutDate,
          amountPaidGross: bmdEntry.bruttoAmount,
          currency: reservation.currency,
          property: reservation.propertyName,
          propertyId: propertyId
        });
        console.log(`✓ Matched: BMD ${bmdEntry.belegnr} (${bmdEntry.reservationNumber}) → Reservation ${reservation.reservationNumber}`);
      } else {
        console.warn(`❌ No reservation found for BMD reservation number: ${bmdEntry.reservationNumber} (belegnr: ${bmdEntry.belegnr})`);
        // Still create entry with BMD data only for missing reservations
        // Use BMD checkout date and estimate check-in date (1 day before checkout)
        const checkoutDate = bmdEntry.checkoutDate || new Date().toISOString().split('T')[0];
        const checkoutDateObj = new Date(checkoutDate);
        const checkinDateObj = new Date(checkoutDateObj.getTime() - 24 * 60 * 60 * 1000); // 1 day before
        const checkinDate = checkinDateObj.toISOString().split('T')[0];
        
        directMatches.push({
          reservationId: bmdEntry.reservationNumber,
          invoiceNumber: bmdEntry.belegnr,
          guestName: bmdEntry.guestName || 'Unknown Guest',
          checkInDate: checkinDate,
          checkOutDate: checkoutDate,
          amountPaidGross: bmdEntry.bruttoAmount,
          currency: 'EUR',
          property: 'KLIE',
          propertyId: 'KLIE'
        });
      }
    }
    
    console.log(`Direct matching: ${directMatches.length} matched from ${bmdEntriesWithReservationNumbers.length} BMD entries with reservation numbers`);
    
    // If no direct matches were found, fall back to sequential pairing
    if (directMatches.length === 0) {
      console.log('No direct matches found, falling back to sequential pairing...');
    } else {
      return directMatches;
    }
  }
  
  // Fallback: Sequential pairing when BMD doesn't have reservation numbers
  console.log('No reservation numbers in BMD, using sequential pairing by order...');
  const sequentialMatches: MergedReservation[] = [];
  
  // Pair BMD entries with reservations by their position/order
  const pairingCount = Math.min(bmdEntries.length, reservations.length);
  console.log(`Pairing ${pairingCount} entries (BMD: ${bmdEntries.length}, Reservations: ${reservations.length})`);
  
  for (let i = 0; i < pairingCount; i++) {
    const bmdEntry = bmdEntries[i];
    const reservation = reservations[i];
    // Use property from reservation (BMD doesn't contain property info)
    const propertyName = reservation.propertyName;
    const propertyId = getPropertyId(propertyName);
    
    // Validate and ensure dates are present (prefer reservation dates)
    const checkoutDate = reservation.departure || bmdEntry.checkoutDate || new Date().toISOString().split('T')[0];
    const checkinDate = reservation.arrival || (() => {
      // Fallback: estimate check-in date as 1 day before checkout  
      const checkoutDateObj = new Date(checkoutDate);
      const checkinDateObj = new Date(checkoutDateObj.getTime() - 24 * 60 * 60 * 1000);
      return checkinDateObj.toISOString().split('T')[0];
    })();
    
    sequentialMatches.push({
      reservationId: reservation.reservationNumber,
      invoiceNumber: bmdEntry.belegnr,
      guestName: reservation.bookerName,
      checkInDate: checkinDate,
      checkOutDate: checkoutDate,
      amountPaidGross: bmdEntry.bruttoAmount, // Use BMD amount (this is the key)
      currency: reservation.currency,
      property: propertyName, // Use BMD property name
      propertyId: propertyId
    });
    
    if (i < 3) {
      console.log(`Paired #${i+1}: BMD ${bmdEntry.belegnr} (${propertyName}) → Reservation ${reservation.reservationNumber} (${reservation.bookerName})`);
    }
  }
  
  console.log(`Sequential pairing: ${sequentialMatches.length} pairs created`);
  return sequentialMatches;
}

function parseDate(dateString: string): string {
  if (!dateString) return new Date().toISOString().split('T')[0]; // fallback to today
  
  try {
    // Handle various date formats like "1 August 2025"
    const date = new Date(dateString.trim());
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date format: "${dateString}", using today as fallback`);
      return new Date().toISOString().split('T')[0];
    }
    
    return date.toISOString().split('T')[0];
  } catch (error) {
    console.warn(`Error parsing date "${dateString}":`, error);
    return new Date().toISOString().split('T')[0];
  }
}