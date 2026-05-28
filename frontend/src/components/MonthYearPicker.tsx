/**
 * MonthYearPicker
 *
 * A polished month + year selector used on Dashboard, Analytics, and Budget.
 * Renders as:  ‹  January 2025  ›  with an optional "Today" pill.
 *
 * Clicking the centre label opens a floating dropdown with:
 *   • Year row with ‹ / › navigation
 *   • 4 × 3 grid of month buttons
 *   • Future months disabled (capped at today)
 */

import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { monthName } from '@/lib/utils'

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

interface Props {
  month: number           // 1 – 12
  year: number
  onChange: (month: number, year: number) => void
  /** Earliest selectable year (default: currentYear − 5) */
  minYear?: number
  /** Latest selectable month (default: current month/year) */
  maxMonth?: number
  maxYear?: number
  /** Whether to show a "Today" shortcut button next to the picker */
  showToday?: boolean
  className?: string
}

export function MonthYearPicker({
  month,
  year,
  onChange,
  minYear,
  maxMonth,
  maxYear,
  showToday = true,
  className,
}: Props) {
  const today = new Date()
  const capMonth = maxMonth ?? today.getMonth() + 1
  const capYear  = maxYear  ?? today.getFullYear()
  const floorYear = minYear ?? capYear - 10

  const isCurrentMonth = month === (today.getMonth() + 1) && year === today.getFullYear()

  // prev / next helpers ──────────────────────────────────────────────────────
  const goPrev = () => {
    if (month === 1) onChange(12, year - 1)
    else             onChange(month - 1, year)
  }
  const goNext = () => {
    if (month === 12) onChange(1, year + 1)
    else              onChange(month + 1, year)
  }
  const atMax = month === capMonth && year === capYear

  // dropdown state ───────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false)
  const [dropYear, setDropYear] = useState(year)
  const containerRef = useRef<HTMLDivElement>(null)

  // sync dropYear when picker year changes externally
  useEffect(() => { setDropYear(year) }, [year])

  // close on outside click
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const selectMonth = (m: number) => {
    onChange(m, dropYear)
    setOpen(false)
  }

  const isMonthDisabled = (m: number) =>
    dropYear > capYear || (dropYear === capYear && m > capMonth)

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* ── Picker strip ── */}
      <div ref={containerRef} className="relative flex items-center rounded-lg border bg-card">
        {/* Prev */}
        <button
          onClick={goPrev}
          disabled={year <= floorYear && month === 1}
          className="p-2 hover:bg-accent rounded-l-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Label — clickable to open dropdown */}
        <button
          onClick={() => { setDropYear(year); setOpen(v => !v) }}
          className={cn(
            'px-3 py-1.5 text-sm font-medium min-w-[130px] text-center',
            'hover:bg-accent transition-colors rounded-none',
            open && 'bg-accent',
          )}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          {monthName(month)} {year}
        </button>

        {/* Next */}
        <button
          onClick={goNext}
          disabled={atMax}
          className="p-2 hover:bg-accent rounded-r-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* ── Dropdown panel ── */}
        {open && (
          <div
            className={cn(
              'absolute z-50 top-full mt-2 left-1/2 -translate-x-1/2',
              'w-60 rounded-xl border bg-popover shadow-lg p-3',
              'animate-in fade-in-0 zoom-in-95 duration-150',
            )}
          >
            {/* Year navigation */}
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setDropYear(y => Math.max(y - 1, floorYear))}
                disabled={dropYear <= floorYear}
                className="p-1 rounded hover:bg-accent transition-colors disabled:opacity-30"
                aria-label="Previous year"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-sm font-semibold">{dropYear}</span>
              <button
                onClick={() => setDropYear(y => Math.min(y + 1, capYear))}
                disabled={dropYear >= capYear}
                className="p-1 rounded hover:bg-accent transition-colors disabled:opacity-30"
                aria-label="Next year"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Month grid — 4 × 3 */}
            <div className="grid grid-cols-3 gap-1">
              {MONTH_LABELS.map((label, i) => {
                const m = i + 1
                const isSelected = m === month && dropYear === year
                const isDisabled = isMonthDisabled(m)
                return (
                  <button
                    key={m}
                    onClick={() => !isDisabled && selectMonth(m)}
                    disabled={isDisabled}
                    className={cn(
                      'h-8 rounded-md text-xs font-medium transition-colors',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : isDisabled
                        ? 'text-muted-foreground/40 cursor-not-allowed'
                        : 'hover:bg-accent text-foreground',
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── "Today" shortcut ── */}
      {showToday && !isCurrentMonth && (
        <button
          onClick={() => onChange(today.getMonth() + 1, today.getFullYear())}
          className="text-xs text-muted-foreground hover:text-foreground border rounded-md px-2.5 py-1.5 hover:bg-accent transition-colors"
        >
          Today
        </button>
      )}
    </div>
  )
}
