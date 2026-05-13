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
  try {
    return (await window.electron.gemini.scrape(code)) as ScrapedMetadata;
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (msg.includes('GEMINI_API_KEY_MISSING')) {
      throw new Error('Gemini API 키가 설정되지 않았습니다. [설정] → [AI 키] 탭에서 등록해 주세요.');
    }
    throw err;
  }
}
