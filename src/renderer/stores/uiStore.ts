import { create } from 'zustand';

export type AppTheme = 'luminous' | 'obsidian' | 'solarized' | 'carbon' | 'ocean' | 'ember';

const THEME_STORAGE_KEY = 'aether-theme';
const VALID_THEMES: AppTheme[] = ['luminous', 'obsidian', 'solarized', 'carbon', 'ocean', 'ember'];

function getInitialTheme(): AppTheme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as AppTheme | null;
    if (stored && VALID_THEMES.includes(stored)) return stored;
  } catch {
    // localStorage unavailable
  }
  return 'luminous';
}

interface UiState {
  sidebarExpanded: boolean;
  transferQueueExpanded: boolean;
  theme: AppTheme;
  settingsOpen: boolean;
  toggleSidebar: () => void;
  toggleTransferQueue: () => void;
  setTheme: (theme: AppTheme) => void;
  setSettingsOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarExpanded: true,
  transferQueueExpanded: false,
  theme: getInitialTheme(),
  settingsOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
  toggleTransferQueue: () =>
    set((s) => ({ transferQueueExpanded: !s.transferQueueExpanded })),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
    set({ theme });
  },
  setSettingsOpen: (open) => set({ settingsOpen: open }),
}));
