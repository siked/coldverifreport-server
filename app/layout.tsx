import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '冷链验证报告生成系统',
  description: '冷链验证报告生成和管理系统',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}


