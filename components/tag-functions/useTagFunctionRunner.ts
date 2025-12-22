'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  TagFunctionConfig,
  TagFunctionHookParams,
  TagFunctionStatus,
  TagFunctionType,
} from './types';
import type { TemplateTag } from '../TemplateTagList';
import { getTaskDataFromLoki } from '@/lib/lokijs';

interface FunctionResult {
  status: TagFunctionStatus;
  message: string;
  value?: string | number;
  detail?: string;
}

interface ThresholdConfig {
  defaultValue: number;
  label: string;
}

const FUNCTION_THRESHOLD_MAP: Record<string, ThresholdConfig> = {
  tempReachUpper: { defaultValue: 8, label: '上限温度' },
  tempReachLower: { defaultValue: 2, label: '下限温度' },
  humidityReachUpper: { defaultValue: 80, label: '上限湿度' },
  humidityReachLower: { defaultValue: 20, label: '下限湿度' },
  tempExceedUpper: { defaultValue: 8, label: '上限温度' },
  tempExceedLower: { defaultValue: 2, label: '下限温度' },
  humidityExceedUpper: { defaultValue: 80, label: '上限湿度' },
  humidityExceedLower: { defaultValue: 20, label: '下限湿度' },
  tempFirstReachUpperTime: { defaultValue: 8, label: '上限温度' },
  tempFirstReachLowerTime: { defaultValue: 2, label: '下限温度' },
};

const VALUE_FUNCTIONS: TagFunctionType[] = [
  'maxTemp',
  'minTemp',
  'avgTemp',
  'maxHumidity',
  'minHumidity',
  'avgHumidity',
  'centerPointTempDeviation',
  'tempUniformity',
  'centerPointTempFluctuation',
  'tempVariationRangeSum',
  'tempAvgDeviation',
  'tempUniformityMax',
  'tempUniformityMin',
  'tempUniformityValue',
  'powerConsumptionRate',
  'maxPowerUsageDuration',
  'avgCoolingRate',
  'deviceTimePointTemp',
  'maxTempDiffAtSameTime',
];

const TIME_FUNCTIONS: TagFunctionType[] = [
  'tempFirstReachUpperTime',
  'tempFirstReachLowerTime',
  'tempMaxTime',
  'tempMinTime',
  'maxTempDiffTimePoint',
];

const ARRIVAL_FUNCTIONS: TagFunctionType[] = [
  'tempReachUpper',
  'tempReachLower',
  'humidityReachUpper',
  'humidityReachLower',
];

const EXCEED_FUNCTIONS: TagFunctionType[] = [
  'tempExceedUpper',
  'tempExceedLower',
  'humidityExceedUpper',
  'humidityExceedLower',
];

// 将布点函数输出转换为数组，支持 `|`、英文逗号和中文逗号分隔
const toLocationArray = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.filter(Boolean).map((v) => String(v).trim()).filter(Boolean);
  if (raw === undefined || raw === null) return [];
  return String(raw)
    .split(/[|,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
};

const parseTagDate = (
  tag?: { value?: any }
): { date: Date | null; isDateOnly: boolean } => {
  if (!tag || tag.value === undefined || tag.value === null) {
    return { date: null, isDateOnly: false };
  }

  const raw = tag.value;
  // 数字时间戳
  if (typeof raw === 'number') {
    const date = new Date(raw);
    return { date: Number.isNaN(date.getTime()) ? null : date, isDateOnly: false };
  }

  const str = String(raw).trim();
  if (!str) return { date: null, isDateOnly: false };

  // 纯日期（按本地时区的当天 00:00:00）
  const dateOnlyMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const date = new Date(`${str}T00:00:00`);
    return { date: Number.isNaN(date.getTime()) ? null : date, isDateOnly: true };
  }

  // 替换空格为 T，按本地时区解析
  const normalized = str.includes('T') ? str : str.replace(' ', 'T');
  const parsed = new Date(normalized);
  return { date: Number.isNaN(parsed.getTime()) ? null : parsed, isDateOnly: false };
};

const getDistinctLocations = (ids: string[], allTags: any[]): string[] => {
  const list: string[] = [];
  ids.forEach((id) => {
    const tag = allTags.find((t) => t._id === id);
    if (tag && tag.type === 'location') {
      list.push(...toLocationArray(tag.value));
    }
  });
  return Array.from(new Set(list.filter(Boolean)));
};

const fmt = (d: Date) =>
  new Date(d).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

// 格式化时间为 YYYY-MM-DD HH:mm 格式
const formatDateTime = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
};

export function useTagFunctionRunner({ tag, allTags, taskId, onApply }: TagFunctionHookParams) {
  const [status, setStatus] = useState<TagFunctionStatus>('idle');
  const [message, setMessage] = useState<string>('');

  const functionConfig = useMemo<TagFunctionConfig | null>(() => {
    return (tag as any).functionConfig || null;
  }, [tag]);

  const updateTag = useCallback(
    (payload: Partial<TemplateTag>) => {
      if (!tag._id) return;
      onApply(tag._id, payload);
    },
    [onApply, tag._id]
  );

  const runFunction = useCallback(
    async (config: TagFunctionConfig): Promise<FunctionResult> => {
      // deviceTimePointTemp 需要特殊处理，提前返回
      if (config.functionType === 'deviceTimePointTemp') {
        // 获取布点标签（单选，只能有一个布点）
        if (!taskId) {
          return { status: 'error', message: '未关联任务，无法计算' };
        }

        const locations = getDistinctLocations(config.locationTagIds || [], allTags);
        if (locations.length === 0) {
          return { status: 'error', message: '请选择一个布点标签，且标签值不能为空' };
        }
        if (locations.length > 1) {
          return { status: 'error', message: '只能选择一个布点标签，当前有多个布点' };
        }

        const deviceId = locations[0];

        // 获取时间标签
        if (!config.timeTagId) {
          return { status: 'error', message: '请选择时间标签' };
        }

        const timeTag = allTags.find((t) => t._id === config.timeTagId);
        if (!timeTag) {
          return { status: 'error', message: '时间标签不存在' };
        }

        const { date: timeRaw } = parseTagDate(timeTag);
        if (!timeRaw) {
          return { status: 'error', message: '时间标签值无效' };
        }

        const timePoint = new Date(timeRaw);
        // 将时间精确到分钟（去掉秒和毫秒）
        timePoint.setSeconds(0, 0);

        // 定义时间窗口（该分钟内的所有数据）
        const windowStart = new Date(timePoint);
        const windowEnd = new Date(timePoint);
        windowEnd.setMinutes(windowEnd.getMinutes() + 1);

        // 根据 generateCurveChart.ts 的逻辑，数据存储的时间戳是 UTC+8（本地时间）
        // 查询时传入的也是本地时间，但需要加上 8 小时才能匹配数据库中的时间戳

        const startQuery = new Date(windowStart.getTime());
        const endQuery = new Date(windowEnd.getTime() );

        // 查询该时间点该设备的数据
        const data = getTaskDataFromLoki(taskId, startQuery, endQuery, [deviceId]);

        if (data.length === 0) {
          return {
            status: 'error',
            message: `时间点 ${fmt(timePoint)} 没有设备 ${deviceId} 的数据`,
            detail: `查询设备: ${deviceId}\n查询时间: ${fmt(timePoint)}\n查询窗口: ${fmt(windowStart)} ~ ${fmt(windowEnd)}\n命中: 0 条`,
          };
        }

        // 过滤出该设备的数据
        const deviceData = data.filter((item) => item.deviceId === deviceId);
        if (deviceData.length === 0) {
          return {
            status: 'error',
            message: `时间点 ${fmt(timePoint)} 没有设备 ${deviceId} 的数据`,
          };
        }

        // 计算该时间点的平均温度
        const temps = deviceData.map((item) => item.temperature).filter((temp) => Number.isFinite(temp));
        if (temps.length === 0) {
          return { status: 'error', message: '没有有效的温度数据' };
        }

        const avgTemp = temps.reduce((sum, temp) => sum + temp, 0) / temps.length;
        const fixed = Number.isFinite(avgTemp) ? Number(avgTemp.toFixed(2)) : avgTemp;

        return {
          status: 'success',
          message: `计算完成：${fixed}`,
          value: fixed,
          detail: `设备: ${deviceId}\n时间点: ${fmt(timePoint)}\n数据条数: ${temps.length}\n温度值: ${temps.map((t) => t.toFixed(2)).join(', ')}\n平均温度: ${fixed}℃`,
        };
      }

      // powerConsumptionRate 和 maxPowerUsageDuration 不需要 taskId 和 locations
      let locations: string[] = [];
      if (config.functionType !== 'powerConsumptionRate' && config.functionType !== 'maxPowerUsageDuration') {
        if (!taskId) {
          return { status: 'error', message: '未关联任务，无法计算' };
        }

        locations = getDistinctLocations(config.locationTagIds || [], allTags);
        if (!locations.length) {
          return { status: 'error', message: '请选择至少一个布点标签，且标签值不能为空' };
        }
      }

      const { date: startRaw, isDateOnly: startIsDateOnly } = parseTagDate(
        allTags.find((t) => t._id === config.startTagId)
      );
      const { date: endRaw, isDateOnly: endIsDateOnly } = parseTagDate(
        allTags.find((t) => t._id === config.endTagId)
      );

      if (!startRaw || !endRaw) {
        return { status: 'error', message: '开始或结束时间无效' };
      }

      // 纯日期的结束时间补齐到当天 23:59:59.999，避免时区导致漏数据
      const start = new Date(startRaw);
      const end = new Date(endRaw);
      if (startIsDateOnly) {
        start.setHours(0, 0, 0, 0);
      }
      if (endIsDateOnly) {
        end.setHours(23, 59, 59, 999);
      }
      const rangeDetail = `${fmt(start)} ~ ${fmt(end)}`;

      if (start > end) {
        return { status: 'error', message: '开始时间不能晚于结束时间' };
      }

      // powerConsumptionRate 和 maxPowerUsageDuration 不需要查询数据，直接处理
      if (config.functionType === 'powerConsumptionRate' || config.functionType === 'maxPowerUsageDuration') {
        // 获取开始电量和结束电量
        if (!config.startPowerTagId || !config.endPowerTagId) {
          return { status: 'error', message: '请选择开始电量和结束电量标签' };
        }

        const startPowerTag = allTags.find((t) => t._id === config.startPowerTagId);
        const endPowerTag = allTags.find((t) => t._id === config.endPowerTagId);

        if (!startPowerTag || !endPowerTag) {
          return { status: 'error', message: '开始电量或结束电量标签不存在' };
        }

        // 获取电量值
        const startPowerValue = startPowerTag.value;
        const endPowerValue = endPowerTag.value;

        if (startPowerValue === undefined || startPowerValue === null || startPowerValue === '') {
          return { status: 'error', message: '开始电量标签值不能为空' };
        }
        if (endPowerValue === undefined || endPowerValue === null || endPowerValue === '') {
          return { status: 'error', message: '结束电量标签值不能为空' };
        }

        // 转换为数字
        const startPower = typeof startPowerValue === 'number' ? startPowerValue : parseFloat(String(startPowerValue));
        const endPower = typeof endPowerValue === 'number' ? endPowerValue : parseFloat(String(endPowerValue));

        if (Number.isNaN(startPower)) {
          return { status: 'error', message: `开始电量标签值不是有效的数字: ${startPowerValue}` };
        }
        if (Number.isNaN(endPower)) {
          return { status: 'error', message: `结束电量标签值不是有效的数字: ${endPowerValue}` };
        }

        // 计算时间差
        const durationMs = end.getTime() - start.getTime();
        const durationHours = durationMs / (1000 * 60 * 60);
        const durationMinutes = Math.floor(durationMs / (1000 * 60));

        if (durationHours <= 0) {
          return { status: 'error', message: '时间范围无效，结束时间必须晚于开始时间' };
        }

        if (config.functionType === 'powerConsumptionRate') {
          // 计算耗电率：(开始电量 - 结束电量) / 时间差（小时）
          const consumptionRate = (startPower - endPower) / durationHours;
          const fixed = Number.isFinite(consumptionRate) ? Number(consumptionRate.toFixed(2)) : consumptionRate;

          return {
            status: 'success',
            message: `计算完成：${fixed}`,
            value: fixed,
            detail: `开始时间: ${rangeDetail}\n开始电量: ${startPower}%\n结束电量: ${endPower}%\n时间差: ${durationHours.toFixed(2)} 小时\n耗电率: ${fixed} %/小时`,
          };
        }

        if (config.functionType === 'maxPowerUsageDuration') {
          // 计算功率：(开始电量 - 结束电量) / (时间差分钟数 / 60)
          const powerConsumption = (startPower - endPower) / (durationMinutes / 60);

          if (powerConsumption === 0 || !Number.isFinite(powerConsumption)) {
            return { status: 'error', message: '功率计算无效，开始电量不能等于结束电量' };
          }

          // 计算最长使用时长：90 / 功率，保留两位小数
          const maxDuration = 90 / powerConsumption;
          const fixed = Number.isFinite(maxDuration) ? Number(maxDuration.toFixed(2)) : maxDuration;

          return {
            status: 'success',
            message: `计算完成：${fixed}`,
            value: fixed,
            detail: `开始时间: ${rangeDetail}\n开始电量: ${startPower}%\n结束电量: ${endPower}%\n时间差: ${durationMinutes} 分钟\n功率: ${powerConsumption.toFixed(2)} %/小时\n最长使用时长: ${fixed} 小时`,
          };
        }
      }
  
      // 根据 generateCurveChart.ts 的逻辑，数据存储的时间戳是 UTC+8（本地时间）
      // 查询时传入的也是本地时间，但需要加上 8 小时才能匹配数据库中的时间戳
      // 这是因为数据库中的时间戳实际上是本地时间，但被当作 UTC 时间存储了
 
      const startQuery = new Date(start.getTime() );
      const endQuery = new Date(end.getTime() );
      
      const data = getTaskDataFromLoki(taskId!, startQuery, endQuery, locations);
      const queryInfo = [
        `查询设备: ${locations.join(' | ') || '无'}`,
        `本地时间: ${rangeDetail}`,
        `命中: ${data.length} 条`,
      ].join('\n');
      if (!data.length) {
        return {
          status: 'error',
          message: `时间范围内没有匹配数据`,
          detail: queryInfo,
        };
      }

      const thresholdCfg = FUNCTION_THRESHOLD_MAP[config.functionType];
      const threshold = config.threshold ?? thresholdCfg?.defaultValue;

      if (config.functionType === 'maxTempDiffAtSameTime' || config.functionType === 'maxTempDiffTimePoint') {
        // 过滤出在指定布点范围内的数据
        const filteredData = data.filter((item) => locations.includes(item.deviceId));
        if (!filteredData.length) {
          return {
            status: 'error',
            message: '时间范围内没有匹配的布点数据',
            detail: queryInfo,
          };
        }

        // 按时间点分组（精确到分钟），计算每个时间点的温度差值
        const timePointMap = new Map<string, { temps: number[]; timestamp: Date }>();
        filteredData.forEach((item) => {
          const temp = item.temperature;
          if (!Number.isFinite(temp)) return;

          // 将时间戳格式化为分钟级别（去掉秒和毫秒）
          const timestamp = new Date(item.timestamp as any);
          const timeKey = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')} ${String(timestamp.getHours()).padStart(2, '0')}:${String(timestamp.getMinutes()).padStart(2, '0')}`;

          const existing = timePointMap.get(timeKey);
          if (!existing) {
            timePointMap.set(timeKey, { temps: [temp], timestamp });
          } else {
            existing.temps.push(temp);
          }
        });

        if (timePointMap.size === 0) {
          return { status: 'error', message: '没有有效的温度数据' };
        }

        // 计算每个时间点的温度差值（最大值 - 最小值）
        const timePointDiffs: Array<{ timeKey: string; diff: number; timestamp: Date; maxTemp: number; minTemp: number }> = [];
        timePointMap.forEach((data, timeKey) => {
          const maxTemp = Math.max(...data.temps);
          const minTemp = Math.min(...data.temps);
          const diff = maxTemp - minTemp;
          timePointDiffs.push({
            timeKey,
            diff,
            timestamp: data.timestamp,
            maxTemp,
            minTemp,
          });
        });

        // 找出差值最大的时间点
        let maxDiffItem = timePointDiffs[0];
        for (const item of timePointDiffs) {
          if (item.diff > maxDiffItem.diff) {
            maxDiffItem = item;
          }
        }

        if (config.functionType === 'maxTempDiffAtSameTime') {
          // 返回差值
          const fixed = Number.isFinite(maxDiffItem.diff) ? Number(maxDiffItem.diff.toFixed(1)) : maxDiffItem.diff;
          return {
            status: 'success',
            message: `计算完成：${fixed}`,
            value: fixed,
            detail: `${queryInfo}\n最大温度差值: ${fixed}\n对应时间点: ${maxDiffItem.timeKey}\n该时间点最高温度: ${maxDiffItem.maxTemp.toFixed(1)}\n该时间点最低温度: ${maxDiffItem.minTemp.toFixed(1)}\n时间点总数: ${timePointDiffs.length}`,
          };
        } else {
          // 返回时间点
          const formattedTime = formatDateTime(maxDiffItem.timestamp);
          return {
            status: 'success',
            message: `计算完成：${formattedTime}`,
            value: formattedTime,
            detail: `${queryInfo}\n最大温度差值: ${maxDiffItem.diff.toFixed(1)}\n对应时间点: ${formattedTime}\n该时间点最高温度: ${maxDiffItem.maxTemp.toFixed(1)}\n该时间点最低温度: ${maxDiffItem.minTemp.toFixed(1)}\n时间点总数: ${timePointDiffs.length}`,
          };
        }
      }

      if (VALUE_FUNCTIONS.includes(config.functionType)) {
        const metric = config.functionType.includes('Temp') ? 'temperature' : 'humidity';
        const values = data.map((item) => (metric === 'temperature' ? item.temperature : item.humidity));
        if (!values.length) return { status: 'error', message: '没有可计算的数据' };
        let result: number;
        switch (config.functionType) {
          case 'maxTemp':
          case 'maxHumidity':
            result = Math.max(...values);
            break;
          case 'minTemp':
          case 'minHumidity':
            result = Math.min(...values);
            break;
          case 'avgTemp':
          case 'avgHumidity':
            result = values.reduce((sum, v) => sum + v, 0) / values.length;
            break;
          default:
            return { status: 'error', message: '未知函数类型' };
        }
        const fixed = Number.isFinite(result) ? Number(result.toFixed(1)) : result;
        return {
          status: 'success',
          message: `计算完成：${fixed}`,
          value: fixed,
          detail: `${queryInfo}\n结果: ${fixed}`,
        };
      }

      if (ARRIVAL_FUNCTIONS.includes(config.functionType)) {
        const metric = config.functionType.startsWith('temp') ? 'temperature' : 'humidity';
        const isUpper = config.functionType.includes('Upper');
        const sorted = [...data].sort((a, b) => new Date(a.timestamp as any).getTime() - new Date(b.timestamp as any).getTime());

        const reachMap = new Map<string, Date>();
        sorted.forEach((item) => {
          if (!locations.includes(item.deviceId)) return;
          const value = metric === 'temperature' ? item.temperature : item.humidity;
          const reached = isUpper ? value >= (threshold ?? 0) : value <= (threshold ?? 0);
          if (reached && !reachMap.has(item.deviceId)) {
            reachMap.set(item.deviceId, new Date(item.timestamp as any));
          }
        });

        if (!reachMap.size) {
          return {
            status: 'error',
            message: '未找到满足条件的测点',
            detail: `${queryInfo}\n阈值: ${threshold ?? '默认'}\n未满足条件`,
          };
        }

        let earliest: { deviceId: string; time: Date } | null = null;
        reachMap.forEach((time, deviceId) => {
          if (!earliest || time < earliest.time) {
            earliest = { deviceId, time };
          }
        });

        const fastestDevices = Array.from(reachMap.entries())
          .filter(([, time]) => earliest && time.getTime() === earliest.time.getTime())
          .map(([deviceId]) => deviceId);

        const output = fastestDevices.join(' | ');
        return {
          status: 'success',
          message: `计算完成：${output}`,
          value: output,
          detail: `${queryInfo}\n阈值: ${threshold}\n最快: ${output}`,
        };
      }

      if (EXCEED_FUNCTIONS.includes(config.functionType)) {
        const metric = config.functionType.startsWith('temp') ? 'temperature' : 'humidity';
        const isUpper = config.functionType.includes('Upper');
        const matched = new Set<string>();

        data.forEach((item) => {
          if (!locations.includes(item.deviceId)) return;
          const value = metric === 'temperature' ? item.temperature : item.humidity;
          const exceeded = isUpper ? value >= (threshold ?? 0) : value <= (threshold ?? 0);
          if (exceeded) matched.add(item.deviceId);
        });

        if (!matched.size) {
          return {
            status: 'error',
            message: '未找到满足条件的测点',
            detail: `${queryInfo}\n阈值: ${threshold ?? '默认'}\n未满足条件`,
          };
        }

        const output = Array.from(matched).join(' | ');
        return {
          status: 'success',
          message: `计算完成：${output}`,
          value: output,
          detail: `${queryInfo}\n阈值: ${threshold}\n测点: ${output}`,
        };
      }

      if (config.functionType === 'maxTempLocation' || config.functionType === 'minTempLocation') {
        // 过滤出在指定布点范围内的数据
        const filteredData = data.filter((item) => locations.includes(item.deviceId));
        if (!filteredData.length) {
          return {
            status: 'error',
            message: '时间范围内没有匹配的布点数据',
            detail: queryInfo,
          };
        }

        // 找到最高或最低温度值
        const temperatures = filteredData.map((item) => item.temperature);
        const targetTemp = config.functionType === 'maxTempLocation' 
          ? Math.max(...temperatures)
          : Math.min(...temperatures);

        // 找出所有达到这个温度值的测点（去重）
        const matchedDevices = new Set<string>();
        filteredData.forEach((item) => {
          if (item.temperature === targetTemp) {
            matchedDevices.add(item.deviceId);
          }
        });

        if (!matchedDevices.size) {
          return {
            status: 'error',
            message: '未找到对应温度的测点',
            detail: `${queryInfo}\n目标温度: ${targetTemp}\n未找到测点`,
          };
        }

        const output = Array.from(matchedDevices).join(' | ');
        const tempLabel = config.functionType === 'maxTempLocation' ? '最高温度' : '最低温度';
        return {
          status: 'success',
          message: `计算完成：${output}`,
          value: output,
          detail: `${queryInfo}\n${tempLabel}: ${targetTemp}\n测点: ${output}`,
        };
      }

      if (config.functionType === 'centerPointTempDeviation') {
        // 获取中心点布点标签
        if (!config.centerPointTagId) {
          return { status: 'error', message: '请选择中心点布点标签' };
        }

        const centerPointTag = allTags.find((t) => t._id === config.centerPointTagId);
        if (!centerPointTag) {
          return { status: 'error', message: '中心点布点标签不存在' };
        }

        // 获取中心点布点标签的值（温度设定值）
        let centerPointValue: string | number | undefined;
        if (Array.isArray(centerPointTag.value)) {
          if (centerPointTag.value.length === 0) {
            return { status: 'error', message: '中心点布点标签值不能为空' };
          }
          if (centerPointTag.value.length > 1) {
            return { status: 'error', message: '中心点布点标签只能有一个值，当前有多个值' };
          }
          centerPointValue = centerPointTag.value[0];
        } else {
          centerPointValue = centerPointTag.value;
        }

        if (centerPointValue === undefined || centerPointValue === null || centerPointValue === '') {
          return { status: 'error', message: '中心点布点标签值不能为空' };
        }

        // 检查字符串中是否包含分隔符（如果有多个值则报错）
        if (typeof centerPointValue === 'string') {
          const parts = centerPointValue.split(/[|,，]/).map((s) => s.trim()).filter(Boolean);
          if (parts.length > 1) {
            return { status: 'error', message: '中心点布点标签只能有一个值，当前有多个值（用 | 或逗号分隔）' };
          }
          // 使用第一个部分作为值
          centerPointValue = parts[0];
        }

        // 将中心点值转换为数字（温度设定值）
        const td = typeof centerPointValue === 'number' ? centerPointValue : parseFloat(String(centerPointValue));
        if (Number.isNaN(td)) {
          return { status: 'error', message: `中心点布点标签值不是有效的数字: ${centerPointValue}` };
        }

        // 过滤出在指定布点范围内的数据
        const filteredData = data.filter((item) => locations.includes(item.deviceId));
        if (!filteredData.length) {
          return {
            status: 'error',
            message: '时间范围内没有匹配的布点数据',
            detail: queryInfo,
          };
        }

        // 计算平均温度
        const temperatures = filteredData.map((item) => item.temperature);
        const avgTemp = temperatures.reduce((sum, v) => sum + v, 0) / temperatures.length;

        // 计算偏差值：abs(td - 平均温度)
        const deviation = Math.abs(td - avgTemp);
        const fixed = Number.isFinite(deviation) ? Number(deviation.toFixed(1)) : deviation;

        return {
          status: 'success',
          message: `计算完成：${fixed}`,
          value: fixed,
          detail: `${queryInfo}\n中心点温度设定值: ${td}\n平均温度: ${avgTemp.toFixed(1)}\n偏差值: ${fixed}`,
        };
      }

      if (config.functionType === 'tempUniformity') {
        // 过滤出在指定布点范围内的数据
        const filteredData = data.filter((item) => locations.includes(item.deviceId));
        if (!filteredData.length) {
          return {
            status: 'error',
            message: '时间范围内没有匹配的布点数据',
            detail: queryInfo,
          };
        }

        // 计算时间差（分钟数）
        const durationMs = end.getTime() - start.getTime();
        const minutes = Math.floor(durationMs / (1000 * 60));
        if (minutes <= 0) {
          return { status: 'error', message: '时间范围无效，结束时间必须晚于开始时间' };
        }

        // 按设备分组，计算每个设备的温度变化范围（最高温度 - 最低温度）
        const deviceTempMap = new Map<string, { min: number; max: number }>();
        filteredData.forEach((item) => {
          const deviceId = item.deviceId;
          const temp = item.temperature;
          if (!Number.isFinite(temp)) return;

          const existing = deviceTempMap.get(deviceId);
          if (!existing) {
            deviceTempMap.set(deviceId, { min: temp, max: temp });
          } else {
            existing.min = Math.min(existing.min, temp);
            existing.max = Math.max(existing.max, temp);
          }
        });

        if (deviceTempMap.size === 0) {
          return { status: 'error', message: '没有有效的温度数据' };
        }

        // 计算每个设备的温度变化范围并求和
        let temperatureVariationRange = 0;
        const deviceDetails: string[] = [];
        deviceTempMap.forEach((range, deviceId) => {
          const variation = range.max - range.min;
          temperatureVariationRange += variation;
          deviceDetails.push(`${deviceId}: ${range.min.toFixed(1)}~${range.max.toFixed(1)} (范围: ${variation.toFixed(1)})`);
        });

        // 计算均匀度值：温度变化范围总和 / 分钟数
        const uniformity = temperatureVariationRange / minutes;
        const fixed = Number.isFinite(uniformity) ? Number(Math.abs(uniformity).toFixed(2)) : Math.abs(uniformity);

        return {
          status: 'success',
          message: `计算完成：${fixed}`,
          value: fixed,
          detail: `${queryInfo}\n时间范围: ${minutes} 分钟\n设备数量: ${deviceTempMap.size}\n温度变化范围总和: ${temperatureVariationRange.toFixed(2)}\n均匀度值: ${fixed}\n\n设备详情:\n${deviceDetails.join('\n')}`,
        };
      }

      if (config.functionType === 'centerPointTempFluctuation') {
        // 过滤出在指定布点范围内的数据
        const filteredData = data.filter((item) => locations.includes(item.deviceId));
        if (!filteredData.length) {
          return {
            status: 'error',
            message: '时间范围内没有匹配的布点数据',
            detail: queryInfo,
          };
        }

        // 获取所有有效的温度值
        const temperatures = filteredData
          .map((item) => item.temperature)
          .filter((temp) => Number.isFinite(temp));

        if (temperatures.length === 0) {
          return { status: 'error', message: '没有有效的温度数据' };
        }

        // 计算最高温度和最低温度
        const maxTemp = Math.max(...temperatures);
        const minTemp = Math.min(...temperatures);

        // 计算波动度：abs((最高温度 - 最低温度) / 2)
        const fluctuation = Math.abs((maxTemp - minTemp) / 2);
        const fixed = Number.isFinite(fluctuation) ? Number(fluctuation.toFixed(2)) : fluctuation;

        return {
          status: 'success',
          message: `计算完成：${fixed}`,
          value: fixed,
          detail: `${queryInfo}\n最高温度: ${maxTemp.toFixed(2)}\n最低温度: ${minTemp.toFixed(2)}\n温度差: ${(maxTemp - minTemp).toFixed(2)}\n波动度: ${fixed}`,
        };
      }

      if (config.functionType === 'tempVariationRangeSum') {
        // 过滤出在指定布点范围内的数据
        const filteredData = data.filter((item) => locations.includes(item.deviceId));
        if (!filteredData.length) {
          return {
            status: 'error',
            message: '时间范围内没有匹配的布点数据',
            detail: queryInfo,
          };
        }

        // 按设备分组，计算每个设备的温度变化范围（最高温度 - 最低温度）
        const deviceTempMap = new Map<string, { min: number; max: number }>();
        filteredData.forEach((item) => {
          const deviceId = item.deviceId;
          const temp = item.temperature;
          if (!Number.isFinite(temp)) return;

          const existing = deviceTempMap.get(deviceId);
          if (!existing) {
            deviceTempMap.set(deviceId, { min: temp, max: temp });
          } else {
            existing.min = Math.min(existing.min, temp);
            existing.max = Math.max(existing.max, temp);
          }
        });

        if (deviceTempMap.size === 0) {
          return { status: 'error', message: '没有有效的温度数据' };
        }

        // 计算每个设备的温度变化范围并求和
        let temperatureVariationRange = 0;
        const deviceDetails: string[] = [];
        deviceTempMap.forEach((range, deviceId) => {
          const variation = range.max - range.min;
          temperatureVariationRange += variation;
          deviceDetails.push(`${deviceId}: ${range.min.toFixed(1)}~${range.max.toFixed(1)} (范围: ${variation.toFixed(1)})`);
        });

        // 输出温度变化范围总和，保留一位小数
        const fixed = Number.isFinite(temperatureVariationRange)
          ? Number(Math.abs(temperatureVariationRange).toFixed(1))
          : Math.abs(temperatureVariationRange);

        return {
          status: 'success',
          message: `计算完成：${fixed}`,
          value: fixed,
          detail: `${queryInfo}\n设备数量: ${deviceTempMap.size}\n温度变化范围总和: ${fixed}\n\n设备详情:\n${deviceDetails.join('\n')}`,
        };
      }

      if (config.functionType === 'tempFluctuation') {
        // 过滤出在指定布点范围内的数据
        const filteredData = data.filter((item) => locations.includes(item.deviceId));
        if (!filteredData.length) {
          return {
            status: 'error',
            message: '时间范围内没有匹配的布点数据',
            detail: queryInfo,
          };
        }

        const temps = filteredData
          .map((item) => item.temperature)
          .filter((temp) => Number.isFinite(temp));

        if (!temps.length) {
          return { status: 'error', message: '没有有效的温度数据' };
        }

        const maxTemp = Math.max(...temps);
        const minTemp = Math.min(...temps);
        const dp = config.decimalPlaces ?? 2;
        const fluctuation = (maxTemp - minTemp) / 2;
        const fixed = Number.isFinite(fluctuation) ? Number(fluctuation.toFixed(dp)) : fluctuation;

        return {
          status: 'success',
          message: `计算完成：±${fixed}`,
          value: fixed,
          detail: `${queryInfo}\n小数位数: ${dp}\n最高温度: ${maxTemp.toFixed(dp)}\n最低温度: ${minTemp.toFixed(dp)}\n温度差: ${(maxTemp - minTemp).toFixed(dp)}\n温度波动度(±(max-min)/2): ±${fixed}`,
        };
      }

      if (config.functionType === 'tempUniformityAverage') {
        // 过滤出在指定布点范围内的数据
        const filteredData = data.filter((item) => locations.includes(item.deviceId));
        if (!filteredData.length) {
          return {
            status: 'error',
            message: '时间范围内没有匹配的布点数据',
            detail: queryInfo,
          };
        }

        // 按时间点（分钟粒度）分组
        const timePointMap = new Map<string, number[]>();
        filteredData.forEach((item) => {
          const temp = item.temperature;
          if (!Number.isFinite(temp)) return;
          const timestamp = new Date(item.timestamp as any);
          const timeKey = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')} ${String(timestamp.getHours()).padStart(2, '0')}:${String(timestamp.getMinutes()).padStart(2, '0')}`;
          const list = timePointMap.get(timeKey);
          if (!list) {
            timePointMap.set(timeKey, [temp]);
          } else {
            list.push(temp);
          }
        });

        if (timePointMap.size === 0) {
          return { status: 'error', message: '没有有效的温度数据' };
        }

        // 计算每次测量的温度差（最高-最低），再取算术平均值
        const timePointDiffs: Array<{ timeKey: string; diff: number; max: number; min: number }> = [];
        timePointMap.forEach((temps, timeKey) => {
          const max = Math.max(...temps);
          const min = Math.min(...temps);
          timePointDiffs.push({ timeKey, diff: max - min, max, min });
        });

        const dp = config.decimalPlaces ?? 2;
        const avgDiff =
          timePointDiffs.reduce((sum, item) => sum + item.diff, 0) / timePointDiffs.length;
        const fixed = Number.isFinite(avgDiff) ? Number(avgDiff.toFixed(dp)) : avgDiff;

        const preview = timePointDiffs
          .slice(0, 10)
          .map((item, idx) => `${idx + 1}. ${item.timeKey} 差值:${item.diff.toFixed(dp)}`)
          .join('\n');

        return {
          status: 'success',
          message: `计算完成：${fixed}`,
          value: fixed,
          detail: `${queryInfo}\n小数位数: ${dp}\n时间点数量: ${timePointDiffs.length}\n温度均匀度(差值算术平均): ${fixed}\n\n每次测量差值(前10条):\n${preview || '无'}`,
        };
      }

      if (TIME_FUNCTIONS.includes(config.functionType)) {
        const isUpper = config.functionType.includes('Upper');
        const sorted = [...data].sort((a, b) => new Date(a.timestamp as any).getTime() - new Date(b.timestamp as any).getTime());

        // 找到第一次到达阈值的时间
        let firstReachTime: Date | null = null;
        for (const item of sorted) {
          if (!locations.includes(item.deviceId)) continue;
          const value = item.temperature;
          const reached = isUpper ? value >= (threshold ?? 0) : value <= (threshold ?? 0);
          if (reached) {
            firstReachTime = new Date(item.timestamp as any);
            break;
          }
        }

        if (!firstReachTime) {
          return {
            status: 'error',
            message: '未找到满足条件的测点',
            detail: `${queryInfo}\n阈值: ${threshold ?? '默认'}\n未满足条件`,
          };
        }

        // 格式化时间为 YYYY-MM-DD HH:mm 格式
        const formattedTime = formatDateTime(firstReachTime);
        return {
          status: 'success',
          message: `计算完成：${formattedTime}`,
          value: formattedTime,
          detail: `${queryInfo}\n阈值: ${threshold ?? '默认'}\n第一次到达时间: ${formattedTime}`,
        };
      }

      if (config.functionType === 'tempMaxTime' || config.functionType === 'tempMinTime') {
        // 过滤出在指定布点范围内的数据
        const filteredData = data.filter((item) => locations.includes(item.deviceId));
        if (!filteredData.length) {
          return {
            status: 'error',
            message: '时间范围内没有匹配的布点数据',
            detail: queryInfo,
          };
        }

        // 找到最高或最低温度值
        const temperatures = filteredData
          .map((item) => item.temperature)
          .filter((temp) => Number.isFinite(temp));

        if (temperatures.length === 0) {
          return { status: 'error', message: '没有有效的温度数据' };
        }

        const targetTemp = config.functionType === 'tempMaxTime'
          ? Math.max(...temperatures)
          : Math.min(...temperatures);

        // 找出所有达到这个温度值的数据点，按时间排序，取第一个
        const matchedItems = filteredData
          .filter((item) => {
            const temp = item.temperature;
            return Number.isFinite(temp) && temp === targetTemp;
          })
          .sort((a, b) => {
            const timeA = new Date(a.timestamp as any).getTime();
            const timeB = new Date(b.timestamp as any).getTime();
            return timeA - timeB;
          });

        if (matchedItems.length === 0) {
          return {
            status: 'error',
            message: '未找到对应温度的数据点',
            detail: `${queryInfo}\n目标温度: ${targetTemp}\n未找到数据点`,
          };
        }

        // 取第一个时间点
        const targetTime = new Date(matchedItems[0].timestamp as any);
        const formattedTime = formatDateTime(targetTime);
        const tempLabel = config.functionType === 'tempMaxTime' ? '最高温度' : '最低温度';

        return {
          status: 'success',
          message: `计算完成：${formattedTime}`,
          value: formattedTime,
          detail: `${queryInfo}\n${tempLabel}: ${targetTemp.toFixed(1)}\n对应时间: ${formattedTime}\n匹配数据点数量: ${matchedItems.length}`,
        };
      }

      if (config.functionType === 'tempAvgDeviation') {
        // 过滤出在指定布点范围内的数据
        const filteredData = data.filter((item) => locations.includes(item.deviceId));
        if (!filteredData.length) {
          return {
            status: 'error',
            message: '时间范围内没有匹配的布点数据',
            detail: queryInfo,
          };
        }

        // 获取最高温度和最低温度
        let maxTempValue: number;
        let minTempValue: number;

        // 处理最高温度
        if (config.maxTempTagId) {
          const maxTempTag = allTags.find((t) => t._id === config.maxTempTagId);
          if (!maxTempTag) {
            return { status: 'error', message: '最高温度标签不存在' };
          }
          const maxTempVal = maxTempTag.value;
          if (maxTempVal === undefined || maxTempVal === null || maxTempVal === '') {
            return { status: 'error', message: '最高温度标签值不能为空' };
          }
          maxTempValue = typeof maxTempVal === 'number' ? maxTempVal : parseFloat(String(maxTempVal));
          if (Number.isNaN(maxTempValue)) {
            return { status: 'error', message: `最高温度标签值不是有效的数字: ${maxTempVal}` };
          }
        } else {
          maxTempValue = config.maxTemp ?? 8; // 默认值8
        }

        // 处理最低温度
        if (config.minTempTagId) {
          const minTempTag = allTags.find((t) => t._id === config.minTempTagId);
          if (!minTempTag) {
            return { status: 'error', message: '最低温度标签不存在' };
          }
          const minTempVal = minTempTag.value;
          if (minTempVal === undefined || minTempVal === null || minTempVal === '') {
            return { status: 'error', message: '最低温度标签值不能为空' };
          }
          minTempValue = typeof minTempVal === 'number' ? minTempVal : parseFloat(String(minTempVal));
          if (Number.isNaN(minTempValue)) {
            return { status: 'error', message: `最低温度标签值不是有效的数字: ${minTempVal}` };
          }
        } else {
          minTempValue = config.minTemp ?? 2; // 默认值2
        }

        // 按设备分组，计算每个设备的平均温度
        const deviceAvgTempMap = new Map<string, { sum: number; count: number }>();
        filteredData.forEach((item) => {
          const deviceId = item.deviceId;
          const temp = item.temperature;
          if (!Number.isFinite(temp)) return;

          const existing = deviceAvgTempMap.get(deviceId);
          if (!existing) {
            deviceAvgTempMap.set(deviceId, { sum: temp, count: 1 });
          } else {
            existing.sum += temp;
            existing.count += 1;
          }
        });

        if (deviceAvgTempMap.size === 0) {
          return { status: 'error', message: '没有有效的温度数据' };
        }

        // 计算每个设备的平均温度
        const deviceAvgTemps: number[] = [];
        const deviceDetails: string[] = [];
        deviceAvgTempMap.forEach((stats, deviceId) => {
          const avgTemp = stats.sum / stats.count;
          deviceAvgTemps.push(avgTemp);
          deviceDetails.push(`${deviceId}: 平均温度 ${avgTemp.toFixed(1)}`);
        });

        // 计算所有设备平均温度的平均值
        const avgOfAvgs = deviceAvgTemps.reduce((sum, v) => sum + v, 0) / deviceAvgTemps.length;

        // 计算平均偏差值：(最高温度 - 最低温度) - 平均温度的平均值
        const deviation = (maxTempValue - minTempValue) - avgOfAvgs;
        const fixed = Number.isFinite(deviation) ? Number(deviation.toFixed(1)) : deviation;

        return {
          status: 'success',
          message: `计算完成：${fixed}`,
          value: fixed,
          detail: `${queryInfo}\n最高温度: ${maxTempValue}\n最低温度: ${minTempValue}\n设备数量: ${deviceAvgTempMap.size}\n平均温度的平均值: ${avgOfAvgs.toFixed(1)}\n平均偏差值: ${fixed}\n\n设备详情:\n${deviceDetails.join('\n')}`,
        };
      }

      if (config.functionType === 'tempUniformityMax' || config.functionType === 'tempUniformityMin') {
        // 过滤出在指定布点范围内的数据
        const filteredData = data.filter((item) => locations.includes(item.deviceId));
        if (!filteredData.length) {
          return {
            status: 'error',
            message: '时间范围内没有匹配的布点数据',
            detail: queryInfo,
          };
        }

        // 按时间点分组，计算每个时间点的最大、最小、平均温度
        const timePointMap = new Map<string, { temps: number[] }>();
        filteredData.forEach((item) => {
          const temp = item.temperature;
          if (!Number.isFinite(temp)) return;

          // 将时间戳格式化为分钟级别（去掉秒和毫秒）
          const timestamp = new Date(item.timestamp as any);
          const timeKey = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')} ${String(timestamp.getHours()).padStart(2, '0')}:${String(timestamp.getMinutes()).padStart(2, '0')}`;

          const existing = timePointMap.get(timeKey);
          if (!existing) {
            timePointMap.set(timeKey, { temps: [temp] });
          } else {
            existing.temps.push(temp);
          }
        });

        if (timePointMap.size === 0) {
          return { status: 'error', message: '没有有效的温度数据' };
        }

        // 将时间点按时间排序，转换为数组
        const timePoints = Array.from(timePointMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([timeKey, data]) => ({
            timeKey,
            maxTemp: Math.max(...data.temps),
            minTemp: Math.min(...data.temps),
            avgTemp: data.temps.reduce((sum, v) => sum + v, 0) / data.temps.length,
          }));

        const n = timePoints.length;
        let maxNum = 0;
        let minNum = 0;

        // 遍历前一半的时间点（向上取整）
        for (let y = 0; y < Math.ceil(n / 2); y++) {
          // 累加当前时间点的最大和最小温度
          maxNum += timePoints[y].maxTemp;
          minNum += timePoints[y].minTemp;

          // 计算对应的后一半时间点索引
          const y2 = Math.floor(n / 2) + y + (n % 2);
          if (y2 < n) {
            maxNum += timePoints[y2].maxTemp;
            minNum += timePoints[y2].minTemp;
          }
        }

        // 根据函数类型返回相应的结果
        const result = config.functionType === 'tempUniformityMax' ? maxNum : minNum;
        const fixed = Number.isFinite(result) ? Number(result.toFixed(1)) : result;
        const resultLabel = config.functionType === 'tempUniformityMax' ? '最高温度总和' : '最低温度总和';

        const timePointDetails = timePoints.map((tp, idx) => 
          `${idx}: ${tp.timeKey} - 最大:${tp.maxTemp.toFixed(1)}, 最小:${tp.minTemp.toFixed(1)}, 平均:${tp.avgTemp.toFixed(1)}`
        ).join('\n');

        return {
          status: 'success',
          message: `计算完成：${fixed}`,
          value: fixed,
          detail: `${queryInfo}\n时间点数量: ${n}\n${resultLabel}: ${fixed}\n\n时间点详情:\n${timePointDetails}`,
        };
      }

      if (config.functionType === 'tempUniformityValue') {
        // 过滤出在指定布点范围内的数据
        const filteredData = data.filter((item) => locations.includes(item.deviceId));
        if (!filteredData.length) {
          return {
            status: 'error',
            message: '时间范围内没有匹配的布点数据',
            detail: queryInfo,
          };
        }

        // 按时间点分组，计算每个时间点的最大、最小、平均温度
        const timePointMap = new Map<string, { temps: number[] }>();
        filteredData.forEach((item) => {
          const temp = item.temperature;
          if (!Number.isFinite(temp)) return;

          // 将时间戳格式化为分钟级别（去掉秒和毫秒）
          const timestamp = new Date(item.timestamp as any);
          const timeKey = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')} ${String(timestamp.getHours()).padStart(2, '0')}:${String(timestamp.getMinutes()).padStart(2, '0')}`;

          const existing = timePointMap.get(timeKey);
          if (!existing) {
            timePointMap.set(timeKey, { temps: [temp] });
          } else {
            existing.temps.push(temp);
          }
        });

        if (timePointMap.size === 0) {
          return { status: 'error', message: '没有有效的温度数据' };
        }

        // 将时间点按时间排序，转换为数组
        const timePoints = Array.from(timePointMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([timeKey, data]) => ({
            timeKey,
            maxTemp: Math.max(...data.temps),
            minTemp: Math.min(...data.temps),
            avgTemp: data.temps.reduce((sum, v) => sum + v, 0) / data.temps.length,
          }));

        const n = timePoints.length;
        let maxNum = 0;
        let minNum = 0;

        // 遍历前一半的时间点（向上取整）
        for (let y = 0; y < Math.ceil(n / 2); y++) {
          // 累加当前时间点的最大和最小温度
          maxNum += timePoints[y].maxTemp;
          minNum += timePoints[y].minTemp;

          // 计算对应的后一半时间点索引
          const y2 = Math.floor(n / 2) + y + (n % 2);
          if (y2 < n) {
            maxNum += timePoints[y2].maxTemp;
            minNum += timePoints[y2].minTemp;
          }
        }

        // 计算均匀度值：abs((max_num - min_num) / len(data_list))
        const uniformityValue = Math.abs((maxNum - minNum) / n);
        const fixed = Number.isFinite(uniformityValue) ? Number(uniformityValue.toFixed(2)) : uniformityValue;

        const timePointDetails = timePoints.map((tp, idx) => 
          `${idx}: ${tp.timeKey} - 最大:${tp.maxTemp.toFixed(1)}, 最小:${tp.minTemp.toFixed(1)}, 平均:${tp.avgTemp.toFixed(1)}`
        ).join('\n');

        return {
          status: 'success',
          message: `计算完成：${fixed}`,
          value: fixed,
          detail: `${queryInfo}\n时间点数量: ${n}\n最大温度总和: ${maxNum.toFixed(1)}\n最小温度总和: ${minNum.toFixed(1)}\n均匀度值: ${fixed}\n\n时间点详情:\n${timePointDetails}`,
        };
      }

      if (config.functionType === 'avgCoolingRate') {
        // 过滤出在指定布点范围内的数据
        const filteredData = data.filter((item) => locations.includes(item.deviceId));
        if (!filteredData.length) {
          return {
            status: 'error',
            message: '时间范围内没有匹配的布点数据',
            detail: queryInfo,
          };
        }

        // 将开始时间和结束时间精确到分钟（去掉秒和毫秒）
        const startMinute = new Date(start);
        startMinute.setSeconds(0, 0);
        const endMinute = new Date(end);
        endMinute.setSeconds(0, 0);

        // 定义时间窗口（该分钟内的所有数据）
        const startWindowStart = new Date(startMinute);
        const startWindowEnd = new Date(startMinute);
        startWindowEnd.setMinutes(startWindowEnd.getMinutes() + 1);

        const endWindowStart = new Date(endMinute);
        const endWindowEnd = new Date(endMinute);
        endWindowEnd.setMinutes(endWindowEnd.getMinutes() + 1);

        // 获取开始时间窗口内的数据
        const startData = filteredData.filter((item) => {
          const itemTime = new Date(item.timestamp as any).getTime();
          return itemTime >= startWindowStart.getTime() && itemTime < startWindowEnd.getTime();
        });

        // 获取结束时间窗口内的数据
        const endData = filteredData.filter((item) => {
          const itemTime = new Date(item.timestamp as any).getTime();
          return itemTime >= endWindowStart.getTime() && itemTime < endWindowEnd.getTime();
        });

        if (startData.length === 0) {
          return { status: 'error', message: '开始时间点没有数据' };
        }
        if (endData.length === 0) {
          return { status: 'error', message: '结束时间点没有数据' };
        }

        // 按设备分组，计算每个设备在开始时间点的平均温度
        const startDeviceTempMap = new Map<string, { sum: number; count: number }>();
        startData.forEach((item) => {
          const deviceId = item.deviceId;
          const temp = item.temperature;
          if (!Number.isFinite(temp)) return;

          const existing = startDeviceTempMap.get(deviceId);
          if (!existing) {
            startDeviceTempMap.set(deviceId, { sum: temp, count: 1 });
          } else {
            existing.sum += temp;
            existing.count += 1;
          }
        });

        // 按设备分组，计算每个设备在结束时间点的平均温度
        const endDeviceTempMap = new Map<string, { sum: number; count: number }>();
        endData.forEach((item) => {
          const deviceId = item.deviceId;
          const temp = item.temperature;
          if (!Number.isFinite(temp)) return;

          const existing = endDeviceTempMap.get(deviceId);
          if (!existing) {
            endDeviceTempMap.set(deviceId, { sum: temp, count: 1 });
          } else {
            existing.sum += temp;
            existing.count += 1;
          }
        });

        // 计算每个设备在开始时间点的平均温度（data_list_a）
        const dataListA: number[] = [];
        startDeviceTempMap.forEach((stats) => {
          const avgTemp = stats.sum / stats.count;
          dataListA.push(avgTemp);
        });

        // 计算每个设备在结束时间点的平均温度（data_list_b）
        const dataListB: number[] = [];
        endDeviceTempMap.forEach((stats) => {
          const avgTemp = stats.sum / stats.count;
          dataListB.push(avgTemp);
        });

        if (dataListA.length === 0 || dataListB.length === 0) {
          return { status: 'error', message: '没有有效的温度数据' };
        }

        // 计算所有测点在开始时间的平均温度的平均值（mean_a），保留一位小数
        const meanA = Number((dataListA.reduce((sum, v) => sum + v, 0) / dataListA.length).toFixed(1));
        // 计算所有测点在结束时间的平均温度的平均值（mean_b），保留一位小数
        const meanB = Number((dataListB.reduce((sum, v) => sum + v, 0) / dataListB.length).toFixed(1));

        // 计算绝对差值
        const absDiff = Math.abs(meanA - meanB);

        // 计算时间差（分钟数）
        const durationMs = end.getTime() - start.getTime();
        const durationMinutes = Math.floor(durationMs / (1000 * 60));

        if (durationMinutes <= 0) {
          return { status: 'error', message: '时间范围无效，结束时间必须晚于开始时间' };
        }

        // 计算每分钟的温度变化（降温速率）：abs_diff / 时间差（分钟数）
        const temperatureRate = absDiff / durationMinutes;
        const fixed = Number.isFinite(temperatureRate) ? Number(temperatureRate.toFixed(3)) : temperatureRate;

        return {
          status: 'success',
          message: `计算完成：${fixed}`,
          value: fixed,
          detail: `${queryInfo}\n开始时间点平均温度: ${meanA}℃\n结束时间点平均温度: ${meanB}℃\n温度差: ${absDiff.toFixed(1)}℃\n时间差: ${durationMinutes} 分钟\n降温速率: ${fixed} ℃/分钟`,
        };
      }

      return { status: 'error', message: '未知函数类型' };
    },
    [allTags, taskId]
  );

  const execute = useCallback(
    async (config?: TagFunctionConfig) => {
      const nextConfig = config || functionConfig;
      if (!nextConfig) {
        setStatus('error');
        setMessage('请先配置函数方法');
        return;
      }

      setStatus('running');
      setMessage('计算中...');

      const res = await runFunction(nextConfig);
      setStatus(res.status);
      setMessage(res.message);

      const lastRunAt = new Date().toISOString();
      const logText = res.detail || res.message;
      if (res.status === 'success') {
        let finalValue: any;
        if (tag.type === 'location') {
          finalValue = toLocationArray(res.value);
        } else if (tag.type === 'date' || tag.type === 'datetime') {
          // 对于时间类型，直接使用格式化后的字符串
          finalValue = res.value ?? '';
        } else {
          finalValue = res.value ?? '';
        }

        updateTag({
          value: finalValue,
          functionConfig: {
            ...nextConfig,
            lastRunAt,
            lastMessage: logText,
            lastStatus: res.status,
            lastResult: res.value ?? '',
          },
        } as any);
      } else {
        updateTag({
          functionConfig: {
            ...(nextConfig || {}),
            lastRunAt,
            lastMessage: logText,
            lastStatus: res.status,
            lastResult: res.value ?? '',
          },
        } as any);
      }
    },
    [functionConfig, runFunction, updateTag]
  );

  return {
    status,
    message,
    functionConfig,
    execute,
  };
}

