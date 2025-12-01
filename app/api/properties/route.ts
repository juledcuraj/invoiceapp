import { NextRequest, NextResponse } from 'next/server'
import { getProperties, addProperty } from '@/lib/storage'
import { PropertySchema } from '@/lib/types'

// Simple UUID generator
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

export async function GET() {
  try {
    const properties = await getProperties()
    return NextResponse.json(properties)
  } catch (error) {
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Add ID if not provided
    if (!body.id) {
      body.id = generateId()
    }
    
    // Validate with Zod schema
    const validatedData = PropertySchema.parse(body)
    
    await addProperty(validatedData)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error) {
      return new NextResponse(error.message, { status: 400 })
    }
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}