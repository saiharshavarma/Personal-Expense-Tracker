import { useEffect } from 'react'
import { useAuthStore } from '@/store'
import { LockScreen } from './LockScreen'
import { SetupScreen } from './SetupScreen'

interface AuthGateProps {
  children: React.ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const { isAuthenticated, status, initialize, isLoading } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [])

  // Still initializing
  if (isLoading || status === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground text-sm">Loading…</div>
      </div>
    )
  }

  if (isAuthenticated) return <>{children}</>

  // First launch — needs setup
  if (!status.onboarding_complete) {
    return <SetupScreen />
  }

  // Has account but not authenticated — show lock screen
  return <LockScreen />
}
