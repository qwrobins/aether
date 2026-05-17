import { useEffect } from 'react';
import { useUiStore } from '@/stores/uiStore';

export function useTheme() {
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
}
