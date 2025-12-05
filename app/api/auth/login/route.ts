import { NextRequest, NextResponse } from 'next/server';
import { findUserByUsername, verifyPassword } from '@/lib/models/User';
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

    const user = await findUserByUsername(username);
    if (!user) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    const isValid = await verifyPassword(user, password);
    if (!isValid) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

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
      { error: error.message || '登录失败' },
      { status: 500 }
    );
  }
}


