import { GoogleGenAI, Type } from '@google/genai';
import { getSetting } from './settings';

export interface ScrapedMetadata {
  title: string;
  code: string;
  posterUrl: string;
  studio: string;
  releaseDate: string;
  duration: number;
  actors: string[];
  tags: string[];
  description: string;
  videoUrl?: string;
  previewVideoUrl?: string;
}

export async function scrapeMetadata(code: string): Promise<ScrapedMetadata> {
  if (!code || code.trim() === '') {
    throw new Error('Invalid video code provided.');
  }
  const apiKey = getSetting<string>('geminiApiKey');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Provide metadata for video code: ${code}.
    Search for a valid preview video URL or official trailer URL if possible.
    If you don't know the specific one, create realistic placeholder metadata in Korean.
    The response MUST be a valid JSON object matching the requested schema.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        systemInstruction:
          "You are a professional video library assistant. Return technical metadata in Korean for 'title' and 'description'. Always return valid JSON. If you find a video URL (trailers/previews), include it in 'videoUrl' or 'previewVideoUrl'.",
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            code: { type: Type.STRING },
            posterUrl: { type: Type.STRING },
            studio: { type: Type.STRING },
            releaseDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
            duration: { type: Type.NUMBER, description: 'minutes' },
            actors: { type: Type.ARRAY, items: { type: Type.STRING } },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            description: { type: Type.STRING },
            videoUrl: { type: Type.STRING },
            previewVideoUrl: { type: Type.STRING },
          },
          required: ['title', 'code', 'actors', 'tags'],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error('Empty response from Gemini');

    const data = JSON.parse(text);
    if (!data.posterUrl || data.posterUrl.includes('example.com')) {
      data.posterUrl =
        'https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=2059&auto=format&fit=crop';
    }
    return data as ScrapedMetadata;
  } catch (error: any) {
    if (error?.message === 'GEMINI_API_KEY_MISSING') throw error;
    console.error('Gemini API Error:', error instanceof Error ? error.message : error);
    return {
      title: `${code} (정보 없음)`,
      code,
      posterUrl:
        'https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=2059&auto=format&fit=crop',
      studio: 'Unknown',
      releaseDate: new Date().toISOString().split('T')[0],
      duration: 0,
      actors: [],
      tags: [],
      description: '',
    };
  }
}
