// This bridge allows the app to run in both web-preview (standard browser) 
// and in the real Electron shell.

import { Video } from '../types';

export const isElectron = !!(window as any).electron;

const mockVideos: Video[] = [];

export const electronBridge = isElectron ? (window as any).electron : {
  getVideos: async () => {
    const saved = localStorage.getItem('sg_mock_videos');
    return saved ? JSON.parse(saved) : mockVideos;
  },
  saveVideo: async (video: Video) => {
    const saved = localStorage.getItem('sg_mock_videos');
    let vids = saved ? JSON.parse(saved) : [...mockVideos];
    const index = vids.findIndex((v: any) => v.id === video.id);
    if (index >= 0) {
      vids[index] = { ...video, updatedAt: new Date().toISOString() };
    } else {
      const newVideo = { ...video, id: video.id || Date.now().toString(), createdAt: new Date().toISOString() };
      vids.push(newVideo);
      video.id = newVideo.id;
    }
    localStorage.setItem('sg_mock_videos', JSON.stringify(vids));
    return video.id;
  },
  deleteVideo: async (id: string) => {
    const saved = localStorage.getItem('sg_mock_videos');
    if (saved) {
      const vids = JSON.parse(saved).filter((v: any) => v.id !== id);
      localStorage.setItem('sg_mock_videos', JSON.stringify(vids));
    }
  },
  scrapeMetadata: async (code: string) => {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (apiKey && apiKey.trim()) {
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const prompt = `Extract video metadata for the code: ${code}. 
              Return ONLY a JSON object with the following fields: 
              title (string, translated to Korean if possible), 
              code (string, the input code), 
              posterUrl (string, a valid related image URL or empty), 
              studio (string), 
              releaseDate (string, YYYY-MM-DD), 
              duration (number, in minutes), 
              actors (string array), 
              tags (string array), 
              description (string, detailed summary in Korean).`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        if (text) {
          let jsonText = text;
          // Extract JSON if it's wrapped in markdown code blocks
          const jsonMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/) || jsonText.match(/```\s*([\s\S]*?)\s*```/) || jsonText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonText = jsonMatch[1] || jsonMatch[0];
          }
          
          try {
            const data = JSON.parse(jsonText);
            return {
              ...data,
              rating: 0,
              id: Date.now().toString()
            };
          } catch (e) {
            console.error("JSON Parse Error in Gemini Scrape:", e, "Raw text:", text);
            throw new Error("AI 응답 형식이 올바르지 않습니다.");
          }
        }
      } catch (err) {
        console.error("Gemini Scrape Error:", err);
        throw err; // Re-throw to show to user
      }
    }
    return { code, title: `AI Data for ${code} (Mock)`, actors: ['Mock Actor'], tags: ['Mock Tag'], rating: 4 };
  },
  generateThumbnail: async () => 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=300&h=200&fit=crop',
  getVideoInfo: async () => ({ format: { duration: 120, size: 1024 * 1024 * 500 } }),
  selectDirectory: async () => null,
  scanDirectory: async () => {},
  openExternalPlayer: async () => {},
  getVersion: async () => '1.0.0-web-preview',
  onScanProgress: () => {}
};
