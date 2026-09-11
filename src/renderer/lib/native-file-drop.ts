import type { FileEntry } from '@shared/types/filesystem';

export function getNativeDroppedFiles(
  dataTransfer: Pick<DataTransfer, 'files'>,
): { files: Pick<FileEntry, 'path' | 'name' | 'size'>[]; errors: string[] } {
  // Resolve every native File synchronously while the drop data is accessible.
  // Never fall back to text/URI payloads: another app can forge arbitrary paths.
  const files: Pick<FileEntry, 'path' | 'name' | 'size'>[] = [];
  const errors: string[] = [];
  for (const file of Array.from(dataTransfer.files)) {
    try {
      const path = window.api.getPathForFile(file);
      if (!path) {
        throw new Error('Cannot access this item. Drop a local file or folder from your file manager.');
      }
      files.push({ path, name: file.name, size: file.size });
    } catch (error) {
      errors.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { files, errors };
}
