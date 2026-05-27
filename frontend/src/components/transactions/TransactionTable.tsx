import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpDown, ArrowUp, ArrowDown, Pencil, Trash2, MoreHorizontal, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAccountsStore } from '@/store'
import { ALL_CATEGORIES, getCategoryColor } from '@/lib/categories'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Transaction, TransactionFilters } from '@/types'

// ── Column visibility ──────────────────────────────────────────────────────────

type ColKey = 'date' | 'description' | 'category' | 'account' | 'type' | 'reimbursable' | 'amount'

const DEFAULT_VISIBLE: Record<ColKey, boolean> = {
  date: true,
  description: true,
  category: true,
  account: true,
  type: true,
  reimbursable: false,
  amount: true,
}

// ── Inline category editor ─────────────────────────────────────────────────────

interface InlineCategoryEditorProps {
  value: string | null
  transactionId: string
  onSave: (id: string, category: string) => Promise<void>
}

function InlineCategoryEditor({ value, transactionId, onSave }: InlineCategoryEditorProps) {
  const [editing, setEditing] = useState(false)
  const color = getCategoryColor(value)

  if (editing) {
    return (
      <Select
        value={value ?? '__none'}
        onValueChange={async (v) => {
          await onSave(transactionId, v === '__none' ? '' : v)
          setEditing(false)
        }}
        open
        onOpenChange={(o) => { if (!o) setEditing(false) }}
      >
        <SelectTrigger className="h-6 text-xs w-32" onClick={(e) => e.stopPropagation()}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">Uncategorized</SelectItem>
          {ALL_CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <span
      onClick={(e) => { e.stopPropagation(); setEditing(true) }}
      title="Click to edit category"
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all ${
        value ? color : 'bg-muted text-muted-foreground'
      }`}
    >
      {value ?? 'Uncategorized'}
      <Pencil className="w-2.5 h-2.5 opacity-60" />
    </span>
  )
}

// ── Sort header ────────────────────────────────────────────────────────────────

interface SortHeaderProps {
  label: string
  sortKey: string
  currentSort: { by: string; dir: string }
  onSort: (key: string) => void
  className?: string
}

function SortHeader({ label, sortKey, currentSort, onSort, className = '' }: SortHeaderProps) {
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

// ── Props ──────────────────────────────────────────────────────────────────────

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
}

export function TransactionTable({
  transactions,
  isLoading,
  filters,
  onSortChange,
  selectedIds,
  onSelectChange,
  onEdit,
  onDelete,
  onCategoryUpdate,
}: TransactionTableProps) {
  const { accounts, getById } = useAccountsStore()
  const [cols, setCols] = useState(DEFAULT_VISIBLE)

  const allSelected = transactions.length > 0 && transactions.every((t) => selectedIds.has(t.id))
  const someSelected = transactions.some((t) => selectedIds.has(t.id)) && !allSelected

  const toggleAll = () => {
    if (allSelected) {
      const next = new Set(selectedIds)
      transactions.forEach((t) => next.delete(t.id))
      onSelectChange(next)
    } else {
      const next = new Set(selectedIds)
      transactions.forEach((t) => next.add(t.id))
      onSelectChange(next)
    }
  }

  const toggleRow = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectChange(next)
  }

  const handleSort = (key: string) => {
    const newDir = filters.sort_by === key && filters.sort_dir === 'desc' ? 'asc' : 'desc'
    onSortChange({ sort_by: key, sort_dir: newDir, page: 1 })
  }

  const currentSort = { by: filters.sort_by ?? 'date', dir: filters.sort_dir ?? 'desc' }

  const SKELETON_ROWS = 8

  return (
    <div className="divide-y">
      {/* Header */}
      <div className="grid grid-cols-[auto_1fr_auto] gap-0">
        <div className="flex items-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide gap-4 w-full col-span-3">
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

          {/* Column headers */}
          {cols.date && (
            <div className="w-24 flex-shrink-0">
              <SortHeader label="Date" sortKey="date" currentSort={currentSort} onSort={handleSort} />
            </div>
          )}
          {cols.description && <div className="flex-1 min-w-0">Description</div>}
          {cols.category && <div className="w-36 flex-shrink-0">Category</div>}
          {cols.account && <div className="w-28 flex-shrink-0">Account</div>}
          {cols.type && <div className="w-16 flex-shrink-0">Type</div>}
          {cols.reimbursable && <div className="w-24 flex-shrink-0">Reimburse</div>}
          {cols.amount && (
            <div className="w-24 text-right flex-shrink-0">
              <SortHeader label="Amount" sortKey="amount" currentSort={currentSort} onSort={handleSort} className="justify-end" />
            </div>
          )}
          {/* Column visibility toggle */}
          <div className="ml-auto flex-shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <Eye className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs">Toggle Columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(Object.keys(cols) as ColKey[]).map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col}
                    checked={cols[col]}
                    onCheckedChange={(v) => setCols((c) => ({ ...c, [col]: v }))}
                    className="text-xs capitalize"
                  >
                    {col}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center gap-4 px-4 py-3.5"
            >
              <div className="w-4 flex-shrink-0"><Skeleton className="h-4 w-4 rounded" /></div>
              {cols.date && <div className="w-24 flex-shrink-0"><Skeleton className="h-4 w-20" /></div>}
              {cols.description && <div className="flex-1 min-w-0 space-y-1"><Skeleton className="h-4 w-full" /><Skeleton className="h-3 w-24" /></div>}
              {cols.category && <div className="w-36 flex-shrink-0"><Skeleton className="h-5 w-28 rounded-full" /></div>}
              {cols.account && <div className="w-28 flex-shrink-0"><Skeleton className="h-4 w-20" /></div>}
              {cols.type && <div className="w-16 flex-shrink-0"><Skeleton className="h-5 w-14 rounded-full" /></div>}
              {cols.reimbursable && <div className="w-24 flex-shrink-0"><Skeleton className="h-4 w-16" /></div>}
              {cols.amount && <div className="w-24 flex-shrink-0"><Skeleton className="h-4 w-16 ml-auto" /></div>}
              <div className="w-6 flex-shrink-0" />
            </motion.div>
          ))}
        </>
      )}

      {/* Data rows */}
      {!isLoading && transactions.map((t, i) => {
        const selected = selectedIds.has(t.id)
        const acct = t.account_id ? getById(t.account_id) : null
        const isDebit = t.direction === 'debit'

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

            {/* Description */}
            {cols.description && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {t.description_clean ?? t.description ?? t.merchant ?? '—'}
                </p>
                {t.notes && (
                  <p className="text-xs text-muted-foreground truncate">{t.notes}</p>
                )}
                {t.needs_review && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-yellow-600 dark:text-yellow-400">
                    <AlertCircle className="w-3 h-3" /> Needs review
                  </span>
                )}
              </div>
            )}

            {/* Category (inline edit) */}
            {cols.category && (
              <div className="w-36 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <InlineCategoryEditor
                  value={t.category}
                  transactionId={t.id}
                  onSave={onCategoryUpdate}
                />
              </div>
            )}

            {/* Account */}
            {cols.account && (
              <div className="w-28 flex-shrink-0 text-xs text-muted-foreground truncate">
                {acct ? (
                  <span>
                    {acct.name}
                    {acct.last_four && <span className="opacity-60"> ••{acct.last_four}</span>}
                  </span>
                ) : '—'}
              </div>
            )}

            {/* Direction badge */}
            {cols.type && (
              <div className="w-16 flex-shrink-0">
                <Badge
                  variant="outline"
                  className={`text-xs ${isDebit ? 'border-red-200 text-red-600 dark:text-red-400' : 'border-green-200 text-green-600 dark:text-green-400'}`}
                >
                  {isDebit ? 'Debit' : 'Credit'}
                </Badge>
              </div>
            )}

            {/* Reimbursable */}
            {cols.reimbursable && (
              <div className="w-24 flex-shrink-0 text-xs">
                {t.is_reimbursable ? (
                  <Badge variant="outline" className="text-xs border-blue-200 text-blue-600">
                    {t.reimbursement_status ?? 'to_submit'}
                  </Badge>
                ) : '—'}
              </div>
            )}

            {/* Amount */}
            {cols.amount && (
              <div className="w-24 flex-shrink-0 text-right">
                <span className={`text-sm font-semibold tabular-nums ${isDebit ? 'text-foreground' : 'text-green-600 dark:text-green-400'}`}>
                  {isDebit ? '' : '+'}{formatCurrency(t.amount)}
                </span>
                {t.net_personal_cost !== null && t.net_personal_cost !== t.amount && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    net {formatCurrency(t.net_personal_cost ?? 0)}
                  </p>
                )}
              </div>
            )}

            {/* Row actions */}
            <div
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
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
                  <DropdownMenuItem
                    onClick={() => onDelete(t.id)}
                    className="text-destructive focus:text-destructive"
                  >
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
