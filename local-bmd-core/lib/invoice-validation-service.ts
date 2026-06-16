/**
 * Enhanced Invoice Validation Service
 * 
 * Provides detailed validation and matching between BMD records and reservation data
 * with comprehensive feedback on what works, what doesn't, and what needs fixing.
 */

import { BMDInvoice } from './bmd-parser';
import { ReservationData as MergerReservationData } from './invoice-data-merger';

export interface UnifiedReservationData extends MergerReservationData {
  source: string;
  reservationNumber: string;
  bookerName: string;
  departure: string;
  arrival: string;
  totalPayment: number;
  propertyCode?: string;
  propertyName: string; // Required to match ReservationData
}

/**
 * Map BMD platform strings to unified source constants
 */
function mapBMDPlatformToSource(bmdPlatform?: string): string | null {
  if (!bmdPlatform) return null;
  
  const platform = bmdPlatform.toLowerCase();
  
  if (platform.includes('booking')) {
    return 'BOOKING_COM';
  } else if (platform.includes('airbnb') || platform.includes('airb')) {
    return 'AIRBNB';
  } else if (platform.includes('vrbo') || platform.includes('expedia')) {
    return 'VRBO';
  } else if (platform.includes('direct')) {
    return 'DIRECT';
  }
  
  return null;
}

/**
 * Detect platform by reservation number format
 * AIRBNB: Contains letters (e.g., "HM12ABC34", "HMABCDEF123")
 * BOOKING_COM: Only numbers (e.g., "2847563891", "123456789")
 */
function detectPlatformByReservationNumber(reservationNumber: string): 'AIRBNB' | 'BOOKING_COM' | null {
  if (!reservationNumber) return null;
  
  const hasLetters = /[A-Za-z]/.test(reservationNumber);
  const hasNumbers = /[0-9]/.test(reservationNumber);
  
  if (hasLetters && hasNumbers) {
    return 'AIRBNB';
  } else if (hasNumbers && !hasLetters) {
    return 'BOOKING_COM';
  }
  
  return null;
}

export interface ValidationMatch {
  bmdInvoice: BMDInvoice;
  reservation: MergerReservationData | UnifiedReservationData | null;
  matchConfidence: number;
  matchReasons: string[];
  validationStatus: 'VALID' | 'PARTIAL' | 'INVALID';
  validationIssues: string[];
  canGenerateInvoice: boolean;
  reservationSource?: string;
  // Diagnostic: best attempted match that was rejected
  bestRejectedCandidate?: {
    reservationNumber: string;
    guestName: string;
    amount: number;
    score: number;
    reasons: string[];
    rejectionReason: string;
  };
}

export interface ValidationReservationUnmatched {
  reservation: MergerReservationData;
  potentialBMDMatches: BMDInvoice[];
  unmatchedReason: string;
  suggestedFixes: string[];
}

export interface ValidationResult {
  validMatches: ValidationMatch[];
  partialMatches: ValidationMatch[];
  invalidMatches: ValidationMatch[];
  unmatchedBMDInvoices: BMDInvoice[];
  unmatchedReservations: ValidationReservationUnmatched[];
  summary: {
    totalBMDInvoices: number;
    totalReservations: number;
    successfulMatches: number;
    partialMatches: number;
    invalidMatches: number;
    unmatchedBMD: number;
    unmatchedReservations: number;
    invoiceableRecords: number;
  };
  feedback: {
    successMessages: string[];
    warnings: string[];
    errors: string[];
    suggestions: string[];
  };
}

export class InvoiceValidationService {
  // Strict matching: BMD belegnr/date/amount are authoritative and must not be reassigned loosely
  private readonly AMOUNT_TOLERANCE = 0.05; // €0.05 tolerance
  private readonly NAME_SIMILARITY_THRESHOLD = 0.65; // Require meaningful name similarity
  private readonly DATE_TOLERANCE_DAYS = 7; // Keep date window reasonably strict
  private readonly SINGLE_CRITERIA_THRESHOLD = 40; // Require at least one strong signal

  /**
   * ENHANCED: Multi-source validation ensuring 100% BMD coverage with strict 1:1 reservation mapping
   * Uses all available reservation sources (Booking.com, Airbnb, VRBO, etc.)
   * @param usePositionalMatching If true, matches by position instead of similarity (Invoice #1 → Reservation #1)
   * @param useTwoPhaseMatching If true, uses two-phase approach: BMD→Booking.com first, then remaining→Airbnb
   */
  validateAndMatchMultiSource(
    bmdInvoices: BMDInvoice[],
    allReservations: UnifiedReservationData[],
    usePositionalMatching: boolean = false,
    useTwoPhaseMatching: boolean = true
  ): ValidationResult {
    console.log('Multi-source validation: ' + bmdInvoices.length + ' BMD invoices, ' + allReservations.length + ' reservations');
    console.log('Delegating to two-phase matching system');
    
    // DEFENSIVE: Filter out any invalid BMD invoices
    const validBMDInvoices = bmdInvoices.filter(invoice => {
      if (!invoice) {
        console.warn('Skipping null/undefined BMD invoice');
        return false;
      }
      if (!invoice.belegnr) {
        console.warn('Skipping BMD invoice without belegnr:', invoice);
        return false;
      }
      if (typeof invoice.grossAmount !== 'number' || isNaN(invoice.grossAmount)) {
        console.warn('Skipping BMD invoice with invalid grossAmount:', invoice.belegnr, invoice.grossAmount);
        return false;
      }
      return true;
    });

    if (validBMDInvoices.length !== bmdInvoices.length) {
      console.warn('Filtered out ' + (bmdInvoices.length - validBMDInvoices.length) + ' invalid BMD invoices');
    }
    
    // Preserve original BMD file order - belegnr/date/amount must stay bound to source order
    const sortedBMDInvoices = [...validBMDInvoices];

    const sortedReservations = [...allReservations];

    if (useTwoPhaseMatching) {
      return this.validateWithTwoPhaseMatching(sortedBMDInvoices, sortedReservations, usePositionalMatching);
    } else {
      return this.validateWithSinglePhaseMatching(sortedBMDInvoices, sortedReservations, usePositionalMatching);
    }
  }

  /**
   * TWO-PHASE MATCHING: Platform separation to prevent data mixing
   * Phase 1: All BMD → Booking.com only
   * Phase 2: Remaining BMD → Airbnb only
   */
  private validateWithTwoPhaseMatching(
    sortedBMDInvoices: BMDInvoice[],
    sortedReservations: UnifiedReservationData[],
    usePositionalMatching: boolean
  ): ValidationResult {
    console.log('Starting TWO-PHASE matching to prevent platform data mixing');

    // Initialize result
    const result: ValidationResult = {
      validMatches: [],
      partialMatches: [],
      invalidMatches: [],
      unmatchedBMDInvoices: [],
      unmatchedReservations: [],
      summary: {
        totalBMDInvoices: sortedBMDInvoices.length,
        totalReservations: sortedReservations.length,
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
    };

    const usedReservations = new Set<string>();
    let remainingBMDInvoices = [...sortedBMDInvoices];

    // PHASE 1: BMD → Booking.com only
    console.log('Phase 1: BMD → Booking.com matching');
    const bookingReservations = sortedReservations.filter(r => r.source === 'BOOKING_COM');
    const phase1Results = this.executeMatchingPhase(
      remainingBMDInvoices,
      bookingReservations,
      usePositionalMatching,
      'BOOKING_COM',
      1
    );

    // Add Phase 1 results and mark reservations as used
    result.validMatches.push(...phase1Results.validMatches);
    result.partialMatches.push(...phase1Results.partialMatches);
    result.invalidMatches.push(...phase1Results.invalidMatches);

    // Mark used reservations
    [...phase1Results.validMatches, ...phase1Results.partialMatches, ...phase1Results.invalidMatches].forEach(match => {
      if (match.reservation) {
        usedReservations.add(match.reservation.reservationNumber);
      }
    });

    // Update remaining BMD invoices
    remainingBMDInvoices = phase1Results.unmatchedBMDInvoices;
    console.log('Phase 1 complete: ' + remainingBMDInvoices.length + ' BMD invoices remaining');

    // PHASE 2: Remaining BMD → Airbnb only
    if (remainingBMDInvoices.length > 0) {
      console.log('Phase 2: Remaining BMD → Airbnb matching');
      const airbnbReservations = sortedReservations.filter(r => r.source === 'AIRBNB' && !usedReservations.has(r.reservationNumber));
      const phase2Results = this.executeMatchingPhase(
        remainingBMDInvoices,
        airbnbReservations,
        usePositionalMatching,
        'AIRBNB',
        2
      );

      // Add Phase 2 results
      result.validMatches.push(...phase2Results.validMatches);
      result.partialMatches.push(...phase2Results.partialMatches);
      result.invalidMatches.push(...phase2Results.invalidMatches);

      // Mark Phase 2 used reservations
      [...phase2Results.validMatches, ...phase2Results.partialMatches, ...phase2Results.invalidMatches].forEach(match => {
        if (match.reservation) usedReservations.add(match.reservation.reservationNumber);
      });

      remainingBMDInvoices = phase2Results.unmatchedBMDInvoices;
    }

    // PHASE 3: Fallback - try remaining BMD against ALL unused reservations (any platform)
    if (remainingBMDInvoices.length > 0) {
      console.log('Phase 3: Fallback - ' + remainingBMDInvoices.length + ' unmatched BMD → ALL remaining reservations');
      const allRemainingReservations = sortedReservations.filter(r => !usedReservations.has(r.reservationNumber));
      const phase3Results = this.executeMatchingPhase(
        remainingBMDInvoices,
        allRemainingReservations,
        usePositionalMatching,
        'ALL',
        3
      );

      result.validMatches.push(...phase3Results.validMatches);
      result.partialMatches.push(...phase3Results.partialMatches);
      result.invalidMatches.push(...phase3Results.invalidMatches);
      result.unmatchedBMDInvoices = phase3Results.unmatchedBMDInvoices;
    } else {
      result.unmatchedBMDInvoices = [];
    }

    this.finalizeTwoPhaseResults(result, sortedReservations, usedReservations);
    return result;
  }

  /**
   * Execute matching phase for a specific platform
   */
  private executeMatchingPhase(
    bmdInvoices: BMDInvoice[],
    reservations: UnifiedReservationData[],
    usePositionalMatching: boolean,
    platform: string,
    phaseNumber: number
  ): {
    validMatches: ValidationMatch[];
    partialMatches: ValidationMatch[];
    invalidMatches: ValidationMatch[];
    unmatchedBMDInvoices: BMDInvoice[];
  } {
    const result = {
      validMatches: [] as ValidationMatch[],
      partialMatches: [] as ValidationMatch[],
      invalidMatches: [] as ValidationMatch[],
      unmatchedBMDInvoices: [] as BMDInvoice[]
    };

    console.log('Phase ' + phaseNumber + ': Processing ' + bmdInvoices.length + ' BMD invoices against ' + reservations.length + ' ' + platform + ' reservations');

    const usedReservations = new Set<string>();

    for (let i = 0; i < bmdInvoices.length; i++) {
      const bmdInvoice = bmdInvoices[i];
      const availableReservations = reservations.filter(r => !usedReservations.has(r.reservationNumber));

      if (availableReservations.length === 0) {
        console.log('No more unused ' + platform + ' reservations - creating BMD-only invoice for ' + bmdInvoice.belegnr);
        (bmdInvoice as any).__diagnostic = { rejectionReason: `No ${platform} reservations left — all were consumed by earlier invoices` };
        result.unmatchedBMDInvoices.push(bmdInvoice);
        continue;
      }

      let matchResult: ValidationMatch;

      if (usePositionalMatching && availableReservations.length > 0) {
        // Positional mode: pair current BMD invoice with next unused reservation in order
        const targetReservation = availableReservations[0];
        matchResult = {
          bmdInvoice,
          reservation: targetReservation,
          matchConfidence: 100,
          matchReasons: ['Positional match: BMD invoice #' + bmdInvoice.belegnr + ' → next unused reservation'],
          validationStatus: 'VALID' as const,
          validationIssues: [],
          canGenerateInvoice: true,
          reservationSource: targetReservation.source
        };
      } else {
        // Strict similarity matching; no forced sequential fallback
        matchResult = this.findBestUnifiedReservationMatch(bmdInvoice, availableReservations);
      }

      if (matchResult.reservation && matchResult.matchConfidence >= this.SINGLE_CRITERIA_THRESHOLD) {
        usedReservations.add(matchResult.reservation.reservationNumber);

        if (matchResult.validationStatus === 'VALID') {
          result.validMatches.push(matchResult);
        } else {
          result.partialMatches.push(matchResult);
        }
      } else {
        // Attach diagnostic info about WHY this invoice was not matched
        const rejectionReason = availableReservations.length === 0
          ? `No ${platform} reservations left to match`
          : matchResult.reservation
            ? `Best candidate scored only ${matchResult.matchConfidence}% (minimum required: ${this.SINGLE_CRITERIA_THRESHOLD}%)`
            : `No reservations available in this phase`;

        if (matchResult.reservation && matchResult.matchConfidence < this.SINGLE_CRITERIA_THRESHOLD) {
          const res = matchResult.reservation as UnifiedReservationData;
          console.log(
            'Rejecting weak match for BMD ' + bmdInvoice.belegnr +
            ' (confidence ' + matchResult.matchConfidence + '%) — best candidate: ' +
            res.bookerName + ' €' + res.totalPayment
          );
          // Attach rejection info to the BMD-only entry
          (bmdInvoice as any).__diagnostic = {
            reservationNumber: res.reservationNumber,
            guestName: res.bookerName,
            amount: res.totalPayment,
            score: matchResult.matchConfidence,
            reasons: matchResult.matchReasons,
            rejectionReason,
          };
        } else {
          (bmdInvoice as any).__diagnostic = { rejectionReason };
        }
        result.unmatchedBMDInvoices.push(bmdInvoice);
      }
    }

    return result;
  }

  /**
   * Finalize two-phase results
   */
  private finalizeTwoPhaseResults(
    result: ValidationResult,
    allReservations: UnifiedReservationData[],
    usedReservations: Set<string>
  ): void {
    // Calculate final statistics
    result.summary.successfulMatches = result.validMatches.length;
    result.summary.partialMatches = result.partialMatches.length;
    result.summary.invalidMatches = result.invalidMatches.length;
    result.summary.unmatchedBMD = result.unmatchedBMDInvoices.length;
    result.summary.invoiceableRecords = result.validMatches.filter(m => m.canGenerateInvoice).length + 
                                       result.partialMatches.filter(m => m.canGenerateInvoice).length +
                                       result.unmatchedBMDInvoices.length;

    // Generate feedback
    result.feedback.successMessages.push('Two-phase matching completed successfully');
    result.feedback.successMessages.push(result.summary.invoiceableRecords + ' invoices ready for generation');

    console.log('Two-phase matching results: ' + result.summary.successfulMatches + ' valid, ' + result.summary.partialMatches + ' partial, ' + result.summary.unmatchedBMD + ' BMD-only');
  }

  /**
   * Single-phase matching (fallback)
   */
  private validateWithSinglePhaseMatching(
    sortedBMDInvoices: BMDInvoice[],
    sortedReservations: UnifiedReservationData[],
    usePositionalMatching: boolean
  ): ValidationResult {
    console.log('Single-phase matching mode');
    
    // Use the same phase execution logic but with all reservations
    const result = this.executeMatchingPhase(
      sortedBMDInvoices,
      sortedReservations,
      usePositionalMatching,
      'ALL_PLATFORMS',
      1
    );

    return {
      validMatches: result.validMatches,
      partialMatches: result.partialMatches,
      invalidMatches: result.invalidMatches,
      unmatchedBMDInvoices: result.unmatchedBMDInvoices,
      unmatchedReservations: [],
      summary: {
        totalBMDInvoices: sortedBMDInvoices.length,
        totalReservations: sortedReservations.length,
        successfulMatches: result.validMatches.length,
        partialMatches: result.partialMatches.length,
        invalidMatches: result.invalidMatches.length,
        unmatchedBMD: result.unmatchedBMDInvoices.length,
        unmatchedReservations: 0,
        invoiceableRecords: result.validMatches.filter(m => m.canGenerateInvoice).length + 
                           result.partialMatches.filter(m => m.canGenerateInvoice).length +
                           result.unmatchedBMDInvoices.length,
      },
      feedback: {
        successMessages: ['Single-phase matching completed'],
        warnings: [],
        errors: [],
        suggestions: [],
      },
    };
  }

  /**
   * LEGACY: Backward compatibility with single-source validation
   */
  validateAndMatch(
    bmdInvoices: BMDInvoice[],
    reservations: MergerReservationData[]
  ): ValidationResult {
    console.log('BMD-DRIVEN VALIDATION: ' + bmdInvoices.length + ' BMD invoices, ' + reservations.length + ' reservations');
    console.log('LEGACY METHOD: Delegating to two-phase matching system');
    
    // Convert to unified format and delegate
    const unifiedReservations: UnifiedReservationData[] = reservations.map(r => ({
      ...r,
      source: 'UNKNOWN',
      reservationNumber: r.reservationNumber || 'N/A',
      bookerName: r.bookerName || 'N/A',
      departure: r.departure || '',
      arrival: r.arrival || '',
      totalPayment: r.totalPayment || 0
    }));

    return this.validateWithTwoPhaseMatching(bmdInvoices, unifiedReservations, false);
  }

  /**
   * Find best unified reservation match
   */
  private findBestUnifiedReservationMatch(
    bmdInvoice: BMDInvoice,
    allReservations: UnifiedReservationData[],
    emergencyMode: boolean = false
  ): ValidationMatch {
    let bestMatch: UnifiedReservationData | null = null;
    let bestScore = 0;
    const matchReasons: string[] = [];

    console.log('Searching ' + allReservations.length + ' reservations for match with BMD ' + bmdInvoice.belegnr);

    // Score all potential matches
    for (const reservation of allReservations) {
      const scoreResult = this.calculateUnifiedMatchScore(bmdInvoice, reservation);
      
      if (scoreResult.score > bestScore) {
        bestScore = scoreResult.score;
        bestMatch = reservation;
        matchReasons.splice(0); // Clear previous reasons
        matchReasons.push(...scoreResult.reasons);
      }
    }

    // Validate the best match
    const validationResult = this.validateUnifiedMatch(bmdInvoice, bestMatch);

    return {
      bmdInvoice,
      reservation: bestMatch,
      matchConfidence: bestScore,
      matchReasons,
      validationStatus: validationResult.status,
      validationIssues: validationResult.issues,
      canGenerateInvoice: validationResult.canGenerateInvoice,
      reservationSource: bestMatch?.source || undefined
    };
  }

  /**
   * Calculate match score for unified reservation data
   */
  private calculateUnifiedMatchScore(
    bmdInvoice: BMDInvoice,
    reservation: UnifiedReservationData
  ): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    // Defensive check: Ensure bmdInvoice is valid
    if (!bmdInvoice) {
      console.error('BMD invoice is undefined or null');
      return { score: 0, reasons: ['Invalid BMD invoice data'] };
    }

    // Platform isolation check - only block if BOTH have known platforms AND they mismatch
    const bmdPlatformSource = mapBMDPlatformToSource(bmdInvoice.platform);
    if (bmdPlatformSource && reservation.source !== bmdPlatformSource 
        && reservation.source !== 'OTHER' && reservation.source !== 'UNKNOWN') {
      // Hard block: confirmed mismatch (e.g., BMD says Booking.com but reservation is Airbnb)
      return { score: 0, reasons: ['Platform mismatch: BMD ' + (bmdInvoice.platform || 'unknown') + ' vs ' + reservation.source] };
    }

    // Amount matching (40 points) - Defensive check for grossAmount
    if (typeof bmdInvoice.grossAmount === 'number' && typeof reservation.totalPayment === 'number') {
      if (Math.abs(bmdInvoice.grossAmount - reservation.totalPayment) <= this.AMOUNT_TOLERANCE) {
        score += 40;
        reasons.push('Exact amount match: €' + bmdInvoice.grossAmount);
      } else if (Math.abs(bmdInvoice.grossAmount - reservation.totalPayment) <= 5.0) {
        // Within €5 on Booking.com/Airbnb is almost always a rounding/fee difference — treat as strong signal
        score += 40;
        reasons.push('Close amount match (within €5): €' + bmdInvoice.grossAmount + ' vs €' + reservation.totalPayment);
      } else if (Math.abs(bmdInvoice.grossAmount - reservation.totalPayment) <= 15.0) {
        score += 20;
        reasons.push('Approximate amount match: €' + bmdInvoice.grossAmount + ' vs €' + reservation.totalPayment);
      }
    } else {
      console.warn('Invalid amount data - BMD grossAmount:', bmdInvoice.grossAmount, 'Reservation totalPayment:', reservation.totalPayment);
    }

    // Guest name matching (25 points) - Defensive check
    if (bmdInvoice.guestName && reservation.bookerName) {
      const nameSimilarity = this.calculateStringSimilarity(
        bmdInvoice.guestName.toLowerCase(),
        reservation.bookerName.toLowerCase()
      );
      if (nameSimilarity >= 0.9) {
        score += 25;
        reasons.push('Excellent name match: ' + bmdInvoice.guestName);
      } else if (nameSimilarity >= this.NAME_SIMILARITY_THRESHOLD) {
        score += Math.round(25 * nameSimilarity);
        reasons.push('Good name match (' + Math.round(nameSimilarity * 100) + '%): ' + bmdInvoice.guestName + ' vs ' + reservation.bookerName);
      }
    }

    // Date matching (20 points) - Defensive check
    if (bmdInvoice.documentDate && reservation.departure) {
      try {
        const bmdDate = new Date(bmdInvoice.documentDate);
        const depDate = new Date(reservation.departure);
        
        // Check if dates are valid
        if (!isNaN(bmdDate.getTime()) && !isNaN(depDate.getTime())) {
          const daysDiff = Math.abs((bmdDate.getTime() - depDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysDiff <= 1) {
            score += 20;
            reasons.push('Exact date match');
          } else if (daysDiff <= this.DATE_TOLERANCE_DAYS) {
            score += Math.round(20 * (1 - daysDiff / this.DATE_TOLERANCE_DAYS));
            reasons.push('Close date match (' + Math.round(daysDiff) + ' days difference)');
          }
        } else {
          console.warn('Invalid date data - BMD documentDate:', bmdInvoice.documentDate, 'Reservation departure:', reservation.departure);
        }
      } catch (error) {
        console.warn('Error parsing dates:', error);
      }
    }

    // Reservation number matching (50 points) - highest priority signal
    if (bmdInvoice.reservationNumber && reservation.reservationNumber) {
      const bmdResNum = bmdInvoice.reservationNumber.trim().toUpperCase();
      const resNum = reservation.reservationNumber.trim().toUpperCase();
      if (bmdResNum === resNum) {
        score += 50;
        reasons.push('Exact reservation number match: ' + bmdInvoice.reservationNumber);
      } else if (bmdResNum.includes(resNum) || resNum.includes(bmdResNum)) {
        score += 30;
        reasons.push('Partial reservation number match: ' + bmdInvoice.reservationNumber + ' vs ' + reservation.reservationNumber);
      }
    } else if (bmdInvoice.rawText && reservation.reservationNumber) {
      // Check if reservation number appears in BMD raw text
      const rawUpper = bmdInvoice.rawText.toUpperCase();
      const resNum = reservation.reservationNumber.trim().toUpperCase();
      if (resNum.length >= 6 && rawUpper.includes(resNum)) {
        score += 50;
        reasons.push('Reservation number found in BMD text: ' + reservation.reservationNumber);
      }
    }

    // Property matching (15 points) - Defensive check
    if (bmdInvoice.propertyCode && reservation.propertyCode) {
      if (bmdInvoice.propertyCode === reservation.propertyCode) {
        score += 15;
        reasons.push('Property code match: ' + bmdInvoice.propertyCode);
      }
    }

    return { score, reasons };
  }

  /**
   * Validate unified match
   */
  private validateUnifiedMatch(
    bmdInvoice: BMDInvoice,
    reservation: UnifiedReservationData | null
  ): {
    status: 'VALID' | 'PARTIAL' | 'INVALID';
    issues: string[];
    canGenerateInvoice: boolean;
  } {
    const issues: string[] = [];
    let canGenerateInvoice = true;

    if (!reservation) {
      return {
        status: 'VALID',
        issues: ['No reservation data available'],
        canGenerateInvoice: true
      };
    }

    // Check essential data presence
    if (!reservation.bookerName || reservation.bookerName.trim() === '') {
      issues.push('Missing booker name in reservation data');
    }

    if (!reservation.departure) {
      issues.push('Missing departure date in reservation data');
    }

    if (!reservation.totalPayment || reservation.totalPayment <= 0) {
      issues.push('Missing or invalid payment amount in reservation data');
    }

    // Determine validation status
    let status: 'VALID' | 'PARTIAL' | 'INVALID';
    if (issues.length === 0) {
      status = 'VALID';
    } else if (issues.length <= 2) {
      status = 'PARTIAL';
    } else {
      status = 'INVALID';
    }

    return { status, issues, canGenerateInvoice };
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (!str1 || !str2) return 0;

    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j - 1][i] + 1,     // deletion
          matrix[j][i - 1] + 1,     // insertion
          matrix[j - 1][i - 1] + cost // substitution
        );
      }
    }

    const maxLength = Math.max(str1.length, str2.length);
    return 1 - (matrix[str2.length][str1.length] / maxLength);
  }
}