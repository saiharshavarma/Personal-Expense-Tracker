import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BrainCircuit, TrendingDown, TrendingUp, Sparkles, Shield,
  AlertTriangle, CheckCircle2, Loader2, RefreshCw, Settings,
  Target, Lightbulb, ListChecks, Lock,
  ChevronDown, ChevronUp, Zap, Eye, EyeOff,
} from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DateRangePicker, defaultRange, type DateRange } from '@/components/DateRangePicker'
import { usePreferencesStore } from '@/store'
import { api } from '@/utils/apiClient'

// ── Types ────────────────────────────────────────────────────────────────────

interface ExpenseReduction {
  title: string
  detail: string
  estimated_monthly_saving: string
}

interface WealthStrategy {
  strategy: string
  detail: string
  timeframe: string
}

interface Habit {
  habit: string
  impact: string
}

interface ActionItem {
  week: number
  action: string
  impact: 'high' | 'medium' | 'low'
}

interface FinancialAdvice {
  score_label?: string
  health_verdict?: string
  executive_summary?: string
  alert?: string | null
  expense_reductions?: ExpenseReduction[]
  wealth_building?: WealthStrategy[]
  habits?: Habit[]
  action_plan?: ActionItem[]
  raw_advice?: string
}

interface AdvisorResponse {
  advice: FinancialAdvice
  context_snapshot: Record<string, unknown>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SCORE_STYLES: Record<string, { bg: string; text: string; border: string; icon: React.ElementType }> = {
  Excellent:    { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/30', icon: CheckCircle2 },
  Good:         { bg: 'bg-blue-500/10',    text: 'text-blue-600 dark:text-blue-400',       border: 'border-blue-500/30',    icon: TrendingUp },
  Fair:         { bg: 'bg-amber-500/10',   text: 'text-amber-600 dark:text-amber-400',     border: 'border-amber-500/30',   icon: AlertTriangle },
  'Needs Work': { bg: 'bg-red-500/10',     text: 'text-red-600 dark:text-red-400',         border: 'border-red-500/30',     icon: AlertTriangle },
}

const IMPACT_COLORS: Record<string, string> = {
  high:   'bg-red-500/10 text-red-600 dark:text-red-400',
  medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  low:    'bg-blue-500/10 text-blue-600 dark:text-blue-400',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreCard({ label, verdict }: { label?: string; verdict?: string }) {
  const style = SCORE_STYLES[label ?? ''] ?? SCORE_STYLES['Fair']
  const Icon = style.icon
  return (
    <Card className={`border ${style.border} ${style.bg}`}>
      <CardContent className="pt-5 pb-4 flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${style.bg} border ${style.border}`}>
          <Icon className={`w-6 h-6 ${style.text}`} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-sm font-bold ${style.text}`}>Financial Health: {label ?? '—'}</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{verdict}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function AlertBanner({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive"
    >
      <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <p className="text-sm font-medium">{message}</p>
    </motion.div>
  )
}

function SectionCard({
  icon: Icon,
  title,
  color,
  children,
}: {
  icon: React.ElementType
  title: string
  color: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 w-full text-left group"
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <CardTitle className="text-sm flex-1">{title}</CardTitle>
          {open
            ? <ChevronUp className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          }
        </button>
      </CardHeader>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <CardContent className="pb-4">{children}</CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

function ExpenseReductionList({ items }: { items: ExpenseReduction[] }) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="flex gap-3 p-3 rounded-lg bg-muted/50">
          <div className="w-6 h-6 rounded-full bg-red-500/15 text-red-500 flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">
            {i + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{item.title}</p>
              {item.estimated_monthly_saving && (
                <Badge variant="outline" className="text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/30 flex-shrink-0">
                  {item.estimated_monthly_saving}/mo
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function WealthBuildingList({ items }: { items: WealthStrategy[] }) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="flex gap-3 p-3 rounded-lg bg-muted/50">
          <div className="w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{item.strategy}</p>
              {item.timeframe && (
                <span className="text-[10px] text-muted-foreground flex-shrink-0">{item.timeframe}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function HabitsList({ items }: { items: Habit[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-3 p-3 rounded-lg border bg-card">
          <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">{item.habit}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{item.impact}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function ActionPlanList({ items }: { items: ActionItem[] }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
          <div className="w-14 text-xs font-semibold text-muted-foreground flex-shrink-0 pt-0.5">
            Week {item.week}
          </div>
          <p className="text-sm flex-1">{item.action}</p>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
            IMPACT_COLORS[item.impact] ?? IMPACT_COLORS.medium
          }`}>
            {item.impact}
          </span>
        </div>
      ))}
    </div>
  )
}

function OptInGate({ hasKey }: { hasKey: boolean }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-14 text-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
          <Lock className="w-7 h-7 text-primary" />
        </div>
        <div>
          <p className="font-semibold">AI advisor is opt-in</p>
          {!hasKey ? (
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Add an Anthropic or OpenAI API key in Settings, then enable AI insights to unlock personalized financial strategy.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Enable AI analysis in Settings to unlock your personalized financial advisor.
              Only aggregated stats are shared — never raw transactions.
            </p>
          )}
        </div>
        <Button size="sm" onClick={() => window.location.href = '/settings'}>
          <Settings className="w-4 h-4 mr-2" />
          Open Settings
        </Button>
      </CardContent>
    </Card>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export function FinanceAdvisor() {
  const [range, setRange] = useState<DateRange>(defaultRange)
  const [excludeReimbursable, setExcludeReimbursable] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AdvisorResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { prefs, loading: prefsLoading, load } = usePreferencesStore()
  useEffect(() => { load() }, [load])

  const isOptedIn = prefs?.ai_insights_opt_in === true
  const hasApiKey = !!(prefs?.anthropic_api_key_set || prefs?.openai_api_key_set)

  const generate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.post<AdvisorResponse>('/ai/advisor', {
        date_from: range.date_from,
        date_to: range.date_to,
        exclude_reimbursable: excludeReimbursable,
      })
      setResult(res.data)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Failed to generate advice. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [range, excludeReimbursable])

  const advice = result?.advice

  return (
    <MainLayout>
      <TopBar
        title="Finance Advisor"
        subtitle="AI-powered proactive financial strategy — based on your real spending data"
      />

      {/* Privacy notice */}
      <Card className="mb-6 border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-4 flex items-start gap-3">
          <Shield className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Privacy-first: </span>
            The AI only sees aggregated totals (e.g. "Food: $420") — never your merchant names, transaction descriptions, or account numbers.
          </p>
        </CardContent>
      </Card>

      {prefsLoading ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading…</p>
          </CardContent>
        </Card>
      ) : !isOptedIn ? (
        <OptInGate hasKey={hasApiKey} />
      ) : (
        <div className="space-y-5">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Period:</span>
              <DateRangePicker
                value={range}
                onChange={r => { setRange(r); setResult(null) }}
              />
            </div>

            <Button
              variant={excludeReimbursable ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setExcludeReimbursable(v => !v); setResult(null) }}
              className={[
                'gap-1.5 h-9 text-xs',
                excludeReimbursable ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500' : '',
              ].filter(Boolean).join(' ')}
              title={excludeReimbursable
                ? 'Reimbursable transactions excluded — click to include them'
                : 'All transactions included — click to exclude reimbursable'}
            >
              {excludeReimbursable
                ? <><Eye className="w-3.5 h-3.5" /> Include Reimbursable</>
                : <><EyeOff className="w-3.5 h-3.5" /> Excl. Reimbursable</>}
            </Button>

            <div className="flex-1" />

            <Button
              onClick={generate}
              disabled={loading}
              className="gap-2"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
              ) : result ? (
                <><RefreshCw className="w-4 h-4" /> Refresh Strategy</>
              ) : (
                <><BrainCircuit className="w-4 h-4" /> Generate Strategy</>
              )}
            </Button>
          </div>

          {/* Error state */}
          {error && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="pt-4 pb-4 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {!result && !loading && !error && (
            <Card className="border-dashed">
              <CardContent className="py-14 text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <BrainCircuit className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-lg">Your personal CFP, powered by AI</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                    Click "Generate Strategy" and your AI advisor will analyze your spending patterns,
                    savings rate, and budget adherence to create a personalized financial plan.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3 max-w-md mx-auto pt-2">
                  {[
                    { icon: TrendingDown, label: 'Expense Cuts', color: 'text-red-500' },
                    { icon: TrendingUp,  label: 'Wealth Building', color: 'text-emerald-500' },
                    { icon: ListChecks, label: '4-Week Plan', color: 'text-blue-500' },
                  ].map(({ icon: Icon, label, color }) => (
                    <div key={label} className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-muted/50">
                      <Icon className={`w-5 h-5 ${color}`} />
                      <span className="text-xs text-muted-foreground">{label}</span>
                    </div>
                  ))}
                </div>
                <Button onClick={generate} className="gap-2 mt-2">
                  <Sparkles className="w-4 h-4" />
                  Generate My Financial Strategy
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Loading shimmer */}
          {loading && (
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-5 pb-5 flex items-center justify-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Analyzing your finances…</p>
                    <p className="text-xs text-muted-foreground">
                      Reviewing spending patterns, savings rate, and budget adherence
                    </p>
                  </div>
                </CardContent>
              </Card>
              {[1, 2, 3].map(i => (
                <Card key={i}>
                  <CardContent className="pt-4 pb-4 space-y-2">
                    <div className="h-4 bg-muted rounded animate-pulse w-1/3" />
                    <div className="h-3 bg-muted rounded animate-pulse w-full" />
                    <div className="h-3 bg-muted rounded animate-pulse w-4/5" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Results */}
          <AnimatePresence>
            {advice && !loading && (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* Period label */}
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                  <Zap className="w-3.5 h-3.5 text-primary" />
                  Strategy for <span className="font-medium text-foreground">{range.label}</span>
                  {excludeReimbursable && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-medium">
                      Reimbursable excluded
                    </span>
                  )}
                  {prefs && (
                    <span className="ml-auto">
                      Powered by {prefs.ai_provider === 'openai' ? 'GPT-4o' : 'Claude Sonnet'}
                    </span>
                  )}
                </div>

                {/* Alert banner */}
                {advice.alert && <AlertBanner message={advice.alert} />}

                {/* Health score */}
                <ScoreCard label={advice.score_label} verdict={advice.health_verdict} />

                {/* Executive summary */}
                {advice.executive_summary && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="pt-4 pb-4 flex gap-3">
                      <Sparkles className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      <p className="text-sm leading-relaxed">{advice.executive_summary}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Raw advice fallback */}
                {advice.raw_advice && (
                  <Card>
                    <CardContent className="pt-4 pb-4">
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{advice.raw_advice}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Expense reductions */}
                {advice.expense_reductions && advice.expense_reductions.length > 0 && (
                  <SectionCard
                    icon={TrendingDown}
                    title="Expense Reduction Opportunities"
                    color="bg-red-500/10 text-red-500"
                  >
                    <ExpenseReductionList items={advice.expense_reductions} />
                  </SectionCard>
                )}

                {/* Wealth building */}
                {advice.wealth_building && advice.wealth_building.length > 0 && (
                  <SectionCard
                    icon={TrendingUp}
                    title="Wealth Building Strategies"
                    color="bg-emerald-500/10 text-emerald-600"
                  >
                    <WealthBuildingList items={advice.wealth_building} />
                  </SectionCard>
                )}

                {/* Habits */}
                {advice.habits && advice.habits.length > 0 && (
                  <SectionCard
                    icon={Lightbulb}
                    title="Financial Habits to Build"
                    color="bg-amber-500/10 text-amber-600"
                  >
                    <HabitsList items={advice.habits} />
                  </SectionCard>
                )}

                {/* Action plan */}
                {advice.action_plan && advice.action_plan.length > 0 && (
                  <SectionCard
                    icon={ListChecks}
                    title="Your 4-Week Action Plan"
                    color="bg-blue-500/10 text-blue-600"
                  >
                    <ActionPlanList items={advice.action_plan} />
                  </SectionCard>
                )}

                {/* Refresh prompt */}
                <div className="flex items-center justify-center gap-2 pt-2">
                  <Target className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Come back next month to track your progress
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </MainLayout>
  )
}
