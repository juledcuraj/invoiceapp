import { NextRequest, NextResponse } from 'next/server'
import { parsePayoutCSV, parseGenericCSV } from '@/lib/payout-csv-parser'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return new NextResponse('No file provided', { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    
    // Try to detect if it's a payout CSV format first
    const text = buffer.toString('utf8', 0, 500); // Check first 500 characters
    const isPayoutFormat = text.includes('Reference number') && text.includes('Payout ID');
    
    let result;
    if (isPayoutFormat) {
      console.log('Detected Booking.com payout CSV format - using optimized parser');
      result = await parsePayoutCSV(buffer);
    } else {
      console.log('Using generic CSV parser for standard format');
      result = await parseGenericCSV(buffer);
    }
    
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error) {
      return new NextResponse(error.message, { status: 400 })
    }
    return new NextResponse('Error parsing CSV file', { status: 500 })
  }
}