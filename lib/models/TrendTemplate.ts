import clientPromise from '../mongodb';
import { toObjectId } from '../utils';

export interface TrendTemplate {
  _id?: string;
  name: string;
  description?: string;
  segments: {
    temperature: Array<{
      id: string;
      type: string;
      startTime: number;
      duration: number;
      params: any;
    }>;
    humidity: Array<{
      id: string;
      type: string;
      startTime: number;
      duration: number;
      params: any;
    }>;
  };
  startTime?: number; // 默认开始时间（时间戳）
  userId: string;
  isPublic: boolean; // 是否公开
  createdAt?: Date;
  updatedAt?: Date;
}

export async function createTrendTemplate(
  name: string,
  segments: TrendTemplate['segments'],
  userId: string,
  isPublic: boolean = false,
  description?: string,
  startTime?: number
): Promise<TrendTemplate> {
  const client = await clientPromise;
  const db = client.db();
  const templates = db.collection<TrendTemplate>('trendTemplates');

  const newTemplate: TrendTemplate = {
    name,
    description,
    segments,
    startTime,
    userId,
    isPublic,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await templates.insertOne(newTemplate);
  return { ...newTemplate, _id: result.insertedId.toString() };
}

export async function getTrendTemplatesByUser(userId: string): Promise<TrendTemplate[]> {
  const client = await clientPromise;
  const db = client.db();
  const templates = db.collection<TrendTemplate>('trendTemplates');
  return await templates
    .find({ $or: [{ userId }, { isPublic: true }] })
    .sort({ updatedAt: -1 })
    .toArray();
}

export async function getTrendTemplateById(id: string, userId: string): Promise<TrendTemplate | null> {
  const client = await clientPromise;
  const db = client.db();
  const templates = db.collection<TrendTemplate>('trendTemplates');
  return await templates.findOne({
    _id: toObjectId(id),
    $or: [{ userId }, { isPublic: true }],
  });
}

export async function updateTrendTemplate(
  id: string,
  name: string,
  segments: TrendTemplate['segments'],
  userId: string,
  isPublic?: boolean,
  description?: string,
  startTime?: number
): Promise<boolean> {
  const client = await clientPromise;
  const db = client.db();
  const templates = db.collection<TrendTemplate>('trendTemplates');

  const updateData: any = {
    name,
    segments,
    updatedAt: new Date(),
  };

  if (isPublic !== undefined) {
    updateData.isPublic = isPublic;
  }
  if (description !== undefined) {
    updateData.description = description;
  }
  if (startTime !== undefined) {
    updateData.startTime = startTime;
  }

  const result = await templates.updateOne(
    { _id: toObjectId(id), userId },
    { $set: updateData }
  );

  return result.modifiedCount > 0;
}

export async function deleteTrendTemplate(id: string, userId: string): Promise<boolean> {
  const client = await clientPromise;
  const db = client.db();
  const templates = db.collection<TrendTemplate>('trendTemplates');

  const result = await templates.deleteOne({ _id: toObjectId(id), userId });
  return result.deletedCount > 0;
}













