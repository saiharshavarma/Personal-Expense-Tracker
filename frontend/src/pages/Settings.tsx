import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings2, CreditCard, Repeat, Tag, Brain, Smartphone, Palette,
  Database, Download, Shield, ChevronRight, Sun, Moon, Check
} from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useUIStore } from '@/store/ui'

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
  const [aiEnabled, setAiEnabled] = useState(false)
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic')

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
            <Switch id="ai-categorize" defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="ai-insights" className="text-sm font-medium">AI Insights (Ask AI page)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Enable the Ask AI page with Claude Sonnet</p>
            </div>
            <Switch id="ai-insights" checked={aiEnabled} onCheckedChange={setAiEnabled} />
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
            { id: 'anthropic' as const, name: 'Anthropic (Claude)', model: 'claude-haiku-4-5', recommended: true },
            { id: 'openai' as const, name: 'OpenAI', model: 'gpt-4o-mini', recommended: false },
          ].map(({ id, name, model, recommended }) => (
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
                <span className="text-xs text-muted-foreground">{model}</span>
              </div>
              {provider === id && <Check className="w-4 h-4 text-primary" />}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Keys</CardTitle>
          <CardDescription>Stored in your local .env file — never transmitted anywhere</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'].map((key) => (
            <div key={key} className="flex items-center justify-between py-2 border-b last:border-0">
              <div>
                <p className="text-sm font-medium font-mono">{key}</p>
                <p className="text-xs text-muted-foreground">Set in .env file</p>
              </div>
              <Badge variant="outline" className="text-xs">Configured via .env</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
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
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Authentication</CardTitle>
          <CardDescription>Manage your password and biometric unlock</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b">
            <div>
              <p className="text-sm font-medium">Password</p>
              <p className="text-xs text-muted-foreground">Used as fallback when TouchID is unavailable</p>
            </div>
            <Button size="sm" variant="ghost" className="text-xs">Change</Button>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">TouchID / Face ID</p>
              <p className="text-xs text-muted-foreground">Platform authenticator via WebAuthn</p>
            </div>
            <Button size="sm" variant="ghost" className="text-xs">Re-enroll</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session</CardTitle>
          <CardDescription>JWT token expires after 24 hours of inactivity</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" size="sm" className="w-full">Sign Out</Button>
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
