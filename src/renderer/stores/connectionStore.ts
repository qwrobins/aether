import { create } from 'zustand';
import type { ConnectionProfile } from '@shared/types/connection';

interface ConnectionState {
  profiles: ConnectionProfile[];
  isLoading: boolean;
  selectedConnectionId: string | null;

  loadProfiles: () => Promise<void>;
  saveProfile: (profile: Omit<ConnectionProfile, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<string>;
  deleteProfile: (id: string) => Promise<void>;
  testConnection: (profile: ConnectionProfile) => Promise<boolean>;
  setSelectedConnection: (id: string | null) => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  profiles: [],
  isLoading: false,
  selectedConnectionId: null,

  loadProfiles: async () => {
    set({ isLoading: true });
    try {
      const profiles = await window.api.invoke('conn:list');
      set({ profiles, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  saveProfile: async (profile) => {
    const id = await window.api.invoke('conn:save', profile as ConnectionProfile);
    await get().loadProfiles();
    return id;
  },

  deleteProfile: async (id) => {
    await window.api.invoke('conn:delete', id);
    const { selectedConnectionId } = get();
    if (selectedConnectionId === id) {
      set({ selectedConnectionId: null });
    }
    await get().loadProfiles();
  },

  testConnection: async (profile) => {
    return window.api.invoke('conn:test', profile as ConnectionProfile);
  },

  setSelectedConnection: (id) => set({ selectedConnectionId: id }),
}));
