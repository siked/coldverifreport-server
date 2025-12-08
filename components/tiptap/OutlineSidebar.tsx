import { GripVertical, RefreshCw, Trash2 } from 'lucide-react';
import React from 'react';
import type { HeadingItem } from './types';

interface OutlineSidebarProps {
  headings: HeadingItem[];
  width: number;
  sidebarRef: React.RefObject<HTMLDivElement>;
  draggingHeadingId: string | null;
  dragOverHeadingId: string | null;
  resizing: boolean;
  onRefresh: () => void;
  onNavigate: (heading: HeadingItem) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (event: React.DragEvent, heading: HeadingItem) => void;
  onDrop: (id: string) => void;
  onDragEnd: () => void;
  onStartResize: (event: React.MouseEvent) => void;
}

export default function OutlineSidebar({
  headings,
  width,
  sidebarRef,
  draggingHeadingId,
  dragOverHeadingId,
  resizing,
  onRefresh,
  onNavigate,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onStartResize,
}: OutlineSidebarProps) {
  return (
    <aside
      ref={sidebarRef}
      className="relative border-r bg-white overflow-auto select-none"
      style={{ width: `${width}px`, minWidth: '180px', maxWidth: '480px' }}
    >
      <div className="p-3 border-b flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">目录</p>
          <p className="text-xs text-gray-500">自动读取 H1 / H2 / H3</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="p-1 rounded hover:bg-gray-100 text-gray-500"
          title="刷新目录"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      <div className="p-2">
        {headings.length === 0 ? (
          <div className="text-xs text-gray-500 px-2 py-4 text-center">暂无标题</div>
        ) : (
          <ul className="space-y-1">
            {headings.map((item) => {
              const isDragOver = dragOverHeadingId === item.id;
              const indent = (item.level - 1) * 12;
              return (
                <li
                  key={item.id}
                  draggable
                  onDragStart={() => onDragStart(item.id)}
                  onDragEnd={onDragEnd}
                  onDragOver={(e) => onDragOver(e, item)}
                  onDrop={(e) => {
                    e.preventDefault();
                    onDrop(item.id);
                  }}
                  className={`group relative rounded transition-colors border-l-2 ${
                    isDragOver ? 'border-primary-500 bg-primary-50' : 'border-transparent hover:bg-gray-50'
                  }`}
                >
                  {isDragOver && (
                    <div className="pointer-events-none absolute left-3 right-2 -top-1 h-0.5 bg-primary-500 shadow-md animate-pulse rounded-full" />
                  )}
                  <div
                    className="flex items-center px-2 py-2 space-x-2 cursor-pointer"
                    onClick={() => onNavigate(item)}
                  >
                    <GripVertical className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                    <span
                      className="text-[11px] text-gray-500 uppercase tracking-wide"
                      style={{ minWidth: '28px' }}
                    >
                      H{item.level}
                    </span>
                    <span
                      className="text-sm text-gray-700 truncate flex-1"
                      style={{ paddingLeft: `${indent}px` }}
                    >
                      {item.text}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item.id);
                      }}
                      className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                      title="删除该标题及其内容"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div
        className={`absolute top-0 right-0 w-1 h-full cursor-col-resize bg-transparent hover:bg-primary-200 ${
          resizing ? 'bg-primary-300' : ''
        }`}
        onMouseDown={onStartResize}
        title="拖动调整目录宽度"
      />
    </aside>
  );
}









