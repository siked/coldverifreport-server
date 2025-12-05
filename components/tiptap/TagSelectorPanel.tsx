import { PlusCircle, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import type { TemplateTag } from '../TemplateTagList';

export type TagFormattingOption =
  | { type: 'date' | 'datetime'; pattern: string }
  | { type: 'number'; decimals: number }
  | { type: 'boolean'; trueText: string; falseText: string };

interface TagSelectorPanelProps {
  position: { left: number; top: number };
  targetType: 'text' | 'image';
  filteredTags: TemplateTag[];
  tagSearch: string;
  onTagSearchChange: (value: string) => void;
  onApplyTag: (tag: TemplateTag, formatting?: TagFormattingOption | null) => void;
  onOpenQuickAdd: () => void;
  onClose: () => void;
  formatTagValue: (tag: TemplateTag, formatting?: TagFormattingOption | null) => string;
  existingSource?: {
    tagId?: string;
    formatting?: TagFormattingOption | null;
  } | null;
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
  existingSource,
}: TagSelectorPanelProps) {
  const DEFAULT_TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';
  const DEFAULT_BOOLEAN_TRUE = '是';
  const DEFAULT_BOOLEAN_FALSE = '否';

  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [timeFormat, setTimeFormat] = useState(DEFAULT_TIME_FORMAT);
  const [decimalPlaces, setDecimalPlaces] = useState(1);
  const [trueText, setTrueText] = useState(DEFAULT_BOOLEAN_TRUE);
  const [falseText, setFalseText] = useState(DEFAULT_BOOLEAN_FALSE);

  // 自动选择首个标签或已有数据来源对应的标签
  useEffect(() => {
    if (existingSource?.tagId) {
      setSelectedTagId(existingSource.tagId);
      return;
    }
    if (filteredTags.length > 0) {
      setSelectedTagId(filteredTags[0]._id || '');
    }
  }, [existingSource, filteredTags]);

  const selectedTag = useMemo(
    () => filteredTags.find((tag) => tag._id === selectedTagId) || filteredTags[0],
    [filteredTags, selectedTagId]
  );

  // 初始化或切换标签时同步格式化默认值/已有值
  useEffect(() => {
    if (!selectedTag) return;

    if (existingSource?.tagId === selectedTag._id && existingSource?.formatting) {
      const fmt = existingSource.formatting;
      if (fmt.type === 'date' || fmt.type === 'datetime') {
        setTimeFormat(fmt.pattern);
      } else if (fmt.type === 'number') {
        setDecimalPlaces(fmt.decimals);
      } else if (fmt.type === 'boolean') {
        setTrueText(fmt.trueText);
        setFalseText(fmt.falseText);
      }
      return;
    }

    // 重置为默认值
    if (selectedTag.type === 'date' || selectedTag.type === 'datetime') {
      setTimeFormat(DEFAULT_TIME_FORMAT);
    } else if (selectedTag.type === 'number') {
      setDecimalPlaces(1);
    } else if (selectedTag.type === 'boolean') {
      setTrueText(DEFAULT_BOOLEAN_TRUE);
      setFalseText(DEFAULT_BOOLEAN_FALSE);
    }
  }, [existingSource, selectedTag]);

  const currentFormatting: TagFormattingOption | null = useMemo(() => {
    if (!selectedTag) return null;
    if (selectedTag.type === 'date' || selectedTag.type === 'datetime') {
      return { type: selectedTag.type, pattern: timeFormat };
    }
    if (selectedTag.type === 'number') {
      return { type: 'number', decimals: decimalPlaces };
    }
    if (selectedTag.type === 'boolean') {
      return { type: 'boolean', trueText, falseText };
    }
    return null;
  }, [decimalPlaces, falseText, selectedTag, timeFormat, trueText]);

  const previewValue = selectedTag ? formatTagValue(selectedTag, currentFormatting) : '';

  const renderFormattingControls = () => {
    if (!selectedTag) return null;
    if (selectedTag.type === 'date' || selectedTag.type === 'datetime') {
      return (
        <div className="space-y-2">
          <label className="text-xs text-gray-600">时间格式</label>
          <input
            type="text"
            value={timeFormat}
            onChange={(e) => setTimeFormat(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="例如：YYYY-MM-DD HH:mm:ss"
          />
          <p className="text-xs text-gray-500">支持 YYYY、MM、DD、HH、mm、ss</p>
        </div>
      );
    }
    if (selectedTag.type === 'number') {
      return (
        <div className="space-y-2">
          <label className="text-xs text-gray-600">保留小数位数</label>
          <input
            type="number"
            min={0}
            max={10}
            value={decimalPlaces}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (!Number.isNaN(val) && val >= 0) {
                setDecimalPlaces(val);
              }
            }}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      );
    }
    if (selectedTag.type === 'boolean') {
      return (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs text-gray-600">True 对应文本</label>
            <input
              type="text"
              value={trueText}
              onChange={(e) => setTrueText(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="例如：是 / Yes"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-gray-600">False 对应文本</label>
            <input
              type="text"
              value={falseText}
              onChange={(e) => setFalseText(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="例如：否 / No"
            />
          </div>
        </div>
      );
    }
    return null;
  };

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
              onClick={() => setSelectedTagId(tag._id || '')}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-800">{tag.name}</span>
                <span className="text-xs text-gray-500 uppercase">{tag.type}</span>
              </div>
              <div className="text-xs text-gray-500 truncate">{tag.description || '无描述'}</div>
              <div className="text-sm text-gray-700 truncate">
                {tag.type === 'image' || tag.type === 'cda-image'
                  ? tag.value
                  : formatTagValue(
                      tag,
                      selectedTag && tag._id === selectedTag._id ? currentFormatting : null
                    )}
              </div>
            </button>
          ))
        )}
      </div>
      {selectedTag && (
        <div className="mt-3 p-3 border rounded space-y-3 bg-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">格式化设置</p>
              <p className="text-xs text-gray-500">
                {selectedTag.type === 'image' || selectedTag.type === 'cda-image'
                  ? '图片标签无需格式化'
                  : '根据标签类型调整输出格式'}
              </p>
            </div>
            <span className="text-xs text-primary-600">{selectedTag.name}</span>
          </div>
          {renderFormattingControls()}
          <div>
            <p className="text-xs text-gray-500 mb-1">预览</p>
            <div className="px-3 py-2 bg-white border rounded text-sm text-gray-800 truncate">
              {previewValue || '无内容'}
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onApplyTag(selectedTag, currentFormatting)}
              className="px-4 py-2 bg-primary-600 text-white text-sm rounded hover:bg-primary-700"
            >
              应用到{targetType === 'image' ? '图片' : '文本'}
            </button>
          </div>
        </div>
      )}
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

