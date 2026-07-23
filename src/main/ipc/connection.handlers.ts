import { type MessageBoxOptions, BrowserWindow, dialog } from 'electron';
import { ConnectionService } from '../services/connection.service';
import { IpcChannels } from '@shared/constants/channels';
import type { IpcMainHandle } from './ipc-main-handle';

const SSH_FINGERPRINT_PATTERN = /^SHA256:[A-Za-z0-9+/]{43}=?$/;

export function registerConnectionHandlers(ipcMain: IpcMainHandle): void {
  const service = new ConnectionService();

  ipcMain.handle(IpcChannels.CONN_LIST, async () => {
    return service.list();
  });

  ipcMain.handle(IpcChannels.CONN_SAVE, async (_event, profile) => {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      throw new Error('Invalid connection profile: expected a plain object');
    }
    return service.save(profile);
  });

  ipcMain.handle(IpcChannels.CONN_DELETE, async (_event, id: string) => {
    return service.delete(id);
  });

  ipcMain.handle(IpcChannels.CONN_TEST, async (_event, profile) => {
    return service.test(profile);
  });

  ipcMain.handle(
    IpcChannels.CONN_TRUST_HOST_KEY,
    async (_event, id: string, fingerprint: string) => {
      if (typeof id !== 'string' || id.trim().length === 0) {
        throw new Error('Invalid connection id: expected a non-empty string');
      }
      if (typeof fingerprint !== 'string' || !SSH_FINGERPRINT_PATTERN.test(fingerprint.trim())) {
        throw new Error('Invalid host key fingerprint: expected a SHA256 fingerprint');
      }
      const trimmedFingerprint = fingerprint.trim();

      const profile = service.getById(id);
      if (!profile) {
        throw new Error(`Connection not found: ${id}`);
      }
      if (profile.type !== 'sftp' && profile.type !== 'rsync') {
        throw new Error(
          `SSH host key trust is not supported for connection type: ${profile.type}`,
        );
      }

      // The trust decision must happen in the main process: a renderer script
      // must not be able to silently pin an attacker's host key.
      const host = typeof profile.host === 'string' ? ` (${profile.host})` : '';
      const options: MessageBoxOptions = {
        type: 'warning',
        buttons: ['Trust', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: 'Trust SSH Host Key',
        message: `Trust SSH host key for ${profile.name}${host}?`,
        detail:
          `SHA256 fingerprint:\n${trimmedFingerprint}\n\n` +
          'Only trust this key if the fingerprint matches the value provided by the server administrator.',
        noLink: true,
      };
      const parentWindow = BrowserWindow.getFocusedWindow();
      const result = parentWindow
        ? await dialog.showMessageBox(parentWindow, options)
        : await dialog.showMessageBox(options);
      if (result.response !== 0) {
        return false;
      }

      service.trustHostKey(id, trimmedFingerprint);
      return true;
    },
  );
}
