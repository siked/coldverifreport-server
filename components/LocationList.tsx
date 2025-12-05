'use client';

import { useState } from 'react';
import { Plus, X, Trash2, Edit2 } from 'lucide-react';

interface LocationListProps {
  locations: string; // 用 | 分割的字符串
  onChange: (locations: string) => void;
  templateId: string;
}

export default function LocationList({ locations, onChange, templateId }: LocationListProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');

  // 将字符串转换为数组
  const locationArray = locations ? locations.split('|').filter((loc) => loc.trim()) : [];

  // 将数组转换为字符串
  const arrayToString = (arr: string[]) => {
    return arr.filter((loc) => loc.trim()).join('|');
  };

  const handleAdd = () => {
    const newLocation = '新布点区域';
    const newArray = [...locationArray, newLocation];
    onChange(arrayToString(newArray));
    setEditingIndex(newArray.length - 1);
    setEditingValue(newLocation);
  };

  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setEditingValue(locationArray[index]);
  };

  const handleSave = (index: number) => {
    if (!editingValue.trim()) {
      alert('布点区域名称不能为空');
      return;
    }
    const newArray = [...locationArray];
    newArray[index] = editingValue.trim();
    onChange(arrayToString(newArray));
    setEditingIndex(null);
    setEditingValue('');
  };

  const handleDelete = (index: number) => {
    if (confirm('确定要删除这个布点区域吗？')) {
      const newArray = locationArray.filter((_, i) => i !== index);
      onChange(arrayToString(newArray));
    }
  };

  const handleCancel = () => {
    setEditingIndex(null);
    setEditingValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter') {
      handleSave(index);
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="px-4 py-3 border-b bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-800">布点区域列表</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {locationArray.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            暂无布点区域，点击下方按钮添加
          </div>
        ) : (
          locationArray.map((location, index) => (
            <div
              key={index}
              className="border rounded-lg p-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              {editingIndex === index ? (
                <input
                  type="text"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={() => handleSave(index)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  className="flex-1 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-800">{location}</span>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => handleEdit(index)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                      title="编辑"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(index)}
                      className="p-1 text-red-400 hover:text-red-600"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
      <div className="px-4 py-3 border-t bg-gray-50">
        <button
          type="button"
          onClick={handleAdd}
          className="w-full px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 flex items-center justify-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>添加布点区域</span>
        </button>
      </div>
    </div>
  );
}

