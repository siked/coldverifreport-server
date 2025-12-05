import { useState, useRef, useCallback } from 'react';
import Highcharts from 'highcharts/highstock';
import type { HighchartsReactRefObject } from 'highcharts-react-official';
import { saveToCache } from '@/lib/cache';
import type { TemperatureHumidityData } from '../../../types';
import type { AlertState } from '../types';
import { roundToOneDecimal } from '../utils/dataAdjustment';

interface UseDragModeProps {
  activeTab: 'temperature' | 'humidity';
  deviceDataMap: Record<string, TemperatureHumidityData[]>;
  taskId: string;
  setAlert: (alert: AlertState) => void;
  applyDeviceDataUpdate: (deviceId: string, dataset: TemperatureHumidityData[]) => void;
  updateCacheStats: () => Promise<void>;
  chartComponentRef: React.RefObject<HighchartsReactRefObject | null>;
}

export const useDragMode = ({
  activeTab,
  deviceDataMap,
  taskId,
  setAlert,
  applyDeviceDataUpdate,
  updateCacheStats,
  chartComponentRef,
}: UseDragModeProps) => {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const dragStateRef = useRef<{
    isDragging: boolean;
    startY: number;
    startValue: number;
    targetDeviceId: string | null;
    targetPointIndex: number;
    targetTimestamp: number; // 保存原始时间戳，避免缩放后索引错位
    affectedPoints: Array<{ deviceId: string; pointIndex: number; originalValue: number }>;
  } | null>(null);

  // 拖拽鼠标按下处理
  const handleDragMouseDown = useCallback(
    (event: globalThis.MouseEvent) => {
      if (event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();

      const chart = chartComponentRef.current?.chart;
      const yAxis = chart?.yAxis?.[0];
      if (!chart || !yAxis || typeof yAxis.min !== 'number' || typeof yAxis.max !== 'number') {
        return;
      }

      const normalized = chart.pointer.normalize(event as any);
      const xValue = chart.xAxis[0].toValue(normalized.chartX, true);
      if (!Number.isFinite(xValue)) return;

      let targetDeviceId: string | null = null;
      let targetPoint: any = null;
      let minDistance = Number.POSITIVE_INFINITY;

      chart.series.forEach((series) => {
        if (!series.visible) return;
        const seriesDeviceId =
          (series.userOptions?.name as string) ||
          (series.options?.id as string) ||
          (series.name as string) ||
          null;

        if (!seriesDeviceId) return;

        if (selectedDeviceId && seriesDeviceId !== selectedDeviceId) {
          return;
        }

        const point = series.searchPoint(normalized, true as any);
        const pointDistance =
          point && typeof (point as any).dist === 'number'
            ? (point as any).dist
            : Number.POSITIVE_INFINITY;
        if (point && pointDistance < minDistance) {
          minDistance = pointDistance;
          targetPoint = point;
          targetDeviceId = seriesDeviceId;
        }
      });

      const valueKey = activeTab === 'temperature' ? 'temperature' : 'humidity';

      if (minDistance > 60 || !targetPoint || !targetDeviceId) {
        // 没有选中点，找到最接近的点
        let closestPoint: any = null;
        let closestDeviceId: string | null = null;
        let closestDistance = Number.POSITIVE_INFINITY;

        chart.series.forEach((series) => {
          if (!series.visible) return;
          const seriesDeviceId =
            (series.userOptions?.name as string) ||
            (series.options?.id as string) ||
            (series.name as string) ||
            null;

          if (!seriesDeviceId) return;

          if (selectedDeviceId && seriesDeviceId !== selectedDeviceId) {
            return;
          }

          // 找到最接近的点（基于鼠标位置）
          series.points.forEach((point) => {
            if (point && typeof point.x === 'number' && typeof point.y === 'number') {
              const pointX = point.plotX as number;
              const pointY = point.plotY as number;
              const distance = Math.sqrt(
                Math.pow(normalized.chartX - pointX, 2) + Math.pow(normalized.chartY - pointY, 2)
              );
              if (distance < closestDistance) {
                closestDistance = distance;
                closestPoint = point;
                closestDeviceId = seriesDeviceId;
              }
            }
          });
        });

        // 如果找到了最接近的点，使用该点进行拖拽
        if (closestPoint && closestDeviceId && closestDistance < 200) {
          const startValue = closestPoint.y as number;
          const timestamp = closestPoint.x as number;
          if (Number.isFinite(startValue) && Number.isFinite(timestamp)) {
            dragStateRef.current = {
              isDragging: true,
              startY: event.clientY,
              startValue,
              targetDeviceId: closestDeviceId,
              targetPointIndex: closestPoint.index as number,
              targetTimestamp: timestamp, // 保存原始时间戳
              affectedPoints: [
                {
                  deviceId: closestDeviceId,
                  pointIndex: closestPoint.index as number,
                  originalValue: startValue,
                },
              ],
            };
            return;
          }
        }
        // 如果没找到合适的点，不进行拖拽
        return;
      }

      // 选中了点，进入单点拖拽模式
      const startValue = targetPoint.y as number;
      const timestamp = targetPoint.x as number;
      if (!Number.isFinite(startValue) || !Number.isFinite(timestamp)) return;

      dragStateRef.current = {
        isDragging: true,
        startY: event.clientY,
        startValue,
        targetDeviceId,
        targetPointIndex: targetPoint.index as number,
        targetTimestamp: timestamp, // 保存原始时间戳
        affectedPoints: [
          { deviceId: targetDeviceId, pointIndex: targetPoint.index as number, originalValue: startValue },
        ],
      };
    },
    [activeTab, selectedDeviceId, chartComponentRef]
  );

  // 拖拽鼠标移动处理
  const handleDragMouseMove = useCallback(
    (event: globalThis.MouseEvent) => {
      if (!dragStateRef.current?.isDragging) return;
      const chart = chartComponentRef.current?.chart;
      const yAxis = chart?.yAxis?.[0];
      if (!chart || !yAxis || typeof yAxis.min !== 'number' || typeof yAxis.max !== 'number') {
        return;
      }

      const pixelDelta = event.clientY - dragStateRef.current.startY;
      const valueRange = yAxis.max - yAxis.min;
      if (valueRange <= 0 || chart.plotHeight <= 0) return;

      const valueDelta = (-pixelDelta / chart.plotHeight) * valueRange;

      // 单点拖拽：只更新选中的点
      const newValue = roundToOneDecimal(dragStateRef.current.startValue + valueDelta);
      const series = chart.series.find(
        (s) =>
          ((s.userOptions?.name as string) ||
            (s.options?.id as string) ||
            (s.name as string)) === dragStateRef.current!.targetDeviceId
      );

      if (series && dragStateRef.current.targetTimestamp) {
        // 使用时间戳查找点，而不是使用索引，避免缩放后索引错位
        const targetTimestamp = dragStateRef.current.targetTimestamp;
        const point = series.points.find(
          (p) => p && typeof p.x === 'number' && Math.abs(p.x - targetTimestamp) < 1000
        );
        
        // 如果精确匹配失败，查找最接近的点
        if (!point) {
          let closestPoint: Highcharts.Point | null = null;
          let minDistance = Number.POSITIVE_INFINITY;
          series.points.forEach((p) => {
            if (p && typeof p.x === 'number') {
              const distance = Math.abs(p.x - targetTimestamp);
              if (distance < minDistance) {
                minDistance = distance;
                closestPoint = p;
              }
            }
          });
          
          if (closestPoint && minDistance < 5000) {
            closestPoint.update(newValue, true, false);
          }
        } else {
          point.update(newValue, true, false);
        }
      }

      event.preventDefault();
    },
    [chartComponentRef]
  );

  // 拖拽鼠标释放处理
  const handleDragMouseUp = useCallback(
    async () => {
      if (!dragStateRef.current?.isDragging) return;

      // 立即保存当前拖拽状态并清除拖拽标志，防止 handleDragMouseMove 继续处理
      const dragState = dragStateRef.current;
      dragStateRef.current = null;

      const chart = chartComponentRef.current?.chart;
      if (!chart) {
        return;
      }

      const valueKey = activeTab === 'temperature' ? 'temperature' : 'humidity';

      try {
        // 单点拖拽：只更新选中的点
        const { targetDeviceId } = dragState;
        if (!targetDeviceId) {
          return;
        }

        const series = chart.series.find(
          (s) =>
            ((s.userOptions?.name as string) ||
              (s.options?.id as string) ||
              (s.name as string)) === targetDeviceId
        );

        if (!series) {
          return;
        }

        const dataset = deviceDataMap[targetDeviceId] || [];
        const updatedDataset = [...dataset];

        // 使用保存的原始时间戳，而不是从 point 获取，避免缩放后索引错位
        const timestamp = dragState.targetTimestamp;
        if (!Number.isFinite(timestamp)) {
          return;
        }

        // 使用时间戳查找图表中的点，而不是使用索引
        let targetPoint: Highcharts.Point | null = null;
        series.points.forEach((p) => {
          if (p && typeof p.x === 'number' && Math.abs(p.x - timestamp) < 1000) {
            targetPoint = p;
          }
        });

        // 如果精确匹配失败，查找最接近的点
        if (!targetPoint) {
          let minDistance = Number.POSITIVE_INFINITY;
          series.points.forEach((p) => {
            if (p && typeof p.x === 'number') {
              const distance = Math.abs(p.x - timestamp);
              if (distance < minDistance) {
                minDistance = distance;
                targetPoint = p;
              }
            }
          });
        }

        if (targetPoint && typeof targetPoint.y === 'number') {
          const newValue = roundToOneDecimal(targetPoint.y);

          // 使用保存的时间戳查找对应的数据项
          const dataIndex = updatedDataset.findIndex(
            (item) => Math.abs(new Date(item.timestamp).getTime() - timestamp) < 1000
          );

          if (dataIndex >= 0) {
            updatedDataset[dataIndex] = {
              ...updatedDataset[dataIndex],
              [valueKey]: newValue,
            };
          } else {
            // 如果精确匹配失败，查找最接近的时间戳
            let closestIndex = -1;
            let minDistance = Number.POSITIVE_INFINITY;
            updatedDataset.forEach((item, idx) => {
              const itemTs = new Date(item.timestamp).getTime();
              const distance = Math.abs(itemTs - timestamp);
              if (distance < minDistance) {
                minDistance = distance;
                closestIndex = idx;
              }
            });
            // 允许更大的时间差（5秒），因为数据可能被聚合或采样
            if (closestIndex >= 0 && minDistance < 5000) {
              updatedDataset[closestIndex] = {
                ...updatedDataset[closestIndex],
                [valueKey]: newValue,
              };
            }
          }
        }

        // 更新缓存
        await saveToCache(taskId, targetDeviceId, updatedDataset);

        // 更新父组件的数据，但使用 requestAnimationFrame 延迟执行，避免阻塞
        // 这样可以确保数据同步，但不会立即触发重新渲染
        requestAnimationFrame(() => {
          applyDeviceDataUpdate(targetDeviceId, updatedDataset);
        });

        // 异步更新缓存统计，不阻塞
        updateCacheStats().catch((err) => {
          console.error('更新缓存统计失败:', err);
        });
      } catch (error) {
        console.error('保存拖拽数据失败:', error);
        setAlert({
          isOpen: true,
          message: '保存失败，请重试',
          type: 'error',
        });
      }
    },
    [activeTab, deviceDataMap, taskId, applyDeviceDataUpdate, updateCacheStats, setAlert, chartComponentRef]
  );

  return {
    selectedDeviceId,
    setSelectedDeviceId,
    dragStateRef,
    handleDragMouseDown,
    handleDragMouseMove,
    handleDragMouseUp,
  };
};

