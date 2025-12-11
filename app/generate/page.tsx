'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Generate() {
  const router = useRouter()

  useEffect(() => {
    // Auto-redirect to home page after 5 seconds
    const timer = setTimeout(() => {
      router.push('/')
    }, 5000)

    return () => clearTimeout(timer)
  }, [router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-6 text-center">
        <div className="mb-4">
          <svg className="mx-auto h-12 w-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Converters Have Been Separated</h1>
        <p className="text-gray-600 mb-6">
          The converters are now available on separate pages for better organization.
        </p>
        
        <div className="space-y-3">
          <Link 
            href="/csv-to-invoice"
            className="block w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
          >
            CSV → Invoice PDF
          </Link>
          <Link 
            href="/booking-to-accounting"
            className="block w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Booking + Airbnb → Accounting CSV
          </Link>
          <Link 
            href="/"
            className="block w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors"
          >
            Back to Home
          </Link>
        </div>
        
        <p className="text-xs text-gray-500 mt-4">
          Redirecting to home page in 5 seconds...
        </p>
      </div>
    </div>
  )
}