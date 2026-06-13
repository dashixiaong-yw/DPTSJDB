# 计划：Docker 部署配置调整（移除 Supabase + 本地文件存储）

## 摘要
移除 Supabase 数据库依赖，改为纯内存存储（任务状态、OCR缓存、比对结果），文件存储改为本地文件系统。同时调整 Docker 部署所需的所有配置。

## 当前状态分析

### Supabase 使用范围（14个文件）

| 数据表 | 用途 | 替代方案 |
|--------|------|---------|
| `upload_task` | 任务状态管理（上传/处理中/完成/失败/进度/中断） | 内存 Map |
| `comparison_result` | 比对结果详情 | 内存 Map |
| `task_image` | 任务关联图片记录 | 内存 Map |
| `ocr_cache` | OCR识别结果缓存（基于图片MD5） | 内存 Map |
| `field_mapping` | 字段映射配置 | 内存 Map |

### S3 对象存储使用范围
- 文件上传：`storage.uploadFile()` → 改为本地文件写入
- 文件下载：`storage.readFile()` → 改为本地文件读取
- 文件删除：`storage.deleteFile()` → 改为本地文件删除
- 签名URL：`storage.generatePresignedUrl()` → 改为本地文件读取+data URL

### coze-coding-dev-sdk 使用范围
- `S3Storage` — S3 存储 → 移除，改用 fs
- `LLMClient` + `Config` — LLM 调用 → 保留，但需改为直接 API 调用或独立配置

## 具体修改

### 第一部分：核心存储层重构

#### 1. 新建 `src/lib/memory-store.ts` — 内存存储

替代所有 Supabase 数据表操作：

```typescript
// 任务状态
interface TaskRecord {
  id: string;
  file_name: string;
  file_path: string;  // 本地文件路径
  status: 'uploaded' | 'processing' | 'completed' | 'failed';
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

// 比对结果
interface ComparisonRecord { /* 同 ComparisonItem 字段 */ }

// OCR缓存
interface OCRCacheRecord {
  image_md5: string;
  result_json: any;
  created_at: string;
}

// 导出单例 store
export const taskStore = new Map<string, TaskRecord>();
export const resultStore = new Map<string, ComparisonRecord[]>();
export const ocrCacheStore = new Map<string, OCRCacheRecord>();
export const fieldMappingStore = new Map<string, any[]>();
```

#### 2. 新建 `src/lib/local-storage.ts` — 本地文件存储

替代 S3Storage：

```typescript
import fs from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads');

// 确保目录存在
async function ensureDir(dir: string): Promise<void> { ... }

// 上传文件（写入本地）
export async function uploadFile(params: { fileContent: Buffer; fileName: string; contentType?: string }): Promise<string> { ... }

// 读取文件
export async function readFile(fileKey: string): Promise<Buffer> { ... }

// 删除文件
export async function deleteFile(fileKey: string): Promise<void> { ... }

// 生成 data URL（替代签名URL）
export async function generateDataUrl(fileKey: string): Promise<string> { ... }

// 生成文件路径
export function generateFilePath(taskId: string, type: 'original' | 'image' | 'result', filename?: string): string { ... }
```

#### 3. 重构 `src/lib/ocr-service.ts` — 替换 S3 和 Supabase

- `storage.generatePresignedUrl()` → `localStorage.generateDataUrl()`
- `getSupabaseClient()` + `ocr_cache` 表 → `ocrCacheStore`
- `LLMClient` + `Config` from `coze-coding-dev-sdk` → 保留，但需要确认 SDK 是否可独立使用

#### 4. 重构 `src/lib/services.ts` — 移除 S3 和 Supabase 导出

```typescript
// 移除: import { S3Storage } from 'coze-coding-dev-sdk';
// 移除: import { getSupabaseClient } from '@/storage/database/supabase-client';
// 改为导出内存存储和本地文件存储
export * from './memory-store';
export * from './local-storage';
```

#### 5. 重构 `src/lib/task-processor.ts` — 使用内存存储

所有 `getSupabaseClient().from('upload_task')` → `taskStore.get()/set()`

#### 6. 重构 `src/lib/comparison-engine.ts` — 使用内存存储

- `saveResults()` → `resultStore.set()`
- `getResults()` → `resultStore.get()`

### 第二部分：API 路由重构（7个文件）

#### 7. `src/app/api/upload/route.ts`
- `storage.uploadFile()` → `localStorage.uploadFile()`
- `getDatabaseClient().from('upload_task').insert()` → `taskStore.set()`

#### 8. `src/app/api/upload/chunk-v2/route.ts`
- 同上

#### 9. `src/app/api/tasks/route.ts`
- GET: `getDatabaseClient().from('upload_task').select()` → `Array.from(taskStore.values())`
- DELETE: 清理内存+本地文件

#### 10. `src/app/api/task/[taskId]/start/route.ts`
- `storage.readFile()` → `localStorage.readFile()`
- `saveResults()` → `resultStore.set()`

#### 11. `src/app/api/task/[taskId]/status/route.ts`
- `getDatabaseClient().from('upload_task').select()` → `taskStore.get()`

#### 12. `src/app/api/task/[taskId]/result/route.ts`
- `getDatabaseClient().from('upload_task').select()` → `taskStore.get()`
- `comparisonEngine.getResults()` → `resultStore.get()`

#### 13. `src/app/api/task/[taskId]/download/route.ts`
- `storage.readFile()` → `localStorage.readFile()`
- `getDatabaseClient().from('comparison_result').select()` → `resultStore.get()`

#### 14. `src/app/api/cache/clear/route.ts`
- `getSupabaseClient().from('ocr_cache')` → `ocrCacheStore.clear()`

#### 15. `src/app/api/template/route.ts`
- `getDatabaseClient().from('field_mapping')` → `fieldMappingStore`

### 第三部分：Docker 配置

#### 16. 重构 `src/lib/ocr-service.ts` — LLM 调用

`coze-coding-dev-sdk` 的 `LLMClient` 和 `Config` 需要确认是否可脱离 Coze 平台独立使用。如果不可以，需要替换为直接调用 Kimi API。

**决策**：先尝试保留 `coze-coding-dev-sdk` 的 LLM 部分，如果 Docker 中无法使用再替换。SDK 的 Config 类可能依赖环境变量来获取 API 密钥。

#### 17. `package.json` — 修改 scripts + 移除无用依赖

```json
{
  "scripts": {
    "dev": "next dev --turbopack -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "eslint",
    "ts-check": "tsc -p tsconfig.json"
  }
}
```

移除依赖：
- `@supabase/supabase-js` — 不再需要
- `coze-coding-dev-sdk` — 仅 S3Storage 不需要，LLMClient 保留（如果可用）
- `drizzle-kit`, `drizzle-orm`, `drizzle-zod` — 数据库 ORM 不再需要
- `pg`, `@types/pg` — PostgreSQL 驱动不再需要
- `dotenv` — 改用 Next.js 内置环境变量
- `@react-dev-inspector/babel-plugin`, `@react-dev-inspector/middleware`, `react-dev-inspector` — 开发工具

#### 18. `src/app/layout.tsx` — 移除 Inspector

删除 Inspector 导入和使用。

#### 19. `.babelrc` — 简化

```json
{
  "presets": ["next/babel"]
}
```

#### 20. `next.config.ts` — 添加 standalone 输出

```typescript
output: 'standalone',
```

#### 21. 新建 `Dockerfile`

多阶段构建，node:20-alpine 基础镜像。

#### 22. 新建 `.dockerignore`

#### 23. 新建 `docker-compose.yml`

#### 24. 新建 `.env.example`

#### 25. 删除 `src/storage/database/` 目录

#### 26. 删除 `scripts/` 目录（bash 脚本不再需要）

## 假设与决策

1. **纯内存存储**：用户选择无持久化，重启后数据丢失。Docker 中通过 volume 挂载 `data/uploads` 目录保留上传文件
2. **coze-coding-dev-sdk 的 LLMClient**：先保留，Docker 中通过环境变量配置 API 密钥。如果不可用，后续替换为直接 HTTP 调用 Kimi API
3. **OCR 缓存**：内存中缓存，重启后清空，首次识别会重新调用 LLM
4. **字段映射**：内存中存储，重启后清空，需要重新上传模板
5. **48小时自动清理**：内存中通过定时器实现，替代数据库查询清理

## 验证步骤

1. `pnpm build` 成功
2. `pnpm dev` 启动正常
3. 上传 Excel 文件成功
4. 开始比对 → OCR 识别 → 结果展示正常
5. 下载标记文件正常
6. Docker 镜像构建成功
7. Docker 容器运行正常
