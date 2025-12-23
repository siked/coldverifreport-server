import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  AnalysisTableConfig,
  AnalysisTableType,
  DeviceAnalysisConfig,
  DeviceAnalysisField,
  TerminalBindingConfig,
  IntervalDurationConfig,
  CertificateAnalysisConfig,
  CertificateAnalysisField,
} from './analysisTypes';
import type { TemplateTag } from '../TemplateTagList';
import { Database, Layers, Link as LinkIcon, Search, X, Palette, ChevronDown, Timer, FileText } from 'lucide-react';

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
    description: '统计达到上限和下限所用时间，显示区间变化',
    icon: Timer,
  },
  {
    id: 'certificate',
    name: '校准证书表',
    description: '按验证设备标签的SN匹配证书，按年份取最新记录',
    icon: FileText,
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

const defaultIntervalDurationConfig: IntervalDurationConfig = {
  tableType: 'intervalDuration',
  dataType: 'temperature',
  locationTagIds: [],
  startTagId: undefined,
  endTagId: undefined,
  upperLimit: undefined,
  lowerLimit: undefined,
  maxRows: 10,
};

const defaultCertificateConfig: CertificateAnalysisConfig = {
  tableType: 'certificate',
  validationTagIds: [],
  certificateYear: new Date().getFullYear().toString(),
  fields: ['layoutNumber', 'locationTag', 'deviceNumber', 'certificateNumber', 'issueDate', 'expiryDate', 'validity'],
};

const getDefaultConfig = (type: AnalysisTableType, prev?: AnalysisTableConfig | null): AnalysisTableConfig => {
  if (prev && prev.tableType === type) {
    // 如果是证书类型，确保字段列表包含所有默认字段
    if (type === 'certificate') {
      const certConfig = prev as CertificateAnalysisConfig;
      const defaultFields = defaultCertificateConfig.fields;
      const mergedFields = [...defaultFields];
      // 添加用户选择的其他字段
      if (certConfig.fields) {
        certConfig.fields.forEach((field) => {
          if (!mergedFields.includes(field)) {
            mergedFields.push(field);
          }
        });
      }
      // 确保布局编号在最前面，设备编号在第二位，布点区域在最后
      const orderedFields: CertificateAnalysisField[] = ['layoutNumber', 'deviceNumber'];
      mergedFields.forEach((field) => {
        if (field !== 'layoutNumber' && field !== 'locationTag' && field !== 'deviceNumber') {
          orderedFields.push(field);
        }
      });
      // 将布点区域移到最后
      if (mergedFields.includes('locationTag')) {
        orderedFields.push('locationTag');
      }
      return {
        ...certConfig,
        fields: orderedFields,
      };
    }
    return prev;
  }
  if (type === 'deviceAnalysis') return defaultDeviceConfig;
  if (type === 'terminalBinding') return defaultTerminalConfig;
  if (type === 'certificate') return defaultCertificateConfig;
  return defaultIntervalDurationConfig;
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
  const [intervalDurationConfig, setIntervalDurationConfig] = useState<IntervalDurationConfig>(
    getDefaultConfig('intervalDuration', initialConfig) as IntervalDurationConfig
  );
  const [certificateConfig, setCertificateConfig] = useState<CertificateAnalysisConfig>(
    getDefaultConfig('certificate', initialConfig) as CertificateAnalysisConfig
  );
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const locationTags = useMemo(() => tags.filter((t) => t.type === 'location'), [tags]);
  const timeTags = useMemo(() => tags.filter((t) => t.type === 'date' || t.type === 'datetime'), [tags]);
  const certificateYears = useMemo(() => {
    const current = new Date().getFullYear();
    const years: string[] = [];
    for (let y = 2025; y <= current; y++) {
      years.unshift(String(y));
    }
    return years;
  }, []);

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

  const handleToggleCertificateField = (field: CertificateAnalysisField) => {
    setCertificateConfig((prev) => {
      const exists = prev.fields.includes(field);
      const nextFields = exists ? prev.fields.filter((f) => f !== field) : [...prev.fields, field];
      // 确保布局编号和设备编号始终保留在最前面，布点区域在最后
      if (!nextFields.includes('layoutNumber')) {
        nextFields.unshift('layoutNumber');
      }
      if (!nextFields.includes('deviceNumber')) {
        const layoutIndex = nextFields.indexOf('layoutNumber');
        nextFields.splice(layoutIndex + 1, 0, 'deviceNumber');
      }
      // 将布点区域移到最后
      if (nextFields.includes('locationTag')) {
        const locationTagIndex = nextFields.indexOf('locationTag');
        nextFields.splice(locationTagIndex, 1);
        nextFields.push('locationTag');
      }
      return { ...prev, fields: nextFields };
    });
  };

  const handleApply = () => {
    let config: AnalysisTableConfig;
    if (selectedType === 'deviceAnalysis') {
      config = deviceConfig;
    } else if (selectedType === 'terminalBinding') {
      config = terminalConfig;
    } else if (selectedType === 'certificate') {
      config = certificateConfig;
    } else {
      config = intervalDurationConfig;
    }
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
                          } else if (filteredDatasets[0].id === 'terminalBinding') {
                            setTerminalConfig((prev) => ({ ...getDefaultConfig('terminalBinding'), ...prev }));
                          } else if (filteredDatasets[0].id === 'certificate') {
                            setCertificateConfig((prev) => ({ ...getDefaultConfig('certificate'), ...prev }));
                          } else {
                            setIntervalDurationConfig((prev) => ({ ...getDefaultConfig('intervalDuration'), ...prev }));
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
                            } else if (item.id === 'terminalBinding') {
                              setTerminalConfig((prev) => ({ ...getDefaultConfig('terminalBinding'), ...prev }));
                            } else if (item.id === 'certificate') {
                              setCertificateConfig((prev) => ({ ...getDefaultConfig('certificate'), ...prev }));
                            } else {
                              setIntervalDurationConfig((prev) => ({ ...getDefaultConfig('intervalDuration'), ...prev }));
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
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">选择布点标签（多选，空值会被忽略）</p>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = locationTags.map((tag) => tag._id || tag.name);
                      setDeviceConfig((prev) => ({ ...prev, locationTagIds: allIds }));
                    }}
                    className="text-xs px-2 py-1 border rounded hover:bg-gray-50 text-gray-700"
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = locationTags.map((tag) => tag._id || tag.name);
                      const currentIds = deviceConfig.locationTagIds;
                      const reversedIds = allIds.filter((id) => !currentIds.includes(id));
                      setDeviceConfig((prev) => ({ ...prev, locationTagIds: reversedIds }));
                    }}
                    className="text-xs px-2 py-1 border rounded hover:bg-gray-50 text-gray-700"
                  >
                    反选
                  </button>
                </div>
              </div>
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
        ) : selectedType === 'terminalBinding' ? (
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
        ) : selectedType === 'certificate' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">选择验证设备标签（多选，标签值不能为空）</p>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = locationTags.map((tag) => tag._id || tag.name);
                      setCertificateConfig((prev) => ({ ...prev, validationTagIds: allIds }));
                    }}
                    className="text-xs px-2 py-1 border rounded hover:bg-gray-50 text-gray-700"
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = locationTags.map((tag) => tag._id || tag.name);
                      const currentIds = certificateConfig.validationTagIds;
                      const reversedIds = allIds.filter((id) => !currentIds.includes(id));
                      setCertificateConfig((prev) => ({ ...prev, validationTagIds: reversedIds }));
                    }}
                    className="text-xs px-2 py-1 border rounded hover:bg-gray-50 text-gray-700"
                  >
                    反选
                  </button>
                </div>
              </div>
              {renderLocationSelector(
                certificateConfig.validationTagIds,
                (ids) => setCertificateConfig((prev) => ({ ...prev, validationTagIds: ids })),
                true,
                'certificate-validation-tags'
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs text-gray-500">选择证书年份</p>
              <select
                value={certificateConfig.certificateYear}
                onChange={(e) =>
                  setCertificateConfig((prev) => ({
                    ...prev,
                    certificateYear: e.target.value || new Date().getFullYear().toString(),
                  }))
                }
                className="w-full border rounded px-2 py-1 text-sm"
              >
                {certificateYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400">年份范围：2025 ~ 当前年份，默认当前年份。</p>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-gray-500">数据集字段（默认保留全部字段）</p>
              <div className="flex flex-wrap gap-3 text-sm">
                {(
                  [
                    { id: 'layoutNumber', label: '布局编号' },
                    { id: 'deviceNumber', label: '设备编号' },
                    { id: 'certificateNumber', label: '证书编号' },
                    { id: 'issueDate', label: '签发日期' },
                    { id: 'expiryDate', label: '到期时间' },
                    { id: 'validity', label: '证书有效期' },
                    { id: 'locationTag', label: '布点区域' },
                  ] as Array<{ id: CertificateAnalysisField; label: string }>
                ).map((item) => (
                  <label key={item.id} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={certificateConfig.fields.includes(item.id)}
                      onChange={() => handleToggleCertificateField(item.id)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
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
                    name="interval-data-type"
                    value="temperature"
                    checked={intervalDurationConfig.dataType === 'temperature'}
                    onChange={() => setIntervalDurationConfig((prev) => ({ ...prev, dataType: 'temperature' }))}
                  />
                  <span>温度</span>
                </label>
                <label className="flex items-center space-x-1">
                  <input
                    type="radio"
                    name="interval-data-type"
                    value="humidity"
                    checked={intervalDurationConfig.dataType === 'humidity'}
                    onChange={() => setIntervalDurationConfig((prev) => ({ ...prev, dataType: 'humidity' }))}
                  />
                  <span>湿度</span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">选择布点标签（多选，多个布点用 | 分割，标签值不能为空）</p>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = locationTags.map((tag) => tag._id || tag.name);
                      setIntervalDurationConfig((prev) => ({ ...prev, locationTagIds: allIds }));
                    }}
                    className="text-xs px-2 py-1 border rounded hover:bg-gray-50 text-gray-700"
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = locationTags.map((tag) => tag._id || tag.name);
                      const currentIds = intervalDurationConfig.locationTagIds;
                      const reversedIds = allIds.filter((id) => !currentIds.includes(id));
                      setIntervalDurationConfig((prev) => ({ ...prev, locationTagIds: reversedIds }));
                    }}
                    className="text-xs px-2 py-1 border rounded hover:bg-gray-50 text-gray-700"
                  >
                    反选
                  </button>
                </div>
              </div>
              {renderLocationSelector(intervalDurationConfig.locationTagIds, (ids) => setIntervalDurationConfig((prev) => ({ ...prev, locationTagIds: ids })), true)}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {renderTimeSelector('选择开始时间标签', intervalDurationConfig.startTagId, (id) =>
                setIntervalDurationConfig((prev) => ({ ...prev, startTagId: id }))
              )}
              {renderTimeSelector('选择结束时间标签', intervalDurationConfig.endTagId, (id) =>
                setIntervalDurationConfig((prev) => ({ ...prev, endTagId: id }))
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-gray-500">上限</p>
                <input
                  type="text"
                  value={intervalDurationConfig.upperLimit || ''}
                  onChange={(e) => setIntervalDurationConfig((prev) => ({ ...prev, upperLimit: e.target.value || undefined }))}
                  placeholder="输入上限（默认为空）"
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500">下限</p>
                <input
                  type="text"
                  value={intervalDurationConfig.lowerLimit || ''}
                  onChange={(e) => setIntervalDurationConfig((prev) => ({ ...prev, lowerLimit: e.target.value || undefined }))}
                  placeholder="输入下限（默认为空）"
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-gray-500">最大行数</p>
              <input
                type="number"
                min="1"
                value={intervalDurationConfig.maxRows}
                onChange={(e) => setIntervalDurationConfig((prev) => ({ ...prev, maxRows: parseInt(e.target.value) || 10 }))}
                className="w-full border rounded px-2 py-1 text-sm"
              />
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

