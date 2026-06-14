/**
 * 内存存储模块 — 替代 Supabase 数据库
 * 纯内存存储，重启后数据丢失
 */

// ==================== 任务状态 ====================

export type TaskStatus = 'uploaded' | 'processing' | 'completed' | 'failed';

export interface TaskRecord {
  id: string;
  file_name: string;
  file_path: string;
  status: TaskStatus;
  platform?: string;
  progress: number;
  current_step: string;
  error_message?: string;
  abort_requested: boolean;
  total_images: number;
  processed_images: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

// ==================== 比对结果 ====================

export interface ComparisonRecord {
  task_id: string;
  shop_name: string;
  field_name: string;
  table_value: string;
  ocr_value: string | null;
  status: 'match' | 'mismatch' | 'missing';
  sheet_name: string;
  row_index: number;
  col_index: number;
  cell_ref: string;
  month?: string;
  image_key?: string;
  ocr_shop_name?: string | null;
  shop_name_match?: 'match' | 'mismatch' | 'missing' | null;
  ocr_month?: string | null;
  ocr_date_range?: Record<string, unknown> | null;
  month_match?: 'match' | 'mismatch' | 'not_full_month' | 'missing' | null;
  is_zero_value?: boolean | null;
  created_at: string;
}

// ==================== OCR 缓存 ====================

export interface OCRCacheRecord {
  image_md5: string;
  result_json: unknown;
  created_at: string;
}

// ==================== 字段映射 ====================

export interface FieldMappingRecord {
  platform: string;
  table_field: string;
  image_field: string;
  confidence: number;
  confirmed: boolean;
}

// ==================== 存储实例 ====================

export const taskStore = new Map<string, TaskRecord>();
export const resultStore = new Map<string, ComparisonRecord[]>();
export const ocrCacheStore = new Map<string, OCRCacheRecord>();
export const fieldMappingStore = new Map<string, FieldMappingRecord[]>();

/** OCR 缓存最大条数（LRU 淘汰阈值） */
const OCR_CACHE_MAX_SIZE = 500;

/** 任务数据最大保留时间（小时） */
const TASK_MAX_AGE_HOURS = 24;

// ==================== 辅助方法 ====================

/** 获取所有任务，按创建时间倒序 */
export function getAllTasks(): TaskRecord[] {
  return Array.from(taskStore.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/** 清理超过指定小时的任务，返回被删除任务的文件路径列表 */
export async function cleanOldTasks(maxAgeHours: number): Promise<string[]> {
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  const deletedFilePaths: string[] = [];
  for (const [id, task] of taskStore.entries()) {
    if (new Date(task.created_at).getTime() < cutoff) {
      // 收集文件路径供调用方清理磁盘文件
      if (task.file_path) {
        deletedFilePaths.push(task.file_path);
      }
      resultStore.delete(id);
      taskStore.delete(id);
    }
  }
  return deletedFilePaths;
}

/** 清理 OCR 缓存：LRU 淘汰超出上限的旧记录 */
function evictOcrCache(): void {
  if (ocrCacheStore.size <= OCR_CACHE_MAX_SIZE) return;

  // 按创建时间排序，删除最旧的
  const entries = Array.from(ocrCacheStore.entries())
    .sort((a, b) => new Date(a[1].created_at).getTime() - new Date(b[1].created_at).getTime());

  const deleteCount = ocrCacheStore.size - OCR_CACHE_MAX_SIZE;
  for (let i = 0; i < deleteCount; i++) {
    ocrCacheStore.delete(entries[i][0]);
  }

  console.log(`[内存清理] OCR缓存LRU淘汰: 删除${deleteCount}条, 剩余${ocrCacheStore.size}条`);
}

/** 自动清理：过期任务 + OCR 缓存超限 */
export function cleanupExpiredData(): void {
  // 1. 清理过期任务和结果
  const cutoff = Date.now() - TASK_MAX_AGE_HOURS * 60 * 60 * 1000;
  let taskDeleted = 0;
  for (const [id, task] of taskStore.entries()) {
    if (new Date(task.created_at).getTime() < cutoff) {
      resultStore.delete(id);
      taskStore.delete(id);
      taskDeleted++;
    }
  }
  if (taskDeleted > 0) {
    console.log(`[内存清理] 清理${taskDeleted}个过期任务（超过${TASK_MAX_AGE_HOURS}小时）`);
  }

  // 2. OCR 缓存 LRU 淘汰
  evictOcrCache();

  // 3. 清理无主结果（任务已删除但结果残留）
  let orphanDeleted = 0;
  for (const taskId of resultStore.keys()) {
    if (!taskStore.has(taskId)) {
      resultStore.delete(taskId);
      orphanDeleted++;
    }
  }
  if (orphanDeleted > 0) {
    console.log(`[内存清理] 清理${orphanDeleted}个无主结果`);
  }
}

/** 获取任务比对结果 */
export function getTaskResults(taskId: string): ComparisonRecord[] {
  return resultStore.get(taskId) || [];
}

/** 追加比对结果（Node.js 单线程下 Map 操作天然原子，无需锁） */
export function appendTaskResults(taskId: string, results: ComparisonRecord[]): void {
  const existing = resultStore.get(taskId) || [];
  resultStore.set(taskId, [...existing, ...results]);
}
