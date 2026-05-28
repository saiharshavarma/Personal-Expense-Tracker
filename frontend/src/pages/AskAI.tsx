import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare, Send, Shield, Sparkles, TrendingUp, PieChart,
  AlertTriangle, ChevronRight, Lock, Bot, User, Loader2, Settings,
} from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DateRangePicker, defaultRange, type DateRange } from '@/components/DateRangePicker'
import { usePreferencesStore } from '@/store'
import { api } from '@/utils/apiClient'

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: Date
  error?: boolean
}

// ── Constants ────────────────────────────────────────────────────────────────

const EXAMPLE_PROMPTS = [
  { icon: TrendingUp,    text: 'How has my spending changed compared to last month?' },
  { icon: PieChart,      text: 'What categories am I overspending in?' },
  { icon: AlertTriangle, text: 'Am I on track to meet my savings goal this month?' },
  { icon: Sparkles,      text: 'What are my biggest unusual expenses recently?' },
]

const PRIVACY_POINTS = [
  'Aggregated category totals (e.g., "Food: $420")',
  'Percentage breakdowns by category',
  'Month-over-month trend numbers',
  'Overall income and expense totals',
]

const NOT_SENT = [
  'Individual transaction descriptions or merchant names',
  'Account numbers, card numbers, or bank info',
  'Your name or any personal identifiers',
  'Raw transaction data of any kind',
]

// ── Privacy notice (always visible) ─────────────────────────────────────────

function PrivacyCard() {
  return (
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
              {PRIVACY_POINTS.map(p => (
                <li key={p} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="text-green-500 mt-0.5 flex-shrink-0">•</span>{p}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium text-destructive mb-1.5">✗ What is NEVER sent</p>
            <ul className="space-y-1">
              {NOT_SENT.map(p => (
                <li key={p} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="text-destructive mt-0.5 flex-shrink-0">•</span>{p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Opt-in gate ──────────────────────────────────────────────────────────────

function OptInGate({ hasKey }: { hasKey: boolean }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-14 text-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
          <Lock className="w-7 h-7 text-primary" />
        </div>
        <div>
          <p className="font-semibold">AI insights are opt-in</p>
          {!hasKey ? (
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Add an Anthropic or OpenAI API key in Settings, then enable AI insights to ask questions about your finances.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Enable AI analysis in Settings to ask questions about your finances.
              Your data stays private — only aggregated stats are shared.
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

// ── Chat message bubble ──────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
        isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
      }`}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-muted-foreground" />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? 'bg-primary text-primary-foreground rounded-tr-sm'
          : msg.error
          ? 'bg-destructive/10 text-destructive border border-destructive/20 rounded-tl-sm'
          : 'bg-muted text-foreground rounded-tl-sm'
      }`}>
        <p className="whitespace-pre-wrap">{msg.text}</p>
        <p className={`text-xs mt-1 opacity-60 ${isUser ? 'text-right' : ''}`}>
          {msg.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </p>
      </div>
    </motion.div>
  )
}

// ── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
        <Bot className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-5">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Example prompts ──────────────────────────────────────────────────────────

function ExamplePrompts({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div>
      <p className="text-sm font-medium mb-3">Example questions</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {EXAMPLE_PROMPTS.map(({ icon: Icon, text }) => (
          <button
            key={text}
            onClick={() => onSelect(text)}
            className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors text-left group"
          >
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors flex-1">{text}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export function AskAI() {
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [range, setRange] = useState<DateRange>(defaultRange)
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Use the shared preferences store — reacts instantly when Settings changes
  const { prefs, loading: prefsLoading, load } = usePreferencesStore()
  useEffect(() => { load() }, [load])

  // Scroll to bottom when messages change
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const isOptedIn = prefs?.ai_insights_opt_in === true
  const hasApiKey = !!(prefs?.anthropic_api_key_set || prefs?.openai_api_key_set)

  const sendQuery = async (text: string) => {
    const q = text.trim()
    if (!q || isTyping) return

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: q,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setQuery('')
    setIsTyping(true)

    try {
      const res = await api.post('/ai/query', {
        question: q,
        date_from: range.date_from,
        date_to: range.date_to,
      })
      const answer = res.data.answer ?? 'No response received.'
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: answer,
        timestamp: new Date(),
      }])
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? 'Something went wrong. Please try again.'
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: detail,
        timestamp: new Date(),
        error: true,
      }])
    } finally {
      setIsTyping(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && query.trim()) {
      e.preventDefault()
      sendQuery(query)
    }
  }

  const clearHistory = () => setMessages([])

  return (
    <MainLayout>
      <TopBar
        title="Ask AI"
        subtitle="Get insights about your finances from aggregated data"
      />

      <PrivacyCard />

      {prefsLoading ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Checking AI configuration…</p>
          </CardContent>
        </Card>
      ) : !isOptedIn ? (
        <AnimatePresence mode="wait">
          <motion.div key="gate" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <OptInGate hasKey={hasApiKey} />
          </motion.div>
        </AnimatePresence>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {/* Date range selector */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground">Analyzing:</span>
              <DateRangePicker value={range} onChange={r => { setRange(r); setMessages([]) }} />
              {messages.length === 0 && (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  — change period to re-focus the AI context
                </span>
              )}
            </div>

            {/* Chat history */}
            {messages.length > 0 && (
              <Card>
                <CardContent className="pt-4 pb-4 px-4">
                  <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
                    {messages.map(msg => (
                      <MessageBubble key={msg.id} msg={msg} />
                    ))}
                    {isTyping && <TypingIndicator />}
                    <div ref={chatBottomRef} />
                  </div>
                  {messages.length > 0 && (
                    <div className="mt-3 pt-3 border-t flex justify-end">
                      <button
                        onClick={clearHistory}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Clear history
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Empty chat state */}
            {messages.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center">
                  <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium">Ask anything about your finances</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Try one of the examples below or type your own question.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Input */}
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <input
                      ref={inputRef}
                      type="text"
                      placeholder="Ask about your finances…"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={isTyping}
                      className="w-full pl-9 pr-3 py-2 rounded-md border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                    />
                  </div>
                  <Button
                    onClick={() => sendQuery(query)}
                    disabled={!query.trim() || isTyping}
                    size="sm"
                    className="gap-1.5"
                  >
                    {isTyping
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Send className="w-4 h-4" />}
                    {isTyping ? 'Thinking…' : 'Ask'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Powered by {prefs?.ai_provider === 'openai' ? 'OpenAI GPT-4o' : 'Claude Sonnet'} · {range.label} · Aggregated data only
                </p>
              </CardContent>
            </Card>

            {/* Example prompts */}
            <ExamplePrompts onSelect={(text) => { setQuery(text); inputRef.current?.focus() }} />
          </motion.div>
        </AnimatePresence>
      )}

      {/* Model badge */}
      {prefs && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <Badge variant="outline" className="text-xs gap-1.5">
            <Sparkles className="w-3 h-3" />
            {prefs.ai_provider === 'openai' ? 'OpenAI GPT-4o' : 'Claude Sonnet'} — Aggregated data only
          </Badge>
        </div>
      )}
    </MainLayout>
  )
}
