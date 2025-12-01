import { NextRequest, NextResponse } from 'next/server'
import { updateProperty, deleteProperty } from '@/lib/storage'
import { PropertySchema } from '@/lib/types'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { id } = params
    
    // Ensure ID matches
    body.id = id
    
    // Validate with Zod schema
    const validatedData = PropertySchema.parse(body)
    
    await updateProperty(id, validatedData)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error) {
      return new NextResponse(error.message, { status: 400 })
    }
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    
    await deleteProperty(id)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}