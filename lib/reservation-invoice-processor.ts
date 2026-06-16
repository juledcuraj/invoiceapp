/**
 * Reservation-Only Invoice Processing
 * Extract all needed invoice data from reservation files and validate manually
 */

import { parseReservationsCSV, MergerReservationData } from './reservations-parser';
import { CSVRow } from './types';

export interface ReservationInvoice {
  id: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  amount: number;
  property: string;
  reservationNumber: string;
  source: string;
  address?: string;
  nights?: number;
  // Validation status
  isValid: boolean;
  issues: string[];
  // Manual review
  manuallyApproved?: boolean;
  rejectionReason?: string;
}

export interface ValidationRules {
  requireGuestName: boolean;
  requireValidDates: boolean;
  requirePositiveAmount: boolean;
  requireProperty: boolean;
  minAmount?: number;
  maxAmount?: number;
  futureDatesAllowed: boolean;
}

export class ReservationInvoiceProcessor {
  private rules: ValidationRules;

  constructor(rules: Partial<ValidationRules> = {}) {
    this.rules = {
      requireGuestName: true,
      requireValidDates: true,
      requirePositiveAmount: true,
      requireProperty: true,
      minAmount: 10, // €10 minimum
      maxAmount: 10000, // €10,000 maximum
      futureDatesAllowed: false,
      ...rules
    };
  }

  /**
   * Process reservation files and extract invoice data
   */
  async processReservationFiles(
    reservationFiles: { month: string; content: string }[]
  ): Promise<{
    invoices: ReservationInvoice[];
    summary: {
      total: number;
      valid: number;
      needsReview: number;
      errors: string[];
    };
  }> {
    console.log('🔍 Processing reservation files for invoice extraction...');
    
    const allInvoices: ReservationInvoice[] = [];
    const errors: string[] = [];

    for (const file of reservationFiles) {
      try {
        console.log(`📅 Processing ${file.month}...`);
        
        const result = parseReservationsCSV(file.content);
        
        if (result.errors.length > 0) {
          errors.push(`${file.month}: ${result.errors.join(', ')}`);
        }

        // Convert each reservation to invoice
        for (const reservation of result.reservations) {
          const invoice = this.convertReservationToInvoice(reservation, file.month);
          allInvoices.push(invoice);
        }

      } catch (error) {
        errors.push(`${file.month}: Failed to parse - ${error}`);
      }
    }

    // Validate all invoices
    for (const invoice of allInvoices) {
      this.validateInvoice(invoice);
    }

    const valid = allInvoices.filter(inv => inv.isValid).length;
    const needsReview = allInvoices.filter(inv => !inv.isValid).length;

    console.log(`✅ Processed ${allInvoices.length} invoices: ${valid} valid, ${needsReview} need review`);

    return {
      invoices: allInvoices,
      summary: {
        total: allInvoices.length,
        valid,
        needsReview,
        errors
      }
    };
  }

  /**
   * Convert reservation data to invoice format
   */
  private convertReservationToInvoice(
    reservation: MergerReservationData,
    month: string
  ): ReservationInvoice {
    // Calculate nights
    let nights = 0;
    if (reservation.arrival && reservation.departure) {
      const checkIn = new Date(reservation.arrival);
      const checkOut = new Date(reservation.departure);
      nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Determine property code from property name or use fallback
    let propertyCode = 'UNKNOWN';
    if (reservation.propertyCode) {
      propertyCode = reservation.propertyCode;
    } else if (reservation.propertyName) {
      // Try to extract property code from property name
      const propertyMap: { [key: string]: string } = {
        'vienna central': 'BEGA',
        'bechardgasse': 'BEGA',
        'state opera': 'WAFG', 
        'walfischgasse': 'WAFG',
        'leopold': 'LAS',
        'lassallestraße': 'LAS',
        'stephansdom': 'KRA',
        'kramergasse': 'KRA',
        'bauernmarkt': 'BM',
        'kliebergasse': 'KLIE',
        'lambrechtgasse': 'LAM',
        'zimmermanngasse': 'ZIM'
      };
      
      const propertyLower = reservation.propertyName.toLowerCase();
      for (const [keyword, code] of Object.entries(propertyMap)) {
        if (propertyLower.includes(keyword)) {
          propertyCode = code;
          break;
        }
      }
    }

    const invoice: ReservationInvoice = {
      id: `${month}-${reservation.reservationNumber}`,
      guestName: reservation.bookerName || 'Unknown Guest',
      checkInDate: reservation.arrival || '',
      checkOutDate: reservation.departure || '',
      amount: reservation.totalPayment || 0,
      property: propertyCode,
      reservationNumber: reservation.reservationNumber,
      source: `${month} (${reservation.source || 'CSV'})`,
      nights: nights > 0 ? nights : undefined,
      isValid: false,
      issues: []
    };

    return invoice;
  }

  /**
   * Validate invoice against rules
   */
  private validateInvoice(invoice: ReservationInvoice): void {
    const issues: string[] = [];

    // Guest name validation
    if (this.rules.requireGuestName) {
      if (!invoice.guestName || invoice.guestName.trim() === '' || invoice.guestName === 'Unknown Guest') {
        issues.push('Missing guest name');
      }
    }

    // Date validation
    if (this.rules.requireValidDates) {
      if (!invoice.checkInDate || !invoice.checkOutDate) {
        issues.push('Missing check-in or check-out date');
      } else {
        const checkIn = new Date(invoice.checkInDate);
        const checkOut = new Date(invoice.checkOutDate);
        
        if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
          issues.push('Invalid date format');
        } else if (checkOut <= checkIn) {
          issues.push('Check-out must be after check-in');
        } else if (!this.rules.futureDatesAllowed && checkIn > new Date()) {
          issues.push('Future dates not allowed');
        }
      }
    }

    // Amount validation
    if (this.rules.requirePositiveAmount) {
      if (invoice.amount <= 0) {
        issues.push('Amount must be positive');
      }
    }

    if (this.rules.minAmount && invoice.amount < this.rules.minAmount) {
      issues.push(`Amount below minimum (€${this.rules.minAmount})`);
    }

    if (this.rules.maxAmount && invoice.amount > this.rules.maxAmount) {
      issues.push(`Amount above maximum (€${this.rules.maxAmount})`);
    }

    // Property validation
    if (this.rules.requireProperty) {
      if (!invoice.property || invoice.property === 'UNKNOWN') {
        issues.push('Property not identified');
      }
    }

    // Additional business rules
    if (invoice.nights !== undefined && invoice.nights > 365) {
      issues.push('Stay duration too long (>365 days)');
    }

    if (invoice.nights !== undefined && invoice.nights < 1) {
      issues.push('Invalid stay duration');
    }

    invoice.issues = issues;
    invoice.isValid = issues.length === 0;
  }

  /**
   * Manually approve or reject an invoice
   */
  approveInvoice(invoice: ReservationInvoice, approved: boolean, reason?: string): ReservationInvoice {
    invoice.manuallyApproved = approved;
    if (!approved && reason) {
      invoice.rejectionReason = reason;
    }
    return invoice;
  }

  /**
   * Convert approved invoices to CSV format for invoice generation
   */
  convertToCSVRows(invoices: ReservationInvoice[]): CSVRow[] {
    const approvedInvoices = invoices.filter(inv => 
      inv.isValid || inv.manuallyApproved === true
    );

    console.log(`📋 Converting ${approvedInvoices.length} approved invoices to CSV format...`);

    return approvedInvoices.map(invoice => {
      const csvRow: CSVRow = {
        reservationId: invoice.reservationNumber,
        guestName: invoice.guestName,
        checkInDate: invoice.checkInDate,
        checkOutDate: invoice.checkOutDate,
        amountPaidGross: invoice.amount,
        currency: 'EUR',
        invoiceNumber: invoice.reservationNumber, // Use reservation number as invoice number
        nights: invoice.nights
      };

      // Add property for routing (not in schema but needed)
      (csvRow as any).propertyId = invoice.property;

      return csvRow;
    });
  }

  /**
   * Get summary statistics
   */
  getSummary(invoices: ReservationInvoice[]): {
    total: number;
    autoValid: number;
    manuallyApproved: number;
    manuallyRejected: number;
    pendingReview: number;
    readyForInvoicing: number;
    totalAmount: number;
  } {
    const autoValid = invoices.filter(inv => inv.isValid).length;
    const manuallyApproved = invoices.filter(inv => inv.manuallyApproved === true).length;
    const manuallyRejected = invoices.filter(inv => inv.manuallyApproved === false).length;
    const pendingReview = invoices.filter(inv => !inv.isValid && inv.manuallyApproved === undefined).length;
    
    const readyForInvoicing = invoices.filter(inv => 
      inv.isValid || inv.manuallyApproved === true
    ).length;

    const totalAmount = invoices
      .filter(inv => inv.isValid || inv.manuallyApproved === true)
      .reduce((sum, inv) => sum + inv.amount, 0);

    return {
      total: invoices.length,
      autoValid,
      manuallyApproved,
      manuallyRejected,
      pendingReview,
      readyForInvoicing,
      totalAmount
    };
  }
}