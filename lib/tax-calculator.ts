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
  // New tax logic: Gross amount from Booking.com already includes both VAT and City Tax
  // Both taxes are calculated as percentages of the net amount (not gross)
  
  // 1) Compute Netto: netto = brutto / (1 + cityTaxRate + vatRate)
  const netAmount = grossAmount / (1 + cityTaxRate + vatRate);
  
  // 2) Compute City Tax: ortstaxe = netto * cityTaxRate
  const cityTaxAmount = netAmount * cityTaxRate;
  
  // 3) Compute VAT: vat = netto * vatRate
  const vatAmount = netAmount * vatRate;
  
  // 4) Recalculate Gross (check): gross = netto + ortstaxe + vat
  // This should equal the original grossAmount
  const totalAmount = netAmount + cityTaxAmount + vatAmount;

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