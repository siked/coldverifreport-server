import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getTemperatureHumidityDataByTask } from '@/lib/models/TemperatureHumidity';
import { uploadImageToQiniu } from '@/lib/qiniu';
import type { CurveChartConfig } from '@/components/tiptap/CurveChartConfigPanel';

// 动态导入 canvas（如果可用）
let createCanvas: any;
try {
  const canvas = require('canvas');
  createCanvas = canvas.createCanvas;
} catch (error) {
  console.warn('canvas 包未安装，请运行: npm install canvas');
}

export const runtime = 'nodejs';

// 解析标签值中的日期时间
function parseDateTime(value: string): Date | null {
  if (!value) return null;
  
  // 支持 YYYY-MM-DD 和 YYYY-MM-DD HH:mm 格式
  const dateTimeStr = value.trim();
  const date = new Date(dateTimeStr);
  
  if (isNaN(date.getTime())) {
    return null;
  }
  
  return date;
}

// 获取布点标签的所有值（去重）
function getLocationValues(locationTagIds: string[], tags: any[]): string[] {
  const values: string[] = [];
  locationTagIds.forEach((tagId) => {
    const tag = tags.find((t) => t._id === tagId);
    if (tag && tag.type === 'location' && Array.isArray(tag.value)) {
      values.push(...tag.value);
    }
  });
  return Array.from(new Set(values));
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { taskId, config, tags } = await request.json();

    if (!taskId) {
      return NextResponse.json({ error: '任务ID不能为空' }, { status: 400 });
    }

    if (!config || !config.startTimeTagId || !config.endTimeTagId) {
      return NextResponse.json({ error: '曲线图配置不完整' }, { status: 400 });
    }

    // 从标签中获取开始时间和结束时间
    const startTimeTag = tags.find((t: any) => t._id === config.startTimeTagId);
    const endTimeTag = tags.find((t: any) => t._id === config.endTimeTagId);

    if (!startTimeTag || !endTimeTag) {
      return NextResponse.json({ error: '开始时间或结束时间标签不存在' }, { status: 400 });
    }

    const startTime = parseDateTime(startTimeTag.value);
    const endTime = parseDateTime(endTimeTag.value);

    if (!startTime || !endTime) {
      return NextResponse.json({ error: '开始时间或结束时间格式不正确' }, { status: 400 });
    }

    if (startTime >= endTime) {
      return NextResponse.json({ error: '开始时间必须早于结束时间' }, { status: 400 });
    }

    // 获取任务数据
    const allData = await getTemperatureHumidityDataByTask(taskId, undefined, startTime, endTime);

    if (allData.length === 0) {
      return NextResponse.json({ error: '指定时间范围内没有数据' }, { status: 400 });
    }

    // 准备图表数据
    const chartData: any = {
      labels: [] as string[],
      datasets: [] as any[],
    };

    // 处理每条线条
    for (const line of config.lines || []) {
      if (line.type === 'curve') {
        // 曲线：根据布点标签筛选数据
        const locationValues = getLocationValues(line.locationTags || [], tags);
        if (locationValues.length === 0) continue;

        const lineData: number[] = [];
        const timestamps: string[] = [];

        // 按时间排序
        const sortedData = [...allData].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        // 对每个时间点，计算所有匹配布点的平均值
        const timeGroups = new Map<number, { values: number[]; timestamp: Date }>();
        
        sortedData.forEach((item) => {
          if (locationValues.includes(item.deviceId)) {
            const time = new Date(item.timestamp).getTime();
            const value = config.dataType === 'temperature' ? item.temperature : item.humidity;
            
            if (!timeGroups.has(time)) {
              timeGroups.set(time, { values: [], timestamp: new Date(item.timestamp) });
            }
            timeGroups.get(time)!.values.push(value);
          }
        });

        // 计算平均值并添加到图表数据
        Array.from(timeGroups.entries())
          .sort(([a], [b]) => a - b)
          .forEach(([time, group]) => {
            const avg = group.values.reduce((sum, v) => sum + v, 0) / group.values.length;
            timestamps.push(group.timestamp.toISOString());
            lineData.push(avg);
          });

        if (lineData.length > 0) {
          chartData.labels = timestamps;
          chartData.datasets.push({
            label: locationValues.join(' | '),
            data: lineData,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: line.lineWidth || 2,
            borderDash: line.lineStyle === 'dashed' ? [5, 5] : line.lineStyle === 'dotted' ? [2, 2] : [],
            fill: false,
            tension: 0.4,
          });
        }
      } else if (line.type === 'average') {
        // 平均值曲线：计算所有匹配布点的平均值
        const locationValues = getLocationValues(line.averageLocationTags || [], tags);
        if (locationValues.length === 0) continue;

        const lineData: number[] = [];
        const timestamps: string[] = [];

        const sortedData = [...allData].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        const timeGroups = new Map<number, { values: number[]; timestamp: Date }>();
        
        sortedData.forEach((item) => {
          if (locationValues.includes(item.deviceId)) {
            const time = new Date(item.timestamp).getTime();
            const value = config.dataType === 'temperature' ? item.temperature : item.humidity;
            
            if (!timeGroups.has(time)) {
              timeGroups.set(time, { values: [], timestamp: new Date(item.timestamp) });
            }
            timeGroups.get(time)!.values.push(value);
          }
        });

        Array.from(timeGroups.entries())
          .sort(([a], [b]) => a - b)
          .forEach(([time, group]) => {
            const avg = group.values.reduce((sum, v) => sum + v, 0) / group.values.length;
            timestamps.push(group.timestamp.toISOString());
            lineData.push(avg);
          });

        if (lineData.length > 0) {
          if (chartData.labels.length === 0) {
            chartData.labels = timestamps;
          }
          chartData.datasets.push({
            label: `平均值 (${locationValues.join(' | ')})`,
            data: lineData,
            borderColor: line.averageColor || '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: line.lineWidth || 2,
            borderDash: line.lineStyle === 'dashed' ? [5, 5] : line.lineStyle === 'dotted' ? [2, 2] : [],
            fill: false,
            tension: 0.4,
          });
        }
      } else if (line.type === 'line') {
        // 直线：需要计算直线的值（这里简化处理，使用固定值或基于数据的范围）
        const allValues = allData.map(
          (item) => (config.dataType === 'temperature' ? item.temperature : item.humidity)
        );
        const minValue = Math.min(...allValues);
        const maxValue = Math.max(...allValues);
        const avgValue = (minValue + maxValue) / 2;

        // 为直线创建数据点（使用平均值作为示例）
        const sortedData = [...allData].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        const uniqueTimes = Array.from(
          new Set(sortedData.map((item) => new Date(item.timestamp).getTime()))
        ).sort();

        if (chartData.labels.length === 0) {
          chartData.labels = uniqueTimes.map((time) => new Date(time).toISOString());
        }

        chartData.datasets.push({
          label: line.lineName || '直线',
          data: new Array(uniqueTimes.length).fill(avgValue),
          borderColor: line.lineColor || '#ef4444',
          backgroundColor: 'transparent',
          borderWidth: line.lineWidth || 2,
          borderDash: line.lineStyle === 'dashed' ? [5, 5] : line.lineStyle === 'dotted' ? [2, 2] : [],
          fill: false,
          pointRadius: 0,
        });
      }
    }

    if (chartData.datasets.length === 0) {
      return NextResponse.json({ error: '没有可用的数据用于生成曲线图' }, { status: 400 });
    }

    // 检查 canvas 是否可用
    if (!createCanvas) {
      return NextResponse.json(
        { error: 'canvas 包未安装，请运行: npm install canvas' },
        { status: 500 }
      );
    }

    // 使用 canvas 绘制图表
    const width = 1200;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 设置背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // 设置边距
    const padding = { top: 60, right: 80, bottom: 80, left: 80 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // 绘制标题
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${config.dataType === 'temperature' ? '温度' : '湿度'}曲线图`,
      width / 2,
      padding.top - 20
    );

    // 计算数据范围
    let minValue = Infinity;
    let maxValue = -Infinity;
    let minTime = Infinity;
    let maxTime = -Infinity;

    chartData.datasets.forEach((dataset: any) => {
      dataset.data.forEach((value: number, index: number) => {
        if (typeof value === 'number' && !isNaN(value)) {
          minValue = Math.min(minValue, value);
          maxValue = Math.max(maxValue, value);
        }
        const time = new Date(chartData.labels[index]).getTime();
        if (!isNaN(time)) {
          minTime = Math.min(minTime, time);
          maxTime = Math.max(maxTime, time);
        }
      });
    });

    if (minValue === Infinity || maxValue === -Infinity) {
      return NextResponse.json({ error: '数据无效' }, { status: 400 });
    }

    // 添加边距
    const valueRange = maxValue - minValue || 1;
    const valueMargin = valueRange * 0.1;
    const adjustedMinValue = minValue - valueMargin;
    const adjustedMaxValue = maxValue + valueMargin;
    const adjustedValueRange = adjustedMaxValue - adjustedMinValue;

    const timeRange = maxTime - minTime || 1;

    // 绘制坐标轴
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // X轴
    ctx.moveTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    // Y轴
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.stroke();

    // 绘制Y轴标签
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const value = adjustedMinValue + (adjustedValueRange * i) / ySteps;
      const y = height - padding.bottom - (chartHeight * i) / ySteps;
      ctx.fillText(value.toFixed(1), padding.left - 10, y);
    }

    // 绘制Y轴标题
    ctx.save();
    ctx.translate(20, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(
      config.dataType === 'temperature' ? '温度 (°C)' : '湿度 (%)',
      0,
      0
    );
    ctx.restore();

    // 绘制X轴标签（时间）
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xSteps = Math.min(10, chartData.labels.length);
    for (let i = 0; i < xSteps; i++) {
      const index = Math.floor((chartData.labels.length - 1) * (i / (xSteps - 1)));
      const time = new Date(chartData.labels[index]).getTime();
      const x = padding.left + (chartWidth * i) / (xSteps - 1);
      const date = new Date(time);
      const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
      ctx.fillText(timeStr, x, height - padding.bottom + 10);
    }

    // 绘制X轴标题
    ctx.textAlign = 'center';
    ctx.fillText('时间', width / 2, height - 20);

    // 绘制图例和线条
    const legendX = width - padding.right + 20;
    let legendY = padding.top;
    const legendSpacing = 25;

    chartData.datasets.forEach((dataset: any, index: number) => {
      // 绘制线条
      ctx.strokeStyle = dataset.borderColor || '#3b82f6';
      ctx.lineWidth = dataset.borderWidth || 2;
      ctx.setLineDash(
        dataset.borderDash || []
      );

      ctx.beginPath();
      dataset.data.forEach((value: number, dataIndex: number) => {
        if (typeof value === 'number' && !isNaN(value)) {
          const time = new Date(chartData.labels[dataIndex]).getTime();
          const x = padding.left + ((time - minTime) / timeRange) * chartWidth;
          const y = height - padding.bottom - ((value - adjustedMinValue) / adjustedValueRange) * chartHeight;

          if (dataIndex === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // 绘制图例
      ctx.fillStyle = dataset.borderColor || '#3b82f6';
      ctx.fillRect(legendX, legendY - 8, 15, 2);
      ctx.fillStyle = '#1f2937';
      ctx.font = '12px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(dataset.label || `线条 ${index + 1}`, legendX + 20, legendY);
      legendY += legendSpacing;
    });

    // 转换为 Buffer
    const imageBuffer = canvas.toBuffer('image/png');

    // 上传到七牛云
    const imageUrl = await uploadImageToQiniu(imageBuffer, user.userId, 'image/png');

    return NextResponse.json({ imageUrl });
  } catch (error: any) {
    console.error('生成曲线图失败:', error);
    return NextResponse.json(
      { error: error.message || '生成曲线图失败，请稍后重试' },
      { status: 500 }
    );
  }
}

