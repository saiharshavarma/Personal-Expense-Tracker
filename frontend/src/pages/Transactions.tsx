import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { Search, Filter, Plus, LayoutList, LayoutGrid, Download, ChevronLeft, ChevronRight, CreditCard, Repeat2, Zap, FileText, FileSpreadsheet, FileJson } from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { useTransactionsStore } from '@/store'
import { useAccounts } from '@/hooks/useAccounts'
import { TransactionTable, ColumnPicker, DEFAULT_VISIBLE, DEFAULT_ORDER } from '@/components/transactions/TransactionTable'
import type { ColKey } from '@/components/transactions/TransactionTable'
import { TransactionCardGrid } from '@/components/transactions/TransactionCardGrid'
import { FilterPanel } from '@/components/transactions/FilterPanel'
import { ActiveFilterChips } from '@/components/transactions/ActiveFilterChips'
import { BulkActionBar } from '@/components/transactions/BulkActionBar'
import { AddTransactionSheet } from '@/components/transactions/AddTransactionSheet'
import { AccountsModal } from '@/components/accounts/AccountsModal'
import { cn, debounce, formatCurrency } from '@/lib/utils'
import { api } from '@/utils/apiClient'
import type { Transaction, TransactionFilters, Trip } from '@/types'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface SpendSummary {
  recurring: { count: number; total: number }
  one_time: { count: number; total: number }
}

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
    patchTransactionLocally,
    removeTransactionLocally,
    restoreTransaction,
  } = useTransactionsStore()

  // Pending delete timers — keyed by transaction id
  const pendingDeletes = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  useAccounts()

  const [view, setView] = useState<'table' | 'card'>('table')
  // Version key — bump this whenever COLUMN_DEFS defaultVisible/defaultWidth changes
  // so users automatically get fresh defaults instead of stale stored layouts.
  const LAYOUT_VERSION = '3'

  const [cols, setCols] = useState<Record<ColKey, boolean>>(() => {
    try {
      if (localStorage.getItem('transaction_layout_version') !== LAYOUT_VERSION) {
        // New defaults — wipe stored layout so the fresh defaults apply
        localStorage.removeItem('transaction_columns')
        localStorage.removeItem('transaction_col_order')
        localStorage.removeItem('transaction_col_widths')
        localStorage.setItem('transaction_layout_version', LAYOUT_VERSION)
        return DEFAULT_VISIBLE
      }
      const stored = localStorage.getItem('transaction_columns')
      if (stored) return { ...DEFAULT_VISIBLE, ...JSON.parse(stored) }
    } catch {}
    return DEFAULT_VISIBLE
  })

  const [colOrder, setColOrder] = useState<ColKey[]>(() => {
    try {
      const stored = localStorage.getItem('transaction_col_order')
      if (stored) {
        const parsed = JSON.parse(stored) as ColKey[]
        // merge any new columns added since last visit
        const missing = DEFAULT_ORDER.filter((k) => !parsed.includes(k))
        return [...parsed, ...missing]
      }
    } catch {}
    return [...DEFAULT_ORDER]
  })

  const [colWidths, setColWidths] = useState<Partial<Record<ColKey, number>>>(() => {
    try {
      const stored = localStorage.getItem('transaction_col_widths')
      if (stored) return JSON.parse(stored)
    } catch {}
    return {}
  })
  const [search, setSearch] = useState(filters.search ?? '')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [accountsModalOpen, setAccountsModalOpen] = useState(false)
  const [trips, setTrips] = useState<Trip[]>([])
  const [summary, setSummary] = useState<SpendSummary | null>(null)
  const summaryAbort = useRef<AbortController | null>(null)

  const fetchSummary = useCallback(async (f: TransactionFilters) => {
    summaryAbort.current?.abort()
    summaryAbort.current = new AbortController()
    const params: Record<string, string> = {}
    if (f.date_from) params.date_from = f.date_from
    if (f.date_to) params.date_to = f.date_to
    if (f.account_id) params.account_id = f.account_id
    if (f.category) params.category = f.category
    if (f.direction) params.direction = f.direction
    if (f.is_reimbursable != null) params.is_reimbursable = String(f.is_reimbursable)
    if (f.need_want_savings) params.need_want_savings = f.need_want_savings
    if (f.fixed_variable) params.fixed_variable = f.fixed_variable
    if (f.personal_work_shared) params.personal_work_shared = f.personal_work_shared
    if (f.search) params.search = f.search
    try {
      const res = await api.get('/transactions/summary', { params, signal: summaryAbort.current.signal })
      setSummary(res.data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchTransactions(); fetchSummary({}) }, [])
  useEffect(() => { api.get('/trips').then((r) => setTrips(r.data)).catch(() => {}) }, [])

  const debouncedSearch = useCallback(
    debounce((q: string) => {
      const merged = { ...filters, search: q || undefined, page: 1 }
      setFilters(merged)
      fetchTransactions(merged)
      fetchSummary(merged)
    }, 350),
    []
  )

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    debouncedSearch(e.target.value)
  }

  const handleFilterChange = (newFilters: Partial<TransactionFilters>) => {
    // Merge with current filters, then strip any keys explicitly set to undefined/null/''
    // so that clearing a filter in the panel actually removes it.
    const raw = { ...filters, ...newFilters, page: 1 }
    const merged: TransactionFilters = Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ) as TransactionFilters
    setFilters(merged)
    fetchTransactions(merged)
    fetchSummary(merged)
    setFiltersOpen(false)
  }

  const handleFilterReset = () => {
    const base = { page: 1, page_size: 50, sort_by: 'date', sort_dir: 'desc' } as TransactionFilters
    resetFilters()
    setSearch('')
    fetchTransactions(base)
    fetchSummary(base)
    setFiltersOpen(false)
  }

  const handleRemoveFilter = (key: keyof TransactionFilters) => {
    const next = { ...filters } as Record<string, unknown>
    delete next[key as string]
    // Do NOT call setFilters here — fetchTransactions will set the correct store
    // state after the request completes (store fix: override replaces, not merges).
    fetchTransactions(next as TransactionFilters)
    fetchSummary(next as TransactionFilters)
  }

  const handleColsChange = (newCols: Record<ColKey, boolean>) => {
    setCols(newCols)
    try { localStorage.setItem('transaction_columns', JSON.stringify(newCols)) } catch {}
  }

  const handleColOrderChange = (order: ColKey[]) => {
    setColOrder(order)
    try { localStorage.setItem('transaction_col_order', JSON.stringify(order)) } catch {}
  }

  const handleColWidthsChange = (widths: Partial<Record<ColKey, number>>) => {
    setColWidths(widths)
    try { localStorage.setItem('transaction_col_widths', JSON.stringify(widths)) } catch {}
  }

  const handleResetLayout = () => {
    setCols(DEFAULT_VISIBLE)
    setColOrder([...DEFAULT_ORDER])
    setColWidths({})
    try {
      localStorage.setItem('transaction_columns', JSON.stringify(DEFAULT_VISIBLE))
      localStorage.removeItem('transaction_col_order')
      localStorage.removeItem('transaction_col_widths')
    } catch {}
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

  const handleDelete = (id: string) => {
    const idx = transactions.findIndex(t => t.id === id)
    const tx = transactions[idx]
    if (!tx) return

    // Optimistically remove from the list
    removeTransactionLocally(id)
    setSelectedIds(s => { const n = new Set(s); n.delete(id); return n })

    // Show undo toast — actual API delete fires after the toast auto-closes
    toast('Transaction deleted', {
      description: `${tx.merchant ?? tx.description ?? 'Transaction'} · $${Math.abs(tx.amount).toFixed(2)}`,
      action: {
        label: 'Undo',
        onClick: () => {
          const timer = pendingDeletes.current.get(id)
          if (timer) { clearTimeout(timer); pendingDeletes.current.delete(id) }
          restoreTransaction(tx, idx)
          toast.success('Deletion cancelled')
        },
      },
      duration: 5000,
    })

    const timer = setTimeout(async () => {
      pendingDeletes.current.delete(id)
      try {
        await deleteTransaction(id)
      } catch {
        // API delete failed — restore the transaction and warn
        restoreTransaction(tx, idx)
        toast.error('Failed to delete transaction', { description: 'The transaction has been restored.' })
      }
    }, 5000)

    pendingDeletes.current.set(id, timer)
  }

  const handleAddNew = () => {
    setEditingTransaction(null)
    setSheetOpen(true)
  }

  const handleSheetClose = (open: boolean) => {
    setSheetOpen(open)
    if (!open) {
      fetchTransactions(filters)
      fetchSummary(filters)
      setEditingTransaction(null)
    }
  }

  const handleCategoryUpdate = async (id: string, category: string) => {
    const prev = transactions.find(t => t.id === id)
    const prevCat = prev?.category ?? null
    const prevSub = prev?.subcategory ?? null
    // Optimistic update
    patchTransactionLocally(id, { category: category || null, subcategory: null })
    try {
      await updateTransaction(id, { category: category || null, subcategory: null })
    } catch {
      patchTransactionLocally(id, { category: prevCat, subcategory: prevSub })
      toast.error('Failed to update category')
    }
  }

  const handleSubcategoryUpdate = async (id: string, subcategory: string) => {
    const prev = transactions.find(t => t.id === id)?.subcategory ?? null
    patchTransactionLocally(id, { subcategory: subcategory || null })
    try {
      await updateTransaction(id, { subcategory: subcategory || null })
    } catch {
      patchTransactionLocally(id, { subcategory: prev })
      toast.error('Failed to update subcategory')
    }
  }

  const handleNoteUpdate = async (id: string, note: string) => {
    const prev = transactions.find(t => t.id === id)?.notes ?? null
    patchTransactionLocally(id, { notes: note || null })
    try {
      await updateTransaction(id, { notes: note || null })
    } catch {
      patchTransactionLocally(id, { notes: prev })
      toast.error('Failed to save note')
    }
  }

  const refetch = () => { fetchTransactions(filters); fetchSummary(filters) }

  // ── Export helpers ──────────────────────────────────────────────────────────
  const buildExportParams = () => {
    const p = new URLSearchParams()
    if (filters.date_from)         p.set('date_from', filters.date_from)
    if (filters.date_to)           p.set('date_to', filters.date_to)
    if (filters.category)          p.set('category', filters.category)
    if (filters.direction)         p.set('direction', filters.direction)
    if (filters.account_id)        p.set('account_id', filters.account_id)
    if (filters.search)            p.set('search', filters.search)
    if (filters.is_recurring != null) p.set('is_recurring', String(filters.is_recurring))
    if (filters.need_want_savings) p.set('need_want_savings', filters.need_want_savings)
    return p.toString() ? `?${p.toString()}` : ''
  }

  const triggerDownload = async (path: string, mimeType: string) => {
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`${api.defaults.baseURL}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`Export failed: ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(new Blob([blob], { type: mimeType }))
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers.get('content-disposition') || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      a.download = match ? match[1] : 'export'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export error:', err)
    }
  }

  const handleExportCSV   = () => triggerDownload(`/export/csv${buildExportParams()}`,   'text/csv')
  const handleExportExcel = () => triggerDownload(`/export/excel${buildExportParams()}`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  const handleExportJSON  = () => triggerDownload('/export/json', 'application/json')

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {Object.keys(filters).some(k => !['page','page_size','sort_by','sort_dir'].includes(k) && (filters as Record<string,unknown>)[k])
                    ? 'Filtered transactions'
                    : 'All transactions'}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportCSV}>
                  <FileText className="w-4 h-4 mr-2 text-green-600" />
                  CSV — Spreadsheet
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportExcel}>
                  <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" />
                  Excel — Formatted workbook
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportJSON}>
                  <FileJson className="w-4 h-4 mr-2 text-blue-600" />
                  JSON — Full data export
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={handleAddNew}>
              <Plus className="w-4 h-4" />
              Add Transaction
            </Button>
          </>
        }
      />

      {/* Recurring vs one-time spend strip */}
      {summary && (summary.recurring.count > 0 || summary.one_time.count > 0) && (
        <div className="flex items-center gap-3 mb-4 text-sm flex-wrap">
          {/* Total */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-card">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="font-semibold">
              {formatCurrency(summary.recurring.total + summary.one_time.total)}
            </span>
            <span className="text-muted-foreground/60 text-xs">
              {summary.recurring.count + summary.one_time.count} transactions
            </span>
          </div>
          <span className="text-muted-foreground/30 text-xs">=</span>
          {/* Recurring */}
          <button
            onClick={() => handleFilterChange({ is_recurring: true })}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-700 hover:border-violet-400 transition-colors"
          >
            <Repeat2 className="w-3.5 h-3.5 text-violet-500" />
            <span className="text-violet-700 dark:text-violet-300 font-medium">{formatCurrency(summary.recurring.total)}</span>
            <span className="text-violet-500/70 dark:text-violet-400/60 text-xs">{summary.recurring.count} recurring</span>
          </button>
          <span className="text-muted-foreground/40 text-xs">+</span>
          {/* One-time */}
          <button
            onClick={() => handleFilterChange({ is_recurring: false })}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-muted/40 hover:border-primary/40 transition-colors"
          >
            <Zap className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-medium">{formatCurrency(summary.one_time.total)}</span>
            <span className="text-muted-foreground text-xs">{summary.one_time.count} one-time</span>
          </button>
          {(filters.is_recurring === true || filters.is_recurring === false) && (
            <button
              onClick={() => handleRemoveFilter('is_recurring')}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

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
            <ColumnPicker cols={cols} onChange={handleColsChange} onResetAll={handleResetLayout} />
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
            onSubcategoryUpdate={handleSubcategoryUpdate}
            onNoteUpdate={handleNoteUpdate}
            cols={cols}
            onColsChange={handleColsChange}
            colOrder={colOrder}
            colWidths={colWidths}
            onColOrderChange={handleColOrderChange}
            onColWidthsChange={handleColWidthsChange}
            trips={trips}
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
