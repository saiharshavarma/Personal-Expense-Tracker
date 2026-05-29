import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, FileText, Table2, Building2, CheckCircle2, Clock,
  AlertCircle, Loader2, X, ChevronDown, Check, ArrowLeftRight,
  SkipForward, DollarSign, RefreshCw, Tag,
} from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api, getAuthErrorMessage } from '@/utils/apiClient'
import type { Account, ImportBatch } from '@/types'
import { ALL_CATEGORIES, getSubcategories } from '@/lib/categories'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StagingTransaction {
  temp_id: string
  date: string
  description: string
  amount: number
  direction: 'debit' | 'credit'
  // AI suggestions
  ai_category: string | null
  ai_subcategory: string | null
  ai_confidence: number | null
  ai_flags: string[]
  merchant: string | null
  need_want_savings: string | null
  fixed_variable: string | null
  is_reimbursable: boolean
  /** Others' share — set on partial splits/reimbursements (friends, company, etc.).
   *  null = whole amount is reimbursable; >0 = others owe this much back. */
  expected_reimbursement: number | null
  is_recurring: boolean
  tags: string[]
  // User-editable fields (initialised from AI suggestions)
  category: string | null
  subcategory: string | null
  skip: boolean
}

interface StagingResult {
  institution: string
  filename: string
  total: number
  transactions: StagingTransaction[]
}

interface CommitResult {
  batch_id: string
  institution: string
  imported: number
  duplicates: number
}

interface FileEntry {
  file: File
  id: string
  account_id: string
  status: 'pending' | 'uploading' | 'staging' | 'committing' | 'done' | 'error'
  error?: string
  stagingResult?: StagingResult
  /** Mutable working copy of transactions — user edits applied here */
  stagedTxns?: StagingTransaction[]
  commitResult?: CommitResult
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function uid() { return Math.random().toString(36).slice(2) }

function fmtAmount(amount: number, direction: 'debit' | 'credit') {
  const sign = direction === 'credit' ? '+' : '−'
  return `${sign}$${Math.abs(amount).toFixed(2)}`
}

function confColor(conf: number | null) {
  if (conf === null) return 'text-muted-foreground'
  if (conf >= 0.90) return 'text-green-500'
  if (conf >= 0.75) return 'text-yellow-500'
  return 'text-red-500'
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'outline' | 'default' }> = {
    staged:   { label: 'Staged',   variant: 'secondary' },
    complete: { label: 'Complete', variant: 'success'   },
  }
  const cfg = map[status] ?? { label: status, variant: 'outline' as const }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

// ── Split-mode type + date helper ────────────────────────────────────────────

type SplitMode = 'full' | 'shares' | 'custom'

function fmtDateShort(iso: string) {
  try {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return iso }
}

// ── EditPanel ─────────────────────────────────────────────────────────────────

interface EditPanelProps {
  txn: StagingTransaction
  splitMode: SplitMode
  setSplitMode: (m: SplitMode) => void
  totalShares: number
  setTotalShares: (n: number) => void
  onUpdate: (tempId: string, changes: Partial<StagingTransaction>) => void
}

function EditPanel({ txn, splitMode, setSplitMode, totalShares, setTotalShares, onUpdate }: EditPanelProps) {
  const othersShare: number | null =
    splitMode === 'full'   ? null
    : splitMode === 'shares' ? Math.round((totalShares - 1) / totalShares * txn.amount * 100) / 100
    : txn.expected_reimbursement

  const yourNetCost =
    !txn.is_reimbursable          ? txn.amount
    : splitMode === 'full'        ? 0
    : othersShare !== null        ? txn.amount - othersShare
    : txn.amount

  return (
    <div className="p-4 space-y-4 text-sm">
      {/* Transaction header */}
      <div className="border-b pb-3 space-y-0.5">
        <p className="font-semibold leading-snug">{txn.description}</p>
        {txn.merchant && txn.merchant !== txn.description && (
          <p className="text-xs text-muted-foreground">{txn.merchant}</p>
        )}
        <p className="text-xs text-muted-foreground">{txn.date}</p>
      </div>

      {/* Direction + Amount */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onUpdate(txn.temp_id, {
            direction: txn.direction === 'debit' ? 'credit' : 'debit',
          })}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            txn.direction === 'debit'
              ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
              : 'bg-green-500/10 text-green-600 hover:bg-green-500/20'
          }`}
          title="Click to flip direction"
        >
          <ArrowLeftRight className="w-3 h-3" />
          {txn.direction}
        </button>
        <span className={`text-xl font-bold tabular-nums ${txn.direction === 'credit' ? 'text-green-500' : ''}`}>
          {fmtAmount(txn.amount, txn.direction)}
        </span>
      </div>

      {/* AI info */}
      {(txn.ai_confidence !== null || txn.ai_flags.length > 0) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-2.5 py-1.5">
          <span>AI:</span>
          {txn.ai_confidence !== null && (
            <span className={`font-medium ${confColor(txn.ai_confidence)}`}>
              {Math.round(txn.ai_confidence * 100)}% confident
            </span>
          )}
          {txn.ai_flags.map(f => (
            <span key={f} className="text-amber-500 truncate" title={f}>⚠ {f}</span>
          ))}
        </div>
      )}

      {/* Category */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</label>
        <select
          value={txn.category ?? ''}
          onChange={e => onUpdate(txn.temp_id, { category: e.target.value || null, subcategory: null })}
          className="w-full h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">— Uncategorized —</option>
          {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Subcategory */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Subcategory</label>
        <select
          value={txn.subcategory ?? ''}
          disabled={!txn.category}
          onChange={e => onUpdate(txn.temp_id, { subcategory: e.target.value || null })}
          className="w-full h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <option value="">— No subcategory —</option>
          {(txn.category ? getSubcategories(txn.category) : []).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Reimbursable / Split — only meaningful on debits */}
      {txn.direction === 'debit' && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reimbursable / Split</label>
          <div className={`rounded-lg border p-3 space-y-3 transition-colors ${
            txn.is_reimbursable ? 'border-amber-400/40 bg-amber-500/5' : 'border-input'
          }`}>
            {/* Toggle */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`reimb-${txn.temp_id}`}
                checked={txn.is_reimbursable}
                onChange={e => {
                  onUpdate(txn.temp_id, {
                    is_reimbursable: e.target.checked,
                    expected_reimbursement: null,
                  })
                  setSplitMode('full')
                }}
                className="w-4 h-4 accent-amber-500"
              />
              <label htmlFor={`reimb-${txn.temp_id}`} className="text-sm font-medium cursor-pointer">
                Will be reimbursed
              </label>
            </div>

            {txn.is_reimbursable && (
              <div className="space-y-2.5 pl-6">
                {/* Mode: Full reimbursement */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`split-${txn.temp_id}`}
                    checked={splitMode === 'full'}
                    onChange={() => {
                      setSplitMode('full')
                      onUpdate(txn.temp_id, { expected_reimbursement: null })
                    }}
                    className="accent-amber-500"
                  />
                  <span className="text-sm">Full — all ${txn.amount.toFixed(2)} back</span>
                </label>

                {/* Mode: N People (equal split) */}
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`split-${txn.temp_id}`}
                    checked={splitMode === 'shares'}
                    onChange={() => {
                      setSplitMode('shares')
                      const er = Math.round((totalShares - 1) / totalShares * txn.amount * 100) / 100
                      onUpdate(txn.temp_id, { expected_reimbursement: er })
                    }}
                    className="accent-amber-500 mt-0.5"
                  />
                  <div className="space-y-1">
                    <span className="text-sm">Equal split among</span>
                    {splitMode === 'shares' && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={2}
                          max={20}
                          value={totalShares}
                          onChange={e => {
                            const n = Math.max(2, Math.min(20, parseInt(e.target.value) || 2))
                            setTotalShares(n)
                            const er = Math.round((n - 1) / n * txn.amount * 100) / 100
                            onUpdate(txn.temp_id, { expected_reimbursement: er })
                          }}
                          className="w-14 h-7 rounded border border-amber-400/60 bg-background px-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-amber-400"
                        />
                        <span className="text-sm text-muted-foreground">people</span>
                      </div>
                    )}
                    {splitMode === 'shares' && (
                      <p className="text-xs text-muted-foreground">
                        Each pays ${(txn.amount / totalShares).toFixed(2)} · others owe ${othersShare?.toFixed(2)}
                      </p>
                    )}
                  </div>
                </label>

                {/* Mode: Custom dollar amount */}
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`split-${txn.temp_id}`}
                    checked={splitMode === 'custom'}
                    onChange={() => setSplitMode('custom')}
                    className="accent-amber-500 mt-0.5"
                  />
                  <div className="space-y-1">
                    <span className="text-sm">Custom — others owe exactly</span>
                    {splitMode === 'custom' && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-muted-foreground">$</span>
                        <input
                          type="number"
                          min={0}
                          max={txn.amount}
                          step={0.01}
                          placeholder="0.00"
                          value={txn.expected_reimbursement ?? ''}
                          onChange={e => {
                            const val = e.target.value === '' ? null : parseFloat(e.target.value)
                            onUpdate(txn.temp_id, { expected_reimbursement: val })
                          }}
                          className="w-24 h-7 rounded border border-amber-400/60 bg-background px-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-amber-400 tabular-nums"
                        />
                      </div>
                    )}
                  </div>
                </label>

                {/* Net cost summary */}
                <div className="border-t border-amber-400/20 pt-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Your net cost</span>
                  <span className="font-semibold text-amber-600">${yourNetCost.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Skip / Include */}
      <div className="flex items-center justify-between pt-1 border-t">
        <span className="text-xs text-muted-foreground">
          {txn.skip ? 'Excluded from import' : 'Will be imported'}
        </span>
        <button
          onClick={() => onUpdate(txn.temp_id, { skip: !txn.skip })}
          className={`h-7 px-3 rounded-md text-xs font-medium transition-colors ${
            txn.skip
              ? 'bg-primary/10 text-primary hover:bg-primary/20'
              : 'bg-destructive/10 text-destructive hover:bg-destructive/20'
          }`}
        >
          {txn.skip ? <><RefreshCw className="w-3 h-3 inline mr-1" />Include</> : <><X className="w-3 h-3 inline mr-1" />Skip</>}
        </button>
      </div>
    </div>
  )
}

// ── Staging Review ────────────────────────────────────────────────────────────

interface StagingReviewProps {
  result: StagingResult
  stagedTxns: StagingTransaction[]
  onUpdate: (tempId: string, changes: Partial<StagingTransaction>) => void
  onCommit: () => void
  committing: boolean
}

function StagingReview({ result, stagedTxns, onUpdate, onCommit, committing }: StagingReviewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(stagedTxns[0]?.temp_id ?? null)
  const [splitMode, setSplitMode] = useState<SplitMode>('full')
  const [totalShares, setTotalShares] = useState(2)

  const selected = stagedTxns.find(t => t.temp_id === selectedId) ?? null
  const included = stagedTxns.filter(t => !t.skip)
  const skipped  = stagedTxns.filter(t => t.skip)

  // Sync split mode when the selected transaction changes
  useEffect(() => {
    if (!selected?.is_reimbursable || selected.expected_reimbursement === null) {
      setSplitMode('full')
      return
    }
    const er = selected.expected_reimbursement
    const amt = selected.amount
    // Detect if it was set via an N-shares calculation: er = (n-1)/n * amt
    const n = Math.round(amt / (amt - er))
    if (n >= 2 && n <= 20 && Math.abs((n - 1) / n * amt - er) < 0.02) {
      setSplitMode('shares')
      setTotalShares(n)
    } else {
      setSplitMode('custom')
    }
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const flipAll = () =>
    stagedTxns.forEach(t => {
      if (!t.skip) onUpdate(t.temp_id, { direction: t.direction === 'debit' ? 'credit' : 'debit' })
    })
  const skipAll    = () => stagedTxns.forEach(t => onUpdate(t.temp_id, { skip: true }))
  const includeAll = () => stagedTxns.forEach(t => onUpdate(t.temp_id, { skip: false }))

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div>
          <span className="text-sm font-semibold">{included.length}</span>
          <span className="text-sm text-muted-foreground"> to import</span>
          {skipped.length > 0 && (
            <span className="text-sm text-muted-foreground">, {skipped.length} skipped</span>
          )}
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={flipAll}
          title="Flip all debit ↔ credit (useful when the whole statement parsed with the wrong sign)">
          <ArrowLeftRight className="w-3.5 h-3.5" /> Flip All Directions
        </Button>
        {skipped.length > 0
          ? <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={includeAll}>
              <RefreshCw className="w-3.5 h-3.5" /> Include All
            </Button>
          : <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={skipAll}>
              <SkipForward className="w-3.5 h-3.5" /> Skip All
            </Button>
        }
      </div>

      {/* Two-panel layout: list + edit panel */}
      <div className="flex rounded-lg border overflow-hidden" style={{ height: 540 }}>

        {/* LEFT — scrollable transaction list */}
        <div className="flex-1 overflow-y-auto min-w-0 divide-y">
          {stagedTxns.map((txn, idx) => {
            const isSelected = txn.temp_id === selectedId
            const hasNet = txn.is_reimbursable && txn.expected_reimbursement !== null
            return (
              <div
                key={txn.temp_id}
                onClick={() => setSelectedId(txn.temp_id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-primary/10 border-l-2 border-primary'
                    : 'hover:bg-muted/40 border-l-2 border-transparent'
                } ${txn.skip ? 'opacity-40' : ''}`}
              >
                {/* Index */}
                <span className="text-xs text-muted-foreground/40 w-5 shrink-0 tabular-nums text-right">
                  {idx + 1}
                </span>

                {/* Date */}
                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 w-12">
                  {fmtDateShort(txn.date)}
                </span>

                {/* Description + merchant */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate leading-tight">{txn.description}</p>
                  {txn.merchant && txn.merchant !== txn.description && (
                    <p className="text-xs text-muted-foreground truncate">{txn.merchant}</p>
                  )}
                </div>

                {/* Category pill */}
                {txn.category && (
                  <span className="hidden md:block text-xs text-muted-foreground/70 shrink-0 max-w-[80px] truncate">
                    {txn.category}
                  </span>
                )}

                {/* Amount */}
                <div className="text-right shrink-0">
                  <p className={`text-sm font-medium tabular-nums whitespace-nowrap ${
                    txn.direction === 'credit' ? 'text-green-500' : ''
                  }`}>
                    {fmtAmount(txn.amount, txn.direction)}
                  </p>
                  {hasNet && (
                    <p className="text-xs text-amber-500 tabular-nums">
                      net ${(txn.amount - txn.expected_reimbursement!).toFixed(2)}
                    </p>
                  )}
                  {txn.is_reimbursable && !hasNet && (
                    <p className="text-xs text-amber-500">reimb.</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* RIGHT — edit panel */}
        <div className="w-72 shrink-0 border-l overflow-y-auto bg-muted/20">
          {selected ? (
            <EditPanel
              txn={selected}
              splitMode={splitMode}
              setSplitMode={setSplitMode}
              totalShares={totalShares}
              setTotalShares={setTotalShares}
              onUpdate={onUpdate}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-6 text-center">
              <Tag className="w-8 h-8 opacity-30" />
              <p className="text-sm">Select a transaction to review and edit its details</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer hint */}
      <p className="text-xs text-muted-foreground">
        Detected: <span className="font-medium text-foreground">{result.institution}</span>
        {' · '}AI pre-filled categories &amp; merchants — click any row to review or correct
        {' · '}Use Reimbursable section for Splitwise-style expenses
      </p>

      {/* Commit */}
      <Button
        onClick={onCommit}
        disabled={committing || included.length === 0}
        className="w-full gap-2"
      >
        {committing
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving to database…</>
          : <><CheckCircle2 className="w-4 h-4" /> Commit {included.length} transaction{included.length !== 1 ? 's' : ''}</>
        }
      </Button>
    </div>
  )
}

// ── Upload Tab ────────────────────────────────────────────────────────────────

function UploadTab() {
  const [dragOver, setDragOver] = useState(false)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [history, setHistory] = useState<ImportBatch[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const r = await api.get<ImportBatch[]>('/import/history')
      setHistory(r.data)
    } catch {
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    api.get<Account[]>('/accounts').then(r => setAccounts(r.data)).catch(() => {})
    fetchHistory()
  }, [fetchHistory])

  const addFiles = useCallback((incoming: File[]) => {
    const newEntries: FileEntry[] = incoming
      .filter(f => f.name.endsWith('.pdf') || f.name.endsWith('.csv'))
      .map(f => ({ file: f, id: uid(), account_id: '', status: 'pending' }))
    setFiles(prev => [...prev, ...newEntries])
  }, [])

  const removeFile = (id: string) => setFiles(prev => prev.filter(e => e.id !== id))

  const setFileField = <K extends keyof FileEntry>(id: string, field: K, value: FileEntry[K]) => {
    setFiles(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  /** Phase 1: parse + AI categorise (no DB write) */
  const handleUploadAll = async () => {
    const pending = files.filter(e => e.status === 'pending')
    for (const entry of pending) {
      setFileField(entry.id, 'status', 'uploading')
      try {
        const fd = new FormData()
        fd.append('file', entry.file)
        if (entry.account_id) fd.append('account_id', entry.account_id)
        const r = await api.post<StagingResult>('/import/parse-preview', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
        })
        setFiles(prev => prev.map(e =>
          e.id === entry.id
            ? {
                ...e,
                status: 'staging',
                stagingResult: r.data,
                // Initialise the working copy from what the API returned
                stagedTxns: r.data.transactions.map(t => ({ ...t })),
              }
            : e
        ))
      } catch (err: unknown) {
        const message = getAuthErrorMessage(err)
        setFiles(prev => prev.map(e =>
          e.id === entry.id
            ? { ...e, status: 'error', error: message.includes('timeout') ? 'Parsing took too long. Try again, or use a CSV export for this statement.' : message }
            : e
        ))
      }
    }
  }

  /** Update a single staged transaction (category, direction, skip, etc.) */
  const handleUpdateTxn = (fileId: string, tempId: string, changes: Partial<StagingTransaction>) => {
    setFiles(prev => prev.map(entry => {
      if (entry.id !== fileId || !entry.stagedTxns) return entry
      return {
        ...entry,
        stagedTxns: entry.stagedTxns.map(t =>
          t.temp_id === tempId ? { ...t, ...changes } : t
        ),
      }
    }))
  }

  /** Phase 2: commit reviewed transactions to the DB */
  const handleCommit = async (entry: FileEntry) => {
    if (!entry.stagingResult || !entry.stagedTxns) return
    setFileField(entry.id, 'status', 'committing')
    try {
      const r = await api.post<CommitResult>('/import/commit', {
        filename: entry.stagingResult.filename,
        institution: entry.stagingResult.institution,
        account_id: entry.account_id || null,
        transactions: entry.stagedTxns,
      })
      setFiles(prev => prev.map(e =>
        e.id === entry.id ? { ...e, status: 'done', commitResult: r.data } : e
      ))
      fetchHistory()
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { detail?: string } } }
      setFiles(prev => prev.map(e =>
        e.id === entry.id
          ? { ...e, status: 'error', error: e2?.response?.data?.detail ?? 'Commit failed' }
          : e
      ))
    }
  }

  const hasPending = files.some(e => e.status === 'pending')

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="w-4 h-4 text-primary" /> Upload Statements
          </CardTitle>
          <CardDescription>
            Drop PDF bank statements or CSV files — transactions are staged for your review before anything is saved
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <motion.div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            animate={{ borderColor: dragOver ? 'hsl(var(--primary))' : 'hsl(var(--border))' }}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.csv"
              multiple
              className="hidden"
              onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }}
            />
            <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">Drop PDF statements or CSV files here</p>
            <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
            <p className="text-xs text-muted-foreground mt-2">
              Chase · BofA · Amex · Apple Pay · ICICI · HDFC · and more
            </p>
          </motion.div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {files.map(entry => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border rounded-lg p-3 space-y-3"
                  >
                    {/* File header row */}
                    <div className="flex items-center gap-3">
                      {entry.file.name.endsWith('.csv')
                        ? <Table2 className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                        : <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{entry.file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(entry.file.size)}
                          {entry.stagingResult && ` · ${entry.stagingResult.institution}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {entry.status === 'uploading' || entry.status === 'committing'
                          ? <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          : entry.status === 'done'
                          ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                          : entry.status === 'error'
                          ? <AlertCircle className="w-4 h-4 text-destructive" />
                          : entry.status === 'staging'
                          ? <Tag className="w-4 h-4 text-amber-500" />
                          : <CheckCircle2 className="w-4 h-4 text-muted-foreground/40" />
                        }
                        {entry.status !== 'done' && (
                          <button onClick={() => removeFile(entry.id)} className="text-muted-foreground hover:text-foreground">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Account selector — show until committed */}
                    {(entry.status === 'pending' || entry.status === 'staging') && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-24 flex-shrink-0">Account:</span>
                        <select
                          value={entry.account_id}
                          onChange={e => setFileField(entry.id, 'account_id', e.target.value)}
                          className="flex-1 h-8 rounded-md border border-input bg-transparent px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="">Auto-detect</option>
                          {accounts.map(a => (
                            <option key={a.id} value={a.id}>
                              {a.name}{a.last_four ? ` ••••${a.last_four}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Uploading status */}
                    {entry.status === 'uploading' && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Parsing & categorising — this may take a moment…
                      </p>
                    )}

                    {/* Error */}
                    {entry.status === 'error' && entry.error && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {entry.error}
                      </p>
                    )}

                    {/* Staging review */}
                    {entry.status === 'staging' && entry.stagingResult && entry.stagedTxns && (
                      <StagingReview
                        result={entry.stagingResult}
                        stagedTxns={entry.stagedTxns}
                        onUpdate={(tempId, changes) => handleUpdateTxn(entry.id, tempId, changes)}
                        onCommit={() => handleCommit(entry)}
                        committing={false}
                      />
                    )}

                    {/* Committing */}
                    {entry.status === 'committing' && entry.stagingResult && entry.stagedTxns && (
                      <StagingReview
                        result={entry.stagingResult}
                        stagedTxns={entry.stagedTxns}
                        onUpdate={() => {}}
                        onCommit={() => {}}
                        committing={true}
                      />
                    )}

                    {/* Done */}
                    {entry.status === 'done' && entry.commitResult && (
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 text-green-500">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {entry.commitResult.imported} imported
                        </span>
                        {entry.commitResult.duplicates > 0 && (
                          <span>{entry.commitResult.duplicates} duplicates skipped</span>
                        )}
                        <span>{entry.commitResult.institution}</span>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {hasPending && (
                <Button onClick={handleUploadAll} className="w-full">
                  <Upload className="w-4 h-4" />
                  Parse & Stage {files.filter(e => e.status === 'pending').length} file(s)
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" /> Import History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No imports yet. Your import history will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Date</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Filename</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Institution</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide text-right">Imported</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide text-right">Duplicates</th>
                    <th className="pb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map(batch => (
                    <tr key={batch.id} className="hover:bg-muted/30">
                      <td className="py-2.5 pr-4 text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(batch.imported_at).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 pr-4 max-w-[180px] truncate">{batch.filename ?? '—'}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{batch.institution ?? '—'}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{batch.imported_transactions}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">{batch.skipped_duplicates}</td>
                      <td className="py-2.5"><StatusBadge status={batch.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Review Queue Tab ──────────────────────────────────────────────────────────

type ReviewAction = 'accept' | 'edit' | 'reject'

interface QueueTransaction {
  id: string
  description: string
  amount: number
  date: string
  direction: 'debit' | 'credit'
  ai_category: string | null
  ai_subcategory: string | null
  ai_confidence: number | null
  ai_flags: string[]
  category: string | null
  subcategory: string | null
  merchant: string | null
  need_want_savings: string | null
  fixed_variable: string | null
  personal_work_shared: string | null
  is_reimbursable: boolean
  is_recurring: boolean
  tags: string[]
  batch_id: string | null
}

interface ReviewRow extends QueueTransaction {
  localAction?: ReviewAction
  editedCategory?: string
}

function ReviewQueueTab() {
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState<Set<string>>(new Set())

  const fetchQueue = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await api.get<QueueTransaction[]>('/import/review-queue')
      setRows(r.data.map(tx => ({ ...tx })))
    } catch {
      setError('Failed to load review queue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchQueue() }, [])

  const applyAction = async (id: string, action: ReviewAction, category?: string) => {
    setSaving(prev => new Set(prev).add(id))
    try {
      await api.post(`/import/review-queue/${id}`, { action, category })
      setRows(prev => prev.map(r =>
        r.id === id ? { ...r, localAction: action, editedCategory: category ?? r.editedCategory } : r
      ))
    } catch {
      // silently fail — row stays actionable
    } finally {
      setSaving(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const handleAcceptAllClean = async () => {
    const cleanIds = rows
      .filter(r => (r.ai_confidence ?? 0) >= 0.90 && !r.localAction)
      .map(r => r.id)
    for (const id of cleanIds) {
      await applyAction(id, 'accept')
    }
  }

  const low    = rows.filter(r => (r.ai_confidence ?? 0) < 0.75)
  const medium = rows.filter(r => { const c = r.ai_confidence ?? 0; return c >= 0.75 && c < 0.90 })
  const clean  = rows.filter(r => (r.ai_confidence ?? 0) >= 0.90)
  const pendingClean = clean.filter(r => !r.localAction).length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-10 gap-3">
          <AlertCircle className="w-8 h-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button size="sm" variant="outline" onClick={fetchQueue}>Retry</Button>
        </CardContent>
      </Card>
    )
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-12 gap-2">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
          <p className="font-medium">Review queue is empty</p>
          <p className="text-sm text-muted-foreground">All imported transactions have been reviewed.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {pendingClean > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3">
          <p className="text-sm text-green-600 dark:text-green-400">
            {pendingClean} high-confidence transactions ready to accept
          </p>
          <Button size="sm" onClick={handleAcceptAllClean} className="bg-green-600 hover:bg-green-700 text-white">
            <Check className="w-3.5 h-3.5" />
            Accept All Clean
          </Button>
        </div>
      )}

      {low.length > 0 && (
        <ReviewSection
          title="Low Confidence" emoji="🔴" subtitle="< 75% confidence — requires manual review"
          rows={low} saving={saving} editingId={editingId} setEditingId={setEditingId} onAction={applyAction}
        />
      )}
      {medium.length > 0 && (
        <ReviewSection
          title="Needs Review" emoji="🟡" subtitle="75–89% confidence"
          rows={medium} saving={saving} editingId={editingId} setEditingId={setEditingId} onAction={applyAction}
        />
      )}
      {clean.length > 0 && (
        <ReviewSection
          title="Clean" emoji="✅" subtitle="≥ 90% confidence"
          rows={clean} saving={saving} editingId={editingId} setEditingId={setEditingId} onAction={applyAction}
        />
      )}
    </div>
  )
}

interface ReviewSectionProps {
  title: string; emoji: string; subtitle: string
  rows: ReviewRow[]; saving: Set<string>
  editingId: string | null; setEditingId: (id: string | null) => void
  onAction: (id: string, action: ReviewAction, category?: string) => void
}

function ReviewSection({ title, emoji, subtitle, rows, saving, editingId, setEditingId, onAction }: ReviewSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [editCategories, setEditCategories] = useState<Record<string, string>>({})

  return (
    <Card>
      <CardHeader className="pb-2">
        <button className="flex items-center justify-between w-full text-left" onClick={() => setCollapsed(v => !v)}>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <span>{emoji}</span> {title}
            <span className="font-normal text-muted-foreground">({rows.length})</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{subtitle}</span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${collapsed ? '-rotate-90' : ''}`} />
          </div>
        </button>
      </CardHeader>

      {!collapsed && (
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 pr-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Date</th>
                  <th className="pb-2 pr-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Description</th>
                  <th className="pb-2 pr-3 font-medium text-muted-foreground text-xs uppercase tracking-wide text-right">Amount</th>
                  <th className="pb-2 pr-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">AI Category</th>
                  <th className="pb-2 pr-3 font-medium text-muted-foreground text-xs uppercase tracking-wide text-right">Confidence</th>
                  <th className="pb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(row => {
                  const isSaving = saving.has(row.id)
                  const isEditing = editingId === row.id
                  const done = Boolean(row.localAction)
                  const conf = row.ai_confidence ?? 0
                  const cColor = conf < 0.75 ? 'text-red-500' : conf < 0.90 ? 'text-yellow-500' : 'text-green-500'

                  return (
                    <tr key={row.id} className={`hover:bg-muted/30 ${done ? 'opacity-50' : ''}`}>
                      <td className="py-2.5 pr-3 text-muted-foreground text-xs whitespace-nowrap">{row.date}</td>
                      <td className="py-2.5 pr-3 max-w-[200px] truncate">{row.description}</td>
                      <td className={`py-2.5 pr-3 text-right tabular-nums font-medium whitespace-nowrap ${row.direction === 'credit' ? 'text-green-500' : ''}`}>
                        {fmtAmount(row.amount, row.direction)}
                      </td>
                      <td className="py-2.5 pr-3">
                        {isEditing ? (
                          <select
                            value={editCategories[row.id] ?? row.ai_category ?? ''}
                            onChange={e => setEditCategories(prev => ({ ...prev, [row.id]: e.target.value }))}
                            className="h-7 rounded border border-input bg-transparent px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                            autoFocus
                          >
                            <option value="">Uncategorized</option>
                            {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        ) : (
                          <span className="text-muted-foreground">
                            {row.editedCategory ?? row.ai_category ?? 'Uncategorized'}
                          </span>
                        )}
                      </td>
                      <td className={`py-2.5 pr-3 text-right text-xs font-medium tabular-nums ${cColor}`}>
                        {(conf * 100).toFixed(0)}%
                      </td>
                      <td className="py-2.5">
                        {done ? (
                          <span className="text-xs text-muted-foreground capitalize">{row.localAction}</span>
                        ) : isSaving ? (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        ) : isEditing ? (
                          <div className="flex items-center gap-1">
                            <Button size="sm" className="h-6 text-xs px-2"
                              onClick={() => { onAction(row.id, 'edit', editCategories[row.id] ?? row.ai_category ?? undefined); setEditingId(null) }}>
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingId(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="outline"
                              className="h-6 text-xs px-2 text-green-600 border-green-500/30 hover:bg-green-500/10"
                              onClick={() => onAction(row.id, 'accept')}>
                              Accept
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                              onClick={() => setEditingId(row.id)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="outline"
                              className="h-6 text-xs px-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => onAction(row.id, 'reject')}>
                              Rej
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

const SUPPORTED_BANKS = [
  { name: 'Chase',                type: 'PDF + CSV', status: 'supported' },
  { name: 'Bank of America',      type: 'PDF + CSV', status: 'supported' },
  { name: 'American Express',     type: 'PDF + CSV', status: 'supported' },
  { name: 'ICICI Bank',           type: 'PDF + CSV', status: 'supported' },
  { name: 'HDFC Bank',            type: 'PDF + CSV', status: 'supported' },
  { name: 'Apple Pay',            type: 'CSV',       status: 'supported' },
  { name: 'Other Banks',          type: 'PDF + CSV', status: 'generic'   },
]

const HOW_IT_WORKS = [
  { step: 1, title: 'Upload statement',     desc: 'Drop your PDF bank statement or CSV export' },
  { step: 2, title: 'Parse & categorise',   desc: 'Bank is auto-detected; AI categorises each transaction' },
  { step: 3, title: 'Review & edit',        desc: 'Fix directions, categories, mark reimbursables — nothing saved yet' },
  { step: 4, title: 'Commit',               desc: 'Click "Commit" and transactions are written to the database' },
]

// ── Main page ─────────────────────────────────────────────────────────────────

type ImportTab = 'upload' | 'review'

export function Import() {
  const [activeTab, setActiveTab] = useState<ImportTab>('upload')

  return (
    <MainLayout>
      <TopBar
        title="Import Statements"
        subtitle="Parse, review, and commit — nothing is saved until you confirm"
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex gap-1 border-b pb-0">
            {([
              { id: 'upload' as ImportTab, label: 'Upload' },
              { id: 'review' as ImportTab, label: 'Review Queue' },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === 'upload' ? <UploadTab /> : <ReviewQueueTab />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="w-4 h-4" /> Supported Institutions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {SUPPORTED_BANKS.map(({ name, type, status }) => (
                <div key={name} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    {status === 'supported'
                      ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      : <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />}
                    <span className="text-sm">{name}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">{type}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">How It Works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {HOW_IT_WORKS.map(({ step, title, desc }) => (
                <div key={step} className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {step}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Privacy first:</strong> Raw PDFs are parsed locally. Only aggregated
                statistics (never account numbers, names, or transaction IDs) are sent to AI for categorisation.
              </p>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </MainLayout>
  )
}
