import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Upload, FileText, Table2, Building2, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { MainLayout } from '@/components/layout/MainLayout'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const SUPPORTED_BANKS = [
  { name: 'Chase', type: 'PDF', status: 'supported' },
  { name: 'Bank of America', type: 'PDF', status: 'supported' },
  { name: 'American Express', type: 'PDF', status: 'supported' },
  { name: 'Apple Pay (iOS Shortcut)', type: 'CSV', status: 'supported' },
  { name: 'Other Banks', type: 'PDF', status: 'generic' },
]

const HOW_IT_WORKS = [
  { step: 1, title: 'Upload statement', desc: 'Drop your PDF bank statement or Apple Pay CSV' },
  { step: 2, title: 'Auto-detection', desc: 'We detect your bank and parse the transactions' },
  { step: 3, title: 'AI categorization', desc: 'Transactions are categorized automatically' },
  { step: 4, title: 'Review & confirm', desc: 'Review flagged items and confirm the import' },
]

export function Import() {
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <MainLayout>
      <TopBar
        title="Import Statements"
        subtitle="Import bank PDFs or your Apple Pay CSV to add transactions"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload zones */}
        <div className="lg:col-span-2 space-y-4">
          {/* PDF upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="w-4 h-4 text-primary" /> Bank Statement PDF
              </CardTitle>
              <CardDescription>Upload one or multiple PDF statements at once</CardDescription>
            </CardHeader>
            <CardContent>
              <motion.div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false) }}
                animate={{ borderColor: dragOver ? 'hsl(var(--primary))' : 'hsl(var(--border))' }}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                <input ref={fileRef} type="file" accept=".pdf" multiple className="hidden" />
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">Drop PDF files here or click to browse</p>
                <p className="text-sm text-muted-foreground mt-1">Supports Chase, Bank of America, American Express</p>
              </motion.div>
            </CardContent>
          </Card>

          {/* CSV upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Table2 className="w-4 h-4 text-primary" /> Apple Pay CSV
              </CardTitle>
              <CardDescription>Import from your iOS Shortcut spreadsheet export</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onClick={() => {}}
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                <Table2 className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">Drop CSV file here or click to browse</p>
                <p className="text-sm text-muted-foreground mt-1">Format: Date, Time, Merchant, Amount, Payment Method</p>
              </div>
            </CardContent>
          </Card>

          {/* Import history stub */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Import History</CardTitle>
            </CardHeader>
            <CardContent className="text-center py-8">
              <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No imports yet. Your import history will appear here.</p>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: supported banks + how it works */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="w-4 h-4" /> Supported Institutions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {SUPPORTED_BANKS.map(({ name, type, status }) => (
                <div key={name} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    {status === 'supported'
                      ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      : <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />}
                    <span className="text-sm">{name}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">{type}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">How It Works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {HOW_IT_WORKS.map(({ step, title, desc }) => (
                <div key={step} className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {step}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Privacy first:</strong> Raw PDFs never leave your machine. Only sanitized data (no account numbers, names, or IDs) is sent to AI for categorization.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}
