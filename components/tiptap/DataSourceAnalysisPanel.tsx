import React, { useMemo, useState, useRef, useEffect } from 'react';
import { AnalysisTableConfig, AnalysisTableType, DeviceAnalysisConfig, DeviceAnalysisField, TerminalBindingConfig } from './analysisTypes';
import type { TemplateTag } from '../TemplateTagList';
import { Database, Layers, Link as LinkIcon, Search, X, Palette, ChevronDown, Timer } from 'lucide-react';

interface DataSourceAnalysisPanelProps {
  tags: TemplateTag[];
  initialConfig?: AnalysisTableConfig | null;
  anchor?: { left: number; top: number };
  onApply: (config: AnalysisTableConfig) => void;
  onCancel: () => void;
}

const datasetOptions: Array<{
  id: AnalysisTableType;
  name: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    id: 'deviceAnalysis',
    name: '测点设备分析表',
    description: '按布点标签汇总最高/最低/平均值及变化范围',
    icon: Layers,
  },
  {
    id: 'terminalBinding',
    name: '终端与绑定点分析表',
    description: '终端设备与验证设备按时间并排对比',
    icon: LinkIcon,
  },
  {
    id: 'intervalDuration',
    name: '区间所用时间分析表',
    description: '按布点与时间标签，统计达到区间上下限所用时间（示例：温度/湿度）',
    icon: Timer,
  },
];

const defaultDeviceConfig: DeviceAnalysisConfig = {
  tableType: 'deviceAnalysis',
  dataType: 'temperature',
  locationTagIds: [],
  startTagId: undefined,
  endTagId: undefined,
  fields: ['deviceId', 'max', 'min', 'avg', 'range'],
  maxColor: '#ef4444',
  minColor: '#2563eb',
};

const defaultTerminalConfig: TerminalBindingConfig = {
  tableType: 'terminalBinding',
  dataType: 'temperature',
  terminalTagId: undefined,
  validationTagId: undefined,
  startTagId: undefined,
  endTagId: undefined,
};

const getDefaultConfig = (type: AnalysisTableType, prev?: AnalysisTableConfig | null): AnalysisTableConfig => {
  if (prev && prev.tableType === type) return prev;
  return type === 'deviceAnalysis' ? defaultDeviceConfig : defaultTerminalConfig;
};

export default function DataSourceAnalysisPanel({
  tags,
  initialConfig,
  anchor,
  onApply,
  onCancel,
}: DataSourceAnalysisPanelProps) {
  const [selectedType, setSelectedType] = useState<AnalysisTableType>(initialConfig?.tableType || 'deviceAnalysis');
  const [deviceConfig, setDeviceConfig] = useState<DeviceAnalysisConfig>(
    getDefaultConfig('deviceAnalysis', initialConfig) as DeviceAnalysisConfig
  );
  const [terminalConfig, setTerminalConfig] = useState<TerminalBindingConfig>(
    getDefaultConfig('terminalBinding', initialConfig) as TerminalBindingConfig
  );
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const locationTags = useMemo(() => tags.filter((t) => t.type === 'location'), [tags]);
  const timeTags = useMemo(() => tags.filter((t) => t.type === 'date' || t.type === 'datetime'), [tags]);

  const filteredDatasets = useMemo(() => {
    if (!searchKeyword.trim()) return datasetOptions;
    const lower = searchKeyword.trim().toLowerCase();
    return datasetOptions.filter(
      (item) =>
        item.name.toLowerCase().includes(lower) ||
        item.description.toLowerCase().includes(lower)
    );
  }, [searchKeyword]);

  const selectedDataset = useMemo(
    () => datasetOptions.find((item) => item.id === selectedType),
    [selectedType]
  );

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        setSearchKeyword('');
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  const handleToggleField = (field: DeviceAnalysisField) => {
    setDeviceConfig((prev) => {
      const exists = prev.fields.includes(field);
      const nextFields = exists ? prev.fields.filter((f) => f !== field) : [...prev.fields, field];
      return { ...prev, fields: nextFields };
    });
  };

  const handleApply = () => {
    const config = selectedType === 'deviceAnalysis' ? deviceConfig : terminalConfig;
    onApply(config);
  };

  const renderLocationSelector = (selectedIds: string[], onChange: (ids: string[]) => void, multiple = true, name?: string) => {
    return (
      <div className="space-y-2 max-h-40 overflow-y-auto border rounded p-2">
        {locationTags.length === 0 && <p className="text-xs text-gray-500">暂无布点区域标签</p>}
        {locationTags.map((tag) => {
          const checked = selectedIds.includes(tag._id || tag.name);
          return (
            <label key={tag._id || tag.name} className="flex items-center space-x-2 text-sm cursor-pointer">
              <input
                type={multiple ? 'checkbox' : 'radio'}
                name={multiple ? undefined : (name || 'single-location')}
                checked={checked}
                onChange={() => {
                  if (multiple) {
                    const next = checked
                      ? selectedIds.filter((id) => id !== (tag._id || tag.name))
                      : [...selectedIds, tag._id || tag.name];
                    onChange(next);
                  } else {
                    onChange([tag._id || tag.name]);
                  }
                }}
              />
              <span>{tag.name}</span>
              {/* {Array.isArray(tag.value) && tag.value.length > 0 && (
                <span className="text-xs text-gray-500 truncate">（值：{tag.value.join(' | ')}）</span>
              )} */}
            </label>
          );
        })}
      </div>
    );
  };

  const renderTimeSelector = (label: string, value?: string, onChange?: (id?: string) => void) => (
    <div className="space-y-1">
      <p className="text-xs text-gray-500">{label}</p>
      <select
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value || undefined)}
        className="w-full border rounded px-2 py-1 text-sm"
      >
        <option value="">请选择</option>
        {timeTags.map((tag) => (
          <option key={tag._id || tag.name} value={tag._id || tag.name}>
            {tag.name}
          </option>
        ))}
      </select>
    </div>
  );

  const panelStyle: React.CSSProperties = anchor
    ? {
        position: 'fixed',
        left: anchor.left,
        top: anchor.top,
      }
    : {
        position: 'fixed',
        left: '50%',
        top: '15%',
        transform: 'translateX(-50%)',
      };

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-start justify-center z-50 data-source-analysis-panel"
      style={{ alignItems: anchor ? 'start' : 'center' }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[720px] max-h-[90vh] overflow-y-auto p-4 space-y-4 data-source-popover"
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-800">表格数据来源</h3>
          </div>
          <button className="p-1 rounded hover:bg-gray-100" onClick={onCancel}>
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">数据来源类型</label>
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white flex items-center justify-between"
            >
              <div className="flex items-center space-x-2 truncate">
                {selectedDataset && (
                  <>
                    <selectedDataset.icon className="w-4 h-4 text-primary-600 flex-shrink-0" />
                    <span className="truncate">{selectedDataset.name}</span>
                  </>
                )}
                {!selectedDataset && <span className="text-gray-400">请选择数据来源类型</span>}
              </div>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${
                  showDropdown ? 'transform rotate-180' : ''
                }`}
              />
            </button>

            {showDropdown && (
              <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-64 overflow-hidden flex flex-col">
                {/* 搜索框 */}
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      placeholder="搜索数据来源类型..."
                      className="w-full pl-8 pr-3 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && filteredDatasets.length === 1) {
                          e.preventDefault();
                          setSelectedType(filteredDatasets[0].id);
                          setShowDropdown(false);
                          setSearchKeyword('');
                          if (filteredDatasets[0].id === 'deviceAnalysis') {
                            setDeviceConfig((prev) => ({ ...getDefaultConfig('deviceAnalysis'), ...prev }));
                          } else {
                            setTerminalConfig((prev) => ({ ...getDefaultConfig('terminalBinding'), ...prev }));
                          }
                        }
                      }}
                      autoFocus
                    />
                  </div>
                </div>

                {/* 选项列表 */}
                <div className="overflow-y-auto max-h-48">
                  {filteredDatasets.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500 text-center">未找到匹配的数据来源类型</div>
                  ) : (
                    filteredDatasets.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setSelectedType(item.id);
                            setShowDropdown(false);
                            setSearchKeyword('');
                            if (item.id === 'deviceAnalysis') {
                              setDeviceConfig((prev) => ({ ...getDefaultConfig('deviceAnalysis'), ...prev }));
                            } else {
                              setTerminalConfig((prev) => ({ ...getDefaultConfig('terminalBinding'), ...prev }));
                            }
                          }}
                          className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-100 transition-colors flex items-center space-x-2 ${
                            selectedType === item.id ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700'
                          }`}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{item.name}</p>
                            <p className="text-xs text-gray-500 truncate">{item.description}</p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {selectedType === 'deviceAnalysis' ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs text-gray-500">数据选择</p>
              <div className="flex items-center space-x-3 text-sm">
                <label className="flex items-center space-x-1">
                  <input
                    type="radio"
                    name="device-data-type"
                    value="temperature"
                    checked={deviceConfig.dataType === 'temperature'}
                    onChange={() => setDeviceConfig((prev) => ({ ...prev, dataType: 'temperature' }))}
                  />
                  <span>温度</span>
                </label>
                <label className="flex items-center space-x-1">
                  <input
                    type="radio"
                    name="device-data-type"
                    value="humidity"
                    checked={deviceConfig.dataType === 'humidity'}
                    onChange={() => setDeviceConfig((prev) => ({ ...prev, dataType: 'humidity' }))}
                  />
                  <span>湿度</span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-gray-500">选择布点标签（多选，空值会被忽略）</p>
              {renderLocationSelector(deviceConfig.locationTagIds, (ids) => setDeviceConfig((prev) => ({ ...prev, locationTagIds: ids })), true)}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {renderTimeSelector('选择开始时间标签', deviceConfig.startTagId, (id) =>
                setDeviceConfig((prev) => ({ ...prev, startTagId: id }))
              )}
              {renderTimeSelector('选择结束时间标签', deviceConfig.endTagId, (id) =>
                setDeviceConfig((prev) => ({ ...prev, endTagId: id }))
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs text-gray-500">选择数据集字段（至少保留测点编号）</p>
              <div className="flex flex-wrap gap-3 text-sm">
                {([
                  { id: 'deviceId', label: '测点编号' },
                  { id: 'max', label: '最高值' },
                  { id: 'min', label: '最低值' },
                  { id: 'avg', label: '平均值' },
                  { id: 'range', label: '变化范围' },
                ] as Array<{ id: DeviceAnalysisField; label: string }>).map((item) => (
                  <label key={item.id} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deviceConfig.fields.includes(item.id)}
                      onChange={() => handleToggleField(item.id)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-gray-500 flex items-center space-x-1">
                <Palette className="w-4 h-4 text-gray-500" />
                <span>最高/最低值字体颜色</span>
              </p>
              <div className="flex items-center space-x-3">
                <label className="flex items-center space-x-2 text-sm">
                  <span className="text-gray-600">最高</span>
                  <input
                    type="color"
                    value={deviceConfig.maxColor || '#ef4444'}
                    onChange={(e) => setDeviceConfig((prev) => ({ ...prev, maxColor: e.target.value }))}
                  />
                </label>
                <label className="flex items-center space-x-2 text-sm">
                  <span className="text-gray-600">最低</span>
                  <input
                    type="color"
                    value={deviceConfig.minColor || '#2563eb'}
                    onChange={(e) => setDeviceConfig((prev) => ({ ...prev, minColor: e.target.value }))}
                  />
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs text-gray-500">数据选择</p>
              <div className="flex items-center space-x-3 text-sm">
                <label className="flex items-center space-x-1">
                  <input
                    type="radio"
                    name="terminal-data-type"
                    value="temperature"
                    checked={terminalConfig.dataType === 'temperature'}
                    onChange={() => setTerminalConfig((prev) => ({ ...prev, dataType: 'temperature' }))}
                  />
                  <span>温度</span>
                </label>
                <label className="flex items-center space-x-1">
                  <input
                    type="radio"
                    name="terminal-data-type"
                    value="humidity"
                    checked={terminalConfig.dataType === 'humidity'}
                    onChange={() => setTerminalConfig((prev) => ({ ...prev, dataType: 'humidity' }))}
                  />
                  <span>湿度</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-gray-500">选择终端设备标签（单选）</p>
                {renderLocationSelector(
                  terminalConfig.terminalTagId ? [terminalConfig.terminalTagId] : [],
                  (ids) => setTerminalConfig((prev) => ({ ...prev, terminalTagId: ids[0] })),
                  false,
                  'terminal-tag'
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500">选择验证设备标签（单选）</p>
                {renderLocationSelector(
                  terminalConfig.validationTagId ? [terminalConfig.validationTagId] : [],
                  (ids) => setTerminalConfig((prev) => ({ ...prev, validationTagId: ids[0] })),
                  false,
                  'validation-tag'
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {renderTimeSelector('选择开始时间标签', terminalConfig.startTagId, (id) =>
                setTerminalConfig((prev) => ({ ...prev, startTagId: id }))
              )}
              {renderTimeSelector('选择结束时间标签', terminalConfig.endTagId, (id) =>
                setTerminalConfig((prev) => ({ ...prev, endTagId: id }))
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-3 pt-2 border-t">
          <button
            className="px-4 py-2 rounded border text-gray-700 hover:bg-gray-50"
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className="px-4 py-2 rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            onClick={handleApply}
            type="button"
          >
            应用数据来源
          </button>
        </div>
      </div>
    </div>
  );
}

