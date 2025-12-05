import clientPromise from '../mongodb';
import { toObjectId } from '../utils';

export interface Task {
  _id?: string;
  taskNumber: string; // 任务编号
  taskName: string; // 任务名称
  categoryId: string; // 分类 id
  taskTypeId: string; // 任务类型 id
  userId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export async function createTask(
  taskNumber: string,
  taskName: string,
  categoryId: string,
  taskTypeId: string,
  userId: string
): Promise<Task> {
  const client = await clientPromise;
  const db = client.db();
  const tasks = db.collection<Task>('tasks');

  const newTask: Task = {
    taskNumber,
    taskName,
    categoryId,
    taskTypeId,
    userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await tasks.insertOne(newTask);
  return { ...newTask, _id: result.insertedId.toString() };
}

export async function getTasksByUser(userId: string): Promise<Task[]> {
  const client = await clientPromise;
  const db = client.db();
  const tasks = db.collection<Task>('tasks');
  return await tasks.find({ userId }).sort({ createdAt: -1 }).toArray();
}

export async function getTaskById(id: string, userId: string): Promise<Task | null> {
  const client = await clientPromise;
  const db = client.db();
  const tasks = db.collection<Task>('tasks');
  return await tasks.findOne({ _id: toObjectId(id), userId });
}

export async function updateTask(
  id: string,
  taskNumber: string,
  taskName: string,
  categoryId: string,
  taskTypeId: string,
  userId: string
): Promise<boolean> {
  const client = await clientPromise;
  const db = client.db();
  const tasks = db.collection<Task>('tasks');

  const result = await tasks.updateOne(
    { _id: toObjectId(id), userId },
    {
      $set: {
        taskNumber,
        taskName,
        categoryId,
        taskTypeId,
        updatedAt: new Date(),
      },
    }
  );

  return result.modifiedCount > 0;
}

export async function deleteTask(id: string, userId: string): Promise<boolean> {
  const client = await clientPromise;
  const db = client.db();
  const tasks = db.collection<Task>('tasks');

  const result = await tasks.deleteOne({ _id: toObjectId(id), userId });
  return result.deletedCount > 0;
}

