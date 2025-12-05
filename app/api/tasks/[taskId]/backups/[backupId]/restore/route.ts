import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getTaskById } from '@/lib/models/Task';
import { restoreTaskFromBackup } from '@/lib/models/TemperatureHumidity';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string; backupId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { taskId, backupId } = await params;
    const task = await getTaskById(taskId, user.userId);
    if (!task) {
      return NextResponse.json({ error: '任务不存在或无权限' }, { status: 404 });
    }

    const { restoredCount } = await restoreTaskFromBackup(taskId, backupId);
    return NextResponse.json({ success: true, restoredCount });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '恢复备份失败' },
      { status: 500 }
    );
  }
}

