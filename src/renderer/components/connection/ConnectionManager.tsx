import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useConnectionStore } from '@/stores/connectionStore';
import { ConnectionList } from './ConnectionList';
import { ConnectionForm } from './ConnectionForm';
import type { ConnectionProfile, ConnectionType } from '@shared/types/connection';

interface ConnectionManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type EditState = null | 'new' | ConnectionProfile;

export function ConnectionManager({ open, onOpenChange }: ConnectionManagerProps) {
  const { profiles, saveProfile, deleteProfile, testConnection } = useConnectionStore();
  const [editing, setEditing] = useState<EditState>(null);

  const handleEdit = useCallback((profile: ConnectionProfile) => {
    setEditing(profile);
  }, []);

  const handleNewConnection = useCallback(() => {
    setEditing('new');
  }, []);

  const handleCancel = useCallback(() => {
    setEditing(null);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteProfile(id);
        toast.success('Connection deleted');
      } catch {
        toast.error('Failed to delete connection');
      }
    },
    [deleteProfile]
  );

  const handleSave = useCallback(
    async (data: Record<string, string> & { type: ConnectionType }) => {
      try {
        const profileData = {
          ...data,
          ...(data.type === 'sftp' ? { port: Number(data.port) || 22 } : {}),
          ...(typeof editing === 'object' && editing !== null ? { id: editing.id } : {}),
        };
        await saveProfile(profileData as Omit<ConnectionProfile, 'id' | 'createdAt' | 'updatedAt'> & { id?: string });
        setEditing(null);
        toast.success(typeof editing === 'object' ? 'Connection updated' : 'Connection saved');
      } catch {
        toast.error('Failed to save connection');
      }
    },
    [saveProfile, editing]
  );

  const handleTest = useCallback(
    async (data: Record<string, string> & { type: ConnectionType }): Promise<boolean> => {
      const profileData = {
        ...data,
        ...(data.type === 'sftp' ? { port: Number(data.port) || 22 } : {}),
        id: typeof editing === 'object' && editing !== null ? editing.id : 'test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as ConnectionProfile;
      return testConnection(profileData);
    },
    [testConnection, editing]
  );

  const handleOpenChange = useCallback(
    (value: boolean) => {
      if (!value) setEditing(null);
      onOpenChange(value);
    },
    [onOpenChange]
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-[380px] sm:max-w-[380px] bg-background/95 backdrop-blur-2xl border-white/[0.06] flex flex-col"
      >
        <SheetHeader>
          <SheetTitle className="text-base">
            {editing === null
              ? 'Connections'
              : editing === 'new'
                ? 'New Connection'
                : `Edit ${editing.name}`}
          </SheetTitle>
          <SheetDescription className="text-[12px]">
            {editing === null
              ? 'Manage your S3 and SFTP connections'
              : 'Configure connection details'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-2">
          {editing === null ? (
            <ConnectionList
              profiles={profiles}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onNewConnection={handleNewConnection}
            />
          ) : (
            <ConnectionForm
              initialProfile={typeof editing === 'object' ? editing : undefined}
              onSave={handleSave}
              onCancel={handleCancel}
              onTest={handleTest}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
