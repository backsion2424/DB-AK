import { app, BrowserWindow, shell, protocol, net, ipcMain } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { initDb } from './db';
import { registerIpc } from './ipc';
import { scrapeMetadata } from './gemini';
import { getSetting, setSetting, deleteSetting } from './settings';
import { openFolder, openFiles, openInExternalPlayer, revealInFolder } from './files';

const isDev = !app.isPackaged;
const VITE_DEV_URL = 'http://localhost:3000';

let mainWindow: BrowserWindow | null = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
  },
]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL(VITE_DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  protocol.handle('media', async (request) => {
    try {
      const url = new URL(request.url);
      let filePath = decodeURIComponent(url.pathname);
      if (/^\/[A-Za-z]:/.test(filePath)) filePath = filePath.slice(1);
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch (err) {
      return new Response('Not Found', { status: 404 });
    }
  });

  initDb();
  registerIpc();

  // settings IPC
  ipcMain.handle('settings:get', (_e, key: string) => getSetting(key));
  ipcMain.handle('settings:set', (_e, key: string, value: any) => setSetting(key, value));
  ipcMain.handle('settings:delete', (_e, key: string) => deleteSetting(key));

  // gemini IPC
  ipcMain.handle('gemini:scrape', (_e, code: string) => scrapeMetadata(code));

  // files IPC
  ipcMain.handle('files:openFolder', async () => openFolder(mainWindow));
  ipcMain.handle('files:openFiles', async () => openFiles(mainWindow));
  ipcMain.handle('files:openInExternalPlayer', (_e, absPath: string, customPlayer?: string) =>
    openInExternalPlayer(absPath, customPlayer),
  );
  ipcMain.handle('files:revealInFolder', (_e, absPath: string) => revealInFolder(absPath));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
