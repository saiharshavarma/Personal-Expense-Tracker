import { useState } from 'react'
import { Plus, Pencil, Trash2, CreditCard, Building2, Wallet, TrendingUp, Banknote } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useAccountsStore } from '@/store'
import type { Account, AccountType } from '@/types'

const ACCOUNT_TYPE_OPTIONS: { value: AccountType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'checking', label: 'Checking', icon: Building2 },
  { value: 'savings', label: 'Savings', icon: Wallet },
  { value: 'credit_card', label: 'Credit Card', icon: CreditCard },
  { value: 'investment', label: 'Investment', icon: TrendingUp },
  { value: 'cash', label: 'Cash', icon: Banknote },
]

const ACCOUNT_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#06b6d4',
]

const defaultForm = {
  name: '',
  type: 'credit_card' as AccountType,
  institution: '',
  last_four: '',
  currency: 'USD',
  color: ACCOUNT_COLORS[0],
}

interface AccountsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AccountsModal({ open, onOpenChange }: AccountsModalProps) {
  const { accounts, addAccount, updateAccount, deleteAccount } = useAccountsStore()
  const [form, setForm] = useState(defaultForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const resetForm = () => {
    setForm(defaultForm)
    setEditingId(null)
    setError('')
  }

  const startEdit = (acct: Account) => {
    setForm({
      name: acct.name,
      type: acct.type,
      institution: acct.institution ?? '',
      last_four: acct.last_four ?? '',
      currency: acct.currency,
      color: acct.color ?? ACCOUNT_COLORS[0],
    })
    setEditingId(acct.id)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Account name is required'); return }
    setIsSubmitting(true)
    setError('')
    try {
      const payload = {
        ...form,
        institution: form.institution || null,
        last_four: form.last_four || null,
      }
      if (editingId) {
        await updateAccount(editingId, payload)
      } else {
        await addAccount(payload)
      }
      resetForm()
    } catch {
      setError('Failed to save account')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deactivate this account?')) return
    await deleteAccount(id)
    if (editingId === id) resetForm()
  }

  const typeIcon = (type: AccountType) => {
    const opt = ACCOUNT_TYPE_OPTIONS.find((o) => o.value === type)
    const Icon = opt?.icon ?? CreditCard
    return <Icon className="w-4 h-4" />
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Accounts</DialogTitle>
          <DialogDescription>Add and edit your payment accounts</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6 mt-2">
          {/* Account list */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Your Accounts ({accounts.length})
            </p>
            {accounts.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <CreditCard className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No accounts yet</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {accounts.map((acct) => (
                  <div
                    key={acct.id}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors hover:bg-accent ${editingId === acct.id ? 'border-primary bg-primary/5' : ''}`}
                    onClick={() => startEdit(acct)}
                  >
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center text-white flex-shrink-0"
                      style={{ backgroundColor: acct.color ?? '#6366f1' }}
                    >
                      {typeIcon(acct.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{acct.name}</p>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-xs py-0">{acct.type}</Badge>
                        {acct.last_four && <span className="text-xs text-muted-foreground">••••{acct.last_four}</span>}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(acct.id) }}
                      className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={resetForm}
            >
              <Plus className="w-3.5 h-3.5" /> New Account
            </Button>
          </div>

          {/* Form */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              {editingId ? 'Edit Account' : 'New Account'}
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label htmlFor="acct-name" className="text-xs">Account Name *</Label>
                <Input
                  id="acct-name"
                  placeholder="Chase Sapphire Reserve"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Account Type *</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as AccountType }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPE_OPTIONS.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="acct-inst" className="text-xs">Institution</Label>
                  <Input
                    id="acct-inst"
                    placeholder="Chase"
                    value={form.institution}
                    onChange={(e) => setForm((f) => ({ ...f, institution: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="acct-last4" className="text-xs">Last 4 Digits</Label>
                  <Input
                    id="acct-last4"
                    placeholder="1234"
                    maxLength={4}
                    value={form.last_four}
                    onChange={(e) => setForm((f) => ({ ...f, last_four: e.target.value.replace(/\D/g, '') }))}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Color</Label>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {ACCOUNT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, color: c }))}
                      className={`w-6 h-6 rounded-full transition-transform ${form.color === c ? 'ring-2 ring-offset-2 ring-ring scale-110' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" disabled={isSubmitting} className="flex-1">
                  {editingId ? <><Pencil className="w-3.5 h-3.5" /> Update</> : <><Plus className="w-3.5 h-3.5" /> Add Account</>}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" size="sm" onClick={resetForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
