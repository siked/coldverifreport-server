import { Database, Tag as TagIcon, Trash2, Calculator } from 'lucide-react';
import React from 'react';

interface DataSourceMenuProps {
  position: { left: number; top: number };
  hasExistingSource: boolean;
  onSelectTag: () => void;
  onSelectApi: () => void;
  onSelectCalculation: () => void;
  onRemove?: () => void;
}

export default function DataSourceMenu({
  position,
  hasExistingSource,
  onSelectTag,
  onSelectApi,
  onSelectCalculation,
  onRemove,
}: DataSourceMenuProps) {
  return (
    <div
      className="fixed bg-white border rounded-lg shadow-lg py-1 z-50 min-w-[200px] data-source-popover"
      style={position}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b">数据来源</div>
      <button
        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
        onClick={(e) => {
          e.stopPropagation();
          onSelectTag();
        }}
      >
        <TagIcon className="w-4 h-4" />
        <span>标签值</span>
      </button>
      <button
        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
        onClick={(e) => {
          e.stopPropagation();
          onSelectApi();
        }}
      >
        <Database className="w-4 h-4" />
        <span>接口数据</span>
      </button>
      <button
        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
        onClick={(e) => {
          e.stopPropagation();
          onSelectCalculation();
        }}
      >
        <Calculator className="w-4 h-4" />
        <span>运算类</span>
      </button>
      {hasExistingSource && onRemove && (
        <button
          className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2 border-t mt-1"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 className="w-4 h-4" />
          <span>移除数据来源</span>
        </button>
      )}
    </div>
  );
}

