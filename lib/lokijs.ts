/**
 * LokiJS 工具类
 * 用于在内存中管理任务数据
 */

import Loki, { Collection } from 'lokijs';

interface TemperatureHumidityData {
  _id?: string;
  taskId: string;
  deviceId: string;
  temperature: number;
  humidity: number;
  timestamp: Date | string | number;
}

// 全局 LokiJS 实例
let loki: Loki | null = null;
let taskDataCollection: Collection<TemperatureHumidityData> | null = null;
let currentTaskId: string | null = null;

// 统一将时间戳按东八区(+08:00)解释为 UTC 时刻后保存为 Date
// 规则：
// - Date 实例：原样返回（视为已是正确的时间点）
// - number：视为 UTC 毫秒时间戳，原样构造 Date
// - string：
//   - 如果包含时区（Z 或 ±HH:mm），按其自带时区解析
//   - 如果为“无时区字符串”（如 2025-01-02 12:34:56 / 2025-01-02T12:34:56.123），
//     按 +08:00 的本地时刻解释后，换算成 UTC 并存储
const TZ_OFFSET_MINUTES = 8 * 60; // +08:00

function hasExplicitTZ(str: string): boolean {
  // 结尾包含 Z/z 或者 "+HH:mm" / "-HH:mm" / "+HHmm" / "-HHmm"
  return /([zZ]|[+-]\d{2}:?\d{2})$/.test(str);
}

function parseNaiveStringAsUTCFromPlus8(str: string): Date {
  // 支持：
  // YYYY-MM-DD HH:mm[:ss[.SSS]]
  // YYYY/MM/DD HH:mm[:ss[.SSS]]
  // YYYY-MM-DDTHH:mm[:ss[.SSS]]
  const m = str.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,3}))?)?)?)?$/
  );
  if (!m) {
    // 非预期格式，退回原生解析（可能会按运行环境本地时区解析）
    return new Date(str);
  }
  const [_, y, mon, d, h = '0', mi = '0', s = '0', ms = '0'] = m;
  const year = parseInt(y, 10);
  const month = parseInt(mon, 10) - 1; // 0-11
  const day = parseInt(d, 10);
  const hour = parseInt(h, 10);
  const minute = parseInt(mi, 10);
  const second = parseInt(s, 10);
  const milli = parseInt(ms, 10);

  // 将 +08:00 的“墙上时间”换算为 UTC 时间点
  const utcMs = Date.UTC(year, month, day, hour, minute, second, milli) - TZ_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMs);
}

function toDateAssumingPlus8(value: Date | string | number): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const s = value.trim();
    if (hasExplicitTZ(s)) return new Date(s);
    return parseNaiveStringAsUTCFromPlus8(s);
  }
  // 兜底：直接 new Date
  return new Date(value as any);
}

/**
 * 初始化 LokiJS 数据库
 */
export function initLokiDB(): Loki {
  if (!loki) {
    loki = new Loki('taskData', {
      autoload: false,
      autosave: false,
      persistenceMethod: 'memory',
    });
  }
  return loki;
}

/**
 * 加载任务数据到 LokiJS
 * @param taskId 任务ID
 * @param data 任务数据数组
 */
export async function loadTaskDataToLoki(
  taskId: string,
  data: TemperatureHumidityData[]
): Promise<void> {
  const db = initLokiDB();
  
  // 如果切换任务，清除旧数据
  if (currentTaskId && currentTaskId !== taskId) {
    if (taskDataCollection) {
      taskDataCollection.clear();
    }
  }
  
  // 获取或创建集合
  if (!taskDataCollection) {
    taskDataCollection = db.addCollection<TemperatureHumidityData>('taskData', {
      unique: ['_id'],
      indices: ['taskId', 'deviceId', 'timestamp'],
    });
  }
  
  // 如果任务ID改变，清除旧数据
  if (currentTaskId !== taskId) {
    taskDataCollection.clear();
    currentTaskId = taskId;
  }
  
  // 插入数据
  if (data.length > 0) {
    // 统一时间戳：
    // - 含时区字符串或数值时间戳：按原意解析
    // - 无时区字符串：按 +08:00 解释后换算为 UTC 存储
    const normalizedData = data.map(item => ({
      ...item,
      timestamp: toDateAssumingPlus8(item.timestamp),
    }));
    
    taskDataCollection.insert(normalizedData);
    console.log(`[LokiJS] 已加载 ${normalizedData.length} 条数据到内存 (任务ID: ${taskId})`);
  }
}

/**
 * 从 LokiJS 获取任务的所有数据
 * @param taskId 任务ID
 * @returns 任务数据数组
 */
export function getAllTaskDataFromLoki(taskId: string): TemperatureHumidityData[] {
  if (!taskDataCollection || currentTaskId !== taskId) {
    console.warn(`[LokiJS] 任务 ${taskId} 的数据未加载到内存`);
    return [];
  }
  
  const results = taskDataCollection.find({ taskId });
  return results.map(item => ({ ...item })) as TemperatureHumidityData[];
}

/**
 * 从 LokiJS 获取指定时间范围内的数据
 * @param taskId 任务ID
 * @param startTime 开始时间
 * @param endTime 结束时间
 * @param deviceIds 设备ID列表（可选）
 * @returns 筛选后的数据数组
 */
export function getTaskDataFromLoki(
  taskId: string,
  startTime: Date | string | number,
  endTime: Date | string | number,
  deviceIds?: string[]
): TemperatureHumidityData[] {
  if (!taskDataCollection || currentTaskId !== taskId) {
    console.warn(`[LokiJS] 任务 ${taskId} 的数据未加载到内存`);
    return [];
  }
  
  // 这里不再做 +8 处理，直接按照原始时间解析
  const startTimeMs = new Date(startTime as any).getTime();
  const endTimeMs = new Date(endTime as any).getTime();
  console.log(
    '[LokiJS] 查询参数 ->\n',
    `taskId=${taskId}\n`,
    `start=${startTime}\n`,
    `end=${endTime}\n`,
    `deviceIds=${deviceIds && deviceIds.length ? deviceIds.join(',') : '全部'}\n`
  );
  
  // 先按任务ID查询
  const allData = taskDataCollection.find({ taskId });
  console.log(`[LokiJS] 原始结果数量: ${allData.length}`);
  
  
  // 按时间范围筛选
  const filteredByTime = allData.filter((item) => {
    let ts: number;
    if (typeof item.timestamp === 'number') {
      ts = item.timestamp;
    } else if (typeof item.timestamp === 'string') {
      ts = new Date(item.timestamp).getTime();
    } else {
      ts = item.timestamp.getTime();
    }
    // 结束时间向后放宽 1 分钟，避免边界遗漏
    return ts >= startTimeMs && ts <= endTimeMs + 60 * 1000;
  });
  console.log(`[LokiJS] 时间范围筛选后数量: ${filteredByTime.length}`);
  
  // 再按设备ID筛选
  if (deviceIds && deviceIds.length > 0) {
    const filteredByDevice = filteredByTime.filter(item => deviceIds.includes(item.deviceId));
    console.log(`[LokiJS] 设备筛选后数量: ${filteredByDevice.length}`);
    return filteredByDevice;
  }
  
  return filteredByTime.map(item => ({ ...item })) as TemperatureHumidityData[];
}

/**
 * 清除 LokiJS 中的数据
 */
export function clearLokiDB(): void {
  if (taskDataCollection) {
    taskDataCollection.clear();
  }
  currentTaskId = null;
  console.log('[LokiJS] 已清除内存中的数据');
}

/**
 * 获取当前加载的任务ID
 */
export function getCurrentTaskId(): string | null {
  return currentTaskId;
}

/**
 * 获取 LokiJS 中的数据统计
 */
export function getLokiStats(): {
  taskId: string | null;
  dataCount: number;
  deviceIds: string[];
} {
  if (!taskDataCollection || !currentTaskId) {
    return {
      taskId: null,
      dataCount: 0,
      deviceIds: [],
    };
  }
  
  const allData = taskDataCollection.find({ taskId: currentTaskId });
  const deviceIds = Array.from(new Set(allData.map(item => item.deviceId)));
  
  return {
    taskId: currentTaskId,
    dataCount: allData.length,
    deviceIds,
  };
}
