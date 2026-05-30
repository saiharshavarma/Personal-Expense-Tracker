import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, ArrowLeftRight, Upload, BarChart3, Target,
  Receipt, RefreshCw, Plane, MessageSquare, BrainCircuit, Settings,
  ChevronsLeft, ChevronsRight, Moon, Sun, LogOut, Wallet, Cpu,
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

const navPulseRoutes = new Set(['/transactions', '/import', '/reimbursements', '/advisor'])

function useNavItems() {
  const { needsReviewCount, importQueueCount } = useUIStore()
  return [
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
    { icon: Cpu,             label: 'App Insights',   to: '/app-insights' },
    { icon: Settings,        label: 'Settings',       to: '/settings' },
  ] satisfies NavItem[]
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, theme, toggleTheme, setBadgeCounts } = useUIStore()
  const { logout } = useAuthStore()
  const location = useLocation()
  const navItems = useNavItems()

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

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        animate={{ width: sidebarCollapsed ? 64 : 240 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed left-0 top-0 z-40 hidden h-screen flex-col overflow-hidden border-r bg-card md:flex"
      >
        {/* Header */}
        <div className={cn('flex items-center h-16 px-3 border-b', sidebarCollapsed ? 'justify-center' : 'justify-between px-4')}>
          {sidebarCollapsed && (
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Wallet className="w-4 h-4 text-white" />
            </div>
          )}
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 min-w-0"
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Wallet className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-sm truncate bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-indigo-400">Fintrack</span>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
                  'relative flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-[background-color,color,transform] duration-150 group hover:-translate-y-px active:translate-y-0',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  sidebarCollapsed && 'justify-center px-2'
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 -z-10 rounded-lg bg-primary"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                {/* Icon — show a dot when collapsed and badge > 0 */}
                <span className="relative flex-shrink-0">
                  <Icon className={cn('w-4 h-4', isActive && 'text-primary-foreground')} />
                  {!isActive && navPulseRoutes.has(to) && (
                    <span className="live-dot absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  )}
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
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
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
                aria-label="Lock app"
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

export function MobileNav() {
  const location = useLocation()
  const navItems = useNavItems()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 backdrop-blur md:hidden">
      <div className="flex h-16 items-center gap-1 overflow-x-auto px-2 pb-[env(safe-area-inset-bottom)]">
        {navItems.map(({ icon: Icon, label, to, badge }) => {
          const isActive = to === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                'relative flex h-12 min-w-[68px] flex-col items-center justify-center gap-1 rounded-lg px-2 text-[10px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.98]',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="mobile-active-pill"
                  className="absolute inset-0 -z-10 rounded-lg bg-primary"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">
                <Icon className="h-4 w-4" />
                {!isActive && navPulseRoutes.has(to) && (
                  <span className="live-dot absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                )}
                {badge != null && badge > 0 && (
                  <span className="absolute -right-2 -top-2 min-w-[16px] rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-4 text-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span className="max-w-[60px] truncate">{label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
