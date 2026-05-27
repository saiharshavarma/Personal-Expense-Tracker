import { useState, useEffect, useCallback } from 'react'
import {
  ChevronLeft, ChevronRight, Plus, Target, Pencil, Trash2,
  Loader2, Copy, TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { monthName, getCurrentMonthYear, formatCurrency } from '@/lib/utils'
import { ALL_CATEGORIES, getCategoryColor } from '@/lib/categories'
import { api } from '@/utils/apiClient'

const { month: currentMonth, year: currentYear } = getCurrentMonthYear()

// ── Types ─────────────────────────────────────────────────────────────────────

interface BudgetRow {
  id: string | null
  category: string
  budget_amount: number
  gross_spend: number
  reimbursed: number
  net_personal: number
  remaining: number
  pct_used: number
  status: 'safe' | 'watch' | 'over'
}

interface NWSBucket {
  spent: number
  target_pct: number
}

interface ActualsResponse {
  month: number
  year: number
  rows: BudgetRow[]
  totals: {
    budget: number
    gross_spend: number
    reimbursed: number
    net_personal: number
    remaining: number
  }
  nws_summary: {
    needs: NWSBucket
    wants: NWSBucket
    savings: NWSBucket
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  safe: { label: 'Safe', className: 'bg-green-500/15 text-green-700 dark:text-green-400', bar: 'bg-green-500' },
  watch: { label: 'Watch', className: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400', bar: 'bg-yellow-500' },
  over: { label: 'Over', className: 'bg-destructive/15 text-destructive', bar: 'bg-destructive' },
}

function StatusBadge({ status }: { status: BudgetRow['status'] }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

function fmt(n: number) {
  return formatCurrency ? formatCurrency(n) : `$${n.toFixed(2)}`
}

// ── Add/Edit Budget Dialog ────────────────────────────────────────────────────

interface BudgetDialogProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  month: number
  year: number
  editing?: { id: string; category: string; budget_amount: number } | null
}

function BudgetDialog({ open, onClose, onSaved, month, year, editing }: BudgetDialogProps) {
  const [category, setCategory] = useState(editing?.category ?? '')
  const [amount, setAmount] = useState(editing ? String(editing.budget_amount) : '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (open) {
      setCategory(editing?.category ?? '')
      setAmount(editing ? String(editing.budget_amount) : '')
      setErr('')
    }
  }, [open, editing])

  const handleSave = async () => {
    const n = parseFloat(amount)
    if (!category) return setErr('Select a category')
    if (isNaN(n) || n <= 0) return setErr('Enter a valid amount')
    setSaving(true)
    setErr('')
    try {
      if (editing?.id) {
        await api.put(`/budgets/${editing.id}`, { budget_amount: n })
      } else {
        await api.post('/budgets', { month, year, category, budget_amount: n })
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      const ex = e as { response?: { data?: { detail?: string } } }
      setErr(ex?.response?.data?.detail ?? 'Failed to save budget')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Budget' : 'Add Category Budget'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Category</Label>
            {editing ? (
              <Input value={category} disabled className="bg-muted" />
            ) : (
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category…" />
                </SelectTrigger>
                <SelectContent>
                  {ALL_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Monthly Budget ($)</Label>
            <Input
              type="number"
              min="0"
              step="10"
              placeholder="e.g. 500"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── 50/30/20 Rule Editor ──────────────────────────────────────────────────────

interface NWSEditorProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  current: { needs: number; wants: number; savings: number }
}

function NWSEditor({ open, onClose, onSaved, current }: NWSEditorProps) {
  const [needs, setNeeds] = useState(String(current.needs))
  const [wants, setWants] = useState(String(current.wants))
  const [savings, setSavings] = useState(String(current.savings))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (open) {
      setNeeds(String(current.needs))
      setWants(String(current.wants))
      setSavings(String(current.savings))
      setErr('')
    }
  }, [open, current])

  const total = (parseFloat(needs) || 0) + (parseFloat(wants) || 0) + (parseFloat(savings) || 0)

  const handleSave = async () => {
    const n = parseFloat(needs), w = parseFloat(wants), s = parseFloat(savings)
    if (Math.abs(n + w + s - 100) > 0.1) return setErr('Values must add up to 100%')
    setSaving(true)
    setErr('')
    try {
      await api.put('/budgets/preferences', { needs: n, wants: w, savings: s })
      onSaved()
      onClose()
    } catch {
      setErr('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Customize Budget Rule</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">Set your target percentages for Needs, Wants, and Savings. They must add up to 100%.</p>
          {[
            { label: 'Needs (%)' , val: needs, set: setNeeds },
            { label: 'Wants (%)' , val: wants, set: setWants },
            { label: 'Savings (%)', val: savings, set: setSavings },
          ].map(({ label, val, set }) => (
            <div key={label} className="space-y-1.5">
              <Label>{label}</Label>
              <Input type="number" min="0" max="100" step="5" value={val} onChange={e => set(e.target.value)} />
            </div>
          ))}
          <p className={`text-xs font-medium ${Math.abs(total - 100) < 0.1 ? 'text-green-600' : 'text-destructive'}`}>
            Total: {total.toFixed(0)}% {Math.abs(total - 100) < 0.1 ? '✓' : `(need ${(100 - total).toFixed(0)}% more)`}
          </p>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function Budget() {
  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)
  const [data, setData] = useState<ActualsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<{ id: string; category: string; budget_amount: number } | null>(null)
  const [nwsOpen, setNwsOpen] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copyMsg, setCopyMsg] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<ActualsResponse>('/budgets/actuals', { params: { month, year } })
      setData(r.data)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { fetchData() }, [fetchData])

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const handleCopyPrevious = async () => {
    setCopying(true)
    setCopyMsg('')
    try {
      const r = await api.post<{ created: number }>('/budgets/copy-previous-month', null, {
        params: { month, year },
      })
      setCopyMsg(`Copied ${r.data.created} budget${r.data.created !== 1 ? 's' : ''} from previous month`)
      fetchData()
    } catch (e: unknown) {
      const ex = e as { response?: { data?: { detail?: string } } }
      setCopyMsg(ex?.response?.data?.detail ?? 'Copy failed')
    } finally {
      setCopying(false)
      setTimeout(() => setCopyMsg(''), 3000)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/budgets/${id}`)
      setDeleteId(null)
      fetchData()
    } catch { /* ignore */ }
  }

  const nwsTargets = data
    ? {
        needs: data.nws_summary.needs.target_pct,
        wants: data.nws_summary.wants.target_pct,
        savings: data.nws_summary.savings.target_pct,
      }
    : { needs: 50, wants: 30, savings: 20 }

  const rows = data?.rows ?? []
  const totals = data?.totals ?? { budget: 0, gross_spend: 0, reimbursed: 0, net_personal: 0, remaining: 0 }
  const nws = data?.nws_summary ?? {
    needs: { spent: 0, target_pct: 50 },
    wants: { spent: 0, target_pct: 30 },
    savings: { spent: 0, target_pct: 20 },
  }
  const totalSpend = totals.net_personal || 1

  const nwsConfig = [
    { key: 'needs', label: 'Needs', color: 'bg-blue-500', ...nws.needs },
    { key: 'wants', label: 'Wants', color: 'bg-purple-500', ...nws.wants },
    { key: 'savings', label: 'Savings', color: 'bg-green-500', ...nws.savings },
  ]

  return (
    <MainLayout>
      <TopBar
        title="Budget"
        subtitle="Set and track your monthly spending targets"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleCopyPrevious} disabled={copying}>
              {copying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
              Copy Previous Month
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true) }}>
              <Plus className="w-4 h-4" />Add Category
            </Button>
          </>
        }
      />

      {/* Month selector */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border bg-card">
            <button onClick={prevMonth} className="p-2 hover:bg-accent rounded-l-lg transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-4 py-2 text-sm font-medium min-w-[140px] text-center">
              {monthName(month)} {year}
            </div>
            <button onClick={nextMonth} className="p-2 hover:bg-accent rounded-r-lg transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <AnimatePresence>
            {copyMsg && (
              <motion.p
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm text-muted-foreground"
              >
                {copyMsg}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <Button variant="outline" size="sm" onClick={() => setNwsOpen(true)}>
          <TrendingUp className="w-4 h-4" />
          {nwsTargets.needs}/{nwsTargets.wants}/{nwsTargets.savings} Rule
        </Button>
      </div>

      {/* 50/30/20 summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {nwsConfig.map(({ key, label, color, spent, target_pct }) => {
          const pct = totalSpend > 0 ? (spent / totalSpend) * 100 : 0
          const delta = pct - target_pct
          return (
            <Card key={key}>
              <CardContent className="pt-4 pb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground">Target {target_pct}%</span>
                </div>
                <div className="relative h-2 rounded-full bg-secondary overflow-hidden mb-2">
                  <div
                    className={`absolute left-0 top-0 h-full rounded-full transition-all ${color}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                  {/* Target marker */}
                  <div
                    className="absolute top-0 w-0.5 h-full bg-foreground/30"
                    style={{ left: `${target_pct}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">{fmt(spent)}</span>
                  <span className={
                    Math.abs(delta) < 5 ? 'text-muted-foreground' :
                    delta > 0 ? 'text-destructive font-medium' : 'text-green-600 dark:text-green-400 font-medium'
                  }>
                    {pct.toFixed(1)}%
                    {Math.abs(delta) >= 5 && (
                      delta > 0
                        ? <TrendingUp className="inline w-3 h-3 ml-0.5" />
                        : <TrendingDown className="inline w-3 h-3 ml-0.5" />
                    )}
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Totals summary */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Budget', value: totals.budget, dimmed: false },
            { label: 'Gross Spend', value: totals.gross_spend, dimmed: false },
            { label: 'Reimbursed', value: totals.reimbursed, dimmed: true },
            {
              label: 'Net Personal',
              value: totals.net_personal,
              dimmed: false,
              highlight: totals.net_personal > totals.budget ? 'destructive' : 'normal',
            },
          ].map(({ label, value, dimmed, highlight }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className={`text-lg font-semibold tabular-nums ${
                  highlight === 'destructive' ? 'text-destructive' :
                  dimmed ? 'text-muted-foreground' : ''
                }`}>
                  {fmt(value)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Category table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Category Budgets</CardTitle>
          {!loading && rows.length > 0 && (
            <p className="text-xs text-muted-foreground">{rows.length} categories</p>
          )}
        </CardHeader>

        {loading ? (
          <CardContent className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </CardContent>
        ) : rows.length === 0 ? (
          <CardContent className="py-12 text-center">
            <Target className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No budgets set for this month</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add category budgets or copy from a previous month
            </p>
            <div className="flex gap-2 justify-center mt-4">
              <Button variant="outline" size="sm" onClick={handleCopyPrevious} disabled={copying}>
                {copying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                Copy Previous Month
              </Button>
              <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true) }}>
                <Plus className="w-4 h-4" />Set Budgets
              </Button>
            </div>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            {/* Table header */}
            <div className="grid gap-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b"
              style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 80px 64px' }}>
              <div>Category</div>
              <div className="text-right">Budget</div>
              <div className="text-right">Gross Spend</div>
              <div className="text-right">Reimbursed</div>
              <div className="text-right">Net Personal</div>
              <div className="text-right">Remaining</div>
              <div className="text-center">Status</div>
              <div />
            </div>

            <AnimatePresence initial={false}>
              {rows.map(row => {
                const barColor = STATUS_CONFIG[row.status].bar
                return (
                  <motion.div
                    key={row.category}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="group"
                  >
                    <div
                      className="grid gap-4 px-4 py-3 items-center border-b last:border-0 hover:bg-accent/50 transition-colors"
                      style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 80px 64px' }}
                    >
                      {/* Category name + progress bar */}
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: getCategoryColor(row.category) }}
                          />
                          <span className="text-sm font-medium truncate">{row.category}</span>
                        </div>
                        {row.budget_amount > 0 && (
                          <div className="relative h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div
                              className={`absolute left-0 top-0 h-full rounded-full transition-all ${barColor}`}
                              style={{ width: `${Math.min(row.pct_used, 100)}%` }}
                            />
                          </div>
                        )}
                      </div>

                      <div className="text-right text-sm tabular-nums">
                        {row.budget_amount > 0 ? fmt(row.budget_amount) : <span className="text-muted-foreground">—</span>}
                      </div>
                      <div className="text-right text-sm tabular-nums">{fmt(row.gross_spend)}</div>
                      <div className="text-right text-sm tabular-nums text-muted-foreground">
                        {row.reimbursed > 0 ? fmt(row.reimbursed) : '—'}
                      </div>
                      <div className="text-right text-sm tabular-nums font-medium">{fmt(row.net_personal)}</div>
                      <div className={`text-right text-sm tabular-nums font-medium ${
                        row.budget_amount > 0
                          ? row.remaining < 0 ? 'text-destructive' : 'text-green-600 dark:text-green-400'
                          : 'text-muted-foreground'
                      }`}>
                        {row.budget_amount > 0
                          ? (row.remaining >= 0 ? fmt(row.remaining) : `-${fmt(Math.abs(row.remaining))}`)
                          : '—'}
                      </div>
                      <div className="flex justify-center">
                        {row.budget_amount > 0 ? <StatusBadge status={row.status} /> : (
                          <span className="text-xs text-muted-foreground">No budget</span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            if (row.id) {
                              setEditing({ id: row.id, category: row.category, budget_amount: row.budget_amount })
                            } else {
                              setEditing(null)
                              setDialogOpen(true)
                            }
                            setDialogOpen(true)
                          }}
                          className="p-1 rounded hover:bg-accent"
                          title="Edit budget"
                        >
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        {row.id && (
                          <button
                            onClick={() => setDeleteId(row.id)}
                            className="p-1 rounded hover:bg-accent"
                            title="Remove budget"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>

            {/* Totals row */}
            <div
              className="grid gap-4 px-4 py-3 items-center bg-muted/50 text-sm font-semibold"
              style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 80px 64px' }}
            >
              <div>Total</div>
              <div className="text-right tabular-nums">{fmt(totals.budget)}</div>
              <div className="text-right tabular-nums">{fmt(totals.gross_spend)}</div>
              <div className="text-right tabular-nums text-muted-foreground">{fmt(totals.reimbursed)}</div>
              <div className="text-right tabular-nums">{fmt(totals.net_personal)}</div>
              <div className={`text-right tabular-nums ${totals.remaining < 0 ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>
                {totals.remaining >= 0 ? fmt(totals.remaining) : `-${fmt(Math.abs(totals.remaining))}`}
              </div>
              <div />
              <div />
            </div>
          </div>
        )}
      </Card>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Budget?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This removes the budget target. Spending data is not affected.</p>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit dialog */}
      <BudgetDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null) }}
        onSaved={fetchData}
        month={month}
        year={year}
        editing={editing}
      />

      {/* NWS rule editor */}
      <NWSEditor
        open={nwsOpen}
        onClose={() => setNwsOpen(false)}
        onSaved={fetchData}
        current={nwsTargets}
      />
    </MainLayout>
  )
}
