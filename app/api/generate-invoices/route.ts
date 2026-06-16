import { NextRequest, NextResponse } from 'next/server'
import { generateInvoices } from '@/lib/invoice-generator'
import { getProperty, getPropertyByPrefix, getCompany, getProperties } from '@/lib/storage'
import { CSVRowSchema } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { csvRows, format = 'zip' } = body

    if (!csvRows || !Array.isArray(csvRows)) {
      return new NextResponse('Invalid request data', { status: 400 })
    }

    // Get company data
    const company = await getCompany()

    if (!company) {
      return new NextResponse('Company not configured', { status: 400 })
    }

    // Preserve incoming row order from parser (already aligned to BMD order)
    const orderedRows = [...csvRows]

    // Validate rows
    const validatedRows = orderedRows.map((row: any) => CSVRowSchema.parse(row))

    // Resolve a base property once; per-row property is resolved inside generateInvoices
    let baseProperty = await getProperty('default')
    if (!baseProperty && validatedRows.length > 0) {
      const firstPropertyId = (validatedRows[0] as any).propertyId
      if (firstPropertyId) {
        baseProperty = await getProperty(firstPropertyId)
        if (!baseProperty) {
          baseProperty = await getPropertyByPrefix(firstPropertyId)
        }
      }
    }
    if (!baseProperty) {
      const properties = await getProperties()
      if (properties.length > 0) {
        baseProperty = properties[0]
      }
    }
    if (!baseProperty) {
      return new NextResponse('No properties configured', { status: 500 })
    }

    // Generate all invoices in one run/file
    const result = await generateInvoices(validatedRows, baseProperty, company, format)
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