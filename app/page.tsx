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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Accounting Converter - First */}
            <Link href="/booking-to-accounting" className="block">
              <div className="border-t-4 border-blue-600 bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6">
                <div className="flex items-center mb-4">
                  <div className="flex-shrink-0">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-xl font-semibold text-gray-900">Accounting Converter</h3>
                    <p className="text-gray-600 text-sm">Booking + Airbnb → Accounting CSV</p>
                  </div>
                </div>
                
                <div className="text-sm text-gray-500 mb-4">
                  <p>• Upload reservation CSV files</p>
                  <p>• Merge and sort by departure date</p>
                  <p>• Generate accounting rows</p>
                  <p>• Austrian tax calculations</p>
                </div>
                
                <div className="flex justify-end">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    CSV to CSV
                  </span>
                </div>
              </div>
            </Link>

            {/* Invoice Converter - Second */}
            <Link href="/csv-to-invoice" className="block">
              <div className="border-t-4 border-green-600 bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6">
                <div className="flex items-center mb-4">
                  <div className="flex-shrink-0">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-xl font-semibold text-gray-900">BMD Invoice Converter</h3>
                    <p className="text-gray-600 text-sm">BMD + Reservations → PDF</p>
                  </div>
                </div>
                
                <div className="text-sm text-gray-500 mb-4">
                  <p>• Upload BMD + Reservations</p>
                  <p>• Match invoice numbers</p>
                  <p>• Generate branded PDFs</p>
                  <p>• Smart validation system</p>
                </div>
                
                <div className="flex justify-end">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                    CSV to PDF
                  </span>
                </div>
              </div>
            </Link>

            {/* Card Matching - Third */}
            <Link href="/card-matching" className="block">
              <div className="border-t-4 border-purple-600 bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6">
                <div className="flex items-center mb-4">
                  <div className="flex-shrink-0">
                    <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8M8 12h8M8 17h4M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-xl font-semibold text-gray-900">Card Matching</h3>
                    <p className="text-gray-600 text-sm">BMD + Reservations → Manual Match → PDF</p>
                  </div>
                </div>

                <div className="text-sm text-gray-500 mb-4">
                  <p>• Upload BMD + reservation files</p>
                  <p>• Manually pair BMD ↔ reservation cards</p>
                  <p>• Review matches before generating</p>
                  <p>• Generate accurate PDF invoices</p>
                </div>

                <div className="flex justify-end">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                    Manual Match
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
            <h3 className="text-lg font-medium text-gray-900 mb-4">Available Processing Options</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h4 className="font-medium text-blue-700 mb-2">🧮 Accounting Converter</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Booking.com + Airbnb CSV</li>
                  <li>• → Accounting import format</li>
                  <li>• Austrian tax compliance</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-green-700 mb-2">📄 BMD Invoice System</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• BMD file + Reservations</li>
                  <li>• → Automatic matching</li>
                  <li>• → Professional PDF invoices</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-purple-700 mb-2">🃏 Card Matching</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• BMD + reservation files</li>
                  <li>• → Manual card-by-card pairing</li>
                  <li>• → Accurate PDF invoices</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}