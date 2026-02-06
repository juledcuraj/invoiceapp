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
    
    // Extract property-specific booking files
    const propertyFiles: Array<{property: string, files: File[]}> = [];
    const propertyCount = parseInt(formData.get('propertyCount') as string) || 0;
    
    // Group files by property
    for (let propertyIndex = 0; propertyIndex < propertyCount; propertyIndex++) {
      const property = formData.get(`property_${propertyIndex}`) as string;
      const propertyFilesList: File[] = [];
      
      // Get all files for this property
      const entries = Array.from(formData.entries());
      for (const [key, value] of entries) {
        if (key.startsWith(`bookingFile_${propertyIndex}_`) && value instanceof File) {
          propertyFilesList.push(value);
        }
      }
      
      if (property && propertyFilesList.length > 0) {
        propertyFiles.push({property, files: propertyFilesList});
      }
    }
    
    const airbnbFile = formData.get('airbnbFile') as File;
    const targetMonth = formData.get('targetMonth') as string;
    const startBelegnr = parseInt(formData.get('startBelegnr') as string) || 1;
    const useCommaDecimal = formData.get('useCommaDecimal') === 'true';
    
    if (propertyFiles.length === 0 && !airbnbFile) {
      return NextResponse.json(
        { error: 'Please provide at least one CSV file (Booking.com or Airbnb)' },
        { status: 400 }
      );
    }
    
    
    // Validate file types
    for (const propertyGroup of propertyFiles) {
      for (const file of propertyGroup.files) {
        if (!file.name.toLowerCase().endsWith('.csv')) {
          return NextResponse.json(
            { error: `Booking.com file ${file.name} for property ${propertyGroup.property} must be a CSV file` },
            { status: 400 }
          );
        }
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
    
    // Parse property-specific Booking.com payout CSV files
    if (propertyFiles.length > 0) {
      console.log(`Processing ${propertyFiles.length} property groups with target month: ${targetMonth}`);
      
      for (const propertyGroup of propertyFiles) {
        console.log(`Processing ${propertyGroup.files.length} files for property ${propertyGroup.property}`);
        
        for (const file of propertyGroup.files) {
          try {
            const content = await file.text();
            const fileRows = parsePayoutCSV(content, targetMonth);
            
            // Set the property name for each row based on the upload section
            fileRows.forEach(row => {
              row.propertyName = propertyGroup.property; // Use the property prefix as the property name
            });
            
            bookingRows.push(...fileRows);
            console.log(`Parsed ${fileRows.length} reservations from ${file.name} for property ${propertyGroup.property}`);
          } catch (error) {
            console.warn(`Error parsing ${file.name} for property ${propertyGroup.property}:`, error);
          }
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
    
    // Generate accounting CSV (no selectedProperty needed since each reservation has its property)
    const accountingCSV = generateAccountingCSV(unifiedReservations, startBelegnr, useCommaDecimal);
    
    // Generate filename based on target month
    let filename = 'BMD_Liste.csv';
    if (targetMonth) {
      const [year, month] = targetMonth.split('-');
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const monthName = monthNames[parseInt(month) - 1] || 'Unknown';
      filename = `${monthName}_BMD_Liste.csv`;
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