'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Plus,
  X,
  Trash2,
  Calendar,
  Clock,
  ToggleLeft,
  ToggleRight,
  Upload,
  Copy,
  GripVertical,
  MoreVertical,
  Eye,
  EyeOff,
} from 'lucide-react';
import Modal from './Modal';
import imageCompression from 'browser-image-compression';
import { TagFunctionAction } from './tag-functions/TagFunctionAction';
import type { TagFunctionConfig } from './tag-functions/types';

export interface TemplateTag {
  _id?: string;
  name: string;
  description?: string;
  type: 'text' | 'number' | 'date' | 'datetime' | 'location' | 'boolean' | 'image' | 'cda-image';
  value: any;
  functionConfig?: TagFunctionConfig;
  hidden?: boolean;
}

interface TemplateTagListProps {
  tags: TemplateTag[];
  onChange: (tags: TemplateTag[]) => void;
  templateId: string;
  taskId?: string | null;
}

export default function TemplateTagList({ tags, onChange, templateId, taskId }: TemplateTagListProps) {
  const [tagList, setTagList] = useState<TemplateTag[]>(tags);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTag, setEditingTag] = useState<TemplateTag | null>(null);
  const [isUploading, setIsUploading] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const tagListRef = useRef<TemplateTag[]>(tagList);
  const [textModeTagId, setTextModeTagId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setTagList(tags);
  }, [tags]);

  useEffect(() => {
    tagListRef.current = tagList;
  }, [tagList]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!openMenuId) return;
      const wrapper = document.getElementById(`tag-menu-wrapper-${openMenuId}`);
      if (wrapper && !wrapper.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

  const syncChange = (next: TemplateTag[]) => {
    tagListRef.current = next;
    setTagList(next);
    onChange(next);
  };

  const handleAddTag = () => {
    setEditingTag({
      name: '',
      description: '',
      type: 'text',
      value: '',
      hidden: false,
    });
    setShowAddModal(true);
  };

  const handleEditTag = (tag: TemplateTag) => {
    setEditingTag({ ...tag });
    setShowAddModal(true);
  };

  const handleSaveTag = (tag: TemplateTag) => {
    const newTags = editingTag?._id
      ? tagList.map((t) => (t._id === editingTag._id ? tag : t))
      : [...tagList, { ...tag, _id: `temp_${Date.now()}` }];
    syncChange(newTags);
    setShowAddModal(false);
    setEditingTag(null);
  };

  const handleDeleteTag = (tagId: string | undefined) => {
    if (!tagId) return;
    const newTags = tagList.filter((t) => t._id !== tagId);
    syncChange(newTags);
  };

  const handleTagValueChange = (tagId: string | undefined, value: any) => {
    if (!tagId) return;
    const newTags = tagList.map((t) => (t._id === tagId ? { ...t, value } : t));
    syncChange(newTags);
  };

  const handleFunctionApply = (tagId: string, payload: Partial<TemplateTag>) => {
    if (!tagId) return;
    const newTags = tagList.map((t) => (t._id === tagId ? { ...t, ...payload } : t));
    syncChange(newTags);
  };

  const handleCopyTag = (tagId: string | undefined) => {
    if (!tagId) return;
    const index = tagList.findIndex((t) => t._id === tagId);
    if (index === -1) return;
    const base = tagList[index];
    const copyName = `${base.name} (复制)`;
    const copied: TemplateTag = {
      ...base,
      _id: `temp_${Date.now()}`,
      name: copyName,
    };
    const next = [...tagList];
    next.splice(index + 1, 0, copied);
    syncChange(next);
  };

  const handleToggleHidden = (tagId: string | undefined) => {
    if (!tagId) return;
    const next = tagList.map((t) =>
      t._id === tagId ? { ...t, hidden: !(t.hidden ?? true) } : t
    );
    syncChange(next);
  };

  const handleInlineNameSave = (tagId: string | undefined, name: string) => {
    if (!tagId) return;
    const trimmed = name.trim();
    const next = tagList.map((t) => (t._id === tagId ? { ...t, name: trimmed || t.name } : t));
    syncChange(next);
    setEditingNameId(null);
    setEditingNameValue('');
  };

  const handleDragStart = (e: React.DragEvent, tagId: string | undefined) => {
    if (!tagId) return;
    // 检查是否在弹窗或可交互元素上，如果是则阻止拖拽
    const target = e.target as HTMLElement;
    const selection = window.getSelection()?.toString();
    if (
      target.closest('[role="dialog"]') ||
      target.closest('.fixed') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('select') ||
      target.closest('button') ||
      target.closest('a') ||
      (selection && selection.length > 0)
    ) {
      e.preventDefault();
      return;
    }
    setDraggingId(tagId);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, overId: string | undefined) => {
    e.preventDefault();
    if (!draggingId || !overId || draggingId === overId) return;
    setDragOverId(overId);
  };

  const handleDrop = (overId?: string | null) => {
    if (!draggingId) return;
    const targetId = overId || dragOverId;
    if (!targetId || targetId === draggingId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    const current = [...tagListRef.current];
    const fromIndex = current.findIndex((t) => t._id === draggingId);
    const toIndex = current.findIndex((t) => t._id === targetId);
    if (fromIndex === -1 || toIndex === -1) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    setDraggingId(null);
    setDragOverId(null);
    syncChange(current);
  };

  const normalizeDate = (text: string) => {
    const match = text.trim().match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (!match) return '';
    const [, y, m, d] = match;
    const year = y.padStart(4, '0');
    const month = m.padStart(2, '0');
    const day = d.padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const normalizeDateTime = (text: string) => {
    const trimmed = text.trim().replace('T', ' ');
    const match = trimmed.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::\d{1,2})?/);
    if (!match) return '';
    const [, y, m, d, hh, mm] = match;
    const year = y.padStart(4, '0');
    const month = m.padStart(2, '0');
    const day = d.padStart(2, '0');
    const hour = hh.padStart(2, '0');
    const minute = mm.padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  };

  const toDatetimeLocalValue = (value: string) => {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) {
      return value.replace(' ', 'T');
    }
    return value;
  };

  const handleImageUpload = async (tagId: string | undefined, type: 'image' | 'cda-image') => {
    if (!tagId) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      // 验证文件类型
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        alert('不支持的图片格式，仅支持 JPEG、PNG、GIF、WebP');
        return;
      }

      // 验证文件大小（10MB）
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        alert('图片大小不能超过 10MB');
        return;
      }

      setIsUploading(tagId);
      try {
        // 压缩图片
        const options = {
          maxSizeMB: 0.5,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          fileType: file.type,
        };

        const compressedFile = await imageCompression(file, options);

        // 上传图片
        const formData = new FormData();
        formData.append('file', compressedFile, file.name);

        const xhr = new XMLHttpRequest();
        const promise = new Promise<{ url: string }>((resolve, reject) => {
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText);
                resolve(data);
              } catch (err) {
                reject(new Error('解析响应失败'));
              }
            } else {
              try {
                const data = JSON.parse(xhr.responseText);
                reject(new Error(data.error || '上传失败'));
              } catch {
                reject(new Error(`上传失败: ${xhr.statusText}`));
              }
            }
          });

          xhr.addEventListener('error', () => {
            reject(new Error('网络错误'));
          });

          xhr.addEventListener('abort', () => {
            reject(new Error('上传已取消'));
          });
        });

        xhr.open('POST', '/api/upload/image');
        xhr.send(formData);

        const data = await promise;
        handleTagValueChange(tagId, data.url);
      } catch (err: any) {
        console.error('图片上传失败:', err);
        alert(err.message || '图片上传失败，请重试');
      } finally {
        setIsUploading(null);
        input.value = '';
      }
    };
    input.click();
  };

  const renderTagInput = (tag: TemplateTag) => {
    const tagId = tag._id || '';
    const isUploadingThis = isUploading === tagId;

    switch (tag.type) {
      case 'text':
        return (
          <input
            type="text"
            value={tag.value || ''}
            onChange={(e) => handleTagValueChange(tagId, e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="请输入文本"
          />
        );

      case 'number':
        return (
          <input
            type="number"
            step="0.1"
            value={tag.value || ''}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) {
                handleTagValueChange(tagId, parseFloat(val.toFixed(1)));
              } else if (e.target.value === '') {
                handleTagValueChange(tagId, '');
              }
            }}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="请输入数字（小数点后1位）"
          />
        );

      case 'date':
        const isDateTextMode = textModeTagId === tagId;
        return (
          <div className="relative">
            <input
              type={isDateTextMode ? 'text' : 'date'}
              value={tag.value || ''}
              onChange={(e) => {
                const raw = e.target.value;
                if (isDateTextMode) {
                  const normalized = normalizeDate(raw);
                  if (normalized) {
                    handleTagValueChange(tagId, normalized);
                  } else {
                    handleTagValueChange(tagId, raw);
                  }
                } else {
                  const date = raw;
                  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
                    handleTagValueChange(tagId, date);
                  }
                }
              }}
              onDoubleClick={(e) => {
                setTextModeTagId(tagId);
                (e.target as HTMLInputElement).select();
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                const normalized = normalizeDate(text);
                if (normalized) {
                  e.preventDefault();
                  handleTagValueChange(tagId, normalized);
                  return;
                }
              }}
              onBlur={() => setTextModeTagId((prev) => (prev === tagId ? null : prev))}
              className="w-full px-3 py-2 pr-3 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white appearance-none"
            />
          </div>
        );

      case 'datetime':
        const isDateTimeTextMode = textModeTagId === tagId;
        return (
          <div className="relative">
            <input
              type={isDateTimeTextMode ? 'text' : 'datetime-local'}
              value={isDateTimeTextMode ? (tag.value || '') : toDatetimeLocalValue(tag.value || '')}
              onChange={(e) => {
                const val = e.target.value;
                if (isDateTimeTextMode) {
                  if (!val) {
                    handleTagValueChange(tagId, '');
                    return;
                  }
                  const normalized = normalizeDateTime(val);
                  if (normalized) {
                    handleTagValueChange(tagId, normalized);
                  } else {
                    handleTagValueChange(tagId, val);
                  }
                } else {
                  if (!val) {
                    handleTagValueChange(tagId, '');
                    return;
                  }
                  const normalized = normalizeDateTime(val);
                  if (normalized) {
                    handleTagValueChange(tagId, normalized);
                  }
                }
              }}
              onDoubleClick={(e) => {
                setTextModeTagId(tagId);
                (e.target as HTMLInputElement).select();
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                const normalized = normalizeDateTime(text);
                if (normalized) {
                  e.preventDefault();
                  handleTagValueChange(tagId, normalized);
                }
              }}
              onBlur={() => setTextModeTagId((prev) => (prev === tagId ? null : prev))}
              className="w-full px-3 py-2 pr-3 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white appearance-none"
            />
          </div>
        );

      case 'location':
        return (
          <LocationInput
            value={tag.value || []}
            onChange={(value) => handleTagValueChange(tagId, value)}
          />
        );

      case 'boolean':
        return (
          <button
            type="button"
            onClick={() => handleTagValueChange(tagId, !tag.value)}
            className={`flex items-center space-x-2 px-3 py-2 border rounded text-sm transition-colors ${
              tag.value
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {tag.value ? (
              <>
                <ToggleRight className="w-4 h-4" />
                <span>是</span>
              </>
            ) : (
              <>
                <ToggleLeft className="w-4 h-4" />
                <span>否</span>
              </>
            )}
          </button>
        );

      case 'image':
      case 'cda-image':
        return (
          <div className="space-y-2">
            {tag.value ? (
              <div className="relative">
                <img
                  src={tag.value}
                  alt={tag.name}
                  className="w-full h-32 object-cover rounded border"
                />
                <button
                  type="button"
                  onClick={() => handleTagValueChange(tagId, '')}
                  className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => handleImageUpload(tagId, tag.type as 'image' | 'cda-image')}
              disabled={isUploadingThis}
              className="w-full px-3 py-2 border rounded text-sm flex items-center justify-center space-x-2 hover:bg-gray-50 disabled:opacity-50"
            >
              {isUploadingThis ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                  <span>上传中...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>上传图片</span>
                </>
              )}
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  const filteredTags = searchTerm.trim()
    ? tagList.filter((t) => t.name.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    : tagList;

  return (
    <div className="h-full flex flex-col bg-white border-l">
      <div className="px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center space-x-3">
          <h3 className="text-sm font-semibold text-gray-800">标签列表</h3>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索标签名称"
            className="flex-1 min-w-0 px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredTags.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            {tagList.length === 0 ? '暂无标签，点击下方按钮添加' : '未找到匹配的标签'}
          </div>
        ) : (
          filteredTags.map((tag) => {
            const tagId = tag._id || '';
            // 由于后端目前是 hidden === true 时在任务表格中显示，所以这里把它理解为“已显示”
            const isShownInTable = tag.hidden === true;
            return (
              <div
                key={tag._id}
                className={`border rounded-lg p-3 space-y-2 transition-all duration-200 ${
                  draggingId === tag._id
                    ? 'shadow-md scale-[0.99] opacity-80'
                    : dragOverId === tag._id
                      ? 'border-primary-300 shadow-sm'
                      : 'hover:shadow-sm'
                }`}
                draggable={false}
                onDragOver={(e) => handleDragOver(e, tag._id)}
                onDrop={() => handleDrop(tag._id)}
                onDragEnd={() => handleDrop()}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-2 flex-1 min-w-0">
                    <div
                      className="mt-1 text-gray-400 cursor-grab"
                      draggable={!editingNameId}
                      onDragStart={(e) => handleDragStart(e, tag._id)}
                      onMouseDown={(e) => {
                        // 阻止文本选择
                        if (e.detail > 1) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {editingNameId === tag._id ? (
                        <input
                          type="text"
                          value={editingNameValue}
                          onChange={(e) => setEditingNameValue(e.target.value)}
                          onBlur={() => handleInlineNameSave(tag._id, editingNameValue)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleInlineNameSave(tag._id, editingNameValue);
                            if (e.key === 'Escape') {
                              setEditingNameId(null);
                              setEditingNameValue('');
                            }
                          }}
                          className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                          autoFocus
                        />
                      ) : (
                        <h4
                          className="text-sm font-medium text-gray-800 cursor-text truncate"
                          onDoubleClick={() => {
                            setEditingNameId(tag._id || '');
                            setEditingNameValue(tag.name);
                          }}
                        >
                          {tag.name}
                        </h4>
                      )}
                    {tag.description && (
                      <p
                        className="text-xs text-gray-500 mt-0.5 truncate"
                        title={tag.description}
                      >
                        {tag.description}
                      </p>
                    )}
                    </div>
                  </div>
                  <div
                    id={`tag-menu-wrapper-${tagId}`}
                    className="relative flex items-center"
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleHidden(tag._id)}
                      className="p-1 text-gray-500 hover:text-gray-700 rounded"
                      title={isShownInTable ? '已显示，点击隐藏' : '已隐藏，点击显示'}
                    >
                      {isShownInTable ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <TagFunctionAction
                      tag={tag}
                      allTags={tagList}
                      taskId={taskId}
                      onApply={handleFunctionApply}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setOpenMenuId((prev) => (prev === tagId ? null : tagId || null))
                      }
                      className="p-1 text-gray-500 hover:text-gray-700 rounded"
                      title="更多操作"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {openMenuId === tagId && (
                      <div
                        className="absolute right-0 z-10 mt-1 w-28 rounded border bg-white shadow"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            handleCopyTag(tag._id);
                            setOpenMenuId(null);
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          复制
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleEditTag(tag);
                            setOpenMenuId(null);
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleDeleteTag(tag._id);
                            setOpenMenuId(null);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                        >
                          删除
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div>{renderTagInput(tag)}</div>
              </div>
            );
          })
        )}
      </div>
      <div className="px-4 py-3 border-t bg-gray-50">
        <button
          type="button"
          onClick={handleAddTag}
          className="w-full px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 flex items-center justify-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>添加标签</span>
        </button>
      </div>

      {showAddModal && editingTag && (
        <AddTagModal
          tag={editingTag}
          onSave={handleSaveTag}
          onClose={() => {
            setShowAddModal(false);
            setEditingTag(null);
          }}
        />
      )}
    </div>
  );
}

// 布点区域输入组件
interface LocationInputProps {
  value: string[];
  onChange: (value: string[]) => void;
}

function LocationInput({ value, onChange }: LocationInputProps) {
  const safeValue = Array.isArray(value) ? value : [];
  const [inputValue, setInputValue] = useState('');

  // 解析输入，支持单个ID和范围
  const parseInput = (input: string): string[] => {
    const trimmed = input.trim();
    if (!trimmed) return [];

    // 尝试解析范围格式
    // 格式1: C001 到 C010 或 C001到C010
    const rangePattern1 = /^([A-Za-z]*)(\d+)\s*到\s*([A-Za-z]*)(\d+)$/i;
    const match1 = trimmed.match(rangePattern1);
    if (match1) {
      const [, prefix1, startNumStr, prefix2, endNumStr] = match1;
      const prefix = prefix1 || prefix2 || '';
      const start = parseInt(startNumStr, 10);
      const end = parseInt(endNumStr, 10);
      if (start <= end && start > 0 && end > 0) {
        // 使用起始数字字符串的长度来保持前导0
        const padding = Math.max(startNumStr.length, endNumStr.length);
        return generateRange(prefix, start, end, padding);
      }
    }

    // 格式2: C001-C010
    const rangePattern2 = /^([A-Za-z]*)(\d+)\s*-\s*([A-Za-z]*)(\d+)$/i;
    const match2 = trimmed.match(rangePattern2);
    if (match2) {
      const [, prefix1, startNumStr, prefix2, endNumStr] = match2;
      const prefix = prefix1 || prefix2 || '';
      const start = parseInt(startNumStr, 10);
      const end = parseInt(endNumStr, 10);
      if (start <= end && start > 0 && end > 0) {
        // 使用起始数字字符串的长度来保持前导0
        const padding = Math.max(startNumStr.length, endNumStr.length);
        return generateRange(prefix, start, end, padding);
      }
    }

    // 格式3: 001~010（推断前缀，从已有值中获取或使用空字符串）
    const rangePattern3 = /^(\d+)\s*~\s*(\d+)$/;
    const match3 = trimmed.match(rangePattern3);
    if (match3) {
      const [, startNumStr, endNumStr] = match3;
      const start = parseInt(startNumStr, 10);
      const end = parseInt(endNumStr, 10);
      if (start <= end && start > 0 && end > 0) {
        // 尝试从已有值中推断前缀
        let prefix = '';
        if (value.length > 0) {
          const lastValue = value[value.length - 1];
          const prefixMatch = lastValue.match(/^([A-Za-z]+)/);
          if (prefixMatch) {
            prefix = prefixMatch[1];
          }
        }
        // 使用起始数字字符串的长度来保持前导0
        const padding = Math.max(startNumStr.length, endNumStr.length);
        return generateRange(prefix, start, end, padding);
      }
    }

    // 如果不是范围格式，作为单个ID返回
    return [trimmed];
  };

  // 生成范围数组
  const generateRange = (prefix: string, start: number, end: number, padding: number): string[] => {
    const result: string[] = [];
    for (let i = start; i <= end; i++) {
      // 使用指定的 padding 来保持前导0
      const numStr = i.toString().padStart(padding, '0');
      result.push(`${prefix}${numStr}`);
    }
    return result;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      const parsed = parseInput(inputValue);
      if (parsed.length > 0) {
        // 去重并添加到现有值中
        const newValues = [...new Set([...safeValue, ...parsed])];
        onChange(newValues);
        setInputValue('');
      }
    }
  };

  const handleRemove = (index: number) => {
    onChange(safeValue.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        placeholder="如 C001、C001-C010 按回车"
      />
      <div className="flex flex-wrap gap-2">
        {safeValue.map((location, index) => (
          <div
            key={index}
            className="relative inline-flex items-center px-3 py-1 bg-primary-50 border border-primary-200 rounded text-sm"
          >
            <span>{location}</span>
            <button
              type="button"
              onClick={() => handleRemove(index)}
              className="ml-2 p-0.5 text-primary-600 hover:text-primary-800"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// 添加标签弹窗
interface AddTagModalProps {
  tag: TemplateTag;
  onSave: (tag: TemplateTag) => void;
  onClose: () => void;
}

function AddTagModal({ tag, onSave, onClose }: AddTagModalProps) {
  const [formData, setFormData] = useState<TemplateTag>(tag);

  const tagTypes = [
    { value: 'text', label: '文本' },
    { value: 'number', label: '数字' },
    { value: 'date', label: '日期' },
    { value: 'datetime', label: '时间' },
    { value: 'location', label: '布点区域' },
    { value: 'boolean', label: '布尔' },
    { value: 'image', label: '图片' },
    { value: 'cda-image', label: 'CDA 图片' },
  ] as const;

  const getDefaultValue = (type: TemplateTag['type']) => {
    switch (type) {
      case 'number':
        return 0;
      case 'boolean':
        return false;
      case 'location':
        return [];
      case 'date':
      case 'datetime':
      case 'text':
      case 'image':
      case 'cda-image':
      default:
        return '';
    }
  };

  const handleTypeChange = (type: TemplateTag['type']) => {
    setFormData({
      ...formData,
      type,
      value: getDefaultValue(type),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('请输入标签名称');
      return;
    }
    onSave(formData);
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={tag._id ? '编辑标签' : '添加标签'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            标签名称 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="请输入标签名称"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">标签描述</label>
          <textarea
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="请输入标签描述（可选）"
            rows={2}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            标签类型 <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.type}
            onChange={(e) => handleTypeChange(e.target.value as TemplateTag['type'])}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            required
          >
            {tagTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-end space-x-3 pt-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border rounded text-sm text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-primary-600 text-white rounded text-sm hover:bg-primary-700"
          >
            保存
          </button>
        </div>
      </form>
    </Modal>
  );
}

