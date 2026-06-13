import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

// 分片上传 - 用于绕过代理大小限制
export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// 存储分片数据（内存中，临时方案）
const chunkStore = new Map<string, { 
  chunks: Map<number, Buffer>;
  totalChunks: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: number;
}>();

// 清理过期的分片（超过30分钟）
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of chunkStore.entries()) {
    if (now - value.createdAt > 30 * 60 * 1000) {
      chunkStore.delete(key);
    }
  }
}, 60000);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      taskId, 
      chunkIndex, 
      totalChunks, 
      chunkData, 
      fileName, 
      fileSize, 
      mimeType,
      isLastChunk 
    } = body;

    if (!chunkData) {
      return NextResponse.json({ error: '缺少分片数据' }, { status: 400 });
    }

    // 初始化或获取分片存储
    let uploadId = taskId;
    if (!uploadId) {
      uploadId = uuidv4();
    }

    let uploadData = chunkStore.get(uploadId);
    if (!uploadData) {
      uploadData = {
        chunks: new Map(),
        totalChunks: totalChunks || 0,
        fileName: fileName || 'unknown',
        fileSize: fileSize || 0,
        mimeType: mimeType || 'application/octet-stream',
        createdAt: Date.now(),
      };
      chunkStore.set(uploadId, uploadData);
    }

    // 解码 Base64 数据
    const buffer = Buffer.from(chunkData, 'base64');
    uploadData.chunks.set(chunkIndex, buffer);

    // 如果是最后一个分片，合并并处理
    if (isLastChunk || uploadData.chunks.size === uploadData.totalChunks) {
      console.log(`所有分片已接收，开始合并... 总分片数: ${uploadData.totalChunks}`);
      
      // 合并所有分片
      const sortedChunks = Array.from(uploadData.chunks.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, buffer]) => buffer);
      
      const completeBuffer = Buffer.concat(sortedChunks);
      console.log(`文件合并完成，总大小: ${(completeBuffer.length / 1024 / 1024).toFixed(2)} MB`);

      // 清理分片存储
      chunkStore.delete(uploadId);

      // 返回合并后的数据，让调用方继续处理
      return NextResponse.json({
        success: true,
        uploadId,
        isComplete: true,
        fileData: completeBuffer.toString('base64'),
        fileName: uploadData.fileName,
        fileSize: completeBuffer.length,
        mimeType: uploadData.mimeType,
      });
    }

    // 返回进度
    return NextResponse.json({
      success: true,
      uploadId,
      isComplete: false,
      receivedChunks: uploadData.chunks.size,
      totalChunks: uploadData.totalChunks,
    });

  } catch (error) {
    console.error('分片上传错误:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '分片上传失败' },
      { status: 500 }
    );
  }
}
