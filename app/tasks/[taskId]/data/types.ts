export interface TemperatureHumidityData {
  _id?: string;
  taskId: string;
  deviceId: string;
  temperature: number;
  humidity: number;
  timestamp: string;
}

export interface Device {
  deviceId: string;
  createdAt?: string;
  deviceSn?: string;
}

export interface Task {
  _id: string;
  taskNumber: string;
  taskName: string;
}

export type ChartPoint = {
  timestamp: number;
  temperature: number;
  humidity: number;
  // 可选的原始数据索引，便于交互编辑后找到对应点
  sourceIndex?: number;
  recordId?: string;
};

export interface TaskBackup {
  backupId: string;
  remark?: string;
  recordCount: number;
  createdAt: string;
  deviceIds?: string[];
}


