import { create } from 'zustand'

interface Notification {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  description?: string
}

interface UIStore {
  theme: 'light' | 'dark'
  sidebarCollapsed: boolean
  notifications: Notification[]
  // Badge counts shown in the sidebar
  needsReviewCount: number
  importQueueCount: number
  // Toggle: exclude reimbursable transactions from financial analytics
  excludeReimbursable: boolean

  toggleTheme: () => void
  setTheme: (theme: 'light' | 'dark') => void
  toggleSidebar: () => void
  addNotification: (n: Omit<Notification, 'id'>) => void
  removeNotification: (id: string) => void
  setBadgeCounts: (counts: { needsReviewCount?: number; importQueueCount?: number }) => void
  toggleExcludeReimbursable: () => void
}

function getStoredTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  const stored = localStorage.getItem('theme') as 'light' | 'dark' | null
  if (stored) return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredExcludeReimbursable(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('excludeReimbursable') === 'true'
}

function applyTheme(theme: 'light' | 'dark') {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
  localStorage.setItem('theme', theme)
}

export const useUIStore = create<UIStore>((set, get) => ({
  theme: getStoredTheme(),
  sidebarCollapsed: false,
  notifications: [],
  needsReviewCount: 0,
  importQueueCount: 0,
  excludeReimbursable: getStoredExcludeReimbursable(),

  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light'
    applyTheme(next)
    set({ theme: next })
  },

  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  addNotification: (n) => {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ notifications: [...s.notifications, { ...n, id }] }))
    setTimeout(() => get().removeNotification(id), 5000)
  },

  removeNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),

  setBadgeCounts: (counts) => set((s) => ({
    needsReviewCount: counts.needsReviewCount ?? s.needsReviewCount,
    importQueueCount: counts.importQueueCount ?? s.importQueueCount,
  })),

  toggleExcludeReimbursable: () => set((s) => {
    const next = !s.excludeReimbursable
    localStorage.setItem('excludeReimbursable', String(next))
    return { excludeReimbursable: next }
  }),
}))

// Apply theme on module load
if (typeof window !== 'undefined') {
  applyTheme(getStoredTheme())
}
