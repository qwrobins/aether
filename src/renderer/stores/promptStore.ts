import { create } from 'zustand';

interface PromptState {
  isOpen: boolean;
  title: string;
  defaultValue: string;
  placeholder: string;
  resolve: ((value: string | null) => void) | null;
  open: (opts: { title: string; defaultValue?: string; placeholder?: string }) => Promise<string | null>;
  close: (value: string | null) => void;
}

export const usePromptStore = create<PromptState>((set, get) => ({
  isOpen: false,
  title: '',
  defaultValue: '',
  placeholder: '',
  resolve: null,

  open: (opts) =>
    new Promise<string | null>((resolve) => {
      set({
        isOpen: true,
        title: opts.title,
        defaultValue: opts.defaultValue ?? '',
        placeholder: opts.placeholder ?? '',
        resolve,
      });
    }),

  close: (value) => {
    const { resolve } = get();
    resolve?.(value);
    set({ isOpen: false, resolve: null });
  },
}));
