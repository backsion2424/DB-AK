export interface Video {
  id: string;
  title: string;
  code: string;
  posterUrl: string;
  studio?: string;
  releaseDate?: string;
  duration?: number;
  actors: string[];
  tags: string[];
  description?: string;
  memo?: string;
  thumbnails?: string[]; // Array of 3 thumbnail URLs
  rating?: number;
  videoUrl?: string; // Web link
  filePath?: string; // Mocked local path
  size?: number; // File size in bytes
  category?: string; // Group ID or Name
  createdAt: any;
  userId: string;
}

export interface Category {
  id: string;
  name: string;
  order?: number;
  userId: string;
}

export interface LocalFile {
  absPath: string;
  name: string;
  size: number;
}

export interface Actor {
  id: string;
  name: string;
  photoUrl?: string;
  bio?: string;
  userId: string;
}
