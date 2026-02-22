import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from '@/components/ui/breadcrumb';

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

  // On Unix, the root is "/"; on Windows it might be "C:/"
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
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap text-[12px] gap-1">
        <BreadcrumbItem>
          <BreadcrumbLink
            className="cursor-pointer text-[12px] text-muted-foreground hover:text-foreground"
            onClick={() => onNavigate(rootPath)}
          >
            {rootLabel}
          </BreadcrumbLink>
        </BreadcrumbItem>

        {shouldCollapse && (
          <>
            <BreadcrumbSeparator className="[&>svg]:size-3" />
            <BreadcrumbItem>
              <BreadcrumbLink
                className="cursor-pointer text-[12px] text-muted-foreground hover:text-foreground"
                onClick={() => {
                  const idx = (isS3Prefix || isUnix) ? 0 : 1;
                  onNavigate(buildPath(idx));
                }}
              >
                {displaySegments[0]}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="[&>svg]:size-3" />
            <BreadcrumbItem>
              <BreadcrumbEllipsis className="size-5" />
            </BreadcrumbItem>
          </>
        )}

        {(shouldCollapse ? visibleSegments.slice(1) : visibleSegments).map(
          (segment, i) => {
            const realIndex = shouldCollapse
              ? displaySegments.length - 2 + i
              : i;
            const fullIndex = (isS3Prefix || isUnix) ? realIndex : realIndex + 1;
            const isLast = realIndex === displaySegments.length - 1;

            return (
              <span key={fullIndex} className="contents">
                <BreadcrumbSeparator className="[&>svg]:size-3" />
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage className="text-[12px] max-w-[150px] truncate">
                      {segment}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      className="cursor-pointer text-[12px] text-muted-foreground hover:text-foreground max-w-[120px] truncate"
                      onClick={() => onNavigate(buildPath(fullIndex))}
                    >
                      {segment}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </span>
            );
          }
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
