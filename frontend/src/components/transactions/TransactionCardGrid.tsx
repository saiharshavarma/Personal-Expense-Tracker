import { motion } from 'framer-motion'
import { Pencil, Trash2, AlertCircle, DollarSign, PenLine, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAccountsStore } from '@/store'
import { getCategoryColor } from '@/lib/categories'
import { formatCurrency, formatDate, getReviewReason } from '@/lib/utils'
import type { Transaction } from '@/types'

interface TransactionCardGridProps {
  transactions: Transaction[]
  isLoading: boolean
  selectedIds: Set<string>
  onSelectChange: (ids: Set<string>) => void
  onEdit: (t: Transaction) => void
  onDelete: (id: string) => void
}

function TransactionCard({
  t,
  selected,
  onSelect,
  onEdit,
  onDelete,
}: {
  t: Transaction
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { getById } = useAccountsStore()
  const acct = t.account_id ? getById(t.account_id) : null
  const isDebit = t.direction === 'debit'
  const catColor = getCategoryColor(t.category)

  return (
    <Card
      className={`overflow-hidden cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm group ${selected ? 'border-primary bg-primary/5' : ''}`}
      onClick={onEdit}
    >
      <CardContent className="p-4">
        {/* Top row: checkbox + category badge + amount */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2" onClick={(e) => { e.stopPropagation(); onSelect() }}>
            <input
              type="checkbox"
              checked={selected}
              onChange={onSelect}
              className="w-4 h-4 rounded border-muted-foreground accent-primary cursor-pointer"
            />
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.category ? catColor : 'bg-muted text-muted-foreground'}`}>
              {t.category ?? 'Uncategorized'}
            </span>
          </div>
          <span className={`text-base font-bold tabular-nums ${isDebit ? '' : 'text-green-600 dark:text-green-400'}`}>
            {isDebit ? '' : '+'}{formatCurrency(t.amount)}
          </span>
        </div>

        {/* Paid To + Notes */}
        <p className="text-sm font-medium truncate">
          {t.merchant ?? t.description_clean ?? t.description ?? '—'}
        </p>
        {t.notes ? (
          <p className="text-xs text-muted-foreground truncate mb-1">
            <span className="opacity-50">for</span> {t.notes}
          </p>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium mb-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
            <PenLine className="w-3 h-3 flex-shrink-0" />
            Add a note
          </span>
        )}

        {/* Meta row */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatDate(t.date)}</span>
          <div className="flex items-center gap-1.5">
            {acct && <span className="truncate max-w-[80px]">{acct.name}</span>}
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${
              isDebit
                ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
            }`}>
              {isDebit
                ? <><ArrowDownLeft className="w-3 h-3" />Debit</>
                : <><ArrowUpRight className="w-3 h-3" />Credit</>}
            </span>
          </div>
        </div>

        {/* Flags */}
        <div className="flex items-center gap-2 mt-2">
          {t.needs_review && (() => {
            const r = getReviewReason(t)
            if (!r) return null
            return (
              <span className={`flex items-center gap-0.5 text-xs ${
                r.color === 'red'  ? 'text-red-500 dark:text-red-400' :
                r.color === 'blue' ? 'text-blue-500 dark:text-blue-400' :
                                     'text-amber-500 dark:text-amber-400'
              }`}>
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                {r.label}
              </span>
            )
          })()}
          {t.is_reimbursable && (
            <span className="flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400">
              <DollarSign className="w-3 h-3" /> Reimbursable
            </span>
          )}
          {t.net_personal_cost !== null && t.net_personal_cost !== t.amount && (
            <span className="text-xs text-muted-foreground ml-auto">
              net {formatCurrency(t.net_personal_cost ?? 0)}
            </span>
          )}
        </div>

        {/* Hover actions */}
        <div
          className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onEdit}
            className="p-1 rounded bg-background border shadow-sm hover:bg-accent transition-colors"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded bg-background border shadow-sm hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </CardContent>
    </Card>
  )
}

export function TransactionCardGrid({
  transactions,
  isLoading,
  selectedIds,
  onSelectChange,
  onEdit,
  onDelete,
}: TransactionCardGridProps) {
  const toggleRow = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectChange(next)
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}>
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between"><Skeleton className="h-5 w-24 rounded-full" /><Skeleton className="h-5 w-16" /></div>
                <Skeleton className="h-4 w-full" />
                <div className="flex justify-between"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-14 rounded-full" /></div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
      {transactions.map((t, i) => (
        <motion.div
          key={t.id}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.03 }}
          className="relative"
        >
          <TransactionCard
            t={t}
            selected={selectedIds.has(t.id)}
            onSelect={() => toggleRow(t.id)}
            onEdit={() => onEdit(t)}
            onDelete={() => onDelete(t.id)}
          />
        </motion.div>
      ))}
    </div>
  )
}
