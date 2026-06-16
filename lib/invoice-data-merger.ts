import { BMDInvoice } from './bmd-parser';
import { CSVRow } from './types';

// Enhanced reservation data from CSV
export interface ReservationData {
  reservationNumber: string;
  propertyName: string;
  propertyCode?: string;
  bookerName: string;
  arrival: string;
  departure: string;
  totalPayment: number;
  currency: string;
  status?: string;
  source?: string;
}

// Merged invoice data ready for PDF generation
export interface MergedInvoiceData {
  reservationId: string;
  invoiceNumber: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  amountPaidGross: number;
  currency: string;
  property?: string;
  propertyId: string;
  platform?: string;
  matchingMethod: 'DIRECT_MATCH' | 'FUZZY_MATCH' | 'BMD_ONLY' | 'SEQUENTIAL_FALLBACK';
  confidence: number; // 0-100, matching confidence score
  warnings: string[];
}

// Property mapping and detection
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

/**
 * Enhanced data merger that safely combines BMD invoices with reservation data
 */
export class InvoiceDataMerger {
  private bmdInvoices: BMDInvoice[];
  private reservations: ReservationData[];
  private reservationMap: Map<string, ReservationData>;
  
  constructor(bmdInvoices: BMDInvoice[], reservations: ReservationData[]) {
    this.bmdInvoices = bmdInvoices;
    this.reservations = reservations;
    this.reservationMap = new Map();
    
    // Build reservation lookup map
    reservations.forEach(res => {
      this.reservationMap.set(res.reservationNumber, res);
    });
    
    console.log(`Data Merger initialized:`);
    console.log(`  BMD invoices: ${bmdInvoices.length}`);
    console.log(`  Reservations: ${reservations.length}`);
    console.log(`  Reservation numbers: ${Array.from(this.reservationMap.keys()).slice(0, 5).join(', ')}...`);
  }
  
  /**
   * Merge BMD invoices with reservation data using multiple matching strategies
   */
  public mergeData(): {
    merged: MergedInvoiceData[];
    stats: {
      directMatches: number;
      fuzzyMatches: number;
      bmdOnlyEntries: number;
      totalProcessed: number;
    };
    warnings: string[];
  } {
    const merged: MergedInvoiceData[] = [];
    const warnings: string[] = [];
    const stats = {
      directMatches: 0,
      fuzzyMatches: 0,
      bmdOnlyEntries: 0,
      totalProcessed: 0,
    };
    
    console.log('\n=== STARTING ENHANCED DATA MERGING ===');
    
    for (const bmdInvoice of this.bmdInvoices) {
      try {
        stats.totalProcessed++;
        
        const mergeResult = this.mergeSingleInvoice(bmdInvoice);
        merged.push(mergeResult);
        
        // Update stats
        switch (mergeResult.matchingMethod) {
          case 'DIRECT_MATCH':
            stats.directMatches++;
            break;
          case 'FUZZY_MATCH':
            stats.fuzzyMatches++;
            break;
          case 'BMD_ONLY':
            stats.bmdOnlyEntries++;
            break;
        }
        
        // Collect warnings
        if (mergeResult.warnings.length > 0) {
          warnings.push(...mergeResult.warnings.map(w => `${bmdInvoice.belegnr}: ${w}`));
        }
        
        // Log progress for first few entries
        if (stats.totalProcessed <= 5) {
          console.log(`✓ Merged ${bmdInvoice.belegnr}: ${mergeResult.matchingMethod} (confidence: ${mergeResult.confidence}%)`);
        }
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        warnings.push(`${bmdInvoice.belegnr}: Merge failed - ${errorMsg}`);
        
        // Create fallback entry
        const fallbackEntry = this.createBMDOnlyEntry(bmdInvoice);
        fallbackEntry.warnings.push(`Merge error: ${errorMsg}`);
        merged.push(fallbackEntry);
        stats.bmdOnlyEntries++;
        stats.totalProcessed++;
      }
    }
    
    console.log(`\nMerge Summary:
      - Total merged: ${merged.length}
      - Direct matches: ${stats.directMatches}
      - Fuzzy matches: ${stats.fuzzyMatches}
      - BMD only: ${stats.bmdOnlyEntries}
      - Warnings: ${warnings.length}`);
    
    return { merged, stats, warnings };
  }
  
  /**
   * Merge a single BMD invoice with reservation data using best available method
   */
  private mergeSingleInvoice(bmdInvoice: BMDInvoice): MergedInvoiceData {
    let mergedData: MergedInvoiceData;
    
    // Strategy 1: Direct reservation number match
    if (bmdInvoice.reservationNumber) {
      const directMatch = this.reservationMap.get(bmdInvoice.reservationNumber);
      if (directMatch) {
        mergedData = this.createDirectMatch(bmdInvoice, directMatch);
        if (mergedData.confidence >= 90) {
          return mergedData;
        }
      }
    }
    
    // Strategy 2: Fuzzy matching by amount, dates, guest name
    const fuzzyMatch = this.findFuzzyMatch(bmdInvoice);
    if (fuzzyMatch && fuzzyMatch.confidence >= 70) {
      return fuzzyMatch;
    }
    
    // Strategy 3: BMD-only entry (no reservation data available)
    return this.createBMDOnlyEntry(bmdInvoice);
  }
  
  /**
   * Create merged data from direct reservation number match
   */
  private createDirectMatch(bmdInvoice: BMDInvoice, reservation: ReservationData): MergedInvoiceData {
    const warnings: string[] = [];
    let confidence = 95; // High confidence for direct matches
    
    // Validate amount consistency (allow some tolerance for fees)
    const amountDifference = Math.abs(bmdInvoice.grossAmount - reservation.totalPayment);
    const amountDifferencePercent = (amountDifference / reservation.totalPayment) * 100;
    
    if (amountDifferencePercent > 10) {
      warnings.push(`Amount mismatch: BMD ${bmdInvoice.grossAmount}€ vs Reservation ${reservation.totalPayment}€`);
      confidence -= 15;
    } else if (amountDifferencePercent > 5) {
      warnings.push(`Minor amount difference: ${amountDifferencePercent.toFixed(1)}%`);
      confidence -= 5;
    }
    
    // Cross-validate property if both sources have it
    if (bmdInvoice.propertyCode && reservation.propertyCode && 
        bmdInvoice.propertyCode !== reservation.propertyCode) {
      warnings.push(`Property mismatch: BMD ${bmdInvoice.propertyCode} vs Reservation ${reservation.propertyCode}`);
      confidence -= 10;
    }
    
    return {
      reservationId: reservation.reservationNumber,
      invoiceNumber: bmdInvoice.belegnr,
      guestName: reservation.bookerName || bmdInvoice.guestName || 'Guest',
      checkInDate: reservation.arrival,
      checkOutDate: reservation.departure,
      amountPaidGross: bmdInvoice.grossAmount, // BMD amount is authoritative
      currency: reservation.currency,
      property: reservation.propertyName || PROPERTY_CODE_MAP[bmdInvoice.propertyCode || ''],
      propertyId: reservation.propertyCode || bmdInvoice.propertyCode || 'UNKNOWN',
      platform: bmdInvoice.platform,
      matchingMethod: 'DIRECT_MATCH',
      confidence: Math.max(confidence, 0),
      warnings
    };
  }
  
  /**
   * Attempt fuzzy matching based on amount, dates, and other factors
   */
  private findFuzzyMatch(bmdInvoice: BMDInvoice): MergedInvoiceData | null {
    let bestMatch: { reservation: ReservationData; score: number } | null = null;
    
    for (const reservation of this.reservations) {
      const score = this.calculateMatchScore(bmdInvoice, reservation);
      
      if (score > 70 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { reservation, score };
      }
    }
    
    if (!bestMatch) {
      return null;
    }
    
    const warnings = [`Fuzzy match with ${bestMatch.score.toFixed(1)}% confidence`];
    
    return {
      reservationId: bestMatch.reservation.reservationNumber,
      invoiceNumber: bmdInvoice.belegnr,
      guestName: bestMatch.reservation.bookerName || bmdInvoice.guestName || 'Guest',
      checkInDate: bestMatch.reservation.arrival,
      checkOutDate: bestMatch.reservation.departure,
      amountPaidGross: bmdInvoice.grossAmount,
      currency: bestMatch.reservation.currency,
      property: bestMatch.reservation.propertyName || PROPERTY_CODE_MAP[bmdInvoice.propertyCode || ''],
      propertyId: bestMatch.reservation.propertyCode || bmdInvoice.propertyCode || 'UNKNOWN',
      platform: bmdInvoice.platform,
      matchingMethod: 'FUZZY_MATCH',
      confidence: bestMatch.score,
      warnings
    };
  }
  
  /**
   * Calculate matching score between BMD invoice and reservation (0-100)
   */
  private calculateMatchScore(bmdInvoice: BMDInvoice, reservation: ReservationData): number {
    let score = 0;
    
    // Amount similarity (40% weight)
    const amountDifference = Math.abs(bmdInvoice.grossAmount - reservation.totalPayment);
    const amountDifferencePercent = (amountDifference / reservation.totalPayment) * 100;
    
    if (amountDifferencePercent <= 1) {
      score += 40;
    } else if (amountDifferencePercent <= 5) {
      score += 30;
    } else if (amountDifferencePercent <= 10) {
      score += 20;
    } else if (amountDifferencePercent <= 20) {
      score += 10;
    }
    
    // Date proximity (30% weight)
    if (bmdInvoice.documentDate && reservation.departure) {
      const bmdDate = new Date(bmdInvoice.documentDate);
      const resDate = new Date(reservation.departure);
      const daysDiff = Math.abs((bmdDate.getTime() - resDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff === 0) {
        score += 30;
      } else if (daysDiff <= 3) {
        score += 25;
      } else if (daysDiff <= 7) {
        score += 15;
      } else if (daysDiff <= 14) {
        score += 5;
      }
    }
    
    // Property matching (20% weight)
    if (bmdInvoice.propertyCode && reservation.propertyCode) {
      if (bmdInvoice.propertyCode === reservation.propertyCode) {
        score += 20;
      }
    } else if (bmdInvoice.propertyCode || reservation.propertyCode) {
      score += 10; // Partial property info
    }
    
    // Guest name similarity (10% weight)
    if (bmdInvoice.guestName && reservation.bookerName) {
      const bmdName = bmdInvoice.guestName.toLowerCase();
      const resName = reservation.bookerName.toLowerCase();
      
      if (bmdName === resName) {
        score += 10;
      } else if (bmdName.includes(resName) || resName.includes(bmdName)) {
        score += 5;
      }
    }
    
    return Math.min(score, 100);
  }
  
  /**
   * Create invoice entry using only BMD data
   */
  private createBMDOnlyEntry(bmdInvoice: BMDInvoice): MergedInvoiceData {
    const warnings = ['No matching reservation found - using BMD data only'];
    
    // Estimate check-in date (1 day before document date)
    const checkoutDate = bmdInvoice.documentDate;
    const checkoutDateObj = new Date(checkoutDate);
    const checkinDateObj = new Date(checkoutDateObj.getTime() - 24 * 60 * 60 * 1000);
    const checkinDate = checkinDateObj.toISOString().split('T')[0];
    
    return {
      reservationId: bmdInvoice.reservationNumber || `BMD_${bmdInvoice.belegnr}`,
      invoiceNumber: bmdInvoice.belegnr,
      guestName: bmdInvoice.guestName || 'Guest',
      checkInDate: checkinDate,
      checkOutDate: checkoutDate,
      amountPaidGross: bmdInvoice.grossAmount,
      currency: 'EUR',
      property: PROPERTY_CODE_MAP[bmdInvoice.propertyCode || ''] || 'Unknown Property',
      propertyId: bmdInvoice.propertyCode || 'UNKNOWN',
      platform: bmdInvoice.platform,
      matchingMethod: 'BMD_ONLY',
      confidence: 60, // Lower confidence for BMD-only entries
      warnings
    };
  }
  
  /**
   * Convert merged data to CSV row format for invoice generation
   */
  public static convertToCSVRows(mergedData: MergedInvoiceData[]): CSVRow[] {
    return mergedData.map(data => ({
      reservationId: data.reservationId,
      guestName: data.guestName,
      checkInDate: data.checkInDate,
      checkOutDate: data.checkOutDate,
      amountPaidGross: data.amountPaidGross,
      currency: data.currency,
      guestAddress: undefined,
      country: undefined,
      nights: undefined,
      invoiceNumber: data.invoiceNumber,
    }));
  }
}