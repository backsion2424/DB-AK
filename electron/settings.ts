import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

let settingsPath: string;
let cache: Record<string, any> = {};

function ensureLoaded() {
  if (!settingsPath) {
    settingsPath = path.join(app.getPath('userData'), 'settings.json');
    if (existsSync(settingsPath)) {
      try {
        cache = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      } catch {
        cache = {};
      }
    } else {
      mkdirSync(path.dirname(settingsPath), { recursive: true });
      cache = {};
    }
  }
}

export function getSetting<T = any>(key: string): T | undefined {
  ensureLoaded();
  return cache[key];
}

export function setSetting(key: string, value: any) {
  ensureLoaded();
  cache[key] = value;
  writeFileSync(settingsPath, JSON.stringify(cache, null, 2));
}

export function deleteSetting(key: string) {
  ensureLoaded();
  delete cache[key];
  writeFileSync(settingsPath, JSON.stringify(cache, null, 2));
}
