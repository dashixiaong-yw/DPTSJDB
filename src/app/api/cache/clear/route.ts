import { NextRequest, NextResponse } from 'next/server';
import { ocrCacheStore } from '@/lib/services';

/**
 * 清理OCR缓存
 * 
 * POST /api/cache/clear
 * Body: { type: 'ocr' | 'all' }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type = 'ocr' } = body;
    
    if (type === 'ocr' || type === 'all') {
      // 先获取当前缓存数量
      const beforeCount = ocrCacheStore.size;
      
      // 清理OCR缓存
      ocrCacheStore.clear();
      
      console.log(`已清理 ${beforeCount} 条OCR缓存记录`);
      
      return NextResponse.json({
        success: true,
        message: `已清理 ${beforeCount} 条OCR缓存记录`,
        clearedCount: beforeCount
      });
    }
    
    return NextResponse.json(
      { error: '不支持的清理类型' },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('清理缓存失败:', error);
    return NextResponse.json(
      { error: '清理缓存失败' },
      { status: 500 }
    );
  }
}

/**
 * 获取缓存统计信息
 * 
 * GET /api/cache/clear
 */
export async function GET() {
  try {
    // 获取OCR缓存数量
    const ocrCount = ocrCacheStore.size;
    
    return NextResponse.json({
      ocrCacheCount: ocrCount
    });
    
  } catch (error) {
    console.error('获取缓存统计失败:', error);
    return NextResponse.json(
      { error: '获取缓存统计失败' },
      { status: 500 }
    );
  }
}
