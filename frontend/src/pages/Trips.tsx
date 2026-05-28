import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plane, Plus, MapPin, Calendar, DollarSign,
  Pencil, Trash2, ChevronRight, X, Briefcase, User,
  TrendingUp, Package, Tag, Search, Check, AlertCircle, Loader2, Zap,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { api } from '@/utils/apiClient'
import type { Trip } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TripExpense {
  id: string
  date: string
  amount: number
  merchant: string | null
  category: string | null
}

interface TripDetail {
  trip: Trip
  expenses: TripExpense[]
  total_spent: number
  budget_remaining: number | null
}

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, { label: string; color: string }> = {
  planning:  { label: 'Planning',  color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  active:    { label: 'Active',    color: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' },
  completed: { label: 'Completed', color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400' },
  archived:  { label: 'Archived',  color: 'bg-muted text-muted-foreground' },
}

type StatusFilter = 'all' | 'active' | 'planning' | 'completed'

// Compute the effective display status from dates, ignoring stored status
// (except 'archived' which is always intentional).
function effectiveStatus(trip: Trip): Trip['status'] {
  if (trip.status === 'archived') return 'archived'
  if (!trip.start_date && !trip.end_date) return trip.status
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = trip.start_date ? new Date(trip.start_date + 'T00:00:00') : null
  const end   = trip.end_date   ? new Date(trip.end_date   + 'T00:00:00') : null
  if (end && today > end) return 'completed'
  if (start && today >= start) return 'active'
  return 'planning'
}

// ── Trip form dialog ──────────────────────────────────────────────────────────

interface TripForm {
  name: string
  destination: string
  start_date: string
  end_date: string
  trip_type: string
  budget: string
  notes: string
}

const EMPTY_FORM: TripForm = {
  name: '', destination: '', start_date: '', end_date: '',
  trip_type: 'business', budget: '', notes: '',
}

function TripFormDialog({
  open, trip, onClose, onSaved,
}: { open: boolean; trip: Trip | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<TripForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (trip) {
      setForm({
        name: trip.name,
        destination: trip.destination ?? '',
        start_date: trip.start_date ?? '',
        end_date: trip.end_date ?? '',
        trip_type: trip.trip_type,
        budget: trip.budget ? String(trip.budget) : '',
        notes: trip.notes ?? '',
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [trip, open])

  const set = (k: keyof TripForm, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        destination: form.destination || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        trip_type: form.trip_type,
        budget: form.budget ? parseFloat(form.budget) : null,
        notes: form.notes || null,
      }
      if (trip) await api.put(`/trips/${trip.id}`, payload)
      else await api.post('/trips', payload)
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{trip ? 'Edit Trip' : 'New Trip'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Trip Name *</Label>
            <Input className="mt-1" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="NYC Conference, Bali Vacation…" />
          </div>
          <div>
            <Label>Destination</Label>
            <Input className="mt-1" value={form.destination} onChange={(e) => set('destination', e.target.value)} placeholder="New York, NY" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start Date</Label>
              <DateInput className="mt-1" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
            </div>
            <div>
              <Label>End Date</Label>
              <DateInput className="mt-1" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={form.trip_type} onValueChange={(v) => set('trip_type', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Budget</Label>
              <Input className="mt-1" type="number" step="0.01" value={form.budget} onChange={(e) => set('budget', e.target.value)} placeholder="3000" />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Input className="mt-1" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional notes…" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={!form.name || saving}>
              {saving ? 'Saving…' : trip ? 'Save Changes' : 'Create Trip'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Trip detail sheet ─────────────────────────────────────────────────────────

interface TxnCandidate {
  id: string
  date: string
  amount: number
  merchant: string | null
  description: string | null
  category: string | null
  business_trip_id: string | null
}

type DetailTab = 'expenses' | 'tag'

function TripDetailSheet({
  trip, onClose, onEdit,
}: { trip: Trip | null; onClose: () => void; onEdit: (t: Trip) => void }) {
  const [tab, setTab] = useState<DetailTab>('expenses')
  const [detail, setDetail] = useState<TripDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [candidates, setCandidates] = useState<TxnCandidate[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tagging, setTagging] = useState(false)
  const [tagSearch, setTagSearch] = useState('')
  const [autoTagging, setAutoTagging] = useState(false)
  const [autoTagMsg, setAutoTagMsg] = useState<string | null>(null)

  const loadExpenses = async () => {
    if (!trip) return
    setLoading(true)
    try { const r = await api.get(`/trips/${trip.id}/expenses`); setDetail(r.data) }
    catch { setDetail(null) }
    finally { setLoading(false) }
  }

  const loadCandidates = async () => {
    if (!trip) return
    setCandidatesLoading(true)
    try {
      const params: Record<string, string | number> = { page_size: 200, sort_by: 'date', sort_dir: 'desc' }
      if (trip.start_date) params.date_from = trip.start_date
      if (trip.end_date) params.date_to = trip.end_date
      const r = await api.get('/transactions', { params })
      setCandidates(r.data.items.filter((t: TxnCandidate) => t.business_trip_id !== trip.id))
    } catch { setCandidates([]) }
    finally { setCandidatesLoading(false) }
  }

  useEffect(() => {
    if (!trip) { setDetail(null); setCandidates([]); setSelected(new Set()); setTab('expenses'); setTagSearch(''); return }
    loadExpenses()
  }, [trip?.id])

  useEffect(() => {
    if (tab === 'tag' && trip) loadCandidates()
  }, [tab, trip?.id])

  const handleTag = async () => {
    if (!trip || selected.size === 0) return
    setTagging(true)
    try {
      await api.post('/transactions/bulk', {
        transaction_ids: Array.from(selected),
        action: 'update',
        payload: { business_trip_id: trip.id },
      })
      setSelected(new Set())
      await loadExpenses()
      await loadCandidates()
    } finally { setTagging(false) }
  }

  const handleUntag = async (txnId: string) => {
    await api.put(`/transactions/${txnId}`, { business_trip_id: null })
    await loadExpenses()
    if (tab === 'tag') await loadCandidates()
  }

  const handleAutoTag = async () => {
    if (!trip) return
    setAutoTagging(true)
    setAutoTagMsg(null)
    try {
      const r = await api.post(`/trips/${trip.id}/auto-tag`)
      const count = r.data.tagged_count as number
      setAutoTagMsg(count > 0
        ? `✓ Auto-tagged ${count} transaction${count === 1 ? '' : 's'} within the trip date range.`
        : 'No untagged transactions found within the trip date range.')
      await loadExpenses()
    } catch {
      setAutoTagMsg('Auto-tag failed. Make sure the trip has start and end dates.')
    } finally {
      setAutoTagging(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    const visible = filteredCandidates.map((c) => c.id)
    const allSelected = visible.every((id) => selected.has(id))
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) visible.forEach((id) => next.delete(id))
      else visible.forEach((id) => next.add(id))
      return next
    })
  }

  const statusMeta = STATUS_PILL[trip ? effectiveStatus(trip) : 'planning']

  const catMap: Record<string, number> = {}
  detail?.expenses.forEach((e) => {
    const cat = e.category ?? 'Uncategorized'
    catMap[cat] = (catMap[cat] ?? 0) + e.amount
  })
  const catRows = Object.entries(catMap).sort((a, b) => b[1] - a[1])
  const maxCat = Math.max(...catRows.map((r) => r[1]), 1)

  const budgetPct = detail && trip?.budget
    ? Math.min(100, (detail.total_spent / (trip.budget as number)) * 100)
    : null

  const filteredCandidates = candidates.filter((c) => {
    if (!tagSearch) return true
    const q = tagSearch.toLowerCase()
    return (c.merchant ?? '').toLowerCase().includes(q) ||
           (c.description ?? '').toLowerCase().includes(q) ||
           (c.category ?? '').toLowerCase().includes(q)
  })

  const alreadyTaggedElsewhere = filteredCandidates.filter((c) => c.business_trip_id && c.business_trip_id !== trip?.id)
  const untagged = filteredCandidates.filter((c) => !c.business_trip_id)
  const allVisible = filteredCandidates.map((c) => c.id)
  const allVisibleSelected = allVisible.length > 0 && allVisible.every((id) => selected.has(id))

  return (
    <Sheet open={!!trip} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="w-[560px] overflow-y-auto flex flex-col">
        {trip && (
          <>
            {/* ── Header ── */}
            <SheetHeader className="mb-4 flex-shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <SheetTitle className="text-lg">{trip.name}</SheetTitle>
                  {trip.destination && (
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{trip.destination}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusMeta.color}`}>
                    {statusMeta.label}
                  </span>
                  <button onClick={() => onEdit(trip)} className="p-1.5 rounded hover:bg-accent transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                {(trip.start_date || trip.end_date) && (
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      {trip.start_date ? formatDate(trip.start_date) : ''}
                      {trip.start_date && trip.end_date && ' – '}
                      {trip.end_date ? formatDate(trip.end_date) : ''}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  {trip.trip_type === 'business' ? <Briefcase className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                  <span className="capitalize">{trip.trip_type}</span>
                </div>
              </div>
            </SheetHeader>

            {/* ── Budget bar ── */}
            {loading ? (
              <Skeleton className="h-[76px] w-full rounded-xl mb-4 flex-shrink-0" />
            ) : (
              <Card className="mb-4 flex-shrink-0">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium">Spend vs Budget</span>
                    {trip.budget && (
                      <span className="text-xs text-muted-foreground">Budget: {formatCurrency(trip.budget)}</span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-2xl font-bold">{formatCurrency(detail?.total_spent ?? 0)}</span>
                    {trip.budget && detail?.budget_remaining != null && (
                      <span className={`text-sm ${detail.budget_remaining >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {detail.budget_remaining >= 0
                          ? `${formatCurrency(detail.budget_remaining)} left`
                          : `${formatCurrency(Math.abs(detail.budget_remaining))} over`}
                      </span>
                    )}
                  </div>
                  {budgetPct !== null && (
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${budgetPct > 90 ? 'bg-red-500' : budgetPct > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ width: `${budgetPct}%` }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── Auto-tag banner ── */}
            {trip?.start_date && trip?.end_date && (
              <div className="flex items-center gap-2 mb-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAutoTag}
                  disabled={autoTagging}
                  className="text-xs h-7 gap-1.5"
                >
                  {autoTagging
                    ? <><Loader2 className="w-3 h-3 animate-spin" /> Auto-tagging…</>
                    : <><Zap className="w-3 h-3 text-primary" /> Auto-tag by Date</>}
                </Button>
                {autoTagMsg && (
                  <span className="text-xs text-muted-foreground">{autoTagMsg}</span>
                )}
              </div>
            )}

            {/* ── Tabs ── */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit mb-4 flex-shrink-0">
              {([
                { id: 'expenses', label: `Expenses (${detail?.expenses.length ?? 0})` },
                { id: 'tag',      label: 'Tag Transactions' },
              ] as { id: DetailTab; label: string }[]).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5',
                    tab === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {id === 'tag' && <Tag className="w-3 h-3" />}
                  {label}
                  {id === 'tag' && selected.size > 0 && (
                    <span className="bg-primary text-primary-foreground rounded-full text-[10px] w-4 h-4 flex items-center justify-center">
                      {selected.size}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Expenses tab ── */}
            <AnimatePresence mode="wait">
              {tab === 'expenses' && (
                <motion.div key="expenses" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1">
                  {/* Category breakdown */}
                  {!loading && catRows.length > 0 && (
                    <Card className="mb-4">
                      <CardHeader className="pb-2 pt-3 px-4">
                        <CardTitle className="text-sm">By Category</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-2">
                        {catRows.map(([cat, amt]) => (
                          <div key={cat}>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-xs text-muted-foreground">{cat}</span>
                              <span className="text-xs font-medium">{formatCurrency(amt)}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-primary/60" style={{ width: `${(amt / maxCat) * 100}%` }} />
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {loading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 py-2.5 border-b">
                          <Skeleton className="h-4 w-20" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-16" />
                        </div>
                      ))}
                    </div>
                  ) : detail?.expenses.length === 0 ? (
                    <div className="flex flex-col items-center py-10 text-center text-muted-foreground">
                      <Package className="w-8 h-8 mb-2 opacity-40" />
                      <p className="text-sm font-medium">No expenses tagged yet</p>
                      <p className="text-xs mt-1 mb-3">Auto-tag all transactions within the trip date range, or manually pick them.</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setTab('tag')}>
                          <Tag className="w-3.5 h-3.5 mr-1" /> Tag Manually
                        </Button>
                        {trip?.start_date && trip?.end_date && (
                          <Button size="sm" onClick={handleAutoTag} disabled={autoTagging}>
                            {autoTagging ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Tagging…</> : <><Zap className="w-3.5 h-3.5 mr-1" /> Auto-tag by Date</>}
                          </Button>
                        )}
                      </div>
                      {autoTagMsg && <p className="text-xs mt-2 text-foreground">{autoTagMsg}</p>}
                    </div>
                  ) : (
                    <div className="divide-y rounded-xl border overflow-hidden">
                      {detail?.expenses.map((e) => (
                        <div key={e.id} className="flex items-center gap-3 px-3 py-2.5 text-sm group hover:bg-accent/40 transition-colors">
                          <span className="text-xs text-muted-foreground w-[72px] flex-shrink-0 tabular-nums">{formatDate(e.date)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="truncate font-medium text-sm">{e.merchant ?? '—'}</p>
                            {e.category && <p className="text-xs text-muted-foreground">{e.category}</p>}
                          </div>
                          <span className="font-semibold tabular-nums flex-shrink-0 text-sm">{formatCurrency(e.amount)}</span>
                          <button
                            onClick={() => handleUntag(e.id)}
                            title="Remove from trip"
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all flex-shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── Tag tab ── */}
              {tab === 'tag' && (
                <motion.div key="tag" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col gap-3">
                  {/* Date range note */}
                  {!trip.start_date && !trip.end_date && (
                    <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      No date range set on this trip — showing all transactions. Add start/end dates to pre-filter.
                    </div>
                  )}

                  {/* Search + bulk tag */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search merchant, description, category…"
                        value={tagSearch}
                        onChange={(e) => setTagSearch(e.target.value)}
                        className="pl-8 h-8 text-xs"
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={selected.size === 0 || tagging}
                      onClick={handleTag}
                      className="h-8 flex-shrink-0"
                    >
                      <Tag className="w-3.5 h-3.5" />
                      {tagging ? 'Tagging…' : selected.size > 0 ? `Tag ${selected.size}` : 'Tag Selected'}
                    </Button>
                  </div>

                  {candidatesLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 py-2.5 border-b">
                          <Skeleton className="h-4 w-4 rounded" /><Skeleton className="h-4 w-20" />
                          <Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-16" />
                        </div>
                      ))}
                    </div>
                  ) : filteredCandidates.length === 0 ? (
                    <div className="flex flex-col items-center py-10 text-center text-muted-foreground">
                      <Check className="w-8 h-8 mb-2 opacity-40" />
                      <p className="text-sm font-medium">
                        {tagSearch ? 'No matches found' : 'All transactions in this date range are already tagged'}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border overflow-hidden">
                      {/* Select all header */}
                      <div className="flex items-center gap-3 px-3 py-2 bg-muted/50 border-b">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleAll}
                          className="w-4 h-4 rounded accent-primary cursor-pointer"
                        />
                        <span className="text-xs text-muted-foreground flex-1">
                          {filteredCandidates.length} transaction{filteredCandidates.length !== 1 ? 's' : ''}
                          {tagSearch && ` matching "${tagSearch}"`}
                        </span>
                        {selected.size > 0 && (
                          <span className="text-xs font-medium text-primary">{selected.size} selected</span>
                        )}
                      </div>

                      {/* Untagged transactions */}
                      {untagged.length > 0 && (
                        <div>
                          {alreadyTaggedElsewhere.length > 0 && (
                            <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 py-1.5 bg-muted/30">
                              Untagged
                            </p>
                          )}
                          {untagged.map((c) => (
                            <CandidateRow key={c.id} c={c} selected={selected.has(c.id)} onToggle={() => toggleSelect(c.id)} />
                          ))}
                        </div>
                      )}

                      {/* Already tagged to another trip */}
                      {alreadyTaggedElsewhere.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 py-1.5 bg-muted/30 border-t">
                            Tagged to another trip (can reassign)
                          </p>
                          {alreadyTaggedElsewhere.map((c) => (
                            <CandidateRow key={c.id} c={c} selected={selected.has(c.id)} onToggle={() => toggleSelect(c.id)} dimmed />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function CandidateRow({
  c, selected, onToggle, dimmed = false,
}: { c: TxnCandidate; selected: boolean; onToggle: () => void; dimmed?: boolean }) {
  return (
    <div
      onClick={onToggle}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors border-b last:border-0',
        selected ? 'bg-primary/5' : 'hover:bg-accent/40',
        dimmed && 'opacity-60',
      )}
    >
      <div
        className={cn(
          'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
          selected ? 'bg-primary border-primary' : 'border-muted-foreground/40',
        )}
      >
        {selected && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />}
      </div>
      <span className="text-xs text-muted-foreground w-[72px] flex-shrink-0 tabular-nums">{formatDate(c.date)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{c.merchant ?? c.description ?? '—'}</p>
        {c.category && <p className="text-xs text-muted-foreground">{c.category}</p>}
      </div>
      <span className="text-sm font-semibold tabular-nums flex-shrink-0">{formatCurrency(c.amount)}</span>
    </div>
  )
}

// ── Trip card ─────────────────────────────────────────────────────────────────

function TripCard({
  trip, onSelect, onEdit, onDelete,
}: { trip: Trip; onSelect: () => void; onEdit: () => void; onDelete: () => void }) {
  const statusMeta = STATUS_PILL[effectiveStatus(trip)]

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all group"
      onClick={onSelect}
    >
      <CardContent className="py-4 px-5">
        <div className="flex items-center gap-4">
          {/* Icon */}
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Plane className="w-5 h-5 text-primary" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-semibold truncate">{trip.name}</p>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${statusMeta.color}`}>
                {statusMeta.label}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {(trip.start_date || trip.end_date) && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {trip.start_date ? formatDate(trip.start_date) : ''}
                  {trip.start_date && trip.end_date && ' – '}
                  {trip.end_date ? formatDate(trip.end_date) : ''}
                </span>
              )}
              {trip.destination && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {trip.destination}
                </span>
              )}
            </div>
          </div>

          {/* Budget */}
          {trip.budget && (
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-muted-foreground">Budget</p>
              <p className="font-semibold tabular-nums">{formatCurrency(trip.budget)}</p>
            </div>
          )}

          {/* Actions */}
          <div
            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={onEdit} className="p-1.5 rounded hover:bg-accent transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Trips() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null)

  const fetchTrips = async () => {
    try {
      const res = await api.get('/trips')
      setTrips(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTrips() }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this trip?')) return
    await api.delete(`/trips/${id}`)
    fetchTrips()
    if (selectedTrip?.id === id) setSelectedTrip(null)
  }

  const handleEdit = (trip: Trip) => {
    setEditingTrip(trip)
    setFormOpen(true)
    setSelectedTrip(null)
  }

  const STATUS_TABS: { id: StatusFilter; label: string }[] = [
    { id: 'all',       label: 'All' },
    { id: 'active',    label: 'Active' },
    { id: 'planning',  label: 'Planning' },
    { id: 'completed', label: 'Completed' },
  ]

  const filtered = trips.filter((t) =>
    statusFilter === 'all' ? true : effectiveStatus(t) === statusFilter
  )

  // Summary stats
  const activeTrips = trips.filter((t) => effectiveStatus(t) === 'active')
  const totalBudget = activeTrips.reduce((s, t) => s + (t.budget ? Number(t.budget) : 0), 0)

  return (
    <MainLayout>
      <TopBar
        title="Trips"
        subtitle="Track expenses for business trips and travel"
        actions={
          <Button size="sm" onClick={() => { setEditingTrip(null); setFormOpen(true) }}>
            <Plus className="w-4 h-4" /> New Trip
          </Button>
        }
      />

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Trips',          value: trips.length,                 display: String(trips.length),          icon: Plane },
          { label: 'Active Trips',          value: activeTrips.length,           display: String(activeTrips.length),    icon: TrendingUp },
          { label: 'Active Trip Budgets',   value: totalBudget,                  display: formatCurrency(totalBudget),   icon: DollarSign },
        ].map(({ label, display, icon: Icon }, i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                {loading ? <Skeleton className="h-6 w-16" /> : <p className="text-xl font-bold">{display}</p>}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-4 p-1 bg-muted rounded-lg w-fit">
        {STATUS_TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setStatusFilter(id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              statusFilter === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
            {id !== 'all' && (
              <span className="ml-1.5 text-xs opacity-60">{trips.filter((t) => effectiveStatus(t) === id).length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Trip list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="py-4 px-5">
              <div className="flex items-center gap-4">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-56" /></div>
                <Skeleton className="h-5 w-20" />
              </div>
            </CardContent></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-14 text-center gap-3">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Plane className="w-7 h-7 text-primary" />
            </div>
            <div>
              <p className="font-medium">No {statusFilter === 'all' ? '' : statusFilter + ' '}trips</p>
              <p className="text-sm text-muted-foreground mt-1">
                {statusFilter === 'completed'
                  ? 'Completed trips will appear here'
                  : 'Create a trip to start tracking travel expenses'}
              </p>
            </div>
            {statusFilter !== 'completed' && (
              <Button size="sm" variant="outline" onClick={() => { setEditingTrip(null); setFormOpen(true) }}>
                <Plus className="w-4 h-4" /> New Trip
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((trip, i) => (
            <motion.div
              key={trip.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <TripCard
                trip={trip}
                onSelect={() => setSelectedTrip(trip)}
                onEdit={() => handleEdit(trip)}
                onDelete={() => handleDelete(trip.id)}
              />
            </motion.div>
          ))}
        </div>
      )}

      <TripDetailSheet
        trip={selectedTrip}
        onClose={() => setSelectedTrip(null)}
        onEdit={handleEdit}
      />

      <TripFormDialog
        open={formOpen}
        trip={editingTrip}
        onClose={() => { setFormOpen(false); setEditingTrip(null) }}
        onSaved={fetchTrips}
      />
    </MainLayout>
  )
}
