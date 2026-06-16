/**
 * Enhanced Invoice Data Processing Service
 * 
 * This service provides a high-level interface for processing BMD Excel files (multiple sheets)
 * and multiple Reservations CSV files with improved parsing, validation, and conservative merging.
 * 
 * Key capabilities:
 * - Multi-month processing (BMD Excel with multiple sheets + separate reservation files)
 * - BMD-primary processing (reservations only for enrichment)
 * - Conservative data handling (leave empty rather than guess)
 * - Cross-month invoice numbering support
 * - Comprehensive error handling and validation
 */

import { parseBMDCSV, BMDInvoice } from './bmd-parser';
import { parseReservationsCSV } from './reservations-parser';
import { InvoiceDataMerger, MergedInvoiceData, ReservationData as MergerReservationData } from './invoice-data-merger';
import { InvoiceValidationService, ValidationResult, ValidationMatch } from './invoice-validation-service';
import { CSVRow } from './types';
import * as XLSX from 'xlsx';

// Property code to property ID mapping (based on invoicePrefix)
const PROPERTY_CODE_TO_ID: { [key: string]: string } = {
  'BEGA': 'apt01', // Home Sweet Home - Vienna Central
  'WAFG': 'min2gzrw5jk0v9qqze3', // Home Sweet Home - State Opera
  'LAS': 'min2igkkgvg6pzcwwvi', // Home Sweet Home - Leopold
  'KRA': 'min2k2kh8w5yhcyuswe', // Home Sweet Home - Stephansplatz I
  'BM': 'min2ltvekfxzpyju8dk', // Home Sweet Home - Stephansdom II
  'KLIE': 'min2n6fvh134twkyncj', // Margot
  'LAM': 'min2o8rqw1mjp3vgfua', // Danube Suites
  'ZIM': 'min2qh8b3gupei5i2cn', // Céleste Suites
};

// Property code to name mapping
const PROPERTY_CODE_MAP: { [key: string]: string } = {
  'BEGA': 'Home Sweet Home - Vienna Central',
  'WAFG': 'Home Sweet Home - State Opera',
  'LAS': 'Home Sweet Home - Leopold',
  'KRA': 'Home Sweet Home - Stephansdom',
  'BM': 'Home Sweet Home - Stephansdom II',
  'KLIE': 'Margot',
  'LAM': 'Denube Suites',
  'ZIM': 'Céleste Suites',
};

// Import types from existing modules
interface ReservationData {
  reservationNumber: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  propertyId: string;
  totalAmount: number;
  platform?: string;
}

interface InvoiceRowItem {
  invoiceNumber: string;
  grossAmount: number;
  vatAmount: number;
  netAmount: number;
  checkInDate: string;
  checkOutDate: string;
  guestName: string;
  propertyId: string;
  reservationId: string;
  confidence: number;
  warnings: string[];
  // For CSV compatibility
  amountPaidGross: number;
  currency: string;
}

export interface ProcessingOptions {
  validateData?: boolean;
  conservativeMode?: boolean; // Leave fields empty rather than guess 
  minimumConfidence?: number;
  bmdPriority?: boolean; // BMD is authoritative, reservations only for enrichment
  crossMonthNumbering?: boolean; // Support invoice numbering across months
  enableFuzzyMatching?: boolean;
  emptyFieldPolicy?: 'LEAVE_EMPTY' | 'USE_FALLBACK' | 'GENERATE_PLACEHOLDER';
}

export interface MultiMonthProcessingResult {
  success: boolean;
  invoiceRows: CSVRow[];
  monthlyBreakdown: {
    [month: string]: {
      bmdInvoices: number;
      reservations: number;
      finalInvoices: number;
      errors: string[];
      warnings: string[];
    };
  };
  crossMonthStats: {
    totalMonths: number;
    totalBMDInvoices: number;
    totalReservations: number;
    invoiceNumberRange: { first: string; last: string } | null;
    duplicateInvoiceNumbers: string[];
  };
  processingStats: {
    bmdInvoicesFound: number;
    bmdInvoicesValid: number;
    reservationsFound: number;
    reservationsValid: number;
    finalMergedCount: number;
    directMatches: number;
    conservativeEntries: number; // Entries with only BMD data
    emptyFieldCount: number;
  };
  qualityMetrics: {
    averageConfidence: number;
    bmdOnlyEntries: number;
    enrichedEntries: number; // BMD + reservation data
    conservativelyProcessed: number;
  };
  // Enhanced validation feedback
  validationResult: ValidationResult;
  errors: string[];
  warnings: string[];
  processingDetails: any;
}

/**
 * Enhanced service class for multi-month invoice data processing
 */
export class EnhancedInvoiceDataProcessor {
  private options: ProcessingOptions;
  private merger: InvoiceDataMerger;
  private validationService: InvoiceValidationService;
  
  constructor(options: ProcessingOptions = {}) {
    this.options = {
      validateData: true,
      conservativeMode: true, // Default to conservative processing
      minimumConfidence: 50, // Lower threshold since BMD is authoritative
      bmdPriority: true, // BMD data takes precedence
      crossMonthNumbering: true,
      enableFuzzyMatching: false, // Disabled in conservative mode
      emptyFieldPolicy: 'LEAVE_EMPTY', // Don't generate fake data
      ...options,
    };
    
    this.merger = new InvoiceDataMerger([], []); // Will be properly initialized per-call
    this.validationService = new InvoiceValidationService();
    
    console.log(`=== Enhanced Invoice Processor initialized ===`);
    console.log(`Conservative mode: ${this.options.conservativeMode}`);
    console.log(`BMD priority: ${this.options.bmdPriority}`);
    console.log(`Empty field policy: ${this.options.emptyFieldPolicy}`);
  }
  
  /**
   * Convert reservation data from parser format to merger format
   */
  private convertReservationData(parserReservations: MergerReservationData[]): ReservationData[] {
    return parserReservations.map(res => ({
      reservationNumber: res.reservationNumber,
      guestName: res.bookerName,
      checkInDate: res.arrival,
      checkOutDate: res.departure,
      propertyId: res.propertyCode || 'UNKNOWN',
      totalAmount: res.totalPayment,
      platform: res.source || 'CSV_IMPORT',
    }));
  }

  /**
   * Process BMD Excel file (multiple sheets) with multiple reservation CSV files
   */
  async processMultiMonthData(
    bmdExcelContent: Buffer | string,
    reservationFiles: { month: string; content: string }[]
  ): Promise<MultiMonthProcessingResult> {
    console.log('=== MULTI-MONTH INVOICE PROCESSING ===');
    console.log(`Processing ${reservationFiles.length} months of data`);
    
    const result: MultiMonthProcessingResult = {
      success: false,
      invoiceRows: [],
      monthlyBreakdown: {},
      crossMonthStats: {
        totalMonths: reservationFiles.length,
        totalBMDInvoices: 0,
        totalReservations: 0,
        invoiceNumberRange: null,
        duplicateInvoiceNumbers: [],
      },
      processingStats: {
        bmdInvoicesFound: 0,
        bmdInvoicesValid: 0,
        reservationsFound: 0,
        reservationsValid: 0,
        finalMergedCount: 0,
        directMatches: 0,
        conservativeEntries: 0,
        emptyFieldCount: 0,
      },
      qualityMetrics: {
        averageConfidence: 0,
        bmdOnlyEntries: 0,
        enrichedEntries: 0,
        conservativelyProcessed: 0,
      },
      // Initialize empty validation result
      validationResult: {
        validMatches: [],
        partialMatches: [],
        invalidMatches: [],
        unmatchedBMDInvoices: [],
        unmatchedReservations: [],
        summary: {
          totalBMDInvoices: 0,
          totalReservations: 0,
          successfulMatches: 0,
          partialMatches: 0,
          invalidMatches: 0,
          unmatchedBMD: 0,
          unmatchedReservations: 0,
          invoiceableRecords: 0,
        },
        feedback: {
          successMessages: [],
          warnings: [],
          errors: [],
          suggestions: [],
        },
      },
      errors: [],
      warnings: [],
      processingDetails: {},
    };
    
    try {
      // Step 1: Parse BMD data (Excel or CSV)
      let bmdResult: { invoices: BMDInvoice[]; errors: string[]; warnings: string[] };
      
      if (Buffer.isBuffer(bmdExcelContent)) {
        // Excel file (Buffer)
        console.log('Processing BMD Excel file...');
        bmdResult = await this.parseBMDExcel(bmdExcelContent);
      } else {
        // CSV content (String)
        console.log('Processing BMD CSV content...');
        const csvResult = parseBMDCSV(bmdExcelContent);
        bmdResult = {
          invoices: csvResult.invoices,
          errors: csvResult.errors,
          warnings: [], // CSV parser doesn't have warnings
        };
      }
      
      result.errors.push(...bmdResult.errors);
      result.warnings.push(...bmdResult.warnings);
      
      // Don't fail completely if we have some invoices but also some errors
      if (bmdResult.errors.length > 0 && bmdResult.invoices.length === 0) {
        result.errors.push(`BMD parsing completely failed: ${bmdResult.errors.join('; ')}`);
        return result;
      } else if (bmdResult.errors.length > 0) {
        result.warnings.push(`BMD parsing had ${bmdResult.errors.length} errors but found ${bmdResult.invoices.length} valid invoices`);
      }
      
      // Conservative validation - only reject critical errors
      const bmdValidation = this.validateBMDConservatively(bmdResult.invoices);
      result.warnings.push(...bmdValidation.warnings);
      
      result.crossMonthStats.totalBMDInvoices = bmdValidation.valid.length;
      result.processingStats.bmdInvoicesFound = bmdResult.invoices.length;
      result.processingStats.bmdInvoicesValid = bmdValidation.valid.length;
      
      if (bmdValidation.invalid.length > 0) {
        for (const invalid of bmdValidation.invalid) {
          result.errors.push(`Invoice ${invalid.invoice.belegnr}: ${invalid.issues.join(', ')}`);
        }
      }
      
      // Step 2: Initialize monthly breakdown
      for (const reservationFile of reservationFiles) {
        result.monthlyBreakdown[reservationFile.month] = {
          bmdInvoices: 0,
          reservations: 0,
          finalInvoices: 0,
          errors: [],
          warnings: [],
        };
      }
      
      // Step 3: Process each month's reservations
      const allReservations: ReservationData[] = [];
      
      for (const reservationFile of reservationFiles) {
        try {
          const reservationsResult = parseReservationsCSV(reservationFile.content);
          
          result.monthlyBreakdown[reservationFile.month].reservations = reservationsResult.reservations.length;
          
          result.processingStats.reservationsFound += reservationsResult.reservations.length;
          result.processingStats.reservationsValid += reservationsResult.reservations.length;
          
          // Convert to the expected format
          const convertedReservations = this.convertReservationData(reservationsResult.reservations);
          allReservations.push(...convertedReservations);
          
          if (reservationsResult.errors.length > 0) {
            result.warnings.push(`${reservationFile.month} reservations: ${reservationsResult.errors.join('; ')}`);
          }
        } catch (error) {
          const errorMsg = `Failed to parse reservations for ${reservationFile.month}: ${error}`;
          result.warnings.push(errorMsg);
          console.warn(errorMsg);
        }
      }
      
      result.crossMonthStats.totalReservations = allReservations.length;
      
      // Step 4: Enhanced Validation and Matching
      // Convert ReservationData back to MergerReservationData for validation
      const mergerReservations: MergerReservationData[] = allReservations.map(res => ({
        reservationNumber: res.reservationNumber,
        propertyName: PROPERTY_CODE_MAP[res.propertyId] || 'Unknown Property',
        propertyCode: res.propertyId,
        bookerName: res.guestName,
        arrival: res.checkInDate,
        departure: res.checkOutDate,
        totalPayment: res.totalAmount,
        currency: 'EUR',
        status: 'confirmed',
        source: res.platform || 'CSV_IMPORT',
      }));
      
      console.log(`🔍 Running validation and matching: ${bmdValidation.valid.length} BMD invoices vs ${mergerReservations.length} reservations`);
      
      // Use enhanced validation service for matching and feedback
      const validationResult = this.validationService.validateAndMatch(
        bmdValidation.valid, 
        mergerReservations
      );
      
      // Store validation result for detailed feedback
      result.validationResult = validationResult;
      
      // Add validation feedback to main result
      result.errors.push(...validationResult.feedback.errors);
      result.warnings.push(...validationResult.feedback.warnings);
      
      // Log validation summary
      console.log(`✅ Validation completed:`);
      console.log(`  - Valid matches: ${validationResult.summary.successfulMatches}`);
      console.log(`  - Partial matches: ${validationResult.summary.partialMatches}`)
      console.log(`  - Invalid matches: ${validationResult.summary.invalidMatches}`);
      console.log(`  - Unmatched BMD: ${validationResult.summary.unmatchedBMD}`);
      console.log(`  - Unmatched Reservations: ${validationResult.summary.unmatchedReservations}`);
      console.log(`  - Invoiceable records: ${validationResult.summary.invoiceableRecords}`);
      
      // Step 5: Convert ONLY successfully matched invoices to CSV rows (no unmatched BMD)
      const allMatches = [...validationResult.validMatches, ...validationResult.partialMatches];
      
      console.log(`📝 Converting ${allMatches.length} successful matches to invoice rows (skipping unmatched BMD invoices)...`);
      console.log(`❌ Skipping ${validationResult.unmatchedBMDInvoices.length} unmatched BMD invoices - see detailed feedback below`);
      
      // Process ONLY validated matches (BMD + Reservation enrichment)
      for (const match of allMatches) {
        if (!match.canGenerateInvoice) continue;
        
        const invoiceRow = this.createBMDDrivenCSVRow(match.bmdInvoice, match.reservation, match.matchConfidence, match.matchReasons);
        result.invoiceRows.push(invoiceRow);
      }
      
      // Generate detailed feedback for unmatched BMD invoices (but don't create invoice rows)
      console.log(`\n🔍 DETAILED ANALYSIS FOR ${validationResult.unmatchedBMDInvoices.length} UNMATCHED BMD INVOICES:`);
      for (const bmdInvoice of validationResult.unmatchedBMDInvoices) {
        const missingData = this.analyzeMissingDataForBMD(bmdInvoice, mergerReservations);
        result.validationResult.feedback.suggestions.push(
          `BMD Invoice ${bmdInvoice.belegnr}: ${missingData.analysis} | Missing: ${missingData.missingItems.join(', ')}`
        );
        console.log(`   ❌ Invoice ${bmdInvoice.belegnr}: ${missingData.analysis}`);
        console.log(`      Missing: ${missingData.missingItems.join(', ')}`);
        console.log(`      BMD Data: Amount=€${bmdInvoice.grossAmount}, Guest="${bmdInvoice.guestName || 'UNKNOWN'}", Property=${bmdInvoice.propertyCode || 'UNKNOWN'}, Date=${bmdInvoice.documentDate}`);
      }
      
      // Generate detailed feedback for invalid matches
      console.log(`\n🔍 DETAILED ANALYSIS FOR ${validationResult.invalidMatches.length} INVALID MATCHES:`);
      for (const invalidMatch of validationResult.invalidMatches) {
        const issues = this.analyzeInvalidMatch(invalidMatch);
        result.validationResult.feedback.suggestions.push(
          `BMD Invoice ${invalidMatch.bmdInvoice.belegnr}: Low confidence match (${invalidMatch.matchConfidence}%) | Issues: ${issues.join(', ')}`
        );
        console.log(`   ❌ Invoice ${invalidMatch.bmdInvoice.belegnr}: ${invalidMatch.matchConfidence}% confidence - ${issues.join(', ')}`);
        if (invalidMatch.reservation) {
          console.log(`      Best match was: Reservation ${invalidMatch.reservation.reservationNumber} (${invalidMatch.reservation.bookerName})`);
        }
      }
      
      // Update processing statistics based on validation results
      result.processingStats.finalMergedCount = result.invoiceRows.length;
      result.processingStats.directMatches = validationResult.validMatches.length;
      result.processingStats.conservativeEntries = validationResult.summary.unmatchedBMD;
      
      // Step 6: Calculate quality metrics based on validation
      const totalMatches = validationResult.validMatches.length + validationResult.partialMatches.length;
      if (totalMatches > 0) {
        const totalConfidence = [...validationResult.validMatches, ...validationResult.partialMatches]
          .reduce((sum, match) => sum + match.matchConfidence, 0);
        
        result.qualityMetrics.averageConfidence = totalConfidence / totalMatches;
        result.qualityMetrics.enrichedEntries = validationResult.validMatches.filter(m => m.reservation).length;
        result.qualityMetrics.bmdOnlyEntries = validationResult.validMatches.filter(m => !m.reservation).length;
        result.qualityMetrics.conservativelyProcessed = validationResult.summary.unmatchedBMD;
      }
      
      // Step 7: Calculate cross-month statistics
      this.calculateCrossMonthStats(bmdValidation.valid, result);
      this.updateMonthlyBreakdownValidation(validationResult, result);
      
      result.success = true;
      console.log(`=== PROCESSING COMPLETED SUCCESSFULLY ===`);
      console.log(`Total invoices processed: ${result.invoiceRows.length}`);
      console.log(`Conservative entries: ${result.processingStats.conservativeEntries}`);
      console.log(`Average confidence: ${result.qualityMetrics.averageConfidence.toFixed(1)}%`);
      console.log(`Validation feedback: ${result.validationResult.feedback.successMessages.length} success, ${result.validationResult.feedback.errors.length} errors`);
      
    } catch (error) {
      result.errors.push(`Processing failed: ${error}`);
      console.error('Enhanced processing error:', error);
    }
    
    return result;
  }
  
  /**
   * Parse BMD Excel file with multiple sheets
   */
  private async parseBMDExcel(excelBuffer: Buffer): Promise<{
    invoices: BMDInvoice[];
    errors: string[];
    warnings: string[];
    sheetStats: { [sheetName: string]: { invoices: number; errors: number } };
  }> {
    const result = {
      invoices: [] as BMDInvoice[],
      errors: [] as string[],
      warnings: [] as string[],
      sheetStats: {} as { [sheetName: string]: { invoices: number; errors: number } }
    };

    try {
      // Parse Excel workbook
      const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
      
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        result.errors.push('Excel file contains no sheets');
        return result;
      }

      result.warnings.push(`Found ${workbook.SheetNames.length} sheets: ${workbook.SheetNames.join(', ')}`);

      // Process each sheet
      for (const sheetName of workbook.SheetNames) {
        try {
          const sheet = workbook.Sheets[sheetName];
          
          if (!sheet) {
            result.warnings.push(`Sheet '${sheetName}' is empty or unreadable`);
            result.sheetStats[sheetName] = { invoices: 0, errors: 1 };
            continue;
          }

          // Convert sheet to CSV format
          const csvContent = XLSX.utils.sheet_to_csv(sheet, {
            blankrows: false
          });

          if (!csvContent || csvContent.trim().length === 0) {
            result.warnings.push(`Sheet '${sheetName}' contains no data`);
            result.sheetStats[sheetName] = { invoices: 0, errors: 0 };
            continue;
          }

          // Use existing BMD CSV parser
          const sheetResult = parseBMDCSV(csvContent);
          
          // Collect results from this sheet
          result.invoices.push(...sheetResult.invoices);
          
          if (sheetResult.errors.length > 0) {
            result.errors.push(...sheetResult.errors.map(e => `${sheetName}: ${e}`));
          }

          result.sheetStats[sheetName] = {
            invoices: sheetResult.invoices.length,
            errors: sheetResult.errors.length
          };

          console.log(`Sheet '${sheetName}': ${sheetResult.invoices.length} invoices found`);

        } catch (sheetError) {
          const errorMsg = sheetError instanceof Error ? sheetError.message : 'Unknown sheet parsing error';
          result.errors.push(`Failed to parse sheet '${sheetName}': ${errorMsg}`);
          result.sheetStats[sheetName] = { invoices: 0, errors: 1 };
        }
      }

      // Summary
      const totalSheets = workbook.SheetNames.length;
      const totalInvoices = result.invoices.length;
      const sheetsWithErrors = Object.values(result.sheetStats).filter(s => s.errors > 0).length;
      
      if (totalInvoices === 0) {
        result.errors.push(`No BMD invoices found across ${totalSheets} sheets`);
      } else {
        result.warnings.push(`Successfully processed ${totalInvoices} invoices from ${totalSheets} sheets`);
        if (sheetsWithErrors > 0) {
          result.warnings.push(`${sheetsWithErrors} sheets had parsing errors`);
        }
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown Excel parsing error';
      result.errors.push(`Failed to parse Excel file: ${errorMsg}`);
    }

    return result;
  }
  
  /**
   * Create a BMD-driven CSVRow for invoice generation
   * BMD data is authoritative, reservation data used for enrichment only
   */
  private createBMDDrivenCSVRow(
    bmdInvoice: BMDInvoice, 
    reservation: MergerReservationData | null, 
    confidence: number,
    reasons: string[]
  ): CSVRow {
    console.log(`📋 Creating BMD-driven invoice row for ${bmdInvoice.belegnr}...`);
    
    // BMD data is AUTHORITATIVE - always use BMD values when available
    const invoiceNumber = bmdInvoice.belegnr;
    const grossAmount = bmdInvoice.grossAmount;
    const documentDate = bmdInvoice.documentDate;
    
    // Use BMD amounts if calculated, otherwise fall back to gross
    const netAmount = bmdInvoice.netAmount || grossAmount * 0.9; // Approximate if not in BMD
    const vatAmount = bmdInvoice.vatAmount || grossAmount * 0.1; // Approximate if not in BMD
    
    // Guest name: Prioritize BMD parsed name, then reservation, then fallback
    let guestName = 'Booking.com Guest'; // Default fallback
    if (bmdInvoice.guestName && bmdInvoice.guestName.trim().length > 0) {
      guestName = bmdInvoice.guestName; // BMD name is authoritative
      console.log(`   ✅ Using BMD guest name: "${guestName}"`);
    } else if (reservation?.bookerName) {
      guestName = reservation.bookerName; // Enrichment from reservation
      console.log(`   📝 Using reservation guest name: "${guestName}"`);
    } else {
      console.log(`   ⚠️ Using fallback guest name: "${guestName}"`);
    }
    
    // Check-in/Check-out: Use reservation dates if available, otherwise estimate from BMD date
    let checkInDate = '';
    let checkOutDate = '';
    
    if (reservation?.arrival && reservation?.departure) {
      checkInDate = reservation.arrival;
      checkOutDate = reservation.departure;
      console.log(`   ✅ Using reservation dates: ${checkInDate} → ${checkOutDate}`);
    } else if (documentDate) {
      // Estimate dates: assume 2-night stay ending on document date
      const docDate = new Date(documentDate);
      const estimatedCheckOut = docDate.toISOString().split('T')[0];
      const estimatedCheckIn = new Date(docDate.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      checkInDate = estimatedCheckIn;
      checkOutDate = estimatedCheckOut;
      console.log(`   📅 Estimated dates from BMD: ${checkInDate} → ${checkOutDate}`);
    } else {
      // Fallback to current date
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      checkOutDate = today.toISOString().split('T')[0];
      checkInDate = yesterday.toISOString().split('T')[0];
      console.log(`   ⚠️ Using fallback dates: ${checkInDate} → ${checkOutDate}`);
    }
    
    // Property: BMD is authoritative, map property code to property ID
    let propertyCode = 'BEGA'; // Default to first property code
    if (bmdInvoice.propertyCode && bmdInvoice.propertyCode !== 'undefined') {
      propertyCode = bmdInvoice.propertyCode;
      console.log(`   🏢 Using BMD property code: ${propertyCode}`);
    } else if (reservation?.propertyCode) {
      propertyCode = reservation.propertyCode;
      console.log(`   🏢 Using reservation property code: ${propertyCode}`);
    } else {
      console.log(`   🏢 Using default property code: ${propertyCode} (no property found in BMD or reservation)`);
    }
    
    // Map property code to property ID for invoice generation
    const propertyId = PROPERTY_CODE_TO_ID[propertyCode] || 'apt01'; // Fallback to first property
    
    // Reservation ID: From reservation if matched
    const reservationId = reservation?.reservationNumber || '';
    
    // Create warnings list for transparency
    const warnings: string[] = [];
    warnings.push(`Confidence: ${confidence}%`);
    
    if (reasons.length > 0) {
      warnings.push(`Match: ${reasons.join(', ')}`);
    }
    
    if (bmdInvoice.cityTaxAmount && bmdInvoice.cityTaxAmount > 0) {
      warnings.push(`City tax: €${bmdInvoice.cityTaxAmount.toFixed(2)}`);
    }
    
    if (bmdInvoice.vatAmount && bmdInvoice.vatAmount > 0) {
      warnings.push(`VAT: €${bmdInvoice.vatAmount.toFixed(2)}`);
    }
    
    if (!reservation) {
      warnings.push('BMD-only invoice (no reservation match)');
    }
    
    const invoiceRow: CSVRow = {
      reservationId: reservationId || `BMD-${invoiceNumber}`, // Required by schema
      guestName,
      checkInDate,
      checkOutDate,
      amountPaidGross: grossAmount, // Required field name
      currency: 'EUR',
      invoiceNumber, // Optional but important
      propertyId, // Now part of the schema
      warnings, // Add warnings to the row
    };
    
    console.log(`   📋 Created: Invoice ${invoiceNumber}, Guest: "${guestName}", Amount: €${grossAmount}, Property: ${propertyCode}->${propertyId}`);
    
    return invoiceRow;
  }
  
  /**
   * Conservative BMD validation - only fail on critical issues
   */
  private validateBMDConservatively(invoices: BMDInvoice[]): {
    valid: BMDInvoice[];
    invalid: Array<{ invoice: BMDInvoice; issues: string[] }>;
    warnings: string[];
  } {
    const valid: BMDInvoice[] = [];
    const invalid: Array<{ invoice: BMDInvoice; issues: string[] }> = [];
    const warnings: string[] = [];
    
    for (const invoice of invoices) {
      const issues: string[] = [];
      
      // Only critical validation - BMD is authoritative
      if (!invoice.belegnr || invoice.belegnr.length < 3) {
        issues.push('Missing or invalid invoice number');
      }
      
      if (invoice.grossAmount <= 0) {
        issues.push('Invalid or zero gross amount');
      }
      
      // Everything else is just warnings, not errors
      if (!invoice.reservationNumber) {
        warnings.push(`${invoice.belegnr}: No reservation number found - will process as BMD-only`);
      }
      
      if (!invoice.guestName) {
        warnings.push(`${invoice.belegnr}: No guest name extracted - field will be left empty`);
      }
      
      if (!invoice.propertyCode) {
        warnings.push(`${invoice.belegnr}: No property code detected - will use default`);
      }
      
      if (issues.length === 0) {
        valid.push(invoice);
      } else {
        invalid.push({ invoice, issues });
      }
    }
    
    return { valid, invalid, warnings };
  }
  
  /**
   * Calculate cross-month statistics
   */
  private calculateCrossMonthStats(bmdInvoices: BMDInvoice[], result: MultiMonthProcessingResult): void {
    const invoiceNumbers = bmdInvoices.map(inv => inv.belegnr).sort();
    
    if (invoiceNumbers.length > 0) {
      result.crossMonthStats.invoiceNumberRange = {
        first: invoiceNumbers[0],
        last: invoiceNumbers[invoiceNumbers.length - 1]
      };
    }
    
    // Check for duplicate invoice numbers
    const duplicates = invoiceNumbers.filter((num, index) => 
      invoiceNumbers.indexOf(num) !== index
    );
    result.crossMonthStats.duplicateInvoiceNumbers = Array.from(new Set(duplicates));
    
    if (duplicates.length > 0) {
      result.warnings.push(`Found ${duplicates.length} duplicate invoice numbers: ${duplicates.join(', ')}`);
    }
  }
  
  /**
   * Update monthly breakdown based on validation results
   */
  private updateMonthlyBreakdownValidation(
    validationResult: ValidationResult, 
    result: MultiMonthProcessingResult
  ): void {
    // Count final invoices that can be generated
    const invoiceableMatches = [
      ...validationResult.validMatches,
      ...validationResult.partialMatches
    ].filter(match => match.canGenerateInvoice);

    // For now, just update the total final invoices
    // In a more sophisticated version, we could group by actual month
    // based on the checkout dates from the reservation data
    let totalFinalInvoices = 0;
    for (const match of invoiceableMatches) {
      totalFinalInvoices++;
      
      // Try to determine month from reservation data
      if (match.reservation?.departure) {
        const month = match.reservation.departure.substring(0, 7); // YYYY-MM
        // Find closest month in breakdown
        for (const [monthKey, breakdown] of Object.entries(result.monthlyBreakdown)) {
          if (monthKey.includes(month.split('-')[1])) { // Match month number
            breakdown.finalInvoices++;
            break;
          }
        }
      }
    }
    
    // If we couldn't assign to specific months, distribute evenly
    const monthsWithData = Object.keys(result.monthlyBreakdown).filter(
      month => result.monthlyBreakdown[month].reservations > 0
    );
    
    if (monthsWithData.length > 0) {
      const unassignedInvoices = totalFinalInvoices - Object.values(result.monthlyBreakdown)
        .reduce((sum, breakdown) => sum + breakdown.finalInvoices, 0);
        
      if (unassignedInvoices > 0) {
        // Distribute remaining invoices proportionally
        const invoicesPerMonth = Math.floor(unassignedInvoices / monthsWithData.length);
        monthsWithData.forEach(month => {
          result.monthlyBreakdown[month].finalInvoices += invoicesPerMonth;
        });
      }
    }
  }
  
  /**
   * Analyze what's missing for an unmatched BMD invoice
   */
  private analyzeMissingDataForBMD(bmdInvoice: BMDInvoice, reservations: MergerReservationData[]): {
    analysis: string;
    missingItems: string[];
  } {
    const missingItems: string[] = [];
    
    // Check what's missing in the BMD invoice itself
    if (!bmdInvoice.guestName || bmdInvoice.guestName.trim() === '') {
      missingItems.push('Guest name not extracted from BMD text');
    }
    
    if (!bmdInvoice.propertyCode || bmdInvoice.propertyCode === 'undefined') {
      missingItems.push('Property code not detected in BMD text');
    }
    
    if (!bmdInvoice.reservationNumber) {
      missingItems.push('Reservation number not found in BMD text');
    }
    
    // Check if there are any reservations with similar amounts
    const similarAmountReservations = reservations.filter(res => 
      Math.abs(res.totalPayment - bmdInvoice.grossAmount) < 50
    );
    
    if (similarAmountReservations.length > 0) {
      missingItems.push(`Found ${similarAmountReservations.length} reservations with similar amounts but names/dates don't match`);
    }
    
    // Check if there are reservations on similar dates
    let similarDateReservations = 0;
    if (bmdInvoice.documentDate) {
      const bmdDate = new Date(bmdInvoice.documentDate);
      similarDateReservations = reservations.filter(res => {
        const checkoutDate = new Date(res.departure);
        const daysDiff = Math.abs((bmdDate.getTime() - checkoutDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff <= 5;
      }).length;
      
      if (similarDateReservations > 0) {
        missingItems.push(`Found ${similarDateReservations} reservations within ±5 days but amounts/names don't match`);
      }
    }
    
    // Determine overall analysis
    let analysis = '';
    if (missingItems.length === 0) {
      analysis = 'BMD data complete but no matching reservation found';
    } else if (!bmdInvoice.guestName && !bmdInvoice.propertyCode) {
      analysis = 'BMD text parsing failed - needs manual property/guest classification';
    } else if (!bmdInvoice.guestName) {
      analysis = 'Guest name extraction failed from BMD text pattern';
    } else if (!bmdInvoice.propertyCode) {
      analysis = 'Property code detection failed in BMD text';
    } else {
      analysis = 'Partial BMD data available - reservation match not found';
    }
    
    return { analysis, missingItems };
  }
  
  /**
   * Analyze why a match has low confidence
   */
  private analyzeInvalidMatch(match: import('@/lib/invoice-validation-service').ValidationMatch): string[] {
    const issues: string[] = [];
    
    if (match.matchConfidence < 25) {
      issues.push('Very low overall confidence');
    }
    
    if (match.bmdInvoice.guestName && match.reservation) {
      const nameSimilarity = this.calculateSimpleStringSimilarity(
        match.bmdInvoice.guestName.toLowerCase(), 
        match.reservation.bookerName.toLowerCase()
      );
      
      if (nameSimilarity < 0.3) {
        issues.push(`Names very different: "${match.bmdInvoice.guestName}" vs "${match.reservation.bookerName}"`);
      }
    }
    
    if (match.bmdInvoice.propertyCode && match.reservation?.propertyCode) {
      if (match.bmdInvoice.propertyCode !== match.reservation.propertyCode) {
        issues.push(`Property mismatch: BMD=${match.bmdInvoice.propertyCode} vs Reservation=${match.reservation.propertyCode}`);
      }
    }
    
    const amountDiff = Math.abs(match.bmdInvoice.grossAmount - (match.reservation?.totalPayment || 0));
    if (amountDiff > 100) {
      issues.push(`Large amount difference: €${amountDiff.toFixed(2)}`);
    }
    
    if (match.bmdInvoice.documentDate && match.reservation?.departure) {
      const bmdDate = new Date(match.bmdInvoice.documentDate);
      const resDate = new Date(match.reservation.departure);
      const daysDiff = Math.abs((bmdDate.getTime() - resDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff > 10) {
        issues.push(`Large date difference: ${daysDiff.toFixed(1)} days`);
      }
    }
    
    if (!match.reservation) {
      issues.push('No reservation match found at all');
    }
    
    if (issues.length === 0) {
      issues.push('Low confidence due to fuzzy matching parameters');
    }
    
    return issues;
  }
  
  /**
   * Simple string similarity calculation
   */
  private calculateSimpleStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;
    
    // Simple character overlap approach
    const set1 = new Set(str1.split(''));
    const set2 = new Set(str2.split(''));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  /**
   * NEW: Create invoice rows from multi-source validation results
   * Handles both matched reservations and BMD-only invoices
   */
  createInvoiceRowsFromMultiSourceValidation(
    validationResult: ValidationResult,
    bmdInvoices: BMDInvoice[],
    unifiedReservations: import('./multi-source-reservation-parser').UnifiedReservationData[]
  ): CSVRow[] {
    console.log('📋 Creating invoice rows from multi-source validation...');
    const csvRows: CSVRow[] = [];

    // Process valid matches (BMD + reservation enrichment)
    for (const match of validationResult.validMatches) {
      if (match.reservation) {
        const csvRow = this.createEnrichedCSVRow(match);
        csvRows.push(csvRow);
        console.log(`✅ Enriched invoice: ${match.bmdInvoice.belegnr} (${(match.reservation as any).source})`);
      }
    }

    // Process partial matches (BMD + reservation enrichment with caution)
    for (const match of validationResult.partialMatches) {
      if (match.reservation) {
        const csvRow = this.createEnrichedCSVRow(match);
        csvRow.warnings = csvRow.warnings || [];
        csvRow.warnings.push(`Partial match (${match.matchConfidence}% confidence)`);
        csvRows.push(csvRow);
        console.log(`⚠️ Partial match invoice: ${match.bmdInvoice.belegnr} (${(match.reservation as any).source})`);
      }
    }

    // Process unmatched BMD invoices (BMD-only invoices)
    for (const bmdInvoice of validationResult.unmatchedBMDInvoices) {
      const csvRow = this.createBMDOnlyCSVRow(bmdInvoice);
      // Attach diagnostic info if available
      const diag = (bmdInvoice as any).__diagnostic;
      if (diag) {
        csvRow.warnings = csvRow.warnings || [];
        if (diag.score !== undefined) {
          csvRow.warnings.push(`Best match attempt: "${diag.guestName}" €${diag.amount} — score ${diag.score}% (need ${40}%). ${diag.reasons?.join('; ')}`);
        }
        csvRow.warnings.push(`Not matched: ${diag.rejectionReason}`);
      }
      csvRows.push(csvRow);
      console.log(`📝 BMD-only invoice: ${bmdInvoice.belegnr}${diag ? ` — ${diag.rejectionReason}` : ''}`);
    }

    // Enforce final invoice order exactly as BMD file order
    const bmdOrder = new Map<string, number>();
    bmdInvoices.forEach((inv, index) => {
      if (!bmdOrder.has(inv.belegnr)) {
        bmdOrder.set(inv.belegnr, index);
      }
    });

    csvRows.sort((a, b) => {
      const aOrder = bmdOrder.get(a.invoiceNumber || '') ?? Number.MAX_SAFE_INTEGER;
      const bOrder = bmdOrder.get(b.invoiceNumber || '') ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder;
    });

    console.log(`📊 Total invoice rows created: ${csvRows.length}`);
    return csvRows;
  }

  /**
   * Create enriched CSV row from BMD + reservation match
   */
  private createEnrichedCSVRow(match: ValidationMatch): CSVRow {
    const bmd = match.bmdInvoice;
    const reservation = match.reservation as any; // Can be MergerReservationData or UnifiedReservationData

    // Map property code from BMD to property ID
    const propertyId = this.getPropertyIdFromBMD(bmd);

    return {
      reservationId: reservation.reservationNumber || bmd.belegnr,
      guestName: reservation.bookerName || bmd.guestName || 'Guest',
      checkInDate: reservation.arrival || this.estimateCheckInDate(bmd.documentDate),
      checkOutDate: reservation.departure || bmd.documentDate,
      amountPaidGross: bmd.grossAmount,
      amountPaidNet: bmd.netAmount,
      vatAmount: bmd.vatAmount,
      cityTaxAmount: bmd.cityTaxAmount,
      currency: reservation.currency || 'EUR',
      guestAddress: undefined, // Leave empty unless available
      country: undefined, // Leave empty unless available  
      nights: this.calculateNights(reservation.arrival, reservation.departure),
      invoiceNumber: bmd.belegnr,
      propertyId, // Add missing propertyId field
      warnings: match.validationIssues
    };
  }

  /**
   * Create BMD-only CSV row (no reservation enrichment available)
   */
  private createBMDOnlyCSVRow(bmd: BMDInvoice): CSVRow {
    // Map property code from BMD to property ID
    const propertyId = this.getPropertyIdFromBMD(bmd);

    return {
      reservationId: bmd.reservationNumber || bmd.belegnr,
      guestName: bmd.guestName || 'Guest',
      checkInDate: this.estimateCheckInDate(bmd.documentDate),
      checkOutDate: bmd.documentDate,
      amountPaidGross: bmd.grossAmount,
      amountPaidNet: bmd.netAmount,
      vatAmount: bmd.vatAmount,
      cityTaxAmount: bmd.cityTaxAmount,
      currency: 'EUR',
      guestAddress: undefined,
      country: undefined,
      nights: 1, // Default assumption
      invoiceNumber: bmd.belegnr,
      propertyId, // Add missing propertyId field
      warnings: ['BMD-only invoice: no reservation data available for enrichment']
    };
  }

  /**
   * Get property ID from BMD invoice property code
   */
  private getPropertyIdFromBMD(bmd: BMDInvoice): string {
    // First try to map using the property code from BMD
    if (bmd.propertyCode && PROPERTY_CODE_TO_ID[bmd.propertyCode]) {
      return PROPERTY_CODE_TO_ID[bmd.propertyCode];
    }

    // Fallback: try to extract property code from invoice number or text
    const invoiceNumber = bmd.belegnr;
    for (const [code, id] of Object.entries(PROPERTY_CODE_TO_ID)) {
      if (invoiceNumber.includes(code) || (bmd.rawText && bmd.rawText.includes(code))) {
        return id;
      }
    }

    // Final fallback: use the first available property
    console.warn(`Could not determine property for BMD invoice ${bmd.belegnr}, using default property`);
    return 'apt01'; // Default to first property
  }

  /**
   * Estimate check-in date (day before checkout)
   */
  private estimateCheckInDate(checkoutDate: string | undefined): string {
    if (!checkoutDate) {
      return new Date().toISOString().split('T')[0]; // Today as fallback
    }

    const checkout = new Date(checkoutDate);
    checkout.setDate(checkout.getDate() - 1);
    return checkout.toISOString().split('T')[0];
  }

  /**
   * Calculate number of nights between dates
   */
  private calculateNights(arrival: string | undefined, departure: string | undefined): number | undefined {
    if (!arrival || !departure) return undefined;

    const arrivalDate = new Date(arrival);
    const departureDate = new Date(departure);
    const timeDiff = departureDate.getTime() - arrivalDate.getTime();
    const nights = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

    return nights > 0 ? nights : 1;
  }

  /**
   * NEW: Export unmatched BMD invoices to CSV format for manual processing
   * This is used when ultra-aggressive matching fails and BMD entries need manual review
   */
  exportUnmatchedBMDToCSV(unmatchedBMDInvoices: BMDInvoice[]): string {
    console.log(`📄 Exporting ${unmatchedBMDInvoices.length} unmatched BMD invoices to CSV...`);
    
    if (unmatchedBMDInvoices.length === 0) {
      console.log('✅ No unmatched BMD invoices to export - 100% matching achieved!');
      return ''; // Empty CSV content
    }

    // Define CSV headers for unmatched BMD export
    const headers = [
      'Invoice Number',
      'Date',
      'Gross Amount',
      'Net Amount', 
      'VAT (10%)',
      'City Tax (3.2%)',
      'Guest Name',
      'Property Code',
      'Platform',
      'Raw Text',
      'Property Name',
      'Issues'
    ];

    // Create CSV rows
    const csvRows: string[] = [headers.join(',')];

    for (const bmd of unmatchedBMDInvoices) {
      const propertyName = bmd.propertyCode ? PROPERTY_CODE_MAP[bmd.propertyCode] || 'Unknown Property' : 'No Property';
      
      // Analyze what's missing/problematic for manual processing guidance
      const issues: string[] = [];
      if (!bmd.guestName || bmd.guestName.trim() === '') {
        issues.push('No guest name extracted');
      }
      if (!bmd.propertyCode) {
        issues.push('No property detected');
      }
      if (!bmd.platform) {
        issues.push('No platform detected (Booking.com/Airbnb)');
      }
      if (!bmd.reservationNumber) {
        issues.push('No reservation number found');
      }
      if (bmd.grossAmount <= 0) {
        issues.push('Invalid amount');
      }

      const csvRow = [
        `"${bmd.belegnr}"`,
        `"${bmd.documentDate}"`,
        `"${bmd.grossAmount.toFixed(2)}"`,
        `"${bmd.netAmount.toFixed(2)}"`,
        `"${bmd.vatAmount.toFixed(2)}"`,
        `"${bmd.cityTaxAmount.toFixed(2)}"`,
        `"${(bmd.guestName || 'N/A').replace(/"/g, '""')}"`, // Escape quotes
        `"${bmd.propertyCode || 'N/A'}"`,
        `"${bmd.platform || 'N/A'}"`,
        `"${(bmd.rawText || '').replace(/"/g, '""').substring(0, 100)}"`, // Truncate and escape
        `"${propertyName.replace(/"/g, '""')}"`,
        `"${issues.join('; ').replace(/"/g, '""')}"`
      ];
      
      csvRows.push(csvRow.join(','));
    }

    const csvContent = csvRows.join('\n');
    
    console.log(`📊 Unmatched BMD CSV generated:`);
    console.log(`   - Total entries: ${unmatchedBMDInvoices.length}`);
    console.log(`   - CSV size: ${csvContent.length} characters`);
    console.log(`   - Headers: ${headers.length} columns`);
    
    return csvContent;
  }

  /**
   * NEW: Get summary statistics for unmatched BMD export
   */
  getUnmatchedBMDSummary(unmatchedBMDInvoices: BMDInvoice[]): {
    total: number;
    byProperty: { [propertyCode: string]: number };
    byPlatform: { [platform: string]: number };
    missingData: {
      noGuestName: number;
      noProperty: number;
      noPlatform: number;
      noReservationNumber: number;
    };
    totalAmount: number;
  } {
    const summary = {
      total: unmatchedBMDInvoices.length,
      byProperty: {} as { [propertyCode: string]: number },
      byPlatform: {} as { [platform: string]: number },
      missingData: {
        noGuestName: 0,
        noProperty: 0,
        noPlatform: 0,
        noReservationNumber: 0,
      },
      totalAmount: 0,
    };

    for (const bmd of unmatchedBMDInvoices) {
      // Count by property
      const property = bmd.propertyCode || 'UNKNOWN';
      summary.byProperty[property] = (summary.byProperty[property] || 0) + 1;

      // Count by platform
      const platform = bmd.platform || 'UNKNOWN';
      summary.byPlatform[platform] = (summary.byPlatform[platform] || 0) + 1;

      // Count missing data
      if (!bmd.guestName || bmd.guestName.trim() === '') {
        summary.missingData.noGuestName++;
      }
      if (!bmd.propertyCode) {
        summary.missingData.noProperty++;
      }
      if (!bmd.platform) {
        summary.missingData.noPlatform++;
      }
      if (!bmd.reservationNumber) {
        summary.missingData.noReservationNumber++;
      }

      // Sum amounts
      summary.totalAmount += bmd.grossAmount;
    }

    return summary;
  }
}