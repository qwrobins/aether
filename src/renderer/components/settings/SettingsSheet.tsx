import { useCallback } from 'react';
import { Check, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useUiStore, type AppTheme } from '@/stores/uiStore';

interface ThemeOption {
  id: AppTheme;
  label: string;
  description: string;
  preview: {
    bg: string;
    surface: string;
    primary: string;
    accent: string;
  };
}

const themes: ThemeOption[] = [
  {
    id: 'luminous',
    label: 'Luminous Ether',
    description: 'Warm dark with indigo glow',
    preview: {
      bg: '#0a0a0f',
      surface: '#0f0f15',
      primary: '#8b7fd4',
      accent: '#e8b86d',
    },
  },
  {
    id: 'obsidian',
    label: 'Obsidian',
    description: 'Cool slate with teal accent',
    preview: {
      bg: '#090c0e',
      surface: '#0e1216',
      primary: '#5eead4',
      accent: '#38bdf8',
    },
  },
  {
    id: 'solarized',
    label: 'Solarized',
    description: 'Muted navy with amber tones',
    preview: {
      bg: '#0a1014',
      surface: '#0f1a20',
      primary: '#b58900',
      accent: '#cb4b16',
    },
  },
  {
    id: 'carbon',
    label: 'Carbon',
    description: 'Pure grayscale with electric blue',
    preview: {
      bg: '#0a0a0a',
      surface: '#111111',
      primary: '#60a5fa',
      accent: '#2563eb',
    },
  },
  {
    id: 'ocean',
    label: 'Ocean',
    description: 'Deep blue-green with coral',
    preview: {
      bg: '#060e14',
      surface: '#0a1a24',
      primary: '#7dd3fc',
      accent: '#ff9f7a',
    },
  },
  {
    id: 'ember',
    label: 'Ember',
    description: 'Warm dark with orange glow',
    preview: {
      bg: '#0f0a08',
      surface: '#1a110e',
      primary: '#f97316',
      accent: '#fbbf24',
    },
  },
];

function ThemeCard({
  theme,
  isActive,
  onSelect,
}: {
  theme: ThemeOption;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={isActive}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all duration-150',
        isActive
          ? 'border-primary/40 bg-primary/[0.06]'
          : 'border-border/40 bg-transparent hover:border-border/70 hover:bg-white/[0.02]',
      )}
    >
      {/* Color preview */}
      <div
        className="flex h-10 w-10 shrink-0 flex-col overflow-hidden rounded-md border border-white/[0.06]"
        style={{ background: theme.preview.bg }}
      >
        <div className="flex h-1/2 w-full">
          <div className="h-full w-1/2" style={{ background: theme.preview.surface }} />
          <div className="h-full w-1/2" style={{ background: theme.preview.primary }} />
        </div>
        <div className="flex h-1/2 w-full">
          <div className="h-full w-1/2" style={{ background: theme.preview.accent }} />
          <div className="h-full w-1/2" style={{ background: theme.preview.bg }} />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-foreground">
            {theme.label}
          </span>
          {isActive && (
            <Check size={13} className="shrink-0 text-primary" />
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {theme.description}
        </p>
      </div>
    </button>
  );
}

export function SettingsSheet() {
  const { settingsOpen, setSettingsOpen, theme, setTheme } = useUiStore();

  const handleOpenChange = useCallback(
    (value: boolean) => {
      setSettingsOpen(value);
    },
    [setSettingsOpen],
  );

  return (
    <Sheet open={settingsOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-[340px] sm:max-w-[340px] bg-background/95 backdrop-blur-2xl border-white/[0.06] flex flex-col"
      >
        <SheetHeader>
          <SheetTitle className="text-base">Settings</SheetTitle>
          <SheetDescription className="text-[12px]">
            Customize Aether&apos;s appearance and behavior
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          {/* Appearance */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Palette size={14} className="text-muted-foreground" />
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Appearance
              </h3>
            </div>
            <div className="space-y-2">
              {themes.map((t) => (
                <ThemeCard
                  key={t.id}
                  theme={t}
                  isActive={theme === t.id}
                  onSelect={() => setTheme(t.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
