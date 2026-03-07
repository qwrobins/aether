// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '@/stores/uiStore';

describe('useUiStore', () => {
  beforeEach(() => {
    useUiStore.setState({
      sidebarExpanded: true,
      transferQueueExpanded: false,
      theme: 'dark',
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
    useUiStore.getState().setTheme('light');
    expect(useUiStore.getState().theme).toBe('light');
  });
});
