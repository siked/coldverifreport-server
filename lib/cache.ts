import LZString from 'lz-string';
import {
  saveToIndexedDB,
  loadFromIndexedDB,
  deleteFromIndexedDB,
  getTaskDeviceIds,
  deleteTaskData,
  saveMetaToIndexedDB,
  loadMetaFromIndexedDB,
  deleteMetaFromIndexedDB,
  getAllTaskIds,
  estimateDBSize,
  isIndexedDBAvailable,
} from './indexeddb';

// 注意：key 格式已改为 taskId_deviceId，不再需要前缀
// 因为 IndexedDB 的 key 结构已经模拟了目录结构（taskData_任务ID/设备ID）
const META_PREFIX = 'coldverif_task_meta_';

export interface CacheMeta {
  taskId: string;
  deviceId: string;
  lastUpdated: number;
  dataCount: number;
  deviceSn?: string;
}

export interface TemperatureHumidityData {
  _id?: string;
  taskId: string;
  deviceId: string;
  temperature: number;
  humidity: number;
  timestamp: string;
}

// 缓存中存储的数据类型（不包含 taskId，因为 key 中已包含）
interface CachedDataItem {
  _id?: string;
  deviceId: string;
  temperature: number;
  humidity: number;
  timestamp: string;
}

/**
 * 获取缓存的键名
 * 格式：taskId_deviceId
 * 这样模拟了 taskData_任务ID/设备ID 的目录结构
 */
function getCacheKey(taskId: string, deviceId: string): string {
  return `${taskId}_${deviceId}`;
}

function getMetaKey(taskId: string): string {
  return `${META_PREFIX}${taskId}`;
}

/**
 * 压缩并保存数据到 IndexedDB
 * @param taskId 任务ID
 * @param deviceId 设备ID
 * @param data 数据数组
 * @param enablePerformanceLogging 是否启用性能日志（开发环境）
 */
export async function saveToCache(
  taskId: string,
  deviceId: string,
  data: TemperatureHumidityData[],
  enablePerformanceLogging: boolean = false
): Promise<void> {
  console.log('[Cache] saveToCache called', { taskId, deviceId, dataLength: data.length });
  if (!isIndexedDBAvailable()) {
    console.warn('[Cache] IndexedDB not available, skipping save');
    return;
  }

  try {
    const key = getCacheKey(taskId, deviceId);
    console.log('[Cache] saveToCache processing', { key, dataLength: data.length });
    
    // 步骤1: 去掉 taskId 字段（因为 key 中已包含）
    const dataWithoutTaskId: CachedDataItem[] = data.map(({ taskId: _, ...item }) => item);
    
    // 步骤2: JSON 序列化
    const stringifyStart = enablePerformanceLogging ? performance.now() : 0;
    const jsonString = JSON.stringify(dataWithoutTaskId);
    const stringifyTime = enablePerformanceLogging ? performance.now() - stringifyStart : 0;
    
    // 步骤3: 压缩数据
    const compressStart = enablePerformanceLogging ? performance.now() : 0;
    const compressed = LZString.compress(jsonString);
    const compressTime = enablePerformanceLogging ? performance.now() - compressStart : 0;
    
    if (compressed) {
      // 步骤4: 保存到 IndexedDB（每个任务使用独立的 objectStore）
      const saveStart = enablePerformanceLogging ? performance.now() : 0;
      await saveToIndexedDB(key, compressed, taskId, deviceId);
      const saveTime = enablePerformanceLogging ? performance.now() - saveStart : 0;
      
      // 更新元数据
      await updateCacheMeta(taskId, deviceId, data.length);
      console.log('[Cache] saveToCache completed successfully', { taskId, deviceId, dataLength: data.length });
      
      if (enablePerformanceLogging) {
        const totalTime = stringifyTime + compressTime + saveTime;
        const originalSize = new Blob([jsonString]).size;
        const compressedSize = new Blob([compressed]).size;
        const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
        
        console.log(`[缓存性能] 保存 ${data.length} 条数据:`, {
          序列化时间: `${stringifyTime.toFixed(2)}ms`,
          压缩时间: `${compressTime.toFixed(2)}ms`,
          保存时间: `${saveTime.toFixed(2)}ms`,
          总时间: `${totalTime.toFixed(2)}ms`,
          原始大小: `${(originalSize / 1024).toFixed(2)}KB`,
          压缩后大小: `${(compressedSize / 1024).toFixed(2)}KB`,
          压缩率: `${compressionRatio}%`,
          节省空间: `${((originalSize - compressedSize) / 1024).toFixed(2)}KB`,
        });
      }
    } else {
      console.error('数据压缩失败');
      throw new Error('数据压缩失败');
    }
  } catch (error) {
    console.error('保存缓存失败:', error);
    throw error;
  }
}

/**
 * 从 IndexedDB 读取并解压数据
 * @param taskId 任务ID
 * @param deviceId 设备ID
 * @param enablePerformanceLogging 是否启用性能日志（开发环境）
 */
export async function loadFromCache(
  taskId: string,
  deviceId: string,
  enablePerformanceLogging: boolean = false
): Promise<TemperatureHumidityData[] | null> {
  if (!isIndexedDBAvailable()) {
    return null;
  }

  try {
    const key = getCacheKey(taskId, deviceId);
    
    // 步骤1: 从 IndexedDB 读取（从任务的 objectStore 中读取）
    const readStart = enablePerformanceLogging ? performance.now() : 0;
    const compressed = await loadFromIndexedDB(key, taskId, deviceId);
    const readTime = enablePerformanceLogging ? performance.now() - readStart : 0;
    
    if (!compressed) {
      return null;
    }
    
    // 步骤2: 解压数据（LZString 解压通常很快，对于几KB到几MB的数据，通常在 1-10ms）
    const decompressStart = enablePerformanceLogging ? performance.now() : 0;
    const jsonString = LZString.decompress(compressed);
    const decompressTime = enablePerformanceLogging ? performance.now() - decompressStart : 0;
    
    if (!jsonString) {
      return null;
    }
    
    // 步骤3: JSON 解析（通常是最耗时的步骤，取决于数据量）
    const parseStart = enablePerformanceLogging ? performance.now() : 0;
    const parsedData = JSON.parse(jsonString) as any[];
    const parseTime = enablePerformanceLogging ? performance.now() - parseStart : 0;
    
    // 步骤4: 确保数据格式正确，去掉可能存在的 taskId（兼容旧数据）
    // 然后添加正确的 taskId（从参数中获取，确保一致性）
    const result: TemperatureHumidityData[] = parsedData.map((item: any) => {
      const { taskId: _, ...rest } = item; // 去掉可能存在的旧 taskId
      return {
        ...rest,
        taskId, // 使用正确的 taskId
      };
    });
    
    if (enablePerformanceLogging) {
      const totalTime = readTime + decompressTime + parseTime;
      const compressedSize = new Blob([compressed]).size;
      const decompressedSize = new Blob([jsonString]).size;
      const compressionRatio = ((1 - compressedSize / decompressedSize) * 100).toFixed(1);
      
      console.log(`[缓存性能] 加载 ${result.length} 条数据:`, {
        读取时间: `${readTime.toFixed(2)}ms`,
        解压时间: `${decompressTime.toFixed(2)}ms`,
        解析时间: `${parseTime.toFixed(2)}ms`,
        总时间: `${totalTime.toFixed(2)}ms`,
        压缩后大小: `${(compressedSize / 1024).toFixed(2)}KB`,
        原始大小: `${(decompressedSize / 1024).toFixed(2)}KB`,
        压缩率: `${compressionRatio}%`,
      });
    }
    
    return result;
  } catch (error) {
    console.error('读取缓存失败:', error);
    return null;
  }
}

/**
 * 更新缓存元数据
 */
async function updateCacheMeta(taskId: string, deviceId: string, dataCount: number): Promise<void> {
  if (!isIndexedDBAvailable()) {
    return;
  }

  try {
    const existingMeta = await loadMetaFromIndexedDB(taskId);
    let meta: Record<string, CacheMeta> = existingMeta || {};

    // 如果数据条数为 0，则删除该设备的缓存记录（不再计入设备列表）
    if (dataCount === 0) {
      delete meta[deviceId];
      await deleteFromIndexedDB(getCacheKey(taskId, deviceId), taskId, deviceId);
    } else {
      meta[deviceId] = {
        taskId,
        deviceId,
        lastUpdated: Date.now(),
        dataCount,
      };
    }

    await saveMetaToIndexedDB(taskId, meta);
  } catch (error) {
    console.error('更新缓存元数据失败:', error);
  }
}

/**
 * 获取任务的所有缓存设备列表
 */
export async function getCachedDevices(taskId: string): Promise<string[]> {
  if (!isIndexedDBAvailable()) {
    return [];
  }

  try {
    const meta = await loadMetaFromIndexedDB(taskId);
    
    if (!meta) {
      return [];
    }
    
    return Object.keys(meta);
  } catch (error) {
    console.error('获取缓存设备列表失败:', error);
    return [];
  }
}

/**
 * 获取每个设备的缓存条数
 */
export async function getCachedDeviceCounts(taskId: string): Promise<Record<string, number>> {
  if (!isIndexedDBAvailable()) {
    return {};
  }

  try {
    const counts: Record<string, number> = {};
    const devices = await getCachedDevices(taskId);

    for (const deviceId of devices) {
      const data = await loadFromCache(taskId, deviceId);
      counts[deviceId] = data?.length ?? 0;
    }

    return counts;
  } catch (error) {
    console.error('获取设备缓存条数失败:', error);
    return {};
  }
}

/**
 * 获取任务的所有缓存数据
 */
export async function getAllCachedData(taskId: string): Promise<TemperatureHumidityData[]> {
  if (!isIndexedDBAvailable()) {
    return [];
  }

  const devices = await getCachedDevices(taskId);
  const allData: TemperatureHumidityData[] = [];
  
  for (const deviceId of devices) {
    const data = await loadFromCache(taskId, deviceId);
    if (data) {
      allData.push(...data);
    }
  }
  
  return allData;
}

/**
 * 添加数据到缓存（用于导入时）
 */
export async function addToCache(
  taskId: string,
  newData: TemperatureHumidityData[]
): Promise<void> {
  if (!isIndexedDBAvailable()) {
    return;
  }

  if (newData.length === 0) return;
  
  // 按设备ID分组
  const dataByDevice: Record<string, TemperatureHumidityData[]> = {};
  
  for (const item of newData) {
    if (!dataByDevice[item.deviceId]) {
      dataByDevice[item.deviceId] = [];
    }
    dataByDevice[item.deviceId].push(item);
  }
  
  // 为每个设备合并数据
  for (const [deviceId, deviceData] of Object.entries(dataByDevice)) {
    const existingData = (await loadFromCache(taskId, deviceId)) || [];
    
    // 合并数据，去重（基于 timestamp）
    const dataMap = new Map<string, TemperatureHumidityData>();
    
    // 先添加现有数据
    for (const item of existingData) {
      dataMap.set(item.timestamp, item);
    }
    
    // 添加新数据（覆盖相同时间戳的数据）
    for (const item of deviceData) {
      dataMap.set(item.timestamp, item);
    }
    
    // 转换为数组并按时间排序
    const mergedData = Array.from(dataMap.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    await saveToCache(taskId, deviceId, mergedData);
  }
}

/**
 * 清理指定任务的缓存
 */
export async function clearTaskCache(taskId: string): Promise<void> {
  if (!isIndexedDBAvailable()) {
    return;
  }

  try {
    await deleteTaskData(taskId);
    await deleteMetaFromIndexedDB(taskId);
  } catch (error) {
    console.error('清理任务缓存失败:', error);
  }
}

/**
 * 清理所有缓存
 */
export async function clearAllCache(): Promise<void> {
  if (!isIndexedDBAvailable()) {
    return;
  }

  try {
    const taskIds = await getAllTaskIds();
    
    for (const taskId of taskIds) {
      await deleteTaskData(taskId);
      await deleteMetaFromIndexedDB(taskId);
    }
  } catch (error) {
    console.error('清理所有缓存失败:', error);
  }
}

/**
 * 清理旧缓存（当存储空间不足时）
 */
async function clearOldCache(): Promise<void> {
  if (!isIndexedDBAvailable()) {
    return;
  }

  try {
    const taskIds = await getAllTaskIds();
    
    // 按最后更新时间排序，删除最旧的
    const metaData: Array<{ taskId: string; lastUpdated: number }> = [];
    
    for (const taskId of taskIds) {
      try {
        const meta = await loadMetaFromIndexedDB(taskId);
        if (meta) {
          const maxLastUpdated = Math.max(
            ...Object.values(meta).map((m: CacheMeta) => m.lastUpdated)
          );
          metaData.push({ taskId, lastUpdated: maxLastUpdated });
        }
      } catch {
        // 忽略解析错误
      }
    }
    
    // 按时间排序，删除最旧的 50%
    metaData.sort((a, b) => a.lastUpdated - b.lastUpdated);
    const toDelete = Math.floor(metaData.length / 2);
    
    for (let i = 0; i < toDelete; i++) {
      await clearTaskCache(metaData[i].taskId);
    }
  } catch (error) {
    console.error('清理旧缓存失败:', error);
  }
}

/**
 * 获取缓存大小（估算）
 */
export async function getCacheSize(taskId: string): Promise<number> {
  if (!isIndexedDBAvailable()) {
    return 0;
  }

  try {
    const devices = await getCachedDevices(taskId);
    let totalSize = 0;
    
    for (const deviceId of devices) {
      const key = getCacheKey(taskId, deviceId);
      const compressed = await loadFromIndexedDB(key, taskId, deviceId);
      if (compressed) {
        totalSize += new Blob([compressed]).size;
      }
    }
    
    return totalSize;
  } catch (error) {
    console.error('获取缓存大小失败:', error);
    return 0;
  }
}

/**
 * 获取缓存数据统计
 */
export async function getCacheStats(taskId: string): Promise<{
  deviceCount: number;
  totalDataCount: number;
  cacheSize: number;
}> {
  if (!isIndexedDBAvailable()) {
    return {
      deviceCount: 0,
      totalDataCount: 0,
      cacheSize: 0,
    };
  }

  const devices = await getCachedDevices(taskId);
  let totalDataCount = 0;
  
  for (const deviceId of devices) {
    const data = await loadFromCache(taskId, deviceId);
    if (data) {
      totalDataCount += data.length;
    }
  }
  
  const cacheSize = await getCacheSize(taskId);
  
  return {
    deviceCount: devices.length,
    totalDataCount,
    cacheSize,
  };
}

/**
 * 保存设备 SN 到 IndexedDB
 */
export async function saveDeviceSn(taskId: string, deviceId: string, deviceSn?: string): Promise<void> {
  if (!isIndexedDBAvailable()) {
    return;
  }

  try {
    const meta = await loadMetaFromIndexedDB(taskId);
    if (!meta || !meta[deviceId]) {
      // 如果设备元数据不存在，先创建一个基本的元数据
      const data = await loadFromCache(taskId, deviceId);
      const dataCount = data?.length ?? 0;
      if (!meta) {
        await saveMetaToIndexedDB(taskId, {
          [deviceId]: {
            taskId,
            deviceId,
            lastUpdated: Date.now(),
            dataCount,
            deviceSn: deviceSn?.trim() || undefined,
          },
        });
      } else {
        meta[deviceId] = {
          taskId,
          deviceId,
          lastUpdated: Date.now(),
          dataCount,
          deviceSn: deviceSn?.trim() || undefined,
        };
        await saveMetaToIndexedDB(taskId, meta);
      }
    } else {
      // 更新现有元数据
      meta[deviceId] = {
        ...meta[deviceId],
        deviceSn: deviceSn?.trim() || undefined,
      };
      await saveMetaToIndexedDB(taskId, meta);
    }
  } catch (error) {
    console.error('保存设备SN失败:', error);
    throw error;
  }
}

/**
 * 获取设备 SN
 */
export async function getDeviceSn(taskId: string, deviceId: string): Promise<string | undefined> {
  if (!isIndexedDBAvailable()) {
    return undefined;
  }

  try {
    const meta = await loadMetaFromIndexedDB(taskId);
    return meta?.[deviceId]?.deviceSn;
  } catch (error) {
    console.error('获取设备SN失败:', error);
    return undefined;
  }
}

/**
 * 获取所有设备的 SN 映射
 */
export async function getAllDeviceSns(taskId: string): Promise<Record<string, string>> {
  if (!isIndexedDBAvailable()) {
    return {};
  }

  try {
    const meta = await loadMetaFromIndexedDB(taskId);
    if (!meta) {
      return {};
    }

    const snMap: Record<string, string> = {};
    for (const [deviceId, deviceMeta] of Object.entries(meta)) {
      if (deviceMeta.deviceSn) {
        snMap[deviceId] = deviceMeta.deviceSn;
      }
    }
    return snMap;
  } catch (error) {
    console.error('获取所有设备SN失败:', error);
    return {};
  }
}

/**
 * 重命名设备ID（更新IndexedDB中的key和数据）
 */
export async function renameDeviceId(
  taskId: string,
  oldDeviceId: string,
  newDeviceId: string
): Promise<void> {
  if (!isIndexedDBAvailable()) {
    throw new Error('IndexedDB 不可用');
  }

  if (oldDeviceId === newDeviceId) {
    return; // 无需重命名
  }

  try {
    // 1. 读取旧设备ID的温湿度数据
    const oldData = await loadFromCache(taskId, oldDeviceId);
    
    if (!oldData || oldData.length === 0) {
      // 如果没有数据，只需要更新元数据和SN映射
      const meta = await loadMetaFromIndexedDB(taskId);
      if (meta && meta[oldDeviceId]) {
        // 更新元数据中的设备ID
        meta[newDeviceId] = {
          ...meta[oldDeviceId],
          deviceId: newDeviceId,
        };
        delete meta[oldDeviceId];
        await saveMetaToIndexedDB(taskId, meta);
      }
      return;
    }

    // 2. 更新数据中的deviceId字段
    const newData: TemperatureHumidityData[] = oldData.map((item) => ({
      ...item,
      deviceId: newDeviceId,
    }));

    // 3. 保存到新设备ID的key下
    await saveToCache(taskId, newDeviceId, newData);

    // 4. 删除旧设备ID的数据
    await deleteFromIndexedDB(getCacheKey(taskId, oldDeviceId), taskId, oldDeviceId);

    // 5. 更新元数据
    const meta = await loadMetaFromIndexedDB(taskId);
    if (meta && meta[oldDeviceId]) {
      // 将旧设备ID的元数据移到新设备ID
      meta[newDeviceId] = {
        ...meta[oldDeviceId],
        deviceId: newDeviceId,
      };
      delete meta[oldDeviceId];
      await saveMetaToIndexedDB(taskId, meta);
    }
  } catch (error) {
    console.error('重命名设备ID失败:', error);
    throw error;
  }
}

