import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw, Plus, TrendingUp, Calendar, Star,
  Briefcase, User, Pencil, XCircle, ChevronDown,
} from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ALL_CATEGORIES, getSubcategories } from '@/lib/categories'
import { useAccountsStore } from '@/store'
import { api } from '@/utils/apiClient'
import type { Subscription } from '@/types'

// ── Star rating ───────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number | null; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange?.(n)}
          className={onChange ? 'cursor-pointer' : 'cursor-default'}
        >
          <Star
            className={`w-3.5 h-3.5 transition-colors ${
              value && n <= value ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

// ── Subscription form sheet ───────────────────────────────────────────────────

const FREQUENCIES = ['monthly', 'yearly', 'quarterly', 'weekly']

interface SubForm {
  name: string
  amount: string
  billing_frequency: string
  next_billing_date: string
  category: string
  subcategory: string
  personal_work_shared: string
  is_reimbursable: boolean
  account_id: string
  value_rating: number | null
  notes: string
}

const EMPTY_FORM: SubForm = {
  name: '', amount: '', billing_frequency: 'monthly', next_billing_date: '',
  category: '', subcategory: '', personal_work_shared: 'personal', is_reimbursable: false,
  account_id: '', value_rating: null, notes: '',
}

function SubscriptionSheet({
  open, sub, onClose, onSaved,
}: { open: boolean; sub: Subscription | null; onClose: () => void; onSaved: () => void }) {
  const { accounts } = useAccountsStore()
  const [form, setForm] = useState<SubForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (sub) {
      setForm({
        name: sub.name,
        amount: String(sub.amount),
        billing_frequency: sub.billing_frequency ?? 'monthly',
        next_billing_date: sub.next_billing_date ?? '',
        category: sub.category ?? '',
        subcategory: sub.subcategory ?? '',
        personal_work_shared: sub.personal_work_shared ?? 'personal',
        is_reimbursable: sub.is_reimbursable,
        account_id: sub.account_id ?? '',
        value_rating: sub.value_rating,
        notes: sub.notes ?? '',
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [sub, open])

  const set = (k: keyof SubForm, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name || !form.amount) return
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        amount: parseFloat(form.amount),
        billing_frequency: form.billing_frequency,
        next_billing_date: form.next_billing_date || null,
        category: form.category || null,
        subcategory: form.subcategory || null,
        personal_work_shared: form.personal_work_shared,
        is_reimbursable: form.is_reimbursable,
        account_id: form.account_id || null,
        value_rating: form.value_rating,
        notes: form.notes || null,
      }
      if (sub) await api.put(`/subscriptions/${sub.id}`, payload)
      else await api.post('/subscriptions', payload)
      onSaved()
      onClose()
    } catch (e: unknown) {
      // L-9: Surface save errors so the user knows what went wrong
      const ex = e as { response?: { data?: { detail?: string } } }
      toast.error(ex?.response?.data?.detail ?? 'Failed to save subscription')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="w-[400px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>{sub ? 'Edit Subscription' : 'Add Subscription'}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4">
          <div>
            <Label>Name *</Label>
            <Input className="mt-1" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Netflix, Spotify…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount *</Label>
              <Input className="mt-1" type="number" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="9.99" />
            </div>
            <div>
              <Label>Billing Frequency</Label>
              <Select value={form.billing_frequency} onValueChange={(v) => set('billing_frequency', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Next Billing Date</Label>
            <DateInput className="mt-1" value={form.next_billing_date} onChange={(e) => set('next_billing_date', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select
                value={form.category || '__none'}
                onValueChange={(v) => { set('category', v === '__none' ? '' : v); set('subcategory', '') }}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Uncategorized</SelectItem>
                  {ALL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subcategory</Label>
              <Select
                value={form.subcategory || '__none'}
                onValueChange={(v) => set('subcategory', v === '__none' ? '' : v)}
                disabled={!form.category || getSubcategories(form.category).length === 0}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {getSubcategories(form.category).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Personal / Work</Label>
            <Select value={form.personal_work_shared} onValueChange={(v) => set('personal_work_shared', v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="work">Work</SelectItem>
                <SelectItem value="shared">Shared</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Account</Label>
            <Select
              value={form.account_id || '__none'}
              onValueChange={(v) => set('account_id', v === '__none' ? '' : v)}
            >
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Value Rating</Label>
            <div className="mt-2">
              <StarRating value={form.value_rating} onChange={(v) => set('value_rating', v)} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label>Reimbursable</Label>
            <Switch checked={form.is_reimbursable} onCheckedChange={(v) => set('is_reimbursable', v)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Input className="mt-1" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional notes…" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={!form.name || !form.amount || saving}>
              {saving ? 'Saving…' : sub ? 'Save Changes' : 'Add Subscription'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── Subscription card ─────────────────────────────────────────────────────────

function SubCard({
  sub, auditMode, onEdit, onCancel,
}: { sub: Subscription; auditMode: boolean; onEdit: () => void; onCancel: () => void }) {
  const isWork = sub.personal_work_shared === 'work'
  const isShared = sub.personal_work_shared === 'shared'

  return (
    <Card className="overflow-hidden hover:border-primary/40 transition-all group">
      <CardContent className="p-4">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="font-semibold truncate">{sub.name}</p>
            {sub.category && (
              <p className="text-xs text-muted-foreground truncate">{sub.category}</p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${
              isWork   ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' :
              isShared ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300' :
                         'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}>
              {isWork ? <Briefcase className="w-3 h-3" /> : <User className="w-3 h-3" />}
              {sub.personal_work_shared ?? 'Personal'}
            </span>
          </div>
        </div>

        {/* Amount + frequency */}
        <div className="flex items-baseline gap-1 mb-1">
          <span className="text-xl font-bold tabular-nums">{formatCurrency(sub.amount)}</span>
          <span className="text-xs text-muted-foreground">/ {sub.billing_frequency ?? 'mo'}</span>
        </div>
        {sub.billing_frequency !== 'monthly' && (
          <p className="text-xs text-muted-foreground mb-2">
            ≈ {formatCurrency(sub.monthly_equivalent)} / mo · {formatCurrency(sub.annual_equivalent)} / yr
          </p>
        )}

        {/* Next billing */}
        {sub.next_billing_date && (
          <div className="flex items-center gap-1 mb-3">
            <Calendar className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Next: {formatDate(sub.next_billing_date)}</span>
          </div>
        )}

        {/* Value rating */}
        <div className="flex items-center justify-between">
          <StarRating value={sub.value_rating} />
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onEdit} className="p-1 rounded hover:bg-accent transition-colors">
              <Pencil className="w-3 h-3" />
            </button>
            <button onClick={onCancel} className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors">
              <XCircle className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Audit mode extras */}
        {auditMode && (
          <div className="mt-3 pt-3 border-t space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Audit</p>
            <div className="flex gap-2">
              <button className="flex-1 text-xs py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:opacity-80 transition-opacity">
                Keep
              </button>
              <button className="flex-1 text-xs py-1 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 hover:opacity-80 transition-opacity">
                Pause
              </button>
              <button onClick={onCancel} className="flex-1 text-xs py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:opacity-80 transition-opacity">
                Cancel
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'personal' | 'work'

export function Subscriptions() {
  const { accounts } = useAccountsStore()
  const [subs, setSubs] = useState<Subscription[]>([])
  const [cancelled, setCancelled] = useState<Subscription[]>([])
  const [summary, setSummary] = useState({ total_monthly: 0, total_annual: 0, personal_monthly: 0, work_monthly: 0, count: 0 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [auditMode, setAuditMode] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Subscription | null>(null)
  const [showCancelled, setShowCancelled] = useState(false)

  const fetchAll = async () => {
    try {
      const [activeRes, allRes, summaryRes] = await Promise.all([
        api.get('/subscriptions?active_only=true'),
        api.get('/subscriptions?active_only=false'),
        api.get('/subscriptions/summary'),
      ])
      setSubs(activeRes.data)
      setCancelled(allRes.data.filter((s: Subscription) => !s.is_active))
      setSummary(summaryRes.data)
    } catch {
      toast.error('Failed to load subscriptions.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this subscription? This cannot be undone.')) return
    try {
      await api.delete(`/subscriptions/${id}`)
      fetchAll()
    } catch {
      toast.error('Failed to cancel subscription.')
    }
  }

  const handleEdit = (sub: Subscription) => { setEditing(sub); setSheetOpen(true) }
  const handleAdd = () => { setEditing(null); setSheetOpen(true) }

  const filtered = subs.filter((s) =>
    filter === 'all' ? true :
    filter === 'personal' ? (s.personal_work_shared === 'personal' || !s.personal_work_shared) :
    s.personal_work_shared === 'work'
  )

  // Upcoming renewals — within 30 days
  const today = new Date()
  const in30 = new Date(today.getTime() + 30 * 86400000)
  const upcoming = subs
    .filter((s) => s.next_billing_date)
    .filter((s) => {
      const d = new Date(s.next_billing_date! + 'T00:00:00')
      return d >= today && d <= in30
    })
    .sort((a, b) => a.next_billing_date!.localeCompare(b.next_billing_date!))

  const SUMMARY_CARDS = [
    { label: 'Monthly Total', value: summary.total_monthly, sub: `${summary.count} active`, icon: RefreshCw },
    { label: 'Annual Total',  value: summary.total_annual,  sub: 'projected',                icon: TrendingUp },
    // M-6: 'personal' count must exclude 'shared' — !== 'work' incorrectly
    // includes 'shared' subscriptions in the personal bucket.
    { label: 'Personal', value: summary.personal_monthly, sub: `${subs.filter(s => s.personal_work_shared === 'personal' || !s.personal_work_shared).length} subs`, icon: User },
    { label: 'Work',          value: summary.work_monthly,  sub: `${subs.filter(s => s.personal_work_shared === 'work').length} subs`, icon: Briefcase },
  ]

  return (
    <MainLayout>
      <TopBar
        title="Subscriptions"
        subtitle="All your recurring charges in one place"
        actions={
          <>
            <Button
              variant={auditMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAuditMode((v) => !v)}
            >
              <Star className="w-4 h-4" /> {auditMode ? 'Exit Audit' : 'Quarterly Audit'}
            </Button>
            <Button size="sm" onClick={handleAdd}><Plus className="w-4 h-4" /> Add Subscription</Button>
          </>
        }
      />

      {/* Cost summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {SUMMARY_CARDS.map(({ label, value, sub, icon: Icon }, i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                {loading
                  ? <Skeleton className="h-6 w-24" />
                  : <p className="text-xl font-bold">{formatCurrency(value)}</p>
                }
                <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Upcoming renewals */}
      {!loading && upcoming.length > 0 && (
        <Card className="mb-6 border-yellow-500/30 bg-yellow-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-yellow-500" />
              Upcoming Renewals — Next 30 Days
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {formatCurrency(upcoming.reduce((s, u) => s + u.amount, 0))} due
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {upcoming.map((s) => (
                <div key={s.id} className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground w-20 flex-shrink-0">{formatDate(s.next_billing_date)}</span>
                  <span className="flex-1 font-medium truncate">{s.name}</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(s.amount)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter tabs + grid */}
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex-1">Subscriptions</h2>
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {(['all', 'personal', 'work'] as FilterTab[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                filter === f ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 space-y-3">
              <div className="flex justify-between"><Skeleton className="h-4 w-28" /><Skeleton className="h-5 w-16 rounded" /></div>
              <Skeleton className="h-6 w-20" />
              <div className="flex justify-between"><Skeleton className="h-3 w-24" /><div className="flex gap-0.5">{Array.from({length:5}).map((_,j)=><Skeleton key={j} className="h-3.5 w-3.5 rounded-full" />)}</div></div>
            </CardContent></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-medium">No {filter === 'all' ? '' : filter + ' '}subscriptions</p>
              <p className="text-sm text-muted-foreground mt-1">Add subscriptions manually or they'll be auto-detected from imports</p>
            </div>
            <Button size="sm" variant="outline" onClick={handleAdd}><Plus className="w-4 h-4" /> Add Subscription</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
            >
              <SubCard
                sub={s}
                auditMode={auditMode}
                onEdit={() => handleEdit(s)}
                onCancel={() => handleCancel(s.id)}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Cancelled subscriptions */}
      {cancelled.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowCancelled((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showCancelled ? 'rotate-180' : ''}`} />
            Cancelled Subscriptions ({cancelled.length})
          </button>
          <AnimatePresence>
            {showCancelled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-2">
                  {cancelled.map((s) => (
                    <Card key={s.id} className="opacity-60">
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium line-through truncate">{s.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Cancelled {s.cancelled_at ? formatDate(s.cancelled_at.slice(0, 10)) : ''}
                              {' · '}{formatCurrency(s.monthly_equivalent)}/mo
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <SubscriptionSheet
        open={sheetOpen}
        sub={editing}
        onClose={() => { setSheetOpen(false); setEditing(null) }}
        onSaved={fetchAll}
      />
    </MainLayout>
  )
}
