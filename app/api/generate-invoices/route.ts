import { NextRequest, NextResponse } from 'next/server'
import { generateInvoices } from '@/lib/invoice-generator'
import { getProperty, getCompany } from '@/lib/storage'
import { CSVRowSchema } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { propertyId, csvRows, format = 'zip' } = body

    if (!propertyId || !csvRows || !Array.isArray(csvRows)) {
      return new NextResponse('Invalid request data', { status: 400 })
    }

    // Get property and company data
    const [property, company] = await Promise.all([
      getProperty(propertyId),
      getCompany()
    ])

    if (!property) {
      return new NextResponse('Property not found', { status: 404 })
    }

    if (!company) {
      return new NextResponse('Company not configured', { status: 400 })
    }

    // Validate CSV rows
    const validatedRows = csvRows.map((row: any) => CSVRowSchema.parse(row))

    // Generate invoices
    const result = await generateInvoices(validatedRows, property, company, format)

    if (!result.success) {
      return new NextResponse(`Invoice generation failed: ${result.errors.join(', ')}`, { status: 500 })
    }

    if (format === 'combined') {
      // Return single combined PDF
      if (!result.combinedPdfBuffer) {
        return new NextResponse('Failed to create combined PDF', { status: 500 })
      }
      
      return new NextResponse(new Uint8Array(result.combinedPdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${result.filename || 'all-invoices.pdf'}"`,
          'Content-Length': String(result.combinedPdfBuffer.length),
        },
      })
    } else {
      // Return ZIP file
      if (!result.zipBuffer) {
        return new NextResponse('Failed to create ZIP file', { status: 500 })
      }
      
      return new NextResponse(new Uint8Array(result.zipBuffer), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${result.filename || 'invoices.zip'}"`,
          'Content-Length': String(result.zipBuffer.length),
        },
      })
    }

  } catch (error) {
    console.error('Error generating invoices:', error)
    if (error instanceof Error) {
      return new NextResponse(error.message, { status: 400 })
    }
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}