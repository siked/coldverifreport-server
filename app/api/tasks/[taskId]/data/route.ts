import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  getTemperatureHumidityDataByTask,
  getDevicesByTask,
  upsertTemperatureHumidityData,
  insertManyTemperatureHumidityData,
  deleteTemperatureHumidityData,
  deleteAllDataByTask,
} from '@/lib/models/TemperatureHumidity';
import { getTaskById } from '@/lib/models/Task';
import LZString from 'lz-string';

// GET: 获取任务的温湿度数据
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { taskId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId');
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');

    // 验证任务是否属于当前用户
    const task = await getTaskById(taskId, user.userId);
    if (!task) {
      return NextResponse.json({ error: '任务不存在或无权限' }, { status: 404 });
    }

    // 如果请求设备列表
    if (searchParams.get('type') === 'devices') {
      const devices = await getDevicesByTask(taskId);
      return NextResponse.json({ devices });
    }

    // 获取数据
    const data = await getTemperatureHumidityDataByTask(
      taskId,
      deviceId || undefined,
      startTime ? new Date(startTime) : undefined,
      endTime ? new Date(endTime) : undefined
    );

    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '获取数据失败' },
      { status: 500 }
    );
  }
}

// POST: 创建或更新温湿度数据
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
    
    // 检查是否是压缩数据
    const isCompressed = request.headers.get('x-compressed') === 'true';
    const encoding = request.headers.get('x-encoding') || 'raw';
    
    let body: any;
    if (isCompressed) {
      // 读取原始文本并解压
      const text = await request.text();
      if (!text || text.trim() === '') {
        return NextResponse.json({ error: '压缩数据为空' }, { status: 400 });
      }
      
      try {
        let decompressed: string | null = null;

        if (encoding === 'base64') {
          decompressed = LZString.decompressFromBase64(text);
        } else if (encoding === 'uri') {
          decompressed = LZString.decompressFromEncodedURIComponent(text);
        } else {
          decompressed = LZString.decompress(text);
        }

        if (!decompressed) {
          return NextResponse.json({ error: '数据解压失败：无法解压数据' }, { status: 400 });
        }
        body = JSON.parse(decompressed);
      } catch (error: any) {
        console.error('解压数据失败:', error);
        return NextResponse.json({ 
          error: `数据解压失败：${error.message || '未知错误'}` 
        }, { status: 400 });
      }
    } else {
      body = await request.json();
    }

    // 验证任务是否属于当前用户
    const task = await getTaskById(taskId, user.userId);
    if (!task) {
      return NextResponse.json({ error: '任务不存在或无权限' }, { status: 404 });
    }

    // 批量插入
    if (Array.isArray(body)) {
      const data = body.map((item) => ({
        deviceId: item.deviceId,
        temperature: item.temperature,
        humidity: item.humidity,
        timestamp: new Date(item.timestamp),
      }));

      await insertManyTemperatureHumidityData(taskId, data);
      return NextResponse.json({ success: true });
    }

    // 单个插入或更新
    const { deviceId, temperature, humidity, timestamp } = body;

    if (!deviceId || temperature === undefined || humidity === undefined || !timestamp) {
      return NextResponse.json({ error: '所有字段不能为空' }, { status: 400 });
    }

    const data = await upsertTemperatureHumidityData(
      taskId,
      deviceId,
      parseFloat(temperature),
      parseFloat(humidity),
      new Date(timestamp)
    );

    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '保存数据失败' },
      { status: 500 }
    );
  }
}

// DELETE: 删除温湿度数据
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { taskId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId');
    const timestamp = searchParams.get('timestamp');

    // 验证任务是否属于当前用户
    const task = await getTaskById(taskId, user.userId);
    if (!task) {
      return NextResponse.json({ error: '任务不存在或无权限' }, { status: 404 });
    }

    // 如果没有指定deviceId和timestamp，删除所有数据
    if (!deviceId && !timestamp) {
      const success = await deleteAllDataByTask(taskId);
      if (!success) {
        return NextResponse.json({ error: '删除失败' }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    const success = await deleteTemperatureHumidityData(
      taskId,
      deviceId || undefined,
      timestamp ? new Date(timestamp) : undefined
    );

    if (!success) {
      return NextResponse.json({ error: '删除失败' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '删除数据失败' },
      { status: 500 }
    );
  }
}

