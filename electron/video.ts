import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

const thumbCacheDir = path.join(app.getPath('userData'), 'thumbs');
if (!fs.existsSync(thumbCacheDir)) {
    fs.mkdirSync(thumbCacheDir, { recursive: true });
}

export async function generateThumbnail(videoPath: string, videoId: string): Promise<string> {
    const thumbPath = path.join(thumbCacheDir, `${videoId}.jpg`);
    
    if (fs.existsSync(thumbPath)) {
        return `file://${thumbPath}`;
    }

    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .screenshots({
                timestamps: ['10%'],
                filename: `${videoId}.jpg`,
                folder: thumbCacheDir,
                size: '320x?'
            })
            .on('end', () => resolve(`file://${thumbPath}`))
            .on('error', (err) => reject(err));
    });
}

export async function getVideoMetadata(videoPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) reject(err);
            else resolve(metadata);
        });
    });
}
