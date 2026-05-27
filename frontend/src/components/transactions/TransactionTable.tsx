import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowUpDown, ArrowUp, ArrowDown,
  Pencil, Trash2, MoreHorizontal,
  AlertCircle, PenLine, Columns3,
  ArrowDownLeft, ArrowUpRight,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuCheckboxItem, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAccountsStore } from '@/store'
import { ALL_CATEGORIES, getCategoryColor } from '@/lib/categories'
import { formatCurrency, formatDate, getReviewReason } from '@/lib/utils'
import type { Transaction, TransactionFilters } from '@/types'

// ── Column definitions ─────────────────────────────────────────────────────────

export type ColKey =
  | 'date' | 'paid_to_from' | 'what_for' | 'category'
  | 'account' | 'direction' | 'need_want' | 'fixed_var'
  | 'personal_work' | 'reimbursable' | 'tags' | 'amount'

interface ColDef {
  key: ColKey
  label: string
  defaultVisible: boolean
  sortKey?: string   // backend sort field name
  width: string
}

const COLUMN_DEFS: ColDef[] = [
  { key: 'date',          label: 'Date',              defaultVisible: true,  sortKey: 'date',        width: 'w-24 flex-shrink-0' },
  { key: 'paid_to_from',  label: 'Paid To / From',    defaultVisible: true,  sortKey: 'merchant',    width: 'w-44 flex-shrink-0' },
  { key: 'what_for',      label: 'What For',           defaultVisible: true,                          width: 'flex-1 min-w-0' },
  { key: 'category',      label: 'Category',           defaultVisible: true,  sortKey: 'category',    width: 'w-36 flex-shrink-0' },
  { key: 'account',       label: 'Account',            defaultVisible: true,                          width: 'w-28 flex-shrink-0' },
  { key: 'direction',     label: 'Type',               defaultVisible: true,  sortKey: 'direction',   width: 'w-20 flex-shrink-0' },
  { key: 'need_want',     label: 'Need / Want',         defaultVisible: false,                         width: 'w-20 flex-shrink-0' },
  { key: 'fixed_var',     label: 'Fixed / Variable',   defaultVisible: false,                         width: 'w-20 flex-shrink-0' },
  { key: 'personal_work', label: 'Personal / Work',    defaultVisible: false,                         width: 'w-20 flex-shrink-0' },
  { key: 'reimbursable',  label: 'Reimbursable',       defaultVisible: false,                         width: 'w-24 flex-shrink-0' },
  { key: 'tags',          label: 'Tags',               defaultVisible: false,                         width: 'w-36 flex-shrink-0' },
  { key: 'amount',        label: 'Amount',             defaultVisible: true,  sortKey: 'amount',      width: 'w-24 flex-shrink-0' },
]

export const DEFAULT_VISIBLE = Object.fromEntries(
  COLUMN_DEFS.map((c) => [c.key, c.defaultVisible])
) as Record<ColKey, boolean>

// ── Pill badge (no border) ─────────────────────────────────────────────────────

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${color}`}>
      {children}
    </span>
  )
}

// ── Inline category editor ─────────────────────────────────────────────────────

function InlineCategoryEditor({
  value, transactionId, onSave,
}: { value: string | null; transactionId: string; onSave: (id: string, cat: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const color = getCategoryColor(value)

  if (editing) {
    return (
      <Select
        value={value ?? '__none'}
        onValueChange={async (v) => { await onSave(transactionId, v === '__none' ? '' : v); setEditing(false) }}
        open
        onOpenChange={(o) => { if (!o) setEditing(false) }}
      >
        <SelectTrigger className="h-6 text-xs w-32" onClick={(e) => e.stopPropagation()}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">Uncategorized</SelectItem>
          {ALL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
    )
  }

  return (
    <span
      onClick={(e) => { e.stopPropagation(); setEditing(true) }}
      title="Click to edit"
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all ${value ? color : 'bg-muted text-muted-foreground'}`}
    >
      {value ?? 'Uncategorized'}
      <Pencil className="w-2.5 h-2.5 opacity-50" />
    </span>
  )
}

// ── Sort header ────────────────────────────────────────────────────────────────

function SortHeader({
  label, sortKey, currentSort, onSort, className = '',
}: { label: string; sortKey: string; currentSort: { by: string; dir: string }; onSort: (k: string) => void; className?: string }) {
  const active = currentSort.by === sortKey
  const Icon = active ? (currentSort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 hover:text-foreground transition-colors ${active ? 'text-foreground' : ''} ${className}`}
    >
      {label}
      <Icon className={`w-3 h-3 ${active ? 'opacity-100' : 'opacity-40'}`} />
    </button>
  )
}

// ── Column picker ──────────────────────────────────────────────────────────────

export function ColumnPicker({
  cols, onChange,
}: { cols: Record<ColKey, boolean>; onChange: (cols: Record<ColKey, boolean>) => void }) {
  const hiddenCount = Object.values(cols).filter((v) => !v).length
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <Columns3 className="w-3.5 h-3.5" />
          Columns
          {hiddenCount > 0 && (
            <span className="bg-primary text-primary-foreground rounded-full text-[10px] w-4 h-4 flex items-center justify-center">
              {COLUMN_DEFS.length - hiddenCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Show / hide columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {COLUMN_DEFS.map((def) => (
          <DropdownMenuCheckboxItem
            key={def.key}
            checked={cols[def.key]}
            onCheckedChange={(v) => onChange({ ...cols, [def.key]: v })}
            className="text-xs"
          >
            {def.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-xs text-muted-foreground"
          onClick={() => onChange(DEFAULT_VISIBLE)}
        >
          Reset to defaults
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Main table ─────────────────────────────────────────────────────────────────

interface TransactionTableProps {
  transactions: Transaction[]
  isLoading: boolean
  filters: TransactionFilters
  onSortChange: (filters: Partial<TransactionFilters>) => void
  selectedIds: Set<string>
  onSelectChange: (ids: Set<string>) => void
  onEdit: (t: Transaction) => void
  onDelete: (id: string) => void
  onCategoryUpdate: (id: string, category: string) => Promise<void>
  cols: Record<ColKey, boolean>
  onColsChange: (cols: Record<ColKey, boolean>) => void
}

export function TransactionTable({
  transactions, isLoading, filters, onSortChange,
  selectedIds, onSelectChange, onEdit, onDelete, onCategoryUpdate,
  cols, onColsChange: setCols,
}: TransactionTableProps) {
  const { getById } = useAccountsStore()

  const allSelected = transactions.length > 0 && transactions.every((t) => selectedIds.has(t.id))
  const someSelected = transactions.some((t) => selectedIds.has(t.id)) && !allSelected

  const toggleAll = () => {
    const next = new Set(selectedIds)
    if (allSelected) transactions.forEach((t) => next.delete(t.id))
    else transactions.forEach((t) => next.add(t.id))
    onSelectChange(next)
  }

  const toggleRow = (id: string) => {
    const next = new Set(selectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    onSelectChange(next)
  }

  const currentSort = { by: filters.sort_by ?? 'date', dir: filters.sort_dir ?? 'desc' }

  const handleSort = (key: string) => {
    const newDir = currentSort.by === key && currentSort.dir === 'desc' ? 'asc' : 'desc'
    onSortChange({ sort_by: key, sort_dir: newDir, page: 1 })
  }

  const visibleDefs = COLUMN_DEFS.filter((d) => cols[d.key])

  return (
    <div className="divide-y">

      {/* ── Header row ── */}
      <div className="flex items-center gap-4 px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {/* Checkbox */}
        <div className="w-4 flex-shrink-0">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = someSelected }}
            onChange={toggleAll}
            className="w-4 h-4 rounded border-muted-foreground accent-primary cursor-pointer"
          />
        </div>

        {visibleDefs.map((def) => (
          <div key={def.key} className={def.width}>
            {def.sortKey ? (
              <SortHeader
                label={def.label}
                sortKey={def.sortKey}
                currentSort={currentSort}
                onSort={handleSort}
                className={def.key === 'amount' ? 'justify-end' : ''}
              />
            ) : (
              <span>{def.label}</span>
            )}
          </div>
        ))}

      </div>

      {/* ── Skeleton rows ── */}
      {isLoading && Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.03 }}
          className="flex items-center gap-4 px-4 py-3.5"
        >
          <div className="w-4 flex-shrink-0"><Skeleton className="h-4 w-4 rounded" /></div>
          {cols.date          && <div className="w-24 flex-shrink-0"><Skeleton className="h-4 w-20" /></div>}
          {cols.paid_to_from  && <div className="w-44 flex-shrink-0"><Skeleton className="h-4 w-32" /></div>}
          {cols.what_for      && <div className="flex-1 min-w-0 space-y-1"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-24" /></div>}
          {cols.category      && <div className="w-36 flex-shrink-0"><Skeleton className="h-5 w-28 rounded-full" /></div>}
          {cols.account       && <div className="w-28 flex-shrink-0"><Skeleton className="h-4 w-20" /></div>}
          {cols.direction     && <div className="w-20 flex-shrink-0"><Skeleton className="h-5 w-14 rounded" /></div>}
          {cols.need_want     && <div className="w-20 flex-shrink-0"><Skeleton className="h-5 w-14 rounded" /></div>}
          {cols.fixed_var     && <div className="w-20 flex-shrink-0"><Skeleton className="h-5 w-14 rounded" /></div>}
          {cols.personal_work && <div className="w-20 flex-shrink-0"><Skeleton className="h-5 w-14 rounded" /></div>}
          {cols.reimbursable  && <div className="w-24 flex-shrink-0"><Skeleton className="h-5 w-16 rounded" /></div>}
          {cols.tags          && <div className="w-36 flex-shrink-0"><Skeleton className="h-4 w-24" /></div>}
          {cols.amount        && <div className="w-24 flex-shrink-0"><Skeleton className="h-4 w-16 ml-auto" /></div>}
          <div className="w-6 flex-shrink-0" />
        </motion.div>
      ))}

      {/* ── Data rows ── */}
      {!isLoading && transactions.map((t, i) => {
        const selected = selectedIds.has(t.id)
        const acct = t.account_id ? getById(t.account_id) : null
        const isDebit = t.direction === 'debit'
        const reviewReason = t.needs_review ? getReviewReason(t) : null

        return (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.02, duration: 0.15 }}
            className={`flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors group ${
              selected ? 'bg-primary/5' : 'hover:bg-accent/50'
            }`}
            onClick={() => onEdit(t)}
          >
            {/* Checkbox */}
            <div className="w-4 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggleRow(t.id)}
                className="w-4 h-4 rounded border-muted-foreground accent-primary cursor-pointer"
              />
            </div>

            {/* Date */}
            {cols.date && (
              <div className="w-24 flex-shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                {formatDate(t.date)}
              </div>
            )}

            {/* Paid To / From — merchant name with directional context */}
            {cols.paid_to_from && (
              <div className="w-44 flex-shrink-0 min-w-0">
                <p className="text-sm font-medium truncate">
                  {t.merchant ?? t.description_clean ?? t.description ?? '—'}
                </p>
                <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                  {isDebit ? 'paid to' : 'received from'}
                </p>
              </div>
            )}

            {/* What For — notes + badges */}
            {cols.what_for && (
              <div className="flex-1 min-w-0 space-y-0.5">
                {t.notes ? (
                  <p className="text-sm text-muted-foreground truncate">{t.notes}</p>
                ) : (
                  <Pill color="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                    <PenLine className="w-3 h-3" /> Add a note
                  </Pill>
                )}
                {/* Raw bank string — tiny, only when different from merchant */}
                {t.description && t.merchant && t.description !== t.merchant && (
                  <p className="text-[11px] text-muted-foreground/40 truncate font-mono">{t.description}</p>
                )}
                {/* AI review reason */}
                {reviewReason && (
                  <Pill color={
                    reviewReason.color === 'red'  ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' :
                    reviewReason.color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' :
                                                    'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300'
                  }>
                    <AlertCircle className="w-3 h-3" /> {reviewReason.label}
                  </Pill>
                )}
              </div>
            )}

            {/* Category */}
            {cols.category && (
              <div className="w-36 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <InlineCategoryEditor value={t.category} transactionId={t.id} onSave={onCategoryUpdate} />
              </div>
            )}

            {/* Account */}
            {cols.account && (
              <div className="w-28 flex-shrink-0 text-xs text-muted-foreground truncate">
                {acct ? <span>{acct.name}{acct.last_four && <span className="opacity-60"> ••{acct.last_four}</span>}</span> : '—'}
              </div>
            )}

            {/* Direction — borderless pill */}
            {cols.direction && (
              <div className="w-20 flex-shrink-0">
                <Pill color={isDebit
                  ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                  : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                }>
                  {isDebit
                    ? <><ArrowDownLeft className="w-3 h-3" /> Debit</>
                    : <><ArrowUpRight className="w-3 h-3" /> Credit</>
                  }
                </Pill>
              </div>
            )}

            {/* Need / Want / Savings */}
            {cols.need_want && (
              <div className="w-20 flex-shrink-0">
                {t.need_want_savings && t.need_want_savings !== 'na' ? (
                  <Pill color={
                    t.need_want_savings === 'need'    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' :
                    t.need_want_savings === 'savings' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' :
                                                        'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                  }>
                    {{ need: 'Need', want: 'Want', savings: 'Savings' }[t.need_want_savings]}
                  </Pill>
                ) : <span className="text-xs text-muted-foreground/40">—</span>}
              </div>
            )}

            {/* Fixed / Variable */}
            {cols.fixed_var && (
              <div className="w-20 flex-shrink-0">
                {t.fixed_variable && t.fixed_variable !== 'na' ? (
                  <Pill color="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {{ fixed: 'Fixed', variable: 'Variable' }[t.fixed_variable]}
                  </Pill>
                ) : <span className="text-xs text-muted-foreground/40">—</span>}
              </div>
            )}

            {/* Personal / Work */}
            {cols.personal_work && (
              <div className="w-20 flex-shrink-0">
                {t.personal_work_shared ? (
                  <Pill color={
                    t.personal_work_shared === 'work'     ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' :
                    t.personal_work_shared === 'shared'   ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300' :
                    t.personal_work_shared === 'mixed'    ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300' :
                                                            'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }>
                    {{ personal: 'Personal', work: 'Work', shared: 'Shared', mixed: 'Mixed' }[t.personal_work_shared]}
                  </Pill>
                ) : <span className="text-xs text-muted-foreground/40">—</span>}
              </div>
            )}

            {/* Reimbursable */}
            {cols.reimbursable && (
              <div className="w-24 flex-shrink-0">
                {t.is_reimbursable ? (
                  <Pill color="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                    {(t.reimbursement_status ?? 'pending').replace(/_/g, ' ')}
                  </Pill>
                ) : <span className="text-xs text-muted-foreground/40">—</span>}
              </div>
            )}

            {/* Tags */}
            {cols.tags && (
              <div className="w-36 flex-shrink-0 flex flex-wrap gap-1">
                {(t.tags ?? []).slice(0, 2).map((tag) => (
                  <Pill key={tag} color="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    {tag}
                  </Pill>
                ))}
                {(t.tags ?? []).length > 2 && (
                  <span className="text-xs text-muted-foreground">+{(t.tags ?? []).length - 2}</span>
                )}
              </div>
            )}

            {/* Amount */}
            {cols.amount && (
              <div className="w-24 flex-shrink-0 text-right">
                <span className={`text-sm font-semibold tabular-nums ${isDebit ? '' : 'text-green-600 dark:text-green-400'}`}>
                  {isDebit ? '' : '+'}{formatCurrency(t.amount)}
                </span>
                {t.net_personal_cost !== null && t.net_personal_cost !== t.amount && (
                  <p className="text-xs text-muted-foreground tabular-nums">net {formatCurrency(t.net_personal_cost ?? 0)}</p>
                )}
              </div>
            )}

            {/* Row actions */}
            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(t)}>
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onDelete(t.id)} className="text-destructive focus:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
