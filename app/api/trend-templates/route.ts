import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createTrendTemplate,
  getTrendTemplatesByUser,
  getTrendTemplateById,
  updateTrendTemplate,
  deleteTrendTemplate,
} from '@/lib/models/TrendTemplate';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (id) {
      const template = await getTrendTemplateById(id, user.userId);
      if (!template) {
        return NextResponse.json({ error: '模版不存在' }, { status: 404 });
      }
      return NextResponse.json({ template });
    }

    const templates = await getTrendTemplatesByUser(user.userId);
    return NextResponse.json({ templates });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '获取模版失败' },
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

    const { name, description, segments, isPublic, startTime } = await request.json();

    if (!name || !segments) {
      return NextResponse.json({ error: '名称和趋势段不能为空' }, { status: 400 });
    }

    const template = await createTrendTemplate(
      name,
      segments,
      user.userId,
      isPublic || false,
      description,
      startTime
    );
    return NextResponse.json({ template });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '创建模版失败' },
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

    const { id, name, description, segments, isPublic, startTime } = await request.json();

    if (!id || !name || !segments) {
      return NextResponse.json({ error: 'ID、名称和趋势段不能为空' }, { status: 400 });
    }

    const success = await updateTrendTemplate(
      id,
      name,
      segments,
      user.userId,
      isPublic,
      description,
      startTime
    );
    if (!success) {
      return NextResponse.json({ error: '更新失败' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '更新模版失败' },
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

    const success = await deleteTrendTemplate(id, user.userId);
    if (!success) {
      return NextResponse.json({ error: '删除失败' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '删除模版失败' },
      { status: 500 }
    );
  }
}











