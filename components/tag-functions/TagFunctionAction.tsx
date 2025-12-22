'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { FunctionSquare, Search, ChevronDown } from 'lucide-react';
import type { TemplateTag } from '../TemplateTagList';
import { TagFunctionConfig, TagFunctionType } from './types';
import { useTagFunctionRunner } from './useTagFunctionRunner';

interface TagFunctionActionProps {
  tag: TemplateTag;
  allTags: TemplateTag[];
  taskId?: string | null;
  onApply: (tagId: string, payload: Partial<TemplateTag>) => void;
}

const LOCATION_FUNCTIONS: Array<{ value: TagFunctionType; label: string }> = [
  { value: 'tempReachUpper', label: '数据温度第一个到达上限测点' },
  { value: 'tempReachLower', label: '数据温度第一个到达下限测点' },
  { value: 'humidityReachUpper', label: '数据湿度第一个到达上限测点' },
  { value: 'humidityReachLower', label: '数据湿度第一个到达下限测点' },
  { value: 'tempExceedUpper', label: '数据温度超过上限测点' },
  { value: 'tempExceedLower', label: '数据温度低于下限测点' },
  { value: 'humidityExceedUpper', label: '数据湿度超过上限测点' },
  { value: 'humidityExceedLower', label: '数据湿度低于下限测点' },
  { value: 'maxTempLocation', label: '数据温度最高值对应测点' },
  { value: 'minTempLocation', label: '数据温度最低值对应测点' },
];

const THRESHOLD_HINT: Partial<Record<TagFunctionType, number>> = {
  tempReachUpper: 8,
  tempReachLower: 2,
  humidityReachUpper: 80,
  humidityReachLower: 20,
  tempExceedUpper: 8,
  tempExceedLower: 2,
  humidityExceedUpper: 80,
  humidityExceedLower: 20,
  tempFirstReachUpperTime: 8,
  tempFirstReachLowerTime: 2,
};

const NUMBER_FUNCTIONS: Array<{ value: TagFunctionType; label: string }> = [
  { value: 'maxTemp', label: '数据最高温度' },
  { value: 'minTemp', label: '数据最低温度' },
  { value: 'avgTemp', label: '数据平均温度' },
  { value: 'maxHumidity', label: '数据最高湿度' },
  { value: 'minHumidity', label: '数据最低湿度' },
  { value: 'avgHumidity', label: '数据平均湿度' },
  { value: 'centerPointTempDeviation', label: '数据中心点温度偏差值' },
  { value: 'tempUniformity', label: '数据温度均匀度值' },
  { value: 'centerPointTempFluctuation', label: '数据中心点温度波动度' },
  { value: 'tempVariationRangeSum', label: '数据变化范围求和' },
  { value: 'tempAvgDeviation', label: '数据温度平均偏差值' },
  { value: 'tempUniformityMax', label: '数据温度均匀度计算最高温度' },
  { value: 'tempUniformityMin', label: '数据温度均匀度计算最低' },
  { value: 'tempUniformityValue', label: '数据温度均匀度计算值' },
  { value: 'powerConsumptionRate', label: '耗电率计算' },
  { value: 'maxPowerUsageDuration', label: '电量最长使用时长' },
  { value: 'avgCoolingRate', label: '平均降温速率' },
  { value: 'deviceTimePointTemp', label: '获取设备时间点温度' },
  { value: 'maxTempDiffAtSameTime', label: '同一时间各测点间最大温度差值' },
  { value: 'tempFluctuation', label: '温度波动度' },
  { value: 'tempUniformityAverage', label: '温度均匀度' },
];

const TIME_FUNCTIONS: Array<{ value: TagFunctionType; label: string }> = [
  { value: 'tempFirstReachUpperTime', label: '数据温度第一次到达上限时间' },
  { value: 'tempFirstReachLowerTime', label: '数据温度第一次到达下限时间' },
  { value: 'tempMaxTime', label: '数据取最高点时间' },
  { value: 'tempMinTime', label: '数据取最低点时间' },
  { value: 'maxTempDiffTimePoint', label: '同一时间各测点间最大温度差时间点' },
];

function getDefaultFunction(type: TemplateTag['type']): TagFunctionType | null {
  if (type === 'location') return 'tempReachUpper';
  if (type === 'number') return 'maxTemp';
  if (type === 'date' || type === 'datetime') return 'tempFirstReachUpperTime';
  return null;
}

export function TagFunctionAction({ tag, allTags, taskId, onApply }: TagFunctionActionProps) {
  const [showConfig, setShowConfig] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<TagFunctionConfig | null>(null);
  const { status, message, functionConfig, execute } = useTagFunctionRunner({
    tag,
    allTags,
    taskId,
    onApply,
  });

  const availableFunctions = useMemo(() => {
    if (tag.type === 'location') return LOCATION_FUNCTIONS;
    if (tag.type === 'number') return NUMBER_FUNCTIONS;
    if (tag.type === 'date' || tag.type === 'datetime') return TIME_FUNCTIONS;
    return [];
  }, [tag.type]);

  const locationTags = useMemo(
    () => allTags.filter((t) => t.type === 'location' && t._id),
    [allTags]
  );
  const timeTags = useMemo(
    () => allTags.filter((t) => (t.type === 'date' || t.type === 'datetime') && t._id),
    [allTags]
  );
  const numberTags = useMemo(
    () => allTags.filter((t) => t.type === 'number' && t._id),
    [allTags]
  );

  const colorClass =
    status === 'running'
      ? 'text-amber-500'
      : status === 'success'
        ? 'text-emerald-600'
        : status === 'error'
          ? 'text-red-500'
          : 'text-gray-500';

  const tooltip = '配置/查看函数方法，点击可再次编辑并计算';

  const handleSubmitConfig = (config: TagFunctionConfig) => {
    if (!tag._id) return;
    onApply(tag._id, { functionConfig: config });
    setPendingConfig(config);
    setShowConfig(false);
    execute(config);
  };

  const handleClick = () => {
    if (!availableFunctions.length) return;
    const defaultFn = getDefaultFunction(tag.type);
    if (!functionConfig && defaultFn) {
      setPendingConfig({
        functionType: defaultFn,
        locationTagIds: [],
      });
    }
    setShowConfig(true);
  };

  return (
    <>
      <button
        type="button"
        disabled={!availableFunctions.length}
        onClick={handleClick}
        className={`p-1 rounded hover:bg-gray-100 ${colorClass} disabled:opacity-50`}
        title={tooltip}
      >
        <FunctionSquare className="w-4 h-4" />
      </button>

      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowConfig(false)}>
          <div
            className="bg-white rounded-lg shadow-xl w-[520px] max-h-[80vh] overflow-y-auto p-4"
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => e.stopPropagation()}
            onDrag={(e) => e.stopPropagation()}
            onDragOver={(e) => e.stopPropagation()}
            onDragEnd={(e) => e.stopPropagation()}
            onDrop={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">函数方法</p>
                <p className="text-xs text-gray-500">配置并执行计算，结果将写入当前标签</p>
              </div>
              <button onClick={() => setShowConfig(false)} className="text-gray-500 hover:text-gray-700">
                关闭
              </button>
            </div>

            {!availableFunctions.length ? (
              <div className="text-sm text-red-500">当前标签类型不支持函数方法</div>
            ) : (
              <FunctionForm
                tag={tag}
                allTags={allTags}
                availableFunctions={availableFunctions}
                locationTags={locationTags}
                timeTags={timeTags}
                numberTags={numberTags}
                defaultConfig={pendingConfig || functionConfig}
                onSubmit={handleSubmitConfig}
                onShowDetail={() => setShowDetail(true)}
                hasFunctionConfig={!!functionConfig}
              />
            )}
          </div>
        </div>
      )}

      {showDetail && (
        <DetailPanel
          onClose={() => setShowDetail(false)}
          functionConfig={functionConfig}
          allTags={allTags}
        />
      )}
    </>
  );
}

interface FunctionFormProps {
  tag: TemplateTag;
  allTags: TemplateTag[];
  availableFunctions: Array<{ value: TagFunctionType; label: string }>;
  locationTags: TemplateTag[];
  timeTags: TemplateTag[];
  numberTags: TemplateTag[];
  defaultConfig: TagFunctionConfig | null | undefined;
  onSubmit: (config: TagFunctionConfig) => void;
  onShowDetail: () => void;
  hasFunctionConfig: boolean;
}

interface DetailPanelProps {
  functionConfig: TagFunctionConfig | null;
  allTags: TemplateTag[];
  onClose: () => void;
}

function DetailPanel({ functionConfig, allTags, onClose }: DetailPanelProps) {
  const locationNames = useMemo(() => {
    if (!functionConfig) return [];
    return functionConfig.locationTagIds
      .map((id) => allTags.find((t) => t._id === id))
      .filter(Boolean)
      .map((t) => ({
        name: t!.name,
        value: Array.isArray(t!.value) ? t!.value.join(' | ') : t!.value || '',
      }));
  }, [allTags, functionConfig]);

  const startTag = useMemo(
    () => (functionConfig ? allTags.find((t) => t._id === functionConfig.startTagId) : undefined),
    [allTags, functionConfig]
  );
  const endTag = useMemo(
    () => (functionConfig ? allTags.find((t) => t._id === functionConfig.endTagId) : undefined),
    [allTags, functionConfig]
  );
  const centerPointTag = useMemo(
    () => (functionConfig ? allTags.find((t) => t._id === functionConfig.centerPointTagId) : undefined),
    [allTags, functionConfig]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-[520px] max-h-[80vh] overflow-y-auto p-4"
        onClick={(e) => e.stopPropagation()}
        onDragStart={(e) => e.stopPropagation()}
        onDrag={(e) => e.stopPropagation()}
        onDragOver={(e) => e.stopPropagation()}
        onDragEnd={(e) => e.stopPropagation()}
        onDrop={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">函数数据处理详情</p>
            <p className="text-xs text-gray-500">点击“处理详情”可查看最近一次计算日志</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            关闭
          </button>
        </div>

        {!functionConfig ? (
          <div className="text-sm text-gray-500">暂无计算记录，请先配置并执行。</div>
        ) : (
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-gray-500">函数类型</p>
              <p className="font-medium">{functionConfig.functionType}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500">开始时间</p>
                <p className="font-medium">
                  {startTag ? `${startTag.name}: ${startTag.value || '未填写'}` : '未选择'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">结束时间</p>
                <p className="font-medium">
                  {endTag ? `${endTag.name}: ${endTag.value || '未填写'}` : '未选择'}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500">布点标签（去重后参与计算）</p>
              {locationNames.length === 0 ? (
                <p className="text-gray-500">未选择</p>
              ) : (
                <ul className="list-disc list-inside space-y-1">
                  {locationNames.map((item, idx) => (
                    <li key={idx}>
                      <span className="font-medium">{item.name}</span>
                      <span className="text-gray-500">（{item.value || '无值'}）</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {functionConfig.functionType === 'centerPointTempDeviation' && (
              <div>
                <p className="text-xs text-gray-500">中心点布点标签</p>
                <p className="font-medium">
                  {centerPointTag
                    ? `${centerPointTag.name}: ${Array.isArray(centerPointTag.value) ? centerPointTag.value.join(' | ') : centerPointTag.value || '未填写'}`
                    : '未选择'}
                </p>
              </div>
            )}

            {functionConfig.functionType === 'tempAvgDeviation' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">最高温度</p>
                    <p className="font-medium">
                      {functionConfig.maxTempTagId
                        ? (() => {
                            const tag = allTags.find((t) => t._id === functionConfig.maxTempTagId);
                            return tag ? `${tag.name}: ${tag.value || '未填写'}` : '未找到标签';
                          })()
                        : functionConfig.maxTemp !== undefined
                          ? functionConfig.maxTemp
                          : '默认 8'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">最低温度</p>
                    <p className="font-medium">
                      {functionConfig.minTempTagId
                        ? (() => {
                            const tag = allTags.find((t) => t._id === functionConfig.minTempTagId);
                            return tag ? `${tag.name}: ${tag.value || '未填写'}` : '未找到标签';
                          })()
                        : functionConfig.minTemp !== undefined
                          ? functionConfig.minTemp
                          : '默认 2'}
                    </p>
                  </div>
                </div>
              </>
            )}

            {(functionConfig.functionType === 'powerConsumptionRate' || functionConfig.functionType === 'maxPowerUsageDuration') && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500">开始电量</p>
                  <p className="font-medium">
                    {functionConfig.startPowerTagId
                      ? (() => {
                          const tag = allTags.find((t) => t._id === functionConfig.startPowerTagId);
                          return tag ? `${tag.name}: ${tag.value || '未填写'}` : '未找到标签';
                        })()
                      : '未选择'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">结束电量</p>
                  <p className="font-medium">
                    {functionConfig.endPowerTagId
                      ? (() => {
                          const tag = allTags.find((t) => t._id === functionConfig.endPowerTagId);
                          return tag ? `${tag.name}: ${tag.value || '未填写'}` : '未找到标签';
                        })()
                      : '未选择'}
                  </p>
                </div>
              </div>
            )}

            {functionConfig.functionType === 'deviceTimePointTemp' && (
              <div>
                <p className="text-xs text-gray-500">时间标签</p>
                <p className="font-medium">
                  {functionConfig.timeTagId
                    ? (() => {
                        const tag = allTags.find((t) => t._id === functionConfig.timeTagId);
                        return tag ? `${tag.name}: ${tag.value || '未填写'}` : '未找到标签';
                      })()
                    : '未选择'}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500">阈值</p>
                <p className="font-medium">
                  {functionConfig.threshold !== undefined ? functionConfig.threshold : '默认'}
                </p>
              </div>
              {functionConfig.decimalPlaces !== undefined && (
                <div>
                  <p className="text-xs text-gray-500">小数位数</p>
                  <p className="font-medium">{functionConfig.decimalPlaces}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500">输出结果</p>
                <p className="font-medium break-words">
                  {functionConfig.lastResult !== undefined && functionConfig.lastResult !== ''
                    ? String(functionConfig.lastResult)
                    : '暂无'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">最近运行时间</p>
                <p className="font-medium">
                  {functionConfig.lastRunAt
                    ? new Date(functionConfig.lastRunAt).toLocaleString()
                    : '未执行'}
                </p>
              </div>
            </div>

            <div className="border-t pt-2 space-y-1">
              <p className="text-xs text-gray-500">日志 / 错误信息</p>
              <div
                className={`text-sm rounded border px-2 py-2 bg-gray-50 max-h-40 overflow-auto whitespace-pre-wrap ${
                  functionConfig.lastStatus === 'error' ? 'border-red-200 text-red-700' : 'border-gray-200 text-gray-800'
                }`}
              >
                {functionConfig.lastMessage || '暂无记录'}
              </div>
              <p className="text-xs text-gray-500">状态：{functionConfig.lastStatus || '未知'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FunctionForm({
  availableFunctions,
  locationTags,
  timeTags,
  numberTags,
  defaultConfig,
  onSubmit,
  onShowDetail,
  hasFunctionConfig,
}: FunctionFormProps) {
  const [functionType, setFunctionType] = useState<TagFunctionType>(
    defaultConfig?.functionType || availableFunctions[0].value
  );
  const [locationTagIds, setLocationTagIds] = useState<string[]>(defaultConfig?.locationTagIds || []);
  const [startTagId, setStartTagId] = useState<string | undefined>(defaultConfig?.startTagId);
  const [endTagId, setEndTagId] = useState<string | undefined>(defaultConfig?.endTagId);
  const [threshold, setThreshold] = useState<number | undefined>(defaultConfig?.threshold);
  const [centerPointTagId, setCenterPointTagId] = useState<string | undefined>(defaultConfig?.centerPointTagId);
  const [maxTempTagId, setMaxTempTagId] = useState<string | undefined>(defaultConfig?.maxTempTagId);
  const [minTempTagId, setMinTempTagId] = useState<string | undefined>(defaultConfig?.minTempTagId);
  const [maxTemp, setMaxTemp] = useState<number | undefined>(defaultConfig?.maxTemp);
  const [minTemp, setMinTemp] = useState<number | undefined>(defaultConfig?.minTemp);
  const [startPowerTagId, setStartPowerTagId] = useState<string | undefined>(defaultConfig?.startPowerTagId);
  const [endPowerTagId, setEndPowerTagId] = useState<string | undefined>(defaultConfig?.endPowerTagId);
  const [timeTagId, setTimeTagId] = useState<string | undefined>(defaultConfig?.timeTagId);
  const [decimalPlaces, setDecimalPlaces] = useState<number | undefined>(defaultConfig?.decimalPlaces ?? 2);
  const [functionSearch, setFunctionSearch] = useState('');
  const [showFunctionDropdown, setShowFunctionDropdown] = useState(false);
  const functionDropdownRef = useRef<HTMLDivElement>(null);

  const isArrivalFunction = functionType.includes('Reach');
  const needsThreshold = isArrivalFunction || functionType.includes('Exceed');
  const needsDecimalPlaces = functionType === 'tempFluctuation' || functionType === 'tempUniformityAverage';

  // 过滤函数列表
  const filteredFunctions = useMemo(() => {
    if (!functionSearch.trim()) return availableFunctions;
    const searchLower = functionSearch.toLowerCase();
    return availableFunctions.filter(
      (fn) => fn.label.toLowerCase().includes(searchLower) || fn.value.toLowerCase().includes(searchLower)
    );
  }, [availableFunctions, functionSearch]);

  // 获取当前选中的函数标签
  const selectedFunction = useMemo(
    () => availableFunctions.find((fn) => fn.value === functionType),
    [availableFunctions, functionType]
  );

  // 渲染带颜色的标签文本（温度蓝色，湿度绿色）
  const renderColoredLabel = (label: string) => {
    const parts = label.split(/(温度|湿度)/);
    return parts.map((part, index) => {
      if (part === '温度') {
        return (
          <span key={index} className="text-blue-600 font-medium">
            {part}
          </span>
        );
      }
      if (part === '湿度') {
        return (
          <span key={index} className="text-green-600 font-medium">
            {part}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (functionDropdownRef.current && !functionDropdownRef.current.contains(event.target as Node)) {
        setShowFunctionDropdown(false);
      }
    };

    if (showFunctionDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFunctionDropdown]);

  const handleToggleLocation = (id: string) => {
    setLocationTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (functionType === 'deviceTimePointTemp') {
      if (locationTagIds.length === 0) {
        alert('请选择一个布点标签');
        return;
      }
      if (locationTagIds.length > 1) {
        alert('只能选择一个布点标签');
        return;
      }
      const selectedLocationTag = locationTags.find((t) => t._id === locationTagIds[0]);
      if (selectedLocationTag) {
        const locationValues = Array.isArray(selectedLocationTag.value)
          ? selectedLocationTag.value
          : selectedLocationTag.value
            ? String(selectedLocationTag.value).split(/[|,，]/).map((s) => s.trim()).filter(Boolean)
            : [];
        if (locationValues.length === 0) {
          alert('布点标签值不能为空');
          return;
        }
        if (locationValues.length > 1) {
          alert('布点标签只能有一个布点，当前有多个布点');
          return;
        }
      }
      if (!timeTagId) {
        alert('请选择时间标签');
        return;
      }
    } else {
      if (functionType !== 'powerConsumptionRate' && functionType !== 'maxPowerUsageDuration' && locationTagIds.length === 0) {
        alert('请选择至少一个布点标签');
        return;
      }
      if (!startTagId || !endTagId) {
        alert('请选择开始与结束时间标签');
        return;
      }
    }
    if (functionType === 'powerConsumptionRate' || functionType === 'maxPowerUsageDuration') {
      if (!startPowerTagId) {
        alert('请选择开始电量标签');
        return;
      }
      if (!endPowerTagId) {
        alert('请选择结束电量标签');
        return;
      }
    }
    if (functionType === 'centerPointTempDeviation') {
      if (!centerPointTagId) {
        alert('请选择中心点布点标签');
        return;
      }
      const centerPointTag = locationTags.find((t) => t._id === centerPointTagId);
      if (centerPointTag) {
        // 检查标签值是否为空
        if (centerPointTag.value === undefined || centerPointTag.value === null || centerPointTag.value === '') {
          alert('中心点布点标签值不能为空');
          return;
        }
        // 检查是否有多个值（数组或字符串中包含分隔符）
        if (Array.isArray(centerPointTag.value)) {
          if (centerPointTag.value.length === 0) {
            alert('中心点布点标签值不能为空');
            return;
          }
          if (centerPointTag.value.length > 1) {
            alert('中心点布点标签只能有一个值，当前有多个值');
            return;
          }
        } else {
          // 检查字符串中是否包含分隔符
          const strValue = String(centerPointTag.value);
          const parts = strValue.split(/[|,，]/).map((s) => s.trim()).filter(Boolean);
          if (parts.length > 1) {
            alert('中心点布点标签只能有一个值，当前有多个值（用 | 或逗号分隔）');
            return;
          }
        }
      }
    }
    if (functionType === 'tempAvgDeviation') {
      // 验证最高温度：必须选择标签或输入数字
      if (!maxTempTagId && maxTemp === undefined) {
        alert('请选择最高温度标签或输入最高温度值');
        return;
      }
      // 验证最低温度：必须选择标签或输入数字
      if (!minTempTagId && minTemp === undefined) {
        alert('请选择最低温度标签或输入最低温度值');
        return;
      }
    }
    onSubmit({
      functionType,
      locationTagIds: functionType === 'powerConsumptionRate' || functionType === 'maxPowerUsageDuration' ? [] : locationTagIds,
      startTagId: functionType === 'deviceTimePointTemp' ? undefined : startTagId,
      endTagId: functionType === 'deviceTimePointTemp' ? undefined : endTagId,
      threshold: threshold,
      centerPointTagId: functionType === 'centerPointTempDeviation' ? centerPointTagId : undefined,
      maxTempTagId: functionType === 'tempAvgDeviation' ? maxTempTagId : undefined,
      minTempTagId: functionType === 'tempAvgDeviation' ? minTempTagId : undefined,
      maxTemp: functionType === 'tempAvgDeviation' ? maxTemp : undefined,
      minTemp: functionType === 'tempAvgDeviation' ? minTemp : undefined,
      startPowerTagId: functionType === 'powerConsumptionRate' || functionType === 'maxPowerUsageDuration' ? startPowerTagId : undefined,
      endPowerTagId: functionType === 'powerConsumptionRate' || functionType === 'maxPowerUsageDuration' ? endPowerTagId : undefined,
      timeTagId: functionType === 'deviceTimePointTemp' ? timeTagId : undefined,
      decimalPlaces: needsDecimalPlaces ? (decimalPlaces ?? 2) : undefined,
    });
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label className="block text-xs text-gray-600 mb-1">函数方法</label>
        <div className="relative" ref={functionDropdownRef}>
          <button
            type="button"
            onClick={() => setShowFunctionDropdown(!showFunctionDropdown)}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white flex items-center justify-between"
          >
            <span className="truncate">
              {selectedFunction ? renderColoredLabel(selectedFunction.label) : '请选择函数方法'}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform ${
                showFunctionDropdown ? 'transform rotate-180' : ''
              }`}
            />
          </button>

          {showFunctionDropdown && (
            <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-64 overflow-hidden flex flex-col">
              {/* 搜索框 */}
              <div className="p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={functionSearch}
                    onChange={(e) => setFunctionSearch(e.target.value)}
                    placeholder="搜索函数方法..."
                    className="w-full pl-8 pr-3 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && filteredFunctions.length === 1) {
                        e.preventDefault();
                        setFunctionType(filteredFunctions[0].value);
                        setShowFunctionDropdown(false);
                        setFunctionSearch('');
                      }
                    }}
                    autoFocus
                  />
                </div>
              </div>

              {/* 选项列表 */}
              <div className="overflow-y-auto max-h-48">
                {filteredFunctions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500 text-center">未找到匹配的函数方法</div>
                ) : (
                  filteredFunctions.map((fn) => (
                    <button
                      key={fn.value}
                      type="button"
                      onClick={() => {
                        setFunctionType(fn.value);
                        setShowFunctionDropdown(false);
                        setFunctionSearch('');
                      }}
                      className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-100 transition-colors ${
                        functionType === fn.value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700'
                      }`}
                    >
                      {renderColoredLabel(fn.label)}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {functionType === 'deviceTimePointTemp' ? (
        <div>
          <label className="block text-xs text-gray-600 mb-2">布点标签（单选，只能有一个布点）</label>
          <div className="space-y-2 max-h-36 overflow-y-auto border rounded p-2">
            {locationTags.length === 0 && <p className="text-xs text-gray-400">暂无布点标签</p>}
            {locationTags.map((tag) => (
              <label key={tag._id} className="flex items-center space-x-2 text-sm">
                <input
                  type="radio"
                  name="deviceLocationTag"
                  checked={locationTagIds.includes(tag._id || '')}
                  onChange={() => setLocationTagIds([tag._id || ''])}
                />
                <span>{tag.name}</span>
              </label>
            ))}
          </div>
        </div>
      ) : functionType !== 'powerConsumptionRate' && functionType !== 'maxPowerUsageDuration' ? (
        <div>
          <label className="block text-xs text-gray-600 mb-2">布点标签（多选，去重）</label>
          <div className="space-y-2 max-h-36 overflow-y-auto border rounded p-2">
            {locationTags.length === 0 && <p className="text-xs text-gray-400">暂无布点标签</p>}
            {locationTags.map((tag) => (
              <label key={tag._id} className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={locationTagIds.includes(tag._id || '')}
                  onChange={() => handleToggleLocation(tag._id || '')}
                />
                <span>{tag.name}</span>
                {/* <span className="text-xs text-gray-400 truncate">({Array.isArray(tag.value) ? tag.value.join(' | ') : ''})</span> */}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {functionType === 'deviceTimePointTemp' ? (
        <div>
          <label className="block text-xs text-gray-600 mb-1">时间标签</label>
          <select
            value={timeTagId || ''}
            onChange={(e) => setTimeTagId(e.target.value || undefined)}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">请选择</option>
            {timeTags.map((tag) => (
              <option key={tag._id} value={tag._id}>
                {tag.name} ({tag.value || '未填写'})
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">开始时间标签</label>
            <select
              value={startTagId || ''}
              onChange={(e) => setStartTagId(e.target.value || undefined)}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">请选择</option>
              {timeTags.map((tag) => (
                <option key={tag._id} value={tag._id}>
                  {tag.name} ({tag.value || '未填写'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">结束时间标签</label>
            <select
              value={endTagId || ''}
              onChange={(e) => setEndTagId(e.target.value || undefined)}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">请选择</option>
              {timeTags.map((tag) => (
                <option key={tag._id} value={tag._id}>
                  {tag.name} ({tag.value || '未填写'})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {functionType === 'powerConsumptionRate' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">开始电量标签</label>
            <select
              value={startPowerTagId || ''}
              onChange={(e) => setStartPowerTagId(e.target.value || undefined)}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">请选择</option>
              {numberTags.map((tag) => (
                <option key={tag._id} value={tag._id}>
                  {tag.name} ({tag.value || '未填写'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">结束电量标签</label>
            <select
              value={endPowerTagId || ''}
              onChange={(e) => setEndPowerTagId(e.target.value || undefined)}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">请选择</option>
              {numberTags.map((tag) => (
                <option key={tag._id} value={tag._id}>
                  {tag.name} ({tag.value || '未填写'})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {needsThreshold && (
        <div>
          <label className="block text-xs text-gray-600 mb-1">阈值</label>
          <input
            type="number"
            value={threshold ?? ''}
            onChange={(e) => setThreshold(e.target.value === '' ? undefined : Number(e.target.value))}
            placeholder={`留空使用默认阈值（当前默认：${THRESHOLD_HINT[functionType] ?? '-'}）`}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      )}

      {functionType === 'centerPointTempDeviation' && (
        <div>
          <label className="block text-xs text-gray-600 mb-1">中心点布点标签（单选，只能有一个布点）</label>
          <select
            value={centerPointTagId || ''}
            onChange={(e) => setCenterPointTagId(e.target.value || undefined)}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">请选择</option>
            {locationTags.map((tag) => (
              <option key={tag._id} value={tag._id}>
                {tag.name} ({Array.isArray(tag.value) ? tag.value.join(' | ') : tag.value || '未填写'})
              </option>
            ))}
          </select>
        </div>
      )}

      {functionType === 'tempAvgDeviation' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">最高温度标签（可选）</label>
              <select
                value={maxTempTagId || ''}
                onChange={(e) => {
                  setMaxTempTagId(e.target.value || undefined);
                  if (e.target.value) setMaxTemp(undefined);
                }}
                className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">请选择（或直接输入数字）</option>
                {numberTags.map((tag) => (
                  <option key={tag._id} value={tag._id}>
                    {tag.name} ({tag.value || '未填写'})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">最低温度标签（可选）</label>
              <select
                value={minTempTagId || ''}
                onChange={(e) => {
                  setMinTempTagId(e.target.value || undefined);
                  if (e.target.value) setMinTemp(undefined);
                }}
                className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">请选择（或直接输入数字）</option>
                {numberTags.map((tag) => (
                  <option key={tag._id} value={tag._id}>
                    {tag.name} ({tag.value || '未填写'})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">最高温度（数字输入，默认8）</label>
              <input
                type="number"
                value={maxTemp ?? ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? undefined : Number(e.target.value);
                  setMaxTemp(val);
                  if (val !== undefined) setMaxTempTagId(undefined);
                }}
                placeholder="留空使用默认值 8"
                className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={!!maxTempTagId}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">最低温度（数字输入，默认2）</label>
              <input
                type="number"
                value={minTemp ?? ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? undefined : Number(e.target.value);
                  setMinTemp(val);
                  if (val !== undefined) setMinTempTagId(undefined);
                }}
                placeholder="留空使用默认值 2"
                className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={!!minTempTagId}
              />
            </div>
          </div>
        </>
      )}

      {needsDecimalPlaces && (
        <div>
          <label className="block text-xs text-gray-600 mb-1">小数位数（默认2位）</label>
          <input
            type="number"
            min="0"
            max="10"
            value={decimalPlaces ?? ''}
            onChange={(e) => setDecimalPlaces(e.target.value === '' ? undefined : Number(e.target.value))}
            placeholder="留空使用默认值 2"
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      )}

      <div className="flex justify-end space-x-3 pt-2 border-t">
        <button
          type="button"
          onClick={onShowDetail}
          disabled={!hasFunctionConfig}
          className={`px-3 py-2 text-sm rounded border ${
            hasFunctionConfig
              ? 'text-primary-700 border-primary-200 bg-primary-50 hover:bg-primary-100'
              : 'text-gray-400 border-gray-200 bg-gray-50 cursor-not-allowed'
          }`}
          title={hasFunctionConfig ? '查看最近一次计算日志' : '暂无计算记录'}
        >
          处理详情
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
        >
          保存并计算
        </button>
      </div>
    </form>
  );
}

