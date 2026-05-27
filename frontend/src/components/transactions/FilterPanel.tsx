import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { useAccountsStore } from '@/store'
import {
  ALL_CATEGORIES,
  getSubcategories,
  NEED_WANT_SAVINGS_OPTIONS,
  FIXED_VARIABLE_OPTIONS,
  PERSONAL_WORK_OPTIONS,
  REIMBURSEMENT_STATUS_OPTIONS,
  TRANSACTION_SOURCE_OPTIONS,
} from '@/lib/categories'
import type { TransactionFilters } from '@/types'

interface FilterPanelProps {
  open: boolean
  filters: TransactionFilters
  onChange: (filters: Partial<TransactionFilters>) => void
  onReset: () => void
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{title}</p>
      {children}
    </div>
  )
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
  placeholder = 'Any',
}: {
  label: string
  value: string | undefined
  options: { value: string; label: string }[]
  onChange: (v: string | undefined) => void
  placeholder?: string
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select
        value={value ?? '__any'}
        onValueChange={(v) => onChange(v === '__any' ? undefined : v)}
      >
        <SelectTrigger className="mt-1 h-8 text-xs">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__any">{placeholder}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function FilterPanel({ open, filters, onChange, onReset }: FilterPanelProps) {
  const { accounts } = useAccountsStore()
  const [localFilters, setLocalFilters] = useState<TransactionFilters>(filters)

  useEffect(() => {
    if (open) setLocalFilters(filters)
  }, [open, filters])

  const set = (patch: Partial<TransactionFilters>) =>
    setLocalFilters((f) => ({ ...f, ...patch }))

  const apply = () => {
    // Strip empty/undefined values before applying
    const cleaned: Partial<TransactionFilters> = {}
    for (const [k, v] of Object.entries(localFilters)) {
      if (v !== undefined && v !== '' && v !== null) {
        ;(cleaned as Record<string, unknown>)[k] = v
      }
    }
    onChange(cleaned)
  }

  const subcats = getSubcategories(localFilters.category ?? '')

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="border rounded-xl bg-card p-5 mb-4 space-y-5">
            {/* Date range */}
            <FilterSection title="Date Range">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">From</Label>
                  <Input
                    type="date"
                    value={localFilters.date_from ?? ''}
                    onChange={(e) => set({ date_from: e.target.value || undefined })}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input
                    type="date"
                    value={localFilters.date_to ?? ''}
                    onChange={(e) => set({ date_to: e.target.value || undefined })}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              </div>
            </FilterSection>

            <Separator />

            {/* Amount + Account + Direction */}
            <div className="grid grid-cols-2 gap-5">
              <FilterSection title="Amount Range">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Min $</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={localFilters.min_amount ?? ''}
                      onChange={(e) => set({ min_amount: e.target.value ? Number(e.target.value) : undefined } as Partial<TransactionFilters>)}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Max $</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Any"
                      value={localFilters.max_amount ?? ''}
                      onChange={(e) => set({ max_amount: e.target.value ? Number(e.target.value) : undefined } as Partial<TransactionFilters>)}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                </div>
              </FilterSection>

              <FilterSection title="Account & Direction">
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Account</Label>
                    <Select
                      value={localFilters.account_id ?? '__any'}
                      onValueChange={(v) => set({ account_id: v === '__any' ? undefined : v })}
                    >
                      <SelectTrigger className="mt-1 h-8 text-xs">
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
                  <SelectFilter
                    label="Direction"
                    value={localFilters.direction}
                    options={[{ value: 'debit', label: 'Debit (expense)' }, { value: 'credit', label: 'Credit (income)' }]}
                    onChange={(v) => set({ direction: v as TransactionFilters['direction'] })}
                  />
                </div>
              </FilterSection>
            </div>

            <Separator />

            {/* Category */}
            <FilterSection title="Category">
              <div className="grid grid-cols-2 gap-3">
                <SelectFilter
                  label="Category"
                  value={localFilters.category}
                  options={ALL_CATEGORIES.map((c) => ({ value: c, label: c }))}
                  onChange={(v) => { set({ category: v, subcategory: undefined }) }}
                />
                <SelectFilter
                  label="Subcategory"
                  value={localFilters.subcategory}
                  options={subcats.map((s) => ({ value: s, label: s }))}
                  onChange={(v) => set({ subcategory: v })}
                  placeholder={!localFilters.category ? 'Pick category first' : 'Any'}
                />
              </div>
            </FilterSection>

            <Separator />

            {/* Classification */}
            <FilterSection title="Classification">
              <div className="grid grid-cols-3 gap-3">
                <SelectFilter
                  label="Need / Want / Savings"
                  value={localFilters.need_want_savings}
                  options={NEED_WANT_SAVINGS_OPTIONS}
                  onChange={(v) => set({ need_want_savings: v as TransactionFilters['need_want_savings'] })}
                />
                <SelectFilter
                  label="Fixed / Variable"
                  value={(localFilters as Record<string, unknown>).fixed_variable as string}
                  options={FIXED_VARIABLE_OPTIONS}
                  onChange={(v) => set({ fixed_variable: v } as Partial<TransactionFilters>)}
                />
                <SelectFilter
                  label="Personal / Work"
                  value={localFilters.personal_work_shared}
                  options={PERSONAL_WORK_OPTIONS}
                  onChange={(v) => set({ personal_work_shared: v as TransactionFilters['personal_work_shared'] })}
                />
              </div>
            </FilterSection>

            <Separator />

            {/* Reimbursement + Flags */}
            <div className="grid grid-cols-2 gap-5">
              <FilterSection title="Reimbursement">
                <div className="space-y-2">
                  <SelectFilter
                    label="Status"
                    value={localFilters.reimbursement_status}
                    options={REIMBURSEMENT_STATUS_OPTIONS}
                    onChange={(v) => set({ reimbursement_status: v as TransactionFilters['reimbursement_status'] })}
                  />
                  <div className="flex items-center justify-between pt-1">
                    <Label className="text-xs">Only reimbursable</Label>
                    <Switch
                      checked={localFilters.is_reimbursable === true}
                      onCheckedChange={(v) => set({ is_reimbursable: v || undefined })}
                    />
                  </div>
                </div>
              </FilterSection>

              <FilterSection title="Other Flags">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Recurring only</Label>
                    <Switch
                      checked={localFilters.is_recurring === true}
                      onCheckedChange={(v) => set({ is_recurring: v || undefined })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Needs review only</Label>
                    <Switch
                      checked={localFilters.needs_review === true}
                      onCheckedChange={(v) => set({ needs_review: v || undefined })}
                    />
                  </div>
                  <SelectFilter
                    label="Source"
                    value={localFilters.source as string}
                    options={TRANSACTION_SOURCE_OPTIONS}
                    onChange={(v) => set({ source: v } as Partial<TransactionFilters>)}
                  />
                </div>
              </FilterSection>
            </div>

            {/* Apply / Reset */}
            <div className="flex items-center justify-between pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={onReset}>
                <RotateCcw className="w-3.5 h-3.5" /> Reset all filters
              </Button>
              <Button size="sm" onClick={apply}>
                Apply Filters
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
