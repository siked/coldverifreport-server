import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createTemplate,
  getTemplatesByUser,
  getTemplateById,
  updateTemplate,
  deleteTemplate,
} from '@/lib/models/Template';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (id) {
      const template = await getTemplateById(id, user.userId);
      if (!template) {
        return NextResponse.json({ error: '模板不存在' }, { status: 404 });
      }
      return NextResponse.json({ template });
    }

    const templates = await getTemplatesByUser(user.userId);
    return NextResponse.json({ templates });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '获取模板失败' },
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

    const { name, content, categoryId } = await request.json();

    if (!name || !categoryId) {
      return NextResponse.json({ error: '名称和分类不能为空' }, { status: 400 });
    }

    const template = await createTemplate(name, content || '', categoryId, user.userId);
    return NextResponse.json({ template });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '创建模板失败' },
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

    const { id, name, content, tags, locations } = await request.json();

    if (!id || !name) {
      return NextResponse.json({ error: 'ID和名称不能为空' }, { status: 400 });
    }

    const success = await updateTemplate(id, name, content || '', user.userId, tags, locations);
    if (!success) {
      return NextResponse.json({ error: '更新失败' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '更新模板失败' },
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

    const success = await deleteTemplate(id, user.userId);
    if (!success) {
      return NextResponse.json({ error: '删除失败' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '删除模板失败' },
      { status: 500 }
    );
  }
}


