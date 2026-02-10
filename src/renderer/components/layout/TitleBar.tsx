import { Gem } from 'lucide-react';

export function TitleBar() {
  return (
    <div
      className="flex h-[38px] shrink-0 items-center justify-between border-b border-border/50 bg-gradient-to-r from-surface to-[oklch(0.11_0.01_280)] px-4"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <Gem size={14} className="text-primary" />
        <span className="text-[13px] font-semibold tracking-[0.08em] text-foreground/90">
          Aether
        </span>
      </div>

      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-white/[0.06] hover:text-foreground"
          aria-label="Minimize"
        >
          &#8722;
        </button>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-white/[0.06] hover:text-foreground"
          aria-label="Maximize"
        >
          &#9633;
        </button>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-red-500/80 hover:text-white"
          aria-label="Close"
        >
          &#10005;
        </button>
      </div>
    </div>
  );
}
