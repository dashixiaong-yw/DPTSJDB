import { NextRequest, NextResponse } from 'next/server';
import { taskStore, resultStore, ocrCacheStore, storageDeleteFile, storageDeleteDir, cleanOldTasks } from '@/lib/services';
import { requestTaskAbort } from '@/lib/task-processor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 获取任务历史列表（自动过滤48小时前的任务）
export async function GET(request: NextRequest) {
  try {
    // 清理48小时前的任务
    cleanOldTasks(48);

    // 从内存获取所有任务，按创建时间倒序，限制50条
    const tasks = Array.from(taskStore.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 50);

    return NextResponse.json({
      success: true,
      tasks,
    });

  } catch (error) {
    console.error('获取任务列表异常:', error);
    return NextResponse.json(
      { error: '获取任务列表失败' },
      { status: 500 }
    );
  }
}

// 删除指定任务
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json(
        { error: '缺少任务ID' },
        { status: 400 }
      );
    }

    const task = taskStore.get(taskId);

    // 如果任务正在处理中，先请求中断
    if (task?.status === 'processing' || task?.status === 'uploaded') {
      console.log(`[删除任务] 任务 ${taskId} 正在${task.status}，先请求中断`);

      await requestTaskAbort(taskId);

      // 等待一段时间让任务检测到中断并停止，最多等待3秒
      const maxWaitTime = 3000;
      const checkInterval = 500;
      let waited = 0;

      while (waited < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waited += checkInterval;

        const currentTask = taskStore.get(taskId);
        if (!currentTask || currentTask.status !== 'processing') {
          console.log(`[删除任务] 任务 ${taskId} 已停止，状态: ${currentTask?.status}`);
          break;
        }
      }

      if (waited >= maxWaitTime) {
        console.log(`[删除任务] 任务 ${taskId} 未能在超时前停止，强制删除`);
      }
    }

    // 删除比对结果
    resultStore.delete(taskId);

    // 删除任务文件
    if (task?.file_path) {
      try {
        storageDeleteFile(task.file_path);
      } catch (e) {
        console.error('删除任务文件失败:', task.file_path, e);
      }
    }

    // 删除上传目录
    try {
      storageDeleteDir(`excel_uploads/${taskId}`);
    } catch (e) {
      // 目录可能不存在，忽略
    }

    // 删除任务记录（内存存储中 task_image 和 ocr_cache 是内联的，无需单独删除）
    taskStore.delete(taskId);

    return NextResponse.json({
      success: true,
      message: '任务已删除',
    });

  } catch (error) {
    console.error('删除任务失败:', error);
    return NextResponse.json(
      { error: '删除任务失败' },
      { status: 500 }
    );
  }
}
