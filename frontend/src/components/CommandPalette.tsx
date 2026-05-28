import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, CreditCard, Upload, BarChart2, Target,
  RefreshCw, Plane, Brain, BrainCircuit, Settings, Search, ArrowRight,
} from 'lucide-react'

interface Command {
  id: string
  label: string
  description?: string
  icon: React.ElementType
  action: () => void
  keywords?: string
}

// ── Command palette overlay ────────────────────────────────────────────────────

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const go = useCallback((path: string) => {
    navigate(path)
    setOpen(false)
    setQuery('')
  }, [navigate])

  const COMMANDS: Command[] = [
    { id: 'dashboard',      label: 'Dashboard',          description: 'Overview & key metrics',   icon: LayoutDashboard, action: () => go('/'),              keywords: 'home overview' },
    { id: 'transactions',   label: 'Transactions',        description: 'Browse & edit all transactions', icon: CreditCard,      action: () => go('/transactions'),  keywords: 'spend ledger' },
    { id: 'import',         label: 'Import',             description: 'Upload CSV or PDF statements',  icon: Upload,          action: () => go('/import'),        keywords: 'upload csv pdf' },
    { id: 'analytics',      label: 'Analytics',          description: 'Charts & spending trends',  icon: BarChart2,       action: () => go('/analytics'),     keywords: 'charts graphs stats' },
    { id: 'budget',         label: 'Budget',             description: 'Category budgets & 50/30/20',  icon: Target,          action: () => go('/budget'),        keywords: 'limits goals plan' },
    { id: 'subscriptions',  label: 'Subscriptions',      description: 'Recurring charges tracker', icon: RefreshCw,       action: () => go('/subscriptions'), keywords: 'recurring monthly' },
    { id: 'reimbursements', label: 'Reimbursements',     description: 'Track work expense repayments', icon: RefreshCw,    action: () => go('/reimbursements'),keywords: 'expense work' },
    { id: 'trips',          label: 'Business Trips',     description: 'Trip-based expense grouping', icon: Plane,          action: () => go('/trips'),         keywords: 'travel business' },
    { id: 'ask-ai',         label: 'Ask AI',             description: 'Natural-language finance Q&A', icon: Brain,          action: () => go('/ask-ai'),        keywords: 'chat gpt claude question' },
    { id: 'advisor',        label: 'Finance Advisor',    description: 'AI-powered wealth strategy',  icon: BrainCircuit,   action: () => go('/advisor'),       keywords: 'advisor strategy wealth cfp financial plan' },
    { id: 'settings',       label: 'Settings',           description: 'Accounts, AI, appearance',  icon: Settings,        action: () => go('/settings'),      keywords: 'preferences config' },
  ]

  const filtered = query.trim()
    ? COMMANDS.filter(c => {
        const q = query.toLowerCase()
        return (
          c.label.toLowerCase().includes(q) ||
          (c.description ?? '').toLowerCase().includes(q) ||
          (c.keywords ?? '').toLowerCase().includes(q)
        )
      })
    : COMMANDS

  // Reset active index when results change
  useEffect(() => { setActiveIdx(0) }, [query])

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
        setQuery('')
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filtered[activeIdx]?.action()
    }
  }

  if (!open) return null

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      {/* Frosted overlay */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />

      {/* Palette panel */}
      <div
        className="relative w-full max-w-md mx-4 rounded-xl border bg-popover shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Go to…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border bg-muted text-muted-foreground">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No results for "{query}"</p>
          ) : (
            filtered.map((cmd, idx) => {
              const Icon = cmd.icon
              const active = idx === activeIdx
              return (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{cmd.label}</p>
                    {cmd.description && (
                      <p className="text-xs text-muted-foreground truncate">{cmd.description}</p>
                    )}
                  </div>
                  {active && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                </button>
              )
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t text-[10px] text-muted-foreground">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span><kbd className="font-mono">⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>
  )
}
