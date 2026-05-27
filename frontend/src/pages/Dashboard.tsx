import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, DollarSign,
  CreditCard, RefreshCw, AlertCircle, ArrowUpRight, ArrowDownRight,
  Upload, BarChart2, Brain, Sparkles, CheckCircle2,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Cell, ResponsiveContainer,
} from 'recharts'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { api } from '@/utils/apiClient'
import { cn, formatCurrency, formatDate, getCurrentMonthYear, monthName } from '@/lib/utils'
import { getCategoryColor } from '@/lib/categories'
import type { Transaction } from '@/types'

const { month: currentMonth, year: currentYear } = getCurrentMonthYear()

// ── Getting-started guide (Phase 14) ─────────────────────────────────────────

const GETTING_STARTED_STEPS = [
  {
    icon: Upload,
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    title: 'Import your first transactions',
    desc: 'Upload a CSV or PDF statement from Chase, Amex, BoA, or any bank.',
    href: '/import',
    action: 'Go to Import',
  },
  {
    icon: BarChart2,
    color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    title: 'Set up a monthly budget',
    desc: 'Define spending limits per category — your 50/30/20 plan awaits.',
    href: '/budget',
    action: 'Set Budget',
  },
  {
    icon: Brain,
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    title: 'Enable AI insights',
    desc: 'Ask natural-language questions about your spending. Opt-in in Settings.',
    href: '/settings',
    action: 'Open Settings',
  },
  {
    icon: Sparkles,
    color: 'bg-green-500/10 text-green-600 dark:text-green-400',
    title: 'Track subscriptions & reimbursements',
    desc: 'See your recurring costs and manage work-expense repayments.',
    href: '/subscriptions',
    action: 'View Subscriptions',
  },
]

function GettingStarted() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="mb-6"
    >
      <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-background p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold">Welcome to your Finance Dashboard</h2>
            <p className="text-sm text-muted-foreground">Follow these steps to get started</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {GETTING_STARTED_STEPS.map(({ icon: Icon, color, title, desc, href, action }) => (
            <a
              key={href}
              href={href}
              className="flex items-start gap-3 p-3 rounded-lg bg-card border hover:border-primary/40 hover:shadow-sm transition-all group"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium group-hover:text-primary transition-colors">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                <p className="text-xs text-primary font-medium mt-1.5">{action} →</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

const CHART_COLORS = [
  '#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ef4444',
  '#f59e0b', '#14b8a6', '#ec4899', '#6366f1', '#84cc16',
]

interface DashboardSummary {
  month: number; year: number
  expenses: number; income: number; savings: number; savings_rate: number
  transaction_count: number
  top_category: string | null; top_category_total: number
  mom_change_pct: number; prev_month_expenses: number
  reimbursement_pending: number; reimbursement_count: number
  recurring_total: number; needs_review_count: number
}

interface CategoryItem { category: string; total: number; count: number; pct: number }

// ── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string
  value: string
  sub?: string
  trend?: number | null
  icon: React.ElementType
  iconColor?: string
  delay?: number
}

function StatCard({ title, value, sub, trend, icon: Icon, iconColor = 'text-primary', delay = 0 }: StatCardProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium mb-1">{title}</p>
              <p className="text-2xl font-bold tracking-tight">{value}</p>
              {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
              {trend != null && (
                <div className={cn(
                  'flex items-center gap-0.5 text-xs font-medium mt-1',
                  trend > 0 ? 'text-red-500' : trend < 0 ? 'text-green-500' : 'text-muted-foreground',
                )}>
                  {trend > 0
                    ? <ArrowUpRight className="w-3.5 h-3.5" />
                    : trend < 0
                    ? <ArrowDownRight className="w-3.5 h-3.5" />
                    : null}
                  {trend === 0 ? 'Same as last month' : `${Math.abs(trend)}% vs last month`}
                </div>
              )}
            </div>
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon className={cn('w-4.5 h-4.5', iconColor)} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ── Category bar chart ───────────────────────────────────────────────────────

function CategoryBarChart({ month, year }: { month: number; year: number }) {
  const [data, setData] = useState<CategoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/category-breakdown?month=${month}&year=${year}`)
      .then(r => setData(r.data.slice(0, 7)))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [month, year])

  if (loading) return <Skeleton className="h-48 w-full" />
  if (!data.length) return (
    <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
      No spending data for this month
    </div>
  )

  return (
    <ResponsiveContainer width="100%" height={192}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#888" strokeOpacity={0.12} />
        <XAxis type="number" tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false}
          tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
        <YAxis dataKey="category" type="category" tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} width={100} />
        <Tooltip
          formatter={(v: number) => [formatCurrency(v), 'Spend']}
          contentStyle={{ fontSize: 11, borderRadius: 8 }}
          cursor={{ fill: 'rgba(100,100,100,0.07)' }}
        />
        <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={16}>
          {data.map((_: CategoryItem, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Recent transactions ──────────────────────────────────────────────────────

function RecentTransactions({ month, year }: { month: number; year: number }) {
  const [txns, setTxns] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    // Pick the date range for the selected month
    const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    api.get('/transactions', { params: { date_from: dateFrom, date_to: dateTo, page_size: 6, sort_by: 'date', sort_dir: 'desc' } })
      .then(r => setTxns(r.data.items ?? []))
      .catch(() => setTxns([]))
      .finally(() => setLoading(false))
  }, [month, year])

  if (loading) return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex justify-between items-center py-2">
          <div className="space-y-1">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-2.5 w-16" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )

  if (!txns.length) return (
    <p className="text-xs text-muted-foreground py-6 text-center">No transactions for this month</p>
  )

  return (
    <div className="divide-y divide-border">
      {txns.map(t => {
        const isDebit = t.direction === 'debit'
        const catColor = getCategoryColor(t.category)
        return (
          <div key={t.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{t.merchant ?? t.description_clean ?? t.description ?? '—'}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-muted-foreground">{formatDate(t.date)}</span>
                {t.category && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${catColor}`}>
                    {t.category}
                  </span>
                )}
              </div>
            </div>
            <span className={cn(
              'text-sm font-semibold tabular-nums flex-shrink-0',
              isDebit ? 'text-foreground' : 'text-green-600 dark:text-green-400',
            )}>
              {isDebit ? '−' : '+'}{formatCurrency(t.amount)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }
  const isCurrentMonth = month === currentMonth && year === currentYear

  useEffect(() => {
    setSummaryLoading(true)
    api.get(`/analytics/dashboard-summary?month=${month}&year=${year}`)
      .then(r => setSummary(r.data))
      .catch(() => setSummary(null))
      .finally(() => setSummaryLoading(false))
  }, [month, year])

  const savingsSign = summary ? (summary.savings >= 0 ? '+' : '') : ''

  return (
    <MainLayout>
      {/* Header + month picker */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Your financial overview at a glance</p>
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

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {summaryLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-28" />
                <Skeleton className="h-2.5 w-24" />
              </CardContent>
            </Card>
          ))
        ) : summary ? (
          <>
            <StatCard
              title="Total Spend"
              value={formatCurrency(summary.expenses)}
              trend={summary.mom_change_pct}
              icon={CreditCard}
              delay={0}
            />
            <StatCard
              title="Income"
              value={formatCurrency(summary.income)}
              sub={`${summary.transaction_count} transactions`}
              icon={DollarSign}
              iconColor="text-green-500"
              delay={0.04}
            />
            <StatCard
              title="Savings"
              value={`${savingsSign}${formatCurrency(summary.savings)}`}
              sub={`${summary.savings_rate}% savings rate`}
              icon={summary.savings >= 0 ? TrendingUp : TrendingDown}
              iconColor={summary.savings >= 0 ? 'text-green-500' : 'text-red-500'}
              delay={0.08}
            />
            <StatCard
              title="Needs Review"
              value={String(summary.needs_review_count)}
              sub={summary.needs_review_count === 0 ? 'All caught up!' : 'transactions'}
              icon={AlertCircle}
              iconColor={summary.needs_review_count > 0 ? 'text-amber-500' : 'text-green-500'}
              delay={0.12}
            />
          </>
        ) : (
          <div className="col-span-4 text-center py-6 text-sm text-muted-foreground">
            Failed to load summary. Make sure the backend is running.
          </div>
        )}
      </div>

      {/* ── Main content grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Category breakdown — spans 2 cols */}
        <motion.div className="lg:col-span-2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="h-full">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-medium">Spend by Category</CardTitle>
              <p className="text-xs text-muted-foreground">{monthName(month)} {year}</p>
            </CardHeader>
            <CardContent className="pb-4 px-5">
              <CategoryBarChart month={month} year={year} />
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick stats sidebar */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="flex flex-col gap-3 h-full">
            {/* Recurring */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <RefreshCw className="w-4 h-4 text-blue-500" />
                  <p className="text-xs font-medium">Recurring Costs</p>
                </div>
                {summaryLoading
                  ? <Skeleton className="h-6 w-28" />
                  : <p className="text-xl font-bold">{formatCurrency(summary?.recurring_total ?? 0)}</p>
                }
                <p className="text-xs text-muted-foreground mt-0.5">this month</p>
              </CardContent>
            </Card>

            {/* Top category */}
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Top Category</p>
                {summaryLoading ? (
                  <Skeleton className="h-5 w-32" />
                ) : summary?.top_category ? (
                  <>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getCategoryColor(summary.top_category)}`}>
                      {summary.top_category}
                    </span>
                    <p className="text-sm font-semibold mt-1">{formatCurrency(summary.top_category_total)}</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </CardContent>
            </Card>

            {/* Pending reimbursements */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-amber-500" />
                  <p className="text-xs font-medium">Pending Reimbursements</p>
                </div>
                {summaryLoading ? (
                  <Skeleton className="h-6 w-28" />
                ) : (
                  <>
                    <p className="text-xl font-bold">{formatCurrency(summary?.reimbursement_pending ?? 0)}</p>
                    {(summary?.reimbursement_count ?? 0) > 0 && (
                      <Badge variant="outline" className="text-xs mt-1">
                        {summary!.reimbursement_count} item{summary!.reimbursement_count !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </div>

      {/* ── Getting started (shown when no transactions yet) ── */}
      {!summaryLoading && (summary?.transaction_count ?? 0) === 0 && <GettingStarted />}

      {/* ── Recent transactions ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Recent Transactions</CardTitle>
              <a href="/transactions" className="text-xs text-primary hover:underline">View all</a>
            </div>
            <p className="text-xs text-muted-foreground">{monthName(month)} {year}</p>
          </CardHeader>
          <CardContent className="pb-4 px-5">
            <RecentTransactions month={month} year={year} />
          </CardContent>
        </Card>
      </motion.div>
    </MainLayout>
  )
}
