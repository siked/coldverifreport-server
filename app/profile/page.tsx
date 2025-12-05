'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { User } from 'lucide-react';

interface UserInfo {
  id: string;
  username: string;
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch (error) {
      console.error('获取用户信息失败:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <div className="text-lg">加载中...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow p-8">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-primary-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">个人中心</h1>
              <p className="text-gray-500">查看和管理您的个人信息</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                用户名
              </label>
              <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-md">
                {user?.username || '-'}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                用户ID
              </label>
              <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-600">
                {user?.id || '-'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}


