import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, subtitle, action }: EmptyStateProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className="relative flex flex-col items-center justify-center py-12"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* Ambient gradient orb */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className={`h-32 w-32 rounded-full opacity-20 blur-3xl ${prefersReducedMotion ? '' : 'animate-[glow-pulse_4s_ease-in-out_infinite]'}`}
          style={{
            background: 'radial-gradient(circle, oklch(0.62 0.25 280 / 0.35), transparent 70%)',
          }}
        />
      </div>

      <motion.div
        animate={prefersReducedMotion ? {} : { y: [0, -5, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Icon
          size={44}
          strokeWidth={1.5}
          className="relative z-10 text-muted-foreground/25"
        />
      </motion.div>

      <p className="relative z-10 mt-4 text-[14px] font-medium text-foreground/70">
        {title}
      </p>
      {subtitle && (
        <p className="relative z-10 mt-1.5 max-w-[260px] text-center text-[12px] leading-relaxed text-muted-foreground/60">
          {subtitle}
        </p>
      )}
      {action && <div className="relative z-10 mt-4">{action}</div>}
    </motion.div>
  );
}
