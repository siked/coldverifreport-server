/**
 * 缓存性能测试工具
 * 用于测试压缩对加载性能的影响
 */

import LZString from 'lz-string';
import type { TemperatureHumidityData } from './cache';

interface PerformanceResult {
  dataSize: number;
  compressedSize: number;
  compressionRatio: number;
  saveTime: number;
  loadTime: number;
  parseTime: number;
  totalLoadTime: number;
}

/**
 * 测试缓存性能
 */
export function testCachePerformance(
  data: TemperatureHumidityData[],
  iterations: number = 10
): PerformanceResult {
  const jsonString = JSON.stringify(data);
  const originalSize = new Blob([jsonString]).size;

  // 测试压缩
  const compressStart = performance.now();
  const compressed = LZString.compress(jsonString);
  const compressTime = performance.now() - compressStart;
  const compressedSize = compressed ? new Blob([compressed]).size : originalSize;

  if (!compressed) {
    throw new Error('压缩失败');
  }

  // 测试保存（模拟 localStorage.setItem）
  const saveStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    // 模拟保存操作
    const testKey = `test_cache_${i}`;
    try {
      localStorage.setItem(testKey, compressed);
    } catch (e) {
      // 忽略存储错误
    }
  }
  const saveTime = (performance.now() - saveStart) / iterations;

  // 测试加载和解压（多次测试取平均值）
  let totalLoadTime = 0;
  let totalParseTime = 0;

  for (let i = 0; i < iterations; i++) {
    const testKey = `test_cache_${i}`;
    const cached = localStorage.getItem(testKey);

    if (cached) {
      // 测试解压时间
      const decompressStart = performance.now();
      const decompressed = LZString.decompress(cached);
      const decompressTime = performance.now() - decompressStart;
      totalLoadTime += decompressTime;

      if (decompressed) {
        // 测试解析时间
        const parseStart = performance.now();
        JSON.parse(decompressed);
        const parseTime = performance.now() - parseStart;
        totalParseTime += parseTime;
      }
    }

    // 清理测试数据
    try {
      localStorage.removeItem(testKey);
    } catch (e) {
      // 忽略清理错误
    }
  }

  const avgLoadTime = totalLoadTime / iterations;
  const avgParseTime = totalParseTime / iterations;

  return {
    dataSize: originalSize,
    compressedSize,
    compressionRatio: (1 - compressedSize / originalSize) * 100,
    saveTime,
    loadTime: avgLoadTime,
    parseTime: avgParseTime,
    totalLoadTime: avgLoadTime + avgParseTime,
  };
}

/**
 * 测试未压缩的性能（对比基准）
 */
export function testUncompressedPerformance(
  data: TemperatureHumidityData[],
  iterations: number = 10
): PerformanceResult {
  const jsonString = JSON.stringify(data);
  const originalSize = new Blob([jsonString]).size;

  // 测试保存
  const saveStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    const testKey = `test_uncompressed_${i}`;
    try {
      localStorage.setItem(testKey, jsonString);
    } catch (e) {
      // 忽略存储错误
    }
  }
  const saveTime = (performance.now() - saveStart) / iterations;

  // 测试加载和解析
  let totalLoadTime = 0;
  let totalParseTime = 0;

  for (let i = 0; i < iterations; i++) {
    const testKey = `test_uncompressed_${i}`;
    const cached = localStorage.getItem(testKey);

    if (cached) {
      // 测试读取时间（localStorage.getItem 本身很快）
      const loadStart = performance.now();
      const loaded = cached;
      const loadTime = performance.now() - loadStart;
      totalLoadTime += loadTime;

      // 测试解析时间
      const parseStart = performance.now();
      JSON.parse(loaded);
      const parseTime = performance.now() - parseStart;
      totalParseTime += parseTime;
    }

    // 清理测试数据
    try {
      localStorage.removeItem(testKey);
    } catch (e) {
      // 忽略清理错误
    }
  }

  const avgLoadTime = totalLoadTime / iterations;
  const avgParseTime = totalParseTime / iterations;

  return {
    dataSize: originalSize,
    compressedSize: originalSize,
    compressionRatio: 0,
    saveTime,
    loadTime: avgLoadTime,
    parseTime: avgParseTime,
    totalLoadTime: avgLoadTime + avgParseTime,
  };
}

/**
 * 生成测试数据
 */
export function generateTestData(count: number): TemperatureHumidityData[] {
  const data: TemperatureHumidityData[] = [];
  const baseTime = new Date('2024-01-01').getTime();
  
  for (let i = 0; i < count; i++) {
    data.push({
      taskId: 'test-task-id',
      deviceId: `device-${Math.floor(i / 100)}`,
      temperature: Math.round((20 + Math.random() * 10) * 10) / 10,
      humidity: Math.round((50 + Math.random() * 20) * 10) / 10,
      timestamp: new Date(baseTime + i * 60000).toISOString(),
    });
  }
  
  return data;
}

/**
 * 格式化性能结果
 */
export function formatPerformanceResult(result: PerformanceResult): string {
  return `
性能测试结果：
- 原始数据大小: ${(result.dataSize / 1024).toFixed(2)} KB
- 压缩后大小: ${(result.compressedSize / 1024).toFixed(2)} KB
- 压缩率: ${result.compressionRatio.toFixed(2)}%
- 保存时间: ${result.saveTime.toFixed(2)} ms
- 解压时间: ${result.loadTime.toFixed(2)} ms
- 解析时间: ${result.parseTime.toFixed(2)} ms
- 总加载时间: ${result.totalLoadTime.toFixed(2)} ms
  `.trim();
}

/**
 * 比较压缩和未压缩的性能
 */
export function comparePerformance(
  data: TemperatureHumidityData[],
  iterations: number = 10
): {
  compressed: PerformanceResult;
  uncompressed: PerformanceResult;
  comparison: {
    sizeSaved: number;
    sizeSavedPercent: number;
    loadTimeOverhead: number;
    loadTimeOverheadPercent: number;
  };
} {
  const compressed = testCachePerformance(data, iterations);
  const uncompressed = testUncompressedPerformance(data, iterations);

  const comparison = {
    sizeSaved: compressed.dataSize - compressed.compressedSize,
    sizeSavedPercent: compressed.compressionRatio,
    loadTimeOverhead: compressed.totalLoadTime - uncompressed.totalLoadTime,
    loadTimeOverheadPercent:
      ((compressed.totalLoadTime - uncompressed.totalLoadTime) /
        uncompressed.totalLoadTime) *
      100,
  };

  return {
    compressed,
    uncompressed,
    comparison,
  };
}

