/**
 * 任务处理器 — 使用内存存储
 */

import { taskStore, cleanupExpiredData } from './memory-store';

/**
 * 任务中断错误
 */
export class TaskAbortError extends Error {
  constructor(message: string = '任务已被用户中断') {
    super(message);
    this.name = 'TaskAbortError';
  }
}

/**
 * 检查任务是否被请求中断
 */
export async function checkTaskAbort(taskId: string): Promise<boolean> {
  const task = taskStore.get(taskId);
  return task?.abort_requested === true;
}

/**
 * 请求中断任务
 */
export async function requestTaskAbort(taskId: string): Promise<boolean> {
  const task = taskStore.get(taskId);
  if (!task) {
    return false;
  }

  task.abort_requested = true;
  taskStore.set(taskId, task);
  console.log(`任务 ${taskId} 已请求中断`);
  return true;
}

/**
 * 更新任务进度
 */
export async function updateTaskProgress(
  taskId: string,
  progress: number,
  currentStep: string,
  extraData?: {
    platform?: string;
    totalImages?: number;
    processedImages?: number;
  }
) {
  const task = taskStore.get(taskId);
  if (!task) {
    console.error('更新任务进度失败: 任务不存在', taskId);
    return;
  }

  task.progress = progress;
  task.current_step = currentStep;

  if (extraData?.platform) {
    task.platform = extraData.platform;
  }
  if (extraData?.totalImages !== undefined) {
    task.total_images = extraData.totalImages;
  }
  if (extraData?.processedImages !== undefined) {
    task.processed_images = extraData.processedImages;
  }

  taskStore.set(taskId, task);
  console.log(`更新任务进度: ${taskId}, ${progress}%, ${currentStep}`, extraData);
}

/**
 * 更新任务状态为失败
 */
export async function markTaskFailed(
  taskId: string,
  errorMessage: string
) {
  const task = taskStore.get(taskId);
  if (!task) {
    console.error('更新任务失败状态失败: 任务不存在', taskId);
    return;
  }

  task.status = 'failed';
  task.error_message = errorMessage;
  task.progress = 0;
  taskStore.set(taskId, task);
}

/**
 * 更新任务状态为处理中
 */
export async function markTaskProcessing(taskId: string) {
  const task = taskStore.get(taskId);
  if (!task) {
    console.error('更新任务处理中状态失败: 任务不存在', taskId);
    return;
  }

  task.status = 'processing';
  task.started_at = new Date().toISOString();
  task.progress = 0;
  task.current_step = '初始化处理...';
  taskStore.set(taskId, task);
}

/**
 * 更新任务状态为完成
 */
export async function markTaskCompleted(
  taskId: string,
  platform: string
) {
  const task = taskStore.get(taskId);
  if (!task) {
    console.error('更新任务完成状态失败: 任务不存在', taskId);
    return;
  }

  task.status = 'completed';
  task.completed_at = new Date().toISOString();
  task.platform = platform;
  task.progress = 100;
  task.current_step = '处理完成';
  taskStore.set(taskId, task);

  // 任务完成后自动清理过期数据
  cleanupExpiredData();
}
