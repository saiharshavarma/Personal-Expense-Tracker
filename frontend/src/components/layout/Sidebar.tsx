import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, ArrowLeftRight, Upload, BarChart3, Target,
  Receipt, RefreshCw, Plane, MessageSquare, BrainCircuit, Settings,
  ChevronsLeft, ChevronsRight, Moon, Sun, LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore, useAuthStore } from '@/store'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { api } from '@/utils/apiClient'

// Fetch badge counts every 60 s while the app is open
const BADGE_POLL_MS = 60_000

async function fetchBadgeCounts(setBadgeCounts: (c: { needsReviewCount?: number; importQueueCount?: number }) => void) {
  try {
    const [reviewRes, queueRes] = await Promise.allSettled([
      api.get('/transactions', { params: { needs_review: 'true', page_size: 1, page: 1 } }),
      api.get('/import/review-queue'),
    ])
    const needsReviewCount =
      reviewRes.status === 'fulfilled' ? (reviewRes.value.data.total ?? 0) : undefined
    const importQueueCount =
      queueRes.status === 'fulfilled' ? (queueRes.value.data.length ?? 0) : undefined
    setBadgeCounts({ needsReviewCount, importQueueCount })
  } catch { /* ignore */ }
}

// Badge pill rendered inside a nav item
function NavBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
      {count > 99 ? '99+' : count}
    </span>
  )
}

interface NavItem {
  icon: React.ElementType
  label: string
  to: string
  badge?: number
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, theme, toggleTheme, needsReviewCount, importQueueCount, setBadgeCounts } = useUIStore()
  const { logout } = useAuthStore()
  const location = useLocation()

  // Fetch on mount and on a polling interval
  useEffect(() => {
    fetchBadgeCounts(setBadgeCounts)
    const id = setInterval(() => fetchBadgeCounts(setBadgeCounts), BADGE_POLL_MS)
    return () => clearInterval(id)
  }, [])

  // Re-fetch when navigating away from Import or Transactions pages
  // so the badges update without waiting for the next poll
  useEffect(() => {
    fetchBadgeCounts(setBadgeCounts)
  }, [location.pathname])

  const navItems: NavItem[] = [
    { icon: LayoutDashboard, label: 'Dashboard',      to: '/' },
    { icon: ArrowLeftRight,  label: 'Transactions',   to: '/transactions', badge: needsReviewCount },
    { icon: Upload,          label: 'Import',         to: '/import',       badge: importQueueCount },
    { icon: BarChart3,       label: 'Analytics',      to: '/analytics' },
    { icon: Target,          label: 'Budget',         to: '/budget' },
    { icon: Receipt,         label: 'Reimbursements', to: '/reimbursements' },
    { icon: RefreshCw,       label: 'Subscriptions',  to: '/subscriptions' },
    { icon: Plane,           label: 'Trips',          to: '/trips' },
    { icon: MessageSquare,   label: 'Ask AI',         to: '/ask-ai' },
    { icon: BrainCircuit,    label: 'Finance Advisor', to: '/advisor' },
    { icon: Settings,        label: 'Settings',       to: '/settings' },
  ]

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        animate={{ width: sidebarCollapsed ? 64 : 240 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed left-0 top-0 h-screen flex flex-col border-r bg-card z-40 overflow-hidden"
      >
        {/* Header */}
        <div className={cn('flex items-center h-16 px-3 border-b', sidebarCollapsed ? 'justify-center' : 'justify-between px-4')}>
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 min-w-0"
              >
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-foreground text-xs font-bold">F</span>
                </div>
                <span className="font-semibold text-sm truncate">Finance</span>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={toggleSidebar}
            className={cn(
              'p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex-shrink-0',
              sidebarCollapsed && 'mx-auto'
            )}
          >
            {sidebarCollapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map(({ icon: Icon, label, to, badge }) => {
            const isActive = to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(to)

            const linkEl = (
              <NavLink
                key={to}
                to={to}
                className={cn(
                  'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors group',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  sidebarCollapsed && 'justify-center px-2'
                )}
              >
                {/* Icon — show a dot when collapsed and badge > 0 */}
                <span className="relative flex-shrink-0">
                  <Icon className={cn('w-4 h-4', isActive && 'text-primary-foreground')} />
                  {sidebarCollapsed && badge != null && badge > 0 && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500" />
                  )}
                </span>

                <AnimatePresence>
                  {!sidebarCollapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="truncate flex-1"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>

                {/* Badge pill — only when sidebar is expanded */}
                {!sidebarCollapsed && badge != null && (
                  <NavBadge count={badge} />
                )}
              </NavLink>
            )

            if (sidebarCollapsed) {
              return (
                <Tooltip key={to}>
                  <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                  <TooltipContent side="right">
                    {label}{badge != null && badge > 0 ? ` (${badge})` : ''}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return linkEl
          })}
        </nav>

        {/* Footer */}
        <div className={cn('p-2 border-t space-y-0.5', sidebarCollapsed && 'flex flex-col items-center')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleTheme}
                className={cn(
                  'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors w-full',
                  sidebarCollapsed && 'justify-center px-2'
                )}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 flex-shrink-0" /> : <Moon className="w-4 h-4 flex-shrink-0" />}
                <AnimatePresence>
                  {!sidebarCollapsed && (
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </TooltipTrigger>
            {sidebarCollapsed && <TooltipContent side="right">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</TooltipContent>}
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={logout}
                className={cn(
                  'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors w-full',
                  sidebarCollapsed && 'justify-center px-2'
                )}
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                <AnimatePresence>
                  {!sidebarCollapsed && (
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      Lock
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </TooltipTrigger>
            {sidebarCollapsed && <TooltipContent side="right">Lock</TooltipContent>}
          </Tooltip>
        </div>
      </motion.aside>
    </TooltipProvider>
  )
}
