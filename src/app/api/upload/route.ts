import { NextRequest, NextResponse } from 'next/server';
import { taskStore, storageUploadFile, generateFilePath } from '@/lib/services';
import { v4 as uuidv4 } from 'uuid';

// 配置路由支持大文件上传
export const runtime = 'nodejs';
export const maxDuration = 300; // 5分钟超时
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  console.log('===== 收到上传请求 =====');
  console.log('请求方法:', request.method);
  console.log('请求URL:', request.url);
  
  const contentType = request.headers.get('content-type') || '';
  console.log('Content-Type:', contentType);
  console.log('Content-Length:', request.headers.get('content-length'));
  
  // 检查是否是 multipart/form-data
  if (!contentType.includes('multipart/form-data')) {
    console.error('错误: 不是 multipart/form-data 请求');
    return NextResponse.json(
      { error: '请求类型错误，需要 multipart/form-data' },
      { status: 400 }
    );
  }

  try {
    console.log('解析 FormData...');
    
    // 使用 request.formData() 来解析
    const formData = await request.formData();
    const fileEntry = formData.get('file');

    if (!fileEntry || !(fileEntry instanceof File)) {
      console.error('错误: 未找到文件或文件类型不正确');
      return NextResponse.json(
        { error: '未找到文件，请确保选择了文件' },
        { status: 400 }
      );
    }

    const file = fileEntry;

    console.log('文件信息:');
    console.log('  - 文件名:', file.name);
    console.log('  - 文件大小:', (file.size / 1024 / 1024).toFixed(2), 'MB');
    console.log('  - MIME类型:', file.type || '(空)');

    // 验证文件类型（检查MIME类型或文件扩展名）
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
      '',
    ];
    
    const fileName = file.name.toLowerCase();
    const isValidExtension = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    const isValidType = validTypes.includes(file.type);
    
    console.log('文件验证:');
    console.log('  - 扩展名有效:', isValidExtension);
    console.log('  - MIME类型有效:', isValidType);
    
    if (!isValidType && !isValidExtension) {
      const errorMsg = `文件格式不支持 (MIME: ${file.type || '空'})，请上传 .xlsx 文件（不支持旧版 .xls 格式）`;
      console.error('验证失败:', errorMsg);
      return NextResponse.json(
        { error: errorMsg },
        { status: 400 }
      );
    }

    // 验证文件大小（100MB）
    if (file.size > 100 * 1024 * 1024) {
      const errorMsg = `文件大小 ${(file.size / 1024 / 1024).toFixed(2)}MB 超过100MB限制`;
      console.error('验证失败:', errorMsg);
      return NextResponse.json(
        { error: errorMsg },
        { status: 400 }
      );
    }

    console.log('文件验证通过，开始处理...');

    // 生成任务ID
    const taskId = uuidv4();
    console.log('生成任务ID:', taskId);

    // 读取文件内容
    console.log('读取文件内容...');
    const fileBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(fileBuffer);
    console.log('文件内容读取完成，大小:', buffer.length, 'bytes');

    // 确定正确的contentType
    let finalContentType = file.type;
    if (!finalContentType || finalContentType === 'application/octet-stream' || finalContentType === '') {
      finalContentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    console.log('使用ContentType:', finalContentType);

    // 上传到对象存储
    console.log('上传到对象存储...');
    const filePath = generateFilePath(taskId, 'original');
    console.log('目标路径:', filePath);
    
    let actualKey: string;
    try {
      actualKey = await storageUploadFile({
        fileContent: buffer,
        fileName: filePath,
        contentType: finalContentType,
      });
      console.log('本地文件存储上传成功，实际Key:', actualKey);
    } catch (storageError) {
      console.error('本地文件存储上传失败:', storageError);
      return NextResponse.json(
        { error: `存储上传失败: ${storageError instanceof Error ? storageError.message : '未知错误'}` },
        { status: 500 }
      );
    }

    // 创建任务记录
    console.log('创建任务记录...');
    taskStore.set(taskId, {
      id: taskId,
      file_name: file.name,
      file_path: actualKey,
      status: 'uploaded',
      progress: 0,
      current_step: '已上传',
      abort_requested: false,
      total_images: 0,
      processed_images: 0,
      created_at: new Date().toISOString(),
    });
    console.log('任务记录创建成功:', taskId);

    console.log('===== 上传成功 =====');
    return NextResponse.json({
      taskId: taskId,
      status: 'uploaded',
      message: '文件上传成功，点击"开始比对"按钮开始处理'
    });

  } catch (error) {
    console.error('===== 上传处理异常 =====');
    console.error('错误类型:', error?.constructor?.name);
    console.error('错误详情:', error);
    if (error instanceof Error) {
      console.error('错误消息:', error.message);
      console.error('错误堆栈:', error.stack);
    }
    
    // 检查是否是请求体过大错误
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('too large') || errorMsg.includes('Entity Too Large') || errorMsg.includes('413')) {
      return NextResponse.json(
        { 
          error: '文件太大，服务器请求体限制不足。请联系管理员。',
        },
        { status: 413 }
      );
    }
    
    return NextResponse.json(
      { 
        error: '上传失败，请稍后重试',
      },
      { status: 500 }
    );
  }
}
