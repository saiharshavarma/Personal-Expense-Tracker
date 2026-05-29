import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Eye, EyeOff, ShieldAlert, TrendingUp } from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MonthYearPicker } from '@/components/MonthYearPicker'
import { MetricHint } from '@/components/MetricHint'
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

function CashflowPaceChart({ month, year, months, excludeReimbursable }: { month: number; year: number; months: number; excludeReimbursable: boolean }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/cashflow-pace?month=${month}&year=${year}&months=${Math.max(3, months)}&exclude_reimbursable=${excludeReimbursable}`)
      .then(r => setData(r.data.data ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [month, year, months, excludeReimbursable])

  if (loading) return <Skeleton className="w-full" style={{ height: 224 }} />
  if (!data.length) return <EmptyChart height={224} />

  return (
    <ResponsiveContainer width="100%" height={224}>
      <AreaChart data={data} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="paceActual" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="paceTypical" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#64748b" stopOpacity={0.16} />
            <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} strokeOpacity={0.4} />
        <XAxis dataKey="day" tick={TICK_STYLE} tickLine={false} axisLine={false} />
        <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false}
          tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} width={42} />
        <Tooltip content={<CurrencyTooltip />} />
        <Area dataKey="typical_cumulative" name="Typical pace" stroke="#64748b" strokeWidth={2} fill="url(#paceTypical)" dot={false} connectNulls />
        <Area dataKey="actual_cumulative" name="Actual pace" stroke="#ef4444" strokeWidth={2} fill="url(#paceActual)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function FixedCommitmentTrendChart({ months, excludeReimbursable }: { months: number; excludeReimbursable: boolean }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/fixed-commitment-trend?months=${Math.max(3, months)}&exclude_reimbursable=${excludeReimbursable}`)
      .then(r => setData(r.data.map((d: any) => ({ ...d, label: ml(d.year, d.month) }))))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [months, excludeReimbursable])

  if (loading) return <Skeleton className="w-full" style={{ height: 224 }} />
  if (!data.length) return <EmptyChart height={224} />

  return (
    <ResponsiveContainer width="100%" height={224}>
      <ComposedChart data={data} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} strokeOpacity={0.4} />
        <XAxis dataKey="label" tick={TICK_STYLE} tickLine={false} axisLine={false} />
        <YAxis yAxisId="left" tick={TICK_STYLE} tickLine={false} axisLine={false}
          tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} width={42} />
        <YAxis yAxisId="right" orientation="right" tick={TICK_STYLE} tickLine={false} axisLine={false}
          tickFormatter={(v) => `${v}%`} width={36} />
        <Tooltip
          cursor={{ fill: 'transparent' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload
            return (
              <div className="bg-popover text-popover-foreground border border-border rounded-lg px-3 py-2 shadow-lg text-xs z-50">
                <p className="font-semibold mb-1">{label}</p>
                <p>Fixed: <span className="font-medium">{formatCurrency(d.fixed)}</span></p>
                <p>Income: <span className="font-medium">{formatCurrency(d.income)}</span></p>
                <p className="text-muted-foreground">Lock: {d.fixed_income_pct == null ? 'No income' : `${d.fixed_income_pct}%`}</p>
              </div>
            )
          }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Bar yAxisId="left" dataKey="fixed" name="Fixed commitments" fill="#a855f7" radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Line yAxisId="right" dataKey="fixed_income_pct" name="Income lock %" stroke="#f97316" strokeWidth={2} dot={false} connectNulls />
      </ComposedChart>
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

interface DecisionSignals {
  selected_spend: number
  projected_spend: number
  median_monthly_spend: number | null
  spend_anomaly_pct: number | null
  volatility_pct: number | null
  fixed_commitments: number
  fixed_income_pct: number | null
  discretionary_after_fixed: number | null
  budget_risk: Array<{
    category: string
    subcategory: string | null
    actual: number
    projected: number
    budget: number
    over_by: number
    projected_pct: number
  }>
  category_drift: Array<{
    category: string
    current: number
    baseline: number
    delta: number
    pct_change: number
  }>
  merchant_creep: Array<{
    merchant: string
    current: number
    baseline: number
    delta: number
    pct_change: number
    transactions: number
  }>
  review_count: number
  risk_level: 'low' | 'medium' | 'high'
  risk_score: number
}

function pctLabel(value: number | null | undefined) {
  return value == null ? 'Not enough history' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function RiskMeter({ value }: { value: number }) {
  return (
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div
        className={cn(
          'h-full rounded-full',
          value >= 75 ? 'bg-destructive' : value >= 25 ? 'bg-amber-500' : 'bg-green-500',
        )}
        style={{ width: `${Math.max(8, Math.min(100, value))}%` }}
      />
    </div>
  )
}

function SignalMetricCard({
  title,
  value,
  detail,
  hint,
  tone,
}: {
  title: string
  value: string
  detail: string
  hint?: React.ReactNode
  tone: 'good' | 'warn' | 'bad' | 'info'
}) {
  const color = {
    good: 'text-green-600 dark:text-green-400',
    warn: 'text-amber-600 dark:text-amber-400',
    bad: 'text-destructive',
    info: 'text-blue-600 dark:text-blue-400',
  }[tone]

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          {hint && <MetricHint label={`${title} explanation`}>{hint}</MetricHint>}
        </div>
        <p className={cn('mt-2 text-2xl font-semibold tabular-nums', color)}>{value}</p>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{detail}</p>
      </CardContent>
    </Card>
  )
}

function RankedSignalList({
  title,
  empty,
  rows,
  render,
}: {
  title: string
  empty: string
  rows: any[]
  render: (row: any, max: number) => React.ReactNode
}) {
  const max = Math.max(...rows.map((r) => Math.abs(r.delta ?? r.over_by ?? 0)), 1)

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-sm font-medium leading-none">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-4 px-5">
        {!rows.length ? (
          <div className="flex items-center justify-center h-32 text-xs text-muted-foreground text-center">
            {empty}
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row, i) => (
              <div key={i}>{render(row, max)}</div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DecisionSignalsPanel({
  month,
  year,
  months,
  excludeReimbursable,
}: {
  month: number
  year: number
  months: number
  excludeReimbursable: boolean
}) {
  const [data, setData] = useState<DecisionSignals | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/analytics/decision-signals?month=${month}&year=${year}&months=${Math.max(3, months)}&exclude_reimbursable=${excludeReimbursable}`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [month, year, months, excludeReimbursable])

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
      </div>
    )
  }
  if (!data) return <EmptyChart height={180} />

  const anomalyTone = data.spend_anomaly_pct == null || data.spend_anomaly_pct <= 10
    ? 'good'
    : data.spend_anomaly_pct <= 25 ? 'warn' : 'bad'
  const fixedTone = data.fixed_income_pct == null || data.fixed_income_pct <= 35
    ? 'good'
    : data.fixed_income_pct <= 50 ? 'warn' : 'bad'
  const volatilityTone = data.volatility_pct == null || data.volatility_pct <= 20
    ? 'good'
    : data.volatility_pct <= 35 ? 'warn' : 'bad'

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                data.risk_level === 'high'
                  ? 'bg-destructive/10 text-destructive'
                  : data.risk_level === 'medium'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'bg-green-500/10 text-green-600 dark:text-green-400',
              )}>
                {data.risk_level === 'high' ? <ShieldAlert className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
              </div>
              <div>
                <p className="text-sm font-semibold capitalize">{data.risk_level} attention month</p>
                <p className="text-xs text-muted-foreground">
                  Combines spend anomaly, fixed commitments, budget risk, volatility, and review backlog.
                </p>
              </div>
            </div>
            <div className="min-w-40">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Risk score</span>
                <span>{data.risk_score}/100</span>
              </div>
              <RiskMeter value={data.risk_score} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SignalMetricCard
          title="Spend Anomaly"
          value={pctLabel(data.spend_anomaly_pct)}
          hint="Compares your projected month-end spend with your recent normal monthly spend. Positive values mean this month is running hotter than usual."
          detail={`Projected ${formatCurrency(data.projected_spend)} vs normal ${data.median_monthly_spend ? formatCurrency(data.median_monthly_spend) : 'baseline unavailable'}.`}
          tone={anomalyTone}
        />
        <SignalMetricCard
          title="Fixed-Cost Lock"
          value={data.fixed_income_pct == null ? 'No income' : `${data.fixed_income_pct.toFixed(1)}%`}
          hint="The share of income already committed to recurring or fixed costs. A higher lock leaves less room for flexible spending and surprises."
          detail={`${formatCurrency(data.fixed_commitments)} is already committed before flexible spending.`}
          tone={fixedTone}
        />
        <SignalMetricCard
          title="Spend Volatility"
          value={data.volatility_pct == null ? 'Not enough history' : `${data.volatility_pct.toFixed(1)}%`}
          hint="How much your monthly spending varies from recent history. High volatility makes budgets less predictable and deserves category-level review."
          detail="Higher volatility makes month-end planning and budget timing harder."
          tone={volatilityTone}
        />
        <SignalMetricCard
          title="Review Backlog"
          value={String(data.review_count)}
          hint="Transactions still awaiting review. Reducing this improves category accuracy, budget math, analytics, and future AI auto-fill behavior."
          detail="Unreviewed transactions weaken categories, budgets, and AI learning quality."
          tone={data.review_count > 10 ? 'warn' : 'good'}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <RankedSignalList
          title="Budget Breakout Risk"
          empty="No budget categories are projected to break."
          rows={data.budget_risk}
          render={(row, max) => (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium truncate">{row.category}{row.subcategory ? ` / ${row.subcategory}` : ''}</span>
                <span className="text-destructive font-semibold tabular-nums">+{formatCurrency(row.over_by)}</span>
              </div>
              <RiskMeter value={Math.min(100, Math.abs(row.over_by) / max * 100)} />
              <p className="text-xs text-muted-foreground">
                Projected {formatCurrency(row.projected)} on a {formatCurrency(row.budget)} budget.
              </p>
            </div>
          )}
        />
        <RankedSignalList
          title="Category Drift"
          empty="No category is materially above its recent baseline."
          rows={data.category_drift}
          render={(row, max) => (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium truncate">{row.category}</span>
                <span className="text-amber-600 dark:text-amber-400 font-semibold tabular-nums">+{formatCurrency(row.delta)}</span>
              </div>
              <RiskMeter value={Math.min(100, Math.abs(row.delta) / max * 100)} />
              <p className="text-xs text-muted-foreground">
                {pctLabel(row.pct_change)} vs recent average of {formatCurrency(row.baseline)}.
              </p>
            </div>
          )}
        />
        <RankedSignalList
          title="Merchant Creep"
          empty="No repeat merchant is rising sharply above normal."
          rows={data.merchant_creep}
          render={(row, max) => (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium truncate">{row.merchant}</span>
                <span className="text-blue-600 dark:text-blue-400 font-semibold tabular-nums">+{formatCurrency(row.delta)}</span>
              </div>
              <RiskMeter value={Math.min(100, Math.abs(row.delta) / max * 100)} />
              <p className="text-xs text-muted-foreground">
                {row.transactions} transactions, {pctLabel(row.pct_change)} above normal.
              </p>
            </div>
          )}
        />
      </div>
    </div>
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

function ChartCard({ title, subtitle, hint, children }: { title: string; subtitle?: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center gap-1">
          <CardTitle className="text-sm font-medium leading-none">{title}</CardTitle>
          {hint && <MetricHint label={`${title} explanation`}>{hint}</MetricHint>}
        </div>
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
        {/* ── Decision Signals ── */}
        <Section title="Decision Signals" emoji="🎯">
          <DecisionSignalsPanel
            month={month}
            year={year}
            months={trendMonths}
            excludeReimbursable={excludeReimbursable}
          />
        </Section>

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
            <ChartCard title="Spend by Category" subtitle={`${monthName(month)} ${year} — top 8`} hint="Ranks categories by spend for the selected month. Use it to find the largest drivers before drilling into transactions.">
              <CategoryBarChart month={month} year={year} excludeReimbursable={excludeReimbursable} />
            </ChartCard>
            <ChartCard title="Category Mix" subtitle={`${monthName(month)} ${year}`} hint="Shows each category as a share of total spend. A tiny slice is noise; a growing large slice is worth investigating.">
              <CategoryPieChart month={month} year={year} excludeReimbursable={excludeReimbursable} />
            </ChartCard>
          </div>
        </Section>

        {/* ── Income & Savings ── */}
        <Section title="Income & Savings" emoji="💰">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <ChartCard title="Savings Rate Trend" subtitle={`Last ${trendMonths} months`} hint="Savings rate is net savings divided by income. If no income is recorded, the chart falls back to net savings dollars.">
                <SavingsRateChart months={trendMonths} excludeReimbursable={excludeReimbursable} />
              </ChartCard>
            </div>
            <ChartCard title="Need / Want / Savings" subtitle={`${monthName(month)} ${year}`} hint="Groups spending by need, want, savings, or not-applicable tags. This helps separate essential costs from flexible choices.">
              <NWSDonut month={month} year={year} excludeReimbursable={excludeReimbursable} />
            </ChartCard>
          </div>
        </Section>

        {/* ── Spending Patterns ── */}
        <Section title="Spending Patterns" emoji="🔄">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <ChartCard title="Top Merchants" subtitle={`${monthName(month)} ${year}`} hint="Ranks merchants by spend. Repeated high merchants are good candidates for subscription, habit, or reimbursement review.">
                <TopMerchantsChart month={month} year={year} excludeReimbursable={excludeReimbursable} />
              </ChartCard>
            </div>
            <ChartCard title="Recurring vs One-time" subtitle={`${monthName(month)} ${year}`} hint="Compares baseline recurring costs with one-time spending. High recurring spend means less flexibility every month.">
              <RecurringDonut month={month} year={year} excludeReimbursable={excludeReimbursable} />
            </ChartCard>
          </div>
        </Section>

        {/* ── Spending Behavior ── */}
        <Section title="Spending Behavior" emoji="🗓️">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Cashflow Pace" subtitle={`${monthName(month)} ${year} vs your trailing ${trendMonths}-month pace`} hint="Compares this month’s daily spending pace to your recent average. A faster pace suggests you may finish the month above normal.">
              <CashflowPaceChart month={month} year={year} months={trendMonths} excludeReimbursable={excludeReimbursable} />
            </ChartCard>
            <ChartCard title="Fixed-Cost Lock Trend" subtitle={`Recurring/fixed commitments as income pressure`} hint="Tracks fixed or recurring commitments as a percentage of income over time. Rising lock can make budgets feel tighter even if income is steady.">
              <FixedCommitmentTrendChart months={trendMonths} excludeReimbursable={excludeReimbursable} />
            </ChartCard>
            <ChartCard title="Spend by Day of Week" subtitle={`Last ${trendMonths} months — intensity shows relative spend`} hint="Highlights which weekdays tend to carry more spend. Useful for spotting weekend habits, commute costs, or recurring billing days.">
              <DayOfWeekChart months={trendMonths} excludeReimbursable={excludeReimbursable} />
            </ChartCard>
            <ChartCard title="Budget vs Actual" subtitle={`Last ${trendMonths} months — all categories combined`} hint="Compares total budgeted amount with actual spend. Consistent overages mean targets may be unrealistic or categories need attention.">
              <BudgetTrendChart months={trendMonths} excludeReimbursable={excludeReimbursable} />
            </ChartCard>
          </div>
        </Section>

        {/* ── Reimbursements ── */}
        <Section title="Reimbursements" emoji="💳">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Pipeline by Status" subtitle="All time" hint="Shows reimbursable expenses by status. Large to-submit or submitted balances are money you may need to chase.">
              <ReimbursementChart />
            </ChartCard>
          </div>
        </Section>
      </div>
    </MainLayout>
  )
}
