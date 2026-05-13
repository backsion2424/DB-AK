import { electronBridge as electron } from '../renderer/bridge';

export const scrapeMetadata = (code: string) => electron.scrapeMetadata(code);
