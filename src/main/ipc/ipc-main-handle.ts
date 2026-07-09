import type { IpcMain } from 'electron';

export type IpcMainHandle = Pick<IpcMain, 'handle'>;
