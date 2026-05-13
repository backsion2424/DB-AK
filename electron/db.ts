import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

let db: Database.Database;

export function initDb() {
  const dbPath = path.join(app.getPath('userData'), 'db-archive.sqlite');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      code TEXT,
      posterUrl TEXT,
      studio TEXT,
      releaseDate TEXT,
      duration INTEGER,
      actors TEXT,
      tags TEXT,
      description TEXT,
      memo TEXT,
      thumbnails TEXT,
      rating REAL,
      videoUrl TEXT,
      filePath TEXT,
      size INTEGER,
      category TEXT,
      createdAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_videos_createdAt ON videos(createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_videos_code ON videos(code);
    CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category);

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0
    );
  `);
}

const JSON_FIELDS = new Set(['actors', 'tags', 'thumbnails']);

function rowToVideo(row: any) {
  if (!row) return null;
  return {
    ...row,
    actors: row.actors ? JSON.parse(row.actors) : [],
    tags: row.tags ? JSON.parse(row.tags) : [],
    thumbnails: row.thumbnails ? JSON.parse(row.thumbnails) : undefined,
  };
}

const VIDEO_INSERT_FIELDS = [
  'title', 'code', 'posterUrl', 'studio', 'releaseDate', 'duration',
  'actors', 'tags', 'description', 'memo', 'thumbnails', 'rating',
  'videoUrl', 'filePath', 'size', 'category',
] as const;

export const videoQueries = {
  list() {
    const rows = db.prepare('SELECT * FROM videos ORDER BY createdAt DESC').all();
    return rows.map(rowToVideo);
  },

  add(data: any) {
    const id = randomUUID();
    const createdAt = Date.now();
    const params: any = { id, createdAt };
    for (const f of VIDEO_INSERT_FIELDS) {
      const v = data[f];
      params[f] = JSON_FIELDS.has(f)
        ? (v == null ? null : JSON.stringify(v))
        : (v ?? null);
    }
    db.prepare(`
      INSERT INTO videos (id, ${VIDEO_INSERT_FIELDS.join(', ')}, createdAt)
      VALUES (@id, ${VIDEO_INSERT_FIELDS.map(f => '@' + f).join(', ')}, @createdAt)
    `).run(params);
    return { id };
  },

  update(id: string, data: any) {
    const fields: string[] = [];
    const params: any = { id };
    for (const [key, val] of Object.entries(data)) {
      if (key === 'id' || key === 'createdAt' || key === 'userId') continue;
      const dbVal = JSON_FIELDS.has(key)
        ? (val == null ? null : JSON.stringify(val))
        : val;
      fields.push(`${key} = @${key}`);
      params[key] = dbVal;
    }
    if (fields.length === 0) return;
    db.prepare(`UPDATE videos SET ${fields.join(', ')} WHERE id = @id`).run(params);
  },

  delete(id: string) {
    db.prepare('DELETE FROM videos WHERE id = ?').run(id);
  },
};

export const categoryQueries = {
  list() {
    return db.prepare('SELECT * FROM categories ORDER BY "order" ASC, name ASC').all();
  },

  add(data: any) {
    const id = randomUUID();
    db.prepare('INSERT INTO categories (id, name, "order") VALUES (?, ?, ?)')
      .run(id, data.name, data.order ?? 0);
    return { id };
  },

  update(id: string, data: any) {
    const fields: string[] = [];
    const params: any = { id };
    for (const [key, val] of Object.entries(data)) {
      if (key === 'id' || key === 'userId') continue;
      const colName = key === 'order' ? '"order"' : key;
      fields.push(`${colName} = @${key}`);
      params[key] = val;
    }
    if (fields.length === 0) return;
    db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = @id`).run(params);
  },

  delete(id: string) {
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  },
};
