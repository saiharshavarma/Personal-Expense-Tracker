import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings2, CreditCard, Repeat, Tag, Brain, Smartphone, Palette,
  Database, Download, Shield, ChevronRight, Sun, Moon, Check,
  Fingerprint, KeyRound, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff, Save
} from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { useUIStore } from '@/store/ui'
import { useAuthStore } from '@/store'
import { api } from '@/utils/apiClient'

type SettingsTab = 'accounts' | 'categories' | 'ai' | 'ios' | 'appearance' | 'backup' | 'security'

const TABS: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'accounts', label: 'Accounts & Income', icon: CreditCard },
  { id: 'categories', label: 'Categories & Rules', icon: Tag },
  { id: 'ai', label: 'AI Configuration', icon: Brain },
  { id: 'ios', label: 'iOS Shortcut', icon: Smartphone },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'backup', label: 'Backup & Export', icon: Database },
  { id: 'security', label: 'Security', icon: Shield },
]

function AccountsTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Accounts</CardTitle>
          <CardDescription>Manage your credit cards, bank accounts, and payment methods</CardDescription>
        </CardHeader>
        <CardContent className="py-8 text-center">
          <CreditCard className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">No accounts configured</p>
          <p className="text-sm text-muted-foreground mt-1">Add your accounts to track transactions per card or bank</p>
          <Button size="sm" variant="outline" className="mt-4">Add Account</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Income Schedules</CardTitle>
          <CardDescription>Set your paycheck schedule for savings rate calculation</CardDescription>
        </CardHeader>
        <CardContent className="py-8 text-center">
          <Repeat className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">No income schedules</p>
          <p className="text-sm text-muted-foreground mt-1">Define your income so we can calculate your savings rate</p>
          <Button size="sm" variant="outline" className="mt-4">Add Income Schedule</Button>
        </CardContent>
      </Card>
    </div>
  )
}

function CategoriesTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Merchant Rules</CardTitle>
          <CardDescription>Auto-categorization rules based on merchant name matching</CardDescription>
        </CardHeader>
        <CardContent className="py-8 text-center">
          <Tag className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">No merchant rules yet</p>
          <p className="text-sm text-muted-foreground mt-1">Rules are created automatically as you correct AI categorizations</p>
          <Button size="sm" variant="outline" className="mt-4">Add Rule</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Budget Categories</CardTitle>
          <CardDescription>Customize the 50/30/20 rule assignments per category</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2 py-4">
            {['Needs (50%)', 'Wants (30%)', 'Savings (20%)'].map((group) => (
              <div key={group} className="flex items-center justify-between py-2 border-b last:border-0">
                <span className="text-sm font-medium">{group}</span>
                <Button size="sm" variant="ghost" className="h-7 text-xs">Configure</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function AITab() {
  const [aiCategorize, setAiCategorize] = useState(true)
  const [aiInsights, setAiInsights] = useState(false)
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic')
  const [modelCat, setModelCat] = useState('claude-haiku-4-5')
  const [modelInsights, setModelInsights] = useState('claude-sonnet-4-5')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [showAnthropicKey, setShowAnthropicKey] = useState(false)
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    api.get('/preferences').then(r => {
      const p = r.data
      if (p.ai_provider) setProvider(p.ai_provider)
      if (p.ai_model_categorization) setModelCat(p.ai_model_categorization)
      if (p.ai_model_insights) setModelInsights(p.ai_model_insights)
      if (typeof p.ai_insights_opt_in === 'boolean') setAiInsights(p.ai_insights_opt_in)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg(null)
    try {
      await api.put('/preferences', {
        ai_provider: provider,
        ai_model_categorization: modelCat,
        ai_model_insights: modelInsights,
        ai_insights_opt_in: aiInsights,
      })
      setSaveMsg({ type: 'success', text: 'Preferences saved.' })
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setSaveMsg({ type: 'error', text: err?.response?.data?.detail || 'Failed to save preferences.' })
    } finally {
      setSaving(false)
    }
  }

  const ANTHROPIC_MODELS = ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-5']
  const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo']

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Features</CardTitle>
          <CardDescription>Control how AI is used in your finance dashboard</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="ai-categorize" className="text-sm font-medium">AI Auto-Categorization</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Use Claude Haiku to categorize imported transactions</p>
            </div>
            <Switch id="ai-categorize" checked={aiCategorize} onCheckedChange={setAiCategorize} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="ai-insights" className="text-sm font-medium">AI Insights (Ask AI page)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Enable the Ask AI page with Claude Sonnet</p>
            </div>
            <Switch id="ai-insights" checked={aiInsights} onCheckedChange={setAiInsights} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Provider</CardTitle>
          <CardDescription>Choose which AI provider to use for categorization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { id: 'anthropic' as const, name: 'Anthropic (Claude)', recommended: true },
            { id: 'openai' as const, name: 'OpenAI', recommended: false },
          ].map(({ id, name, recommended }) => (
            <button
              key={id}
              onClick={() => setProvider(id)}
              className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                provider === id ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
              }`}
            >
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{name}</span>
                  {recommended && <Badge variant="secondary" className="text-xs">Recommended</Badge>}
                </div>
              </div>
              {provider === id && <Check className="w-4 h-4 text-primary" />}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Model Selection</CardTitle>
          <CardDescription>Choose models for categorization and insights</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Categorization Model</Label>
            <select
              value={modelCat}
              onChange={e => setModelCat(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {(provider === 'anthropic' ? ANTHROPIC_MODELS : OPENAI_MODELS).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Insights Model</Label>
            <select
              value={modelInsights}
              onChange={e => setModelInsights(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {(provider === 'anthropic' ? ANTHROPIC_MODELS : OPENAI_MODELS).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Keys</CardTitle>
          <CardDescription>Keys are stored server-side in your .env — enter here to update</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Anthropic */}
          <div className="space-y-1.5">
            <Label className="text-xs font-mono">ANTHROPIC_API_KEY</Label>
            <div className="relative">
              <Input
                type={showAnthropicKey ? 'text' : 'password'}
                placeholder="sk-ant-…"
                value={anthropicKey}
                onChange={e => setAnthropicKey(e.target.value)}
                className="pr-8 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowAnthropicKey(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showAnthropicKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* OpenAI */}
          <div className="space-y-1.5">
            <Label className="text-xs font-mono">OPENAI_API_KEY</Label>
            <div className="relative">
              <Input
                type={showOpenaiKey ? 'text' : 'password'}
                placeholder="sk-…"
                value={openaiKey}
                onChange={e => setOpenaiKey(e.target.value)}
                className="pr-8 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowOpenaiKey(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showOpenaiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">Leave blank to keep the existing key. Keys are stored in your server .env and never sent to the browser after saving.</p>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save AI Settings
        </Button>
        {saveMsg && (
          <p className={`text-xs flex items-center gap-1 ${saveMsg.type === 'success' ? 'text-green-500' : 'text-destructive'}`}>
            {saveMsg.type === 'success'
              ? <CheckCircle2 className="w-3.5 h-3.5" />
              : <AlertCircle className="w-3.5 h-3.5" />}
            {saveMsg.text}
          </p>
        )}
      </div>
    </div>
  )
}

function IOSTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">iOS Shortcut Integration</CardTitle>
          <CardDescription>Log transactions instantly from your iPhone using an iOS Shortcut</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Endpoint URL</p>
            <code className="text-sm font-mono break-all">http://YOUR_MAC_IP:8000/api/ios/transaction</code>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Required Fields</p>
            <div className="space-y-1">
              {['merchant (string)', 'amount (number)', 'date (YYYY-MM-DD)', 'payment_method (string, optional)'].map((f) => (
                <p key={f} className="text-xs font-mono text-muted-foreground">{f}</p>
              ))}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Transactions logged via iOS arrive with <Badge variant="outline" className="text-xs">needs_review</Badge> status
            so you can categorize them on next import.
          </p>
          <Button variant="outline" size="sm" className="w-full">
            <Smartphone className="w-4 h-4" />
            Download iOS Shortcut Template
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function AppearanceTab() {
  const { theme, toggleTheme } = useUIStore()

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Theme</CardTitle>
          <CardDescription>Choose between light and dark mode</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { id: 'light', label: 'Light', icon: Sun },
            { id: 'dark', label: 'Dark', icon: Moon },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { if (theme !== id) toggleTheme() }}
              className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                theme === id ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{label}</span>
              </div>
              {theme === id && <Check className="w-4 h-4 text-primary" />}
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function BackupTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automatic Backups</CardTitle>
          <CardDescription>PostgreSQL pg_dump backups, compressed and stored locally</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Auto-backup on changes</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Triggered after changes, with 30-minute debounce</p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Monthly backup</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Full backup on the 1st of each month</p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Backup location</Label>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">~/Finance/Backups/</p>
            </div>
            <Button size="sm" variant="ghost" className="text-xs">Change</Button>
          </div>
          <Button className="w-full" variant="outline" size="sm">
            <Database className="w-4 h-4" />
            Trigger Manual Backup
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export Data</CardTitle>
          <CardDescription>Download your data in various formats</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {['CSV — Transactions', 'PDF — Monthly Summary', 'JSON — Full Export', 'Excel — Formatted Workbook'].map((fmt) => (
            <Button key={fmt} variant="outline" size="sm" className="w-full justify-between">
              <span className="text-sm">{fmt}</span>
              <Download className="w-4 h-4" />
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function SecurityTab() {
  const { status, enrollTouchId, refreshStatus, logout } = useAuthStore()
  const [enrolling, setEnrolling] = useState(false)
  const [enrollMsg, setEnrollMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [changingPw, setChangingPw] = useState(false)
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [showPw, setShowPw] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [pwLoading, setPwLoading] = useState(false)

  const handleReenroll = async () => {
    setEnrolling(true)
    setEnrollMsg(null)
    try {
      await enrollTouchId()
      await refreshStatus()
      setEnrollMsg({ type: 'success', text: 'Touch ID enrolled successfully.' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('cancelled') || msg.includes('abort') || msg.includes('NotAllowed')) {
        setEnrollMsg({ type: 'error', text: 'Enrollment cancelled.' })
      } else {
        setEnrollMsg({ type: 'error', text: msg || 'Enrollment failed.' })
      }
    } finally {
      setEnrolling(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwMsg(null)
    if (pwForm.next !== pwForm.confirm) { setPwMsg({ type: 'error', text: 'New passwords do not match.' }); return }
    if (pwForm.next.length < 6) { setPwMsg({ type: 'error', text: 'Password must be at least 6 characters.' }); return }
    setPwLoading(true)
    try {
      await api.post('/auth/change-password', {
        current_password: pwForm.current,
        new_password: pwForm.next,
        confirm_new_password: pwForm.confirm,
      })
      setPwMsg({ type: 'success', text: 'Password updated.' })
      setPwForm({ current: '', next: '', confirm: '' })
      setChangingPw(false)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setPwMsg({ type: 'error', text: err?.response?.data?.detail || 'Failed to update password.' })
    } finally {
      setPwLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Password
          </CardTitle>
          <CardDescription>Used as fallback when Touch ID is unavailable</CardDescription>
        </CardHeader>
        <CardContent>
          {!changingPw ? (
            <Button size="sm" variant="outline" onClick={() => { setChangingPw(true); setPwMsg(null) }}>
              Change Password
            </Button>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-3 max-w-sm">
              <div className="space-y-1">
                <Label className="text-xs">Current Password</Label>
                <div className="relative">
                  <Input type={showPw ? 'text' : 'password'} value={pwForm.current}
                    onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                    placeholder="Current password" className="pr-8" />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">New Password</Label>
                <Input type={showPw ? 'text' : 'password'} value={pwForm.next}
                  onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                  placeholder="At least 6 characters" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Confirm New Password</Label>
                <Input type={showPw ? 'text' : 'password'} value={pwForm.confirm}
                  onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                  placeholder="Repeat new password" />
              </div>
              {pwMsg && (
                <p className={`text-xs flex items-center gap-1 ${pwMsg.type === 'success' ? 'text-green-500' : 'text-destructive'}`}>
                  {pwMsg.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                  {pwMsg.text}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pwLoading}>
                  {pwLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setChangingPw(false); setPwMsg(null) }}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Touch ID */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Fingerprint className="w-4 h-4" /> Touch ID / Face ID
          </CardTitle>
          <CardDescription>Platform authenticator via WebAuthn (stored in your device's secure enclave)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            {status?.has_webauthn
              ? <Badge variant="outline" className="text-green-500 border-green-500/30 gap-1"><CheckCircle2 className="w-3 h-3" />Enrolled</Badge>
              : <Badge variant="outline" className="text-muted-foreground gap-1"><AlertCircle className="w-3 h-3" />Not enrolled</Badge>
            }
          </div>

          {/* Chrome iCloud Keychain note */}
          <div className="rounded-md bg-muted/50 border p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Where is my passkey stored?</p>
            <p>Chrome on macOS defaults to <strong>Google Password Manager</strong>. To save to <strong>iCloud Keychain</strong> instead:</p>
            <ol className="list-decimal list-inside space-y-0.5 ml-1">
              <li>Click "Re-enroll" below</li>
              <li>In Chrome's passkey dialog, click <strong>"Use a different device…"</strong> or <strong>"More options"</strong></li>
              <li>Choose <strong>"iPhone, iPad, or Android device"</strong> or <strong>"Security key"</strong> — or open Safari and enroll there to use iCloud Keychain natively</li>
            </ol>
            <p className="pt-1">Safari always saves passkeys to iCloud Keychain automatically.</p>
          </div>

          <Button size="sm" variant="outline" onClick={handleReenroll} disabled={enrolling}
            className="flex items-center gap-2">
            {enrolling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Fingerprint className="w-3.5 h-3.5" />}
            {status?.has_webauthn ? 'Re-enroll Touch ID' : 'Enroll Touch ID'}
          </Button>

          {enrollMsg && (
            <p className={`text-xs flex items-center gap-1 ${enrollMsg.type === 'success' ? 'text-green-500' : 'text-destructive'}`}>
              {enrollMsg.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {enrollMsg.text}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Session */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session</CardTitle>
          <CardDescription>JWT token expires after 24 hours</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" size="sm" onClick={logout}>Sign Out</Button>
        </CardContent>
      </Card>
    </div>
  )
}

const TAB_CONTENT: Record<SettingsTab, React.ComponentType> = {
  accounts: AccountsTab,
  categories: CategoriesTab,
  ai: AITab,
  ios: IOSTab,
  appearance: AppearanceTab,
  backup: BackupTab,
  security: SecurityTab,
}

export function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('accounts')
  const ActivePanel = TAB_CONTENT[activeTab]

  return (
    <MainLayout>
      <TopBar
        title="Settings"
        subtitle="Configure your finance dashboard"
        actions={
          <Button size="sm" variant="outline">
            <Settings2 className="w-4 h-4" />
            Reset to Defaults
          </Button>
        }
      />

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-52 flex-shrink-0">
          <nav className="space-y-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                  activeTab === id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
                {activeTab === id && <ChevronRight className="w-3 h-3 ml-auto" />}
              </button>
            ))}
          </nav>
        </div>

        {/* Content panel */}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
            >
              <ActivePanel />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </MainLayout>
  )
}
