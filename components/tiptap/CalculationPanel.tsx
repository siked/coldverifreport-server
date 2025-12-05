import { X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import type { TemplateTag } from '../TemplateTagList';

export type CalculationType =
  | 'add' // 加法
  | 'subtract' // 减法
  | 'multiply' // 乘法
  | 'divide' // 除法
  | 'modulo' // 取余
  | 'floor' // 取整
  | 'abs' // 取绝对值
  | 'max' // 取最大值
  | 'min'; // 取最小值

export type CalculationDataSource = {
  type: 'calculation';
  calculationType: CalculationType;
  tagId1: string;
  tagId2?: string; // 对于单标签运算，此字段为空
  tagName1: string;
  tagName2?: string;
  decimals: number;
  value: string;
};

interface CalculationPanelProps {
  position: { left: number; top: number };
  targetType: 'text' | 'image';
  tags: TemplateTag[];
  onApply: (data: CalculationDataSource) => void;
  onClose: () => void;
  existingSource?: CalculationDataSource | null;
}

const CALCULATION_TYPES: Array<{
  value: CalculationType;
  label: string;
  requiresTwoTags: boolean;
}> = [
  { value: 'add', label: '加法', requiresTwoTags: true },
  { value: 'subtract', label: '减法', requiresTwoTags: true },
  { value: 'multiply', label: '乘法', requiresTwoTags: true },
  { value: 'divide', label: '除法', requiresTwoTags: true },
  { value: 'modulo', label: '取余', requiresTwoTags: true },
  { value: 'floor', label: '取整', requiresTwoTags: false },
  { value: 'abs', label: '取绝对值', requiresTwoTags: false },
  { value: 'max', label: '取最大值', requiresTwoTags: true },
  { value: 'min', label: '取最小值', requiresTwoTags: true },
];

export default function CalculationPanel({
  position,
  targetType,
  tags,
  onApply,
  onClose,
  existingSource,
}: CalculationPanelProps) {
  const DEFAULT_DECIMALS = 1;

  const [calculationType, setCalculationType] = useState<CalculationType>('add');
  const [selectedTagId1, setSelectedTagId1] = useState<string>('');
  const [selectedTagId2, setSelectedTagId2] = useState<string>('');
  const [decimals, setDecimals] = useState(DEFAULT_DECIMALS);

  // 过滤出数字类型的标签
  const numberTags = useMemo(
    () => tags.filter((tag) => tag.type === 'number'),
    [tags]
  );

  // 初始化已有数据源
  useEffect(() => {
    if (existingSource) {
      setCalculationType(existingSource.calculationType);
      setSelectedTagId1(existingSource.tagId1);
      setSelectedTagId2(existingSource.tagId2 || '');
      setDecimals(existingSource.decimals);
      return;
    }
    // 默认选择第一个数字标签
    if (numberTags.length > 0) {
      setSelectedTagId1(numberTags[0]._id || '');
      if (numberTags.length > 1) {
        setSelectedTagId2(numberTags[1]._id || '');
      }
    }
  }, [existingSource, numberTags]);

  // 当运算类型改变时，如果没有第二个标签且需要两个标签，尝试选择第二个标签
  useEffect(() => {
    const calcConfig = CALCULATION_TYPES.find((c) => c.value === calculationType);
    if (calcConfig?.requiresTwoTags && !selectedTagId2 && numberTags.length > 1) {
      const availableTag = numberTags.find((tag) => tag._id !== selectedTagId1);
      if (availableTag) {
        setSelectedTagId2(availableTag._id || '');
      }
    }
  }, [calculationType, selectedTagId1, selectedTagId2, numberTags]);

  const selectedTag1 = useMemo(
    () => numberTags.find((tag) => tag._id === selectedTagId1),
    [numberTags, selectedTagId1]
  );

  const selectedTag2 = useMemo(
    () => numberTags.find((tag) => tag._id === selectedTagId2),
    [numberTags, selectedTagId2]
  );

  const currentCalcConfig = useMemo(
    () => CALCULATION_TYPES.find((c) => c.value === calculationType),
    [calculationType]
  );

  // 计算预览值
  const previewValue = useMemo(() => {
    if (!selectedTag1) return '';

    const val1 = typeof selectedTag1.value === 'number' ? selectedTag1.value : Number(selectedTag1.value);
    if (Number.isNaN(val1)) return '无效数值';

    if (currentCalcConfig?.requiresTwoTags) {
      if (!selectedTag2) return '请选择第二个标签';
      const val2 = typeof selectedTag2.value === 'number' ? selectedTag2.value : Number(selectedTag2.value);
      if (Number.isNaN(val2)) return '无效数值';

      let result: number;
      switch (calculationType) {
        case 'add':
          result = val1 + val2;
          break;
        case 'subtract':
          result = val1 - val2;
          break;
        case 'multiply':
          result = val1 * val2;
          break;
        case 'divide':
          if (val2 === 0) return '除数不能为0';
          result = val1 / val2;
          break;
        case 'modulo':
          if (val2 === 0) return '除数不能为0';
          result = val1 % val2;
          break;
        case 'max':
          result = Math.max(val1, val2);
          break;
        case 'min':
          result = Math.min(val1, val2);
          break;
        default:
          return '未知运算类型';
      }
      return result.toFixed(decimals);
    } else {
      let result: number;
      switch (calculationType) {
        case 'floor':
          result = Math.floor(val1);
          break;
        case 'abs':
          result = Math.abs(val1);
          break;
        default:
          return '未知运算类型';
      }
      return result.toFixed(decimals);
    }
  }, [selectedTag1, selectedTag2, calculationType, decimals, currentCalcConfig]);

  const handleApply = () => {
    if (!selectedTag1) {
      alert('请选择第一个标签');
      return;
    }

    if (currentCalcConfig?.requiresTwoTags && !selectedTag2) {
      alert('请选择第二个标签');
      return;
    }

    const data: CalculationDataSource = {
      type: 'calculation',
      calculationType,
      tagId1: selectedTag1._id || '',
      tagId2: currentCalcConfig?.requiresTwoTags ? selectedTag2?._id : undefined,
      tagName1: selectedTag1.name,
      tagName2: currentCalcConfig?.requiresTwoTags ? selectedTag2?.name : undefined,
      decimals,
      value: previewValue,
    };

    onApply(data);
  };

  return (
    <div
      className="fixed bg-white border rounded-lg shadow-2xl w-[420px] p-4 z-50 data-source-popover"
      style={position}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">运算类</p>
          <p className="text-xs text-gray-500">当前目标：{targetType === 'image' ? '图片' : '文本'}</p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 运算类型选择 */}
      <div className="mb-3">
        <label className="text-xs text-gray-600 mb-2 block">运算类型</label>
        <select
          value={calculationType}
          onChange={(e) => setCalculationType(e.target.value as CalculationType)}
          className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {CALCULATION_TYPES.map((calc) => (
            <option key={calc.value} value={calc.value}>
              {calc.label}
            </option>
          ))}
        </select>
      </div>

      {/* 标签选择 */}
      <div className="mb-3 space-y-3">
        <div>
          <label className="text-xs text-gray-600 mb-2 block">第一个标签（数字类型）</label>
          <select
            value={selectedTagId1}
            onChange={(e) => setSelectedTagId1(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">请选择标签</option>
            {numberTags.map((tag) => (
              <option key={tag._id} value={tag._id}>
                {tag.name} ({tag.type}) - {tag.value}
              </option>
            ))}
          </select>
        </div>

        {currentCalcConfig?.requiresTwoTags && (
          <div>
            <label className="text-xs text-gray-600 mb-2 block">第二个标签（数字类型）</label>
            <select
              value={selectedTagId2}
              onChange={(e) => setSelectedTagId2(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">请选择标签</option>
              {numberTags
                .filter((tag) => tag._id !== selectedTagId1)
                .map((tag) => (
                  <option key={tag._id} value={tag._id}>
                    {tag.name} ({tag.type}) - {tag.value}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      {/* 小数位数设置 */}
      <div className="mb-3">
        <label className="text-xs text-gray-600 mb-2 block">保留小数位数</label>
        <input
          type="number"
          min={0}
          max={10}
          value={decimals}
          onChange={(e) => {
            const val = Number(e.target.value);
            if (!Number.isNaN(val) && val >= 0 && val <= 10) {
              setDecimals(val);
            }
          }}
          className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* 预览 */}
      <div className="mb-3 p-3 border rounded space-y-2 bg-gray-50">
        <div>
          <p className="text-xs text-gray-500 mb-1">预览</p>
          <div className="px-3 py-2 bg-white border rounded text-sm text-gray-800">
            {previewValue || '无内容'}
          </div>
        </div>
        {selectedTag1 && (
          <div className="text-xs text-gray-500">
            <div>
              标签1: {selectedTag1.name} = {selectedTag1.value}
            </div>
            {selectedTag2 && (
              <div>
                标签2: {selectedTag2.name} = {selectedTag2.value}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleApply}
          className="px-4 py-2 bg-primary-600 text-white text-sm rounded hover:bg-primary-700"
        >
          应用到{targetType === 'image' ? '图片' : '文本'}
        </button>
      </div>
    </div>
  );
}

