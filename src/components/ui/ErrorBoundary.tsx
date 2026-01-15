import React from 'react'

type Props = {
  children: React.ReactNode
  /** optional label to help identify which subtree crashed */
  name?: string
  /** optional fallback UI */
  fallback?: React.ReactNode
}

type State = {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    error: undefined,
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep the app alive and log the error for debugging
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', this.props.name || 'unknown', error, info)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div style={{
          padding: '12px',
          border: '1px solid #fecaca',
          background: '#fef2f2',
          borderRadius: '8px',
          color: '#7f1d1d',
        }}>
          <div style={{ fontWeight: 700, marginBottom: '6px' }}>
            页面渲染出错{this.props.name ? `（${this.props.name}）` : ''}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '10px' }}>
            你可以点击刷新继续使用。如果该问题可复现，请把控制台报错发我定位。
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: 'none',
              background: '#ef4444',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            刷新页面
          </button>
          {this.state.error?.message && (
            <div style={{ marginTop: '10px', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
              {this.state.error.message}
            </div>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
