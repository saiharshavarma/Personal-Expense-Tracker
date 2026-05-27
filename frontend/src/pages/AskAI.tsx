import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, Send, Shield, Sparkles, TrendingUp, PieChart, AlertTriangle, ChevronRight, Lock } from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

const EXAMPLE_PROMPTS = [
  { icon: TrendingUp, text: 'How has my spending changed compared to last month?' },
  { icon: PieChart, text: 'What categories am I overspending in?' },
  { icon: AlertTriangle, text: 'Am I on track to meet my savings goal this month?' },
  { icon: Sparkles, text: 'What are my biggest unusual expenses recently?' },
]

const PRIVACY_POINTS = [
  'Aggregated category totals (e.g., "Food: $420")',
  'Percentage breakdowns by category',
  'Month-over-month trend numbers',
  'Budget vs actual summary per category',
]

const NOT_SENT = [
  'Individual transaction descriptions or merchant names',
  'Account numbers, card numbers, or bank info',
  'Your name or any personal identifiers',
  'Raw transaction data of any kind',
]

export function AskAI() {
  const [query, setQuery] = useState('')
  const [optedIn] = useState(false)

  return (
    <MainLayout>
      <TopBar
        title="Ask AI"
        subtitle="Get insights about your finances from aggregated data"
      />

      {/* Privacy notice — always visible */}
      <Card className="mb-6 border-primary/20 bg-primary/5">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Shield className="w-4 h-4 text-primary" />
            Privacy-First AI Analysis
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            AI only receives aggregated statistics — never your raw transactions, merchant names, or account information.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1.5">✓ What IS sent to AI</p>
              <ul className="space-y-1">
                {PRIVACY_POINTS.map((point) => (
                  <li key={point} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-green-500 mt-0.5 flex-shrink-0">•</span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-destructive mb-1.5">✗ What is NEVER sent</p>
              <ul className="space-y-1">
                {NOT_SENT.map((item) => (
                  <li key={item} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-destructive mt-0.5 flex-shrink-0">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <AnimatePresence mode="wait">
        {!optedIn ? (
          <motion.div
            key="opt-in"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Lock className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <p className="font-medium">AI insights are opt-in</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                    Enable AI analysis in Settings to ask questions about your finances.
                    Your data stays private — only aggregated stats are shared.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">Learn More</Button>
                  <Button size="sm">Enable in Settings</Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {/* Query input */}
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Ask about your finances…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="pl-9"
                      onKeyDown={(e) => e.key === 'Enter' && query.trim() && console.log('query:', query)}
                    />
                  </div>
                  <Button disabled={!query.trim()}>
                    <Send className="w-4 h-4" />
                    Ask
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Powered by Claude Sonnet. Aggregated data only — see privacy notice above.
                </p>
              </CardContent>
            </Card>

            {/* Chat history placeholder */}
            <Card>
              <CardContent className="py-10 text-center">
                <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium">No conversations yet</p>
                <p className="text-xs text-muted-foreground mt-1">Your last 20 queries will appear here</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Example prompts */}
      <div className="mt-6">
        <p className="text-sm font-medium mb-3">Example questions</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {EXAMPLE_PROMPTS.map(({ icon: Icon, text }) => (
            <button
              key={text}
              onClick={() => setQuery(text)}
              className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors text-left group"
            >
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors flex-1">
                {text}
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      </div>

      {/* Model badge */}
      <div className="mt-6 flex items-center justify-center gap-2">
        <Badge variant="outline" className="text-xs gap-1">
          <Sparkles className="w-3 h-3" />
          Claude Sonnet — Aggregated data only
        </Badge>
      </div>
    </MainLayout>
  )
}
