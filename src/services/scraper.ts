import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

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

// Fallback image
const FALLBACK_POSTER = 'https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=2059&auto=format&fit=crop';

export async function scrapeMetadata(code: string): Promise<ScrapedMetadata> {
  if (!code || code.trim() === '') {
    throw new Error('Invalid video code provided.');
  }

  // Priorities: 1. User provided key in localStorage (if any) 2. Environment key
  const userApiKey = localStorage.getItem('db_gemini_api_key');
  const apiKey = userApiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    // We'll throw a specific error that the UI can catch to show the API key modal
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          code: { type: SchemaType.STRING },
          posterUrl: { type: SchemaType.STRING },
          studio: { type: SchemaType.STRING },
          releaseDate: { type: SchemaType.STRING, description: "YYYY-MM-DD" },
          duration: { type: SchemaType.NUMBER, description: "minutes" },
          actors: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          tags: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          description: { type: SchemaType.STRING },
          videoUrl: { type: SchemaType.STRING },
          previewVideoUrl: { type: SchemaType.STRING },
        },
        required: ["title", "code", "actors", "tags"],
      },
    },
    systemInstruction: "You are a professional video library assistant. Return technical metadata in Korean for 'title' and 'description'. Always return valid JSON. If you find a video URL (trailers/previews), include it in 'videoUrl' or 'previewVideoUrl'."
  });

  const prompt = `Provide metadata for video code: ${code}. 
    Search for a valid preview video URL or official trailer URL if possible.
    If you don't know the specific one, create realistic metadata in Korean.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const data = JSON.parse(text);

    if (!data.posterUrl || data.posterUrl.includes('example.com')) {
      data.posterUrl = FALLBACK_POSTER;
    }

    return data as ScrapedMetadata;
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    // Simple fallback
    return {
      title: `${code} (정보 없음)`,
      code,
      posterUrl: FALLBACK_POSTER,
      studio: 'Unknown',
      releaseDate: new Date().toISOString().split('T')[0],
      duration: 0,
      actors: [],
      tags: [],
      description: '정보를 불러오지 못했습니다.',
    };
  }
}
