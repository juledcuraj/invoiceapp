'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Property } from '@/lib/types'

export default function BookingToAccounting() {
  const [bookingCsvFiles, setBookingCsvFiles] = useState<File[]>([])
  const [airbnbCsvFile, setAirbnbCsvFile] = useState<File | null>(null)
  const [targetMonth, setTargetMonth] = useState<string>('')  // Format: YYYY-MM
  const [startBelegnr, setStartBelegnr] = useState<number>(2251)
  const [useCommaDecimal, setUseCommaDecimal] = useState<boolean>(true)  // Default to comma for Austrian standard
  const [selectedProperty, setSelectedProperty] = useState<string>('') // Property selection (prefix)
  const [convertingBooking, setConvertingBooking] = useState(false)
  const [bookingMessage, setBookingMessage] = useState('')
  const [properties, setProperties] = useState<Property[]>([])
  const [loadingProperties, setLoadingProperties] = useState(true)

  useEffect(() => {
    loadProperties()
  }, [])

  const loadProperties = async () => {
    try {
      const response = await fetch('/api/properties')
      if (response.ok) {
        const propertiesData = await response.json()
        setProperties(propertiesData)
      } else {
        console.error('Failed to load properties')
      }
    } catch (error) {
      console.error('Error loading properties:', error)
    } finally {
      setLoadingProperties(false)
    }
  }

  const handleBookingFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const csvFiles = Array.from(files).filter(file => file.name.toLowerCase().endsWith('.csv'))
    
    if (csvFiles.length === 0) {
      setBookingMessage('Please select CSV files only')
      return
    }

    if (csvFiles.length !== files.length) {
      setBookingMessage('Some files were skipped (only CSV files are accepted)')
    }

    setBookingCsvFiles(csvFiles)
    setBookingMessage('')
  }

  const handleAirbnbFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setBookingMessage('Please select a CSV file')
      return
    }

    setAirbnbCsvFile(file)
    setBookingMessage('')
  }

  const convertBookingCSV = async () => {
    if (bookingCsvFiles.length === 0 && !airbnbCsvFile) {
      setBookingMessage('Please select at least one CSV file (Booking.com or Airbnb)')
      return
    }

    if (!selectedProperty) {
      setBookingMessage('Please select a property prefix')
      return
    }

    if (bookingCsvFiles.length > 0 && !targetMonth) {
      setBookingMessage('Please select a target month when uploading Booking.com files')
      return
    }

    setConvertingBooking(true)
    setBookingMessage('Converting to accounting format...')

    try {
      const formData = new FormData()
      
      // Add multiple booking files
      bookingCsvFiles.forEach((file, index) => {
        formData.append(`bookingFile_${index}`, file)
      })
      
      if (airbnbCsvFile) {
        formData.append('airbnbFile', airbnbCsvFile)
      }
      
      if (targetMonth) {
        formData.append('targetMonth', targetMonth)
      }
      
      formData.append('startBelegnr', startBelegnr.toString())
      formData.append('useCommaDecimal', useCommaDecimal.toString())
      formData.append('selectedProperty', selectedProperty)

      const response = await fetch('/api/convert-booking', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        
        // Extract filename from Content-Disposition header
        const contentDisposition = response.headers.get('Content-Disposition')
        let filename = `accounting_export_${Date.now()}.csv` // fallback
        
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="([^"]+)"/)
          if (filenameMatch) {
            filename = filenameMatch[1]
          }
        }
        
        const a = document.createElement('a')
        a.style.display = 'none'
        a.href = url
        a.download = filename
        
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Accounting Converter: Booking + Airbnb → Accounting CSV</h1>
              <p className="text-gray-600 mt-2">Convert reservations to accounting import format (3 lines per reservation, sorted by departure date)</p>
            </div>
            <Link 
              href="/"
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">

          {/* Converter #2: Booking to Accounting CSV */}
          <div className="border-t-4 border-blue-600 bg-white rounded-lg shadow p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {/* Booking.com File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Booking.com Payout CSV Files
                </label>
                <input
                  type="file"
                  accept=".csv"
                  multiple
                  onChange={handleBookingFileUpload}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload multiple payout CSV files (month_payouts-2025-XX.csv format)
                </p>
                
                {/* Target Month Selection */}
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Month (for filtering)
                  </label>
                  <input
                    type="month"
                    value={targetMonth}
                    onChange={(e) => setTargetMonth(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="2025-07"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Only reservations with checkout in this month will be included
                  </p>
                </div>
                
                {bookingCsvFiles.length > 0 && (
                  <div className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                    <p className="text-sm text-green-700">
                      <strong>Booking Files ({bookingCsvFiles.length}):</strong>
                    </p>
                    <ul className="text-xs text-green-600 mt-1">
                      {bookingCsvFiles.map((file, index) => (
                        <li key={index}>• {file.name} ({(file.size / 1024).toFixed(1)} KB)</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Airbnb File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Airbnb Reservations CSV
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleAirbnbFileUpload}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload Airbnb CSV export
                </p>
                
                {airbnbCsvFile && (
                  <div className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                    <p className="text-sm text-green-700">
                      <strong>Airbnb:</strong> {airbnbCsvFile.name} ({(airbnbCsvFile.size / 1024).toFixed(1)} KB)
                    </p>
                  </div>
                )}
              </div>

              {/* Settings */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Property *
                  </label>
                  <select
                    value={selectedProperty}
                    onChange={(e) => setSelectedProperty(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={loadingProperties}
                  >
                    <option value="">{loadingProperties ? 'Loading properties...' : 'Select property...'}</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.invoicePrefix}>
                        {property.name} ({property.invoicePrefix})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Choose the property for all reservations in the CSV</p>
                </div>

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
                disabled={(bookingCsvFiles.length === 0 && !airbnbCsvFile) || !selectedProperty || convertingBooking}
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
                    Convert & Merge Files
                  </>
                )}
              </button>
            </div>

            {/* Messages */}
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
              <h4 className="text-sm font-medium text-gray-900 mb-3">How It Works:</h4>
              <div className="text-xs text-gray-600 space-y-2">
                <p><strong>Booking.com Processing:</strong> Upload multiple payout CSV files (month_payouts-2025-XX.csv format). Select target month to filter reservations by checkout date. Files will be merged and sorted by checkout date.</p>
                <p><strong>Airbnb Processing:</strong> Upload single Airbnb CSV file as before (no filtering applied).</p>
                <p><strong>Property Mapping:</strong> Both Booking.com and Airbnb properties are mapped to codes (BEGA, WAFG, LAS, KRA, BM, KLIE, LAMM, ZIMM)</p>
                <p><strong>Source Identification:</strong> Text field ends with &quot;Booking.com&quot; or &quot;AirBnB&quot; to identify the source</p>
                <p><strong>Output Format:</strong> konto, belegnr, belegdat, symbol, betrag, steuer, text</p>
                <p><strong>Tax Calculation:</strong> netto = brutto ÷ 1.132, VAT = netto × 10%, City Tax = netto × 3.2%</p>
                <p><strong>Per Reservation:</strong> 3 rows (Revenue 200000, Net Revenue 8001 with VAT, City Tax 8003)</p>
              </div>
              
              <div className="mt-4 pt-3 border-t border-gray-200">
                <h5 className="text-sm font-medium text-gray-900 mb-2">Property Code Mapping:</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-600">
                  <div>
                    <p><strong>Booking.com:</strong></p>
                    {loadingProperties ? (
                      <div className="text-xs text-gray-500 mt-1">Loading property mappings...</div>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {properties.map((property) => (
                          <li key={property.id}>• {property.name} → {property.invoicePrefix}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p><strong>Airbnb:</strong></p>
                    <ul className="mt-1 space-y-1">
                      <li>• Property name will be detected from CSV and mapped to prefix</li>
                      <li>• Output uses prefix (e.g., KLIE) not full name</li>
                      <li>• Text column format: &quot;&#123;belegnr&#125; &#123;prefix&#125; &#123;reservationNumber&#125; &#123;guestName&#125; Booking.com&quot;</li>
                      <li>• Example: &quot;2251 KLIE 6903494474 John Doe Booking.com&quot;</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}