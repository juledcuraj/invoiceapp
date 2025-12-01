export type CityTaxMode = 'SIMPLE' | 'VIENNA_METHOD';

export interface TaxCalculation {
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  cityTaxAmount: number;
  totalAmount: number;
}

export function calculateTaxes(
  grossAmount: number,
  vatRate: number = 0.10,
  cityTaxRate: number = 0.032,
  cityTaxMode: CityTaxMode = 'SIMPLE'
): TaxCalculation {
  // Calculate net amount (remove VAT from gross)
  const netAmount = grossAmount / (1 + vatRate);
  const vatAmount = grossAmount - netAmount;

  // Calculate city tax
  let cityTaxAmount: number;
  
  switch (cityTaxMode) {
    case 'SIMPLE':
      // Simple mode: city tax as percentage of gross amount
      cityTaxAmount = grossAmount * cityTaxRate;
      break;
    case 'VIENNA_METHOD':
      // Vienna method: city tax based on net amount
      cityTaxAmount = netAmount * cityTaxRate;
      break;
    default:
      cityTaxAmount = grossAmount * cityTaxRate;
  }

  const totalAmount = grossAmount + cityTaxAmount;

  return {
    netAmount: Math.round(netAmount * 100) / 100,
    vatAmount: Math.round(vatAmount * 100) / 100,
    grossAmount: Math.round(grossAmount * 100) / 100,
    cityTaxAmount: Math.round(cityTaxAmount * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
  };
}

export function formatCurrency(amount: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}