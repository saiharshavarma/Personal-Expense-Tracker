import { usePreferencesStore } from '@/store/preferences'

/**
 * Returns a formatCurrency function bound to the user's stored currency.
 * Falls back to USD if preferences haven't loaded yet.
 */
export function useCurrency() {
  const prefs = usePreferencesStore((s) => s.prefs)
  const currency = prefs?.currency ?? 'USD'

  const format = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)

  return { currency, format }
}
