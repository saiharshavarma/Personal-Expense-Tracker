import { ReactNode } from 'react'

interface TopBarProps {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function TopBar({ title, subtitle, actions }: TopBarProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div>}
    </div>
  )
}
