import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Props {
  isActive: boolean;
  direction: 'upload' | 'download';
}

export function DropZone({ isActive, direction }: Props) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className={cn(
            'pointer-events-none absolute inset-0 z-10 flex items-center justify-center',
            'rounded-lg border-2 bg-primary/[0.04]',
            'animate-[breathe_1.5s_ease-in-out_infinite]'
          )}
        >
          <span className="text-[13px] font-medium text-primary/70">
            Release to {direction}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
