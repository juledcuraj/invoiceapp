import { NextRequest, NextResponse } from 'next/server'
import { getCompany, saveCompany } from '@/lib/storage'
import { CompanySchema } from '@/lib/types'

export async function GET() {
  try {
    const company = await getCompany()
    if (!company) {
      return new NextResponse('Company not found', { status: 404 })
    }
    return NextResponse.json(company)
  } catch (error) {
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate with Zod schema
    const validatedData = CompanySchema.parse(body)
    
    await saveCompany(validatedData)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error) {
      return new NextResponse(error.message, { status: 400 })
    }
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}