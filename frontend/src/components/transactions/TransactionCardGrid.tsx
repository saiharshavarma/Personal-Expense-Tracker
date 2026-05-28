import { motion } from 'framer-motion'
import { Pencil, Trash2, AlertCircle, DollarSign, PenLine, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAccountsStore } from '@/store'
import { getCategoryColor } from '@/lib/categories'
import { formatCurrency, formatDate, getReviewReasons, isNeedsReview } from '@/lib/utils'
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

  const needsReview = isNeedsReview(t)
  const reviewReasons = needsReview ? getReviewReasons(t) : []
  const hasRedReason = reviewReasons.some((r) => r.color === 'red')

  return (
    <Card
      className={`overflow-hidden cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm group border-l-4 h-full flex flex-col ${
        needsReview
          ? hasRedReason ? 'border-l-red-400' : 'border-l-amber-400'
          : 'border-l-transparent'
      } ${selected ? 'border-primary bg-primary/5' : ''}`}
      onClick={onEdit}
    >
      <CardContent className="p-4 flex flex-col flex-1 min-h-[160px]">
        {/* Top row: checkbox + category+subcategory + amount */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2" onClick={(e) => { e.stopPropagation(); onSelect() }}>
            <input
              type="checkbox"
              checked={selected}
              onChange={onSelect}
              className="w-4 h-4 rounded border-muted-foreground accent-primary cursor-pointer"
            />
            <div className="min-w-0 flex flex-col gap-1">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full self-start ${t.category ? catColor : 'bg-muted text-muted-foreground'}`}>
                {t.category ?? 'Uncategorized'}
              </span>
              {t.subcategory ? (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full self-start ${catColor}`}>
                  {t.subcategory}
                </span>
              ) : t.category ? (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full self-start bg-muted text-muted-foreground">
                  Add subcategory
                </span>
              ) : null}
            </div>
          </div>
          <span className={`text-base font-bold tabular-nums flex-shrink-0 ${isDebit ? '' : 'text-green-600 dark:text-green-400'}`}>
            {isDebit ? '' : '+'}{formatCurrency(t.amount)}
          </span>
        </div>

        {/* Paid To + Notes */}
        <p className="text-sm font-medium truncate">
          {t.merchant ?? t.description_clean ?? t.description ?? '—'}
        </p>
        {t.notes?.trim() ? (
          <p className="text-xs text-muted-foreground truncate mb-1">
            <span className="opacity-50">for</span> {t.notes}
          </p>
        ) : !needsReview ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium mb-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
            <PenLine className="w-3 h-3 flex-shrink-0" />
            Add a note
          </span>
        ) : null}

        {/* Spacer pushes meta row to bottom */}
        <div className="flex-1" />

        {/* Meta row */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
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

        {/* Review reason chips */}
        {reviewReasons.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-2">
            {reviewReasons.map((r, ri) => (
              <span key={ri} className={`flex items-center gap-0.5 text-xs ${
                r.color === 'red'  ? 'text-red-500 dark:text-red-400' :
                r.color === 'blue' ? 'text-blue-500 dark:text-blue-400' :
                                     'text-amber-500 dark:text-amber-400'
              }`}>
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                {r.label}
              </span>
            ))}
          </div>
        )}

        {/* Other flags */}
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 items-stretch">
      {transactions.map((t, i) => (
        <motion.div
          key={t.id}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.03 }}
          className="relative h-full"
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
