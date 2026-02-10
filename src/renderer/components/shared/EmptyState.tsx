import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon: Icon, title, subtitle }: EmptyStateProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className="flex flex-col items-center justify-center py-12"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
    >
      <Icon
        size={48}
        className="animate-[gentle-pulse_3s_ease-in-out_infinite] text-muted-foreground/30"
      />
      <p className="mt-3 text-[13px] text-muted-foreground">{title}</p>
      {subtitle && (
        <p className="mt-1 text-[11px] text-muted-foreground/60">{subtitle}</p>
      )}
    </motion.div>
  );
}
