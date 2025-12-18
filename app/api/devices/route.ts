import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createDevice,
  getDevicesByUser,
  updateDevice,
  deleteDevice,
} from '@/lib/models/Device';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const devices = await getDevicesByUser(user.userId);
    return NextResponse.json({ devices });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '获取设备列表失败' },
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

    const { deviceNumber } = await request.json();

    if (!deviceNumber) {
      return NextResponse.json({ error: '设备编号不能为空' }, { status: 400 });
    }

    const device = await createDevice(deviceNumber, user.userId);
    return NextResponse.json({ device });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '创建设备失败' },
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

    const { id, deviceNumber } = await request.json();

    if (!id || !deviceNumber) {
      return NextResponse.json({ error: '设备ID和编号不能为空' }, { status: 400 });
    }

    const success = await updateDevice(id, deviceNumber, user.userId);
    if (!success) {
      return NextResponse.json({ error: '更新设备失败' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '更新设备失败' },
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
      return NextResponse.json({ error: '设备ID不能为空' }, { status: 400 });
    }

    const success = await deleteDevice(id, user.userId);
    if (!success) {
      return NextResponse.json({ error: '删除设备失败' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '删除设备失败' },
      { status: 500 }
    );
  }
}

