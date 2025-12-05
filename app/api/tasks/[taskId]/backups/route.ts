import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getTaskById } from '@/lib/models/Task';
import {
  createTaskBackup,
  getTaskBackups,
  TaskBackupMeta,
} from '@/lib/models/TemperatureHumidity';

function serializeBackup(backup: TaskBackupMeta) {
  return {
    backupId: backup.backupId,
    remark: backup.remark,
    recordCount: backup.recordCount,
    createdAt: backup.createdAt instanceof Date ? backup.createdAt.toISOString() : backup.createdAt,
    deviceIds: backup.deviceIds || [],
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { taskId } = await params;
    const task = await getTaskById(taskId, user.userId);
    if (!task) {
      return NextResponse.json({ error: '任务不存在或无权限' }, { status: 404 });
    }

    const backups = await getTaskBackups(taskId);
    return NextResponse.json({ backups: backups.map(serializeBackup) });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '获取备份列表失败' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { taskId } = await params;
    const task = await getTaskById(taskId, user.userId);
    if (!task) {
      return NextResponse.json({ error: '任务不存在或无权限' }, { status: 404 });
    }

    let remark: string | undefined;
    try {
      const body = await request.json();
      remark = body?.remark;
    } catch {
      remark = undefined;
    }

    const backup = await createTaskBackup(taskId, remark);
    return NextResponse.json({ backup: serializeBackup(backup) });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '创建备份失败' },
      { status: 500 }
    );
  }
}

