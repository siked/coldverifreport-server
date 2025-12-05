import clientPromise from '../mongodb';
import bcrypt from 'bcryptjs';

export interface User {
  _id?: string;
  username: string;
  password: string;
  createdAt?: Date;
}

export async function createUser(username: string, password: string): Promise<User> {
  const client = await clientPromise;
  const db = client.db();
  const users = db.collection<User>('users');

  // 检查用户名是否已存在
  const existingUser = await users.findOne({ username });
  if (existingUser) {
    throw new Error('用户名已存在');
  }

  // 加密密码
  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser: User = {
    username,
    password: hashedPassword,
    createdAt: new Date(),
  };

  const result = await users.insertOne(newUser);
  return { ...newUser, _id: result.insertedId.toString() };
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const client = await clientPromise;
  const db = client.db();
  const users = db.collection<User>('users');
  return await users.findOne({ username });
}

export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return await bcrypt.compare(password, user.password);
}


