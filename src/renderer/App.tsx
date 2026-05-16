import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { useTheme } from '@/hooks/useTheme';
import { useTransferEvents } from '@/hooks/useTransferEvents';

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Aether] React Error:', error.message);
    console.error('[Aether] Component Stack:', info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#e8e8e8', background: '#111118', height: '100vh', fontFamily: 'monospace' }}>
          <h1 style={{ color: '#ff6b6b', fontSize: 18 }}>Aether crashed</h1>
          <pre style={{ marginTop: 16, fontSize: 13, whiteSpace: 'pre-wrap', color: '#ff9999' }}>
            {this.state.error.message}
          </pre>
          <pre style={{ marginTop: 8, fontSize: 11, whiteSpace: 'pre-wrap', color: '#888' }}>
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function ThemeProvider({ children }: { children: ReactNode }) {
  useTheme();
  return children;
}

function AppEventBridge() {
  useTransferEvents();
  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AppEventBridge />
        <AppLayout />
      </ThemeProvider>
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-card-foreground)',
          },
        }}
      />
    </ErrorBoundary>
  );
}
