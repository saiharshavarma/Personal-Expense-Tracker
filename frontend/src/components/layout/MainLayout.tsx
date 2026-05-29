import { motion, AnimatePresence } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { useUIStore } from '@/store'
import { MobileNav, Sidebar } from './Sidebar'

interface MainLayoutProps {
  children: React.ReactNode
}

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.15, ease: 'easeIn' } },
}

export function MainLayout({ children }: MainLayoutProps) {
  const { sidebarCollapsed } = useUIStore()
  const location = useLocation()

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <MobileNav />
      <motion.main
        className={`min-h-screen transition-[margin] duration-300 ease-out ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-60'}`}
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
