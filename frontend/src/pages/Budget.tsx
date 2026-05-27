import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Target, TrendingUp } from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { monthName, getCurrentMonthYear } from '@/lib/utils'

const { month: currentMonth, year: currentYear } = getCurrentMonthYear()

const STATUS_COLORS = {
  safe: 'bg-green-500',
  watch: 'bg-yellow-500',
  over: 'bg-destructive',
}

export function Budget() {
  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1) }

  return (
    <MainLayout>
      <TopBar
        title="Budget"
        subtitle="Set and track your monthly spending targets"
        actions={
          <>
            <Button variant="outline" size="sm">Copy Previous Month</Button>
            <Button size="sm"><Plus className="w-4 h-4" />Add Category</Button>
          </>
        }
      />

      {/* Month selector */}
      <div className="flex items-center gap-2 mb-6">
        <div className="flex items-center rounded-lg border bg-card">
          <button onClick={prevMonth} className="p-2 hover:bg-accent rounded-l-lg transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="px-4 py-2 text-sm font-medium min-w-[140px] text-center">{monthName(month)} {year}</div>
          <button onClick={nextMonth} className="p-2 hover:bg-accent rounded-r-lg transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <Badge variant="outline">50/30/20 Rule</Badge>
      </div>

      {/* 50/30/20 summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Needs', target: 50, spent: 0, color: 'bg-blue-500' },
          { label: 'Wants', target: 30, spent: 0, color: 'bg-purple-500' },
          { label: 'Savings', target: 20, spent: 0, color: 'bg-green-500' },
        ].map(({ label, target, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">Target: {target}%</span>
              </div>
              <Progress value={0} className="h-2" />
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>$0 spent</span>
                <span>0%</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Budget table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Category Budgets</CardTitle>
        </CardHeader>
        <div className="divide-y">
          <div className="grid grid-cols-7 gap-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <div className="col-span-2">Category</div>
            <div className="text-right">Budget</div>
            <div className="text-right">Spent</div>
            <div className="text-right">Reimbursed</div>
            <div className="text-right">Net Personal</div>
            <div className="text-right">Status</div>
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-7 gap-4 px-4 py-3 items-center">
              <div className="col-span-2"><Skeleton className="h-4 w-32" /></div>
              <div className="flex justify-end"><Skeleton className="h-4 w-16" /></div>
              <div className="flex justify-end"><Skeleton className="h-4 w-16" /></div>
              <div className="flex justify-end"><Skeleton className="h-4 w-12" /></div>
              <div className="flex justify-end"><Skeleton className="h-4 w-16" /></div>
              <div className="flex justify-end"><Skeleton className="h-5 w-12 rounded-full" /></div>
            </div>
          ))}
        </div>
        <CardContent className="py-10 text-center">
          <Target className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">No budgets set for this month</p>
          <p className="text-sm text-muted-foreground mt-1">Set budgets per category or copy from a previous month</p>
          <div className="flex gap-2 justify-center mt-4">
            <Button variant="outline" size="sm">Copy Previous Month</Button>
            <Button size="sm"><Plus className="w-4 h-4" />Set Budgets</Button>
          </div>
        </CardContent>
      </Card>
    </MainLayout>
  )
}
