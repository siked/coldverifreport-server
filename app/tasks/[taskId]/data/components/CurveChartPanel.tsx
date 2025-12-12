'use client';

import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';
import Highcharts from 'highcharts/highstock';
import HighchartsReact, { HighchartsReactRefObject } from 'highcharts-react-official';

import type { TemperatureHumidityData, ChartPoint } from '../types';
import type { AlertState, ChartMode } from './modes/types';
import { saveToCache } from '@/lib/cache';
import { useBasicMode } from './modes/hooks/useBasicMode';
import { useDragMode } from './modes/hooks/useDragMode';
import { useMagicPenMode } from './modes/hooks/useMagicPenMode';
import { useChartEvents } from './modes/hooks/useChartEvents';
import { useUndoRedo } from './modes/hooks/useUndoRedo';

interface CurveChartPanelProps {
  renderDeviceIds: string[];
  deviceDataMap: Record<string, TemperatureHumidityData[]>;
  activeTab: 'temperature' | 'humidity';
  taskId: string;
  setAlert: Dispatch<SetStateAction<AlertState>>;
  applyDeviceDataUpdate: (deviceId: string, dataset: TemperatureHumidityData[]) => void;
  updateCacheStats: () => Promise<void>;
  fetchDevices: () => Promise<void>;
}

const CHART_COLOR_PALETTE = ['#3b82f6', '#10b981', '#f97316', '#a855f7', '#ec4899', '#0ea5e9'];
const MAX_CHART_POINTS = 1500;
const DETAIL_RANGE_THRESHOLD_MS = 1000 * 60 * 30;

const CurveChartPanel = ({
  renderDeviceIds,
  deviceDataMap,
  activeTab,
  taskId,
  setAlert,
  applyDeviceDataUpdate,
  updateCacheStats,
  fetchDevices,
}: CurveChartPanelProps) => {
  const [mode, setMode] = useState<ChartMode>('basic');
  const [chartRange, setChartRange] = useState<{ min: number; max: number } | null>(null);
  const chartComponentRef = useRef<HighchartsReactRefObject | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const saveHistoryRef = useRef<(() => void) | null>(null);

  // 撤销功能
  const undoRedo = useUndoRedo({
    deviceDataMap,
    maxHistorySize: 10,
    onUndo: async (snapshot) => {
      // 恢复所有设备的数据并更新缓存
      const updatePromises = Object.keys(snapshot).map(async (deviceId) => {
        const dataset = snapshot[deviceId];
        // 更新缓存
        await saveToCache(taskId, deviceId, dataset);
        // 更新父组件数据
        applyDeviceDataUpdate(deviceId, dataset);
      });
      
      await Promise.all(updatePromises);
      
      // 更新缓存统计
      updateCacheStats().catch((err) => {
        console.error('更新缓存统计失败:', err);
      });
      
      // 显示提示
      // setAlert({
      //   isOpen: true,
      //   message: '已撤销上一次操作',
      //   type: 'info',
      // });
    },
  });

  // 保存 saveHistory 函数引用
  useEffect(() => {
    saveHistoryRef.current = undoRedo.saveHistory;
  }, [undoRedo.saveHistory]);

  // 包装 applyDeviceDataUpdate，在调用前保存历史记录
  const wrappedApplyDeviceDataUpdate = useCallback(
    (deviceId: string, dataset: TemperatureHumidityData[]) => {
      // 保存历史记录
      if (saveHistoryRef.current) {
        saveHistoryRef.current();
      }
      // 调用原始函数
      applyDeviceDataUpdate(deviceId, dataset);
    },
    [applyDeviceDataUpdate]
  );

  // 计算所有数据的时间范围（加上8小时偏移）
  const dataTimeRange = useMemo(() => {
    const allTimestamps = renderDeviceIds.flatMap((deviceId) => {
      const dataset = deviceDataMap[deviceId] || [];
      return dataset
        .map((item) => new Date(item.timestamp).getTime() + 8 * 60 * 60 * 1000)
        .filter((ts) => Number.isFinite(ts));
    });
    if (allTimestamps.length === 0) {
      return { min: 0, max: 0 };
    }
    return {
      min: Math.min(...allTimestamps),
      max: Math.max(...allTimestamps),
    };
  }, [renderDeviceIds, deviceDataMap]);

  // 使用基础模式hook
  const basicMode = useBasicMode({
    renderDeviceIds,
    deviceDataMap,
    activeTab,
    taskId,
    setAlert,
    applyDeviceDataUpdate: wrappedApplyDeviceDataUpdate,
    updateCacheStats,
    chartComponentRef,
  });

  // 使用拖拽模式hook
  const dragMode = useDragMode({
    activeTab,
    deviceDataMap,
    taskId,
    setAlert,
    applyDeviceDataUpdate: wrappedApplyDeviceDataUpdate,
    updateCacheStats,
    chartComponentRef,
  });

  // 使用魔术笔模式hook
  const magicPenMode = useMagicPenMode({
    renderDeviceIds,
    activeTab,
    deviceDataMap,
    taskId,
    setAlert,
    applyDeviceDataUpdate: wrappedApplyDeviceDataUpdate,
    updateCacheStats,
    chartComponentRef,
    canvasRef,
  });

  // 使用图表事件hook
  const { handleAfterSetExtremes, rightPanStateRef } = useChartEvents({
    renderDeviceIds,
    deviceDataMap,
    mode,
    chartComponentRef,
    chartRange,
    setChartRange,
    dataTimeRange,
    onContextMenu: mode === 'basic' ? (event: globalThis.MouseEvent) => {
      basicMode.handleContextMenu(event, rightPanStateRef);
    } : undefined,
    onDragMouseDown: mode === 'drag' ? dragMode.handleDragMouseDown : undefined,
    onDragMouseMove: mode === 'drag' ? dragMode.handleDragMouseMove : undefined,
    onDragMouseUp: mode === 'drag' ? dragMode.handleDragMouseUp : undefined,
    onMagicPenMouseDown: mode === 'magicPen' ? magicPenMode.handleMouseDown : undefined,
    onMagicPenMouseMove: mode === 'magicPen' ? magicPenMode.handleMouseMove : undefined,
    onMagicPenMouseUp: mode === 'magicPen' ? magicPenMode.handleMouseUp : undefined,
  });

  // 切换模式时的清理
  useEffect(() => {
    setChartRange(null);
    if (mode === 'basic') {
      dragMode.setSelectedDeviceId(null);
    }
    // 清除 canvas
    if (mode !== 'magicPen' && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  }, [renderDeviceIds, mode, dragMode]);

  useEffect(() => {
    // 切换模式时清除选取和选中的设备
    // 只在 mode 改变时清除，避免因为 basicMode/dragMode 对象引用变化而误清除
    if (mode === 'basic') {
      dragMode.setSelectedDeviceId(null);
    }
  }, [mode, dragMode]);
  
  // 单独处理模式切换时清除选择
  useEffect(() => {
    basicMode.setSelectionRange(null);
  }, [mode]);

  // 切换模式时清除复制数据
  useEffect(() => {
    if (mode === 'drag' || mode === 'magicPen') {
      basicMode.setCopiedData(null);
    }
  }, [mode, basicMode]);

  // 同步 canvas 大小
  useEffect(() => {
    if (mode !== 'magicPen' || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;

    const updateCanvasSize = () => {
      // 使用 canvas 自己的 getBoundingClientRect 来获取实际显示尺寸
      const rect = canvas.getBoundingClientRect();
      // 设置 canvas 的像素尺寸，确保与显示尺寸匹配
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    updateCanvasSize();

    // 监听窗口大小变化
    window.addEventListener('resize', updateCanvasSize);
    // 使用 ResizeObserver 监听 canvas 父容器大小变化
    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
    });
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    return () => {
      window.removeEventListener('resize', updateCanvasSize);
      if (canvas.parentElement) {
        resizeObserver.unobserve(canvas.parentElement);
      }
    };
  }, [mode]);

  // 选择区域高亮显示
  useEffect(() => {
    const currentSelectionRange = basicMode.selectionRange;
    
    if (!currentSelectionRange) {
      // 清除 plotBand
      const chart = chartComponentRef.current?.chart;
      const xAxis = chart?.xAxis?.[0];
      if (xAxis) {
        xAxis.removePlotBand('selection-range');
      }
      return;
    }
    
    // 使用 setTimeout 确保图表已经渲染完成后再添加 plotBand
    // 延迟时间设置为 0，在下一个事件循环中执行
    const timeoutId = setTimeout(() => {
      // 再次检查，确保 selectionRange 仍然存在
      if (!basicMode.selectionRange) return;
      
      const chart = chartComponentRef.current?.chart;
      const xAxis = chart?.xAxis?.[0];
      if (!xAxis) return;
      
      // 先移除旧的 plotBand
      xAxis.removePlotBand('selection-range');
      
      // 添加新的 plotBand
      xAxis.addPlotBand({
        id: 'selection-range',
        color: 'rgba(59, 130, 246, 0.15)',
        borderColor: 'rgba(59, 130, 246, 0.4)',
        from: basicMode.selectionRange.start,
        to: basicMode.selectionRange.end,
      });
    }, 0);
    
    return () => {
      clearTimeout(timeoutId);
      const chart = chartComponentRef.current?.chart;
      const xAxis = chart?.xAxis?.[0];
      if (xAxis) {
        xAxis.removePlotBand('selection-range');
      }
    };
  }, [basicMode.selectionRange]);


  const MIN_BUCKET_DURATION_MS = 1000 * 30;

  const rawChartSeriesData = useMemo(
    () =>
      renderDeviceIds.map((deviceId) => {
        const dataset = deviceDataMap[deviceId] || [];
        return {
          deviceId,
          points: dataset
            .map((item) => ({
              // 加上8小时偏移（UTC+8）
              timestamp: new Date(item.timestamp).getTime() + 8 * 60 * 60 * 1000,
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

  // 数据聚合和图表配置


  const aggregateSeriesPoints = useCallback(
    (
      points: ChartPoint[],
      range: { min: number; max: number } | null,
      valueKey: 'temperature' | 'humidity'
    ) => {
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
        zooming:
          mode === 'basic'
            ? {
                type: 'x',
                mouseWheel: {
                  enabled: false,
                },
              }
            : {
                enabled: false,
              },
        panning: {
          enabled: mode === 'basic',
          type: 'x',
        },
        animation: false,
        events: {
          selection: mode === 'basic' ? basicMode.handleChartSelection : undefined,
        },
      },
      title: { text: undefined },
      xAxis: {
        type: 'datetime',
        title: { text: '时间' },
        // 设置 softMin 和 softMax 来告诉 scrollbar 完整的数据范围
        // 这样 scrollbar 才能正确显示当前视图范围相对于总数据范围的比例
        // dataTimeRange 已经包含了8小时偏移
        softMin: dataTimeRange.min > 0 ? dataTimeRange.min : undefined,
        softMax: dataTimeRange.max > 0 ? dataTimeRange.max : undefined,
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
        enabled: false,
      },
      navigator: {
        enabled: true,
        height: 0, // 隐藏 navigator，但保持启用以支持缩放功能
        margin: 0,
      },
      rangeSelector: {
        enabled: false,
      },
      series: chartSeriesData
        .filter((series) => series.points.length > 0)
        .map((series, index) => ({
          type: 'spline',
          name: `${series.deviceId}`,
          id: series.deviceId,
          color: CHART_COLOR_PALETTE[index % CHART_COLOR_PALETTE.length],
          data: series.points.map((point) => [point.timestamp, point[valueKey]]),
          events: {
            click: function (this: Highcharts.Series) {
              if (mode === 'drag') {
                const deviceId = this.name || (this.options as any).id || null;
                if (deviceId) {
                  dragMode.setSelectedDeviceId((prev) => (prev === deviceId ? null : deviceId));
                }
              }
            },
          },
          point: {
            events: {
              click: function (this: Highcharts.Point) {
                if (mode === 'drag') {
                  const series = this.series;
                  const deviceId = series.name || (series.options as any).id || null;
                  if (deviceId) {
                    dragMode.setSelectedDeviceId((prev) => (prev === deviceId ? null : deviceId));
                  }
                }
              },
            },
          },
          marker: {
            enabled: mode === 'drag',
            radius: 3,
            states: {
              hover: {
                radius: 5,
              },
            },
          },
        })),
      accessibility: {
        enabled: false,
      },
    };
  }, [activeTab, chartSeriesData, handleAfterSetExtremes, basicMode.handleChartSelection, mode, dragMode.selectedDeviceId, dataTimeRange]);

  return (
    <div className="flex-1 p-6 flex flex-col overflow-hidden">
      <div className="bg-white rounded-lg shadow flex-1 flex flex-col min-h-[400px]">
        {/* 模式切换区域 - 始终显示在顶部 */}
        <div className="px-4 py-3 border-b-2 border-blue-300 bg-blue-50" style={{ minHeight: '60px', zIndex: 10 }}>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-base font-bold text-gray-900" id="mode-label">模式：</span>
              <label className="flex items-center gap-2 cursor-pointer hover:bg-blue-100 px-3 py-1.5 rounded-md transition border border-blue-200">
                <input
                  type="radio"
                  name="chart-mode"
                  checked={mode === 'basic'}
                  onChange={() => setMode('basic')}
                  className="w-4 h-4 text-blue-600 cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-800 select-none">基础</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:bg-blue-100 px-3 py-1.5 rounded-md transition border border-blue-200">
                <input
                  type="radio"
                  name="chart-mode"
                  checked={mode === 'drag'}
                  onChange={() => setMode('drag')}
                  className="w-4 h-4 text-blue-600 cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-800 select-none" id="drag-mode-label">拖拽</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:bg-blue-100 px-3 py-1.5 rounded-md transition border border-blue-200">
                <input
                  type="radio"
                  name="chart-mode"
                  checked={mode === 'magicPen'}
                  onChange={() => setMode('magicPen')}
                  className="w-4 h-4 text-blue-600 cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-800 select-none">魔术笔</span>
              </label>
            </div>
            {mode === 'drag' && (
              <div className="text-sm text-gray-700 border-l-2 border-blue-500 pl-4 font-medium">
                {dragMode.selectedDeviceId ? (
                  <span>
                    单条曲线编辑模式：<span className="font-bold text-blue-600">{dragMode.selectedDeviceId}</span>{' '}
                    <span className="text-gray-500">(点击曲线选择)</span>
                  </span>
                ) : (
                  <span>全部曲线编辑模式：所有曲线可拖拽</span>
                )}
              </div>
            )}
            {mode === 'magicPen' && (
              <div className="text-sm text-gray-700 border-l-2 border-blue-500 pl-4 font-medium">
                <span>按住鼠标左键拖动绘制数据轨迹，单条曲线直接绘制，多条曲线保持相对偏移</span>
              </div>
            )}
          </div>
        </div>
        
        {!hasChartData ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <p className="text-lg mb-2">暂无数据</p>
              <p className="text-sm">点击"添加数据"按钮添加第一条数据</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 w-full h-full p-4 relative">
              <HighchartsReact
                highcharts={Highcharts}
                constructorType="stockChart"
                options={highchartsOptions}
                ref={chartComponentRef}
                containerProps={{ className: 'h-full w-full' }}
              />
              {/* 魔术笔模式的透明 canvas 层 */}
              {mode === 'magicPen' && (
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    top: '0',
                    left: '0',
                    width: '100%',
                    height: '100%',
                    zIndex: 10,
                  }}
                />
              )}
            </div>
            {mode === 'basic' && basicMode.selectionRange && (
              <div className="px-4 pb-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-gray-500">
                    最近框选时间：
                    <span className="font-medium text-gray-700">
                      {new Date(basicMode.selectionRange.start).toLocaleString('zh-CN')}
                    </span>
                    <span className="mx-1 text-gray-400">~</span>
                    <span className="font-medium text-gray-700">
                      {new Date(basicMode.selectionRange.end).toLocaleString('zh-CN')}
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      onClick={() => basicMode.handleCopy()}
                      className="px-3 py-1 rounded border border-blue-200 text-blue-600 hover:bg-blue-50"
                    >
                      复制
                    </button>
                    <button
                      onClick={() => basicMode.handleComputeAverage()}
                      className="px-3 py-1 rounded border border-amber-200 text-amber-600 hover:bg-amber-50"
                    >
                      计算平均值
                    </button>
                    <button
                      onClick={basicMode.handleClearSelection}
                      className="px-3 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      清除
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 粘贴动画遮罩 */}
      {basicMode.isPasting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-20 pointer-events-auto">
          <div className="bg-white rounded-lg shadow-xl p-6 flex flex-col items-center gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 border-4 border-blue-200 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <p className="text-sm font-medium text-gray-700">正在粘贴数据...</p>
          </div>
        </div>
      )}

      {mode === 'basic' && basicMode.contextMenuState ? (
        <div className="fixed inset-0 z-40 pointer-events-none">
          <div
            className="absolute z-50 w-56 rounded-md border border-gray-200 bg-white shadow-lg pointer-events-auto"
            style={{ top: basicMode.contextMenuState.y, left: basicMode.contextMenuState.x }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
              当前曲线：{' '}
              <span className="font-medium text-gray-700">
                {basicMode.contextMenuState.targetDeviceId || '未定位'}
              </span>
            </div>
            
            {/* 如果有框选区域，显示框选相关操作 */}
            {basicMode.selectionRange && (
              <>
                <button
                  onClick={() => {
                    basicMode.setContextMenuState(null);
                    basicMode.handleCopy(basicMode.contextMenuState?.targetDeviceId || null);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  复制
                </button>
                <button
                  onClick={() => {
                    basicMode.setContextMenuState(null);
                    basicMode.handleComputeAverage(basicMode.contextMenuState?.targetDeviceId || null);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  计算平均值
                </button>
                <div className="border-t border-gray-100" />
                <button
                  onClick={() => {
                    basicMode.setContextMenuState(null);
                    basicMode.handleClearSelection();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  清除选区
                </button>
              </>
            )}
            
            {/* 如果有复制数据，显示粘贴选项 */}
            {basicMode.copiedData && (
              <>
                {basicMode.selectionRange && <div className="border-t border-gray-100" />}
                <button
                  onClick={() => {
                    basicMode.handlePaste(basicMode.contextMenuState?.targetDeviceId || null, basicMode.contextMenuState?.targetTimestamp || 0);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm ${
                    (basicMode.copiedData.copiedDeviceId !== null && !basicMode.contextMenuState.targetDeviceId) ||
                    (basicMode.copiedData.copiedDeviceId === null && basicMode.contextMenuState.targetDeviceId !== null)
                      ? 'text-gray-400 cursor-not-allowed bg-gray-50'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  disabled={
                    // 如果复制时选择了设备，必须选择设备才能粘贴
                    // 如果复制时没有选择设备，只能在空白处粘贴
                    (basicMode.copiedData.copiedDeviceId !== null && !basicMode.contextMenuState.targetDeviceId) ||
                    (basicMode.copiedData.copiedDeviceId === null && basicMode.contextMenuState.targetDeviceId !== null)
                  }
                >
                  粘贴
                  {basicMode.copiedData.copiedDeviceId && (
                    <span className="ml-2 text-xs text-gray-500">
                      ({basicMode.copiedData.copiedDeviceId})
                    </span>
                  )}
                  {basicMode.copiedData.copiedDeviceId === null && (
                    <span className="ml-2 text-xs text-gray-500">(多设备)</span>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CurveChartPanel;
