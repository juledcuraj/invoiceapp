import { NextRequest, NextResponse } from 'next/server';
import { updateProperties, type Property } from '@/lib/settings-service';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate that body is an array
    if (!Array.isArray(body)) {
      return new NextResponse('Request body must be an array of properties', { status: 400 });
    }
    
    // Validate each property
    const validatedProperties: Property[] = [];
    
    for (let i = 0; i < body.length; i++) {
      const prop = body[i];
      
      // Check required fields
      const requiredFields = ['id', 'name', 'address', 'invoicePrefix'];
      const missingFields = requiredFields.filter(field => !prop[field]);
      
      if (missingFields.length > 0) {
        return new NextResponse(
          `Property at index ${i} missing required fields: ${missingFields.join(', ')}`, 
          { status: 400 }
        );
      }
      
      // Validate numeric fields
      if (typeof prop.vatRate !== 'number' || prop.vatRate < 0 || prop.vatRate > 1) {
        return new NextResponse(
          `Property at index ${i}: vatRate must be a number between 0 and 1`, 
          { status: 400 }
        );
      }
      
      if (typeof prop.cityTaxRate !== 'number' || prop.cityTaxRate < 0 || prop.cityTaxRate > 1) {
        return new NextResponse(
          `Property at index ${i}: cityTaxRate must be a number between 0 and 1`, 
          { status: 400 }
        );
      }
      
      // Validate cityTaxHandling
      if (!['SIMPLE', 'VIENNA_METHOD'].includes(prop.cityTaxHandling)) {
        return new NextResponse(
          `Property at index ${i}: cityTaxHandling must be 'SIMPLE' or 'VIENNA_METHOD'`, 
          { status: 400 }
        );
      }
      
      // Validate serviceFee
      if (prop.serviceFee !== undefined && (typeof prop.serviceFee !== 'number' || prop.serviceFee < 0)) {
        return new NextResponse(
          `Property at index ${i}: serviceFee must be a non-negative number`, 
          { status: 400 }
        );
      }
      
      const validatedProperty: Property = {
        id: prop.id,
        name: prop.name,
        address: prop.address,
        invoicePrefix: prop.invoicePrefix.toUpperCase(),
        vatRate: prop.vatRate,
        cityTaxRate: prop.cityTaxRate,
        cityTaxMode: prop.cityTaxMode || 'SIMPLE'
      };
      
      validatedProperties.push(validatedProperty);
    }
    
    // Check for duplicate IDs
    const ids = validatedProperties.map(p => p.id);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      return new NextResponse(
        `Duplicate property IDs found: ${duplicateIds.join(', ')}`, 
        { status: 400 }
      );
    }
    
    // Check for duplicate invoice prefixes
    const prefixes = validatedProperties.map(p => p.invoicePrefix);
    const duplicatePrefixes = prefixes.filter((prefix, index) => prefixes.indexOf(prefix) !== index);
    if (duplicatePrefixes.length > 0) {
      return new NextResponse(
        `Duplicate invoice prefixes found: ${duplicatePrefixes.join(', ')}`, 
        { status: 400 }
      );
    }
    
    const updatedSettings = await updateProperties(validatedProperties);
    
    return NextResponse.json({
      success: true,
      properties: updatedSettings.properties,
      count: updatedSettings.properties.length,
      lastUpdated: updatedSettings.metadata.lastUpdated
    });
    
  } catch (error) {
    console.error('Error updating properties:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return new NextResponse(message, { status: 500 });
  }
}