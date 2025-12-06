'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Trash2, Calendar, Clock, MapPin, ToggleLeft, ToggleRight, Image as ImageIcon, Upload } from 'lucide-react';
import Modal from './Modal';
import imageCompression from 'browser-image-compression';

export interface TemplateTag {
  _id?: string;
  name: string;
  description?: string;
  type: 'text' | 'number' | 'date' | 'datetime' | 'location' | 'boolean' | 'image' | 'cda-image';
  value: any;
}

interface TemplateTagListProps {
  tags: TemplateTag[];
  onChange: (tags: TemplateTag[]) => void;
  templateId: string;
}

export default function TemplateTagList({ tags, onChange, templateId }: TemplateTagListProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTag, setEditingTag] = useState<TemplateTag | null>(null);
  const [isUploading, setIsUploading] = useState<string | null>(null);

  const handleAddTag = () => {
    setEditingTag({
      name: '',
      description: '',
      type: 'text',
      value: '',
    });
    setShowAddModal(true);
  };

  const handleEditTag = (tag: TemplateTag) => {
    setEditingTag({ ...tag });
    setShowAddModal(true);
  };

  const handleSaveTag = (tag: TemplateTag) => {
    const newTags = editingTag?._id
      ? tags.map((t) => (t._id === editingTag._id ? tag : t))
      : [...tags, { ...tag, _id: `temp_${Date.now()}` }];
    onChange(newTags);
    setShowAddModal(false);
    setEditingTag(null);
  };

  const handleDeleteTag = (tagId: string | undefined) => {
    if (!tagId) return;
    const newTags = tags.filter((t) => t._id !== tagId);
    onChange(newTags);
  };

  const handleTagValueChange = (tagId: string | undefined, value: any) => {
    if (!tagId) return;
    const newTags = tags.map((t) => (t._id === tagId ? { ...t, value } : t));
    onChange(newTags);
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
        return (
          <div className="relative">
            <input
              type="date"
              value={tag.value || ''}
              onChange={(e) => {
                const date = e.target.value;
                if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
                  handleTagValueChange(tagId, date);
                }
              }}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <Calendar className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        );

      case 'datetime':
        // 将 YYYY-MM-DD HH:MM 格式转换为 datetime-local 需要的格式
        const getDateTimeLocalValue = (value: string) => {
          if (!value) return '';
          // 如果已经是 YYYY-MM-DD HH:MM 格式，转换为 datetime-local 格式
          if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) {
            return value.replace(' ', 'T');
          }
          return value;
        };
        return (
          <div className="relative">
            <input
              type="datetime-local"
              value={getDateTimeLocalValue(tag.value || '')}
              onChange={(e) => {
                const datetime = e.target.value;
                if (datetime) {
                  // 转换为 YYYY-MM-DD HH:MM 格式
                  const date = new Date(datetime);
                  if (!isNaN(date.getTime())) {
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    handleTagValueChange(tagId, `${year}-${month}-${day} ${hours}:${minutes}`);
                  }
                } else {
                  handleTagValueChange(tagId, '');
                }
              }}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <Clock className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
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

  return (
    <div className="h-full flex flex-col bg-white border-l">
      <div className="px-4 py-3 border-b bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-800">标签列表</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {tags.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            暂无标签，点击下方按钮添加
          </div>
        ) : (
          tags.map((tag) => (
            <div key={tag._id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-gray-800">{tag.name}</h4>
                  {tag.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{tag.description}</p>
                  )}
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={() => handleEditTag(tag)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                    title="编辑"
                  >
                    <span className="text-xs">编辑</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTag(tag._id)}
                    className="p-1 text-red-400 hover:text-red-600"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div>{renderTagInput(tag)}</div>
            </div>
          ))
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
        const newValues = [...new Set([...value, ...parsed])];
        onChange(newValues);
        setInputValue('');
      }
    }
  };

  const handleRemove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
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
        {value.map((location, index) => (
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

