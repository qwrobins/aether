export default function App() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Title bar */}
      <div
        className="flex h-[38px] shrink-0 items-center justify-between border-b border-border/50 bg-gradient-to-r from-surface to-surface/80 px-4"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold tracking-[0.08em] text-foreground/90">
            Aether
          </span>
        </div>
        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground">
            &#8722;
          </button>
          <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground">
            &#9633;
          </button>
          <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-500/80 hover:text-white">
            &#10005;
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Aether
          </h1>
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            File transfer for S3 &amp; SFTP
          </p>
        </div>
      </div>
    </div>
  );
}
