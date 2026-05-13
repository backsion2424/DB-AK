import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import { Video } from '../src/types';
import fs from 'fs';

const isDev = !app.isPackaged;
const dbDir = isDev ? app.getAppPath() : app.getPath('userData');
const dbPath = path.join(dbDir, 'library.db');

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Migrations
export function initializeDB() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS videos (
            id TEXT PRIMARY KEY,
            code TEXT,
            title TEXT,
            posterUrl TEXT,
            videoUrl TEXT,
            filePath TEXT,
            studio TEXT,
            releaseDate TEXT,
            duration INTEGER,
            actors TEXT, -- JSON string
            tags TEXT,   -- JSON string
            description TEXT,
            rating INTEGER DEFAULT 0,
            category TEXT,
            size INTEGER,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_videos_code ON videos(code);
        CREATE INDEX IF NOT EXISTS idx_videos_title ON videos(title);
        CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category);
    `);
}

export const videoRepo = {
    getAll: (): Video[] => {
        const rows = db.prepare('SELECT * FROM videos ORDER BY createdAt DESC').all();
        return rows.map((row: any) => ({
            ...row,
            actors: JSON.parse(row.actors || '[]'),
            tags: JSON.parse(row.tags || '[]')
        })) as Video[];
    },

    save: (video: Video): string => {
        const id = video.id || `vid_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const upsert = db.prepare(`
            INSERT INTO videos (
                id, code, title, posterUrl, videoUrl, filePath, studio, 
                releaseDate, duration, actors, tags, description, 
                rating, category, size, updatedAt
            ) VALUES (
                @id, @code, @title, @posterUrl, @videoUrl, @filePath, @studio,
                @releaseDate, @duration, @actors, @tags, @description,
                @rating, @category, @size, CURRENT_TIMESTAMP
            )
            ON CONFLICT(id) DO UPDATE SET
                code=excluded.code,
                title=excluded.title,
                posterUrl=excluded.posterUrl,
                videoUrl=excluded.videoUrl,
                filePath=excluded.filePath,
                studio=excluded.studio,
                releaseDate=excluded.releaseDate,
                duration=excluded.duration,
                actors=excluded.actors,
                tags=excluded.tags,
                description=excluded.description,
                rating=excluded.rating,
                category=excluded.category,
                size=excluded.size,
                updatedAt=CURRENT_TIMESTAMP
        `);

        upsert.run({
            ...video,
            id,
            actors: JSON.stringify(video.actors || []),
            tags: JSON.stringify(video.tags || [])
        });

        return id;
    },

    delete: (id: string) => {
        db.prepare('DELETE FROM videos WHERE id = ?').run(id);
    },

    integrityCheck: () => {
        return db.prepare('PRAGMA integrity_check').get();
    }
};
