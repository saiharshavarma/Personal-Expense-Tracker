import { motion, AnimatePresence } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { useUIStore } from '@/store'
import { Sidebar } from './Sidebar'
import { Mascot } from '@/components/Mascot'

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
      <motion.main
        animate={{ marginLeft: sidebarCollapsed ? 64 : 240 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="min-h-screen"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="max-w-[1600px] mx-auto p-6 lg:p-8"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </motion.main>
      <Mascot />
    </div>
  )
}
