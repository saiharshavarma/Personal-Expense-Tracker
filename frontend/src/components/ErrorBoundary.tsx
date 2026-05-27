import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Phase 14: React error boundary.
 * Catches uncaught JS errors in any child component tree and shows a
 * friendly recovery screen instead of a blank white page.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In production you'd send this to an error tracker.
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const msg = this.state.error?.message ?? 'An unexpected error occurred.'

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">{msg}</p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={this.handleReset} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4" />
              Try again
            </Button>
            <Button onClick={() => window.location.reload()} size="sm">
              Reload page
            </Button>
          </div>
          {(import.meta as unknown as { env: { DEV: boolean } }).env.DEV && this.state.error?.stack && (
            <details className="text-left mt-4">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Stack trace (dev only)
              </summary>
              <pre className="text-xs text-muted-foreground mt-2 overflow-auto max-h-64 p-3 bg-muted rounded-lg whitespace-pre-wrap">
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      </div>
    )
  }
}
