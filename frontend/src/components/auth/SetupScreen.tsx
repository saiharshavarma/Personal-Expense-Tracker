import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Shield, Fingerprint, Eye, EyeOff, ArrowRight, CheckCircle2, Copy, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAuthStore } from '@/store'

export function SetupScreen() {
  const { setupPassword, enrollTouchId, completeSetup, isLoading, error, clearError } = useAuthStore()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [enableTouchId, setEnableTouchId] = useState(true)
  const [step, setStep] = useState<'setup' | 'recovery' | 'touchid' | 'done'>('setup')
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null)
  const [copiedRecovery, setCopiedRecovery] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    clearError()
    if (password.length < 12) { setLocalError('Password must be at least 12 characters'); return }
    if (password !== confirm) { setLocalError('Passwords do not match'); return }
    try {
      const token = await setupPassword(password, confirm)
      setRecoveryToken(token)
      setStep('recovery')
    } catch {
      // error shown via store
    }
  }

  const handleCopyRecoveryToken = async () => {
    if (!recoveryToken) return
    try {
      await navigator.clipboard.writeText(recoveryToken)
      setCopiedRecovery(true)
      setTimeout(() => setCopiedRecovery(false), 2000)
    } catch {
      setCopiedRecovery(false)
    }
  }

  const continueAfterRecovery = () => {
    setStep(enableTouchId ? 'touchid' : 'done')
  }

  const handleEnrollTouchId = async () => {
    try {
      await enrollTouchId()
    } catch {
      // TouchID optional — proceed anyway
    }
    setStep('done')
  }

  // Navigate to dashboard only after the 'done' step is shown briefly
  useEffect(() => {
    if (step === 'done') {
      const t = setTimeout(() => completeSetup(), 1500)
      return () => clearTimeout(t)
    }
  }, [step, completeSetup])

  if (step === 'recovery') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="min-h-screen flex items-center justify-center bg-background"
      >
        <div className="w-full max-w-md mx-auto px-6 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 mx-auto">
              <KeyIcon />
            </div>
            <h2 className="text-2xl font-semibold">Save Your Recovery Token</h2>
            <p className="text-sm text-muted-foreground">
              This token can reset your password later without deleting your local finance data. It is shown only once.
            </p>
          </div>

          <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
            <div className="flex gap-2 text-sm text-amber-600">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>Store this somewhere safe. The app keeps only a secure hash, so it cannot show this token again.</p>
            </div>
            <div className="rounded-md border bg-background p-3 font-mono text-sm break-all select-all">
              {recoveryToken}
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={handleCopyRecoveryToken}>
              {copiedRecovery ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedRecovery ? 'Copied' : 'Copy Recovery Token'}
            </Button>
          </div>

          <Button className="w-full" size="lg" onClick={continueAfterRecovery}>
            I Saved My Recovery Token
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </motion.div>
    )
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
                placeholder="Minimum 12 characters"
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
          Your data is stored locally on this Mac only. Save your recovery token on the next step.
        </p>
      </div>
    </motion.div>
  )
}

function KeyIcon() {
  return <Shield className="w-7 h-7" />
}
