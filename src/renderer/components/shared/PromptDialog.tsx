import { useState, useEffect, useCallback } from 'react';
import { usePromptStore } from '@/stores/promptStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function PromptDialog() {
  const { isOpen, title, defaultValue, placeholder, close } = usePromptStore();
  const [value, setValue] = useState('');

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
    }
  }, [isOpen, defaultValue]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) {
      close(trimmed);
    }
  }, [value, close]);

  const handleCancel = useCallback(() => {
    close(null);
  }, [close]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCancel(); }}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-[14px] font-medium">{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="text-[13px]"
          />
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!value.trim()}>
              OK
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
