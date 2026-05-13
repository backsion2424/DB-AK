import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  getVideos: () => ipcRenderer.invoke('get-videos'),
  saveVideo: (video: any) => ipcRenderer.invoke('save-video', video),
  deleteVideo: (id: string) => ipcRenderer.invoke('delete-video', id),
  scrapeMetadata: (code: string) => ipcRenderer.invoke('scrape-metadata', code),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  scanDirectory: (path: string) => ipcRenderer.invoke('scan-directory', path),
  openExternalPlayer: (path: string, playerPath?: string) => 
    ipcRenderer.invoke('open-external-player', path, playerPath),
  getVersion: () => ipcRenderer.invoke('get-version'),
  generateThumbnail: (path: string, id: string) => ipcRenderer.invoke('generate-thumbnail', path, id),
  getVideoInfo: (path: string) => ipcRenderer.invoke('get-video-info', path),
  onScanProgress: (callback: any) => 
    ipcRenderer.on('scan-progress', (_, progress) => callback(progress))
});
