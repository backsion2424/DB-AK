import { z } from 'zod';

export const VideoSchema = z.object({
  id: z.string().optional(),
  code: z.string(),
  title: z.string(),
  posterUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  filePath: z.string().optional(),
  studio: z.string().optional(),
  releaseDate: z.string().optional(),
  duration: z.number().optional(),
  actors: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  description: z.string().optional(),
  rating: z.number().default(0),
  category: z.string().optional(),
  size: z.number().optional(),
  thumbnails: z.array(z.string()).optional(),
  memo: z.string().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export type Video = z.infer<typeof VideoSchema>;

export interface IElectronAPI {
  // Database
  getVideos: () => Promise<Video[]>;
  saveVideo: (video: Video) => Promise<string>;
  deleteVideo: (id: string) => Promise<void>;
  
  // Scraper
  scrapeMetadata: (code: string) => Promise<Partial<Video>>;
  
  // System
  selectDirectory: () => Promise<string | null>;
  scanDirectory: (path: string) => Promise<void>;
  openExternalPlayer: (path: string, playerPath?: string) => Promise<void>;
  
  // App
  getVersion: () => Promise<string>;
  onScanProgress: (callback: (progress: any) => void) => void;
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}
