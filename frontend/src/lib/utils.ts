import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

export function monthName(month: number): string {
  return new Date(2024, month - 1).toLocaleString('en-US', { month: 'long' })
}

export function monthNameShort(month: number): string {
  return new Date(2024, month - 1).toLocaleString('en-US', { month: 'short' })
}

export function getCurrentMonthYear(): { month: number; year: number } {
  const now = new Date()
  return { month: now.getMonth() + 1, year: now.getFullYear() }
}

// ── Review reason helper ──────────────────────────────────────────────────────
// Returns a specific human-readable reason WHY a transaction needs review,
// plus a color token. Used in the table and card grid instead of "Needs review".

export type ReviewReason = {
  label: string
  color: 'red' | 'yellow' | 'blue'
} | null

export function getReviewReason(t: {
  ai_confidence: number | null
  ai_flags?: string[]
  ai_category: string | null
  category: string | null
  source?: string
}): ReviewReason {
  const conf = t.ai_confidence  // 0–1 scale
  const flags = t.ai_flags ?? []

  // No category at all — highest priority
  if (!t.category && !t.ai_category) {
    return { label: 'Uncategorized', color: 'yellow' }
  }

  // AI has a suggestion but hasn't been applied yet
  if (t.ai_category && !t.category) {
    return { label: `Accept AI: ${t.ai_category}`, color: 'yellow' }
  }

  // Confidence-based reasons
  if (conf !== null) {
    const pct = Math.round(conf * 100)
    if (conf < 0.75) {
      return { label: `AI unsure — ${pct}% confident`, color: 'red' }
    }
    if (conf < 0.90) {
      return { label: `Check category — ${pct}% confident`, color: 'yellow' }
    }
  }

  // Flag-based reasons (checked after confidence)
  if (flags.includes('large_amount')) {
    return { label: 'Unusually large amount', color: 'yellow' }
  }
  if (flags.includes('work_expense')) {
    return { label: 'Possible work expense', color: 'blue' }
  }
  if (flags.includes('unusual')) {
    return { label: 'Unusual transaction', color: 'yellow' }
  }
  if (flags.includes('reimbursable')) {
    return { label: 'Possible reimbursable', color: 'blue' }
  }

  // No specific reason found — stale flag, don't surface anything
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}
