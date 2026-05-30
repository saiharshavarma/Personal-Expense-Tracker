import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Fingerprint, Eye, EyeOff, Lock, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/store'

export function LockScreen() {
  const { login, loginWithTouchId, resetPasswordWithRecoveryToken, isLoading, error, clearError, status } = useAuthStore()
  const [mode, setMode] = useState<'touchid' | 'password'>(
    status?.has_webauthn ? 'touchid' : 'password'
  )
  const [password, setPassword] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [recoveryToken, setRecoveryToken] = useState('')
  const [resetError, setResetError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [touchIdError, setTouchIdError] = useState<string | null>(null)

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    try {
      await login(password)
    } catch {
      // error shown via store
    }
  }

  const handleTouchId = async () => {
    setTouchIdError(null)
    clearError()
    try {
      await loginWithTouchId()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('cancel') || msg.includes('abort')) {
        setTouchIdError('Touch ID was cancelled')
      } else {
        setTouchIdError('Touch ID failed. Try your password.')
        setMode('password')
      }
    }
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetError(null)
    clearError()
    if (resetPassword.length < 12) {
      setResetError('Password must be at least 12 characters')
      return
    }
    if (resetPassword !== resetConfirm) {
      setResetError('Passwords do not match')
      return
    }
    try {
      await resetPasswordWithRecoveryToken(resetPassword, resetConfirm, recoveryToken)
    } catch {
      // store error is shown below
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm mx-auto px-6 space-y-8"
      >
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground mx-auto">
            <Shield className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Finance Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in to continue</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {mode === 'touchid' ? (
            <motion.div
              key="touchid"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <button
                onClick={handleTouchId}
                disabled={isLoading}
                className="w-full group flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 p-8 transition-all disabled:opacity-50"
              >
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors"
                >
                  <Fingerprint className="w-8 h-8" />
                </motion.div>
                <div className="text-center">
                  <p className="font-medium">Touch ID</p>
                  <p className="text-sm text-muted-foreground">Place your finger on the sensor</p>
                </div>
              </button>

              {(touchIdError || error) && (
                <p className="text-sm text-destructive text-center">{touchIdError || error}</p>
              )}

              <div className="text-center">
                <button
                  onClick={() => { setMode('password'); clearError(); setTouchIdError(null) }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Use Password Instead
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="password"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
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

                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
                )}

                <Button type="submit" className="w-full" size="lg" disabled={isLoading || !password}>
                  <Lock className="w-4 h-4" />
                  {isLoading ? 'Signing in…' : 'Sign In'}
                </Button>

                {status?.has_webauthn && (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => { setMode('touchid'); clearError() }}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Use Touch ID Instead
                    </button>
                  </div>
                )}

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setResetOpen((v) => !v); clearError(); setResetError(null) }}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>

                {resetOpen && (
                  <motion.form
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    onSubmit={handleReset}
                    className="mt-4 space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
                  >
                    <div className="flex gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
                      <div>
                        <p className="text-sm font-medium text-destructive">Reset password</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Enter the recovery token you saved when you created this app. Your local finance data will be preserved.
                        </p>
                      </div>
                    </div>

                    {!status?.has_recovery_token && (
                      <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                        This app does not have a recovery token configured. Sign in with your password or Touch ID, then generate one in Settings.
                      </p>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="recovery-token" className="text-xs">Recovery token</Label>
                      <Input
                        id="recovery-token"
                        value={recoveryToken}
                        onChange={(e) => setRecoveryToken(e.target.value)}
                        placeholder="FD-RECOVERY-..."
                        autoCapitalize="none"
                        autoCorrect="off"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="reset-password" className="text-xs">New password</Label>
                      <Input
                        id="reset-password"
                        type="password"
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        placeholder="At least 12 characters"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="reset-confirm" className="text-xs">Confirm new password</Label>
                      <Input
                        id="reset-confirm"
                        type="password"
                        value={resetConfirm}
                        onChange={(e) => setResetConfirm(e.target.value)}
                      />
                    </div>

                    {(resetError || error) && (
                      <p className="text-xs text-destructive">{resetError || error}</p>
                    )}

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isLoading || !recoveryToken.trim() || !status?.has_recovery_token}
                    >
                      {isLoading ? 'Resetting…' : 'Reset Password'}
                    </Button>
                  </motion.form>
                )}
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
