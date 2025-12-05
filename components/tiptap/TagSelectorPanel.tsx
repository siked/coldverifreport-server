import { PlusCircle, X } from 'lucide-react';
import React from 'react';
import type { TemplateTag } from '../TemplateTagList';

interface TagSelectorPanelProps {
  position: { left: number; top: number };
  targetType: 'text' | 'image';
  filteredTags: TemplateTag[];
  tagSearch: string;
  onTagSearchChange: (value: string) => void;
  onApplyTag: (tag: TemplateTag) => void;
  onOpenQuickAdd: () => void;
  onClose: () => void;
  formatTagValue: (tag: TemplateTag) => string;
}

export default function TagSelectorPanel({
  position,
  targetType,
  filteredTags,
  tagSearch,
  onTagSearchChange,
  onApplyTag,
  onOpenQuickAdd,
  onClose,
  formatTagValue,
}: TagSelectorPanelProps) {
  return (
    <div
      className="fixed bg-white border rounded-lg shadow-2xl w-[360px] p-4 z-50 data-source-popover"
      style={position}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">选择标签值</p>
          <p className="text-xs text-gray-500">当前目标：{targetType === 'image' ? '图片' : '文本'}</p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="mb-3">
        <input
          type="text"
          value={tagSearch}
          onChange={(e) => onTagSearchChange(e.target.value)}
          placeholder="搜索标签名称..."
          className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div className="max-h-64 overflow-y-auto border rounded divide-y">
        {filteredTags.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500">暂无可用标签</div>
        ) : (
          filteredTags.map((tag) => (
            <button
              key={tag._id}
              className="w-full text-left px-3 py-2 hover:bg-primary-50 space-y-1"
              onClick={() => onApplyTag(tag)}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-800">{tag.name}</span>
                <span className="text-xs text-gray-500 uppercase">{tag.type}</span>
              </div>
              <div className="text-xs text-gray-500 truncate">{tag.description || '无描述'}</div>
              <div className="text-sm text-gray-700 truncate">
                {tag.type === 'image' || tag.type === 'cda-image' ? tag.value : formatTagValue(tag)}
              </div>
            </button>
          ))
        )}
      </div>
      <div className="flex items-center justify-between mt-3">
        <button
          type="button"
          onClick={onOpenQuickAdd}
          className="inline-flex items-center space-x-2 px-3 py-2 border rounded text-sm text-gray-700 hover:bg-gray-50"
        >
          <PlusCircle className="w-4 h-4" />
          <span>快速添加标签</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          关闭
        </button>
      </div>
    </div>
  );
}

