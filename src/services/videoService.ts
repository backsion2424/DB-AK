import { Video } from '../types';

export async function listVideos(): Promise<Video[]> {
  return (await window.electron.videos.list()) as Video[];
}

export async function addVideo(video: Omit<Video, 'id' | 'createdAt' | 'userId'>) {
  return await window.electron.videos.add(video);
}

export async function deleteVideo(id: string) {
  return await window.electron.videos.delete(id);
}

export async function updateVideo(id: string, data: Partial<Video>) {
  return await window.electron.videos.update(id, data);
}
