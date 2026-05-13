import { ipcMain, BrowserWindow } from 'electron';
import { videoQueries, categoryQueries } from './db';

function broadcast(channel: string) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel);
  }
}

export function registerIpc() {
  // videos
  ipcMain.handle('videos:list', () => videoQueries.list());
  ipcMain.handle('videos:add', (_e, data) => {
    const result = videoQueries.add(data);
    broadcast('videos:changed');
    return result;
  });
  ipcMain.handle('videos:update', (_e, id: string, data) => {
    videoQueries.update(id, data);
    broadcast('videos:changed');
  });
  ipcMain.handle('videos:delete', (_e, id: string) => {
    videoQueries.delete(id);
    broadcast('videos:changed');
  });

  // categories
  ipcMain.handle('categories:list', () => categoryQueries.list());
  ipcMain.handle('categories:add', (_e, data) => {
    const result = categoryQueries.add(data);
    broadcast('categories:changed');
    return result;
  });
  ipcMain.handle('categories:update', (_e, id: string, data) => {
    categoryQueries.update(id, data);
    broadcast('categories:changed');
  });
  ipcMain.handle('categories:delete', (_e, id: string) => {
    categoryQueries.delete(id);
    broadcast('categories:changed');
  });
}
