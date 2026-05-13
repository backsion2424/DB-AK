import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Mock electron if not running in Electron
if (!window.electron) {
  (window as any).electron = {
    videos: {
      list: async () => [],
      add: async () => 'mock-id',
      delete: async () => true,
      update: async () => true,
      onChanged: () => () => {}
    },
    categories: {
      list: async () => [],
      add: async () => 'mock-id',
      delete: async () => true,
      update: async () => true,
      onChanged: () => () => {}
    },
    files: {
      openFiles: async () => [],
      openFolder: async () => [],
      toMediaUrl: (path: string) => path
    },
    settings: {
      get: async () => null,
      set: async () => {},
      delete: async () => {}
    },
    gemini: {
      scrape: async () => ({})
    }
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
