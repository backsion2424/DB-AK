import { contextBridge, ipcRenderer } from 'electron';

function makeChangeListener(channel: string) {
  return (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.off(channel, handler);
  };
}

function toMediaUrl(absPath: string): string {
  const norm = absPath.replace(/\\/g, '/');
  return 'media:///' + norm.split('/').map(encodeURIComponent).join('/');
}

const api = {
  isElectron: true,
  platform: process.platform,

  videos: {
    list: () => ipcRenderer.invoke('videos:list'),
    add: (data: any) => ipcRenderer.invoke('videos:add', data),
    update: (id: string, data: any) => ipcRenderer.invoke('videos:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('videos:delete', id),
    onChanged: makeChangeListener('videos:changed'),
  },

  categories: {
    list: () => ipcRenderer.invoke('categories:list'),
    add: (data: any) => ipcRenderer.invoke('categories:add', data),
    update: (id: string, data: any) => ipcRenderer.invoke('categories:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('categories:delete', id),
    onChanged: makeChangeListener('categories:changed'),
  },

  settings: {
    get: <T = any>(key: string): Promise<T | undefined> => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('settings:delete', key),
  },

  gemini: {
    scrape: (code: string) => ipcRenderer.invoke('gemini:scrape', code),
  },

  files: {
    openFolder: (): Promise<{ absPath: string; name: string; size: number }[]> =>
      ipcRenderer.invoke('files:openFolder'),
    openFiles: (): Promise<{ absPath: string; name: string; size: number }[]> =>
      ipcRenderer.invoke('files:openFiles'),
    openInExternalPlayer: (absPath: string, customPlayer?: string) =>
      ipcRenderer.invoke('files:openInExternalPlayer', absPath, customPlayer),
    revealInFolder: (absPath: string) => ipcRenderer.invoke('files:revealInFolder', absPath),
    toMediaUrl,
  },
};

contextBridge.exposeInMainWorld('electron', api);

export type ElectronAPI = typeof api;

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
