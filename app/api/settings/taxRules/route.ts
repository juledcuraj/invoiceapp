import { NextRequest, NextResponse } from 'next/server';
import { updateTaxRules, type TaxRules } from '@/lib/settings-service';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields and types
    const validationErrors: string[] = [];
    
    if (typeof body.defaultVatRate !== 'number' || body.defaultVatRate < 0 || body.defaultVatRate > 1) {
      validationErrors.push('defaultVatRate must be a number between 0 and 1');
    }
    
    if (typeof body.defaultCityTaxRate !== 'number' || body.defaultCityTaxRate < 0 || body.defaultCityTaxRate > 1) {
      validationErrors.push('defaultCityTaxRate must be a number between 0 and 1');
    }
    
    if (!Array.isArray(body.cityTaxHandlingModes)) {
      validationErrors.push('cityTaxHandlingModes must be an array');
    }
    
    if (!['SIMPLE', 'VIENNA_METHOD'].includes(body.defaultCityTaxHandling)) {
      validationErrors.push('defaultCityTaxHandling must be SIMPLE or VIENNA_METHOD');
    }
    
    if (typeof body.vatIncludedInGross !== 'boolean') {
      validationErrors.push('vatIncludedInGross must be a boolean');
    }
    
    if (!['ADD_TO_TOTAL', 'SEPARATE_LINE'].includes(body.cityTaxCollectionMethod)) {
      validationErrors.push('cityTaxCollectionMethod must be ADD_TO_TOTAL or SEPARATE_LINE');
    }
    
    if (validationErrors.length > 0) {
      return new NextResponse(
        `Validation errors: ${validationErrors.join(', ')}`, 
        { status: 400 }
      );
    }
    
    const taxRules: TaxRules = {
      defaultVatRate: body.defaultVatRate,
      defaultCityTaxRate: body.defaultCityTaxRate,
      cityTaxHandlingModes: body.cityTaxHandlingModes,
      defaultCityTaxHandling: body.defaultCityTaxHandling,
      vatIncludedInGross: body.vatIncludedInGross,
      cityTaxCollectionMethod: body.cityTaxCollectionMethod
    };
    
    const updatedSettings = await updateTaxRules(taxRules);
    
    return NextResponse.json({
      success: true,
      taxRules: updatedSettings.taxRules,
      lastUpdated: updatedSettings.metadata.lastUpdated
    });
    
  } catch (error) {
    console.error('Error updating tax rules:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return new NextResponse(message, { status: 500 });
  }
}