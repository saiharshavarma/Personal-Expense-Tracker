import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, ArrowLeftRight, Upload, BarChart3, Target,
  Receipt, RefreshCw, Plane, MessageSquare, Settings,
  ChevronsLeft, ChevronsRight, Moon, Sun, LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore, useAuthStore } from '@/store'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', to: '/' },
  { icon: ArrowLeftRight, label: 'Transactions', to: '/transactions' },
  { icon: Upload, label: 'Import', to: '/import' },
  { icon: BarChart3, label: 'Analytics', to: '/analytics' },
  { icon: Target, label: 'Budget', to: '/budget' },
  { icon: Receipt, label: 'Reimbursements', to: '/reimbursements' },
  { icon: RefreshCw, label: 'Subscriptions', to: '/subscriptions' },
  { icon: Plane, label: 'Trips', to: '/trips' },
  { icon: MessageSquare, label: 'Ask AI', to: '/ask-ai' },
  { icon: Settings, label: 'Settings', to: '/settings' },
]

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, theme, toggleTheme } = useUIStore()
  const { logout } = useAuthStore()
  const location = useLocation()

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
          {navItems.map(({ icon: Icon, label, to }) => {
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
                <Icon className={cn('w-4 h-4 flex-shrink-0', isActive && 'text-primary-foreground')} />
                <AnimatePresence>
                  {!sidebarCollapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="truncate"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </NavLink>
            )

            if (sidebarCollapsed) {
              return (
                <Tooltip key={to}>
                  <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                  <TooltipContent side="right">{label}</TooltipContent>
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
