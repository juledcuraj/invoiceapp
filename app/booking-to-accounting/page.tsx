'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Property } from '@/lib/types'

interface PropertyUpload {
  files: File[]
  isReady: boolean
}

export default function BookingToAccounting() {
  const [propertyUploads, setPropertyUploads] = useState<Record<string, PropertyUpload>>({})
  const [airbnbCsvFile, setAirbnbCsvFile] = useState<File | null>(null)
  const [targetMonth, setTargetMonth] = useState<string>('')
  const [startBelegnr, setStartBelegnr] = useState<number>(2251)
  const [useCommaDecimal, setUseCommaDecimal] = useState<boolean>(true)
  const [mergingAll, setMergingAll] = useState(false)
  const [allListsReady, setAllListsReady] = useState(false)
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

  const handlePropertyFileUpload = (propertyPrefix: string, event: React.ChangeEvent<HTMLInputElement>) => {
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

    setPropertyUploads(prev => ({
      ...prev,
      [propertyPrefix]: {
        ...prev[propertyPrefix],
        files: csvFiles,
        isReady: csvFiles.length > 0
      }
    }))
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

  const mergeAllLists = async () => {
    const readyUploads = Object.entries(propertyUploads).filter(([_, upload]) => upload.isReady)
    
    if (readyUploads.length === 0 && !airbnbCsvFile) {
      setBookingMessage('Please prepare at least one property list or upload an Airbnb CSV')
      return
    }

    if (!targetMonth) {
      setBookingMessage('Please select a target month for filtering reservations')
      return
    }

    setMergingAll(true)
    setBookingMessage('Merging all property lists and generating accounting CSV...')

    try {
      const formData = new FormData()
      
      // Add files from each ready property
      readyUploads.forEach(([propertyPrefix, upload], propertyIndex) => {
        upload.files.forEach((file, fileIndex) => {
          formData.append(`bookingFile_${propertyIndex}_${fileIndex}`, file)
        })
        formData.append(`property_${propertyIndex}`, propertyPrefix)
      })
      
      // Add global target month
      formData.append('targetMonth', targetMonth)
      
      if (airbnbCsvFile) {
        formData.append('airbnbFile', airbnbCsvFile)
      }
      
      formData.append('startBelegnr', startBelegnr.toString())
      formData.append('useCommaDecimal', useCommaDecimal.toString())
      formData.append('propertyCount', readyUploads.length.toString())

      const response = await fetch('/api/convert-booking', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        
        const contentDisposition = response.headers.get('Content-Disposition')
        let filename = `merged_accounting_export_${Date.now()}.csv`
        
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
        
        setBookingMessage(`Merged accounting CSV with ${readyUploads.length} properties generated successfully!`)
        setAllListsReady(true)
      } else {
        const error = await response.text()
        setBookingMessage(`Error merging lists: ${error}`)
      }
    } catch (error) {
      setBookingMessage('Error merging property lists')
    } finally {
      setMergingAll(false)
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

          {/* Global Settings Section */}
          <div className="bg-white p-6 rounded-lg shadow-md mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">
              Global Settings (applies to all properties)
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Month *
                </label>
                <input
                  type="month"
                  value={targetMonth}
                  onChange={(e) => setTargetMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="2025-07"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Only reservations with checkout in this month will be included from all files
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Belegnr (Voucher Number) *
                </label>
                <input
                  type="number"
                  value={startBelegnr}
                  onChange={(e) => setStartBelegnr(parseInt(e.target.value) || 2251)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="2251"
                />
                <p className="text-xs text-gray-500 mt-1">Starting number for voucher numbering (shared for Booking + Airbnb)</p>
              </div>
              
              <div>
                <label className="flex items-center space-x-2 mt-6">
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

          {/* Booking.com Properties Section */}
          <div className="mb-6">
            <h2 className="text-2xl font-semibold mb-4 text-blue-600">
              Booking.com Reservations by Property
            </h2>

            <div className="space-y-6">
              {properties.map((property) => (
                <div key={property.invoicePrefix} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-gray-900">
                      {property.invoicePrefix}: {property.name}
                    </h3>
                    {propertyUploads[property.invoicePrefix]?.isReady && (
                      <span className="flex items-center text-green-600">
                        <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Ready
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Upload CSV files for {property.invoicePrefix}:
                      </label>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => handlePropertyFileUpload(property.invoicePrefix, e)}
                        multiple
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Upload multiple CSV files - reservations will be filtered by the global target month
                      </p>
                      {propertyUploads[property.invoicePrefix]?.files && propertyUploads[property.invoicePrefix].files.length > 0 && (
                        <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                          <p className="text-sm text-blue-700">
                            <strong>{propertyUploads[property.invoicePrefix].files.length} file(s):</strong>
                          </p>
                          <ul className="text-xs text-blue-600 mt-1">
                            {propertyUploads[property.invoicePrefix].files.map((file, index) => (
                              <li key={index}>• {file.name} ({(file.size / 1024).toFixed(1)} KB)</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Merge All Button */}
              {Object.values(propertyUploads).some(upload => upload.isReady) && targetMonth && (
                <div className="text-center pt-4 border-t border-gray-200">
                  <button
                    onClick={mergeAllLists}
                    disabled={mergingAll}
                    className="bg-green-600 text-white px-8 py-4 rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-medium text-lg"
                  >
                    {mergingAll ? 'Merging All Properties...' : `Generate Combined Accounting CSV for ${targetMonth}`}
                  </button>
                  <p className="text-sm text-gray-600 mt-2">
                    This will merge all ready property lists into one accounting CSV, filtering reservations for {targetMonth}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Airbnb Section (Optional) */}
          <div className="border-t-4 border-purple-600 bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4 text-purple-600">
              Airbnb Reservations (Optional)
            </h2>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Airbnb Reservations CSV
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleAirbnbFileUpload}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Upload Airbnb CSV export (will use same target month and start belegnr as set above)
              </p>
              
              {airbnbCsvFile && (
                <div className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                  <p className="text-sm text-green-700">
                    <strong>Airbnb:</strong> {airbnbCsvFile.name} ({(airbnbCsvFile.size / 1024).toFixed(1)} KB)
                  </p>
                </div>
              )}
            </div>
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
              <p><strong>Global Settings:</strong> Set one target month and start belegnr that applies to all properties and platforms (Booking.com + Airbnb).</p>
              <p><strong>Property Uploads:</strong> Upload multiple CSV files per property. The system will extract only reservations from the specified target month.</p>
              <p><strong>Airbnb Processing:</strong> Upload single Airbnb CSV file - same target month filtering and belegnr sequence applies.</p>
              <p><strong>Month Filtering:</strong> All uploaded files (multiple per property) will be filtered to only include reservations with checkout dates in the target month.</p>
              <p><strong>Voucher Numbering:</strong> Sequential numbering starts from the specified belegnr and continues across all properties and platforms.</p>
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
                    <li>• Text column format: &quot;(belegnr) (prefix) (reservationNumber) (guestName) Booking.com&quot;</li>
                    <li>• Example: &quot;2251 KLIE 6903494474 John Doe Booking.com&quot;</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}