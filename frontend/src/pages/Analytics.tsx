import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/utils/apiClient'
import { formatCurrency, getCurrentMonthYear, monthName, monthNameShort } from '@/lib/utils'

const { month: curMonth, year: curYear } = getCurrentMonthYear()

const CHART_COLORS = [
  '#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ef4444',
  '#f59e0b', '#14b8a6', '#ec4899', '#6366f1', '#84cc16',
]

const NWS_COLORS: Record<string, string> = {
  need: '#ef4444', want: '#f97316', savings: '#22c55e', na: '#94a3b8',
}

const REIMB_LABELS: Record<string, string> = {
  to_submit: 'To Submit', submitted: 'Submitted', approved: 'Approved',
  paid: 'Paid', partial: 'Partial', rejected: 'Rejected',
}

const REIMB_COLORS: Record<string, string> = {
  to_submit: '#f59e0b', submitted: '#3b82f6', approved: '#a855f7',
  paid: '#22c55e', partial: '#f97316', rejected: '#ef4444',
}

function ml(year: number, month: number) {
  return monthNameShort(month) + " '" + String(year).slice(2)
}

// ── Shared tooltips ──────────────────────────────────────────────────────────

function CurrencyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover text-popover-foreground border border-border rounded-lg px-3 py-2 shadow-lg text-xs z-50">
      {label && <p className="font-semibold mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color ?? p.fill }} className="leading-5">
          {p.name}: <span className="font-medium">{formatCurrency(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="bg-popover text-popover-foreground border border-border rounded-lg px-3 py-2 shadow-lg text-xs z-50">
      <p style={{ color: p.payload.fill ?? p.fill }} className="font-semibold capitalize">{p.name}</p>
      <p>{formatCurrency(p.value)} <span className="text-muted-foreground">({p.payload.pct ?? 0}%)</span></p>
    </div>
  )
}

function SavingsTooltip({ active, payload, label, isAmount }: any) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div className="bg-popover text-popover-foreground border border-border rounded-lg px-3 py-2 shadow-lg text-xs z-50">
      {label && <p className="font-semibold mb-1">{label}</p>}
      {isAmount
        ? <p style={{ color: val >= 0 ? '#22c55e' : '#ef4444' }}>
            Net Savings: <span className="font-medium">{val >= 0 ? '+' : ''}{formatCurrency(val)}</span>
          </p>
        : <p style={{ color: '#22c55e' }}>Savings Rate: <span className="font-medium">{val}%</span></p>
      }
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyChart({ height = 192 }: { height?: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground" style={{ height }}>
      <span className="text-3xl">📊</span>
      <p className="text-xs text-center">Import transactions to see this chart</p>
    </div>
  )
}

// ── Chart components ─────────────────────────────────────────────────────────

function SpendTrendChart({ months }: { months: number }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/spend-trends?months=${months}`)
      .then(r => setData(r.data.map((d: any) => ({ ...d, label: ml(d.year, d.month) }))))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [months])

  if (loading) return <Skeleton className="w-full" style={{ height: 192 }} />
  if (!data.length) return <EmptyChart />

  return (
    <ResponsiveContainer width="100%" height={192}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#888" strokeOpacity={0.15} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false}
          tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} width={42} />
        <Tooltip content={<CurrencyTooltip />} />
        <Area dataKey="total" name="Spend" stroke="#3b82f6" strokeWidth={2} fill="url(#spendGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function IncomeExpensesChart({ months }: { months: number }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/income-expenses?months=${months}`)
      .then(r => setData(r.data.map((d: any) => ({ ...d, label: ml(d.year, d.month) }))))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [months])

  if (loading) return <Skeleton className="w-full" style={{ height: 192 }} />
  if (!data.length) return <EmptyChart />

  return (
    <ResponsiveContainer width="100%" height={192}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#888" strokeOpacity={0.15} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false}
          tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} width={42} />
        <Tooltip content={<CurrencyTooltip />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="income" name="Income" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function CategoryBarChart({ month, year }: { month: number; year: number }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/category-breakdown?month=${month}&year=${year}`)
      .then(r => setData(r.data.slice(0, 8)))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [month, year])

  if (loading) return <Skeleton className="w-full" style={{ height: 256 }} />
  if (!data.length) return <EmptyChart height={256} />

  return (
    <ResponsiveContainer width="100%" height={256}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#888" strokeOpacity={0.15} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false}
          tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
        <YAxis dataKey="category" type="category" tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false} width={105} />
        <Tooltip content={<CurrencyTooltip />} cursor={{ fill: 'rgba(100,100,100,0.07)' }} />
        <Bar dataKey="total" name="Amount" radius={[0, 4, 4, 0]} maxBarSize={20}>
          {data.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function CategoryPieChart({ month, year }: { month: number; year: number }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/category-breakdown?month=${month}&year=${year}`)
      .then(r => setData(r.data.slice(0, 7)))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [month, year])

  if (loading) return <Skeleton className="w-full" style={{ height: 256 }} />
  if (!data.length) return <EmptyChart height={256} />

  const colored = data.map((d: any, i: number) => ({ ...d, fill: CHART_COLORS[i % CHART_COLORS.length] }))

  return (
    <ResponsiveContainer width="100%" height={256}>
      <PieChart>
        <Pie data={colored} dataKey="total" nameKey="category"
          cx="50%" cy="45%" innerRadius={55} outerRadius={88} paddingAngle={2}>
          {colored.map((d: any, i: number) => <Cell key={i} fill={d.fill} />)}
        </Pie>
        <Tooltip content={<PieTooltip />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, marginTop: 4 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function SavingsRateChart({ months }: { months: number }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/savings-rate?months=${months}`)
      .then(r => setData(r.data.map((d: any) => ({ ...d, label: ml(d.year, d.month) }))))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [months])

  if (loading) return <Skeleton className="w-full" style={{ height: 192 }} />
  if (!data.length) return <EmptyChart />

  // When income = 0, savings_rate is null. Fall back to dollar net savings.
  const hasRateData = data.some((d) => d.savings_rate != null)
  const color = hasRateData ? '#22c55e' : '#3b82f6'
  const gradId = hasRateData ? 'savingsGrad' : 'netGrad'

  return (
    <div>
      {!hasRateData && (
        <p className="text-xs text-muted-foreground mb-2 px-1">
          No income transactions found — showing net spend (income − expenses).
          Import income/paycheck transactions to see your savings rate.
        </p>
      )}
      <ResponsiveContainer width="100%" height={192}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#888" strokeOpacity={0.15} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false}
            tickFormatter={hasRateData
              ? (v) => `${v}%`
              : (v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v < -1000 ? '-' + (Math.abs(v) / 1000).toFixed(0) + 'k' : v}`
            }
            width={42}
          />
          <Tooltip content={<SavingsTooltip isAmount={!hasRateData} />} />
          {hasRateData
            ? <Area dataKey="savings_rate" name="Savings Rate" stroke={color} strokeWidth={2} fill={`url(#${gradId})`} dot={false} />
            : <Area dataKey="savings_amount" name="Net Savings" stroke={color} strokeWidth={2} fill={`url(#${gradId})`} dot={false} />
          }
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function NWSDonut({ month, year }: { month: number; year: number }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/need-want-savings?month=${month}&year=${year}`)
      .then(r => setData(r.data.map((d: any) => ({ ...d, fill: NWS_COLORS[d.type] ?? '#94a3b8' }))))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [month, year])

  if (loading) return <Skeleton className="w-full" style={{ height: 192 }} />
  if (!data.length) return <EmptyChart />

  return (
    <ResponsiveContainer width="100%" height={192}>
      <PieChart>
        <Pie data={data} dataKey="total" nameKey="type"
          cx="50%" cy="45%" innerRadius={48} outerRadius={72} paddingAngle={2}>
          {data.map((d: any, i: number) => <Cell key={i} fill={d.fill} />)}
        </Pie>
        <Tooltip content={<PieTooltip />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }}
          formatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function RecurringDonut({ month, year }: { month: number; year: number }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/recurring-split?month=${month}&year=${year}`)
      .then(r => setData(r.data.map((d: any) => ({
        ...d,
        fill: d.type === 'recurring' ? '#3b82f6' : '#a855f7',
      }))))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [month, year])

  if (loading) return <Skeleton className="w-full" style={{ height: 192 }} />
  if (!data.length) return <EmptyChart />

  return (
    <ResponsiveContainer width="100%" height={192}>
      <PieChart>
        <Pie data={data} dataKey="total" nameKey="type"
          cx="50%" cy="45%" innerRadius={48} outerRadius={72} paddingAngle={2}>
          {data.map((d: any, i: number) => <Cell key={i} fill={d.fill} />)}
        </Pie>
        <Tooltip content={<PieTooltip />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }}
          formatter={(v: string) => v === 'recurring' ? 'Recurring' : 'One-time'} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function TopMerchantsChart({ month, year }: { month: number; year: number }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/top-merchants?limit=8&month=${month}&year=${year}`)
      .then(r => setData(r.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [month, year])

  if (loading) return <Skeleton className="w-full" style={{ height: 256 }} />
  if (!data.length) return <EmptyChart height={256} />

  return (
    <ResponsiveContainer width="100%" height={256}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#888" strokeOpacity={0.15} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false}
          tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
        <YAxis dataKey="merchant" type="category" tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false} width={110} />
        <Tooltip content={<CurrencyTooltip />} cursor={{ fill: 'rgba(100,100,100,0.07)' }} />
        <Bar dataKey="total" name="Amount" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function ReimbursementChart() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get('/analytics/reimbursement-stats')
      .then(r => setData(r.data.map((d: any) => ({
        ...d,
        label: REIMB_LABELS[d.status] ?? d.status,
        fill: REIMB_COLORS[d.status] ?? '#888',
      }))))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton className="w-full" style={{ height: 192 }} />
  if (!data.length) return <EmptyChart />

  return (
    <ResponsiveContainer width="100%" height={192}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#888" strokeOpacity={0.15} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false}
          tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} width={42} />
        <Tooltip content={<CurrencyTooltip />} />
        <Bar dataKey="total" name="Amount" radius={[3, 3, 0, 0]} maxBarSize={48}>
          {data.map((d: any, i: number) => <Cell key={i} fill={d.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Layout helpers ───────────────────────────────────────────────────────────

function Section({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg leading-none">{emoji}</span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </motion.div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-sm font-medium leading-none">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardHeader>
      <CardContent className="pb-4 px-5">
        {children}
      </CardContent>
    </Card>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export function Analytics() {
  const [month, setMonth] = useState(curMonth)
  const [year, setYear] = useState(curYear)
  const [trendMonths, setTrendMonths] = useState(6)

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }
  const isCurrentMonth = month === curMonth && year === curYear

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Deep insights into your financial patterns</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Trend window selector */}
          <div className="flex items-center rounded-lg border overflow-hidden text-xs">
            {([3, 6, 12] as const).map(n => (
              <button
                key={n}
                onClick={() => setTrendMonths(n)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  trendMonths === n
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent text-muted-foreground'
                }`}
              >
                {n}mo
              </button>
            ))}
          </div>

          {/* Month picker for snapshot charts */}
          <div className="flex items-center rounded-lg border bg-card">
            <button onClick={prevMonth} className="p-2 hover:bg-accent rounded-l-lg transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-3 py-1.5 text-xs font-medium min-w-[110px] text-center">
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
            <Button variant="ghost" size="sm" className="text-xs h-8"
              onClick={() => { setMonth(curMonth); setYear(curYear) }}>
              This month
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-8">
        {/* ── Spending Trends ── */}
        <Section title="Spending Trends" emoji="📈">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Monthly Spend" subtitle={`Last ${trendMonths} months`}>
              <SpendTrendChart months={trendMonths} />
            </ChartCard>
            <ChartCard title="Income vs Expenses" subtitle={`Last ${trendMonths} months`}>
              <IncomeExpensesChart months={trendMonths} />
            </ChartCard>
          </div>
        </Section>

        {/* ── Category Analysis ── */}
        <Section title="Category Analysis" emoji="🗂️">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Spend by Category" subtitle={`${monthName(month)} ${year} — top 8`}>
              <CategoryBarChart month={month} year={year} />
            </ChartCard>
            <ChartCard title="Category Mix" subtitle={`${monthName(month)} ${year}`}>
              <CategoryPieChart month={month} year={year} />
            </ChartCard>
          </div>
        </Section>

        {/* ── Income & Savings ── */}
        <Section title="Income & Savings" emoji="💰">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <ChartCard title="Savings Rate Trend" subtitle={`Last ${trendMonths} months`}>
                <SavingsRateChart months={trendMonths} />
              </ChartCard>
            </div>
            <ChartCard title="Need / Want / Savings" subtitle={`${monthName(month)} ${year}`}>
              <NWSDonut month={month} year={year} />
            </ChartCard>
          </div>
        </Section>

        {/* ── Spending Patterns ── */}
        <Section title="Spending Patterns" emoji="🔄">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <ChartCard title="Top Merchants" subtitle={`${monthName(month)} ${year}`}>
                <TopMerchantsChart month={month} year={year} />
              </ChartCard>
            </div>
            <ChartCard title="Recurring vs One-time" subtitle={`${monthName(month)} ${year}`}>
              <RecurringDonut month={month} year={year} />
            </ChartCard>
          </div>
        </Section>

        {/* ── Reimbursements ── */}
        <Section title="Reimbursements" emoji="💳">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Pipeline by Status" subtitle="All time">
              <ReimbursementChart />
            </ChartCard>
          </div>
        </Section>
      </div>
    </MainLayout>
  )
}
