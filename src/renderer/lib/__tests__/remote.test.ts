import { describe, expect, it } from 'vitest';
import { getSftpDeleteErrorMessage } from '../remote';
import type { SftpDeleteResult } from '@shared/types/transfer';

function result(overrides: Partial<SftpDeleteResult> = {}): SftpDeleteResult {
  return {
    deletedCount: 0,
    failedCount: 0,
    results: [],
    ...overrides,
  };
}

describe('getSftpDeleteErrorMessage', () => {
  it('returns null when all SFTP deletes succeeded', () => {
    expect(
      getSftpDeleteErrorMessage(result({
        deletedCount: 2,
        results: [
          { path: '/remote/a.txt', success: true },
          { path: '/remote/b.txt', success: true },
        ],
      })),
    ).toBeNull();
  });

  it('formats up to three failed paths and summarizes additional failures', () => {
    expect(
      getSftpDeleteErrorMessage(result({
        failedCount: 4,
        results: [
          { path: '/remote/a.txt', success: false, error: 'denied' },
          { path: '/remote/b.txt', success: false, error: 'denied' },
          { path: '/remote/c.txt', success: false, error: 'denied' },
          { path: '/remote/d.txt', success: false, error: 'denied' },
          { path: '/remote/ok.txt', success: true },
        ],
      })),
    ).toBe('Failed to delete 4 of 5: /remote/a.txt, /remote/b.txt, /remote/c.txt and 1 more');
  });
});
