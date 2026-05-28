import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RotateCcw, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DateRangePicker, buildDateRangeFromDates } from '@/components/DateRangePicker'
import { useAccountsStore } from '@/store'
import {
  ALL_CATEGORIES,
  getSubcategories,
} from '@/lib/categories'
import { cn } from '@/lib/utils'
import type { TransactionFilters } from '@/types'


// ── Pill toggle group ──────────────────────────────────────────────────────────

interface PillOption {
  value: string
  label: string
}

function PillGroup({
  value,
  options,
  onChange,
  allLabel = 'Any',
}: {
  value: string | undefined
  options: PillOption[]
  onChange: (v: string | undefined) => void
  allLabel?: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className={cn(
          'px-3 py-1 rounded-full text-xs font-medium transition-all border',
          !value
            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
            : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground',
        )}
      >
        {allLabel}
      </button>
      {options.map((opt) => (
        <button
          type="button"
          key={opt.value}
          onClick={() => onChange(value === opt.value ? undefined : opt.value)}
          className={cn(
            'px-3 py-1 rounded-full text-xs font-medium transition-all border',
            value === opt.value
              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
              : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Toggle flag chip ───────────────────────────────────────────────────────────

function FlagChip({
  label,
  active,
  onToggle,
}: {
  label: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
        active
          ? 'bg-primary/10 text-primary border-primary/30'
          : 'bg-background text-muted-foreground border-border hover:border-primary/30 hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors flex-shrink-0',
          active ? 'bg-primary border-primary' : 'border-muted-foreground/40',
        )}
      >
        {active && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />}
      </span>
      {label}
    </button>
  )
}

// ── Section label ──────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-2">
      {children}
    </p>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface FilterPanelProps {
  open: boolean
  filters: TransactionFilters
  onChange: (filters: Partial<TransactionFilters>) => void
  onReset: () => void
}

export function FilterPanel({ open, filters, onChange, onReset }: FilterPanelProps) {
  const { accounts } = useAccountsStore()
  const [local, setLocal] = useState<TransactionFilters>(filters)

  useEffect(() => {
    if (open) setLocal(filters)
  }, [open, filters])

  const set = (patch: Partial<TransactionFilters>) =>
    setLocal((f) => ({ ...f, ...patch }))

  // Derive a DateRange from local date_from/date_to for the DateRangePicker
  const dateRange = useMemo(
    () => buildDateRangeFromDates(local.date_from, local.date_to),
    [local.date_from, local.date_to],
  )

  const apply = () => {
    // Pass the full local state — including keys set to `undefined` (meaning "clear this filter").
    // handleFilterChange strips undefined/null/'' after merging, so explicitly-cleared
    // fields override any stale values in the current filter state.
    onChange(local)
  }

  const subcats = getSubcategories(local.category ?? '')

  const activeCount = Object.entries(local).filter(([k, v]) => {
    if (['page', 'page_size', 'sort_by', 'sort_dir', 'search'].includes(k)) return false
    return v !== undefined && v !== null && v !== ''
  }).length

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <div className="mb-4 rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm">

            {/* ── Date row ── */}
            <div className="px-5 pt-4 pb-3 border-b">
              <SectionLabel>Date Range</SectionLabel>
              <DateRangePicker
                value={dateRange}
                onChange={(r) => set({
                  date_from: r.date_from ?? undefined,
                  date_to:   r.date_to   ?? undefined,
                })}
              />
            </div>

            {/* ── Amount + Account + Direction ── */}
            <div className="px-5 py-3 border-b grid grid-cols-3 gap-5">
              {/* Account */}
              <div>
                <SectionLabel>Account</SectionLabel>
                <Select
                  value={local.account_id ?? '__any'}
                  onValueChange={(v) => set({ account_id: v === '__any' ? undefined : v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Any account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any">Any account</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Direction */}
              <div>
                <SectionLabel>Type</SectionLabel>
                <PillGroup
                  value={local.direction}
                  options={[
                    { value: 'debit', label: 'Debit' },
                    { value: 'credit', label: 'Credit' },
                  ]}
                  onChange={(v) => set({ direction: v as TransactionFilters['direction'] })}
                />
              </div>

              {/* Amount range */}
              <div>
                <SectionLabel>Amount</SectionLabel>
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Min"
                      value={local.min_amount ?? ''}
                      onChange={(e) => set({ min_amount: e.target.value ? Number(e.target.value) : undefined } as Partial<TransactionFilters>)}
                      className="h-8 text-xs pl-6"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">—</span>
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Max"
                      value={local.max_amount ?? ''}
                      onChange={(e) => set({ max_amount: e.target.value ? Number(e.target.value) : undefined } as Partial<TransactionFilters>)}
                      className="h-8 text-xs pl-6"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Category row ── */}
            <div className="px-5 py-3 border-b">
              <SectionLabel>Category</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => set({ category: undefined, subcategory: undefined })}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium border transition-all',
                    !local.category
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  All
                </button>
                {ALL_CATEGORIES.map((cat) => (
                  <button
                    type="button"
                    key={cat}
                    onClick={() => set({ category: local.category === cat ? undefined : cat, subcategory: undefined })}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-medium border transition-all',
                      local.category === cat
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground',
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Subcategory — only shown if category is selected */}
              <AnimatePresence>
                {local.category && subcats.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 pt-2 border-t border-dashed">
                      <Label className="text-[11px] text-muted-foreground/60 uppercase tracking-wider mb-1.5 block">
                        Subcategory in {local.category}
                      </Label>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => set({ subcategory: undefined })}
                          className={cn(
                            'px-2.5 py-0.5 rounded-full text-xs border transition-all',
                            !local.subcategory
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground border-border hover:border-primary/40',
                          )}
                        >
                          All
                        </button>
                        {subcats.map((s) => (
                          <button
                            type="button"
                            key={s}
                            onClick={() => set({ subcategory: local.subcategory === s ? undefined : s })}
                            className={cn(
                              'px-2.5 py-0.5 rounded-full text-xs border transition-all',
                              local.subcategory === s
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-muted-foreground border-border hover:border-primary/40',
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Classification row ── */}
            <div className="px-5 py-3 border-b grid grid-cols-3 gap-5">
              <div>
                <SectionLabel>Need / Want / Savings</SectionLabel>
                <PillGroup
                  value={local.need_want_savings}
                  options={[
                    { value: 'need', label: 'Need' },
                    { value: 'want', label: 'Want' },
                    { value: 'savings', label: 'Savings' },
                  ]}
                  onChange={(v) => set({ need_want_savings: v as TransactionFilters['need_want_savings'] })}
                />
              </div>
              <div>
                <SectionLabel>Fixed / Variable</SectionLabel>
                <PillGroup
                  value={(local as Record<string, unknown>).fixed_variable as string}
                  options={[
                    { value: 'fixed', label: 'Fixed' },
                    { value: 'variable', label: 'Variable' },
                  ]}
                  onChange={(v) => set({ fixed_variable: v } as Partial<TransactionFilters>)}
                />
              </div>
              <div>
                <SectionLabel>Personal / Work</SectionLabel>
                <PillGroup
                  value={local.personal_work_shared}
                  options={[
                    { value: 'personal', label: 'Personal' },
                    { value: 'work', label: 'Work' },
                    { value: 'shared', label: 'Shared' },
                  ]}
                  onChange={(v) => set({ personal_work_shared: v as TransactionFilters['personal_work_shared'] })}
                />
              </div>
            </div>

            {/* ── Flags row ── */}
            <div className="px-5 py-3 border-b flex items-center gap-3 flex-wrap">
              <SectionLabel>Filters</SectionLabel>
              <div className="flex items-center gap-2 flex-wrap">
                <FlagChip
                  label="Reimbursable only"
                  active={local.is_reimbursable === true}
                  onToggle={() => set({ is_reimbursable: local.is_reimbursable ? undefined : true })}
                />
                <FlagChip
                  label="Recurring only"
                  active={local.is_recurring === true}
                  onToggle={() => set({ is_recurring: local.is_recurring ? undefined : true })}
                />
                <FlagChip
                  label="Needs review"
                  active={local.needs_review === true}
                  onToggle={() => set({ needs_review: local.needs_review ? undefined : true })}
                />

                {/* Reimbursement status — only shown if reimbursable flag is on */}
                <AnimatePresence>
                  {local.is_reimbursable && (
                    <motion.div
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="overflow-hidden"
                    >
                      <Select
                        value={local.reimbursement_status ?? '__any'}
                        onValueChange={(v) => set({ reimbursement_status: v === '__any' ? undefined : v as TransactionFilters['reimbursement_status'] })}
                      >
                        <SelectTrigger className="h-7 text-xs w-36 border-primary/30">
                          <SelectValue placeholder="Any status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__any">Any status</SelectItem>
                          <SelectItem value="to_submit">To Submit</SelectItem>
                          <SelectItem value="submitted">Submitted</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="partial">Partial</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Source */}
                <Select
                  value={(local as Record<string, unknown>).source as string ?? '__any'}
                  onValueChange={(v) => set({ source: v === '__any' ? undefined : v } as Partial<TransactionFilters>)}
                >
                  <SelectTrigger className="h-7 text-xs w-28">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any">Any source</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="import">Import</SelectItem>
                    <SelectItem value="ios">iOS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Footer ── */}
            <div className="px-5 py-3 flex items-center justify-between">
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset all filters
              </button>
              <div className="flex items-center gap-2">
                {activeCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {activeCount} filter{activeCount !== 1 ? 's' : ''} set
                  </span>
                )}
                <Button size="sm" onClick={apply} className="h-8 px-4">
                  Apply
                </Button>
              </div>
            </div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
