import { useState, useCallback, useRef, useEffect } from 'react';
import type React from 'react';
import { flushSync } from 'react-dom';
import Highcharts from 'highcharts/highstock';
import type { HighchartsReactRefObject } from 'highcharts-react-official';
import { saveToCache } from '@/lib/cache';
import type { TemperatureHumidityData } from '../../../types';
import type { AlertState, CopiedData, SelectionRange, ContextMenuState } from '../types';

interface UseBasicModeProps {
  renderDeviceIds: string[];
  deviceDataMap: Record<string, TemperatureHumidityData[]>;
  activeTab: 'temperature' | 'humidity';
  taskId: string;
  setAlert: (alert: AlertState) => void;
  applyDeviceDataUpdate: (deviceId: string, dataset: TemperatureHumidityData[]) => void;
  updateCacheStats: () => Promise<void>;
  chartComponentRef: React.RefObject<HighchartsReactRefObject | null>;
}

export const useBasicMode = ({
  renderDeviceIds,
  deviceDataMap,
  activeTab,
  taskId,
  setAlert,
  applyDeviceDataUpdate,
  updateCacheStats,
  chartComponentRef,
}: UseBasicModeProps) => {
  const [selectionRange, setSelectionRange] = useState<SelectionRange | null>(null);
  const selectionRangeRef = useRef<SelectionRange | null>(null);
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState | null>(null);
  const [copiedData, setCopiedData] = useState<CopiedData | null>(null);
  const [isPasting, setIsPasting] = useState<boolean>(false);
  
  // 同步 ref 和 state
  useEffect(() => {
    selectionRangeRef.current = selectionRange;
  }, [selectionRange]);

  // 收集选择区域的数据
  const collectSelectionData = useCallback(
    (range: SelectionRange | null, deviceIdFilter: string | null = null) => {
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

  // 图表选择事件处理
  const handleChartSelection = useCallback(
    (event: Highcharts.SelectEventObject) => {
      const selectedXAxis = event.xAxis?.[0];
      if (
        selectedXAxis &&
        typeof selectedXAxis.min === 'number' &&
        typeof selectedXAxis.max === 'number'
      ) {
        const startRaw = Math.min(selectedXAxis.min, selectedXAxis.max);
        const endRaw = Math.max(selectedXAxis.min, selectedXAxis.max);
        // 对齐到分钟：起始向下取整到整分，结束向上取整到整分
        const floorToMinute = (v: number) => Math.floor(v / 60000) * 60000;
        const ceilToMinute = (v: number) => Math.ceil(v / 60000) * 60000;
        const start = floorToMinute(startRaw);
        const end = ceilToMinute(endRaw);
        
        // 立即设置选择范围（只保留到分）
        setSelectionRange({ start, end });
        
        // 使用双重 requestAnimationFrame 确保在下一个渲染周期添加 plotBand
        // 这样可以确保 Highcharts 的选择事件处理完成后再添加
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const chart = chartComponentRef.current?.chart;
            const xAxis = chart?.xAxis?.[0];
            // 使用 ref 检查，避免闭包问题
            if (xAxis && selectionRangeRef.current) {
              // 先移除旧的 plotBand
              xAxis.removePlotBand('selection-range');
              // 添加新的 plotBand
              xAxis.addPlotBand({
                id: 'selection-range',
                color: 'rgba(59, 130, 246, 0.15)',
                borderColor: 'rgba(59, 130, 246, 0.4)',
                from: start,
                to: end,
              });
            }
          });
        });
        
        console.log(
          '[CurveChartPanel] selection range (minute aligned):',
          new Date(start),start,
          '-',
          new Date(end),end
        );
      }
      // 返回 false 阻止默认的缩放行为，但我们通过 plotBand 手动显示选择区域
      // 注意：返回 false 不会清除选择区域，只是阻止缩放
      return false;
    },
    [chartComponentRef]
  );

  // 清除选择
  const handleClearSelection = useCallback(() => {
    setSelectionRange(null);
  }, []);

  // 复制功能
  const handleCopy = useCallback(
    (deviceIdFilter: string | null = null) => {
      if (!selectionRange) {
        setAlert({ isOpen: true, message: '请先框选时间范围', type: 'info' });
        return;
      }
      
      const selectedData = collectSelectionData(selectionRange, deviceIdFilter);
      if (selectedData.length === 0) {
        setAlert({ isOpen: true, message: '选中范围内没有数据', type: 'warning' });
        return;
      }

      // 按设备ID分组数据
      const dataByDevice: Record<string, TemperatureHumidityData[]> = {};
      selectedData.forEach((item) => {
        if (!dataByDevice[item.deviceId]) {
          dataByDevice[item.deviceId] = [];
        }
        dataByDevice[item.deviceId].push(item);
      });

      // 按时间戳排序每个设备的数据
      Object.keys(dataByDevice).forEach((deviceId) => {
        dataByDevice[deviceId].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
      });

      setCopiedData({
        data: dataByDevice,
        copiedDeviceId: deviceIdFilter,
      });

      // 复制后清除选择
      setSelectionRange(null);
    },
    [selectionRange, collectSelectionData, setAlert]
  );

  // 粘贴功能
  const handlePaste = useCallback(
    async (targetDeviceId: string | null, targetTimestamp: number) => {
      if (!copiedData) {
        setAlert({ isOpen: true, message: '没有可粘贴的数据', type: 'warning' });
        return;
      }

      // 立即关闭右键菜单并显示动画（使用 flushSync 确保立即更新并渲染）
      flushSync(() => {
        setContextMenuState(null);
        setIsPasting(true);
      });
      
      // 使用 requestAnimationFrame 确保 DOM 更新后再执行后续操作
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });
      
      try {
        // 情况1：如果复制时选择了设备（copiedDeviceId 不为 null）
        if (copiedData.copiedDeviceId !== null) {
          // 必须选择设备才能粘贴
          if (!targetDeviceId) {
            setIsPasting(false);
            setAlert({
              isOpen: true,
              message: '请选择设备后再粘贴（在设备曲线上右击）',
              type: 'warning',
            });
            return;
          }

          // 允许跨设备粘贴，获取复制的设备数据
          const dataToPaste = copiedData.data[copiedData.copiedDeviceId] || [];
          if (dataToPaste.length === 0) {
            setIsPasting(false);
            setAlert({ isOpen: true, message: '复制的数据为空', type: 'warning' });
            return;
          }

          // 计算时间偏移量（从复制数据的第一个时间戳到目标时间戳）
          const firstTimestamp = new Date(dataToPaste[0].timestamp).getTime();
          const timeOffset = targetTimestamp - firstTimestamp;

          // 获取目标设备的现有数据
          const existingData = deviceDataMap[targetDeviceId] || [];
          
          // 直接使用原始数据，只调整时间戳
          const newData: TemperatureHumidityData[] = dataToPaste.map((item) => {
            const originalTimestamp = new Date(item.timestamp).getTime();
            const newTimestamp = new Date(originalTimestamp + timeOffset);
            return {
              ...item,
              timestamp: newTimestamp.toISOString(),
            };
          });
          
          // 计算粘贴数据的时间范围（用于覆盖原有数据）
          const pasteStartTime = targetTimestamp;
          const pasteEndTime = new Date(newData[newData.length - 1].timestamp).getTime();

          // 过滤掉时间范围内的原有数据（覆盖逻辑）
          const filteredExistingData = existingData.filter((item) => {
            const itemTime = new Date(item.timestamp).getTime();
            // 保留不在粘贴时间范围内的数据
            return itemTime < pasteStartTime || itemTime > pasteEndTime;
          });

          // 合并新数据和过滤后的原有数据
          const updatedDataset = [...filteredExistingData, ...newData];

          // 按时间戳排序
          updatedDataset.sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );

          // 保存到缓存
          await saveToCache(taskId, targetDeviceId, updatedDataset);

          // 更新父组件数据
          applyDeviceDataUpdate(targetDeviceId, updatedDataset);

          // 更新缓存统计，等待完成
          await updateCacheStats();
        } else {
          // 情况2：如果复制时没有选择设备（复制了所有设备的数据）
          // 只能在空白处粘贴（不能选择设备）
          if (targetDeviceId) {
            setIsPasting(false);
            setAlert({
              isOpen: true,
              message: '复制了多设备数据，请在空白处右击粘贴（不要选择设备）',
              type: 'warning',
            });
            return;
          }

          // 遍历所有复制的设备数据，按设备ID对应粘贴
          const deviceIds = Object.keys(copiedData.data);
          if (deviceIds.length === 0) {
            setIsPasting(false);
            setAlert({ isOpen: true, message: '复制的数据为空', type: 'warning' });
            return;
          }

          // 计算时间偏移量（使用第一个设备的第一个时间戳）
          const firstDeviceId = deviceIds[0];
          const firstDeviceData = copiedData.data[firstDeviceId];
          if (!firstDeviceData || firstDeviceData.length === 0) {
            setAlert({ isOpen: true, message: '复制的数据为空', type: 'warning' });
            return;
          }

          const firstTimestamp = new Date(firstDeviceData[0].timestamp).getTime();
          const timeOffset = targetTimestamp - firstTimestamp;

          // 为每个设备粘贴数据
          const updatePromises = deviceIds.map(async (deviceId) => {
            // 检查设备是否存在
            if (!renderDeviceIds.includes(deviceId)) {
              console.warn(`设备 ${deviceId} 不存在，跳过粘贴`);
              return;
            }

            const dataToPaste = copiedData.data[deviceId] || [];
            if (dataToPaste.length === 0) {
              return;
            }

            // 获取目标设备的现有数据
            const existingData = deviceDataMap[deviceId] || [];
            
            // 直接使用原始数据，只调整时间戳
            const newData: TemperatureHumidityData[] = dataToPaste.map((item) => {
              const originalTimestamp = new Date(item.timestamp).getTime();
              const newTimestamp = new Date(originalTimestamp + timeOffset);
              return {
                ...item,
                timestamp: newTimestamp.toISOString(),
              };
            });
            
            // 计算粘贴数据的时间范围（用于覆盖原有数据）
            const pasteStartTime = targetTimestamp;
            const pasteEndTime = new Date(newData[newData.length - 1].timestamp).getTime();

            // 过滤掉时间范围内的原有数据（覆盖逻辑）
            const filteredExistingData = existingData.filter((item) => {
              const itemTime = new Date(item.timestamp).getTime();
              // 保留不在粘贴时间范围内的数据
              return itemTime < pasteStartTime || itemTime > pasteEndTime;
            });

            // 合并新数据和过滤后的原有数据
            const updatedDataset = [...filteredExistingData, ...newData];

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

          // 更新缓存统计，等待完成
          await updateCacheStats();
        }
      } catch (error) {
        console.error('粘贴数据失败:', error);
        setAlert({
          isOpen: true,
          message: '粘贴失败，请重试',
          type: 'error',
        });
      } finally {
        setIsPasting(false);
      }
    },
    [
      copiedData,
      deviceDataMap,
      renderDeviceIds,
      taskId,
      applyDeviceDataUpdate,
      updateCacheStats,
      setAlert,
    ]
  );

  // 计算平均值
  const handleComputeAverage = useCallback(
    (deviceIdFilter: string | null = null) => {
      if (!selectionRange) {
        setAlert({ isOpen: true, message: '请先框选时间范围', type: 'info' });
        return;
      }
      const selectedData = collectSelectionData(selectionRange, deviceIdFilter);
      if (selectedData.length === 0) {
        setAlert({ isOpen: true, message: '选中范围内没有数据', type: 'warning' });
        return;
      }
      const avgTemperature =
        selectedData.reduce((sum, item) => sum + (item.temperature ?? 0), 0) /
        selectedData.length;
      const avgHumidity =
        selectedData.reduce((sum, item) => sum + (item.humidity ?? 0), 0) /
        selectedData.length;
      const roundToOneDecimal = (value: number): number => {
        return Math.round(value * 10) / 10;
      };
      setAlert({
        isOpen: true,
        message: `平均温度 ${roundToOneDecimal(avgTemperature).toFixed(1)}°C，平均湿度 ${roundToOneDecimal(avgHumidity).toFixed(
          1
        )}%（共 ${selectedData.length} 条）`,
        type: 'info',
      });
    },
    [selectionRange, collectSelectionData, setAlert]
  );

  // 右键菜单处理
  const handleContextMenu = useCallback(
    (event: globalThis.MouseEvent, rightPanStateRef?: React.RefObject<{ suppressContextMenu: boolean }>) => {
      // 如果有复制数据，即使没有框选也可以弹出菜单（用于粘贴）
      const hasSelection = Boolean(selectionRange);
      const hasCopiedData = copiedData !== null;
      
      // 如果没有框选也没有复制数据，不显示菜单
      if (!hasSelection && !hasCopiedData) {
        return;
      }
      
      event.preventDefault();
      if (rightPanStateRef?.current?.suppressContextMenu) {
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
        !!selectionRange && xValue >= selectionRange.start && xValue <= selectionRange.end;
      
      // 如果不在选择区域内，清除选择（但保留复制数据）
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
    },
    [selectionRange, copiedData, chartComponentRef]
  );

  // 右键菜单显示/隐藏处理
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

  return {
    selectionRange,
    setSelectionRange,
    contextMenuState,
    setContextMenuState,
    copiedData,
    setCopiedData,
    isPasting,
    handleChartSelection,
    handleClearSelection,
    handleCopy,
    handlePaste,
    handleComputeAverage,
    handleContextMenu,
  };
};

