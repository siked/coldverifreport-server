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
    // 确保时间戳格式统一：如果是字符串或数字，转换为 Date 对象；如果已经是 Date，保持不变
    const normalizedData = data.map(item => ({
      ...item,
      timestamp: typeof item.timestamp === 'string' 
        ? new Date(item.timestamp) 
        : typeof item.timestamp === 'number'
        ? new Date(item.timestamp)
        : item.timestamp,
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
  startTime: Date,
  endTime: Date,
  deviceIds?: string[]
): TemperatureHumidityData[] {
  if (!taskDataCollection || currentTaskId !== taskId) {
    console.warn(`[LokiJS] 任务 ${taskId} 的数据未加载到内存`);
    return [];
  }
  
  const startTimeMs = startTime.getTime();
  const endTimeMs = endTime.getTime();
  
  // 先按任务ID查询
  const allData = taskDataCollection.find({ taskId });
  
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
    return ts >= startTimeMs && ts <= endTimeMs;
  });
  
  // 再按设备ID筛选
  if (deviceIds && deviceIds.length > 0) {
    return filteredByTime.filter(item => deviceIds.includes(item.deviceId));
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

