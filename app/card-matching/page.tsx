'use client'

import { useState } from 'react'
import Link from 'next/link'

interface BMDCard {
  belegnr: string
  guestName?: string
  grossAmount: number
  platform?: string
  propertyCode?: string
  documentDate: string
  rawText: string
}

interface ReservationCard {
  reservationNumber: string
  guestName: string
  amount: number
  checkIn: string
  checkOut: string
  source: string
  platform?: string
}

interface MatchedPair {
  bmd: BMDCard
  reservation: ReservationCard
}

export default function CardMatchingPage() {
  const [bmdFile, setBmdFile] = useState<File | null>(null)
  const [reservationFiles, setReservationFiles] = useState<Array<{ file: File; source: string }>>([])
  const [bmdCards, setBmdCards] = useState<BMDCard[]>([])
  const [reservationCards, setReservationCards] = useState<ReservationCard[]>([])
  const [matchedPairs, setMatchedPairs] = useState<MatchedPair[]>([])
  const [bmdOnlyCards, setBmdOnlyCards] = useState<BMDCard[]>([]) // intentionally unmatched
  const [selectedBMD, setSelectedBMD] = useState<BMDCard | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState('')
  const [downloadFormat, setDownloadFormat] = useState<'combined' | 'zip'>('combined')
  // Filters
  const [bmdFilter, setBmdFilter] = useState('')
  const [resFilter, setResFilter] = useState('')
  const [selectedMonths, setSelectedMonths] = useState<string[]>([])
  const [availableMonths, setAvailableMonths] = useState<string[]>([])

  const extractMonths = async (file: File): Promise<string[]> => {
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
      if (val && /^\d{8}$/.test(val)) months.add(`${val.substring(0, 4)}-${val.substring(4, 6)}`)
    }
    return Array.from(months).sort()
  }

  const handleBmdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBmdFile(file)
    const months = await extractMonths(file)
    setAvailableMonths(months)
    setSelectedMonths(months)
  }

  const handleReservationUpload = (e: React.ChangeEvent<HTMLInputElement>, source: string) => {
    const files = Array.from(e.target.files || [])
    setReservationFiles(prev => [...prev, ...files.map(f => ({ file: f, source }))])
  }

  const handleLoad = async () => {
    if (!bmdFile) { setMessage('Please upload a BMD file'); return }
    setLoading(true)
    setMessage('Parsing files...')
    try {
      const formData = new FormData()
      formData.append('bmdFile', bmdFile)
      formData.append('selectedMonths', JSON.stringify(selectedMonths))
      reservationFiles.forEach((item, i) => {
        formData.append(`reservationFile_${i}`, item.file)
        formData.append(`source_${i}`, item.source)
      })
      formData.append('totalReservationFiles', reservationFiles.length.toString())

      const res = await fetch('/api/card-matching', { method: 'POST', body: formData })
      const result = await res.json()

      if (!result.success) {
        setMessage('Load error: ' + (result.error || 'Unknown'))
        return
      }

      const bmdParsed: BMDCard[] = result.bmdCards || []
      setBmdCards(bmdParsed)
      setMatchedPairs([])
      setBmdOnlyCards([])
      setSelectedBMD(null)

      const reservationsParsed: ReservationCard[] = result.reservationCards || []
      setReservationCards(reservationsParsed)

      const warningSuffix = result.warnings?.length
        ? ` (${result.warnings.length} warnings)`
        : ''

      setMessage(`Loaded ${bmdParsed.length} BMD invoices and ${reservationsParsed.length} reservations${warningSuffix}. Click a BMD card, then a reservation to pair them.`)
    } catch (err) {
      setMessage('Error: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally {
      setLoading(false)
    }
  }

  const handleBMDClick = (card: BMDCard) => {
    // If already matched or BMD-only, don't select
    if (matchedPairs.some(p => p.bmd.belegnr === card.belegnr)) return
    if (bmdOnlyCards.some(c => c.belegnr === card.belegnr)) return
    setSelectedBMD(prev => prev?.belegnr === card.belegnr ? null : card)
  }

  const handleReservationClick = (res: ReservationCard) => {
    if (!selectedBMD) return
    if (matchedPairs.some(p => p.reservation.reservationNumber === res.reservationNumber)) return
    setMatchedPairs(prev => [...prev, { bmd: selectedBMD, reservation: res }])
    setSelectedBMD(null)
  }

  const handleMarkBMDOnly = (card: BMDCard) => {
    if (matchedPairs.some(p => p.bmd.belegnr === card.belegnr)) return
    setBmdOnlyCards(prev => prev.some(c => c.belegnr === card.belegnr) ? prev : [...prev, card])
    if (selectedBMD?.belegnr === card.belegnr) setSelectedBMD(null)
  }

  const handleUnmatch = (pair: MatchedPair) => {
    setMatchedPairs(prev => prev.filter(p => p.bmd.belegnr !== pair.bmd.belegnr))
  }

  const handleUnmarkBMDOnly = (card: BMDCard) => {
    setBmdOnlyCards(prev => prev.filter(c => c.belegnr !== card.belegnr))
  }

  const handleGenerate = async () => {
    const totalPairs = matchedPairs.length + bmdOnlyCards.length
    if (totalPairs === 0) { setMessage('No matched pairs to generate'); return }
    setGenerating(true)
    setMessage('Generating invoices...')
    try {
      // Build CSV rows for matched pairs
      const csvRows: any[] = []

      for (const pair of matchedPairs) {
        csvRows.push({
          invoiceNumber: pair.bmd.belegnr,
          guestName: pair.reservation.guestName,
          checkInDate: pair.reservation.checkIn,
          checkOutDate: pair.reservation.checkOut,
          amountPaidGross: pair.bmd.grossAmount,
          reservationId: pair.reservation.reservationNumber,
          propertyId: pair.bmd.propertyCode || 'default',
          currency: 'EUR',
          nights: calcNights(pair.reservation.checkIn, pair.reservation.checkOut),
        })
      }

      for (const bmd of bmdOnlyCards) {
        csvRows.push({
          invoiceNumber: bmd.belegnr,
          guestName: bmd.guestName || 'Guest',
          checkInDate: bmd.documentDate,
          checkOutDate: bmd.documentDate,
          amountPaidGross: bmd.grossAmount,
          reservationId: bmd.belegnr,
          propertyId: bmd.propertyCode || 'default',
          currency: 'EUR',
          nights: 1,
        })
      }

      const response = await fetch('/api/generate-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvRows, format: downloadFormat }),
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const cd = response.headers.get('Content-Disposition')
        a.download = cd?.match(/filename="([^"]+)"/)?.[1] || (downloadFormat === 'combined' ? 'invoices.pdf' : 'invoices.zip')
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        setMessage(`✅ ${csvRows.length} invoices generated!`)
      } else {
        setMessage('Error generating: ' + await response.text())
      }
    } catch (err) {
      setMessage('Error: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally {
      setGenerating(false)
    }
  }

  const calcNights = (checkIn: string, checkOut: string): number => {
    try {
      const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime()
      return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)))
    } catch { return 1 }
  }

  const formatDate = (d: string) => {
    if (!d) return ''
    try { return new Date(d).toLocaleDateString('de-AT') } catch { return d }
  }

  const unmatchedBMD = bmdCards.filter(
    c => !matchedPairs.some(p => p.bmd.belegnr === c.belegnr) && !bmdOnlyCards.some(x => x.belegnr === c.belegnr)
  )
  const unmatchedRes = reservationCards.filter(
    r => !matchedPairs.some(p => p.reservation.reservationNumber === r.reservationNumber)
  )

  const filteredBMD = unmatchedBMD.filter(c => {
    const q = bmdFilter.toLowerCase()
    return !q || c.belegnr.toLowerCase().includes(q) || c.guestName?.toLowerCase().includes(q) || String(c.grossAmount).includes(q) || c.platform?.toLowerCase().includes(q)
  })

  const filteredRes = unmatchedRes.filter(r => {
    const q = resFilter.toLowerCase()
    return !q || r.reservationNumber.toLowerCase().includes(q) || r.guestName.toLowerCase().includes(q) || String(r.amount).includes(q) || r.source.toLowerCase().includes(q)
  })

  const platformColor = (platform?: string) => {
    if (!platform) return 'bg-gray-100 text-gray-600'
    if (platform.toLowerCase().includes('booking')) return 'bg-blue-100 text-blue-700'
    if (platform.toLowerCase().includes('airbnb')) return 'bg-pink-100 text-pink-700'
    return 'bg-gray-100 text-gray-600'
  }

  const sourceColor = (source: string) => {
    if (source === 'BOOKING_COM') return 'bg-blue-100 text-blue-700'
    if (source === 'AIRBNB') return 'bg-pink-100 text-pink-700'
    return 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Card Matching</h1>
            <p className="text-gray-600 mt-1">Pair BMD invoices with reservations manually, then generate PDFs</p>
          </div>
          <Link href="/" className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
            ← Back
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">

        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">1. Upload Files</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">BMD File *</label>
              <input type="file" accept=".csv" onChange={handleBmdUpload}
                className="w-full text-sm border border-gray-300 rounded px-3 py-2" />
              {availableMonths.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500 mb-1">Months in file:</p>
                  <div className="flex flex-wrap gap-1">
                    {availableMonths.map(m => (
                      <label key={m} className="flex items-center gap-1 text-xs cursor-pointer">
                        <input type="checkbox" checked={selectedMonths.includes(m)}
                          onChange={e => setSelectedMonths(prev => e.target.checked ? [...prev, m].sort() : prev.filter(x => x !== m))}
                          className="accent-purple-600" />
                        {new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Booking.com CSV</label>
              <input type="file" accept=".csv" multiple onChange={e => handleReservationUpload(e, 'BOOKING_COM')}
                className="w-full text-sm border border-gray-300 rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Airbnb CSV</label>
              <input type="file" accept=".csv" multiple onChange={e => handleReservationUpload(e, 'AIRBNB')}
                className="w-full text-sm border border-gray-300 rounded px-3 py-2" />
            </div>
          </div>
          {reservationFiles.length > 0 && (
            <p className="text-xs text-gray-500 mt-2">{reservationFiles.length} reservation file(s) loaded</p>
          )}
          <button onClick={handleLoad} disabled={!bmdFile || loading}
            className="mt-4 px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 font-medium">
            {loading ? 'Loading...' : 'Load Cards'}
          </button>
          {message && <p className="mt-3 text-sm text-gray-600">{message}</p>}
        </div>

        {/* Matching Area */}
        {(bmdCards.length > 0) && (
          <>
            {/* Instructions */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3 text-sm text-purple-800">
              <strong>How to match:</strong> Click a <span className="font-semibold">BMD card</span> (left) to select it (turns yellow border), then click the matching <span className="font-semibold">reservation card</span> (right) to pair them. Use <strong>"BMD Only"</strong> on a BMD card to mark it as needing no reservation. Matched pairs appear below.
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* BMD Cards */}
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-900">BMD Invoices
                    <span className="ml-2 text-sm text-gray-500">({filteredBMD.length} unmatched)</span>
                  </h2>
                </div>
                <input type="text" placeholder="Filter by name, amount, #..." value={bmdFilter}
                  onChange={e => setBmdFilter(e.target.value)}
                  className="w-full mb-3 px-3 py-1.5 text-sm border border-gray-300 rounded" />
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {filteredBMD.length === 0 && <p className="text-sm text-gray-400 text-center py-8">All BMD invoices matched or filtered</p>}
                  {filteredBMD.map(card => {
                    const isSelected = selectedBMD?.belegnr === card.belegnr
                    return (
                      <div key={card.belegnr}
                        onClick={() => handleBMDClick(card)}
                        className={`rounded-lg border-2 p-3 cursor-pointer transition-all ${isSelected ? 'border-yellow-400 bg-yellow-50 shadow-md' : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-gray-800">#{card.belegnr}</span>
                              {card.platform && <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${platformColor(card.platform)}`}>{card.platform}</span>}
                              {card.propertyCode && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{card.propertyCode}</span>}
                            </div>
                            {card.guestName && <p className="text-sm text-gray-700 mt-0.5">{card.guestName}</p>}
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-sm font-semibold text-green-700">€{card.grossAmount?.toFixed(2)}</span>
                              <span className="text-xs text-gray-400">{formatDate(card.documentDate)}</span>
                            </div>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); handleMarkBMDOnly(card) }}
                            className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 shrink-0">
                            BMD Only
                          </button>
                        </div>
                        {isSelected && (
                          <p className="text-xs text-yellow-700 mt-1 font-medium">▶ Now click a reservation to pair</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Reservation Cards */}
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-900">Reservations
                    <span className="ml-2 text-sm text-gray-500">({filteredRes.length} unmatched)</span>
                  </h2>
                </div>
                {reservationCards.length === 0
                  ? <p className="text-sm text-gray-400 text-center py-16">Upload reservation files above to see cards here</p>
                  : <>
                    <input type="text" placeholder="Filter by name, amount, #..." value={resFilter}
                      onChange={e => setResFilter(e.target.value)}
                      className="w-full mb-3 px-3 py-1.5 text-sm border border-gray-300 rounded" />
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                      {filteredRes.length === 0 && <p className="text-sm text-gray-400 text-center py-8">All reservations matched or filtered</p>}
                      {filteredRes.map(res => {
                        const isTarget = !!selectedBMD
                        return (
                          <div key={res.reservationNumber}
                            onClick={() => handleReservationClick(res)}
                            className={`rounded-lg border-2 p-3 transition-all ${isTarget ? 'cursor-pointer border-gray-200 hover:border-green-400 hover:bg-green-50 hover:shadow-md' : 'border-gray-200 cursor-default'}`}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${sourceColor(res.source)}`}>{res.source === 'BOOKING_COM' ? 'Booking.com' : res.source}</span>
                              <span className="text-xs text-gray-400 font-mono">{res.reservationNumber}</span>
                            </div>
                            <p className="text-sm font-medium text-gray-800 mt-0.5">{res.guestName}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-sm font-semibold text-green-700">€{res.amount?.toFixed(2)}</span>
                              <span className="text-xs text-gray-400">{formatDate(res.checkIn)} → {formatDate(res.checkOut)}</span>
                            </div>
                            {isTarget && <p className="text-xs text-green-600 mt-1 font-medium">▶ Click to pair with #{selectedBMD?.belegnr}</p>}
                          </div>
                        )
                      })}
                    </div>
                  </>
                }
              </div>
            </div>

            {/* Matched Pairs */}
            {(matchedPairs.length > 0 || bmdOnlyCards.length > 0) && (
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-900">
                    Matched Pairs &amp; BMD-Only
                    <span className="ml-2 text-sm text-gray-500">({matchedPairs.length + bmdOnlyCards.length} total)</span>
                  </h2>
                  <div className="flex items-center gap-3">
                    <select value={downloadFormat} onChange={e => setDownloadFormat(e.target.value as any)}
                      className="text-sm border border-gray-300 rounded px-2 py-1">
                      <option value="combined">Combined PDF</option>
                      <option value="zip">ZIP (per property)</option>
                    </select>
                    <button onClick={handleGenerate} disabled={generating}
                      className="px-5 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 font-medium text-sm">
                      {generating ? 'Generating...' : `Generate ${matchedPairs.length + bmdOnlyCards.length} Invoices`}
                    </button>
                  </div>
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {matchedPairs.map(pair => (
                    <div key={pair.bmd.belegnr} className="flex items-center gap-3 p-2 bg-green-50 border border-green-200 rounded">
                      <div className="flex-1 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="font-semibold text-gray-700">#{pair.bmd.belegnr}</span>
                          {pair.bmd.guestName && <span className="text-gray-500"> · {pair.bmd.guestName}</span>}
                          <span className="text-green-700 ml-2">€{pair.bmd.grossAmount?.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">{pair.reservation.guestName}</span>
                          <span className="text-xs text-gray-400 ml-2">{pair.reservation.reservationNumber}</span>
                        </div>
                      </div>
                      <button onClick={() => handleUnmatch(pair)} className="text-xs text-red-500 hover:text-red-700 px-2">✕</button>
                    </div>
                  ))}
                  {bmdOnlyCards.map(card => (
                    <div key={card.belegnr} className="flex items-center gap-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                      <div className="flex-1 text-sm">
                        <span className="font-semibold text-gray-700">#{card.belegnr}</span>
                        {card.guestName && <span className="text-gray-500"> · {card.guestName}</span>}
                        <span className="text-green-700 ml-2">€{card.grossAmount?.toFixed(2)}</span>
                        <span className="ml-2 text-xs bg-yellow-200 text-yellow-800 px-1.5 rounded">BMD only</span>
                      </div>
                      <button onClick={() => handleUnmarkBMDOnly(card)} className="text-xs text-red-500 hover:text-red-700 px-2">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
