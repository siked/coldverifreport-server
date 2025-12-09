import clientPromise from '../mongodb';
import { toObjectId } from '../utils';

export interface TemplateTag {
  _id?: string;
  name: string;
  description?: string;
  type: 'text' | 'number' | 'date' | 'datetime' | 'location' | 'boolean' | 'image' | 'cda-image';
  value: any;
  functionConfig?: any;
}

export interface Template {
  _id?: string;
  name: string;
  content: string; // Markdown 内容
  categoryId: string;
  userId: string;
  tags?: TemplateTag[];
  locations?: string; // 布点区域，用 | 分割
  taskId?: string; // 关联的任务ID
  createdAt?: Date;
  updatedAt?: Date;
}

export async function createTemplate(
  name: string,
  content: string,
  categoryId: string,
  userId: string
): Promise<Template> {
  const client = await clientPromise;
  const db = client.db();
  const templates = db.collection<Template>('templates');

  const newTemplate: Template = {
    name,
    content,
    categoryId,
    userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await templates.insertOne(newTemplate);
  return { ...newTemplate, _id: result.insertedId.toString() };
}

export async function getTemplatesByUser(userId: string): Promise<Template[]> {
  const client = await clientPromise;
  const db = client.db();
  const templates = db.collection<Template>('templates');
  return await templates.find({ userId }).sort({ updatedAt: -1 }).toArray();
}

export async function getTemplateById(id: string, userId: string): Promise<Template | null> {
  const client = await clientPromise;
  const db = client.db();
  const templates = db.collection<Template>('templates');
  return await templates.findOne({ _id: toObjectId(id), userId });
}

export async function updateTemplate(
  id: string,
  name: string,
  content: string,
  userId: string,
  tags?: TemplateTag[],
  locations?: string,
  taskId?: string
): Promise<boolean> {
  const client = await clientPromise;
  const db = client.db();
  const templates = db.collection<Template>('templates');

  const updateData: any = {
    name,
    content,
    updatedAt: new Date(),
  };

  if (tags !== undefined) {
    updateData.tags = tags;
  }

  if (locations !== undefined) {
    updateData.locations = locations;
  }

  if (taskId !== undefined) {
    updateData.taskId = taskId;
  }

  const result = await templates.updateOne(
    { _id: toObjectId(id), userId },
    {
      $set: updateData,
    }
  );

  return result.modifiedCount > 0;
}

export async function deleteTemplate(id: string, userId: string): Promise<boolean> {
  const client = await clientPromise;
  const db = client.db();
  const templates = db.collection<Template>('templates');

  const result = await templates.deleteOne({ _id: toObjectId(id), userId });
  return result.deletedCount > 0;
}

