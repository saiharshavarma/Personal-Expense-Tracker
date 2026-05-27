import { useState, useEffect } from 'react'
import { api } from '@/utils/apiClient'
import type { Budget } from '@/types'
import { getCurrentMonthYear } from '@/lib/utils'

export function useBudgets(month?: number, year?: number) {
  const { month: currentMonth, year: currentYear } = getCurrentMonthYear()
  const m = month ?? currentMonth
  const y = year ?? currentYear

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setIsLoading(true)
    api.get<Budget[]>('/budgets', { params: { month: m, year: y } })
      .then(({ data }) => setBudgets(data))
      .catch(() => setError('Failed to load budgets'))
      .finally(() => setIsLoading(false))
  }, [m, y])

  return { budgets, isLoading, error, setBudgets }
}
