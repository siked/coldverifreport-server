import type { TemplateTag } from '../TemplateTagList';
import type {
  AnalysisTableConfig,
  AnalysisTableType,
  DeviceAnalysisConfig,
  DeviceAnalysisField,
  IntervalDurationConfig,
  TerminalBindingConfig,
} from './analysisTypes';

// 分析表数据源类型定义
export type AnalysisTableDataSource = {
  type: 'analysisTable';
  tableType: AnalysisTableType;
  config: AnalysisTableConfig;
  summary?: {
    deviceCount?: number;
    rowCount?: number;
  };
  lastUpdatedAt?: string;
};

// 辅助函数类型定义
type HelperFunctions = {
  collectLocationValues: (tagIds: string[], tags: TemplateTag[]) => string[];
  parseTagDateValue: (tagId: string | undefined, tags: TemplateTag[], isEnd?: boolean) => Date | null;
  formatNumber: (value: number | null | undefined, decimals?: number) => string;
  formatDateTimeForDisplay: (date: Date) => string;
  getTaskDataFromLoki: (taskId: string, start: Date, end: Date, deviceIds: string[]) => any[];
  stringifyDataSource: (payload: AnalysisTableDataSource) => string;
  formatTooltip: (payload: AnalysisTableDataSource) => string;
};

// 分析表构建结果
export interface AnalysisTableBuildResult {
  html: string;
  payload: AnalysisTableDataSource;
}

// 分析表构建器接口
export type AnalysisTableBuilder = (
  config: AnalysisTableConfig,
  taskId: string,
  tags: TemplateTag[],
  helpers: HelperFunctions
) => AnalysisTableBuildResult;

// 转义 HTML 属性
const escapeAttr = (input: string) => input.replace(/"/g, '&quot;');

// 验证时间范围
const validateTimeRange = (start: Date | null, end: Date | null): { startQuery: Date; endQuery: Date } => {
  if (!start || !end) {
    throw new Error('请设置有效的开始和结束时间标签');
  }
  const startQuery = new Date(start.getTime());
  const endQuery = new Date(end.getTime());
  if (startQuery > endQuery) {
    throw new Error('开始时间不能晚于结束时间');
  }
  return { startQuery, endQuery };
};

/**
 * 测点设备分析表构建器
 */
export const buildDeviceAnalysisTable: AnalysisTableBuilder = (
  config: DeviceAnalysisConfig,
  taskId: string,
  tags: TemplateTag[],
  helpers: HelperFunctions
) => {
  const {
    collectLocationValues,
    parseTagDateValue,
    formatNumber,
    getTaskDataFromLoki,
    stringifyDataSource,
    formatTooltip,
  } = helpers;

  const fields =
    config.fields && config.fields.length > 0
      ? Array.from(new Set(config.fields))
      : (['deviceId', 'max', 'min', 'avg', 'range'] as DeviceAnalysisField[]);
  if (!fields.includes('deviceId')) {
    fields.unshift('deviceId');
  }

  const locationValues = collectLocationValues(config.locationTagIds, tags);
  if (locationValues.length === 0) {
    throw new Error('请选择布点标签，且标签值不能为空');
  }

  const start = parseTagDateValue(config.startTagId, tags, false);
  const end = parseTagDateValue(config.endTagId, tags, true);
  const { startQuery, endQuery } = validateTimeRange(start, end);

  const valueKey = config.dataType === 'temperature' ? 'temperature' : 'humidity';
  const data = getTaskDataFromLoki(taskId, startQuery, endQuery, locationValues);
  const rows = locationValues.map((deviceId) => {
    const items = data.filter((d) => d.deviceId === deviceId);
    const values = items
      .map((item) => Number((item as any)[valueKey]))
      .filter((v) => Number.isFinite(v));
    const max = values.length ? Math.max(...values) : null;
    const min = values.length ? Math.min(...values) : null;
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    const range = max !== null && min !== null ? max - min : null;
    return { deviceId, max, min, avg, range };
  });

  // 计算每个字段列的最大值和最小值
  const columnExtremes: Record<string, { max: number | null; min: number | null }> = {};
  fields.forEach((f) => {
    if (f !== 'deviceId') {
      const values = rows
        .map((r) => (r as any)[f])
        .filter((v) => v !== null && v !== undefined && Number.isFinite(v)) as number[];
      columnExtremes[f] = {
        max: values.length > 0 ? Math.max(...values) : null,
        min: values.length > 0 ? Math.min(...values) : null,
      };
    }
  });

  const labelMap: Record<DeviceAnalysisField, string> = {
    deviceId: '测点编号',
    max: config.dataType === 'temperature' ? '最高温度' : '最高湿度',
    min: config.dataType === 'temperature' ? '最低温度' : '最低湿度',
    avg: config.dataType === 'temperature' ? '平均温度' : '平均湿度',
    range: config.dataType === 'temperature' ? '温度变化范围' : '湿度变化范围',
  };

  const payload: AnalysisTableDataSource = {
    type: 'analysisTable',
    tableType: 'deviceAnalysis',
    config: { ...config, fields },
    summary: { deviceCount: locationValues.length, rowCount: rows.length },
    lastUpdatedAt: new Date().toISOString(),
  };
  const dataSourceAttr = stringifyDataSource(payload);
  const tooltip = escapeAttr(formatTooltip(payload));
  const headerHtml = fields.map((f) => `<th>${labelMap[f]}</th>`).join('');
  const bodyHtml = rows
    .map((row) => {
      const cells = fields
        .map((f) => {
          const value = (row as any)[f];
          const display = f === 'deviceId' ? row.deviceId : formatNumber(value);
          let style = '';
          // 对每个字段列，找出该列的最大值和最小值，分别用不同颜色标记
          if (f !== 'deviceId' && value !== null && value !== undefined && Number.isFinite(value)) {
            const extremes = columnExtremes[f];
            if (extremes) {
              // 如果最大值和最小值相同，优先用 maxColor
              if (
                extremes.max !== null &&
                extremes.min !== null &&
                extremes.max === extremes.min &&
                value === extremes.max
              ) {
                style = ` style="color: ${config.maxColor || '#ef4444'};"`;
              } else {
                // 如果值等于该列的最大值，用 maxColor 标记
                if (extremes.max !== null && value === extremes.max) {
                  style = ` style="color: ${config.maxColor || '#ef4444'};"`;
                }
                // 如果值等于该列的最小值，用 minColor 标记
                if (extremes.min !== null && value === extremes.min) {
                  style = ` style="color: ${config.minColor || '#2563eb'};"`;
                }
              }
            }
          }
          return `<td${style}>${display}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const html = `<table data-source="${dataSourceAttr}" data-source-type="analysisTable" title="${tooltip}"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
  return { html, payload };
};

/**
 * 区间所用时间分析表构建器
 */
export const buildIntervalDurationTable: AnalysisTableBuilder = (
  config: IntervalDurationConfig,
  taskId: string,
  tags: TemplateTag[],
  helpers: HelperFunctions
) => {
  const {
    collectLocationValues,
    parseTagDateValue,
    formatNumber,
    getTaskDataFromLoki,
    stringifyDataSource,
    formatTooltip,
  } = helpers;

  const locationValues = collectLocationValues(config.locationTagIds, tags);
  if (locationValues.length === 0) {
    throw new Error('请选择布点标签，且标签值不能为空');
  }

  const start = parseTagDateValue(config.startTagId, tags, false);
  const end = parseTagDateValue(config.endTagId, tags, true);
  const { startQuery, endQuery } = validateTimeRange(start, end);

  const valueKey = config.dataType === 'temperature' ? 'temperature' : 'humidity';
  const data = getTaskDataFromLoki(taskId, startQuery, endQuery, locationValues);
  const sortByTime = (list: any[]) =>
    [...list].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (data.length === 0) {
    throw new Error('指定时间范围内没有数据');
  }

  // 按设备分组，分析每个设备的数据趋势和极值
  const deviceDataMap = new Map<string, any[]>();
  for (const item of data) {
    const deviceId = item.deviceId;
    if (!deviceDataMap.has(deviceId)) {
      deviceDataMap.set(deviceId, []);
    }
    deviceDataMap.get(deviceId)!.push(item);
  }

  // 分析每个设备的数据，判断趋势并找到极值
  interface DeviceAnalysis {
    deviceId: string;
    data: any[];
    sortedData: any[];
    values: number[];
    min: number;
    max: number;
    firstValue: number;
    lastValue: number;
    isRising: boolean;
  }

  const deviceAnalyses: DeviceAnalysis[] = [];
  for (const [deviceId, deviceItems] of deviceDataMap.entries()) {
    const sortedData = sortByTime(deviceItems);
    const values = sortedData
      .map((item) => Number((item as any)[valueKey]))
      .filter((v) => Number.isFinite(v));

    if (values.length === 0) continue;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    const isRising = lastValue > firstValue;

    deviceAnalyses.push({
      deviceId,
      data: deviceItems,
      sortedData,
      values,
      min,
      max,
      firstValue,
      lastValue,
      isRising,
    });
  }

  if (deviceAnalyses.length === 0) {
    throw new Error('指定时间范围内没有有效数据');
  }

  // 判断整体趋势：如果大部分设备是上升趋势，则整体为上升趋势
  const risingCount = deviceAnalyses.filter((d) => d.isRising).length;
  const isRising = risingCount >= deviceAnalyses.length / 2;

  // 根据趋势选择设备：上升趋势选最大值设备，下降趋势选最小值设备
  let selectedDevice: DeviceAnalysis;
  if (isRising) {
    // 上升趋势：选择最大值最大的设备
    selectedDevice = deviceAnalyses.reduce((prev, curr) => (curr.max > prev.max ? curr : prev));
  } else {
    // 下降趋势：选择最小值最小的设备
    selectedDevice = deviceAnalyses.reduce((prev, curr) => (curr.min < prev.min ? curr : prev));
  }

  // 使用选中设备的数据进行分析
  const selectedData = selectedDevice.sortedData;
  const selectedValues = selectedDevice.values;
  const dataMin = selectedDevice.min;
  const dataMax = selectedDevice.max;

  // 获取上限和下限
  const upperLimit = config.upperLimit ? parseFloat(config.upperLimit) : null;
  const lowerLimit = config.lowerLimit ? parseFloat(config.lowerLimit) : null;

  // 确定有效的最小值和最大值
  let effectiveMin = lowerLimit !== null ? lowerLimit : dataMin;
  let effectiveMax = upperLimit !== null ? upperLimit : dataMax;

  // 计算刻度：向上取整，保留一位小数
  const maxRows = config.maxRows || 10;
  const range = effectiveMax - effectiveMin;
  const step = Math.ceil((range / maxRows) * 10) / 10; // 向上取整并保留一位小数

  // 计算区间变化
  interface IntervalRow {
    interval: string;
    duration: number; // 分钟
    threshold: number; // 阈值
  }

  const intervals: IntervalRow[] = [];

  // 找到达到最大值和最小值的时间点
  let maxReachedTime: Date | null = null;
  let minReachedTime: Date | null = null;

  for (const item of selectedData) {
    const value = Number((item as any)[valueKey]);
    if (!Number.isFinite(value)) continue;

    if (maxReachedTime === null && value >= effectiveMax) {
      maxReachedTime = new Date(item.timestamp);
    }
    if (minReachedTime === null && value <= effectiveMin) {
      minReachedTime = new Date(item.timestamp);
    }

    if (maxReachedTime && minReachedTime) break;
  }

  // 根据趋势生成区间
  if (isRising) {
    // 上升趋势：从最大值向下递减，区间格式为 threshold-max（固定最大值）
    // 例如：9-10, 8-10, 7-10, ..., 1-10
    // 用时：从该阈值到最大值的时间差（变化越大，用时越长）
    for (let i = 0; i < maxRows; i++) {
      // 从 effectiveMax - step 开始，每次减 step，直到接近 effectiveMin
      const threshold = effectiveMax - step * (i + 1);
      if (threshold <= effectiveMin) break;

      // 找到选中设备数据中首次达到或超过该阈值的时间
      let thresholdReachedTime: Date | null = null;
      for (const item of selectedData) {
        const value = Number((item as any)[valueKey]);
        if (!Number.isFinite(value)) continue;
        if (value >= threshold) {
          thresholdReachedTime = new Date(item.timestamp);
          break;
        }
      }

      if (thresholdReachedTime && maxReachedTime) {
        // 计算从该阈值到最大值的时间差（变化越大，用时越长）
        const durationMinutes = Math.round(
          (maxReachedTime.getTime() - thresholdReachedTime.getTime()) / (1000 * 60)
        );
        const intervalStr = `${formatNumber(threshold, 1)}-${formatNumber(effectiveMax, 1)}`;
        intervals.push({
          interval: intervalStr,
          duration: durationMinutes,
          threshold: threshold,
        });
      }
    }
  } else {
    // 下降趋势：从最小值向上递增，区间格式为 threshold-min（固定最小值）
    // 例如：1-0, 2-0, 3-0, ..., 9-0
    // 用时：从该阈值到最小值的时间差（变化越大，用时越长）
    for (let i = 0; i < maxRows; i++) {
      // 从 effectiveMin + step 开始，每次加 step，直到接近 effectiveMax
      const threshold = effectiveMin + step * (i + 1);
      if (threshold >= effectiveMax) break;

      // 找到选中设备数据中首次达到或低于该阈值的时间
      let thresholdReachedTime: Date | null = null;
      for (const item of selectedData) {
        const value = Number((item as any)[valueKey]);
        if (!Number.isFinite(value)) continue;
        if (value <= threshold) {
          thresholdReachedTime = new Date(item.timestamp);
          break;
        }
      }

      if (thresholdReachedTime && minReachedTime) {
        // 计算从该阈值到最小值的时间差（变化越大，用时越长）
        // 对于下降趋势，minReachedTime在thresholdReachedTime之后
        const durationMinutes = Math.round(
          (minReachedTime.getTime() - thresholdReachedTime.getTime()) / (1000 * 60)
        );
        const intervalStr = `${formatNumber(threshold, 1)}-${formatNumber(effectiveMin, 1)}`;
        intervals.push({
          interval: intervalStr,
          duration: durationMinutes,
          threshold: threshold,
        });
      }
    }
  }

  // 按阈值排序（温度字段反序，用时保持原序）
  // 上升趋势：温度从小到大（1-10, 2-10, ..., 9-10），用时从大到小
  // 下降趋势：温度从大到小（9-0, 8-0, ..., 1-0），用时从小到大
  intervals.sort((a, b) => (isRising ? a.threshold - b.threshold : b.threshold - a.threshold));
  const finalIntervals = intervals;

  // 生成表格
  const headerLabel = config.dataType === 'temperature' ? '温度（℃）' : '湿度（%）';
  const headerHtml = `<tr><th>${headerLabel}</th><th>所用时间（min）</th></tr>`;
  const bodyHtml =
    finalIntervals.length > 0
      ? finalIntervals.map((row) => `<tr><td>${row.interval}</td><td>${row.duration}</td></tr>`).join('')
      : `<tr><td colspan="2" style="text-align:center;">无数据</td></tr>`;

  const payload: AnalysisTableDataSource = {
    type: 'analysisTable',
    tableType: 'intervalDuration',
    config: config,
    summary: { deviceCount: locationValues.length, rowCount: finalIntervals.length },
    lastUpdatedAt: new Date().toISOString(),
  };
  const dataSourceAttr = stringifyDataSource(payload);
  const tooltip = escapeAttr(formatTooltip(payload));
  const html = `<table data-source="${dataSourceAttr}" data-source-type="analysisTable" title="${tooltip}"><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table>`;
  return { html, payload };
};

/**
 * 终端与验证设备并排表构建器
 */
export const buildTerminalBindingTable: AnalysisTableBuilder = (
  config: TerminalBindingConfig,
  taskId: string,
  tags: TemplateTag[],
  helpers: HelperFunctions
) => {
  const {
    collectLocationValues,
    parseTagDateValue,
    formatNumber,
    formatDateTimeForDisplay,
    getTaskDataFromLoki,
    stringifyDataSource,
    formatTooltip,
  } = helpers;

  const locationTerminal = collectLocationValues(config.terminalTagId ? [config.terminalTagId] : [], tags)[0];
  const locationValidation = collectLocationValues(config.validationTagId ? [config.validationTagId] : [], tags)[0];
  if (!locationTerminal || !locationValidation) {
    throw new Error('请选择终端设备和验证设备标签，并确保其值不为空');
  }

  const start = parseTagDateValue(config.startTagId, tags, false);
  const end = parseTagDateValue(config.endTagId, tags, true);
  const { startQuery, endQuery } = validateTimeRange(start, end);

  const valueKey = config.dataType === 'temperature' ? 'temperature' : 'humidity';
  const data = getTaskDataFromLoki(taskId, startQuery, endQuery, [locationTerminal, locationValidation]);
  const sortByTime = (list: any[]) =>
    [...list].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const terminalData = sortByTime(data.filter((d) => d.deviceId === locationTerminal));
  const validationData = sortByTime(data.filter((d) => d.deviceId === locationValidation));
  const maxLen = Math.max(terminalData.length, validationData.length);
  const pairs: Array<{ terminal?: any; validation?: any }> = [];
  for (let i = 0; i < maxLen; i++) {
    pairs.push({
      terminal: terminalData[i],
      validation: validationData[i],
    });
  }

  const headerLabel = config.dataType === 'temperature' ? '温度' : '湿度';
  const rows: Array<{
    left?: { terminal?: any; validation?: any };
    right?: { terminal?: any; validation?: any };
  }> = [];
  for (let i = 0; i < pairs.length; i += 2) {
    rows.push({ left: pairs[i], right: pairs[i + 1] });
  }

  const buildCells = (entry?: { terminal?: any; validation?: any }) => {
    const time = entry?.terminal?.timestamp
      ? formatDateTimeForDisplay(new Date(entry.terminal.timestamp))
      : entry?.validation?.timestamp
      ? formatDateTimeForDisplay(new Date(entry.validation.timestamp))
      : '—';
    const terminalVal =
      entry?.terminal && Number.isFinite(Number(entry.terminal[valueKey]))
        ? formatNumber(Number(entry.terminal[valueKey]))
        : '—';
    const validationVal =
      entry?.validation && Number.isFinite(Number(entry.validation[valueKey]))
        ? formatNumber(Number(entry.validation[valueKey]))
        : '—';
    return { time, terminalVal, validationVal };
  };

  const bodyHtml =
    rows.length > 0
      ? rows
          .map((row) => {
            const left = buildCells(row.left);
            const right = buildCells(row.right);
            return `<tr><td>${left.time}</td><td>${left.terminalVal}</td><td>${left.validationVal}</td><td>${right.time}</td><td>${right.terminalVal}</td><td>${right.validationVal}</td></tr>`;
          })
          .join('')
      : `<tr><td colspan="6" style="text-align:center;">无数据</td></tr>`;

  const payload: AnalysisTableDataSource = {
    type: 'analysisTable',
    tableType: 'terminalBinding',
    config: config,
    summary: { deviceCount: 2, rowCount: rows.length },
    lastUpdatedAt: new Date().toISOString(),
  };
  const dataSourceAttr = stringifyDataSource(payload);
  const tooltip = escapeAttr(formatTooltip(payload));
  const headerHtml = `<tr><th>时间</th><th>终端设备</th><th>验证设备</th><th>时间</th><th>终端设备</th><th>验证设备</th></tr>`;
  const html = `<table data-source="${dataSourceAttr}" data-source-type="analysisTable" title="${tooltip}"><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table>`;
  return { html, payload };
};

/**
 * 分析表构建器映射表
 * 添加新的分析表类型时，只需在此注册即可
 */
export const analysisTableBuilders: Record<AnalysisTableType, AnalysisTableBuilder> = {
  deviceAnalysis: buildDeviceAnalysisTable,
  intervalDuration: buildIntervalDurationTable,
  terminalBinding: buildTerminalBindingTable,
};

/**
 * 统一的分析表构建入口
 */
export const buildAnalysisTable = (
  config: AnalysisTableConfig,
  taskId: string,
  tags: TemplateTag[],
  helpers: HelperFunctions
): AnalysisTableBuildResult => {
  const builder = analysisTableBuilders[config.tableType];
  if (!builder) {
    throw new Error(`不支持的分析表类型: ${(config as any).tableType}`);
  }
  return builder(config, taskId, tags, helpers);
};

