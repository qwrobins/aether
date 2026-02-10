import React from 'react';
import { Toaster } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
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

export default function App() {
  return (
    <ErrorBoundary>
      <AppLayout />
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          style: {
            background: 'oklch(0.13 0.012 280)',
            border: '1px solid oklch(0.20 0.015 280)',
            color: 'oklch(0.92 0.008 260)',
          },
        }}
      />
    </ErrorBoundary>
  );
}
