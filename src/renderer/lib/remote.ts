import type { SftpDeleteResult } from '@shared/types/transfer';

export function getSftpDeleteErrorMessage(result: SftpDeleteResult): string | null {
  if (result.failedCount === 0) return null;

  const failedPaths = result.results
    .filter((entry) => !entry.success)
    .map((entry) => entry.path)
    .slice(0, 3);
  const suffix = result.failedCount > failedPaths.length
    ? ` and ${result.failedCount - failedPaths.length} more`
    : '';

  return `Failed to delete ${result.failedCount} of ${result.results.length}: ${failedPaths.join(', ')}${suffix}`;
}
