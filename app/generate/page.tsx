'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Property, CSVParseResult } from '@/lib/types'

export default function Generate() {
  const [properties, setProperties] = useState<Property[]>([])
  const [selectedProperty, setSelectedProperty] = useState<string>('')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<CSVParseResult | null>(null)
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  // Booking converter state
  const [bookingCsvFile, setBookingCsvFile] = useState<File | null>(null)
  const [startBelegnr, setStartBelegnr] = useState<number>(2251)
  const [useCommaDecimal, setUseCommaDecimal] = useState<boolean>(true)  // Default to comma for Austrian standard
  const [convertingBooking, setConvertingBooking] = useState(false)
  const [bookingMessage, setBookingMessage] = useState('')

  useEffect(() => {
    loadProperties()
  }, [])

  const loadProperties = async () => {
    try {
      const response = await fetch('/api/properties')
      if (response.ok) {
        const data = await response.json()
        setProperties(data)
        if (data.length > 0) {
          setSelectedProperty(data[0].id)
        }
      }
    } catch (error) {
      console.error('Error loading properties:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      setMessage('Please select a CSV file')
      return
    }

    setCsvFile(file)
    setMessage('Parsing CSV file...')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/parse-csv', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const result = await response.json()
        setParseResult(result)
        setMessage('')
      } else {
        const error = await response.text()
        setMessage(`Error parsing CSV: ${error}`)
        setParseResult(null)
      }
    } catch (error) {
      setMessage('Error uploading file')
      setParseResult(null)
    }
  }

  const handleGenerateInvoices = async () => {
    if (!selectedProperty || !parseResult || parseResult.validRows.length === 0) {
      setMessage('Please select a property and upload a valid CSV file')
      return
    }

    setGenerating(true)
    setMessage('Generating invoices...')

    try {
      const response = await fetch('/api/generate-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: selectedProperty,
          csvRows: parseResult.validRows,
        }),
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.style.display = 'none'
        a.href = url
        a.download = `invoices-${Date.now()}.zip`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        
        setMessage('Invoices generated and downloaded successfully!')
      } else {
        const error = await response.text()
        setMessage(`Error generating invoices: ${error}`)
      }
    } catch (error) {
      setMessage('Error generating invoices')
    } finally {
      setGenerating(false)
    }
  }

  const handleBookingFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setBookingMessage('Please select a CSV file')
      return
    }

    setBookingCsvFile(file)
    setBookingMessage('')
  }

  const convertBookingCSV = async () => {
    if (!bookingCsvFile) {
      setBookingMessage('Please select a file first')
      return
    }

    setConvertingBooking(true)
    setBookingMessage('Converting to accounting format...')

    try {
      const formData = new FormData()
      formData.append('file', bookingCsvFile)
      formData.append('startBelegnr', startBelegnr.toString())
      formData.append('useCommaDecimal', useCommaDecimal.toString())

      const response = await fetch('/api/convert-booking', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        
        const a = document.createElement('a')
        a.style.display = 'none'
        a.href = url
        a.download = `accounting_export_${Date.now()}.csv`
        
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        
        setBookingMessage('Accounting CSV generated and downloaded successfully!')
      } else {
        const error = await response.text()
        setBookingMessage(`Error converting CSV: ${error}`)
      }
    } catch (error) {
      setBookingMessage('Error converting CSV')
    } finally {
      setConvertingBooking(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading properties...</p>
        </div>
      </div>
    )
  }

  if (properties.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Generate Invoices</h1>
                <p className="mt-2 text-gray-600">Convert CSV data to PDF invoices</p>
              </div>
              <Link
                href="/"
                className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-200"
              >
                ← Back to Home
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Properties Configured</h2>
            <p className="text-gray-600 mb-6">
              You need to configure at least one property before generating invoices.
            </p>
            <Link
              href="/settings"
              className="inline-flex items-center bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition duration-200"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Configure Properties
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">CSV Converters</h1>
              <p className="mt-2 text-gray-600">Convert Booking.com exports to invoices and accounting formats</p>
            </div>
            <Link
              href="/"
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-200"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Step 1: Property Selection */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center mb-4">
            <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-semibold mr-3">
              1
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Select Property</h2>
          </div>
          
          <div className="max-w-md">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Property *
            </label>
            <select
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name} ({property.invoicePrefix})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Step 2: CSV Upload */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center mb-4">
            <div className={`rounded-full w-8 h-8 flex items-center justify-center text-sm font-semibold mr-3 ${
              selectedProperty ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-500'
            }`}>
              2
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Upload CSV File</h2>
          </div>

          <div className="max-w-md">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Booking.com CSV Export *
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={!selectedProperty}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
            <p className="text-xs text-gray-500 mt-1">
              Upload your Booking.com monthly CSV statement
            </p>
          </div>

          {csvFile && (
            <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
              <p className="text-sm text-blue-700">
                <strong>File:</strong> {csvFile.name} ({(csvFile.size / 1024).toFixed(1)} KB)
              </p>
            </div>
          )}
        </div>

        {/* Step 3: Preview & Generate */}
        {parseResult && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex items-center mb-4">
              <div className="bg-green-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-semibold mr-3">
                3
              </div>
              <h2 className="text-xl font-semibold text-gray-900">Preview & Generate</h2>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-green-50 p-4 rounded border border-green-200">
                <div className="text-2xl font-bold text-green-600">{parseResult.summary.valid}</div>
                <div className="text-sm text-green-700">Valid Rows</div>
              </div>
              <div className="bg-red-50 p-4 rounded border border-red-200">
                <div className="text-2xl font-bold text-red-600">{parseResult.summary.invalid}</div>
                <div className="text-sm text-red-700">Invalid Rows</div>
              </div>
              <div className="bg-blue-50 p-4 rounded border border-blue-200">
                <div className="text-2xl font-bold text-blue-600">{parseResult.summary.total}</div>
                <div className="text-sm text-blue-700">Total Rows</div>
              </div>
            </div>

            {/* Invalid rows */}
            {parseResult.invalidRows.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-medium text-red-600 mb-3">Invalid Rows</h3>
                <div className="bg-red-50 border border-red-200 rounded p-4 max-h-40 overflow-y-auto">
                  {parseResult.invalidRows.slice(0, 5).map((invalid, index) => (
                    <div key={index} className="text-sm text-red-700 mb-2">
                      <strong>Row {index + 1}:</strong> {invalid.errors.join(', ')}
                    </div>
                  ))}
                  {parseResult.invalidRows.length > 5 && (
                    <p className="text-sm text-red-600">
                      ... and {parseResult.invalidRows.length - 5} more invalid rows
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Valid rows preview */}
            {parseResult.validRows.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-medium text-green-600 mb-3">Valid Rows Preview (First 5)</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reservation ID</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Guest</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Check-in</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Check-out</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {parseResult.validRows.slice(0, 5).map((row, index) => (
                        <tr key={index}>
                          <td className="px-4 py-2 text-sm text-gray-900">{row.reservationId}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{row.guestName}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{row.checkInDate}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{row.checkOutDate}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{row.amountPaidGross} {row.currency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parseResult.validRows.length > 5 && (
                  <p className="text-sm text-gray-600 mt-2">
                    ... and {parseResult.validRows.length - 5} more rows will be processed
                  </p>
                )}
              </div>
            )}

            {/* Generate Button */}
            <div className="flex justify-center">
              <button
                onClick={handleGenerateInvoices}
                disabled={generating || parseResult.validRows.length === 0}
                className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {generating ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Generating PDFs...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Generate {parseResult.validRows.length} PDF Invoices
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        {message && (
          <div className={`p-4 rounded-lg mb-6 ${
            message.includes('Error') || message.includes('error') 
              ? 'bg-red-50 text-red-700 border border-red-200' 
              : message.includes('successfully')
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {message}
          </div>
        )}

        {/* Instructions */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Converter #1: CSV → PDF Invoices</h3>
          <div className="prose prose-sm text-gray-600">
            <ol className="list-decimal list-inside space-y-2">
              <li>Select the property for which you want to generate invoices</li>
              <li>Upload your Booking.com CSV export file</li>
              <li>Review the parsed data and fix any validation errors</li>
              <li>Click "Generate PDF Invoices" to create and download all invoices</li>
              <li>The download will include a ZIP file with all PDFs and a summary CSV</li>
            </ol>
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Make sure your CSV file contains the required columns: 
                Reservation ID, Guest Name, Check-in Date, Check-out Date, and Amount.
              </p>
            </div>
          </div>
        </div>

        {/* Converter #2: Booking to Accounting CSV */}
        <div className="border-t-4 border-blue-600 bg-white rounded-lg shadow p-6">
          <div className="mb-6">
            <h3 className="text-2xl font-semibold text-gray-900 mb-2">Converter #2: Booking → Accounting CSV</h3>
            <p className="text-gray-600">Convert Booking.com reservations export into accounting import format (3 lines per reservation)</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Booking.com Reservations CSV *
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleBookingFileUpload}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Upload CSV with columns: Property name, Location, Booker name, Arrival, Departure, Total payment, Currency, Reservation number
              </p>
              
              {bookingCsvFile && (
                <div className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                  <p className="text-sm text-green-700">
                    <strong>File:</strong> {bookingCsvFile.name} ({(bookingCsvFile.size / 1024).toFixed(1)} KB)
                  </p>
                </div>
              )}
            </div>

            {/* Settings */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Belegnr (Voucher Number)
                </label>
                <input
                  type="number"
                  value={startBelegnr}
                  onChange={(e) => setStartBelegnr(parseInt(e.target.value) || 2251)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="2251"
                />
                <p className="text-xs text-gray-500 mt-1">Starting number for voucher numbering</p>
              </div>

              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={useCommaDecimal}
                    onChange={(e) => setUseCommaDecimal(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Use comma as decimal separator (e.g., 917,34)</span>
                </label>
                <p className="text-xs text-gray-500 mt-1">Austrian accounting standard</p>
              </div>
            </div>
          </div>

          {/* Convert Button */}
          <div className="mb-6">
            <button
              onClick={convertBookingCSV}
              disabled={!bookingCsvFile || convertingBooking}
              className="inline-flex items-center bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition duration-200"
            >
              {convertingBooking ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Converting...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Convert and Download
                </>
              )}
            </button>
          </div>

          {/* Booking Messages */}
          {bookingMessage && (
            <div className={`p-4 rounded-lg mb-6 ${
              bookingMessage.includes('Error') || bookingMessage.includes('error') 
                ? 'bg-red-50 text-red-700 border border-red-200' 
                : bookingMessage.includes('successfully')
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}>
              {bookingMessage}
            </div>
          )}

          {/* Instructions */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Output Format:</h4>
            <div className="text-xs text-gray-600 space-y-2">
              <p><strong>Columns:</strong> konto, belegnr, belegdat, symbol, betrag, steuer, text</p>
              <p><strong>Tax Logic:</strong> netto = brutto ÷ 1.132, then VAT = netto × 10%, City Tax = netto × 3.2%</p>
              <p><strong>Per Reservation:</strong> 3 rows generated (Revenue 200000, Net Revenue 8001 with VAT, City Tax 8003)</p>
              <p><strong>Format:</strong> Semicolon-separated CSV with quoted decimal values for Excel compatibility</p>
              <p><strong>Excel Import:</strong> Use dot separator for best compatibility when importing to Excel</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}