'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ReservationInvoice, ReservationInvoiceProcessor } from '@/lib/reservation-invoice-processor'

interface ProcessingResult {
  invoices: ReservationInvoice[];
  summary: {
    total: number;
    valid: number;
    needsReview: number;
    errors: string[];
  };
}

export default function ReservationInvoices() {
  const [reservationFiles, setReservationFiles] = useState<Record<string, File[]>>({
    'january': [], 'february': [], 'march': [], 'april': [], 'may': [], 'june':[],
    'july': [], 'august': [], 'september': [], 'october': [], 'november': [], 'december': []
  })
  
  const [result, setResult] = useState<ProcessingResult | null>(null)
  const [processing, setProcessing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState('')
  
  // Filters and view options
  const [filter, setFilter] = useState<'all' | 'valid' | 'needsReview' | 'approved' | 'rejected'>('all')
  const [sortBy, setSortBy] = useState<'amount' | 'date' | 'guest' | 'property'>('amount')

  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ]

  const handleFileUpload = (month: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    setReservationFiles(prev => ({
      ...prev,
      [month]: files
    }))
  }

  const processReservations = async () => {
    const totalFiles = Object.values(reservationFiles).flat().length
    if (totalFiles === 0) {
      setMessage('Please upload at least one reservation file')
      return
    }

    setProcessing(true)
    setMessage('Processing reservation files...')

    try {
      // Prepare file data
      const fileData: { month: string; content: string }[] = []
      
      for (const month of months) {
        const files = reservationFiles[month] || []
        for (const file of files) {
          const content = await file.text()
          fileData.push({ month, content })
        }
      }

      // Process with reservation processor
      const processor = new ReservationInvoiceProcessor({
        requireGuestName: true,
        requireValidDates: true,
        requirePositiveAmount: true,
        requireProperty: false, // Allow unknown properties
        minAmount: 5,
        maxAmount: 5000,
        futureDatesAllowed: false
      })

      const processingResult = await processor.processReservationFiles(fileData)
      setResult(processingResult)
      setMessage(`Processed ${processingResult.summary.total} reservations`)
      
    } catch (error) {
      setMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setProcessing(false)
    }
  }

  const handleApproval = (invoiceId: string, approved: boolean, reason?: string) => {
    if (!result) return

    const updatedInvoices = result.invoices.map(invoice => {
      if (invoice.id === invoiceId) {
        return {
          ...invoice,
          manuallyApproved: approved,
          rejectionReason: approved ? undefined : reason
        }
      }
      return invoice
    })

    setResult({
      ...result,
      invoices: updatedInvoices
    })
  }

  const generateInvoices = async () => {
    if (!result) return

    setGenerating(true)
    setMessage('Generating invoices...')

    try {
      const processor = new ReservationInvoiceProcessor()
      const csvRows = processor.convertToCSVRows(result.invoices)

      if (csvRows.length === 0) {
        setMessage('No approved invoices to generate')
        return
      }

      const response = await fetch('/api/generate-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvRows,
          format: 'combined'
        })
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'reservation-invoices.pdf'
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        
        setMessage(`Generated ${csvRows.length} invoices successfully!`)
      } else {
        const error = await response.text()
        setMessage(`Error: ${error}`)
      }
    } catch (error) {
      setMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setGenerating(false)
    }
  }

  // Filter and sort invoices
  const filteredInvoices = result?.invoices.filter(invoice => {
    switch (filter) {
      case 'valid': return invoice.isValid
      case 'needsReview': return !invoice.isValid && invoice.manuallyApproved === undefined
      case 'approved': return invoice.manuallyApproved === true
      case 'rejected': return invoice.manuallyApproved === false
      default: return true
    }
  }).sort((a, b) => {
    switch (sortBy) {
      case 'amount': return b.amount - a.amount
      case 'date': return new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime()
      case 'guest': return a.guestName.localeCompare(b.guestName)
      case 'property': return a.property.localeCompare(b.property)
      default: return 0
    }
  }) || []

  const summary = result ? new ReservationInvoiceProcessor().getSummary(result.invoices) : null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Reservation Invoice Validator</h1>
              <p className="text-gray-600 mt-2">Generate invoices directly from reservation data with manual review</p>
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
        
        {/* File Upload Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-medium mb-4">Upload Reservation Files</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-4">
            {months.map((month) => (
              <div key={month} className={`border rounded-lg p-3 ${reservationFiles[month].length > 0 ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                <h5 className="text-sm font-medium text-gray-700 capitalize mb-2">{month}</h5>
                <input
                  type="file"
                  accept=".csv"
                  multiple
                  onChange={handleFileUpload(month)}
                  className="w-full text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-green-50 file:text-green-700"
                />
                {reservationFiles[month].length > 0 && (
                  <div className="mt-1 text-xs text-green-600">
                    {reservationFiles[month].length} file(s)
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <button
            onClick={processReservations}
            disabled={Object.values(reservationFiles).flat().length === 0 || processing}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {processing ? 'Processing...' : 'Process Reservations'}
          </button>
        </div>

        {/* Summary Section */}
        {summary && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-medium mb-4">Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 text-sm">
              <div className="text-center p-2 bg-gray-100 rounded">
                <div className="text-xl font-bold text-gray-600">{summary.total}</div>
                <div>Total</div>
              </div>
              <div className="text-center p-2 bg-green-100 rounded">
                <div className="text-xl font-bold text-green-600">{summary.autoValid}</div>
                <div>Auto Valid</div>
              </div>
              <div className="text-center p-2 bg-blue-100 rounded">
                <div className="text-xl font-bold text-blue-600">{summary.manuallyApproved}</div>
                <div>Approved</div>
              </div>
              <div className="text-center p-2 bg-red-100 rounded">
                <div className="text-xl font-bold text-red-600">{summary.manuallyRejected}</div>
                <div>Rejected</div>
              </div>
              <div className="text-center p-2 bg-yellow-100 rounded">
                <div className="text-xl font-bold text-yellow-600">{summary.pendingReview}</div>
                <div>Pending</div>
              </div>
              <div className="text-center p-2 bg-purple-100 rounded">
                <div className="text-xl font-bold text-purple-600">{summary.readyForInvoicing}</div>
                <div>Ready</div>
              </div>
              <div className="text-center p-2 bg-green-100 rounded">
                <div className="text-xl font-bold text-green-600">€{summary.totalAmount.toFixed(0)}</div>
                <div>Total €</div>
              </div>
            </div>
          </div>
        )}

        {/* Filters and Controls */}
        {result && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex flex-wrap gap-4 items-center justify-between">
              <div className="flex gap-4">
                <select 
                  value={filter} 
                  onChange={(e) => setFilter(e.target.value as any)}
                  className="px-3 py-1 border border-gray-300 rounded text-sm"
                >
                  <option value="all">All ({result.invoices.length})</option>
                  <option value="valid">Auto Valid ({summary?.autoValid})</option>
                  <option value="needsReview">Need Review ({summary?.pendingReview})</option>
                  <option value="approved">Approved ({summary?.manuallyApproved})</option>
                  <option value="rejected">Rejected ({summary?.manuallyRejected})</option>
                </select>

                <select 
                  value={sortBy} 
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-3 py-1 border border-gray-300 rounded text-sm"
                >
                  <option value="amount">Sort by Amount</option>
                  <option value="date">Sort by Date</option>
                  <option value="guest">Sort by Guest</option>
                  <option value="property">Sort by Property</option>
                </select>
              </div>

              <button
                onClick={generateInvoices}
                disabled={!summary || summary.readyForInvoicing === 0 || generating}
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {generating ? 'Generating...' : `Generate ${summary?.readyForInvoicing || 0} Invoices`}
              </button>
            </div>
          </div>
        )}

        {/* Invoice List */}
        {filteredInvoices.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium mb-4">Invoice Validation ({filteredInvoices.length} shown)</h3>
            
            <div className="space-y-2">
              {filteredInvoices.map((invoice, index) => (
                <InvoiceRow 
                  key={invoice.id} 
                  invoice={invoice} 
                  index={index + 1}
                  onApproval={handleApproval}
                />
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {message && (
          <div className={`mt-6 p-4 rounded-lg ${
            message.includes('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 
            message.includes('success') ? 'bg-green-50 text-green-700 border border-green-200' :
            'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {message}
          </div>
        )}

      </main>
    </div>
  )
}

// Individual invoice row component
function InvoiceRow({ 
  invoice, 
  index, 
  onApproval 
}: { 
  invoice: ReservationInvoice
  index: number
  onApproval: (id: string, approved: boolean, reason?: string) => void
}) {
  const [showDetails, setShowDetails] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const getStatusColor = () => {
    if (invoice.manuallyApproved === true) return 'bg-green-100 border-green-300'
    if (invoice.manuallyApproved === false) return 'bg-red-100 border-red-300'
    if (invoice.isValid) return 'bg-blue-100 border-blue-300'
    return 'bg-yellow-100 border-yellow-300'
  }

  const getStatusIcon = () => {
    if (invoice.manuallyApproved === true) return '✅'
    if (invoice.manuallyApproved === false) return '❌'
    if (invoice.isValid) return '🔵'
    return '⚠️'
  }

  return (
    <div className={`border rounded-lg p-3 ${getStatusColor()}`}>
      <div className="flex items-center justify-between">
        
        {/* Main info in one line */}
        <div className="flex-1 flex items-center gap-4 text-sm">
          <span className="font-medium w-8">{index}</span>
          <span className="text-lg">{getStatusIcon()}</span>
          <span className="font-medium min-w-0 flex-1">{invoice.guestName}</span>
          <span className="text-gray-600">{invoice.checkInDate} → {invoice.checkOutDate}</span>
          <span className="font-bold text-green-600">€{invoice.amount.toFixed(2)}</span>
          <span className="text-gray-600 min-w-0">{invoice.property}</span>
          <span className="text-xs text-gray-500 min-w-0">#{invoice.reservationNumber}</span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 ml-4">
          {invoice.issues.length > 0 && (
            <button 
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-red-600 hover:text-red-800 px-2 py-1 rounded border border-red-300 hover:bg-red-50"
            >
              {invoice.issues.length} issue{invoice.issues.length > 1 ? 's' : ''}
            </button>
          )}
          
          {!invoice.isValid && invoice.manuallyApproved === undefined && (
            <>
              <button 
                onClick={() => onApproval(invoice.id, true)}
                className="text-green-600 hover:text-green-800 font-bold text-lg px-2 py-1 rounded border border-green-300 hover:bg-green-50"
                title="Approve invoice"
              >
                ✓
              </button>
              <button 
                onClick={() => {
                  const reason = prompt('Reason for rejection (optional):') || 'Manual rejection'
                  onApproval(invoice.id, false, reason)
                }}
                className="text-red-600 hover:text-red-800 font-bold text-lg px-2 py-1 rounded border border-red-300 hover:bg-red-50"
                title="Reject invoice"
              >
                ✗
              </button>
            </>
          )}

          {invoice.manuallyApproved !== undefined && (
            <button 
              onClick={() => onApproval(invoice.id, true)}
              className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Details section */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-gray-300">
          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-2">
            <div>Source: {invoice.source}</div>
            <div>Nights: {invoice.nights || 'Unknown'}</div>
          </div>
          
          {invoice.issues.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded p-2">
              <div className="text-sm font-medium text-red-900 mb-1">Issues:</div>
              <ul className="text-sm text-red-700 space-y-1">
                {invoice.issues.map((issue, i) => (
                  <li key={i}>• {issue}</li>
                ))}
              </ul>
            </div>
          )}

          {invoice.rejectionReason && (
            <div className="bg-gray-50 border border-gray-200 rounded p-2 mt-2">
              <div className="text-sm font-medium text-gray-900">Rejection reason:</div>
              <div className="text-sm text-gray-700">{invoice.rejectionReason}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}