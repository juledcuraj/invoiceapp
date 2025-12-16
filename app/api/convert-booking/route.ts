import { NextRequest, NextResponse } from 'next/server';
import { 
  parseBookingCSV, 
  parsePayoutCSV,
  parseAirbnbCSV, 
  convertToUnifiedReservations, 
  generateAccountingCSV,
  BookingCSVRow,
  AirbnbCSVRow
} from '@/lib/booking-csv-parser';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    // Extract multiple booking files
    const bookingFiles: File[] = [];
    const entries = Array.from(formData.entries());
    for (const [key, value] of entries) {
      if (key.startsWith('bookingFile_') && value instanceof File) {
        bookingFiles.push(value);
      }
    }
    
    const airbnbFile = formData.get('airbnbFile') as File;
    const targetMonth = formData.get('targetMonth') as string;
    const startBelegnr = parseInt(formData.get('startBelegnr') as string) || 1;
    const useCommaDecimal = formData.get('useCommaDecimal') === 'true';
    const selectedProperty = formData.get('selectedProperty') as string;
    
    if (bookingFiles.length === 0 && !airbnbFile) {
      return NextResponse.json(
        { error: 'Please provide at least one CSV file (Booking.com or Airbnb)' },
        { status: 400 }
      );
    }
    
    // Validate file types
    for (const file of bookingFiles) {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        return NextResponse.json(
          { error: `Booking.com file ${file.name} must be a CSV file` },
          { status: 400 }
        );
      }
    }
    
    if (airbnbFile && !airbnbFile.name.toLowerCase().endsWith('.csv')) {
      return NextResponse.json(
        { error: 'Airbnb file must be a CSV file' },
        { status: 400 }
      );
    }
    
    let bookingRows: BookingCSVRow[] = [];
    let airbnbRows: AirbnbCSVRow[] = [];
    
    // Parse multiple Booking.com payout CSV files if provided
    if (bookingFiles.length > 0) {
      console.log(`Processing ${bookingFiles.length} booking payout files with target month: ${targetMonth}`);
      
      for (const file of bookingFiles) {
        try {
          const content = await file.text();
          const fileRows = parsePayoutCSV(content, targetMonth);
          bookingRows.push(...fileRows);
          console.log(`Parsed ${fileRows.length} reservations from ${file.name}`);
        } catch (error) {
          console.warn(`Error parsing ${file.name}:`, error);
        }
      }
      
      console.log(`Total ${bookingRows.length} Booking.com reservations after filtering`);
    }
    
    // Parse Airbnb CSV if provided
    if (airbnbFile) {
      const airbnbContent = await airbnbFile.text();
      airbnbRows = parseAirbnbCSV(airbnbContent);
      console.log(`Parsed ${airbnbRows.length} Airbnb reservations`);
    }
    
    // Convert to unified format and sort by departure date
    const unifiedReservations = convertToUnifiedReservations(bookingRows, airbnbRows);
    
    if (unifiedReservations.length === 0) {
      return NextResponse.json(
        { error: 'No valid reservations found in CSV files' },
        { status: 400 }
      );
    }
    
    console.log(`Total ${unifiedReservations.length} reservations ready for processing`);
    
    // Generate accounting CSV
    const accountingCSV = generateAccountingCSV(unifiedReservations, startBelegnr, useCommaDecimal, selectedProperty);
    
    // Generate filename based on target month and property
    let filename = 'BMD_Liste.csv';
    if (targetMonth) {
      const [year, month] = targetMonth.split('-');
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const monthName = monthNames[parseInt(month) - 1] || 'Unknown';
      
      // Include property short name in filename if selected
      if (selectedProperty) {
        filename = `${selectedProperty}_${monthName}_BMD_Liste.csv`;
      } else {
        filename = `${monthName}_BMD_Liste.csv`;
      }
    } else if (selectedProperty) {
      // Include property even without target month
      filename = `${selectedProperty}_BMD_Liste.csv`;
    }
    
    // Create response with CSV file
    const response = new NextResponse(accountingCSV, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
    
    return response;
  } catch (error) {
    console.error('Booking CSV conversion error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to convert CSV',
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}