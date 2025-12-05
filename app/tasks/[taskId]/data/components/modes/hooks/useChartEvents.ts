import { useRef, useCallback, useEffect } from 'react';
import Highcharts from 'highcharts/highstock';
import type { HighchartsReactRefObject } from 'highcharts-react-official';
import type { ChartRange } from '../types';

const MIN_BUCKET_DURATION_MS = 1000 * 30;

interface UseChartEventsProps {
  renderDeviceIds: string[];
  deviceDataMap: Record<string, any[]>;
  mode: 'basic' | 'drag' | 'magicPen';
  chartComponentRef: React.RefObject<HighchartsReactRefObject | null>;
  chartRange: ChartRange | null;
  setChartRange: (range: ChartRange | null) => void;
  dataTimeRange: { min: number; max: number };
  onContextMenu?: (event: globalThis.MouseEvent) => void;
  onDragMouseDown?: (event: globalThis.MouseEvent) => void;
  onDragMouseMove?: (event: globalThis.MouseEvent) => void;
  onDragMouseUp?: () => void;
  onMagicPenMouseDown?: (event: globalThis.MouseEvent) => void;
  onMagicPenMouseMove?: (event: globalThis.MouseEvent) => void;
  onMagicPenMouseUp?: () => void;
}

export const useChartEvents = ({
  renderDeviceIds,
  deviceDataMap,
  mode,
  chartComponentRef,
  chartRange,
  setChartRange,
  dataTimeRange,
  onContextMenu,
  onDragMouseDown,
  onDragMouseMove,
  onDragMouseUp,
  onMagicPenMouseDown,
  onMagicPenMouseMove,
  onMagicPenMouseUp,
}: UseChartEventsProps) => {
  const chartRangeRef = useRef<ChartRange | null>(null);
  const isCorrectingExtremesRef = useRef<boolean>(false);
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

  useEffect(() => {
    chartRangeRef.current = chartRange;
  }, [chartRange]);

  // 在拖拽模式和魔术笔模式下，直接在图表实例上禁用 selection
  useEffect(() => {
    const chart = chartComponentRef.current?.chart;
    if (!chart) return;

    if (mode === 'drag' || mode === 'magicPen') {
      // 禁用 selection 事件
      chart.update(
        {
          chart: {
            events: {
              selection: undefined,
            },
          },
        },
        false
      );
    }
  }, [mode, chartComponentRef]);

  // 计算数据的时间范围
  const currentDataTimeRange = (() => {
    const allTimestamps = renderDeviceIds.flatMap((deviceId) => {
      const dataset = deviceDataMap[deviceId] || [];
      return dataset
        .map((item) => new Date(item.timestamp).getTime())
        .filter((ts) => Number.isFinite(ts));
    });
    return allTimestamps.length > 0
      ? {
          min: Math.min(...allTimestamps),
          max: Math.max(...allTimestamps),
        }
      : { min: 0, max: 0 };
  })();

  // 滚轮缩放处理
  const handleWheel = useCallback(
    (event: WheelEvent) => {
      const chart = chartComponentRef.current?.chart;
      const xAxis = chart?.xAxis?.[0];
      if (!xAxis || !chart || typeof xAxis.min !== 'number' || typeof xAxis.max !== 'number') {
        return;
      }
      event.preventDefault();
      const range = xAxis.max - xAxis.min;
      if (range <= 0) return;

      // 计算数据的总时间范围
      const totalDataRange = currentDataTimeRange.max - currentDataTimeRange.min;
      if (totalDataRange <= 0) return;

      const zoomIntensity = 0.15;
      const normalized = chart.pointer.normalize(event);
      const pointerValue = xAxis.toValue(normalized.chartX, true);
      if (!Number.isFinite(pointerValue)) return;

      const zoomOut = event.deltaY > 0;
      const zoomFactor = zoomOut ? 1 + zoomIntensity : Math.max(1 - zoomIntensity, 0.05);
      
      // 限制缩放范围：最小为 MIN_BUCKET_DURATION_MS，最大为整个数据的时间范围
      const newRange = Math.max(
        MIN_BUCKET_DURATION_MS,
        Math.min(range * zoomFactor, totalDataRange)
      );
      
      const ratio = range === 0 ? 0.5 : (pointerValue - xAxis.min) / range;
      let newMin = pointerValue - ratio * newRange;
      let newMax = newMin + newRange;

      // 确保缩放后的范围不超出数据的时间范围
      if (newMin < currentDataTimeRange.min) {
        newMin = currentDataTimeRange.min;
        newMax = newMin + newRange;
      }
      if (newMax > currentDataTimeRange.max) {
        newMax = currentDataTimeRange.max;
        newMin = newMax - newRange;
        // 再次检查，确保 newMin 不小于最小值
        if (newMin < currentDataTimeRange.min) {
          newMin = currentDataTimeRange.min;
          newMax = currentDataTimeRange.max;
        }
      }

      xAxis.setExtremes(newMin, newMax, true, false);
    },
    [chartComponentRef, currentDataTimeRange]
  );

  // 中键/右键拖动处理
  const handleMouseDown = useCallback(
    (event: globalThis.MouseEvent) => {
      // 支持中键（button === 1）和右键（button === 2）拖动
      // 只处理中键和右键，左键（button === 0）不处理，让 Highcharts 的选择功能正常工作
      if (event.button !== 1 && event.button !== 2) return;
      const chart = chartComponentRef.current?.chart;
      const xAxis = chart?.xAxis?.[0];
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
      event.stopPropagation();
    },
    [chartComponentRef]
  );

  const handleMouseMove = useCallback(
    (event: globalThis.MouseEvent) => {
      if (!rightPanStateRef.current.isPanning) return;
      const chart = chartComponentRef.current?.chart;
      const xAxis = chart?.xAxis?.[0];
      if (!chart || !xAxis) return;
      const range = rightPanStateRef.current.max - rightPanStateRef.current.min;
      if (range <= 0 || chart.plotWidth <= 0) return;

      const pixelDelta = event.clientX - rightPanStateRef.current.startX;
      if (Math.abs(pixelDelta) > 2) {
        rightPanStateRef.current.hasMoved = true;
      }
      const valueDelta = (-pixelDelta / chart.plotWidth) * range;
      
      // 限制拖拽范围在数据的时间范围内
      const dataMin = currentDataTimeRange.min;
      const dataMax = currentDataTimeRange.max;
      let newMin = rightPanStateRef.current.min + valueDelta;
      let newMax = rightPanStateRef.current.max + valueDelta;
      
      // 如果超出范围，限制在边界
      if (newMin < dataMin) {
        const offset = dataMin - newMin;
        newMin = dataMin;
        newMax = rightPanStateRef.current.max + valueDelta + offset;
      }
      if (newMax > dataMax) {
        const offset = newMax - dataMax;
        newMax = dataMax;
        newMin = rightPanStateRef.current.min + valueDelta - offset;
      }
      
      xAxis.setExtremes(newMin, newMax, true, false);
      event.preventDefault();
    },
    [chartComponentRef, currentDataTimeRange]
  );

  const handleMouseUp = useCallback(() => {
    if (rightPanStateRef.current.isPanning) {
      rightPanStateRef.current.isPanning = false;
      if (rightPanStateRef.current.hasMoved) {
        rightPanStateRef.current.suppressContextMenu = true;
        window.setTimeout(() => {
          rightPanStateRef.current.suppressContextMenu = false;
        }, 200);
      }
    }
  }, []);

  // 范围修正处理
  const isRangeEqual = useCallback(
    (a: ChartRange | null, b: ChartRange | null) => {
      if (a === b) return true;
      if (!a || !b) return false;
      return Math.round(a.min) === Math.round(b.min) && Math.round(a.max) === Math.round(b.max);
    },
    []
  );

  const handleAfterSetExtremes = useCallback(
    (event: Highcharts.AxisSetExtremesEventObject) => {
      // 如果正在修正范围的过程中，直接返回，避免递归
      if (isCorrectingExtremesRef.current) {
        return;
      }
      
      // 检查是否来自主 xAxis（索引 0），而不是 navigator 的 xAxis
      const chart = chartComponentRef.current?.chart;
      const mainXAxis = chart?.xAxis?.[0];
      const eventAxis = event.target as any;
      
      // 如果事件不是来自主 xAxis，直接返回，让 navigator 正常工作
      if (eventAxis !== mainXAxis) {
        return;
      }
      
      if (typeof event.min === 'number' && typeof event.max === 'number') {
        // 验证并限制范围在数据的时间范围内
        const dataMin = dataTimeRange.min;
        const dataMax = dataTimeRange.max;
        const dataRange = dataMax - dataMin;
        
        // 如果数据范围无效，直接返回，不进行修正
        if (dataRange <= 0 || dataMin === 0 || dataMax === 0) {
          const nextRange = { min: event.min, max: event.max };
          if (isRangeEqual(chartRangeRef.current, nextRange)) {
            return;
          }
          chartRangeRef.current = nextRange;
          setChartRange(nextRange);
          return;
        }
        
        if (dataRange > 0) {
          let correctedMin = Math.max(event.min, dataMin);
          let correctedMax = Math.min(event.max, dataMax);
          
          // 确保范围不小于最小值
          const currentRange = correctedMax - correctedMin;
          if (currentRange < MIN_BUCKET_DURATION_MS) {
            // 如果范围太小，尝试保持中心点，调整范围
            const center = (correctedMin + correctedMax) / 2;
            correctedMin = Math.max(dataMin, center - MIN_BUCKET_DURATION_MS / 2);
            correctedMax = Math.min(dataMax, center + MIN_BUCKET_DURATION_MS / 2);
            
            // 如果仍然超出边界，则调整到边界
            if (correctedMin < dataMin) {
              correctedMin = dataMin;
              correctedMax = Math.min(dataMax, dataMin + MIN_BUCKET_DURATION_MS);
            }
            if (correctedMax > dataMax) {
              correctedMax = dataMax;
              correctedMin = Math.max(dataMin, dataMax - MIN_BUCKET_DURATION_MS);
            }
            
            // 如果数据范围本身就小于最小值，则使用完整范围
            if (dataRange < MIN_BUCKET_DURATION_MS) {
              correctedMin = dataMin;
              correctedMax = dataMax;
            }
          }
          
          // 如果范围被修正了，需要更新图表
          if (correctedMin !== event.min || correctedMax !== event.max) {
            if (mainXAxis && typeof mainXAxis.setExtremes === 'function') {
              isCorrectingExtremesRef.current = true;
              // 使用 redraw: true 确保 navigator 能够更新
              // 但由于 isCorrectingExtremesRef 标志，不会再次触发修正逻辑
              mainXAxis.setExtremes(correctedMin, correctedMax, true, false);
              // 更新状态为修正后的范围
              const correctedRange = { min: correctedMin, max: correctedMax };
              chartRangeRef.current = correctedRange;
              setChartRange(correctedRange);
              // 使用 setTimeout 确保在下一个事件循环中重置标志
              setTimeout(() => {
                isCorrectingExtremesRef.current = false;
              }, 0);
              return;
            }
          }
        }
        
        // 正常情况：更新状态，让 navigator 能够正常更新
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
    [isRangeEqual, dataTimeRange, chartComponentRef, setChartRange]
  );

  // 注册事件监听器
  useEffect(() => {
    const chartInstance = chartComponentRef.current?.chart;
    const container = chartInstance?.container;
    if (!chartInstance || !container) return;

    // 在拖拽模式下，阻止所有可能导致框选的事件
    const preventSelection = (e: Event) => {
      if (e.type === 'mousedown' && (e as MouseEvent).button === 0) {
        // 让 handleDragMouseDown 处理
        return;
      }
      // 阻止其他可能导致框选的事件
      e.preventDefault();
      e.stopPropagation();
    };

    // 添加滚轮缩放功能（任何模式下都可用）
    container.addEventListener('wheel', handleWheel, { passive: false });
    
    // 添加中键拖动时间轴功能（任何模式下都可用）
    // 注意：不使用 capture，避免干扰 Highcharts 的选择功能
    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    if (mode === 'drag') {
      if (onDragMouseDown) {
        container.addEventListener('mousedown', onDragMouseDown, { capture: true });
      }
      container.addEventListener('selectstart', preventSelection);
      container.addEventListener('dragstart', preventSelection);
      if (onDragMouseMove) {
        window.addEventListener('mousemove', onDragMouseMove);
      }
      if (onDragMouseUp) {
        window.addEventListener('mouseup', onDragMouseUp);
      }
    } else if (mode === 'magicPen') {
      if (onMagicPenMouseDown) {
        container.addEventListener('mousedown', onMagicPenMouseDown, { capture: true });
      }
      container.addEventListener('selectstart', preventSelection);
      container.addEventListener('dragstart', preventSelection);
      if (onMagicPenMouseMove) {
        window.addEventListener('mousemove', onMagicPenMouseMove);
      }
      if (onMagicPenMouseUp) {
        window.addEventListener('mouseup', onMagicPenMouseUp);
      }
    } else {
      if (onContextMenu) {
        container.addEventListener('contextmenu', onContextMenu);
      }
    }

    return () => {
      container.removeEventListener('wheel', handleWheel as EventListener);
      // 移除中键拖动事件（任何模式下都注册了）
      container.removeEventListener('mousedown', handleMouseDown as EventListener);
      window.removeEventListener('mousemove', handleMouseMove as EventListener);
      window.removeEventListener('mouseup', handleMouseUp as EventListener);
      
      if (mode === 'drag') {
        if (onDragMouseDown) {
          container.removeEventListener('mousedown', onDragMouseDown as EventListener, {
            capture: true,
          });
        }
        container.removeEventListener('selectstart', preventSelection as EventListener);
        container.removeEventListener('dragstart', preventSelection as EventListener);
        if (onDragMouseMove) {
          window.removeEventListener('mousemove', onDragMouseMove as EventListener);
        }
        if (onDragMouseUp) {
          window.removeEventListener('mouseup', onDragMouseUp as EventListener);
        }
      } else if (mode === 'magicPen') {
        if (onMagicPenMouseDown) {
          container.removeEventListener('mousedown', onMagicPenMouseDown as EventListener, {
            capture: true,
          });
        }
        container.removeEventListener('selectstart', preventSelection as EventListener);
        container.removeEventListener('dragstart', preventSelection as EventListener);
        if (onMagicPenMouseMove) {
          window.removeEventListener('mousemove', onMagicPenMouseMove as EventListener);
        }
        if (onMagicPenMouseUp) {
          window.removeEventListener('mouseup', onMagicPenMouseUp as EventListener);
        }
      } else {
        if (onContextMenu) {
          container.removeEventListener('contextmenu', onContextMenu as EventListener);
        }
      }
    };
  }, [
    mode,
    chartComponentRef,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    onContextMenu,
    onDragMouseDown,
    onDragMouseMove,
    onDragMouseUp,
    onMagicPenMouseDown,
    onMagicPenMouseMove,
    onMagicPenMouseUp,
  ]);

  return {
    handleAfterSetExtremes,
    rightPanStateRef,
  };
};

