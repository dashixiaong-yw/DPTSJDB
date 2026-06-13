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

// ==================== 辅助方法 ====================

/** 获取所有任务，按创建时间倒序 */
export function getAllTasks(): TaskRecord[] {
  return Array.from(taskStore.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/** 清理超过指定小时的任务 */
export async function cleanOldTasks(maxAgeHours: number): Promise<void> {
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  for (const [id, task] of taskStore.entries()) {
    if (new Date(task.created_at).getTime() < cutoff) {
      resultStore.delete(id);
      taskStore.delete(id);
    }
  }
}

/** 获取任务比对结果 */
export function getTaskResults(taskId: string): ComparisonRecord[] {
  return resultStore.get(taskId) || [];
}

/** 保存比对结果 */
export function saveTaskResults(taskId: string, results: ComparisonRecord[]): void {
  resultStore.set(taskId, results);
}

/** 追加比对结果 */
export function appendTaskResults(taskId: string, results: ComparisonRecord[]): void {
  const existing = resultStore.get(taskId) || [];
  resultStore.set(taskId, [...existing, ...results]);
}
