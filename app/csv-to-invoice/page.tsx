'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Property, CSVParseResult } from '@/lib/types'

export default function CsvToInvoice() {
  const [properties, setProperties] = useState<Property[]>([])
  const [selectedProperty, setSelectedProperty] = useState<string>('')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<CSVParseResult | null>(null)
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-600"></div>
      </div>
    )
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Property Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Property *
                </label>
                <select
                  value={selectedProperty}
                  onChange={(e) => setSelectedProperty(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  disabled={properties.length === 0}
                >
                  {properties.length === 0 ? (
                    <option value="">No properties configured</option>
                  ) : (
                    properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))
                  )}
                </select>
                {properties.length === 0 && (
                  <p className="text-xs text-red-500 mt-1">
                    Please <Link href="/settings" className="underline">configure properties</Link> first
                  </p>
                )}
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Guest Data CSV File *
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload CSV with guest information (name, check-in/out dates, amount, etc.)
                </p>
              </div>
            </div>

            {/* File Info */}
            {csvFile && (
              <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
                <h4 className="font-medium text-green-900 mb-2">File Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-green-700">File:</span> {csvFile.name}
                  </div>
                  <div>
                    <span className="text-green-700">Size:</span> {(csvFile.size / 1024).toFixed(1)} KB
                  </div>
                </div>
              </div>
            )}

            {/* Parse Results */}
            {parseResult && (
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2">CSV Parse Results</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-blue-700">Total Rows:</span> {parseResult.totalRows}
                  </div>
                  <div>
                    <span className="text-blue-700">Valid:</span> {parseResult.validRows.length}
                  </div>
                  <div>
                    <span className="text-blue-700">Invalid:</span> {parseResult.invalidRows.length}
                  </div>
                  <div>
                    <span className="text-blue-700">Success Rate:</span> {
                      parseResult.totalRows > 0 
                        ? Math.round((parseResult.validRows.length / parseResult.totalRows) * 100)
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

            {/* Generate Button */}
            <div className="mb-6">
              <button
                onClick={handleGenerateInvoices}
                disabled={!selectedProperty || !parseResult || parseResult.validRows.length === 0 || generating}
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
                    Generate Invoices ZIP
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