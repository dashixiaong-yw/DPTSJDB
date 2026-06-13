import { NextRequest, NextResponse } from 'next/server';
import { taskStore, storageUploadFile, generateFilePath } from '@/lib/services';
import { v4 as uuidv4 } from 'uuid';

// FormData 分片上传 - 直接在后端完成存储，避免二次上传
export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// 存储分片数据（内存中，临时方案）
const chunkStoreV2 = new Map<string, { 
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
  for (const [key, value] of chunkStoreV2.entries()) {
    if (now - value.createdAt > 30 * 60 * 1000) {
      chunkStoreV2.delete(key);
    }
  }
}, 60000);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    const uploadId = formData.get('uploadId') as string | null;
    const chunkIndex = parseInt(formData.get('chunkIndex') as string || '0', 10);
    const totalChunks = parseInt(formData.get('totalChunks') as string || '0', 10);
    const chunkFile = formData.get('chunk') as File | null;
    const fileName = formData.get('fileName') as string || 'unknown';
    const fileSize = parseInt(formData.get('fileSize') as string || '0', 10);
    const mimeType = formData.get('mimeType') as string || 'application/octet-stream';
    const isLastChunk = formData.get('isLastChunk') === 'true';

    if (!chunkFile) {
      return NextResponse.json({ error: '缺少分片数据' }, { status: 400 });
    }

    // 初始化或获取分片存储
    const currentUploadId = uploadId || uuidv4();
    let uploadData = chunkStoreV2.get(currentUploadId);
    
    if (!uploadData) {
      uploadData = {
        chunks: new Map(),
        totalChunks: totalChunks || 1,
        fileName,
        fileSize,
        mimeType,
        createdAt: Date.now(),
      };
      chunkStoreV2.set(currentUploadId, uploadData);
    }

    // 读取分片数据
    const chunkBuffer = Buffer.from(await chunkFile.arrayBuffer());
    uploadData.chunks.set(chunkIndex, chunkBuffer);

    console.log(`分片上传: uploadId=${currentUploadId}, chunk=${chunkIndex + 1}/${uploadData.totalChunks}`);

    // 检查是否所有分片都已上传
    if (isLastChunk || uploadData.chunks.size === uploadData.totalChunks) {
      console.log(`所有分片已接收，开始合并...`);
      console.log(`预期文件大小: ${(uploadData.fileSize / 1024 / 1024).toFixed(2)} MB`);
      
      // 合并所有分片
      const sortedChunks = Array.from(uploadData.chunks.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, buffer]) => buffer);
      
      const completeBuffer = Buffer.concat(sortedChunks);
      const actualSize = completeBuffer.length;
      const expectedSize = uploadData.fileSize;
      
      console.log(`文件合并完成，实际大小: ${(actualSize / 1024 / 1024).toFixed(2)} MB`);
      
      // 验证文件大小
      if (expectedSize > 0 && actualSize !== expectedSize) {
        const missingBytes = expectedSize - actualSize;
        console.error(`文件大小不匹配！预期: ${expectedSize} bytes, 实际: ${actualSize} bytes, 缺少: ${missingBytes} bytes`);
        console.error(`收到分片数: ${uploadData.chunks.size}/${uploadData.totalChunks}`);
        
        // 清理分片存储
        chunkStoreV2.delete(currentUploadId);
        
        return NextResponse.json({
          success: false,
          error: `文件上传不完整，缺少 ${(missingBytes / 1024 / 1024).toFixed(2)} MB 数据，请重新上传`,
          expectedSize,
          actualSize,
          receivedChunks: uploadData.chunks.size,
          totalChunks: uploadData.totalChunks,
        }, { status: 400 });
      }

      // 清理分片存储
      chunkStoreV2.delete(currentUploadId);

      // === 直接在后端完成存储，不再返回给前端 ===
      
      // 生成任务ID
      const taskId = uuidv4();
      
      // 确定正确的 contentType
      let finalContentType = mimeType;
      const lowerFileName = fileName.toLowerCase();
      if (!finalContentType || finalContentType === 'application/octet-stream') {
        if (lowerFileName.endsWith('.xlsx')) {
          finalContentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        } else if (lowerFileName.endsWith('.xls')) {
          finalContentType = 'application/vnd.ms-excel';
        }
      }

      // 上传到对象存储
      const filePath = generateFilePath(taskId, 'original');
      console.log('上传到对象存储:', filePath);
      
      const actualKey = await storageUploadFile({
        fileContent: completeBuffer,
        fileName: filePath,
        contentType: finalContentType,
      });
      console.log('本地文件存储上传成功，实际Key:', actualKey);

      // 创建任务记录
      taskStore.set(taskId, {
        id: taskId,
        file_name: fileName,
        file_path: actualKey,
        status: 'uploaded',
        progress: 0,
        current_step: '已上传',
        abort_requested: false,
        total_images: 0,
        processed_images: 0,
        created_at: new Date().toISOString(),
      });

      console.log('上传任务创建成功:', taskId);

      // 返回任务ID
      return NextResponse.json({
        success: true,
        isComplete: true,
        taskId: taskId,
        fileName: fileName,
        fileSize: completeBuffer.length,
        status: 'uploaded',
      });
    }

    // 返回进度
    return NextResponse.json({
      success: true,
      uploadId: currentUploadId,
      isComplete: false,
      receivedChunks: uploadData.chunks.size,
      totalChunks: uploadData.totalChunks,
    });

  } catch (error) {
    console.error('FormData分片上传错误:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '分片上传失败' },
      { status: 500 }
    );
  }
}
