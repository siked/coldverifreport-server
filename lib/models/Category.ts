import clientPromise from '../mongodb';
import { toObjectId } from '../utils';

export interface Category {
  _id?: string;
  name: string;
  parentId: string | null;
  type: 'task' | 'template'; // 任务分类或模板分类
  isTaskType?: boolean; // 是否为任务类型
  templateId?: string; // 任务类型关联的模版ID
  userId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export async function createCategory(
  name: string,
  parentId: string | null,
  type: 'task' | 'template',
  userId: string,
  isTaskType?: boolean,
  templateId?: string
): Promise<Category> {
  const client = await clientPromise;
  const db = client.db();
  const categories = db.collection<Category>('categories');

  const newCategory: Category = {
    name,
    parentId,
    type,
    isTaskType: isTaskType || false,
    templateId: templateId || undefined,
    userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await categories.insertOne(newCategory);
  return { ...newCategory, _id: result.insertedId.toString() };
}

export async function getCategoriesByType(
  type: 'task' | 'template',
  userId: string
): Promise<Category[]> {
  const client = await clientPromise;
  const db = client.db();
  const categories = db.collection<Category>('categories');
  return await categories.find({ type, userId }).toArray();
}

export async function getCategoryById(id: string, userId: string): Promise<Category | null> {
  const client = await clientPromise;
  const db = client.db();
  const categories = db.collection<Category>('categories');
  return await categories.findOne({ _id: toObjectId(id), userId });
}

export async function updateCategory(
  id: string,
  name: string,
  userId: string,
  templateId?: string
): Promise<boolean> {
  const client = await clientPromise;
  const db = client.db();
  const categories = db.collection<Category>('categories');

  const updateData: any = { name, updatedAt: new Date() };
  if (templateId !== undefined) {
    updateData.templateId = templateId || undefined;
  }

  const result = await categories.updateOne(
    { _id: toObjectId(id), userId },
    { $set: updateData }
  );

  return result.modifiedCount > 0;
}

export async function deleteCategory(id: string, userId: string): Promise<boolean> {
  const client = await clientPromise;
  const db = client.db();
  const categories = db.collection<Category>('categories');

  // 先获取分类信息
  const category = await categories.findOne({ _id: toObjectId(id), userId });
  if (!category) {
    return false;
  }

  // 递归删除所有子分类
  const children = await categories.find({ parentId: id, userId }).toArray();
  for (const child of children) {
    await deleteCategory(child._id!, userId);
  }

  // 删除该分类下的所有任务（如果是任务类型分类）
  if (category.type === 'task' && category.isTaskType) {
    const tasks = db.collection('tasks');
    await tasks.deleteMany({ categoryId: id, userId });
  }

  // 删除该分类下的所有模板（如果是模板分类）
  if (category.type === 'template') {
    const templates = db.collection('templates');
    await templates.deleteMany({ categoryId: id, userId });
  }

  // 删除分类本身
  const result = await categories.deleteOne({ _id: toObjectId(id), userId });
  return result.deletedCount > 0;
}

export async function moveCategory(
  id: string,
  newParentId: string | null,
  userId: string
): Promise<boolean> {
  const client = await clientPromise;
  const db = client.db();
  const categories = db.collection<Category>('categories');

  // 不能将自己移动到自己的子分类下
  if (newParentId) {
    const targetCategory = await categories.findOne({ _id: toObjectId(newParentId), userId });
    if (!targetCategory) {
      throw new Error('目标分类不存在');
    }

    // 检查是否会形成循环引用
    let currentParentId = newParentId;
    while (currentParentId) {
      if (currentParentId === id) {
        throw new Error('不能将分类移动到自己的子分类下');
      }
      const parent = await categories.findOne({ _id: toObjectId(currentParentId), userId });
      currentParentId = parent?.parentId || null;
    }
  }

  const result = await categories.updateOne(
    { _id: toObjectId(id), userId },
    { $set: { parentId: newParentId, updatedAt: new Date() } }
  );

  return result.modifiedCount > 0;
}

