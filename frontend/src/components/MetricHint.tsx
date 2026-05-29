import { Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface MetricHintProps {
  label: string
  children: React.ReactNode
  className?: string
}

export function MetricHint({ label, children, className }: MetricHintProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              'inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              className,
            )}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-72 bg-popover px-3 py-2 text-left text-xs leading-relaxed text-popover-foreground shadow-md">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
