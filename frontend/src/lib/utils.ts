import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  // L-10: Guard against NaN/Infinity so callers that pass raw API values (which
  // may be null/undefined coerced to NaN) get "—" instead of a runtime exception.
  if (!isFinite(amount)) return '—'
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

// ── Review reasons helper ─────────────────────────────────────────────────────
// Returns ALL reasons WHY a transaction needs review, with a color token each.
// Used in the table and card grid to show field-level guidance.

export type ReviewReason = {
  label: string
  color: 'red' | 'yellow' | 'blue'
}

export function getReviewReasons(t: {
  needs_review?: boolean
  ai_confidence: number | null
  ai_flags?: string[]
  ai_category: string | null
  category: string | null
  subcategory?: string | null
  notes?: string | null
  source?: string
}): ReviewReason[] {
  const reasons: ReviewReason[] = []
  const conf = t.ai_confidence
  const flags = t.ai_flags ?? []

  // ── Field-level: missing data the user should fill in ──
  if (!t.category) {
    if (t.ai_category) {
      reasons.push({ label: `Category missing (AI: ${t.ai_category})`, color: 'yellow' })
    } else {
      reasons.push({ label: 'Category missing', color: 'yellow' })
    }
  } else if (!t.subcategory?.trim()) {
    reasons.push({ label: 'Pick a subcategory', color: 'yellow' })
  }
  if (!t.notes?.trim()) {
    reasons.push({ label: 'Add a note', color: 'yellow' })
  }

  // ── AI confidence ──
  if (conf !== null && t.category) {
    const pct = Math.round(conf * 100)
    if (conf < 0.75) {
      reasons.push({ label: `AI unsure — ${pct}% confident`, color: 'red' })
    } else if (conf < 0.90) {
      reasons.push({ label: `Check category — ${pct}%`, color: 'yellow' })
    }
  }

  // ── AI flags ──
  if (flags.includes('large_amount'))  reasons.push({ label: 'Unusually large amount', color: 'yellow' })
  if (flags.includes('work_expense'))  reasons.push({ label: 'Possible work expense',  color: 'blue'   })
  if (flags.includes('unusual'))       reasons.push({ label: 'Unusual transaction',     color: 'yellow' })
  if (flags.includes('reimbursable'))  reasons.push({ label: 'Possible reimbursable',   color: 'blue'   })

  // Fallback so needs_review rows always show something
  if (reasons.length === 0) {
    reasons.push({ label: 'Flagged for review', color: 'yellow' })
  }

  return reasons
}

// Back-compat single-reason shim for callers that only need one label
export function getReviewReason(t: Parameters<typeof getReviewReasons>[0]): ReviewReason | null {
  const all = getReviewReasons(t)
  return all.length > 0 ? all[0] : null
}

// ── Needs-review gate ─────────────────────────────────────────────────────────
// Returns true only when the backend `needs_review` flag is explicitly true.
// The backend is the authoritative source — it weighs AI confidence, missing
// fields, and manual overrides.  Frontend field-level hints (category missing,
// no subcategory, etc.) are surfaced via `getReviewReasons` for display, but
// must not override an explicit `needs_review=false` decision from the server.
export function isNeedsReview(t: {
  needs_review?: boolean
} | null | undefined): boolean {
  if (!t) return false
  return t.needs_review === true
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}
