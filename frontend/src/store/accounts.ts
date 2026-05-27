import { create } from 'zustand'
import { api } from '@/utils/apiClient'
import type { Account } from '@/types'

interface AccountsStore {
  accounts: Account[]
  isLoading: boolean
  error: string | null

  fetchAccounts: () => Promise<void>
  addAccount: (data: Partial<Account>) => Promise<Account>
  updateAccount: (id: string, data: Partial<Account>) => Promise<Account>
  deleteAccount: (id: string) => Promise<void>
  getById: (id: string) => Account | undefined
}

export const useAccountsStore = create<AccountsStore>((set, get) => ({
  accounts: [],
  isLoading: false,
  error: null,

  fetchAccounts: async () => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await api.get<Account[]>('/accounts')
      set({ accounts: data, isLoading: false })
    } catch (e) {
      set({ isLoading: false, error: 'Failed to load accounts' })
    }
  },

  addAccount: async (body) => {
    const { data } = await api.post<Account>('/accounts', body)
    set((s) => ({ accounts: [...s.accounts, data] }))
    return data
  },

  updateAccount: async (id, body) => {
    const { data } = await api.put<Account>(`/accounts/${id}`, body)
    set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? data : a)) }))
    return data
  },

  deleteAccount: async (id) => {
    await api.delete(`/accounts/${id}`)
    set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id) }))
  },

  getById: (id) => get().accounts.find((a) => a.id === id),
}))
