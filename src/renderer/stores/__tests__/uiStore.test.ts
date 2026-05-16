// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '@/stores/uiStore';

describe('useUiStore', () => {
  beforeEach(() => {
    useUiStore.setState({
      sidebarExpanded: true,
      transferQueueExpanded: false,
      theme: 'luminous',
      settingsOpen: false,
    });
  });

  it('toggles sidebar and transfer queue state', () => {
    useUiStore.getState().toggleSidebar();
    useUiStore.getState().toggleTransferQueue();

    expect(useUiStore.getState()).toMatchObject({
      sidebarExpanded: false,
      transferQueueExpanded: true,
    });
  });

  it('sets the selected theme', () => {
    useUiStore.getState().setTheme('carbon');
    expect(useUiStore.getState().theme).toBe('carbon');
  });

  it('accepts all theme variants', () => {
    const themes = ['luminous', 'obsidian', 'solarized', 'carbon', 'ocean', 'ember'] as const;
    for (const theme of themes) {
      useUiStore.getState().setTheme(theme);
      expect(useUiStore.getState().theme).toBe(theme);
    }
  });

  it('toggles settings sheet open state', () => {
    expect(useUiStore.getState().settingsOpen).toBe(false);
    useUiStore.getState().setSettingsOpen(true);
    expect(useUiStore.getState().settingsOpen).toBe(true);
  });
});
