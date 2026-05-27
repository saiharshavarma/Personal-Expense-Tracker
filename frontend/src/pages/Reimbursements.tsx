import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Receipt, Plus, Clock, CheckCircle, DollarSign,
  XCircle, ArrowRight, Layers, Building2, AlertCircle, ChevronDown,
} from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency, formatDate } from '@/lib/utils'
import { api } from '@/utils/apiClient'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PipelineItem {
  id: string
  date: string
  merchant: string | null
  amount: number
  expected_reimbursement: number
  reimbursement_source: string | null
  category: string | null
  days_outstanding: number
}

type ColId = 'to_submit' | 'submitted' | 'approved' | 'paid' | 'rejected'

interface Pipeline {
  to_submit: PipelineItem[]
  submitted: PipelineItem[]
  approved: PipelineItem[]
  paid: PipelineItem[]
  rejected: PipelineItem[]
}

const COLUMNS: { id: ColId; label: string; icon: React.ElementType; color: string; headerColor: string }[] = [
  { id: 'to_submit',  label: 'To Submit',  icon: Clock,         color: 'text-yellow-500', headerColor: 'border-yellow-500/30 bg-yellow-500/5' },
  { id: 'submitted',  label: 'Submitted',  icon: ArrowRight,    color: 'text-blue-500',   headerColor: 'border-blue-500/30 bg-blue-500/5' },
  { id: 'approved',   label: 'Approved',   icon: CheckCircle,   color: 'text-green-500',  headerColor: 'border-green-500/30 bg-green-500/5' },
  { id: 'paid',       label: 'Paid',       icon: DollarSign,    color: 'text-emerald-500',headerColor: 'border-emerald-500/30 bg-emerald-500/5' },
  { id: 'rejected',   label: 'Rejected',   icon: XCircle,       color: 'text-red-500',    headerColor: 'border-red-500/30 bg-red-500/5' },
]

const EMPTY_PIPELINE: Pipeline = {
  to_submit: [], submitted: [], approved: [], paid: [], rejected: [],
}

// ── Drag state (ref-based, no re-renders during drag) ─────────────────────────
let dragId = ''
let dragFromCol: ColId = 'to_submit'

// ── Kanban card ───────────────────────────────────────────────────────────────

function ReimbCard({
  item, col, onDragStart,
}: { item: PipelineItem; col: ColId; onDragStart: (id: string, col: ColId) => void }) {
  const isOld = item.days_outstanding > 30
  return (
    <div
      draggable
      onDragStart={() => onDragStart(item.id, col)}
      className="rounded-lg border bg-card p-3 cursor-grab active:cursor-grabbing hover:border-primary/40 hover:shadow-sm transition-all select-none"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-medium truncate leading-tight">{item.merchant ?? '—'}</p>
        <span className="text-sm font-bold tabular-nums flex-shrink-0">{formatCurrency(item.expected_reimbursement)}</span>
      </div>

      {item.reimbursement_source && (
        <div className="flex items-center gap-1 mb-1.5">
          <Building2 className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground truncate">{item.reimbursement_source}</span>
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        {item.category && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{item.category}</span>
        )}
        <div className={`ml-auto flex items-center gap-1 text-xs ${isOld ? 'text-red-500' : 'text-muted-foreground'}`}>
          {isOld && <AlertCircle className="w-3 h-3" />}
          {item.days_outstanding}d ago
        </div>
      </div>
    </div>
  )
}

// ── Batch dialog ──────────────────────────────────────────────────────────────

function BatchDialog({
  open, toSubmit, onClose, onCreated,
}: {
  open: boolean
  toSubmit: PipelineItem[]
  onClose: () => void
  onCreated: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [source, setSource] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const toggleAll = () => {
    if (selected.size === toSubmit.length) setSelected(new Set())
    else setSelected(new Set(toSubmit.map((i) => i.id)))
  }

  const total = toSubmit.filter((i) => selected.has(i.id)).reduce((s, i) => s + i.expected_reimbursement, 0)

  const handleCreate = async () => {
    if (!source || selected.size === 0) return
    setSubmitting(true)
    try {
      await api.post('/reimbursements/batches', {
        source,
        name: `${source} — ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
        transaction_ids: Array.from(selected),
      })
      onCreated()
      onClose()
      setSelected(new Set())
      setSource('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Reimbursement Batch</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Reimbursement Source</Label>
            <Input
              className="mt-1"
              placeholder="e.g. Acme Corp, Splitwise, Friend"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Select Transactions</Label>
              <button onClick={toggleAll} className="text-xs text-primary hover:underline">
                {selected.size === toSubmit.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1.5 rounded border p-2">
              {toSubmit.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">No items to submit</p>
              )}
              {toSubmit.map((item) => (
                <label key={item.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-accent cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => {
                      const n = new Set(selected)
                      n.has(item.id) ? n.delete(item.id) : n.add(item.id)
                      setSelected(n)
                    }}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="flex-1 text-sm truncate">{item.merchant}</span>
                  <span className="text-sm font-medium">{formatCurrency(item.expected_reimbursement)}</span>
                </label>
              ))}
            </div>
          </div>
          {selected.size > 0 && (
            <div className="flex items-center justify-between text-sm px-1">
              <span className="text-muted-foreground">{selected.size} item{selected.size !== 1 ? 's' : ''} selected</span>
              <span className="font-semibold">{formatCurrency(total)}</span>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!source || selected.size === 0 || submitting}>
              {submitting ? 'Creating…' : 'Create Batch'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const HISTORY_THRESHOLD_DAYS = 90

export function Reimbursements() {
  const [pipeline, setPipeline] = useState<Pipeline>(EMPTY_PIPELINE)
  const [loading, setLoading] = useState(true)
  const [batchOpen, setBatchOpen] = useState(false)
  const [dragOver, setDragOver] = useState<ColId | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const fetchPipeline = async () => {
    try {
      const res = await api.get('/reimbursements/pipeline')
      setPipeline(res.data)
    } catch {
      // fail silently
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPipeline() }, [])

  const handleDragStart = (id: string, col: ColId) => {
    dragId = id
    dragFromCol = col
  }

  const handleDrop = async (toCol: ColId) => {
    setDragOver(null)
    if (!dragId || dragFromCol === toCol) return
    const id = dragId
    const fromCol = dragFromCol
    dragId = ''

    // Optimistic update
    setPipeline((prev) => {
      const item = prev[fromCol].find((i) => i.id === id)
      if (!item) return prev
      return {
        ...prev,
        [fromCol]: prev[fromCol].filter((i) => i.id !== id),
        [toCol]: [item, ...prev[toCol]],
      }
    })

    try {
      await api.put(`/reimbursements/transactions/${id}/status?status=${toCol}`)
    } catch {
      fetchPipeline() // revert on error
    }
  }

  // Split paid/rejected into recent (kanban) and settled history
  const recentPaid = pipeline.paid.filter((i) => i.days_outstanding <= HISTORY_THRESHOLD_DAYS)
  const recentRejected = pipeline.rejected.filter((i) => i.days_outstanding <= HISTORY_THRESHOLD_DAYS)
  const historyItems: (PipelineItem & { settled_as: 'paid' | 'rejected' })[] = [
    ...pipeline.paid.filter((i) => i.days_outstanding > HISTORY_THRESHOLD_DAYS).map((i) => ({ ...i, settled_as: 'paid' as const })),
    ...pipeline.rejected.filter((i) => i.days_outstanding > HISTORY_THRESHOLD_DAYS).map((i) => ({ ...i, settled_as: 'rejected' as const })),
  ].sort((a, b) => b.days_outstanding - a.days_outstanding)

  const activePipeline: Pipeline = { ...pipeline, paid: recentPaid, rejected: recentRejected }

  // Summary computed from pipeline
  const pendingAmt = [...pipeline.to_submit].reduce((s, i) => s + i.expected_reimbursement, 0)
  const submittedAmt = pipeline.submitted.reduce((s, i) => s + i.expected_reimbursement, 0)
  const approvedAmt = pipeline.approved.reduce((s, i) => s + i.expected_reimbursement, 0)
  const paidAmt = pipeline.paid.reduce((s, i) => s + i.expected_reimbursement, 0)

  const SUMMARY = [
    { label: 'To Submit',  amount: pendingAmt,   count: pipeline.to_submit.length,  color: 'text-yellow-500' },
    { label: 'Submitted',  amount: submittedAmt,  count: pipeline.submitted.length,  color: 'text-blue-500' },
    { label: 'Approved',   amount: approvedAmt,   count: pipeline.approved.length,   color: 'text-green-500' },
    { label: 'Received',   amount: paidAmt,       count: pipeline.paid.length,       color: 'text-emerald-500' },
  ]

  return (
    <MainLayout>
      <TopBar
        title="Reimbursements"
        subtitle="Track what you're owed — from work, friends, and shared expenses"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setBatchOpen(true)}>
              <Layers className="w-4 h-4" /> Create Batch
            </Button>
            <Button size="sm" onClick={() => window.location.href = '/transactions?is_reimbursable=true'}>
              <Plus className="w-4 h-4" /> Mark Reimbursable
            </Button>
          </>
        }
      />

      {/* Summary row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {SUMMARY.map(({ label, amount, count, color }, i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                {loading
                  ? <Skeleton className="h-6 w-24" />
                  : <p className={`text-xl font-bold ${color}`}>{formatCurrency(amount)}</p>
                }
                <p className="text-xs text-muted-foreground mt-0.5">
                  {loading ? <Skeleton className="h-3 w-12 mt-1" /> : `${count} item${count !== 1 ? 's' : ''}`}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Kanban board */}
      <div className="grid grid-cols-5 gap-3">
        {COLUMNS.map(({ id, label, icon: Icon, color, headerColor }, ci) => {
          const items = activePipeline[id]
          const isDragTarget = dragOver === id
          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: ci * 0.06 }}
              className="flex flex-col"
              onDragOver={(e) => { e.preventDefault(); setDragOver(id) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => handleDrop(id)}
            >
              {/* Column header */}
              <div className={`flex items-center gap-2 px-2 py-1.5 rounded-t-lg border border-b-0 ${headerColor}`}>
                <Icon className={`w-3.5 h-3.5 ${color}`} />
                <span className="text-xs font-semibold">{label}</span>
                <span className={`ml-auto text-xs font-bold ${color}`}>{loading ? '…' : items.length}</span>
              </div>

              {/* Column body */}
              <div
                className={`flex-1 rounded-b-lg border bg-muted/20 min-h-[420px] p-2 space-y-2 transition-colors ${
                  isDragTarget ? 'bg-primary/5 border-primary/40' : ''
                }`}
              >
                {loading
                  ? Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="rounded-lg border bg-card p-3 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <div className="flex justify-between"><Skeleton className="h-4 w-16 rounded" /><Skeleton className="h-3 w-10" /></div>
                      </div>
                    ))
                  : items.map((item) => (
                      <ReimbCard key={item.id} item={item} col={id} onDragStart={handleDragStart} />
                    ))
                }
                {!loading && items.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-center opacity-40">
                    <Receipt className="w-5 h-5 text-muted-foreground mb-1.5" />
                    <p className="text-xs text-muted-foreground">Drop here</p>
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Settled History */}
      {historyItems.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setHistoryOpen((o) => !o)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-2 group"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
            Settled History
            <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded-full">{historyItems.length}</span>
            <span className="text-xs text-muted-foreground/60 ml-1">({HISTORY_THRESHOLD_DAYS}+ days ago)</span>
          </button>
          <AnimatePresence>
            {historyOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-lg border bg-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Date</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Merchant</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Source</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Category</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Amount</th>
                        <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {historyItems.map((item) => (
                        <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2 text-muted-foreground tabular-nums">{formatDate(item.date)}</td>
                          <td className="px-3 py-2 font-medium">{item.merchant ?? '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground">{item.reimbursement_source ?? '—'}</td>
                          <td className="px-3 py-2">
                            {item.category && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{item.category}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCurrency(item.expected_reimbursement)}</td>
                          <td className="px-3 py-2 text-center">
                            {item.settled_as === 'paid'
                              ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium"><DollarSign className="w-3 h-3" />Paid</span>
                              : <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium"><XCircle className="w-3 h-3" />Rejected</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <BatchDialog
        open={batchOpen}
        toSubmit={pipeline.to_submit}
        onClose={() => setBatchOpen(false)}
        onCreated={fetchPipeline}
      />
    </MainLayout>
  )
}
