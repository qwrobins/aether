import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon: Icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Icon size={48} className="text-muted-foreground/30" />
      <p className="mt-3 text-[13px] text-muted-foreground">{title}</p>
      {subtitle && (
        <p className="mt-1 text-[11px] text-muted-foreground/60">{subtitle}</p>
      )}
    </div>
  );
}
