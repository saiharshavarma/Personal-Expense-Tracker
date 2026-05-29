import { create } from 'zustand'
import { api, getAuthErrorMessage } from '@/utils/apiClient'
import type { AuthStatus } from '@/types'

const TOKEN_KEY = 'auth_token'
const EXPIRY_KEY = 'auth_token_expiry'
const EXPIRE_MS = 24 * 60 * 60 * 1000

function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + EXPIRE_MS))
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EXPIRY_KEY)
}

function isTokenValid(): boolean {
  const token = localStorage.getItem(TOKEN_KEY)
  const expiry = localStorage.getItem(EXPIRY_KEY)
  if (!token || !expiry) return false
  return Date.now() < Number(expiry)
}

interface AuthStore {
  isAuthenticated: boolean
  isInitializing: boolean  // true only during the initial initialize() boot call
  isLoading: boolean       // true during login/setup/enroll operations
  status: AuthStatus | null
  error: string | null

  initialize: () => Promise<void>
  login: (password: string) => Promise<void>
  loginWithTouchId: () => Promise<void>
  setupPassword: (password: string, confirmPassword: string) => Promise<void>
  completeSetup: () => void
  enrollTouchId: () => Promise<void>
  logout: () => void
  clearError: () => void
  refreshStatus: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  isAuthenticated: isTokenValid(),
  isInitializing: true,
  isLoading: false,
  status: null,
  error: null,

  initialize: async () => {
    if (isTokenValid()) {
      set({ isAuthenticated: true })
      try {
        const { data } = await api.get<AuthStatus>('/auth/status')
        set({ status: data, isInitializing: false })
      } catch {
        set({ isInitializing: false })
      }
      return
    }
    clearToken()
    set({ isAuthenticated: false })
    try {
      const { data } = await api.get<AuthStatus>('/auth/status')
      set({ status: data, isInitializing: false })
    } catch {
      set({ status: { onboarding_complete: false, has_webauthn: false, has_password: false }, isInitializing: false })
    }
  },

  refreshStatus: async () => {
    try {
      const { data } = await api.get<AuthStatus>('/auth/status')
      set({ status: data })
    } catch {
      // ignore
    }
  },

  login: async (password: string) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await api.post('/auth/login', { password })
      saveToken(data.access_token)
      set({ isAuthenticated: true, isLoading: false })
    } catch (e) {
      set({ isLoading: false, error: getAuthErrorMessage(e) })
      throw e
    }
  },

  loginWithTouchId: async () => {
    set({ isLoading: true, error: null })
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser')
      const { data: options } = await api.get('/auth/webauthn/authenticate-begin')
      const credential = await startAuthentication(options)
      const { data } = await api.post('/auth/webauthn/authenticate-finish', credential)
      saveToken(data.access_token)
      set({ isAuthenticated: true, isLoading: false })
    } catch (e) {
      set({ isLoading: false, error: getAuthErrorMessage(e) })
      throw e
    }
  },

  setupPassword: async (password: string, confirmPassword: string) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await api.post('/auth/setup', { password, confirm_password: confirmPassword })
      saveToken(data.access_token)
      // Don't set isAuthenticated or refresh status yet — refreshStatus would flip
      // onboarding_complete to true, causing AuthGate to swap SetupScreen for LockScreen
      // before the Touch ID enrollment step can be shown.
      // completeSetup() handles both once enrollment is done or skipped.
      set({ isLoading: false })
    } catch (e) {
      set({ isLoading: false, error: getAuthErrorMessage(e) })
      throw e
    }
  },

  completeSetup: () => {
    // Now safe to refresh status and mark authenticated — Touch ID step is done
    get().refreshStatus()
    set({ isAuthenticated: true })
  },

  enrollTouchId: async () => {
    set({ isLoading: true, error: null })
    try {
      const { startRegistration } = await import('@simplewebauthn/browser')
      const { data: options } = await api.get('/auth/webauthn/register-begin')
      const credential = await startRegistration(options)
      await api.post('/auth/webauthn/register-finish', credential)
      set({ isLoading: false })
      get().refreshStatus()
    } catch (e) {
      set({ isLoading: false, error: getAuthErrorMessage(e) })
      throw e
    }
  },

  logout: () => {
    clearToken()
    set({ isAuthenticated: false })
    api.post('/auth/logout').catch(() => {})
  },

  clearError: () => set({ error: null }),
}))

// Listen for token expiry events from the API interceptor
if (typeof window !== 'undefined') {
  window.addEventListener('auth:expired', () => {
    useAuthStore.getState().logout()
  })
}
