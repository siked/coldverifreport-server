'use client';

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type MouseEvent as ReactMouseEvent,
  type UIEvent,
} from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import Alert from '@/components/Alert';
import CurveChartPanel from './components/CurveChartPanel';
import TrendGenerator from './components/TrendGenerator';
import { ArrowLeft, Plus, Trash2, Edit2, Upload, Save, Trash, Database, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useTaskDataLayer } from './hooks/useTaskDataLayer';
import {
  loadFromCache,
  saveToCache,
  addToCache,
  clearTaskCache,
  clearAllCache,
  getAllCachedData,
  getCachedDevices,
  type TemperatureHumidityData as CacheData,
} from '@/lib/cache';
import LZString from 'lz-string';
import Highcharts from 'highcharts/highstock';
import HighchartsReact, { HighchartsReactRefObject } from 'highcharts-react-official';

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
}

interface Task {
  _id: string;
  taskNumber: string;
  taskName: string;
}

type ChartPoint = {
  timestamp: number;
  temperature: number;
  humidity: number;
};

const DEFAULT_BACKUP_REMARK = '上传前自动备份';
const CHART_COLOR_PALETTE = ['#3b82f6', '#10b981', '#f97316', '#a855f7', '#ec4899', '#0ea5e9'];
const LIST_BATCH_SIZE = 400;
const CACHE_IMPORT_BATCH_SIZE = 200; // 较小批次，提升 UI 进度刷新
const MAX_CHART_POINTS = 1500;
const DETAIL_RANGE_THRESHOLD_MS = 1000 * 60 * 30; // 30 分钟范围内展示完整数据
const MIN_BUCKET_DURATION_MS = 1000 * 30; // 聚合桶最小跨度 30 秒

interface TaskBackup {
  backupId: string;
  remark?: string;
  recordCount: number;
  createdAt: string;
  deviceIds?: string[];
}

export default function TaskDataPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.taskId as string;

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [renderDeviceIds, setRenderDeviceIds] = useState<string[]>([]);
  const [selectionPreviewIds, setSelectionPreviewIds] = useState<string[]>([]);
  const [selectionPreviewMode, setSelectionPreviewMode] = useState<'add' | 'remove' | null>(null);
  const [data, setData] = useState<TemperatureHumidityData[]>([]);
  const [visibleRowCount, setVisibleRowCount] = useState(LIST_BATCH_SIZE);
  const [activeTab, setActiveTab] = useState<'list' | 'temperature' | 'humidity'>('list');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingData, setEditingData] = useState<TemperatureHumidityData | null>(null);
  const [formData, setFormData] = useState({
    deviceId: '',
    temperature: '',
    humidity: '',
    timestamp: new Date().toISOString().slice(0, 16),
  });
  const [alert, setAlert] = useState<{ isOpen: boolean; message: string; type?: 'success' | 'error' | 'info' | 'warning' }>({
    isOpen: false,
    message: '',
    type: 'info',
  });
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [showTrendGenerator, setShowTrendGenerator] = useState(false);
  const [importStep, setImportStep] = useState<'file' | 'mapping'>('file');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<any[][]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    stage: string;
    processed: number;
    total: number;
  }>({
    stage: '',
    processed: 0,
    total: 0,
  });
  const [columnMapping, setColumnMapping] = useState<{
    deviceId: string;
    temperature: string;
    humidity: string;
    timestamp: string;
  }>({
    deviceId: '',
    temperature: '',
    humidity: '',
    timestamp: '',
  });
  const [uploadProgress, setUploadProgress] = useState<{
    isUploading: boolean;
    progress: number;
    current: number;
    total: number;
  }>({
    isUploading: false,
    progress: 0,
    current: 0,
    total: 0,
  });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [leftTab, setLeftTab] = useState<'devices' | 'history'>('devices');
  const [backups, setBackups] = useState<TaskBackup[]>([]);
  const [isBackupsLoading, setIsBackupsLoading] = useState(false);
  const [isRestoringBackupId, setIsRestoringBackupId] = useState<string | null>(null);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);
  const [backupRemark, setBackupRemark] = useState(DEFAULT_BACKUP_REMARK);
  const [pendingUploadCount, setPendingUploadCount] = useState(0);
  const [isPostUploadBackup, setIsPostUploadBackup] = useState(false);
  const [isClearingServerData, setIsClearingServerData] = useState(false);
  const [chartRange, setChartRange] = useState<{ min: number; max: number } | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [copiedSelectionData, setCopiedSelectionData] = useState<TemperatureHumidityData[] | null>(null);
  const [copiedSelectionMeta, setCopiedSelectionMeta] = useState<{
    deviceIds: string[];
    perDeviceMinTimestamp: Record<string, number>;
    isSingleDevice: boolean;
  } | null>(null);
  const [contextMenuState, setContextMenuState] = useState<{
    x: number;
    y: number;
    targetDeviceId: string | null;
    targetTimestamp: number;
    isSelectionArea: boolean;
  } | null>(null);
  const [deviceNameMap, setDeviceNameMap] = useState<Record<string, { name?: string; sn?: string; deviceNumber?: string }>>({});
  const [showCreateDeviceDialog, setShowCreateDeviceDialog] = useState(false);
  const [createDeviceInput, setCreateDeviceInput] = useState('');
  const [createDeviceError, setCreateDeviceError] = useState<string | null>(null);
  const [createDevicePreview, setCreateDevicePreview] = useState<string[] | null>(null);
  const [isCreatingDevices, setIsCreatingDevices] = useState(false);
  const [deleteDeviceId, setDeleteDeviceId] = useState<string | null>(null);
  const [deviceContextMenu, setDeviceContextMenu] = useState<{
    x: number;
    y: number;
    deviceId: string;
  } | null>(null);
  const [editingDeviceName, setEditingDeviceName] = useState<{
    deviceId: string;
    currentName: string;
    currentSn: string;
    currentDeviceNumber: string;
  } | null>(null);
  const chartRangeRef = useRef<{ min: number; max: number } | null>(null);
  const chartComponentRef = useRef<HighchartsReactRefObject | null>(null);
  const rightPanStateRef = useRef<{
    isPanning: boolean;
    startX: number;
    min: number;
    max: number;
    hasMoved: boolean;
    suppressContextMenu: boolean;
  }>({
    isPanning: false,
    startX: 0,
    min: 0,
    max: 0,
    hasMoved: false,
    suppressContextMenu: false,
  });
  const pendingUploadDataRef = useRef<TemperatureHumidityData[] | null>(null);
  const dragStateRef = useRef<{
    isDragging: boolean;
    startIndex: number;
    currentIndex: number;
    button: 0 | 2 | null;
    hasMoved: boolean;
  }>({
    isDragging: false,
    startIndex: -1,
    currentIndex: -1,
    button: null,
    hasMoved: false,
  });
  const deviceIdCollator = useMemo(
    () =>
      new Intl.Collator(['zh-Hans-CN', 'en'], {
        numeric: true,
        sensitivity: 'base',
      }),
    []
  );
  const sortDeviceList = useCallback(
    (list: Device[]) => [...list].sort((a, b) => deviceIdCollator.compare(a.deviceId, b.deviceId)),
    [deviceIdCollator]
  );

  const {
    task,
    devices,
    setDevices,
    deviceDataMap,
    setDeviceDataMap,
    cacheStats,
    cachedDeviceIds,
    setCachedDeviceIds,
    cachedCounts,
    setCachedCounts,
    loadingDeviceIds,
    isCachingAll,
    applyDeviceDataUpdate,
    updateCacheStats,
    fetchTask,
    fetchDevices,
    fetchDeviceData,
    handleCacheAllDevices,
  } = useTaskDataLayer({
    taskId,
    setAlert,
    sortDeviceList,
    onDeviceDataUpdated: (deviceId, sorted) => {
      if (selectedDeviceId === deviceId) {
        setData(sorted);
      }
    },
  });

  useEffect(() => {
    fetchTask();
    fetchDevices().then((mergedDevices) => {
      if (mergedDevices && mergedDevices.length > 0 && !selectedDeviceId) {
        const firstId = mergedDevices[0].deviceId;
        setSelectedDeviceId(firstId);
        setRenderDeviceIds((prev) => (prev.length > 0 ? prev : [firstId]));
      }
    });
    updateCacheStats();
  }, [fetchDevices, fetchTask, selectedDeviceId, taskId, updateCacheStats]);

  // 加载并保存设备名称映射（仅保存在本地浏览器）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(`task-device-names-${taskId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        // 兼容旧格式：如果是字符串，转换为新格式
        const migrated: Record<string, { name?: string; sn?: string; deviceNumber?: string }> = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === 'string') {
            migrated[key] = { name: value };
          } else {
            migrated[key] = value as { name?: string; sn?: string; deviceNumber?: string };
          }
        }
        setDeviceNameMap(migrated);
      }
    } catch (error) {
      console.warn('加载本地设备名称失败:', error);
    }
  }, [taskId]);

  const persistDeviceNameMap = useCallback(
    (next: Record<string, { name?: string; sn?: string; deviceNumber?: string }>) => {
      setDeviceNameMap(next);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            `task-device-names-${taskId}`,
            JSON.stringify(next)
          );
        } catch (error) {
          console.warn('保存本地设备名称失败:', error);
        }
      }
    },
    [taskId]
  );

  // 解析批量设备范围，如 C001 到 C010 / C001-C010 / 001~010 等
  const parseDeviceRange = useCallback((value: string): string[] | null => {
    let text = value.trim();
    if (!text) return null;
    text = text.replace(/\s*到\s*/g, '-').replace(/\s+/g, '');

    const delimiterIndex = Math.max(text.lastIndexOf('-'), text.lastIndexOf('~'));
    if (delimiterIndex <= 0 || delimiterIndex >= text.length - 1) {
      return null;
    }

    const startRaw = text.slice(0, delimiterIndex);
    const endRaw = text.slice(delimiterIndex + 1);
    if (!startRaw || !endRaw) return null;

    const extract = (s: string) => {
      const match = s.match(/^(.*?)(\d+)$/);
      if (!match) return null;
      return {
        prefix: match[1] || '',
        numStr: match[2],
        num: parseInt(match[2], 10),
      };
    };

    const start = extract(startRaw);
    const end = extract(endRaw);
    if (!start || !end) return null;
    if (start.prefix !== end.prefix) return null;
    if (!Number.isFinite(start.num) || !Number.isFinite(end.num)) return null;
    if (start.num > end.num) return null;

    const count = end.num - start.num + 1;
    if (count <= 1 || count > 500) return null;

    const width = Math.max(start.numStr.length, end.numStr.length);
    const list: string[] = [];
    for (let n = start.num; n <= end.num; n++) {
      list.push(start.prefix + n.toString().padStart(width, '0'));
    }
    return list;
  }, []);

  useEffect(() => {
    if (!selectedDeviceId) {
      setData([]);
      setVisibleRowCount(LIST_BATCH_SIZE);
      return;
    }

    const existingData = deviceDataMap[selectedDeviceId];
    if (existingData) {
      setData(existingData);
      setVisibleRowCount(LIST_BATCH_SIZE);
      return;
    }

    fetchDeviceData(selectedDeviceId);
    setVisibleRowCount(LIST_BATCH_SIZE);
  }, [selectedDeviceId, deviceDataMap, taskId]);

  useEffect(() => {
    renderDeviceIds.forEach((deviceId) => {
      if (!deviceDataMap[deviceId]) {
        fetchDeviceData(deviceId);
      }
    });
  }, [renderDeviceIds, deviceDataMap, taskId]);

  useEffect(() => {
    setChartRange(null);
  }, [renderDeviceIds]);

  useEffect(() => {
    chartRangeRef.current = chartRange;
  }, [chartRange]);

  useEffect(() => {
    if (!contextMenuState) return;
    const handleHide = () => setContextMenuState(null);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenuState(null);
      }
    };
    window.addEventListener('click', handleHide);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleHide);
      window.removeEventListener('keydown', handleKey);
    };
  }, [contextMenuState]);

  useEffect(() => {
    if (!deviceContextMenu) return;
    const handleHide = () => setDeviceContextMenu(null);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDeviceContextMenu(null);
      }
    };
    window.addEventListener('click', handleHide);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleHide);
      window.removeEventListener('keydown', handleKey);
    };
  }, [deviceContextMenu]);

  useEffect(() => {
    const chart = chartComponentRef.current?.chart;
    const xAxis = chart?.xAxis?.[0];
    if (!xAxis) return;
    xAxis.removePlotBand('selection-range');
    if (selectionRange) {
      xAxis.addPlotBand({
        id: 'selection-range',
        color: 'rgba(59, 130, 246, 0.15)',
        borderColor: 'rgba(59, 130, 246, 0.4)',
        from: selectionRange.start,
        to: selectionRange.end,
      });
    }
  }, [selectionRange]);

  useEffect(() => {
    const chartInstance = chartComponentRef.current?.chart;
    if (!chartInstance) return;
    const container = chartInstance.container;
    if (!container) return;

    const axis = () => chartComponentRef.current?.chart?.xAxis?.[0];

    const handleWheel = (event: WheelEvent) => {
      const xAxis = axis();
      const chart = chartComponentRef.current?.chart;
      if (!xAxis || !chart || typeof xAxis.min !== 'number' || typeof xAxis.max !== 'number') {
        return;
      }
      event.preventDefault();
      const range = xAxis.max - xAxis.min;
      if (range <= 0) return;

      const zoomIntensity = 0.15;
      const normalized = chart.pointer.normalize(event);
      const pointerValue = xAxis.toValue(normalized.chartX, true);
      if (!Number.isFinite(pointerValue)) return;

      const zoomOut = event.deltaY > 0;
      const zoomFactor = zoomOut ? 1 + zoomIntensity : Math.max(1 - zoomIntensity, 0.05);
      const newRange = Math.max(range * zoomFactor, MIN_BUCKET_DURATION_MS);
      const ratio = range === 0 ? 0.5 : (pointerValue - xAxis.min) / range;
      const newMin = pointerValue - ratio * newRange;
      const newMax = newMin + newRange;

      xAxis.setExtremes(newMin, newMax, true, false);
    };

    const handleMouseDown = (event: globalThis.MouseEvent) => {
      if (event.button !== 2) return;
      const xAxis = axis();
      if (!xAxis || typeof xAxis.min !== 'number' || typeof xAxis.max !== 'number') return;
      rightPanStateRef.current = {
        isPanning: true,
        startX: event.clientX,
        min: xAxis.min,
        max: xAxis.max,
        hasMoved: false,
        suppressContextMenu: false,
      };
      event.preventDefault();
    };

    const handleMouseMove = (event: globalThis.MouseEvent) => {
      if (!rightPanStateRef.current.isPanning) return;
      const chart = chartComponentRef.current?.chart;
      const xAxis = axis();
      if (!chart || !xAxis) return;
      const range = rightPanStateRef.current.max - rightPanStateRef.current.min;
      if (range <= 0 || chart.plotWidth <= 0) return;

      const pixelDelta = event.clientX - rightPanStateRef.current.startX;
      if (Math.abs(pixelDelta) > 2) {
        rightPanStateRef.current.hasMoved = true;
      }
      const valueDelta = (-pixelDelta / chart.plotWidth) * range;
      xAxis.setExtremes(
        rightPanStateRef.current.min + valueDelta,
        rightPanStateRef.current.max + valueDelta,
        true,
        false
      );
      event.preventDefault();
    };

    const handleMouseUp = () => {
      if (rightPanStateRef.current.isPanning) {
        rightPanStateRef.current.isPanning = false;
        if (rightPanStateRef.current.hasMoved) {
          rightPanStateRef.current.suppressContextMenu = true;
          window.setTimeout(() => {
            rightPanStateRef.current.suppressContextMenu = false;
          }, 200);
        }
      }
    };

    const handleContextMenu = (event: globalThis.MouseEvent) => {
      const hasSelection = Boolean(selectionRange);
      const hasClipboard = Boolean(copiedSelectionData?.length);
      if (!hasSelection && !hasClipboard) {
        return;
      }
      event.preventDefault();
      if (rightPanStateRef.current.suppressContextMenu) {
        rightPanStateRef.current.suppressContextMenu = false;
        setContextMenuState(null);
        return;
      }

      const chart = chartComponentRef.current?.chart;
      const xAxis = chart?.xAxis?.[0];
      if (!chart || !xAxis) {
        setContextMenuState(null);
        return;
      }

      const normalized = chart.pointer.normalize(event as any);
      const xValue = xAxis.toValue(normalized.chartX, true);
      if (!Number.isFinite(xValue)) {
        setContextMenuState(null);
        return;
      }

      const isSelectionArea =
        !!selectionRange &&
        xValue >= selectionRange.start &&
        xValue <= selectionRange.end;
      if (selectionRange && !isSelectionArea) {
        setSelectionRange(null);
      }

      let targetDeviceId: string | null = null;
      let minDistance = Number.POSITIVE_INFINITY;
      chart.series.forEach((series) => {
        if (!series.visible) return;
        const point = series.searchPoint(normalized, true as any);
        const pointDistance =
          point && typeof (point as any).dist === 'number'
            ? (point as any).dist
            : Number.POSITIVE_INFINITY;
        if (point && pointDistance < minDistance) {
          minDistance = pointDistance;
          targetDeviceId =
            (series.userOptions?.name as string) ||
            (series.options?.id as string) ||
            (series.name as string) ||
            null;
        }
      });

      if (minDistance > 60) {
        targetDeviceId = null;
      }

      setContextMenuState({
        x: event.clientX,
        y: event.clientY,
        targetDeviceId,
        targetTimestamp: xValue,
        isSelectionArea,
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('wheel', handleWheel as EventListener);
      container.removeEventListener('mousedown', handleMouseDown as EventListener);
      container.removeEventListener('contextmenu', handleContextMenu as EventListener);
      window.removeEventListener('mousemove', handleMouseMove as EventListener);
      window.removeEventListener('mouseup', handleMouseUp as EventListener);
    };
  }, [renderDeviceIds, activeTab, copiedSelectionData, selectionRange]);

  useEffect(() => {
    if (!selectedDeviceId) return;
    if (!renderDeviceIds.includes(selectedDeviceId)) {
      setRenderDeviceIds((prev) => [...prev, selectedDeviceId]);
    }
  }, [selectedDeviceId, renderDeviceIds]);

  useEffect(() => {
    fetchBackups();
  }, [taskId]);

  const fetchBackups = async () => {
    setIsBackupsLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/backups`);
      if (res.ok) {
        const result = await res.json();
        setBackups((result.backups as TaskBackup[]) || []);
      }
    } catch (error) {
      console.error('获取备份列表失败:', error);
    } finally {
      setIsBackupsLoading(false);
    }
  };

  const createBackup = async (remark?: string) => {
    if (isCreatingBackup) {
      throw new Error('备份正在进行中，请稍候重试');
    }

    setIsCreatingBackup(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/backups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remark }),
      });

      let payload: any = {};
      try {
        payload = await res.json();
      } catch (error) {
        payload = {};
      }

      if (!res.ok) {
        throw new Error(payload.error || '创建备份失败');
      }

      if (payload.backup) {
        setBackups((prev) => {
          const exists = prev.some((item) => item.backupId === payload.backup.backupId);
          if (exists) {
            return prev;
          }
          return [payload.backup as TaskBackup, ...prev];
        });
      }

      return payload.backup as TaskBackup;
    } finally {
      setIsCreatingBackup(false);
      await fetchBackups();
    }
  };

  const handleRestoreBackup = async (backup: TaskBackup) => {
    if (isRestoringBackupId) {
      return;
    }

    const confirmed = confirm(
      `确认从备份 ${backup.backupId} 恢复数据吗？该操作会覆盖当前任务的所有数据。`
    );
    if (!confirmed) return;

    setIsRestoringBackupId(backup.backupId);
    try {
      const res = await fetch(
        `/api/tasks/${taskId}/backups/${encodeURIComponent(backup.backupId)}/restore`,
        { method: 'POST' }
      );

      let payload: any = {};
      try {
        payload = await res.json();
      } catch (error) {
        payload = {};
      }

      if (!res.ok) {
        throw new Error(payload.error || '恢复数据失败');
      }

      await clearAllCache();
      setCachedDeviceIds([]);
      setCachedCounts({});
      setSelectedDeviceId(null);
      setData([]);
      await updateCacheStats();
      await fetchDevices();
      const cacheResult = await handleCacheAllDevices(undefined, { silent: true });
      const cachedDevicesCount = cacheResult?.successCount ?? 0;
      const cacheMessage =
        cachedDevicesCount > 0 ? `，并缓存 ${cachedDevicesCount} 个设备数据` : '';

      setAlert({
        isOpen: true,
        message: `已从备份 ${backup.backupId} 恢复 ${payload.restoredCount ?? 0} 条数据${cacheMessage}`,
        type: 'success',
      });
      setLeftTab('devices');
    } catch (error: any) {
      setAlert({
        isOpen: true,
        message: error.message || '恢复数据失败',
        type: 'error',
      });
    } finally {
      setIsRestoringBackupId(null);
      await fetchBackups();
    }
  };

  const handleManualBackup = async () => {
    const defaultRemark = `手动备份（${new Date().toLocaleString('zh-CN')}）`;
    const remarkInput = prompt('请输入备份备注（可选）：', defaultRemark);
    const remark = (remarkInput ?? defaultRemark).trim() || defaultRemark;

    try {
      await createBackup(remark);
      setAlert({
        isOpen: true,
        message: '备份创建成功',
        type: 'success',
      });
    } catch (error: any) {
      setAlert({
        isOpen: true,
        message: error.message || '备份创建失败',
        type: 'error',
      });
    }
  };

  const addDevicesToRender = (deviceIds: string[], options: { focus?: boolean } = {}) => {
    if (deviceIds.length === 0) return;
    const { focus = true } = options;
    setRenderDeviceIds((prev) => {
      const next = [...prev];
      let changed = false;
      deviceIds.forEach((id) => {
        if (!next.includes(id)) {
          next.push(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    if (focus) {
      const lastDeviceId = deviceIds[deviceIds.length - 1];
      setSelectedDeviceId(lastDeviceId);
    }
  };

  const removeDevicesFromRender = (deviceIds: string[]) => {
    if (deviceIds.length === 0) return;
    const removeSet = new Set(deviceIds);
    setRenderDeviceIds((prev) => {
      const filtered = prev.filter((id) => !removeSet.has(id));
      if (filtered.length === prev.length) {
        return prev;
      }
      if (selectedDeviceId && removeSet.has(selectedDeviceId)) {
        const nextSelection = filtered[0] ?? null;
        setSelectedDeviceId(nextSelection);
        if (!nextSelection) {
          setData([]);
        }
      }
      return filtered;
    });
  };

  const getDeviceIdsInRange = (startIndex: number, endIndex: number) => {
    if (!devices.length) return [];
    const [start, end] =
      startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    const safeStart = Math.max(0, start);
    const safeEnd = Math.min(devices.length - 1, end);
    return devices.slice(safeStart, safeEnd + 1).map((device) => device.deviceId);
  };

  const resetDragState = () => {
    dragStateRef.current = {
      isDragging: false,
      startIndex: -1,
      currentIndex: -1,
      button: null,
      hasMoved: false,
    };
    setSelectionPreviewIds([]);
    setSelectionPreviewMode(null);
  };

  const handleDeviceMouseUp = () => {
    if (!dragStateRef.current.isDragging) return;
    const { startIndex, currentIndex, button, hasMoved } = dragStateRef.current;
    window.removeEventListener('mouseup', handleDeviceMouseUp);
    const ids = getDeviceIdsInRange(startIndex, currentIndex);
    const deviceId = devices[startIndex]?.deviceId;
    
    // 如果没有移动，且是左键，则处理为单击切换选中状态
    if (!hasMoved && button === 0 && deviceId) {
      if (renderDeviceIds.includes(deviceId)) {
        removeDevicesFromRender([deviceId]);
      } else {
        addDevicesToRender([deviceId]);
      }
      resetDragState();
      return;
    }

    // 框选操作
    if (ids.length === 0 || button === null) {
      resetDragState();
      return;
    }
    
    if (button === 0) {
      // 左键框选：如果框选的设备都已选中，则取消选中；否则添加选中
      const allSelected = ids.every((id) => renderDeviceIds.includes(id));
      if (allSelected) {
        removeDevicesFromRender(ids);
      } else {
        addDevicesToRender(ids);
      }
    } else if (button === 2) {
      // 右键框选：如果框选的设备都已选中，则取消选中；否则添加选中
      const allSelected = ids.every((id) => renderDeviceIds.includes(id));
      if (allSelected) {
        removeDevicesFromRender(ids);
      } else {
        addDevicesToRender(ids);
      }
    }
    
    resetDragState();
  };

  const handleDeviceMouseDown = (event: ReactMouseEvent<HTMLDivElement>, index: number) => {
    const device = devices[index];
    if (!device) return;

    // 右键：弹出菜单
    if (event.button === 2) {
      event.preventDefault();
      setDeviceContextMenu({
        x: event.clientX,
        y: event.clientY,
        deviceId: device.deviceId,
      });
      return;
    }

    // 左键：开始拖拽或点击切换选中状态
    if (event.button === 0) {
      event.preventDefault();
      const isSelected = renderDeviceIds.includes(device.deviceId);
      dragStateRef.current = {
        isDragging: true,
        startIndex: index,
        currentIndex: index,
        button: 0,
        hasMoved: false,
      };
      setSelectionPreviewMode(isSelected ? 'remove' : 'add');
      setSelectionPreviewIds(getDeviceIdsInRange(index, index));
      window.addEventListener('mouseup', handleDeviceMouseUp);
    }
  };

  const handleDeviceMouseEnter = (_event: ReactMouseEvent<HTMLDivElement>, index: number) => {
    if (!dragStateRef.current.isDragging) return;
    if (index !== dragStateRef.current.currentIndex) {
      dragStateRef.current.hasMoved = true;
    }
    dragStateRef.current.currentIndex = index;
    const ids = getDeviceIdsInRange(dragStateRef.current.startIndex, dragStateRef.current.currentIndex);
    setSelectionPreviewIds(ids);
    // 如果框选的设备都已选中，则预览为移除模式；否则为添加模式
    const allSelected = ids.length > 0 && ids.every((id) => renderDeviceIds.includes(id));
    setSelectionPreviewMode(allSelected ? 'remove' : 'add');
  };

  const handleListScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
      const threshold = scrollHeight * 0.8;
      if (scrollTop + clientHeight >= threshold) {
        setVisibleRowCount((prev) => {
          if (prev >= data.length) return prev;
          const next = Math.min(prev + LIST_BATCH_SIZE, data.length);
          return next;
        });
      }
    },
    [data.length]
  );

  useEffect(() => {
    setVisibleRowCount((prev) => Math.min(Math.max(LIST_BATCH_SIZE, prev), data.length || LIST_BATCH_SIZE));
  }, [data.length]);

  const visibleRows = useMemo(
    () => data.slice(0, visibleRowCount),
    [data, visibleRowCount]
  );
  const hasMoreRows = visibleRowCount < data.length;

  const handleOpenCreateDeviceDialog = () => {
    setCreateDeviceInput('');
    setCreateDeviceError(null);
    setCreateDevicePreview(null);
    setShowCreateDeviceDialog(true);
  };

  const handleCreateDeviceInputChange = (value: string) => {
    setCreateDeviceInput(value);
    setCreateDeviceError(null);

    const trimmed = value.trim();
    if (!trimmed) {
      setCreateDevicePreview(null);
      return;
    }

    const batchIds = parseDeviceRange(trimmed);
    if (batchIds && batchIds.length > 0) {
      setCreateDevicePreview(batchIds);
    } else {
      setCreateDevicePreview(null);
    }
  };

  const handleConfirmCreateDevice = async () => {
    const raw = createDeviceInput.trim();
    if (!raw) {
      setCreateDeviceError('请输入设备ID或范围');
      return;
    }

    const batchIds = parseDeviceRange(raw);

    // 单个设备：直接打开添加数据弹窗
    if (!batchIds) {
      setShowCreateDeviceDialog(false);
      setFormData({
        ...formData,
        deviceId: raw,
      });
      setShowAddForm(true);
      return;
    }

    setIsCreatingDevices(true);
    try {
      for (const id of batchIds) {
        await saveToCache(taskId, id, []);
      }
      await updateCacheStats();
      await fetchDevices();

      const firstId = batchIds[0];
      setSelectedDeviceId(firstId);
      setRenderDeviceIds((prev) =>
        prev.includes(firstId) ? prev : [...prev, firstId]
      );

      setShowCreateDeviceDialog(false);
      setAlert({
        isOpen: true,
        message: `已在本地缓存中创建 ${batchIds.length} 个设备，占位成功。请选择设备后添加具体数据。`,
        type: 'success',
      });
    } catch (error) {
      console.error('批量创建设备失败:', error);
      setCreateDeviceError('批量创建设备失败，请重试');
    } finally {
      setIsCreatingDevices(false);
    }
  };

  // 仅编辑设备SN和设备编号（不影响服务器，只保存在本地）
  const handleEditDeviceName = useCallback(
    (deviceId: string) => {
      const current = deviceNameMap[deviceId] || {};
      setEditingDeviceName({
        deviceId,
        currentName: '', // 不再使用，保留以兼容类型
        currentSn: current.sn || '',
        currentDeviceNumber: current.deviceNumber || '',
      });
    },
    [deviceNameMap]
  );

  const handleSaveDeviceName = useCallback(() => {
    if (!editingDeviceName) return;
    const nextSn = editingDeviceName.currentSn.trim();
    const nextDeviceNumber = editingDeviceName.currentDeviceNumber.trim();
    const nextMap = { ...deviceNameMap };
    if (nextSn || nextDeviceNumber) {
      nextMap[editingDeviceName.deviceId] = {
        ...(nextSn ? { sn: nextSn } : {}),
        ...(nextDeviceNumber ? { deviceNumber: nextDeviceNumber } : {}),
      };
    } else {
      delete nextMap[editingDeviceName.deviceId];
    }
    persistDeviceNameMap(nextMap);
    setEditingDeviceName(null);
  }, [editingDeviceName, deviceNameMap, persistDeviceNameMap]);

  // 删除整台设备的数据（服务器 + 本地缓存）
  const handleDeleteDevice = useCallback(
    async (deviceId: string) => {
      try {
        const res = await fetch(
          `/api/tasks/${taskId}/data?deviceId=${encodeURIComponent(deviceId)}`,
          { method: 'DELETE' }
        );

        if (!res.ok) {
          const result = await res.json().catch(() => ({}));
          throw new Error(result.error || '删除设备数据失败');
        }

        // 清理本地缓存中的该设备数据
        await saveToCache(taskId, deviceId, []);
        await updateCacheStats();

        setDevices((prev) => prev.filter((d) => d.deviceId !== deviceId));
        setRenderDeviceIds((prev) => prev.filter((id) => id !== deviceId));
        setCachedDeviceIds((prev) => prev.filter((id) => id !== deviceId));
        setCachedCounts((prev) => {
          const next = { ...prev };
          delete next[deviceId];
          return next;
        });
        setDeviceDataMap((prev) => {
          const next = { ...prev };
          delete next[deviceId];
          return next;
        });

        if (selectedDeviceId === deviceId) {
          const nextDevices = devices.filter((d) => d.deviceId !== deviceId);
          const nextSelected = nextDevices[0]?.deviceId ?? null;
          setSelectedDeviceId(nextSelected);
          if (!nextSelected) {
            setData([]);
          }
        }
      } catch (error: any) {
        console.error('删除设备失败:', error);
        setAlert({
          isOpen: true,
          message: error.message || '删除设备失败',
          type: 'error',
        });
      } finally {
        setDeleteDeviceId(null);
      }
    },
    [
      taskId,
      selectedDeviceId,
      devices,
      updateCacheStats,
      setAlert,
      setDevices,
      setRenderDeviceIds,
      setCachedDeviceIds,
      setCachedCounts,
      setDeviceDataMap,
    ]
  );

  const logImportStep = (...args: any[]) => {
    console.info('[Import]', ...args);
  };

  const handleEdit = (item: TemperatureHumidityData) => {
    setEditingData(item);
    setFormData({
      deviceId: item.deviceId,
      temperature: item.temperature.toString(),
      humidity: item.humidity.toString(),
      timestamp: new Date(item.timestamp).toISOString().slice(0, 16),
    });
    setShowAddForm(true);
  };

  const handleDelete = async (item: TemperatureHumidityData) => {
    if (!confirm('确定要删除这条数据吗？')) return;

    try {
      const res = await fetch(
        `/api/tasks/${taskId}/data?deviceId=${item.deviceId}&timestamp=${item.timestamp}`,
        { method: 'DELETE' }
      );

      if (res.ok) {
        // 从缓存中删除
        const currentData = (await loadFromCache(taskId, item.deviceId)) || [];
        const updatedData = currentData.filter(
          (d) => d.timestamp !== item.timestamp
        );
        await saveToCache(taskId, item.deviceId, updatedData);
        await updateCacheStats();
        applyDeviceDataUpdate(item.deviceId, updatedData);

        await fetchDevices();
        setAlert({ isOpen: true, message: '删除成功', type: 'success' });
      } else {
        const result = await res.json();
        setAlert({ isOpen: true, message: result.error || '删除失败', type: 'error' });
      }
    } catch (error) {
      setAlert({ isOpen: true, message: '删除失败', type: 'error' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.deviceId || !formData.temperature || !formData.humidity || !formData.timestamp) {
      setAlert({ isOpen: true, message: '请填写所有字段', type: 'warning' });
      return;
    }

    try {
      const res = await fetch(`/api/tasks/${taskId}/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: formData.deviceId,
          temperature: parseFloat(formData.temperature),
          humidity: parseFloat(formData.humidity),
          timestamp: new Date(formData.timestamp).toISOString(),
        }),
      });

      if (res.ok) {
        const newData: TemperatureHumidityData = {
          taskId,
          deviceId: formData.deviceId,
          temperature: parseFloat(formData.temperature),
          humidity: parseFloat(formData.humidity),
          timestamp: new Date(formData.timestamp).toISOString(),
        };

        // 保存到缓存
        const currentData = (await loadFromCache(taskId, formData.deviceId)) || [];
        const updatedData = editingData
          ? currentData.map((item) =>
              item.timestamp === editingData.timestamp ? newData : item
            )
          : [...currentData, newData];
        // 按时间排序
        updatedData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        await saveToCache(taskId, formData.deviceId, updatedData);
        await updateCacheStats();
        applyDeviceDataUpdate(formData.deviceId, updatedData);

        if (!renderDeviceIds.includes(formData.deviceId)) {
          setRenderDeviceIds((prev) =>
            prev.includes(formData.deviceId) ? prev : [...prev, formData.deviceId]
          );
        }
        if (selectedDeviceId !== formData.deviceId) {
          setSelectedDeviceId(formData.deviceId);
        }

        setShowAddForm(false);
        setEditingData(null);
        setFormData({
          deviceId: '',
          temperature: '',
          humidity: '',
          timestamp: new Date().toISOString().slice(0, 16),
        });
        await fetchDevices();
        setAlert({ isOpen: true, message: '保存成功', type: 'success' });
      } else {
        const result = await res.json();
        setAlert({ isOpen: true, message: result.error || '保存失败', type: 'error' });
      }
    } catch (error) {
      setAlert({ isOpen: true, message: '保存失败', type: 'error' });
    }
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingData(null);
    setFormData({
      deviceId: '',
      temperature: '',
      humidity: '',
      timestamp: new Date().toISOString().slice(0, 16),
    });
  };

  // 解析时间字符串，自适应多种格式
  const parseTimestamp = (value: any): Date | null => {
    if (!value) return null;
    
    // 如果是 Date 对象
    if (value instanceof Date) {
      return value;
    }
    
    // 如果是数字（可能是 Excel 日期序列号或时间戳）
    if (typeof value === 'number') {
      // Excel 日期序列号（1900年1月1日为1），支持带小数的时间部分
      // 例如：45777.6548611111 表示 2025-04-15 15:43:00
      if (value > 1 && value < 1000000) {
        // Excel 日期序列号转换为 JavaScript Date
        // Excel 的基准日期是 1900-01-01，但 JavaScript 的 Date 对象认为 1899-12-30 是基准
        const excelEpoch = new Date(1899, 11, 30);
        // 整数部分是天数，小数部分是时间（0.5 = 12小时）
        const days = Math.floor(value);
        const timeFraction = value - days;
        const milliseconds = days * 24 * 60 * 60 * 1000 + timeFraction * 24 * 60 * 60 * 1000;
        return new Date(excelEpoch.getTime() + milliseconds);
      }
      // Unix 时间戳（秒）
      if (value < 10000000000) {
        return new Date(value * 1000);
      }
      // Unix 时间戳（毫秒）
      return new Date(value);
    }
    
    // 如果是字符串，可能是数字字符串（Excel日期序列号）
    const str = String(value).trim();
    if (!str) return null;
    
    // 检查是否是数字字符串（可能是Excel日期序列号）
    const numValue = parseFloat(str);
    if (!isNaN(numValue) && numValue > 1 && numValue < 1000000) {
      // 可能是Excel日期序列号的字符串形式
      const excelEpoch = new Date(1899, 11, 30);
      const days = Math.floor(numValue);
      const timeFraction = numValue - days;
      const milliseconds = days * 24 * 60 * 60 * 1000 + timeFraction * 24 * 60 * 60 * 1000;
      return new Date(excelEpoch.getTime() + milliseconds);
    }
    
    // 尝试多种日期格式
    const formats = [
      /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/, // 2024-01-01 12:00:00
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO 格式
      /^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}$/, // 2024/01/01 12:00:00
      /^\d{4}-\d{2}-\d{2}$/, // 2024-01-01
      /^\d{4}\/\d{2}\/\d{2}$/, // 2024/01/01
    ];
    
    for (const format of formats) {
      if (format.test(str)) {
        const date = new Date(str);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
    
    // 最后尝试直接解析
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      return date;
    }
    
    return null;
  };

  // 处理文件选择
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setShowImportMenu(false);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];

      if (jsonData.length === 0) {
        setAlert({ isOpen: true, message: '文件为空或格式不正确', type: 'error' });
        return;
      }

      setImportData(jsonData);
      setImportStep('mapping');
      setShowImportDialog(true);
    } catch (error) {
      console.error('文件解析失败:', error);
      setAlert({ isOpen: true, message: '文件解析失败，请确保文件格式正确', type: 'error' });
    }
  };

  // 处理导入提交
  const handleImportSubmit = async () => {
    if (isImporting) {
      return;
    }

    if (!columnMapping.deviceId || !columnMapping.temperature || !columnMapping.humidity || !columnMapping.timestamp) {
      setAlert({ isOpen: true, message: '请选择所有必需的列映射', type: 'warning' });
      return;
    }

    if (importData.length === 0) {
      setAlert({ isOpen: true, message: '数据行数不足', type: 'error' });
      return;
    }

    // 获取列索引 - 使用更宽松的匹配方式
    const firstRow = importData[0];
    
    // 辅助函数：标准化值用于比较（去除空格，统一类型）
    const normalizeValue = (val: any): string => {
      return String(val || '').trim();
    };
    
    const findColumnIndex = (mappingValue: string, row: any[]): number => {
      const normalizedMapping = normalizeValue(mappingValue);
      for (let i = 0; i < row.length; i++) {
        if (normalizeValue(row[i]) === normalizedMapping) {
          return i;
        }
      }
      return -1;
    };
    
    const deviceIndex = findColumnIndex(columnMapping.deviceId, firstRow);
    const tempIndex = findColumnIndex(columnMapping.temperature, firstRow);
    const humidityIndex = findColumnIndex(columnMapping.humidity, firstRow);
    const timestampIndex = findColumnIndex(columnMapping.timestamp, firstRow);

    // 详细的错误提示
    const missingColumns: string[] = [];
    if (deviceIndex === -1) missingColumns.push(`设备ID (选择的列: "${columnMapping.deviceId}")`);
    if (tempIndex === -1) missingColumns.push(`温度 (选择的列: "${columnMapping.temperature}")`);
    if (humidityIndex === -1) missingColumns.push(`湿度 (选择的列: "${columnMapping.humidity}")`);
    if (timestampIndex === -1) missingColumns.push(`时间 (选择的列: "${columnMapping.timestamp}")`);

    if (missingColumns.length > 0) {
      setAlert({ 
        isOpen: true, 
        message: `列映射无效：无法在表头中找到以下列：\n${missingColumns.join('\n')}\n\n表头内容：${firstRow.map((col, idx) => `第${idx + 1}列="${normalizeValue(col)}"`).join(', ')}\n\n请检查选择的列名是否与表头完全匹配（包括空格）。`, 
        type: 'error' 
      });
      return;
    }

    // 判断第一行是否为表头：检查温度列第一行是否为数值类型
    const firstRowTempValue = importData[0][tempIndex];
    const isFirstRowHeader = typeof firstRowTempValue === 'string' || 
                             (typeof firstRowTempValue === 'number' && isNaN(firstRowTempValue)) ||
                             firstRowTempValue === null ||
                             firstRowTempValue === undefined ||
                             String(firstRowTempValue).trim() === '';

    // 确定数据起始行
    const dataStartRow = isFirstRowHeader ? 1 : 0;

    if (importData.length <= dataStartRow) {
      setAlert({ isOpen: true, message: '数据行数不足', type: 'error' });
      return;
    }

    setIsImporting(true);
    const totalRows = Math.max(importData.length - dataStartRow, 0);
    logImportStep('start', { totalRows, dataStartRow, mapping: columnMapping });
    setImportProgress({
      stage: '解析中',
      processed: 0,
      total: totalRows,
    });
    try {
      // 解析数据
      const parsedData: Array<{
        deviceId: string;
        temperature: number;
        humidity: number;
        timestamp: string;
      }> = [];

      for (let i = dataStartRow; i < importData.length; i++) {
        const row = importData[i];
        const deviceId = String(row[deviceIndex] || '').trim();
        const tempValue = row[tempIndex];
        const humidityValue = row[humidityIndex];
        const timestampValue = row[timestampIndex];

        if (!deviceId || tempValue === undefined || tempValue === null || humidityValue === undefined || humidityValue === null || !timestampValue) {
          continue; // 跳过空行
        }

        // 转换温湿度为带一位小数的浮点数
        const temperature = parseFloat(String(tempValue));
        const humidity = parseFloat(String(humidityValue));

        if (isNaN(temperature) || isNaN(humidity)) {
          continue; // 跳过无效数据
        }

        // 保留一位小数
        const temperatureRounded = Math.round(temperature * 10) / 10;
        const humidityRounded = Math.round(humidity * 10) / 10;

        // 解析时间
        const timestamp = parseTimestamp(timestampValue);
        if (!timestamp) {
          continue; // 跳过无效时间
        }

        parsedData.push({
          deviceId,
          temperature: temperatureRounded,
          humidity: humidityRounded,
          timestamp: timestamp.toISOString(),
        });

        // 更新进度（每 200 行刷新一次，避免频繁 setState）
        const processed = parsedData.length;
        if (processed % 200 === 0 || processed === totalRows) {
          setImportProgress({
            stage: '解析中',
            processed,
            total: Math.max(totalRows, processed),
          });
          if (processed % 2000 === 0 || processed === totalRows) {
            logImportStep('parsing', { processed, total: totalRows });
          }
        }
      }

      if (parsedData.length === 0) {
        logImportStep('parsed empty');
        setAlert({ isOpen: true, message: '没有有效数据可导入', type: 'warning' });
        return;
      }

      logImportStep('parsed done', { validRows: parsedData.length });

      // 将数据添加到缓存（不上传服务器）
      try {
        const dataWithTaskId: CacheData[] = parsedData.map((item) => ({
          ...item,
          taskId,
        }));

        // 先按设备分组，一次性合并写入，避免 addToCache 内部频繁读写导致卡顿
        const grouped = dataWithTaskId.reduce<Map<string, CacheData[]>>((map, item) => {
          const list = map.get(item.deviceId) || [];
          list.push(item);
          map.set(item.deviceId, list);
          return map;
        }, new Map());

        setImportProgress({
          stage: '写入缓存…',
          processed: 0,
          total: grouped.size,
        });

        const yieldToUI = async () => {
          await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        };
        await yieldToUI();

        logImportStep('write per device start', {
          deviceCount: grouped.size,
          totalRows: dataWithTaskId.length,
        });

        let processedDevices = 0;
        for (const [deviceId, deviceRows] of grouped.entries()) {
          const t0 = performance.now();
          logImportStep('write device start', {
            deviceId,
            newRows: deviceRows.length,
          });

          // 读取已缓存数据并合并
          const existingData = (await loadFromCache(taskId, deviceId)) || [];
          const merged = [...existingData, ...deviceRows].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );

          await saveToCache(taskId, deviceId, merged);

          const t1 = performance.now();
          processedDevices += 1;
          setImportProgress({
            stage: '写入缓存…',
            processed: processedDevices,
            total: grouped.size,
          });
          logImportStep('write device done', {
            deviceId,
            newRows: deviceRows.length,
            existingRows: existingData.length,
            mergedRows: merged.length,
            processedDevices,
            totalDevices: grouped.size,
            durationMs: Math.round(t1 - t0),
          });
          await yieldToUI();
        }

        logImportStep('write cache done');

        setImportProgress({
          stage: '刷新界面…',
          processed: grouped.size,
          total: grouped.size,
        });
        await updateCacheStats();

        // 更新设备列表（从缓存获取）
        await fetchDevices();
        const affectedDeviceIds = Array.from(new Set(parsedData.map((item) => item.deviceId)));
        for (const deviceId of affectedDeviceIds) {
          const cachedDataForDevice = await loadFromCache(taskId, deviceId);
          if (cachedDataForDevice) {
            applyDeviceDataUpdate(deviceId, cachedDataForDevice);
          }
        }
        
        // 如果当前选中的设备有导入的数据，更新状态
        if (selectedDeviceId) {
          const cachedData = await loadFromCache(taskId, selectedDeviceId);
          if (cachedData) {
            applyDeviceDataUpdate(selectedDeviceId, cachedData);
          }
        } else {
          // 如果没有选中设备，自动选择第一个设备
          const cachedDevices = await getCachedDevices(taskId);
          if (cachedDevices.length > 0) {
            const firstId = cachedDevices[0];
            setSelectedDeviceId(firstId);
            setRenderDeviceIds((prev) => (prev.includes(firstId) ? prev : [...prev, firstId]));
          }
        }

        setShowImportDialog(false);
        setImportStep('file');
        setImportFile(null);
        setImportData([]);
        setColumnMapping({
          deviceId: '',
          temperature: '',
          humidity: '',
          timestamp: '',
        });
        setAlert({
          isOpen: true,
          message: `成功导入 ${parsedData.length} 条数据到本地缓存，请点击"保存到服务器"按钮上传`,
          type: 'success',
        });
      } catch (error) {
        setAlert({ isOpen: true, message: '导入失败', type: 'error' });
      }
    } finally {
      setIsImporting(false);
      setImportProgress({ stage: '', processed: 0, total: 0 });
    }
  };

  // 取消导入
  const handleImportCancel = () => {
    setShowImportDialog(false);
    setImportStep('file');
    setImportFile(null);
    setImportData([]);
    setColumnMapping({
      deviceId: '',
      temperature: '',
      humidity: '',
      timestamp: '',
    });
  };

  // 处理趋势生成器生成的数据
  const handleTrendGeneratorData = async (generatedData: TemperatureHumidityData[], deviceId: string) => {
    try {
      const dataWithTaskId: CacheData[] = generatedData.map((item) => ({
        ...item,
        taskId,
      }));
      await addToCache(taskId, dataWithTaskId);
      await updateCacheStats();

      // 更新设备列表
      await fetchDevices();
      
      // 更新受影响设备的数据
      const cachedDataForDevice = await loadFromCache(taskId, deviceId);
      if (cachedDataForDevice) {
        applyDeviceDataUpdate(deviceId, cachedDataForDevice);
      }

      // 如果当前选中的设备有生成的数据，更新状态
      if (selectedDeviceId === deviceId) {
        const cachedData = await loadFromCache(taskId, selectedDeviceId);
        if (cachedData) {
          applyDeviceDataUpdate(selectedDeviceId, cachedData);
        }
      } else {
        // 如果没有选中设备或选中的不是当前设备，自动选择生成的设备
        setSelectedDeviceId(deviceId);
        setRenderDeviceIds((prev) => (prev.includes(deviceId) ? prev : [...prev, deviceId]));
      }

      setAlert({
        isOpen: true,
        message: `成功生成 ${generatedData.length} 条数据到本地缓存，请点击"保存到服务器"按钮上传`,
        type: 'success',
      });
    } catch (error) {
      setAlert({ isOpen: true, message: '生成数据失败', type: 'error' });
    }
  };

  // 上传前先提示备份信息
  const handleUploadClick = async () => {
    if (uploadProgress.isUploading || isCreatingBackup) {
      return;
    }

    const allCachedData = await getAllCachedData(taskId);
    
    if (allCachedData.length === 0) {
      setAlert({ isOpen: true, message: '没有需要上传的缓存数据', type: 'warning' });
      return;
    }

    pendingUploadDataRef.current = allCachedData;
    setPendingUploadCount(allCachedData.length);
    setBackupRemark(DEFAULT_BACKUP_REMARK);
    setShowBackupPrompt(true);
  };

  const handleBackupPromptCancel = () => {
    setShowBackupPrompt(false);
    setBackupRemark(DEFAULT_BACKUP_REMARK);
    setPendingUploadCount(0);
    pendingUploadDataRef.current = null;
  };

  const handleBackupPromptConfirm = async () => {
    const cachedData = pendingUploadDataRef.current;
    if (!cachedData || cachedData.length === 0) {
      setAlert({ isOpen: true, message: '没有需要上传的缓存数据', type: 'warning' });
      handleBackupPromptCancel();
      return;
    }

    setShowBackupPrompt(false);

    try {
      await performUpload(cachedData, backupRemark);
    } finally {
      pendingUploadDataRef.current = null;
      setBackupRemark(DEFAULT_BACKUP_REMARK);
      setPendingUploadCount(0);
    }
  };

  const performUpload = async (
    allCachedData: TemperatureHumidityData[],
    remarkText: string
  ) => {
    if (allCachedData.length === 0) {
      setAlert({ isOpen: true, message: '没有需要上传的缓存数据', type: 'warning' });
      return;
    }

    const sanitizedRemark = (remarkText || '').trim() || DEFAULT_BACKUP_REMARK;

    setIsClearingServerData(true);
    try {
      const clearRes = await fetch(`/api/tasks/${taskId}/data`, { method: 'DELETE' });
      let clearPayload: any = {};
      try {
        clearPayload = await clearRes.json();
      } catch {
        clearPayload = {};
      }
      if (!clearRes.ok) {
        throw new Error(clearPayload.error || '清空服务器数据失败');
      }
    } catch (error: any) {
      setAlert({
        isOpen: true,
        message: error.message || '清空数据失败，已取消上传',
        type: 'error',
      });
      return;
    } finally {
      setIsClearingServerData(false);
    }

    // 分包大小（每包最多1000条数据）
    const BATCH_SIZE = 1000;
    const batches: TemperatureHumidityData[][] = [];
    
    for (let i = 0; i < allCachedData.length; i += BATCH_SIZE) {
      batches.push(allCachedData.slice(i, i + BATCH_SIZE));
    }

    setUploadProgress({
      isUploading: true,
      progress: 0,
      current: 0,
      total: batches.length,
    });

    try {
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        try {
          // 尝试压缩数据
          const jsonString = JSON.stringify(batch);
          let compressed: string | null = null;
          let useCompression = false;
          
          try {
            compressed = LZString.compress(jsonString);
            // 如果压缩后数据更小，使用压缩
            if (compressed && compressed.length < jsonString.length * 0.9) {
              useCompression = true;
            }
          } catch (e) {
            console.warn('压缩失败，使用未压缩数据:', e);
          }

          let requestBody: string;
          let headers: Record<string, string>;

          if (useCompression && compressed) {
            const base64Compressed = LZString.compressToBase64(jsonString);
            if (base64Compressed) {
              requestBody = base64Compressed;
              headers = {
                'Content-Type': 'text/plain',
                'X-Compressed': 'true',
                'X-Encoding': 'base64',
              };
            } else {
              requestBody = jsonString;
              headers = {
                'Content-Type': 'application/json',
              };
            }
          } else {
            // 使用未压缩数据
            requestBody = jsonString;
            headers = {
              'Content-Type': 'application/json',
            };
          }

          const res = await fetch(`/api/tasks/${taskId}/data`, {
            method: 'POST',
            headers,
            body: requestBody,
          });

          if (res.ok) {
            successCount += batch.length;
          } else {
            const result = await res.json();
            console.error(`批次 ${i + 1} 上传失败:`, result.error);
            failCount += batch.length;
          }
        } catch (error) {
          console.error(`批次 ${i + 1} 上传失败:`, error);
          failCount += batch.length;
        }

        setUploadProgress({
          isUploading: true,
          progress: Math.round(((i + 1) / batches.length) * 100),
          current: i + 1,
          total: batches.length,
        });
      }

      setUploadProgress({
        isUploading: false,
        progress: 100,
        current: batches.length,
        total: batches.length,
      });

      let finalMessage =
        failCount === 0
          ? `成功上传 ${successCount} 条数据到服务器`
          : `上传完成：成功 ${successCount} 条，失败 ${failCount} 条`;
      let finalType: 'success' | 'warning' = failCount === 0 ? 'success' : 'warning';

      setIsPostUploadBackup(true);
      try {
        await createBackup(sanitizedRemark);
        finalMessage += '，已生成备份';
      } catch (error: any) {
        finalType = 'warning';
        finalMessage += `，但备份失败：${error.message || '未知错误'}`;
      } finally {
        setIsPostUploadBackup(false);
      }

      setAlert({
        isOpen: true,
        message: finalMessage,
        type: finalType,
      });
    } catch (error) {
      setUploadProgress({
        isUploading: false,
        progress: 0,
        current: 0,
        total: 0,
      });
      setIsPostUploadBackup(false);
      setAlert({ isOpen: true, message: '上传失败', type: 'error' });
    }
  };

  // 清理缓存
  const handleClearCache = async () => {
    if (isClearingCache) return;
    setIsClearingCache(true);
    try {
      await clearTaskCache(taskId);
      await updateCacheStats();
      setCachedDeviceIds([]);
      setCachedCounts({});
      setDevices([]);
      setRenderDeviceIds([]);
      setDeviceDataMap({});
      setSelectionPreviewIds([]);
      setSelectionPreviewMode(null);
      setSelectedDeviceId(null);
      setData([]);
      setAlert({ isOpen: true, message: '缓存已清理', type: 'success' });
      setShowClearConfirm(false);
    } catch (error) {
      setAlert({ isOpen: true, message: '清理缓存失败', type: 'error' });
    } finally {
      setIsClearingCache(false);
    }
  };

  // 准备多设备图表数据
  const rawChartSeriesData = useMemo(
    () =>
      renderDeviceIds.map((deviceId) => {
        const dataset = deviceDataMap[deviceId] || [];
        return {
          deviceId,
          points: dataset
            .map((item) => ({
              timestamp: new Date(item.timestamp).getTime(),
              temperature: item.temperature,
              humidity: item.humidity,
            }))
            .filter(
              (point) =>
                Number.isFinite(point.temperature) && Number.isFinite(point.humidity)
            ),
        };
      }),
    [renderDeviceIds, deviceDataMap]
  );

  const aggregateSeriesPoints = useCallback(
    (points: ChartPoint[], range: { min: number; max: number } | null, valueKey: 'temperature' | 'humidity') => {
      if (points.length === 0) {
        return [];
      }

      const defaultMin = points[0].timestamp;
      const defaultMax = points[points.length - 1].timestamp;
      if (defaultMax <= defaultMin) {
        return points;
      }

      const viewMin = range?.min ?? defaultMin;
      const viewMax = range?.max ?? defaultMax;
      const clampedMin = Math.max(defaultMin, Math.min(viewMin, defaultMax));
      const clampedMax = Math.min(defaultMax, Math.max(viewMax, defaultMin));
      const effectiveMin = Math.min(clampedMin, clampedMax);
      const effectiveMax = Math.max(clampedMin, clampedMax);
      const visiblePoints = points.filter(
        (point) => point.timestamp >= effectiveMin && point.timestamp <= effectiveMax
      );
      const fallbackPoints = visiblePoints.length > 0 ? visiblePoints : points;
      const rangeDuration = Math.max(effectiveMax - effectiveMin, 1);

      if (
        rangeDuration <= DETAIL_RANGE_THRESHOLD_MS ||
        fallbackPoints.length <= MAX_CHART_POINTS
      ) {
        return fallbackPoints;
      }

      const bucketDuration = Math.max(
        Math.floor(rangeDuration / Math.max(1, MAX_CHART_POINTS / 2)),
        MIN_BUCKET_DURATION_MS
      );
      const buckets = new Map<number, { minPoint: ChartPoint; maxPoint: ChartPoint }>();

      fallbackPoints.forEach((point) => {
        const bucketIndex = Math.floor((point.timestamp - effectiveMin) / bucketDuration);
        const bucket = buckets.get(bucketIndex);
        if (!bucket) {
          buckets.set(bucketIndex, { minPoint: point, maxPoint: point });
          return;
        }
        if (point[valueKey] < bucket.minPoint[valueKey]) {
          bucket.minPoint = point;
        }
        if (point[valueKey] > bucket.maxPoint[valueKey]) {
          bucket.maxPoint = point;
        }
      });

      return Array.from(buckets.keys())
        .sort((a, b) => a - b)
        .flatMap((bucketKey) => {
          const bucket = buckets.get(bucketKey)!;
          if (bucket.minPoint.timestamp === bucket.maxPoint.timestamp) {
            return [bucket.minPoint];
          }
          return bucket.minPoint.timestamp < bucket.maxPoint.timestamp
            ? [bucket.minPoint, bucket.maxPoint]
            : [bucket.maxPoint, bucket.minPoint];
        });
    },
    []
  );

  const chartSeriesData = useMemo(
    () =>
      rawChartSeriesData.map((series) => ({
        ...series,
        points: aggregateSeriesPoints(
          series.points,
          chartRange,
          activeTab === 'temperature' ? 'temperature' : 'humidity'
        ),
      })),
    [rawChartSeriesData, aggregateSeriesPoints, chartRange, activeTab]
  );

  const hasChartData = chartSeriesData.some((series) => series.points.length > 0);
const collectSelectionData = useCallback(
    (range: { start: number; end: number } | null, deviceIdFilter: string | null = null) => {
      if (!range) return [];
      const { start, end } = range;
      if (end <= start) return [];
      return renderDeviceIds.flatMap((deviceId) => {
        if (deviceIdFilter && deviceId !== deviceIdFilter) {
          return [];
        }
        const dataset = deviceDataMap[deviceId] || [];
        return dataset.filter((item) => {
          const timestamp = new Date(item.timestamp).getTime();
          return timestamp >= start && timestamp <= end;
        });
      });
    },
    [renderDeviceIds, deviceDataMap]
  );
  const renderDeviceSet = useMemo(() => new Set(renderDeviceIds), [renderDeviceIds]);
  const selectionPreviewSet = useMemo(() => new Set(selectionPreviewIds), [selectionPreviewIds]);
  const loadingDeviceSet = useMemo(() => new Set(loadingDeviceIds), [loadingDeviceIds]);
  const isAnyDeviceLoading = loadingDeviceIds.length > 0;
  const singleCopiedDeviceId = useMemo(
    () => (copiedSelectionMeta?.isSingleDevice ? copiedSelectionMeta.deviceIds[0] : null),
    [copiedSelectionMeta]
  );

  const isRangeEqual = useCallback(
    (a: { min: number; max: number } | null, b: { min: number; max: number } | null) => {
      if (a === b) return true;
      if (!a || !b) return false;
      return Math.round(a.min) === Math.round(b.min) && Math.round(a.max) === Math.round(b.max);
    },
    []
  );

  const handleAfterSetExtremes = useCallback(
    (event: Highcharts.AxisSetExtremesEventObject) => {
      if (typeof event.min === 'number' && typeof event.max === 'number') {
        const nextRange = { min: event.min, max: event.max };
        if (isRangeEqual(chartRangeRef.current, nextRange)) {
          return;
        }
        chartRangeRef.current = nextRange;
        setChartRange(nextRange);
      } else {
        if (isRangeEqual(chartRangeRef.current, null)) {
          return;
        }
        chartRangeRef.current = null;
        setChartRange(null);
      }
    },
    [isRangeEqual]
  );

  const handleChartSelection = useCallback(
    (event: Highcharts.SelectEventObject) => {
      const selectedXAxis = event.xAxis?.[0];
      if (selectedXAxis && typeof selectedXAxis.min === 'number' && typeof selectedXAxis.max === 'number') {
        const start = Math.min(selectedXAxis.min, selectedXAxis.max);
        const end = Math.max(selectedXAxis.min, selectedXAxis.max);
        setSelectionRange({ start, end });
        console.log(
          '[TaskDataPage] 曲线选中时间范围:',
          new Date(start).toISOString(),
          '-',
          new Date(end).toISOString()
        );
      }
      return false;
    },
    []
  );

  const handleClearSelection = useCallback(() => {
    setSelectionRange(null);
  }, []);

  const handleCopySelection = useCallback(
    async (deviceIdFilter: string | null = null) => {
      if (!selectionRange) {
        setAlert({ isOpen: true, message: '请先框选时间范围', type: 'info' });
        return;
      }
      const selectedData = collectSelectionData(selectionRange, deviceIdFilter);
      if (selectedData.length === 0) {
        setAlert({ isOpen: true, message: '选中范围内没有数据', type: 'warning' });
        return;
      }
      setCopiedSelectionData(selectedData);
      const perDeviceMinTimestamp = selectedData.reduce<Record<string, number>>((acc, item) => {
        const ts = new Date(item.timestamp).getTime();
        if (!acc[item.deviceId] || ts < acc[item.deviceId]) {
          acc[item.deviceId] = ts;
        }
        return acc;
      }, {});
      const deviceIds = Object.keys(perDeviceMinTimestamp);
      setCopiedSelectionMeta({
        deviceIds,
        perDeviceMinTimestamp,
        isSingleDevice: deviceIds.length === 1,
      });
      setSelectionRange(null);
      try {
        await navigator?.clipboard?.writeText(JSON.stringify(selectedData, null, 2));
        setAlert({
          isOpen: true,
          message: `已复制 ${selectedData.length} 条数据到剪贴板`,
          type: 'success',
        });
      } catch {
        setAlert({
          isOpen: true,
          message: `选中 ${selectedData.length} 条数据，可右键粘贴到缓存`,
          type: 'success',
        });
      }
    },
    [selectionRange, collectSelectionData]
  );

  const handleComputeAverage = useCallback(
    (deviceIdFilter: string | null = null) => {
      if (!selectionRange) {
        setAlert({ isOpen: true, message: '请先框选时间范围', type: 'info' });
        return;
      }
      const selectedData = collectSelectionData(selectionRange, deviceIdFilter);
      if (selectedData.length === 0) {
        setAlert({ isOpen: true, message: '选中范围内没有数据'+JSON.stringify(selectionRange), type: 'warning' });
        return;
      }
      const avgTemperature =
        selectedData.reduce((sum, item) => sum + (item.temperature ?? 0), 0) / selectedData.length;
      const avgHumidity =
        selectedData.reduce((sum, item) => sum + (item.humidity ?? 0), 0) / selectedData.length;
      setAlert({
        isOpen: true,
        message: `平均温度 ${avgTemperature.toFixed(2)}°C，平均湿度 ${avgHumidity.toFixed(2)}%（共 ${selectedData.length} 条）`,
        type: 'info',
      });
    },
    [selectionRange, collectSelectionData]
  );

  const handlePasteSelection = useCallback(
    async ({
      deviceIdFilter,
      targetTimestamp,
    }: {
      deviceIdFilter: string | null;
      targetTimestamp: number | null;
    }) => {
      if (!copiedSelectionData || copiedSelectionData.length === 0) {
        setContextMenuState(null);
        return;
      }
      if (targetTimestamp === null || !Number.isFinite(targetTimestamp)) {
        setAlert({
          isOpen: true,
          message: '无法确定粘贴位置，请重试',
          type: 'error',
        });
        setContextMenuState(null);
        return;
      }

      const dataToUse = deviceIdFilter
        ? copiedSelectionData.filter((item) => item.deviceId === deviceIdFilter)
        : copiedSelectionData;

      if (dataToUse.length === 0) {
        setAlert({
          isOpen: true,
          message: '复制的数据中没有匹配当前曲线的记录',
          type: 'warning',
        });
        setContextMenuState(null);
        return;
      }

      try {
        const groupedByDevice = dataToUse.reduce<Record<string, TemperatureHumidityData[]>>(
          (acc, item) => {
            if (!acc[item.deviceId]) acc[item.deviceId] = [];
            acc[item.deviceId].push(item);
            return acc;
          },
          {}
        );

        let totalPasted = 0;

        for (const [deviceId, records] of Object.entries(groupedByDevice)) {
          const baseTimestamp =
            copiedSelectionMeta?.perDeviceMinTimestamp?.[deviceId] ??
            Math.min(...records.map((item) => new Date(item.timestamp).getTime()));
          const sortedRecords = [...records].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          const shiftedRecords = sortedRecords.map((item, index) => {
            const originalTs = new Date(item.timestamp).getTime();
            const offset = Math.max(originalTs - baseTimestamp, 0);
            const nextTimestamp = targetTimestamp + offset + 1 + index;
            return {
              ...item,
              taskId,
              timestamp: new Date(nextTimestamp).toISOString(),
            };
          });

          const existingData = (await loadFromCache(taskId, deviceId)) || [];
          const trimmedExisting = existingData.filter(
            (record) => new Date(record.timestamp).getTime() < targetTimestamp
          );
          const mergedData = [...trimmedExisting, ...shiftedRecords].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          await saveToCache(taskId, deviceId, mergedData);
          applyDeviceDataUpdate(deviceId, mergedData);
          totalPasted += shiftedRecords.length;
        }

        await updateCacheStats();
        await fetchDevices();

        setAlert({
          isOpen: true,
          message: `已粘贴 ${totalPasted} 条数据到本地缓存`,
          type: 'success',
        });
      } catch (error) {
        console.error('粘贴数据失败:', error);
        setAlert({
          isOpen: true,
          message: '粘贴失败，请重试',
          type: 'error',
        });
      } finally {
        setContextMenuState(null);
      }
    },
    [copiedSelectionData, copiedSelectionMeta, taskId, updateCacheStats, fetchDevices, applyDeviceDataUpdate]
  );

  const highchartsOptions = useMemo<Highcharts.Options>(() => {
    const isTemperature = activeTab === 'temperature';
    const valueKey: 'temperature' | 'humidity' = isTemperature ? 'temperature' : 'humidity';
    const valueSuffix = isTemperature ? ' °C' : ' %';
    const axisLabel = isTemperature ? '温度 (°C)' : '湿度 (%)';
    return {
      chart: {
        type: 'spline',
        backgroundColor: 'transparent',
        height: null,
        spacing: [8, 12, 8, 12],
        zooming: {
          type: 'x',
          mouseWheel: {
            enabled: false,
          },
        },
        panning: {
          enabled: true,
          type: 'x',
        },
        animation: false,
        events: {
          selection: handleChartSelection,
        },
      },
      title: { text: undefined },
      xAxis: {
        type: 'datetime',
        title: { text: '时间' },
        events: {
          afterSetExtremes: handleAfterSetExtremes,
        },
      },
      yAxis: {
        title: { text: axisLabel },
      },
      tooltip: {
        xDateFormat: '%Y-%m-%d %H:%M',
        valueSuffix,
        shared: true,
      },
      legend: { enabled: true },
      credits: { enabled: false },
      scrollbar: {
        enabled: true,
        height: 12,
      },
      navigator: {
        enabled: true,
        height: 48,
        margin: 12,
        maskFill: 'rgba(59, 130, 246, 0.15)',
        outlineColor: '#e5e7eb',
        handles: {
          backgroundColor: '#3b82f6',
          borderColor: '#1d4ed8',
        },
      },
      rangeSelector: {
        enabled: false,
      },
      series: chartSeriesData
        .filter((series) => series.points.length > 0)
        .map((series, index) => ({
          type: 'spline',
          name: `${series.deviceId}`,
          color: CHART_COLOR_PALETTE[index % CHART_COLOR_PALETTE.length],
          data: series.points.map((point) => [point.timestamp, point[valueKey]]),
        })),
      accessibility: {
        enabled: false,
      },
    };
  }, [activeTab, chartSeriesData, renderDeviceIds, handleAfterSetExtremes, handleChartSelection]);

  return (
    <Layout>
      <div className="h-[calc(100vh-4rem)] flex flex-col">
        {/* 头部 */}
        <div className="bg-white border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/tasks')}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-800">
                  {task ? `${task.taskNumber} - ${task.taskName}` : '数据编辑'}
                </h1>
                <p className="text-sm text-gray-500 mt-1">温湿度数据管理</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 relative">
              <div className="relative">
                <button
                  onClick={() => setShowImportMenu(!showImportMenu)}
                  className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
                >
                  <Upload className="w-4 h-4" />
                  <span>导入数据</span>
                </button>
                {showImportMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setShowImportMenu(false)}
                    />
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20 border border-gray-200">
                      <div className="py-1">
                        <label className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer">
                          <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={handleFileSelect}
                            className="hidden"
                            id="import-file-input"
                          />
                          <span className="flex items-center">
                            <Upload className="w-4 h-4 mr-2" />
                            表格导入
                          </span>
                        </label>
                        <button
                          onClick={() => {
                            setShowImportMenu(false);
                            setShowTrendGenerator(true);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          趋势生成器
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={() => {
                  setEditingData(null);
                  setFormData({
                    deviceId: selectedDeviceId || '',
                    temperature: '',
                    humidity: '',
                    timestamp: new Date().toISOString().slice(0, 16),
                  });
                  setShowAddForm(true);
                }}
                className="flex items-center space-x-2 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
              >
                <Plus className="w-4 h-4" />
                <span>添加数据</span>
              </button>
            </div>
          </div>
        </div>

        {/* 主体内容 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧设备列表 / 历史数据 */}
          <div className="w-64 bg-white border-r flex flex-col">
              <div className="border-b">
                <div className="grid grid-cols-2">
                  <button
                    onClick={() => setLeftTab('devices')}
                    className={`py-3 text-sm font-medium border-b-2 ${
                      leftTab === 'devices'
                        ? 'border-primary-500 text-primary-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    设备列表
                  </button>
                  <button
                    onClick={() => setLeftTab('history')}
                    className={`py-3 text-sm font-medium border-b-2 ${
                      leftTab === 'history'
                        ? 'border-primary-500 text-primary-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    历史数据
                  </button>
                </div>
              </div>

              {leftTab === 'devices' ? (
                <>
                  <div className="p-2 flex-1 overflow-y-auto">
          
                    {devices.length === 0 ? (
                      <div className="text-center text-gray-500 py-8 text-sm">
                        暂无设备数据
                        <br />
                        <span className="text-xs">点击下方“创建设备”按钮创建</span>
                      </div>
                    ) : (
                      <div className="space-y-1 select-none">
                        {devices.map((device, index) => {
                          const isCached = cachedDeviceIds.includes(device.deviceId);
                          const isLoadingDevice = loadingDeviceSet.has(device.deviceId);
                          const isRendering = renderDeviceSet.has(device.deviceId);
                          const isFocused = selectedDeviceId === device.deviceId;
                          const isPreviewing = selectionPreviewSet.has(device.deviceId);
                          const previewClass =
                            isPreviewing && selectionPreviewMode === 'remove'
                              ? 'bg-red-50 text-red-600 border border-red-200'
                              : isPreviewing
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : '';
                          const visualStateClass = isFocused
                            ? 'bg-primary-100 text-primary-700 font-semibold'
                            : isRendering
                            ? 'bg-primary-50 text-primary-700'
                            : 'hover:bg-gray-100 text-gray-700';
                          return (
                            <div
                              key={device.deviceId}
                              onMouseDown={(event) => handleDeviceMouseDown(event as any, index)}
                              onMouseEnter={(event) => handleDeviceMouseEnter(event as any, index)}
                              onContextMenu={(event) => event.preventDefault()}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors border border-transparent cursor-pointer ${visualStateClass} ${previewClass}`}
                            >
                              <div className="flex flex-col text-left">
                                <span 
                                  className="font-medium"
                                  title={(() => {
                                    const info = deviceNameMap[device.deviceId];
                                    if (!info) return undefined;
                                    const parts: string[] = [];
                                    if (info.sn) parts.push(`SN: ${info.sn}`);
                                    if (info.deviceNumber) parts.push(`编号: ${info.deviceNumber}`);
                                    return parts.length > 0 ? parts.join('\n') : undefined;
                                  })()}
                                >
                                  {device.deviceId}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                {isLoadingDevice ? (
                                  <span
                                    className="ml-2 flex items-center text-[11px] text-primary-600"
                                    title="数据同步中"
                                  >
                                    <Loader2
                                      className="w-3.5 h-3.5 text-primary-500 shrink-0 animate-spin"
                                      strokeWidth={2}
                                      aria-hidden="true"
                                    />
                                  </span>
                                ) : (
                                  isCached && (
                                    <span
                                      className="ml-2 flex items-center text-[11px] text-green-600"
                                      title="已缓存"
                                    >
                                      <Database
                                        className="w-3 h-3 text-green-500 shrink-0 mr-0.5"
                                        strokeWidth={2}
                                        aria-hidden="true"
                                      />
                                      <span className="tabular-nums">
                                        {cachedCounts[device.deviceId] ?? 0}
                                      </span>
                                    </span>
                                  )
                                )}
                              </div>
                            </div>
                          );
                        })}
                        <div className="pt-2 space-y-1">
                          <button
                            onClick={handleOpenCreateDeviceDialog}
                            className="w-full inline-flex items-center justify-center gap-1 rounded border border-dashed border-primary-200 px-2 py-1.5 text-[11px] text-primary-600 hover:bg-primary-50"
                          >
                            <Plus className="h-3 w-3" />
                            <span>创建设备</span>
                          </button>
                          <p className="text-[11px] text-gray-400 text-center px-2">
                            左键单击或拖动加入渲染列表，右键单击/拖动可从渲染中移除。
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="border-t px-3 py-3 space-y-2 bg-gray-50">
                    <div className="text-xs text-gray-500 flex flex-col space-y-1">
                      <span>
                        缓存设备：
                        <span className="font-semibold text-gray-700">
                          {cacheStats?.deviceCount ?? 0}
                        </span>
                      </span>
                      <span>
                        缓存条数：
                        <span className="font-semibold text-gray-700">
                          {cacheStats?.totalDataCount ?? 0}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs gap-2">
                      <button
                        onClick={handleUploadClick}
                        disabled={
                          uploadProgress.isUploading ||
                          isCreatingBackup ||
                          !cacheStats ||
                          cacheStats.totalDataCount === 0
                        }
                        className="flex items-center gap-1 px-2 py-1 rounded border border-blue-100 text-blue-600 hover:bg-blue-50 disabled:text-gray-400 disabled:border-gray-200 disabled:bg-transparent transition"
                        title="将缓存中的所有数据上传并同步到服务器（同时自动创建备份）"
                      >
                        <Save className="w-3.5 h-3.5" strokeWidth={2} />
                        <span>上传</span>
                      </button>
                      <button
                        onClick={() => handleCacheAllDevices()}
                        disabled={
                          isCachingAll ||
                          isAnyDeviceLoading ||
                          uploadProgress.isUploading ||
                          devices.length === 0
                        }
                        className="flex items-center gap-1 px-2 py-1 rounded border border-amber-100 text-amber-600 hover:bg-amber-50 disabled:text-gray-400 disabled:border-gray-200 disabled:bg-transparent transition"
                        title="从服务器拉取所有设备的数据并缓存到本地"
                      >
                        {isCachingAll ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
                        ) : (
                          <Database className="w-3.5 h-3.5" strokeWidth={2} />
                        )}
                        <span>{isCachingAll ? '拉取中…' : '拉取'}</span>
                      </button>
                      <button
                        onClick={() => setShowClearConfirm(true)}
                        disabled={
                          uploadProgress.isUploading ||
                          !cacheStats ||
                          cacheStats.totalDataCount === 0
                        }
                        className="flex items-center gap-1 px-2 py-1 rounded border border-red-100 text-red-600 hover:bg-red-50 disabled:text-gray-400 disabled:border-gray-200 disabled:bg-transparent transition"
                        title="清理当前任务的本地缓存"
                      >
                        <Trash className="w-3.5 h-3.5" strokeWidth={2} />
                        <span>清理</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col">
                  <div className="p-3 border-b flex items-center justify-between">
                    <h2 className="font-semibold text-gray-800">历史数据</h2>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={fetchBackups}
                        disabled={isBackupsLoading}
                        className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:text-gray-400 disabled:bg-transparent"
                      >
                        刷新
                      </button>
                      <button
                        onClick={handleManualBackup}
                        disabled={isCreatingBackup}
                        className="px-2 py-1 text-xs border border-primary-200 text-primary-600 rounded hover:bg-primary-50 disabled:text-gray-400 disabled:border-gray-200 disabled:bg-transparent"
                      >
                        立即备份
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
                    {isBackupsLoading ? (
                      <div className="flex flex-col items-center justify-center text-gray-500 text-sm py-8">
                        <Loader2 className="w-4 h-4 animate-spin mb-2" />
                        加载备份列表…
                      </div>
                    ) : backups.length === 0 ? (
                      <div className="text-center text-gray-500 text-sm py-8">
                        暂无历史备份
                        <br />
                        <span className="text-xs text-gray-400">上传或点击“立即备份”生成</span>
                      </div>
                    ) : (
                      backups.map((backup) => (
                        <div
                          key={backup.backupId}
                          className="bg-white border border-gray-200 rounded-md p-3 shadow-sm space-y-2"
                        >
                          <div>
                            <p className="text-sm font-semibold text-gray-800">
                              备份 {backup.backupId}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              时间：{new Date(backup.createdAt).toLocaleString('zh-CN')}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              条数：{backup.recordCount}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              设备：
                              <span
                                className="font-medium text-gray-700 ml-1"
                                title={
                                  backup.deviceIds && backup.deviceIds.length > 0
                                    ? backup.deviceIds.join(', ')
                                    : '无设备记录'
                                }
                              >
                                {backup.deviceIds?.length ?? 0} 个
                              </span>
                              <span className="text-[11px] text-gray-400 ml-1">(悬停查看)</span>
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              备注：{backup.remark || '无'}
                            </p>
                          </div>
                          <button
                            onClick={() => handleRestoreBackup(backup)}
                            disabled={isRestoringBackupId === backup.backupId || uploadProgress.isUploading}
                            className="w-full text-xs px-3 py-1.5 rounded border border-emerald-200 text-emerald-600 hover:bg-emerald-50 disabled:text-gray-400 disabled:border-gray-200 disabled:bg-transparent flex items-center justify-center gap-2"
                          >
                            {isRestoringBackupId === backup.backupId ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                恢复中…
                              </>
                            ) : (
                              <>
                                <Database className="w-3.5 h-3.5" />
                                恢复数据
                              </>
                            )}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="border-t px-3 py-2 text-[11px] text-gray-500 bg-white">
                    每次上传前都会自动复制服务器数据形成备份，必要时可一键恢复。
                  </div>
                </div>
              )}
          </div>

          {/* 右侧图表区域 */}
          <div className="flex-1 flex flex-col bg-gray-50">
            {!selectedDeviceId ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <p className="text-lg mb-2">请选择设备</p>
                  <p className="text-sm">从左侧设备列表中选择一个设备查看数据</p>
                </div>
              </div>
            ) : (
              <>
                {/* TAB切换：数据列表、温度、湿度 */}
                <div className="bg-white border-b px-6 py-3">
                  <div className="flex space-x-4">
                    <button
                      onClick={() => setActiveTab('list')}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === 'list'
                          ? 'bg-primary-100 text-primary-700'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      数据列表
                    </button>
                    <button
                      onClick={() => setActiveTab('temperature')}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === 'temperature'
                          ? 'bg-primary-100 text-primary-700'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      温度
                    </button>
                    <button
                      onClick={() => setActiveTab('humidity')}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === 'humidity'
                          ? 'bg-primary-100 text-primary-700'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      湿度
                    </button>
                  </div>
                </div>
                {/* 内容区域 */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {activeTab === 'list' ? (
                    /* 数据列表 */
                    <div
                      className="h-full overflow-y-auto bg-white p-6"
                      onScroll={handleListScroll}
                    >
                      {data.length === 0 ? (
                        <div className="h-full flex items-center justify-center">
                          <div className="text-center text-gray-500">
                            <p className="text-lg mb-2">暂无数据</p>
                            <p className="text-sm">点击"添加数据"按钮添加第一条数据</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3 className="font-semibold text-gray-800 mb-4">
                            数据列表{selectedDeviceId ? ` · ${selectedDeviceId}` : ''}
                          </h3>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                    时间
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                    温度 (°C)
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                    湿度 (%)
                                  </th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                    操作
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {visibleRows.map((item, idx) => (
                                  <tr
                                    key={`${item._id ?? 'no-id'}-${item.timestamp}-${idx}`}
                                    className="hover:bg-gray-50"
                                  >
                                    <td className="px-4 py-2 text-sm text-gray-900">
                                      {new Date(item.timestamp).toLocaleString('zh-CN')}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-900">
                                      {item.temperature}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-900">
                                      {item.humidity}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-right">
                                      <button
                                        onClick={() => handleEdit(item)}
                                        className="text-primary-600 hover:text-primary-900 mr-3"
                                        title="编辑"
                                      >
                                        <Edit2 className="w-4 h-4 inline" />
                                      </button>
                                      <button
                                        onClick={() => handleDelete(item)}
                                        className="text-red-600 hover:text-red-900"
                                        title="删除"
                                      >
                                        <Trash2 className="w-4 h-4 inline" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {hasMoreRows && (
                            <div className="mt-4 text-center text-xs text-gray-400">
                              向下滚动以加载更多数据…
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <CurveChartPanel
                      renderDeviceIds={renderDeviceIds}
                      deviceDataMap={deviceDataMap}
                      activeTab={activeTab as 'temperature' | 'humidity'}
                      taskId={taskId}
                      setAlert={setAlert}
                      applyDeviceDataUpdate={applyDeviceDataUpdate}
                      updateCacheStats={updateCacheStats}
                      fetchDevices={async () => {
                        await fetchDevices();
                      }}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 添加/编辑表单弹窗 */}
        {showAddForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
              <div className="p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">
                  {editingData ? '编辑数据' : '添加数据'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      设备ID
                    </label>
                    <input
                      type="text"
                      value={formData.deviceId}
                      onChange={(e) =>
                        setFormData({ ...formData, deviceId: e.target.value })
                      }
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                      placeholder="请输入设备ID"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      温度 (°C)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.temperature}
                      onChange={(e) =>
                        setFormData({ ...formData, temperature: e.target.value })
                      }
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                      placeholder="请输入温度"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      湿度 (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.humidity}
                      onChange={(e) =>
                        setFormData({ ...formData, humidity: e.target.value })
                      }
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                      placeholder="请输入湿度"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      时间
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.timestamp}
                      onChange={(e) =>
                        setFormData({ ...formData, timestamp: e.target.value })
                      }
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div className="flex space-x-2 justify-end pt-4">
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                    >
                      {editingData ? '更新' : '创建'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* 创建设备弹窗（支持单个或范围） */}
        {showCreateDeviceDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
              <div className="p-6 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">创建设备</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    支持输入单个设备 ID，或输入范围（如{" "}
                    <span className="font-mono text-xs">C001 到 C010</span>、
                    <span className="font-mono text-xs">C001-C010</span>、
                    <span className="font-mono text-xs">001~010</span>）。
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    设备 ID / 范围
                  </label>
                  <input
                    type="text"
                    value={createDeviceInput}
                    onChange={(e) => handleCreateDeviceInputChange(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                    placeholder="例如：C001 或 C001 到 C010"
                  />
                  {createDeviceError && (
                    <p className="mt-1 text-xs text-red-600">{createDeviceError}</p>
                  )}
                  {createDeviceInput.trim() && !createDevicePreview && !createDeviceError && (
                    <p className="mt-1 text-xs text-gray-400">
                      将创建单个设备「{createDeviceInput.trim()}」。
                    </p>
                  )}
                  {createDevicePreview && createDevicePreview.length > 0 && (
                    <div className="mt-2 rounded-md bg-gray-50 p-2">
                      <p className="text-xs text-gray-600">
                        将创建{" "}
                        <span className="font-semibold">
                          {createDevicePreview.length}
                        </span>{" "}
                        个设备：
                      </p>
                      <p className="mt-1 text-xs font-mono text-gray-700">
                        {createDevicePreview[0]} ...{" "}
                        {createDevicePreview[createDevicePreview.length - 1]}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (isCreatingDevices) return;
                      setShowCreateDeviceDialog(false);
                    }}
                    className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                    disabled={isCreatingDevices}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmCreateDevice}
                    disabled={isCreatingDevices}
                    className="px-4 py-2 text-sm rounded bg-primary-600 text-white hover:bg-primary-700 disabled:bg-primary-300 disabled:cursor-not-allowed"
                  >
                    {isCreatingDevices ? '创建中…' : '确定创建'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 设备右键菜单 */}
        {deviceContextMenu && (
          <div className="fixed inset-0 z-40 pointer-events-none">
            <div
              className="absolute z-50 w-48 rounded-md border border-gray-200 bg-white shadow-lg pointer-events-auto"
              style={{ top: deviceContextMenu.y, left: deviceContextMenu.x }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
                设备：{deviceContextMenu.deviceId}
              </div>
              <button
                onClick={() => {
                  handleEditDeviceName(deviceContextMenu.deviceId);
                  setDeviceContextMenu(null);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
              >
                <Edit2 className="w-4 h-4" />
                编辑
              </button>
              <button
                onClick={() => {
                  const isRendering = renderDeviceIds.includes(deviceContextMenu.deviceId);
                  if (isRendering) {
                    removeDevicesFromRender([deviceContextMenu.deviceId]);
                  } else {
                    addDevicesToRender([deviceContextMenu.deviceId]);
                  }
                  setDeviceContextMenu(null);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                {renderDeviceIds.includes(deviceContextMenu.deviceId) ? '取消选中' : '选中'}
              </button>
              <div className="border-t border-gray-100" />
              <button
                onClick={() => {
                  setDeleteDeviceId(deviceContextMenu.deviceId);
                  setDeviceContextMenu(null);
                }}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                删除设备
              </button>
            </div>
          </div>
        )}

        {/* 编辑设备名称弹窗 */}
        {editingDeviceName && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
              <div className="p-6 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">编辑设备信息</h3>
                  <p className="mt-2 text-sm text-gray-600">
                    设备ID：{editingDeviceName.deviceId}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SN（可选）
                  </label>
                  <input
                    type="text"
                    value={editingDeviceName.currentSn}
                    onChange={(e) =>
                      setEditingDeviceName({
                        ...editingDeviceName,
                        currentSn: e.target.value,
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveDeviceName();
                      } else if (e.key === 'Escape') {
                        setEditingDeviceName(null);
                      }
                    }}
                    placeholder="设备序列号"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    设备编号（可选）
                  </label>
                  <input
                    type="text"
                    value={editingDeviceName.currentDeviceNumber}
                    onChange={(e) =>
                      setEditingDeviceName({
                        ...editingDeviceName,
                        currentDeviceNumber: e.target.value,
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveDeviceName();
                      } else if (e.key === 'Escape') {
                        setEditingDeviceName(null);
                      }
                    }}
                    placeholder="设备编号"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingDeviceName(null)}
                    className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDeviceName}
                    className="px-4 py-2 text-sm rounded bg-primary-600 text-white hover:bg-primary-700"
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 删除设备确认弹窗 */}
        {deleteDeviceId && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
              <div className="p-6 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">删除设备确认</h3>
                  <p className="mt-2 text-sm text-gray-700">
                    确认删除设备「
                    <span className="font-semibold">
                      {deleteDeviceId}
                    </span>
                    」的所有数据吗？此操作不可恢复。
                  </p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setDeleteDeviceId(null)}
                    className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!deleteDeviceId) return;
                      handleDeleteDevice(deleteDeviceId);
                    }}
                    className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700"
                  >
                    确认删除
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 导入对话框 */}
        {showImportDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">导入数据</h2>

                {isImporting && (
                  <div className="mb-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700 flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium">
                        {importProgress.stage || '导入中…'}
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        {importProgress.total > 0
                          ? `已处理 ${importProgress.processed}/${importProgress.total} 行`
                          : '正在准备数据…'}
                      </p>
                    </div>
                    {importProgress.total > 0 && (
                      <div className="w-36 bg-blue-100 h-2 rounded-full ml-4">
                        <div
                          className="h-2 rounded-full bg-blue-500 transition-all"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(
                                (importProgress.processed / Math.max(importProgress.total, 1)) * 100
                              )
                            )}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {importStep === 'mapping' && importData.length > 0 && (
                  <div className="space-y-4">
                    <p className="text-gray-600 mb-4">请选择各列对应的字段（第一行为表头）：</p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          设备ID <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={columnMapping.deviceId}
                          onChange={(e) =>
                            setColumnMapping({ ...columnMapping, deviceId: e.target.value })
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="">请选择列</option>
                          {importData[0]?.map((col, index) => {
                            // 使用原始值作为 value，但显示时标准化
                            const colValue = col === null || col === undefined ? '' : String(col);
                            const displayValue = colValue.trim() || '(空)';
                            return (
                              <option key={index} value={colValue}>
                                {displayValue} (第 {index + 1} 列)
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          温度 (°C) <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={columnMapping.temperature}
                          onChange={(e) =>
                            setColumnMapping({ ...columnMapping, temperature: e.target.value })
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="">请选择列</option>
                          {importData[0]?.map((col, index) => {
                            // 使用原始值作为 value，但显示时标准化
                            const colValue = col === null || col === undefined ? '' : String(col);
                            const displayValue = colValue.trim() || '(空)';
                            return (
                              <option key={index} value={colValue}>
                                {displayValue} (第 {index + 1} 列)
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          湿度 (%) <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={columnMapping.humidity}
                          onChange={(e) =>
                            setColumnMapping({ ...columnMapping, humidity: e.target.value })
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="">请选择列</option>
                          {importData[0]?.map((col, index) => {
                            // 使用原始值作为 value，但显示时标准化
                            const colValue = col === null || col === undefined ? '' : String(col);
                            const displayValue = colValue.trim() || '(空)';
                            return (
                              <option key={index} value={colValue}>
                                {displayValue} (第 {index + 1} 列)
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          时间 <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={columnMapping.timestamp}
                          onChange={(e) =>
                            setColumnMapping({ ...columnMapping, timestamp: e.target.value })
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="">请选择列</option>
                          {importData[0]?.map((col, index) => {
                            // 使用原始值作为 value，但显示时标准化
                            const colValue = col === null || col === undefined ? '' : String(col);
                            const displayValue = colValue.trim() || '(空)';
                            return (
                              <option key={index} value={colValue}>
                                {displayValue} (第 {index + 1} 列)
                              </option>
                            );
                          })}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          支持多种时间格式，系统会自动识别
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 p-3 bg-gray-50 rounded-md">
                      <p className="text-sm text-gray-600">
                        预览：共 {importData.length} 行数据
                        {columnMapping.temperature && (() => {
                          const tempIndex = importData[0]?.indexOf(columnMapping.temperature);
                          if (tempIndex === -1) return '';
                          const firstRowTempValue = importData[0]?.[tempIndex];
                          const isFirstRowHeader = typeof firstRowTempValue === 'string' || 
                                                   (typeof firstRowTempValue === 'number' && isNaN(firstRowTempValue)) ||
                                                   firstRowTempValue === null ||
                                                   firstRowTempValue === undefined ||
                                                   String(firstRowTempValue).trim() === '';
                          return isFirstRowHeader ? '（将跳过第一行表头）' : '（第一行将作为数据导入）';
                        })()}
                      </p>
                    </div>
                    <div className="flex space-x-2 justify-end pt-4">
                      <button
                        type="button"
                        onClick={handleImportCancel}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={handleImportSubmit}
                        disabled={isImporting}
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:bg-primary-300 disabled:cursor-not-allowed inline-flex items-center gap-2"
                      >
                        {isImporting && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isImporting ? '导入中…' : '导入'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 上传前备份提示 */}
        {showBackupPrompt && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
              <div className="p-6 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">上传前自动备份</h3>
                  <p className="text-sm text-gray-600 mt-2">
                    将先复制服务器数据生成备份，然后上传缓存数据（{pendingUploadCount} 条）。
                    可以填写备注以便在历史数据中识别。
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    备份备注
                  </label>
                  <input
                    type="text"
                    value={backupRemark}
                    onChange={(e) => setBackupRemark(e.target.value)}
                    placeholder="请输入备份备注"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">默认备注为“{DEFAULT_BACKUP_REMARK}”。</p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleBackupPromptCancel}
                    className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleBackupPromptConfirm}
                    disabled={isCreatingBackup || uploadProgress.isUploading}
                    className="px-4 py-2 text-sm rounded bg-primary-600 text-white hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {isCreatingBackup || uploadProgress.isUploading ? '处理中…' : '确认并上传'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 上传进度对话框 */}
        {isClearingServerData && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-xs mx-4">
              <div className="p-6 flex flex-col items-center space-y-3">
                <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
                <p className="text-sm text-gray-700 font-medium">清空服务器数据中…</p>
                <p className="text-xs text-gray-500 text-center">请稍候，准备上传。</p>
              </div>
            </div>
          </div>
        )}
        {uploadProgress.isUploading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
              <div className="p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">上传进度</h2>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>上传中...</span>
                      <span>
                        {uploadProgress.current} / {uploadProgress.total} 批次
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div
                        className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress.progress}%` }}
                      />
                    </div>
                    <div className="text-center text-sm text-gray-600 mt-2">
                      {uploadProgress.progress}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {isPostUploadBackup && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-xs mx-4">
              <div className="p-6 flex flex-col items-center space-y-3">
                <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
                <p className="text-sm text-gray-700 font-medium">备份生成中…</p>
                <p className="text-xs text-gray-500 text-center">数据已上传，请稍候完成备份。</p>
              </div>
            </div>
          </div>
        )}

        {contextMenuState ? (
          <div className="fixed inset-0 z-40 pointer-events-none">
            <div
              className="absolute z-50 w-56 rounded-md border border-gray-200 bg-white shadow-lg pointer-events-auto"
              style={{ top: contextMenuState.y, left: contextMenuState.x }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
                当前曲线：{' '}
                <span className="font-medium text-gray-700">
                  {contextMenuState.targetDeviceId || '未定位'}
                </span>
              </div>
              <button
                onClick={() => {
                  setContextMenuState(null);
                  handleCopySelection(contextMenuState.targetDeviceId);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                复制所选数据
              </button>
              <button
                onClick={() => {
                  setContextMenuState(null);
                  handleComputeAverage(contextMenuState.targetDeviceId);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                计算平均值
              </button>
              <button
                onClick={() => handlePasteSelection({
                  deviceIdFilter: contextMenuState.targetDeviceId,
                  targetTimestamp: contextMenuState.targetTimestamp,
                })}
                disabled={!copiedSelectionData || copiedSelectionData.length === 0}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-white disabled:cursor-not-allowed"
              >
                粘贴
                {copiedSelectionData?.length
                  ? `（${copiedSelectionData.length} 条）`
                  : '（暂无）'}
              </button>
              <div className="border-t border-gray-100" />
              <button
                onClick={() => {
                  setContextMenuState(null);
                  handleClearSelection();
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                清除选区
              </button>
            </div>
          </div>
        ) : null}

        {/* 清理缓存确认弹窗 */}
        {showClearConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
              <div className="p-6 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">清理缓存确认</h3>
                  <p className="text-sm text-gray-600 mt-2">
                    将删除当前任务的所有本地缓存数据，操作不可恢复。确认继续吗？
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                    disabled={isClearingCache}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleClearCache}
                    disabled={isClearingCache}
                    className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed"
                  >
                    {isClearingCache ? '清理中…' : '确认清理'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 趋势生成器 */}
        <TrendGenerator
          isOpen={showTrendGenerator}
          onClose={() => setShowTrendGenerator(false)}
          onGenerate={handleTrendGeneratorData}
          taskId={taskId}
          defaultStartTime={
            chartRangeRef.current?.min && chartRangeRef.current.min > 0
              ? chartRangeRef.current.min
              : undefined
          }
        />

        {/* 提示弹窗 */}
        <Alert
          isOpen={alert.isOpen}
          onClose={() => setAlert({ isOpen: false, message: '', type: 'info' })}
          message={alert.message}
          type={alert.type}
        />
      </div>
    </Layout>
  );
}


