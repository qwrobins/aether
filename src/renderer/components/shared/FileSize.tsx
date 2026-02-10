interface FileSizeProps {
  bytes: number;
  isDirectory: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function FileSize({ bytes, isDirectory }: FileSizeProps) {
  if (isDirectory) {
    return <span className="font-mono text-[11px] text-muted-foreground">--</span>;
  }

  return (
    <span className="font-mono text-[11px] text-muted-foreground">
      {formatBytes(bytes)}
    </span>
  );
}
