import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Toaster } from 'sonner'
import { AuthGate } from '@/components/auth/AuthGate'
import { SetupScreen } from '@/components/auth/SetupScreen'
import { Dashboard } from '@/pages/Dashboard'
import { Transactions } from '@/pages/Transactions'
import { Import } from '@/pages/Import'
import { Analytics } from '@/pages/Analytics'
import { Budget } from '@/pages/Budget'
import { Reimbursements } from '@/pages/Reimbursements'
import { Subscriptions } from '@/pages/Subscriptions'
import { Trips } from '@/pages/Trips'
import { AskAI } from '@/pages/AskAI'
import { FinanceAdvisor } from '@/pages/FinanceAdvisor'
import { Settings } from '@/pages/Settings'
import { CommandPalette } from '@/components/CommandPalette'

export function App() {
  return (
    <BrowserRouter>
      <Toaster position="bottom-right" richColors closeButton duration={4000} />
      <CommandPalette />
      <AnimatePresence mode="wait">
        <Routes>
          {/* First-launch setup — no AuthGate */}
          <Route path="/setup" element={<SetupScreen />} />

          {/* All authenticated routes wrapped in AuthGate */}
          <Route
            path="/*"
            element={
              <AuthGate>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/transactions" element={<Transactions />} />
                  <Route path="/import" element={<Import />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/budget" element={<Budget />} />
                  <Route path="/reimbursements" element={<Reimbursements />} />
                  <Route path="/subscriptions" element={<Subscriptions />} />
                  <Route path="/trips" element={<Trips />} />
                  <Route path="/ask-ai" element={<AskAI />} />
                  <Route path="/advisor" element={<FinanceAdvisor />} />
                  <Route path="/settings" element={<Settings />} />
                  {/* Catch-all */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </AuthGate>
            }
          />
        </Routes>
      </AnimatePresence>
    </BrowserRouter>
  )
}
