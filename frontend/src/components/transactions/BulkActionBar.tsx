import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, Tag, DollarSign, X, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { useTransactionsStore } from '@/store'
import { ALL_CATEGORIES } from '@/lib/categories'

interface BulkActionBarProps {
  selectedIds: string[]
  onClear: () => void
  onRefetch: () => void
}

export function BulkActionBar({ selectedIds, onClear, onRefetch }: BulkActionBarProps) {
  const { bulkAction } = useTransactionsStore()
  const count = selectedIds.length

  const handleCategorize = async (category: string) => {
    await bulkAction(selectedIds, { action: 'categorize', payload: { category } })
    onRefetch()
    onClear()
  }

  const handleMarkReimbursable = async () => {
    await bulkAction(selectedIds, { action: 'mark_reimbursable', payload: { is_reimbursable: true, reimbursement_status: 'to_submit' } })
    onRefetch()
    onClear()
  }

  const handleDelete = async () => {
    if (!confirm(`Delete ${count} transaction${count !== 1 ? 's' : ''}? This cannot be undone.`)) return
    await bulkAction(selectedIds, { action: 'delete' })
    onClear()
  }

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="flex items-center gap-3 px-5 py-3 bg-background border rounded-xl shadow-xl shadow-black/10">
            <span className="text-sm font-medium tabular-nums">
              {count} selected
            </span>

            <div className="w-px h-4 bg-border" />

            {/* Categorize */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Tag className="w-4 h-4" />
                  Categorize
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="max-h-64 overflow-y-auto">
                <DropdownMenuLabel className="text-xs">Assign Category</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ALL_CATEGORIES.map((cat) => (
                  <DropdownMenuItem key={cat} onClick={() => handleCategorize(cat)}>
                    {cat}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mark reimbursable */}
            <Button variant="ghost" size="sm" onClick={handleMarkReimbursable}>
              <DollarSign className="w-4 h-4" />
              Mark Reimbursable
            </Button>

            {/* Delete */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>

            <div className="w-px h-4 bg-border" />

            {/* Clear selection */}
            <button onClick={onClear} className="p-1 rounded hover:bg-accent transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
