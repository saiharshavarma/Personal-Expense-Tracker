import { motion } from 'framer-motion'
import { useUIStore } from '@/store'
import { Sidebar } from './Sidebar'

interface MainLayoutProps {
  children: React.ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  const { sidebarCollapsed } = useUIStore()

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <motion.main
        animate={{ marginLeft: sidebarCollapsed ? 64 : 240 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="min-h-screen"
      >
        <div className="max-w-[1600px] mx-auto p-6 lg:p-8">
          {children}
        </div>
      </motion.main>
    </div>
  )
}
