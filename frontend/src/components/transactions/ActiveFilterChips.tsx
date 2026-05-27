import { X } from 'lucide-react'
import type { TransactionFilters } from '@/types'
import { useAccountsStore } from '@/store'
import { REIMBURSEMENT_STATUS_OPTIONS, TRANSACTION_SOURCE_OPTIONS } from '@/lib/categories'

const SKIP_KEYS = new Set(['page', 'page_size', 'sort_by', 'sort_dir'])

function humanize(key: string, value: unknown, accountName?: string): string {
  switch (key) {
    case 'date_from': return `From: ${value}`
    case 'date_to': return `To: ${value}`
    case 'account_id': return `Account: ${accountName ?? value}`
    case 'category': return `Category: ${value}`
    case 'subcategory': return `Sub: ${value}`
    case 'direction': return String(value) === 'debit' ? 'Debits only' : 'Credits only'
    case 'needs_review': return 'Needs Review'
    case 'is_reimbursable': return 'Reimbursable'
    case 'is_recurring': return 'Recurring'
    case 'need_want_savings': return `NWS: ${value}`
    case 'fixed_variable': return `FV: ${value}`
    case 'personal_work_shared': return `PWS: ${value}`
    case 'reimbursement_status': {
      const label = REIMBURSEMENT_STATUS_OPTIONS.find((o) => o.value === value)?.label
      return `Reimburse: ${label ?? value}`
    }
    case 'source': {
      const label = TRANSACTION_SOURCE_OPTIONS.find((o) => o.value === value)?.label
      return `Source: ${label ?? value}`
    }
    case 'min_amount': return `Min: $${value}`
    case 'max_amount': return `Max: $${value}`
    default: return `${key}: ${value}`
  }
}

interface ActiveFilterChipsProps {
  filters: TransactionFilters
  onRemove: (key: keyof TransactionFilters) => void
}

export function ActiveFilterChips({ filters, onRemove }: ActiveFilterChipsProps) {
  const { accounts } = useAccountsStore()

  const chips = Object.entries(filters).filter(([key, val]) => {
    if (SKIP_KEYS.has(key)) return false
    if (val === undefined || val === null || val === '') return false
    if (typeof val === 'boolean' && !val) return false
    return true
  })

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {chips.map(([key, value]) => {
        const acctName = key === 'account_id'
          ? accounts.find((a) => a.id === value)?.name
          : undefined
        return (
          <span
            key={key}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20"
          >
            {humanize(key, value, acctName)}
            <button
              onClick={() => onRemove(key as keyof TransactionFilters)}
              className="hover:text-destructive transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )
      })}
    </div>
  )
}
