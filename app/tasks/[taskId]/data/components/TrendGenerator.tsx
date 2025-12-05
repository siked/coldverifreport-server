'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import Highcharts from 'highcharts/highstock';
import HighchartsReact, { HighchartsReactRefObject } from 'highcharts-react-official';
import { X, GripVertical, Settings, Plus, Trash2, Save, Loader2, RefreshCw } from 'lucide-react';
import type { TemperatureHumidityData, Device } from '../types';
import Alert from '@/components/Alert';
import Confirm from '@/components/Confirm';
import { getCachedDevices } from '@/lib/cache';

const DEVICE_COLORS = [
  '#2563eb',
  '#0ea5e9',
  '#059669',
  '#f97316',
  '#a855f7',
  '#14b8a6',
  '#f43f5e',
  '#6b7280',
];

// 趋势预览图表组件
interface TrendPreviewProps {
  template: TrendTemplate;
  width?: number;
  height?: number;
}

const TrendPreview = ({ template, width = 120, height = 60 }: TrendPreviewProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置画布大小
    canvas.width = width;
    canvas.height = height;

    // 清空画布
    ctx.clearRect(0, 0, width, height);

    // 设置样式
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';

    const { type, defaultParams } = template;
    const { startValue, endValue } = defaultParams;
    const pointCount = 50;
    const padding = 12; // 增加上下边距
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    const baseValue = (startValue + endValue) / 2;
    const range = Math.abs(endValue - startValue) || 20;
    
    // 先计算所有点的值，然后确定实际的范围
    const tempPoints: number[] = [];
    for (let i = 0; i <= pointCount; i++) {
      const progress = i / pointCount;
      let value: number;

      switch (type) {
        case 'up':
          value = startValue + (endValue - startValue) * progress;
          break;
        case 'down':
          value = startValue - (startValue - endValue) * progress;
          break;
        case 'wave': {
          const maxPos = defaultParams.maxPosition ?? 0.5;
          const maxVal = defaultParams.maxValue ?? Math.max(startValue, endValue) + 10;
          if (progress <= maxPos) {
            value = startValue + (maxVal - startValue) * (progress / maxPos);
          } else {
            value = maxVal - (maxVal - endValue) * ((progress - maxPos) / (1 - maxPos));
          }
          break;
        }
        case 'sine': {
          const amplitude = defaultParams.amplitude ?? 0.9;
          const frequency = defaultParams.frequency ?? 2;
          value = baseValue + amplitude * Math.sin(2 * Math.PI * frequency * progress);
          break;
        }
        case 'exponential': {
          const rate = defaultParams.rate ?? 0.05;
          const duration = defaultParams.duration ?? 60;
          value = startValue * Math.exp(rate * progress * duration);
          const finalValue = startValue * Math.exp(rate * duration);
          value = startValue + (endValue - startValue) * (value - startValue) / (finalValue - startValue);
          break;
        }
        case 'exponentialDecay': {
          const rate = defaultParams.rate ?? 0.05;
          const duration = defaultParams.duration ?? 60;
          value = startValue * Math.exp(-rate * progress * duration);
          const finalValue = startValue * Math.exp(-rate * duration);
          value = startValue - (startValue - endValue) * (1 - (value / startValue)) / (1 - (finalValue / startValue));
          break;
        }
        case 'logarithmic': {
          const rate = defaultParams.rate ?? 2;
          const duration = defaultParams.duration ?? 60;
          const normalizedProgress = progress * duration;
          value = startValue + rate * Math.log(1 + normalizedProgress);
          const finalValue = startValue + rate * Math.log(1 + duration);
          value = startValue + (endValue - startValue) * (value - startValue) / (finalValue - startValue);
          break;
        }
        case 'sigmoid': {
          const rate = defaultParams.rate ?? 10;
          const sigmoid = 1 / (1 + Math.exp(-rate * (progress - 0.5)));
          value = startValue + (endValue - startValue) * sigmoid;
          break;
        }
        case 'parabola': {
          const maxPos = defaultParams.maxPosition ?? 0.5;
          const maxVal = defaultParams.maxValue ?? Math.max(startValue, endValue) + 10;
          const a = 4 * (maxVal - Math.min(startValue, endValue));
          value = -a * Math.pow(progress - maxPos, 2) + maxVal;
          if (progress === 0) value = startValue;
          if (progress === 1) value = endValue;
          break;
        }
        case 'step': {
          const stepCount = defaultParams.stepCount ?? 5;
          const stepIndex = Math.floor(progress * stepCount);
          const stepProgress = (progress * stepCount) % 1;
          const stepSize = (endValue - startValue) / stepCount;
          value = startValue + stepIndex * stepSize + stepSize * stepProgress;
          break;
        }
        case 'sawtooth': {
          const amplitude = defaultParams.amplitude ?? 0.9;
          const frequency = defaultParams.frequency ?? 3;
          const phase = (progress * frequency) % 1;
          value = baseValue + amplitude * (phase - 0.5);
          break;
        }
        case 'square': {
          const amplitude = defaultParams.amplitude ?? 0.9;
          const frequency = defaultParams.frequency ?? 4;
          const phase = (progress * frequency) % 1;
          value = baseValue + amplitude * (phase < 0.5 ? 0.5 : -0.5);
          break;
        }
        case 'bell': {
          const maxVal = defaultParams.maxValue ?? Math.max(startValue, endValue) + 10;
          const center = defaultParams.center ?? 0.5;
          const width = defaultParams.width ?? 0.2;
          const gaussian = Math.exp(-Math.pow((progress - center) / width, 2) / 2);
          value = Math.min(startValue, endValue) + (maxVal - Math.min(startValue, endValue)) * gaussian;
          break;
        }
        case 'doubleWave': {
          const amplitude = defaultParams.amplitude ?? 0.9;
          const frequency = defaultParams.frequency ?? 4;
          value = baseValue + amplitude * Math.sin(2 * Math.PI * frequency * progress) * Math.cos(2 * Math.PI * frequency * progress);
          break;
        }
        case 'precool':
        case 'freeze':
        case 'deepFreeze':
        case 'fullLoad':
        case 'halfLoad': {
          // 预冷/冷冻/深冷/满载/半载：指数衰减
          const rate = defaultParams.rate ?? 0.02;
          const duration = defaultParams.duration ?? 240;
          value = startValue * Math.exp(-rate * progress * duration);
          const finalValue = startValue * Math.exp(-rate * duration);
          value = startValue - (startValue - endValue) * (1 - (value / startValue)) / (1 - (finalValue / startValue));
          break;
        }
        case 'preheat': {
          // 预热：指数上升
          const rate = defaultParams.rate ?? 0.018;
          const duration = defaultParams.duration ?? 180;
          value = startValue * Math.exp(rate * progress * duration);
          const finalValue = startValue * Math.exp(rate * duration);
          value = startValue + (endValue - startValue) * (value - startValue) / (finalValue - startValue);
          break;
        }
        case 'steadyState': {
          // 保温稳态：基础值 + 小幅度噪声（使用伪随机确保预览稳定）
          const noiseLevel = defaultParams.noiseLevel ?? 0.5;
          // 使用简单的伪随机函数，基于索引生成
          const seed = (i * 9301 + 49297) % 233280;
          const random = seed / 233280;
          value = baseValue + (random - 0.5) * noiseLevel * 2;
          break;
        }
        case 'singleDoor': {
          // 单次开门扰动：阶跃+指数恢复
          const envTemp = defaultParams.envTemp ?? 28;
          const openDuration = (defaultParams.openDuration ?? 1) / (defaultParams.duration ?? 120);
          const responseTime = (defaultParams.responseTime ?? 0.1) * 60 / (defaultParams.duration ?? 120);
          const recoveryTime = (defaultParams.recoveryTime ?? 0.25) * 60 / (defaultParams.duration ?? 120);
          if (progress < openDuration) {
            // 开门阶段：快速上升
            value = startValue + (envTemp - startValue) * (1 - Math.exp(-progress / responseTime));
          } else {
            // 恢复阶段：指数下降
            const openEndValue = startValue + (envTemp - startValue) * (1 - Math.exp(-openDuration / responseTime));
            const recoveryProgress = (progress - openDuration) / (1 - openDuration);
            value = openEndValue - (openEndValue - endValue) * (1 - Math.exp(-recoveryProgress / recoveryTime));
          }
          break;
        }
        case 'multiDoor': {
          // 多次开门扰动：多个阶跃+恢复
          const envTemp = defaultParams.envTemp ?? 28;
          const openCount = defaultParams.openCount ?? 4;
          const openInterval = (defaultParams.openInterval ?? 90) / (defaultParams.duration ?? 360);
          const openDuration = (defaultParams.openDuration ?? 1) / (defaultParams.duration ?? 360);
          const responseTime = (defaultParams.responseTime ?? 0.1) * 60 / (defaultParams.duration ?? 360);
          const recoveryTime = (defaultParams.recoveryTime ?? 0.25) * 60 / (defaultParams.duration ?? 360);
          
          let currentValue = startValue;
          for (let i = 0; i < openCount; i++) {
            const openStart = i * openInterval;
            const openEnd = openStart + openDuration;
            if (progress >= openStart && progress <= openEnd) {
              // 开门阶段
              const localProgress = (progress - openStart) / openDuration;
              currentValue = startValue + (envTemp - startValue) * (1 - Math.exp(-localProgress / responseTime));
              break;
            } else if (progress > openEnd && (i === openCount - 1 || progress < (i + 1) * openInterval)) {
              // 恢复阶段
              const recoveryProgress = (progress - openEnd) / Math.min(openInterval - openDuration, 1 - openEnd);
              const peakValue = startValue + (envTemp - startValue) * (1 - Math.exp(-1 / responseTime));
              currentValue = peakValue - (peakValue - startValue) * (1 - Math.exp(-recoveryProgress / recoveryTime));
              break;
            }
          }
          value = currentValue;
          break;
        }
        case 'highTempStress':
        case 'lowTempStress': {
          // 高温/低温应激：阶跃响应+恢复
          const envTemp = defaultParams.envTemp ?? (type === 'highTempStress' ? 38 : -20);
          const targetTemp = defaultParams.targetTemp ?? startValue;
          const responseTime = 0.1; // 响应时间常数
          const recoveryTime = 1.0; // 恢复时间常数（小时）
          const recoveryTimeNormalized = recoveryTime * 60 / (defaultParams.duration ?? 480);
          
          if (progress < 0.1) {
            // 快速响应阶段
            const response = (envTemp - startValue) * 0.3; // 最大响应30%
            value = startValue + response * (1 - Math.exp(-progress / responseTime));
          } else {
            // 恢复阶段
            const peakValue = startValue + (envTemp - startValue) * 0.3;
            const recoveryProgress = (progress - 0.1) / 0.9;
            value = peakValue - (peakValue - targetTemp) * (1 - Math.exp(-recoveryProgress / recoveryTimeNormalized));
          }
          break;
        }
        case 'powerLossCool': {
          // 断电续航(制冷)：线性上升
          value = startValue + (endValue - startValue) * progress;
          break;
        }
        case 'powerLossHeat': {
          // 断电续航(制热)：线性下降
          value = startValue - (startValue - endValue) * progress;
          break;
        }
        case 'cycleOnOffCool':
        case 'cycleOnOffHeat': {
          // 循环启停：周期性指数变化
          const frequency = defaultParams.frequency ?? 4;
          const rate = defaultParams.rate ?? (type === 'cycleOnOffCool' ? 0.02 : 0.018);
          const amplitude = defaultParams.amplitude ?? 0.05;
          const cycleProgress = (progress * frequency) % 1;
          const cycleIndex = Math.floor(progress * frequency);
          
          if (cycleProgress < 0.3) {
            // 预冷/预热阶段
            const localProgress = cycleProgress / 0.3;
            if (type === 'cycleOnOffCool') {
              value = startValue * Math.exp(-rate * localProgress * 60);
              const finalValue = startValue * Math.exp(-rate * 60);
              value = startValue - (startValue - endValue) * (1 - (value / startValue)) / (1 - (finalValue / startValue));
            } else {
              value = startValue * Math.exp(rate * localProgress * 60);
              const finalValue = startValue * Math.exp(rate * 60);
              value = startValue + (endValue - startValue) * (value - startValue) / (finalValue - startValue);
            }
            // 添加波动
            value += (Math.random() - 0.5) * amplitude * 2;
          } else {
            // 稳定阶段
            value = endValue + (Math.random() - 0.5) * amplitude * 2;
          }
          break;
        }
        case 'dualZone':
        case 'tripleZone': {
          // 多温区：稳态+小波动
          const noiseLevel = 0.5;
          value = baseValue + (Math.random() - 0.5) * noiseLevel * 2;
          break;
        }
        default:
          value = startValue;
      }

      tempPoints.push(value);
    }

    // 根据实际计算的值确定范围，留出足够的边距
    const actualMin = Math.min(...tempPoints);
    const actualMax = Math.max(...tempPoints);
    const actualRange = actualMax - actualMin;
    const margin = actualRange * 0.15 || 5; // 15% 的边距，至少5个单位
    const minValue = actualMin - margin;
    const maxValue = actualMax + margin;
    const valueRange = maxValue - minValue || 1;

    // 使用之前计算的临时点
    const points = tempPoints;

    // 绘制曲线
    ctx.beginPath();
    points.forEach((value, index) => {
      const x = padding + (index / pointCount) * chartWidth;
      const y = padding + chartHeight - ((value - minValue) / valueRange) * chartHeight;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // 填充区域（可选）
    ctx.lineTo(padding + chartWidth, padding + chartHeight);
    ctx.lineTo(padding, padding + chartHeight);
    ctx.closePath();
    ctx.fill();
  }, [template, width, height]);

  return <canvas ref={canvasRef} className="w-full h-full" style={{ maxWidth: `${width}px`, maxHeight: `${height}px` }} />;
};

// 保存模版的预览组件 - 显示完整的趋势段组合
interface SavedTemplatePreviewProps {
  segments: Record<'temperature' | 'humidity', TrendSegment[]>;
  width?: number;
  height?: number;
}

const SavedTemplatePreview = ({ segments, width = 100, height = 40 }: SavedTemplatePreviewProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置画布大小
    canvas.width = width;
    canvas.height = height;

    // 清空画布
    ctx.clearRect(0, 0, width, height);

    // 合并所有趋势段（优先使用温度段，如果没有则使用湿度段）
    const allSegments = [...(segments.temperature || []), ...(segments.humidity || [])];
    if (allSegments.length === 0) return;

    // 计算总时长
    const totalDuration = Math.max(
      ...allSegments.map(s => s.startTime + s.duration),
      60 // 默认至少60分钟
    );

    // 生成数据点（使用与generateDataPoints相同的逻辑）
    const pointCount = 50;
    const padding = 12;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    const points: Array<{ progress: number; value: number }> = [];
    
    // 为每个进度点计算值
    for (let i = 0; i <= pointCount; i++) {
      const progress = i / pointCount;
      const timeMinutes = progress * totalDuration;
      
      // 找到当前时间点对应的趋势段
      let currentValue: number | null = null;
      
      for (const segment of allSegments) {
        const segmentStart = segment.startTime;
        const segmentEnd = segment.startTime + segment.duration;
        
        if (timeMinutes >= segmentStart && timeMinutes <= segmentEnd) {
          // 在当前段内
          const segmentProgress = (timeMinutes - segmentStart) / segment.duration;
          const { startValue, endValue } = segment.params;
          const baseValue = (startValue + endValue) / 2;
          
          let value: number;
          
          switch (segment.type) {
            case 'up':
              value = startValue + (endValue - startValue) * segmentProgress;
              break;
            case 'down':
              value = startValue - (startValue - endValue) * segmentProgress;
              break;
            case 'wave': {
              const maxPos = segment.params.maxPosition ?? 0.5;
              const maxVal = segment.params.maxValue ?? Math.max(startValue, endValue) + 10;
              if (segmentProgress <= maxPos) {
                value = startValue + (maxVal - startValue) * (segmentProgress / maxPos);
              } else {
                value = maxVal - (maxVal - endValue) * ((segmentProgress - maxPos) / (1 - maxPos));
              }
              break;
            }
            case 'sine': {
              const amplitude = segment.params.amplitude ?? 0.9;
              const frequency = segment.params.frequency ?? 2;
              value = baseValue + amplitude * Math.sin(2 * Math.PI * frequency * segmentProgress);
              break;
            }
            case 'exponential': {
              const rate = segment.params.rate ?? 0.05;
              value = startValue * Math.exp(rate * segmentProgress * segment.duration);
              const finalValue = startValue * Math.exp(rate * segment.duration);
              value = startValue + (endValue - startValue) * (value - startValue) / (finalValue - startValue);
              break;
            }
            case 'exponentialDecay': {
              const rate = segment.params.rate ?? 0.05;
              value = startValue * Math.exp(-rate * segmentProgress * segment.duration);
              const finalValue = startValue * Math.exp(-rate * segment.duration);
              value = startValue - (startValue - endValue) * (1 - (value / startValue)) / (1 - (finalValue / startValue));
              break;
            }
            case 'sigmoid': {
              const rate = segment.params.rate ?? 10;
              const sigmoid = 1 / (1 + Math.exp(-rate * (segmentProgress - 0.5)));
              value = startValue + (endValue - startValue) * sigmoid;
              break;
            }
            case 'parabola': {
              const maxPos = segment.params.maxPosition ?? 0.5;
              const maxVal = segment.params.maxValue ?? Math.max(startValue, endValue);
              const a = 4 * (maxVal - Math.min(startValue, endValue));
              value = -a * Math.pow(segmentProgress - maxPos, 2) + maxVal;
              if (segmentProgress === 0) value = startValue;
              if (segmentProgress === 1) value = endValue;
              break;
            }
            case 'step': {
              const stepCount = segment.params.stepCount ?? 5;
              const stepIndex = Math.floor(segmentProgress * stepCount);
              const stepProgress = (segmentProgress * stepCount) % 1;
              const stepSize = (endValue - startValue) / stepCount;
              value = startValue + stepIndex * stepSize + stepSize * stepProgress;
              break;
            }
            case 'sawtooth': {
              const amplitude = segment.params.amplitude ?? 0.9;
              const frequency = segment.params.frequency ?? 3;
              const phase = (segmentProgress * frequency) % 1;
              value = baseValue + amplitude * (phase - 0.5);
              break;
            }
            case 'square': {
              const amplitude = segment.params.amplitude ?? 0.9;
              const frequency = segment.params.frequency ?? 4;
              const phase = (segmentProgress * frequency) % 1;
              value = baseValue + amplitude * (phase < 0.5 ? 0.5 : -0.5);
              break;
            }
            case 'bell': {
              const maxVal = segment.params.maxValue ?? Math.max(startValue, endValue);
              const center = segment.params.center ?? 0.5;
              const width = segment.params.width ?? 0.2;
              const gaussian = Math.exp(-Math.pow((segmentProgress - center) / width, 2) / 2);
              value = Math.min(startValue, endValue) + (maxVal - Math.min(startValue, endValue)) * gaussian;
              break;
            }
            case 'doubleWave': {
              const amplitude = segment.params.amplitude ?? 0.9;
              const frequency = segment.params.frequency ?? 4;
              value = baseValue + amplitude * Math.sin(2 * Math.PI * frequency * segmentProgress) * Math.cos(2 * Math.PI * frequency * segmentProgress);
              break;
            }
            case 'precool':
            case 'freeze':
            case 'deepFreeze':
            case 'fullLoad':
            case 'halfLoad': {
              const rate = segment.params.rate ?? 0.02;
              value = startValue * Math.exp(-rate * segmentProgress * segment.duration);
              const finalValue = startValue * Math.exp(-rate * segment.duration);
              value = startValue - (startValue - endValue) * (1 - (value / startValue)) / (1 - (finalValue / startValue));
              break;
            }
            case 'preheat': {
              const rate = segment.params.rate ?? 0.018;
              value = startValue * Math.exp(rate * segmentProgress * segment.duration);
              const finalValue = startValue * Math.exp(rate * segment.duration);
              value = startValue + (endValue - startValue) * (value - startValue) / (finalValue - startValue);
              break;
            }
            case 'steadyState': {
              const noiseLevel = segment.params.noiseLevel ?? 0.5;
              const seed = (i * 9301 + 49297) % 233280;
              const random = seed / 233280;
              value = baseValue + (random - 0.5) * noiseLevel * 2;
              break;
            }
            case 'singleDoor': {
              const envTemp = segment.params.envTemp ?? 28;
              const openDuration = (segment.params.openDuration ?? 1) / segment.duration;
              const responseTime = (segment.params.responseTime ?? 0.1) * 60 / segment.duration;
              const recoveryTime = (segment.params.recoveryTime ?? 0.25) * 60 / segment.duration;
              if (segmentProgress < openDuration) {
                value = startValue + (envTemp - startValue) * (1 - Math.exp(-segmentProgress / responseTime));
              } else {
                const openEndValue = startValue + (envTemp - startValue) * (1 - Math.exp(-openDuration / responseTime));
                const recoveryProgress = (segmentProgress - openDuration) / (1 - openDuration);
                value = openEndValue - (openEndValue - endValue) * (1 - Math.exp(-recoveryProgress / recoveryTime));
              }
              break;
            }
            case 'multiDoor': {
              const envTemp = segment.params.envTemp ?? 28;
              const openCount = segment.params.openCount ?? 4;
              const openInterval = (segment.params.openInterval ?? 90) / segment.duration;
              const openDuration = (segment.params.openDuration ?? 1) / segment.duration;
              const responseTime = (segment.params.responseTime ?? 0.1) * 60 / segment.duration;
              const recoveryTime = (segment.params.recoveryTime ?? 0.25) * 60 / segment.duration;
              
              let currentValue = startValue;
              for (let j = 0; j < openCount; j++) {
                const openStart = j * openInterval;
                const openEnd = openStart + openDuration;
                if (segmentProgress >= openStart && segmentProgress <= openEnd) {
                  const localProgress = (segmentProgress - openStart) / openDuration;
                  currentValue = startValue + (envTemp - startValue) * (1 - Math.exp(-localProgress / responseTime));
                  break;
                } else if (segmentProgress > openEnd && (j === openCount - 1 || segmentProgress < (j + 1) * openInterval)) {
                  const recoveryProgress = (segmentProgress - openEnd) / Math.min(openInterval - openDuration, 1 - openEnd);
                  const peakValue = startValue + (envTemp - startValue) * (1 - Math.exp(-1 / responseTime));
                  currentValue = peakValue - (peakValue - startValue) * (1 - Math.exp(-recoveryProgress / recoveryTime));
                  break;
                }
              }
              value = currentValue;
              break;
            }
            case 'highTempStress':
            case 'lowTempStress': {
              const envTemp = segment.params.envTemp ?? (segment.type === 'highTempStress' ? 38 : -20);
              const targetTemp = segment.params.targetTemp ?? startValue;
              const responseTime = 0.1;
              const recoveryTime = 1.0;
              const recoveryTimeNormalized = recoveryTime * 60 / segment.duration;
              
              if (segmentProgress < 0.1) {
                const response = (envTemp - startValue) * 0.3;
                value = startValue + response * (1 - Math.exp(-segmentProgress / responseTime));
              } else {
                const peakValue = startValue + (envTemp - startValue) * 0.3;
                const recoveryProgress = (segmentProgress - 0.1) / 0.9;
                value = peakValue - (peakValue - targetTemp) * (1 - Math.exp(-recoveryProgress / recoveryTimeNormalized));
              }
              break;
            }
            case 'powerLossCool': {
              value = startValue + (endValue - startValue) * segmentProgress;
              break;
            }
            case 'powerLossHeat': {
              value = startValue - (startValue - endValue) * segmentProgress;
              break;
            }
            case 'cycleOnOffCool':
            case 'cycleOnOffHeat': {
              const frequency = segment.params.frequency ?? 4;
              const rate = segment.params.rate ?? (segment.type === 'cycleOnOffCool' ? 0.02 : 0.018);
              const amplitude = segment.params.amplitude ?? 0.05;
              const cycleProgress = (segmentProgress * frequency) % 1;
              
              if (cycleProgress < 0.3) {
                const localProgress = cycleProgress / 0.3;
                if (segment.type === 'cycleOnOffCool') {
                  value = startValue * Math.exp(-rate * localProgress * 60);
                  const finalValue = startValue * Math.exp(-rate * 60);
                  value = startValue - (startValue - endValue) * (1 - (value / startValue)) / (1 - (finalValue / startValue));
                } else {
                  value = startValue * Math.exp(rate * localProgress * 60);
                  const finalValue = startValue * Math.exp(rate * 60);
                  value = startValue + (endValue - startValue) * (value - startValue) / (finalValue - startValue);
                }
                const seed = (i * 9301 + 49297) % 233280;
                const random = seed / 233280;
                value += (random - 0.5) * amplitude * 2;
              } else {
                const seed = (i * 9301 + 49297) % 233280;
                const random = seed / 233280;
                value = endValue + (random - 0.5) * amplitude * 2;
              }
              break;
            }
            case 'dualZone':
            case 'tripleZone': {
              const noiseLevel = 0.5;
              const seed = (i * 9301 + 49297) % 233280;
              const random = seed / 233280;
              value = baseValue + (random - 0.5) * noiseLevel * 2;
              break;
            }
            default:
              value = startValue;
          }
          
          currentValue = value;
          break;
        } else if (timeMinutes < segmentStart && currentValue === null) {
          // 在第一个段之前，使用第一个段的起始值
          currentValue = segment.params.startValue;
          break;
        }
      }
      
      // 如果没有找到对应的段，使用最后一个段的结束值
      if (currentValue === null && allSegments.length > 0) {
        const lastSegment = allSegments[allSegments.length - 1];
        currentValue = lastSegment.params.endValue;
      }
      
      if (currentValue !== null) {
        points.push({ progress, value: currentValue });
      }
    }

    if (points.length === 0) return;

    // 计算值的范围
    const values = points.map(p => p.value);
    const actualMin = Math.min(...values);
    const actualMax = Math.max(...values);
    const actualRange = actualMax - actualMin;
    const margin = actualRange * 0.15 || 5;
    const minValue = actualMin - margin;
    const maxValue = actualMax + margin;
    const valueRange = maxValue - minValue || 1;

    // 设置样式
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';

    // 绘制曲线
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = padding + point.progress * chartWidth;
      const y = padding + chartHeight - ((point.value - minValue) / valueRange) * chartHeight;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // 填充区域
    ctx.lineTo(padding + chartWidth, padding + chartHeight);
    ctx.lineTo(padding, padding + chartHeight);
    ctx.closePath();
    ctx.fill();
  }, [segments, width, height]);

  return <canvas ref={canvasRef} className="w-full h-full" style={{ maxWidth: `${width}px`, maxHeight: `${height}px` }} />;
};

interface TrendGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (data: TemperatureHumidityData[], deviceId: string) => void;
  taskId: string;
  defaultStartTime?: number;
}

type TrendType = 
  | 'up'           // 线性上升
  | 'down'         // 线性下降
  | 'wave'         // 波浪
  | 'sine'         // 正弦波
  | 'cosine'       // 余弦波
  | 'exponential'  // 指数增长
  | 'exponentialDecay' // 指数衰减
  | 'logarithmic'  // 对数增长
  | 'sigmoid'      // S型曲线
  | 'parabola'     // 抛物线
  | 'step'         // 阶梯函数
  | 'sawtooth'     // 锯齿波
  | 'square'       // 方波
  | 'bell'         // 钟形曲线
  | 'doubleWave'   // 双波浪
  | 'precool'      // 预冷曲线
  | 'preheat'      // 预热曲线
  | 'steadyState' // 保温稳态曲线
  | 'singleDoor'   // 单次开门扰动
  | 'multiDoor'    // 多次开门扰动
  | 'fullLoad'     // 满载曲线
  | 'halfLoad'     // 半载曲线
  | 'freeze'       // 冷冻曲线
  | 'deepFreeze'   // 深冷曲线
  | 'highTempStress' // 高温应激
  | 'lowTempStress'  // 低温应激
  | 'powerLossCool'  // 断电续航(制冷)
  | 'powerLossHeat'  // 断电续航(制热)
  | 'cycleOnOffCool' // 循环启停(制冷)
  | 'cycleOnOffHeat' // 循环启停(制热)
  | 'dualZone'       // 双温区
  | 'tripleZone';    // 三温区

interface TrendSegment {
  id: string;
  type: TrendType;
  startTime: number; // 相对于开始时间的分钟数
  duration: number; // 持续时间（分钟）
  params: {
    startValue: number;
    endValue: number;
    // 波浪、正弦、余弦等特有
    maxValue?: number;
    maxPosition?: number; // 0-1，最高值在持续时间中的位置
    amplitude?: number; // 振幅（用于正弦、余弦等）
    frequency?: number; // 频率（周期数，用于正弦、余弦等）
    phase?: number; // 相位（用于正弦、余弦等）
    // 指数、对数等特有
    rate?: number; // 增长率/衰减率
    // 阶梯函数特有
    stepCount?: number; // 阶梯数量
    // 钟形曲线特有
    center?: number; // 中心位置 0-1
    width?: number; // 宽度参数
    // 行业曲线特有参数
    envTemp?: number;      // 环境温度
    targetTemp?: number;   // 目标温度
    openDuration?: number; // 开门持续时间（分钟）
    openCount?: number;    // 开门次数
    openInterval?: number; // 开门间隔（分钟）
    responseTime?: number; // 响应时间常数（小时）
    recoveryTime?: number; // 恢复时间常数（小时）
    loadRatio?: number;    // 负载比例（0-1）
    couplingCoeff?: number; // 耦合系数
    noiseLevel?: number;   // 噪声水平
  };
}

interface TrendTemplate {
  type: TrendType;
  name: string;
  icon: string;
  category: 'basic' | 'industry'; // 分类：基础或行业
  defaultParams: {
    duration: number; // 分钟
    startValue: number;
    endValue: number;
    maxValue?: number;
    maxPosition?: number;
    amplitude?: number;
    frequency?: number;
    phase?: number;
    rate?: number;
    stepCount?: number;
    center?: number;
    width?: number;
    // 行业曲线特有参数
    envTemp?: number;      // 环境温度
    targetTemp?: number;   // 目标温度
    openDuration?: number; // 开门持续时间（分钟）
    openCount?: number;    // 开门次数
    openInterval?: number; // 开门间隔（分钟）
    responseTime?: number; // 响应时间常数（小时）
    recoveryTime?: number; // 恢复时间常数（小时）
    loadRatio?: number;    // 负载比例（0-1）
    couplingCoeff?: number; // 耦合系数
    noiseLevel?: number;   // 噪声水平
  };
}

const TREND_TEMPLATES: TrendTemplate[] = [
  // 基础模板
  {
    type: 'up',
    name: '线性上升',
    icon: '↗',
    category: 'basic',
    defaultParams: {
      duration: 60,
      startValue: 2,
      endValue: 4,
    },
  },
  {
    type: 'down',
    name: '线性下降',
    icon: '↘',
    category: 'basic',
    defaultParams: {
      duration: 60,
      startValue: 4,
      endValue: 2,
    },
  },
  {
    type: 'wave',
    name: '单波浪',
    icon: '~',
    category: 'basic',
    defaultParams: {
      duration: 120,
      startValue: 2,
      endValue: 3,
      maxValue: 4,
      maxPosition: 0.5,
    },
  },
  {
    type: 'sine',
    name: '正弦波',
    icon: '∿',
    category: 'basic',
    defaultParams: {
      duration: 120,
      startValue: 3,
      endValue: 3,
      amplitude: 0.9,
      frequency: 2, // 2个周期
      phase: 0,
    },
  },
  {
    type: 'exponential',
    name: '指数增长',
    icon: '📈',
    category: 'basic',
    defaultParams: {
      duration: 120,
      startValue: 2,
      endValue: 4,
      rate: 0.05,
    },
  },
  {
    type: 'exponentialDecay',
    name: '指数衰减',
    icon: '📉',
    category: 'basic',
    defaultParams: {
      duration: 120,
      startValue: 4,
      endValue: 2,
      rate: 0.05,
    },
  },
  {
    type: 'logarithmic',
    name: '对数增长',
    icon: '📊',
    category: 'basic',
    defaultParams: {
      duration: 120,
      startValue: 2,
      endValue: 4,
      rate: 0.5,
    },
  },
  {
    type: 'sigmoid',
    name: 'S型曲线',
    icon: 'S',
    category: 'basic',
    defaultParams: {
      duration: 120,
      startValue: 2,
      endValue: 4,
      rate: 10,
    },
  },
  {
    type: 'parabola',
    name: '抛物线',
    icon: '∩',
    category: 'basic',
    defaultParams: {
      duration: 120,
      startValue: 2,
      endValue: 2,
      maxValue: 4,
      maxPosition: 0.5,
    },
  },
  {
    type: 'step',
    name: '阶梯函数',
    icon: '▦',
    category: 'basic',
    defaultParams: {
      duration: 120,
      startValue: 2,
      endValue: 4,
      stepCount: 5,
    },
  },
  {
    type: 'sawtooth',
    name: '锯齿波',
    icon: '⩗',
    category: 'basic',
    defaultParams: {
      duration: 120,
      startValue: 3,
      endValue: 3,
      amplitude: 0.9,
      frequency: 3,
    },
  },
  {
    type: 'square',
    name: '方波',
    icon: '▭',
    category: 'basic',
    defaultParams: {
      duration: 120,
      startValue: 3,
      endValue: 3,
      amplitude: 0.9,
      frequency: 4,
    },
  },
  {
    type: 'bell',
    name: '钟形曲线',
    icon: '⛰',
    category: 'basic',
    defaultParams: {
      duration: 120,
      startValue: 2,
      endValue: 2,
      maxValue: 4,
      center: 0.5,
      width: 0.2,
    },
  },
  {
    type: 'doubleWave',
    name: '双波浪',
    icon: '≈',
    category: 'basic',
    defaultParams: {
      duration: 120,
      startValue: 3,
      endValue: 3,
      amplitude: 0.9,
      frequency: 4,
    },
  },
  // 行业模板 - 冷链验证曲线
  {
    type: 'precool',
    name: '预冷曲线',
    icon: '❄️',
    category: 'industry',
    defaultParams: {
      duration: 240, // 4小时
      startValue: 25,
      endValue: 5,
      rate: 0.02, // k=0.02
      targetTemp: 5,
      // 空载 + 稳定波动范围
      loadRatio: 0,       // 空载
      noiseLevel: 0.5,    // 稳定阶段波动 ±0.5℃
    },
  },
  {
    type: 'preheat',
    name: '预热曲线',
    icon: '🔥',
    category: 'industry',
    defaultParams: {
      duration: 180, // 3小时
      startValue: 5,
      endValue: 20,
      rate: 0.018, // k=0.018
      targetTemp: 20,
      // 空载 + 稳定波动范围
      loadRatio: 0,       // 空载
      noiseLevel: 0.5,    // 稳定阶段波动 ±0.5℃
    },
  },
  {
    type: 'steadyState',
    name: '保温稳态曲线',
    icon: '➖',
    category: 'industry',
    defaultParams: {
      duration: 1440, // 24小时
      startValue: 5,
      endValue: 5,
      noiseLevel: 0.5, // ±0.5℃波动
    },
  },
  {
    type: 'singleDoor',
    name: '单次开门扰动',
    icon: '🚪',
    category: 'industry',
    defaultParams: {
      duration: 120, // 2小时
      startValue: 5,
      endValue: 5,
      envTemp: 28,
      openDuration: 1, // 1分钟
      responseTime: 0.1, // τ1=0.1h
      recoveryTime: 0.25, // τ2=0.25h
    },
  },
  {
    type: 'multiDoor',
    name: '多次开门扰动',
    icon: '🚪🚪',
    category: 'industry',
    defaultParams: {
      duration: 360, // 6小时
      startValue: 5,
      endValue: 5,
      envTemp: 28,
      openDuration: 1, // 每次1分钟
      openCount: 4,
      openInterval: 90, // 1.5小时间隔
      responseTime: 0.1,
      recoveryTime: 0.25,
    },
  },
  {
    type: 'fullLoad',
    name: '满载曲线',
    icon: '📦',
    category: 'industry',
    defaultParams: {
      duration: 480, // 8小时
      startValue: 25,
      endValue: -18,
      rate: 0.015, // k=0.015
      targetTemp: -18,
      loadRatio: 1.0, // 100%负载
      // 满载场景下整体波动可选参数，默认给一个较小噪声，后续可按需调大/调小
      noiseLevel: 0.5,
    },
  },
  {
    type: 'halfLoad',
    name: '半载曲线',
    icon: '📦',
    category: 'industry',
    defaultParams: {
      duration: 360, // 6小时
      startValue: 25,
      endValue: 5,
      rate: 0.018, // k=0.018
      targetTemp: 5,
      loadRatio: 0.5, // 50%负载
      // 半载稳态波动
      noiseLevel: 0.5,
    },
  },
  {
    type: 'freeze',
    name: '冷冻曲线(-18℃)',
    icon: '🧊',
    category: 'industry',
    defaultParams: {
      duration: 600, // 10小时
      startValue: 25,
      endValue: -18,
      rate: 0.012, // k=0.012
      targetTemp: -18,
      loadRatio: 0.5,
      // 低温稳定波动 ±1℃
      noiseLevel: 1.0,
    },
  },
  {
    type: 'deepFreeze',
    name: '深冷曲线(-25℃)',
    icon: '❄️',
    category: 'industry',
    defaultParams: {
      duration: 720, // 12小时
      startValue: 25,
      endValue: -25,
      rate: 0.01, // k=0.01
      targetTemp: -25,
      loadRatio: 0.5,
      // 深冷稳定波动 ±1℃
      noiseLevel: 1.0,
    },
  },
  {
    type: 'highTempStress',
    name: '高温应激曲线',
    icon: '🌡️',
    category: 'industry',
    defaultParams: {
      duration: 480, // 8小时
      startValue: 5,
      endValue: 5,
      envTemp: 38,
      targetTemp: 5,
      // 高温应激下的允许波动范围 ±0.8℃
      noiseLevel: 0.8,
    },
  },
  {
    type: 'lowTempStress',
    name: '低温应激曲线',
    icon: '🌡️',
    category: 'industry',
    defaultParams: {
      duration: 480, // 8小时
      startValue: 15,
      endValue: 15,
      envTemp: -20,
      targetTemp: 15,
      // 低温应激下的允许波动范围 ±0.8℃
      noiseLevel: 0.8,
    },
  },
  {
    type: 'powerLossCool',
    name: '断电续航(制冷)',
    icon: '⚡',
    category: 'industry',
    defaultParams: {
      duration: 360, // 6小时
      startValue: 5,
      endValue: 10,
      rate: 0.5, // 上升速率≤0.5℃/h
      loadRatio: 0.5,
      // 断电续航过程中的小幅波动
      noiseLevel: 0.3,
    },
  },
  {
    type: 'powerLossHeat',
    name: '断电续航(制热)',
    icon: '⚡',
    category: 'industry',
    defaultParams: {
      duration: 360, // 6小时
      startValue: 20,
      endValue: 10,
      rate: 0.5, // 下降速率≤0.5℃/h
      loadRatio: 0.5,
      // 断电续航过程中的小幅波动
      noiseLevel: 0.3,
    },
  },
  {
    type: 'cycleOnOffCool',
    name: '循环启停(制冷)',
    icon: '🔄',
    category: 'industry',
    defaultParams: {
      duration: 1440, // 24小时
      startValue: 25,
      endValue: 5,
      rate: 0.02,
      targetTemp: 5,
      frequency: 4, // 4次启停
      amplitude: 0.05, // 波动±5%
      // 循环启停下稳态波动
      noiseLevel: 0.5,
    },
  },
  {
    type: 'cycleOnOffHeat',
    name: '循环启停(制热)',
    icon: '🔄',
    category: 'industry',
    defaultParams: {
      duration: 1440, // 24小时
      startValue: 5,
      endValue: 20,
      rate: 0.018,
      targetTemp: 20,
      frequency: 4, // 4次启停
      amplitude: 0.05, // 波动±5%
      // 循环启停下稳态波动
      noiseLevel: 0.5,
    },
  },
  {
    type: 'dualZone',
    name: '双温区曲线',
    icon: '🌡️🌡️',
    category: 'industry',
    defaultParams: {
      duration: 1440, // 24小时
      startValue: 5,
      endValue: 5,
      targetTemp: 5,
      couplingCoeff: 0.05, // α=0.05
      loadRatio: 0.5,
      // 冷藏区波动 ±0.5℃、冷冻区波动 ±1℃ 的整体控制参数
      noiseLevel: 0.5,
    },
  },
  {
    type: 'tripleZone',
    name: '三温区曲线',
    icon: '🌡️🌡️🌡️',
    category: 'industry',
    defaultParams: {
      duration: 1440, // 24小时
      startValue: 2,
      endValue: 2,
      targetTemp: 2,
      couplingCoeff: 0.05, // α=0.05
      loadRatio: 0.5,
      // 多温层整体波动控制（低温区可通过曲线参数单独调低）
      noiseLevel: 0.5,
    },
  },
];

// 将 Date 对象转换为本地时间的 datetime-local 格式字符串
const dateToLocalString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// 将 datetime-local 格式字符串转换为 Date 对象（本地时间）
const localStringToDate = (localString: string): Date => {
  // datetime-local 格式：YYYY-MM-DDTHH:mm
  // 直接解析为本地时间
  const [datePart, timePart] = localString.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes);
};

const TrendGenerator = ({
  isOpen,
  onClose,
  onGenerate,
  taskId,
  defaultStartTime,
}: TrendGeneratorProps) => {
  const [activeTab, setActiveTab] = useState<'temperature' | 'humidity'>('temperature');
  const [templateCategory, setTemplateCategory] = useState<'basic' | 'industry' | 'custom'>('basic');
  const [savedTemplates, setSavedTemplates] = useState<Array<{
    _id: string;
    name: string;
    description?: string;
    segments: Record<'temperature' | 'humidity', TrendSegment[]>;
    startTime?: number;
    isPublic: boolean;
    userId: string;
  }>>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [saveTemplateDescription, setSaveTemplateDescription] = useState('');
  const [saveTemplateIsPublic, setSaveTemplateIsPublic] = useState(false);
  const [alert, setAlert] = useState<{ isOpen: boolean; message: string; type?: 'success' | 'error' | 'info' | 'warning' }>({
    isOpen: false,
    message: '',
    type: 'info',
  });
  const [confirm, setConfirm] = useState<{ isOpen: boolean; message: string; onConfirm: () => void }>({
    isOpen: false,
    message: '',
    onConfirm: () => {},
  });
  const [startTime, setStartTime] = useState<Date>(() => {
    if (defaultStartTime) {
      return new Date(defaultStartTime);
    }
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return now;
  });
  const [segments, setSegments] = useState<Record<'temperature' | 'humidity', TrendSegment[]>>({
    temperature: [],
    humidity: [],
  });
  const [editingSegment, setEditingSegment] = useState<{
    tab: 'temperature' | 'humidity';
    segmentId: string;
  } | null>(null);
  const [currentStep, setCurrentStep] = useState<'builder' | 'generation'>('builder');
  const [availableDevices, setAvailableDevices] = useState<Device[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [offsetInputs, setOffsetInputs] = useState<Record<string, string>>({});
  const [isDeviceListLoading, setIsDeviceListLoading] = useState(false);
  const [deviceListError, setDeviceListError] = useState('');
  const [draggingSegment, setDraggingSegment] = useState<{
    tab: 'temperature' | 'humidity';
    segmentId: string;
    startX: number;
    originalStartTime: number;
  } | null>(null);
  const [resizingSegment, setResizingSegment] = useState<{
    tab: 'temperature' | 'humidity';
    segmentId: string;
    startX: number;
    originalDuration: number;
    originalStartTime: number;
    isRightEdge: boolean;
  } | null>(null);
  const chartRef = useRef<HighchartsReactRefObject | null>(null);
  const generationChartRef = useRef<HighchartsReactRefObject | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const pixelsPerMinuteRef = useRef<number>(2); // 每分钟2像素
  const deviceIdCollator = useMemo(
    () =>
      new Intl.Collator(['zh-Hans-CN', 'en'], {
        numeric: true,
        sensitivity: 'base',
      }),
    []
  );
  const handleClose = useCallback(() => {
    setCurrentStep('builder');
    setSelectedDeviceIds([]);
    setAvailableDevices([]);
    setOffsetInputs({});
    setDeviceListError('');
    setIsDeviceListLoading(false);
    onClose();
  }, [onClose]);
  const loadDeviceList = useCallback(async () => {
    setIsDeviceListLoading(true);
    setDeviceListError('');
    try {
      const cachedIds = await getCachedDevices(taskId);
      const cachedDevices: Device[] = cachedIds.map((deviceId) => ({
        deviceId,
      }));

      let serverDevices: Device[] = [];
      try {
        const res = await fetch(`/api/tasks/${taskId}/data?type=devices`);
        if (res.ok) {
          const result = await res.json();
          serverDevices = result.devices || [];
        } else {
          setDeviceListError('获取服务器设备列表失败，将仅显示本地缓存');
        }
      } catch (error) {
        console.error('加载服务器设备失败:', error);
        setDeviceListError('加载服务器设备失败，将仅显示本地缓存');
      }

      const deviceMap = new Map<string, Device>();
      serverDevices.forEach((device) => deviceMap.set(device.deviceId, device));
      cachedDevices.forEach((device) => {
        if (!deviceMap.has(device.deviceId)) {
          deviceMap.set(device.deviceId, device);
        }
      });

      const merged = Array.from(deviceMap.values()).sort((a, b) =>
        deviceIdCollator.compare(a.deviceId, b.deviceId)
      );
      setAvailableDevices(merged);
      if (merged.length === 0) {
        setDeviceListError('暂无设备，请先在数据页面的设备管理中创建');
      }
    } finally {
      setIsDeviceListLoading(false);
    }
  }, [taskId, deviceIdCollator]);

  // 加载保存的趋势模版
  const loadSavedTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/trend-templates');
      if (res.ok) {
        const data = await res.json();
        setSavedTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('加载趋势模版失败:', error);
    }
  }, []);

  // 保存趋势模版
  const handleSaveTemplate = useCallback(async () => {
    if (!saveTemplateName.trim()) {
      setAlert({ isOpen: true, message: '请输入模版名称', type: 'warning' });
      return;
    }

    try {
      const res = await fetch('/api/trend-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveTemplateName.trim(),
          description: saveTemplateDescription.trim() || undefined,
          segments: segments,
          isPublic: saveTemplateIsPublic,
          startTime: startTime.getTime(),
        }),
      });

      if (res.ok) {
        await loadSavedTemplates();
        setShowSaveDialog(false);
        setSaveTemplateName('');
        setSaveTemplateDescription('');
        setSaveTemplateIsPublic(false);
        setAlert({ isOpen: true, message: '保存成功', type: 'success' });
      } else {
        const data = await res.json();
        setAlert({ isOpen: true, message: data.error || '保存失败', type: 'error' });
      }
    } catch (error) {
      console.error('保存趋势模版失败:', error);
      setAlert({ isOpen: true, message: '保存失败', type: 'error' });
    }
  }, [saveTemplateName, saveTemplateDescription, saveTemplateIsPublic, segments, startTime, loadSavedTemplates]);

  // 加载趋势模版到编辑器
  const handleLoadTemplate = useCallback((template: typeof savedTemplates[0]) => {
    setSegments(template.segments);
    if (template.startTime) {
      setStartTime(new Date(template.startTime));
    }
    setShowSaveDialog(false);
  }, []);

  // 删除趋势模版
  const handleDeleteTemplate = useCallback((templateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirm({
      isOpen: true,
      message: '确定要删除这个模版吗？',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/trend-templates?id=${templateId}`, {
            method: 'DELETE',
          });

          if (res.ok) {
            await loadSavedTemplates();
            setAlert({ isOpen: true, message: '删除成功', type: 'success' });
          } else {
            const data = await res.json();
            setAlert({ isOpen: true, message: data.error || '删除失败', type: 'error' });
          }
        } catch (error) {
          console.error('删除趋势模版失败:', error);
          setAlert({ isOpen: true, message: '删除失败', type: 'error' });
        }
      },
    });
  }, [loadSavedTemplates]);

  // 初始化时加载保存的模版
  useEffect(() => {
    if (isOpen) {
      loadSavedTemplates();
    }
  }, [isOpen, loadSavedTemplates]);

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep('builder');
      setSelectedDeviceIds([]);
      setAvailableDevices([]);
      setOffsetInputs({});
      setDeviceListError('');
      setIsDeviceListLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && currentStep === 'generation' && availableDevices.length === 0 && !isDeviceListLoading) {
      loadDeviceList();
    }
  }, [isOpen, currentStep, availableDevices.length, isDeviceListLoading, loadDeviceList]);

  useEffect(() => {
    if (availableDevices.length === 0) {
      setSelectedDeviceIds([]);
      setOffsetInputs({});
      return;
    }
    setSelectedDeviceIds((prev) =>
      prev.filter((deviceId) => availableDevices.some((device) => device.deviceId === deviceId))
    );
    setOffsetInputs((prev) => {
      const next: Record<string, string> = {};
      availableDevices.forEach((device) => {
        next[device.deviceId] = prev[device.deviceId] ?? '0.0';
      });
      return next;
    });
  }, [availableDevices]);

  // 生成数据点
  const generateDataPoints = useCallback(
    (tab: 'temperature' | 'humidity'): Array<{ timestamp: number; value: number }> => {
      const tabSegments = segments[tab];
      if (tabSegments.length === 0) return [];

      const points: Array<{ timestamp: number; value: number }> = [];
      const startTimestamp = startTime.getTime();

      tabSegments.forEach((segment) => {
        const segmentStartTime = startTimestamp + segment.startTime * 60 * 1000;
        const segmentEndTime = segmentStartTime + segment.duration * 60 * 1000;
        const pointCount = Math.max(2, Math.ceil(segment.duration / 5)); // 每5分钟一个点

        for (let i = 0; i <= pointCount; i++) {
          const progress = i / pointCount;
          const timestamp = segmentStartTime + progress * segment.duration * 60 * 1000;

          let value: number;
          const { startValue, endValue } = segment.params;
          const baseValue = (startValue + endValue) / 2;
          const range = Math.abs(endValue - startValue);

          switch (segment.type) {
            case 'up':
              // 线性上升
              value = startValue + (endValue - startValue) * progress;
              break;

            case 'down':
              // 线性下降
              value = startValue - (startValue - endValue) * progress;
              break;

            case 'wave': {
              // 单波浪
              const maxPos = segment.params.maxPosition ?? 0.5;
              if (progress <= maxPos) {
                const localProgress = progress / maxPos;
                value = startValue + (segment.params.maxValue! - startValue) * localProgress;
              } else {
                const localProgress = (progress - maxPos) / (1 - maxPos);
                value = segment.params.maxValue! - (segment.params.maxValue! - endValue) * localProgress;
              }
              break;
            }

            case 'sine': {
              // 正弦波
              const amplitude = segment.params.amplitude ?? 0.9;
              const frequency = segment.params.frequency ?? 2;
              const phase = segment.params.phase ?? 0;
              value = baseValue + amplitude * Math.sin(2 * Math.PI * frequency * progress + phase);
              break;
            }

            case 'cosine': {
              // 余弦波
              const amplitude = segment.params.amplitude ?? 0.9;
              const frequency = segment.params.frequency ?? 2;
              const phase = segment.params.phase ?? Math.PI / 2;
              value = baseValue + amplitude * Math.cos(2 * Math.PI * frequency * progress + phase);
              break;
            }

            case 'exponential': {
              // 指数增长: y = start * e^(rate * x)
              const rate = segment.params.rate ?? 0.05;
              value = startValue * Math.exp(rate * progress * segment.duration);
              // 归一化到 endValue
              const finalValue = startValue * Math.exp(rate * segment.duration);
              value = startValue + (endValue - startValue) * (value - startValue) / (finalValue - startValue);
              break;
            }

            case 'exponentialDecay': {
              // 指数衰减: y = start * e^(-rate * x)
              const rate = segment.params.rate ?? 0.05;
              value = startValue * Math.exp(-rate * progress * segment.duration);
              // 归一化到 endValue
              const finalValue = startValue * Math.exp(-rate * segment.duration);
              value = startValue - (startValue - endValue) * (1 - (value / startValue)) / (1 - (finalValue / startValue));
              break;
            }

            case 'logarithmic': {
              // 对数增长: y = start + rate * ln(1 + x)
              const rate = segment.params.rate ?? 2;
              const normalizedProgress = progress * segment.duration;
              value = startValue + rate * Math.log(1 + normalizedProgress);
              // 归一化到 endValue
              const finalValue = startValue + rate * Math.log(1 + segment.duration);
              value = startValue + (endValue - startValue) * (value - startValue) / (finalValue - startValue);
              break;
            }

            case 'sigmoid': {
              // S型曲线: y = start + (end - start) / (1 + e^(-rate * (x - 0.5)))
              const rate = segment.params.rate ?? 10;
              const sigmoid = 1 / (1 + Math.exp(-rate * (progress - 0.5)));
              value = startValue + (endValue - startValue) * sigmoid;
              break;
            }

            case 'parabola': {
              // 抛物线: y = -a(x-0.5)^2 + max
              const maxPos = segment.params.maxPosition ?? 0.5;
              const maxVal = segment.params.maxValue ?? Math.max(startValue, endValue);
              const a = 4 * (maxVal - Math.min(startValue, endValue));
              value = -a * Math.pow(progress - maxPos, 2) + maxVal;
              // 确保起点和终点正确
              if (progress === 0) value = startValue;
              if (progress === 1) value = endValue;
              break;
            }

            case 'step': {
              // 阶梯函数
              const stepCount = segment.params.stepCount ?? 5;
              const stepIndex = Math.floor(progress * stepCount);
              const stepProgress = (progress * stepCount) % 1;
              const stepSize = (endValue - startValue) / stepCount;
              value = startValue + stepIndex * stepSize + stepSize * stepProgress;
              break;
            }

            case 'sawtooth': {
              // 锯齿波
              const amplitude = segment.params.amplitude ?? 0.9;
              const frequency = segment.params.frequency ?? 3;
              const phase = (progress * frequency) % 1;
              value = baseValue + amplitude * (phase - 0.5);
              break;
            }

            case 'square': {
              // 方波
              const amplitude = segment.params.amplitude ?? 0.9;
              const frequency = segment.params.frequency ?? 4;
              const phase = (progress * frequency) % 1;
              value = baseValue + amplitude * (phase < 0.5 ? 0.5 : -0.5);
              break;
            }

            case 'bell': {
              // 钟形曲线（高斯函数）
              const maxVal = segment.params.maxValue ?? Math.max(startValue, endValue);
              const center = segment.params.center ?? 0.5;
              const width = segment.params.width ?? 0.2;
              const gaussian = Math.exp(-Math.pow((progress - center) / width, 2) / 2);
              value = Math.min(startValue, endValue) + (maxVal - Math.min(startValue, endValue)) * gaussian;
              break;
            }

            case 'doubleWave': {
              // 双波浪
              const amplitude = segment.params.amplitude ?? 0.9;
              const frequency = segment.params.frequency ?? 4;
              value = baseValue + amplitude * Math.sin(2 * Math.PI * frequency * progress) * Math.cos(2 * Math.PI * frequency * progress);
              break;
            }

            case 'precool':
            case 'freeze':
            case 'deepFreeze':
            case 'fullLoad':
            case 'halfLoad': {
              // 预冷/冷冻/深冷/满载/半载：指数衰减
              const rate = segment.params.rate ?? 0.02;
              value = startValue * Math.exp(-rate * progress * segment.duration);
              const finalValue = startValue * Math.exp(-rate * segment.duration);
              value = startValue - (startValue - endValue) * (1 - (value / startValue)) / (1 - (finalValue / startValue));
              break;
            }

            case 'preheat': {
              // 预热：指数上升
              const rate = segment.params.rate ?? 0.018;
              value = startValue * Math.exp(rate * progress * segment.duration);
              const finalValue = startValue * Math.exp(rate * segment.duration);
              value = startValue + (endValue - startValue) * (value - startValue) / (finalValue - startValue);
              break;
            }

            case 'steadyState': {
              // 保温稳态：基础值 + 小幅度噪声
              const noiseLevel = segment.params.noiseLevel ?? 0.5;
              value = baseValue + (Math.random() - 0.5) * noiseLevel * 2;
              break;
            }

            case 'singleDoor': {
              // 单次开门扰动：阶跃+指数恢复
              const envTemp = segment.params.envTemp ?? 28;
              const openDuration = (segment.params.openDuration ?? 1) / segment.duration;
              const responseTime = (segment.params.responseTime ?? 0.1) * 60 / segment.duration;
              const recoveryTime = (segment.params.recoveryTime ?? 0.25) * 60 / segment.duration;
              if (progress < openDuration) {
                // 开门阶段：快速上升
                value = startValue + (envTemp - startValue) * (1 - Math.exp(-progress / responseTime));
              } else {
                // 恢复阶段：指数下降
                const openEndValue = startValue + (envTemp - startValue) * (1 - Math.exp(-openDuration / responseTime));
                const recoveryProgress = (progress - openDuration) / (1 - openDuration);
                value = openEndValue - (openEndValue - endValue) * (1 - Math.exp(-recoveryProgress / recoveryTime));
              }
              break;
            }

            case 'multiDoor': {
              // 多次开门扰动：多个阶跃+恢复
              const envTemp = segment.params.envTemp ?? 28;
              const openCount = segment.params.openCount ?? 4;
              const openInterval = (segment.params.openInterval ?? 90) / segment.duration;
              const openDuration = (segment.params.openDuration ?? 1) / segment.duration;
              const responseTime = (segment.params.responseTime ?? 0.1) * 60 / segment.duration;
              const recoveryTime = (segment.params.recoveryTime ?? 0.25) * 60 / segment.duration;
              
              let currentValue = startValue;
              for (let i = 0; i < openCount; i++) {
                const openStart = i * openInterval;
                const openEnd = openStart + openDuration;
                if (progress >= openStart && progress <= openEnd) {
                  // 开门阶段
                  const localProgress = (progress - openStart) / openDuration;
                  currentValue = startValue + (envTemp - startValue) * (1 - Math.exp(-localProgress / responseTime));
                  break;
                } else if (progress > openEnd && (i === openCount - 1 || progress < (i + 1) * openInterval)) {
                  // 恢复阶段
                  const recoveryProgress = (progress - openEnd) / Math.min(openInterval - openDuration, 1 - openEnd);
                  const peakValue = startValue + (envTemp - startValue) * (1 - Math.exp(-1 / responseTime));
                  currentValue = peakValue - (peakValue - startValue) * (1 - Math.exp(-recoveryProgress / recoveryTime));
                  break;
                }
              }
              value = currentValue;
              break;
            }

            case 'highTempStress':
            case 'lowTempStress': {
              // 高温/低温应激：阶跃响应+恢复
              const envTemp = segment.params.envTemp ?? (segment.type === 'highTempStress' ? 38 : -20);
              const targetTemp = segment.params.targetTemp ?? startValue;
              const responseTime = 0.1;
              const recoveryTime = 1.0; // 恢复时间常数（小时）
              const recoveryTimeNormalized = recoveryTime * 60 / segment.duration;
              
              if (progress < 0.1) {
                // 快速响应阶段
                const response = (envTemp - startValue) * 0.3;
                value = startValue + response * (1 - Math.exp(-progress / responseTime));
              } else {
                // 恢复阶段
                const peakValue = startValue + (envTemp - startValue) * 0.3;
                const recoveryProgress = (progress - 0.1) / 0.9;
                value = peakValue - (peakValue - targetTemp) * (1 - Math.exp(-recoveryProgress / recoveryTimeNormalized));
              }
              break;
            }

            case 'powerLossCool': {
              // 断电续航(制冷)：线性上升
              value = startValue + (endValue - startValue) * progress;
              break;
            }

            case 'powerLossHeat': {
              // 断电续航(制热)：线性下降
              value = startValue - (startValue - endValue) * progress;
              break;
            }

            case 'cycleOnOffCool':
            case 'cycleOnOffHeat': {
              // 循环启停：周期性指数变化
              const frequency = segment.params.frequency ?? 4;
              const rate = segment.params.rate ?? (segment.type === 'cycleOnOffCool' ? 0.02 : 0.018);
              const amplitude = segment.params.amplitude ?? 0.05;
              const cycleProgress = (progress * frequency) % 1;
              const cycleIndex = Math.floor(progress * frequency);
              
              if (cycleProgress < 0.3) {
                // 预冷/预热阶段
                const localProgress = cycleProgress / 0.3;
                if (segment.type === 'cycleOnOffCool') {
                  value = startValue * Math.exp(-rate * localProgress * 60);
                  const finalValue = startValue * Math.exp(-rate * 60);
                  value = startValue - (startValue - endValue) * (1 - (value / startValue)) / (1 - (finalValue / startValue));
                } else {
                  value = startValue * Math.exp(rate * localProgress * 60);
                  const finalValue = startValue * Math.exp(rate * 60);
                  value = startValue + (endValue - startValue) * (value - startValue) / (finalValue - startValue);
                }
                // 添加波动
                value += (Math.random() - 0.5) * amplitude * 2;
              } else {
                // 稳定阶段
                value = endValue + (Math.random() - 0.5) * amplitude * 2;
              }
              break;
            }

            case 'dualZone':
            case 'tripleZone': {
              // 多温区：稳态+小波动（使用伪随机确保预览稳定）
              const noiseLevel = 0.5;
              // 使用简单的伪随机函数，基于索引生成
              const seed = (i * 9301 + 49297) % 233280;
              const random = seed / 233280;
              value = baseValue + (random - 0.5) * noiseLevel * 2;
              break;
            }

            default:
              value = startValue;
          }

          points.push({
            timestamp,
            value: Math.round(value * 10) / 10, // 保留1位小数
          });
        }
      });

      return points.sort((a, b) => a.timestamp - b.timestamp);
    },
    [segments, startTime]
  );

  const temperaturePoints = useMemo(() => generateDataPoints('temperature'), [generateDataPoints]);
  const humidityPoints = useMemo(() => generateDataPoints('humidity'), [generateDataPoints]);

  // 图表数据
  const chartData = useMemo(() => {
    const points = activeTab === 'temperature' ? temperaturePoints : humidityPoints;
    return points.map((p) => [p.timestamp, p.value]);
  }, [activeTab, temperaturePoints, humidityPoints]);

  // 图表容器引用
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const generationChartContainerRef = useRef<HTMLDivElement | null>(null);
  const builderMiddlePanStateRef = useRef<{
    isPanning: boolean;
    startX: number;
    min: number;
    max: number;
  }>({
    isPanning: false,
    startX: 0,
    min: 0,
    max: 0,
  });
  const generationMiddlePanStateRef = useRef<{
    isPanning: boolean;
    startX: number;
    min: number;
    max: number;
  }>({
    isPanning: false,
    startX: 0,
    min: 0,
    max: 0,
  });

  // 确保图表在容器大小变化时重新调整
  useEffect(() => {
    if (currentStep !== 'builder') {
      return;
    }

    const container = chartContainerRef.current;
    if (!container) return;

    const updateChartSize = () => {
      const chartInstance = chartRef.current?.chart;
      if (!chartInstance || (chartInstance as any).destroyed || !chartInstance.options) {
        return;
      }
      const height = container.clientHeight;
      if (height > 0) {
        chartInstance.setSize(null, height, false);
      }
    };

    // 初始设置
    updateChartSize();

    // 监听容器大小变化
    const resizeObserver = new ResizeObserver(updateChartSize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [activeTab, chartData, currentStep]);

  // 生成器顶部主图：支持鼠标中键（button === 1）拖动平移 X 轴
  useEffect(() => {
    if (!isOpen) return;

    const chartInstance = chartRef.current?.chart;
    const container = chartInstance?.container;
    if (!container || !chartInstance) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 1) return; // 只处理中键
      // 调试日志：确认中键事件是否触发
      console.log('[TrendGenerator] Builder chart middle mouse down', {
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
      });
      if (!chartInstance.xAxis || !chartInstance.xAxis.length) return;

      const axis = chartInstance.xAxis[0];
      const ext = axis.getExtremes();
      if (ext.min == null || ext.max == null) return;

      event.preventDefault();
      builderMiddlePanStateRef.current = {
        isPanning: true,
        startX: event.clientX,
        min: ext.min,
        max: ext.max,
      };
    };

    const handleMouseMove = (event: MouseEvent) => {
      const state = builderMiddlePanStateRef.current;
      if (!state.isPanning) return;

      if (!chartInstance.xAxis || !chartInstance.xAxis.length) return;

      const axis = chartInstance.xAxis[0];
      if (state.min == null || state.max == null) return;

      const deltaPx = event.clientX - state.startX;
      const startMinPx = axis.toPixels(state.min);
      const newMinVal = axis.toValue(startMinPx - deltaPx);
      const diff = newMinVal - state.min;

      const newMin = state.min + diff;
      const newMax = state.max + diff;
      axis.setExtremes(newMin, newMax, false, false, { trigger: 'pan' as any });
      chartInstance.redraw(false);
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button !== 1) return;
      console.log('[TrendGenerator] Builder chart middle mouse up', {
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
      });
      builderMiddlePanStateRef.current.isPanning = false;
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      builderMiddlePanStateRef.current.isPanning = false;
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isOpen]);

  // 图表配置
  const chartOptions = useMemo<Highcharts.Options>(
    () => ({
      chart: {
        type: 'spline',
        backgroundColor: 'transparent',
        height: null,
        animation: false,
        spacing: [8, 12, 8, 12],
        reflow: true,
        zooming: {
          type: 'x',
          mouseWheel: {
            enabled: true,
          },
        } as any,
        panning: {
          // 关闭内置左键拖动平移，改用自定义中键拖动
          enabled: false,
        },
      },
      time: {
        useUTC: false, // 使用本地时间，而不是 UTC
      } as any,
      title: { text: undefined },
      xAxis: {
        type: 'datetime',
        title: { text: '时间' },
      },
      yAxis: {
        title: { text: activeTab === 'temperature' ? '温度 (°C)' : '湿度 (%)' },
      },
      tooltip: {
        xDateFormat: '%Y-%m-%d %H:%M',
        valueSuffix: activeTab === 'temperature' ? ' °C' : ' %',
      },
      legend: { enabled: false },
      credits: { enabled: false },
      series: [
        {
          type: 'spline',
          name: activeTab === 'temperature' ? '温度' : '湿度',
          data: chartData,
          color: activeTab === 'temperature' ? '#3b82f6' : '#10b981',
        },
      ],
    }),
    [activeTab, chartData]
  );
  const getOffsetValue = useCallback(
    (deviceId: string) => {
      const rawValue = offsetInputs[deviceId];
      if (!rawValue || rawValue === '-' || rawValue === '.' || rawValue === '-.') {
        return 0;
      }
      const parsed = Number.parseFloat(rawValue);
      if (Number.isNaN(parsed)) {
        return 0;
      }
      return Math.round(parsed * 10) / 10;
    },
    [offsetInputs]
  );

  // 为每个设备在原趋势基础上增加轻微随机扰动，保证合理性和可重复性
  const getDeviceNoise = useCallback((deviceId: string, timestamp: number, offset: number) => {
    // 根据 deviceId 和时间戳生成稳定的伪随机数
    let hash = 0;
    for (let i = 0; i < deviceId.length; i++) {
      hash = (hash * 31 + deviceId.charCodeAt(i)) | 0;
    }
    const seed = (hash ^ Math.floor(timestamp / (60 * 1000))) >>> 0; // 按分钟粒度
    const random = (seed % 10000) / 10000; // [0,1)

    // 基础扰动幅度 0.2℃，偏移越大，扰动略增，但整体控制在 ±0.5℃ 以内
    const baseAmplitude = 0.2;
    const extra = Math.min(0.3, Math.abs(offset) * 0.05);
    const amplitude = baseAmplitude + extra;

    return (random - 0.5) * 2 * amplitude; // [-amplitude, amplitude]
  }, []);
  const dataGenerationSeries = useMemo<Highcharts.SeriesOptionsType[]>(() => {
    const basePoints = activeTab === 'temperature' ? temperaturePoints : humidityPoints;
    if (basePoints.length === 0 || selectedDeviceIds.length === 0) {
      return [];
    }

    return selectedDeviceIds.map((deviceId, index) => {
      const offset = getOffsetValue(deviceId);
      const labelSuffix =
        offset !== 0 ? ` (偏移${offset > 0 ? '+' : ''}${offset.toFixed(1)})` : '';

      return {
        type: 'spline',
        name: `${deviceId}${labelSuffix}`,
        data: basePoints.map((point) => [
          point.timestamp,
          Math.round((point.value + offset + getDeviceNoise(deviceId, point.timestamp, offset)) * 10) / 10,
        ]),
        color: DEVICE_COLORS[index % DEVICE_COLORS.length],
        lineWidth: 2,
      } as Highcharts.SeriesSplineOptions;
    });
  }, [activeTab, temperaturePoints, humidityPoints, selectedDeviceIds, getOffsetValue, getDeviceNoise]);

  const dataGenerationChartOptions = useMemo<Highcharts.Options>(
    () => ({
      chart: {
        type: 'spline',
        backgroundColor: 'transparent',
        height: null,
        animation: false,
        spacing: [8, 12, 8, 12],
        reflow: true,
        zooming: {
          type: 'x',
          mouseWheel: {
            enabled: true,
          },
        } as any,
        panning: {
          // 同样关闭内置左键平移，仅保留中键自定义平移
          enabled: false,
        },
      },
      time: {
        useUTC: false,
      } as any,
      title: { text: undefined },
      xAxis: {
        type: 'datetime',
        title: { text: '时间' },
      },
      yAxis: {
        title: { text: activeTab === 'temperature' ? '温度 (°C)' : '湿度 (%)' },
      },
      tooltip: {
        shared: true,
        xDateFormat: '%Y-%m-%d %H:%M',
        valueSuffix: activeTab === 'temperature' ? ' °C' : ' %',
      },
      legend: { enabled: true },
      credits: { enabled: false },
      series: dataGenerationSeries,
    }),
    [activeTab, dataGenerationSeries]
  );

  // 数据生成页右侧预览图：支持鼠标中键拖动平移 X 轴
  useEffect(() => {
    if (!isOpen || currentStep !== 'generation') return;

    const chartInstance = generationChartRef.current?.chart;
    const container = chartInstance?.container;
    if (!container || !chartInstance) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 1) return; // 只处理中键
      console.log('[TrendGenerator] Generation chart middle mouse down', {
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
      });
      if (!chartInstance.xAxis || !chartInstance.xAxis.length) return;

      const axis = chartInstance.xAxis[0];
      const ext = axis.getExtremes();
      if (ext.min == null || ext.max == null) return;

      event.preventDefault();
      generationMiddlePanStateRef.current = {
        isPanning: true,
        startX: event.clientX,
        min: ext.min,
        max: ext.max,
      };
    };

    const handleMouseMove = (event: MouseEvent) => {
      const state = generationMiddlePanStateRef.current;
      if (!state.isPanning) return;
      if (!chartInstance.xAxis || !chartInstance.xAxis.length) return;

      const axis = chartInstance.xAxis[0];
      if (state.min == null || state.max == null) return;

      const deltaPx = event.clientX - state.startX;
      const startMinPx = axis.toPixels(state.min);
      const newMinVal = axis.toValue(startMinPx - deltaPx);
      const diff = newMinVal - state.min;

      const newMin = state.min + diff;
      const newMax = state.max + diff;
      axis.setExtremes(newMin, newMax, false, false, { trigger: 'pan' as any });
      chartInstance.redraw(false);
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button !== 1) return;
      console.log('[TrendGenerator] Generation chart middle mouse up', {
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
      });
      generationMiddlePanStateRef.current.isPanning = false;
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      generationMiddlePanStateRef.current.isPanning = false;
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isOpen, currentStep]);
  // 数据生成页右侧预览图自适应高度（依赖最终 chart options，偏移改变后也会重新调整）
  useEffect(() => {
    if (currentStep !== 'generation') {
      return;
    }

    const container = generationChartContainerRef.current;
    if (!container) return;

    const updateChartSize = () => {
      const chartInstance = generationChartRef.current?.chart;
      if (!chartInstance || (chartInstance as any).destroyed || !chartInstance.options) {
        return;
      }
      const height = container.clientHeight;
      if (height > 0) {
        chartInstance.setSize(null, height, false);
      }
    };

    updateChartSize();

    const resizeObserver = new ResizeObserver(updateChartSize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [currentStep, dataGenerationChartOptions]);

  // 添加趋势段
  const handleAddSegment = useCallback(
    (template: TrendTemplate, mouseX?: number) => {
      const tab = activeTab;
      const tabSegments = segments[tab];

      // 计算放置位置
      let newStartTime = 0;
      if (mouseX !== undefined && timelineRef.current && timelineScrollRef.current) {
        const scrollRect = timelineScrollRef.current.getBoundingClientRect();
        const scrollLeft = timelineScrollRef.current.scrollLeft;
        // 鼠标相对于滚动容器的位置 + 滚动位置 = 在时间轴内容中的实际位置
        const relativeX = mouseX - scrollRect.left + scrollLeft;
        newStartTime = Math.max(0, Math.floor(relativeX / pixelsPerMinuteRef.current));
      } else {
        // 如果没有鼠标位置，放在最后
        if (tabSegments.length > 0) {
          const lastSegment = tabSegments[tabSegments.length - 1];
          newStartTime = lastSegment.startTime + lastSegment.duration;
        }
      }

      const newSegment: TrendSegment = {
        id: `${Date.now()}-${Math.random()}`,
        type: template.type,
        startTime: newStartTime,
        duration: template.defaultParams.duration,
        params: {
          startValue: template.defaultParams.startValue,
          endValue: template.defaultParams.endValue,
          maxValue: template.defaultParams.maxValue,
          maxPosition: template.defaultParams.maxPosition,
          amplitude: template.defaultParams.amplitude,
          frequency: template.defaultParams.frequency,
          phase: template.defaultParams.phase,
          rate: template.defaultParams.rate,
          stepCount: template.defaultParams.stepCount,
          center: template.defaultParams.center,
          width: template.defaultParams.width,
          // 行业曲线参数
          envTemp: template.defaultParams.envTemp,
          targetTemp: template.defaultParams.targetTemp,
          openDuration: template.defaultParams.openDuration,
          openCount: template.defaultParams.openCount,
          openInterval: template.defaultParams.openInterval,
          responseTime: template.defaultParams.responseTime,
          recoveryTime: template.defaultParams.recoveryTime,
          loadRatio: template.defaultParams.loadRatio,
          couplingCoeff: template.defaultParams.couplingCoeff,
          noiseLevel: template.defaultParams.noiseLevel,
        },
      };

      // 插入并排序，避免重叠
      const updatedSegments = [...tabSegments, newSegment].sort((a, b) => {
        if (a.startTime !== b.startTime) {
          return a.startTime - b.startTime;
        }
        return a.duration - b.duration;
      });

      // 检查并调整重叠
      const adjustedSegments: TrendSegment[] = [];
      updatedSegments.forEach((segment) => {
        if (adjustedSegments.length === 0) {
          adjustedSegments.push(segment);
          return;
        }

        const lastSegment = adjustedSegments[adjustedSegments.length - 1];
        const lastEndTime = lastSegment.startTime + lastSegment.duration;

        if (segment.startTime < lastEndTime) {
          // 有重叠，放在后面
          segment.startTime = lastEndTime;
        }
        adjustedSegments.push(segment);
      });

      setSegments((prev) => ({
        ...prev,
        [tab]: adjustedSegments,
      }));
    },
    [activeTab, segments]
  );

  // 删除趋势段
  const handleDeleteSegment = useCallback(
    (tab: 'temperature' | 'humidity', segmentId: string) => {
      setSegments((prev) => ({
        ...prev,
        [tab]: prev[tab].filter((s) => s.id !== segmentId),
      }));
    },
    []
  );
  const handleSelectDevice = useCallback((deviceId: string) => {
    setSelectedDeviceIds((prev) => (prev.includes(deviceId) ? prev : [...prev, deviceId]));
  }, []);
  const handleDeselectDevice = useCallback((deviceId: string) => {
    setSelectedDeviceIds((prev) => prev.filter((id) => id !== deviceId));
  }, []);
  const handleOffsetInputChange = useCallback((deviceId: string, rawValue: string) => {
    setOffsetInputs((prev) => ({
      ...prev,
      [deviceId]: rawValue,
    }));
  }, []);
  const handleOffsetInputBlur = useCallback(
    (deviceId: string) => {
      setOffsetInputs((prev) => ({
        ...prev,
        [deviceId]: getOffsetValue(deviceId).toFixed(1),
      }));
    },
    [getOffsetValue]
  );

  // 更新趋势段参数
  const handleUpdateSegmentParams = useCallback(
    (tab: 'temperature' | 'humidity', segmentId: string, params: any) => {
      setSegments((prev) => ({
        ...prev,
        [tab]: prev[tab].map((s) => {
          if (s.id !== segmentId) return s;
          const { _duration, ...paramUpdates } = params;
          return {
            ...s,
            ...(_duration !== undefined ? { duration: _duration } : {}),
            params: { ...s.params, ...paramUpdates },
          };
        }),
      }));
    },
    []
  );

  // 拖拽开始
  const handleSegmentMouseDown = useCallback(
    (e: React.MouseEvent, tab: 'temperature' | 'humidity', segmentId: string, startTime: number) => {
      e.preventDefault();
      e.stopPropagation();
      setDraggingSegment({
        tab,
        segmentId,
        startX: e.clientX,
        originalStartTime: startTime,
      });
    },
    []
  );

  // 调整大小开始
  const handleResizeMouseDown = useCallback(
    (
      e: React.MouseEvent,
      tab: 'temperature' | 'humidity',
      segmentId: string,
      duration: number,
      startTime: number,
      isRightEdge: boolean
    ) => {
      e.preventDefault();
      e.stopPropagation();
      setResizingSegment({
        tab,
        segmentId,
        startX: e.clientX,
        originalDuration: duration,
        originalStartTime: startTime,
        isRightEdge,
      });
    },
    []
  );

  // 鼠标移动处理
  useEffect(() => {
    if (!draggingSegment && !resizingSegment) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (draggingSegment) {
        const deltaX = e.clientX - draggingSegment.startX;
        const deltaMinutes = Math.floor(deltaX / pixelsPerMinuteRef.current);
        const newStartTime = Math.max(0, draggingSegment.originalStartTime + deltaMinutes);

        setSegments((prev) => {
          const tab = draggingSegment.tab;
          const updated = prev[tab].map((s) => (s.id === draggingSegment.segmentId ? { ...s, startTime: newStartTime } : s));

          // 排序并调整重叠
          const sorted = [...updated].sort((a, b) => a.startTime - b.startTime);
          const adjusted: TrendSegment[] = [];
          sorted.forEach((segment) => {
            if (adjusted.length === 0) {
              adjusted.push(segment);
              return;
            }

            const lastSegment = adjusted[adjusted.length - 1];
            const lastEndTime = lastSegment.startTime + lastSegment.duration;

            if (segment.startTime < lastEndTime && segment.id !== draggingSegment.segmentId) {
              segment.startTime = lastEndTime;
            }
            adjusted.push(segment);
          });

          return { ...prev, [tab]: adjusted };
        });
      } else if (resizingSegment) {
        const deltaX = e.clientX - resizingSegment.startX;
        const deltaMinutes = Math.floor(deltaX / pixelsPerMinuteRef.current);

        setSegments((prev) => {
          const tab = resizingSegment.tab;
          return {
            ...prev,
            [tab]: prev[tab].map((s) => {
              if (s.id !== resizingSegment.segmentId) {
                return s;
              }

              if (resizingSegment.isRightEdge) {
                const newDuration = Math.max(5, resizingSegment.originalDuration + deltaMinutes);
                return { ...s, duration: newDuration };
              } else {
                const newStartTime = Math.max(0, resizingSegment.originalStartTime + deltaMinutes);
                const newDuration = resizingSegment.originalDuration - deltaMinutes;
                if (newDuration < 5) return s;
                return { ...s, startTime: newStartTime, duration: newDuration };
              }
            }),
          };
        });
      }
    };

    const handleMouseUp = () => {
      setDraggingSegment(null);
      setResizingSegment(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingSegment, resizingSegment]);

  // 计算时间轴总长度
  const timelineDuration = useMemo(() => {
    const tabSegments = segments[activeTab];
    if (tabSegments.length === 0) return 60; // 默认1小时

    const maxEndTime = Math.max(
      ...tabSegments.map((s) => s.startTime + s.duration)
    );
    return Math.max(60, maxEndTime + 60); // 至少1小时，最后一段后留1小时
  }, [activeTab, segments]);

  const hasAnyPoint = temperaturePoints.length > 0 || humidityPoints.length > 0;
  const buildGeneratedDataset = useCallback(
    (deviceId: string, offset: number): TemperatureHumidityData[] => {
      const allTimestamps = new Set<number>();
      temperaturePoints.forEach((p) => allTimestamps.add(p.timestamp));
      humidityPoints.forEach((p) => allTimestamps.add(p.timestamp));
      const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
      if (sortedTimestamps.length === 0) {
        return [];
      }

      return sortedTimestamps.map((timestamp) => {
        const tempValue =
          temperaturePoints.length > 0
            ? temperaturePoints.reduce((prev, curr) =>
                Math.abs(curr.timestamp - timestamp) < Math.abs(prev.timestamp - timestamp) ? curr : prev
              ).value
            : 0;

        const humidityValue =
          humidityPoints.length > 0
            ? humidityPoints.reduce((prev, curr) =>
                Math.abs(curr.timestamp - timestamp) < Math.abs(prev.timestamp - timestamp) ? curr : prev
              ).value
            : 0;

        const noise = getDeviceNoise(deviceId, timestamp, offset);

        return {
          taskId,
          deviceId,
          temperature: Math.round((tempValue + offset + noise) * 10) / 10,
          humidity: Math.round((humidityValue + offset + noise) * 10) / 10,
          timestamp: new Date(timestamp).toISOString(),
        };
      });
    },
    [getDeviceNoise, humidityPoints, temperaturePoints, taskId]
  );

  const handleProceedToGeneration = useCallback(() => {
    if (!hasAnyPoint) {
      setAlert({ isOpen: true, message: '请至少添加一个趋势段', type: 'warning' });
      return;
    }
    setCurrentStep('generation');
  }, [hasAnyPoint]);

  const handleApplyToDevices = useCallback(() => {
    if (!hasAnyPoint) {
      setAlert({ isOpen: true, message: '请至少添加一个趋势段', type: 'warning' });
      return;
    }
    if (selectedDeviceIds.length === 0) {
      setAlert({ isOpen: true, message: '请选择至少一个设备', type: 'warning' });
      return;
    }

    selectedDeviceIds.forEach((deviceId) => {
      const offset = getOffsetValue(deviceId);
      const generatedData = buildGeneratedDataset(deviceId, offset);
      if (generatedData.length > 0) {
        onGenerate(generatedData, deviceId);
      }
    });
    handleClose();
  }, [buildGeneratedDataset, getOffsetValue, handleClose, hasAnyPoint, onGenerate, selectedDeviceIds]);

  const handleBackToBuilder = useCallback(() => {
    setCurrentStep('builder');
  }, []);

  if (!isOpen) return null;

  const tabSegments = segments[activeTab];

  const renderBuilderStage = () => (
    <>
      {/* 生成数据曲线阅览区 (约70%) */}
      <div className="flex-[7] border-b bg-gray-50 flex flex-col min-h-0">
        <div className="flex items-center gap-4 px-4 py-3 border-b bg-white flex-shrink-0">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('temperature')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                activeTab === 'temperature'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              温度
            </button>
            <button
              onClick={() => setActiveTab('humidity')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                activeTab === 'humidity'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              湿度
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">开始时间：</label>
            <input
              type="datetime-local"
              value={dateToLocalString(startTime)}
              onChange={(e) => setStartTime(localStringToDate(e.target.value))}
              className="px-3 py-1 border border-gray-300 rounded text-sm"
            />
          </div>
        </div>
        <div className="flex-1 w-full min-h-0 relative" ref={chartContainerRef} style={{ height: '100%' }}>
          <HighchartsReact
            ref={chartRef}
            highcharts={Highcharts}
            options={chartOptions}
            containerProps={{ style: { height: '100%', width: '100%' } }}
          />
        </div>
      </div>

      {/* 趋势编辑区 (约30%) */}
      <div className="flex-[3] border-b bg-white flex flex-col min-h-0">
        <div className="flex-1 flex flex-col min-h-0" style={{ paddingBottom: '18px' }}>
          <div className="px-4 py-2 border-b bg-gray-50 flex-shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">趋势编辑区</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (segments.temperature.length === 0 && segments.humidity.length === 0) {
                      setAlert({ isOpen: true, message: '请先添加趋势段', type: 'warning' });
                      return;
                    }
                    setShowSaveDialog(true);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-blue-600 hover:bg-blue-50 border border-blue-200 hover:border-blue-300 transition"
                  title="保存趋势容器模版"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>保存模版</span>
                </button>
                <button
                  onClick={() => {
                    setConfirm({
                      isOpen: true,
                      message: `确定要清除当前${activeTab === 'temperature' ? '温度' : '湿度'}的所有趋势段吗？`,
                      onConfirm: () => {
                        setSegments((prev) => ({
                          ...prev,
                          [activeTab]: [],
                        }));
                      },
                    });
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-red-600 hover:bg-red-50 border border-red-200 hover:border-red-300 transition"
                  title="清除所有趋势段"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>清除</span>
                </button>
              </div>
            </div>
          </div>
          <div
            className="flex-1 min-h-0"
            style={{
              overflowX: 'auto',
              paddingBottom: '20px',
            }}
            ref={timelineScrollRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const templateData = e.dataTransfer.getData('template');
              const savedTemplateData = e.dataTransfer.getData('savedTemplate');

              if (savedTemplateData) {
                try {
                  const savedTemplate = JSON.parse(savedTemplateData);
                  handleLoadTemplate(savedTemplate);
                } catch (err) {
                  console.error('Failed to parse saved template:', err);
                }
              } else if (templateData) {
                try {
                  const template = JSON.parse(templateData) as TrendTemplate;
                  handleAddSegment(template, e.clientX);
                } catch (err) {
                  console.error('Failed to parse template:', err);
                }
              }
            }}
            onWheel={(e) => {
              const shouldHorizontalScroll =
                e.shiftKey ||
                Math.abs(e.deltaX) > Math.abs(e.deltaY) ||
                (e.ctrlKey || e.metaKey) ||
                (Math.abs(e.deltaX) === 0 && e.deltaY !== 0);

              if (shouldHorizontalScroll) {
                e.preventDefault();
                e.stopPropagation();
                if (timelineScrollRef.current) {
                  const scrollAmount = e.deltaX !== 0 ? e.deltaX : e.deltaY;
                  timelineScrollRef.current.scrollLeft += scrollAmount;
                }
              }
            }}
          >
            <div
              ref={timelineRef}
              className="relative min-w-full"
              style={{
                minWidth: `${timelineDuration * pixelsPerMinuteRef.current}px`,
                height: '100%',
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {/* 时间刻度 */}
              <div className="absolute top-0 left-0 right-0 h-6 border-b bg-gray-50 flex items-center text-xs text-gray-500">
                {Array.from({ length: Math.ceil(timelineDuration / 60) + 1 }).map((_, i) => {
                  const minutes = i * 60;
                  const time = new Date(startTime.getTime() + minutes * 60 * 1000);
                  const leftPosition = minutes * pixelsPerMinuteRef.current;
                  return (
                    <div
                      key={i}
                      className="absolute border-l border-gray-300"
                      style={{ left: `${leftPosition}px` }}
                    >
                      <span className="ml-1 whitespace-nowrap">
                        {time.getHours().toString().padStart(2, '0')}:
                        {time.getMinutes().toString().padStart(2, '0')}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 趋势段 */}
              <div className="absolute top-6 left-0 right-0" style={{ maxHeight: '130px', bottom: '0', marginTop: '10px' }}>
                {tabSegments.map((segment) => {
                  const left = segment.startTime * pixelsPerMinuteRef.current;
                  const width = segment.duration * pixelsPerMinuteRef.current;
                  const template = TREND_TEMPLATES.find((t) => t.type === segment.type)!;

                  return (
                    <div
                      key={segment.id}
                      className="absolute h-full border-2 rounded cursor-move group overflow-hidden"
                      style={{
                        left: `${left}px`,
                        width: `${width}px`,
                        borderColor: activeTab === 'temperature' ? '#3b82f6' : '#10b981',
                        backgroundColor: activeTab === 'temperature' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                      }}
                      onMouseDown={(e) => handleSegmentMouseDown(e, activeTab, segment.id, segment.startTime)}
                    >
                      <div
                        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-400 z-10"
                        onMouseDown={(e) =>
                          handleResizeMouseDown(e, activeTab, segment.id, segment.duration, segment.startTime, false)
                        }
                      />
                      <div
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-400 z-10"
                        onMouseDown={(e) =>
                          handleResizeMouseDown(e, activeTab, segment.id, segment.duration, segment.startTime, true)
                        }
                      />
                      <div className="absolute left-1 top-1 z-10">
                        <GripVertical className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="absolute left-6 top-1 text-xs font-medium truncate max-w-[calc(100%-40px)]">
                        {template.icon} {template.name}
                      </div>
                      <div className="absolute left-6 top-4 text-[10px] text-gray-600 space-y-0.5 max-w-[calc(100%-40px)]">
                        <div className="truncate">时长: {segment.duration}分钟</div>
                        <div className="truncate">开始: {segment.params.startValue.toFixed(1)}</div>
                        {['wave', 'parabola', 'bell'].includes(segment.type) && segment.params.maxValue !== undefined && (
                          <div className="truncate">
                            峰值: {segment.params.maxValue.toFixed(1)}
                            {segment.type !== 'bell' && segment.params.maxPosition !== undefined && (
                              <> (位置: {((segment.params.maxPosition ?? 0.5) * 100).toFixed(0)}%)</>
                            )}
                          </div>
                        )}
                        {['sine', 'cosine', 'sawtooth', 'square', 'doubleWave'].includes(segment.type) && (
                          <>
                            {segment.params.amplitude !== undefined && (
                              <div className="truncate">振幅: {segment.params.amplitude.toFixed(1)}</div>
                            )}
                            {segment.params.frequency !== undefined && (
                              <div className="truncate">频率: {segment.params.frequency.toFixed(1)}</div>
                            )}
                          </>
                        )}
                        {['exponential', 'exponentialDecay', 'logarithmic', 'sigmoid'].includes(segment.type) &&
                          segment.params.rate !== undefined && (
                            <div className="truncate">增长率: {segment.params.rate.toFixed(2)}</div>
                          )}
                        {segment.type === 'step' && segment.params.stepCount !== undefined && (
                          <div className="truncate">阶梯: {segment.params.stepCount}级</div>
                        )}
                        <div className="truncate">结束: {segment.params.endValue.toFixed(1)}</div>
                      </div>
                      <button
                        className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-200 rounded z-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingSegment({ tab: activeTab, segmentId: segment.id });
                        }}
                      >
                        <Settings className="w-3 h-3" />
                      </button>
                      <button
                        className="absolute right-1 top-8 opacity-0 group-hover:opacity-100 p-1 hover:bg-red-200 rounded z-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSegment(activeTab, segment.id);
                        }}
                      >
                        <X className="w-3 h-3 text-red-600" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 趋势模版区 (约10%) */}
      <div className="flex-[1] bg-gray-50 flex-shrink-0">
        <div className="h-full px-4 py-3 flex flex-col">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-sm font-medium text-gray-700">趋势模版</div>
            <div className="flex gap-1">
              <button
                onClick={() => setTemplateCategory('basic')}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  templateCategory === 'basic'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                基础
              </button>
              <button
                onClick={() => setTemplateCategory('industry')}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  templateCategory === 'industry'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                行业
              </button>
              <button
                onClick={() => setTemplateCategory('custom')}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  templateCategory === 'custom'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                验证模版
              </button>
            </div>
          </div>
          <div
            className="flex gap-3 overflow-x-auto flex-1"
            style={{ paddingBottom: '16px' }}
            onWheel={(e) => {
              const shouldHorizontalScroll =
                e.shiftKey ||
                Math.abs(e.deltaX) > Math.abs(e.deltaY) ||
                (e.ctrlKey || e.metaKey) ||
                (Math.abs(e.deltaX) === 0 && e.deltaY !== 0);

              if (shouldHorizontalScroll) {
                e.preventDefault();
                e.stopPropagation();
                const target = e.currentTarget;
                const scrollAmount = e.deltaX !== 0 ? e.deltaX : e.deltaY;
                target.scrollLeft += scrollAmount;
              }
            }}
          >
            {templateCategory === 'custom' ? (
              savedTemplates.length === 0 ? (
                <div className="flex items-center justify-center w-full h-24 text-sm text-gray-400">
                  暂无保存的验证模版
                </div>
              ) : (
                savedTemplates.map((savedTemplate) => (
                  <div
                    key={savedTemplate._id}
                    className="flex-shrink-0 w-32 h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition relative group"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('savedTemplate', JSON.stringify(savedTemplate));
                    }}
                    onClick={() => handleLoadTemplate(savedTemplate)}
                    title={savedTemplate.description || savedTemplate.name}
                  >
                    <div className="w-full h-12 mb-1 flex items-center justify-center">
                      <SavedTemplatePreview segments={savedTemplate.segments} width={100} height={40} />
                    </div>
                    <div className="text-xs text-gray-600 text-center font-medium truncate w-full px-1">
                      {savedTemplate.name}
                    </div>
                    {savedTemplate.isPublic && (
                      <div className="absolute top-1 left-1 text-[8px] text-blue-600 bg-blue-100 px-1 rounded">
                        公开
                      </div>
                    )}
                    <button
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-200 rounded z-10"
                      onClick={(e) => handleDeleteTemplate(savedTemplate._id, e)}
                      title="删除模版"
                    >
                      <X className="w-3 h-3 text-red-600" />
                    </button>
                  </div>
                ))
              )
            ) : (
              TREND_TEMPLATES.filter((t) => t.category === templateCategory).map((template) => (
                <div
                  key={template.type}
                  className="flex-shrink-0 w-32 h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('template', JSON.stringify(template));
                  }}
                  onDragEnd={(e) => {
                    const scrollRect = timelineScrollRef.current?.getBoundingClientRect();
                    if (scrollRect) {
                      const mouseX = e.clientX;
                      const mouseY = e.clientY;
                      if (
                        mouseX >= scrollRect.left &&
                        mouseX <= scrollRect.right &&
                        mouseY >= scrollRect.top &&
                        mouseY <= scrollRect.bottom
                      ) {
                        handleAddSegment(template, mouseX);
                      }
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const scrollRect = timelineScrollRef.current?.getBoundingClientRect();
                    if (scrollRect) {
                      const mouseX = e.clientX;
                      const mouseY = e.clientY;
                      if (
                        mouseX >= scrollRect.left &&
                        mouseX <= scrollRect.right &&
                        mouseY >= scrollRect.top &&
                        mouseY <= scrollRect.bottom
                      ) {
                        const templateData = e.dataTransfer.getData('template');
                        if (templateData) {
                          try {
                            const tmpl = JSON.parse(templateData) as TrendTemplate;
                            handleAddSegment(tmpl, mouseX);
                          } catch (err) {
                            console.error('Failed to parse template:', err);
                          }
                        }
                      }
                    }
                  }}
                  onClick={() => handleAddSegment(template)}
                >
                  <div className="w-full h-12 mb-1 flex items-center justify-center">
                    <TrendPreview template={template} width={100} height={40} />
                  </div>
                  <div className="text-xs text-gray-600 text-center font-medium">{template.name}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
        <p className="text-sm text-gray-600">
          完成趋势配置后点击“下一步”，即可在数据生成页面选择设备并设置偏移。
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            取消
          </button>
          <button
            onClick={handleProceedToGeneration}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            下一步
          </button>
        </div>
      </div>
    </>
  );

  const renderGenerationStage = () => (
    <>
      <div className="flex-1 flex overflow-hidden bg-white">
        <div className="w-72 border-r flex flex-col">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">设备列表</p>
              <p className="text-xs text-gray-500">来自设备管理</p>
            </div>
            <button
              onClick={loadDeviceList}
              disabled={isDeviceListLoading}
              className="p-2 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              title="刷新设备列表"
            >
              <RefreshCw className={`w-4 h-4 ${isDeviceListLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {isDeviceListLoading ? (
              <div className="flex flex-col items-center justify-center text-gray-500 text-sm py-12">
                <Loader2 className="w-5 h-5 animate-spin mb-2" />
                正在加载设备列表…
              </div>
            ) : availableDevices.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-12">
                暂无设备，请先在设备管理中创建
              </div>
            ) : (
              availableDevices.map((device) => {
                const isSelected = selectedDeviceIds.includes(device.deviceId);
                return (
                  <div
                    key={device.deviceId}
                    className={`border rounded-md px-3 py-2 text-sm cursor-pointer select-none transition-colors ${
                      isSelected
                        ? 'border-primary-400 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-700 hover:border-primary-200'
                    }`}
                    onClick={() => handleSelectDevice(device.deviceId)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleDeselectDevice(device.deviceId);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{device.deviceId}</p>
                        <p className="text-[11px] text-gray-500">
                          {device.createdAt ? new Date(device.createdAt).toLocaleString('zh-CN') : '本地缓存'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-gray-500">偏移</span>
                        <input
                          type="number"
                          step="0.1"
                          value={offsetInputs[device.deviceId] ?? '0.0'}
                          onChange={(e) => handleOffsetInputChange(device.deviceId, e.target.value)}
                          onBlur={() => handleOffsetInputBlur(device.deviceId)}
                          onClick={(e) => e.stopPropagation()}
                          onContextMenu={(e) => e.stopPropagation()}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-400"
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="border-t px-4 py-2 text-xs text-gray-500 bg-gray-50">
            左键选中，右键取消；偏移值支持正负一位小数，修改后立即生效
          </div>
          {deviceListError && (
            <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-t border-red-100">
              {deviceListError}
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col bg-gray-50 min-h-0">
          <div className="border-b bg-white px-6 py-3 flex items-center justify-between">
            <div>
              <p className="text-base font-semibold text-gray-800">设备趋势预览</p>
              <p className="text-xs text-gray-500">仅展示已选设备的趋势，偏移值实时作用于曲线</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('temperature')}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  activeTab === 'temperature'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                温度
              </button>
              <button
                onClick={() => setActiveTab('humidity')}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  activeTab === 'humidity'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                湿度
              </button>
            </div>
          </div>
          <div className="flex-1 p-4 min-h-0">
            {!hasAnyPoint ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm bg-white border border-dashed border-gray-200 rounded-lg">
                请返回上一步配置趋势段
              </div>
            ) : selectedDeviceIds.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm bg-white border border-dashed border-gray-200 rounded-lg">
                请从左侧选择至少一个设备
              </div>
            ) : (
              <div className="h-full bg-white border border-gray-200 rounded-lg p-2 flex flex-col">
                <div className="flex-1 min-h-0 relative" ref={generationChartContainerRef}>
                  <HighchartsReact
                    ref={generationChartRef}
                    highcharts={Highcharts}
                    options={dataGenerationChartOptions}
                    containerProps={{ style: { height: '100%', width: '100%' } }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 py-4 border-t bg-white flex items-center justify-between">
        <div className="text-sm text-gray-600">
          已选择
          <span className="mx-1 font-semibold text-primary-600">{selectedDeviceIds.length}</span>
          台设备
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleBackToBuilder}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            上一步
          </button>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            取消
          </button>
          <button
            onClick={handleApplyToDevices}
            disabled={!hasAnyPoint || selectedDeviceIds.length === 0}
            className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed"
          >
            立即生效
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full h-full max-w-[95vw] max-h-[95vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-bold text-gray-800">
            {currentStep === 'builder' ? '趋势生成器' : '数据生成'}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 主要内容区域 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {currentStep === 'builder' ? renderBuilderStage() : renderGenerationStage()}
        </div>
      </div>

      {/* 参数编辑弹窗 */}
      {editingSegment && (
        <SegmentParamsDialog
          segment={tabSegments.find((s) => s.id === editingSegment.segmentId)!}
          template={TREND_TEMPLATES.find((t) => t.type === tabSegments.find((s) => s.id === editingSegment.segmentId)?.type)!}
          onClose={() => setEditingSegment(null)}
          onSave={(params) => {
            handleUpdateSegmentParams(editingSegment.tab, editingSegment.segmentId, params);
            setEditingSegment(null);
          }}
        />
      )}

      {/* 保存模版弹窗 */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">保存趋势容器模版</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    模版名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={saveTemplateName}
                    onChange={(e) => setSaveTemplateName(e.target.value)}
                    placeholder="请输入模版名称"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">模版描述</label>
                  <textarea
                    value={saveTemplateDescription}
                    onChange={(e) => setSaveTemplateDescription(e.target.value)}
                    placeholder="请输入模版描述（可选）"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isPublic"
                    checked={saveTemplateIsPublic}
                    onChange={(e) => setSaveTemplateIsPublic(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="isPublic" className="text-sm text-gray-700 cursor-pointer">
                    公开模版（所有人可见）
                  </label>
                </div>
                <div className="text-xs text-gray-500">
                  将保存当前温度和湿度的所有趋势段配置
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => {
                    setShowSaveDialog(false);
                    setSaveTemplateName('');
                    setSaveTemplateDescription('');
                    setSaveTemplateIsPublic(false);
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveTemplate}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alert 提示 */}
      <Alert
        isOpen={alert.isOpen}
        onClose={() => setAlert({ isOpen: false, message: '', type: 'info' })}
        message={alert.message}
        type={alert.type}
      />

      {/* Confirm 确认对话框 */}
      <Confirm
        isOpen={confirm.isOpen}
        onClose={() => setConfirm({ isOpen: false, message: '', onConfirm: () => {} })}
        onConfirm={confirm.onConfirm}
        message={confirm.message}
        type="warning"
      />
    </div>
  );
};

// 参数编辑对话框
interface SegmentParamsDialogProps {
  segment: TrendSegment;
  template: TrendTemplate;
  onClose: () => void;
  onSave: (params: any) => void;
}

const SegmentParamsDialog = ({ segment, template, onClose, onSave }: SegmentParamsDialogProps) => {
  const [durationHours, setDurationHours] = useState(Math.floor(segment.duration / 60));
  const [durationMinutes, setDurationMinutes] = useState(segment.duration % 60);
  const [startValue, setStartValue] = useState(segment.params.startValue);
  const [endValue, setEndValue] = useState(segment.params.endValue);
  const [maxValue, setMaxValue] = useState(segment.params.maxValue ?? 0);
  const [maxPosition, setMaxPosition] = useState(segment.params.maxPosition ?? 0.5);
  const [amplitude, setAmplitude] = useState(segment.params.amplitude ?? 0.9);
  const [frequency, setFrequency] = useState(segment.params.frequency ?? 2);
  const [phase, setPhase] = useState(segment.params.phase ?? 0);
  const [rate, setRate] = useState(segment.params.rate ?? 0.05);
  const [stepCount, setStepCount] = useState(segment.params.stepCount ?? 5);
  const [center, setCenter] = useState(segment.params.center ?? 0.5);
  const [width, setWidth] = useState(segment.params.width ?? 0.2);
  // 行业扩展参数：根据已有 params/defaultParams 初始化，后续可在对话框中调整
  const [envTemp, setEnvTemp] = useState(
    segment.params.envTemp ?? template.defaultParams.envTemp ?? 25
  );
  const [targetTemp, setTargetTemp] = useState(
    segment.params.targetTemp ?? template.defaultParams.targetTemp ?? segment.params.endValue
  );
  const [openDuration, setOpenDuration] = useState(
    segment.params.openDuration ?? template.defaultParams.openDuration ?? 1
  );
  const [openCount, setOpenCount] = useState(
    segment.params.openCount ?? template.defaultParams.openCount ?? 4
  );
  const [openInterval, setOpenInterval] = useState(
    segment.params.openInterval ?? template.defaultParams.openInterval ?? 90
  );
  const [responseTime, setResponseTime] = useState(
    segment.params.responseTime ?? template.defaultParams.responseTime ?? 0.1
  );
  const [recoveryTime, setRecoveryTime] = useState(
    segment.params.recoveryTime ?? template.defaultParams.recoveryTime ?? 0.25
  );
  const [loadRatio, setLoadRatio] = useState(
    segment.params.loadRatio ?? template.defaultParams.loadRatio ?? 0.5
  );
  const [couplingCoeff, setCouplingCoeff] = useState(
    segment.params.couplingCoeff ?? template.defaultParams.couplingCoeff ?? 0.05
  );
  const [noiseLevel, setNoiseLevel] = useState(
    segment.params.noiseLevel ?? template.defaultParams.noiseLevel ?? 0.5
  );
  const [alert, setAlert] = useState<{ isOpen: boolean; message: string; type?: 'success' | 'error' | 'info' | 'warning' }>({
    isOpen: false,
    message: '',
    type: 'info',
  });

  const handleSave = () => {
    const duration = durationHours * 60 + durationMinutes;
    if (duration < 5) {
      setAlert({ isOpen: true, message: '持续时间至少为5分钟', type: 'warning' });
      return;
    }

    const params: any = {
      startValue,
      endValue,
      _duration: duration,
    };

    // 根据不同类型添加特定参数
    if (['wave', 'parabola', 'bell'].includes(segment.type)) {
      params.maxValue = maxValue;
      if (segment.type !== 'bell') {
        params.maxPosition = maxPosition;
      }
    }

    if (['sine', 'cosine', 'sawtooth', 'square', 'doubleWave'].includes(segment.type)) {
      params.amplitude = amplitude;
      params.frequency = frequency;
      if (['sine', 'cosine'].includes(segment.type)) {
        params.phase = phase;
      }
    }

    if (['exponential', 'exponentialDecay', 'logarithmic', 'sigmoid'].includes(segment.type)) {
      params.rate = rate;
    }

    if (segment.type === 'step') {
      params.stepCount = stepCount;
    }

    if (segment.type === 'bell') {
      params.center = center;
      params.width = width;
    }

    // 行业扩展参数：仅在该模板/段原本就含有对应字段时才写回
    const hasEnvTemp =
      segment.params.envTemp !== undefined || template.defaultParams.envTemp !== undefined;
    const hasTargetTemp =
      segment.params.targetTemp !== undefined || template.defaultParams.targetTemp !== undefined;
    const hasOpenDuration =
      segment.params.openDuration !== undefined ||
      template.defaultParams.openDuration !== undefined;
    const hasOpenCount =
      segment.params.openCount !== undefined || template.defaultParams.openCount !== undefined;
    const hasOpenInterval =
      segment.params.openInterval !== undefined || template.defaultParams.openInterval !== undefined;
    const hasResponseTime =
      segment.params.responseTime !== undefined || template.defaultParams.responseTime !== undefined;
    const hasRecoveryTime =
      segment.params.recoveryTime !== undefined || template.defaultParams.recoveryTime !== undefined;
    const hasLoadRatio =
      segment.params.loadRatio !== undefined || template.defaultParams.loadRatio !== undefined;
    const hasCouplingCoeff =
      segment.params.couplingCoeff !== undefined ||
      template.defaultParams.couplingCoeff !== undefined;
    const hasNoiseLevel =
      segment.params.noiseLevel !== undefined || template.defaultParams.noiseLevel !== undefined;

    if (hasEnvTemp) {
      params.envTemp = envTemp;
    }
    if (hasTargetTemp) {
      params.targetTemp = targetTemp;
    }
    if (hasOpenDuration) {
      params.openDuration = openDuration;
    }
    if (hasOpenCount) {
      params.openCount = openCount;
    }
    if (hasOpenInterval) {
      params.openInterval = openInterval;
    }
    if (hasResponseTime) {
      params.responseTime = responseTime;
    }
    if (hasRecoveryTime) {
      params.recoveryTime = recoveryTime;
    }
    if (hasLoadRatio) {
      params.loadRatio = loadRatio;
    }
    if (hasCouplingCoeff) {
      params.couplingCoeff = couplingCoeff;
    }
    if (hasNoiseLevel) {
      params.noiseLevel = noiseLevel;
    }

    onSave(params);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">编辑趋势参数</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">持续时间</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  value={durationHours}
                  onChange={(e) => setDurationHours(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-24 px-3 py-2 border border-gray-300 rounded text-sm"
                  placeholder="时"
                />
                <span className="self-center text-gray-500">:</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  className="w-24 px-3 py-2 border border-gray-300 rounded text-sm"
                  placeholder="分"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">开始值</label>
              <input
                type="number"
                step="0.1"
                value={startValue}
                onChange={(e) => setStartValue(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">结束值</label>
              <input
                type="number"
                step="0.1"
                value={endValue}
                onChange={(e) => setEndValue(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
            </div>
            {/* 波浪、抛物线参数 */}
            {['wave', 'parabola'].includes(segment.type) && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">最高值</label>
                  <input
                    type="number"
                    step="0.1"
                    value={maxValue}
                    onChange={(e) => setMaxValue(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    最高值位置 (0-1)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={maxPosition}
                    onChange={(e) => setMaxPosition(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.5)))}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>
              </>
            )}

            {/* 正弦、余弦、锯齿波、方波、双波浪参数 */}
            {['sine', 'cosine', 'sawtooth', 'square', 'doubleWave'].includes(segment.type) && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">振幅</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={amplitude}
                    onChange={(e) => setAmplitude(Math.max(0, parseFloat(e.target.value) || 10))}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">频率（周期数）</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={frequency}
                    onChange={(e) => setFrequency(Math.max(0.1, parseFloat(e.target.value) || 2))}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                {['sine', 'cosine'].includes(segment.type) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">相位（弧度）</label>
                    <input
                      type="number"
                      step="0.1"
                      value={phase}
                      onChange={(e) => setPhase(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                )}
              </>
            )}

            {/* 指数、对数、S型曲线参数 */}
            {['exponential', 'exponentialDecay', 'logarithmic', 'sigmoid'].includes(segment.type) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {segment.type === 'sigmoid' ? '陡度' : '增长率'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={rate}
                  onChange={(e) => setRate(Math.max(0.01, parseFloat(e.target.value) || 0.05))}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
            )}

            {/* 阶梯函数参数 */}
            {segment.type === 'step' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">阶梯数量</label>
                <input
                  type="number"
                  step="1"
                  min="2"
                  value={stepCount}
                  onChange={(e) => setStepCount(Math.max(2, parseInt(e.target.value) || 5))}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
            )}

            {/* 钟形曲线参数 */}
            {segment.type === 'bell' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">峰值</label>
                  <input
                    type="number"
                    step="0.1"
                    value={maxValue}
                    onChange={(e) => setMaxValue(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">中心位置 (0-1)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={center}
                    onChange={(e) => setCenter(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.5)))}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">宽度 (0-1)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="1"
                    value={width}
                    onChange={(e) => setWidth(Math.max(0.1, Math.min(1, parseFloat(e.target.value) || 0.2)))}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>
              </>
            )}

            {/* 行业扩展参数：仅在模板/当前段包含对应字段时才显示 */}
            {(segment.params.envTemp !== undefined || template.defaultParams.envTemp !== undefined ||
              segment.params.targetTemp !== undefined || template.defaultParams.targetTemp !== undefined ||
              segment.params.openDuration !== undefined || template.defaultParams.openDuration !== undefined ||
              segment.params.openCount !== undefined || template.defaultParams.openCount !== undefined ||
              segment.params.openInterval !== undefined || template.defaultParams.openInterval !== undefined ||
              segment.params.responseTime !== undefined || template.defaultParams.responseTime !== undefined ||
              segment.params.recoveryTime !== undefined || template.defaultParams.recoveryTime !== undefined ||
              segment.params.loadRatio !== undefined || template.defaultParams.loadRatio !== undefined ||
              segment.params.couplingCoeff !== undefined || template.defaultParams.couplingCoeff !== undefined ||
              segment.params.noiseLevel !== undefined || template.defaultParams.noiseLevel !== undefined) && (
              <div className="mt-4 border-t pt-4 space-y-4">
                <div className="text-sm font-medium text-gray-700">行业扩展参数</div>

                {(segment.params.envTemp !== undefined || template.defaultParams.envTemp !== undefined) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">环境温度 (℃)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={envTemp}
                      onChange={(e) => setEnvTemp(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                )}

                {(segment.params.targetTemp !== undefined || template.defaultParams.targetTemp !== undefined) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">目标/稳定温度 (℃)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={targetTemp}
                      onChange={(e) => setTargetTemp(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                )}

                {(segment.params.openDuration !== undefined ||
                  template.defaultParams.openDuration !== undefined) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">开门持续时间 (分钟)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={openDuration}
                      onChange={(e) => setOpenDuration(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                )}

                {(segment.params.openCount !== undefined || template.defaultParams.openCount !== undefined) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">开门次数</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={openCount}
                      onChange={(e) => setOpenCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                )}

                {(segment.params.openInterval !== undefined ||
                  template.defaultParams.openInterval !== undefined) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">开门间隔 (分钟)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={openInterval}
                      onChange={(e) => setOpenInterval(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                )}

                {(segment.params.responseTime !== undefined ||
                  template.defaultParams.responseTime !== undefined) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">响应时间常数 τ1 (小时)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={responseTime}
                      onChange={(e) => setResponseTime(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                )}

                {(segment.params.recoveryTime !== undefined ||
                  template.defaultParams.recoveryTime !== undefined) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">恢复时间常数 τ2 (小时)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={recoveryTime}
                      onChange={(e) => setRecoveryTime(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                )}

                {(segment.params.loadRatio !== undefined || template.defaultParams.loadRatio !== undefined) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">负载比例 (0-1)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      value={loadRatio}
                      onChange={(e) =>
                        setLoadRatio(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                )}

                {(segment.params.couplingCoeff !== undefined ||
                  template.defaultParams.couplingCoeff !== undefined) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">耦合系数 α</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={couplingCoeff}
                      onChange={(e) =>
                        setCouplingCoeff(Math.max(0, parseFloat(e.target.value) || 0))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                )}

                {(segment.params.noiseLevel !== undefined ||
                  template.defaultParams.noiseLevel !== undefined) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">波动/噪声幅度 (℃)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={noiseLevel}
                      onChange={(e) =>
                        setNoiseLevel(Math.max(0, parseFloat(e.target.value) || 0))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrendGenerator;

