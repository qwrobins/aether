import type { FileEntry } from '@shared/types/filesystem';

export function getNativeDroppedFiles(
  dataTransfer: Pick<DataTransfer, 'files'>,
): Pick<FileEntry, 'path' | 'name' | 'size'>[] {
  // Resolve every native File synchronously while the drop data is accessible.
  // Never fall back to text/URI payloads: another app can forge arbitrary paths.
  return Array.from(dataTransfer.files, (file) => {
    const path = window.api.getPathForFile(file);
    if (!path) {
      throw new Error(`Cannot access "${file.name}". Drop a local file or folder from your file manager.`);
    }
    return { path, name: file.name, size: file.size };
  });
}
