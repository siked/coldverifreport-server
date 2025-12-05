import { NextRequest, NextResponse } from 'next/server';
import { createUser } from '@/lib/models/User';
import { generateToken, setAuthToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: '用户名和密码不能为空' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: '密码长度至少为6位' },
        { status: 400 }
      );
    }

    const user = await createUser(username, password);
    const token = generateToken({
      userId: user._id!,
      username: user.username,
    });

    await setAuthToken(token);

    return NextResponse.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '注册失败' },
      { status: 400 }
    );
  }
}


