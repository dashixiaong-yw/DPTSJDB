import type { Metadata } from 'next';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '多平台账单对比系统',
    template: '%s | 多平台账单对比系统',
  },
  description:
    '支持抖音、拼多多、淘宝平台的Excel账单自动化比对系统',
  keywords: [
    '账单对比',
    '多平台',
    '抖音',
    '拼多多',
    '淘宝',
    'OCR',
    '数据比对',
  ],
  authors: [{ name: '多平台账单对比系统' }],
  generator: '',
  openGraph: {
    title: '多平台账单对比系统',
    description:
      '支持抖音、拼多多、淘宝平台的Excel账单自动化比对系统',
    url: '',
    siteName: '多平台账单对比系统',
    locale: 'zh_CN',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
