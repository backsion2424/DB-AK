import { electronBridge as electron } from '../renderer/bridge';

export const addVideo = (v: any) => electron.saveVideo(v);
export const updateVideo = (id: any, v: any) => electron.saveVideo({ ...v, id });
export const deleteVideo = (id: any) => electron.deleteVideo(id);
export const getVideosByUserId = () => electron.getVideos();
