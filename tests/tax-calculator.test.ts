import { describe, it, expect } from 'vitest'
import { calculateTaxes, formatCurrency } from '../lib/tax-calculator'

describe('Tax Calculator', () => {
  describe('calculateTaxes', () => {
    it('should calculate taxes correctly with default rates', () => {
      const grossAmount = 100
      const result = calculateTaxes(grossAmount)

      expect(result.grossAmount).toBe(100)
      expect(result.netAmount).toBe(90.91) // 100 / 1.10
      expect(result.vatAmount).toBe(9.09) // 100 - 90.91
      expect(result.cityTaxAmount).toBe(3.2) // 100 * 0.032
      expect(result.totalAmount).toBe(103.2) // 100 + 3.2
    })

    it('should calculate taxes with custom rates', () => {
      const grossAmount = 200
      const vatRate = 0.20 // 20%
      const cityTaxRate = 0.05 // 5%
      
      const result = calculateTaxes(grossAmount, vatRate, cityTaxRate)

      expect(result.grossAmount).toBe(200)
      expect(result.netAmount).toBe(166.67) // 200 / 1.20
      expect(result.vatAmount).toBe(33.33) // 200 - 166.67
      expect(result.cityTaxAmount).toBe(10) // 200 * 0.05
      expect(result.totalAmount).toBe(210) // 200 + 10
    })

    it('should handle VIENNA_METHOD city tax calculation', () => {
      const grossAmount = 110 // includes 10% VAT
      const result = calculateTaxes(grossAmount, 0.10, 0.032, 'VIENNA_METHOD')

      expect(result.grossAmount).toBe(110)
      expect(result.netAmount).toBe(100) // 110 / 1.10
      expect(result.vatAmount).toBe(10) // 110 - 100
      expect(result.cityTaxAmount).toBe(3.2) // 100 * 0.032 (net amount)
      expect(result.totalAmount).toBe(113.2) // 110 + 3.2
    })

    it('should round amounts to 2 decimal places', () => {
      const grossAmount = 123.456
      const result = calculateTaxes(grossAmount)

      expect(result.grossAmount).toBe(123.46)
      expect(result.netAmount).toBe(112.24)
      expect(result.vatAmount).toBe(11.22)
      expect(result.cityTaxAmount).toBe(3.95)
      expect(result.totalAmount).toBe(127.41)
    })
  })

  describe('formatCurrency', () => {
    it('should format EUR currency correctly', () => {
      expect(formatCurrency(123.45, 'EUR')).toBe('123,45 €')
      expect(formatCurrency(1234.56, 'EUR')).toBe('1.234,56 €')
    })

    it('should handle default EUR currency', () => {
      expect(formatCurrency(99.99)).toBe('99,99 €')
    })

    it('should format different currencies', () => {
      expect(formatCurrency(123.45, 'USD')).toBe('123,45 $')
    })

    it('should handle zero amounts', () => {
      expect(formatCurrency(0)).toBe('0,00 €')
    })
  })
})