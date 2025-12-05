import clientPromise from '../mongodb';
import { toObjectId } from '../utils';

export interface TemperatureHumidityData {
  _id?: string;
  taskId: string; // 任务ID
  deviceId: string; // 设备ID
  temperature: number; // 温度
  humidity: number; // 湿度
  timestamp: Date; // 时间戳
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Device {
  _id?: string;
  taskId: string; // 任务ID
  deviceId: string; // 设备ID
  deviceName?: string; // 设备名称（可选）
  createdAt?: Date;
}

export interface TaskBackupMeta {
  _id?: string;
  taskId: string;
  backupId: string;
  backupCollection: string;
  remark?: string;
  recordCount: number;
  createdAt: Date;
  deviceIds?: string[];
}

const BACKUP_META_COLLECTION = 'task_backups_meta';

// 获取任务特定的集合名称
function getCollectionName(taskId: string): string {
  // 使用任务ID创建独立的集合名称
  // 集合名称格式: task_<taskId>
  // 确保taskId是有效的MongoDB集合名称（移除特殊字符）
  const safeTaskId = taskId.replace(/[^a-zA-Z0-9_]/g, '_');
  return `task_${safeTaskId}`;
}

function getBackupCollectionName(taskId: string, backupId: string): string {
  const safeTaskId = taskId.replace(/[^a-zA-Z0-9_]/g, '_');
  const safeBackupId = backupId.replace(/[^a-zA-Z0-9_]/g, '_');
  return `task_${safeTaskId}_${safeBackupId}`;
}

function generateBackupId(date = new Date()): string {
  const pad = (value: number, length = 2) => value.toString().padStart(length, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}_${ms}`;
}

// 确保集合有索引（提高查询性能）
async function ensureIndexes(collection: any) {
  try {
    await collection.createIndex({ deviceId: 1, timestamp: 1 });
    await collection.createIndex({ timestamp: 1 });
  } catch (error) {
    // 索引可能已存在，忽略错误
    console.warn('创建索引时出现警告:', error);
  }
}

// 创建或更新温湿度数据
export async function upsertTemperatureHumidityData(
  taskId: string,
  deviceId: string,
  temperature: number,
  humidity: number,
  timestamp: Date
): Promise<TemperatureHumidityData> {
  const client = await clientPromise;
  const db = client.db();
  const collectionName = getCollectionName(taskId);
  const collection = db.collection<TemperatureHumidityData>(collectionName);
  
  // 确保索引存在
  await ensureIndexes(collection);

  const data: TemperatureHumidityData = {
    taskId,
    deviceId,
    temperature,
    humidity,
    timestamp,
    updatedAt: new Date(),
  };

  // 使用 deviceId + timestamp 作为唯一标识（因为每个任务有独立集合，不需要taskId）
  // 将timestamp转换为Date对象以便精确匹配
  const timestampDate = new Date(timestamp);
  const result = await collection.findOneAndUpdate(
    {
      deviceId,
      timestamp: timestampDate,
    },
    {
      $set: data,
      $setOnInsert: { createdAt: new Date() },
    },
    {
      upsert: true,
      returnDocument: 'after',
    }
  );

  return { ...data, _id: result._id?.toString() };
}

// 批量插入温湿度数据
export async function insertManyTemperatureHumidityData(
  taskId: string,
  data: Omit<TemperatureHumidityData, '_id' | 'createdAt' | 'updatedAt' | 'taskId'>[]
): Promise<void> {
  const client = await clientPromise;
  const db = client.db();
  const collectionName = getCollectionName(taskId);
  const collection = db.collection<TemperatureHumidityData>(collectionName);
  
  // 确保索引存在
  await ensureIndexes(collection);

  const documents = data.map((item) => ({
    ...item,
    taskId,
    timestamp: new Date(item.timestamp),
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  await collection.insertMany(documents);
}

// 获取任务的所有温湿度数据
export async function getTemperatureHumidityDataByTask(
  taskId: string,
  deviceId?: string,
  startTime?: Date,
  endTime?: Date
): Promise<TemperatureHumidityData[]> {
  const client = await clientPromise;
  const db = client.db();
  const collectionName = getCollectionName(taskId);
  const collection = db.collection<TemperatureHumidityData>(collectionName);

  // 由于每个任务有独立集合，不需要在查询中包含taskId
  const query: any = {};
  if (deviceId) {
    query.deviceId = deviceId;
  }
  if (startTime || endTime) {
    query.timestamp = {};
    if (startTime) {
      query.timestamp.$gte = new Date(startTime);
    }
    if (endTime) {
      query.timestamp.$lte = new Date(endTime);
    }
  }

  return await collection
    .find(query)
    .sort({ timestamp: 1 })
    .toArray();
}

// 获取任务的所有设备列表
export async function getDevicesByTask(taskId: string): Promise<Device[]> {
  const client = await clientPromise;
  const db = client.db();
  const collectionName = getCollectionName(taskId);
  const collection = db.collection<TemperatureHumidityData>(collectionName);

  // 使用聚合查询获取唯一的设备列表
  // 由于每个任务有独立集合，不需要在match中包含taskId
  const devices = await collection
    .aggregate([
      {
        $group: {
          _id: '$deviceId',
          firstTimestamp: { $min: '$timestamp' },
        },
      },
      {
        $project: {
          _id: 0,
          deviceId: '$_id',
          createdAt: '$firstTimestamp',
        },
      },
      { $sort: { createdAt: 1 } },
    ])
    .toArray();

  return devices.map((d) => ({
    taskId,
    deviceId: d.deviceId,
    createdAt: d.createdAt,
  }));
}

// 删除温湿度数据
export async function deleteTemperatureHumidityData(
  taskId: string,
  deviceId?: string,
  timestamp?: Date
): Promise<boolean> {
  const client = await clientPromise;
  const db = client.db();
  const collectionName = getCollectionName(taskId);
  const collection = db.collection<TemperatureHumidityData>(collectionName);

  // 由于每个任务有独立集合，不需要在查询中包含taskId
  const query: any = {};
  if (deviceId) {
    query.deviceId = deviceId;
  }
  if (timestamp) {
    query.timestamp = new Date(timestamp);
  }

  const result = await collection.deleteMany(query);
  // 即使没有匹配的文档也视为操作成功，便于前端删除“空设备”等场景
  return result.deletedCount >= 0;
}

// 删除任务的所有数据（删除整个集合）
export async function deleteAllDataByTask(taskId: string): Promise<boolean> {
  const client = await clientPromise;
  const db = client.db();
  const collectionName = getCollectionName(taskId);
  const collection = db.collection<TemperatureHumidityData>(collectionName);

  // 删除集合中的所有文档
  const result = await collection.deleteMany({});
  // 如果集合为空，可以选择删除集合本身（可选）
  // await collection.drop();
  
  return result.deletedCount >= 0; // 即使没有文档也返回true，表示操作成功
}

export async function createTaskBackup(
  taskId: string,
  remark?: string
): Promise<TaskBackupMeta> {
  const client = await clientPromise;
  const db = client.db();
  const sourceCollectionName = getCollectionName(taskId);
  const sourceCollection = db.collection<TemperatureHumidityData>(sourceCollectionName);
  const createdAt = new Date();
  const backupId = generateBackupId(createdAt);
  const backupCollectionName = getBackupCollectionName(taskId, backupId);
  const backupCollection = db.collection<TemperatureHumidityData>(backupCollectionName);

  const documents = await sourceCollection.find({}).toArray();

  // 清空并写入备份集合
  await backupCollection.deleteMany({});
  if (documents.length > 0) {
    await backupCollection.insertMany(documents);
  }

  const backupsMeta = db.collection<TaskBackupMeta>(BACKUP_META_COLLECTION);
  const sanitizedRemark = remark?.trim() ? remark.trim() : undefined;

  const deviceIds = Array.from(new Set(documents.map((doc) => doc.deviceId))).sort();

  const backupMeta: TaskBackupMeta = {
    taskId,
    backupId,
    backupCollection: backupCollectionName,
    remark: sanitizedRemark,
    recordCount: documents.length,
    createdAt,
    deviceIds,
  };

  const insertResult = await backupsMeta.insertOne(backupMeta as any);
  return {
    ...backupMeta,
    _id: insertResult.insertedId?.toString(),
  };
}

export async function getTaskBackups(taskId: string): Promise<TaskBackupMeta[]> {
  const client = await clientPromise;
  const db = client.db();
  const backupsMeta = db.collection<TaskBackupMeta>(BACKUP_META_COLLECTION);

  const backups = await backupsMeta
    .find({ taskId })
    .sort({ createdAt: -1 })
    .toArray();

  return backups.map((backup) => ({
    ...backup,
    _id: backup._id?.toString(),
  }));
}

export async function restoreTaskFromBackup(
  taskId: string,
  backupId: string
): Promise<{ restoredCount: number }> {
  const client = await clientPromise;
  const db = client.db();
  const backupsMeta = db.collection<TaskBackupMeta>(BACKUP_META_COLLECTION);

  const backupMeta = await backupsMeta.findOne({ taskId, backupId });
  if (!backupMeta) {
    throw new Error('未找到指定的备份');
  }

  const sourceCollectionName = getCollectionName(taskId);
  const targetCollection = db.collection<TemperatureHumidityData>(sourceCollectionName);
  const backupCollection = db.collection<TemperatureHumidityData>(backupMeta.backupCollection);

  const backupDocuments = await backupCollection.find({}).toArray();

  await targetCollection.deleteMany({});
  if (backupDocuments.length > 0) {
    await targetCollection.insertMany(backupDocuments);
  }

  await ensureIndexes(targetCollection);

  return { restoredCount: backupDocuments.length };
}

