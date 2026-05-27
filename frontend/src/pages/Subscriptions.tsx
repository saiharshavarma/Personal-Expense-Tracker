import { motion } from 'framer-motion'
import { RefreshCw, Plus, TrendingUp, Calendar, Star, Briefcase, User } from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

const COST_SUMMARY = [
  { label: 'Monthly Total', value: '$0.00', sub: '0 active', icon: RefreshCw },
  { label: 'Annual Total', value: '$0.00', sub: 'projected', icon: TrendingUp },
  { label: 'Personal', value: '$0.00', sub: '0 subs', icon: User },
  { label: 'Work / Business', value: '$0.00', sub: '0 subs', icon: Briefcase },
]

const PLACEHOLDER_SUBS = Array.from({ length: 6 }, (_, i) => i)

export function Subscriptions() {
  return (
    <MainLayout>
      <TopBar
        title="Subscriptions"
        subtitle="All your recurring charges in one place"
        actions={
          <>
            <Button variant="outline" size="sm"><Star className="w-4 h-4" />Quarterly Audit</Button>
            <Button size="sm"><Plus className="w-4 h-4" />Add Subscription</Button>
          </>
        }
      />

      {/* Cost summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {COST_SUMMARY.map(({ label, value, sub, icon: Icon }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <p className="text-xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Upcoming renewals */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="w-4 h-4" /> Upcoming Renewals (Next 30 Days)
          </CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-center">
          <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No renewals coming up. Add subscriptions to track them here.</p>
        </CardContent>
      </Card>

      {/* Subscription grid */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">All Subscriptions</h2>
        <div className="flex gap-1">
          <Badge variant="outline" className="cursor-pointer">All</Badge>
          <Badge variant="secondary" className="cursor-pointer">Personal</Badge>
          <Badge variant="outline" className="cursor-pointer">Work</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {PLACEHOLDER_SUBS.map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className="overflow-hidden">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between mb-3">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-6 w-12 rounded-full" />
                </div>
                <Separator className="my-2" />
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-16" />
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <Star key={s} className="w-3 h-3 text-muted-foreground/30" />
                    ))}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <Skeleton className="h-3 w-24" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Empty state */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-10 text-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <RefreshCw className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="font-medium">No subscriptions tracked yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add subscriptions manually or they'll be auto-detected when you import statements
            </p>
          </div>
          <Button size="sm" variant="outline"><Plus className="w-4 h-4" />Add Subscription</Button>
        </CardContent>
      </Card>

      {/* Cancelled log */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground">Cancelled Subscriptions</CardTitle>
        </CardHeader>
        <CardContent className="py-4 text-center">
          <p className="text-xs text-muted-foreground">Cancelled subscriptions will appear here for historical reference.</p>
        </CardContent>
      </Card>
    </MainLayout>
  )
}
