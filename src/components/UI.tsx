import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Star, ExternalLink, Plus, Info, X, ChevronDown, ChevronRight, FolderOpen, Settings, Minimize2, Square, X as CloseIcon, Database, AlertTriangle } from 'lucide-react';
import { Video, LocalFile } from '../types';

export const VideoListItem = React.memo(({ 
  video, 
  isSelected, 
  onClick, 
  onDoubleClick, 
  onPlay, 
  onContextMenu,
  scale = 1
}: { 
  video: Video, 
  isSelected: boolean, 
  onClick: () => void, 
  onDoubleClick: () => void, 
  onPlay?: (v: Video) => void,
  onContextMenu?: (e: React.MouseEvent, v: Video) => void,
  scale?: number
}) => {
  const [hoverIndex, setHoverIndex] = React.useState(-1);
  const hoverTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const startCycling = () => {
    if (!video.thumbnails || video.thumbnails.length === 0) return;
    setHoverIndex(0);
    hoverTimerRef.current = setInterval(() => {
      setHoverIndex(prev => (prev + 1) % (video.thumbnails?.length || 1));
    }, 2000);
  };

  const stopCycling = () => {
    if (hoverTimerRef.current) {
      clearInterval(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverIndex(-1);
  };

  const currentDisplayUrl = hoverIndex >= 0 && video.thumbnails && video.thumbnails.length > 0
    ? video.thumbnails[hoverIndex] 
    : (video.thumbnails && video.thumbnails.length > 0 ? video.thumbnails[0] : video.posterUrl);

  const baseRowHeight = 52;
  const rowHeight = baseRowHeight * scale;
  const thumbWidth = 64 * scale;
  const fontSize = Math.max(8, 11 * scale);

  return (
    <div 
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, video); }}
      onMouseEnter={startCycling}
      onMouseLeave={stopCycling}
      style={{ height: rowHeight }}
      className={`grid grid-cols-[auto_100px_1fr_150px_120px_150px_100px] gap-4 px-4 items-center cursor-pointer border-b border-white/[0.03] transition-colors ${isSelected ? 'bg-blue-600/10' : 'hover:bg-white/[0.02]'}`}
    >
      <div 
        className="aspect-video bg-zinc-900 border border-white/5 overflow-hidden relative shrink-0"
        style={{ width: thumbWidth }}
      >
        {currentDisplayUrl && (
          <img 
            src={currentDisplayUrl} 
            className="w-full h-full object-cover transition-opacity duration-300" 
            referrerPolicy="no-referrer" 
          />
        )}
      </div>
      <span className="font-black text-zinc-300 tracking-widest truncate" style={{ fontSize: fontSize }}>{video.code}</span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-bold text-zinc-200 truncate" style={{ fontSize: fontSize }}>{video.title}</span>
        <span className="text-zinc-600 font-medium truncate" style={{ fontSize: Math.max(7, fontSize - 2) }}>{video.filePath || '로컬 경로 없음'}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {video.actors.slice(0, 2).map(a => (
          <span key={a} className="text-zinc-400 font-bold" style={{ fontSize: Math.max(7, fontSize - 2) }}>{a}</span>
        ))}
      </div>
      <span className="text-zinc-500 font-bold uppercase truncate" style={{ fontSize: Math.max(8, fontSize - 1) }}>{video.studio}</span>
      <div className="flex items-center gap-2">
         <StarRating rating={video.rating} size={fontSize - 2} />
      </div>
      <span className="text-zinc-600 font-mono text-right truncate" style={{ fontSize: Math.max(8, fontSize - 1) }}>
        {video.size ? (video.size / (1024 * 1024)).toFixed(1) : '0'} MB
      </span>
    </div>
  );
});

export const StarRating = React.memo(({ rating = 0, size = 12 }: { rating?: number, size?: number }) => {
  // rating is 0 to 100
  // Each star is 20 points
  const stars = [1, 2, 3, 4, 5];
  return (
    <div className="flex gap-0.5 items-center">
      {stars.map((star) => {
        const starValue = star * 20;
        const prevStarValue = (star - 1) * 20;
        let fillWidth = 0;
        
        if (rating >= starValue) {
          fillWidth = 100;
        } else if (rating > prevStarValue) {
          fillWidth = ((rating - prevStarValue) / 20) * 100;
        }

        return (
          <div key={star} className="relative" style={{ width: size, height: size }}>
            <Star className="absolute inset-0 text-zinc-800 fill-zinc-800" size={size} />
            <div className="absolute inset-0 overflow-hidden" style={{ width: `${fillWidth}%` }}>
              <Star className="text-yellow-500 fill-yellow-500" size={size} />
            </div>
          </div>
        );
      })}
    </div>
  );
});

interface VideoPlayerProps {
  video: Video;
  onClose: () => void;
  cachedFile?: LocalFile;
  onFileSelect?: (f: LocalFile) => void;
  key?: React.Key;
}

export const VideoPlayer = ({ video, onClose, cachedFile, onFileSelect }: VideoPlayerProps) => {
  const [file, setFile] = React.useState<LocalFile | null>(cachedFile || null);
  const [videoSrc, setVideoSrc] = React.useState<string>('');
  const [duration, setDuration] = React.useState(0);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    setFile(cachedFile || null);
    setLoadError(null);
  }, [cachedFile]);

  React.useEffect(() => {
    let url = '';
    if (file && file.absPath.startsWith('blob:')) {
      url = file.absPath;
    } else if (file) {
      // Electron preview check
      url = window.electron ? window.electron.files.toMediaUrl(file.absPath) : file.absPath;
    } else if (video.videoUrl) {
      url = video.videoUrl;
    } else if ((video as any).previewVideoUrl) {
      url = (video as any).previewVideoUrl;
    }

    setVideoSrc(url);
    setLoadError(null);
  }, [file, video.videoUrl, (video as any).previewVideoUrl]);

  const pickLocalFile = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = (e) => {
      const selectedFile = (e.target as HTMLInputElement).files?.[0];
      if (selectedFile) {
        const url = URL.createObjectURL(selectedFile);
        const localFile: LocalFile = {
            name: selectedFile.name,
            absPath: url,
            size: selectedFile.size
        };
        setFile(localFile);
        if (onFileSelect) onFileSelect(localFile);
      }
    };
    input.click();
  };

  React.useEffect(() => {
    if (videoRef.current && videoSrc) {
      const v = videoRef.current;
      v.load();
      v.play().catch(() => {
        // If immediate play fails, events will handle it once ready
      });
    }
  }, [videoSrc]);

  return (
    <div className="flex flex-col h-full bg-black rounded-sm overflow-hidden border border-white/5 shadow-2xl">
      <div
        className="relative aspect-video bg-black flex items-center justify-center group overflow-hidden"
      >
        {videoSrc ? (
          <>
            <video 
              ref={videoRef}
              src={videoSrc} 
              className="w-full h-full" 
              controls 
              autoPlay
              muted
              playsInline
              preload="auto"
              crossOrigin={videoSrc.startsWith('blob:') ? undefined : 'anonymous'}
              onLoadedMetadata={(e) => {
                setDuration(e.currentTarget.duration);
                e.currentTarget.play().catch(() => {});
              }}
              onCanPlay={(e) => {
                e.currentTarget.play().catch(() => {});
              }}
              onCanPlayThrough={(e) => {
                e.currentTarget.play().catch(() => {});
              }}
              onError={(e) => {
                console.error("VideoPlayer Render Error:", e.type);
                // Only set error if it's not a temporary stall
                if (videoRef.current && videoRef.current.error) {
                  setLoadError("동영상을 불러오는데 실패했습니다. 파일 형식이 지원되지 않거나 접근 권한이 없을 수 있습니다.");
                }
              }}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            />
            {loadError && (
              <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center text-center p-8 gap-4 z-20">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                   <Info className="w-8 h-8 text-red-500" />
                </div>
                <div className="space-y-2">
                  <p className="text-white font-black text-sm">{loadError}</p>
                  <p className="text-zinc-500 text-[10px]">로컬 파일을 다시 연결하거나 다른 파일을 선택해 주세요.</p>
                </div>
                <button 
                  onClick={pickLocalFile}
                  className="mt-2 bg-zinc-800 text-white px-6 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest hover:bg-zinc-700 transition-colors"
                >
                  다른 파일 연결하기
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-6 p-12 text-center max-w-sm">
            <div
              className="w-24 h-24 rounded-full bg-blue-600/5 border border-blue-600/20 flex items-center justify-center animate-pulse cursor-pointer hover:bg-blue-600/10 transition-colors"
              onClick={pickLocalFile}
            >
              <Play className="w-12 h-12 text-blue-500/50 ml-1" />
            </div>
            <div className="space-y-3">
              <p className="text-zinc-200 text-sm font-black uppercase tracking-widest">연결된 파일 없음</p>
              <p className="text-zinc-500 text-[10px] font-medium leading-relaxed">
                로컬 동영상 파일을 이 영역으로 드래그하거나<br />
                아래 버튼을 눌러 파일을 연결하세요.
              </p>
            </div>
            <button
              onClick={pickLocalFile}
              className="bg-blue-600 text-white px-10 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.2em] hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20"
            >
              파일 연결하기
            </button>
          </div>
        )}

        {/* Overlay info */}
        {videoSrc && (
          <div className="absolute top-4 left-4 right-4 flex justify-between items-start opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
             <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 border border-white/5 rounded-sm">
                <span className="text-[10px] font-black text-blue-400 tracking-widest">{video.code}</span>
             </div>
          </div>
        )}
      </div>

      {videoSrc && (
        <div className="bg-[#0a0a0a] px-6 py-4 border-t border-white/5 space-y-4">
           {/* Scrub bar like Manual Thumbnail */}
           <div className="space-y-1">
             <input 
                type="range" 
                min={0} 
                max={duration || 100} 
                step={0.1}
                value={currentTime}
                onChange={(e) => {
                  const time = parseFloat(e.target.value);
                  if (videoRef.current) videoRef.current.currentTime = time;
                }}
                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="flex justify-between text-[8px] font-mono font-black text-zinc-600 uppercase tracking-widest">
                <span>{new Date(currentTime * 1000).toISOString().substr(11, 8)}</span>
                <span>{new Date((duration || 0) * 1000).toISOString().substr(11, 8)}</span>
              </div>
           </div>

           <div className="flex justify-between items-center">
             <div className="flex items-center gap-4">
                <div className="flex flex-col overflow-hidden">
                  <span className="text-[12px] font-black text-zinc-100 line-clamp-1">{file ? file.name : (video.title || video.code)}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">{video.studio}</span>
                    <div className="w-1 h-1 bg-zinc-800 rounded-full" />
                    <StarRating rating={video.rating} size={8} />
                  </div>
                </div>
             </div>
             <div className="flex items-center gap-3">
                {video.videoUrl && (
                  <button onClick={() => window.open(video.videoUrl, '_blank')} className="p-2 text-zinc-500 hover:text-white transition-colors bg-white/5 rounded-full">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
                <div className="w-[1px] h-4 bg-white/5 mx-1" />
                <button onClick={onClose} className="px-6 py-2 bg-zinc-800 text-zinc-400 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-700 transition-all rounded-sm">
                  닫기
                </button>
             </div>
           </div>
           
           {/* Thumbnails strip at the bottom - similar to manual thumb modal */}
           {video.thumbnails && video.thumbnails.length > 0 && (
             <div className="flex gap-2 py-1 overflow-x-auto custom-scrollbar">
                {video.thumbnails.map((thumb, i) => (
                  <button 
                    key={i} 
                    onClick={() => {
                      // Maybe seek to a relative point? Or just view.
                      // For now just for visual reference
                    }}
                    className="w-16 aspect-video bg-zinc-900 border border-white/5 shrink-0 hover:border-blue-500 transition-colors overflow-hidden"
                  >
                    <img src={thumb} className="w-full h-full object-cover opacity-60 hover:opacity-100 transition-opacity" />
                  </button>
                ))}
             </div>
           )}
        </div>
      )}
    </div>
  );
};



export const TitleBar = ({ title }: { title: string }) => {
  return (
    <div className="bg-[#0a0a0a] h-10 flex items-center border-b border-white/[0.05] relative z-[100] select-none">
      <div className="flex items-center gap-3 px-4">
        <div className="w-5 h-5 bg-blue-600 flex items-center justify-center">
          <Database className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-[11px] font-bold text-zinc-400 tracking-wider uppercase">{title}</span>
      </div>
    </div>
  );
};

export const MenuBarItem = ({ label, items, active, onToggle }: { label: string, items: { label: string, onClick?: () => void }[], active: boolean, onToggle: () => void }) => {
  return (
    <div className="relative group/menu">
      <button 
        onClick={onToggle}
        className={`px-4 py-3 text-[11px] font-bold transition-all uppercase tracking-tight ${active ? 'text-blue-500' : 'text-zinc-500 hover:text-zinc-200'}`}
      >
        {label}
      </button>
      <AnimatePresence>
        {active && (
          <>
            <div className="fixed inset-0 z-40 bg-black/5" onClick={onToggle} />
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="absolute left-0 top-full bg-[#121212] border border-white/[0.05] shadow-[0_10px_40px_rgba(0,0,0,0.5)] z-50 min-w-[220px] py-2"
            >
              {items.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => { item.onClick?.(); onToggle(); }}
                  className="w-full text-left px-5 py-2.5 hover:bg-blue-600/10 hover:text-blue-400 text-[11px] font-medium transition-all text-zinc-400 flex items-center justify-between group"
                >
                  <span>{item.label}</span>
                  <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export const VideoItem = React.memo(({ 
  video, 
  isSelected, 
  onClick, 
  onDoubleClick, 
  onPlay, 
  onContextMenu 
}: { 
  video: Video, 
  isSelected: boolean, 
  onClick: () => void, 
  onDoubleClick: () => void, 
  onPlay?: (v: Video) => void,
  onContextMenu?: (e: React.MouseEvent, v: Video) => void,
  key?: React.Key
}) => {
  const [hoverIndex, setHoverIndex] = React.useState(-1);
  const hoverTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const startCycling = () => {
    if (!video.thumbnails || video.thumbnails.length === 0) return;
    setHoverIndex(0);
    hoverTimerRef.current = setInterval(() => {
      setHoverIndex(prev => (prev + 1) % (video.thumbnails?.length || 1));
    }, 2000);
  };

  const stopCycling = () => {
    if (hoverTimerRef.current) {
      clearInterval(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverIndex(-1);
  };

  const currentDisplayUrl = hoverIndex >= 0 && video.thumbnails && video.thumbnails.length > 0
    ? video.thumbnails[hoverIndex] 
    : (video.thumbnails && video.thumbnails.length > 0 ? video.thumbnails[0] : video.posterUrl);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4 }}
      className={`bg-[#1a1a1a] border flex flex-col cursor-pointer group rounded-sm overflow-hidden shadow-2xl relative transition-all duration-300 ${isSelected ? 'border-blue-600 ring-2 ring-blue-600/30' : 'border-white/[0.03]'}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, video); }}
      onMouseEnter={startCycling}
      onMouseLeave={stopCycling}
    >
      <div className="relative aspect-video bg-zinc-950 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.img 
            key={currentDisplayUrl}
            src={currentDisplayUrl} 
            alt={video.title} 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full h-full object-cover transition-transform duration-[2000ms] group-hover:scale-110"
            referrerPolicy="no-referrer"
          />
        </AnimatePresence>
        
        {!currentDisplayUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[10px] text-zinc-800 font-black uppercase tracking-widest">
            <FolderOpen className="w-8 h-8 mb-2 opacity-10" />
            이미지 없음
          </div>
        )}
        
        {/* Selection Indicator */}
        {isSelected && (
          <div className="absolute top-2 right-2 z-20 bg-blue-600 rounded-full p-1 shadow-lg border border-white/20 scale-110">
            <div className="w-3 h-3 bg-white rounded-full flex items-center justify-center">
               <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
            </div>
          </div>
        )}

        {/* Play Overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center z-10">
          <button 
            onClick={(e) => { e.stopPropagation(); if(onPlay) onPlay(video); }}
            className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all"
          >
            <Play className="w-6 h-6 text-white fill-current ml-1" />
          </button>
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />
        <div className="absolute bottom-2 left-2 right-2 flex justify-between items-end">
          <div className="flex flex-col">
            <span className="text-[11px] font-black text-white tracking-widest drop-shadow-md">{video.code}</span>
            <span className="text-[8px] text-zinc-400 font-bold uppercase tracking-tight line-clamp-1">{video.studio}</span>
          </div>
          <div className="bg-black/40 backdrop-blur-md px-1.5 py-1 rounded-sm border border-white/5">
             <StarRating rating={video.rating} size={8} />
          </div>
        </div>
      </div>
      <div className="p-3 bg-[#0a0a0a] flex-1 flex flex-col gap-2 min-h-0">
        <div className="overflow-hidden">
          <h3 className="text-[11px] font-bold text-zinc-100 line-clamp-1 leading-tight mb-1">
            {video.title}
          </h3>
          {video.description && !video.description.includes('AI로 정보를') && !video.description.includes('요청이 거부') && (
            <p className="text-[9px] text-zinc-400 line-clamp-2 font-medium leading-relaxed">
              {video.description}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1 mt-auto overflow-hidden">
          {video.tags.slice(0, 6).map(t => (
            <span key={t} className="text-[8px] bg-zinc-900 border border-white/[0.05] px-1.5 py-0.5 text-zinc-500 font-bold uppercase tracking-wide">#{t}</span>
          ))}
          {video.tags.length > 6 && (
            <span className="text-[8px] text-zinc-700 font-black px-1 py-0.5 uppercase tracking-tighter">+{video.tags.length - 6}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
});

export const ContextMenu = ({ x, y, onClose, items }: { x: number, y: number, onClose: () => void, items: { label: string, onClick: () => void, icon?: React.ReactNode, shortcut?: string }[] }) => {
  return (
    <>
      <div className="fixed inset-0 z-[1000]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div 
        className="fixed z-[1001] bg-[#f0f0f0] border border-zinc-400 shadow-2xl py-1 min-w-[200px]"
        style={{ left: x, top: y }}
      >
        {items.map((item, idx) => (
          <React.Fragment key={idx}>
            {item.label === 'separator' ? (
              <div className="h-[1px] bg-zinc-300 my-1 mx-1" />
            ) : (
              <button
                onClick={() => { item.onClick(); onClose(); }}
                className="w-full px-4 py-1.5 hover:bg-zinc-200 text-left flex items-center justify-between group"
              >
                <span className="text-xs text-zinc-800 font-medium">{item.label}</span>
                {item.shortcut && <span className="text-[10px] text-zinc-500 ml-4">{item.shortcut}</span>}
              </button>
            )}
          </React.Fragment>
        ))}
      </div>
    </>
  );
};

export const SidebarSection = ({ title, children, onAdd, isOpen: defaultOpen = true }: { title: string, children: React.ReactNode, onAdd?: () => void, isOpen?: boolean }) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  return (
    <div className="border-b border-white/[0.03]">
      <div className="px-5 py-4 flex items-center justify-between group/sidebar-header cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] group-hover/sidebar-header:text-zinc-200 transition-colors">
          <motion.div animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-3 h-3" />
          </motion.div>
          {title}
        </div>
        {onAdd && (
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              onAdd(); 
            }}
            className="p-1 hover:bg-blue-600 rounded-sm transition-colors opacity-100 sm:opacity-0 group-hover/sidebar-header:opacity-100 relative z-20"
          >
            <Plus className="w-3 h-3 text-white" />
          </button>
        )}
      </div>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-6 space-y-1.5">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const Modal = ({ isOpen, onClose, title, children, maxWidth = "max-w-3xl", isResizable = false }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode, maxWidth?: string, isResizable?: boolean }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 backdrop-blur-sm pointer-events-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 pointer-events-auto"
          />
          <motion.div
            drag={isResizable}
            dragMomentum={false}
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className={`relative bg-[#0d0d0d] border border-white/[0.07] shadow-[0_0_100px_rgba(0,0,0,0.8)] w-full ${maxWidth} flex flex-col rounded-sm overflow-hidden pointer-events-auto`}
          >
            <div className="bg-[#121212] px-6 py-4 flex justify-between items-center border-b border-white/[0.05] cursor-move">
              <span className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em]">{title}</span>
              <button onClick={onClose} className="w-6 h-6 flex items-center justify-center hover:bg-white/5 transition-colors group">
                <X className="w-4 h-4 text-zinc-600 group-hover:text-white" />
              </button>
            </div>
            <div className={`overflow-y-auto custom-scrollbar ${isResizable ? 'h-[70vh]' : 'max-h-[80vh] p-8'}`}>
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export const SettingsModal = ({ isOpen, onClose, onUpdate, onReset }: { isOpen: boolean, onClose: () => void, onUpdate: () => void, onReset?: () => void }) => {
  const [activeTab, setActiveTab] = React.useState('sync');
  const [syncFolders, setSyncFolders] = React.useState<string[]>(() => JSON.parse(localStorage.getItem('sg_sync_folders') || '["H:\\\\정리"]'));
  const [playerPath, setPlayerPath] = React.useState(() => localStorage.getItem('sg_player_path') || '');
  const [geminiKey, setGeminiKey] = React.useState('');
  const [geminiKeySaved, setGeminiKeySaved] = React.useState(false);

  // Base Settings
  const [fontSize, setFontSize] = React.useState(() => localStorage.getItem('db_font_size') || '11');
  const [fontFamily, setFontFamily] = React.useState(() => localStorage.getItem('db_font_family') || 'Inter');
  const [aspectRatio, setAspectRatio] = React.useState(() => localStorage.getItem('db_aspect_ratio') || '16/9 [FHD]');

  React.useEffect(() => {
    if (!isOpen) return;
    const v = localStorage.getItem('db_gemini_api_key');
    setGeminiKeySaved(!!v);
    setGeminiKey('');
  }, [isOpen]);

  const saveSettings = async () => {
    localStorage.setItem('sg_sync_folders', JSON.stringify(syncFolders));
    localStorage.setItem('sg_player_path', playerPath);

    localStorage.setItem('db_font_size', fontSize);
    localStorage.setItem('db_font_family', fontFamily);
    localStorage.setItem('db_aspect_ratio', aspectRatio);

    if (geminiKey.trim()) {
      localStorage.setItem('db_gemini_api_key', geminiKey.trim());
    }
    onUpdate();
    onClose();
  };

  const clearGeminiKey = async () => {
    localStorage.removeItem('db_gemini_api_key');
    setGeminiKey('');
    setGeminiKeySaved(false);
  };

  const tabs = [
    { id: 'sync', label: '동기화 폴더' },
    { id: 'base', label: '기본설정' },
    { id: 'player', label: 'Player 설정' },
    { id: 'gemini', label: 'AI 키' },
    { id: 'advanced', label: '고급/초기화' },
    { id: 'version', label: '정보' }
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="DB Archive 설정" maxWidth="max-w-2xl">
      <div className="flex flex-col gap-6">
        <div className="flex bg-[#121212] border border-white/[0.05] p-0.5 rounded-sm">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-600 hover:text-zinc-300'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-[300px] flex flex-col">
          {activeTab === 'sync' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500">동기화 폴더 추가/삭제</span>
                <div className="flex gap-2">
                  <button onClick={() => setSyncFolders([...syncFolders, 'C:\\New Folder'])} className="px-6 py-1.5 bg-zinc-800 border border-white/[0.05] text-[10px] font-bold text-white hover:bg-zinc-700">추 가</button>
                  <button onClick={() => setSyncFolders(syncFolders.slice(0, -1))} className="px-6 py-1.5 bg-zinc-800 border border-white/[0.05] text-[10px] font-bold text-white hover:bg-zinc-700">삭 제</button>
                </div>
              </div>
              <div className="border border-white/[0.07] bg-black p-4 space-y-2 text-center">
                 <p className="text-[10px] text-zinc-600 mb-4 font-bold">동기화 폴더를 등록해 두면 [폴더 가져오기] 시 빠르게 선택할 수 있습니다.</p>
                {syncFolders.map((folder, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-zinc-900 border border-white/[0.05] p-2">
                    <span className="text-[11px] font-mono text-zinc-400">{folder}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-zinc-600">미지정</span>
                      <ChevronDown className="w-3 h-3 text-zinc-600" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'base' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="grid grid-cols-[120px_1fr] items-center gap-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">화면 비율</label>
                  <select 
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="bg-black border border-white/[0.07] rounded-sm p-3 text-[11px] text-white outline-none focus:border-blue-600"
                  >
                    <option value="16/9 [FHD]">FHD (1920x1080)</option>
                    <option value="16/9 [HD]">HD (1280x720)</option>
                    <option value="16/9 [4K]">4K UHD (3840x2160)</option>
                    <option value="16/9 [8K]">8K UHD (7680x4320)</option>
                    <option value="21/9 [UW]">21:9 UltraWide</option>
                    <option value="4/3 [SD]">4:3 Standard (SD)</option>
                    <option value="3/4 [P]">3:4 Portrait</option>
                    <option value="2/3 [C]">2:3 Classic</option>
                    <option value="1/1 [S]">1:1 Square</option>
                    <option value="9/16 [V]">9:16 Vertical HD</option>
                  </select>
                </div>
                <div className="grid grid-cols-[120px_1fr] items-center gap-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">글자 폰트</label>
                  <select 
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    className="bg-black border border-white/[0.07] rounded-sm p-3 text-[11px] text-white outline-none focus:border-blue-600"
                  >
                    <option value="Inter">Inter (Sans)</option>
                    <option value="Gmarket Sans">Gmarket Sans</option>
                    <option value="Pretendard">Pretendard</option>
                    <option value="JetBrains Mono">JetBrains Mono</option>
                  </select>
                </div>
                <div className="grid grid-cols-[120px_1fr] items-center gap-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">글자 크기 ({fontSize}px)</label>
                  <div className="flex items-center gap-4">
                    <input 
                      type="range" 
                      min="9" 
                      max="16" 
                      step="1"
                      value={fontSize}
                      onChange={(e) => setFontSize(e.target.value)}
                      className="flex-1 accent-blue-600"
                    />
                    <span className="text-white text-xs font-mono">{fontSize}px</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'player' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">외부 플레이어 실행 파일 경로 (선택)</label>
                <input
                  type="text"
                  value={playerPath}
                  onChange={(e) => setPlayerPath(e.target.value)}
                  className="w-full bg-black border border-white/[0.07] rounded-sm p-3 text-[11px] font-mono text-white outline-none focus:border-blue-600"
                  placeholder="C:\Program Files\DAUM\PotPlayer\PotPlayer.exe"
                />
              </div>
              <p className="text-[10px] text-zinc-600 italic">
                비워두면 OS 기본 연결 프로그램으로 열립니다. 경로를 지정하면 해당 실행 파일에 영상 절대경로를 인자로 넘깁니다.
              </p>
            </div>
          )}

          {activeTab === 'gemini' && (
            <div className="space-y-6">
              <p className="text-[11px] font-bold text-zinc-400">
                품번으로 메타데이터 자동 수집 시 사용되는 Google Gemini API 키를 입력하세요.
                키는 로컬에만 저장되며 외부로 전송되지 않습니다.
              </p>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  GEMINI API KEY {geminiKeySaved && <span className="text-emerald-500">· 저장됨</span>}
                </label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder={geminiKeySaved ? '••••• (변경하려면 새 키 입력)' : 'AIza...'}
                  className="w-full bg-black border border-white/[0.07] rounded-sm p-3 text-[11px] font-mono text-white outline-none focus:border-blue-600"
                />
              </div>
              {geminiKeySaved && (
                <button
                  onClick={clearGeminiKey}
                  className="px-6 py-2 bg-red-600/10 border border-red-600/40 text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-600/20 transition-all"
                >
                  저장된 키 삭제
                </button>
              )}
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="space-y-6">
              <div className="p-4 bg-red-950/20 border border-red-500/20 rounded-sm">
                <h4 className="text-[11px] font-black text-red-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3" /> 어플리케이션 공장 초기화
                </h4>
                <p className="text-[10px] text-zinc-500 leading-relaxed mb-4">
                  모든 설정, 로컬 캐시, 성인인증 상태, 검색 기록 등을 완전히 초기화합니다. <br/>
                  로컬 DB에 저장된 영상 데이터는 삭제되지 않지만 다시 검색이 필요할 수 있습니다.
                </p>
                <button 
                  onClick={onReset}
                  className="w-full py-3 bg-red-600/10 border border-red-600/50 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all"
                >
                  어플리케이션 전체 초기화
                </button>
              </div>
              
              <div className="space-y-2">
                 <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">안정성 모드</label>
                 <div className="flex items-center gap-2 bg-[#121212] p-3 border border-white/[0.05]">
                   <input type="checkbox" checked readOnly className="w-3 h-3 accent-blue-600" />
                   <span className="text-[10px] font-bold text-zinc-300">자동 가비지 컬렉션 활성화 (메모리 최적화)</span>
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'version' && (
            <div className="flex-1 flex items-center justify-center py-10">
              <div className="flex items-center gap-10">
                <div className="w-32 h-32 bg-blue-600 border border-white/[0.05] rounded-2xl flex flex-col items-center justify-center p-4 shadow-2xl">
                   <div className="text-4xl font-black text-white leading-none">DB</div>
                   <div className="text-[10px] font-black text-zinc-200 uppercase tracking-widest mt-1">ARCHIVE</div>
                </div>
                <div className="space-y-4">
                  <div className="text-xl font-black text-white uppercase tracking-tight">DB Archive v1.12.2</div>
                  <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.25em]">Personal Video Library</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {activeTab !== 'version' && (
          <div className="flex justify-end pt-4 border-t border-white/[0.03]">
             <button onClick={saveSettings} className="px-10 py-3 bg-blue-600 font-black text-white text-[11px] uppercase tracking-widest shadow-lg shadow-blue-700/20 hover:bg-blue-500 transition-all">설정 저장</button>
          </div>
        )}
      </div>
    </Modal>
  );
};
