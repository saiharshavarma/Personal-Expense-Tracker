import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Plus, TrendingUp, TrendingDown, DollarSign, CreditCard, RefreshCw, Target, Lightbulb, ArrowUpRight } from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { cn, monthName, formatCurrency, getCurrentMonthYear } from '@/lib/utils'

const { month: currentMonth, year: currentYear } = getCurrentMonthYear()

const WIDGET_PLACEHOLDERS = [
  { title: 'Monthly Spend vs Budget', icon: Target, size: 'lg', description: 'Track your spending against your budget' },
  { title: 'Category Breakdown', icon: TrendingDown, size: 'md', description: 'Where your money is going' },
  { title: 'Net vs Gross Spend', icon: DollarSign, size: 'md', description: 'After reimbursements' },
  { title: 'Reimbursement Pipeline', icon: RefreshCw, size: 'sm', description: 'Outstanding reimbursements' },
  { title: 'AI Insights', icon: Lightbulb, size: 'sm', description: 'Smart observations about your finances' },
  { title: 'Recent Transactions', icon: CreditCard, size: 'md', description: 'Last 10 transactions' },
  { title: 'Month-End Projection', icon: TrendingUp, size: 'sm', description: 'Projected spend at month end' },
  { title: 'Savings Rate', icon: ArrowUpRight, size: 'sm', description: 'Your savings this month' },
]

export function Dashboard() {
  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }
  const isCurrentMonth = month === currentMonth && year === currentYear

  return (
    <MainLayout>
      {/* Month selector */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your financial overview at a glance</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border bg-card">
            <button onClick={prevMonth} className="p-2 hover:bg-accent rounded-l-lg transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-4 py-2 text-sm font-medium min-w-[140px] text-center">
              {monthName(month)} {year}
            </div>
            <button
              onClick={nextMonth}
              disabled={isCurrentMonth}
              className="p-2 hover:bg-accent rounded-r-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {!isCurrentMonth && (
            <Button variant="ghost" size="sm" onClick={() => { setMonth(currentMonth); setYear(currentYear) }}>
              Today
            </Button>
          )}
        </div>
      </div>

      {/* Widget grid */}
      <div className="grid grid-cols-12 gap-4">
        {WIDGET_PLACEHOLDERS.map(({ title, icon: Icon, size, description }, i) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={cn(
              'col-span-12',
              size === 'lg' && 'sm:col-span-8',
              size === 'md' && 'sm:col-span-6',
              size === 'sm' && 'sm:col-span-4',
            )}
          >
            <Card className="h-full min-h-[180px]">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center min-h-[120px] text-center gap-3">
                <Skeleton className="h-8 w-24" />
                <p className="text-xs text-muted-foreground">{description}</p>
                <Badge variant="outline" className="text-xs">Available in Phase 10</Badge>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* CTA for no data */}
      <Card className="mt-4 border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-10 text-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Plus className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="font-medium">Get started with your first import</p>
            <p className="text-sm text-muted-foreground mt-1">Import a bank statement to see your dashboard come to life</p>
          </div>
          <Button size="sm" variant="outline">Import Bank Statement</Button>
        </CardContent>
      </Card>
    </MainLayout>
  )
}
