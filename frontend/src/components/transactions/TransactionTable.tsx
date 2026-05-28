import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowUpDown, ArrowUp, ArrowDown,
  Pencil, Trash2, MoreHorizontal,
  AlertCircle, Columns3, Check, X,
  ArrowDownLeft, ArrowUpRight, Plane,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuCheckboxItem, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAccountsStore } from '@/store'
import { ALL_CATEGORIES, getCategoryColor, getSubcategories } from '@/lib/categories'
import { formatCurrency, formatDate, getReviewReasons, isNeedsReview } from '@/lib/utils'
import type { Transaction, TransactionFilters } from '@/types'

// ── Column definitions ─────────────────────────────────────────────────────────

export type ColKey =
  | 'date' | 'paid_to_from' | 'what_for' | 'category' | 'subcategory'
  | 'account' | 'direction' | 'trip' | 'need_want' | 'fixed_var'
  | 'personal_work' | 'reimbursable' | 'tags' | 'amount'

interface ColDef {
  key: ColKey
  label: string
  defaultVisible: boolean
  sortKey?: string
  defaultWidth: number   // px; 'what_for' uses 1fr when unresized
}

export const COLUMN_DEFS: ColDef[] = [
  { key: 'date',          label: 'Date',           defaultVisible: true,  sortKey: 'date',      defaultWidth: 88  },
  { key: 'paid_to_from',  label: 'Paid To / From', defaultVisible: true,  sortKey: 'merchant',  defaultWidth: 150 },
  { key: 'what_for',      label: 'What For',        defaultVisible: true,                        defaultWidth: 240 },
  { key: 'category',      label: 'Category',        defaultVisible: true,  sortKey: 'category',  defaultWidth: 136 },
  { key: 'subcategory',   label: 'Subcategory',     defaultVisible: false, sortKey: 'subcategory', defaultWidth: 128 },
  { key: 'account',       label: 'Account',         defaultVisible: true,  sortKey: 'account_id',  defaultWidth: 130 },
  { key: 'direction',     label: 'Type',            defaultVisible: true,  sortKey: 'direction', defaultWidth: 76  },
  { key: 'trip',          label: 'Trip',            defaultVisible: false,                       defaultWidth: 120 },
  { key: 'need_want',     label: 'Need / Want',      defaultVisible: false,                       defaultWidth: 90  },
  { key: 'fixed_var',     label: 'Fixed / Var',      defaultVisible: false,                       defaultWidth: 90  },
  { key: 'personal_work', label: 'Personal / Work', defaultVisible: false,                       defaultWidth: 100 },
  { key: 'reimbursable',  label: 'Reimbursable',    defaultVisible: false,                       defaultWidth: 110 },
  { key: 'tags',          label: 'Tags',            defaultVisible: false,                       defaultWidth: 140 },
  { key: 'amount',        label: 'Amount',          defaultVisible: true,  sortKey: 'amount',    defaultWidth: 96  },
]

export const DEFAULT_VISIBLE = Object.fromEntries(
  COLUMN_DEFS.map((c) => [c.key, c.defaultVisible])
) as Record<ColKey, boolean>

export const DEFAULT_ORDER: ColKey[] = COLUMN_DEFS.map((d) => d.key)

const MIN_COL_WIDTH = 48

// 'what_for' expands to fill remaining space until the user explicitly resizes it.
function getGridTemplate(
  visibleDefs: ColDef[],
  colWidths: Partial<Record<ColKey, number>>,
): string {
  const tracks = visibleDefs.map((d) => {
    const w = colWidths[d.key]
    if (w !== undefined) return `${w}px`
    if (d.key === 'what_for') return 'minmax(200px, 1fr)'
    return `${d.defaultWidth}px`
  })
  return ['20px', ...tracks, '36px'].join(' ')
}

// ── Pill badge ─────────────────────────────────────────────────────────────────

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${color}`}>
      {children}
    </span>
  )
}

// ── Inline category editor ─────────────────────────────────────────────────────

function InlineCategoryEditor({
  value, transactionId, onSave,
}: { value: string | null; transactionId: string; onSave: (id: string, cat: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const color = getCategoryColor(value)

  if (editing) {
    return (
      <Select
        value={value ?? '__none'}
        onValueChange={async (v) => { await onSave(transactionId, v === '__none' ? '' : v); setEditing(false) }}
        open
        onOpenChange={(o) => { if (!o) setEditing(false) }}
      >
        <SelectTrigger className="h-6 text-xs w-32" onClick={(e) => e.stopPropagation()}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">Uncategorized</SelectItem>
          {ALL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
    )
  }

  return (
    <span
      onClick={(e) => { e.stopPropagation(); setEditing(true) }}
      title="Click to edit category"
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all ${value ? color : 'bg-muted text-muted-foreground'}`}
    >
      {value ?? 'Uncategorized'}
      <Pencil className="w-2.5 h-2.5 opacity-50" />
    </span>
  )
}

// ── Inline subcategory editor ──────────────────────────────────────────────────

function InlineSubcategoryEditor({
  category, value, transactionId, onSave,
}: { category: string | null; value: string | null; transactionId: string; onSave: (id: string, sub: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const subcats = getSubcategories(category ?? '')
  const color = getCategoryColor(category)

  if (!category) return <span className="text-xs text-muted-foreground/40">—</span>

  if (editing) {
    return (
      <Select
        value={value ?? '__none'}
        onValueChange={async (v) => { await onSave(transactionId, v === '__none' ? '' : v); setEditing(false) }}
        open
        onOpenChange={(o) => { if (!o) setEditing(false) }}
      >
        <SelectTrigger className="h-6 text-xs w-36" onClick={(e) => e.stopPropagation()}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">None</SelectItem>
          {subcats.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>
    )
  }

  return (
    <span
      onClick={(e) => { e.stopPropagation(); setEditing(true) }}
      title="Click to edit subcategory"
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all ${
        value ? color : 'bg-muted text-muted-foreground'
      }`}
    >
      {value ?? 'Add subcategory'}
      <Pencil className="w-2.5 h-2.5 opacity-50" />
    </span>
  )
}

// ── Inline note editor ─────────────────────────────────────────────────────────

function InlineNoteEditor({
  value, transactionId, onSave, placeholder,
}: { value: string | null; transactionId: string; onSave: (id: string, note: string) => Promise<void>; placeholder?: React.ReactNode }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(value ?? '')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [editing, value])

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      await onSave(transactionId, draft.trim())
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') { setEditing(false) }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a note…"
          className="flex-1 min-w-0 text-sm bg-background border border-input rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-shrink-0 p-0.5 rounded hover:bg-green-100 dark:hover:bg-green-900/40 text-green-600 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setEditing(false)}
          className="flex-shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div
      onClick={(e) => { e.stopPropagation(); setEditing(true) }}
      title="Click to edit note"
      className="cursor-text group/note flex items-center gap-1 min-w-0"
    >
      {value?.trim()
        ? <p className="text-sm text-muted-foreground truncate group-hover/note:text-foreground transition-colors">{value}</p>
        : placeholder ?? <span className="text-xs text-muted-foreground/30">—</span>
      }
      <Pencil className="w-2.5 h-2.5 text-muted-foreground/40 opacity-0 group-hover/note:opacity-100 flex-shrink-0 transition-opacity" />
    </div>
  )
}

// ── Sort header ────────────────────────────────────────────────────────────────

function SortHeader({
  label, sortKey, currentSort, onSort, alignRight = false,
}: { label: string; sortKey: string; currentSort: { by: string; dir: string }; onSort: (k: string) => void; alignRight?: boolean }) {
  const active = currentSort.by === sortKey
  const Icon = active ? (currentSort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onSort(sortKey) }}
      className={`flex items-center gap-1 hover:text-foreground transition-colors w-full truncate ${active ? 'text-foreground' : ''} ${alignRight ? 'justify-end' : ''}`}
    >
      <span className="truncate">{label}</span>
      <Icon className={`w-3 h-3 flex-shrink-0 ${active ? 'opacity-100' : 'opacity-40'}`} />
    </button>
  )
}

// ── Column picker ──────────────────────────────────────────────────────────────

export function ColumnPicker({
  cols, onChange, onResetAll,
}: {
  cols: Record<ColKey, boolean>
  onChange: (cols: Record<ColKey, boolean>) => void
  onResetAll?: () => void
}) {
  const visibleCount = Object.values(cols).filter(Boolean).length
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <Columns3 className="w-3.5 h-3.5" />
          Columns
          <span className="bg-primary text-primary-foreground rounded-full text-[10px] w-4 h-4 flex items-center justify-center">
            {visibleCount}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Show / hide columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {COLUMN_DEFS.map((def) => (
          <DropdownMenuCheckboxItem
            key={def.key}
            checked={cols[def.key]}
            onCheckedChange={(v) => onChange({ ...cols, [def.key]: v })}
            onSelect={(e) => e.preventDefault()}
            className="text-xs"
          >
            {def.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-xs text-muted-foreground"
          onClick={() => onResetAll ? onResetAll() : onChange(DEFAULT_VISIBLE)}
        >
          Reset to defaults
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Main table ─────────────────────────────────────────────────────────────────

interface TripSummary { id: string; name: string }

interface TransactionTableProps {
  transactions: Transaction[]
  isLoading: boolean
  filters: TransactionFilters
  onSortChange: (filters: Partial<TransactionFilters>) => void
  selectedIds: Set<string>
  onSelectChange: (ids: Set<string>) => void
  onEdit: (t: Transaction) => void
  onDelete: (id: string) => void
  onCategoryUpdate: (id: string, category: string) => Promise<void>
  onSubcategoryUpdate: (id: string, subcategory: string) => Promise<void>
  onNoteUpdate: (id: string, note: string) => Promise<void>
  cols: Record<ColKey, boolean>
  onColsChange: (cols: Record<ColKey, boolean>) => void
  // Resizable / reorderable columns — owned by the parent so ColumnPicker reset works
  colOrder: ColKey[]
  colWidths: Partial<Record<ColKey, number>>
  onColOrderChange: (order: ColKey[]) => void
  onColWidthsChange: (widths: Partial<Record<ColKey, number>>) => void
  trips?: TripSummary[]
}

export function TransactionTable({
  transactions, isLoading, filters, onSortChange,
  selectedIds, onSelectChange, onEdit, onDelete,
  onCategoryUpdate, onSubcategoryUpdate, onNoteUpdate,
  cols, colOrder, colWidths,
  onColOrderChange, onColWidthsChange,
  trips = [],
}: TransactionTableProps) {
  const { getById } = useAccountsStore()

  // ── Drag-to-reorder state ─────────────────────────────────────────────────
  const [dragOverKey, setDragOverKey] = useState<ColKey | null>(null)
  const draggingKey = useRef<ColKey | null>(null)

  // ── Resize state ──────────────────────────────────────────────────────────
  // We measure the actual rendered cell width on drag-start so 'what_for'
  // (which uses 1fr by default) gets the correct starting width.
  const headerCellRefs = useRef<Map<ColKey, HTMLElement>>(new Map())
  const resizeState = useRef<{ key: ColKey; startX: number; startWidth: number } | null>(null)

  const onResizeStart = useCallback((e: React.MouseEvent, key: ColKey) => {
    e.preventDefault()   // prevents HTML5 drag from firing
    e.stopPropagation()

    const cellEl = headerCellRefs.current.get(key)
    const startWidth = cellEl
      ? cellEl.getBoundingClientRect().width
      : (colWidths[key] ?? COLUMN_DEFS.find((d) => d.key === key)?.defaultWidth ?? 120)

    resizeState.current = { key, startX: e.clientX, startWidth }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeState.current) return
      const delta = ev.clientX - resizeState.current.startX
      const newW = Math.max(MIN_COL_WIDTH, resizeState.current.startWidth + delta)
      onColWidthsChange({ ...colWidths, [resizeState.current.key]: newW })
    }

    const onMouseUp = () => {
      resizeState.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [colWidths, onColWidthsChange])

  // ── Derived ───────────────────────────────────────────────────────────────

  const visibleDefs = colOrder
    .filter((key) => cols[key])
    .map((key) => COLUMN_DEFS.find((d) => d.key === key)!)
    .filter(Boolean)

  const allSelected = transactions.length > 0 && transactions.every((t) => selectedIds.has(t.id))
  const someSelected = transactions.some((t) => selectedIds.has(t.id)) && !allSelected

  const toggleAll = () => {
    const next = new Set(selectedIds)
    if (allSelected) transactions.forEach((t) => next.delete(t.id))
    else transactions.forEach((t) => next.add(t.id))
    onSelectChange(next)
  }

  const toggleRow = (id: string) => {
    const next = new Set(selectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    onSelectChange(next)
  }

  const currentSort = { by: filters.sort_by ?? 'date', dir: filters.sort_dir ?? 'desc' }
  const handleSort = (key: string) => {
    onSortChange({ sort_by: key, sort_dir: currentSort.by === key && currentSort.dir === 'desc' ? 'asc' : 'desc', page: 1 })
  }

  const gridTemplate = getGridTemplate(visibleDefs, colWidths)

  // Explicit pixel min-width for the table so all rows share the same
  // total width and the parent overflow-x-auto can scroll them together.
  // Using max-content on individual grid rows (with 1fr tracks) is
  // unreliable — this explicit calc is always correct.
  const tableMinWidth = useMemo(() => {
    const colsTotal = visibleDefs.reduce(
      (acc, d) => acc + (colWidths[d.key] ?? d.defaultWidth),
      0,
    )
    // 20px checkbox + columns + 12px gap per inter-column space + 36px actions
    const gaps = (visibleDefs.length + 1) * 12
    return 20 + colsTotal + gaps + 36
  }, [visibleDefs, colWidths])

  const rowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: gridTemplate,
    columnGap: '12px',
    alignItems: 'center',
  }

  return (
    <div className="overflow-x-auto">
      {/* Single width-enforcing wrapper — all rows share the same min-width so
          horizontal scroll works as a unit rather than each row independently. */}
      <div className="divide-y" style={{ minWidth: `${tableMinWidth + 32}px` }}>

      {/* ── Header row ── */}
      <div style={rowStyle} className="px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">

        {/* Checkbox */}
        <div className="py-2.5">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = someSelected }}
            onChange={toggleAll}
            className="w-4 h-4 rounded border-muted-foreground accent-primary cursor-pointer"
          />
        </div>

        {/* Resizable + reorderable column headers */}
        {visibleDefs.map((def) => (
          <div
            key={def.key}
            ref={(el) => {
              if (el) headerCellRefs.current.set(def.key, el)
              else headerCellRefs.current.delete(def.key)
            }}
            // ── drag-to-reorder ──
            draggable
            onDragStart={(e) => {
              draggingKey.current = def.key
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (draggingKey.current !== def.key) setDragOverKey(def.key)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverKey(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              const from = draggingKey.current
              if (!from || from === def.key) { setDragOverKey(null); return }
              const next = [...colOrder]
              next.splice(next.indexOf(from), 1)
              next.splice(next.indexOf(def.key), 0, from)
              onColOrderChange(next)
              setDragOverKey(null)
            }}
            onDragEnd={() => { draggingKey.current = null; setDragOverKey(null) }}
            // ── layout ──
            className={`relative min-w-0 flex items-center gap-1 py-2.5 cursor-grab active:cursor-grabbing select-none group/col transition-colors ${
              dragOverKey === def.key ? 'bg-primary/5' : ''
            }`}
          >
            {/* Drop-target left-edge indicator */}
            {dragOverKey === def.key && (
              <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-primary" />
            )}

            {/* Sort button or plain label */}
            <div className="flex-1 min-w-0 overflow-hidden">
              {def.sortKey ? (
                <SortHeader
                  label={def.label}
                  sortKey={def.sortKey}
                  currentSort={currentSort}
                  onSort={handleSort}
                  alignRight={def.key === 'amount'}
                />
              ) : (
                <span className="truncate block">{def.label}</span>
              )}
            </div>

            {/* Resize handle — wide invisible grab zone, thin visual line */}
            <div
              draggable={false}
              className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-10 group/rz flex items-center justify-end"
              onMouseDown={(e) => onResizeStart(e, def.key)}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-4/5 w-px rounded-full bg-border opacity-0 group-hover/col:opacity-50 group-hover/rz:opacity-100 group-hover/rz:bg-primary transition-all" />
            </div>
          </div>
        ))}

        {/* Actions spacer */}
        <div />
      </div>

      {/* ── Skeleton rows ── */}
      {isLoading && Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={i}
          style={rowStyle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.03 }}
          className="px-4 py-3.5"
        >
          <Skeleton className="h-4 w-4 rounded" />
          {visibleDefs.map((def) => (
            <div key={def.key} className="min-w-0 overflow-hidden">
              {def.key === 'amount'
                ? <Skeleton className="h-4 w-16 ml-auto" />
                : def.key === 'what_for'
                  ? <div className="space-y-1"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
                  : def.key === 'category' || def.key === 'subcategory'
                    ? <Skeleton className="h-5 w-5/6 rounded-full" />
                    : <Skeleton className="h-4 w-4/5" />}
            </div>
          ))}
          <div />
        </motion.div>
      ))}

      {/* ── Data rows ── */}
      {!isLoading && transactions.map((t, i) => {
        const selected = selectedIds.has(t.id)
        const acct = t.account_id ? getById(t.account_id) : null
        const isDebit = t.direction === 'debit'
        const needsReview = isNeedsReview(t)
        const reviewReasons = needsReview ? getReviewReasons(t) : []
        const hasRedReason = reviewReasons.some((r) => r.color === 'red')

        // What For only shows reasons that aren't already represented by
        // a visible dedicated column — avoids redundant doubled-up badges.
        // "Add a note" is always shown inline above (not as a badge), so it's
        // excluded here too.
        const whatForReasons = reviewReasons.filter((r) => {
          if (r.label === 'Add a note') return false
          if (r.label === 'Pick a subcategory' && cols.subcategory) return false
          if (r.label.startsWith('Category missing') && cols.category) return false
          return true
        })

        return (
          <motion.div
            key={t.id}
            style={rowStyle}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.02, duration: 0.15 }}
            className={`px-4 py-3 cursor-pointer transition-colors group border-l-2 ${
              needsReview
                ? hasRedReason
                  ? 'border-l-red-400 dark:border-l-red-500 bg-red-50/30 dark:bg-red-950/10'
                  : 'border-l-amber-400 dark:border-l-amber-500 bg-amber-50/30 dark:bg-amber-950/10'
                : 'border-l-transparent'
            } ${selected ? 'bg-primary/5' : 'hover:bg-accent/50'}`}
            onClick={() => onEdit(t)}
          >
            {/* Checkbox */}
            <div onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={selected} onChange={() => toggleRow(t.id)}
                className="w-4 h-4 rounded border-muted-foreground accent-primary cursor-pointer" />
            </div>

            {/* Data cells — rendered in colOrder order by iterating visibleDefs */}
            {visibleDefs.map((def) => {
              const k = def.key
              const stopProp = k === 'category' || k === 'subcategory' || k === 'what_for'
              return (
                <div
                  key={k}
                  className="min-w-0 overflow-hidden"
                  onClick={stopProp ? (e) => e.stopPropagation() : undefined}
                >
                  {k === 'date' && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(t.date)}</span>
                  )}
                  {k === 'paid_to_from' && (
                    <>
                      <p className="text-sm font-medium truncate">
                        {t.merchant ?? t.description_clean ?? t.description ?? '—'}
                      </p>
                      <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                        {isDebit ? 'paid to' : 'received from'}
                      </p>
                    </>
                  )}
                  {k === 'what_for' && (
                    <InlineNoteEditor
                      value={t.notes ?? null}
                      transactionId={t.id}
                      onSave={onNoteUpdate}
                      placeholder={whatForReasons[0] ? (
                        <Pill color={
                          whatForReasons[0].color === 'red'  ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' :
                          whatForReasons[0].color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' :
                                                               'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                        }>
                          <AlertCircle className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{whatForReasons[0].label}</span>
                        </Pill>
                      ) : undefined}
                    />
                  )}
                  {k === 'category' && (
                    <InlineCategoryEditor value={t.category} transactionId={t.id} onSave={onCategoryUpdate} />
                  )}
                  {k === 'subcategory' && (
                    <InlineSubcategoryEditor
                      category={t.category} value={t.subcategory}
                      transactionId={t.id} onSave={onSubcategoryUpdate}
                    />
                  )}
                  {k === 'account' && (
                    <span className="text-xs text-muted-foreground truncate">
                      {acct ? <>{acct.name}{acct.last_four && <span className="opacity-60"> ••{acct.last_four}</span>}</> : '—'}
                    </span>
                  )}
                  {k === 'direction' && (
                    <Pill color={isDebit
                      ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                      : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                    }>
                      {isDebit ? <><ArrowDownLeft className="w-3 h-3" />Debit</> : <><ArrowUpRight className="w-3 h-3" />Credit</>}
                    </Pill>
                  )}
                  {k === 'trip' && (
                    t.business_trip_id ? (
                      <Pill color="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                        <Plane className="w-3 h-3" />
                        <span className="truncate">{trips.find((tr) => tr.id === t.business_trip_id)?.name ?? '—'}</span>
                      </Pill>
                    ) : <span className="text-xs text-muted-foreground/40">—</span>
                  )}
                  {k === 'need_want' && (
                    t.need_want_savings && t.need_want_savings !== 'na' ? (
                      <Pill color={
                        t.need_want_savings === 'need'    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' :
                        t.need_want_savings === 'savings' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' :
                                                            'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                      }>
                        {{ need: 'Need', want: 'Want', savings: 'Savings' }[t.need_want_savings]}
                      </Pill>
                    ) : <span className="text-xs text-muted-foreground/40">—</span>
                  )}
                  {k === 'fixed_var' && (
                    t.fixed_variable && t.fixed_variable !== 'na' ? (
                      <Pill color="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {{ fixed: 'Fixed', variable: 'Variable' }[t.fixed_variable]}
                      </Pill>
                    ) : <span className="text-xs text-muted-foreground/40">—</span>
                  )}
                  {k === 'personal_work' && (
                    t.personal_work_shared ? (
                      <Pill color={
                        t.personal_work_shared === 'work'   ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' :
                        t.personal_work_shared === 'shared' ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300' :
                        t.personal_work_shared === 'mixed'  ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300' :
                                                              'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }>
                        {{ personal: 'Personal', work: 'Work', shared: 'Shared', mixed: 'Mixed' }[t.personal_work_shared]}
                      </Pill>
                    ) : <span className="text-xs text-muted-foreground/40">—</span>
                  )}
                  {k === 'reimbursable' && (
                    t.is_reimbursable && t.reimbursement_status && t.reimbursement_status !== 'not_reimbursable' ? (
                      <Pill color="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                        {t.reimbursement_status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </Pill>
                    ) : <span className="text-xs text-muted-foreground/40">—</span>
                  )}
                  {k === 'tags' && (
                    <div className="flex flex-wrap gap-1">
                      {(t.tags ?? []).slice(0, 2).map((tag) => (
                        <Pill key={tag} color="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{tag}</Pill>
                      ))}
                      {(t.tags ?? []).length > 2 && (
                        <span className="text-xs text-muted-foreground">+{(t.tags ?? []).length - 2}</span>
                      )}
                    </div>
                  )}
                  {k === 'amount' && (
                    <div className="text-right">
                      <span className={`text-sm font-semibold tabular-nums ${isDebit ? '' : 'text-green-600 dark:text-green-400'}`}>
                        {isDebit ? '' : '+'}{formatCurrency(t.amount)}
                      </span>
                      {t.net_personal_cost !== null && t.net_personal_cost !== t.amount && (
                        <p className="text-xs text-muted-foreground tabular-nums">net {formatCurrency(t.net_personal_cost ?? 0)}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Row actions */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(t)}><Pencil className="w-3.5 h-3.5" /> Edit</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onDelete(t.id)} className="text-destructive focus:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </motion.div>
        )
      })}

      </div> {/* end min-width wrapper */}
    </div>
  )
}
