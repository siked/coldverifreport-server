import { useCallback, useState } from 'react';
import {
  getCacheStats,
  getCachedDeviceCounts,
  getCachedDevices,
  loadFromCache,
  saveToCache,
} from '@/lib/cache';

interface TemperatureHumidityData {
  _id?: string;
  taskId: string;
  deviceId: string;
  temperature: number;
  humidity: number;
  timestamp: string;
}

interface Device {
  deviceId: string;
  createdAt?: string;
  deviceName?: string;
  deviceSn?: string;
}

interface Task {
  _id: string;
  taskNumber: string;
  taskName: string;
}

interface UseTaskDataLayerOptions {
  taskId: string;
  setAlert: (alert: { isOpen: boolean; message: string; type?: 'success' | 'error' | 'info' | 'warning' }) => void;
  sortDeviceList: (list: Device[]) => Device[];
  onDeviceDataUpdated?: (deviceId: string, dataset: TemperatureHumidityData[]) => void;
}

export const useTaskDataLayer = ({
  taskId,
  setAlert,
  sortDeviceList,
  onDeviceDataUpdated,
}: UseTaskDataLayerOptions) => {
  const [task, setTask] = useState<Task | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceDataMap, setDeviceDataMap] = useState<Record<string, TemperatureHumidityData[]>>({});
  const [cacheStats, setCacheStats] = useState<{
    deviceCount: number;
    totalDataCount: number;
    cacheSize: number;
  } | null>(null);
  const [cachedDeviceIds, setCachedDeviceIds] = useState<string[]>([]);
  const [cachedCounts, setCachedCounts] = useState<Record<string, number>>({});
  const [loadingDeviceIds, setLoadingDeviceIds] = useState<string[]>([]);
  const [isCachingAll, setIsCachingAll] = useState(false);

  const applyDeviceDataUpdate = useCallback(
    (deviceId: string, dataset: TemperatureHumidityData[]) => {
      const sorted = [...dataset].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      setDeviceDataMap((prev) => ({
        ...prev,
        [deviceId]: sorted,
      }));
      onDeviceDataUpdated?.(deviceId, sorted);
    },
    [onDeviceDataUpdated]
  );

  const updateCacheStats = useCallback(async () => {
    const stats = await getCacheStats(taskId);
    setCacheStats(stats);
    const cachedIds = await getCachedDevices(taskId);
    setCachedDeviceIds(cachedIds);
    const counts = await getCachedDeviceCounts(taskId);
    setCachedCounts(counts);
  }, [taskId]);

  const setDeviceLoadingState = useCallback((deviceId: string, loading: boolean) => {
    setLoadingDeviceIds((prev) => {
      const exists = prev.includes(deviceId);
      if (loading && !exists) {
        return [...prev, deviceId];
      }
      if (!loading && exists) {
        return prev.filter((id) => id !== deviceId);
      }
      return prev;
    });
  }, []);

  const syncFromServer = useCallback(
    async (deviceId: string) => {
      if (!deviceId) return;
      try {
        const res = await fetch(`/api/tasks/${taskId}/data?deviceId=${deviceId}`);
        if (res.ok) {
          const result = await res.json();
          const serverData = result.data || [];
          applyDeviceDataUpdate(deviceId, serverData);
          await saveToCache(taskId, deviceId, serverData);
          await updateCacheStats();
        }
      } catch (error) {
        console.error('获取数据失败:', error);
      }
    },
    [applyDeviceDataUpdate, taskId, updateCacheStats]
  );

  const fetchDeviceData = useCallback(
    async (deviceId: string, forceRefresh = false) => {
      if (!deviceId) return;

      const performCacheLoad = async () => {
        if (forceRefresh) return false;
        const cachedData = await loadFromCache(taskId, deviceId);
        if (cachedData) {
          applyDeviceDataUpdate(deviceId, cachedData);
          return true;
        }
        return false;
      };

      setDeviceLoadingState(deviceId, true);

      try {
        const loadedFromCache = await performCacheLoad();
        if (loadedFromCache) {
          return;
        }
        await syncFromServer(deviceId);
      } finally {
        setDeviceLoadingState(deviceId, false);
      }
    },
    [applyDeviceDataUpdate, setDeviceLoadingState, syncFromServer, taskId]
  );

  const fetchTask = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const result = await res.json();
        const foundTask = result.tasks.find((t: Task) => t._id === taskId);
        if (foundTask) {
          setTask(foundTask);
        } else {
          setAlert({ isOpen: true, message: '任务不存在', type: 'error' });
        }
      }
    } catch (error) {
      console.error('获取任务失败:', error);
    }
  }, [setAlert, taskId]);

  const fetchDevices = useCallback(async () => {
    const cachedDevices = await getCachedDevices(taskId);
    setCachedDeviceIds(cachedDevices);
    const cachedDeviceList: Device[] = cachedDevices.map((deviceId) => ({
      deviceId,
      createdAt: new Date().toISOString(),
    }));

    try {
      const res = await fetch(`/api/tasks/${taskId}/data?type=devices`);
      if (res.ok) {
        const result = await res.json();
        const serverDevices: Device[] = result.devices || [];

        const deviceMap = new Map<string, Device>();
        serverDevices.forEach((device) => {
          deviceMap.set(device.deviceId, device);
        });
        cachedDeviceList.forEach((device) => {
          if (!deviceMap.has(device.deviceId)) {
            deviceMap.set(device.deviceId, device);
          }
        });

        const mergedDevices = sortDeviceList(Array.from(deviceMap.values()));
        setDevices(mergedDevices);
        return mergedDevices;
      }
      if (cachedDeviceList.length > 0) {
        setDevices(sortDeviceList(cachedDeviceList));
        return cachedDeviceList;
      }
      setDevices([]);
      return [];
    } catch (error) {
      console.error('获取设备列表失败:', error);
      if (cachedDeviceList.length > 0) {
        setDevices(sortDeviceList(cachedDeviceList));
        return cachedDeviceList;
      }
      setDevices([]);
      return [];
    }
  }, [sortDeviceList, taskId]);

  const handleCacheAllDevices = useCallback(
    async (deviceIds?: string[], options: { silent?: boolean } = {}) => {
      const { silent = false } = options;
      if (isCachingAll) return { successCount: 0 };

      setIsCachingAll(true);
      try {
        const devicesToCache = await getCachedDevices(taskId);
        const uniqueDeviceIds = Array.from(
          new Set([...(deviceIds ?? devices.map((d) => d.deviceId)), ...devicesToCache])
        );

        if (uniqueDeviceIds.length === 0) {
          if (!silent) {
            setAlert({ isOpen: true, message: '没有设备可缓存', type: 'info' });
          }
          return { successCount: 0 };
        }

        let successCount = 0;
        for (const deviceId of uniqueDeviceIds) {
          try {
            setDeviceLoadingState(deviceId, true);
            const res = await fetch(`/api/tasks/${taskId}/data?deviceId=${deviceId}`);
            if (res.ok) {
              const result = await res.json();
              const serverData = result.data || [];
              await saveToCache(taskId, deviceId, serverData);
              applyDeviceDataUpdate(deviceId, serverData);
              setCachedDeviceIds((prev) => (prev.includes(deviceId) ? prev : [...prev, deviceId]));
              setCachedCounts((prev) => ({
                ...prev,
                [deviceId]: serverData.length,
              }));
              successCount++;
            }
          } catch (error) {
            console.error(`缓存设备 ${deviceId} 数据失败:`, error);
          } finally {
            setDeviceLoadingState(deviceId, false);
          }
        }

        await updateCacheStats();
        if (!silent) {
          setAlert({
            isOpen: true,
            message: `已缓存 ${successCount} 个设备的数据到本地`,
            type: 'success',
          });
        }
        return { successCount };
      } catch (error) {
        if (!silent) {
          setAlert({ isOpen: true, message: '缓存设备数据失败', type: 'error' });
        }
        return { successCount: 0 };
      } finally {
        setIsCachingAll(false);
      }
    },
    [
      applyDeviceDataUpdate,
      devices,
      isCachingAll,
      setAlert,
      setDeviceLoadingState,
      taskId,
      updateCacheStats,
    ]
  );

  return {
    task,
    setTask,
    devices,
    setDevices,
    deviceDataMap,
    setDeviceDataMap,
    cacheStats,
    setCacheStats,
    cachedDeviceIds,
    setCachedDeviceIds,
    cachedCounts,
    setCachedCounts,
    loadingDeviceIds,
    setDeviceLoadingState,
    isCachingAll,
    applyDeviceDataUpdate,
    updateCacheStats,
    fetchTask,
    fetchDevices,
    fetchDeviceData,
    handleCacheAllDevices,
  };
};


