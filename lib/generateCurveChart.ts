/**
 * 客户端曲线图生成工具
 * 从 LokiJS 读取数据并在客户端生成曲线图
 */

import { getAllTaskDataFromLoki, getCurrentTaskId } from './lokijs';
import type { CurveChartConfig, CurveLine } from '@/components/tiptap/CurveChartConfigPanel';
import type { TemplateTag } from '@/components/TemplateTagList';

interface TemperatureHumidityData {
  taskId: string;
  deviceId: string;
  temperature: number;
  humidity: number;
  timestamp: Date | string | number;
}

// 解析标签值中的日期时间
// 注意：用户输入的时间是本地时间（UTC+8），需要转换为 UTC 时间用于查询
function parseDateTime(value: string): Date | null {
  if (!value) return null;
  
  const dateTimeStr = value.trim();
  
  // 尝试多种时间格式
  let date: Date | null = null;
  
  // 格式1: ISO 8601 格式 (YYYY-MM-DDTHH:mm:ss.sssZ) - 如果包含 Z，说明是 UTC 时间
  if (dateTimeStr.includes('Z') || dateTimeStr.includes('+') || dateTimeStr.includes('-', 10)) {
    date = new Date(dateTimeStr);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // 格式2: YYYY-MM-DD HH:mm:ss (本地时间 UTC+8，直接解析即可，Date 会自动处理时区)
  const format2Match = dateTimeStr.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (format2Match) {
    const [, datePart, hour, minute, second] = format2Match;
    // 直接解析为本地时间，Date 对象会自动转换为 UTC 时间
    const date = new Date(`${datePart}T${hour}:${minute}:${second}`);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // 格式3: YYYY-MM-DD HH:mm (本地时间 UTC+8，直接解析即可，Date 会自动处理时区)
  const format3Match = dateTimeStr.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})/);
  if (format3Match) {
    const [, datePart, hour, minute] = format3Match;
    // 直接解析为本地时间，Date 对象会自动转换为 UTC 时间
    const date = new Date(`${datePart}T${hour}:${minute}:00`);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // 格式4: YYYY/MM/DD HH:mm:ss (本地时间 UTC+8，直接解析即可)
  const format4Match = dateTimeStr.match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (format4Match) {
    const [, year, month, day, hour, minute, second] = format4Match;
    const datePart = `${year}-${month}-${day}`;
    const date = new Date(`${datePart}T${hour}:${minute}:${second}`);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // 格式5: YYYY/MM/DD HH:mm (本地时间 UTC+8，直接解析即可)
  const format5Match = dateTimeStr.match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
  if (format5Match) {
    const [, year, month, day, hour, minute] = format5Match;
    const datePart = `${year}-${month}-${day}`;
    const date = new Date(`${datePart}T${hour}:${minute}:00`);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // 格式6: 纯日期 YYYY-MM-DD (默认为当天的 00:00:00，本地时间)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateTimeStr)) {
    const date = new Date(dateTimeStr + 'T00:00:00');
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  console.warn('[时间解析] 无法解析时间格式:', dateTimeStr);
  return null;
}

// 获取布点标签的所有值（去重）
function getLocationValues(locationTagIds: string[], tags: TemplateTag[]): string[] {
  const values: string[] = [];
  locationTagIds.forEach((tagId) => {
    const tag = tags.find((t) => t._id === tagId);
    if (tag && tag.type === 'location' && Array.isArray(tag.value)) {
      values.push(...tag.value);
    }
  });
  return Array.from(new Set(values));
}

// 时区偏移：UTC+8（中国时区），8小时 = 8 * 60 * 60 * 1000 毫秒
const TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;

// 统一处理时间戳：将各种格式转换为毫秒数
// 注意：数据存储的时间戳是 UTC 时间，查询时需要加上 8 小时时区偏移
function getTimestampMs(timestamp: Date | string | number): number {
  let ms: number;
  if (typeof timestamp === 'number') {
    ms = timestamp;
  } else if (typeof timestamp === 'string') {
    ms = new Date(timestamp).getTime();
  } else {
    ms = timestamp.getTime();
  }
  // 数据存储的是 UTC 时间，查询时需要加上 8 小时时区偏移（UTC+8）
  return ms + TIMEZONE_OFFSET_MS;
}

// 统一处理时间戳：将各种格式转换为 Date 对象
// 注意：数据存储的时间戳是 UTC 时间，查询时需要加上 8 小时时区偏移
function getTimestampDate(timestamp: Date | string | number): Date {
  let ms: number;
  if (typeof timestamp === 'number') {
    ms = timestamp;
  } else if (typeof timestamp === 'string') {
    ms = new Date(timestamp).getTime();
  } else {
    ms = timestamp.getTime();
  }
  // 数据存储的是 UTC 时间，查询时需要加上 8 小时时区偏移（UTC+8）
  return new Date(ms + TIMEZONE_OFFSET_MS);
}

/**
 * 生成曲线图
 * @param taskId 任务ID
 * @param config 曲线图配置
 * @param tags 标签列表
 * @returns 图片的 Blob 对象
 */
export async function generateCurveChart(
  taskId: string,
  config: CurveChartConfig,
  tags: TemplateTag[]
): Promise<Blob> {
  // 从标签中获取开始时间和结束时间
  const startTimeTag = tags.find((t) => t._id === config.startTimeTagId);
  const endTimeTag = tags.find((t) => t._id === config.endTimeTagId);

  if (!startTimeTag || !endTimeTag) {
    throw new Error('开始时间或结束时间标签不存在');
  }

  let startTime = parseDateTime(startTimeTag.value);
  let endTime = parseDateTime(endTimeTag.value);

  console.log('[曲线图生成] 时间解析:', {
    startTimeTagValue: startTimeTag.value,
    startTimeParsed: startTime ? startTime.toISOString() : '解析失败',
    endTimeTagValue: endTimeTag.value,
    endTimeParsed: endTime ? endTime.toISOString() : '解析失败',
  });

  if (!startTime || !endTime) {
    throw new Error(`开始时间或结束时间格式不正确。开始时间: "${startTimeTag.value}", 结束时间: "${endTimeTag.value}"`);
  }

  // 应用偏移时间：开始时间向前偏移（减去），结束时间向后偏移（加上）
  const startOffsetMinutes = config.startTimeOffsetMinutes || 0;
  const endOffsetMinutes = config.endTimeOffsetMinutes || 0;
  if (startOffsetMinutes !== 0 || endOffsetMinutes !== 0) {
    const startOffsetMs = startOffsetMinutes * 60 * 1000;
    const endOffsetMs = endOffsetMinutes * 60 * 1000;
    startTime = new Date(startTime.getTime() - startOffsetMs);
    endTime = new Date(endTime.getTime() + endOffsetMs);
    console.log('[曲线图生成] 应用偏移时间:', {
      startOffsetMinutes,
      endOffsetMinutes,
      startTimeBefore: parseDateTime(startTimeTag.value)?.toISOString(),
      startTimeAfter: startTime.toISOString(),
      endTimeBefore: parseDateTime(endTimeTag.value)?.toISOString(),
      endTimeAfter: endTime.toISOString(),
    });
  }

  // 结束时间强制加1分钟（不包含偏移）
  endTime = new Date(endTime.getTime() + 60 * 1000);
  console.log('[曲线图生成] 结束时间强制加1分钟:', {
    endTimeBefore: parseDateTime(endTimeTag.value)?.toISOString(),
    endTimeAfter: endTime.toISOString(),
  });

  if (startTime >= endTime) {
    throw new Error(`开始时间必须早于结束时间。开始时间: ${startTime.toISOString()}, 结束时间: ${endTime.toISOString()}`);
  }

  // 从 LokiJS 获取所有数据
  const currentLokiTaskId = getCurrentTaskId();
  if (currentLokiTaskId !== taskId) {
    console.error('[曲线图生成] 错误: 任务数据未加载到内存', {
      requestedTaskId: taskId,
      currentTaskId: currentLokiTaskId,
    });
    throw new Error('任务数据未加载到内存，请先关联任务');
  }
  
  const allData = getAllTaskDataFromLoki(taskId);

  // 显示数据中的时间戳格式示例
  const sampleTimestamps = allData.slice(0, 3).map(item => {
    let timestampMs: number;
    let parsed: string;
    
    if (typeof item.timestamp === 'number') {
      timestampMs = item.timestamp;
      parsed = new Date(item.timestamp).toISOString();
    } else if (typeof item.timestamp === 'string') {
      const date = new Date(item.timestamp);
      timestampMs = date.getTime();
      parsed = isNaN(timestampMs) ? '无法解析' : date.toISOString();
    } else if (item.timestamp instanceof Date) {
      timestampMs = item.timestamp.getTime();
      parsed = item.timestamp.toISOString();
    } else {
      timestampMs = NaN;
      parsed = '无法解析';
    }
    
    return {
      rawValue: item.timestamp,
      type: typeof item.timestamp,
      parsed,
      timestampMs,
    };
  });

  console.log('[曲线图生成] 数据查询详情:', {
    taskId: taskId,
    startTime: startTime.toISOString(),
    startTimeMs: startTime.getTime(),
    endTime: endTime.toISOString(),
    endTimeMs: endTime.getTime(),
    totalDataCount: allData.length,
    deviceIds: Array.from(new Set(allData.map(item => item.deviceId))),
    timestampSamples: sampleTimestamps,
  });

  if (allData.length === 0) {
    console.error('[曲线图生成] 错误: 内存中没有数据', {
      taskId: taskId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });
    throw new Error('内存中没有数据，请先关联任务');
  }

  // 筛选时间范围内的数据
  // 统一时间格式：将时间戳转换为毫秒数，并确保比较时使用相同的时间单位
  // 注意：数据存储的时间戳是 UTC 时间，查询时需要加上 8 小时时区偏移（UTC+8）
  const filteredData = allData.filter((item) => {
    // 处理时间戳可能是字符串、Date 对象或数字（毫秒时间戳）的情况
    let itemTime: number;
    
    if (typeof item.timestamp === 'number') {
      // 数字类型：直接使用（假设是毫秒时间戳）
      itemTime = item.timestamp;
    } else if (typeof item.timestamp === 'string') {
      // 字符串类型：转换为 Date 对象再获取毫秒数
      const date = new Date(item.timestamp);
      if (isNaN(date.getTime())) {
        console.warn('[曲线图生成] 无效的时间戳字符串:', item.timestamp);
        return false;
      }
      itemTime = date.getTime();
    } else if (item.timestamp instanceof Date) {
      // Date 对象：直接获取毫秒数
      itemTime = item.timestamp.getTime();
    } else {
      console.warn('[曲线图生成] 无效的时间戳格式:', item.timestamp, typeof item.timestamp);
      return false;
    }
    
    // 检查时间戳是否有效（应该是合理的毫秒时间戳）
    if (isNaN(itemTime) || itemTime <= 0 || itemTime > Date.now() + 365 * 24 * 60 * 60 * 1000) {
      console.warn('[曲线图生成] 无效的时间戳值:', item.timestamp, '->', itemTime);
      return false;
    }
    
    // 数据存储的时间戳是 UTC+8 时间，查询时间也已经转换为 UTC 时间
    // 所以需要将数据时间戳减去 8 小时来匹配 UTC 查询时间
    const itemTimeUTC = itemTime - TIMEZONE_OFFSET_MS;
    
    // 使用时间戳（毫秒）进行比较
    const startTimeMs = startTime.getTime();
    const endTimeMs = endTime.getTime();
    
    return itemTimeUTC >= startTimeMs && itemTimeUTC <= endTimeMs;
  });

  console.log('[曲线图生成] 时间范围筛选后:', {
    taskId: taskId,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    filteredCount: filteredData.length,
    filteredDeviceIds: Array.from(new Set(filteredData.map(item => item.deviceId))),
    dataTimeRange: filteredData.length > 0 ? {
      earliest: (() => {
        const times = filteredData.map(item => {
          if (typeof item.timestamp === 'number') {
            return item.timestamp;
          } else if (typeof item.timestamp === 'string') {
            return new Date(item.timestamp).getTime();
          } else {
            return item.timestamp.getTime();
          }
        });
        return new Date(Math.min(...times)).toISOString();
      })(),
      latest: (() => {
        const times = filteredData.map(item => {
          if (typeof item.timestamp === 'number') {
            return item.timestamp;
          } else if (typeof item.timestamp === 'string') {
            return new Date(item.timestamp).getTime();
          } else {
            return item.timestamp.getTime();
          }
        });
        return new Date(Math.max(...times)).toISOString();
      })(),
    } : null,
  });

  if (filteredData.length === 0) {
    console.error('[曲线图生成] 错误: 指定时间范围内没有数据', {
      taskId: taskId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      queryTimeRange: `${startTime.toISOString()} 到 ${endTime.toISOString()}`,
      totalDataCount: allData.length,
      allDeviceIds: Array.from(new Set(allData.map(item => item.deviceId))),
      dataTimeRange: allData.length > 0 ? {
        earliest: (() => {
          const times = allData.map(item => {
            if (typeof item.timestamp === 'number') {
              return item.timestamp;
            } else if (typeof item.timestamp === 'string') {
              return new Date(item.timestamp).getTime();
            } else {
              return item.timestamp.getTime();
            }
          });
          return new Date(Math.min(...times)).toISOString();
        })(),
        latest: (() => {
          const times = allData.map(item => {
            if (typeof item.timestamp === 'number') {
              return item.timestamp;
            } else if (typeof item.timestamp === 'string') {
              return new Date(item.timestamp).getTime();
            } else {
              return item.timestamp.getTime();
            }
          });
          return new Date(Math.max(...times)).toISOString();
        })(),
      } : null,
    });
    throw new Error('指定时间范围内没有数据');
  }

  // 准备图表数据
  const chartData: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      borderColor: string;
      borderWidth: number;
      borderDash: number[];
      locationValues?: string[];
      lineNote?: string; // 直线备注
      lineType?: 'curve' | 'average' | 'line'; // 线条类型
    }>;
  } = {
    labels: [],
    datasets: [],
  };

  // 预定义颜色列表，确保每条曲线颜色不同
  const colorPalette = [
    '#3b82f6', // 蓝色
    '#ef4444', // 红色
    '#10b981', // 绿色
    '#f59e0b', // 橙色
    '#8b5cf6', // 紫色
    '#ec4899', // 粉色
    '#06b6d4', // 青色
    '#84cc16', // 黄绿色
    '#f97316', // 橙红色
    '#6366f1', // 靛蓝色
    '#14b8a6', // 青绿色
    '#a855f7', // 紫罗兰
  ];

  let colorIndex = 0;

  // 处理每条线条
  for (const line of config.lines || []) {
    if (line.type === 'curve') {
      // 曲线：根据布点标签筛选数据
      const locationValues = getLocationValues(line.locationTags || [], tags);
      console.log('[曲线图生成] 处理曲线线条:', {
        lineType: 'curve',
        locationTagIds: line.locationTags || [],
        locationValues: locationValues,
        deviceIds: locationValues,
      });
      if (locationValues.length === 0) {
        console.warn('[曲线图生成] 警告: 曲线线条没有选择布点标签', {
          lineId: line.id,
        });
        continue;
      }

      // 将 locationValues 按 | 分割，为每个值创建独立的曲线
      const individualCurves: string[] = [];
      locationValues.forEach(value => {
        // 如果值包含 |，则分割
        if (value.includes('|')) {
          individualCurves.push(...value.split('|').map(v => v.trim()).filter(v => v));
        } else {
          individualCurves.push(value.trim());
        }
      });

      // 去重
      const uniqueCurves = Array.from(new Set(individualCurves));

      const sortedData = [...filteredData].sort(
        (a, b) => getTimestampMs(a.timestamp) - getTimestampMs(b.timestamp)
      );

      // 为每个独立的曲线创建数据
      for (const curveValue of uniqueCurves) {
        // 对每个时间点，收集该曲线的数据
        const timeGroups = new Map<number, { values: number[]; originalTimestamp: Date | string | number }>();
        
        sortedData.forEach((item) => {
          if (item.deviceId === curveValue) {
            const time = getTimestampMs(item.timestamp);
            const value = config.dataType === 'temperature' ? item.temperature : item.humidity;
            
            if (!timeGroups.has(time)) {
              timeGroups.set(time, { values: [], originalTimestamp: item.timestamp });
            }
            timeGroups.get(time)!.values.push(value);
          }
        });

        // 计算平均值并添加到图表数据
        const lineData: number[] = [];
        const timestamps: string[] = [];
        
        Array.from(timeGroups.entries())
          .sort(([a], [b]) => a - b)
          .forEach(([time, group]) => {
            const avg = group.values.reduce((sum, v) => sum + v, 0) / group.values.length;
            // 数据存储的时间戳是UTC+8（本地时间），直接使用，不需要转换为ISO字符串
            // 因为后续显示时会直接使用这个时间戳
            let originalTime: number;
            if (typeof group.originalTimestamp === 'number') {
              originalTime = group.originalTimestamp;
            } else if (typeof group.originalTimestamp === 'string') {
              originalTime = new Date(group.originalTimestamp).getTime();
            } else {
              originalTime = group.originalTimestamp.getTime();
            }
            timestamps.push(originalTime.toString());
            lineData.push(avg);
          });

        if (lineData.length > 0) {
          // 为每条曲线分配颜色
          const curveColor = line.lineColor || colorPalette[colorIndex % colorPalette.length];
          colorIndex++;

          console.log('[曲线图生成] 曲线线条数据生成成功:', {
            lineType: 'curve',
            curveValue: curveValue,
            dataPointCount: lineData.length,
            dataRange: {
              min: Math.min(...lineData).toFixed(2),
              max: Math.max(...lineData).toFixed(2),
              avg: (lineData.reduce((a, b) => a + b, 0) / lineData.length).toFixed(2),
            },
          });
          if (chartData.labels.length === 0) {
            chartData.labels = timestamps;
          }
          chartData.datasets.push({
            label: curveValue,
            data: lineData,
            borderColor: curveColor,
            borderWidth: line.lineWidth || 2,
            borderDash: line.lineStyle === 'dashed' ? [5, 5] : line.lineStyle === 'dotted' ? [2, 2] : [],
            locationValues: [curveValue],
          });
        } else {
          console.warn('[曲线图生成] 警告: 曲线没有生成数据', {
            lineType: 'curve',
            curveValue: curveValue,
            filteredDataCount: filteredData.length,
            matchedDeviceDataCount: filteredData.filter(item => item.deviceId === curveValue).length,
          });
        }
      }
    } else if (line.type === 'average') {
      // 平均值曲线：将所有选中的布点标签按照时间聚合，计算平均值，生成一条线
      const locationValues = getLocationValues(line.averageLocationTags || [], tags);
      console.log('[曲线图生成] 处理平均值曲线:', {
        lineType: 'average',
        locationTagIds: line.averageLocationTags || [],
        locationValues: locationValues,
        deviceIds: locationValues,
      });
      if (locationValues.length === 0) {
        console.warn('[曲线图生成] 警告: 平均值曲线没有选择布点标签', {
          lineId: line.id,
        });
        continue;
      }

      // 将 locationValues 按 | 分割，获取所有布点值
      const allDeviceIds: string[] = [];
      locationValues.forEach(value => {
        // 如果值包含 |，则分割
        if (value.includes('|')) {
          allDeviceIds.push(...value.split('|').map(v => v.trim()).filter(v => v));
        } else {
          allDeviceIds.push(value.trim());
        }
      });

      // 去重，获取所有需要参与计算的布点
      const uniqueDeviceIds = Array.from(new Set(allDeviceIds));

      const sortedData = [...filteredData].sort(
        (a, b) => getTimestampMs(a.timestamp) - getTimestampMs(b.timestamp)
      );

      // 按时间聚合，计算所有匹配布点的平均值
      const timeGroups = new Map<number, { values: number[]; originalTimestamp: Date | string | number }>();
      
      sortedData.forEach((item) => {
        // 如果该数据点的设备ID在选中的布点列表中
        if (uniqueDeviceIds.includes(item.deviceId)) {
          const time = getTimestampMs(item.timestamp);
          const value = config.dataType === 'temperature' ? item.temperature : item.humidity;
          
          if (!timeGroups.has(time)) {
            timeGroups.set(time, { values: [], originalTimestamp: item.timestamp });
          }
          timeGroups.get(time)!.values.push(value);
        }
      });

      const lineData: number[] = [];
      const timestamps: string[] = [];

      Array.from(timeGroups.entries())
        .sort(([a], [b]) => a - b)
        .forEach(([time, group]) => {
          // 计算该时间点所有匹配布点的平均值
          const avg = group.values.reduce((sum, v) => sum + v, 0) / group.values.length;
          // 数据存储的时间戳是UTC+8（本地时间），直接使用，不需要转换为ISO字符串
          // 因为后续显示时会直接使用这个时间戳
          let originalTime: number;
          if (typeof group.originalTimestamp === 'number') {
            originalTime = group.originalTimestamp;
          } else if (typeof group.originalTimestamp === 'string') {
            originalTime = new Date(group.originalTimestamp).getTime();
          } else {
            originalTime = group.originalTimestamp.getTime();
          }
          timestamps.push(originalTime.toString());
          lineData.push(avg);
        });

      if (lineData.length > 0) {
        // 为平均值曲线分配颜色
        const curveColor = line.averageColor || colorPalette[colorIndex % colorPalette.length];
        colorIndex++;

        console.log('[曲线图生成] 平均值曲线数据生成成功:', {
          lineType: 'average',
          deviceIds: uniqueDeviceIds,
          dataPointCount: lineData.length,
          dataRange: {
            min: Math.min(...lineData).toFixed(2),
            max: Math.max(...lineData).toFixed(2),
            avg: (lineData.reduce((a, b) => a + b, 0) / lineData.length).toFixed(2),
          },
        });
        if (chartData.labels.length === 0) {
          chartData.labels = timestamps;
        }
        chartData.datasets.push({
          label: '平均值',
          data: lineData,
          borderColor: curveColor,
          borderWidth: line.lineWidth || 2,
          borderDash: line.lineStyle === 'dashed' ? [5, 5] : line.lineStyle === 'dotted' ? [2, 2] : [],
          locationValues: uniqueDeviceIds,
        });
      } else {
        console.warn('[曲线图生成] 警告: 平均值曲线没有生成数据', {
          lineType: 'average',
          deviceIds: uniqueDeviceIds,
          filteredDataCount: filteredData.length,
          matchedDeviceDataCount: filteredData.filter(item => uniqueDeviceIds.includes(item.deviceId)).length,
        });
      }
    } else if (line.type === 'line') {
      // 直线：使用固定值
      if (line.lineValue === undefined || line.lineValue === null) {
        console.error('[曲线图生成] 错误: 直线固定值未设置', {
          lineId: line.id,
          lineName: line.lineName,
        });
        throw new Error(`直线"${line.lineName || '未命名'}"的固定值未设置`);
      }
      
      const fixedValue = line.lineValue;

      const sortedData = [...filteredData].sort(
        (a, b) => getTimestampMs(a.timestamp) - getTimestampMs(b.timestamp)
      );
      // 获取唯一的时间戳（使用原始时间戳，不经过时区转换）
      const uniqueTimes = Array.from(
        new Set(sortedData.map((item) => {
          if (typeof item.timestamp === 'number') {
            return item.timestamp;
          } else if (typeof item.timestamp === 'string') {
            return new Date(item.timestamp).getTime();
          } else {
            return item.timestamp.getTime();
          }
        }))
      ).sort();

      if (chartData.labels.length === 0) {
        // 数据存储的时间戳是UTC+8（本地时间），直接使用，不需要转换为ISO字符串
        chartData.labels = uniqueTimes.map((time) => time.toString());
      }

      // 为直线分配颜色
      const lineColor = line.lineColor || colorPalette[colorIndex % colorPalette.length];
      colorIndex++;

      // 获取备注内容，如果未设置或为空则使用默认值：线条名称+固定值
      const lineNote = line.lineNote && line.lineNote.trim() !== '' 
        ? line.lineNote 
        : `${line.lineName || '直线'} ${fixedValue}`;

      console.log('[曲线图生成] 直线数据生成成功:', {
        lineType: 'line',
        lineName: line.lineName || '直线',
        fixedValue: fixedValue,
        dataPointCount: uniqueTimes.length,
        lineNote: lineNote,
      });

      chartData.datasets.push({
        label: line.lineName || '直线',
        data: new Array(uniqueTimes.length).fill(fixedValue),
        borderColor: lineColor,
        borderWidth: line.lineWidth || 2,
        borderDash: line.lineStyle === 'dashed' ? [5, 5] : line.lineStyle === 'dotted' ? [2, 2] : [],
        lineType: 'line',
        lineNote: lineNote,
      });
    }
  }

  if (chartData.datasets.length === 0) {
    throw new Error('没有可用的数据用于生成曲线图');
  }

  // 使用 HTML5 Canvas 绘制图表
  const width = 1200;
  const height = 600;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('无法创建 Canvas 上下文');
  }

  // 设置背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // 设置边距（最小边距）
  // 估算自适应列数以计算padding（基于可用宽度）
  const rightPadding = 20; // 右边距减小，让图表更靠右
  const leftPadding = 50;
  const minLegendItemWidth = 60; // 最小图例项宽度（用于padding和图例计算）
  const estimatedAvailableWidth = width - leftPadding - rightPadding; // 估算可用宽度
  const maxEstimatedLegendCols = Math.max(1, Math.floor(estimatedAvailableWidth / minLegendItemWidth));
  const estimatedLegendCols = Math.min(maxEstimatedLegendCols, chartData.datasets.length); // 列数不超过数据集数量
  const legendRowsForPadding = Math.ceil(chartData.datasets.length / estimatedLegendCols);
  const legendHeight = legendRowsForPadding * 22 + 10; // 每个图例22px高度，适应更大的字体
  const padding = { top: 40, right: rightPadding, bottom: 30 + legendHeight, left: leftPadding };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // 绘制标题（字体更大）
  ctx.fillStyle = '#1f2937';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  const chartTitle = config.title?.trim() || `${config.dataType === 'temperature' ? '温度' : '湿度'}曲线图`;
  ctx.fillText(
    chartTitle,
    width / 2,
    padding.top - 20
  );

  // 计算数据范围
  let minValue = Infinity;
  let maxValue = -Infinity;
  let minTime = Infinity;
  let maxTime = -Infinity;

  chartData.datasets.forEach((dataset) => {
    dataset.data.forEach((value, index) => {
      if (typeof value === 'number' && !isNaN(value)) {
        minValue = Math.min(minValue, value);
        maxValue = Math.max(maxValue, value);
      }
      // 标签存储的是时间戳字符串，直接解析为数字
      const time = typeof chartData.labels[index] === 'string' 
        ? parseInt(chartData.labels[index], 10)
        : new Date(chartData.labels[index]).getTime();
      if (!isNaN(time)) {
        minTime = Math.min(minTime, time);
        maxTime = Math.max(maxTime, time);
      }
    });
  });

  if (minValue === Infinity || maxValue === -Infinity) {
    throw new Error('数据无效');
  }

  // 添加边距
  const valueRange = maxValue - minValue || 1;
  const valueMargin = valueRange * 0.1;
  const adjustedMinValue = minValue - valueMargin;
  const adjustedMaxValue = maxValue + valueMargin;
  const adjustedValueRange = adjustedMaxValue - adjustedMinValue;

  const timeRange = maxTime - minTime || 1;

  // 绘制坐标轴（更粗，更清晰）
  ctx.strokeStyle = '#6b7280';
  ctx.lineWidth = 2;
  ctx.beginPath();
  // X轴
  ctx.moveTo(padding.left, height - padding.bottom);
  ctx.lineTo(width - padding.right, height - padding.bottom);
  // Y轴
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.stroke();

  // 绘制Y轴标签和刻度线（使用虚线，字体更大）
  ctx.fillStyle = '#000000';
  ctx.font = '14px Arial';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const ySteps = 16; // 增加Y轴刻度数量，更细化
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]); // 虚线
  
  for (let i = 0; i <= ySteps; i++) {
    const value = adjustedMinValue + (adjustedValueRange * i) / ySteps;
    const y = height - padding.bottom - (chartHeight * i) / ySteps;
    
    // 绘制虚线刻度线
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    
    // 绘制标签
    ctx.fillText(value.toFixed(1), padding.left - 10, y);
  }
  
  ctx.setLineDash([]); // 恢复实线

  // 绘制Y轴标题（放在左上方）
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 16px Arial';
  ctx.fillStyle = '#000000';
  ctx.fillText(
    config.dataType === 'temperature' ? '温度 (°C)' : '湿度 (%)',
    padding.left + 5,
    padding.top - 20
  );

  // 绘制X轴标签（时间，格式：月/日 时:分）
  ctx.fillStyle = '#000000';
  ctx.font = '13px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]); // 虚线
  
  // 确保开始和结束时间在X轴上显示
  // 计算需要显示的刻度点，确保第一个和最后一个总是包含，并避免文本重叠
  const timeLabelWidth = 60; // 时间标签的大致宽度（像素），两行显示"12/25"和"14:30"，每行更短
  const minLabelSpacing = timeLabelWidth; // 最小标签间距
  const maxXSteps = Math.floor(chartWidth / minLabelSpacing); // 根据可用空间计算最大刻度数
  const xSteps = Math.min(maxXSteps, chartData.labels.length);
  
  const indicesToShow: number[] = [];
  
  // 总是包含第一个（开始时间）
  indicesToShow.push(0);
  
  // 添加中间的时间点，确保不会重叠
  if (xSteps > 2 && chartData.labels.length > 1) {
    for (let i = 1; i < xSteps - 1; i++) {
      const index = Math.floor((chartData.labels.length - 1) * (i / (xSteps - 1)));
      // 避免重复
      if (index !== 0 && index !== chartData.labels.length - 1 && !indicesToShow.includes(index)) {
        indicesToShow.push(index);
      }
    }
  }
  
  // 总是包含最后一个（结束时间）
  if (chartData.labels.length > 1) {
    indicesToShow.push(chartData.labels.length - 1);
  }
  
  // 对索引排序
  indicesToShow.sort((a, b) => a - b);
  
  // 进一步过滤，确保相邻标签不会重叠
  const finalIndicesToShow: number[] = [];
  let lastX = -Infinity;
  
  indicesToShow.forEach((index) => {
    // 标签存储的是时间戳字符串，直接解析为数字
    const time = typeof chartData.labels[index] === 'string' 
      ? parseInt(chartData.labels[index], 10)
      : new Date(chartData.labels[index]).getTime();
    
    if (isNaN(time)) {
      console.warn('[曲线图生成] 无效的时间戳:', chartData.labels[index]);
      return;
    }
    
    const x = padding.left + ((time - minTime) / timeRange) * chartWidth;
    
    // 检查与上一个标签的距离是否足够
    if (x - lastX >= minLabelSpacing || finalIndicesToShow.length === 0) {
      finalIndicesToShow.push(index);
      lastX = x;
    }
  });
  
  // 确保开始和结束时间总是显示
  const hasStart = finalIndicesToShow.includes(0);
  const lastIndex = chartData.labels.length - 1;
  const hasEnd = finalIndicesToShow.includes(lastIndex);
  
  if (!hasStart) {
    finalIndicesToShow.unshift(0);
  }
  if (!hasEnd && chartData.labels.length > 1) {
    finalIndicesToShow.push(lastIndex);
  }
  
  // 对最终结果排序
  finalIndicesToShow.sort((a, b) => a - b);
  
  // 如果中间刻度太少（只有开始和结束），添加一些均匀分布的中间刻度
  if (finalIndicesToShow.length <= 2 && chartData.labels.length > 2) {
    const middleCount = Math.min(3, Math.floor(chartWidth / minLabelSpacing) - 2);
    if (middleCount > 0) {
      const middleIndices: number[] = [];
      for (let i = 1; i <= middleCount; i++) {
        const ratio = i / (middleCount + 1);
        const index = Math.floor((chartData.labels.length - 1) * ratio);
        if (index > 0 && index < lastIndex && !finalIndicesToShow.includes(index)) {
          middleIndices.push(index);
        }
      }
      // 将中间刻度插入到正确位置
      finalIndicesToShow.push(...middleIndices);
      finalIndicesToShow.sort((a, b) => a - b);
    }
  }
  
  // 绘制X轴刻度和标签
  finalIndicesToShow.forEach((index) => {
    // 标签存储的是时间戳字符串，直接解析为数字
    const time = typeof chartData.labels[index] === 'string' 
      ? parseInt(chartData.labels[index], 10)
      : new Date(chartData.labels[index]).getTime();
    const x = padding.left + ((time - minTime) / timeRange) * chartWidth;
    // 数据存储的时间戳是UTC+8，显示时需要减去8小时偏移
    const date = new Date(time - TIMEZONE_OFFSET_MS);
    
    // 绘制虚线刻度线
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, height - padding.bottom);
    ctx.stroke();
    
    // 格式化时间，格式：月/日 换行 时:分
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const dateStr = `${month}/${day}`;
    const timeStr = `${hours}:${minutes}`;
    
    // 绘制日期（第一行）
    ctx.fillText(dateStr, x, height - padding.bottom + 8);
    // 绘制时间（第二行）
    ctx.fillText(timeStr, x, height - padding.bottom + 22);
  });
  
  ctx.setLineDash([]); // 恢复实线

  // 先绘制所有线条（更粗，更清晰）
  chartData.datasets.forEach((dataset) => {
    ctx.strokeStyle = dataset.borderColor || '#3b82f6';
    ctx.lineWidth = (dataset.borderWidth || 2) + 0.5; // 稍微加粗
    ctx.setLineDash(dataset.borderDash || []);

    ctx.beginPath();
    dataset.data.forEach((value, dataIndex) => {
      if (typeof value === 'number' && !isNaN(value)) {
        // 标签存储的是时间戳字符串，直接解析为数字
        const time = typeof chartData.labels[dataIndex] === 'string' 
          ? parseInt(chartData.labels[dataIndex], 10)
          : new Date(chartData.labels[dataIndex]).getTime();
        const x = padding.left + ((time - minTime) / timeRange) * chartWidth;
        const y = height - padding.bottom - ((value - adjustedMinValue) / adjustedValueRange) * chartHeight;

        if (dataIndex === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // 绘制直线备注（显示在右上角）
  chartData.datasets.forEach((dataset) => {
    if (dataset.lineType === 'line' && dataset.lineNote) {
      // 获取直线的最后一个数据点（最右边）
      if (dataset.data.length > 0 && chartData.labels.length > 0) {
        const lastIndex = dataset.data.length - 1;
        const lastTime = typeof chartData.labels[lastIndex] === 'string' 
          ? parseInt(chartData.labels[lastIndex], 10)
          : new Date(chartData.labels[lastIndex]).getTime();
        const lastValue = dataset.data[lastIndex];
        
        if (!isNaN(lastTime) && typeof lastValue === 'number' && !isNaN(lastValue)) {
          const x = padding.left + ((lastTime - minTime) / timeRange) * chartWidth;
          const y = height - padding.bottom - ((lastValue - adjustedMinValue) / adjustedValueRange) * chartHeight;
          
          // 在右上角绘制备注（x向右偏移，y向上偏移）
          ctx.fillStyle = dataset.borderColor || '#ef4444';
          ctx.font = 'bold 12px Arial';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          
          // 计算文本宽度，用于背景框
          const textMetrics = ctx.measureText(dataset.lineNote);
          const textWidth = textMetrics.width;
          const textHeight = 16;
          const paddingX = 6;
          const paddingY = 4;
          const offsetX = 8; // 从数据点向右的偏移
          const offsetY = 2; // 从数据点向上的偏移
          
          // 计算备注框的位置
          let noteX = x + offsetX;
          let noteY = y - textHeight - paddingY * 2 - offsetY;
          
          // 检查右边界：如果超出，则向左调整
          const noteBoxWidth = textWidth + paddingX * 2;
          if (noteX + noteBoxWidth > width - padding.right) {
            noteX = width - padding.right - noteBoxWidth;
          }
          
          // 检查左边界：确保不超出左边界
          if (noteX < padding.left) {
            noteX = padding.left;
            // 如果仍然超出，则截断文本
            const maxWidth = width - padding.right - padding.left - paddingX * 2;
            if (maxWidth > 0) {
              // 截断文本以适应可用宽度
              let truncatedText = dataset.lineNote;
              while (ctx.measureText(truncatedText).width > maxWidth && truncatedText.length > 0) {
                truncatedText = truncatedText.slice(0, -1);
              }
              if (truncatedText.length < dataset.lineNote.length) {
                truncatedText = truncatedText.slice(0, -3) + '...';
              }
              // 重新计算宽度
              const truncatedWidth = ctx.measureText(truncatedText).width;
              
              // 绘制背景框（半透明白色背景）
              ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
              ctx.fillRect(
                noteX,
                noteY,
                truncatedWidth + paddingX * 2,
                textHeight + paddingY * 2
              );
              
              // 绘制边框
              ctx.strokeStyle = dataset.borderColor || '#ef4444';
              ctx.lineWidth = 1;
              ctx.strokeRect(
                noteX,
                noteY,
                truncatedWidth + paddingX * 2,
                textHeight + paddingY * 2
              );
              
              // 绘制文本
              ctx.fillStyle = dataset.borderColor || '#ef4444';
              ctx.fillText(
                truncatedText,
                noteX + paddingX,
                noteY + textHeight + paddingY
              );
            }
          } else {
            // 检查上边界：如果超出，则向下调整
            if (noteY < padding.top) {
              noteY = padding.top;
            }
            
            // 绘制背景框（半透明白色背景）
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillRect(
              noteX,
              noteY,
              noteBoxWidth,
              textHeight + paddingY * 2
            );
            
            // 绘制边框
            ctx.strokeStyle = dataset.borderColor || '#ef4444';
            ctx.lineWidth = 1;
            ctx.strokeRect(
              noteX,
              noteY,
              noteBoxWidth,
              textHeight + paddingY * 2
            );
            
            // 绘制文本
            ctx.fillStyle = dataset.borderColor || '#ef4444';
            ctx.fillText(
              dataset.lineNote,
              noteX + paddingX,
              noteY + textHeight + paddingY
            );
          }
        }
      }
    }
  });

  // 绘制图例（在图表下方，从左往右排列，自适应列数，几乎贴近）
  const legendStartY = height - padding.bottom + 52;
  const legendItemHeight = 22; // 每个图例项的高度，适应更大的字体
  // 图例从更靠左的位置开始，减少左边空白
  const legendStartX = 20; // 图例起始位置，比图表左边距更靠左
  // 根据可用宽度自适应计算列数和每个图例项的宽度，充分利用空间（从图例起始位置到右边距）
  const availableWidth = width - legendStartX - padding.right;
  const maxLegendCols = Math.max(1, Math.floor(availableWidth / minLegendItemWidth)); // 根据最小宽度计算最大列数
  const legendCols = Math.min(maxLegendCols, chartData.datasets.length); // 列数不超过数据集数量
  // 动态计算每个图例项的宽度，让图例均匀分布填满可用宽度
  const legendItemWidth = legendCols > 0 ? availableWidth / legendCols : minLegendItemWidth;
  const legendRows = Math.ceil(chartData.datasets.length / legendCols);

  chartData.datasets.forEach((dataset, index) => {
    const row = Math.floor(index / legendCols);
    const col = index % legendCols;
    const legendX = legendStartX + col * legendItemWidth;
    const legendY = legendStartY + row * legendItemHeight;

    // 绘制图例线条（更短，加粗2倍）
    ctx.strokeStyle = dataset.borderColor || '#3b82f6';
    ctx.lineWidth = (dataset.borderWidth || 2) * 2; // 加粗2倍
    ctx.setLineDash(dataset.borderDash || []);
    ctx.beginPath();
    ctx.moveTo(legendX, legendY);
    ctx.lineTo(legendX + 25, legendY); // 缩短线条长度
    ctx.stroke();
    ctx.setLineDash([]);

    // 绘制图例文本（字体增大2px，自适应排版）
    ctx.fillStyle = '#1f2937';
    ctx.font = '13px Arial'; // 从11px增加到13px
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    // 如果文本太长，截断（考虑线条宽度25px + 间距3px = 28px）
    const label = dataset.label || `线条 ${index + 1}`;
    const maxLabelWidth = Math.max(20, legendItemWidth - 28); // 保持足够的文本显示空间，至少20px
    const truncatedLabel = ctx.measureText(label).width > maxLabelWidth 
      ? label.substring(0, Math.floor(label.length * maxLabelWidth / ctx.measureText(label).width)) + '...'
      : label;
    ctx.fillText(truncatedLabel, legendX + 28, legendY);
  });

  // 转换为 Blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('生成图片失败'));
        }
      },
      'image/png',
      1.0
    );
  });
}

