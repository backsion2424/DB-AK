import { dialog, shell, BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import { promises as fsp, statSync } from 'node:fs';
import path from 'node:path';

const VIDEO_EXTS = new Set([
  '.mp4', '.mkv', '.avi', '.wmv', '.mov', '.flv', '.webm', '.m4v', '.ts',
]);

export interface LocalFile {
  absPath: string;
  name: string;
  size: number;
}

export async function openFolder(window?: BrowserWindow | null): Promise<LocalFile[]> {
  const result = await dialog.showOpenDialog(window ?? BrowserWindow.getFocusedWindow()!, {
    title: '폴더 선택',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  const root = result.filePaths[0];
  return await listVideosRecursive(root);
}

export async function openFiles(window?: BrowserWindow | null): Promise<LocalFile[]> {
  const result = await dialog.showOpenDialog(window ?? BrowserWindow.getFocusedWindow()!, {
    title: '영상 파일 선택',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'avi', 'wmv', 'mov', 'flv', 'webm', 'm4v', 'ts'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  return result.filePaths.map((p) => {
    const s = statSync(p);
    return { absPath: p, name: path.basename(p), size: s.size };
  });
}

async function listVideosRecursive(dir: string): Promise<LocalFile[]> {
  const out: LocalFile[] = [];
  async function walk(d: string) {
    let entries;
    try {
      entries = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
      } else if (ent.isFile() && VIDEO_EXTS.has(path.extname(ent.name).toLowerCase())) {
        try {
          const s = await fsp.stat(full);
          out.push({ absPath: full, name: ent.name, size: s.size });
        } catch {
          // ignore
        }
      }
    }
  }
  await walk(dir);
  return out;
}

export async function openInExternalPlayer(absPath: string, customPlayer?: string): Promise<void> {
  if (customPlayer && customPlayer.trim()) {
    spawn(customPlayer, [absPath], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  await shell.openPath(absPath);
}

export function revealInFolder(absPath: string) {
  shell.showItemInFolder(absPath);
}
