import { NextRequest, NextResponse } from 'next/server';
import { updateCompany, type Company } from '@/lib/settings-service';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const requiredFields = ['legalName', 'address', 'email', 'phone', 'bankDetails'];
    const missingFields = requiredFields.filter(field => {
      if (field === 'bankDetails') {
        return !body[field] || !body[field].bankName || !body[field].iban || !body[field].bic;
      }
      return !body[field];
    });
    
    if (missingFields.length > 0) {
      return new NextResponse(`Missing required fields: ${missingFields.join(', ')}`, { status: 400 });
    }
    
    const company: Company = {
      legalName: body.legalName,
      address: body.address,
      uid: body.uid,
      email: body.email,
      phone: body.phone,
      website: body.website,
      bankDetails: {
        bankName: body.bankDetails.bankName,
        iban: body.bankDetails.iban,
        bic: body.bankDetails.bic
      },
      invoiceFooter: body.invoiceFooter
    };
    
    const updatedSettings = await updateCompany(company);
    
    return NextResponse.json({
      success: true,
      company: updatedSettings.company,
      lastUpdated: updatedSettings.metadata.lastUpdated
    });
    
  } catch (error) {
    console.error('Error updating company:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return new NextResponse(message, { status: 500 });
  }
}