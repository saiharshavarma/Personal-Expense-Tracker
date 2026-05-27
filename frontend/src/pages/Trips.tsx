import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plane, Plus, MapPin, Calendar, DollarSign, Archive, ChevronRight } from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

type TripTab = 'active' | 'upcoming' | 'past'

const TABS: { id: TripTab; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
]

const STATUS_BADGE: Record<TripTab, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  active: { label: 'Active', variant: 'default' },
  upcoming: { label: 'Upcoming', variant: 'secondary' },
  past: { label: 'Archived', variant: 'outline' },
}

const PLACEHOLDER_TRIPS = Array.from({ length: 3 }, (_, i) => i)

export function Trips() {
  const [tab, setTab] = useState<TripTab>('active')

  return (
    <MainLayout>
      <TopBar
        title="Trips"
        subtitle="Track expenses for business trips and travel"
        actions={
          <>
            <Button variant="outline" size="sm"><Archive className="w-4 h-4" />View Archive</Button>
            <Button size="sm"><Plus className="w-4 h-4" />New Trip</Button>
          </>
        }
      />

      {/* Tab strip */}
      <div className="flex gap-1 mb-6 p-1 bg-muted rounded-lg w-fit">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Trips', value: '0', icon: Plane },
          { label: 'Total Trip Spend', value: '$0.00', icon: DollarSign },
          { label: 'Active Trip Budget', value: '$0.00', icon: MapPin },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">{label}</p>
                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <p className="text-xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trip list */}
      <div className="space-y-3">
        {PLACEHOLDER_TRIPS.map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07 }}
          >
            <Card className="cursor-pointer hover:border-primary/50 transition-colors group">
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Plane className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Skeleton className="h-4 w-32" />
                      <Badge variant={STATUS_BADGE[tab].variant} className="text-xs">
                        {STATUS_BADGE[tab].label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-muted-foreground" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-muted-foreground" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Skeleton className="h-5 w-20 mb-1 ml-auto" />
                    <Skeleton className="h-3 w-16 ml-auto" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Empty state */}
      <Card className="mt-4 border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
            <Plane className="w-7 h-7 text-primary" />
          </div>
          <div>
            <p className="font-medium">No {tab} trips</p>
            <p className="text-sm text-muted-foreground mt-1">
              {tab === 'active'
                ? 'Create a trip to start tracking travel expenses. Transactions can be tagged to a trip.'
                : tab === 'upcoming'
                ? 'Plan ahead by creating trips before you travel.'
                : 'Your completed trips will be archived here for reference.'}
            </p>
          </div>
          {tab !== 'past' && (
            <Button size="sm" variant="outline"><Plus className="w-4 h-4" />New Trip</Button>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  )
}
