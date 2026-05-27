import { useState, useEffect } from 'react'
import { AlertCircle, ClipboardList } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useTransactionsStore, useAccountsStore } from '@/store'
import { api } from '@/utils/apiClient'
import { ALL_CATEGORIES, getSubcategories, NEED_WANT_SAVINGS_OPTIONS, FIXED_VARIABLE_OPTIONS, PERSONAL_WORK_OPTIONS } from '@/lib/categories'
import { isNeedsReview } from '@/lib/utils'
import type { Transaction } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction?: Transaction | null
}

const today = () => new Date().toISOString().split('T')[0]

const emptyForm = () => ({
  date: today(),
  amount: '',
  direction: 'debit',
  description: '',
  paid_to: '',
  notes: '',
  account_id: '',
  trip_id: '',
  category: '',
  subcategory: '',
  need_want_savings: '',
  fixed_variable: '',
  personal_work_shared: '',
  tags: '',
  is_reimbursable: false,
  reimbursement_source: '',
  expected_reimbursement: '',
  is_recurring: false,
})

type FormState = ReturnType<typeof emptyForm>

function toForm(t: Transaction): FormState {
  return {
    date: t.date,
    amount: String(t.amount),
    direction: t.direction,
    description: t.description ?? '',
    paid_to: t.merchant ?? '',
    notes: t.notes ?? '',
    account_id: t.account_id ?? '',
    trip_id: t.business_trip_id ?? '',
    category: t.category ?? '',
    subcategory: t.subcategory ?? '',
    need_want_savings: t.need_want_savings ?? '',
    fixed_variable: t.fixed_variable ?? '',
    personal_work_shared: t.personal_work_shared ?? '',
    tags: (t.tags ?? []).join(', '),
    is_reimbursable: t.is_reimbursable,
    reimbursement_source: t.reimbursement_source ?? '',
    expected_reimbursement: t.expected_reimbursement ? String(t.expected_reimbursement) : '',
    is_recurring: t.is_recurring,
  }
}

export function AddTransactionSheet({ open, onOpenChange, transaction }: Props) {
  const { addTransaction, updateTransaction } = useTransactionsStore()
  const { accounts } = useAccountsStore()
  const [trips, setTrips] = useState<Array<{ id: string; name: string; status: string; start_date: string | null; end_date: string | null }>>([])
  const [form, setForm] = useState<FormState>(emptyForm())
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createSub, setCreateSub] = useState(false)
  const isEdit = Boolean(transaction)

  // When editing a transaction that needs review (computed from field values, not
  // just the backend flag), track which specific fields need attention so we
  // can highlight them in the form.
  const txNeedsReview = isNeedsReview(transaction)
  const reviewHints = isEdit && txNeedsReview
    ? {
        category: !transaction!.category?.trim(),
        subcategory: !!(transaction!.category?.trim() && !transaction!.subcategory?.trim()),
        notes: !transaction!.notes?.trim(),
      }
    : { category: false, subcategory: false, notes: false }

  useEffect(() => {
    api.get('/trips').then((r) => setTrips(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (open) {
      setForm(transaction ? toForm(transaction) : emptyForm())
      setErrors({})
      setCreateSub(false)
    }
  }, [open, transaction])

  const set = (field: keyof FormState, value: unknown) =>
    setForm((f) => ({ ...f, [field]: value }))

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (!form.date) e.date = 'Required'
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0)
      e.amount = 'Enter a positive amount'
    if (!form.paid_to.trim()) e.paid_to = form.direction === 'credit' ? 'Required — who paid you?' : 'Required — who did you pay?'
    if (!form.notes.trim()) e.notes = 'Required — what was this for?'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    try {
      const payload: Partial<Transaction> = {
        date: form.date,
        amount: Number(form.amount),
        direction: form.direction as 'debit' | 'credit',
        description: form.description.trim() || form.paid_to.trim() || null,
        merchant: form.paid_to.trim() || null,
        notes: form.notes.trim() || null,
        account_id: form.account_id || null,
        business_trip_id: form.trip_id || null,
        category: form.category || null,
        subcategory: form.subcategory || null,
        need_want_savings: (form.need_want_savings || null) as Transaction['need_want_savings'],
        fixed_variable: (form.fixed_variable || null) as Transaction['fixed_variable'],
        personal_work_shared: (form.personal_work_shared || null) as Transaction['personal_work_shared'],
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        is_reimbursable: form.is_reimbursable,
        reimbursement_status: form.is_reimbursable
          ? (isEdit && transaction?.reimbursement_status && transaction.reimbursement_status !== 'not_reimbursable'
              ? transaction.reimbursement_status
              : 'to_submit')
          : 'not_reimbursable',
        reimbursement_source: form.is_reimbursable ? form.reimbursement_source || null : null,
        expected_reimbursement: form.is_reimbursable && form.expected_reimbursement
          ? Number(form.expected_reimbursement) : null,
        is_recurring: form.is_recurring,
        source: 'manual',
      }
      // Auto-clear needs_review when editing a flagged transaction and the user
      // has now filled in all the commonly-missing fields.
      if (isEdit && transaction && txNeedsReview) {
        const subcatOk = !form.category || !!form.subcategory
        const resolved = !!(form.notes.trim() && form.category && subcatOk)
        if (resolved) (payload as Record<string, unknown>).needs_review = false
      }
      if (isEdit && transaction) {
        await updateTransaction(transaction.id, payload)
      } else {
        await addTransaction(payload)
        if (createSub && form.is_recurring) {
          await api.post('/subscriptions', {
            name: form.paid_to.trim(),
            amount: Number(form.amount),
            billing_frequency: 'monthly',
            category: form.category || null,
            subcategory: form.subcategory || null,
            personal_work_shared: form.personal_work_shared || 'personal',
            account_id: form.account_id || null,
            notes: form.notes.trim() || null,
          }).catch(() => {})
        }
      }
      onOpenChange(false)
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to save transaction'
      setErrors((prev) => ({ ...prev, paid_to: errMsg }))
    } finally {
      setIsSubmitting(false)
    }
  }

  const subcats = getSubcategories(form.category)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle>{isEdit ? 'Edit Transaction' : 'Add Transaction'}</SheetTitle>
          <SheetDescription>
            {isEdit ? 'Update the transaction details below.' : 'Manually log a transaction.'}
          </SheetDescription>
        </SheetHeader>

        {/* ── Needs-review banner ── */}
        {isEdit && txNeedsReview && (
          <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 mb-4">
            <div className="flex items-center gap-2 mb-1.5">
              <ClipboardList className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">This transaction needs your attention</p>
            </div>
            <ul className="space-y-0.5 pl-5 list-disc">
              {reviewHints.category && (
                <li className="text-xs text-amber-700 dark:text-amber-300">
                  <span className="font-medium">Category</span> is missing — pick one below
                </li>
              )}
              {reviewHints.subcategory && (
                <li className="text-xs text-amber-700 dark:text-amber-300">
                  <span className="font-medium">Subcategory</span> is missing — pick one below
                </li>
              )}
              {reviewHints.notes && (
                <li className="text-xs text-amber-700 dark:text-amber-300">
                  <span className="font-medium">Notes</span> are missing — describe what this was for
                </li>
              )}
              {!reviewHints.category && !reviewHints.subcategory && !reviewHints.notes && (
                <li className="text-xs text-amber-700 dark:text-amber-300">
                  Review the details and save when everything looks correct
                </li>
              )}
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Core fields: date / direction / amount ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date *</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
                className={`mt-1 ${errors.date ? 'border-destructive' : ''}`}
              />
              {errors.date && <p className="text-xs text-destructive mt-0.5">{errors.date}</p>}
            </div>
            <div>
              <Label className="text-xs">Direction *</Label>
              <Select value={form.direction} onValueChange={(v) => set('direction', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">Debit (expense)</SelectItem>
                  <SelectItem value="credit">Credit (income)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Amount *</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                className={`pl-7 ${errors.amount ? 'border-destructive' : ''}`}
              />
            </div>
            {errors.amount && <p className="text-xs text-destructive mt-0.5">{errors.amount}</p>}
          </div>

          <Separator />

          {/* ── NEW: Paid To + What For — the two required context fields ── */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Payment Details</p>
            </div>

            <div>
              <Label className="text-xs">
                {form.direction === 'credit' ? 'Received From *' : 'Paid To *'}
                <span className="ml-1 font-normal text-muted-foreground">
                  {form.direction === 'credit' ? '— who sent you money?' : '— who received the payment?'}
                </span>
              </Label>
              <Input
                placeholder={form.direction === 'credit' ? 'e.g. Acme Corp, John, Freelance Client' : 'e.g. DoorDash, Amazon, Alex (flatmate)'}
                value={form.paid_to}
                onChange={(e) => set('paid_to', e.target.value)}
                className={`mt-1 ${errors.paid_to ? 'border-destructive' : ''}`}
                autoComplete="off"
              />
              {errors.paid_to && (
                <p className="text-xs text-destructive mt-0.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />{errors.paid_to}
                </p>
              )}
            </div>

            <div className="pt-1">
              <Label className={`text-xs ${reviewHints.notes ? 'text-amber-700 dark:text-amber-400' : ''}`}>
                What was it for? *
                <span className="ml-1 font-normal text-muted-foreground">— a note you'll remember</span>
                {reviewHints.notes && <span className="ml-1.5 text-amber-600 dark:text-amber-400">← fill this in</span>}
              </Label>
              <Textarea
                placeholder="e.g. Pepperoni pizza for Friday night, Monitor for home office, May electricity bill"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                className={`mt-1 resize-none ${
                  errors.notes ? 'border-destructive' :
                  reviewHints.notes ? 'border-amber-400 dark:border-amber-500 ring-1 ring-amber-400/40' : ''
                }`}
                rows={2}
              />
              {errors.notes && (
                <p className="text-xs text-destructive mt-0.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />{errors.notes}
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* ── Account ── */}
          <div>
            <Label className="text-xs">Account</Label>
            <Select
              value={form.account_id || '__none'}
              onValueChange={(v) => set('account_id', v === '__none' ? '' : v)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select account…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No account</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}{a.last_four ? ` ••••${a.last_four}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Trip ── */}
          {trips.filter((t) => t.status !== 'archived').length > 0 && (
            <div>
              <Label className="text-xs">Trip</Label>
              <Select
                value={form.trip_id || '__none'}
                onValueChange={(v) => set('trip_id', v === '__none' ? '' : v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="No trip" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No trip</SelectItem>
                  {trips
                    .filter((t) => t.status !== 'archived')
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                        {t.start_date && (
                          <span className="ml-1.5 text-muted-foreground text-xs">
                            {t.start_date.slice(0, 7)}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── Optional raw description ── */}
          <div>
            <Label className="text-xs text-muted-foreground">
              Bank Description
              <span className="ml-1 font-normal">(optional — raw text from statement)</span>
            </Label>
            <Input
              placeholder="e.g. AMZN MKTP US*AB12C, WHOLEFDS #1234"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              className="mt-1 text-muted-foreground"
            />
          </div>

          <Separator />

          {/* ── Categorization ── */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Classification</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={`text-xs ${reviewHints.category ? 'text-amber-700 dark:text-amber-400' : ''}`}>
                  Category
                  {reviewHints.category && <span className="ml-1.5 text-amber-600 dark:text-amber-400">← fill this in</span>}
                </Label>
                <Select
                  value={form.category || '__none'}
                  onValueChange={(v) => { set('category', v === '__none' ? '' : v); set('subcategory', '') }}
                >
                  <SelectTrigger className={`mt-1 ${
                    reviewHints.category && !form.category
                      ? 'border-amber-400 dark:border-amber-500 ring-1 ring-amber-400/40'
                      : ''
                  }`}>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Uncategorized</SelectItem>
                    {ALL_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className={`text-xs ${reviewHints.subcategory ? 'text-amber-700 dark:text-amber-400' : ''}`}>
                  Subcategory
                  {reviewHints.subcategory && <span className="ml-1.5 text-amber-600 dark:text-amber-400">← fill this in</span>}
                </Label>
                <Select
                  value={form.subcategory || '__none'}
                  onValueChange={(v) => set('subcategory', v === '__none' ? '' : v)}
                  disabled={!form.category || subcats.length === 0}
                >
                  <SelectTrigger className={`mt-1 ${
                    reviewHints.subcategory && !form.subcategory
                      ? 'border-amber-400 dark:border-amber-500 ring-1 ring-amber-400/40'
                      : ''
                  }`}>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {subcats.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Need / Want / Savings</Label>
                <Select
                  value={form.need_want_savings || '__none'}
                  onValueChange={(v) => set('need_want_savings', v === '__none' ? '' : v)}
                >
                  <SelectTrigger className="mt-1 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">—</SelectItem>
                    {NEED_WANT_SAVINGS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Fixed / Variable</Label>
                <Select
                  value={form.fixed_variable || '__none'}
                  onValueChange={(v) => set('fixed_variable', v === '__none' ? '' : v)}
                >
                  <SelectTrigger className="mt-1 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">—</SelectItem>
                    {FIXED_VARIABLE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Personal / Work</Label>
                <Select
                  value={form.personal_work_shared || '__none'}
                  onValueChange={(v) => set('personal_work_shared', v === '__none' ? '' : v)}
                >
                  <SelectTrigger className="mt-1 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">—</SelectItem>
                    {PERSONAL_WORK_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Reimbursement ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reimbursable</p>
                <p className="text-xs text-muted-foreground mt-0.5">Mark this as a reimbursable expense</p>
              </div>
              <Switch checked={form.is_reimbursable} onCheckedChange={(v) => set('is_reimbursable', v)} />
            </div>
            {form.is_reimbursable && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Source / Employer</Label>
                  <Input
                    placeholder="Acme Corp"
                    value={form.reimbursement_source}
                    onChange={(e) => set('reimbursement_source', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Expected Amount</Label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={form.expected_reimbursement}
                      onChange={(e) => set('expected_reimbursement', e.target.value)}
                      className="pl-7"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* ── Misc ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Recurring</Label>
              <Switch
                checked={form.is_recurring}
                onCheckedChange={(v) => { set('is_recurring', v); if (!v) setCreateSub(false) }}
              />
            </div>
            {form.is_recurring && !isEdit && (
              <div className="rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 px-3 py-2.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-violet-700 dark:text-violet-300">Also add as subscription?</p>
                  <p className="text-xs text-violet-600/70 dark:text-violet-400/70 mt-0.5">Creates a matching entry in your Subscriptions tracker</p>
                </div>
                <Switch checked={createSub} onCheckedChange={setCreateSub} />
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">Tags</Label>
              <Input
                placeholder="travel, q4, client-name  (comma separated)"
                value={form.tags}
                onChange={(e) => set('tags', e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <SheetFooter className="pt-2 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Update Transaction' : 'Add Transaction'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
