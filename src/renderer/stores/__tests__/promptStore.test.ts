import { beforeEach, describe, expect, it } from 'vitest';
import { usePromptStore } from '../promptStore';

function resetStore(): void {
  usePromptStore.setState({
    isOpen: false,
    title: '',
    defaultValue: '',
    placeholder: '',
    resolve: null,
  });
}

describe('usePromptStore', () => {
  beforeEach(() => {
    resetStore();
  });

  it('resolves an orphaned prompt with null when a second prompt opens', async () => {
    const first = usePromptStore.getState().open({ title: 'First' });
    const second = usePromptStore.getState().open({ title: 'Second' });

    await expect(first).resolves.toBeNull();
    expect(usePromptStore.getState()).toMatchObject({ isOpen: true, title: 'Second' });

    usePromptStore.getState().close('second-value');
    await expect(second).resolves.toBe('second-value');
    expect(usePromptStore.getState()).toMatchObject({ isOpen: false, resolve: null });
  });

  it('resolves with the close value for a single prompt', async () => {
    const prompt = usePromptStore.getState().open({ title: 'Only', defaultValue: 'seed' });

    expect(usePromptStore.getState()).toMatchObject({
      isOpen: true,
      title: 'Only',
      defaultValue: 'seed',
    });

    usePromptStore.getState().close(null);
    await expect(prompt).resolves.toBeNull();
  });
});
