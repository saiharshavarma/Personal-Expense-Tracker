import { motion, AnimatePresence } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { useUIStore } from '@/store'
import { MobileNav, Sidebar } from './Sidebar'

interface MainLayoutProps {
  children: React.ReactNode
}

const pageVariants = {
  initial: { opacity: 0, y: 14, scale: 0.995, filter: 'blur(3px)' },
  animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] } },
  exit:    { opacity: 0, y: -8, scale: 0.998, filter: 'blur(2px)', transition: { duration: 0.16, ease: 'easeIn' } },
}

export function MainLayout({ children }: MainLayoutProps) {
  const { sidebarCollapsed } = useUIStore()
  const location = useLocation()

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="app-ambient animate-grid-drift pointer-events-none fixed inset-0 opacity-60" />
      <Sidebar />
      <MobileNav />
      <motion.main
        className={`relative min-h-screen transition-[margin] duration-300 ease-out ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-60'}`}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="mx-auto max-w-[1600px] px-4 py-5 pb-24 sm:px-6 md:pb-6 lg:p-8"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </motion.main>
    </div>
  )
}
