import { useState, useCallback, useRef, useEffect } from 'react';
import type { TemperatureHumidityData } from '../../../types';

// 历史记录项：保存所有设备的数据快照
type HistorySnapshot = Record<string, TemperatureHumidityData[]>;

interface UseUndoRedoProps {
  deviceDataMap: Record<string, TemperatureHumidityData[]>;
  maxHistorySize?: number; // 最大历史记录数量，默认10
  onUndo?: (snapshot: HistorySnapshot) => void; // 撤销回调
}

export const useUndoRedo = ({
  deviceDataMap,
  maxHistorySize = 10,
  onUndo,
}: UseUndoRedoProps) => {
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const currentIndexRef = useRef<number>(-1); // 使用 ref 存储当前索引，避免闭包问题
  const isUndoingRef = useRef(false); // 防止撤销操作本身被记录

  // 同步 ref 和 state
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // 创建当前数据快照
  const createSnapshot = useCallback((): HistorySnapshot => {
    const snapshot: HistorySnapshot = {};
    Object.keys(deviceDataMap).forEach((deviceId) => {
      // 深拷贝数据，避免引用问题
      snapshot[deviceId] = deviceDataMap[deviceId].map((item) => ({ ...item }));
    });
    return snapshot;
  }, [deviceDataMap]);

  // 保存历史记录
  const saveHistory = useCallback(() => {
    if (isUndoingRef.current) {
      return; // 撤销操作不需要保存历史
    }

    const snapshot = createSnapshot();
    setHistory((prevHistory) => {
      const prevIndex = currentIndexRef.current;
      // 如果当前不在历史记录的末尾，删除后面的记录（分支历史）
      const newHistory = prevHistory.slice(0, prevIndex + 1);
      
      // 添加新的快照
      const updated = [...newHistory, snapshot];
      
      // 限制历史记录数量
      const finalHistory = updated.length > maxHistorySize 
        ? updated.slice(-maxHistorySize) 
        : updated;
      
      // 更新索引
      const newIndex = finalHistory.length - 1;
      setCurrentIndex(newIndex);
      
      return finalHistory;
    });
  }, [createSnapshot, maxHistorySize]);

  // 撤销
  const undo = useCallback(() => {
    const prevIndex = currentIndexRef.current;
    if (prevIndex < 0 || history.length === 0) {
      return false; // 没有可撤销的历史
    }

    const targetIndex = prevIndex - 1;
    if (targetIndex < 0) {
      return false; // 已经到最开始
    }

    isUndoingRef.current = true;
    const snapshot = history[targetIndex];
    
    // 调用回调函数恢复数据
    if (onUndo) {
      onUndo(snapshot);
    }
    
    setCurrentIndex(targetIndex);
    
    // 使用 setTimeout 确保状态更新完成后再重置标志
    setTimeout(() => {
      isUndoingRef.current = false;
    }, 0);

    return true;
  }, [history, onUndo]);

  // 监听 Ctrl+Z 快捷键
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 检查是否按下了 Ctrl+Z (Windows/Linux) 或 Cmd+Z (Mac)
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        // 如果正在输入框中，不处理
        const target = event.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          return;
        }

        event.preventDefault();
        undo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [undo]);

  // 初始化：保存当前状态作为第一个历史记录（只在首次有数据时）
  const isInitializedRef = useRef(false);
  useEffect(() => {
    if (!isInitializedRef.current && Object.keys(deviceDataMap).length > 0) {
      const snapshot = createSnapshot();
      setHistory([snapshot]);
      setCurrentIndex(0);
      currentIndexRef.current = 0;
      isInitializedRef.current = true;
    }
  }, [deviceDataMap, createSnapshot]);

  return {
    saveHistory,
    undo,
    canUndo: currentIndex > 0 && history.length > 0,
    historySize: history.length,
    currentIndex,
  };
};

