import { NextRequest, NextResponse } from 'next/server';
import { incrementCounter } from '@/lib/settings-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.propertyId) {
      return new NextResponse('propertyId is required', { status: 400 });
    }
    
    // Optional year parameter, defaults to current year
    const year = body.year ? parseInt(body.year) : undefined;
    
    if (body.year && (isNaN(year!) || year! < 2020 || year! > 2050)) {
      return new NextResponse('year must be a valid year between 2020 and 2050', { status: 400 });
    }
    
    const result = await incrementCounter(body.propertyId, year);
    
    return NextResponse.json({
      success: true,
      invoiceNumber: result.invoiceNumber,
      counter: result.counter,
      year: year || new Date().getFullYear(),
      propertyId: body.propertyId,
      property: {
        id: result.property.id,
        name: result.property.name,
        invoicePrefix: result.property.invoicePrefix
      }
    });
    
  } catch (error) {
    console.error('Error incrementing counter:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    
    // Handle property not found error specifically
    if (message.includes('not found')) {
      return new NextResponse(message, { status: 404 });
    }
    
    return new NextResponse(message, { status: 500 });
  }
}