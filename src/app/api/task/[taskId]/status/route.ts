import { NextRequest, NextResponse } from 'next/server';
import { taskStore } from '@/lib/services';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;

    if (!taskId) {
      return NextResponse.json(
        { error: '缺少任务ID' },
        { status: 400 }
      );
    }

    const task = taskStore.get(taskId);

    if (!task) {
      return NextResponse.json(
        { error: '任务不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: task.id,
      status: task.status,
      platform: task.platform,
      fileName: task.file_name,
      createdAt: task.created_at,
      startedAt: task.started_at,
      completedAt: task.completed_at,
      error: task.error_message,
      progress: task.progress || 0,
      currentStep: task.current_step,
      totalImages: task.total_images || 0,
      processedImages: task.processed_images || 0,
      modelAllFailed: task.model_all_failed || false,
    });

  } catch (error) {
    console.error('查询任务状态错误:', error);
    return NextResponse.json(
      { error: '查询失败' },
      { status: 500 }
    );
  }
}
