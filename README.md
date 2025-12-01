# Invoice Generator for Booking.com CSV Statements

An MVP web application that converts Booking.com monthly CSV reservation statements into individual PDF invoices with automated tax calculations.

## Features

- Upload Booking.com CSV files and generate PDF invoices per reservation
- Company and property settings management
- Automated VAT (10%) and city tax (Ortstaxe 3.2%) calculations
- Invoice numbering with property-specific prefixes
- ZIP download of all invoices with summary CSV report
- Local JSON storage (easily upgradeable to PostgreSQL)

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Install Playwright browsers:**
   ```bash
   npx playwright install chromium
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

### 1. Setup Company & Properties

1. Go to **Settings** page
2. Configure your company details (name, address, tax ID, bank details)
3. Add properties/objects with specific settings:
   - Property name and address
   - Invoice prefix (e.g., "APT01")
   - Tax rates (defaults: VAT 10%, City Tax 3.2%)

### 2. Generate Invoices

1. Go to **Generate Invoices** page
2. Select a property from dropdown
3. Upload your Booking.com CSV file
4. Review the parsed data preview
5. Click "Generate PDFs" to create invoices
6. Download the ZIP file containing all PDFs and summary report

## CSV Format Support

The app supports multiple Booking.com CSV export formats:

### 1. Payout CSV Format (Recommended)
The app automatically detects and optimally processes Booking.com monthly payout CSV files with columns:
- `Reference number` - Booking reference ID
- `Guest name` - Guest name (may be empty for some bookings)
- `Check-in` - Check-in date (e.g., "30 Jun 2025")
- `Checkout` - Check-out date 
- `Amount` - Gross booking amount
- `Currency` - Payment currency
- `Type` - Row type (only "Reservation" rows are processed)
- `Reservation status` - Only "ok" status bookings are processed

**Benefits of Payout CSV:**
- ✅ Automatically filters out refunds/cancellations (negative amounts)
- ✅ Only processes confirmed reservations
- ✅ Optimized parsing for better performance
- ✅ Extracts only necessary columns

### 2. Standard Booking CSV Format
Also supports traditional booking CSV formats with columns:
- `Reservation ID` or `Booking ID`
- `Guest Name` or `Guest`  
- `Check-in Date` or `Arrival`
- `Check-out Date` or `Departure`
- `Amount` or `Gross Amount` or `Total`
- `Currency` (defaults to EUR)
- `Address` or `Guest Address` (optional)
- `Country` (optional)
- `Nights` (optional)

### How to Use Different CSV Formats

**For Payout CSV (Recommended):**
1. Download your monthly payout statement from Booking.com partner portal
2. Upload the CSV file - the app will automatically detect the format
3. Only valid reservations with positive amounts will be processed

**For Standard Booking CSV:**
1. Export reservation data from your booking system
2. The app will fall back to generic parsing if payout format is not detected

**Custom Column Mapping:**
If you have a different CSV format, update the `COLUMN_MAPPINGS` in `lib/csv-parser.ts`:

```typescript
const COLUMN_MAPPINGS = {
  reservationId: ['Reference number', 'Booking ID', 'Your Column Name'],
  guestName: ['Guest name', 'Guest Name', 'Your Guest Column'],
  // Add your column variations here
};
```

**Sample Files:**
- `samples/booking-sample.csv` - Payout format example
- The app automatically handles date formats like "30 Jun 2025"

## Project Structure

```
├── app/                    # Next.js 14 App Router
│   ├── settings/          # Company & property management
│   ├── generate/          # Invoice generation interface
│   └── api/               # Server actions
├── lib/                   # Core business logic
│   ├── storage.ts         # JSON file storage
│   ├── csv-parser.ts      # CSV parsing & validation
│   ├── invoice-generator.ts # PDF generation
│   └── tax-calculator.ts  # Tax calculations
├── templates/             # Invoice HTML templates
├── data/                  # JSON storage files
└── samples/               # Sample CSV files
```

## Invoice Calculation Logic

### Standard Calculation
- **Net Amount**: Gross ÷ 1.10 (removing 10% VAT)
- **VAT Amount**: Net × 0.10
- **City Tax**: Gross × 0.032 (3.2%)
- **Total**: Gross + City Tax

### Invoice Numbering
Format: `{PREFIX}-{YYYY}-{COUNTER}`
- Example: `APT01-2024-001`
- Counter increments per property
- Stored in `data/counters.json`

## Testing

Run the test suite:
```bash
npm test
```

Tests cover:
- Tax calculations
- Invoice numbering
- CSV parsing validation

## Data Storage

The app uses local JSON files for simplicity:
- `data/company.json` - Company settings
- `data/properties.json` - Property configurations  
- `data/counters.json` - Invoice counters per property

To migrate to PostgreSQL later, replace the functions in `lib/storage.ts`.

## Development

### Adding New Tax Calculation Methods

Extend `lib/tax-calculator.ts` with new calculation modes:

```typescript
export type CityTaxMode = 'SIMPLE' | 'VIENNA_METHOD' | 'YOUR_METHOD';
```

### Customizing Invoice Templates

Edit `templates/invoice-template.html` to modify the PDF layout and styling.

## License

MIT License - feel free to use for commercial purposes.