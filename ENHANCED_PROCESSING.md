# Enhanced Invoice Data Processing System

## Overview

The invoice generation system has been significantly improved to correctly handle the BMD CSV structure and provide better data processing, validation, and merging capabilities.

## 🔴 Critical Issue Fixed

**Problem**: The original system incorrectly treated BMD CSV as row-based invoices, but BMD CSV is actually an accounting export containing multiple entries per transaction with different account codes.

**Solution**: Complete rewrite of the data processing layer with proper understanding of BMD structure as accounting entries, not individual invoices.

## Key Improvements

### 1. Enhanced BMD Parser (`lib/bmd-parser.ts`)
- **Correct BMD Understanding**: Processes BMD as accounting entries (konto 200000 = revenue)
- **Improved CSV Parsing**: Better handling of European decimal format, quoted fields, and multiple delimiters
- **Smart Text Field Parsing**: Extracts reservation numbers, guest names, property codes, and platforms from BMD text fields
- **Data Validation**: Comprehensive validation of BMD structure and content
- **Error Reporting**: Detailed parsing statistics and error reporting

### 2. Enhanced Reservations Parser (`lib/reservations-parser.ts`)  
- **Flexible Column Mapping**: Supports multiple CSV export formats from different platforms
- **Better Date Parsing**: Handles various date formats (ISO, European, etc.)
- **Property Detection**: Automatically detects property codes from property names
- **Multi-line Field Support**: Proper handling of quoted fields spanning multiple lines
- **Validation**: Data quality validation with detailed error reporting

### 3. Intelligent Data Merger (`lib/invoice-data-merger.ts`)
- **Multiple Matching Strategies**: 
  - Direct reservation number matching (95% confidence)
  - Fuzzy matching by amount, dates, and property (70%+ confidence)  
  - BMD-only entries when no reservation data available (60% confidence)
- **Confidence Scoring**: Every merge gets a confidence score for quality assessment
- **Smart Property Mapping**: Handles property detection and mapping
- **Comprehensive Validation**: Cross-validates amounts, dates, and properties

### 4. Enhanced Processing Service (`lib/enhanced-invoice-processor.ts`)
- **High-Level API**: Simple interface for complete CSV processing
- **Configurable Options**: Control validation, matching strategies, confidence thresholds
- **Quality Metrics**: Detailed statistics on processing quality and match confidence
- **Comprehensive Reporting**: Detailed processing reports for debugging and analysis

## Usage

### Basic Usage
The enhanced system is automatically used through the existing API endpoints. No changes required for basic functionality.

### Advanced Usage
For maximum control and reporting, use the enhanced processor directly:

```typescript
import { EnhancedInvoiceDataProcessor } from '@/lib/enhanced-invoice-processor';

const processor = new EnhancedInvoiceDataProcessor({
  validateData: true,
  minimumConfidence: 70,
  includeBMDOnly: true,
  enableFuzzyMatching: true,
});

const result = await processor.processDualCSV(bmdContent, reservationsContent);
console.log(processor.generateProcessingReport(result));
```

### API Enhancement
Add `enhanced=true` to form data for comprehensive processing:

```javascript
const formData = new FormData();
formData.append('bmdFile', bmdFile);
formData.append('reservationsFile', reservationsFile);
formData.append('enhanced', 'true'); // Use enhanced processor
```

## BMD CSV Structure Understanding

### What BMD CSV Contains
- **Multiple accounting entries per transaction** (not individual invoices)
- **Account codes (konto)**:
  - `200000`: Revenue entries (what we need for invoices)
  - `8001`, `8003`: Other entries (filtered out)
- **Text fields with embedded data**: Contains reservation numbers, guest names, property info, platform details

### How the Enhanced System Processes BMD
1. **Parse all accounting entries** with proper CSV handling
2. **Filter revenue entries** (konto = 200000)  
3. **Extract structured data** from text fields using pattern matching
4. **Group by invoice number** (belegnr) and accumulate amounts
5. **Validate data quality** and report issues

## Configuration Options

### ProcessingOptions
- `validateData`: Enable/disable data validation (default: true)
- `allowPartialMatches`: Allow partial matches (default: true)  
- `minimumConfidence`: Minimum confidence threshold (default: 60)
- `includeBMDOnly`: Include entries with only BMD data (default: true)
- `enableFuzzyMatching`: Enable fuzzy matching algorithms (default: true)

## Quality Metrics

### Confidence Levels
- **90%+**: High confidence (direct matches with validation)
- **70-89%**: Medium confidence (fuzzy matches)  
- **<70%**: Low confidence (BMD-only or poor matches)

### Match Types
- **DIRECT_MATCH**: Exact reservation number match
- **FUZZY_MATCH**: Matched by amount, dates, and other factors
- **BMD_ONLY**: Only BMD data available, no reservation match
- **SEQUENTIAL_FALLBACK**: Last resort sequential pairing (deprecated)

## Error Handling

### Common Issues and Solutions
1. **"No valid BMD invoices found"**: Check BMD CSV format, ensure it contains konto 200000 entries
2. **"Missing expected columns"**: Verify CSV has required columns (konto, belegnr, belegdat, betrag, text)
3. **Low confidence matches**: Review property mapping and reservation number extraction logic
4. **European decimal format errors**: System handles comma decimal separators automatically

## Backwards Compatibility

The enhanced system maintains full backwards compatibility with existing:
- API endpoints
- Response formats  
- Invoice generation process
- UI components

## Performance

### Improvements
- **Reduced memory usage**: Streaming CSV parsing
- **Better error recovery**: Continue processing on individual row errors
- **Detailed logging**: Comprehensive debug information
- **Optimized matching**: Efficient algorithms for large datasets

## Migration Notes

No migration required - the enhanced system is a drop-in replacement with improved:
- ✅ Correct BMD structure understanding
- ✅ Better CSV parsing and validation  
- ✅ Intelligent data merging
- ✅ Comprehensive error reporting
- ✅ Quality metrics and confidence scoring
- ✅ Configurable processing options