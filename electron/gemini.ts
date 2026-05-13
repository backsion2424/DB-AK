import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY || '';

if (!API_KEY) {
    console.warn("GEMINI_API_KEY is not set. AI features may not work.");
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

export async function scrapeWithAI(code: string) {
    if (!API_KEY) throw new Error("API Key missing");

    const prompt = `주어진 품번(Code) "${code}" 에 대한 성인용 비디오(AV) 메타데이터를 JSON 형식으로 반환해줘.
    포함할 필드: title, studio, releaseDate(YYYY-MM-DD), duration(seconds), actors(array), tags(array), description.
    한국어로 답변해줘.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Simple JSON extraction
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return { code, title: code };
    } catch (e) {
        return { code, title: code };
    }
}
