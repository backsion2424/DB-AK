import React from 'react';
import { Grid as VirtualGrid } from 'react-window';
import { Video } from '../types';
import { VideoItem } from './UI';

interface VideoGridProps {
  videos: Video[];
  isMissingFile: (v: Video) => boolean;
  selectedVideoIds: Set<string>;
  toggleSelect: (id: string) => void;
  onVideoSelect: (v: Video) => void;
  onPlay: (v: Video) => void;
  onContextMenu: (e: React.MouseEvent, v: Video) => void;
  gridCols: number;
  aspectRatio: string;
  width: number;
  height: number;
}

export const VirtualVideoGrid: React.FC<VideoGridProps> = ({ 
  videos, isMissingFile, selectedVideoIds, toggleSelect, onVideoSelect, onPlay, onContextMenu, gridCols, aspectRatio, width, height 
}) => {
  const columnWidth = width / gridCols;
  const ratio = parseFloat(aspectRatio.split('/')[0]) / parseFloat(aspectRatio.split('/')[1].split(' ')[0]);
  const rowHeight = columnWidth / ratio + 40; // Add space for title/info
  const rowCount = Math.ceil(videos.length / gridCols);

  const Cell = ({ columnIndex, rowIndex, style }: any) => {
    const index = rowIndex * gridCols + columnIndex;
    if (index >= videos.length) return null;
    const video = videos[index];

    return (
      <div style={style} className="p-2">
        <VideoItem 
          video={video} 
          isMissing={isMissingFile(video)}
          isSelected={selectedVideoIds.has(video.id || '')}
          onClick={() => toggleSelect(video.id || '')}
          onDoubleClick={() => onVideoSelect(video)} 
          onPlay={onPlay}
          onContextMenu={(e, v) => onContextMenu(e, v)}
        />
      </div>
    );
  };

  return (
    <VirtualGrid
      columnCount={gridCols}
      columnWidth={columnWidth}
      rowCount={rowCount}
      rowHeight={rowHeight}
      style={{ overflowX: 'hidden', height, width }}
      cellComponent={Cell}
      cellProps={{}}
    />
  );
};
