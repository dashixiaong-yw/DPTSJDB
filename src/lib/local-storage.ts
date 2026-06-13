/**
 * 本地文件存储模块 — 替代 S3 对象存储
 * 文件存储在 data/uploads/ 目录下
 */

import fs from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads');

/** 确保目录存在 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

/** 上传文件（写入本地文件系统） */
export async function uploadFile(params: {
  fileContent: Buffer;
  fileName: string;
  contentType?: string;
}): Promise<string> {
  const filePath = params.fileName;
  const fullPath = path.join(UPLOAD_DIR, filePath);
  const dir = path.dirname(fullPath);

  await ensureDir(dir);
  await fs.writeFile(fullPath, params.fileContent);

  return filePath;
}

/** 读取文件 */
export async function readFile(fileKey: string): Promise<Buffer> {
  const fullPath = path.join(UPLOAD_DIR, fileKey);
  return fs.readFile(fullPath);
}

/** 删除文件 */
export async function deleteFile(fileKey: string): Promise<void> {
  try {
    const fullPath = path.join(UPLOAD_DIR, fileKey);
    await fs.unlink(fullPath);
  } catch (error) {
    // 文件不存在时忽略错误
    console.error('删除文件失败:', fileKey, error);
  }
}

/** 删除目录（递归） */
export async function deleteDir(dirKey: string): Promise<void> {
  try {
    const fullPath = path.join(UPLOAD_DIR, dirKey);
    await fs.rm(fullPath, { recursive: true, force: true });
  } catch (error) {
    console.error('删除目录失败:', dirKey, error);
  }
}

/** 生成 data URL（替代签名 URL，用于 OCR 识别） */
export async function generateDataUrl(fileKey: string): Promise<string> {
  const buffer = await readFile(fileKey);
  const ext = path.extname(fileKey).toLowerCase();

  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
  };

  const mime = mimeMap[ext] || 'image/png';
  const base64 = buffer.toString('base64');

  return `data:${mime};base64,${base64}`;
}

/** 生成文件存储路径 */
export function generateFilePath(
  taskId: string,
  type: 'original' | 'image' | 'result',
  filename?: string
): string {
  const basePath = `excel_uploads/${taskId}`;

  switch (type) {
    case 'original':
      return `${basePath}/original.xlsx`;
    case 'image':
      return `${basePath}/images/${filename}`;
    case 'result':
      return `${basePath}/result/marked_${taskId}.xlsx`;
    default:
      return basePath;
  }
}

/** 检查文件是否存在 */
export async function fileExists(fileKey: string): Promise<boolean> {
  try {
    const fullPath = path.join(UPLOAD_DIR, fileKey);
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}
