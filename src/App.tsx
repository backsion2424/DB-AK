import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Search, Plus, Filter, Users, Tag, LayoutGrid, LogOut, Loader2, Sparkles, FolderSync, Info, Calendar, Clock, Play, Pause, SkipBack, SkipForward, ExternalLink, Menu, FolderOpen, Search as SearchIcon, Wrench, Settings, ChevronRight, Lock, Key, Database, RefreshCcw, HardDrive, FileVideo, List, X, Trash2, AlertTriangle, Monitor
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { FixedSizeList as FixedList } from 'react-window';
import { VideoItem, VideoListItem, Modal, MenuBarItem, SidebarSection, TitleBar, SettingsModal, VideoPlayer, ContextMenu, StarRating } from './components/UI';
import { VirtualVideoGrid } from './components/VideoGrid';
import { Video } from './types';
import { getVideosByUserId, addVideo, deleteVideo, updateVideo } from './services/videoService';
import { getCategoriesByUserId, addCategory, deleteCategory, updateCategory } from './services/categoryService';
import { scrapeMetadata } from './services/scraper';
import { electronBridge as electron, isElectron } from './renderer/bridge';

import { safeStringify } from './lib/utils';

export default function App() {
  const [user, setUser] = useState<{ uid: string } | null>(null);
  const [showApiKeyWarning, setShowApiKeyWarning] = useState(false);
  const [offlineMode, setOfflineMode] = useState(() => localStorage.getItem('sg_offline_mode') === 'true');
  const [pendingAction, setPendingAction] = useState<{ type: 'file' | 'scrape', data: any } | null>(null);

  const checkApiKey = useCallback(() => {
    const key = localStorage.getItem('gemini_api_key');
    if (!key || !key.trim()) {
      if (localStorage.getItem('sg_offline_mode') === 'true') return true;
      setShowApiKeyWarning(true);
      return false;
    }
    return true;
  }, []);

  const [loading, setLoading] = useState(true);
  const [videos, setVideos] = useState<Video[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  
  useEffect(() => {
    const init = async () => {
      try {
        const vids = await getVideosByUserId();
        setVideos(vids);
        
        const cats = await getCategoriesByUserId();
        if (cats && cats.length > 0) {
          setCategories(cats);
        } else {
          setCategories([{ id: 'all', name: 'All Videos', order: 0 }]);
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Initial load failed:', err);
        setLoading(false);
      }
    };
    init();

    // Guest user for compatibility
    let guestId = localStorage.getItem('sg_manager_guest_id');
    if (!guestId) {
      guestId = 'guest_sg_' + Math.random().toString(36).substring(2, 11);
      localStorage.setItem('sg_manager_guest_id', guestId);
    }
    setUser({ uid: guestId } as any);
  }, []);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedActor, setSelectedActor] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const handleVideoSelect = useCallback((v: Video) => {
    setSelectedVideo(v);
    setEditingVideo({ ...v });
  }, []);

  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [duplicateGroups, setDuplicateGroups] = useState<Video[][]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [isScrapeOpen, setIsScrapeOpen] = useState(false);
  const [scrapeCode, setScrapeCode] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const abortScrapingRef = React.useRef(false);

  const handleCancelScraping = () => {
    abortScrapingRef.current = true;
    setIsScraping(false);
  };
  const [playingVideo, setPlayingVideo] = useState<Video | null>(null);
  const [deleteConfirmVideo, setDeleteConfirmVideo] = useState<Video | null>(null);
  const [deleteOption, setDeleteOption] = useState<'all' | 'metadata'>('metadata');
  const [localFileCache, setLocalFileCache] = useState<Map<string, File>>(new Map());
  const [cacheVersion, setCacheVersion] = useState(0);
  const refreshCache = useCallback(() => setCacheVersion(v => v + 1), []);

  const extractCode = useCallback((filename: string) => {
    if (!filename) return 'UNKNOWN';
    // Remove extension and [Tags] first
    const cleanName = filename.replace(/\.(mp4|mkv|avi|wmv|mov|flv|webm)$/i, '')
                              .replace(/\[.*?\]/g, '')
                              .trim()
                              .toUpperCase();
      
    // Try to find standard patterns: ABCD-123, ABC-DEF-123, FC2-PPV-123
    // Allow letters, numbers and hyphens/underscores
    const match = cleanName.match(/[A-Z0-9]{2,10}(?:[-_][A-Z0-9]+){1,3}/) || 
                  cleanName.match(/[A-Z]{2,10}[0-9]{3,}/) ||
                  cleanName.match(/[0-9]{6,10}[-_][0-9]{1,}/) ||
                  cleanName.match(/[A-Z][0-9]{5}/) ||
                  cleanName.match(/PPV-[A-Z0-9-]+/i) ||
                  cleanName.match(/S-ON[A-Z0-9-]+/i);

    if (match) {
      return match[0];
    }
    return cleanName;
  }, []);

  const handleVideoLoadError = useCallback((id: string) => {
    setMissingVideoIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const getCachedFile = useCallback((video: Video) => {
    if (video.id && localFileCache.has(video.id)) {
      return localFileCache.get(video.id);
    }
    
    // Fallback: search by code or title
    const videoCode = (video.code || '').trim().toUpperCase();
    const videoCodeBase = videoCode.replace(/[^A-Z0-9]/g, '');
    const videoTitle = (video.title || '').trim().toUpperCase();

    const found = Array.from(localFileCache.values()).find((f: File) => {
      const fileName = f.name.toUpperCase();
      const fileCode = extractCode(f.name);
      
      // 1. Try code match
      if (videoCode && videoCode !== 'MANUAL') {
        if (fileCode === videoCode) return true;
        
        const fileCodeBase = fileCode.replace(/[^A-Z0-9]/g, '');
        if (videoCodeBase && fileCodeBase === videoCodeBase) return true;
      }
      
      // 2. Try title match (filename without extension should match title exactly or be included)
      if (videoTitle) {
        const cleanFileName = fileName.replace(/\.[^/.]+$/, "");
        if (cleanFileName === videoTitle) return true;
        if (fileName.includes(videoTitle)) return true;
      }
      
      return false;
    });

    if (found) return found;
    return undefined;
  }, [localFileCache, extractCode]);

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, video: Video } | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedVideoIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const [detailTab, setDetailTab] = useState<'info' | 'actors' | 'tags'>('info');
  const [sortBy, setSortBy] = useState<'name' | 'rating' | 'recent'>('recent');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [gridCols, setGridCols] = useState(() => parseInt(localStorage.getItem('db_grid_cols') || '10'));

  // Base Settings Values
  const [settingsValues, setSettingsValues] = useState({
    fontSize: localStorage.getItem('db_font_size') || '11',
    fontFamily: localStorage.getItem('db_font_family') || 'Inter',
    aspectRatio: localStorage.getItem('db_aspect_ratio') || '16/9 [FHD]'
  });

  const [showActorManage, setShowActorManage] = useState(false);
  const [showTagManage, setShowTagManage] = useState(false);
  const [showCategoryManage, setShowCategoryManage] = useState(false);
  
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  
  const [extraActors, setExtraActors] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('db_extra_actors');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem('db_extra_actors', JSON.stringify(extraActors));
  }, [extraActors]);

  const [extraTags, setExtraTags] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('db_extra_tags');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem('db_extra_tags', JSON.stringify(extraTags));
  }, [extraTags]);

  const [actorSearch, setActorSearch] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [actorSearchEdit, setActorSearchEdit] = useState('');
  const [tagSearchEdit, setTagSearchEdit] = useState('');
  const [inlineEditingActor, setInlineEditingActor] = useState<{ originalName: string, currentName: string } | null>(null);
  const [inlineEditingTag, setInlineEditingTag] = useState<{ originalName: string, currentName: string } | null>(null);
  const [selectedManageActors, setSelectedManageActors] = useState<Set<string>>(new Set());
  const [selectedManageTags, setSelectedManageTags] = useState<Set<string>>(new Set());
  
  const [settingsActiveTab, setSettingsActiveTab] = useState('sync');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [isAdultAuthValid, setIsAdultAuthValid] = useState(() => {
    const lastAuth = localStorage.getItem('sg_adult_auth_date');
    const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
    return !!(lastAuth && (Date.now() - parseInt(lastAuth) < SIX_MONTHS_MS));
  });
  const [isPasswordUnlocked, setIsPasswordUnlocked] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginPasswordInput, setLoginPasswordInput] = useState('');

  // ... Settings and Refs ...
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dbInputRef = useRef<HTMLInputElement>(null);

  const authState = React.useMemo(() => {
    const lastAuth = localStorage.getItem('sg_adult_auth_date');
    const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
    const isAdultValid = lastAuth && (Date.now() - parseInt(lastAuth) < SIX_MONTHS_MS);
    const usePassword = localStorage.getItem('sg_use_password') === 'true';
    return { isAdultValid, usePassword };
  }, [isAdultAuthValid]); // We only re-calculate when isAdultAuthValid state is manually updated after login

  useEffect(() => {
    const usePassword = localStorage.getItem('sg_use_password') === 'true';
    if (!usePassword) setIsPasswordUnlocked(true);
  }, []);

  useEffect(() => {
    document.body.style.fontFamily = settingsValues.fontFamily;
    // Just base font size for the whole app
    document.documentElement.style.fontSize = settingsValues.fontSize + 'px';
  }, [settingsValues]);

  const handleOfflineMode = () => {
    localStorage.setItem('sg_offline_mode', 'true');
    setOfflineMode(true);
    setShowApiKeyWarning(false);
    if (pendingAction) {
      if (pendingAction.type === 'file') processFiles(pendingAction.data);
      else handleScrape(); 
      setPendingAction(null);
    }
  };

  const handleGoToApiSettings = () => {
    setShowApiKeyWarning(false);
    setSettingsActiveTab('version');
    setShowSettingsModal(true);
  };

  const authenticated = React.useMemo(() => {
    return isAdultAuthValid && (isPasswordUnlocked);
  }, [isAdultAuthValid, isPasswordUnlocked]);

  const handleAdultAuthSubmit = () => {
    if (passwordInput === 'smpeople') {
      const now = Date.now().toString();
      localStorage.setItem('sg_adult_auth_date', now);
      setIsAdultAuthValid(true);
      setShowAuthModal(false);
      setPasswordInput('');
    } else {
      alert('비밀번호가 틀렸습니다.');
    }
  };

  const handleLoginPasswordSubmit = () => {
    const storedPassword = localStorage.getItem('sg_app_password');
    if (loginPasswordInput === storedPassword) {
      setIsPasswordUnlocked(true);
      setShowPasswordModal(false);
      setLoginPasswordInput('');
    } else {
      alert('비밀번호가 일치하지 않습니다.');
    }
  };

  const processFiles = async (files: FileList | null) => {
    if (!files || !user) return;
    
    if (!authenticated) {
      alert('접근 권한이 없습니다.');
      setShowAuthModal(true);
      return;
    }

    if (!checkApiKey()) {
      setPendingAction({ type: 'file', data: files });
      return;
    }

    setIsScraping(true);
    abortScrapingRef.current = false;
    let addedCount = 0;
    let failCount = 0;
    let skipCount = 0;
    let errorMsg = '';

    console.log(`Starting to process ${files.length} files...`);

    try {
      const newCache = new Map(localFileCache);
      let updated = false;

      for (const file of Array.from(files)) {
        if (abortScrapingRef.current) {
          console.log('Processing aborted by user');
          break;
        }
        try {
          const code = extractCode(file.name);
          const codeBase = code.replace(/[^A-Z0-9]/g, '');
          
          console.log(`Processing file: ${file.name}, Extracted code: ${code}`);

          // Sync with existing if possible
          const existing = videos.find(v => {
            if (v.code === 'MANUAL') return false;
            const vCode = (v.code || '').toUpperCase();
            const vCodeBase = vCode.replace(/[^A-Z0-9]/g, '');
            return vCode === code || (codeBase && vCodeBase === codeBase);
          });
          if (existing) {
            console.log(`Found existing video for code ${code}: ${existing.id}`);
            newCache.set(existing.id, file);
            updated = true;
            if (!existing.size) {
              await updateVideo(existing.id, { size: file.size });
            }
            skipCount++;
            continue;
          }

          const fileNameNoExt = file.name.split('.').slice(0, -1).join('.') || file.name;
          let videoData: Partial<Video>;
          
          // Skip scraping if in offline mode
          if (code && !offlineMode) {
            console.log(`Attempting to scrape metadata for ${code}...`);
            try {
              const metadata = await electron.scrapeMetadata(code);
              videoData = { ...metadata, title: fileNameNoExt, rating: 0, size: file.size };
              console.log(`Metadata scraped successfully for ${code}`);
            } catch (scrapeErr) {
              console.warn(`Scraping failed for ${code}, falling back to manual:`, scrapeErr);
              videoData = {
                title: fileNameNoExt,
                code: code,
                posterUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=2059&auto=format&fit=crop',
                studio: 'Unknown',
                releaseDate: new Date().toISOString().split('T')[0],
                duration: 0,
                actors: [],
                tags: ['Auto-Detected'],
                description: '정보를 자동으로 불러오지 못했습니다.',
                rating: 0,
                category: selectedCategory || '',
                size: file.size,
              };
            }
          } else {
            console.log(`Adding ${file.name} in offline/manual mode`);
            videoData = {
              title: fileNameNoExt,
              code: code || 'MANUAL',
              posterUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=2059&auto=format&fit=crop',
              studio: 'Local File',
              releaseDate: new Date().toISOString().split('T')[0],
              duration: 0,
              actors: [],
              tags: offlineMode ? ['Offline'] : ['Manual'],
              description: offlineMode 
                ? '오프라인 모드에서 추가된 동영상입니다.'
                : '파일 이름에서 코드를 찾을 수 없어 직접 추가된 항목입니다.',
              rating: 0,
              category: selectedCategory || '',
              size: file.size,
            };
          }

          if (selectedCategory) videoData.category = selectedCategory;

          const newId = await electron.saveVideo(videoData as Video);
          if (newId) {
            console.log(`Video saved with ID: ${newId}`);
            newCache.set(newId, file);
            updated = true;
            addedCount++;
          } else {
            console.error(`saveVideo returned null for ${file.name}`);
            failCount++;
          }
        } catch (err) {
          failCount++;
          errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`Error processing file ${file.name}:`, errorMsg);
        }
      }
      
      if (updated) {
        setLocalFileCache(newCache);
        setCacheVersion(v => v + 1);
        
        // Refresh list
        const vids = await electron.getVideos();
        setVideos(vids);
      }

      if (failCount > 0) {
        alert(`${addedCount}개 추가됨, ${skipCount}개 기존 항목 매칭, ${failCount}개 실패.\n마지막 오류: ${errorMsg}`);
      } else if (addedCount > 0 || skipCount > 0) {
        console.log(`Processing completed: ${addedCount} added, ${skipCount} skipped`);
      }

    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      alert(`파일 처리 도중 전체 오류가 발생했습니다: ${errorMsg}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';
      setIsScraping(false);
    }
  };

  const handleScrape = async () => {
    if (!authenticated) {
      setShowAuthModal(true);
      return;
    }
    if (!scrapeCode) return;

    if (!checkApiKey()) {
      setPendingAction({ type: 'scrape', data: scrapeCode });
      return;
    }

    setIsScraping(true);
    abortScrapingRef.current = false;
    try {
      if (offlineMode) {
        await electron.saveVideo({
          id: Date.now().toString(),
          title: scrapeCode,
          code: scrapeCode,
          posterUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=2059&auto=format&fit=crop',
          studio: 'Offline Entry',
          releaseDate: new Date().toISOString().split('T')[0],
          duration: 0,
          actors: [],
          tags: ['Offline'],
          description: '오프라인 모드에서 추가된 항목입니다.',
          rating: 0,
          category: selectedCategory || '',
        } as Video);
      } else {
        const metadata = await electron.scrapeMetadata(scrapeCode);
        await electron.saveVideo({
          ...metadata,
          rating: 0,
          category: selectedCategory || '',
        } as Video);
      }
      
      setIsScrapeOpen(false);
      setScrapeCode('');
      
      // Refresh list
      const vids = await electron.getVideos();
      setVideos(vids);
      alert('동영상이 성공적으로 추가되었습니다.');
    } catch (error) {
      console.error(error);
      alert(`데이터를 가져오지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsScraping(false);
    }
  };

  const [isDeleting, setIsDeleting] = useState(false);

  const handlePlayVideo = (video: Video) => {
    const customPlayerPath = localStorage.getItem('sg_player_path');
    const nativeProtocol = localStorage.getItem('sg_native_protocol');
    
    // Only attempt external player if a protocol is explicitly set and not empty
    if (nativeProtocol && nativeProtocol.trim().length > 0) {
      const videoPath = video.filePath || video.videoUrl || (video as any).previewVideoUrl;
      
      if (videoPath) {
        // Use custom protocol
        const protocol = nativeProtocol.endsWith('://') ? nativeProtocol : `${nativeProtocol}://`;
        const externalUrl = `${protocol}${videoPath}`;
        
        try {
          // If we have a custom player path, we might want to log it or use it, 
          // but browser can only launch via protocol.
          window.location.href = externalUrl;
          return;
        } catch (e) {
          console.error("External player protocol launch failed:", e);
        }
      }
    }
    
    setPlayingVideo(video);
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    const video = videos.find(v => v.id === id);
    if (video) {
        setDeleteConfirmVideo(video);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirmVideo || !user || isDeleting) return;
    
    // Check if we should delete multiple
    // If the video being deleted is part of a selection, delete all in selection
    // Otherwise just delete this one video
    const targetIds = (deleteConfirmVideo.id && selectedVideoIds.has(deleteConfirmVideo.id)) 
      ? Array.from(selectedVideoIds) 
      : (deleteConfirmVideo.id ? [deleteConfirmVideo.id] : []);

    if (targetIds.length === 0) {
      setDeleteConfirmVideo(null);
      return;
    }

    setIsDeleting(true);
    try {
      // Prepare metadata migration to ensure actors/tags don't disappear if they were only in these videos
      const deletedVideos = targetIds.map(id => videos.find(v => v.id === id)).filter(Boolean) as Video[];
      const remainingVideos = videos.filter(v => v.id && !targetIds.includes(v.id));
      
      const orphanedActors = new Set<string>();
      const orphanedTags = new Set<string>();
      
      deletedVideos.forEach(v => {
        (v.actors || []).forEach(a => {
          if (!remainingVideos.some(rv => (rv.actors || []).includes(a))) {
            orphanedActors.add(a);
          }
        });
        (v.tags || []).forEach(t => {
          if (!remainingVideos.some(rv => (rv.tags || []).includes(t))) {
            orphanedTags.add(t);
          }
        });
      });

      if (orphanedActors.size > 0) {
        setExtraActors(prev => Array.from(new Set([...prev, ...Array.from(orphanedActors)])));
      }
      if (orphanedTags.size > 0) {
        setExtraTags(prev => Array.from(new Set([...prev, ...Array.from(orphanedTags)])));
      }

      await Promise.all(targetIds.map(id => {
        const video = videos.find(v => v.id === id);
        if (!video) return Promise.resolve();

        if (deleteOption === 'all') {
          // Remove from local cache
          setLocalFileCache(prev => {
            const next = new Map(prev);
            next.delete(id);
            // Search by code fallback
            if (video.code && video.code !== 'MANUAL') {
              for (const [cacheId, val] of Array.from(next.entries())) {
                const f = val as File;
                if (extractCode(f.name) === video.code) {
                  next.delete(cacheId);
                }
              }
            }
            return next;
          });
        }
        
        return electron.deleteVideo(id);
      }));
      
      const vids = await electron.getVideos();
      setVideos(vids);
      
      setSelectedVideo(null);
      setSelectedVideoIds(prev => {
        const next = new Set(prev);
        targetIds.forEach(id => next.delete(id));
        return next;
      });
      setDeleteConfirmVideo(null);
      setContextMenu(null);
      setCacheVersion(v => v + 1);
      alert('삭제 작업이 성공적으로 완료되었습니다.');
    } catch (e: any) {
      console.error("Delete failed:", e.message || e);
      alert("삭제 중 오류가 발생했습니다.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportDB = () => {
    const dataStr = safeStringify(videos, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `db_archive_backup_${new Date().toISOString().split('T')[0]}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleResetApp = () => {
    if (window.confirm('전체 초기화를 진행하시겠습니까? 모든 설정과 로컬 캐시 데이터가 삭제됩니다. (Firestore의 비디오 데이터는 유지됩니다)')) {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('db_') || key.startsWith('sg_') || key === 'sg_manager_guest_id')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      window.location.reload();
    }
  };

  const handleImportDB = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string) as Video[];
        if (Array.isArray(imported)) {
          setIsScraping(true);
          abortScrapingRef.current = false;
          for (const v of imported) {
            if (abortScrapingRef.current) break;
            const { id, createdAt, ...rest } = v as any;
            await addVideo(rest);
          }
          alert('데이터를 성공적으로 불러왔습니다.');
        }
      } catch (err) {
        alert('잘못된 백업 파일입니다.');
      }
    };
    reader.readAsText(file);
  };

  const filteredVideos = React.useMemo(() => {
    return videos.filter(v => {
      const matchesSearch = v.title.toLowerCase().includes(search.toLowerCase()) || 
                            v.code.toLowerCase().includes(search.toLowerCase()) ||
                            (v.actors || []).some(a => a.toLowerCase().includes(search.toLowerCase()));
      const matchesCategory = !selectedCategory || v.category === selectedCategory;
      const matchesActor = !selectedActor || (v.actors || []).includes(selectedActor);
      const matchesTag = !selectedTag || (v.tags || []).includes(selectedTag);
      return matchesSearch && matchesCategory && matchesActor && matchesTag;
    }).sort((a, b) => {
      if (sortBy === 'name') {
        return a.title.localeCompare(b.title);
      } else if (sortBy === 'rating') {
        return (b.rating || 0) - (a.rating || 0);
      } else {
        // recent (createdAt)
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : a.createdAt);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : b.createdAt);
        return (dateB || 0) - (dateA || 0);
      }
    });
  }, [videos, search, selectedCategory, selectedActor, selectedTag, sortBy]);

  const handleRandomPlay = useCallback(() => {
    if (filteredVideos.length === 0) return;
    const randomIndex = Math.floor(Math.random() * filteredVideos.length);
    setPlayingVideo(filteredVideos[randomIndex]);
  }, [filteredVideos]);

  const handleAddCategory = useCallback(async () => {
    if (!user) return;
    try {
      const docRef = await addCategory('새 항목');
      if (docRef) {
        setEditingCatId(docRef.id);
        setEditingCatName('새 항목');
      }
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  const handleSaveCategoryEdit = async () => {
    if (!editingCatId || !editingCatName.trim()) return;
    try {
      await updateCategory(editingCatId, { name: editingCatName.trim() });
      setEditingCatId(null);
      setEditingCatName('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelCategoryEdit = () => {
    setEditingCatId(null);
    setEditingCatName('');
  };

  const handleMoveCategory = async (id: string, direction: 'up' | 'down') => {
    const currentIndex = categories.findIndex(c => c.id === id);
    if (currentIndex === -1) return;
    
    let targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;
    
    // Sort logic
    const sortedCats = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));
    const currentCat = sortedCats[currentIndex];
    const targetCat = sortedCats[targetIndex];
    
    const tempOrder = currentCat.order || 0;
    await updateCategory(currentCat.id, { order: targetCat.order || 0 });
    await updateCategory(targetCat.id, { order: tempOrder });
  };
  
  const handleDeleteCategory = async (id: string) => {
    if (!user) return;
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    
    if (confirm(`'${cat.name}' 카테고리를 삭제하시겠습니까?`)) {
      try {
        await deleteCategory(id);
        alert('카테고리가 삭제되었습니다.');
      } catch (err) {
        alert('삭제 중 오류가 발생했습니다.');
      }
    }
  };

  const handleCheckDuplicates = useCallback(() => {
    if (videos.length === 0) return;
    
    const groups = new Map<string, Video[]>();
    
    videos.forEach(v => {
      // Key: Title + Code + Size
      const key = `${v.code}|${v.title}|${v.size || 0}`.toLowerCase().trim();
      const list = groups.get(key) || [];
      list.push(v);
      groups.set(key, list);
    });
    
    const found = Array.from(groups.values()).filter(g => g.length > 1);
    
    if (found.length === 0) {
      alert('중복된 영상이 발견되지 않았습니다.');
      return;
    }

    setDuplicateGroups(found);
    setShowDuplicateModal(true);
  }, [videos]);

  const handleBulkDeleteDuplicates = async () => {
    if (!confirm('각 그룹에서 첫 번째 항목만 남기고 나머지 중복 항목을 모두 삭제하시겠습니까?')) return;
    
    setIsScraping(true);
    abortScrapingRef.current = false;
    try {
      for (const group of duplicateGroups) {
        if (abortScrapingRef.current) break;
        const toDelete = group.slice(1);
        for (const v of toDelete) {
          if (abortScrapingRef.current) break;
          if (v.id) await deleteVideo(v.id);
        }
      }
      setDuplicateGroups([]);
      setShowDuplicateModal(false);
      alert('중복 정리가 완료되었습니다.');
    } catch (error) {
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setIsScraping(false);
    }
  };

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveVideo = async () => {
    if (!editingVideo) return;
    if (!editingVideo.id) {
       alert('영상 ID를 찾을 수 없습니다. (신규 항목인 경우 먼저 추가해 주세요)');
       return;
    }
    setIsSaving(true);
    try {
      await electron.saveVideo(editingVideo);
      
      const vids = await electron.getVideos();
      setVideos(vids);

      if (selectedVideo?.id === editingVideo.id) {
        setSelectedVideo({ ...editingVideo });
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddActorForSelected = async () => {
    if (editingVideo) {
      const actor = prompt('배우 이름을 입력하세요:');
      if (actor && actor.trim()) {
        const name = actor.trim();
        const currentActors = editingVideo.actors || [];
        if (!currentActors.includes(name)) {
          const newActors = [...currentActors, name];
          setEditingVideo({ ...editingVideo, actors: newActors });
        }
      }
      return;
    }

    if (selectedVideoIds.size > 0) {
      const actor = prompt(`${selectedVideoIds.size}개의 영상에 추가할 배우 이름을 입력하세요:`);
      if (actor && actor.trim()) {
        const name = actor.trim();
        setIsScraping(true);
        abortScrapingRef.current = false;
        try {
          for (const id of selectedVideoIds) {
            if (abortScrapingRef.current) break;
            const v = videos.find(vid => vid.id === id);
            if (v) {
              const newActors = Array.from(new Set([...(v.actors || []), name])) as string[];
              await electron.saveVideo({ ...v, actors: newActors });
            }
          }
          const vids = await electron.getVideos();
          setVideos(vids);
          alert('일괄 추가되었습니다.');
        } catch (err) {
          alert('추가 중 오류가 발생했습니다.');
        } finally {
          setIsScraping(false);
        }
      }
    } else {
      alert('배우를 추가할 영상을 먼저 선택하거나, 특정 영상의 [정보 수정]에서 추가해 주세요.');
    }
  };

  const handleAddTagForSelected = async () => {
    if (editingVideo) {
      const tag = prompt('태그 이름을 입력하세요:');
      if (tag && tag.trim()) {
        const name = tag.trim();
        const currentTags = editingVideo.tags || [];
        if (!currentTags.includes(name)) {
          const newTags = [...currentTags, name];
          setEditingVideo({ ...editingVideo, tags: newTags });
        }
      }
      return;
    }

    if (selectedVideoIds.size > 0) {
      const tag = prompt(`${selectedVideoIds.size}개의 영상에 추가할 태그 이름을 입력하세요:`);
      if (tag && tag.trim()) {
        const name = tag.trim();
        setIsScraping(true);
        abortScrapingRef.current = false;
        try {
          for (const id of selectedVideoIds) {
            if (abortScrapingRef.current) break;
            const v = videos.find(vid => vid.id === id);
            if (v) {
              const newTags = Array.from(new Set([...(v.tags || []), name])) as string[];
              await electron.saveVideo({ ...v, tags: newTags });
            }
          }
          const vids = await electron.getVideos();
          setVideos(vids);
          alert('일괄 추가되었습니다.');
        } catch (err) {
          alert('추가 중 오류가 발생했습니다.');
        } finally {
          setIsScraping(false);
        }
      }
    } else {
      alert('태그를 추가할 영상을 먼저 선택하거나, 특정 영상의 [정보 수정]에서 추가해 주세요.');
    }
  };

  const generateThumbnails = async (video: Video, count: number = 3) => {
    const file = localFileCache.get(video.id);
    const videoUrl = video.videoUrl || (video as any).previewVideoUrl;
    if (!file && !videoUrl) {
      setMissingVideoIds(prev => {
        const next = new Set(prev);
        next.add(video.id!);
        return next;
      });
      return false;
    }

    try {
      const videoEl = document.createElement('video');
      const src = file ? URL.createObjectURL(file) : videoUrl!;
      
      // Only apply crossOrigin to remote URLs to prevent canvas tainting.
      // Blobs and data URLs are same-origin by default.
      if (!src.startsWith('blob:') && !src.startsWith('data:')) {
        videoEl.crossOrigin = 'anonymous';
      }

      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.preload = 'auto';
      const loadPromise = new Promise((resolve, reject) => {
        videoEl.onloadedmetadata = () => {
          if (videoEl.duration) resolve(null);
        };
        videoEl.onloadeddata = resolve;
        videoEl.onerror = () => {
          const err = videoEl.error;
          const msg = err ? (err.message || `Code: ${err.code}`) : 'Unknown error';
          reject(new Error(`Video load error: ${msg}. (Note: Pipeline errors usually mean unsupported codecs like HEVC on some browsers)`));
        };
        setTimeout(() => reject(new Error('Video load timeout (15s)')), 15000);
      });

      videoEl.src = src;
      videoEl.load(); 
      await loadPromise;
      const duration = videoEl.duration;
      if (!duration || isNaN(duration)) throw new Error('Invalid video duration');

      const thumbnails: string[] = [];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Spread sample points across the video duration
      const points: number[] = [];
      if (count === 1) {
        points.push(0.5);
      } else {
        for (let i = 0; i < count; i++) {
          const segmentSize = 0.8 / count;
          const segmentStart = 0.1 + (segmentSize * i);
          points.push(segmentStart + (Math.random() * segmentSize));
        }
      }

      for (const p of points) {
        videoEl.currentTime = duration * p;
        await new Promise(r => {
          const onSeek = () => { videoEl.removeEventListener('seeked', onSeek); r(null); };
          videoEl.addEventListener('seeked', onSeek);
          setTimeout(r, 4000); // Wait up to 4s for seeking
        });

        // Use the actual video dimensions or fallback
        canvas.width = videoEl.videoWidth || 640;
        canvas.height = videoEl.videoHeight || 360;
        ctx?.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        try {
          thumbnails.push(canvas.toDataURL('image/jpeg', 0.6));
        } catch (e) {
          console.error("Canvas export failed (likely CORS):", e);
          // If a point fails, we still try the others
        }
      }

      // Cleanup
      if (src.startsWith('blob:')) URL.revokeObjectURL(src);

      if (thumbnails.length === 0) throw new Error('Could not generate any thumbnails');

      await updateVideo(video.id, { thumbnails });
      
      if (editingVideo?.id === video.id) setEditingVideo(prev => prev ? { ...prev, thumbnails } : null);
      if (selectedVideo?.id === video.id) setSelectedVideo(prev => prev ? { ...prev, thumbnails } : null);
      
      return true;
    } catch (err: any) {
      console.error('Thumbnail generation failed for', video.id, err);
      
      // If it's a permanent load error (corrupt file, unsupported format, truly missing),
      // mark it as missing so cleanup tools can catch it.
      if (video.id && (String(err).includes('error') || String(err).includes('timeout'))) {
        setMissingVideoIds(prev => {
          const next = new Set(prev);
          next.add(video.id!);
          return next;
        });
      }
      return false;
    }
  };

  const [missingVideoIds, setMissingVideoIds] = useState<Set<string>>(new Set());

  const isMissingFile = useCallback((v: Video) => {
    // 1. Explicitly marked as missing (failed to play/thumb)
    if (v.id && missingVideoIds.has(v.id)) return true;
    
    // 2. 0.0MB check (strictly 0 or null-ish indicator)
    if (v.size !== undefined && v.size <= 0) return true;
    
    // 3. Connectivity check
    if (v.id && localFileCache.has(v.id)) return false;
    
    // 4. Remote URLs (http/https) are considered present
    const videoUrl = v.videoUrl || (v as any).previewVideoUrl;
    const isRemote = videoUrl && (videoUrl.startsWith('http://') || videoUrl.startsWith('https://'));
    if (isRemote) return false;

    // 5. Local path detection
    const hasLocalPath = (v.filePath && /^[a-zA-Z]:[\\/]/.test(v.filePath)) || 
                        (videoUrl && (/^[a-zA-Z]:[\\/]/.test(videoUrl) || videoUrl.startsWith('file:')));

    if (hasLocalPath) {
      // For local paths, we MUST have it cached/seen in current session to be "not missing"
      // because browsers can't see the disk.
      // IF the cache is totally empty, we might not want to mark EVERY local file as missing
      // as that would delete the user's whole library on a refresh.
      if (localFileCache.size === 0) return false; 
      
      if (getCachedFile(v)) return false;
      return true;
    }
    
    // 6. Ghost entry: No URL, no path, and not in cache
    if (!videoUrl && !v.filePath && !getCachedFile(v)) return true;

    // Remote or local that isn't clearly missing yet
    return false;
  }, [localFileCache, missingVideoIds, getCachedFile]);

  const handleBatchScrapeMetadata = async () => {
    if (selectedVideoIds.size === 0) {
      alert('자동 설정할 영상을 먼저 선택해주세요.');
      return;
    }

    const targets = videos.filter(v => 
      selectedVideoIds.has(v.id!) && 
      (!v.title || v.title.includes('(정보 없음)') || !v.posterUrl || v.posterUrl.includes('unsplash')) && 
      v.code && v.code !== 'MANUAL'
    );

    if (targets.length === 0) {
      alert('선택한 영상 중 자동 설정이 필요한(정보가 부족한) 영상이 없습니다.');
      return;
    }

    if (confirm(`선택한 ${targets.length}개의 영상에 대해 AI 기반 정보 자동 설정을 시작하시겠습니까?\n(영상 코드를 기반으로 검색하여 제목, 스튜디오, 배우, 태그 등을 업데이트합니다.)`)) {
      setIsScraping(true);
      abortScrapingRef.current = false;
      let successCount = 0;
      for (const v of targets) {
        if (abortScrapingRef.current) break;
        try {
          const metadata = await scrapeMetadata(v.code!);
          await updateVideo(v.id!, {
            ...metadata,
            updatedAt: Date.now()
          });
          successCount++;
        } catch (err) {
          console.error(`Failed to scrape ${v.code}:`, err);
        }
      }
      setIsScraping(false);
      alert(`${successCount}개의 영상 정보 업데이트가 완료되었습니다.`);
    }
  };

  const handleBatchThumbnails = async () => {
    if (selectedVideoIds.size === 0) {
      alert('일괄 적용할 영상을 먼저 선택해주세요.');
      return;
    }
    const selectedVideos = videos.filter(v => selectedVideoIds.has(v.id || ''));
    if (confirm(`${selectedVideos.length}개의 영상에 대해 썸네일을 일괄 생성하시겠습니까?`)) {
      setIsScraping(true);
      abortScrapingRef.current = false;
      for (const v of selectedVideos) {
        if (abortScrapingRef.current) break;
        try {
          await generateThumbnails(v);
        } catch (err) {
          console.error(`Failed for ${v.id}`);
        }
      }
      setIsScraping(false);
      alert('일괄 생성이 완료되었습니다.');
    }
  };

  const handleMoveFolder = async () => {
    if (selectedVideoIds.size === 0) {
      alert('이동할 영상을 먼저 선택해주세요.');
      return;
    }
    const targetPath = prompt('이동할 대상 기본 경로를 입력하세요 (예: D:\\Archive\\NewFolder):');
    if (!targetPath) return;

    setIsScraping(true);
    abortScrapingRef.current = false;
    try {
      for (const id of selectedVideoIds) {
        if (abortScrapingRef.current) break;
        const v = videos.find(v => v.id === id);
        if (v) {
          const fileName = (v.filePath || '').split('\\').pop() || (v.code + '.mp4');
          const normalizedTarget = targetPath.endsWith('\\') ? targetPath.slice(0, -1) : targetPath;
          const newPath = normalizedTarget + '\\' + fileName;
          await updateVideo(id, { filePath: newPath });
        }
      }
      alert('경로 변경이 완료되었습니다.');
    } finally {
      setIsScraping(false);
    }
  };

  const handleCleanupMissing = async (selectedOnly: boolean = false) => {
    let targets: Video[] = [];
    
    // Explicitly identify what SHOULD be deleted based on user criteria:
    // 1. Files marked as missing (failed to play/thumb)
    // 2. Files with 0.0MB size recorded
    // 3. Files with no path and no URL
    // 4. (If session cache available) Local files not present in cache
    const checkIsActuallyMissing = (v: Video) => {
      if (v.id && missingVideoIds.has(v.id)) return true;
      if (v.size !== undefined && v.size <= 0) return true;
      if (!v.filePath && !v.videoUrl) return true;
      
      // Only check disk presence if we have some files in cache (meaning user scanned a folder)
      if (localFileCache.size > 0 && v.filePath && /^[a-zA-Z]:[\\/]/.test(v.filePath)) {
        if (!getCachedFile(v)) return true;
      }
      return false;
    };

    if (selectedOnly) {
      if (selectedVideoIds.size === 0) {
        alert('먼저 정리할 항목들을 선택해 주세요.');
        return;
      }
      targets = videos.filter(v => v.id && selectedVideoIds.has(v.id) && checkIsActuallyMissing(v));
    } else {
      targets = videos.filter(v => checkIsActuallyMissing(v));
    }

    if (targets.length === 0) {
      if (selectedOnly) {
        alert('선택한 항목들 중 파일 경로가 끊겨있거나 0.0MB인 파일을 찾을 수 없습니다.');
      } else {
        alert('보관함 전체에서 미존재 파일이나 0.0MB인 항목이 없습니다.');
      }
      return;
    }
    
    const targetDesc = selectedOnly ? '선택 리스트 중 ' : '보관함 전체 중 ';
    if (confirm(`${targetDesc}파일이 진짜로 없거나 0.0MB인 ${targets.length}개의 항목을 보관함에서 삭제하시겠습니까?\n(알림: 실제 하드디스크의 파일은 삭제되지 않으며 DB 정보만 제거됩니다.)`)) {
      setIsScraping(true);
      setIsDeleting(true);
      abortScrapingRef.current = false;
      const targetIds = targets.map(v => v.id!).filter(Boolean);
      
      try {
        // Collect orphaned actors and tags like confirmDelete does
        const remainingVideos = videos.filter(v => v.id && !targetIds.includes(v.id));
        const orphanedActors = new Set<string>();
        const orphanedTags = new Set<string>();
        
        targets.forEach(v => {
          (v.actors || []).forEach(a => {
            if (!remainingVideos.some(rv => (rv.actors || []).includes(a))) orphanedActors.add(a);
          });
          (v.tags || []).forEach(t => {
            if (!remainingVideos.some(rv => (rv.tags || []).includes(t))) orphanedTags.add(t);
          });
        });

        if (orphanedActors.size > 0) setExtraActors(prev => Array.from(new Set([...prev, ...Array.from(orphanedActors)])));
        if (orphanedTags.size > 0) setExtraTags(prev => Array.from(new Set([...prev, ...Array.from(orphanedTags)])));

        let count = 0;
        // Batch deletion via Promise.all or sequential for progress
        for (const id of targetIds) {
          if (abortScrapingRef.current) break;
          await deleteVideo(id);
          count++;
        }
        
        // Clear deleted IDs from selection
        setSelectedVideoIds(prev => {
          const next = new Set(prev);
          targetIds.forEach(id => next.delete(id));
          return next;
        });
        
        setCacheVersion(v => v + 1);
        alert(`${count}개의 항목 정리가 완료되었습니다.`);
      } catch (err) {
        console.error("Cleanup error:", err);
        alert('처리 중 오류가 발생했습니다.');
      } finally {
        setIsScraping(false);
        setIsDeleting(false);
      }
    }
  };

  const [manualThumbVideo, setManualThumbVideo] = useState<Video | null>(null);
  const [manualTime, setManualTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isManualVideoPlaying, setIsManualVideoPlaying] = useState(false);
  const [manualVideoUrl, setManualVideoUrl] = useState<string | null>(null);
  const manualVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (manualThumbVideo) {
      const file = getCachedFile(manualThumbVideo);
      let url: string | null = null;
      
      if (file) {
        url = URL.createObjectURL(file);
      } else {
        url = manualThumbVideo.videoUrl || (manualThumbVideo as any).previewVideoUrl || null;
      }
      
      setManualVideoUrl(url);
      setManualTime(0);
      setManualLoadError(null);
      
      return () => {
        if (url && url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      };
    } else {
      setManualVideoUrl(null);
      setManualLoadError(null);
    }
  }, [manualThumbVideo, cacheVersion, getCachedFile]);

  const [manualLoadError, setManualLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (manualLoadError && manualThumbVideo) {
      setMissingVideoIds(prev => {
        const next = new Set(prev);
        next.add(manualThumbVideo.id!);
        return next;
      });
    }
  }, [manualLoadError, manualThumbVideo]);

  useEffect(() => {
    if (manualVideoUrl && manualVideoRef.current) {
      const v = manualVideoRef.current;
      v.muted = true;
      v.load(); 
      
      const playVideo = async () => {
        try {
          await v.play();
        } catch (e) {
          console.warn("Manual video playback auto-trigger blocked");
        }
      };

      const handleCanPlay = () => {
        playVideo();
      };
      
      v.addEventListener('canplay', handleCanPlay);
      return () => v.removeEventListener('canplay', handleCanPlay);
    }
  }, [manualVideoUrl]);

  const handleCreateManualThumb = async () => {
    if (!manualThumbVideo || !manualVideoRef.current) return;
    const videoEl = manualVideoRef.current;
    
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // Ensure we draw the current frame
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      
      const newThumb = canvas.toDataURL('image/jpeg', 0.8);
      const currentThumbs = manualThumbVideo.thumbnails || [];
      const updatedThumbs = [...currentThumbs, newThumb].slice(-10); // keep up to 10
      
      await updateVideo(manualThumbVideo.id!, { thumbnails: updatedThumbs });
      
      setManualThumbVideo({ ...manualThumbVideo, thumbnails: updatedThumbs });
      
      if (editingVideo?.id === manualThumbVideo.id) {
         setEditingVideo({ ...editingVideo, thumbnails: updatedThumbs });
      }
      if (selectedVideo?.id === manualThumbVideo.id) {
         setSelectedVideo({ ...selectedVideo, thumbnails: updatedThumbs });
      }
      
      alert('썸네일이 추가되었습니다.');
    } catch (err) {
      console.error("Manual thumb creation failed");
      alert('썸네일 추출에 실패했습니다. (CORS 문제이거나 비디오 전송 오류일 수 있습니다)');
    }
  };

  const [actorOrder, setActorOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem('db_actor_order');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [tagOrder, setTagOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem('db_tag_order');
    return saved ? JSON.parse(saved) : [];
  });

  const handleMoveActor = (actor: string, direction: 'up' | 'down') => {
    setActorOrder(prev => {
      const currentOrder = [...actors];
      const idx = currentOrder.indexOf(actor);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= currentOrder.length) return prev;
      
      // We need to build the base order if not all represented
      const baseOrder = [...currentOrder];
       // Swap in base order
      const temp = baseOrder[idx];
      baseOrder[idx] = baseOrder[targetIdx];
      baseOrder[targetIdx] = temp;
      
      localStorage.setItem('db_actor_order', JSON.stringify(baseOrder));
      return baseOrder;
    });
  };

  const handleMoveTag = (tag: string, direction: 'up' | 'down') => {
    setTagOrder(prev => {
      const currentOrder = [...tags];
      const idx = currentOrder.indexOf(tag);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= currentOrder.length) return prev;
      
      const baseOrder = [...currentOrder];
      const temp = baseOrder[idx];
      baseOrder[idx] = baseOrder[targetIdx];
      baseOrder[targetIdx] = temp;
      
      localStorage.setItem('db_tag_order', JSON.stringify(baseOrder));
      return baseOrder;
    });
  };

  const actors = React.useMemo(() => {
    const derived = Array.from(new Set([
      ...videos.flatMap(v => v.actors || []),
      ...extraActors
    ])).filter(Boolean) as string[];
    return derived.sort((a, b) => {
      const idxA = actorOrder.indexOf(a);
      const idxB = actorOrder.indexOf(b);
      if (idxA === -1 && idxB === -1) return a.localeCompare(b);
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [videos, actorOrder, extraActors]);

  const tags = React.useMemo(() => {
    const derived = Array.from(new Set([
      ...videos.flatMap(v => v.tags || []),
      ...extraTags
    ])).filter(Boolean) as string[];
    return derived.sort((a, b) => {
      const idxA = tagOrder.indexOf(a);
      const idxB = tagOrder.indexOf(b);
      if (idxA === -1 && idxB === -1) return a.localeCompare(b);
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [videos, tagOrder, extraTags]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 text-zinc-800 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#050505] flex flex-col font-sans overflow-hidden text-zinc-400">
      <TitleBar title="DB Archive - 개인 영상 라이브러리" />

      {/* Header / Nav */}
      <div className="bg-[#0a0a0a] border-b border-white/[0.03] flex items-center px-4 z-50 shadow-2xl">
        <MenuBarItem 
          label="파일" 
          active={activeMenu === 'file'} 
          onToggle={() => setActiveMenu(activeMenu === 'file' ? null : 'file')}
          items={[
            { label: '파일 가져오기', onClick: () => fileInputRef.current?.click() },
            { label: '폴더 가져오기', onClick: () => folderInputRef.current?.click() },
            { label: '종료', onClick: () => window.close() }
          ]} 
        />
        <MenuBarItem 
          label="편집" 
          active={activeMenu === 'edit'} 
          onToggle={() => setActiveMenu(activeMenu === 'edit' ? null : 'edit')}
          items={[
            { label: '카테고리 리스트 수정', onClick: () => setShowCategoryManage(true) },
            { label: '배우 리스트 수정', onClick: () => setShowActorManage(true) },
            { label: '태그 리스트 수정', onClick: () => setShowTagManage(true) }
          ]} 
        />
        <MenuBarItem 
          label="도구" 
          active={activeMenu === 'tool'} 
          onToggle={() => setActiveMenu(activeMenu === 'tool' ? null : 'tool')}
          items={[
            { label: '--- 선택 리스트 도구 ---' },
            { label: '선택 리스트 정보 자동 설정', onClick: handleBatchScrapeMetadata },
            { label: '선택 리스트 일괄 적용 (자동 썸네일 생성)', onClick: handleBatchThumbnails },
            { label: '선택 항목 중 미존재 파일 삭제', onClick: () => handleCleanupMissing(true) },
            { label: '선택 리스트 폴더 이동', onClick: handleMoveFolder },
            { label: '--- 전체 리스트 도구 ---' },
            { label: '보관함 미존재 파일 일괄 삭제', onClick: () => handleCleanupMissing(false) },
            { label: '중복 파일 검사', onClick: handleCheckDuplicates }
          ]} 
        />
        <MenuBarItem 
          label="백업" 
          active={activeMenu === 'backup'} 
          onToggle={() => setActiveMenu(activeMenu === 'backup' ? null : 'backup')}
          items={[
            { label: '라이브러리 백업', onClick: handleExportDB },
            { label: '라이브러리 복원', onClick: () => dbInputRef.current?.click() }
          ]} 
        />
        <MenuBarItem 
          label="옵션" 
          active={activeMenu === 'option'} 
          onToggle={() => setActiveMenu(activeMenu === 'option' ? null : 'option')}
          items={[
            { 
              label: localStorage.getItem('sg_adult_auth_date') 
                ? `성인인증 (${new Date(parseInt(localStorage.getItem('sg_adult_auth_date')!)).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}) 완료` 
                : '성인인증 (미완료)', 
              onClick: () => setShowAuthModal(true) 
            },
            { label: '프로그램 설정', onClick: () => { setSettingsActiveTab('sync'); setShowSettingsModal(true); } },
            { label: '정보', onClick: () => { setSettingsActiveTab('version'); setShowSettingsModal(true); } }
          ]} 
        />
        
        <div className="flex-1 px-8">
          <div className="max-w-md mx-auto relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600 transition-colors group-focus-within:text-blue-500" />
            <input 
              type="text" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="제목, 품번, 배우 검색..."
              className="w-full bg-white/[0.02] border border-white/[0.05] rounded-full py-1.5 pl-9 pr-4 text-[11px] text-white outline-none focus:bg-white/[0.05] focus:border-blue-500/50 transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-6 text-[10px] uppercase font-black tracking-widest">
           <button 
             onClick={handleRandomPlay}
             className="text-zinc-600 hover:text-blue-500 transition-colors flex items-center gap-1.5"
           >
             <Sparkles className="w-3 h-3" /> 랜덤재생
           </button>
           <div className="w-[1px] h-3 bg-white/10" />
           <button 
             onClick={() => setSortBy('name')} 
             className={`${sortBy === 'name' ? 'text-blue-500' : 'text-zinc-600 hover:text-zinc-400'} transition-colors`}
           >이름순</button>
           <button 
             onClick={() => setSortBy('rating')} 
             className={`${sortBy === 'rating' ? 'text-blue-500' : 'text-zinc-600 hover:text-zinc-400'} transition-colors`}
           >평점순</button>
           <button 
             onClick={() => setSortBy('recent')} 
             className={`${sortBy === 'recent' ? 'text-blue-500' : 'text-zinc-600 hover:text-zinc-400'} transition-colors`}
           >등록순</button>
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-64 bg-[#0a0a0a] border-r border-white/[0.03] flex flex-col pt-4">
          <div className="px-6 mb-6">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="px-6 bg-blue-600 hover:bg-blue-500 text-white py-1.5 rounded-sm flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-600/20 mx-auto"
            >
              <Plus className="w-3 h-3" /> 동영상 추가
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <SidebarSection title="그룹 / 카테고리" onAdd={handleAddCategory}>
              <div 
                onClick={() => setSelectedCategory(null)}
                className={`group flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${!selectedCategory ? 'bg-blue-600/10 border-l-2 border-blue-600' : 'hover:bg-white/[0.03]'}`}
              >
                <div className="flex items-center gap-3">
                  <LayoutGrid className={`w-3.5 h-3.5 ${!selectedCategory ? 'text-blue-500' : 'text-zinc-500'}`} />
                  <span className={`text-[11px] font-bold ${!selectedCategory ? 'text-zinc-200' : 'text-zinc-500 group-hover:text-zinc-300'}`}>전체 영상</span>
                </div>
                <span className={`text-[10px] font-black ${!selectedCategory ? 'text-blue-500' : 'text-zinc-700'}`}>{videos.length}</span>
              </div>
              {categories.sort((a, b) => (a.order || 0) - (b.order || 0)).map(cat => (
                <div 
                  key={cat.id}
                  onClick={() => !editingCatId && setSelectedCategory(cat.name)}
                  className={`group flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${selectedCategory === cat.name ? 'bg-blue-600/10 border-l-2 border-blue-600' : 'hover:bg-white/[0.03]'}`}
                >
                  <div className="flex items-center gap-3 flex-1 overflow-hidden">
                    <FolderOpen className={`w-3.5 h-3.5 shrink-0 ${selectedCategory === cat.name ? 'text-blue-500' : 'text-zinc-500'}`} />
                    {editingCatId === cat.id ? (
                      <input 
                        autoFocus
                        value={editingCatName}
                        onChange={(e) => setEditingCatName(e.target.value)}
                        onBlur={handleSaveCategoryEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveCategoryEdit();
                          if (e.key === 'Escape') handleCancelCategoryEdit();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-black/40 border border-blue-500/50 rounded-sm px-1.5 py-0.5 text-[11px] text-white outline-none w-full"
                      />
                    ) : (
                      <span className={`text-[11px] font-bold truncate ${selectedCategory === cat.name ? 'text-zinc-200' : 'text-zinc-500 group-hover:text-zinc-300'}`}>{cat.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <span className={`text-[10px] font-black ${selectedCategory === cat.name ? 'text-blue-500' : 'text-zinc-700'}`}>
                      {videos.filter(v => v.category === cat.name).length}
                    </span>
                    {editingCatId !== cat.id && (
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                         <button 
                          onClick={(e) => { e.stopPropagation(); handleMoveCategory(cat.id, 'up'); }}
                          className="p-1 hover:text-blue-400 text-zinc-600"
                        >
                          <ChevronRight className="w-3 h-3 -rotate-90" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleMoveCategory(cat.id, 'down'); }}
                          className="p-1 hover:text-blue-400 text-zinc-600"
                        >
                          <ChevronRight className="w-3 h-3 rotate-90" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setEditingCatId(cat.id); setEditingCatName(cat.name); }}
                          className="p-1 hover:text-blue-400 text-zinc-600"
                        >
                          <Settings className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }}
                          className="p-1 hover:text-red-400 text-zinc-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </SidebarSection>

            <SidebarSection title="배우" onAdd={handleAddActorForSelected}>
              <div className="flex flex-wrap gap-1 mb-3 px-3">
                <span 
                  onClick={() => { setSelectedActor(null); setSelectedTag(null); setSelectedCategory(null); }}
                  className={`px-2 py-1 border text-[9px] font-black uppercase cursor-pointer transition-colors ${!selectedActor ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-900 border-white/[0.03] text-zinc-600 hover:text-white'}`}
                >
                  All
                </span>
              </div>
              <div className="max-h-60 overflow-y-auto custom-scrollbar pr-1 -mr-1">
                {actors.map(actor => (
                  <div 
                    key={actor} 
                    onClick={() => { setSelectedActor(actor); setSelectedTag(null); setSelectedCategory(null); }}
                    className={`flex items-center justify-between px-3 py-1.5 cursor-pointer group transition-colors ${selectedActor === actor ? 'bg-blue-600/10 border-l-2 border-blue-600' : 'hover:bg-white/[0.03]'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-1.5 h-1.5 rounded-full ${selectedActor === actor ? 'bg-blue-500' : 'bg-zinc-800 group-hover:bg-blue-600'}`} />
                      <span className={`text-[11px] truncate font-medium ${selectedActor === actor ? 'text-zinc-200' : 'text-zinc-500 group-hover:text-zinc-300'}`}>{actor}</span>
                    </div>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleMoveActor(actor, 'up'); }}
                        className="p-1 hover:text-blue-400 text-zinc-600"
                      >
                        <ChevronRight className="w-2.5 h-2.5 -rotate-90" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleMoveActor(actor, 'down'); }}
                        className="p-1 hover:text-blue-400 text-zinc-600"
                      >
                        <ChevronRight className="w-2.5 h-2.5 rotate-90" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </SidebarSection>

            <SidebarSection title="장르 / 태그" onAdd={handleAddTagForSelected}>
               <div className="flex flex-wrap gap-1">
                <span 
                  onClick={() => { setSelectedTag(null); setSelectedActor(null); }}
                  className={`px-2 py-1 border text-[9px] font-black uppercase cursor-pointer transition-colors ${!selectedTag ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-900 border-white/[0.03] text-zinc-600 hover:text-white'}`}
                >
                  All
                </span>
                {tags.map(tag => (
                  <div key={tag} className="group relative">
                    <span 
                      onClick={() => { setSelectedTag(tag); setSelectedActor(null); setSelectedCategory(null); }}
                      className={`px-2 py-1 border text-[9px] font-black uppercase cursor-pointer transition-colors block ${selectedTag === tag ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-900 border-white/[0.03] text-zinc-600 hover:text-white'}`}
                    >
                      {tag}
                    </span>
                    <div className="absolute -top-1 -right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black rounded shadow-lg border border-white/10 z-10">
                      <button onClick={(e) => { e.stopPropagation(); handleMoveTag(tag, 'up'); }} className="p-0.5 hover:text-blue-400 text-zinc-500">
                        <ChevronRight className="w-2 h-2 -rotate-90" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleMoveTag(tag, 'down'); }} className="p-0.5 hover:text-blue-400 text-zinc-500">
                        <ChevronRight className="w-2 h-2 rotate-90" />
                      </button>
                    </div>
                  </div>
                ))}
               </div>
            </SidebarSection>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 bg-[#050505] overflow-y-auto p-10 flex flex-col custom-scrollbar">
          {!authenticated ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="w-24 h-24 bg-white/[0.02] border border-white/[0.05] flex items-center justify-center rounded-3xl mb-8">
                <Lock className="w-10 h-10 text-zinc-700" />
              </div>
              <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">보안 액세스 필요</h2>
              <p className="text-zinc-500 mb-10 max-w-sm text-center text-sm leading-relaxed">
                제한된 디지털 아카이브에 액세스하려면 인증 확인 코드를 입력하십시오.
              </p>
              <button 
                onClick={() => setShowAuthModal(true)}
                className="bg-zinc-100 text-black px-10 py-4 rounded-sm text-[11px] font-black uppercase tracking-widest hover:bg-white transition-all shadow-xl shadow-zinc-100/5"
              >
                인증 시작하기
              </button>
            </div>
          ) : (
            <div className="max-w-[1600px] mx-auto w-full">
              <div className="flex items-center justify-between mb-10">
                <div>
                  <h1 className="text-3xl font-black text-white uppercase tracking-tight mb-2">DB 아카이브 보관함</h1>
                  <p className="text-[11px] font-bold text-zinc-600 uppercase tracking-widest">
                    보관됨: {videos.length} 항목 | {sortBy === 'name' ? '이름' : sortBy === 'rating' ? '평점' : '등록'} 순으로 정렬됨
                  </p>
                  <div className="flex gap-4 mt-2 items-center">
                    <button 
                      onClick={() => setSelectedVideoIds(new Set(filteredVideos.map(v => v.id)))}
                      className="text-[10px] font-black text-zinc-500 hover:text-white uppercase tracking-widest transition-colors"
                    >전체 선택</button>
                    <button 
                      onClick={() => setSelectedVideoIds(new Set())}
                      className="text-[10px] font-black text-zinc-500 hover:text-white uppercase tracking-widest transition-colors"
                    >선택 해제</button>
                    <div className="w-[1px] h-3 bg-white/10" />
                     <div className="flex items-center gap-3 bg-zinc-900/50 px-3 py-1.5 rounded-full border border-white/5">
                       <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em] shrink-0">크기</span>
                       <div className="relative flex items-center">
                         <input 
                           type="range" 
                           min="2" 
                           max="24" 
                           step="1"
                           value={26 - gridCols}
                           onChange={(e) => {
                             const v = parseInt(e.target.value);
                             const newCols = 26 - v;
                             setGridCols(newCols);
                             localStorage.setItem('db_grid_cols', newCols.toString());
                           }}
                           className="w-28 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
                         />
                       </div>
                       <span className="text-[10px] font-mono text-zinc-400 w-4">{26 - gridCols}</span>
                     </div>
                  </div>
                </div>
                <div className="flex gap-2">
                   <button 
                     onClick={() => setViewMode('grid')}
                     className={`p-3 transition-all ${viewMode === 'grid' ? 'bg-white text-black shadow-lg' : 'bg-zinc-900/50 text-zinc-600 hover:text-zinc-400 border border-white/5'}`}
                   >
                     <LayoutGrid className="w-4 h-4" />
                   </button>
                   <button 
                     onClick={() => setViewMode('list')}
                     className={`p-3 transition-all ${viewMode === 'list' ? 'bg-white text-black shadow-lg' : 'bg-zinc-900/50 text-zinc-600 hover:text-zinc-400 border border-white/5'}`}
                   >
                     <List className="w-4 h-4" />
                   </button>
                </div>
              </div>

              {filteredVideos.length === 0 ? (
                <div className="py-40 flex flex-col items-center justify-center text-zinc-800">
                  <Database className="w-20 h-20 mb-6 opacity-5" />
                  <p className="text-[11px] font-black uppercase tracking-widest">보관함이 비어있습니다</p>
                </div>
              ) : (
                <div ref={containerRef} className="flex-1 w-full h-full min-h-[500px]">
                  {viewMode === 'grid' ? (
                    <VirtualVideoGrid 
                      videos={filteredVideos}
                      isMissingFile={isMissingFile}
                      selectedVideoIds={selectedVideoIds}
                      toggleSelect={toggleSelect}
                      onVideoSelect={handleVideoSelect}
                      onPlay={handlePlayVideo}
                      onContextMenu={(e, v) => setContextMenu({ x: (e as any).clientX, y: (e as any).clientY, video: v })}
                      gridCols={gridCols}
                      aspectRatio={settingsValues.aspectRatio}
                      width={containerSize.width}
                      height={containerSize.height || (window.innerHeight - 300)}
                    />
                  ) : (
                    <div className="flex flex-col border border-white/[0.05] bg-[#0a0a0a] h-full overflow-hidden">
                      <div 
                        className="grid gap-4 px-4 py-3 bg-zinc-900/50 border-b border-white/[0.05] text-[10px] font-black uppercase tracking-widest text-zinc-500 sticky top-0 z-10"
                        style={{ gridTemplateColumns: `${Math.max(64, 64 * Math.max(0.4, (26 - gridCols) / 12))}px 100px 1fr 150px 120px 150px 100px` }}
                      >
                        <span>미리보기</span>
                        <span>품번</span>
                        <span>제목</span>
                        <span>배우</span>
                        <span>스튜디오</span>
                        <span>평점</span>
                        <span className="text-right">용량</span>
                      </div>
                      <FixedList
                        itemCount={filteredVideos.length}
                        itemSize={80}
                        height={(containerSize.height || (window.innerHeight - 300)) - 40}
                        width={containerSize.width}
                      >
                        {({ index, style }: { index: number, style: React.CSSProperties }) => (
                          <div style={style}>
                            <VideoListItem 
                              video={filteredVideos[index]} 
                              isMissing={isMissingFile(filteredVideos[index])}
                              scale={Math.max(0.4, (26 - gridCols) / 12)}
                              isSelected={selectedVideoIds.has(filteredVideos[index].id || '')}
                              onClick={() => toggleSelect(filteredVideos[index].id || '')}
                              onDoubleClick={() => handleVideoSelect(filteredVideos[index])} 
                              onPlay={(v) => handlePlayVideo(v)}
                              onContextMenu={(e, v) => setContextMenu({ x: e.clientX, y: e.clientY, video: v })}
                            />
                          </div>
                        )}
                      </FixedList>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {contextMenu && (
        <ContextMenu 
          x={contextMenu.x} 
          y={contextMenu.y} 
          onClose={() => setContextMenu(null)}
          items={[
            { label: '재생', onClick: () => handlePlayVideo(contextMenu.video), shortcut: 'Enter' },
            { label: '정보 / 수정', onClick: () => { handleVideoSelect(contextMenu.video); }, shortcut: 'F2' },
            { label: 'separator', onClick: () => {} },
            { label: '자동 썸네일 생성', onClick: () => generateThumbnails(contextMenu.video) },
            { label: '수동 썸네일 제작', onClick: () => setManualThumbVideo(contextMenu.video) },
            { label: 'separator', onClick: () => {} },
            { label: '저장된 폴더 열기', onClick: () => alert('브라우저 보안으로 인해 폴더 열기는 지원되지 않습니다.'), shortcut: 'F3' },
            { label: 'separator', onClick: () => {} },
            { label: '선택 정보 자동 설정', onClick: () => { setScrapeCode(contextMenu.video.code); setIsScrapeOpen(true); }, shortcut: 'F4' },
            { label: 'separator', onClick: () => {} },
            { label: '삭제', onClick: () => handleDelete(contextMenu.video.id), shortcut: 'Delete' },
          ]}
        />
      )}

      {/* Footer / Status */}
      <div className="bg-[#0a0a0a] border-t border-white/[0.03] px-6 h-8 flex justify-between items-center text-[9px] font-bold text-zinc-600 uppercase tracking-widest">
        <div className="flex gap-6">
          <span className="text-blue-500">데이터베이스 동기화됨</span>
        </div>
        <div className="flex gap-6 items-center">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span>준비됨</span>
          </div>
          <span>DB ARCHIVE v1.12.2</span>
        </div>
      </div>

      {/* Delete Confirmation Selection Modal */}
      <Modal 
        isOpen={!!deleteConfirmVideo} 
        onClose={() => setDeleteConfirmVideo(null)} 
        title="삭제 옵션 선택"
        maxWidth="max-w-md"
      >
        {deleteConfirmVideo && (
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-4 bg-red-500/10 border border-red-500/20 rounded-sm">
               <AlertTriangle className="w-8 h-8 text-red-500 shrink-0" />
               <div className="space-y-1">
                 <div className="text-[11px] font-black text-red-500 uppercase tracking-widest">주의: 데이터 삭제</div>
                 <div className="text-[10px] text-zinc-400 leading-relaxed font-medium">
                   선택한 동영상의 정보를 삭제합니다. 삭제 방식을 선택해주세요.
                 </div>
               </div>
            </div>

            <div className="text-center space-y-3 p-4 bg-zinc-900 border border-white/5">
               <div className="text-[12px] font-black text-zinc-200 line-clamp-1 px-4">{deleteConfirmVideo.title}</div>
               <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">{deleteConfirmVideo.code}</div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button 
                onClick={() => setDeleteOption('all')}
                className={`flex items-center justify-between p-4 border transition-all text-left ${deleteOption === 'all' ? 'bg-red-500/10 border-red-500/50' : 'bg-transparent border-white/5 hover:border-white/10'}`}
              >
                <div className="space-y-1">
                  <div className={`text-[11px] font-black uppercase tracking-widest ${deleteOption === 'all' ? 'text-red-500' : 'text-zinc-400'}`}>원본파일 + 표지삭제</div>
                  <div className="text-[9px] text-zinc-600 font-medium">로컬 캐시된 파일과 DB의 모든 정보를 제거합니다.</div>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${deleteOption === 'all' ? 'border-red-500' : 'border-zinc-700'}`}>
                   {deleteOption === 'all' && <div className="w-2 h-2 bg-red-500 rounded-full" />}
                </div>
              </button>

              <button 
                onClick={() => setDeleteOption('metadata')}
                className={`flex items-center justify-between p-4 border transition-all text-left ${deleteOption === 'metadata' ? 'bg-blue-500/10 border-blue-500/50' : 'bg-transparent border-white/5 hover:border-white/10'}`}
              >
                <div className="space-y-1">
                  <div className={`text-[11px] font-black uppercase tracking-widest ${deleteOption === 'metadata' ? 'text-blue-500' : 'text-zinc-400'}`}>표지삭제</div>
                  <div className="text-[9px] text-zinc-600 font-medium">로컬 파일은 유지하고 DB에 등록된 정보만 제거합니다.</div>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${deleteOption === 'metadata' ? 'border-blue-500' : 'border-zinc-700'}`}>
                   {deleteOption === 'metadata' && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                </div>
              </button>
            </div>

            <div className="flex gap-2 pt-4">
              <button 
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 py-3 bg-red-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-red-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {isDeleting ? '삭제 중...' : '삭제'}
              </button>
              <button 
                onClick={() => setDeleteConfirmVideo(null)}
                className="flex-1 py-3 bg-zinc-800 text-zinc-400 text-[11px] font-black uppercase tracking-widest hover:bg-zinc-700 border border-white/5 transition-all"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </Modal>

      <SettingsModal 
        isOpen={showSettingsModal} 
        onClose={() => setShowSettingsModal(false)}
        initialTab={settingsActiveTab}
        onReset={handleResetApp}
        onUpdate={() => {
          // Update local state to trigger authState re-calculation if needed
          setOfflineMode(localStorage.getItem('sg_offline_mode') === 'true');
          const usePassword = localStorage.getItem('sg_use_password') === 'true';
          if (!usePassword) setIsPasswordUnlocked(true);
          else setIsPasswordUnlocked(false);

          setSettingsValues({
            fontSize: localStorage.getItem('db_font_size') || '11',
            fontFamily: localStorage.getItem('db_font_family') || 'Inter',
            aspectRatio: localStorage.getItem('db_aspect_ratio') || '3/4'
          });
        }}
      />

      <input 
        type="file" 
        multiple 
        ref={fileInputRef} 
        className="hidden" 
        accept="video/*" 
        onChange={(e) => processFiles(e.target.files)} 
      />
      <input 
        type="file" 
        ref={folderInputRef} 
        className="hidden" 
        // @ts-ignore
        webkitdirectory="" 
        onChange={(e) => processFiles(e.target.files)} 
      />
      <input type="file" ref={dbInputRef} className="hidden" accept=".json" onChange={handleImportDB} />

      {/* Adult Auth Modal */}
      <Modal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} title="성인 인증" maxWidth="max-w-md">
        <div className="space-y-8 py-4">
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-amber-600/10 flex items-center justify-center rounded-full border border-amber-600/20">
              <Key className="w-8 h-8 text-amber-500" />
            </div>
          </div>
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center block">성인 인증 시그니처 코드를 입력하세요</label>
              <input 
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white/[0.02] border border-white/[0.05] rounded-sm p-4 text-center text-lg text-white font-mono outline-none focus:border-amber-500 transition-all"
                onKeyDown={(e) => e.key === 'Enter' && handleAdultAuthSubmit()}
              />
            </div>
            <button 
              onClick={handleAdultAuthSubmit}
              className="w-full bg-amber-600 text-white py-4 rounded-sm text-[11px] font-black uppercase tracking-widest hover:bg-amber-500 transition-all shadow-xl shadow-amber-600/20"
            >
              인증 시그니처 확인
            </button>
          </div>
        </div>
      </Modal>

      {/* Password Modal */}
      <Modal isOpen={showPasswordModal} onClose={() => {}} title="보안 잠금 해제" maxWidth="max-w-md">
        <div className="space-y-8 py-4">
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-blue-600/10 flex items-center justify-center rounded-full border border-blue-600/20">
              <Lock className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center block">프로그램 비밀번호를 입력하세요</label>
              <input 
                type="password"
                value={loginPasswordInput}
                onChange={(e) => setLoginPasswordInput(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white/[0.02] border border-white/[0.05] rounded-sm p-4 text-center text-lg text-white font-mono outline-none focus:border-blue-500 transition-all"
                onKeyDown={(e) => e.key === 'Enter' && handleLoginPasswordSubmit()}
              />
            </div>
            <button 
              onClick={handleLoginPasswordSubmit}
              className="w-full bg-blue-600 text-white py-4 rounded-sm text-[11px] font-black uppercase tracking-widest hover:bg-blue-500 transition-all shadow-xl shadow-blue-600/20"
            >
              잠금 해제
            </button>
          </div>
        </div>
      </Modal>
      <Modal isOpen={isScrapeOpen} onClose={() => setIsScrapeOpen(false)} title="보관함에 추가" maxWidth="max-w-lg">
        <div className="space-y-8">
          <div className="bg-blue-600/5 border border-blue-600/20 rounded-sm p-6 flex gap-4">
            <Info className="w-6 h-6 text-blue-500 flex-shrink-0" />
            <p className="text-[12px] text-blue-200/70 leading-relaxed font-bold">
              품번(코드)를 입력하면 AI 시스템이 해당 영상의 모든 기술 정보를 즉시 보관함에 업데이트합니다.
            </p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center block">품번 입력</label>
              <input
                type="text"
                placeholder="ABC-123"
                value={scrapeCode}
                onChange={(e) => setScrapeCode(e.target.value)}
                className="w-full bg-white/[0.02] border border-white/[0.05] rounded-sm py-4 px-6 text-xl text-white uppercase font-black tracking-widest outline-none focus:border-blue-500 transition-all"
              />
            </div>
            <button
              onClick={handleScrape}
              disabled={isScraping}
              className="w-full py-5 bg-zinc-100 text-black text-[12px] font-black uppercase tracking-[0.2em] rounded-sm hover:bg-white transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-xl"
            >
              {isScraping ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Sparkles className="w-5 h-5" /> 데이터 가져오기</>}
            </button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal isOpen={!!selectedVideo} onClose={() => { setSelectedVideo(null); setEditingVideo(null); }} title="수정" maxWidth="max-w-6xl">
        {editingVideo && (
          <div className="flex h-[750px] -m-8 overflow-hidden">
            {/* Left Sidebar: List of selected videos */}
            <div className="w-80 bg-[#1a1a1a] border-r border-white/5 flex flex-col">
              <div className="overflow-y-auto custom-scrollbar flex-1">
                {(selectedVideoIds.size > 0 ? Array.from(selectedVideoIds) : [editingVideo.id]).map((vidId, idx) => {
                  const v = videos.find(video => video.id === vidId);
                  if (!v) return null;
                  return (
                     <div 
                       key={vidId}
                       onClick={() => handleVideoSelect(v)}
                       className={`flex items-center gap-3 p-3 cursor-pointer border-b border-white/5 transition-colors ${editingVideo.id === vidId ? 'bg-red-900/30 ring-1 ring-inset ring-red-500/50' : 'hover:bg-white/5'}`}
                     >
                       <span className="text-[10px] font-black text-zinc-600 w-4">{idx + 1}</span>
                       <div className="w-14 h-10 bg-black shrink-0 overflow-hidden rounded-sm border border-white/10">
                          {v.posterUrl && <img src={v.posterUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                       </div>
                       <span className="text-[10px] font-bold text-zinc-300 truncate leading-tight">{v.title}</span>
                     </div>
                  );
                })}
              </div>
            </div>

            {/* Right Content: Tabs and Details */}
            <div className="flex-1 flex flex-col bg-[#222222]">
              {/* Tabs */}
              <div className="flex bg-[#121212] border-b border-white/5">
                 {['info', 'actors', 'tags'].map(tabId => (
                   <button 
                     key={tabId} 
                     onClick={() => setDetailTab(tabId as any)}
                     className={`px-8 py-3 text-[11px] font-black uppercase tracking-widest transition-all ${detailTab === tabId ? 'bg-red-700 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}
                   >
                     {tabId === 'info' ? '기본정보' : tabId === 'actors' ? '배우' : '태그'}
                   </button>
                 ))}
              </div>

              <div className="p-8 flex-1 overflow-y-auto custom-scrollbar">
                {detailTab === 'info' && (
                 <div className="space-y-6">
                   <div className="space-y-3">
                     <div className="grid grid-cols-[100px_1fr_80px] gap-2 items-center">
                       <span className="text-[11px] font-black text-zinc-500 uppercase tracking-tighter">파 일</span>
                       <div className="bg-[#121212] border border-white/10 p-2 text-[11px] font-mono text-zinc-400 whitespace-nowrap overflow-hidden text-ellipsis h-9 flex items-center">
                         {editingVideo.filePath || 'H:\\Archive\\' + editingVideo.code + '.mp4'}
                       </div>
                       <button className="bg-zinc-800 text-[10px] font-black uppercase tracking-widest h-9 hover:bg-zinc-700 border border-white/5">변 경</button>
                     </div>
                     <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
                       <span className="text-[11px] font-black text-zinc-500 uppercase tracking-tighter">제 목</span>
                       <div className="flex items-center gap-4">
                         <input 
                           value={editingVideo.title} 
                           onChange={(e) => setEditingVideo({...editingVideo, title: e.target.value})}
                           className="flex-1 bg-[#121212] border border-white/10 p-2 text-[11px] text-zinc-200 outline-none focus:border-blue-500 h-9"
                         />
                         <StarRating rating={editingVideo.rating || 0} size={14} />
                       </div>
                     </div>
                     <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
                       <span className="text-[11px] font-black text-zinc-500 uppercase tracking-tighter">평 점</span>
                       <div className="flex items-center gap-4">
                         <input 
                           type="range" 
                           min="0" 
                           max="100" 
                           step="5"
                           value={editingVideo.rating || 0} 
                           onChange={(e) => setEditingVideo({...editingVideo, rating: parseInt(e.target.value)})} 
                           className="flex-1 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                         />
                         <span className="text-[11px] font-mono text-zinc-500 w-8">{editingVideo.rating || 0}</span>
                       </div>
                     </div>
                     <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
                       <span className="text-[11px] font-black text-zinc-500 uppercase tracking-tighter">품 번</span>
                       <input 
                         value={editingVideo.code} 
                         onChange={(e) => setEditingVideo({...editingVideo, code: e.target.value})}
                         className="bg-[#121212] border border-white/10 p-2 text-[11px] text-zinc-200 outline-none focus:border-blue-500 h-9"
                       />
                     </div>
                     <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
                       <span className="text-[11px] font-black text-zinc-500 uppercase tracking-tighter">카테고리</span>
                       <select 
                         value={editingVideo.category || ''} 
                         onChange={(e) => setEditingVideo({...editingVideo, category: e.target.value})}
                         className="bg-[#121212] border border-white/10 p-2 text-[11px] text-zinc-200 outline-none focus:border-blue-500 h-9"
                       >
                         <option value="">카테고리 없음</option>
                         {categories.map(cat => (
                           <option key={cat.id} value={cat.name}>{cat.name}</option>
                         ))}
                       </select>
                     </div>
                     <div className="grid grid-cols-[100px_1fr] gap-2">
                       <span className="text-[11px] font-black text-zinc-500 uppercase tracking-tighter pt-2">메 모</span>
                       <textarea 
                         value={editingVideo.memo || ''} 
                         placeholder="-"
                         onChange={(e) => setEditingVideo({...editingVideo, memo: e.target.value})}
                         className="bg-[#121212] border border-white/10 p-3 text-[11px] text-zinc-300 h-32 outline-none focus:border-blue-500 resize-none custom-scrollbar"
                       />
                     </div>
                   </div>

                   <div className="border border-white/10 p-1 bg-[#1a1a1a]">
                     <div className="flex gap-1 p-1 border-b border-white/5 mb-1">
                       <button className="bg-zinc-800 p-2 hover:bg-zinc-700 border border-white/5"><RefreshCcw className="w-3.5 h-3.5 text-zinc-400" /></button>
                       <button className="bg-zinc-800 p-2 hover:bg-zinc-700 border border-white/5"><Plus className="w-3.5 h-3.5 text-zinc-400" /></button>
                       <button 
                         onClick={() => (async () => { if (!editingVideo) return; setIsScraping(true); await generateThumbnails(editingVideo); setIsScraping(false); })()} 
                         disabled={isScraping}
                         className="bg-zinc-800 px-4 py-2 text-[10px] font-black uppercase text-zinc-300 hover:bg-zinc-700 border border-white/5 disabled:opacity-50 flex items-center gap-2"
                       >
                         {isScraping ? <Loader2 className="w-3 h-3 animate-spin" /> : '자동 썸네일 이미지 만들기'}
                       </button>
                       <button 
                         onClick={() => setManualThumbVideo(editingVideo)} 
                         disabled={isScraping}
                         className="bg-zinc-800 px-4 py-2 text-[10px] font-black uppercase text-zinc-300 hover:bg-zinc-700 border border-white/5 disabled:opacity-50"
                       >
                         수동 썸네일 이미지 만들기
                       </button>
                     </div>
                     <div className="p-4 flex flex-col gap-3 relative min-h-[200px]">
                       <span className="absolute -top-3.5 left-2 bg-[#222222] px-2 text-[10px] font-black text-zinc-500 uppercase">이미지</span>
                       <div className="space-y-2">
                         {editingVideo.thumbnails?.map((thumb, tIdx) => (
                           <div key={tIdx} className="bg-[#2a2a2a] p-2 border border-white/5 flex gap-4 items-center group">
                             <div className="w-24 aspect-video bg-black overflow-hidden relative border border-white/10">
                               {tIdx === 0 && <span className="absolute top-0 left-0 bg-yellow-500 text-black text-[8px] font-black px-1.5 z-10">표지</span>}
                               {thumb && <img src={thumb} className="w-full h-full object-cover" />}
                             </div>
                             <div className="flex-1">
                                <span className="text-[10px] font-bold text-zinc-500 uppercase">썸네일 설정 이미지</span>
                             </div>
                             <div className="flex gap-1 h-8">
                               <button 
                                 onClick={() => setEditingVideo({...editingVideo!, posterUrl: thumb})}
                                 className={`px-4 text-[10px] font-bold border border-white/10 transition-colors ${editingVideo.posterUrl === thumb ? 'bg-blue-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'}`}
                               >{editingVideo.posterUrl === thumb ? '메인' : '수정'}</button>
                               <button 
                                 onClick={() => {
                                   const newThumbs = editingVideo!.thumbnails?.filter((_, idx) => idx !== tIdx);
                                   setEditingVideo({...editingVideo!, thumbnails: newThumbs});
                                 }}
                                 className="bg-zinc-800 px-4 text-[10px] font-bold border border-white/10 hover:bg-zinc-700 text-zinc-300"
                               >삭제</button>
                             </div>
                           </div>
                         ))}
                         {(!editingVideo.thumbnails || editingVideo.thumbnails.length === 0) && (
                           <div className="flex flex-col items-center justify-center py-10 gap-3 text-zinc-700">
                             <HardDrive className="w-10 h-10 opacity-10" />
                             <span className="text-[10px] font-black uppercase tracking-widest">라이브 썸네일 없음</span>
                           </div>
                         )}
                       </div>
                     </div>
                   </div>
                 </div>
                )}

                {detailTab === 'actors' && (
                  <div className="flex flex-col gap-4">
                    <div className="bg-[#121212] p-4 border border-white/5 space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">출연 배우</span>
                        <button 
                          onClick={() => {
                            const newName = prompt("추가할 배우 이름을 입력하세요:");
                            if (!newName || !newName.trim()) return;
                            const trimmed = newName.trim();
                            const allActors = [...actors, ...extraActors];
                            if (allActors.includes(trimmed)) {
                              alert("이미 존재하는 배우입니다.");
                              if (editingVideo && !editingVideo.actors?.includes(trimmed)) {
                                setEditingVideo({ ...editingVideo, actors: [...(editingVideo.actors || []), trimmed] });
                              }
                              return;
                            }
                            setExtraActors(prev => [...prev, trimmed]);
                            if (editingVideo) {
                              const current = editingVideo.actors || [];
                              setEditingVideo({ ...editingVideo, actors: [...current, trimmed] });
                            }
                          }}
                          className="bg-blue-600 px-4 py-1.5 text-[10px] font-black text-white hover:bg-blue-500 transition-colors uppercase tracking-widest"
                        >배우 추가</button>
                      </div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                        <input 
                          type="text"
                          value={actorSearchEdit}
                          onChange={(e) => setActorSearchEdit(e.target.value)}
                          placeholder="배우 검색 (공백 시 전체 표시)..."
                          className="w-full bg-black/40 border border-white/10 rounded-sm py-2 pl-10 pr-4 text-[11px] text-white outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 px-1 max-h-[400px] overflow-y-auto custom-scrollbar">
                      {Array.from(new Set([...actors, ...extraActors]))
                        .filter(a => !actorSearchEdit || a.toLowerCase().includes(actorSearchEdit.toLowerCase()))
                        .sort((a, b) => a.localeCompare(b))
                        .map(actor => {
                          const isSelected = editingVideo.actors?.includes(actor);
                          const isEditing = inlineEditingActor?.originalName === actor;
                          
                          return (
                            <div key={actor} className={`group flex items-center gap-2 p-2 border transition-colors ${isSelected ? 'bg-blue-600/10 border-blue-500/20' : 'bg-[#121212] border-white/5 hover:border-white/10'}`}>
                              <input 
                                type="checkbox"
                                checked={!!isSelected}
                                onChange={() => {
                                  if (!editingVideo) return;
                                  const current = editingVideo.actors || [];
                                  if (isSelected) {
                                    setEditingVideo({ ...editingVideo, actors: current.filter(a => a !== actor) });
                                  } else {
                                    setEditingVideo({ ...editingVideo, actors: [...current, actor] });
                                  }
                                }}
                                className="w-3.5 h-3.5 border-zinc-700 bg-zinc-900 rounded-sm text-blue-600 focus:ring-0 focus:ring-offset-0"
                              />
                              
                              <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
                                {isEditing ? (
                                  <input 
                                    autoFocus
                                    value={inlineEditingActor.currentName}
                                    onChange={(e) => setInlineEditingActor({ ...inlineEditingActor, currentName: e.target.value })}
                                    onBlur={() => {
                                      const oldName = inlineEditingActor.originalName;
                                      const newName = inlineEditingActor.currentName.trim() || oldName;
                                      
                                      if (oldName !== newName) {
                                        // Check for duplication
                                        const allActors = [...actors, ...extraActors];
                                        if (allActors.includes(newName)) {
                                          alert("이미 존재하는 이름입니다. 기존의 배우를 선택해 주세요.");
                                          setInlineEditingActor(null);
                                          return;
                                        }

                                        // Update in editingVideo
                                        if (editingVideo && editingVideo.actors?.includes(oldName)) {
                                          setEditingVideo({
                                            ...editingVideo,
                                            actors: editingVideo.actors.map(a => a === oldName ? newName : a)
                                          });
                                        }
                                        // Update in extraActors
                                        setExtraActors(prev => prev.map(a => a === oldName ? newName : a));
                                      }
                                      setInlineEditingActor(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') e.currentTarget.blur();
                                      if (e.key === 'Escape') setInlineEditingActor(null);
                                    }}
                                    className="bg-zinc-800 border-none outline-none text-[11px] text-white px-1 w-full rounded-sm"
                                  />
                                ) : (
                                  <span className={`text-[11px] font-bold truncate ${isSelected ? 'text-blue-400' : 'text-zinc-400'}`}>{actor}</span>
                                )}
                              </div>

                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                {!isEditing && (
                                  <>
                                    <button 
                                      onClick={() => setInlineEditingActor({ originalName: actor, currentName: actor })}
                                      className="p-1 hover:text-blue-400 text-zinc-600"
                                    >
                                      <Settings className="w-3 h-3" />
                                    </button>
                                    <button 
                                      onClick={() => {
                                        if (!editingVideo) return;
                                        setEditingVideo({ 
                                          ...editingVideo, 
                                          actors: (editingVideo.actors || []).filter(a => a !== actor) 
                                        });
                                        // Also remove from extraActors if it was there
                                        setExtraActors(prev => prev.filter(a => a !== actor));
                                      }}
                                      className="p-1 hover:text-red-400 text-zinc-600"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {detailTab === 'tags' && (
                  <div className="flex flex-col gap-4">
                    <div className="bg-[#121212] p-4 border border-white/5 space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">장르 / 태그</span>
                        <button 
                          onClick={() => {
                            const newName = prompt("추가할 태그 이름을 입력하세요:");
                            if (!newName || !newName.trim()) return;
                            const trimmed = newName.trim();
                            const allTags = [...tags, ...extraTags];
                            if (allTags.includes(trimmed)) {
                              alert("이미 존재하는 태그입니다.");
                              if (editingVideo && !editingVideo.tags?.includes(trimmed)) {
                                setEditingVideo({ ...editingVideo, tags: [...(editingVideo.tags || []), trimmed] });
                              }
                              return;
                            }
                            setExtraTags(prev => [...prev, trimmed]);
                            if (editingVideo) {
                              const current = editingVideo.tags || [];
                              setEditingVideo({ ...editingVideo, tags: [...current, trimmed] });
                            }
                          }}
                          className="bg-blue-600 px-4 py-1.5 text-[10px] font-black text-white hover:bg-blue-500 transition-colors uppercase tracking-widest"
                        >태그 추가</button>
                      </div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                        <input 
                          type="text"
                          value={tagSearchEdit}
                          onChange={(e) => setTagSearchEdit(e.target.value)}
                          placeholder="태그 검색 (공백 시 전체 표시)..."
                          className="w-full bg-black/40 border border-white/10 rounded-sm py-2 pl-10 pr-4 text-[11px] text-white outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-1 max-h-[400px] overflow-y-auto custom-scrollbar">
                      {Array.from(new Set([...tags, ...extraTags]))
                        .filter(t => !tagSearchEdit || t.toLowerCase().includes(tagSearchEdit.toLowerCase()))
                        .sort((a, b) => a.localeCompare(b))
                        .map(tag => {
                          const isSelected = editingVideo.tags?.includes(tag);
                          const isEditing = inlineEditingTag?.originalName === tag;
                          
                          return (
                            <div key={tag} className={`group flex items-center gap-2 p-2 border transition-colors ${isSelected ? 'bg-blue-600/10 border-blue-500/20' : 'bg-[#121212] border-white/5 hover:border-white/10'}`}>
                              <input 
                                type="checkbox"
                                checked={!!isSelected}
                                onChange={() => {
                                  if (!editingVideo) return;
                                  const current = editingVideo.tags || [];
                                  if (isSelected) {
                                    setEditingVideo({ ...editingVideo, tags: current.filter(t => t !== tag) });
                                  } else {
                                    setEditingVideo({ ...editingVideo, tags: [...current, tag] });
                                  }
                                }}
                                className="w-3.5 h-3.5 border-zinc-700 bg-zinc-900 rounded-sm text-blue-600 focus:ring-0 focus:ring-offset-0"
                              />
                              
                              <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
                                {isEditing ? (
                                  <input 
                                    autoFocus
                                    value={inlineEditingTag.currentName}
                                    onChange={(e) => setInlineEditingTag({ ...inlineEditingTag, currentName: e.target.value })}
                                    onBlur={() => {
                                      const oldName = inlineEditingTag.originalName;
                                      const newName = inlineEditingTag.currentName.trim() || oldName;
                                      if (oldName !== newName) {
                                        if (editingVideo && editingVideo.tags?.includes(oldName)) {
                                          setEditingVideo({
                                            ...editingVideo,
                                            tags: editingVideo.tags.map(t => t === oldName ? newName : t)
                                          });
                                        }
                                        setExtraTags(prev => prev.map(t => t === oldName ? newName : t));
                                      }
                                      setInlineEditingTag(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') e.currentTarget.blur();
                                      if (e.key === 'Escape') setInlineEditingTag(null);
                                    }}
                                    className="bg-zinc-800 border-none outline-none text-[11px] text-white px-1 w-full rounded-sm"
                                  />
                                ) : (
                                  <span className={`text-[11px] font-bold truncate ${isSelected ? 'text-blue-400' : 'text-zinc-400'}`}>{tag}</span>
                                )}
                              </div>

                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                {!isEditing && (
                                  <>
                                    <button 
                                      onClick={() => setInlineEditingTag({ originalName: tag, currentName: tag })}
                                      className="p-1 hover:text-blue-400 text-zinc-600"
                                    >
                                      <Settings className="w-3 h-3" />
                                    </button>
                                    <button 
                                      onClick={() => {
                                        if (!editingVideo) return;
                                        setEditingVideo({ 
                                          ...editingVideo, 
                                          tags: (editingVideo.tags || []).filter(t => t !== tag) 
                                        });
                                        setExtraTags(prev => prev.filter(t => t !== tag));
                                      }}
                                      className="p-1 hover:text-red-400 text-zinc-600"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer actions */}
              <div className="p-4 py-3 bg-[#121212] border-t border-white/5 flex justify-end items-center gap-4">
                {saveSuccess && (
                  <motion.span 
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-[10px] font-black text-green-500 uppercase tracking-widest"
                  >
                    데이터가 성공적으로 저장되었습니다
                  </motion.span>
                )}
                <div className="flex gap-2">
                  <button 
                    disabled={isSaving}
                    onClick={async () => {
                      await handleSaveVideo();
                    }} 
                    className="px-10 py-2.5 bg-zinc-100 text-black text-[11px] font-black uppercase tracking-widest hover:bg-white shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : '저 장'}
                  </button>
                  <button onClick={() => { setSelectedVideo(null); setEditingVideo(null); }} className="px-10 py-2.5 bg-zinc-800 text-zinc-400 text-[11px] font-black uppercase tracking-widest hover:bg-zinc-700 border border-white/5 transition-all">닫 기</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Duplicate Modal */}
      <Modal isOpen={showDuplicateModal} onClose={() => setShowDuplicateModal(false)} title="중복 파일 검사 결과" maxWidth="max-w-4xl">
        <div className="space-y-6 max-h-[600px] overflow-y-auto custom-scrollbar pr-4">
          <div className="bg-amber-600/10 border border-amber-600/20 p-4 rounded-sm flex items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                 <p className="text-xs font-bold text-amber-200">중복된 품번과 제목, 용량을 가진 {duplicateGroups.length}개의 그룹이 발견되었습니다.</p>
                 <p className="text-[10px] text-amber-200/50 mt-1">리스트에서 제외하고 싶은 항목을 삭제하거나 하단 버튼으로 일괄 정리할 수 있습니다.</p>
              </div>
            </div>
            <button 
              onClick={handleBulkDeleteDuplicates}
              className="bg-red-600 hover:bg-red-500 text-white text-[10px] font-black px-4 py-2 rounded-sm transition-colors uppercase tracking-widest flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" /> 중복 일괄 삭제
            </button>
          </div>
          
          <div className="space-y-8">
            {duplicateGroups.map((group, gIdx) => (
              <div key={gIdx} className="space-y-3">
                 <div className="flex items-center gap-3">
                    <div className="h-[1px] flex-1 bg-white/10" />
                    <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">그룹 {gIdx + 1}: {group[0].code}</span>
                    <div className="h-[1px] flex-1 bg-white/10" />
                 </div>
                 <div className="grid grid-cols-1 gap-2">
                    {group.map(v => (
                      <div key={v.id} className="bg-[#121212] p-3 border border-white/5 flex items-center justify-between group/item">
                         <div className="flex items-center gap-4">
                            <div className="w-12 h-8 bg-zinc-900 border border-white/10 overflow-hidden shrink-0">
                               {v.posterUrl && <img src={v.posterUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                            </div>
                            <div>
                               <div className="text-[11px] font-bold text-zinc-300">{v.title}</div>
                               <div className="text-[9px] text-zinc-600 font-mono">
                                 {v.filePath || 'No Path'} | {(v.size ? (v.size / (1024 * 1024)).toFixed(1) : 0)} MB
                               </div>
                            </div>
                         </div>
                         <button 
                           onClick={async () => {
                             if (confirm('이 중복 항목을 삭제하시겠습니까?')) {
                               await deleteVideo(v.id!);
                               setDuplicateGroups(prev => prev.map(g => g.filter(item => item.id !== v.id)).filter(g => g.length > 1));
                             }
                           }}
                           className="p-2 text-zinc-600 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all"
                         >
                            <Trash2 className="w-4 h-4" />
                         </button>
                      </div>
                    ))}
                 </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Video Player Modal */}
      <Modal 
        isOpen={!!playingVideo} 
        onClose={() => setPlayingVideo(null)} 
        title="동영상 플레이어 (드래그하여 이동 가능)"
        maxWidth="max-w-6xl"
        isResizable={true}
      >

        {playingVideo && (
          <VideoPlayer 
            key={playingVideo.id}
            video={playingVideo} 
            onClose={() => setPlayingVideo(null)} 
            cachedFile={getCachedFile(playingVideo)}
            onLoadError={handleVideoLoadError}
            onFileSelect={(file) => {
              if (playingVideo.id) {
                setLocalFileCache(prev => {
                  const next = new Map(prev);
                  next.set(playingVideo.id, file);
                  return next;
                });
                setCacheVersion(v => v + 1);
              }
            }}
          />
        )}
      </Modal>


      {/* Manual Thumbnail Creator Modal */}
      <Modal isOpen={!!manualThumbVideo} onClose={() => setManualThumbVideo(null)} title="썸네일 제작" maxWidth="max-w-5xl">
        {manualThumbVideo && (
          <div className="space-y-6">
            <div className="bg-black aspect-video border border-white/10 relative overflow-hidden group">
              {manualVideoUrl ? (
                <>
                  <video 
                    ref={manualVideoRef}
                    key={manualVideoUrl}
                    src={manualVideoUrl}
                    className="w-full h-full cursor-pointer"
                    muted
                    playsInline
                    controls={false}
                    onPlay={() => setIsManualVideoPlaying(true)}
                    onPause={() => setIsManualVideoPlaying(false)}
                    onClick={() => {
                      if (manualVideoRef.current) {
                        if (manualVideoRef.current.paused) manualVideoRef.current.play();
                        else manualVideoRef.current.pause();
                      }
                    }}
                    onTimeUpdate={(e) => setManualTime(e.currentTarget.currentTime)}
                    onLoadedMetadata={(e) => {
                      setDuration(e.currentTarget.duration);
                    }}
                    onEnded={() => {
                      if (manualVideoRef.current) manualVideoRef.current.currentTime = 0;
                    }}
                    onError={(e) => {
                      const v = manualVideoRef.current;
                      const errorCode = v?.error?.code;
                      const errorMsg = v?.error?.message;
                      console.error("Manual thumbnail video load error:", e.type, "Code:", errorCode, "Msg:", errorMsg);
                      setManualLoadError("동영상을 불러오는데 실패했습니다. 파일 형식이 지원되지 않거나 접근 권한이 없을 수 있습니다.");
                    }}
                  />
                  
                  {/* Play/Pause Center Indicator */}
                  <AnimatePresence>
                    {!isManualVideoPlaying && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.5 }}
                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      >
                        <div className="bg-black/60 backdrop-blur-md p-6 rounded-full border border-white/20">
                          <Pause className="w-12 h-12 text-white fill-white" />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Custom Seek Controls */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 flex flex-col gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-4 text-white text-[10px] font-black uppercase tracking-widest">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => { if(manualVideoRef.current) manualVideoRef.current.currentTime -= 5 }}
                          className="hover:text-blue-400 transition-colors"
                        >
                          -5s
                        </button>
                        <button 
                          onClick={() => { if(manualVideoRef.current) manualVideoRef.current.currentTime -= 1 }}
                          className="hover:text-blue-400 transition-colors"
                        >
                          -1s
                        </button>
                        <button 
                          onClick={() => { if(manualVideoRef.current) manualVideoRef.current.currentTime -= 0.5 }}
                          className="hover:text-blue-400 transition-colors"
                        >
                          -0.5s
                        </button>
                      </div>

                      <button 
                        onClick={() => {
                          if (manualVideoRef.current) {
                            if (manualVideoRef.current.paused) manualVideoRef.current.play();
                            else manualVideoRef.current.pause();
                          }
                        }}
                        className="bg-white text-black px-4 py-1 rounded-sm hover:bg-blue-400 hover:text-white transition-all flex items-center gap-2"
                      >
                        {isManualVideoPlaying ? (
                          <><Pause className="w-3 h-3 fill-current" /> PAUSE</>
                        ) : (
                          <><Play className="w-3 h-3 fill-current" /> PLAY</>
                        )}
                      </button>

                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => { if(manualVideoRef.current) manualVideoRef.current.currentTime += 0.5 }}
                          className="hover:text-blue-400 transition-colors"
                        >
                          +0.5s
                        </button>
                        <button 
                          onClick={() => { if(manualVideoRef.current) manualVideoRef.current.currentTime += 1 }}
                          className="hover:text-blue-400 transition-colors"
                        >
                          +1s
                        </button>
                        <button 
                          onClick={() => { if(manualVideoRef.current) manualVideoRef.current.currentTime += 5 }}
                          className="hover:text-blue-400 transition-colors"
                        >
                          +5s
                        </button>
                      </div>

                      <div className="ml-auto font-mono text-xs">
                        {Math.floor(manualTime / 60)}:{Math.floor(manualTime % 60).toString().padStart(2, '0')} / {Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}
                      </div>
                    </div>

                    <input 
                      type="range" 
                      min={0} 
                      max={duration || 100} 
                      step={0.01} 
                      value={manualTime}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setManualTime(val);
                        if (manualVideoRef.current) manualVideoRef.current.currentTime = val;
                      }}
                      className="w-full accent-blue-600 h-1 rounded-full cursor-pointer appearance-none bg-white/20"
                    />
                  </div>

                  {manualLoadError && (
                    <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center text-center p-6 gap-4 z-20">
                      <AlertTriangle className="w-10 h-10 text-red-500" />
                      <div className="space-y-1">
                        <p className="text-white font-bold text-sm tracking-tight">{manualLoadError}</p>
                        <p className="text-zinc-500 text-[10px]">로컬 파일을 다시 연결해 주세요.</p>
                      </div>
                      <button 
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'video/*';
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file && manualThumbVideo?.id) {
                              setLocalFileCache(prev => {
                                const next = new Map(prev);
                                next.set(manualThumbVideo.id, file);
                                return next;
                              });
                              setCacheVersion(v => v + 1);
                              setManualLoadError(null);
                            }
                          };
                          input.click();
                        }}
                        className="mt-2 bg-zinc-800 text-white px-6 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest hover:bg-zinc-700 transition-colors"
                      >
                        파일 연결하기
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-xs">
                  연결된 동영상 파일이 없습니다.
                </div>
              )}
              {/* Playback Controls Overlay visibility */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                 <button 
                   onClick={async () => {
                     if (manualVideoRef.current) {
                       try {
                         if (manualVideoRef.current.paused) {
                           await manualVideoRef.current.play();
                         } else {
                           manualVideoRef.current.pause();
                         }
                       } catch (err) {
                         console.log("Playback interruption handled:", err);
                       }
                     }
                   }}
                   className="p-4 bg-black/40 rounded-full border border-white/10 hover:scale-110 transition-transform"
                 >
                    <Play className="w-8 h-8 text-white fill-current" />
                 </button>
              </div>
            </div>
            
            <div className="flex bg-[#1a1a1a] p-4 text-center border border-white/5 items-center justify-between rounded-sm">
              <div className="flex flex-col items-start gap-1">
                <span className="text-[11px] font-black uppercase tracking-widest text-zinc-400">썸네일 컬렉션</span>
                <span className="text-[9px] font-bold text-zinc-600">현재까지 제작된 이미지 (최대 10개)</span>
              </div>
              <div className="flex items-center gap-2">
                 <input type="checkbox" id="live-thumb" className="accent-blue-500 w-3 h-3" />
                 <label htmlFor="live-thumb" className="text-[10px] font-bold text-zinc-500">라이브 썸네일로 사용</label>
              </div>
            </div>

            <div className="h-32 bg-black border border-white/5 p-4 flex items-center gap-4 overflow-x-auto custom-scrollbar rounded-sm shadow-inner">
               {manualThumbVideo.thumbnails?.map((thumb, idx) => (
                 <div key={idx} className="w-24 aspect-video bg-zinc-900 border border-white/10 overflow-hidden shrink-0 group relative">
                   {thumb && <img src={thumb} className="w-full h-full object-cover" />}
                   <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                     <button 
                       onClick={() => {
                         const newThumbs = manualThumbVideo.thumbnails?.filter((_, i) => i !== idx);
                         updateVideo(manualThumbVideo.id, { thumbnails: newThumbs });
                         setManualThumbVideo({ ...manualThumbVideo, thumbnails: newThumbs });
                         if (selectedVideo?.id === manualThumbVideo.id) {
                           setSelectedVideo({ ...selectedVideo, thumbnails: newThumbs });
                         }
                       }}
                       className="p-1 hover:text-red-500"
                     >
                       <X className="w-4 h-4" />
                     </button>
                   </div>
                 </div>
               ))}
               {Array.from({ length: Math.max(0, 6 - (manualThumbVideo.thumbnails?.length || 0)) }).map((_, i) => (
                 <div key={`empty-${i}`} className="w-24 aspect-video bg-zinc-900/50 border border-white/5 border-dashed flex items-center justify-center text-[9px] font-black text-zinc-800 shrink-0">
                   EMPTY
                 </div>
               ))}
            </div>

            <div className="flex justify-between items-center bg-[#0a0a0a] p-6 -m-8 mt-4 border-t border-white/5">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Manual Thumbnail Creator</span>
                <span className="text-[9px] text-zinc-700 italic">이미지 생성은 동영상의 현재 프레임을 캡처합니다.</span>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setManualThumbVideo(null)}
                  className="px-10 py-4 bg-zinc-900 text-zinc-400 text-[11px] font-black uppercase tracking-widest hover:bg-zinc-800 border border-white/5 transition-all"
                >닫기</button>
                <button 
                  onClick={handleCreateManualThumb}
                  className="px-16 py-4 bg-blue-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-blue-500 transition-all shadow-2xl shadow-blue-600/30 active:scale-95"
                >현재 화면으로 만들기</button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Category Management Modal */}
      <Modal isOpen={showCategoryManage} onClose={() => setShowCategoryManage(false)} title="카테고리 리스트 관리" maxWidth="max-w-2xl">
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-[#121212] p-4 border border-white/5">
            <span className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">전체 카테고리 ({categories.length})</span>
            <button 
              onClick={handleAddCategory}
              className="bg-blue-600 px-4 py-1.5 text-[10px] font-black text-white hover:bg-blue-500 transition-colors uppercase tracking-widest"
            >
              카테고리 추가
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {categories.map(cat => (
              <div key={cat.id} className="bg-[#121212] p-4 flex items-center justify-between border border-white/5 group">
                <div className="flex items-center gap-4 flex-1">
                  <FolderOpen className="w-4 h-4 text-zinc-500 shrink-0" />
                  {editingCatId === cat.id ? (
                    <input 
                      autoFocus
                      value={editingCatName}
                      onChange={(e) => setEditingCatName(e.target.value)}
                      onBlur={handleSaveCategoryEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveCategoryEdit();
                        if (e.key === 'Escape') handleCancelCategoryEdit();
                      }}
                      className="bg-black/40 border border-blue-500/50 rounded-sm px-2 py-1 text-sm text-white outline-none w-full"
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-zinc-300">{cat.name}</span>
                      <span className="text-[10px] text-zinc-600 font-bold">
                        {videos.filter(v => v.category === cat.name).length} Videos
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => {
                      setEditingCatId(cat.id);
                      setEditingCatName(cat.name);
                    }}
                    className="p-2 text-zinc-600 hover:text-blue-500 transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="p-2 text-zinc-600 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <Modal 
        isOpen={showActorManage} 
        onClose={() => {
          setShowActorManage(false);
          setSelectedManageActors(new Set());
        }} 
        title="배우 리스트 관리" 
        maxWidth="max-w-4xl"
      >
        <div className="flex flex-col h-[600px] -m-8">
          <div className="p-6 bg-[#121212] space-y-4 border-b border-white/5">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input 
                  value={actorSearch}
                  onChange={(e) => setActorSearch(e.target.value)}
                  placeholder="배우 검색 / 추가"
                  className="w-full bg-black/40 border border-white/10 rounded-sm py-2 pl-10 pr-4 text-xs text-white outline-none focus:border-blue-500"
                />
              </div>
              <button 
                onClick={async () => {
                  let actorName = actorSearch.trim();
                  if (!actorName) {
                    const name = prompt('추가할 배우 이름을 입력하세요:');
                    if (!name || !name.trim()) return;
                    actorName = name.trim();
                  }

                  const allActors = actors; // actors memo already has current actors
                  if (allActors.includes(actorName)) {
                    alert(`${actorName} 은(는) 이미 존재하는 배우입니다.`);
                    return;
                  }

                  if (selectedVideoIds.size === 0) {
                    setExtraActors(prev => Array.from(new Set([...prev, actorName])));
                    setActorSearch(''); // Clear search on add
                    alert(`'${actorName}' 배우가 목록에 추가되었습니다.`);
                    return;
                  }

                  setIsScraping(true);
                  abortScrapingRef.current = false;
                  try {
                    for (const id of selectedVideoIds) {
                      if (abortScrapingRef.current) break;
                      const v = videos.find(vid => vid.id === id);
                      if (v) {
                        const current = v.actors || [];
                        if (current.includes(actorName)) continue;
                        const newActors = [...current, actorName];
                        await updateVideo(id, { actors: newActors });
                      }
                    }
                    setActorSearch(''); // Clear search on add
                    alert('선택한 영상들에 배우가 추가되었습니다.');
                  } catch (err) { alert('추가 중 오류가 발생했습니다.'); }
                  finally { setIsScraping(false); }
                }}
                className="bg-blue-600 px-6 text-[11px] font-black uppercase text-white border border-blue-500 hover:bg-blue-500 transition-colors"
              >추가</button>
              <button 
                onClick={async () => {
                  if (selectedManageActors.size !== 1) {
                    alert('변경할 배우를 하나만 선택하세요.');
                    return;
                  }
                  const oldName = Array.from(selectedManageActors)[0] as string;
                  const newName = prompt(`'${oldName}' 배우를 변경할 이름을 입력하세요:`, oldName);
                  if (!newName || newName.trim() === oldName) return;
                  const finalName = newName.trim();
                  
                  setIsScraping(true);
                  abortScrapingRef.current = false;
                  try {
                    const vids = videos.filter(v => v.actors?.includes(oldName));
                    for (const v of vids) {
                      if (abortScrapingRef.current) break;
                      await updateVideo(v.id!, { actors: (v.actors || []).map(a => a === oldName ? finalName : a) });
                    }
                    setExtraActors(prev => prev.map(a => a === oldName ? finalName : a));
                    setSelectedManageActors(new Set());
                    alert('변경이 완료되었습니다.');
                  } catch (err) { alert('변경 중 오류가 발생했습니다.'); }
                  finally { setIsScraping(false); }
                }}
                className="bg-zinc-800 px-6 text-[11px] font-black uppercase text-zinc-300 border border-white/10 hover:bg-zinc-700"
              >변경</button>
              <button 
                onClick={async () => {
                  if (selectedManageActors.size === 0) {
                    alert('삭제할 배우를 하나 이상 선택하세요.');
                    return;
                  }
                  if (!confirm(`선택한 ${selectedManageActors.size}명의 배우를 모든 영상에서 삭제하시겠습니까?`)) return;
                  setIsScraping(true);
                  abortScrapingRef.current = false;
                  try {
                    for (const actor of selectedManageActors) {
                      if (abortScrapingRef.current) break;
                      const vids = videos.filter(v => v.actors?.includes(actor));
                      for (const v of vids) {
                        if (abortScrapingRef.current) break;
                        await updateVideo(v.id!, { actors: (v.actors || []).filter(a => a !== actor) });
                      }
                    }
                    setExtraActors(prev => prev.filter(a => !selectedManageActors.has(a)));
                    setSelectedManageActors(new Set());
                    alert('삭제가 완료되었습니다.');
                  } catch (err) { alert('삭제 중 오류가 발생했습니다.'); }
                  finally { setIsScraping(false); }
                }}
                className="bg-zinc-800 px-6 text-[11px] font-black uppercase text-red-500 border border-white/10 hover:bg-red-900/20"
              >삭제</button>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="select-all-actors" 
                className="accent-blue-500" 
                checked={selectedManageActors.size === actors.length && actors.length > 0}
                onChange={(e) => {
                  if (e.target.checked) setSelectedManageActors(new Set(actors));
                  else setSelectedManageActors(new Set());
                }}
              />
              <label htmlFor="select-all-actors" className="text-[11px] font-black text-zinc-500 uppercase tracking-widest cursor-pointer">전체 선택/해제</label>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
               {actors.filter(a => a.toLowerCase().includes(actorSearch.toLowerCase())).map(actor => (
                 <div 
                   key={actor} 
                   onClick={() => {
                     setSelectedManageActors(prev => {
                       const next = new Set(prev);
                       if (next.has(actor)) next.delete(actor);
                       else next.add(actor);
                       return next;
                     });
                   }}
                   className={`flex items-center gap-2 p-2 border transition-all cursor-pointer ${selectedManageActors.has(actor) ? 'bg-blue-600 border-blue-400 text-white' : 'bg-black/20 border-white/5 text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}
                 >
                    <div className={`w-3 h-3 border flex items-center justify-center rounded-sm ${selectedManageActors.has(actor) ? 'bg-white border-white' : 'border-zinc-700'}`}>
                       {selectedManageActors.has(actor) && <div className="w-1.5 h-1.5 bg-blue-600 rounded-sm" />}
                    </div>
                    <span className="text-[10px] font-bold truncate">{actor}</span>
                 </div>
               ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Tag Management Modal */}
      <Modal 
        isOpen={showTagManage} 
        onClose={() => {
          setShowTagManage(false);
          setSelectedManageTags(new Set());
        }} 
        title="태그 리스트 관리" 
        maxWidth="max-w-4xl"
      >
        <div className="flex flex-col h-[600px] -m-8">
          <div className="p-6 bg-[#121212] space-y-4 border-b border-white/5">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input 
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  placeholder="태그 검색 / 추가"
                  className="w-full bg-black/40 border border-white/10 rounded-sm py-2 pl-10 pr-4 text-xs text-white outline-none focus:border-blue-500"
                />
              </div>
              <button 
                onClick={async () => {
                  let tagName = tagSearch.trim();
                  if (!tagName) {
                    const name = prompt('추가할 태그 이름을 입력하세요:');
                    if (!name || !name.trim()) return;
                    tagName = name.trim();
                  }

                  const allTags = tags; // tags memo already has current tags
                  if (allTags.includes(tagName)) {
                    alert(`${tagName} 은(는) 이미 존재하는 태그입니다.`);
                    return;
                  }

                  if (selectedVideoIds.size === 0) {
                    setExtraTags(prev => Array.from(new Set([...prev, tagName])));
                    setTagSearch(''); // Clear search on add
                    alert(`'${tagName}' 태그가 목록에 추가되었습니다.`);
                    return;
                  }

                  setIsScraping(true);
                  abortScrapingRef.current = false;
                  try {
                    for (const id of selectedVideoIds) {
                      if (abortScrapingRef.current) break;
                      const v = videos.find(vid => vid.id === id);
                      if (v) {
                        const current = v.tags || [];
                        if (current.includes(tagName)) continue;
                        const newTags = [...current, tagName];
                        await updateVideo(id, { tags: newTags });
                      }
                    }
                    setTagSearch(''); // Clear search on add
                    alert('선택한 영상들에 태그가 추가되었습니다.');
                  } catch (err) { alert('추가 중 오류가 발생했습니다.'); }
                  finally { setIsScraping(false); }
                }} 
                className="bg-blue-600 px-6 text-[11px] font-black uppercase text-white border border-blue-500 hover:bg-blue-500 transition-colors"
              >
                추가
              </button>
              <button 
                onClick={async () => {
                  if (selectedManageTags.size !== 1) {
                    alert('변경할 태그를 하나만 선택하세요.');
                    return;
                  }
                  const oldTag = Array.from(selectedManageTags)[0] as string;
                  const newName = prompt(`'${oldTag}' 태그를 변경할 이름을 입력하세요:`, oldTag);
                  if (!newName || newName === oldTag) return;
                  
                  setIsScraping(true);
                  abortScrapingRef.current = false;
                  try {
                    const vids = videos.filter(v => v.tags?.includes(oldTag));
                    for (const v of vids) {
                      if (abortScrapingRef.current) break;
                      const newTags = Array.from(new Set((v.tags || []).map(t => t === oldTag ? newName : t))) as string[];
                      await updateVideo(v.id!, { tags: newTags });
                    }
                    setExtraTags(prev => prev.map(t => t === oldTag ? newName : t));
                    setSelectedManageTags(new Set());
                    alert('태그 이름이 변경되었습니다.');
                  } catch (err) { alert('변경 중 오류가 발생했습니다.'); }
                  finally { setIsScraping(false); }
                }}
                className="bg-zinc-800 px-6 text-[11px] font-black uppercase text-zinc-300 border border-white/10 hover:bg-zinc-700"
              >변경</button>
              <button 
                onClick={async () => {
                  if (selectedManageTags.size === 0) {
                    alert('삭제할 태그를 하나 이상 선택하세요.');
                    return;
                  }
                  if (!confirm(`선택한 ${selectedManageTags.size}개의 태그를 모든 영상에서 삭제하시겠습니까?`)) return;
                  setIsScraping(true);
                  abortScrapingRef.current = false;
                  try {
                    for (const tag of selectedManageTags) {
                      if (abortScrapingRef.current) break;
                      const vids = videos.filter(v => v.tags?.includes(tag));
                      for (const v of vids) {
                        if (abortScrapingRef.current) break;
                        await updateVideo(v.id!, { tags: (v.tags || []).filter(t => t !== tag) });
                      }
                    }
                    setExtraTags(prev => prev.filter(t => !selectedManageTags.has(t)));
                    setSelectedManageTags(new Set());
                    alert('태그 삭제가 완료되었습니다.');
                  } catch (err) { alert('삭제 중 오류가 발생했습니다.'); }
                  finally { setIsScraping(false); }
                }}
                className="bg-zinc-800 px-6 text-[11px] font-black uppercase text-red-500 border border-white/10 hover:bg-red-900/20"
              >삭제</button>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="select-all-tags" 
                className="accent-blue-500" 
                checked={selectedManageTags.size === tags.length && tags.length > 0}
                onChange={(e) => {
                  if (e.target.checked) setSelectedManageTags(new Set(tags));
                  else setSelectedManageTags(new Set());
                }}
              />
              <label htmlFor="select-all-tags" className="text-[11px] font-black text-zinc-500 uppercase tracking-widest cursor-pointer">전체 선택/해제</label>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
               {tags.filter(t => t.toLowerCase().includes(tagSearch.toLowerCase())).map(tag => (
                 <div 
                   key={tag} 
                   onClick={() => {
                     setSelectedManageTags(prev => {
                       const next = new Set(prev);
                       if (next.has(tag)) next.delete(tag);
                       else next.add(tag);
                       return next;
                     });
                   }}
                   className={`flex items-center gap-2 p-2 border transition-all cursor-pointer ${selectedManageTags.has(tag) ? 'bg-blue-600 border-blue-400 text-white' : 'bg-black/20 border-white/5 text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}
                 >
                    <div className={`w-3 h-3 border flex items-center justify-center rounded-sm ${selectedManageTags.has(tag) ? 'bg-white border-white' : 'border-zinc-700'}`}>
                       {selectedManageTags.has(tag) && <div className="w-1.5 h-1.5 bg-blue-600 rounded-sm" />}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-tighter truncate">{tag}</span>
                 </div>
               ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* API Key Warning Modal */}
      <Modal
        isOpen={showApiKeyWarning}
        onClose={() => setShowApiKeyWarning(false)}
        title="AI API 키 설정 필요"
        maxWidth="max-w-md"
      >
        <div className="space-y-8 py-2">
          <div className="flex items-start gap-4 bg-amber-500/10 border border-amber-600/30 p-5 rounded-md">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
               <AlertTriangle className="w-6 h-6 text-amber-500" />
            </div>
            <div className="space-y-3">
              <p className="text-[13px] font-black text-amber-200 uppercase tracking-wider">
                AI 정보 수집이 제한됨
              </p>
              <p className="text-[11px] text-zinc-300 leading-relaxed font-medium">
                Gemini API 키가 설정되지 않았습니다. AI 기능을 사용하여 정보를 자동으로 스크랩하시겠습니까? <br/>
                <span className="text-zinc-500 font-bold italic mt-2 block">오프라인 모드로 전환하면 수동으로만 추가 가능합니다. (오프라인 모드는 정보를 자동으로 불러오지 못합니다)</span>
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleGoToApiSettings}
              className="flex items-center justify-center gap-2 py-4 bg-zinc-800 hover:bg-zinc-700 text-white font-black text-[10px] uppercase tracking-[0.2em] transition-all border border-white/5 rounded-sm shadow-xl"
            >
              <Key className="w-4 h-4 text-zinc-400" />
              API 입력
            </button>
            <button
              onClick={handleOfflineMode}
              className="flex items-center justify-center gap-2 py-4 bg-blue-600 hover:bg-blue-500 text-white font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-2xl shadow-blue-900/40 rounded-sm"
            >
              <Monitor className="w-4 h-4" />
              오프라인 모드 사용
            </button>
          </div>
          
          <p className="text-[9px] text-center text-zinc-600 font-bold uppercase tracking-tighter">
            나중에 설정 메뉴의 '정보/API' 탭에서 언제든지 변경할 수 있습니다.
          </p>
        </div>
      </Modal>

      <AnimatePresence>
        {isScraping && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/95 flex flex-col items-center justify-center p-10 backdrop-blur-md"
          >
            <div className="relative w-24 h-24 mb-10">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                className="absolute inset-0 border-2 border-blue-600/20 rounded-full"
              />
              <motion.div 
                animate={{ rotate: -360 }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                className="absolute inset-2 border-2 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-full"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                 <Database className="w-8 h-8 text-blue-500 animate-pulse" />
              </div>
            </div>
            
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-center"
            >
              <h3 className="text-xl font-black text-white uppercase tracking-[0.2em] mb-2">Processing</h3>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest max-w-xs leading-relaxed">
                라이브러리 데이터와 연결 상태를 동기화하고 있습니다.<br/>잠시만 기다려 주세요.
              </p>
            </motion.div>

            <button 
              onClick={handleCancelScraping}
              className="mt-12 px-6 py-2 border border-white/10 text-[10px] font-black uppercase text-zinc-500 hover:text-white hover:border-white/30 transition-all"
            >
              Cancel Operation
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
