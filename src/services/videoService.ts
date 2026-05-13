const STORAGE_KEY = 'db_archive_videos';

export async function listVideos(): Promise<Video[]> {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return [];
  return JSON.parse(data);
}

export async function addVideo(video: Omit<Video, 'id' | 'createdAt' | 'userId'>) {
  const videos = await listVideos();
  const newVideo = {
    ...video,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  videos.unshift(newVideo as any);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(videos));
  return { id: newVideo.id };
}

export async function deleteVideo(id: string) {
  const videos = await listVideos();
  const filtered = videos.filter(v => v.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return true;
}

export async function updateVideo(id: string, data: Partial<Video>) {
  const videos = await listVideos();
  const idx = videos.findIndex(v => v.id === id);
  if (idx === -1) return false;
  
  videos[idx] = { 
    ...videos[idx], 
    ...data, 
    updatedAt: new Date().toISOString() 
  } as any;
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(videos));
  return true;
}
