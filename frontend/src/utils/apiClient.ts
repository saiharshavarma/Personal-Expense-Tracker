import axios, { AxiosError } from 'axios'
import type { ApiError } from '@/types'

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    const requestUrl = error.config?.url ?? ''
    if (error.response?.status === 401 && !requestUrl.includes('/auth/logout')) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_token_expiry')
      window.dispatchEvent(new CustomEvent('auth:expired'))
    }
    return Promise.reject(error)
  }
)

export function getAuthErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.detail || error.message || 'An error occurred'
  }
  return String(error)
}
