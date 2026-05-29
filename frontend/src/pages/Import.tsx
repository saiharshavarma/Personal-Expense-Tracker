import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, FileText, Table2, Building2, CheckCircle2, Clock,
  AlertCircle, Loader2, X, ChevronDown, Check, Eye,
} from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/utils/apiClient'
import type { Account, ImportBatch } from '@/types'
import { ALL_CATEGORIES } from '@/lib/categories'

// ── Types ─────────────────────────────────────────────────────────────────────

interface QueueTransaction {
  id: string
  description: string
  amount: number
  date: string
  direction: 'debit' | 'credit'
  // AI fields
  ai_category: string | null
  ai_subcategory: string | null
  ai_confidence: number | null  // 0–1 scale (e.g. 0.85 = 85%)
  ai_flags: string[]
  // User-editable classification fields (pre-filled by AI)
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

interface PreviewTransaction {
  date: string
  description: string
  amount: number
  direction: string
}

interface UploadResult {
  batch_id: string
  preview: PreviewTransaction[]
  total: number
  institution?: string
}

interface ConfirmResult {
  imported: number
  duplicates: number
  batch_id: string
}

interface FileEntry {
  file: File
  id: string
  account_id: string
  status: 'pending' | 'uploading' | 'preview' | 'confirming' | 'done' | 'error'
  error?: string
  uploadResult?: UploadResult
  confirmResult?: ConfirmResult
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectInstitution(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.includes('chase')) return 'Chase'
  if (lower.includes('boa') || lower.includes('bankofamerica') || lower.includes('bank_of_america')) return 'Bank of America'
  if (lower.includes('amex') || lower.includes('american_express') || lower.includes('americanexpress')) return 'American Express'
  if (lower.includes('apple') || lower.includes('applepay')) return 'Apple Pay'
  if (lower.includes('wellsfargo') || lower.includes('wells_fargo')) return 'Wells Fargo'
  if (lower.includes('citi')) return 'Citibank'
  if (lower.includes('discover')) return 'Discover'
  return 'Unknown Institution'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function uid() {
  return Math.random().toString(36).slice(2)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  // Keyed on actual backend batch statuses: "staged" (pending review) and "complete".
  const map: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'outline' | 'default' }> = {
    staged:   { label: 'Staged',     variant: 'secondary' },
    complete: { label: 'Complete',   variant: 'success'   },
  }
  const cfg = map[status] ?? { label: status, variant: 'outline' as const }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
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

  const handleUploadAll = async () => {
    const pending = files.filter(e => e.status === 'pending')
    for (const entry of pending) {
      setFileField(entry.id, 'status', 'uploading')
      try {
        const fd = new FormData()
        fd.append('file', entry.file)
        if (entry.account_id) fd.append('account_id', entry.account_id)
        const endpoint = entry.file.name.endsWith('.csv') ? '/import/upload-csv' : '/import/upload-pdf'
        const r = await api.post<UploadResult>(endpoint, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        setFiles(prev => prev.map(e =>
          e.id === entry.id ? { ...e, status: 'preview', uploadResult: r.data } : e
        ))
      } catch (err: unknown) {
        const e2 = err as { response?: { data?: { detail?: string } } }
        setFiles(prev => prev.map(e =>
          e.id === entry.id ? { ...e, status: 'error', error: e2?.response?.data?.detail || 'Upload failed' } : e
        ))
      }
    }
  }

  const handleConfirm = async (entry: FileEntry) => {
    if (!entry.uploadResult) return
    setFileField(entry.id, 'status', 'confirming')
    try {
      const r = await api.post<ConfirmResult>('/import/confirm', {
        batch_id: entry.uploadResult.batch_id,
        accept_all: true,
      })
      setFiles(prev => prev.map(e =>
        e.id === entry.id ? { ...e, status: 'done', confirmResult: r.data } : e
      ))
      fetchHistory()
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { detail?: string } } }
      setFiles(prev => prev.map(e =>
        e.id === entry.id ? { ...e, status: 'error', error: e2?.response?.data?.detail || 'Confirm failed' } : e
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
          <CardDescription>Drop PDF bank statements or CSV files — multiple files supported</CardDescription>
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
            <p className="text-xs text-muted-foreground mt-2">Supports Chase, Bank of America, American Express, Apple Pay CSV</p>
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
                          {detectInstitution(entry.file.name)} · {formatFileSize(entry.file.size)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {entry.status === 'uploading' || entry.status === 'confirming'
                          ? <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          : entry.status === 'done'
                          ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                          : entry.status === 'error'
                          ? <AlertCircle className="w-4 h-4 text-destructive" />
                          : entry.status === 'preview'
                          ? <Eye className="w-4 h-4 text-primary" />
                          : <CheckCircle2 className="w-4 h-4 text-muted-foreground/40" />
                        }
                        {entry.status !== 'done' && (
                          <button onClick={() => removeFile(entry.id)} className="text-muted-foreground hover:text-foreground">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Account selector — only show for pending / preview */}
                    {(entry.status === 'pending' || entry.status === 'preview') && (
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

                    {/* Error message */}
                    {entry.status === 'error' && entry.error && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {entry.error}
                      </p>
                    )}

                    {/* Preview table */}
                    {entry.status === 'preview' && entry.uploadResult && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Preview — {entry.uploadResult.total} transactions
                            {entry.uploadResult.institution && ` · ${entry.uploadResult.institution}`}
                          </p>
                          {entry.uploadResult.preview.length < entry.uploadResult.total && (
                            <p className="text-xs text-muted-foreground">
                              Showing {entry.uploadResult.preview.length} of {entry.uploadResult.total}
                            </p>
                          )}
                        </div>
                        <div className="rounded-md border overflow-hidden">
                          <div className="overflow-x-auto">
                            <div className="max-h-56 overflow-y-auto">
                              <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm">
                                  <tr className="border-b">
                                    <th className="text-left px-3 py-2 font-medium">#</th>
                                    <th className="text-left px-3 py-2 font-medium">Date</th>
                                    <th className="text-left px-3 py-2 font-medium">Description</th>
                                    <th className="text-right px-3 py-2 font-medium">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {entry.uploadResult.preview.map((tx, i) => (
                                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                                      <td className="px-3 py-1.5 text-muted-foreground/50">{i + 1}</td>
                                      <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{tx.date}</td>
                                      <td className="px-3 py-1.5 max-w-[220px] truncate" title={tx.description}>{tx.description}</td>
                                      <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${tx.direction === 'credit' ? 'text-green-500' : ''}`}>
                                        {tx.direction === 'credit' ? '+' : '−'}${Math.abs(tx.amount).toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                        <Button size="sm" onClick={() => handleConfirm(entry)} className="w-full">
                          <CheckCircle2 className="w-4 h-4" />
                          Import {entry.uploadResult.total} transaction{entry.uploadResult.total !== 1 ? 's' : ''}
                        </Button>
                      </div>
                    )}

                    {/* Done result */}
                    {entry.status === 'done' && entry.confirmResult && (
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 text-green-500">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {entry.confirmResult.imported} imported
                        </span>
                        {entry.confirmResult.duplicates > 0 && (
                          <span>{entry.confirmResult.duplicates} duplicates skipped</span>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {hasPending && (
                <Button onClick={handleUploadAll} className="w-full">
                  <Upload className="w-4 h-4" />
                  Upload & Parse {files.filter(e => e.status === 'pending').length} file(s)
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
      setRows(prev => prev.map(r => r.id === id ? { ...r, localAction: action, editedCategory: category ?? r.editedCategory } : r))
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

  const low = rows.filter(r => (r.ai_confidence ?? 0) < 0.75)
  const medium = rows.filter(r => { const c = r.ai_confidence ?? 0; return c >= 0.75 && c < 0.90 })
  const clean = rows.filter(r => (r.ai_confidence ?? 0) >= 0.90)
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
      {/* Bulk action */}
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

      {/* Low confidence */}
      {low.length > 0 && (
        <ReviewSection
          title="Low Confidence"
          emoji="🔴"
          subtitle="< 75% confidence — requires manual review"
          rows={low}
          saving={saving}
          editingId={editingId}
          setEditingId={setEditingId}
          onAction={applyAction}
        />
      )}

      {/* Needs review */}
      {medium.length > 0 && (
        <ReviewSection
          title="Needs Review"
          emoji="🟡"
          subtitle="75–89% confidence"
          rows={medium}
          saving={saving}
          editingId={editingId}
          setEditingId={setEditingId}
          onAction={applyAction}
        />
      )}

      {/* Clean */}
      {clean.length > 0 && (
        <ReviewSection
          title="Clean"
          emoji="✅"
          subtitle="≥ 90% confidence"
          rows={clean}
          saving={saving}
          editingId={editingId}
          setEditingId={setEditingId}
          onAction={applyAction}
        />
      )}
    </div>
  )
}

interface ReviewSectionProps {
  title: string
  emoji: string
  subtitle: string
  rows: ReviewRow[]
  saving: Set<string>
  editingId: string | null
  setEditingId: (id: string | null) => void
  onAction: (id: string, action: ReviewAction, category?: string) => void
}

function ReviewSection({ title, emoji, subtitle, rows, saving, editingId, setEditingId, onAction }: ReviewSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [editCategories, setEditCategories] = useState<Record<string, string>>({})

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          className="flex items-center justify-between w-full text-left"
          onClick={() => setCollapsed(v => !v)}
        >
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
                  const confColor = conf < 0.75 ? 'text-red-500' : conf < 0.90 ? 'text-yellow-500' : 'text-green-500'

                  return (
                    <tr key={row.id} className={`hover:bg-muted/30 ${done ? 'opacity-50' : ''}`}>
                      <td className="py-2.5 pr-3 text-muted-foreground text-xs whitespace-nowrap">{row.date}</td>
                      <td className="py-2.5 pr-3 max-w-[200px] truncate">{row.description}</td>
                      <td className={`py-2.5 pr-3 text-right tabular-nums font-medium ${row.direction === 'credit' ? 'text-green-500' : ''}`}>
                        {row.direction === 'credit' ? '+' : '-'}${Math.abs(row.amount).toFixed(2)}
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
                      <td className={`py-2.5 pr-3 text-right text-xs font-medium tabular-nums ${confColor}`}>
                        {(conf * 100).toFixed(0)}%
                      </td>
                      <td className="py-2.5">
                        {done ? (
                          <span className="text-xs text-muted-foreground capitalize">{row.localAction}</span>
                        ) : isSaving ? (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        ) : isEditing ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() => {
                                onAction(row.id, 'edit', editCategories[row.id] ?? row.ai_category ?? undefined)
                                setEditingId(null)
                              }}
                            >
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingId(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs px-2 text-green-600 border-green-500/30 hover:bg-green-500/10"
                              onClick={() => onAction(row.id, 'accept')}
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs px-2"
                              onClick={() => setEditingId(row.id)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs px-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => onAction(row.id, 'reject')}
                            >
                              Reject
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

// ── Sidebar info ──────────────────────────────────────────────────────────────

const SUPPORTED_BANKS = [
  { name: 'Chase', type: 'PDF', status: 'supported' },
  { name: 'Bank of America', type: 'PDF', status: 'supported' },
  { name: 'American Express', type: 'PDF', status: 'supported' },
  { name: 'Apple Pay (iOS Shortcut)', type: 'CSV', status: 'supported' },
  { name: 'Other Banks', type: 'PDF', status: 'generic' },
]

const HOW_IT_WORKS = [
  { step: 1, title: 'Upload statement', desc: 'Drop your PDF bank statement or Apple Pay CSV' },
  { step: 2, title: 'Auto-detection', desc: 'We detect your bank and parse the transactions' },
  { step: 3, title: 'AI categorization', desc: 'Transactions are categorized automatically' },
  { step: 4, title: 'Review & confirm', desc: 'Review flagged items and confirm the import' },
]

// ── Main page ─────────────────────────────────────────────────────────────────

type ImportTab = 'upload' | 'review'

export function Import() {
  const [activeTab, setActiveTab] = useState<ImportTab>('upload')

  return (
    <MainLayout>
      <TopBar
        title="Import Statements"
        subtitle="Import bank PDFs or your Apple Pay CSV to add transactions"
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tab strip */}
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
                <strong className="text-foreground">Privacy first:</strong> Raw PDFs never leave your machine. Only sanitized data (no account numbers, names, or IDs) is sent to AI for categorization.
              </p>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </MainLayout>
  )
}
