import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Eye, EyeOff } from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MonthYearPicker } from '@/components/MonthYearPicker'
import { api } from '@/utils/apiClient'
import { cn, formatCurrency, getCurrentMonthYear, monthName, monthNameShort } from '@/lib/utils'
import { useUIStore } from '@/store/ui'

// L-1: Do NOT evaluate getCurrentMonthYear() at module load time.
// Use the lazy-initializer form of useState in the component instead.

const CHART_COLORS = [
  '#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ef4444',
  '#f59e0b', '#14b8a6', '#ec4899', '#6366f1', '#84cc16',
]

const NWS_COLORS: Record<string, string> = {
  need: '#3b82f6', want: '#f97316', savings: '#22c55e', na: '#94a3b8',
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

// ── Chart theme tokens — respect dark/light mode ─────────────────────────────
const TICK_STYLE = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' }
const GRID_COLOR = 'hsl(var(--border))'

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
  // M-4: pct can be undefined (e.g. if the backend omits it on a zero-total slice)
  // or NaN (if data is combined client-side). Treat both as 0 for display.
  const pct = p.payload?.pct
  const pctDisplay = typeof pct === 'number' && isFinite(pct) ? pct : 0
  return (
    <div className="bg-popover text-popover-foreground border border-border rounded-lg px-3 py-2 shadow-lg text-xs z-50">
      <p style={{ color: p.payload.fill ?? p.fill }} className="font-semibold capitalize">{p.name}</p>
      <p>{formatCurrency(p.value)} <span className="text-muted-foreground">({pctDisplay}%)</span></p>
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

function SpendTrendChart({ months, excludeReimbursable }: { months: number; excludeReimbursable: boolean }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/spend-trends?months=${months}&exclude_reimbursable=${excludeReimbursable}`)
      .then(r => setData(r.data.map((d: any) => ({ ...d, label: ml(d.year, d.month) }))))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [months, excludeReimbursable])

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
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} strokeOpacity={0.4} />
        <XAxis dataKey="label" tick={TICK_STYLE} tickLine={false} axisLine={false} />
        <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false}
          tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} width={42} />
        <Tooltip content={<CurrencyTooltip />} />
        <Area dataKey="total" name="Spend" stroke="#3b82f6" strokeWidth={2} fill="url(#spendGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function IncomeExpensesChart({ months, excludeReimbursable }: { months: number; excludeReimbursable: boolean }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/income-expenses?months=${months}&exclude_reimbursable=${excludeReimbursable}`)
      .then(r => setData(r.data.map((d: any) => ({ ...d, label: ml(d.year, d.month) }))))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [months, excludeReimbursable])

  if (loading) return <Skeleton className="w-full" style={{ height: 192 }} />
  if (!data.length) return <EmptyChart />

  return (
    <ResponsiveContainer width="100%" height={192}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} strokeOpacity={0.4} />
        <XAxis dataKey="label" tick={TICK_STYLE} tickLine={false} axisLine={false} />
        <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false}
          tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} width={42} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Tooltip content={<CurrencyTooltip />} cursor={{ fill: 'transparent' }} />
        <Bar dataKey="income" name="Income" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function CategoryBarChart({ month, year, excludeReimbursable }: { month: number; year: number; excludeReimbursable: boolean }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/category-breakdown?month=${month}&year=${year}&exclude_reimbursable=${excludeReimbursable}`)
      .then(r => setData(r.data.slice(0, 8)))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [month, year, excludeReimbursable])

  if (loading) return <Skeleton className="w-full" style={{ height: 256 }} />
  if (!data.length) return <EmptyChart height={256} />

  return (
    <ResponsiveContainer width="100%" height={256}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_COLOR} strokeOpacity={0.4} />
        <XAxis type="number" tick={TICK_STYLE} tickLine={false} axisLine={false}
          tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
        <YAxis dataKey="category" type="category" tick={TICK_STYLE} tickLine={false} axisLine={false} width={105} />
        <Tooltip content={<CurrencyTooltip />} cursor={{ fill: 'transparent' }} />
        <Bar dataKey="total" name="Amount" radius={[0, 4, 4, 0]} maxBarSize={20}>
          {data.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function CategoryPieChart({ month, year, excludeReimbursable }: { month: number; year: number; excludeReimbursable: boolean }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/category-breakdown?month=${month}&year=${year}&exclude_reimbursable=${excludeReimbursable}`)
      .then(r => setData(r.data.slice(0, 7)))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [month, year, excludeReimbursable])

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

function SavingsRateChart({ months, excludeReimbursable }: { months: number; excludeReimbursable: boolean }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/savings-rate?months=${months}&exclude_reimbursable=${excludeReimbursable}`)
      .then(r => setData(r.data.map((d: any) => ({ ...d, label: ml(d.year, d.month) }))))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [months, excludeReimbursable])

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
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} strokeOpacity={0.4} />
          <XAxis dataKey="label" tick={TICK_STYLE} tickLine={false} axisLine={false} />
          <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false}
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

function NWSDonut({ month, year, excludeReimbursable }: { month: number; year: number; excludeReimbursable: boolean }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/need-want-savings?month=${month}&year=${year}&exclude_reimbursable=${excludeReimbursable}`)
      .then(r => setData(r.data.map((d: any) => ({ ...d, fill: NWS_COLORS[d.type] ?? '#94a3b8' }))))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [month, year, excludeReimbursable])

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

function RecurringDonut({ month, year, excludeReimbursable }: { month: number; year: number; excludeReimbursable: boolean }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/recurring-split?month=${month}&year=${year}&exclude_reimbursable=${excludeReimbursable}`)
      .then(r => setData(r.data.map((d: any) => ({
        ...d,
        fill: d.type === 'recurring' ? '#3b82f6' : '#a855f7',
      }))))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [month, year, excludeReimbursable])

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

function TopMerchantsChart({ month, year, excludeReimbursable }: { month: number; year: number; excludeReimbursable: boolean }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/top-merchants?limit=8&month=${month}&year=${year}&exclude_reimbursable=${excludeReimbursable}`)
      .then(r => setData(r.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [month, year, excludeReimbursable])

  if (loading) return <Skeleton className="w-full" style={{ height: 256 }} />
  if (!data.length) return <EmptyChart height={256} />

  return (
    <ResponsiveContainer width="100%" height={256}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_COLOR} strokeOpacity={0.4} />
        <XAxis type="number" tick={TICK_STYLE} tickLine={false} axisLine={false}
          tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
        <YAxis dataKey="merchant" type="category" tick={TICK_STYLE} tickLine={false} axisLine={false} width={110} />
        <Tooltip content={<CurrencyTooltip />} cursor={{ fill: 'transparent' }} />
        <Bar dataKey="total" name="Amount" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function DayOfWeekChart({ months, excludeReimbursable }: { months: number; excludeReimbursable: boolean }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/day-of-week?months=${months}&exclude_reimbursable=${excludeReimbursable}`)
      .then(r => setData(r.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [months, excludeReimbursable])

  if (loading) return <Skeleton className="w-full" style={{ height: 192 }} />
  if (!data.length) return <EmptyChart />

  const maxVal = Math.max(...data.map((d: any) => d.total), 1)

  return (
    <ResponsiveContainer width="100%" height={192}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} strokeOpacity={0.4} />
        <XAxis dataKey="label" tick={TICK_STYLE} tickLine={false} axisLine={false} />
        <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false}
          tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} width={42} />
        <Tooltip
          cursor={{ fill: 'transparent' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload
            return (
              <div className="bg-popover text-popover-foreground border border-border rounded-lg px-3 py-2 shadow-lg text-xs z-50">
                <p className="font-semibold mb-1">{label}</p>
                <p style={{ color: payload[0].fill }}>Total: <span className="font-medium">{formatCurrency(d.total)}</span></p>
                <p className="text-muted-foreground">Avg per tx: {formatCurrency(d.avg)}</p>
                <p className="text-muted-foreground">{d.count} transactions</p>
              </div>
            )
          }}
        />
        <Bar dataKey="total" name="Spend" radius={[4, 4, 0, 0]} maxBarSize={40}>
          {data.map((d: any, i: number) => (
            <Cell
              key={i}
              fill={d.total === maxVal ? '#3b82f6' : `rgba(59,130,246,${0.3 + (d.total / maxVal) * 0.7})`}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function BudgetTrendChart({ months, excludeReimbursable }: { months: number; excludeReimbursable: boolean }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/budget-trend?months=${months}&exclude_reimbursable=${excludeReimbursable}`)
      .then(r => {
        // Aggregate per-category rows into monthly totals.
        // budgeted stays null until at least one category has a budget set —
        // null renders as no bar in Recharts, which correctly distinguishes
        // "user budgeted zero" from "user has no budget set this month".
        const byKey: Record<string, { label: string; budgeted: number | null; actual: number }> = {}
        for (const d of r.data) {
          const key = `${d.year}-${String(d.month).padStart(2, '0')}`
          if (!byKey[key]) byKey[key] = { label: ml(d.year, d.month), budgeted: null, actual: 0 }
          byKey[key].actual += d.actual
          if (d.budget != null) {
            byKey[key].budgeted = (byKey[key].budgeted ?? 0) + d.budget
          }
        }
        setData(Object.entries(byKey).sort(([a], [b]) => a < b ? -1 : 1).map(([, v]) => v))
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [months, excludeReimbursable])

  if (loading) return <Skeleton className="w-full" style={{ height: 192 }} />
  if (!data.length) return <EmptyChart />

  return (
    <ResponsiveContainer width="100%" height={192}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} strokeOpacity={0.4} />
        <XAxis dataKey="label" tick={TICK_STYLE} tickLine={false} axisLine={false} />
        <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false}
          tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} width={42} />
        <Tooltip content={<CurrencyTooltip />} cursor={{ fill: 'transparent' }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="budgeted" name="Budgeted" fill="#94a3b8" radius={[3, 3, 0, 0]} maxBarSize={24} />
        <Bar dataKey="actual" name="Actual" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={24} />
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
  // L-2: Intentional empty array — this chart shows all-time reimbursement
  // pipeline data and does not respect the excludeReimbursable toggle
  // (showing ALL statuses is the point of this overview chart).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <Skeleton className="w-full" style={{ height: 192 }} />
  if (!data.length) return <EmptyChart />

  return (
    <ResponsiveContainer width="100%" height={192}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} strokeOpacity={0.4} />
        <XAxis dataKey="label" tick={TICK_STYLE} tickLine={false} axisLine={false} />
        <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false}
          tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} width={42} />
        <Tooltip content={<CurrencyTooltip />} cursor={{ fill: 'transparent' }} />
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
  // L-1: Lazy initializer so the value is captured at first render
  const [month, setMonth] = useState(() => getCurrentMonthYear().month)
  const [year, setYear] = useState(() => getCurrentMonthYear().year)
  const [trendMonths, setTrendMonths] = useState(6)
  const { excludeReimbursable, toggleExcludeReimbursable } = useUIStore()

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Deep insights into your financial patterns</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Reimbursable toggle */}
          <Button
            variant={excludeReimbursable ? 'default' : 'outline'}
            size="sm"
            onClick={toggleExcludeReimbursable}
            className={cn(
              'h-8 px-3 text-xs gap-1.5',
              excludeReimbursable && 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500',
            )}
            title={excludeReimbursable ? 'Reimbursable transactions excluded — click to show all' : 'Click to exclude reimbursable transactions from totals'}
          >
            {excludeReimbursable ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {excludeReimbursable ? 'Excl. Reimbursable' : 'Show All'}
          </Button>

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
          <MonthYearPicker
            month={month}
            year={year}
            onChange={(m, y) => { setMonth(m); setYear(y) }}
          />
        </div>
      </div>

      {/* Reimbursable filter notice */}
      {excludeReimbursable && (
        <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
          <EyeOff className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Reimbursable transactions are excluded from all charts. Toggle <strong>Show All</strong> above to include them.</span>
        </div>
      )}

      <div className="space-y-8">
        {/* ── Spending Trends ── */}
        <Section title="Spending Trends" emoji="📈">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Monthly Spend" subtitle={`Last ${trendMonths} months`}>
              <SpendTrendChart months={trendMonths} excludeReimbursable={excludeReimbursable} />
            </ChartCard>
            <ChartCard title="Income vs Expenses" subtitle={`Last ${trendMonths} months`}>
              <IncomeExpensesChart months={trendMonths} excludeReimbursable={excludeReimbursable} />
            </ChartCard>
          </div>
        </Section>

        {/* ── Category Analysis ── */}
        <Section title="Category Analysis" emoji="🗂️">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Spend by Category" subtitle={`${monthName(month)} ${year} — top 8`}>
              <CategoryBarChart month={month} year={year} excludeReimbursable={excludeReimbursable} />
            </ChartCard>
            <ChartCard title="Category Mix" subtitle={`${monthName(month)} ${year}`}>
              <CategoryPieChart month={month} year={year} excludeReimbursable={excludeReimbursable} />
            </ChartCard>
          </div>
        </Section>

        {/* ── Income & Savings ── */}
        <Section title="Income & Savings" emoji="💰">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <ChartCard title="Savings Rate Trend" subtitle={`Last ${trendMonths} months`}>
                <SavingsRateChart months={trendMonths} excludeReimbursable={excludeReimbursable} />
              </ChartCard>
            </div>
            <ChartCard title="Need / Want / Savings" subtitle={`${monthName(month)} ${year}`}>
              <NWSDonut month={month} year={year} excludeReimbursable={excludeReimbursable} />
            </ChartCard>
          </div>
        </Section>

        {/* ── Spending Patterns ── */}
        <Section title="Spending Patterns" emoji="🔄">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <ChartCard title="Top Merchants" subtitle={`${monthName(month)} ${year}`}>
                <TopMerchantsChart month={month} year={year} excludeReimbursable={excludeReimbursable} />
              </ChartCard>
            </div>
            <ChartCard title="Recurring vs One-time" subtitle={`${monthName(month)} ${year}`}>
              <RecurringDonut month={month} year={year} excludeReimbursable={excludeReimbursable} />
            </ChartCard>
          </div>
        </Section>

        {/* ── Spending Behavior ── */}
        <Section title="Spending Behavior" emoji="🗓️">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Spend by Day of Week" subtitle={`Last ${trendMonths} months — intensity shows relative spend`}>
              <DayOfWeekChart months={trendMonths} excludeReimbursable={excludeReimbursable} />
            </ChartCard>
            <ChartCard title="Budget vs Actual" subtitle={`Last ${trendMonths} months — all categories combined`}>
              <BudgetTrendChart months={trendMonths} excludeReimbursable={excludeReimbursable} />
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
