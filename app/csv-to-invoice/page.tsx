'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Property, CSVParseResult } from '@/lib/types'

export default function CsvToInvoice() {
  const [bmdFile, setBmdFile] = useState<File | null>(null)
  const [reservationsFile, setReservationsFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<CSVParseResult | null>(null)
  const [downloadFormat, setDownloadFormat] = useState<'combined' | 'zip'>('combined')
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState('')



  const handleBmdFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('BMD file upload triggered')
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      setMessage('Please select a CSV file')
      return
    }

    console.log('BMD file selected:', file.name)
    setBmdFile(file)
    setMessage('')
    
    // Parse if both files are ready
    if (reservationsFile) {
      console.log('Both files ready, parsing...')
      parseFiles(file, reservationsFile)
    }
  }

  const handleReservationsFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('Reservations file upload triggered')
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      setMessage('Please select a CSV file')
      return
    }

    console.log('Reservations file selected:', file.name)
    setReservationsFile(file)
    setMessage('')
    
    // Parse if both files are ready
    if (bmdFile) {
      console.log('Both files ready, parsing...')
      parseFiles(bmdFile, file)
    }
  }

  const parseFiles = async (bmdFile: File, reservationsFile: File) => {
    console.log('parseFiles called with:', bmdFile?.name, reservationsFile?.name)
    setMessage('Parsing CSV files...')

    try {
      const formData = new FormData()
      formData.append('bmdFile', bmdFile)
      formData.append('reservationsFile', reservationsFile)
      
      console.log('FormData created, making API call...')

      const response = await fetch('/api/parse-dual-csv', {
        method: 'POST',
        body: formData,
      })
      
      console.log('API response status:', response.status)

      if (response.ok) {
        const result = await response.json()
        console.log('API response result:', result)
        setParseResult(result)
        setMessage('')
      } else {
        const error = await response.text()
        console.error('API error response:', error)
        setMessage(`Error parsing CSV files: ${error}`)
        setParseResult(null)
      }
    } catch (error) {
      console.error('Fetch error:', error)
      setMessage('Error uploading files: ' + (error instanceof Error ? error.message : 'Unknown error'))
      setParseResult(null)
    }
  }

  const handleGenerateInvoices = async () => {
    if (!bmdFile || !reservationsFile || !parseResult || parseResult.validRows.length === 0) {
      setMessage('Please upload both CSV files and wait for parsing to complete')
      return
    }

    setGenerating(true)
    setMessage('Generating invoices...')

    try {
      const response = await fetch('/api/generate-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvRows: parseResult.validRows,
          format: downloadFormat,
        }),
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.style.display = 'none'
        a.href = url
        
        // Extract filename from Content-Disposition header
        const contentDisposition = response.headers.get('Content-Disposition')
        let filename = downloadFormat === 'combined' ? 'all-invoices.pdf' : 'invoices.zip'
        
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="([^"]+)"/)
          if (filenameMatch) {
            filename = filenameMatch[1]
          }
        }
        
        a.download = filename
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



  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Converter #1: CSV → Invoice PDF</h1>
              <p className="text-gray-600 mt-2">Generate professional PDF invoices from guest data CSV</p>
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
          
          {/* Converter #1: CSV to Invoice PDF */}
          <div className="border-t-4 border-green-600 bg-white rounded-lg shadow p-6">
            <div className="mb-6">
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2">📋 How it works:</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• <strong>BMD List:</strong> Provides invoice numbers, amounts, and property information</li>
                  <li>• <strong>Reservations CSV:</strong> Provides guest info, dates, and reservation details</li>
                  <li>• <strong>Matching:</strong> Files are paired sequentially by order</li>
                  <li>• <strong>Property Detection:</strong> Properties are extracted from BMD text column</li>
                </ul>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* BMD List File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  BMD List CSV File *
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleBmdFileUpload}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload BMD List CSV (contains beleg numbers for invoice numbering)
                </p>
              </div>

              {/* Reservations File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reservations CSV File *
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleReservationsFileUpload}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload Reservations CSV (contains guest information, dates, amounts, etc.)
                </p>
              </div>
              </div>
            </div>

            {/* File Info */}
            {(bmdFile || reservationsFile) && (
              <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
                <h4 className="font-medium text-green-900 mb-2">Files Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {bmdFile && (
                    <div className="p-2 bg-white rounded border">
                      <div><span className="text-green-700">BMD File:</span> {bmdFile.name}</div>
                      <div><span className="text-green-700">Size:</span> {(bmdFile.size / 1024).toFixed(1)} KB</div>
                    </div>
                  )}
                  {reservationsFile && (
                    <div className="p-2 bg-white rounded border">
                      <div><span className="text-green-700">Reservations File:</span> {reservationsFile.name}</div>
                      <div><span className="text-green-700">Size:</span> {(reservationsFile.size / 1024).toFixed(1)} KB</div>
                    </div>
                  )}
                </div>
                {bmdFile && reservationsFile && (
                  <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                    <p className="text-xs text-blue-700">
                      ✅ Both files uploaded - Ready to generate invoices
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Parse Results */}
            {parseResult && (
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2">CSV Parse Results</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-blue-700">Total Rows:</span> {parseResult.summary.total}
                  </div>
                  <div>
                    <span className="text-blue-700">Valid:</span> {parseResult.validRows.length}
                  </div>
                  <div>
                    <span className="text-blue-700">Invalid:</span> {parseResult.invalidRows.length}
                  </div>
                  <div>
                    <span className="text-blue-700">Success Rate:</span> {
                      parseResult.summary.total > 0 
                        ? Math.round((parseResult.validRows.length / parseResult.summary.total) * 100)
                        : 0
                    }%
                  </div>
                </div>
                {parseResult.invalidRows.length > 0 && (
                  <div className="mt-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                    <p className="text-xs text-yellow-700">
                      <strong>Note:</strong> {parseResult.invalidRows.length} rows were skipped due to missing or invalid data
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Download Format Choice */}
            {parseResult && parseResult.validRows.length > 0 && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Download Format:</h4>
                <div className="space-y-3">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="downloadFormat"
                      value="combined"
                      checked={downloadFormat === 'combined'}
                      onChange={(e) => setDownloadFormat(e.target.value as 'combined' | 'zip')}
                      className="mr-3 text-green-600"
                    />
                    <div>
                      <div className="font-medium text-gray-900">Single PDF File</div>
                      <div className="text-sm text-gray-600">Download one PDF with all invoices combined</div>
                    </div>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="downloadFormat"
                      value="zip"
                      checked={downloadFormat === 'zip'}
                      onChange={(e) => setDownloadFormat(e.target.value as 'combined' | 'zip')}
                      className="mr-3 text-green-600"
                    />
                    <div>
                      <div className="font-medium text-gray-900">ZIP Archive</div>
                      <div className="text-sm text-gray-600">Download ZIP with individual PDFs + combined PDF + CSV summary</div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Generate Button */}
            <div className="mb-6">
              <button
                onClick={handleGenerateInvoices}
                disabled={!bmdFile || !reservationsFile || !parseResult || parseResult.validRows.length === 0 || generating}
                className="inline-flex items-center bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition duration-200"
              >
                {generating ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generating PDFs...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {downloadFormat === 'combined' ? 'Generate Combined PDF' : 'Generate Invoices ZIP'}
                  </>
                )}
              </button>
            </div>

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
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3">How It Works:</h4>
              <div className="text-xs text-gray-600 space-y-2">
                <p><strong>Step 1:</strong> Configure your property settings (company info, logo, details)</p>
                <p><strong>Step 2:</strong> Upload CSV with guest data (name, dates, amounts, etc.)</p>
                <p><strong>Step 3:</strong> System parses and validates the data automatically</p>
                <p><strong>Step 4:</strong> Generate professional PDF invoices with tax calculations</p>
                <p><strong>Output:</strong> ZIP file containing individual PDF invoices + summary report</p>
                <p><strong>Invoice Date:</strong> Uses checkout date from CSV data for accurate billing</p>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}