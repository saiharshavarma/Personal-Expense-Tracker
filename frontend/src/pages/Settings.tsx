import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings2, CreditCard, Repeat, Tag, Brain, Smartphone, Palette,
  Database, Download, Shield, ChevronRight, Sun, Moon, Check,
  Fingerprint, KeyRound, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff, Save,
  Copy, FileText, FileSpreadsheet, FileJson, HardDrive, Clock, RefreshCw,
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
import { useAuthStore, usePreferencesStore } from '@/store'
import { api } from '@/utils/apiClient'
import { AccountsModal } from '@/components/accounts/AccountsModal'

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
  const [accountsOpen, setAccountsOpen] = useState(false)
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Accounts</CardTitle>
          <CardDescription>Manage your credit cards, bank accounts, and payment methods</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Add accounts to track which card or bank each transaction belongs to.
          </p>
          <Button size="sm" onClick={() => setAccountsOpen(true)}>
            <CreditCard className="w-4 h-4" />
            Manage Accounts
          </Button>
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
          <p className="text-sm text-muted-foreground mt-1">
            Income is currently inferred from credit transactions. Define explicit schedules here for more accurate savings rate tracking.
          </p>
          <Button size="sm" variant="outline" className="mt-4" disabled>
            Coming soon
          </Button>
        </CardContent>
      </Card>
      <AccountsModal open={accountsOpen} onOpenChange={setAccountsOpen} />
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
  const { prefs, loading, saving, load, update } = usePreferencesStore()
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [showAnthropicKey, setShowAnthropicKey] = useState(false)
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)
  const [keyMsg, setKeyMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [keySaving, setKeySaving] = useState(false)

  useEffect(() => { load() }, [load])

  const provider = prefs?.ai_provider ?? 'anthropic'
  const modelCat = prefs?.ai_model_categorization ?? 'claude-haiku-4-5'
  const modelInsights = prefs?.ai_model_insights ?? 'claude-sonnet-4-5'
  const aiInsights = prefs?.ai_insights_opt_in ?? false

  const ANTHROPIC_MODELS = ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-5']
  const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo']

  const handleSaveKeys = async () => {
    setKeySaving(true)
    setKeyMsg(null)
    try {
      const patch: Record<string, string> = {}
      if (anthropicKey.trim()) patch.anthropic_api_key = anthropicKey.trim()
      if (openaiKey.trim()) patch.openai_api_key = openaiKey.trim()
      await api.put('/preferences', patch)
      setAnthropicKey('')
      setOpenaiKey('')
      setKeyMsg({ type: 'success', text: 'API keys saved.' })
      load() // refresh to get updated key-set flags
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setKeyMsg({ type: 'error', text: err?.response?.data?.detail || 'Failed to save keys.' })
    } finally {
      setKeySaving(false)
    }
  }

  if (loading && !prefs) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {saving && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Saving…
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Features</CardTitle>
          <CardDescription>Changes apply instantly across all pages</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="ai-insights" className="text-sm font-medium">AI Insights (Ask AI page)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Enable the Ask AI page with Claude Sonnet</p>
            </div>
            {/* Auto-saves immediately — no Save button needed */}
            <Switch id="ai-insights" checked={aiInsights} onCheckedChange={(v) => update({ ai_insights_opt_in: v })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Provider</CardTitle>
          <CardDescription>Choose which AI provider to use for categorization and insights</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { id: 'anthropic' as const, name: 'Anthropic (Claude)', recommended: true },
            { id: 'openai' as const, name: 'OpenAI', recommended: false },
          ].map(({ id, name, recommended }) => (
            <button
              key={id}
              onClick={() => update({ ai_provider: id })}
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
              onChange={e => update({ ai_model_categorization: e.target.value })}
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
              onChange={e => update({ ai_model_insights: e.target.value })}
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
          <CardDescription>Keys are stored server-side — enter here to update them</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-mono flex items-center gap-2">
              ANTHROPIC_API_KEY
              {prefs?.anthropic_api_key_set && (
                <span className="text-green-500 font-sans font-normal flex items-center gap-0.5">
                  <CheckCircle2 className="w-3 h-3" /> Set
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                type={showAnthropicKey ? 'text' : 'password'}
                placeholder={prefs?.anthropic_api_key_set ? 'Leave blank to keep current key' : 'sk-ant-…'}
                value={anthropicKey}
                onChange={e => setAnthropicKey(e.target.value)}
                className="pr-8 font-mono text-xs"
              />
              <button type="button" onClick={() => setShowAnthropicKey(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showAnthropicKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-mono flex items-center gap-2">
              OPENAI_API_KEY
              {prefs?.openai_api_key_set && (
                <span className="text-green-500 font-sans font-normal flex items-center gap-0.5">
                  <CheckCircle2 className="w-3 h-3" /> Set
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                type={showOpenaiKey ? 'text' : 'password'}
                placeholder={prefs?.openai_api_key_set ? 'Leave blank to keep current key' : 'sk-…'}
                value={openaiKey}
                onChange={e => setOpenaiKey(e.target.value)}
                className="pr-8 font-mono text-xs"
              />
              <button type="button" onClick={() => setShowOpenaiKey(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showOpenaiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Keys require explicit save (they're sensitive — no auto-save) */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSaveKeys}
          disabled={keySaving || (!anthropicKey.trim() && !openaiKey.trim())}
          size="sm"
        >
          {keySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save API Keys
        </Button>
        {keyMsg && (
          <p className={`text-xs flex items-center gap-1 ${keyMsg.type === 'success' ? 'text-green-500' : 'text-destructive'}`}>
            {keyMsg.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            {keyMsg.text}
          </p>
        )}
      </div>
    </div>
  )
}

function IOSTab() {
  const [copied, setCopied] = useState(false)

  // Derive the backend URL from the current page's hostname (same Mac, port 8000)
  const backendHost = typeof window !== 'undefined'
    ? `${window.location.hostname}:8000`
    : 'YOUR_MAC_IP:8000'
  const endpointUrl = `http://${backendHost}/api/ios/transaction`

  const exampleBody = JSON.stringify({
    merchant: "Starbucks",
    amount: 6.75,
    date: new Date().toISOString().split('T')[0],
    payment_method: "Apple Pay",
  }, null, 2)

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="w-4 h-4" /> iOS Shortcut Integration
          </CardTitle>
          <CardDescription>Log transactions instantly from your iPhone without opening the app</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Endpoint */}
          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">POST Endpoint</p>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono flex-1 break-all text-foreground">{endpointUrl}</code>
              <button
                onClick={() => handleCopy(endpointUrl)}
                className="flex-shrink-0 p-1.5 rounded hover:bg-background transition-colors"
                title="Copy URL"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
            </div>
          </div>

          {/* Fields */}
          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">JSON Body</p>
            <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">{exampleBody}</pre>
          </div>

          {/* Notes */}
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
              No authentication required — the endpoint is local-network only
            </p>
            <p className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
              Duplicate detection: same merchant + amount + date is silently skipped
            </p>
            <p className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              Arrives as <Badge variant="outline" className="text-xs">needs_review</Badge> — categorize it in Transactions
            </p>
          </div>

          {/* Shortcut setup guide */}
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-xs font-semibold">Quick setup in iOS Shortcuts:</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Open the Shortcuts app → New Shortcut</li>
              <li>Add action: <strong>Get Contents of URL</strong></li>
              <li>Set Method to <strong>POST</strong>, URL to the endpoint above</li>
              <li>Headers: <code>Content-Type: application/json</code></li>
              <li>Body: JSON with merchant, amount, and date fields</li>
              <li>Add to Home Screen or set as Apple Pay trigger</li>
            </ol>
          </div>
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

interface BackupEntry {
  id: string
  backup_path: string
  size_bytes: number | null
  triggered_by: string | null
  status: string
  created_at: string
}

function BackupTab() {
  const [backingUp, setBackingUp] = useState(false)
  const [backupMsg, setBackupMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [history, setHistory] = useState<BackupEntry[]>([])
  const [histLoading, setHistLoading] = useState(true)
  const [exporting, setExporting] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    setHistLoading(true)
    try {
      const res = await api.get('/backup/history')
      setHistory(res.data)
    } catch { /* ignore */ } finally {
      setHistLoading(false)
    }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  const handleBackup = async () => {
    setBackingUp(true)
    setBackupMsg(null)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`${api.defaults.baseURL}/backup/trigger`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const cd = res.headers.get('content-disposition') || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      const fname = match ? match[1] : 'finance_backup.json.gz'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = fname; a.click()
      URL.revokeObjectURL(url)
      setBackupMsg({ type: 'success', text: `Backup downloaded: ${fname}` })
      loadHistory()
    } catch (e: unknown) {
      setBackupMsg({ type: 'error', text: (e as Error).message || 'Backup failed' })
    } finally {
      setBackingUp(false)
    }
  }

  const handleExport = async (format: 'csv' | 'json' | 'excel') => {
    setExporting(format)
    const paths: Record<string, [string, string]> = {
      csv:   ['/export/csv',   'text/csv'],
      json:  ['/export/json',  'application/json'],
      excel: ['/export/excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    }
    const [path, mime] = paths[format]
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`${api.defaults.baseURL}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`Export failed: ${res.status}`)
      const blob = await res.blob()
      const cd = res.headers.get('content-disposition') || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      const fname = match ? match[1] : `export.${format}`
      const url = URL.createObjectURL(new Blob([blob], { type: mime }))
      const a = document.createElement('a')
      a.href = url; a.download = fname; a.click()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      console.error('Export error:', e)
    } finally {
      setExporting(null)
    }
  }

  const fmtBytes = (b: number | null) => {
    if (!b) return '—'
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / (1024 * 1024)).toFixed(1)} MB`
  }
  const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })

  return (
    <div className="space-y-4">
      {/* Manual Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HardDrive className="w-4 h-4" /> Backup
          </CardTitle>
          <CardDescription>
            Creates a compressed JSON snapshot of all your financial data and downloads it to your browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleBackup} disabled={backingUp} className="w-full" variant="outline">
            {backingUp
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating backup…</>
              : <><Database className="w-4 h-4" /> Download Backup Now</>}
          </Button>
          {backupMsg && (
            <p className={`text-xs flex items-center gap-1 ${backupMsg.type === 'success' ? 'text-green-600' : 'text-destructive'}`}>
              {backupMsg.type === 'success'
                ? <CheckCircle2 className="w-3.5 h-3.5" />
                : <AlertCircle className="w-3.5 h-3.5" />}
              {backupMsg.text}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Export Data */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="w-4 h-4" /> Export Data
          </CardTitle>
          <CardDescription>Download all transactions in your preferred format</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {([
            { format: 'csv'   as const, label: 'CSV — Transactions spreadsheet',    icon: FileText,        color: 'text-green-600' },
            { format: 'excel' as const, label: 'Excel — Multi-sheet workbook',       icon: FileSpreadsheet, color: 'text-emerald-600' },
            { format: 'json'  as const, label: 'JSON — Full data export',            icon: FileJson,        color: 'text-blue-600' },
          ]).map(({ format, label, icon: Icon, color }) => (
            <Button
              key={format}
              variant="outline"
              size="sm"
              className="w-full justify-between"
              disabled={exporting === format}
              onClick={() => handleExport(format)}
            >
              <span className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-sm">{label}</span>
              </span>
              {exporting === format
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Download className="w-4 h-4 text-muted-foreground" />}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Backup History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" /> Backup History
              </CardTitle>
              <CardDescription>Last 30 backup events</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={loadHistory} disabled={histLoading}>
              <RefreshCw className={`w-3.5 h-3.5 ${histLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {histLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-6">
              <Database className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No backups yet — create your first one above</p>
            </div>
          ) : (
            <div className="divide-y text-xs">
              {history.map((b) => (
                <div key={b.id} className="flex items-center justify-between py-2 gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {b.status === 'success'
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      : <AlertCircle  className="w-3.5 h-3.5 text-destructive flex-shrink-0" />}
                    <span className="text-muted-foreground">{fmtDate(b.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground flex-shrink-0">
                    <span>{fmtBytes(b.size_bytes)}</span>
                    <Badge variant="outline" className="text-xs capitalize">{b.triggered_by ?? 'auto'}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
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
