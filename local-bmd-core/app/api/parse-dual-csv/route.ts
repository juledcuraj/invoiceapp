import { NextRequest, NextResponse } from 'next/server';
import { parseBMDCSV, validateBMDInvoices, BMDInvoice } from '@/lib/bmd-parser';
import { parseReservationsCSV, validateReservations } from '@/lib/reservations-parser';
import { ReservationData } from '@/lib/invoice-data-merger';
import { InvoiceDataMerger, MergedInvoiceData } from '@/lib/invoice-data-merger';
import { EnhancedInvoiceDataProcessor } from '@/lib/enhanced-invoice-processor';
import { MultiSourceReservationParser, UnifiedReservationData } from '@/lib/multi-source-reservation-parser';
import { InvoiceValidationService } from '@/lib/invoice-validation-service';

export async function GET() {
  return NextResponse.json({ message: 'Parse dual CSV API is working' });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const bmdFile = formData.get('bmdFile') as File;
    const useMultiSource = formData.get('multiSource') === 'true';
    const useEnhancedProcessor = formData.get('enhanced') === 'true'; // Backward compatibility
    const useBMDOnly = formData.get('bmdOnly') === 'true'; // NEW: BMD-only mode
    // Hard-disable positional matching to preserve BMD-authenticated invoice identity.
    // Positional mode can assign belegnr to the wrong reservation when file ordering differs.
    const usePositionalMatching = false;
    
    console.log(`🔧 Processing options: BMD-only=${useBMDOnly}, Multi-source=${useMultiSource}, Positional=${usePositionalMatching} (forced off)`);
    
    if (useBMDOnly) {
      console.log('🧾 === BMD-ONLY PROCESSING ===');
      return await handleBMDOnlyProcessing(formData, bmdFile);
    } else if (useMultiSource) {
      console.log('🌍 === MULTI-SOURCE PROCESSING ===');
      return await handleMultiSourceProcessing(formData, bmdFile, usePositionalMatching);
    } else if (useEnhancedProcessor) {
      console.log('📅 === ENHANCED MONTHLY PROCESSING ===');
      return await handleMonthlyProcessing(formData, bmdFile);
    } else {
      console.log('📊 === LEGACY DUAL CSV PROCESSING ===');
      return await handleLegacyProcessing(formData, bmdFile);
    }
    
  } catch (error) {
    console.error('Processing error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process files',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}

/**
 * NEW: BMD-only processing - generates invoices directly from BMD data with missing info highlights
 */
async function handleBMDOnlyProcessing(formData: FormData, bmdFile: File) {
  console.log('🧾 Starting BMD-only processing...');
  
  if (!bmdFile) {
    return NextResponse.json({ error: 'BMD file is required' }, { status: 400 });
  }

  // Parse BMD file
  console.log('📊 Parsing BMD file:', bmdFile.name);
  const bmdContent = await bmdFile.text();
  const bmdParseResult = parseBMDCSV(bmdContent);
  
  // Only fail if no invoices could be parsed at all (fatal error)
  if (bmdParseResult.invoices.length === 0) {
    return NextResponse.json({
      error: 'BMD parsing failed',
      details: bmdParseResult.errors
    }, { status: 400 });
  }
  if (bmdParseResult.warnings.length > 0) {
    console.warn(`⚠️ BMD parse warnings: ${bmdParseResult.warnings.join('; ')}`);
  }

  // Filter by selected months if provided
  const selectedMonthsRaw = formData.get('selectedMonths') as string;
  const selectedMonths: string[] = selectedMonthsRaw ? JSON.parse(selectedMonthsRaw) : [];
  const bmdInvoices = selectedMonths.length > 0
    ? bmdParseResult.invoices.filter(inv => selectedMonths.includes(inv.documentDate.substring(0, 7)))
    : bmdParseResult.invoices;
  console.log(`📅 Month filter: ${selectedMonths.length > 0 ? selectedMonths.join(', ') : 'all'} → ${bmdInvoices.length}/${bmdParseResult.invoices.length} invoices`);

  // Create invoice data directly from BMD entries
  const invoiceRows = bmdInvoices.map((bmdInvoice, index) => {
    const missingFields: string[] = [];
    
    // Check for missing critical information
    if (!bmdInvoice.guestName) missingFields.push('Guest Name');
    if (!bmdInvoice.propertyCode) missingFields.push('Property Code');
    if (!bmdInvoice.platform) missingFields.push('Platform');
    if (!bmdInvoice.reservationNumber) missingFields.push('Reservation Number');
    
    // Handle missing property ID - use property code or fallback to default
    const propertyId = bmdInvoice.propertyCode || 'default';
    const hasValidProperty = !!bmdInvoice.propertyCode;
    
    return {
      id: `bmd-${index}`,
      invoiceNumber: bmdInvoice.belegnr,
      guestName: bmdInvoice.guestName || `<span style="color: red; font-weight: bold;">[MISSING GUEST NAME]</span>`,
      guestAddress: `<span style="color: red; font-weight: bold;">[MISSING ADDRESS - BMD Only]</span>`,
      checkInDate: `<span style="color: red; font-weight: bold;">[MISSING CHECK-IN]</span>`,
      checkOutDate: `<span style="color: red; font-weight: bold;">[MISSING CHECK-OUT]</span>`,
      nights: `<span style="color: red; font-weight: bold;">[UNKNOWN]</span>`,
      propertyId: propertyId, // FIXED: Added propertyId for invoice generation
      propertyCode: bmdInvoice.propertyCode || `<span style="color: red; font-weight: bold;">[MISSING PROPERTY]</span>`,
      platform: bmdInvoice.platform || `<span style="color: red; font-weight: bold;">[MISSING PLATFORM]</span>`,
      reservationId: bmdInvoice.reservationNumber || `<span style="color: red; font-weight: bold;">[MISSING RESERVATION #]</span>`,
      amountPaidGross: bmdInvoice.grossAmount,
      amountPaidNet: bmdInvoice.netAmount,
      vatAmount: bmdInvoice.vatAmount,
      cityTaxAmount: bmdInvoice.cityTaxAmount,
      currency: 'EUR',
      documentDate: bmdInvoice.documentDate,
      rawText: bmdInvoice.rawText,
      dataSource: 'BMD_ONLY',
      missingFields: missingFields,
      completionStatus: missingFields.length === 0 ? 'COMPLETE' : 'INCOMPLETE',
      completionPercentage: Math.round(((4 - missingFields.length) / 4) * 100),
      hasValidProperty: hasValidProperty // Track if property mapping is available
    };
  });

  const summary = {
    totalBMDInvoices: bmdInvoices.length,
    totalReservations: 0,
    successfulMatches: 0,
    partialMatches: 0,
    invalidMatches: 0,
    unmatchedBMD: 0,
    unmatchedReservations: 0,
    invoiceableRecords: bmdInvoices.length,
    completeRecords: invoiceRows.filter(row => row.completionStatus === 'COMPLETE').length,
    incompleteRecords: invoiceRows.filter(row => row.completionStatus === 'INCOMPLETE').length
  };

  return NextResponse.json({
    success: true,
    data: invoiceRows,
    processingStats: {
      bmdInvoicesFound: bmdParseResult.invoices.length,
      bmdInvoicesValid: bmdInvoices.length,
      reservationsFound: 0,
      reservationsValid: 0,
      finalMergedCount: bmdInvoices.length,
      directMatches: 0,
      conservativeEntries: 0,
    },
    validationResult: {
      validMatches: [],
      partialMatches: [],
      invalidMatches: [],
      unmatchedBMDInvoices: [],
      unmatchedReservations: [],
      summary: summary,
      feedback: {
        successMessages: [
          `Successfully parsed ${bmdParseResult.invoices.length} BMD invoices`,
          `${summary.completeRecords} invoices have complete data`,
          `${summary.incompleteRecords} invoices have missing information (shown in red)`
        ],
        warnings: summary.incompleteRecords > 0 ? [
          `${summary.incompleteRecords} invoices have missing information`,
          'Missing fields are highlighted in red',
          'Upload reservation files later to complete the data'
        ] : [],
        errors: bmdParseResult.errors,
        suggestions: [
          'BMD-only mode: all invoices can be generated',
          'Missing information is highlighted in red',
          'Consider uploading reservation files to complete guest details'
        ],
      },
    },
    errors: [...bmdParseResult.errors, ...bmdParseResult.warnings],
    warnings: summary.incompleteRecords > 0 ? [
      `${summary.incompleteRecords} invoices missing guest/reservation details`
    ] : [],
    processingType: 'BMD_ONLY'
  });
}

/**
 * Multi-source processing with unified reservation data
 */
async function handleMultiSourceProcessing(formData: FormData, bmdFile: File, usePositionalMatching: boolean = false) {
  console.log('🔍 Starting multi-source reservation processing...');
  console.log('🎯 Matching mode: SIMILARITY (positional disabled)');
  
  if (!bmdFile) {
    return NextResponse.json({ error: 'BMD file is required' }, { status: 400 });
  }

  // Parse BMD file
  console.log('📊 Parsing BMD file:', bmdFile.name);
  const bmdContent = await bmdFile.text();
  const bmdParseResult = parseBMDCSV(bmdContent);
  
  // Only fail if no invoices could be parsed at all (fatal error)
  if (bmdParseResult.invoices.length === 0) {
    return NextResponse.json({
      error: 'BMD parsing failed',
      details: bmdParseResult.errors
    }, { status: 400 });
  }
  if (bmdParseResult.warnings.length > 0) {
    console.warn(`⚠️ BMD parse warnings: ${bmdParseResult.warnings.join('; ')}`);
  }

  // Filter by selected months if provided
  const selectedMonthsRaw = formData.get('selectedMonths') as string;
  const selectedMonths: string[] = selectedMonthsRaw ? JSON.parse(selectedMonthsRaw) : [];
  const bmdInvoices = selectedMonths.length > 0
    ? bmdParseResult.invoices.filter(inv => selectedMonths.includes(inv.documentDate.substring(0, 7)))
    : bmdParseResult.invoices;
  console.log(`📅 Month filter: ${selectedMonths.length > 0 ? selectedMonths.join(', ') : 'all'} → ${bmdInvoices.length}/${bmdParseResult.invoices.length} invoices`);

  // Collect all reservation files
  const totalFiles = parseInt(formData.get('totalReservationFiles') as string || '0');
  console.log(`📁 Expected ${totalFiles} reservation files`);
  
  const reservationFiles: Array<{ file: File; source: string; month?: string; filename: string }> = [];
  
  for (let i = 0; i < totalFiles; i++) {
    const file = formData.get(`reservationFile_${i}`) as File;
    const source = formData.get(`source_${i}`) as string || 'BOOKING_COM';
    const month = formData.get(`month_${i}`) as string;
    
    if (file && file.size > 0) {
      reservationFiles.push({
        file,
        source,
        month,
        filename: file.name
      });
      console.log(`📄 Collected: ${file.name} (${source}${month ? `, ${month}` : ''})`);
    }
  }

  if (reservationFiles.length === 0) {
    return NextResponse.json({ error: 'No valid reservation files provided' }, { status: 400 });
  }

  // Parse all reservation sources
  console.log('🔄 Parsing multi-source reservations...');
  const parser = new MultiSourceReservationParser();
  
  const fileContents = await Promise.all(
    reservationFiles.map(async (item) => ({
      content: await item.file.text(),
      filename: item.filename,
      source: item.source
    }))
  );

  const { reservations, stats, errors } = await parser.parseAllSources(fileContents);
  
  console.log(`✅ Multi-source parsing complete: ${reservations.length} unified reservations`);
  console.log('📊 Source breakdown:', stats.map(s => `${s.source}: ${s.validRecords}`));

  if (errors.length > 0) {
    console.warn('⚠️ Parsing warnings:', errors);
  }

  // Perform multi-source validation and matching
  console.log('🎯 Starting multi-source BMD validation...');
  const validator = new InvoiceValidationService();
  const validationResult = validator.validateAndMatchMultiSource(
    bmdInvoices, 
    reservations, 
    false,
    true // Enable two-phase matching by default to prevent platform mixing
  );
  
  // Generate invoiceable CSV data
  console.log('📋 Creating invoiceable records...');
  const invoiceProcessor = new EnhancedInvoiceDataProcessor();
  
  // Convert validation results to invoice data
  const csvRows = invoiceProcessor.createInvoiceRowsFromMultiSourceValidation(validationResult, bmdInvoices, reservations);
  
  console.log(`🎉 Multi-source processing complete: ${csvRows.length} invoiceable records`);

  return NextResponse.json({
    success: true,
    data: csvRows,
    processingType: 'MULTI_SOURCE',
    processingStats: {
      bmdInvoicesFound: bmdParseResult.invoices.length,
      bmdInvoicesValid: bmdInvoices.length,
      reservationsFound: reservations.length,
      reservationsValid: reservations.length,
      finalMergedCount: csvRows.length,
      directMatches: validationResult.summary.successfulMatches,
      conservativeEntries: validationResult.summary.unmatchedBMD,
      sourceBreakdown: stats.reduce((acc, stat) => {
        acc[stat.source] = stat.validRecords;
        return acc;
      }, {} as Record<string, number>)
    },
    validationResult,
    multiSourceStats: {
      totalSources: stats.length,
      sourceStats: stats,
    },
    errors: [...bmdParseResult.errors, ...errors],
    warnings: [...bmdParseResult.warnings]
  });
}

/**
 * LEGACY: Enhanced monthly processing (backward compatibility)  
 */
async function handleMonthlyProcessing(formData: FormData, bmdFile: File) {
  console.log('📅 Starting legacy monthly processing...');
  
  // Get all reservation files with their explicit month assignments
  const reservationFiles: File[] = [];
  const monthAssignments: string[] = [];
  let fileIndex = 0;
  
  // Get files with explicit month assignments
  while (true) {
    const reservationFile = formData.get(`reservationsFile${fileIndex}`) as File;
    const monthAssignment = formData.get(`month${fileIndex}`) as string;
    
    if (!reservationFile) break;
    
    reservationFiles.push(reservationFile);
    monthAssignments.push(monthAssignment || `month-${fileIndex + 1}`);
    fileIndex++;
  }
  
  if (!bmdFile || reservationFiles.length === 0) {
    return NextResponse.json({ error: 'BMD file and reservation files required' }, { status: 400 });
  }

  // Process with enhanced processor for backward compatibility
  const processor = new EnhancedInvoiceDataProcessor({
    validateData: true,
    conservativeMode: true,
    bmdPriority: true,
    crossMonthNumbering: true,
    enableFuzzyMatching: false,
    emptyFieldPolicy: 'LEAVE_EMPTY',
  });

  const reservationData: { month: string; content: string }[] = [];
  
  for (let i = 0; i < reservationFiles.length; i++) {
    const file = reservationFiles[i];
    const content = await file.text();
    const month = monthAssignments[i];
    reservationData.push({ month, content });
  }

  let bmdContent: string | Buffer;
  const isExcelFile = bmdFile.name.toLowerCase().endsWith('.xlsx') || bmdFile.name.toLowerCase().endsWith('.xls');
  
  if (isExcelFile) {
    bmdContent = Buffer.from(await bmdFile.arrayBuffer());
  } else {
    bmdContent = await bmdFile.text();
  }

  const result = await processor.processMultiMonthData(bmdContent, reservationData);
  
  return NextResponse.json({
    success: result.success,
    data: result.invoiceRows,
    processingStats: result.processingStats,
    monthlyBreakdown: result.monthlyBreakdown,
    crossMonthStats: result.crossMonthStats,
    qualityMetrics: result.qualityMetrics,
    validationResult: result.validationResult,
    errors: result.errors,
    warnings: result.warnings,
    processingType: 'multi-month-enhanced'
  });
}

/**
 * LEGACY: Basic dual CSV processing (backward compatibility)
 */
async function handleLegacyProcessing(formData: FormData, bmdFile: File) {
  console.log('📊 Starting legacy dual CSV processing...');
  
  const reservationFile = formData.get('reservationFile') as File;
  
  if (!bmdFile || !reservationFile) {
    return NextResponse.json({ error: 'Both BMD and reservation files required' }, { status: 400 });
  }

  const bmdContent = await bmdFile.text();
  const reservationContent = await reservationFile.text();

  // Use enhanced processor in single-file mode
  const processor = new EnhancedInvoiceDataProcessor({ conservativeMode: true });
  const result = await processor.processMultiMonthData(
    bmdContent,
    [{ month: 'single', content: reservationContent }]
  );

  return NextResponse.json({
    success: result.success,
    data: result.invoiceRows,
    processingStats: result.processingStats,
    errors: result.errors,
    warnings: result.warnings,
    processingType: 'dual-csv-legacy'
  });
}