import { useState } from 'react'
import { motion } from 'framer-motion'
import { Shield, Fingerprint, Eye, EyeOff, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAuthStore } from '@/store'

export function SetupScreen() {
  const { setupPassword, enrollTouchId, isLoading, error, clearError } = useAuthStore()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [enableTouchId, setEnableTouchId] = useState(true)
  const [step, setStep] = useState<'setup' | 'touchid' | 'done'>('setup')
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    clearError()
    if (password.length < 6) { setLocalError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setLocalError('Passwords do not match'); return }
    try {
      await setupPassword(password, confirm)
      if (enableTouchId) {
        setStep('touchid')
      } else {
        setStep('done')
      }
    } catch {
      // error shown via store
    }
  }

  const handleEnrollTouchId = async () => {
    try {
      await enrollTouchId()
      setStep('done')
    } catch {
      setStep('done') // TouchID optional — proceed anyway
    }
  }

  if (step === 'touchid') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="min-h-screen flex items-center justify-center bg-background"
      >
        <div className="w-full max-w-sm mx-auto px-6 text-center space-y-6">
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 text-primary mx-auto"
          >
            <Fingerprint className="w-10 h-10" />
          </motion.div>
          <div>
            <h2 className="text-2xl font-semibold">Enable Touch ID</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Use your Mac's Touch ID for quick, secure sign-in. Your biometric data never leaves your device.
            </p>
          </div>
          <Button onClick={handleEnrollTouchId} className="w-full" size="lg">
            <Fingerprint className="w-4 h-4" />
            Set Up Touch ID
          </Button>
          <button onClick={() => setStep('done')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Skip for now
          </button>
        </div>
      </motion.div>
    )
  }

  if (step === 'done') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="min-h-screen flex items-center justify-center bg-background"
      >
        <div className="text-center space-y-4">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
          </motion.div>
          <h2 className="text-2xl font-semibold">You're all set!</h2>
          <p className="text-muted-foreground">Taking you to your dashboard…</p>
        </div>
      </motion.div>
    )
  }

  const displayError = localError || error

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen flex items-center justify-center bg-background"
    >
      <div className="w-full max-w-sm mx-auto px-6 space-y-8">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground mx-auto">
            <Shield className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold">Finance Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Create a password to protect your financial data.<br />
            Everything stays on your Mac — nothing leaves.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSetup} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Create Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm Password</Label>
            <Input
              id="confirm"
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Enter password again"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <Fingerprint className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Enable Touch ID</p>
                <p className="text-xs text-muted-foreground">Sign in with your fingerprint</p>
              </div>
            </div>
            <Switch checked={enableTouchId} onCheckedChange={setEnableTouchId} />
          </div>

          {displayError && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{displayError}</p>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
            {isLoading ? 'Setting up…' : 'Get Started'}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Your data is stored locally on this Mac only.
        </p>
      </div>
    </motion.div>
  )
}
