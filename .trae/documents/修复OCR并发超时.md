# 修复 OCR 请求并发超时问题

## 摘要

Docker 部署后 OCR 请求全部超时（`Request was aborted.`），5 张图片同时发起请求导致 SiliconFlow API 响应不过来。

## 根因

- 并发控制 `maxConcurrency = 5`，5 张图片同时请求 SiliconFlow API
- 单次超时 30 秒，SiliconFlow API 在高并发下响应慢，全部超时
- 超时后重试 3 次，每次仍然并发 5 个，形成恶性循环

## 修改方案

### 修改文件：`src/lib/ocr-service.ts`

1. **降低并发数**：`maxConcurrency` 从 5 降到 2
2. **增加超时时间**：单次超时从 30 秒增加到 60 秒（NAS 网络延迟比本地大）

## 验证步骤

1. `pnpm ts-check` + `pnpm lint`
2. 版本更新：按 5 步流程
