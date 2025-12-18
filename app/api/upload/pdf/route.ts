import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { uploadPdfToQiniu } from '@/lib/qiniu';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '请上传有效的PDF文件' }, { status: 400 });
    }

    // 验证文件类型
    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: '不支持的文件格式，仅支持PDF文件' },
        { status: 400 }
      );
    }

    // 验证文件大小（限制为 50MB）
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'PDF文件大小不能超过 50MB' },
        { status: 400 }
      );
    }

    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 上传到七牛云
    const pdfUrl = await uploadPdfToQiniu(buffer, user.userId, file.name);

    return NextResponse.json({ url: pdfUrl });
  } catch (error: any) {
    console.error('PDF上传失败:', error);
    return NextResponse.json(
      { error: error.message || 'PDF上传失败，请稍后重试' },
      { status: 500 }
    );
  }
}

