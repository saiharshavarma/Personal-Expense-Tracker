import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, Reorder } from 'framer-motion'
import {
  Settings2, CreditCard, Repeat, Tag, Brain, Smartphone, Palette,
  Database, Download, Shield, ChevronRight, Sun, Moon, Check, X,
  Fingerprint, KeyRound, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff, Save,
  Copy, FileText, FileSpreadsheet, FileJson, HardDrive, Clock, RefreshCw, Trash2, Plus,
  Mail, Bell, LayoutGrid,
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
import { api, getAuthErrorMessage } from '@/utils/apiClient'
import { AccountsModal } from '@/components/accounts/AccountsModal'
import { CATEGORY_MAP, ALL_CATEGORIES } from '@/lib/categories'

type SettingsTab = 'accounts' | 'categories' | 'budgets' | 'ai' | 'ios' | 'appearance' | 'notifications' | 'backup' | 'security' | 'health'

const TABS: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'accounts', label: 'Accounts & Income', icon: CreditCard },
  { id: 'categories', label: 'Categories & Rules', icon: Tag },
  { id: 'budgets', label: 'Budget Defaults', icon: LayoutGrid },
  { id: 'ai', label: 'AI Configuration', icon: Brain },
  { id: 'ios', label: 'iOS Shortcut', icon: Smartphone },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Email Reports', icon: Mail },
  { id: 'backup', label: 'Backup & Export', icon: Database },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'health', label: 'System Health', icon: Settings2 },
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

interface MerchantRule {
  id: string
  pattern: string
  match_type: string | null
  merchant_clean: string | null
  category: string | null
  subcategory: string | null
  need_want_savings: string | null
  is_reimbursable: boolean | null
  is_recurring: boolean | null
  personal_work_shared: string | null
  confidence: number | null
  times_applied: number
  times_overridden: number
  created_at: string | null
}

// Use the canonical taxonomy from lib/categories — do not maintain a separate list here.
const ALL_CATEGORIES_SETTINGS = ALL_CATEGORIES

function BudgetRuleEditor() {
  const [nws, setNws] = useState({ needs: 50, wants: 30, savings: 20 })
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.get('/preferences').then(r => {
      const rule = r.data.default_budget_rule ?? {}
      setNws({ needs: rule.needs ?? 50, wants: rule.wants ?? 30, savings: rule.savings ?? 20 })
    }).catch(() => {})
  }, [])

  const total = nws.needs + nws.wants + nws.savings

  const handleSave = async () => {
    if (Math.abs(total - 100) > 0.1) { setErr('Must add up to 100%'); return }
    setSaving(true); setErr('')
    try {
      await api.put('/budgets/preferences', nws)
      setMsg('Saved!'); setEditing(false)
      setTimeout(() => setMsg(''), 2500)
    } catch { setErr('Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Budget Rule ({nws.needs}/{nws.wants}/{nws.savings})</CardTitle>
            <CardDescription>Customize your Needs / Wants / Savings target percentages</CardDescription>
          </div>
          {!editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Configure
            </Button>
          )}
        </div>
      </CardHeader>
      {editing && (
        <CardContent className="space-y-3">
          {[
            { key: 'needs' as const, label: 'Needs (%)' },
            { key: 'wants' as const, label: 'Wants (%)' },
            { key: 'savings' as const, label: 'Savings (%)' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3">
              <Label className="w-24 text-sm shrink-0">{label}</Label>
              <Input
                type="number" min="0" max="100" step="5"
                value={nws[key]}
                onChange={e => setNws(n => ({ ...n, [key]: parseFloat(e.target.value) || 0 }))}
                className="w-24 h-8 text-sm"
              />
              <span className={`text-xs font-medium ${Math.abs(total - 100) < 0.1 ? 'text-green-500' : 'text-destructive'}`}>
                Total: {total}%
              </span>
            </div>
          ))}
          {err && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{err}</p>}
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setErr('') }}>Cancel</Button>
          </div>
          {msg && <p className="text-xs text-green-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{msg}</p>}
        </CardContent>
      )}
    </Card>
  )
}

function CategoriesTab() {
  const [rules, setRules] = useState<MerchantRule[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ pattern: '', match_type: 'contains', category: '', subcategory: '' })
  const [addMsg, setAddMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [listMsg, setListMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/rules')
      setRules(res.data)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    setDeleting(id)
    setDeleteError(null)
    try {
      await api.delete(`/rules/${id}`)
      setRules(r => r.filter(x => x.id !== id))
    } catch {
      setDeleteError('Failed to delete rule. Please try again.')
    } finally {
      setDeleting(null)
    }
  }

  const handleAdd = async () => {
    if (!form.pattern.trim()) {
      setAddMsg({ type: 'error', text: 'Pattern is required.' })
      return
    }
    setSaving(true)
    setAddMsg(null)
    try {
      const res = await api.post('/rules', {
        pattern: form.pattern.trim(),
        match_type: form.match_type || 'contains',
        category: form.category || null,
        subcategory: form.subcategory || null,
      })
      setRules(r => [res.data, ...r])
      setForm({ pattern: '', match_type: 'contains', category: '', subcategory: '' })
      setAddMsg(null)
      setShowAdd(false)
      // Show confirmation outside the form (which we just hid)
      setListMsg({ type: 'success', text: `Rule "${res.data.pattern}" added.` })
      setTimeout(() => setListMsg(null), 4000)
    } catch {
      setAddMsg({ type: 'error', text: 'Failed to add rule.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Merchant Rules</CardTitle>
              <CardDescription>Auto-categorization rules based on merchant name matching</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button size="sm" onClick={() => { setShowAdd(v => !v); setAddMsg(null) }}>
                <Plus className="w-3.5 h-3.5" /> Add Rule
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Add rule form */}
          {showAdd && (
            <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
              <p className="text-xs font-semibold">New rule</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Pattern *</Label>
                  <Input
                    placeholder="e.g. starbucks"
                    value={form.pattern}
                    onChange={e => setForm(f => ({ ...f, pattern: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Match type</Label>
                  <select
                    value={form.match_type}
                    onChange={e => setForm(f => ({ ...f, match_type: e.target.value }))}
                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="contains">contains</option>
                    <option value="exact">exact</option>
                    <option value="startswith">starts with</option>
                    <option value="regex">regex</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">— none —</option>
                    {ALL_CATEGORIES_SETTINGS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Subcategory</Label>
                  <Input
                    placeholder="optional"
                    value={form.subcategory}
                    onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              {addMsg && (
                <p className={`text-xs flex items-center gap-1 ${addMsg.type === 'success' ? 'text-green-500' : 'text-destructive'}`}>
                  {addMsg.type === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  {addMsg.text}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAdd} disabled={saving}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save Rule
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setAddMsg(null) }}>Cancel</Button>
              </div>
            </div>
          )}

          {/* List-level feedback messages */}
          {listMsg && (
            <p className={`text-xs flex items-center gap-1 ${listMsg.type === 'success' ? 'text-green-500' : 'text-destructive'}`}>
              {listMsg.type === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              {listMsg.text}
            </p>
          )}
          {deleteError && (
            <p className="text-xs flex items-center gap-1 text-destructive">
              <AlertCircle className="w-3 h-3" /> {deleteError}
            </p>
          )}

          {/* Rules list */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : rules.length === 0 ? (
            <div className="py-8 text-center">
              <Tag className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium text-sm">No merchant rules yet</p>
              <p className="text-xs text-muted-foreground mt-1">Rules are created automatically as you correct AI categorizations, or add them manually above</p>
            </div>
          ) : (
            <div className="divide-y text-xs">
              {/* Header */}
              <div className="grid grid-cols-[1fr_auto_1fr_60px_80px] gap-3 py-1.5 font-medium text-muted-foreground uppercase tracking-wide">
                <span>Pattern</span>
                <span>Match</span>
                <span>Category</span>
                <span className="text-center">Applied</span>
                <span />
              </div>
              {rules.map(rule => (
                <div key={rule.id} className="grid grid-cols-[1fr_auto_1fr_60px_80px] gap-3 py-2 items-center">
                  <span className="font-mono text-foreground truncate" title={rule.pattern}>{rule.pattern}</span>
                  <span className="text-muted-foreground">{rule.match_type ?? 'contains'}</span>
                  <span className={rule.category ? 'text-foreground' : 'text-muted-foreground/50'}>
                    {rule.category ?? '—'}
                    {rule.subcategory && <span className="text-muted-foreground"> · {rule.subcategory}</span>}
                  </span>
                  <span className="text-center text-muted-foreground">{rule.times_applied}</span>
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(rule.id)}
                      disabled={deleting === rule.id}
                    >
                      {deleting === rule.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Trash2 className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <BudgetRuleEditor />
      <AllCategoriesCard />
    </div>
  )
}

// ── Full Category Taxonomy Editor ─────────────────────────────────────────────
// Shows ALL categories (built-in + custom), drag-to-reorder subcategories,
// add/remove subcategories on any category, add new top-level categories.

function AllCategoriesCard() {
  // `overrides` mirrors dashboard_layout.custom_categories
  // It only stores entries that differ from CATEGORY_MAP (or are entirely new).
  const [overrides, setOverrides] = useState<Record<string, string[]>>({})
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  const [newSub, setNewSub] = useState<Record<string, string>>({})
  const [newCatName, setNewCatName] = useState('')
  const [saving, setSaving] = useState(false)
  const [layoutCache, setLayoutCache] = useState<Record<string, unknown>>({})

  useEffect(() => {
    api.get('/preferences').then(r => {
      const layout = r.data.dashboard_layout ?? {}
      setLayoutCache(layout)
      setOverrides(layout.custom_categories ?? {})
    }).catch(() => {})
  }, [])

  const persist = async (next: Record<string, string[]>) => {
    setSaving(true)
    try {
      await api.put('/preferences', {
        dashboard_layout: { ...layoutCache, custom_categories: next }
      })
      setLayoutCache(l => ({ ...l, custom_categories: next }))
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  // Effective subcategories for a category: override beats built-in
  const effectiveSubs = (cat: string): string[] =>
    overrides[cat] !== undefined ? overrides[cat] : (CATEGORY_MAP[cat] ?? [])

  // All categories to display: built-in order first, then any purely-custom ones
  const builtInCats = Object.keys(CATEGORY_MAP)
  const customOnlyCats = Object.keys(overrides).filter(c => !(c in CATEGORY_MAP))
  const allCats = [...builtInCats, ...customOnlyCats]

  const isModified = (cat: string) => cat in overrides
  const isCustomOnly = (cat: string) => !(cat in CATEGORY_MAP)

  const updateSubs = (cat: string, subs: string[]) => {
    const next = { ...overrides, [cat]: subs }
    setOverrides(next); persist(next)
  }

  const resetToDefault = (cat: string) => {
    const next = { ...overrides }; delete next[cat]
    setOverrides(next); persist(next)
  }

  const deleteCategory = (cat: string) => {
    const next = { ...overrides }; delete next[cat]
    setOverrides(next); persist(next)
  }

  const addSub = (cat: string) => {
    const sub = (newSub[cat] ?? '').trim()
    if (!sub) return
    const current = effectiveSubs(cat)
    if (current.includes(sub)) return
    updateSubs(cat, [...current, sub])
    setNewSub(s => ({ ...s, [cat]: '' }))
  }

  const removeSub = (cat: string, sub: string) => {
    updateSubs(cat, effectiveSubs(cat).filter(s => s !== sub))
  }

  const addCategory = () => {
    const name = newCatName.trim()
    if (!name || allCats.includes(name)) return
    const next = { ...overrides, [name]: [] }
    setOverrides(next); persist(next); setNewCatName('')
    setExpandedCat(name)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Categories & Subcategories</CardTitle>
            <CardDescription>
              Edit any category's subcategories. Drag chips to reorder. Built-in categories can be customised or reset.
            </CardDescription>
          </div>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Add new top-level category */}
        <div className="flex gap-2">
          <Input
            placeholder="Add a new category…"
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCategory()}
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={addCategory} disabled={!newCatName.trim()}>
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>

        {allCats.map(cat => {
          const subs = effectiveSubs(cat)
          const open = expandedCat === cat
          return (
            <div key={cat} className="rounded-lg border overflow-hidden">
              {/* Header row */}
              <div
                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-accent/40 transition-colors"
                onClick={() => setExpandedCat(open ? null : cat)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Tag className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{cat}</span>
                  {isCustomOnly(cat) && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 text-blue-600 border-blue-300">custom</Badge>
                  )}
                  {isModified(cat) && !isCustomOnly(cat) && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-600 border-amber-300">modified</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{subs.length} subcategories</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {isModified(cat) && !isCustomOnly(cat) && (
                    <Button
                      size="sm" variant="ghost"
                      className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={e => { e.stopPropagation(); resetToDefault(cat) }}
                      title="Reset to built-in defaults"
                    >
                      Reset
                    </Button>
                  )}
                  {isCustomOnly(cat) && (
                    <Button
                      size="sm" variant="ghost"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={e => { e.stopPropagation(); deleteCategory(cat) }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                  <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
                </div>
              </div>

              {/* Expanded: drag-to-reorder subcategories */}
              {open && (
                <div className="px-3 pb-3 pt-2 border-t bg-muted/20 space-y-2">
                  <p className="text-[10px] text-muted-foreground">Drag chips to reorder · click × to remove</p>
                  <Reorder.Group
                    axis="x"
                    values={subs}
                    onReorder={(newOrder) => updateSubs(cat, newOrder)}
                    className="flex flex-wrap gap-1.5 min-h-7"
                  >
                    {subs.map(sub => (
                      <Reorder.Item
                        key={sub}
                        value={sub}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-background border text-xs cursor-grab active:cursor-grabbing select-none shadow-sm"
                        whileDrag={{ scale: 1.08, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 10 }}
                      >
                        <span>{sub}</span>
                        <button
                          onPointerDown={e => e.stopPropagation()}
                          onClick={() => removeSub(cat, sub)}
                          className="hover:text-destructive transition-colors"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </Reorder.Item>
                    ))}
                    {subs.length === 0 && (
                      <span className="text-xs text-muted-foreground italic">No subcategories yet — add one below</span>
                    )}
                  </Reorder.Group>

                  {/* Add subcategory */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="New subcategory…"
                      value={newSub[cat] ?? ''}
                      onChange={e => setNewSub(s => ({ ...s, [cat]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addSub(cat)}
                      className="h-7 text-xs"
                    />
                    <Button size="sm" className="h-7 text-xs" onClick={() => addSub(cat)}>
                      <Plus className="w-3 h-3" /> Add
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
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

const CURRENCIES = [
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'CAD', label: 'Canadian Dollar (C$)' },
  { code: 'AUD', label: 'Australian Dollar (A$)' },
  { code: 'JPY', label: 'Japanese Yen (¥)' },
  { code: 'INR', label: 'Indian Rupee (₹)' },
  { code: 'CNY', label: 'Chinese Yuan (¥)' },
  { code: 'CHF', label: 'Swiss Franc (CHF)' },
  { code: 'MXN', label: 'Mexican Peso (MX$)' },
  { code: 'BRL', label: 'Brazilian Real (R$)' },
  { code: 'SGD', label: 'Singapore Dollar (S$)' },
  { code: 'NZD', label: 'New Zealand Dollar (NZ$)' },
  { code: 'SEK', label: 'Swedish Krona (kr)' },
  { code: 'NOK', label: 'Norwegian Krone (kr)' },
]

function AppearanceTab() {
  const { theme, toggleTheme } = useUIStore()
  const { prefs, update } = usePreferencesStore()

  // Mochi mascot toggle — stored in localStorage for instant UX
  const [mochiEnabled, setMochiEnabled] = useState(
    () => localStorage.getItem('mochi_enabled') !== 'false'
  )
  const toggleMochi = (v: boolean) => {
    localStorage.setItem('mochi_enabled', v ? 'true' : 'false')
    setMochiEnabled(v)
    window.dispatchEvent(new CustomEvent('mochi_enabled_changed', { detail: v }))
  }

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Currency</CardTitle>
          <CardDescription>All amounts displayed using this currency symbol</CardDescription>
        </CardHeader>
        <CardContent>
          <select
            value={prefs?.currency ?? 'USD'}
            onChange={e => update({ currency: e.target.value })}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {CURRENCIES.map(c => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-2">
            Preview: {new Intl.NumberFormat('en-US', { style: 'currency', currency: prefs?.currency ?? 'USD' }).format(1234.56)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mochi — Finance Mascot</CardTitle>
          <CardDescription>
            Your red panda companion who sneaks around, inspects your stats, and gives AI-powered commentary
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Show Mochi</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Click Mochi to start walking · Press and move to drag
              </p>
            </div>
            <Switch
              id="mochi-toggle"
              checked={mochiEnabled}
              onCheckedChange={toggleMochi}
            />
          </div>
          {mochiEnabled && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <p>🚶 <strong>Click</strong> Mochi to walk toward stats</p>
              <p>🖱️ <strong>Press and move</strong> to reposition — throw her for an annoyed reaction</p>
              <p>🤖 <strong>AI comments</strong> are powered by your configured AI provider</p>
            </div>
          )}
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

// ── System Health Tab ──────────────────────────────────────────────────────────

interface UpdateStatus {
  branch: string
  remote: string
  remote_branch: string
  local_sha: string
  remote_sha: string | null
  dirty: boolean
  dirty_count: number
  ahead: number
  behind: number
  diverged: boolean
  remote_reachable: boolean
  update_available: boolean
  blocked_reason: string | null
  checked_at: string
}

interface UpdateJob {
  running: boolean
  status: 'idle' | 'queued' | 'running' | 'complete' | 'failed'
  started_at: string | null
  finished_at: string | null
  error: string | null
  log: string[]
}

function shortSha(sha?: string | null) {
  return sha ? sha.slice(0, 7) : 'unknown'
}

function ApplicationUpdateCard() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [job, setJob] = useState<UpdateJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setChecking(true)
    setError(null)
    try {
      const [statusRes, jobRes] = await Promise.all([
        api.get('/system/update/status'),
        api.get('/system/update/job').catch(() => ({ data: null })),
      ])
      setStatus(statusRes.data)
      setJob(jobRes.data)
    } catch (e) {
      setError(getAuthErrorMessage(e))
    } finally {
      setChecking(false)
      setLoading(false)
    }
  }, [])

  const loadJob = useCallback(async () => {
    try {
      const res = await api.get('/system/update/job')
      setJob(res.data)
      if (res.data.status === 'complete') {
        loadStatus()
      }
    } catch (e) {
      setError(getAuthErrorMessage(e))
    }
  }, [loadStatus])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  useEffect(() => {
    if (!job?.running) return
    const timer = window.setInterval(loadJob, 2500)
    return () => window.clearInterval(timer)
  }, [job?.running, loadJob])

  const startUpdate = async () => {
    setStarting(true)
    setError(null)
    try {
      const res = await api.post('/system/update')
      setJob(res.data)
    } catch (e) {
      setError(getAuthErrorMessage(e))
    } finally {
      setStarting(false)
    }
  }

  const isRunning = !!job?.running
  const isFailed = job?.status === 'failed'
  const isComplete = job?.status === 'complete'
  const canUpdate = !!status?.update_available && !isRunning

  const state = isRunning
    ? { label: 'Updating', icon: Loader2, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' }
    : isFailed
      ? { label: 'Update failed', icon: AlertCircle, className: 'bg-destructive/10 text-destructive' }
      : error
        ? { label: 'Unavailable', icon: AlertCircle, className: 'bg-destructive/10 text-destructive' }
        : status?.blocked_reason
          ? { label: 'Needs attention', icon: AlertCircle, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' }
          : status?.update_available
            ? { label: 'Update available', icon: Download, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' }
            : isComplete
              ? { label: 'Update complete', icon: CheckCircle2, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
              : { label: 'Up to date', icon: CheckCircle2, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }

  const StateIcon = state.icon
  const detail = error
    || job?.error
    || status?.blocked_reason
    || (status?.update_available
      ? `${status.behind} update${status.behind === 1 ? '' : 's'} available from origin/main.`
      : status
        ? `Running ${shortSha(status.local_sha)} from ${status.branch || 'current branch'}.`
        : 'Checking GitHub for application updates.')

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Application Update</CardTitle>
            <CardDescription>Update this local installation from GitHub main</CardDescription>
          </div>
          <Badge variant="secondary" className={state.className}>
            <StateIcon className={`w-3.5 h-3.5 mr-1 ${isRunning ? 'animate-spin' : ''}`} />
            {state.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking update status...
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{detail}</p>
            {status && (
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div>Local: {shortSha(status.local_sha)}</div>
                <div>GitHub main: {shortSha(status.remote_sha)}</div>
                <div>Behind: {status.behind}</div>
                <div>Local changes: {status.dirty ? `${status.dirty_count} file${status.dirty_count === 1 ? '' : 's'}` : 'None'}</div>
              </div>
            )}
            {job?.log?.length ? (
              <div className="max-h-32 overflow-auto rounded border bg-muted/30 p-2 text-xs text-muted-foreground">
                {job.log.slice(-6).map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={startUpdate} disabled={!canUpdate || starting}>
                {starting || isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Update Application
              </Button>
              <Button size="sm" variant="outline" onClick={loadStatus} disabled={checking || isRunning}>
                {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Check Again
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function HealthTab() {
  const [health, setHealth] = useState<{ status: string; version: string } | null>(null)
  const [prefs, setPrefs] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      // /health is not under /api, so we use a direct fetch through the proxy alias /api/health
      api.get('/health').then(r => setHealth(r.data)).catch(() => {}),
      api.get('/preferences').then(r => setPrefs(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const checks = [
    {
      label: 'API Server',
      ok: health?.status === 'ok',
      detail: health ? `v${health.version} — online` : 'Unreachable',
      category: 'Infrastructure',
    },
    {
      label: 'Authentication',
      ok: true,
      detail: prefs.webauthn_enrolled ? 'Biometric (Touch ID / WebAuthn) enrolled' : 'Password-based login active',
      warn: !prefs.webauthn_enrolled,
      category: 'Security',
    },
    {
      label: 'AI API Key',
      ok: !!(prefs.anthropic_api_key_set || prefs.openai_api_key_set),
      detail: prefs.anthropic_api_key_set
        ? `Anthropic configured (…${prefs.anthropic_api_key_preview})`
        : prefs.openai_api_key_set
          ? `OpenAI configured (…${prefs.openai_api_key_preview})`
          : 'No key — AI categorization disabled (add one in AI tab)',
      warn: !(prefs.anthropic_api_key_set || prefs.openai_api_key_set),
      category: 'AI',
    },
    {
      label: 'Auto-Backup',
      ok: true,
      detail: prefs.backup_to_icloud
        ? `Enabled → ${prefs.backup_path ?? '~/Finance/Backups'}`
        : 'Disabled — enable in Backup tab for peace of mind',
      warn: !prefs.backup_to_icloud,
      category: 'Data Safety',
    },
    {
      label: 'Local Storage',
      ok: true,
      detail: 'All financial data stored locally — never uploaded to external servers',
      category: 'Privacy',
    },
    {
      label: 'Encryption at Rest',
      ok: true,
      detail: 'PostgreSQL volume on your local machine, no cloud sync',
      category: 'Data Safety',
    },
    {
      label: 'AI Insights',
      ok: true,
      detail: prefs.ai_insights_opt_in
        ? 'Opted in — aggregated category totals sent to AI for insights'
        : 'Privacy mode — no spending data sent to AI (opt in via AI tab)',
      warn: false,
      category: 'Privacy',
    },
  ]

  const grouped = checks.reduce<Record<string, typeof checks>>((acc, c) => {
    ;(acc[c.category] = acc[c.category] ?? []).push(c)
    return acc
  }, {})

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  )

  return (
    <div className="space-y-4">
      <ApplicationUpdateCard />
      {Object.entries(grouped).map(([group, items]) => (
        <Card key={group}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{group}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.map((c) => (
              <div key={c.label} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-3">
                  {c.ok && !c.warn ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : c.warn ? (
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.detail}</p>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={c.ok && !c.warn
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : c.warn
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-destructive/10 text-destructive'}
                >
                  {c.ok && !c.warn ? 'OK' : c.warn ? 'Warning' : 'Error'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ── Email Reports / Notifications Tab ────────────────────────────────────────

const DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1)

interface EmailCfg {
  enabled: boolean
  report_email: string
  report_day: number
  reminder_enabled: boolean
  reminder_day: number
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_password: string
  use_tls: boolean
}

const DEFAULT_EMAIL_CFG: EmailCfg = {
  enabled: false,
  report_email: '',
  report_day: 1,
  reminder_enabled: false,
  reminder_day: 28,
  smtp_host: 'smtp.gmail.com',
  smtp_port: 587,
  smtp_user: '',
  smtp_password: '',
  use_tls: true,
}

function NotificationsTab() {
  const [cfg, setCfg] = useState<EmailCfg>(DEFAULT_EMAIL_CFG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [showPw, setShowPw] = useState(false)

  useEffect(() => {
    api.get('/email-reports/settings')
      .then(r => setCfg({ ...DEFAULT_EMAIL_CFG, ...r.data, smtp_password: '' }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const set = (patch: Partial<EmailCfg>) => setCfg(c => ({ ...c, ...patch }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/email-reports/settings', cfg)
      setTestResult({ ok: true, msg: 'Settings saved.' })
    } catch { setTestResult({ ok: false, msg: 'Save failed.' }) }
    finally { setSaving(false); setTimeout(() => setTestResult(null), 4000) }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await api.post<{ to: string }>('/email-reports/test')
      setTestResult({ ok: true, msg: `Test email sent to ${r.data.to}` })
    } catch (e: unknown) {
      const ex = e as { response?: { data?: { detail?: string } } }
      setTestResult({ ok: false, msg: ex?.response?.data?.detail ?? 'Test failed — check SMTP settings' })
    } finally { setTesting(false) }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-4">
      {/* Monthly Report */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="w-4 h-4" /> Monthly Finance Report
              </CardTitle>
              <CardDescription>Receive a spending summary email at the start of each month</CardDescription>
            </div>
            <Switch checked={cfg.enabled} onCheckedChange={v => set({ enabled: v })} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Recipient email</Label>
              <Input value={cfg.report_email} onChange={e => set({ report_email: e.target.value })} placeholder="you@example.com" type="email" />
            </div>
            <div className="space-y-1.5">
              <Label>Send on day</Label>
              <select
                value={cfg.report_day}
                onChange={e => set({ report_day: Number(e.target.value) })}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
              >
                {DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">Day of month (1–28)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload Reminder */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="w-4 h-4" /> Expense Upload Reminder
              </CardTitle>
              <CardDescription>Get nudged to upload last month's bank statements</CardDescription>
            </div>
            <Switch checked={cfg.reminder_enabled} onCheckedChange={v => set({ reminder_enabled: v })} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Remind on day</Label>
              <select
                value={cfg.reminder_day}
                onChange={e => set({ reminder_day: Number(e.target.value) })}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
              >
                {DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">Day of month (1–28)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SMTP Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SMTP Configuration</CardTitle>
          <CardDescription>
            For Gmail: use <strong>smtp.gmail.com</strong>, port <strong>587</strong>, and an{' '}
            <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noreferrer" className="underline text-blue-500">App Password</a>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>SMTP host</Label>
              <Input value={cfg.smtp_host} onChange={e => set({ smtp_host: e.target.value })} placeholder="smtp.gmail.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Port</Label>
              <Input type="number" value={cfg.smtp_port} onChange={e => set({ smtp_port: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Username / email</Label>
              <Input value={cfg.smtp_user} onChange={e => set({ smtp_user: e.target.value })} placeholder="you@gmail.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Password / App Password</Label>
              <div className="relative">
                <Input
                  type={showPw ? 'text' : 'password'}
                  value={cfg.smtp_password}
                  onChange={e => set({ smtp_password: e.target.value })}
                  placeholder="Leave blank to keep existing"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="tls" checked={cfg.use_tls} onCheckedChange={v => set({ use_tls: v })} />
            <Label htmlFor="tls" className="cursor-pointer">Use STARTTLS (recommended)</Label>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Settings
        </Button>
        <Button variant="outline" onClick={handleTest} disabled={testing}>
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
          Send Test Email
        </Button>
        {testResult && (
          <span className={`text-sm flex items-center gap-1 ${testResult.ok ? 'text-green-600' : 'text-destructive'}`}>
            {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {testResult.msg}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Budget Defaults Tab ───────────────────────────────────────────────────────

interface BudgetTemplate {
  category: string
  subcategory: string | null
  amount: number
}

function BudgetDefaultsTab() {
  const [templates, setTemplates] = useState<BudgetTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [newCat, setNewCat] = useState('')
  const [newSub, setNewSub] = useState('')
  const [newAmt, setNewAmt] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.get('/budgets/templates')
      .then(r => setTemplates(r.data ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // Available subcategories for the selected category
  const subcategories = newCat ? (CATEGORY_MAP[newCat] ?? []) : []

  const handleAdd = async () => {
    if (!newCat) { setErr('Select a category'); return }
    const amount = parseFloat(newAmt)
    if (!amount || amount <= 0) { setErr('Enter a valid amount'); return }
    setSaving(true); setErr('')
    try {
      const res = await api.post('/budgets/templates', {
        category: newCat,
        subcategory: newSub || null,
        amount,
      })
      setTemplates(res.data.templates ?? [])
      setNewCat(''); setNewSub(''); setNewAmt('')
      setMsg('Template saved!'); setTimeout(() => setMsg(''), 2500)
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? 'Failed to save template')
    } finally { setSaving(false) }
  }

  const handleDelete = async (cat: string, sub: string | null) => {
    try {
      const params = new URLSearchParams({ category: cat })
      if (sub) params.set('subcategory', sub)
      const res = await api.delete(`/budgets/templates?${params.toString()}`)
      setTemplates(res.data.templates ?? [])
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-4">
      {/* Explainer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Global Budget Defaults</CardTitle>
          <CardDescription>
            Set default budget amounts per category. On the Budget page, click <strong>Apply Templates</strong> to
            instantly create this month's budgets from these defaults — existing budgets won't be overwritten.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Add template */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Add / Update Template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Category */}
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <select
                value={newCat}
                onChange={e => { setNewCat(e.target.value); setNewSub('') }}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select category…</option>
                {ALL_CATEGORIES_SETTINGS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Subcategory (optional) */}
            <div className="space-y-1">
              <Label className="text-xs">Subcategory <span className="text-muted-foreground">(optional)</span></Label>
              <select
                value={newSub}
                onChange={e => setNewSub(e.target.value)}
                disabled={!newCat || subcategories.length === 0}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
              >
                <option value="">Any / Category-level</option>
                {subcategories.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div className="space-y-1">
              <Label className="text-xs">Monthly Budget ($)</Label>
              <Input
                type="number" min="1" step="10"
                placeholder="e.g. 500"
                value={newAmt}
                onChange={e => setNewAmt(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {err && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{err}</p>}
          {msg && <p className="text-xs text-green-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{msg}</p>}

          <Button size="sm" onClick={handleAdd} disabled={saving || !newCat || !newAmt}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {templates.some(t => t.category === newCat && t.subcategory === (newSub || null)) ? 'Update Template' : 'Add Template'}
          </Button>
        </CardContent>
      </Card>

      {/* Template list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Saved Templates ({templates.length})</CardTitle>
          <CardDescription className="text-xs">These amounts will be used as defaults when you click "Apply Templates" on the Budget page.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <LayoutGrid className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No templates yet</p>
              <p className="text-xs mt-1">Add your first template above</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {templates.map((t, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {t.category}
                      {t.subcategory && (
                        <span className="text-muted-foreground font-normal"> › {t.subcategory}</span>
                      )}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-primary">
                    ${t.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(t.category, t.subcategory)}
                    title="Remove template"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

const TAB_CONTENT: Record<SettingsTab, React.ComponentType> = {
  accounts: AccountsTab,
  categories: CategoriesTab,
  budgets: BudgetDefaultsTab,
  ai: AITab,
  ios: IOSTab,
  appearance: AppearanceTab,
  notifications: NotificationsTab,
  backup: BackupTab,
  security: SecurityTab,
  health: HealthTab,
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

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Sidebar */}
        <div className="min-w-0 md:w-52 md:flex-shrink-0">
          <nav className="flex gap-1 overflow-x-auto pb-1 md:block md:space-y-1 md:overflow-visible md:pb-0">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex flex-shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors md:w-full md:gap-3 ${
                  activeTab === id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
                {activeTab === id && <ChevronRight className="ml-auto hidden w-3 h-3 md:block" />}
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
