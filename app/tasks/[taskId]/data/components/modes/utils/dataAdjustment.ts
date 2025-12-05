import type { TemperatureHumidityData } from '../../../types';

// 保留一位小数
export const roundToOneDecimal = (value: number): number => {
  return Math.round(value * 10) / 10;
};

// 计算数据趋势并调整粘贴数据的值（同时调整温度和湿度）
export const adjustDataByTrend = (
  dataToPaste: TemperatureHumidityData[],
  existingData: TemperatureHumidityData[],
  targetTimestamp: number
): TemperatureHumidityData[] => {
  if (dataToPaste.length === 0 || existingData.length === 0) {
    return dataToPaste;
  }

  // 找到目标时间戳附近的数据点（前后各取5个点，最多10个点）
  const targetTime = targetTimestamp;
  const sortedExisting = [...existingData].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // 找到目标时间戳附近的点（包含温度和湿度）
  const nearbyPoints: Array<{ timestamp: number; temperature: number; humidity: number }> = [];
  
  // 向前查找（时间更早的点）
  for (let i = sortedExisting.length - 1; i >= 0; i--) {
    const item = sortedExisting[i];
    const itemTime = new Date(item.timestamp).getTime();
    if (itemTime <= targetTime) {
      nearbyPoints.unshift({
        timestamp: itemTime,
        temperature: item.temperature,
        humidity: item.humidity,
      });
      if (nearbyPoints.length >= 5) break;
    }
  }

  // 向后查找（时间更晚的点）
  for (let i = 0; i < sortedExisting.length; i++) {
    const item = sortedExisting[i];
    const itemTime = new Date(item.timestamp).getTime();
    if (itemTime > targetTime) {
      nearbyPoints.push({
        timestamp: itemTime,
        temperature: item.temperature,
        humidity: item.humidity,
      });
      if (nearbyPoints.length >= 10) break;
    }
  }

  // 如果附近没有足够的点，直接返回原始数据
  if (nearbyPoints.length < 2) {
    return dataToPaste;
  }

  // 计算温度和湿度的趋势（使用线性回归）
  const calculateTrend = (valueKey: 'temperature' | 'humidity') => {
    const n = nearbyPoints.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    nearbyPoints.forEach((point) => {
      const x = point.timestamp - targetTime; // 相对于目标时间的时间差
      const y = point[valueKey];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });

    // 计算斜率和截距
    const denominator = n * sumX2 - sumX * sumX;
    if (Math.abs(denominator) < 0.0001) {
      // 如果分母太小，返回固定偏移
      const avgValue = sumY / n;
      const firstPasteValue = dataToPaste[0][valueKey];
      return {
        slope: 0,
        intercept: avgValue,
        offset: avgValue - firstPasteValue,
      };
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    const expectedValueAtTarget = intercept;
    const firstPasteValue = dataToPaste[0][valueKey];
    const offset = expectedValueAtTarget - firstPasteValue;

    return { slope, intercept, offset };
  };

  const tempTrend = calculateTrend('temperature');
  const humidityTrend = calculateTrend('humidity');

  // 计算粘贴数据的时间跨度
  const pasteStartTime = new Date(dataToPaste[0].timestamp).getTime();
  const pasteEndTime = new Date(dataToPaste[dataToPaste.length - 1].timestamp).getTime();
  const pasteDuration = pasteEndTime - pasteStartTime;

  // 如果粘贴数据的时间跨度很小，使用固定偏移
  // 如果时间跨度较大，根据趋势斜率调整
  const useTrendAdjustment = pasteDuration > 1000 * 60 * 5; // 超过5分钟才使用趋势调整

  // 调整粘贴数据的值（同时调整温度和湿度）
  return dataToPaste.map((item) => {
    const itemTime = new Date(item.timestamp).getTime();
    const relativeTime = itemTime - pasteStartTime; // 相对于粘贴数据起始时间的时间差

    let adjustedTemperature: number;
    let adjustedHumidity: number;

    if (useTrendAdjustment && Math.abs(tempTrend.slope) > 0.0001) {
      // 使用趋势调整：根据时间差和斜率计算调整值
      const trendAdjustment = tempTrend.slope * relativeTime;
      adjustedTemperature = item.temperature + tempTrend.offset + trendAdjustment;
    } else {
      // 使用固定偏移：保持粘贴数据内部的相对关系
      adjustedTemperature = item.temperature + tempTrend.offset;
    }

    if (useTrendAdjustment && Math.abs(humidityTrend.slope) > 0.0001) {
      const trendAdjustment = humidityTrend.slope * relativeTime;
      adjustedHumidity = item.humidity + humidityTrend.offset + trendAdjustment;
    } else {
      adjustedHumidity = item.humidity + humidityTrend.offset;
    }

    return {
      ...item,
      temperature: roundToOneDecimal(adjustedTemperature),
      humidity: roundToOneDecimal(adjustedHumidity),
    };
  });
};

