/**
 * 服务统一导出 — 移除 S3 和 Supabase 依赖
 */

// 内存存储
export {
  taskStore,
  resultStore,
  ocrCacheStore,
  fieldMappingStore,
  getAllTasks,
  cleanOldTasks,
  cleanupExpiredData,
  cleanupAll,
  getTaskResults,
  appendTaskResults,
  type TaskRecord,
  type TaskStatus,
  type ComparisonRecord,
  type OCRCacheRecord,
  type FieldMappingRecord,
} from './memory-store';

// 本地文件存储
export {
  uploadFile as storageUploadFile,
  readFile as storageReadFile,
  deleteFile as storageDeleteFile,
  deleteDir as storageDeleteDir,
  generateDataUrl,
  generateFilePath,
} from './local-storage';
