import { NextRequest, NextResponse } from 'next/server'
import { generateInvoices } from '@/lib/invoice-generator'
import { getProperty, getPropertyByPrefix, getCompany } from '@/lib/storage'
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

    // Group CSV rows by property ID  
    const rowsByProperty = new Map<string, any[]>()
    for (const row of csvRows) {
      if (!row.propertyId) {
        console.warn('Row missing propertyId:', row)
        continue
      }
      
      if (!rowsByProperty.has(row.propertyId)) {
        rowsByProperty.set(row.propertyId, [])
      }
      rowsByProperty.get(row.propertyId)!.push(row)
    }

    // Process each property group
    const allResults: any[] = []
    const allErrors: string[] = []
    
    for (const [propertyId, propertyRows] of Array.from(rowsByProperty.entries())) {
      try {
        // Get property data - try by ID first, then by prefix
        let property = await getProperty(propertyId)
        if (!property) {
          property = await getPropertyByPrefix(propertyId)
        }
        if (!property) {
          allErrors.push(`Property ${propertyId} not found`)
          continue
        }

        // Validate CSV rows for this property
        const validatedRows = propertyRows.map((row: any) => CSVRowSchema.parse(row))

        // Generate invoices for this property
        const result = await generateInvoices(validatedRows, property, company, format)
        
        if (result.success) {
          allResults.push(result)
        } else {
          allErrors.push(`${property.name}: ${result.errors.join(', ')}`)
        }
      } catch (error) {
        allErrors.push(`Property ${propertyId}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    if (allResults.length === 0) {
      return new NextResponse(`Invoice generation failed: ${allErrors.join(', ')}`, { status: 500 })
    }

    // For now, return the first result (we can enhance this later to merge multiple properties)
    const result = allResults[0]

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