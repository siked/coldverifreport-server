import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import clientPromise from '@/lib/mongodb';

interface IncomingRow {
  index: number;
  deviceNumber: string;
  certificateNumber: string;
  issueDate: string;
  expiryDate: string;
  pdfUrl?: string;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { rows } = await request.json();
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: '请求数据格式错误' }, { status: 400 });
    }

    const validRows: IncomingRow[] = rows
      .map((row: any) => ({
        index: row.index,
        deviceNumber: (row.deviceNumber || '').trim(),
        certificateNumber: (row.certificateNumber || '').trim(),
        issueDate: row.issueDate,
        expiryDate: row.expiryDate,
        pdfUrl: (row.pdfUrl || '').trim() || undefined,
      }))
      .filter(
        (row) => row.deviceNumber && row.certificateNumber && row.issueDate && row.expiryDate
      );

    if (validRows.length === 0) {
      return NextResponse.json({ error: '没有有效的导入数据' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();
    const devices = db.collection('devices');
    const certificates = db.collection('certificates');

    const successes: number[] = [];
    const errors: { index: number; message: string }[] = [];

    for (const row of validRows) {
      try {
        // 查找或创建设备
        const existingDevice = await devices.findOne({
          deviceNumber: row.deviceNumber,
          userId: user.userId,
        });

        let deviceId: string;
        if (existingDevice) {
          deviceId = existingDevice._id.toString();
        } else {
          const result = await devices.insertOne({
            deviceNumber: row.deviceNumber,
            userId: user.userId,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          deviceId = result.insertedId.toString();
        }

        // 创建证书
        await certificates.insertOne({
          certificateNumber: row.certificateNumber,
          deviceId,
          issueDate: row.issueDate,
          expiryDate: row.expiryDate,
          pdfUrl: row.pdfUrl,
          userId: user.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        successes.push(row.index);
      } catch (error: any) {
        errors.push({ index: row.index, message: error?.message || '导入失败' });
      }
    }

    return NextResponse.json({
      successCount: successes.length,
      failedCount: errors.length,
      successes,
      errors,
    });
  } catch (error: any) {
    console.error('批量导入证书失败:', error);
    return NextResponse.json(
      { error: error.message || '批量导入证书失败' },
      { status: 500 }
    );
  }
}


