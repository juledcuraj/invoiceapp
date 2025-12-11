'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Company, Property } from '@/lib/types'

export default function Settings() {
  const [activeTab, setActiveTab] = useState('company')
  const [company, setCompany] = useState<Company | null>(null)
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [companyResponse, propertiesResponse] = await Promise.all([
        fetch('/api/company'),
        fetch('/api/properties')
      ])
      
      if (companyResponse.ok) {
        const companyData = await companyResponse.json()
        setCompany(companyData)
      }
      
      if (propertiesResponse.ok) {
        const propertiesData = await propertiesResponse.json()
        setProperties(propertiesData)
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
              <p className="mt-2 text-gray-600">Configure company details and manage properties</p>
            </div>
            <Link
              href="/"
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-200"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('company')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'company'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Company Settings
            </button>
            <button
              onClick={() => setActiveTab('properties')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'properties'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Properties ({properties.length})
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'company' && (
          <CompanySettings company={company} onUpdate={loadData} />
        )}
        
        {activeTab === 'properties' && (
          <PropertiesSettings properties={properties} onUpdate={loadData} />
        )}
      </main>
    </div>
  )
}

function CompanySettings({ company, onUpdate }: { company: Company | null; onUpdate: () => void }) {
  const [formData, setFormData] = useState<Company>({
    legalName: '',
    address: '',
    email: '',
    phone: '',
    taxId: '',
    bankDetails: {
      bankName: '',
      iban: '',
      bic: '',
    },
    footerText: '',
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (company) {
      setFormData(company)
    }
  }, [company])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    try {
      const response = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        setMessage('Company settings saved successfully!')
        onUpdate()
      } else {
        const error = await response.text()
        setMessage(`Error: ${error}`)
      }
    } catch (error) {
      setMessage('Error saving company settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Company Information</h2>
      
      {message && (
        <div className={`mb-4 p-3 rounded ${
          message.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
        }`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Legal Name *
            </label>
            <input
              type="text"
              value={formData.legalName}
              onChange={(e) => setFormData(prev => ({ ...prev, legalName: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tax ID (UID) *
            </label>
            <input
              type="text"
              value={formData.taxId}
              onChange={(e) => setFormData(prev => ({ ...prev, taxId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Address *
          </label>
          <textarea
            value={formData.address}
            onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Phone *
            </label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Bank Details</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bank Name *
              </label>
              <input
                type="text"
                value={formData.bankDetails.bankName}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  bankDetails: { ...prev.bankDetails, bankName: e.target.value }
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  IBAN *
                </label>
                <input
                  type="text"
                  value={formData.bankDetails.iban}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    bankDetails: { ...prev.bankDetails, iban: e.target.value }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  BIC *
                </label>
                <input
                  type="text"
                  value={formData.bankDetails.bic}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    bankDetails: { ...prev.bankDetails, bic: e.target.value }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Footer Text
          </label>
          <textarea
            value={formData.footerText}
            onChange={(e) => setFormData(prev => ({ ...prev, footerText: e.target.value }))}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Optional text for invoice footer"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Company Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}

function PropertiesSettings({ properties, onUpdate }: { properties: Property[]; onUpdate: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [editingProperty, setEditingProperty] = useState<Property | null>(null)

  const handleEdit = (property: Property) => {
    setEditingProperty(property)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this property?')) return

    try {
      const response = await fetch(`/api/properties/${id}`, { method: 'DELETE' })
      if (response.ok) {
        onUpdate()
      } else {
        alert('Error deleting property')
      }
    } catch (error) {
      alert('Error deleting property')
    }
  }

  const handleFormClose = () => {
    setShowForm(false)
    setEditingProperty(null)
    onUpdate()
  }

  return (
    <div>
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Properties</h2>
          <button
            onClick={() => setShowForm(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
          >
            + Add Property
          </button>
        </div>

        {properties.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <p>No properties configured yet</p>
            <p className="text-sm">Add your first property to start generating invoices</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {properties.map((property) => (
              <div key={property.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{property.name}</h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(property)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(property.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-2">{property.address}</p>
                <div className="text-sm text-gray-500">
                  <p><strong>Prefix:</strong> {property.invoicePrefix}</p>
                  <p><strong>VAT:</strong> {(property.vatRate * 100).toFixed(1)}%</p>
                  <p><strong>City Tax:</strong> {(property.cityTaxRate * 100).toFixed(1)}%</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <PropertyForm
          property={editingProperty}
          onClose={handleFormClose}
        />
      )}
    </div>
  )
}

function PropertyForm({ property, onClose }: { property: Property | null; onClose: () => void }) {
  const [formData, setFormData] = useState<Omit<Property, 'id'> & { id?: string }>({
    id: '',
    name: '',
    address: '',
    invoicePrefix: '',
    defaultCurrency: 'EUR',
    vatRate: 0.10,
    cityTaxRate: 0.032,
    cityTaxHandling: 'SIMPLE' as const,
    serviceFee: 0,
    active: true
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (property) {
      setFormData(property)
    }
  }, [property])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    try {
      const url = property ? `/api/properties/${property.id}` : '/api/properties'
      const method = property ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        onClose()
      } else {
        const error = await response.text()
        setMessage(`Error: ${error}`)
      }
    } catch (error) {
      setMessage('Error saving property')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          {property ? 'Edit Property' : 'Add New Property'}
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded ${
          message.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
        }`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Property Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Invoice Prefix *
            </label>
            <input
              type="text"
              value={formData.invoicePrefix}
              onChange={(e) => setFormData(prev => ({ ...prev, invoicePrefix: e.target.value.toUpperCase() }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., APT01"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Property Address *
          </label>
          <textarea
            value={formData.address}
            onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              VAT Rate (%)
            </label>
            <input
              type="number"
              step="0.1"
              value={formData.vatRate * 100}
              onChange={(e) => setFormData(prev => ({ ...prev, vatRate: parseFloat(e.target.value) / 100 }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              City Tax Rate (%)
            </label>
            <input
              type="number"
              step="0.1"
              value={formData.cityTaxRate * 100}
              onChange={(e) => setFormData(prev => ({ ...prev, cityTaxRate: parseFloat(e.target.value) / 100 }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              City Tax Mode
            </label>
            <select
              value={formData.cityTaxHandling}
              onChange={(e) => setFormData(prev => ({ ...prev, cityTaxHandling: e.target.value as 'SIMPLE' | 'VIENNA_METHOD' }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="SIMPLE">Simple</option>
              <option value="VIENNA_METHOD">Vienna Method</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : property ? 'Update Property' : 'Add Property'}
          </button>
        </div>
      </form>
    </div>
  )
}