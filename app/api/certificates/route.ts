import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createCertificate,
  getCertificatesByDevice,
  updateCertificate,
  deleteCertificate,
} from '@/lib/models/Certificate';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId');

    if (!deviceId) {
      return NextResponse.json({ error: '设备ID不能为空' }, { status: 400 });
    }

    const certificates = await getCertificatesByDevice(deviceId, user.userId);
    return NextResponse.json({ certificates });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '获取证书列表失败' },
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

    const { certificateNumber, deviceId, issueDate, expiryDate, pdfUrl } = await request.json();

    if (!certificateNumber || !deviceId || !issueDate || !expiryDate) {
      return NextResponse.json({ error: '所有必填字段不能为空' }, { status: 400 });
    }

    const certificate = await createCertificate(
      certificateNumber,
      deviceId,
      issueDate,
      expiryDate,
      user.userId,
      pdfUrl
    );
    return NextResponse.json({ certificate });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '创建证书失败' },
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

    const { id, certificateNumber, issueDate, expiryDate, pdfUrl } = await request.json();

    if (!id || !certificateNumber || !issueDate || !expiryDate) {
      return NextResponse.json({ error: '所有必填字段不能为空' }, { status: 400 });
    }

    const success = await updateCertificate(
      id,
      certificateNumber,
      issueDate,
      expiryDate,
      user.userId,
      pdfUrl
    );
    if (!success) {
      return NextResponse.json({ error: '更新证书失败' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '更新证书失败' },
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
      return NextResponse.json({ error: '证书ID不能为空' }, { status: 400 });
    }

    const success = await deleteCertificate(id, user.userId);
    if (!success) {
      return NextResponse.json({ error: '删除证书失败' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '删除证书失败' },
      { status: 500 }
    );
  }
}

