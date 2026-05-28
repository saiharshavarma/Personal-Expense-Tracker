/**
 * DateRangePicker
 *
 * A compact, self-contained date-range selector with:
 *   • Quick-select presets (This Month, Last Month, 3 M, 6 M, This Year, All Time)
 *   • Custom from/to date inputs
 *   • Floating panel (no extra dependency — pure React + CSS)
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { CalendarDays, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DateRange {
  label: string
  date_from: string | null   // YYYY-MM-DD  or null (= all time)
  date_to: string | null     // YYYY-MM-DD  or null
}

interface Preset {
  key: string
  label: string
  build: () => { date_from: string | null; date_to: string | null }
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function toISO(d: Date) {
  return d.toISOString().slice(0, 10)
}

function today() {
  return toISO(new Date())
}

function monthStart(d: Date) {
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1))
}

function monthEnd(d: Date) {
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

// ── Presets ───────────────────────────────────────────────────────────────────

const PRESETS: Preset[] = [
  {
    key: 'this_month',
    label: 'This Month',
    build: () => {
      const now = new Date()
      return { date_from: monthStart(now), date_to: today() }
    },
  },
  {
    key: 'last_month',
    label: 'Last Month',
    build: () => {
      const prev = addMonths(new Date(), -1)
      return { date_from: monthStart(prev), date_to: monthEnd(prev) }
    },
  },
  {
    key: '3_months',
    label: 'Last 3 Months',
    build: () => {
      const start = addMonths(new Date(), -2)
      return { date_from: monthStart(start), date_to: today() }
    },
  },
  {
    key: '6_months',
    label: 'Last 6 Months',
    build: () => {
      const start = addMonths(new Date(), -5)
      return { date_from: monthStart(start), date_to: today() }
    },
  },
  {
    key: 'this_year',
    label: 'This Year',
    build: () => {
      const y = new Date().getFullYear()
      return { date_from: `${y}-01-01`, date_to: today() }
    },
  },
  {
    key: 'all_time',
    label: 'All Time',
    build: () => ({ date_from: null, date_to: null }),
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
}

export function DateRangePicker({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState(value.date_from ?? '')
  const [customTo, setCustomTo] = useState(value.date_to ?? '')
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Detect which preset is active for the current value
  useEffect(() => {
    const match = PRESETS.find(p => {
      const built = p.build()
      return built.date_from === value.date_from && built.date_to === value.date_to
    })
    setActivePreset(match?.key ?? (value.date_from || value.date_to ? 'custom' : 'all_time'))
  }, [value])

  // Close on outside click
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

  const selectPreset = useCallback((preset: Preset) => {
    const { date_from, date_to } = preset.build()
    setCustomFrom(date_from ?? '')
    setCustomTo(date_to ?? '')
    onChange({ label: preset.label, date_from, date_to })
    setActivePreset(preset.key)
    setOpen(false)
  }, [onChange])

  const applyCustom = useCallback(() => {
    if (!customFrom && !customTo) {
      // Treat as "All Time"
      onChange({ label: 'All Time', date_from: null, date_to: null })
      setActivePreset('all_time')
    } else {
      const from = customFrom || null
      const to = customTo || null
      let label = 'Custom Range'
      if (from && to) label = `${from} → ${to}`
      else if (from) label = `From ${from}`
      else if (to) label = `Until ${to}`
      onChange({ label, date_from: from, date_to: to })
      setActivePreset('custom')
    }
    setOpen(false)
  }, [customFrom, customTo, onChange])

  const clearCustom = useCallback(() => {
    setCustomFrom('')
    setCustomTo('')
  }, [])

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      {/* ── Trigger button ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-2 h-9 px-3 rounded-lg border bg-background text-sm',
          'text-foreground hover:border-primary/60 hover:bg-accent transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-primary/30',
          open && 'border-primary/60 bg-accent',
        )}
      >
        <CalendarDays className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="font-medium max-w-[180px] truncate">{value.label}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {/* ── Floating panel ── */}
      {open && (
        <div
          className={cn(
            'absolute z-50 top-full mt-2 left-0',
            'w-72 rounded-xl border bg-popover shadow-lg',
            'animate-in fade-in-0 zoom-in-95 duration-150',
          )}
        >
          {/* Presets */}
          <div className="p-3 border-b">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-0.5">
              Quick Select
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {PRESETS.map(preset => (
                <button
                  key={preset.key}
                  onClick={() => selectPreset(preset)}
                  className={cn(
                    'flex items-center justify-center h-8 rounded-md text-xs font-medium transition-colors px-2',
                    activePreset === preset.key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom range */}
          <div className="p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-0.5">
              Custom Range
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="w-8 text-xs text-muted-foreground flex-shrink-0">From</label>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || today()}
                  onChange={e => {
                    setCustomFrom(e.target.value)
                    setActivePreset('custom')
                  }}
                  className={cn(
                    'flex-1 h-8 rounded-md border bg-background px-2 text-xs text-foreground',
                    'focus:outline-none focus:ring-1 focus:ring-primary transition-colors',
                    '[color-scheme:light] dark:[color-scheme:dark]',
                  )}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-8 text-xs text-muted-foreground flex-shrink-0">To</label>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  max={today()}
                  onChange={e => {
                    setCustomTo(e.target.value)
                    setActivePreset('custom')
                  }}
                  className={cn(
                    'flex-1 h-8 rounded-md border bg-background px-2 text-xs text-foreground',
                    'focus:outline-none focus:ring-1 focus:ring-primary transition-colors',
                    '[color-scheme:light] dark:[color-scheme:dark]',
                  )}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                {(customFrom || customTo) && (
                  <button
                    onClick={clearCustom}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="w-3 h-3" /> Clear
                  </button>
                )}
                <button
                  onClick={applyCustom}
                  className="ml-auto h-7 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Default export helper ─────────────────────────────────────────────────────

/** Build the default "This Month" range for initial state. */
export function defaultRange(): DateRange {
  return { label: 'This Month', ...PRESETS[0].build() }
}

/**
 * Given stored date_from/date_to strings, reconstruct a labelled DateRange.
 * Matches against known presets; falls back to "Custom Range" or "All Time".
 */
export function buildDateRangeFromDates(
  date_from: string | null | undefined,
  date_to: string | null | undefined,
): DateRange {
  const df = date_from ?? null
  const dt = date_to ?? null
  if (!df && !dt) return { label: 'All Time', date_from: null, date_to: null }
  const match = PRESETS.find(p => {
    const b = p.build()
    return b.date_from === df && b.date_to === dt
  })
  if (match) return { label: match.label, date_from: df, date_to: dt }
  let label = 'Custom Range'
  if (df && dt) label = `${df} → ${dt}`
  else if (df)  label = `From ${df}`
  else if (dt)  label = `Until ${dt}`
  return { label, date_from: df, date_to: dt }
}
