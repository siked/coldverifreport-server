import { useState, useRef, useCallback, useEffect } from 'react';
import type React from 'react';
import Highcharts from 'highcharts/highstock';
import type { HighchartsReactRefObject } from 'highcharts-react-official';
import { saveToCache } from '@/lib/cache';
import type { TemperatureHumidityData } from '../../../types';
import type { AlertState } from '../types';
import { roundToOneDecimal } from '../utils/dataAdjustment';

interface UseMagicPenModeProps {
  renderDeviceIds: string[];
  activeTab: 'temperature' | 'humidity';
  deviceDataMap: Record<string, TemperatureHumidityData[]>;
  taskId: string;
  setAlert: (alert: AlertState) => void;
  applyDeviceDataUpdate: (deviceId: string, dataset: TemperatureHumidityData[]) => void;
  updateCacheStats: () => Promise<void>;
  chartComponentRef: React.RefObject<HighchartsReactRefObject | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

// 数据间隔固定为 1 分钟
const DATA_INTERVAL_MS = 1000 * 60;

interface DrawingPoint {
  x: number; // canvas 坐标
  y: number; // canvas 坐标
  timestamp: number;
  value: number;
}

export const useMagicPenMode = ({
  renderDeviceIds,
  activeTab,
  deviceDataMap,
  taskId,
  setAlert,
  applyDeviceDataUpdate,
  updateCacheStats,
  chartComponentRef,
  canvasRef,
}: UseMagicPenModeProps) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const drawingStateRef = useRef<{
    isDrawing: boolean;
    startTimestamp: number;
    startValue: number;
    points: DrawingPoint[];
    baseValues: Record<string, number>; // 各曲线在开始时间的基础值
    averageBaseValue: number; // 开始时间的平均值
  } | null>(null);

  // 获取指定时间点的值（通过插值）
  const getValueAtTimestamp = useCallback(
    (deviceId: string, timestamp: number): number | null => {
      const dataset = deviceDataMap[deviceId] || [];
      if (dataset.length === 0) return null;

      const valueKey = activeTab === 'temperature' ? 'temperature' : 'humidity';
      const timestamps = dataset.map((item) => new Date(item.timestamp).getTime());
      const values = dataset.map((item) => item[valueKey]);

      // 找到最接近的时间点
      let closestIndex = 0;
      let minDistance = Math.abs(timestamps[0] - timestamp);

      for (let i = 1; i < timestamps.length; i++) {
        const distance = Math.abs(timestamps[i] - timestamp);
        if (distance < minDistance) {
          minDistance = distance;
          closestIndex = i;
        }
      }

      // 如果距离太远（超过5分钟），返回 null
      if (minDistance > 5 * DATA_INTERVAL_MS) {
        return null;
      }

      // 如果找到精确匹配或非常接近的点，直接返回
      if (minDistance < DATA_INTERVAL_MS / 2) {
        return values[closestIndex];
      }

      // 否则进行线性插值
      const closestTime = timestamps[closestIndex];
      if (timestamp < closestTime && closestIndex > 0) {
        const prevTime = timestamps[closestIndex - 1];
        const prevValue = values[closestIndex - 1];
        const nextValue = values[closestIndex];
        const ratio = (timestamp - prevTime) / (closestTime - prevTime);
        return prevValue + (nextValue - prevValue) * ratio;
      } else if (timestamp > closestTime && closestIndex < timestamps.length - 1) {
        const nextTime = timestamps[closestIndex + 1];
        const nextValue = values[closestIndex + 1];
        const currentValue = values[closestIndex];
        const ratio = (timestamp - closestTime) / (nextTime - closestTime);
        return currentValue + (nextValue - currentValue) * ratio;
      }

      return values[closestIndex];
    },
    [deviceDataMap, activeTab]
  );

  // 在 canvas 上绘制路径
  const drawPath = useCallback((points: DrawingPoint[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 清除画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (points.length < 2) return;

    // 绘制蓝色路径
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    // points 中存储的 x, y 已经是 canvas 坐标，直接使用
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }, [canvasRef]);

  // 鼠标按下处理
  const handleMouseDown = useCallback(
    (event: globalThis.MouseEvent) => {
      if (event.button !== 0) return;

      const chart = chartComponentRef.current?.chart;
      const xAxis = chart?.xAxis?.[0];
      const yAxis = chart?.yAxis?.[0];
      if (!chart || !xAxis || !yAxis || typeof yAxis.min !== 'number' || typeof yAxis.max !== 'number') {
        return;
      }

      const normalized = chart.pointer.normalize(event as any);
      const xValue = xAxis.toValue(normalized.chartX, true);
      const yValue = yAxis.toValue(normalized.chartY, true);

      if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) return;

      // 直接使用鼠标事件相对于 canvas 的坐标
      const canvas = canvasRef.current;
      if (!canvas) return;
      const canvasRect = canvas.getBoundingClientRect();
      
      // 将鼠标事件坐标直接转换为 canvas 坐标
      const canvasX = event.clientX - canvasRect.left;
      const canvasY = event.clientY - canvasRect.top;

      // 检查是否点击在曲线上（单条曲线模式）
      let targetDeviceId: string | null = null;
      let minDistance = Number.POSITIVE_INFINITY;

      chart.series.forEach((series) => {
        if (!series.visible) return;
        const seriesDeviceId =
          (series.userOptions?.name as string) ||
          (series.options?.id as string) ||
          (series.name as string) ||
          null;
        if (!seriesDeviceId) return;

        const point = series.searchPoint(normalized, true as any);
        const pointDistance =
          point && typeof (point as any).dist === 'number'
            ? (point as any).dist
            : Number.POSITIVE_INFINITY;
        if (point && pointDistance < minDistance) {
          minDistance = pointDistance;
          targetDeviceId = seriesDeviceId;
        }
      });

      // 判断是单条曲线还是多条曲线模式
      // 只有当只有一条曲线且点击在曲线上时，才使用单条曲线模式
      // 否则，总是使用多条曲线模式，保持相对偏移
      const isSingleCurve = renderDeviceIds.length === 1 && minDistance < 60 && targetDeviceId !== null;

      // 获取各曲线在开始时间的基础值
      const baseValues: Record<string, number> = {};
      let validDeviceCount = 0;
      let sumValues = 0;

      if (isSingleCurve && targetDeviceId) {
        // 单条曲线模式：直接使用鼠标位置的值
        baseValues[targetDeviceId] = yValue;
        sumValues = yValue;
        validDeviceCount = 1;
      } else {
        // 多条曲线模式：获取各曲线在该时间的值
        renderDeviceIds.forEach((deviceId) => {
          const value = getValueAtTimestamp(deviceId, xValue);
          if (value !== null) {
            baseValues[deviceId] = value;
            sumValues += value;
            validDeviceCount++;
          }
        });

        // 如果没有找到任何值，使用鼠标位置作为所有曲线的基准
        if (validDeviceCount === 0) {
          renderDeviceIds.forEach((deviceId) => {
            baseValues[deviceId] = yValue;
          });
          sumValues = yValue * renderDeviceIds.length;
          validDeviceCount = renderDeviceIds.length;
        }
      }

      const averageBaseValue = validDeviceCount > 0 ? sumValues / validDeviceCount : yValue;

      // 初始化绘制状态
      drawingStateRef.current = {
        isDrawing: true,
        startTimestamp: xValue,
        startValue: yValue,
        points: [{ x: canvasX, y: canvasY, timestamp: xValue, value: yValue }],
        baseValues,
        averageBaseValue,
      };

      setIsDrawing(true);
      event.preventDefault();
      event.stopPropagation();
    },
    [chartComponentRef, renderDeviceIds, getValueAtTimestamp, canvasRef]
  );

  // 鼠标移动处理
  const handleMouseMove = useCallback(
    (event: globalThis.MouseEvent) => {
      if (!drawingStateRef.current?.isDrawing) return;

      const chart = chartComponentRef.current?.chart;
      const xAxis = chart?.xAxis?.[0];
      const yAxis = chart?.yAxis?.[0];
      if (!chart || !xAxis || !yAxis || typeof yAxis.min !== 'number' || typeof yAxis.max !== 'number') {
        return;
      }

      const normalized = chart.pointer.normalize(event as any);
      const xValue = xAxis.toValue(normalized.chartX, true);
      const yValue = yAxis.toValue(normalized.chartY, true);

      if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) return;

      // 直接使用鼠标事件相对于 canvas 的坐标
      const canvas = canvasRef.current;
      if (!canvas) return;
      const canvasRect = canvas.getBoundingClientRect();
      
      // 将鼠标事件坐标直接转换为 canvas 坐标
      const canvasX = event.clientX - canvasRect.left;
      const canvasY = event.clientY - canvasRect.top;

      // 添加新点
      const newPoint: DrawingPoint = {
        x: canvasX,
        y: canvasY,
        timestamp: xValue,
        value: yValue,
      };

      drawingStateRef.current.points.push(newPoint);

      // 更新 canvas 绘制
      drawPath(drawingStateRef.current.points);

      event.preventDefault();
    },
    [chartComponentRef, drawPath, canvasRef]
  );

  // 鼠标释放处理
  const handleMouseUp = useCallback(
    async () => {
      if (!drawingStateRef.current?.isDrawing) return;

      const drawingState = drawingStateRef.current;
      drawingStateRef.current = null;
      setIsDrawing(false);

      // 清除 canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }

      if (drawingState.points.length < 2) {
        return; // 至少需要两个点
      }

      const chart = chartComponentRef.current?.chart;
      const yAxis = chart?.yAxis?.[0];
      if (!chart || !yAxis || typeof yAxis.min !== 'number' || typeof yAxis.max !== 'number') {
        return;
      }

      const valueKey = activeTab === 'temperature' ? 'temperature' : 'humidity';
      const isSingleCurve = Object.keys(drawingState.baseValues).length === 1;
      const targetDeviceId = isSingleCurve ? Object.keys(drawingState.baseValues)[0] : null;

      try {
        // 生成时间序列（固定 1 分钟间隔）
        const startTime = Math.min(...drawingState.points.map((p) => p.timestamp));
        const endTime = Math.max(...drawingState.points.map((p) => p.timestamp));

        // 生成时间点
        const timestamps: number[] = [];
        let currentTime = startTime;
        while (currentTime <= endTime) {
          timestamps.push(currentTime);
          currentTime += DATA_INTERVAL_MS;
        }

        // 为每个时间点插值获取鼠标轨迹的值
        const trajectoryValues: number[] = timestamps.map((ts) => {
          // 找到最接近的两个点进行插值
          let prevPoint: DrawingPoint | null = null;
          let nextPoint: DrawingPoint | null = null;

          for (let i = 0; i < drawingState.points.length; i++) {
            const point = drawingState.points[i];
            if (point.timestamp <= ts) {
              prevPoint = point;
            }
            if (point.timestamp >= ts && !nextPoint) {
              nextPoint = point;
              break;
            }
          }

          if (!prevPoint && nextPoint) {
            return nextPoint.value;
          }
          if (prevPoint && !nextPoint) {
            return prevPoint.value;
          }
          if (prevPoint && nextPoint) {
            if (prevPoint.timestamp === nextPoint.timestamp) {
              return prevPoint.value;
            }
            const ratio = (ts - prevPoint.timestamp) / (nextPoint.timestamp - prevPoint.timestamp);
            return prevPoint.value + (nextPoint.value - prevPoint.value) * ratio;
          }

          return drawingState.startValue;
        });

        // 更新数据
        if (isSingleCurve && targetDeviceId) {
          // 单条曲线模式：直接使用轨迹值
          const dataset = deviceDataMap[targetDeviceId] || [];
          const updatedDataset = [...dataset];

          timestamps.forEach((timestamp, index) => {
            const value = roundToOneDecimal(trajectoryValues[index]);
            const timestampStr = new Date(timestamp).toISOString();

            // 查找是否已存在该时间点的数据
            const existingIndex = updatedDataset.findIndex(
              (item) => Math.abs(new Date(item.timestamp).getTime() - timestamp) < DATA_INTERVAL_MS / 2
            );

            if (existingIndex >= 0) {
              // 替换现有数据
              updatedDataset[existingIndex] = {
                ...updatedDataset[existingIndex],
                [valueKey]: value,
              };
            } else {
              // 插入新数据
              const newData: TemperatureHumidityData = {
                taskId,
                deviceId: targetDeviceId,
                [valueKey]: value,
                // 保持另一个值不变，尝试从附近的数据点获取另一个值
                temperature: valueKey === 'temperature' ? value : 0,
                humidity: valueKey === 'humidity' ? value : 0,
                timestamp: timestampStr,
              };

              // 尝试从附近的数据点获取另一个值
              const nearbyItem = updatedDataset.find(
                (item) => Math.abs(new Date(item.timestamp).getTime() - timestamp) < DATA_INTERVAL_MS * 2
              );
              if (nearbyItem) {
                if (valueKey === 'temperature') {
                  newData.humidity = nearbyItem.humidity;
                } else {
                  newData.temperature = nearbyItem.temperature;
                }
              }

              updatedDataset.push(newData);
            }
          });

          // 按时间戳排序
          updatedDataset.sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );

          // 保存到缓存
          await saveToCache(taskId, targetDeviceId, updatedDataset);

          // 更新父组件数据
          applyDeviceDataUpdate(targetDeviceId, updatedDataset);
        } else {
          // 多条曲线模式：根据偏移量还原趋势
          const updatePromises = renderDeviceIds.map(async (deviceId) => {
            const baseValue = drawingState.baseValues[deviceId];
            if (baseValue === undefined) return;

            const offset = baseValue - drawingState.averageBaseValue;
            const dataset = deviceDataMap[deviceId] || [];
            const updatedDataset = [...dataset];

            timestamps.forEach((timestamp, index) => {
              const trajectoryValue = trajectoryValues[index];
              const value = roundToOneDecimal(trajectoryValue + offset);
              const timestampStr = new Date(timestamp).toISOString();

              // 查找是否已存在该时间点的数据
              const existingIndex = updatedDataset.findIndex(
                (item) => Math.abs(new Date(item.timestamp).getTime() - timestamp) < DATA_INTERVAL_MS / 2
              );

              if (existingIndex >= 0) {
                // 替换现有数据
                updatedDataset[existingIndex] = {
                  ...updatedDataset[existingIndex],
                  [valueKey]: value,
                };
              } else {
                // 插入新数据
                const newData: TemperatureHumidityData = {
                  taskId,
                  deviceId,
                  [valueKey]: value,
                  temperature: valueKey === 'temperature' ? value : 0,
                  humidity: valueKey === 'humidity' ? value : 0,
                  timestamp: timestampStr,
                };

                // 尝试从附近的数据点获取另一个值
                const nearbyItem = updatedDataset.find(
                  (item) => Math.abs(new Date(item.timestamp).getTime() - timestamp) < DATA_INTERVAL_MS * 2
                );
                if (nearbyItem) {
                  if (valueKey === 'temperature') {
                    newData.humidity = nearbyItem.humidity;
                  } else {
                    newData.temperature = nearbyItem.temperature;
                  }
                }

                updatedDataset.push(newData);
              }
            });

            // 按时间戳排序
            updatedDataset.sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );

            // 保存到缓存
            await saveToCache(taskId, deviceId, updatedDataset);

            // 更新父组件数据
            applyDeviceDataUpdate(deviceId, updatedDataset);
          });

          await Promise.all(updatePromises);
        }

        // 更新缓存统计
        await updateCacheStats();
      } catch (error) {
        console.error('保存魔术笔数据失败:', error);
        setAlert({
          isOpen: true,
          message: '保存失败，请重试',
          type: 'error',
        });
      }
    },
    [
      activeTab,
      deviceDataMap,
      renderDeviceIds,
      taskId,
      applyDeviceDataUpdate,
      updateCacheStats,
      setAlert,
      canvasRef,
    ]
  );

  return {
    isDrawing,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
};

