import { NextRequest, NextResponse } from 'next/server'
import { generateInvoices } from '@/lib/invoice-generator'
import { getProperty, getCompany } from '@/lib/storage'
import { CSVRowSchema } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { propertyId, csvRows } = body

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
    const result = await generateInvoices(validatedRows, property, company)

    if (!result.success) {
      return new NextResponse(`Invoice generation failed: ${result.errors.join(', ')}`, { status: 500 })
    }

    if (!result.zipBuffer) {
      return new NextResponse('Failed to create ZIP file', { status: 500 })
    }

    // Return ZIP file
    return new NextResponse(result.zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="invoices-${Date.now()}.zip"`,
      },
    })

  } catch (error) {
    console.error('Error generating invoices:', error)
    if (error instanceof Error) {
      return new NextResponse(error.message, { status: 400 })
    }
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}