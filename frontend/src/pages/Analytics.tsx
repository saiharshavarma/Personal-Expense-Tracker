import { motion } from 'framer-motion'
import { BarChart3, TrendingUp, DollarSign, Receipt, CreditCard, RefreshCw, CalendarDays } from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const SECTIONS = [
  {
    title: 'Spending Trends',
    icon: TrendingUp,
    charts: ['Monthly spend trend', 'Month-over-month comparison', 'Year-over-year comparison', 'Quarter-over-quarter'],
  },
  {
    title: 'Category Analysis',
    icon: BarChart3,
    charts: ['Category breakdown', 'Category MoM trends', 'Category ranking table', 'Merchant drill-down'],
  },
  {
    title: 'Income & Savings',
    icon: DollarSign,
    charts: ['Income vs expenses', 'Savings rate trend', 'Net vs gross spend', 'Needs/Wants/Savings ratio'],
  },
  {
    title: 'Reimbursements',
    icon: Receipt,
    charts: ['Pipeline funnel', 'Pending over time', 'By source', 'Avg days to reimbursement'],
  },
  {
    title: 'Spending Patterns',
    icon: CreditCard,
    charts: ['Payment method split', 'Fixed vs variable', 'Recurring vs one-time', 'Daily spend heatmap', 'Weekday vs weekend', 'Top 10 merchants', 'Top 10 categories'],
  },
  {
    title: 'Projections',
    icon: TrendingUp,
    charts: ['Month-end projection', 'Projected vs budget'],
  },
  {
    title: 'Subscriptions',
    icon: RefreshCw,
    charts: ['Subscription cost trend', 'By category', 'Personal vs work split'],
  },
]

export function Analytics() {
  return (
    <MainLayout>
      <TopBar
        title="Analytics"
        subtitle="Deep insights into your financial patterns"
      />

      <div className="space-y-8">
        {SECTIONS.map(({ title, icon: Icon, charts }, si) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: si * 0.08 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-lg font-semibold">{title}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {charts.map((chart, ci) => (
                <Card key={chart} className="overflow-hidden">
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm text-muted-foreground">{chart}</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <Skeleton className="h-[120px] w-full rounded-lg" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      <Card className="mt-6 border-dashed">
        <CardContent className="py-8 text-center">
          <CalendarDays className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">Charts powered by your data</p>
          <p className="text-sm text-muted-foreground mt-1">Import transactions to see all 24 charts come to life. Analytics are implemented in Phase 9.</p>
        </CardContent>
      </Card>
    </MainLayout>
  )
}
