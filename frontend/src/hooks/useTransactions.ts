import { useEffect } from 'react'
import { useTransactionsStore } from '@/store'
import type { TransactionFilters } from '@/types'

export function useTransactions(initialFilters?: TransactionFilters) {
  const store = useTransactionsStore()

  useEffect(() => {
    store.fetchTransactions(initialFilters)
  }, [])

  return store
}
