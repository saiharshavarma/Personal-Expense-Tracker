import { useEffect } from 'react'
import { useAccountsStore } from '@/store'

export function useAccounts() {
  const store = useAccountsStore()

  useEffect(() => {
    if (store.accounts.length === 0 && !store.isLoading) {
      store.fetchAccounts()
    }
  }, [])

  return store
}
