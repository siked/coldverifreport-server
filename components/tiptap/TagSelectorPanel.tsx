import { PlusCircle, X, ChevronDown, Settings } from 'lucide-react';
import React, { useEffect, useMemo, useState, useRef } from 'react';
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
  onOpenQuickAdd: (type: TemplateTag['type']) => void;
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
  const [showQuickAddMenu, setShowQuickAddMenu] = useState(false);
  const [showFormattingView, setShowFormattingView] = useState(false);
  const formattingViewRef = useRef(false);
  
  // 同步 ref 和 state
  useEffect(() => {
    formattingViewRef.current = showFormattingView;
  }, [showFormattingView]);

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

  // 根据目标类型获取可用的标签类型
  const availableTagTypes = useMemo(() => {
    if (targetType === 'image') {
      return [
        { value: 'image' as const, label: '图片' },
        { value: 'cda-image' as const, label: 'CDA 图片' },
      ];
    }
    return [
      { value: 'text' as const, label: '文本' },
      { value: 'number' as const, label: '数字' },
      { value: 'date' as const, label: '日期' },
      { value: 'datetime' as const, label: '时间' },
      { value: 'location' as const, label: '布点区域' },
      { value: 'boolean' as const, label: '布尔' },
    ];
  }, [targetType]);

  const handleQuickAddClick = (type: TemplateTag['type']) => {
    setShowQuickAddMenu(false);
    onOpenQuickAdd(type);
  };

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
      <div className="mb-3">
        <p className="text-sm font-semibold text-gray-800">选择标签值</p>
        <p className="text-xs text-gray-500">当前目标：{targetType === 'image' ? '图片' : '文本'}</p>
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
      <div className="max-h-64 overflow-y-auto border rounded" onClick={(e) => e.stopPropagation()}>
        {showFormattingView && selectedTag ? (
          <div className="p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">格式化设置</p>
                <p className="text-xs text-gray-500">
                  标签：<span className="font-medium text-gray-800">{selectedTag.name}</span>
                </p>
              </div>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  formattingViewRef.current = false;
                  setShowFormattingView(false);
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                title="关闭格式化设置"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderFormattingControls()}
            <div>
              <p className="text-xs text-gray-500 mb-1">预览</p>
              <div className="px-3 py-2 bg-gray-50 border rounded text-sm text-gray-800 truncate">
                {previewValue || '无内容'}
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {filteredTags.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-500">暂无可用标签</div>
            ) : (
              filteredTags.map((tag) => (
                <div
                  key={tag._id}
                  className={`w-full px-3 py-2 hover:bg-primary-50 space-y-1 ${
                    selectedTagId === tag._id ? 'bg-primary-50' : ''
                  }`}
                >
                  <button
                    className="w-full text-left"
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
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 mt-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowQuickAddMenu(!showQuickAddMenu)}
            className="inline-flex items-center space-x-2 px-3 py-2 border rounded text-sm text-gray-700 hover:bg-gray-50"
          >
            <PlusCircle className="w-4 h-4" />
            <span>快速添加标签</span>
            <ChevronDown className="w-4 h-4" />
          </button>
          {showQuickAddMenu && (
            <>
              <div
                className="fixed inset-0 z-[45]"
                onClick={() => setShowQuickAddMenu(false)}
              />
              <div className="absolute bottom-full left-0 mb-2 w-48 bg-white border rounded-lg shadow-lg z-[60]">
                <div className="py-1">
                  {availableTagTypes.map((tagType) => (
                    <button
                      key={tagType.value}
                      type="button"
                      onClick={() => handleQuickAddClick(tagType.value)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {tagType.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedTag &&
            !showFormattingView &&
            selectedTag.type !== 'image' &&
            selectedTag.type !== 'cda-image' &&
            (selectedTag.type === 'date' ||
              selectedTag.type === 'datetime' ||
              selectedTag.type === 'number' ||
              selectedTag.type === 'boolean') && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // 立即设置状态，避免全局监听器关闭弹窗
                  formattingViewRef.current = true;
                  setShowFormattingView(true);
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="p-2 text-gray-400 hover:text-primary-600 rounded border border-gray-300 hover:border-primary-600 transition-colors"
                title="格式化设置"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          {selectedTag && (
            <button
              type="button"
              onClick={() => onApplyTag(selectedTag, currentFormatting)}
              className="px-4 py-2 bg-primary-600 text-white text-sm rounded hover:bg-primary-700"
            >
              确定
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

