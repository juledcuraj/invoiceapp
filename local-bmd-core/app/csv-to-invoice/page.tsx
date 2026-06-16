'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Property } from '@/lib/types'

// Updated interface for enhanced processor response
interface EnhancedProcessingResult {
  success: boolean;
  data: any[]; // invoice rows
  processingStats: {
    bmdInvoicesFound: number;
    bmdInvoicesValid: number;
    reservationsFound: number;
    reservationsValid: number;
    finalMergedCount: number;
    directMatches: number;
    conservativeEntries: number;
  };
  monthlyBreakdown: Record<string, any>;
  crossMonthStats: any;
  qualityMetrics: any;
  // Enhanced validation feedback
  validationResult?: {
    validMatches: any[];
    partialMatches: any[];
    invalidMatches: any[];
    unmatchedBMDInvoices: any[];
    unmatchedReservations: any[];
    summary: {
      totalBMDInvoices: number;
      totalReservations: number;
      successfulMatches: number;
      partialMatches: number;
      invalidMatches: number;
      unmatchedBMD: number;
      unmatchedReservations: number;
      invoiceableRecords: number;
    };
    feedback: {
      successMessages: string[];
      warnings: string[];
      errors: string[];
      suggestions: string[];
    };
  };
  errors: string[];
  warnings: string[];
  processingType: string;
}

export default function CsvToInvoice() {
  const [bmdFile, setBmdFile] = useState<File | null>(null)
  
  // UPDATED: Support multiple reservation sources
  const [reservationFiles, setReservationFiles] = useState<Array<{
    file: File;
    source: 'BOOKING_COM' | 'AIRBNB' | 'VRBO' | 'DIRECT';
    month?: string;
    displayName: string;
  }>>([])
  
  const [parseResult, setParseResult] = useState<EnhancedProcessingResult | null>(null)
  const [downloadFormat, setDownloadFormat] = useState<'combined' | 'zip'>('combined')
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState('')
  const [bmdOnlyMode, setBmdOnlyMode] = useState(false) // NEW: BMD-only mode toggle
  const [positionalMatching, setPositionalMatching] = useState(false) // NEW: Position-based matching 
  const [availableBMDMonths, setAvailableBMDMonths] = useState<string[]>([]) // "YYYY-MM" strings
  const [selectedBMDMonths, setSelectedBMDMonths] = useState<string[]>([]) // months to process

  // Updated UI state for multi-source reservations
  const [showAddReservationModal, setShowAddReservationModal] = useState(false)

  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ]

  const reservationSources = [
    { value: 'BOOKING_COM', label: 'Booking.com' },
    { value: 'AIRBNB', label: 'Airbnb' },
    { value: 'VRBO', label: 'VRBO/HomeAway' },
    { value: 'DIRECT', label: 'Direct bookings' }
  ] as const

  const extractBMDMonths = async (file: File): Promise<string[]> => {
    try {
      const text = await file.text()
      const lines = text.split('\n').filter(l => l.trim())
      if (lines.length < 2) return []
      const delimiter = lines[0].includes(';') ? ';' : ','
      const headers = lines[0].split(delimiter).map(h => h.trim().replace(/"/g, '').toLowerCase())
      const belegdatIdx = headers.findIndex(h => h === 'belegdat')
      if (belegdatIdx < 0) return []
      const months = new Set<string>()
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(delimiter)
        const val = cols[belegdatIdx]?.trim().replace(/"/g, '')
        if (val && /^\d{8}$/.test(val)) {
          months.add(`${val.substring(0, 4)}-${val.substring(4, 6)}`)
        }
      }
      return Array.from(months).sort()
    } catch {
      return []
    }
  }

  const formatBMDMonth = (yyyymm: string): string => {
    const [year, month] = yyyymm.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1, 1)
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const handleBmdFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('BMD file upload triggered')
    const file = event.target.files?.[0]
    if (!file) return

    // Accept both CSV and Excel files
    const isValidFile = file.name.endsWith('.csv') || 
                       file.name.endsWith('.xlsx') || 
                       file.name.endsWith('.xls')
    
    if (!isValidFile) {
      setMessage('Please select a CSV or Excel file')
      return
    }

    console.log('BMD file selected:', file.name)
    setBmdFile(file)
    setMessage('')

    // Extract available months from BMD file client-side
    const months = await extractBMDMonths(file)
    setAvailableBMDMonths(months)
    setSelectedBMDMonths(months) // Select all by default

    // In BMD-only mode, parse immediately without waiting for reservation files
    if (bmdOnlyMode) {
      console.log('BMD-only mode: parsing immediately...')
      parseFiles(file, [], months)
    } else if (reservationFiles.length > 0) {
      console.log('BMD and reservation files ready, parsing...')
      parseFiles(file, reservationFiles, months)
    }
  }

  const handleAddReservationFiles = (newFiles: FileList | null, source: string, month?: string) => {
    if (!newFiles || newFiles.length === 0) return

    const files = Array.from(newFiles)
    
    // Validate all files are CSV
    const invalidFiles = files.filter(file => !file.name.endsWith('.csv'))
    if (invalidFiles.length > 0) {
      setMessage(`Please select only CSV files. Invalid: ${invalidFiles.map(f => f.name).join(', ')}`)
      return
    }

    const newReservationFiles = files.map((file, index) => ({
      file,
      source: source as any,
      month,
      displayName: `${file.name} (${source}${month ? `, ${month}` : ''})`
    }))

    console.log(`${files.length} ${source} files selected:`, files.map(f => f.name))
    
    setReservationFiles(prev => [...prev, ...newReservationFiles])
    setMessage('')
    
    // Parse if BMD file is ready
    if (bmdFile) {
      console.log('BMD and reservation files ready, parsing...')
      parseFiles(bmdFile, [...reservationFiles, ...newReservationFiles], selectedBMDMonths)
    }
  }

  const removeReservationFile = (index: number) => {
    setReservationFiles(prev => prev.filter((_, i) => i !== index))
  }

  const clearAllFiles = () => {
    setReservationFiles([])
    setBmdFile(null)
    setParseResult(null)
    setMessage('')
    setAvailableBMDMonths([])
    setSelectedBMDMonths([])
  }

  const parseFiles = async (bmdFile: File, reservationFileList: Array<{ file: File; source: string; month?: string; displayName: string }>, monthsFilter: string[] = selectedBMDMonths) => {
    console.log('parseFiles called with:', bmdFile?.name, `and ${reservationFileList.length} reservation files from multiple sources`)
    
    if (bmdOnlyMode) {
      console.log('🧾 BMD-only mode: generating invoices from BMD data only')
      setMessage('🧾 Processing BMD file only - missing info will be highlighted in red...')
    } else {
      setMessage('🔍 Parsing files across all sources (Booking.com, Airbnb, etc.)...')
    }

    try {
      const formData = new FormData()
      formData.append('bmdFile', bmdFile)
      
      // Always send selected months (empty = all months)
      formData.append('selectedMonths', JSON.stringify(monthsFilter))

      if (bmdOnlyMode) {
        formData.append('bmdOnly', 'true') // NEW: Enable BMD-only processing
      } else {
        formData.append('multiSource', 'true') // Enable multi-source processing
        formData.append('positionalMatching', positionalMatching.toString()) // NEW: Enable positional matching
        
        // Add all reservation files with metadata
        reservationFileList.forEach((item, index) => {
          formData.append(`reservationFile_${index}`, item.file)
          formData.append(`source_${index}`, item.source)
          if (item.month) {
            formData.append(`month_${index}`, item.month)
          }
        })
        
        formData.append('totalReservationFiles', reservationFileList.length.toString())
      }
      
      console.log(`FormData created with ${bmdOnlyMode ? 'BMD-only mode' : `${reservationFileList.length} reservation files across sources`}:`);
      
      if (!bmdOnlyMode) {
        const sourceCounts = reservationFileList.reduce((acc, item) => {
          acc[item.source] = (acc[item.source] || 0) + 1
          return acc
        }, {} as Record<string, number>)
        console.log('Source breakdown:', sourceCounts)
      }

      const response = await fetch('/api/parse-dual-csv', {
        method: 'POST',
        body: formData,
      })
      
      console.log('API response status:', response.status)

      if (response.ok) {
        const result = await response.json()
        console.log('🎉 Multi-source API response result:', result)
        
        setParseResult(result)
        setMessage('')
        
        // With aggressive matching, we should have minimal unmatched items
        if (result.validationResult) {
          const { unmatchedBMD, totalBMDInvoices, successfulMatches, partialMatches } = result.validationResult.summary
          const matchedCount = successfulMatches + partialMatches
          const coverage = (matchedCount / totalBMDInvoices * 100).toFixed(1)
          
          if (unmatchedBMD > 0) {
            setMessage(`⚠️ ${coverage}% BMD coverage: ${matchedCount}/${totalBMDInvoices} matched, ${unmatchedBMD} BMD-only invoices`)
          } else {
            setMessage(`✅ 100% BMD coverage: All ${totalBMDInvoices} BMD invoices matched or processed!`)
          }
        }
        
      } else {
        const error = await response.text()
        console.error('API error response:', error)
        setMessage(`Error parsing files: ${error}`)
        setParseResult(null)
      }
    } catch (error) {
      console.error('Fetch error:', error)
      setMessage('Error uploading files: ' + (error instanceof Error ? error.message : 'Unknown error'))
      setParseResult(null)
    }
  }

  const handleGenerateInvoices = async () => {
    // Fix: Allow BMD-only mode (when bmdOnlyMode is true, reservationFiles.length can be 0)
    const hasRequiredFiles = bmdOnlyMode 
      ? (bmdFile) // BMD-only mode: only need BMD file
      : (bmdFile && reservationFiles.length > 0) // Normal mode: need both BMD and reservation files
    
    if (!hasRequiredFiles || !parseResult || !parseResult.success || !parseResult.data?.length) {
      const errorMessage = bmdOnlyMode 
        ? 'Please upload BMD file and wait for parsing to complete'
        : 'Please upload both BMD file and reservation files, then wait for parsing to complete'
      setMessage(errorMessage)
      return
    }

    setGenerating(true)
    const processingMessage = bmdOnlyMode 
      ? '🧾 Generating invoices from BMD data only...'
      : '🚀 Generating invoices from all matched reservations...'
    setMessage(processingMessage)

    try {
      const response = await fetch('/api/generate-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvRows: parseResult.data,
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
        
        const invoiceCount = parseResult.data.length
        setMessage(`🎉 ${invoiceCount} invoices generated and downloaded successfully!`)
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

  // Extract reservations that failed validation for manual review
  const extractFailedReservations = (result: any) => {
    const failed: any[] = []
    
    // Get unmatched reservations (those without BMD matches)
    if (result.validationResult?.unmatchedReservations) {
      for (const unmatched of result.validationResult.unmatchedReservations) {
        failed.push({
          id: unmatched.reservation.reservationNumber,
          guestName: unmatched.reservation.bookerName,
          checkIn: unmatched.reservation.arrival,
          checkOut: unmatched.reservation.departure,
          amount: unmatched.reservation.totalPayment,
          property: unmatched.reservation.propertyCode || 'UNKNOWN',
          reason: 'No BMD invoice match found',
          source: 'reservation_only'
        })
      }
    }
    
    return failed
  }



  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Invoice Converter: BMD + Reservations → Invoice PDF</h1>
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
                <h4 className="font-medium text-blue-900 mb-2">🌍 Multi-Source Processing:</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• <strong>BMD Excel/CSV:</strong> Contains invoice numbers, amounts, and property information (supports multi-sheet Excel)</li>
                  <li>• <strong>Multi-Platform Reservations:</strong> Upload CSV files from Booking.com, Airbnb, VRBO, etc.</li>
                  <li>• <strong>100% BMD Matching:</strong> Aggressive matching ensures every BMD invoice gets processed</li>
                  <li>• <strong>Smart Processing:</strong> BMD data is authoritative, reservations used for enrichment</li>
                </ul>
              </div>
              
              <div className="grid grid-cols-1 gap-6">
              {/* BMD File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  BMD File (Excel/CSV) *
                </label>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleBmdFileUpload}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload BMD Excel file (multiple sheets) or CSV (contains invoice numbers and amounts)
                </p>
              </div>

              {/* BMD Month Filter - shown after file is uploaded and months detected */}
              {availableBMDMonths.length > 0 && (
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-green-900">📅 Select Months to Process</h4>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedBMDMonths(availableBMDMonths)}
                        className="text-xs text-green-700 hover:text-green-900 underline"
                      >
                        Select all
                      </button>
                      <span className="text-xs text-gray-400">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedBMDMonths([])}
                        className="text-xs text-green-700 hover:text-green-900 underline"
                      >
                        Deselect all
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {availableBMDMonths.map(m => (
                      <label key={m} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedBMDMonths.includes(m)}
                          onChange={(e) => {
                            setSelectedBMDMonths(prev =>
                              e.target.checked ? [...prev, m].sort() : prev.filter(x => x !== m)
                            )
                          }}
                          className="accent-green-600"
                        />
                        <span className="text-sm text-green-800">{formatBMDMonth(m)}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-green-700">
                      {selectedBMDMonths.length} of {availableBMDMonths.length} month{availableBMDMonths.length !== 1 ? 's' : ''} selected
                    </span>
                    {bmdFile && (
                      <button
                        type="button"
                        onClick={() => parseFiles(bmdFile, reservationFiles, selectedBMDMonths)}
                        className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        disabled={selectedBMDMonths.length === 0}
                      >
                        Re-process with selection
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* BMD-Only Mode Toggle */}
              <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-yellow-900 mb-1">🧾 BMD-Only Mode</h4>
                    <p className="text-sm text-yellow-700">
                      Generate invoices directly from BMD data only. Missing information will be shown in red.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bmdOnlyMode}
                      onChange={(e) => {
                        setBmdOnlyMode(e.target.checked)
                        if (e.target.checked) {
                          // Clear reservations when switching to BMD-only
                          setReservationFiles([])
                          // Auto-parse if BMD file is ready
                          if (bmdFile) {
                            parseFiles(bmdFile, [])
                          }
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className={`w-11 h-6 rounded-full transition-all duration-200 relative ${
                      bmdOnlyMode ? 'bg-yellow-500' : 'bg-gray-200'
                    }`}>
                      <div className={`absolute top-[2px] left-[2px] bg-white border border-gray-300 rounded-full h-5 w-5 transition-transform duration-200 ${
                        bmdOnlyMode ? 'translate-x-5' : 'translate-x-0'
                      }`}></div>
                    </div>
                  </label>
                </div>
                {bmdOnlyMode && (
                  <div className="mt-3 p-3 bg-yellow-100 rounded border border-yellow-300">
                    <p className="text-sm text-yellow-800">
                      ✅ <strong>BMD-only mode enabled:</strong> Upload only BMD file. Missing guest details will be highlighted in red.
                    </p>
                  </div>
                )}
              </div>

              {/* Multi-Source Reservations Upload - Hidden in BMD-only mode */}
              {!bmdOnlyMode && (
              <>
                {/* Positional Matching Toggle */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-blue-900 mb-1">🎯 Positional Matching</h4>
                      <p className="text-sm text-blue-700">
                        Match BMD invoices with reservations by position: Invoice #1 → Reservation #1, Invoice #2 → Reservation #2, etc.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={positionalMatching}
                        onChange={(e) => setPositionalMatching(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className={`w-11 h-6 rounded-full transition-all duration-200 relative ${
                        positionalMatching ? 'bg-blue-500' : 'bg-gray-200'
                      }`}>
                        <div className={`absolute top-[2px] left-[2px] bg-white border border-gray-300 rounded-full h-5 w-5 transition-transform duration-200 ${
                          positionalMatching ? 'translate-x-5' : 'translate-x-0'
                        }`}></div>
                      </div>
                    </label>
                  </div>
                  {positionalMatching ? (
                    <div className="mt-3 p-3 bg-blue-100 rounded border border-blue-300">
                      <p className="text-sm text-blue-800">
                        ✅ <strong>Positional matching enabled:</strong> BMD invoices (1, 2, 3...) will match reservations in upload order.
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        🔄 <strong>Two-phase process:</strong> BMD → Booking.com first, then remaining BMD → Airbnb (no mixing!)
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 p-3 bg-orange-100 rounded border border-orange-300">
                      <p className="text-sm text-orange-800">
                        🔍 <strong>Similarity matching enabled:</strong> System will find best matches based on names, amounts, properties, etc.
                      </p>
                      <p className="text-xs text-orange-600 mt-1">
                        🔄 <strong>Two-phase process:</strong> BMD → Booking.com first, then remaining BMD → Airbnb (no mixing!)
                      </p>
                    </div>
                  )}
                </div>
                
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-sm font-medium text-gray-700">
                    Reservation Files (By Source)
                  </label>
                  <div className="flex items-center space-x-4">
                    <div className="text-xs text-gray-500">
                      {reservationFiles.length} file{reservationFiles.length !== 1 ? 's' : ''} from {new Set(reservationFiles.map(f => f.source)).size} source{new Set(reservationFiles.map(f => f.source)).size !== 1 ? 's' : ''}
                    </div>
                    {(reservationFiles.length > 0 || bmdFile) && (
                      <button
                        type="button"
                        onClick={clearAllFiles}
                        className="text-xs text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Upload by Source Type */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  {reservationSources.map((source) => (
                    <div key={source.value} className="border rounded-lg p-3 bg-white">
                      <h6 className="text-sm font-medium text-gray-700 mb-2">{source.label}</h6>
                      <input
                        type="file"
                        accept=".csv"
                        multiple
                        onChange={(e) => handleAddReservationFiles(e.target.files, source.value)}
                        className="w-full text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">Upload {source.label} CSV files</p>
                    </div>
                  ))}
                </div>

                {/* Current Files List */}
                {reservationFiles.length > 0 && (
                  <div className="space-y-2">
                    <h6 className="text-sm font-medium text-gray-700">Uploaded Reservation Files:</h6>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {reservationFiles.map((item, index) => (
                        <div key={index} className="flex items-center justify-between bg-white p-3 rounded border">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <span 
                                className={`inline-block w-3 h-3 rounded-full ${
                                  item.source === 'BOOKING_COM' ? 'bg-blue-500' :
                                  item.source === 'AIRBNB' ? 'bg-pink-500' :
                                  item.source === 'VRBO' ? 'bg-yellow-500' :
                                  item.source === 'DIRECT' ? 'bg-green-500' :
                                  'bg-gray-500'
                                }`}
                                title={item.source}
                              ></span>
                              <span className="text-sm font-medium truncate" title={item.file.name}>
                                {item.file.name}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {item.source.replace('_', ' ')} • {(item.file.size / 1024).toFixed(1)} KB
                              {item.month && <span> • {item.month}</span>}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeReservationFile(index)}
                            className="ml-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-2 py-1"
                            title="Remove file"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-500 mt-2">
                  🔄 <strong>Two-phase matching:</strong> BMD invoices are matched with Booking.com reservations first, then remaining BMD invoices are matched with Airbnb reservations. No platform mixing allowed!
                </p>
              </div>
              </>
              )}
              </div>
            </div>

            {/* File Info */}
            {(bmdFile || reservationFiles.length > 0) && (
              <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
                <h4 className="font-medium text-green-900 mb-2">
                  Files Information {bmdOnlyMode && <span className="text-yellow-600">(BMD-Only Mode)</span>}
                </h4>
                <div className="space-y-4 text-sm">
                  {bmdFile && (
                    <div className="p-2 bg-white rounded border">
                      <div><span className="text-green-700">BMD File:</span> {bmdFile.name}</div>
                      <div><span className="text-green-700">Size:</span> {(bmdFile.size / 1024).toFixed(1)} KB</div>
                      <div><span className="text-green-700">Type:</span> {bmdFile.name.toLowerCase().endsWith('.xlsx') || bmdFile.name.toLowerCase().endsWith('.xls') ? 'Excel' : 'CSV'}</div>
                      {bmdOnlyMode && (
                        <div className="mt-2 p-2 bg-yellow-50 rounded border border-yellow-200">
                          <span className="text-yellow-700 text-xs">🧾 BMD-Only Mode: Missing guest details will be highlighted in red</span>
                        </div>
                      )}
                    </div>
                  )}
                  {!bmdOnlyMode && reservationFiles.length > 0 && (
                    <div className="p-2 bg-white rounded border">
                      <div className="mb-2"><span className="text-green-700">Reservation Files ({reservationFiles.length} total):</span></div>
                      
                      {/* Source breakdown */}
                      {(() => {
                        const sourceBreakdown = reservationFiles.reduce((acc, file) => {
                          acc[file.source] = (acc[file.source] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>);
                        
                        return (
                          <div className="mb-3 p-2 bg-blue-50 rounded border border-blue-200">
                            <div className="text-xs font-semibold text-blue-800 mb-1">Sources:</div>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(sourceBreakdown).map(([source, count]) => (
                                <span key={source} className="text-xs bg-white px-2 py-1 rounded border">
                                  {source.replace('_', ' ')}: {count}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                      
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {reservationFiles.map((item, index) => (
                          <div key={index} className="text-xs bg-gray-50 p-1 rounded">
                            <div className="flex items-center space-x-2">
                              <span 
                                className={`inline-block w-2 h-2 rounded-full ${
                                  item.source === 'BOOKING_COM' ? 'bg-blue-500' :
                                  item.source === 'AIRBNB' ? 'bg-pink-500' :
                                  item.source === 'VRBO' ? 'bg-yellow-500' :
                                  item.source === 'DIRECT' ? 'bg-green-500' :
                                  'bg-gray-500'
                                }`}
                              ></span>
                              <span className="font-medium">{item.file.name}</span>
                              <span className="text-gray-500">({item.source})</span>
                              <span className="text-gray-400">- {(item.file.size / 1024).toFixed(1)} KB</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {bmdFile && (bmdOnlyMode || reservationFiles.length > 0) && (
                  <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                    <p className="text-xs text-blue-700">
                      {bmdOnlyMode ? (
                        <span>🧾 <strong>BMD-Only Mode:</strong> Ready to generate invoices from BMD data only - missing details in red!</span>
                      ) : (
                        <span>✅ BMD file + {reservationFiles.length} reservation files from {new Set(reservationFiles.map(f => f.source)).size} platform(s) - Ready for 100% BMD matching!</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Parse Results */}
            {parseResult && (
              <div className="space-y-6">
                {/* Processing Summary */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-medium text-blue-900 mb-2">Processing Results ({parseResult.processingType})</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-blue-700">BMD Invoices:</span> {parseResult.processingStats.bmdInvoicesFound}
                    </div>
                    <div>
                      <span className="text-blue-700">Reservations:</span> {parseResult.processingStats.reservationsFound}
                    </div>
                    <div>
                      <span className="text-blue-700">Final Invoices:</span> {parseResult.processingStats.finalMergedCount}
                    </div>
                    <div>
                      <span className="text-blue-700">Direct Matches:</span> {parseResult.processingStats.directMatches}
                    </div>
                  </div>
                </div>

                {/* Detailed Validation Results */}
                {parseResult.validationResult && (
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h4 className="font-medium text-gray-900 mb-4">📊 Multi-Source Validation & Matching Results</h4>
                    
                    {/* Success Summary */}
                    {parseResult.validationResult.feedback.successMessages.length > 0 && (
                      <div className="mb-4 p-3 bg-green-50 rounded border border-green-200">
                        <h5 className="font-medium text-green-900 mb-2">✅ Multi-Source Success</h5>
                        <ul className="text-sm text-green-700 space-y-1">
                          {parseResult.validationResult.feedback.successMessages.map((msg, i) => (
                            <li key={i}>• {msg}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Multi-Source Coverage Chart */}
                    <div className="mb-6 p-4 bg-blue-50 rounded border border-blue-200">
                      <h5 className="font-medium text-blue-900 mb-2">🌍 BMD Coverage Across All Sources</h5>
                      <div className="flex items-center mb-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-6 mr-4">
                          {(() => {
                            const total = parseResult.validationResult.summary.totalBMDInvoices;
                            const matched = parseResult.validationResult.summary.successfulMatches + parseResult.validationResult.summary.partialMatches;
                            const percentage = total > 0 ? (matched / total) * 100 : 0;
                            
                            return (
                              <div 
                                className="bg-green-500 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium"
                                style={{ width: `${Math.max(percentage, 10)}%` }}
                              >
                                {percentage.toFixed(1)}%
                              </div>
                            );
                          })()}
                        </div>
                        <span className="text-sm font-medium text-blue-700">
                          {parseResult.validationResult.summary.successfulMatches + parseResult.validationResult.summary.partialMatches} / {parseResult.validationResult.summary.totalBMDInvoices} BMD invoices matched
                        </span>
                      </div>
                    </div>

                    {/* Validation Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="text-center p-3 bg-green-100 rounded">
                        <div className="text-2xl font-bold text-green-600">
                          {parseResult.validationResult.summary.successfulMatches}
                        </div>
                        <div className="text-sm text-green-700">Perfect Matches</div>
                      </div>
                      <div className="text-center p-3 bg-yellow-100 rounded">
                        <div className="text-2xl font-bold text-yellow-600">
                          {parseResult.validationResult.summary.partialMatches}
                        </div>
                        <div className="text-sm text-yellow-700">Partial Matches</div>
                      </div>
                      <div className="text-center p-3 bg-blue-100 rounded">
                        <div className="text-2xl font-bold text-blue-600">
                          {parseResult.validationResult.summary.unmatchedBMD}
                        </div>
                        <div className="text-sm text-blue-700">BMD-Only Invoices</div>
                      </div>
                      <div className="text-center p-3 bg-purple-100 rounded">
                        <div className="text-2xl font-bold text-purple-600">
                          {parseResult.validationResult.summary.totalReservations}
                        </div>
                        <div className="text-sm text-purple-700">Total Reservations</div>
                      </div>
                    </div>

                    {/* Source Breakdown (if available) */}
                    {(() => {
                      // Try to extract source information from validation results
                      const validMatches = parseResult.validationResult.validMatches || [];
                      const partialMatches = parseResult.validationResult.partialMatches || [];
                      const allMatches = [...validMatches, ...partialMatches];
                      
                      if (allMatches.length > 0 && allMatches[0].reservationSource) {
                        const sourceCounts = allMatches.reduce((acc, match) => {
                          const source = match.reservationSource || 'UNKNOWN';
                          acc[source] = (acc[source] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>);
                        
                        return (
                          <div className="mb-4 p-3 bg-indigo-50 rounded border border-indigo-200">
                            <h5 className="font-medium text-indigo-900 mb-2">🎯 Matches by Source</h5>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {Object.entries(sourceCounts).map(([source, count]) => (
                                <div key={source} className="text-center p-2 bg-white rounded border">
                                  <div className="text-lg font-bold text-indigo-600">{count as number}</div>
                                  <div className="text-xs text-indigo-700">{source.replace('_', ' ')}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* BMD-Only Invoices (will be generated with BMD data only) */}
                    {parseResult.validationResult.unmatchedBMDInvoices.length > 0 && (
                      <div className="mb-4 p-3 bg-orange-50 rounded border border-orange-200">
                        <h5 className="font-medium text-orange-900 mb-2">⚠️ Unmatched BMD Invoices ({parseResult.validationResult.unmatchedBMDInvoices.length})</h5>
                        <div className="text-sm text-orange-700">
                          <p className="mb-2">These invoices could not be matched to a reservation. Reason is shown for each:</p>
                          <div className="bg-white rounded p-2 border max-h-60 overflow-y-auto">
                            {parseResult.validationResult.unmatchedBMDInvoices.map((bmdInvoice: any, i: number) => {
                              const diag = bmdInvoice.__diagnostic;
                              return (
                                <div key={i} className="py-2 border-b border-orange-100 last:border-b-0">
                                  <div className="flex items-start gap-2">
                                    <span className="font-semibold text-orange-800 shrink-0">#{bmdInvoice.belegnr}</span>
                                    <div className="flex-1 min-w-0">
                                      <span className="text-gray-700">
                                        {bmdInvoice.guestName && <span>{bmdInvoice.guestName} </span>}
                                        {bmdInvoice.grossAmount && <span>€{bmdInvoice.grossAmount} </span>}
                                        {bmdInvoice.platform && <span className="text-xs bg-gray-100 px-1 rounded">{bmdInvoice.platform}</span>}
                                      </span>
                                      {diag ? (
                                        <div className="mt-1">
                                          <span className="text-red-600 text-xs font-medium">✗ {diag.rejectionReason}</span>
                                          {diag.score !== undefined && (
                                            <div className="text-xs text-gray-500 mt-0.5">
                                              Best candidate: <span className="font-medium">{diag.guestName}</span> €{diag.amount} — score {diag.score}% 
                                              {diag.reasons?.length > 0 && <span> ({diag.reasons.join(', ')})</span>}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="text-xs text-gray-500 mt-0.5">No candidates found in reservation files</div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <p className="text-xs text-orange-600 mt-2">
                            💡 These will be generated as BMD-only invoices. To fix: check that the reservation file contains matching amounts/names, or that the correct platform file is uploaded.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Orphaned Reservations (informational only) */}
                    {parseResult.validationResult.unmatchedReservations.length > 0 && (
                      <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
                        <h5 className="font-medium text-gray-900 mb-2">ℹ️ Orphaned Reservations</h5>
                        <div className="text-sm text-gray-700">
                          <p className="mb-2">These reservations from your files don&apos;t have corresponding BMD invoices:</p>
                          <div className="bg-white rounded p-2 border max-h-40 overflow-y-auto">
                            {parseResult.validationResult.unmatchedReservations.slice(0, 10).map((unmatched, i) => (
                              <div key={i} className="py-1 border-b border-gray-100 last:border-b-0">
                                <div>
                                  <span className="font-medium">#{unmatched.reservation.reservationNumber}</span>
                                  {unmatched.reservation.bookerName && <span> - {unmatched.reservation.bookerName}</span>}
                                  {unmatched.reservation.totalPayment && <span> - €{unmatched.reservation.totalPayment}</span>}
                                  {unmatched.reservation.source && <span className="text-xs text-gray-500"> ({unmatched.reservation.source})</span>}
                                </div>
                              </div>
                            ))}
                            {parseResult.validationResult.unmatchedReservations.length > 10 && (
                              <div className="py-1 text-center text-gray-500">
                                ... and {parseResult.validationResult.unmatchedReservations.length - 10} more
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mt-2">
                            💡 These reservations will not generate invoices since there&apos;s no BMD data for them.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Suggestions */}
                    {parseResult.validationResult.feedback.suggestions.length > 0 && (
                      <div className="p-3 bg-yellow-50 rounded border border-yellow-200">
                        <h5 className="font-medium text-yellow-900 mb-2">💡 Suggestions to Improve Matching</h5>
                        <ul className="text-sm text-yellow-700 space-y-1">
                          {parseResult.validationResult.feedback.suggestions.map((suggestion, i) => (
                            <li key={i}>• {suggestion}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Error and Warning Messages */}
                {parseResult.errors.length > 0 && (
                  <div className="p-3 bg-red-50 rounded border border-red-200">
                    <h5 className="font-medium text-red-900 mb-1">Errors:</h5>
                    <ul className="text-sm text-red-700">
                      {parseResult.errors.slice(0, 5).map((error, i) => (
                        <li key={i}>• {error}</li>
                      ))}
                      {parseResult.errors.length > 5 && (
                        <li>• ... and {parseResult.errors.length - 5} more errors</li>
                      )}
                    </ul>
                  </div>
                )}
                {parseResult.warnings.length > 0 && (
                  <div className="p-3 bg-yellow-50 rounded border border-yellow-200">
                    <h5 className="font-medium text-yellow-900 mb-1">Warnings:</h5>
                    <ul className="text-sm text-yellow-700">
                      {parseResult.warnings.slice(0, 3).map((warning, i) => (
                        <li key={i}>• {warning}</li>
                      ))}
                      {parseResult.warnings.length > 3 && (
                        <li>• ... and {parseResult.warnings.length - 3} more warnings</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Download Format Choice */}
            {parseResult && parseResult.success && parseResult.data.length > 0 && (
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
                disabled={
                  generating || 
                  !parseResult || 
                  !parseResult.success || 
                  !parseResult.data?.length ||
                  (bmdOnlyMode ? !bmdFile : (!bmdFile || reservationFiles.length === 0))
                }
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