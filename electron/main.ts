import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import isDev from 'electron-is-dev';
import { initializeDB, videoRepo } from './db';
import { scrapeWithAI } from './gemini';
import fs from 'fs';
import log from 'electron-log';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        backgroundColor: '#000000',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    const startURL = isDev
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '../dist/index.html')}`;

    mainWindow.loadURL(startURL);

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Development tools
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }
    
    // Performance: WebContents cache and background throttling
    mainWindow.webContents.setBackgroundThrottling(false);
}

import { generateThumbnail, getVideoMetadata } from './video';

ipcMain.handle('generate-thumbnail', async (_, videoPath, videoId) => {
    return generateThumbnail(videoPath, videoId);
});

ipcMain.handle('get-video-info', async (_, videoPath) => {
    return getVideoMetadata(videoPath);
});

app.on('ready', () => {
    initializeDB();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// IPC Implementation
ipcMain.handle('get-videos', async () => {
    return videoRepo.getAll();
});

ipcMain.handle('save-video', async (_, video) => {
    return videoRepo.save(video);
});

ipcMain.handle('delete-video', async (_, id) => {
    return videoRepo.delete(id);
});

ipcMain.handle('scrape-metadata', async (_, code) => {
    return scrapeWithAI(code);
});

ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('open-external-player', async (_, videoPath, playerPath) => {
    if (playerPath) {
        // Execute path directly if custom player is set
        // Note: For security, we should validate the playerPath
        shell.openExternal(`file://${videoPath}`); // Placeholder for direct execution
    } else {
        shell.openPath(videoPath);
    }
});

ipcMain.handle('get-version', () => {
    return app.getVersion();
});

// Global Error Handling
process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
    log.error('Unhandled Rejection:', reason);
});
