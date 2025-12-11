'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">Invoice App</h1>
          <p className="text-gray-600 mt-2">Choose a converter tool</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Converter #1 */}
            <Link href="/csv-to-invoice" className="block">
              <div className="border-t-4 border-green-600 bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6">
                <div className="flex items-center mb-4">
                  <div className="flex-shrink-0">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-xl font-semibold text-gray-900">Converter #1: CSV → Invoice PDF</h3>
                    <p className="text-gray-600">Generate professional PDF invoices from guest data CSV</p>
                  </div>
                </div>
                
                <div className="text-sm text-gray-500 mb-4">
                  <p>• Upload guest data CSV file</p>
                  <p>• Select property configuration</p>
                  <p>• Generate branded PDF invoices</p>
                  <p>• Uses checkout date as invoice date</p>
                </div>
                
                <div className="flex justify-end">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                    CSV to PDF
                  </span>
                </div>
              </div>
            </Link>

            {/* Converter #2 */}
            <Link href="/booking-to-accounting" className="block">
              <div className="border-t-4 border-blue-600 bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6">
                <div className="flex items-center mb-4">
                  <div className="flex-shrink-0">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-xl font-semibold text-gray-900">Converter #2: Booking + Airbnb → Accounting CSV</h3>
                    <p className="text-gray-600">Convert reservations to accounting import format</p>
                  </div>
                </div>
                
                <div className="text-sm text-gray-500 mb-4">
                  <p>• Upload Booking.com and/or Airbnb CSV files</p>
                  <p>• Merge and sort by departure date</p>
                  <p>• Generate 3 accounting rows per reservation</p>
                  <p>• Austrian tax calculations (VAT + City Tax)</p>
                </div>
                
                <div className="flex justify-end">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    CSV to CSV
                  </span>
                </div>
              </div>
            </Link>

          </div>

          {/* Settings Link */}
          <div className="mt-8 text-center">
            <Link href="/settings" className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Manage Settings
            </Link>
          </div>

          {/* Quick Stats */}
          <div className="mt-12 bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Supported Formats</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Input Formats</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Booking.com reservations export</li>
                  <li>• Airbnb reservations CSV</li>
                  <li>• Guest data CSV files</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Output Formats</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• PDF invoices with company branding</li>
                  <li>• Accounting CSV (semicolon-separated)</li>
                  <li>• Austrian tax compliance format</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}