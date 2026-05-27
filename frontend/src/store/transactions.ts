import { create } from 'zustand'
import { api } from '@/utils/apiClient'
import type { Transaction, PaginatedResponse, TransactionFilters } from '@/types'

interface BulkActionPayload {
  action: 'categorize' | 'mark_reimbursable' | 'delete' | 'tag'
  payload?: Record<string, unknown>
}

interface TransactionsStore {
  transactions: Transaction[]
  total: number
  page: number
  pages: number
  isLoading: boolean
  error: string | null
  filters: TransactionFilters

  fetchTransactions: (filters?: TransactionFilters) => Promise<void>
  setFilters: (filters: Partial<TransactionFilters>) => void
  resetFilters: () => void
  addTransaction: (data: Partial<Transaction>) => Promise<Transaction>
  updateTransaction: (id: string, data: Partial<Transaction>) => Promise<Transaction>
  deleteTransaction: (id: string) => Promise<void>
  bulkAction: (ids: string[], action: BulkActionPayload) => Promise<void>
}

const defaultFilters: TransactionFilters = {
  page: 1,
  page_size: 50,
  sort_by: 'date',
  sort_dir: 'desc',
}

export const useTransactionsStore = create<TransactionsStore>((set, get) => ({
  transactions: [],
  total: 0,
  page: 1,
  pages: 1,
  isLoading: false,
  error: null,
  filters: defaultFilters,

  fetchTransactions: async (overrideFilters) => {
    // When an explicit filter set is passed, use it as-is (replace, not merge).
    // This is the only way chip-X removal and filter-panel Apply can clear filters.
    const filters = overrideFilters ?? get().filters
    set({ isLoading: true, error: null })
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== '')
      )
      const { data } = await api.get<PaginatedResponse<Transaction>>('/transactions', { params })
      set({
        transactions: data.items,
        total: data.total,
        page: data.page,
        pages: data.pages,
        isLoading: false,
        filters,
      })
    } catch {
      set({ isLoading: false, error: 'Failed to load transactions' })
    }
  },

  setFilters: (newFilters) => {
    set((s) => ({ filters: { ...s.filters, ...newFilters, page: 1 } }))
  },

  resetFilters: () => set({ filters: defaultFilters }),

  addTransaction: async (body) => {
    const { data } = await api.post<Transaction>('/transactions', body)
    set((s) => ({ transactions: [data, ...s.transactions], total: s.total + 1 }))
    return data
  },

  updateTransaction: async (id, body) => {
    const { data } = await api.put<Transaction>(`/transactions/${id}`, body)
    set((s) => ({ transactions: s.transactions.map((t) => (t.id === id ? data : t)) }))
    return data
  },

  deleteTransaction: async (id) => {
    await api.delete(`/transactions/${id}`)
    set((s) => ({
      transactions: s.transactions.filter((t) => t.id !== id),
      total: s.total - 1,
    }))
  },

  bulkAction: async (ids, { action, payload = {} }) => {
    await api.post('/transactions/bulk', { transaction_ids: ids, action, payload })
    if (action === 'delete') {
      set((s) => ({
        transactions: s.transactions.filter((t) => !ids.includes(t.id)),
        total: s.total - ids.length,
      }))
    } else {
      // Re-fetch to get updated data
      const { data } = await api.get<PaginatedResponse<Transaction>>('/transactions', {
        params: Object.fromEntries(
          Object.entries(useTransactionsStore.getState().filters)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
        ),
      })
      set({ transactions: data.items, total: data.total })
    }
  },
}))
