import fs from 'fs/promises';
import path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'settings.json');

export interface Company {
  legalName: string;
  address: string;
  uid?: string;
  email: string;
  phone: string;
  website?: string;
  bankDetails: {
    bankName: string;
    iban: string;
    bic: string;
  };
  invoiceFooter?: string;
}

export interface Property {
  id: string;
  name: string;
  address: string;
  invoicePrefix: string;
  defaultCurrency: string;
  vatRate: number;
  cityTaxRate: number;
  cityTaxHandling: 'SIMPLE' | 'VIENNA_METHOD';
  serviceFee: number;
  active: boolean;
}

export interface TaxRules {
  defaultVatRate: number;
  defaultCityTaxRate: number;
  cityTaxHandlingModes: string[];
  defaultCityTaxHandling: 'SIMPLE' | 'VIENNA_METHOD';
  vatIncludedInGross: boolean;
  cityTaxCollectionMethod: 'ADD_TO_TOTAL' | 'SEPARATE_LINE';
}

export interface Settings {
  company: Company;
  properties: Property[];
  taxRules: TaxRules;
  counters: Record<string, Record<string, number>>; // propertyId -> year -> counter
  metadata: {
    version: string;
    lastUpdated: string;
    createdBy: string;
  };
}

// Ensure data directory exists
async function ensureDataDir(): Promise<void> {
  const dataDir = path.dirname(SETTINGS_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Load settings from JSON file
export async function loadSettings(): Promise<Settings> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // Return default settings if file doesn't exist
    const defaultSettings: Settings = {
      company: {
        legalName: '',
        address: '',
        email: '',
        phone: '',
        bankDetails: {
          bankName: '',
          iban: '',
          bic: ''
        }
      },
      properties: [],
      taxRules: {
        defaultVatRate: 0.10,
        defaultCityTaxRate: 0.032,
        cityTaxHandlingModes: ['SIMPLE', 'VIENNA_METHOD'],
        defaultCityTaxHandling: 'SIMPLE',
        vatIncludedInGross: true,
        cityTaxCollectionMethod: 'ADD_TO_TOTAL'
      },
      counters: {},
      metadata: {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        createdBy: 'invoice-generator-v1'
      }
    };
    
    // Save default settings
    await saveSettings(defaultSettings);
    return defaultSettings;
  }
}

// Save settings to JSON file
export async function saveSettings(settings: Settings): Promise<void> {
  await ensureDataDir();
  
  // Update metadata
  settings.metadata = {
    ...settings.metadata,
    lastUpdated: new Date().toISOString()
  };
  
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// Update only company section
export async function updateCompany(company: Company): Promise<Settings> {
  const settings = await loadSettings();
  settings.company = company;
  await saveSettings(settings);
  return settings;
}

// Update or replace properties array
export async function updateProperties(properties: Property[]): Promise<Settings> {
  const settings = await loadSettings();
  settings.properties = properties;
  await saveSettings(settings);
  return settings;
}

// Update only tax rules section
export async function updateTaxRules(taxRules: TaxRules): Promise<Settings> {
  const settings = await loadSettings();
  settings.taxRules = taxRules;
  await saveSettings(settings);
  return settings;
}

// Increment counter and generate invoice number
export async function incrementCounter(propertyId: string, year?: number): Promise<{
  invoiceNumber: string;
  counter: number;
  property: Property;
}> {
  const settings = await loadSettings();
  
  // Find property
  const property = settings.properties.find(p => p.id === propertyId);
  if (!property) {
    throw new Error(`Property with ID ${propertyId} not found`);
  }
  
  // Use current year if not specified
  const invoiceYear = year || new Date().getFullYear();
  const yearStr = invoiceYear.toString();
  
  // Initialize counter structure if needed
  if (!settings.counters[propertyId]) {
    settings.counters[propertyId] = {};
  }
  
  if (!settings.counters[propertyId][yearStr]) {
    settings.counters[propertyId][yearStr] = 0;
  }
  
  // Increment counter
  settings.counters[propertyId][yearStr]++;
  const counter = settings.counters[propertyId][yearStr];
  
  // Generate invoice number: {prefix}-{YYYY}-{counterPadded}
  const paddedCounter = counter.toString().padStart(6, '0');
  const invoiceNumber = `${property.invoicePrefix}-${yearStr}-${paddedCounter}`;
  
  // Save updated settings
  await saveSettings(settings);
  
  return {
    invoiceNumber,
    counter,
    property
  };
}

// Get property by ID
export async function getProperty(propertyId: string): Promise<Property | null> {
  const settings = await loadSettings();
  return settings.properties.find(p => p.id === propertyId) || null;
}