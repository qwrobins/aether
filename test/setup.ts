import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

type TestApi = {
  getPathForFile: ReturnType<typeof vi.fn>;
  invoke: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      randomUUID: vi.fn(() => 'test-uuid'),
      getRandomValues: vi.fn((array: Uint8Array) => {
        array.fill(1);
        return array;
      }),
    },
    writable: true,
    configurable: true,
  });
}

if (typeof window !== 'undefined') {
  const testWindow = window as Window & typeof globalThis & { api: TestApi };

  Object.defineProperty(testWindow, 'api', {
    value: {
      getPathForFile: vi.fn(),
      invoke: vi.fn(),
      on: vi.fn(() => vi.fn()),
    },
    writable: true,
    configurable: true,
  });

  Object.defineProperty(window, 'confirm', {
    value: vi.fn(() => true),
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();

  if (typeof window !== 'undefined') {
    const testWindow = window as Window & typeof globalThis & { api: TestApi };
    testWindow.api.getPathForFile = vi.fn();
    testWindow.api.invoke = vi.fn();
    testWindow.api.on = vi.fn(() => vi.fn());
  }
});
