/**
 * DateInput — standardized styled wrapper for <input type="date">.
 * Matches the overall design system: consistent height, border, focus ring,
 * and correct color-scheme for dark mode so the browser-native calendar
 * renders with the right theme.
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

export interface DateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Extra CSS classes applied to the input element. */
  className?: string
}

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="date"
      className={cn(
        // Layout & sizing
        'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm',
        // Text colours
        'text-foreground placeholder:text-muted-foreground',
        // Focus ring — matches shadcn/ui Input
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        // Disabled state
        'disabled:cursor-not-allowed disabled:opacity-50',
        // Dark-mode calendar widget
        '[color-scheme:light] dark:[color-scheme:dark]',
        className,
      )}
      {...props}
    />
  ),
)
DateInput.displayName = 'DateInput'
