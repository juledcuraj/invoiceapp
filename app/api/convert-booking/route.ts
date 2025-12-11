import { NextRequest, NextResponse } from 'next/server';
import { 
  parseBookingCSV, 
  parseAirbnbCSV, 
  convertToUnifiedReservations, 
  generateAccountingCSV,
  BookingCSVRow,
  AirbnbCSVRow
} from '@/lib/booking-csv-parser';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const bookingFile = formData.get('bookingFile') as File;
    const airbnbFile = formData.get('airbnbFile') as File;
    const startBelegnr = parseInt(formData.get('startBelegnr') as string) || 1;
    const useCommaDecimal = formData.get('useCommaDecimal') === 'true';
    
    if (!bookingFile && !airbnbFile) {
      return NextResponse.json(
        { error: 'Please provide at least one CSV file (Booking.com or Airbnb)' },
        { status: 400 }
      );
    }
    
    // Validate file types
    if (bookingFile && !bookingFile.name.toLowerCase().endsWith('.csv')) {
      return NextResponse.json(
        { error: 'Booking.com file must be a CSV file' },
        { status: 400 }
      );
    }
    
    if (airbnbFile && !airbnbFile.name.toLowerCase().endsWith('.csv')) {
      return NextResponse.json(
        { error: 'Airbnb file must be a CSV file' },
        { status: 400 }
      );
    }
    
    let bookingRows: BookingCSVRow[] = [];
    let airbnbRows: AirbnbCSVRow[] = [];
    
    // Parse Booking.com CSV if provided
    if (bookingFile) {
      const bookingContent = await bookingFile.text();
      bookingRows = parseBookingCSV(bookingContent);
      console.log(`Parsed ${bookingRows.length} Booking.com reservations`);
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
    const accountingCSV = generateAccountingCSV(unifiedReservations, startBelegnr, useCommaDecimal);
    
    // Create response with CSV file
    const response = new NextResponse(accountingCSV, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="accounting_export_${Date.now()}.csv"`,
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