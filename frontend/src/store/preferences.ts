import { create } from 'zustand'
import { api } from '@/utils/apiClient'

export interface Preferences {
  ai_provider: 'anthropic' | 'openai'
  ai_model_categorization: string
  ai_model_insights: string
  ai_insights_opt_in: boolean
  anthropic_api_key_set: boolean
  openai_api_key_set: boolean
  theme: 'light' | 'dark'
  onboarding_complete: boolean
  currency: string
}

interface PreferencesStore {
  prefs: Preferences | null
  loading: boolean
  saving: boolean
  // Load from backend — idempotent, safe to call multiple times
  load: () => Promise<void>
  // Optimistically update a subset and persist to backend
  update: (patch: Partial<Preferences>) => Promise<void>
}

const DEFAULT_PREFS: Preferences = {
  ai_provider: 'anthropic',
  ai_model_categorization: 'claude-haiku-4-5',
  ai_model_insights: 'claude-sonnet-4-5',
  ai_insights_opt_in: false,
  anthropic_api_key_set: false,
  openai_api_key_set: false,
  theme: 'light',
  onboarding_complete: false,
  currency: 'USD',
}

export const usePreferencesStore = create<PreferencesStore>((set, get) => ({
  prefs: null,
  loading: false,
  saving: false,

  load: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const { data } = await api.get('/preferences')
      set({ prefs: { ...DEFAULT_PREFS, ...data } })
    } catch {
      // If preferences can't be loaded (e.g. not logged in yet), leave null
    } finally {
      set({ loading: false })
    }
  },

  update: async (patch) => {
    // Optimistic update so the UI reacts instantly
    set((s) => ({ prefs: s.prefs ? { ...s.prefs, ...patch } : { ...DEFAULT_PREFS, ...patch } }))
    set({ saving: true })
    try {
      await api.put('/preferences', patch)
    } catch {
      // On failure we leave the optimistic value in place — backend will correct on next load
    } finally {
      set({ saving: false })
    }
  },
}))
