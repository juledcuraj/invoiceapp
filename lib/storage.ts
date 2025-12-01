import fs from 'fs/promises';
import path from 'path';
import { Company, Property } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const COMPANY_FILE = path.join(DATA_DIR, 'company.json');
const PROPERTIES_FILE = path.join(DATA_DIR, 'properties.json');
const COUNTERS_FILE = path.join(DATA_DIR, 'counters.json');

// Ensure data directory exists
async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Company storage
export async function getCompany(): Promise<Company | null> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(COMPANY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function saveCompany(company: Company): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(COMPANY_FILE, JSON.stringify(company, null, 2));
}

// Properties storage
export async function getProperties(): Promise<Property[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(PROPERTIES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveProperties(properties: Property[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(PROPERTIES_FILE, JSON.stringify(properties, null, 2));
}

export async function getProperty(id: string): Promise<Property | null> {
  const properties = await getProperties();
  return properties.find(p => p.id === id) || null;
}

export async function addProperty(property: Property): Promise<void> {
  const properties = await getProperties();
  properties.push(property);
  await saveProperties(properties);
}

export async function updateProperty(id: string, updates: Partial<Property>): Promise<void> {
  const properties = await getProperties();
  const index = properties.findIndex(p => p.id === id);
  if (index !== -1) {
    properties[index] = { ...properties[index], ...updates };
    await saveProperties(properties);
  }
}

export async function deleteProperty(id: string): Promise<void> {
  const properties = await getProperties();
  const filtered = properties.filter(p => p.id !== id);
  await saveProperties(filtered);
}

// Invoice counters storage
type Counters = Record<string, number>;

export async function getCounters(): Promise<Counters> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(COUNTERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export async function saveCounters(counters: Counters): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(COUNTERS_FILE, JSON.stringify(counters, null, 2));
}

export async function getNextInvoiceNumber(propertyId: string): Promise<string> {
  const counters = await getCounters();
  const property = await getProperty(propertyId);
  
  if (!property) {
    throw new Error(`Property ${propertyId} not found`);
  }

  const currentYear = new Date().getFullYear();
  const counterKey = `${propertyId}-${currentYear}`;
  const currentCounter = counters[counterKey] || 0;
  const nextCounter = currentCounter + 1;

  // Update counter
  counters[counterKey] = nextCounter;
  await saveCounters(counters);

  // Format: PREFIX-YYYY-NNN
  const paddedCounter = nextCounter.toString().padStart(3, '0');
  return `${property.invoicePrefix}-${currentYear}-${paddedCounter}`;
}