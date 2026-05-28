import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, Tag, DollarSign, X, ChevronDown, ChevronRight } from 'lucide-react'
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
import { ALL_CATEGORIES, getSubcategories } from '@/lib/categories'

interface BulkActionBarProps {
  selectedIds: string[]
  onClear: () => void
  onRefetch: () => void
}

export function BulkActionBar({ selectedIds, onClear, onRefetch }: BulkActionBarProps) {
  const { bulkAction } = useTransactionsStore()
  const count = selectedIds.length
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null)

  const handleCategorize = async (category: string, subcategory?: string) => {
    const payload: Record<string, string> = { category }
    if (subcategory) payload.subcategory = subcategory
    await bulkAction(selectedIds, { action: 'categorize', payload })
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

            {/* Categorize — two-level category + subcategory */}
            <DropdownMenu onOpenChange={() => setHoveredCategory(null)}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Tag className="w-4 h-4" />
                  Categorize
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="max-h-80 overflow-y-auto w-64">
                <DropdownMenuLabel className="text-xs">Assign Category + Subcategory</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ALL_CATEGORIES.map((cat) => {
                  const subcats = getSubcategories(cat)
                  const isHovered = hoveredCategory === cat
                  return (
                    <div key={cat}>
                      <DropdownMenuItem
                        className="flex items-center justify-between cursor-pointer"
                        onMouseEnter={() => setHoveredCategory(cat)}
                        onClick={() => handleCategorize(cat)}
                      >
                        <span>{cat}</span>
                        {subcats.length > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                      </DropdownMenuItem>
                      {/* Subcategory list — shown on hover */}
                      {isHovered && subcats.length > 0 && (
                        <div className="pl-3 border-l border-primary/20 ml-2 mb-1">
                          {subcats.map((sub) => (
                            <DropdownMenuItem
                              key={sub}
                              className="text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => handleCategorize(cat, sub)}
                            >
                              {sub}
                            </DropdownMenuItem>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
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
