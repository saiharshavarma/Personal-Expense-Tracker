import { useState, useEffect, useCallback } from 'react'
import { Search, Filter, Plus, LayoutList, LayoutGrid, Download, ChevronLeft, ChevronRight, CreditCard } from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { useTransactionsStore } from '@/store'
import { useAccounts } from '@/hooks/useAccounts'
import { TransactionTable, ColumnPicker, DEFAULT_VISIBLE } from '@/components/transactions/TransactionTable'
import type { ColKey } from '@/components/transactions/TransactionTable'
import { TransactionCardGrid } from '@/components/transactions/TransactionCardGrid'
import { FilterPanel } from '@/components/transactions/FilterPanel'
import { ActiveFilterChips } from '@/components/transactions/ActiveFilterChips'
import { BulkActionBar } from '@/components/transactions/BulkActionBar'
import { AddTransactionSheet } from '@/components/transactions/AddTransactionSheet'
import { AccountsModal } from '@/components/accounts/AccountsModal'
import { cn, debounce } from '@/lib/utils'
import type { Transaction, TransactionFilters } from '@/types'

export function Transactions() {
  const {
    transactions,
    total,
    page,
    pages,
    isLoading,
    filters,
    fetchTransactions,
    setFilters,
    resetFilters,
    updateTransaction,
    deleteTransaction,
  } = useTransactionsStore()
  useAccounts()

  const [view, setView] = useState<'table' | 'card'>('table')
  const [cols, setCols] = useState<Record<ColKey, boolean>>(DEFAULT_VISIBLE)
  const [search, setSearch] = useState(filters.search ?? '')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [accountsModalOpen, setAccountsModalOpen] = useState(false)

  useEffect(() => { fetchTransactions() }, [])

  const debouncedSearch = useCallback(
    debounce((q: string) => {
      const merged = { ...filters, search: q || undefined, page: 1 }
      setFilters(merged)
      fetchTransactions(merged)
    }, 350),
    []
  )

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    debouncedSearch(e.target.value)
  }

  const handleFilterChange = (newFilters: Partial<TransactionFilters>) => {
    const merged = { ...filters, ...newFilters, page: 1 }
    setFilters(merged)
    fetchTransactions(merged)
    setFiltersOpen(false)
  }

  const handleFilterReset = () => {
    resetFilters()
    setSearch('')
    fetchTransactions({ page: 1, page_size: 50, sort_by: 'date', sort_dir: 'desc' })
    setFiltersOpen(false)
  }

  const handleRemoveFilter = (key: keyof TransactionFilters) => {
    const next = { ...filters } as Record<string, unknown>
    delete next[key as string]
    setFilters(next as TransactionFilters)
    fetchTransactions(next as TransactionFilters)
  }

  const handleSortChange = (sortFilters: Partial<TransactionFilters>) => {
    const merged = { ...filters, ...sortFilters }
    setFilters(merged)
    fetchTransactions(merged)
  }

  const goToPage = (p: number) => {
    const merged = { ...filters, page: p }
    setFilters(merged)
    fetchTransactions(merged)
    setSelectedIds(new Set())
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleEdit = (t: Transaction) => {
    setEditingTransaction(t)
    setSheetOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this transaction?')) return
    await deleteTransaction(id)
    setSelectedIds((s) => { const n = new Set(s); n.delete(id); return n })
  }

  const handleAddNew = () => {
    setEditingTransaction(null)
    setSheetOpen(true)
  }

  const handleSheetClose = (open: boolean) => {
    setSheetOpen(open)
    if (!open) {
      fetchTransactions(filters)
      setEditingTransaction(null)
    }
  }

  const handleCategoryUpdate = async (id: string, category: string) => {
    await updateTransaction(id, { category: category || null })
  }

  const refetch = () => fetchTransactions(filters)

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => {
    if (['page', 'page_size', 'sort_by', 'sort_dir', 'search'].includes(k)) return false
    return v !== undefined && v !== null && v !== '' && !(typeof v === 'boolean' && !v)
  }).length

  const isEmpty = !isLoading && transactions.length === 0

  return (
    <MainLayout>
      <TopBar
        title="Transactions"
        subtitle={total > 0 ? `${total.toLocaleString()} transactions` : 'All your financial activity in one place'}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setAccountsModalOpen(true)}>
              <CreditCard className="w-4 h-4" />
              Accounts
            </Button>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4" />
              Export
            </Button>
            <Button size="sm" onClick={handleAddNew}>
              <Plus className="w-4 h-4" />
              Add Transaction
            </Button>
          </>
        }
      />

      {/* Search + filters bar */}
      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search transactions…"
            value={search}
            onChange={handleSearchChange}
            className="pl-9"
          />
        </div>

        <Button
          variant={filtersOpen || activeFilterCount > 0 ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          <Filter className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 rounded-full bg-white/20 px-1.5 text-xs font-bold">
              {activeFilterCount}
            </span>
          )}
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {view === 'table' && (
            <ColumnPicker cols={cols} onChange={setCols} />
          )}
          <div className="flex items-center gap-1 rounded-lg border p-1">
            <button
              onClick={() => setView('table')}
              className={cn('p-1.5 rounded-md transition-colors', view === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('card')}
              className={cn('p-1.5 rounded-md transition-colors', view === 'card' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter panel (collapsible) */}
      <FilterPanel
        open={filtersOpen}
        filters={filters}
        onChange={handleFilterChange}
        onReset={handleFilterReset}
      />

      {/* Active filter chips */}
      <ActiveFilterChips filters={filters} onRemove={handleRemoveFilter} />

      {/* Main card */}
      <Card className="overflow-hidden">
        {view === 'table' ? (
          <TransactionTable
            transactions={transactions}
            isLoading={isLoading}
            filters={filters}
            onSortChange={handleSortChange}
            selectedIds={selectedIds}
            onSelectChange={setSelectedIds}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onCategoryUpdate={handleCategoryUpdate}
            cols={cols}
            onColsChange={setCols}
          />
        ) : (
          <TransactionCardGrid
            transactions={transactions}
            isLoading={isLoading}
            selectedIds={selectedIds}
            onSelectChange={setSelectedIds}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="py-16 text-center">
            <div className="mx-auto max-w-sm space-y-3">
              <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mx-auto">
                <CreditCard className="w-7 h-7 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">
                  {activeFilterCount > 0 || search ? 'No transactions match your filters' : 'No transactions yet'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {activeFilterCount > 0 || search
                    ? 'Try adjusting or clearing your filters'
                    : 'Import a bank statement or add a transaction manually'}
                </p>
              </div>
              {activeFilterCount > 0 || search ? (
                <Button variant="outline" size="sm" onClick={handleFilterReset}>Clear Filters</Button>
              ) : (
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" size="sm">Import Statement</Button>
                  <Button size="sm" onClick={handleAddNew}><Plus className="w-4 h-4" />Add Manually</Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pagination */}
        {!isEmpty && pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
            <p className="text-xs text-muted-foreground">
              Page {page} of {pages} · {total.toLocaleString()} total
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)} className="h-7 w-7 p-0">
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              {Array.from({ length: Math.min(5, pages) }, (_, i) => {
                const p = Math.max(1, Math.min(pages - 4, page - 2)) + i
                if (p < 1 || p > pages) return null
                return (
                  <Button key={p} variant={p === page ? 'default' : 'outline'} size="sm" onClick={() => goToPage(p)} className="h-7 w-7 p-0 text-xs">
                    {p}
                  </Button>
                )
              })}
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => goToPage(page + 1)} className="h-7 w-7 p-0">
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Floating bulk action bar */}
      <BulkActionBar
        selectedIds={Array.from(selectedIds)}
        onClear={() => setSelectedIds(new Set())}
        onRefetch={refetch}
      />

      {/* Add/Edit sheet */}
      <AddTransactionSheet
        open={sheetOpen}
        onOpenChange={handleSheetClose}
        transaction={editingTransaction}
      />

      {/* Accounts modal */}
      <AccountsModal
        open={accountsModalOpen}
        onOpenChange={setAccountsModalOpen}
      />
    </MainLayout>
  )
}
