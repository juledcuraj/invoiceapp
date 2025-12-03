import { NextRequest, NextResponse } from 'next/server';
import { parseBookingCSV, generateAccountingCSV } from '@/lib/booking-csv-parser';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const startBelegnr = parseInt(formData.get('startBelegnr') as string) || 1;
    const useCommaDecimal = formData.get('useCommaDecimal') === 'true';
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }
    
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return NextResponse.json(
        { error: 'Please upload a CSV file' },
        { status: 400 }
      );
    }
    
    const csvContent = await file.text();
    
    // Parse the booking CSV
    const bookingRows = parseBookingCSV(csvContent);
    
    if (bookingRows.length === 0) {
      return NextResponse.json(
        { error: 'No valid reservations found in CSV' },
        { status: 400 }
      );
    }
    
    // Generate accounting CSV
    const accountingCSV = generateAccountingCSV(bookingRows, startBelegnr, useCommaDecimal);
    
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