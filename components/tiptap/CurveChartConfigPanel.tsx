'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { X, Plus, Trash2, TrendingUp } from 'lucide-react';
import type { TemplateTag } from '../TemplateTagList';

export interface CurveLine {
  id: string;
  type: 'curve' | 'average' | 'line';
  // 曲线参数
  locationTags?: string[]; // 布点标签ID数组
  // 平均值曲线参数
  averageLocationTags?: string[]; // 布点标签ID数组
  averageColor?: string; // 线条颜色
  // 直线参数
  lineName?: string; // 线条名称
  lineColor?: string; // 线条颜色
  lineValue?: number; // 固定值
  lineNote?: string; // 线条备注
  // 通用参数
  lineWidth: number; // 线条宽度
  lineStyle: 'solid' | 'dashed' | 'dotted'; // 线条样式
}

export interface CurveChartConfig {
  startTimeTagId: string; // 开始时间标签ID
  endTimeTagId: string; // 结束时间标签ID
  startTimeOffsetMinutes?: number; // 开始时间偏移（分钟），向前偏移（减去）
  endTimeOffsetMinutes?: number; // 结束时间偏移（分钟），向后偏移（加上）
  dataType: 'temperature' | 'humidity'; // 温度或湿度
  title?: string; // 曲线图标题
  lines: CurveLine[]; // 线条配置
}

interface CurveChartConfigPanelProps {
  position: { left: number; top: number };
  tags: TemplateTag[];
  selectedTaskId: string | null;
  config: CurveChartConfig | null;
  onChange: (config: CurveChartConfig) => void;
  onApply: () => void;
  onClose: () => void;
}

export default function CurveChartConfigPanel({
  position,
  tags,
  selectedTaskId,
  config,
  onChange,
  onApply,
  onClose,
}: CurveChartConfigPanelProps) {
  const [localConfig, setLocalConfig] = useState<CurveChartConfig>(
    config || {
      startTimeTagId: '',
      endTimeTagId: '',
      startTimeOffsetMinutes: 0,
      endTimeOffsetMinutes: 0,
      dataType: 'temperature',
      title: '',
      lines: [],
    }
  );

  // 同步外部 config 的变化
  useEffect(() => {
    if (config) {
      setLocalConfig(config);
    }
  }, [config]);
  const [showAddLineMenu, setShowAddLineMenu] = useState(false);
  const [editingLine, setEditingLine] = useState<CurveLine | null>(null);
  const [showLineForm, setShowLineForm] = useState<'curve' | 'average' | 'line' | null>(null);
  const addLineMenuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const isPositionAdjustedRef = useRef(false); // 标记是否已经调整过位置
  const adjustedPositionRef = useRef(position); // 使用 ref 存储调整后的位置，避免依赖项问题

  // 获取日期时间类型的标签
  const dateTimeTags = useMemo(
    () => tags.filter((tag) => tag.type === 'date' || tag.type === 'datetime'),
    [tags]
  );

  // 获取布点区域类型的标签
  const locationTags = useMemo(
    () => tags.filter((tag) => tag.type === 'location'),
    [tags]
  );

  const updateConfig = (updates: Partial<CurveChartConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);
    onChange(newConfig);
  };

  const handleAddLine = (type: 'curve' | 'average' | 'line') => {
    const newLine: CurveLine = {
      id: `line_${Date.now()}`,
      type,
      lineWidth: type === 'line' ? 2 : 2,
      lineStyle: type === 'line' ? 'dashed' : 'solid',
      ...(type === 'curve' && { locationTags: [] }),
      ...(type === 'average' && { averageLocationTags: [], averageColor: '#3b82f6' }),
      ...(type === 'line' && { lineName: '直线1', lineColor: '#ef4444', lineValue: 0, lineNote: '' }),
    };
    setEditingLine(newLine);
    setShowLineForm(type);
    setShowAddLineMenu(false);
  };

  const handleEditLine = (line: CurveLine) => {
    setEditingLine({ ...line });
    setShowLineForm(line.type);
  };

  const handleSaveLine = () => {
    if (!editingLine) return;

    // 验证直线类型的固定值
    if (editingLine.type === 'line' && (editingLine.lineValue === undefined || editingLine.lineValue === null)) {
      alert('请填写固定值');
      return;
    }

    // 创建线条的深拷贝，确保所有属性都被正确保存
    const lineToSave: CurveLine = {
      id: editingLine.id || `line_${Date.now()}`,
      type: editingLine.type,
      lineWidth: editingLine.lineWidth,
      lineStyle: editingLine.lineStyle,
      ...(editingLine.type === 'curve' && { locationTags: editingLine.locationTags || [] }),
      ...(editingLine.type === 'average' && { 
        averageLocationTags: editingLine.averageLocationTags || [],
        averageColor: editingLine.averageColor || '#3b82f6'
      }),
      ...(editingLine.type === 'line' && { 
        lineName: editingLine.lineName || '直线1',
        lineColor: editingLine.lineColor || '#ef4444',
        lineValue: editingLine.lineValue,
        lineNote: editingLine.lineNote || ''
      }),
    };

    const updatedLines = lineToSave.id && localConfig.lines.some(line => line.id === lineToSave.id)
      ? localConfig.lines.map((line) => (line.id === lineToSave.id ? lineToSave : line))
      : [...localConfig.lines, lineToSave];

    updateConfig({ lines: updatedLines });
    setEditingLine(null);
    setShowLineForm(null);
  };

  const handleDeleteLine = (lineId: string) => {
    updateConfig({
      lines: localConfig.lines.filter((line) => line.id !== lineId),
    });
  };


  const getLocationTagValues = (tagIds: string[]): string[] => {
    const values: string[] = [];
    tagIds.forEach((tagId) => {
      const tag = tags.find((t) => t._id === tagId);
      if (tag && tag.type === 'location' && Array.isArray(tag.value)) {
        values.push(...tag.value);
      }
    });
    return Array.from(new Set(values));
  };

  const validateConfig = (): string | null => {
    if (!selectedTaskId) {
      return '请先关联任务';
    }
    if (!localConfig.startTimeTagId) {
      return '请选择开始时间标签';
    }
    if (!localConfig.endTimeTagId) {
      return '请选择结束时间标签';
    }
    if (localConfig.lines.length === 0) {
      return '请至少添加一条线条';
    }
    for (const line of localConfig.lines) {
      if (line.type === 'curve' && (!line.locationTags || line.locationTags.length === 0)) {
        return '曲线参数：请选择布点标签';
      }
      if (line.type === 'average' && (!line.averageLocationTags || line.averageLocationTags.length === 0)) {
        return '平均值曲线参数：请选择布点标签';
      }
      if (line.type === 'line' && (line.lineValue === undefined || line.lineValue === null)) {
        return '直线参数：请填写固定值';
      }
      const locationValues =
        line.type === 'curve'
          ? getLocationTagValues(line.locationTags || [])
          : line.type === 'average'
          ? getLocationTagValues(line.averageLocationTags || [])
          : [];
      if (locationValues.length === 0 && line.type !== 'line') {
        return `${line.type === 'curve' ? '曲线' : '平均值曲线'}参数：所选标签的值不能为空`;
      }
    }
    return null;
  };

  const handleApply = () => {
    const error = validateConfig();
    if (error) {
      alert(error);
      return;
    }
    onApply();
  };

  // 自适应弹窗位置，避免超出视口
  useEffect(() => {
    // 如果 position 变化，重置调整标记
    isPositionAdjustedRef.current = false;
    adjustedPositionRef.current = position;
    setAdjustedPosition(position);
  }, [position]);

  // 在弹窗渲染后，计算并调整位置（只执行一次）
  useEffect(() => {
    if (!panelRef.current || isPositionAdjustedRef.current) return;

    const adjustPosition = () => {
      if (!panelRef.current) return;
      
      const panel = panelRef.current;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const margin = 10; // 距离视口边缘的最小距离

      // 获取弹窗的实际尺寸
      const panelWidth = panel.offsetWidth || 500;
      const panelHeight = panel.offsetHeight || 400;

      let newTop = position.top;
      let newLeft = position.left;

      // 检查是否超出视口底部
      const estimatedBottom = position.top + panelHeight;
      if (estimatedBottom > viewportHeight - margin) {
        // 向上调整，确保弹窗完全显示
        newTop = viewportHeight - panelHeight - margin;
        // 如果调整后超出顶部，则从顶部开始显示
        if (newTop < margin) {
          newTop = margin;
        }
      }

      // 检查是否超出视口顶部
      if (position.top < margin) {
        newTop = margin;
      }

      // 检查是否超出视口右侧
      const estimatedRight = position.left + panelWidth;
      if (estimatedRight > viewportWidth - margin) {
        newLeft = viewportWidth - panelWidth - margin;
      }

      // 检查是否超出视口左侧
      if (position.left < margin) {
        newLeft = margin;
      }

      // 只有当位置需要调整时才更新
      if (newTop !== position.top || newLeft !== position.left) {
        const newPos = { left: newLeft, top: newTop };
        adjustedPositionRef.current = newPos;
        setAdjustedPosition(newPos);
      }
      isPositionAdjustedRef.current = true;
    };

    // 使用 requestAnimationFrame 确保在 DOM 完全渲染后计算
    const rafId = requestAnimationFrame(() => {
      // 再延迟一帧，确保尺寸已计算
      requestAnimationFrame(() => {
        adjustPosition();
      });
    });

    // 监听窗口大小变化（只在窗口大小变化时重新调整）
    const handleResize = () => {
      if (panelRef.current) {
        const panel = panelRef.current;
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const margin = 10;
        const panelHeight = panel.offsetHeight || 400;
        const panelWidth = panel.offsetWidth || 500;

        const currentPos = adjustedPositionRef.current;
        let newTop = currentPos.top;
        let newLeft = currentPos.left;

        // 检查是否需要调整
        if (currentPos.top + panelHeight > viewportHeight - margin) {
          newTop = viewportHeight - panelHeight - margin;
          if (newTop < margin) newTop = margin;
        }
        if (currentPos.top < margin) {
          newTop = margin;
        }
        if (currentPos.left + panelWidth > viewportWidth - margin) {
          newLeft = viewportWidth - panelWidth - margin;
        }
        if (currentPos.left < margin) {
          newLeft = margin;
        }

        if (newTop !== currentPos.top || newLeft !== currentPos.left) {
          const newPos = { left: newLeft, top: newTop };
          adjustedPositionRef.current = newPos;
          setAdjustedPosition(newPos);
        }
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, [position]); // 只依赖 position，避免内容变化时重新计算

  // 同步外部 position 的变化
  useEffect(() => {
    setAdjustedPosition(position);
  }, [position]);

  // 点击外部关闭添加线条菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addLineMenuRef.current && !addLineMenuRef.current.contains(event.target as Node)) {
        setShowAddLineMenu(false);
      }
    };

    if (showAddLineMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showAddLineMenu]);

  return (
    <>
    <div
      ref={panelRef}
      className="fixed bg-white border rounded-lg shadow-2xl w-[500px] max-h-[90vh] overflow-y-auto z-50 data-source-popover"
      style={adjustedPosition}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
        <div>
          <p className="text-sm font-semibold text-gray-800">曲线图配置</p>
          <p className="text-xs text-gray-500">配置曲线图参数</p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {!selectedTaskId && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
            <p className="text-sm text-yellow-800">
              请先在模板中关联任务，才能使用曲线图功能
            </p>
          </div>
        )}

        {/* 曲线图标题 */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">曲线图标题</label>
          <input
            type="text"
            value={localConfig.title || ''}
            onChange={(e) => updateConfig({ title: e.target.value })}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            disabled={!selectedTaskId}
            placeholder={`${localConfig.dataType === 'temperature' ? '温度' : '湿度'}曲线图`}
          />
          <p className="text-xs text-gray-400 mt-1">留空则使用默认标题</p>
        </div>
        {/* 开始时间标签 */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            选择开始时间 <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center space-x-2">
            <select
              value={localConfig.startTimeTagId}
              onChange={(e) => updateConfig({ startTimeTagId: e.target.value })}
              className="flex-1 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={!selectedTaskId}
            >
              <option value="">请选择标签（类型为日期、时间）</option>
              {dateTimeTags.map((tag) => (
                <option key={tag._id} value={tag._id}>
                  {tag.name} ({tag.type === 'date' ? '日期' : '时间'})
                </option>
              ))}
            </select>
            <div className="flex items-center space-x-1 w-32">
              <label className="text-xs text-gray-500 whitespace-nowrap">偏移（分钟）</label>
              <input
                type="number"
                step="1"
                value={localConfig.startTimeOffsetMinutes !== undefined ? localConfig.startTimeOffsetMinutes : 0}
                onChange={(e) => {
                  const value = e.target.value === '' ? 0 : parseInt(e.target.value);
                  updateConfig({ startTimeOffsetMinutes: isNaN(value) ? 0 : value });
                }}
                className="w-16 px-2 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={!selectedTaskId}
                placeholder="0"
                title="向前偏移（减去）"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">开始时间向前偏移（减去）</p>
        </div>

        {/* 结束时间标签 */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            选择结束时间 <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center space-x-2">
            <select
              value={localConfig.endTimeTagId}
              onChange={(e) => updateConfig({ endTimeTagId: e.target.value })}
              className="flex-1 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={!selectedTaskId}
            >
              <option value="">请选择标签（类型为日期、时间）</option>
              {dateTimeTags.map((tag) => (
                <option key={tag._id} value={tag._id}>
                  {tag.name} ({tag.type === 'date' ? '日期' : '时间'})
                </option>
              ))}
            </select>
            <div className="flex items-center space-x-1 w-32">
              <label className="text-xs text-gray-500 whitespace-nowrap">偏移（分钟）</label>
              <input
                type="number"
                step="1"
                value={localConfig.endTimeOffsetMinutes !== undefined ? localConfig.endTimeOffsetMinutes : 0}
                onChange={(e) => {
                  const value = e.target.value === '' ? 0 : parseInt(e.target.value);
                  updateConfig({ endTimeOffsetMinutes: isNaN(value) ? 0 : value });
                }}
                className="w-16 px-2 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={!selectedTaskId}
                placeholder="0"
                title="向后偏移（加上）"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">结束时间向后偏移（加上）</p>
        </div>

        {/* 温度、湿度选择 */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">数据类型</label>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => updateConfig({ dataType: 'temperature' })}
              className={`flex-1 px-3 py-2 rounded text-sm ${
                localConfig.dataType === 'temperature'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              disabled={!selectedTaskId}
            >
              温度
            </button>
            <button
              type="button"
              onClick={() => updateConfig({ dataType: 'humidity' })}
              className={`flex-1 px-3 py-2 rounded text-sm ${
                localConfig.dataType === 'humidity'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              disabled={!selectedTaskId}
            >
              湿度
            </button>
          </div>
        </div>


        {/* 线条列表 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs text-gray-500">线条配置</label>
            <div className="relative" ref={addLineMenuRef} data-curve-chart-add-line="true">
              <button
                type="button"
                data-curve-chart-add-line-button="true"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setShowAddLineMenu(!showAddLineMenu);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                disabled={!selectedTaskId}
                className="inline-flex items-center space-x-1 px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                <span>添加线条</span>
              </button>
              {showAddLineMenu && (
                <div
                  className="absolute right-0 mt-1 bg-white border rounded-lg shadow-lg py-1 z-20 min-w-[180px] data-source-popover"
                  data-curve-chart-add-line-menu="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleAddLine('curve');
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span>添加曲线参数</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleAddLine('average');
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span>添加平均值曲线参数</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleAddLine('line');
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span>添加直线参数</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {localConfig.lines.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">暂无线条，请点击"添加线条"添加</p>
          ) : (
            <div className="space-y-2">
              {localConfig.lines.map((line) => (
                <div
                  key={line.id}
                  className="border rounded p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      {line.type === 'curve'
                        ? '曲线'
                        : line.type === 'average'
                        ? '平均值曲线'
                        : line.lineName || '直线'}
                    </span>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleEditLine(line)}
                        className="text-xs text-primary-600 hover:text-primary-700"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteLine(line.id)}
                        className="text-xs text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                    {line.type === 'curve' && (
                      <p>
                        布点标签：
                        {line.locationTags && line.locationTags.length > 0
                          ? getLocationTagValues(line.locationTags).join(' | ')
                          : '未选择'}
                      </p>
                    )}
                    {line.type === 'average' && (
                      <>
                        <p>
                          布点标签：
                          {line.averageLocationTags && line.averageLocationTags.length > 0
                            ? getLocationTagValues(line.averageLocationTags).join(' | ')
                            : '未选择'}
                        </p>
                        <p>颜色：{line.averageColor}</p>
                      </>
                    )}
                    {line.type === 'line' && (
                      <>
                        <p>名称：{line.lineName}</p>
                        <p>颜色：{line.lineColor}</p>
                        <p>固定值：{line.lineValue !== undefined ? line.lineValue : '未设置'}</p>
                        {line.lineNote && <p>备注：{line.lineNote}</p>}
                      </>
                    )}
                    <p>
                      宽度：{line.lineWidth} | 样式：
                      {line.lineStyle === 'solid' ? '实线' : line.lineStyle === 'dashed' ? '虚线' : '点线'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end space-x-2 pt-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border rounded text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!selectedTaskId}
            className="px-4 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            应用
          </button>
        </div>
      </div>
    </div>

    {/* 线条编辑表单 - 独立弹窗 */}
    {showLineForm && editingLine && (
      <div 
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 data-source-popover"
        data-curve-chart-line-form="true"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowLineForm(null);
            setEditingLine(null);
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div 
          className="bg-white rounded-lg shadow-2xl w-[500px] max-h-[90vh] overflow-y-auto p-6 data-source-popover"
          data-curve-chart-line-form-content="true"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-lg font-semibold text-gray-800">
              {editingLine.type === 'curve'
                ? '添加曲线参数'
                : editingLine.type === 'average'
                ? '添加平均值曲线参数'
                : '添加直线参数'}
            </p>
            <button
              type="button"
              onClick={() => {
                setShowLineForm(null);
                setEditingLine(null);
              }}
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-4">
            {editingLine.type === 'curve' && (
              <>
                <div
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  data-curve-chart-line-form-content="true"
                >
                <label className="block text-xs text-gray-500 mb-1">
                  选择布点标签 <span className="text-red-500">*</span>
                </label>
                <select
                  multiple
                  value={editingLine.locationTags || []}
                  onChange={(e) => {
                    e.stopPropagation();
                    const selected = Array.from(e.target.selectedOptions, (option) => option.value);
                    setEditingLine({ ...editingLine, locationTags: selected });
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  onFocus={(e) => e.stopPropagation()}
                  onBlur={(e) => e.stopPropagation()}
                  className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  size={4}
                  data-curve-chart-line-form-content="true"
                >
                  {locationTags.map((tag) => (
                    <option key={tag._id} value={tag._id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">支持多选，多个布点用 | 分割</p>
                {editingLine.locationTags && editingLine.locationTags.length > 0 && (
                  <div className="mt-2 p-2 bg-gray-50 border rounded text-xs">
                    <p className="text-gray-600 mb-1 font-medium">已选布点值（去重后）：</p>
                    <p className="text-gray-800">
                      {getLocationTagValues(editingLine.locationTags).join(' | ') || '无'}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">线条宽度</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={editingLine.lineWidth}
                  onChange={(e) =>
                    setEditingLine({ ...editingLine, lineWidth: parseInt(e.target.value) || 2 })
                  }
                  className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">线条样式</label>
                <select
                  value={editingLine.lineStyle}
                  onChange={(e) =>
                    setEditingLine({
                      ...editingLine,
                      lineStyle: e.target.value as 'solid' | 'dashed' | 'dotted',
                    })
                  }
                  className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="solid">实线</option>
                  <option value="dashed">虚线</option>
                  <option value="dotted">点线</option>
                </select>
              </div>
            </>
            )}

            {editingLine.type === 'average' && (
              <>
                <div
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  data-curve-chart-line-form-content="true"
                >
                <label className="block text-xs text-gray-500 mb-1">
                  选择布点标签 <span className="text-red-500">*</span>
                </label>
                <select
                  multiple
                  value={editingLine.averageLocationTags || []}
                  onChange={(e) => {
                    e.stopPropagation();
                    const selected = Array.from(e.target.selectedOptions, (option) => option.value);
                    setEditingLine({ ...editingLine, averageLocationTags: selected });
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  onFocus={(e) => e.stopPropagation()}
                  onBlur={(e) => e.stopPropagation()}
                  className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  size={4}
                  data-curve-chart-line-form-content="true"
                >
                  {locationTags.map((tag) => (
                    <option key={tag._id} value={tag._id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">支持多选，多个布点用 | 分割</p>
                {editingLine.averageLocationTags && editingLine.averageLocationTags.length > 0 && (
                  <div className="mt-2 p-2 bg-gray-50 border rounded text-xs">
                    <p className="text-gray-600 mb-1 font-medium">已选布点值（去重后）：</p>
                    <p className="text-gray-800">
                      {getLocationTagValues(editingLine.averageLocationTags).join(' | ') || '无'}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">线条颜色</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={editingLine.averageColor || '#3b82f6'}
                    onChange={(e) => setEditingLine({ ...editingLine, averageColor: e.target.value })}
                    className="w-12 h-8 border rounded"
                  />
                  <input
                    type="text"
                    value={editingLine.averageColor || '#3b82f6'}
                    onChange={(e) => setEditingLine({ ...editingLine, averageColor: e.target.value })}
                    className="flex-1 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">线条宽度</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={editingLine.lineWidth}
                  onChange={(e) =>
                    setEditingLine({ ...editingLine, lineWidth: parseInt(e.target.value) || 2 })
                  }
                  className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">线条样式</label>
                <select
                  value={editingLine.lineStyle}
                  onChange={(e) =>
                    setEditingLine({
                      ...editingLine,
                      lineStyle: e.target.value as 'solid' | 'dashed' | 'dotted',
                    })
                  }
                  className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="solid">实线</option>
                  <option value="dashed">虚线</option>
                  <option value="dotted">点线</option>
                </select>
              </div>
              </>
            )}

            {editingLine.type === 'line' && (
              <>
                <div>
                <label className="block text-xs text-gray-500 mb-1">线条名称</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={editingLine.lineName || '直线1'}
                    onChange={(e) => setEditingLine({ ...editingLine, lineName: e.target.value })}
                    className="flex-1 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    type="button"
                    onClick={() => setEditingLine({ ...editingLine, lineName: '上限' })}
                    className="px-3 py-2 text-sm border rounded text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                  >
                    上限
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingLine({ ...editingLine, lineName: '下限' })}
                    className="px-3 py-2 text-sm border rounded text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                  >
                    下限
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  固定值 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={editingLine.lineValue !== undefined ? editingLine.lineValue : ''}
                  onChange={(e) => {
                    const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                    setEditingLine({ ...editingLine, lineValue: isNaN(value as number) ? undefined : value });
                  }}
                  className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">线条颜色</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={editingLine.lineColor || '#ef4444'}
                    onChange={(e) => setEditingLine({ ...editingLine, lineColor: e.target.value })}
                    className="w-12 h-8 border rounded"
                  />
                  <input
                    type="text"
                    value={editingLine.lineColor || '#ef4444'}
                    onChange={(e) => setEditingLine({ ...editingLine, lineColor: e.target.value })}
                    className="flex-1 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">线条宽度</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={editingLine.lineWidth}
                  onChange={(e) =>
                    setEditingLine({ ...editingLine, lineWidth: parseInt(e.target.value) || 2 })
                  }
                  className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">线条样式</label>
                <select
                  value={editingLine.lineStyle}
                  onChange={(e) =>
                    setEditingLine({
                      ...editingLine,
                      lineStyle: e.target.value as 'solid' | 'dashed' | 'dotted',
                    })
                  }
                  className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="solid">实线</option>
                  <option value="dashed">虚线</option>
                  <option value="dotted">点线</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">线条备注</label>
                <input
                  type="text"
                  value={editingLine.lineNote || ''}
                  onChange={(e) => setEditingLine({ ...editingLine, lineNote: e.target.value })}
                  className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder={`${editingLine.lineName || '直线1'}${editingLine.lineValue !== undefined ? ` ${editingLine.lineValue}` : ''}`}
                />
                <p className="text-xs text-gray-400 mt-1">留空则使用默认值：线条名称+固定值</p>
              </div>
            </>
            )}

            <div className="flex justify-end space-x-2 pt-4 border-t mt-4">
              <button
                type="button"
                onClick={() => {
                  setShowLineForm(null);
                  setEditingLine(null);
                }}
                className="px-4 py-2 text-sm border rounded text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveLine}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
  </>
  );
}

