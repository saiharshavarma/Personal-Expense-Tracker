import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Filter, Plus, LayoutList, LayoutGrid, ArrowUpDown, Download } from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

const SKELETON_ROWS = 8

export function Transactions() {
  const [view, setView] = useState<'table' | 'card'>('table')
  const [search, setSearch] = useState('')

  return (
    <MainLayout>
      <TopBar
        title="Transactions"
        subtitle="All your financial activity in one place"
        actions={
          <>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4" />
              Export
            </Button>
            <Button size="sm">
              <Plus className="w-4 h-4" />
              Add Transaction
            </Button>
          </>
        }
      />

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search transactions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm">
          <Filter className="w-4 h-4" />
          Filters
        </Button>
        <div className="ml-auto flex items-center gap-1 rounded-lg border p-1">
          <button
            onClick={() => setView('table')}
            className={`p-1.5 rounded-md transition-colors ${view === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <LayoutList className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView('card')}
            className={`p-1.5 rounded-md transition-colors ${view === 'card' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table skeleton */}
      <Card>
        <div className="divide-y">
          {/* Header */}
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <div className="col-span-2 flex items-center gap-1 cursor-pointer hover:text-foreground">Date <ArrowUpDown className="w-3 h-3" /></div>
            <div className="col-span-4">Description</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-1">Account</div>
            <div className="col-span-1">Type</div>
            <div className="col-span-2 text-right flex items-center justify-end gap-1 cursor-pointer hover:text-foreground">Amount <ArrowUpDown className="w-3 h-3" /></div>
          </div>
          {/* Skeleton rows */}
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.04 }}
              className="grid grid-cols-12 gap-4 px-4 py-3.5 items-center"
            >
              <div className="col-span-2"><Skeleton className="h-4 w-20" /></div>
              <div className="col-span-4 space-y-1">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="col-span-2"><Skeleton className="h-5 w-20 rounded-full" /></div>
              <div className="col-span-1"><Skeleton className="h-4 w-16" /></div>
              <div className="col-span-1"><Skeleton className="h-4 w-12" /></div>
              <div className="col-span-2 flex justify-end"><Skeleton className="h-4 w-16" /></div>
            </motion.div>
          ))}
        </div>

        {/* Empty state */}
        <CardContent className="py-12 text-center">
          <div className="mx-auto max-w-sm space-y-3">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
              <ArrowUpDown className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No transactions yet</p>
              <p className="text-sm text-muted-foreground mt-1">Import a bank statement or add a transaction manually to get started</p>
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm">Import Statement</Button>
              <Button size="sm"><Plus className="w-4 h-4" />Add Manually</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </MainLayout>
  )
}
