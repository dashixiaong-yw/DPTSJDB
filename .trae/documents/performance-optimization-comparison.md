# 性能优化计划 — 基于 GitHub 优秀开源项目对比

## 一、对比项目总览

| 项目 | Stars | 核心模式 | 可借鉴点 |
|------|-------|---------|---------|
| **BullMQ** | 6k+ | Redis 分布式任务队列 | 任务持久化、重试、限流、进度追踪 |
| **MinerU** | 50k+ | 双范式文档解析流水线 | 智能分流、超时熔断、Redis+Worker |
| **Docling (IBM)** | 57k+ | 可插拔 Pipeline | 格式适配器、Pipeline 选项可配置 |
| **Unstructured** | 10k+ | 分区器+策略模式 | fast/ocr_only/hi_res 三种策略 |
| **RAGFlow** | 40k+ | Controller-Worker | Redis 任务队列、多 Worker 扩容 |
| **PaddleOCR** | 47k+ | 多模型级联流水线 | 批量推理、模型分级 |
| **SheetJS** | 35k+ | 流式解析 | 大文件流式读取 |

---

## 二、当前系统性能瓶颈分析

### 瓶颈 1: OCR 调用无重试/限流
- **现状**: `recognizeImage` 失败直接返回 error，无重试
- **问题**: 网络波动导致单次 OCR 失败即整行数据缺失
- **对比**: BullMQ 内置指数退避重试 + Rate Limiter

### 瓶颈 2: Excel 解析全量加载
- **现状**: `workbook.xlsx.load(fileBuffer)` 一次性加载整个文件到内存
- **问题**: 大文件（含多张截图）可能占用 200MB+ 内存
- **对比**: SheetJS 支持流式读取；MinerU 分批处理

### 瓶颈 3: 图片 base64 编码开销
- **现状**: `generateDataUrl` 将图片读为 Buffer → base64 → data URL → 传给 OpenAI SDK
- **问题**: base64 编码增加 33% 体积；大图（5MB）生成 6.7MB data URL
- **对比**: PaddleOCR 本地推理无需编码传输

### 瓶颈 4: OCR 缓存键维度不足
- **现状**: 缓存键仅用 MD5，不同平台/图片类型对同一图片的提示词不同但返回相同缓存
- **问题**: 可能返回错误平台的 OCR 结果
- **对比**: PaddleOCR 按模型类型分级缓存

---

## 三、优化方案与回归风险分析

### P0: OCR 调用重试 + 限流 + 超时

**借鉴**: BullMQ 的重试 + 限流机制

**修改文件**: `src/lib/ocr-service.ts`

**方案**: 在 `recognizeImage` 方法内部添加：
1. 自动重试（最多3次，指数退避 1s/2s/4s）
2. 并发限制（Semaphore 模式，最多 5 个并发 OCR 请求）
3. 单次调用超时（30s）

**调用链分析**:
```
recognizeImage ← douyin.ts processImage (L267)
               ← pinduoduo.ts (L106-123)
               ← taobao.ts getOCRResult (L378)
                  ↑ taobao.ts processRow (L205) 通过 Promise.all 并发调用
```

**回归风险分析**:

| 风险点 | 分析 | 结论 |
|--------|------|------|
| 返回值类型变化 | recognizeImage 返回 `Promise<OCRResult>` 不变，重试仅在内部循环 | ✅ 无风险 |
| 重试延迟影响 | 3次重试最多增加 1+2+4=7s 延迟，总耗时从 ~5s 增加到 ~12s | ✅ 可接受，前端轮询间隔足够 |
| 并发限制阻塞 | Semaphore 5 并发，当前 taobao.ts Promise.all 可能超过 5 个 | ✅ Semaphore 会排队等待，不会丢失 |
| 超时中断 | AbortController 超时 30s，当前 OCR 调用一般 3-10s | ✅ 30s 足够，不会误杀正常请求 |
| 重试期间任务状态 | task-processor.ts 不感知重试，只看到最终结果 | ✅ 无影响 |
| 缓存一致性 | 重试成功后正常缓存结果，与当前行为一致 | ✅ 无影响 |
| 错误信息格式 | 返回 `{ error: "OCR识别失败(重试3次): ..." }` 包含更多上下文 | ✅ 改进，前端已处理 error 字段 |

**结论: 🟢 无回归风险** — 所有改动在 recognizeImage 内部，接口签名和返回类型不变

---

### P1: Excel 解析内存优化 — 大图片压缩

**借鉴**: SheetJS 流式读取 + MinerU 分批处理

**修改文件**: `src/lib/excel-parser.ts`

**方案**: 
1. 大图片压缩：超过 1MB 的嵌入图片在提取时缩放至合理尺寸（最大 1920px 宽，质量 0.8）
2. 图片提取后 fileBuffer 不再被后续流程引用（已验证：parseExcelFile 返回后 fileBuffer 无其他引用）

**调用链分析**:
```
parseExcelFile ← start/route.ts (L95-96)
  → extractEmbeddedImagesFromXlsx(fileBuffer)
    → 遍历图片 → generateDataUrl(image) → 返回 imageDataMap
  → 返回 { sheets, images: imageDataMap }
    → 后续 task-processor.ts 使用 images 传给 OCR
```

**回归风险分析**:

| 风险点 | 分析 | 结论 |
|--------|------|------|
| 图片压缩影响 OCR 精度 | 缩放至 1920px 宽 + 质量 0.8，文字仍清晰可辨 | ✅ 无影响（OCR 模型推荐 1024px+） |
| 图片格式变化 | 压缩后统一为 JPEG，原 PNG 透明背景变白 | ⚠️ 需确认：账单截图无透明背景需求 |
| 图片尺寸信息丢失 | 原始 width/height 变化，但 OCR 不依赖原始尺寸 | ✅ 无影响 |
| fileBuffer 释放时机 | fileBuffer 在 parseExcelFile 内部使用后即无引用，GC 自动回收 | ✅ 无需手动释放 |
| 压缩库依赖 | 需要引入 sharp 库进行图片压缩 | ⚠️ 新增依赖，需评估 Docker 构建 |

**关于 sharp 依赖的风险**:
- sharp 是 Node.js 最流行的图片处理库，但依赖 libvips 原生库
- Docker 构建需要额外安装 libvips-dev
- **替代方案**: 不引入 sharp，改用 Canvas API（@napi-rs/canvas）或直接在 OCR 调用前不做压缩
- **最终决定**: **暂不引入 sharp**，仅做逻辑上的内存优化（确保 fileBuffer 及时释放），图片压缩留待后续评估

**修正后的 P1 方案**:
1. 确保 parseExcelFile 返回后 fileBuffer 可被 GC 回收（当前已满足，无需改动）
2. 在 extractEmbeddedImagesFromXlsx 中添加图片大小日志，便于后续分析是否需要压缩

**结论: 🟢 无回归风险** — 实际改动极小，仅添加日志

---

### P2: OCR 缓存键维度优化

**借鉴**: PaddleOCR 的模型分级策略

**修改文件**: `src/lib/ocr-service.ts`

**方案**: 
1. 缓存键从纯 MD5 改为 `MD5:platform:imageType`，确保不同平台/图片类型返回不同结果
2. 缓存完整性检查按图片类型差异化

**调用链分析**:
```
recognizeImage(imageKey, platform, imageType, imageMd5)
  → checkCache(imageMd5)  // 当前仅用 MD5
  → callOCRApi(...)
  → cacheResult(imageMd5, result)  // 当前仅用 MD5
```

**回归风险分析**:

| 风险点 | 分析 | 结论 |
|--------|------|------|
| 缓存命中率下降 | 键维度增加，同一图片不同平台不再共享缓存 | ✅ 预期行为，不同平台提示词不同本就不应共享 |
| taobao.ts 本地缓存 | taobao.ts getOCRResult 有自己的 this.ocrCache，键为 `imageMd5 || imageKey` | ⚠️ 需同步修改 |
| 缓存容量 | ocrCacheStore 已有 LRU 500 条限制，维度增加不影响上限 | ✅ 无影响 |
| 现有缓存失效 | 部署后旧缓存键（纯 MD5）自然淘汰，不影响新请求 | ✅ 无影响 |

**taobao.ts 本地缓存问题**:
- taobao.ts L372: `const cacheKey = imageMd5 || imageKey;`
- taobao.ts L386: `this.ocrCache.set(cacheKey, ocrResult);`
- 这个本地缓存在 recognizeImage 之前检查，如果 MD5 相同但平台不同，会返回错误缓存
- **但**: taobao.ts 只处理淘宝平台，不会跨平台调用，所以本地缓存无此问题
- **结论**: taobao.ts 本地缓存无需修改

**结论: 🟢 无回归风险** — 缓存键维度增加是正确的修复，不会导致错误缓存

---

## 四、本次实施范围

仅实施 **P0（OCR 重试+限流+超时）** 和 **P2（缓存键优化）**：

| 优化项 | 修改文件 | 改动量 | 风险 |
|--------|---------|--------|------|
| P0: OCR 重试+限流+超时 | ocr-service.ts | ~60行 | 🟢 无回归风险 |
| P2: 缓存键维度优化 | ocr-service.ts | ~15行 | 🟢 无回归风险 |

P1（Excel 内存优化）暂不实施，原因：
- 当前 fileBuffer 已在 parseExcelFile 返回后无引用，GC 自动回收
- 图片压缩需引入 sharp 依赖，Docker 构建复杂度增加
- 实际收益需要先通过日志确认大图片是否为真实瓶颈

P3（SSE）和 P4（BullMQ）暂不实施，原因：
- SSE 需要新增 API 端点，改动范围较大
- BullMQ 需要 Redis，Docker 部署复杂度增加
- 当前系统为单机部署，内存方案已够用

---

## 五、执行步骤

1. P0: ocr-service.ts — recognizeImage 内部添加重试（3次指数退避）+ 并发限制（Semaphore 5）+ 超时（30s）
2. P2: ocr-service.ts — checkCache/cacheResult 缓存键增加 platform+imageType 维度
3. 验证: `pnpm ts-check` + `pnpm lint`
4. 版本号: 1.23 → 1.24（4处一致）
5. 同步: `sync-docker.ps1`
6. Git 提交推送
