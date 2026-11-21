import { describe, expect, it } from 'vitest'
import { formatMinor } from './money'

describe('formatMinor', () => {
  it.each([
    [125050, 'USD', '$1,250.50'],
    [-5000, 'USD', '-$50.00'],
    [5, 'USD', '$0.05'],
    [1250, 'JPY', '¥1,250'],
    [1250, 'KWD', 'KWD\u00a01.250'],
  ])('formats %i %s minor units as %s', (amountMinor, currency, expected) => {
    expect(formatMinor(amountMinor, currency, 'en-US')).toBe(expected)
  })
})
