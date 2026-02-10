import { Toaster } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';

export default function App() {
  return (
    <>
      <AppLayout />
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          style: {
            background: 'oklch(0.13 0.012 280)',
            border: '1px solid oklch(0.20 0.015 280)',
            color: 'oklch(0.92 0.008 260)',
            fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
            fontSize: '13px',
          },
        }}
      />
    </>
  );
}
