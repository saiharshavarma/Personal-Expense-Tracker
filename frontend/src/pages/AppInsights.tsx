import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Brain, TrendingUp, Database, Upload, CheckCircle2,
  AlertTriangle, Zap, BookOpen, RefreshCw, ArrowRight,
  Cpu, FileText, Award, Target,
} from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { api } from '@/utils/apiClient'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AiPerformance {
  total_ai_categorized: number
  accepted_count: number
  overridden_count: number
  acceptance_rate_pct: number
  confidence_buckets: { high: number; medium: number; low: number }
  avg_confidence_pct: number | null
  top_corrections: { ai_said: string; you_used: string; count: number }[]
}

interface Learning {
  total_rules: number
  active_rules: number
  most_applied_rules: {
    pattern: string; category: string; subcategory: string | null
    merchant: string | null; times_applied: number; confidence_pct: number
  }[]
  recent_corrections: {
    pattern: string; category: string; subcategory: string | null; updated_at: string | null
  }[]
}

interface ImportHealth {
  total_batches: number
  total_imported: number
  total_parsed: number
  total_dupes_skipped: number
  dupe_rate_pct: number
  avg_batch_size: number
  last_import_date: string | null
  by_institution: { institution: string; batches: number; transactions: number }[]
  by_source_type: { pdf: number; csv: number }
  volume_trend: { month: string; count: number }[]
}

interface DataQuality {
  total_transactions: number
  total_debits: number
  categorized_pct: number
  subcategorized_pct: number
  merchant_filled_pct: number
  uncategorized_count: number
  needs_review_count: number
  review_completion_pct: number
  reimbursable_tracked: number
  recurring_tagged: number
  tagged_pct: number
  completeness_score: number
}

interface InsightsSummary {
  generated_at: string
  ai_performance: AiPerformance
  learning: Learning
  import_health: ImportHealth
  data_quality: DataQuality
}

// ── Mini helpers ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-500' : score >= 60 ? 'text-yellow-500' : 'text-red-500'
  return <span className={`text-3xl font-bold tabular-nums ${color}`}>{score.toFixed(0)}%</span>
}

function MiniBar({ value, max, color = 'bg-primary' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(value / max * 100, 100) : 0
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function StatBar({ label, pct, count, color }: { label: string; pct: number; count?: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {pct.toFixed(1)}%{count !== undefined && <span className="text-muted-foreground text-xs ml-1">({count.toLocaleString()})</span>}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

function ConfidenceBucket({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round(count / total * 100) : 0
  return (
    <div className={`rounded-lg border p-3 text-center ${color}`}>
      <p className="text-2xl font-bold tabular-nums">{pct}%</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground/60">{count.toLocaleString()} txns</p>
    </div>
  )
}

function formatMonth(ym: string) {
  const [y, m] = ym.split('-')
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AppInsights() {
  const [data, setData] = useState<InsightsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await api.get<InsightsSummary>('/app-insights/summary')
      setData(r.data)
    } catch {
      setError('Failed to load app insights')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <MainLayout>
      <TopBar
        title="App Insights"
        subtitle="AI performance, learning intelligence, and data quality"
        actions={
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      <div className="p-6 space-y-6">
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" /> Loading insights…
          </div>
        )}

        {data && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* ── KPI Row ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-5 pb-4 text-center">
                  <div className="flex justify-center mb-1">
                    <div className="p-2 rounded-full bg-primary/10">
                      <Brain className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                  <ScoreBadge score={data.ai_performance.acceptance_rate_pct} />
                  <p className="text-xs text-muted-foreground mt-1">AI Acceptance Rate</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    {data.ai_performance.accepted_count.toLocaleString()} of {data.ai_performance.total_ai_categorized.toLocaleString()}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4 text-center">
                  <div className="flex justify-center mb-1">
                    <div className="p-2 rounded-full bg-amber-500/10">
                      <BookOpen className="w-4 h-4 text-amber-500" />
                    </div>
                  </div>
                  <span className="text-3xl font-bold tabular-nums text-amber-500">
                    {data.learning.total_rules}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">Learned Rules</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    {data.learning.active_rules} active
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4 text-center">
                  <div className="flex justify-center mb-1">
                    <div className="p-2 rounded-full bg-blue-500/10">
                      <Database className="w-4 h-4 text-blue-500" />
                    </div>
                  </div>
                  <ScoreBadge score={data.data_quality.completeness_score} />
                  <p className="text-xs text-muted-foreground mt-1">Data Completeness</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    {data.data_quality.total_transactions.toLocaleString()} transactions
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4 text-center">
                  <div className="flex justify-center mb-1">
                    <div className="p-2 rounded-full bg-green-500/10">
                      <Upload className="w-4 h-4 text-green-500" />
                    </div>
                  </div>
                  <span className="text-3xl font-bold tabular-nums text-green-500">
                    {data.import_health.total_imported.toLocaleString()}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">Total Imported</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    {data.import_health.total_batches} import{data.import_health.total_batches !== 1 ? 's' : ''}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* ── AI Performance + Data Quality ─────────────────────── */}
            <div className="grid md:grid-cols-2 gap-6">

              {/* AI Performance */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Brain className="w-4 h-4 text-primary" /> AI Performance
                  </CardTitle>
                  <CardDescription>
                    How well the AI categorizes your transactions
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Confidence buckets */}
                  <div className="grid grid-cols-3 gap-2">
                    <ConfidenceBucket
                      label="High ≥90%"
                      count={data.ai_performance.confidence_buckets.high}
                      total={data.ai_performance.total_ai_categorized}
                      color="border-green-500/20 bg-green-500/5"
                    />
                    <ConfidenceBucket
                      label="Medium 75–90%"
                      count={data.ai_performance.confidence_buckets.medium}
                      total={data.ai_performance.total_ai_categorized}
                      color="border-yellow-500/20 bg-yellow-500/5"
                    />
                    <ConfidenceBucket
                      label="Low <75%"
                      count={data.ai_performance.confidence_buckets.low}
                      total={data.ai_performance.total_ai_categorized}
                      color="border-red-500/20 bg-red-500/5"
                    />
                  </div>

                  {data.ai_performance.avg_confidence_pct !== null && (
                    <div className="flex items-center justify-between text-sm border-t pt-3">
                      <span className="text-muted-foreground">Average confidence</span>
                      <span className={`font-semibold tabular-nums ${
                        data.ai_performance.avg_confidence_pct >= 85 ? 'text-green-500'
                        : data.ai_performance.avg_confidence_pct >= 70 ? 'text-yellow-500'
                        : 'text-red-500'
                      }`}>
                        {data.ai_performance.avg_confidence_pct.toFixed(1)}%
                      </span>
                    </div>
                  )}

                  {/* Top corrections */}
                  {data.ai_performance.top_corrections.length > 0 && (
                    <div className="space-y-2 border-t pt-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Most Frequent Corrections
                      </p>
                      <div className="space-y-1.5">
                        {data.ai_performance.top_corrections.slice(0, 5).map((c, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-xs">
                            <span className="text-muted-foreground/60 w-4 tabular-nums">{c.count}×</span>
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                              {c.ai_said}
                            </Badge>
                            <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-medium">
                              {c.you_used}
                            </Badge>
                          </div>
                        ))}
                      </div>
                      {data.ai_performance.top_corrections.length > 5 && (
                        <p className="text-xs text-muted-foreground/60">
                          +{data.ai_performance.top_corrections.length - 5} more
                        </p>
                      )}
                    </div>
                  )}

                  {data.ai_performance.total_ai_categorized === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No AI-processed transactions yet. Configure your API key in Settings.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Data Quality */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Database className="w-4 h-4 text-blue-500" /> Data Quality
                  </CardTitle>
                  <CardDescription>
                    Completeness of your transaction metadata
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3.5">
                  <StatBar
                    label="Categorized"
                    pct={data.data_quality.categorized_pct}
                    count={data.data_quality.categorized_pct > 0 ? Math.round(data.data_quality.categorized_pct / 100 * data.data_quality.total_transactions) : 0}
                    color="bg-primary"
                  />
                  <StatBar
                    label="Subcategorized"
                    pct={data.data_quality.subcategorized_pct}
                    color="bg-primary/70"
                  />
                  <StatBar
                    label="Merchant identified"
                    pct={data.data_quality.merchant_filled_pct}
                    color="bg-blue-500"
                  />
                  <StatBar
                    label="Review complete"
                    pct={data.data_quality.review_completion_pct}
                    color="bg-green-500"
                  />
                  <StatBar
                    label="Tagged"
                    pct={data.data_quality.tagged_pct}
                    color="bg-violet-500"
                  />

                  <div className="grid grid-cols-2 gap-2 border-t pt-3">
                    <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                      <p className="text-lg font-bold tabular-nums text-amber-500">
                        {data.data_quality.needs_review_count}
                      </p>
                      <p className="text-xs text-muted-foreground">Need review</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                      <p className="text-lg font-bold tabular-nums text-muted-foreground">
                        {data.data_quality.uncategorized_count}
                      </p>
                      <p className="text-xs text-muted-foreground">Uncategorized</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── AI Learning ───────────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" /> AI Learning — Merchant Rules
                </CardTitle>
                <CardDescription>
                  Every time you correct a category, the app remembers it and applies it automatically next time.
                  Below are the patterns it has learned.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.learning.total_rules === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No rules learned yet. Import some transactions and correct the AI's suggestions to start building your personal rulebook.
                  </p>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Most applied rules */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Most Applied ({data.learning.active_rules} active)
                      </p>
                      <div className="space-y-1.5">
                        {data.learning.most_applied_rules.slice(0, 8).map((r, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground/50 w-5 tabular-nums shrink-0">
                              {r.times_applied}×
                            </span>
                            <span className="flex-1 min-w-0 truncate font-mono text-[11px]" title={r.pattern}>
                              {r.pattern.length > 28 ? r.pattern.slice(0, 28) + '…' : r.pattern}
                            </span>
                            <Badge variant="secondary" className="text-[10px] py-0 shrink-0">
                              {r.category}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Recently learned */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Recently Learned
                      </p>
                      <div className="space-y-1.5">
                        {data.learning.recent_corrections.slice(0, 8).map((r, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground/50 shrink-0 w-14 tabular-nums">
                              {r.updated_at ?? '—'}
                            </span>
                            <span className="flex-1 min-w-0 truncate font-mono text-[11px]" title={r.pattern}>
                              {r.pattern.length > 24 ? r.pattern.slice(0, 24) + '…' : r.pattern}
                            </span>
                            <Badge variant="outline" className="text-[10px] py-0 shrink-0">
                              {r.category}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Import Health ─────────────────────────────────────── */}
            <div className="grid md:grid-cols-2 gap-6">

              {/* By institution */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Upload className="w-4 h-4 text-green-500" /> Import Health
                  </CardTitle>
                  <CardDescription>
                    {data.import_health.total_batches} import{data.import_health.total_batches !== 1 ? 's' : ''} ·{' '}
                    last {data.import_health.last_import_date ?? 'never'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Source type split */}
                  <div className="flex gap-3">
                    <div className="flex-1 rounded-lg bg-muted/50 p-2.5 text-center">
                      <FileText className="w-4 h-4 text-muted-foreground mx-auto mb-0.5" />
                      <p className="text-lg font-bold tabular-nums">{data.import_health.by_source_type.pdf}</p>
                      <p className="text-xs text-muted-foreground">PDF</p>
                    </div>
                    <div className="flex-1 rounded-lg bg-muted/50 p-2.5 text-center">
                      <Database className="w-4 h-4 text-muted-foreground mx-auto mb-0.5" />
                      <p className="text-lg font-bold tabular-nums">{data.import_health.by_source_type.csv}</p>
                      <p className="text-xs text-muted-foreground">CSV</p>
                    </div>
                    <div className="flex-1 rounded-lg bg-muted/50 p-2.5 text-center">
                      <Target className="w-4 h-4 text-muted-foreground mx-auto mb-0.5" />
                      <p className="text-lg font-bold tabular-nums">{data.import_health.dupe_rate_pct.toFixed(1)}%</p>
                      <p className="text-xs text-muted-foreground">Dupe rate</p>
                    </div>
                  </div>

                  {/* By institution */}
                  {data.import_health.by_institution.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">By Institution</p>
                      {data.import_health.by_institution.map(inst => {
                        const maxTxns = Math.max(...data.import_health.by_institution.map(x => x.transactions), 1)
                        return (
                          <div key={inst.institution} className="space-y-0.5">
                            <div className="flex justify-between text-xs">
                              <span className="truncate max-w-[160px]" title={inst.institution}>{inst.institution}</span>
                              <span className="text-muted-foreground tabular-nums">
                                {inst.transactions.toLocaleString()} txns · {inst.batches} import{inst.batches !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <MiniBar value={inst.transactions} max={maxTxns} color="bg-green-500/70" />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Volume trend */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" /> Import Volume Trend
                  </CardTitle>
                  <CardDescription>Transactions imported per month</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.import_health.volume_trend.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No import history yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {(() => {
                        const maxVal = Math.max(...data.import_health.volume_trend.map(t => t.count), 1)
                        return data.import_health.volume_trend.map(t => (
                          <div key={t.month} className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground w-14 shrink-0">{formatMonth(t.month)}</span>
                            <div className="flex-1">
                              <MiniBar value={t.count} max={maxVal} color="bg-primary/60" />
                            </div>
                            <span className="text-muted-foreground w-8 text-right tabular-nums shrink-0">
                              {t.count}
                            </span>
                          </div>
                        ))
                      })()}
                    </div>
                  )}

                  {/* Summary stats */}
                  <div className="grid grid-cols-2 gap-2 border-t mt-4 pt-3">
                    <div className="text-center">
                      <p className="text-lg font-bold tabular-nums">{data.import_health.avg_batch_size}</p>
                      <p className="text-xs text-muted-foreground">Avg per import</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold tabular-nums text-amber-500">
                        {data.import_health.total_dupes_skipped.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Dupes skipped</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── How learning works ────────────────────────────────── */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-5 pb-4">
                <div className="flex gap-3">
                  <div className="p-2 rounded-full bg-primary/10 h-fit">
                    <Cpu className="w-4 h-4 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-sm">How AI Learning Works</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Every time you correct a category or merchant name — in the staging review, the
                      transactions list, or the review queue — the app creates a{' '}
                      <span className="font-medium text-foreground">merchant rule</span> for that pattern.
                      The next time a transaction with the same description comes in, the rule fires
                      automatically before the AI even gets involved (confidence 100%, no review needed).
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                      <span className="font-medium text-foreground">Merchant renames</span> (e.g. cleaning
                      up "ZELLE PAYMENT 12345" to "John — Rent") are also remembered via the merchant
                      field in the rule, so the cleaned name appears on all future matches.
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                      You can view and edit all learned rules in{' '}
                      <a href="/settings" className="text-primary underline underline-offset-2">Settings → Rules</a>.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-right">
              Generated {new Date(data.generated_at).toLocaleString()}
            </p>
          </motion.div>
        )}
      </div>
    </MainLayout>
  )
}
