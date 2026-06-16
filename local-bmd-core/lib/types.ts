import { z } from 'zod';

// Company configuration
export const CompanySchema = z.object({
  legalName: z.string().min(1, 'Legal name is required'),
  address: z.string().min(1, 'Address is required'),
  email: z.string().email('Invalid email format'),
  phone: z.string().min(1, 'Phone is required'),
  taxId: z.string().min(1, 'Tax ID (UID) is required'),
  bankDetails: z.object({
    bankName: z.string().min(1, 'Bank name is required'),
    iban: z.string().min(1, 'IBAN is required'),
    bic: z.string().min(1, 'BIC is required'),
  }),
  footerText: z.string().optional(),
});

export type Company = z.infer<typeof CompanySchema>;

// Property configuration
export const PropertySchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Property name is required'),
  address: z.string().min(1, 'Property address is required'),
  invoicePrefix: z.string().min(1, 'Invoice prefix is required'),
  defaultCurrency: z.string().default('EUR'),
  vatRate: z.number().min(0).max(1).default(0.10), // 10%
  cityTaxRate: z.number().min(0).max(1).default(0.032), // 3.2%
  cityTaxHandling: z.enum(['SIMPLE', 'VIENNA_METHOD']).default('SIMPLE'),
  serviceFee: z.number().min(0).default(0),
  active: z.boolean().default(true),
});

export type Property = z.infer<typeof PropertySchema>;

// CSV row data
export const CSVRowSchema = z.object({
  reservationId: z.string().default('N/A'),
  guestName: z.string().default('Guest'),
  checkInDate: z.string().default(''),
  checkOutDate: z.string().default(''),
  amountPaidGross: z.number().positive('Amount must be positive'),
  currency: z.string().default('EUR'),
  guestAddress: z.string().optional(),
  country: z.string().optional(),
  nights: z.union([z.number(), z.string()]).optional(), // Can be number or string (for BMD-only placeholders)
  invoiceNumber: z.string().optional(), // Custom invoice number from BMD List (belegnr)
  propertyId: z.string().optional(), // Property ID for invoice generation
  warnings: z.array(z.string()).optional(), // Validation warnings and processing notes
  // BMD-only fields for pre-calculated amounts
  amountPaidNet: z.number().optional(),
  vatAmount: z.number().optional(),
  cityTaxAmount: z.number().optional(),
  dataSource: z.string().optional(), // Track source (BMD_ONLY, etc.)
  missingFields: z.array(z.string()).optional(),
  completionStatus: z.string().optional(),
  hasValidProperty: z.boolean().optional(),
});

export type CSVRow = z.infer<typeof CSVRowSchema>;

// Invoice data
export const InvoiceSchema = z.object({
  invoiceNumber: z.string(),
  invoiceDate: z.string(),
  property: PropertySchema,
  company: CompanySchema,
  guest: z.object({
    name: z.string(),
    address: z.string().optional(),
    country: z.string().optional(),
  }),
  service: z.object({
    description: z.string(),
    period: z.string(),
    checkInDate: z.string(),
    checkOutDate: z.string(),
    nights: z.number().optional(),
  }),
  amounts: z.object({
    netAmount: z.number(),
    vatAmount: z.number(),
    grossAmount: z.number(),
    cityTaxAmount: z.number(),
    totalAmount: z.number(),
    currency: z.string(),
  }),
  reservationId: z.string(),
});

export type Invoice = z.infer<typeof InvoiceSchema>;

// Parsed CSV result
export type CSVParseResult = {
  validRows: CSVRow[];
  invalidRows: { row: any; errors: string[] }[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
  };
};

// Invoice generation result
export type InvoiceGenerationResult = {
  success: boolean;
  invoices: Invoice[];
  errors: string[];
  zipBuffer?: Buffer;
  combinedPdfBuffer?: Buffer;
  summaryCSV?: string;
  filename?: string;
};