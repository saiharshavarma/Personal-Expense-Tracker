import { motion } from 'framer-motion'
import { Receipt, Plus, ArrowRight, Clock, CheckCircle, XCircle, DollarSign, Users } from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

const COLUMNS = [
  { id: 'to_submit', label: 'To Submit', icon: Clock, color: 'text-yellow-500', count: 0 },
  { id: 'submitted', label: 'Submitted', icon: ArrowRight, color: 'text-blue-500', count: 0 },
  { id: 'approved', label: 'Approved', icon: CheckCircle, color: 'text-green-500', count: 0 },
  { id: 'paid', label: 'Paid', icon: DollarSign, color: 'text-emerald-500', count: 0 },
]

const SUMMARY_CARDS = [
  { label: 'Pending', amount: '$0.00', sub: '0 items', color: 'text-yellow-500' },
  { label: 'Submitted', amount: '$0.00', sub: '0 items', color: 'text-blue-500' },
  { label: 'Received This Month', amount: '$0.00', sub: '0 items', color: 'text-green-500' },
  { label: 'Splitwise Balance', amount: '$0.00', sub: 'net owed to you', color: 'text-purple-500' },
]

export function Reimbursements() {
  return (
    <MainLayout>
      <TopBar
        title="Reimbursements"
        subtitle="Track what you're owed — from work, friends, and shared expenses"
        actions={
          <>
            <Button variant="outline" size="sm"><Users className="w-4 h-4" />Splitwise Tracker</Button>
            <Button size="sm"><Plus className="w-4 h-4" />Mark Reimbursable</Button>
          </>
        }
      />

      {/* Summary row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {SUMMARY_CARDS.map(({ label, amount, sub, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{amount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Kanban board */}
      <div className="grid grid-cols-4 gap-4">
        {COLUMNS.map(({ id, label, icon: Icon, color, count }, ci) => (
          <motion.div
            key={id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: ci * 0.07 }}
            className="flex flex-col gap-3"
          >
            {/* Column header */}
            <div className="flex items-center gap-2 px-1">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-sm font-medium">{label}</span>
              <Badge variant="outline" className="ml-auto text-xs">{count}</Badge>
            </div>

            {/* Column body */}
            <div className="rounded-xl border bg-muted/30 min-h-[400px] p-2 space-y-2">
              {/* Skeleton placeholders */}
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="rounded-lg border bg-card p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="flex justify-between items-center pt-1">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                </div>
              ))}

              {/* Empty state */}
              <div className="flex flex-col items-center justify-center py-8 text-center opacity-50">
                <Receipt className="w-6 h-6 text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">No items</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Splitwise section stub */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4" /> Splitwise Tracker
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">No splitwise entries yet</p>
          <p className="text-sm text-muted-foreground mt-1">Track shared expenses, settlements sent, and amounts owed to you</p>
          <Button size="sm" variant="outline" className="mt-4"><Plus className="w-4 h-4" />Add Entry</Button>
        </CardContent>
      </Card>

      {/* Batches section stub */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="w-4 h-4" /> Reimbursement Batches
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center">
          <XCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">No batches created</p>
          <p className="text-sm text-muted-foreground mt-1">Group multiple reimbursables into a single batch and export a PDF summary</p>
          <Button size="sm" variant="outline" className="mt-4"><Plus className="w-4 h-4" />Create Batch</Button>
        </CardContent>
      </Card>
    </MainLayout>
  )
}
