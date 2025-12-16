import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createTask,
  getTasksByUser,
  updateTask,
  deleteTask,
} from '@/lib/models/Task';
import { getTemplateById } from '@/lib/models/Template';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const tasks = await getTasksByUser(user.userId);
    return NextResponse.json({ tasks });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '获取任务失败' },
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

    const { taskNumber, taskName, categoryId, taskTypeId, reportContent } = await request.json();

    if (!taskNumber || !taskName || !categoryId || !taskTypeId) {
      return NextResponse.json({ error: '所有字段不能为空' }, { status: 400 });
    }

    // 获取模板并同步 tags
    let tags = undefined;
    if (taskTypeId) {
      const template = await getTemplateById(taskTypeId, user.userId);
      if (template && template.tags) {
        // 深拷贝模板的 tags 到任务
        tags = JSON.parse(JSON.stringify(template.tags));
      }
    }

    const task = await createTask(
      taskNumber,
      taskName,
      categoryId,
      taskTypeId,
      user.userId,
      tags,
      reportContent
    );
    return NextResponse.json({ task });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '创建任务失败' },
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

    const { id, taskNumber, taskName, categoryId, taskTypeId, tags, reportContent } =
      await request.json();

    if (!id || !taskNumber || !taskName || !categoryId || !taskTypeId) {
      return NextResponse.json({ error: '所有字段不能为空' }, { status: 400 });
    }

    const success = await updateTask(
      id,
      taskNumber,
      taskName,
      categoryId,
      taskTypeId,
      user.userId,
      tags,
      reportContent
    );
    if (!success) {
      return NextResponse.json({ error: '更新失败' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '更新任务失败' },
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

    const success = await deleteTask(id, user.userId);
    if (!success) {
      return NextResponse.json({ error: '删除失败' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '删除任务失败' },
      { status: 500 }
    );
  }
}


