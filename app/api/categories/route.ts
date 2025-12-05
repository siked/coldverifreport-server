import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createCategory,
  getCategoriesByType,
  updateCategory,
  deleteCategory,
  moveCategory,
} from '@/lib/models/Category';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') as 'task' | 'template';

    if (!type || (type !== 'task' && type !== 'template')) {
      return NextResponse.json({ error: '无效的类型参数' }, { status: 400 });
    }

    const categories = await getCategoriesByType(type, user.userId);
    return NextResponse.json({ categories });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '获取分类失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { name, parentId, type, isTaskType, templateId } = await request.json();

    if (!name || !type) {
      return NextResponse.json({ error: '名称和类型不能为空' }, { status: 400 });
    }

    // 如果是任务类型，必须提供模版ID
    if (isTaskType && !templateId) {
      return NextResponse.json({ error: '任务类型必须选择模版' }, { status: 400 });
    }

    const category = await createCategory(
      name,
      parentId || null,
      type,
      user.userId,
      isTaskType,
      templateId
    );
    return NextResponse.json({ category });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '创建分类失败' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id, name, parentId, action } = await request.json();

    // 如果是移动操作
    if (action === 'move' && id !== undefined) {
      const success = await moveCategory(id, parentId || null, user.userId);
      if (!success) {
        return NextResponse.json({ error: '移动失败' }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    // 如果是更新名称操作
    if (!id || !name) {
      return NextResponse.json({ error: 'ID和名称不能为空' }, { status: 400 });
    }

    const success = await updateCategory(id, name, user.userId);
    if (!success) {
      return NextResponse.json({ error: '更新失败' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '更新分类失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID不能为空' }, { status: 400 });
    }

    const success = await deleteCategory(id, user.userId);
    if (!success) {
      return NextResponse.json({ error: '删除失败' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '删除分类失败' },
      { status: 500 }
    );
  }
}


