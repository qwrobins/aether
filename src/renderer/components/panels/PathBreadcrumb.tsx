import { ChevronRight } from 'lucide-react';

interface PathBreadcrumbProps {
  path: string;
  onNavigate: (path: string) => void;
  mode?: 'filesystem' | 's3-prefix';
}

export function PathBreadcrumb({
  path,
  onNavigate,
  mode = 'filesystem',
}: PathBreadcrumbProps) {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  const isS3Prefix = mode === 's3-prefix';

  const isUnix = normalized.startsWith('/');
  let rootLabel = '/';
  let rootPath = '/';
  let displaySegments = segments;

  if (isS3Prefix) {
    rootPath = '';
  } else if (!isUnix) {
    rootLabel = segments[0] ? `${segments[0]}/` : '/';
    rootPath = segments[0] ? `${segments[0]}/` : '/';
    displaySegments = segments.slice(1);
  }

  const MAX_VISIBLE = 4;
  const shouldCollapse = displaySegments.length > MAX_VISIBLE;
  const visibleSegments = shouldCollapse
    ? [...displaySegments.slice(0, 1), ...displaySegments.slice(-2)]
    : displaySegments;

  function buildPath(segmentIndex: number): string {
    const upTo = segmentIndex + 1;
    const joined = segments.slice(0, upTo).join('/');
    if (isS3Prefix) return joined ? `${joined}/` : '';
    return isUnix ? `/${joined}` : joined;
  }

  return (
    <div className="flex min-w-0 items-center gap-0.5 overflow-hidden">
      <button
        onClick={() => onNavigate(rootPath)}
        className="shrink-0 rounded px-1.5 py-0.5 text-[12px] text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
      >
        {rootLabel}
      </button>

      {shouldCollapse && (
        <>
          <ChevronRight size={12} className="shrink-0 text-muted-foreground/30" />
          <button
            onClick={() => {
              const idx = isS3Prefix || isUnix ? 0 : 1;
              onNavigate(buildPath(idx));
            }}
            className="shrink-0 rounded px-1.5 py-0.5 text-[12px] text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            {displaySegments[0]}
          </button>
          <ChevronRight size={12} className="shrink-0 text-muted-foreground/30" />
          <span className="shrink-0 px-1 text-[12px] text-muted-foreground/40">
            &hellip;
          </span>
        </>
      )}

      {(shouldCollapse ? visibleSegments.slice(1) : visibleSegments).map(
        (segment, i) => {
          const realIndex = shouldCollapse
            ? displaySegments.length - 2 + i
            : i;
          const fullIndex = isS3Prefix || isUnix ? realIndex : realIndex + 1;
          const isLast = realIndex === displaySegments.length - 1;

          return (
            <div key={fullIndex} className="flex shrink-0 items-center gap-0.5">
              <ChevronRight
                size={12}
                className="shrink-0 text-muted-foreground/30"
              />
              {isLast ? (
                <span className="max-w-[160px] truncate rounded bg-white/[0.04] px-1.5 py-0.5 text-[12px] font-medium text-foreground">
                  {segment}
                </span>
              ) : (
                <button
                  onClick={() => onNavigate(buildPath(fullIndex))}
                  className="max-w-[120px] shrink-0 truncate rounded px-1.5 py-0.5 text-[12px] text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
                >
                  {segment}
                </button>
              )}
            </div>
          );
        },
      )}
    </div>
  );
}
