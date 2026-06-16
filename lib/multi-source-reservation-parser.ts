// Unified reservation interface for all sources
export interface UnifiedReservationData {
  reservationNumber: string;
  source: 'BOOKING_COM' | 'AIRBNB' | 'VRBO' | 'DIRECT' | 'OTHER';
  propertyName: string;
  propertyCode?: string;
  bookerName: string;
  arrival: string; // YYYY-MM-DD format
  departure: string; // YYYY-MM-DD format
  totalPayment: number;
  currency: string;
  status?: string;
  originalData?: any; // Keep original for debugging
}

export interface ReservationSourceStats {
  source: string;
  totalRecords: number;
  validRecords: number;
  skippedRecords: number;
  dateRange: { earliest: string; latest: string };
}

/**
 * Multi-source reservation parser that handles different CSV formats
 * from Booking.com, Airbnb, VRBO, etc.
 */
export class MultiSourceReservationParser {
  private unifiedReservations: UnifiedReservationData[] = [];
  private sourceStats: ReservationSourceStats[] = [];

  /**
   * Custom CSV parser to replace csv-parse dependency
   */
  private parseCSVContent(csvContent: string): Record<string, string>[] {
    const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length < 2) {
      throw new Error('CSV must have at least header and one data row');
    }

    const headers = this.parseCSVLine(lines[0]);
    const records: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      
      if (values.length === 0) continue; // Skip empty rows
      
      const record: Record<string, string> = {};
      
      // Map values to headers
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j] || `column_${j}`;
        const value = j < values.length ? values[j] : '';
        record[header] = value;
      }
      
      records.push(record);
    }

    return records;
  }

  /**
   * Parse a CSV line handling quotes and escaping
   */
  private parseCSVLine(line: string, delimiter: string = ','): string[] {
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
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add the last field
    result.push(current.trim());
    
    return result;
  }

  /**
   * Parse multiple reservation files and unify them
   */
  async parseAllSources(files: Array<{ content: string; filename: string; source?: string }>): Promise<{
    reservations: UnifiedReservationData[];
    stats: ReservationSourceStats[];
    errors: string[];
  }> {
    const errors: string[] = [];
    console.log(`🔍 PARSING ${files.length} RESERVATION SOURCE FILES...`);

    for (const file of files) {
      try {
        // Use explicit source provided by user, fallback to detection only if not provided
        const sourceType = file.source as 'BOOKING_COM' | 'AIRBNB' | 'VRBO' | 'DIRECT' | 'OTHER' 
                          || this.detectSourceType(file.content, file.filename);
        console.log(`📁 Processing ${file.filename} as ${sourceType} source...`);

        const { reservations, stats } = await this.parseSourceFile(file.content, sourceType, file.filename);
        
        this.unifiedReservations.push(...reservations);
        this.sourceStats.push(stats);

        console.log(`✅ ${file.filename}: ${reservations.length} reservations parsed`);
      } catch (error) {
        const errorMsg = `Failed to parse ${file.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }

    // Remove duplicates and sort by date
    const deduplicated = this.removeDuplicates(this.unifiedReservations);
    const sorted = deduplicated.sort((a, b) => new Date(a.departure).getTime() - new Date(b.departure).getTime());

    console.log(`📊 TOTAL UNIFIED RESERVATIONS: ${sorted.length} (removed ${this.unifiedReservations.length - deduplicated.length} duplicates)`);

    return {
      reservations: sorted,
      stats: this.sourceStats,
      errors
    };
  }

  /**
   * Auto-detect reservation source type from content and filename
   */
  private detectSourceType(content: string, filename: string): 'BOOKING_COM' | 'AIRBNB' | 'VRBO' | 'DIRECT' | 'OTHER' {
    const contentLower = content.toLowerCase();
    const filenameLower = filename.toLowerCase();

    // Booking.com detection
    if (filenameLower.includes('booking') || 
        contentLower.includes('booking.com') || 
        contentLower.includes('commission')) {
      return 'BOOKING_COM';
    }

    // Airbnb detection  
    if (filenameLower.includes('airbnb') || 
        filenameLower.includes('abnb') ||
        contentLower.includes('confirmation code') || 
        contentLower.includes('earnings')) {
      return 'AIRBNB';
    }

    // VRBO detection
    if (filenameLower.includes('vrbo') || 
        filenameLower.includes('homeaway') ||
        contentLower.includes('property manager')) {
      return 'VRBO';
    }

    // Direct booking detection
    if (filenameLower.includes('direct') || 
        contentLower.includes('direct booking')) {
      return 'DIRECT';
    }

    return 'OTHER';
  }

  /**
   * Parse a single source file based on detected type
   */
  private async parseSourceFile(content: string, sourceType: string, filename: string): Promise<{
    reservations: UnifiedReservationData[];
    stats: ReservationSourceStats;
  }> {
    const reservations: UnifiedReservationData[] = [];
    const stats: ReservationSourceStats = {
      source: `${sourceType} (${filename})`,
      totalRecords: 0,
      validRecords: 0,
      skippedRecords: 0,
      dateRange: { earliest: '', latest: '' }
    };

    try {
      const records = this.parseCSVContent(content);

      stats.totalRecords = records.length;
      console.log(`📋 ${filename}: Found ${records.length} raw records`);

      const dates: string[] = [];

      for (const record of records) {
        try {
          let unified: UnifiedReservationData | null = null;

          switch (sourceType) {
            case 'BOOKING_COM':
              unified = this.parseBookingComRecord(record);
              break;
            case 'AIRBNB':
              unified = this.parseAirbnbRecord(record);
              break;
            case 'VRBO':
              unified = this.parseVrboRecord(record);
              break;
            case 'DIRECT':
              unified = this.parseDirectRecord(record);
              break;
            default:
              unified = this.parseGenericRecord(record, sourceType as any);
              break;
          }

          if (unified) {
            unified.source = sourceType as any;
            unified.originalData = record;
            reservations.push(unified);
            stats.validRecords++;

            dates.push(unified.departure);
          } else {
            stats.skippedRecords++;
          }
        } catch (recordError) {
          console.warn(`⚠️ Skipped record in ${filename}:`, recordError);
          stats.skippedRecords++;
        }
      }

      // Calculate date range
      if (dates.length > 0) {
        dates.sort();
        stats.dateRange.earliest = dates[0];
        stats.dateRange.latest = dates[dates.length - 1];
      }

    } catch (parseError) {
      throw new Error(`CSV parse failed for ${filename}: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }

    return { reservations, stats };
  }

  /**
   * Parse Booking.com reservation record
   * Supports the payout CSV format: Type, "Reference number", Check-in, Checkout, "Guest name", ...
   */
  private parseBookingComRecord(record: any): UnifiedReservationData | null {
    // Skip non-reservation rows (e.g. "Damage request")
    const type = record['Type'] || record['type'] || 'Reservation';
    if (type !== 'Reservation') return null;

    // Reference number (payout CSV uses "Reference number")
    const resNumber = record['Reference number'] || record['Reference Number']
      || record['Reservation Number'] || record['reservationNumber'] || record['reservation_id'];

    // Guest name (payout CSV uses "Guest name")
    const bookerName = record['Guest name'] || record['Guest Name']
      || record['Booker Name'] || record['bookerName'] || record['guest_name'];

    // Dates (payout CSV uses "Check-in" / "Checkout")
    const arrival = record['Check-in'] || record['Check-In']
      || record['Arrival'] || record['arrival'] || record['checkin'] || record['start_date'];
    const departure = record['Checkout'] || record['Check-out'] || record['Check-Out']
      || record['Departure'] || record['departure'] || record['checkout'] || record['end_date'];

    // Amount: use "Amount" (gross guest payment) — matches BMD grossAmount exactly
    const amount = record['Amount'] || record['Total Payment'] || record['totalPayment']
      || record['total_amount'] || record['amount'];

    if (!resNumber || !bookerName || !departure || !amount) {
      return null;
    }

    // Skip rows with zero or negative amount (e.g. fee adjustments)
    const parsedAmount = this.parseAmount(amount);
    if (parsedAmount <= 0) return null;

    return {
      reservationNumber: resNumber.toString().trim(),
      source: 'BOOKING_COM',
      propertyName: record['Property Name'] || record['propertyName'] || 'Unknown Property',
      propertyCode: record['Property Code'] || record['propertyCode'],
      bookerName: bookerName.toString().trim(),
      arrival: this.standardizeDate(arrival),
      departure: this.standardizeDate(departure),
      totalPayment: parsedAmount,
      currency: record['Currency'] || record['currency'] || 'EUR',
      status: record['Reservation status'] || record['Status'] || record['status'],
    };
  }

  /**
   * Parse Airbnb reservation record
   */
  private parseAirbnbRecord(record: any): UnifiedReservationData | null {
    const confirmationCode = record['Confirmation code'] || record['Confirmation Code'];
    const guestName = record['Guest name'] || record['Guest Name'];
    const startDate = record['Start date'] || record['Start Date'];
    const endDate = record['End date'] || record['End Date'];
    const earnings = record['Earnings'] || record['earnings'];

    if (!confirmationCode || !guestName || !endDate || !earnings) {
      return null;
    }

    // Skip canceled reservations
    const status = record['Status'] || '';
    if (status.toLowerCase().includes('canceled') || 
        status.toLowerCase().includes('cancelled')) {
      return null;
    }

    const earningsAmount = this.parseAmount(earnings);
    if (earningsAmount <= 0) {
      return null; // Skip zero earnings
    }

    return {
      reservationNumber: confirmationCode.toString(),
      source: 'AIRBNB',
      propertyName: record['Listing'] || 'Airbnb Property',
      propertyCode: this.extractPropertyCodeFromAirbnb(record['Listing'] || ''),
      bookerName: guestName.toString(),
      arrival: this.standardizeDate(startDate),
      departure: this.standardizeDate(endDate),
      totalPayment: earningsAmount,
      currency: 'EUR', // Airbnb earnings are typically in property's local currency
      status: status,
    };
  }

  /**
   * Parse VRBO reservation record (placeholder)
   */
  private parseVrboRecord(record: any): UnifiedReservationData | null {
    // Implementation when VRBO data becomes available
    return null;
  }

  /**
   * Parse direct booking record (placeholder)
   */
  private parseDirectRecord(record: any): UnifiedReservationData | null {
    // Implementation when direct booking data becomes available
    return null;
  }

  /**
   * Parse generic/unknown format record
   */
  private parseGenericRecord(record: any, sourceType: string): UnifiedReservationData | null {
    // Try to guess common field names
    const possibleIds = ['id', 'reservation_id', 'booking_id', 'confirmation'];
    const possibleNames = ['guest', 'name', 'booker', 'customer'];
    const possibleCheckouts = ['checkout', 'end', 'departure', 'end_date'];
    const possibleAmounts = ['amount', 'total', 'payment', 'price', 'cost'];

    const id = this.findFieldValue(record, possibleIds);
    const name = this.findFieldValue(record, possibleNames);
    const checkout = this.findFieldValue(record, possibleCheckouts);
    const amount = this.findFieldValue(record, possibleAmounts);

    if (!id || !name || !checkout || !amount) {
      return null;
    }

    return {
      reservationNumber: id.toString(),
      source: 'OTHER',
      propertyName: 'Unknown Property',
      bookerName: name.toString(),
      arrival: this.standardizeDate(checkout, -1), // Estimate check-in as day before
      departure: this.standardizeDate(checkout),
      totalPayment: this.parseAmount(amount),
      currency: 'EUR',
    };
  }

  /**
   * Extract property code from Airbnb listing name
   */
  private extractPropertyCodeFromAirbnb(listingName: string): string {
    const listing = listingName.toLowerCase();
    
    // Map Airbnb listing names to property codes
    if (listing.includes('large apartment') || listing.includes('balcony')) {
      return 'BEGA'; // Based on your property mapping
    }
    if (listing.includes('spacious gem') || listing.includes("vienna's center")) {
      return 'WAFG';
    }
    if (listing.includes('5 star apartment')) {
      return 'LAS';
    }
    
    return 'UNKNOWN';
  }

  /**
   * Find field value by trying different possible field names
   */
  private findFieldValue(record: any, possibleNames: string[]): any {
    for (const name of possibleNames) {
      for (const key in record) {
        if (key.toLowerCase().includes(name.toLowerCase())) {
          return record[key];
        }
      }
    }
    return null;
  }

  /**
   * Standardize date to YYYY-MM-DD format
   */
  private standardizeDate(dateValue: any, dayOffset: number = 0): string {
    if (!dateValue) return '';

    const formatLocalDate = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    
    let dateStr = dateValue.toString().trim();
    
    // Handle different date formats
    let date: Date;
    
    if (dateStr.includes('/')) {
      // US format: M/D/YYYY or MM/DD/YYYY
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const month = parseInt(parts[0]);
        const day = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        date = new Date(year, month - 1, day);
      } else {
        date = new Date(dateStr);
      }
    } else if (dateStr.includes('-')) {
      // ISO format: YYYY-MM-DD or DD-MM-YYYY
      date = new Date(dateStr);
    } else {
      date = new Date(dateStr);
    }
    
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${dateValue}`);
    }
    
    // Apply day offset
    if (dayOffset !== 0) {
      date.setDate(date.getDate() + dayOffset);
    }

    // IMPORTANT: Use local calendar date formatting to avoid timezone day-shift bugs.
    return formatLocalDate(date);
  }

  /**
   * Parse amount string to number
   */
  private parseAmount(amountValue: any): number {
    if (typeof amountValue === 'number') {
      return amountValue;
    }
    
    let amountStr = amountValue.toString().trim();
    
    // Remove currency symbols and spaces
    amountStr = amountStr.replace(/[€$£¥₹,\s]/g, '');
    
    const amount = parseFloat(amountStr);
    
    if (isNaN(amount)) {
      throw new Error(`Invalid amount: ${amountValue}`);
    }
    
    return amount;
  }

  /**
   * Remove duplicate reservations across sources
   */
  private removeDuplicates(reservations: UnifiedReservationData[]): UnifiedReservationData[] {
    const seen = new Set<string>();
    const deduplicated: UnifiedReservationData[] = [];
    
    for (const reservation of reservations) {
      // Create unique key based on guest name + dates + amount
      const key = `${reservation.bookerName.toLowerCase()}_${reservation.departure}_${reservation.totalPayment}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(reservation);
      } else {
        console.log(`🔄 Duplicate reservation skipped: ${reservation.reservationNumber} (${reservation.source})`);
      }
    }
    
    return deduplicated;
  }

  /**
   * Get summary statistics
   */
  getStats(): { totalReservations: number; sourceBreakdown: ReservationSourceStats[] } {
    return {
      totalReservations: this.unifiedReservations.length,
      sourceBreakdown: this.sourceStats
    };
  }
}