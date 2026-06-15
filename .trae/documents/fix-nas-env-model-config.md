# 修复 NAS 部署 OCR 模型配置不生效的问题

## 问题摘要

NAS 重新部署后，日志仍显示 `[OCR服务] 尝试模型: moonshot-v1-vision-preview`，尽管本地代码和 `.env` 都已更新为 `Qwen/Qwen3-VL-32B-Instruct`。

## 根因分析

### 为什么 ROC 模型配置不生效

1. **`docker/.env` 是独立副本，不会被同步覆盖**
   - 同步脚本 `sync-docker.ps1` L106-112 对 `.env` 的处理策略是：**仅当 `docker/.env` 不存在时才从 `.env.example` 创建**；如果已存在，则跳过（`= .env (exists, not overwritten)`）。
   - 当前 `docker/.env` 内容为：
     ```
     KIMI_VISION_MODEL=moonshot-v1-vision-preview
     ```
   - 尽管根目录 `.env` 已正确更新为 `Qwen/Qwen3-VL-32B-Instruct`，但 `docker/.env` 从未被同步更新。

2. **Docker 使用 `env_file: - .env` 加载环境变量**
   - `docker-compose.yml` L14-15 通过 `env_file` 加载 `docker/` 目录下的 `.env` 文件。
   - Docker 构建时读取的是 `docker/.env`，而不是根目录的 `.env`。
   - 因此，即使代码中 `ocr-service.ts` 的默认值已更新，但环境变量 `KIMI_VISION_MODEL` 的值仍然是 `moonshot-v1-vision-preview`，代码中的 `process.env.KIMI_VISION_MODEL` 会优先使用环境变量值。

3. **NAS 上的 `.env` 是持久化文件**
   - NAS 部署时，`docker/.env` 的内容被持久化到 NAS 存储中。
   - 后续重新部署（`docker-compose up -d --build`）不会更新持久化的 `.env` 文件。

### 相关文件

| 文件 | 作用 | 当前状态 |
|------|------|---------|
| [`.env`](file:///d:/trea项目/多平台账单对比系统/.env) | 本地开发配置 | ✅ 已正确配置 `Qwen/Qwen3-VL-32B-Instruct` |
| [`docker/.env`](file:///d:/trea项目/多平台账单对比系统/docker/.env) | Docker 部署配置 | ❌ 仍为旧值 `moonshot-v1-vision-preview` |
| [`sync-docker.ps1`](file:///d:/trea项目/多平台账单对比系统/sync-docker.ps1) L106-112 | 同步策略：.env 已存在不覆盖 | ⚠️ 保护策略阻止了自动更新 |
| [`ocr-service.ts`](file:///d:/trea项目/多平台账单对比系统/src/lib/ocr-service.ts) L50 | 读取环境变量 | 代码默认值正确，但环境变量优先 |

## 修复方案

### Step 1: 手动更新 `docker/.env` 文件

将 `docker/.env` 中的 `KIMI_VISION_MODEL` 从 `moonshot-v1-vision-preview` 更新为 `Qwen/Qwen3-VL-32B-Instruct`，并同步其他配置项。

**修改文件**：[docker/.env](file:///d:/trea项目/多平台账单对比系统/docker/.env)

**变更内容**：
- `KIMI_VISION_MODEL=moonshot-v1-vision-preview` → `KIMI_VISION_MODEL=Qwen/Qwen3-VL-32B-Instruct`
- 添加 `BACKUP_VISION_MODELS` 配置（当前 `docker/.env` 中缺少此配置，仅有 `KIMI_VISION_MODEL`）

### Step 2: 在 `ocr-service.ts` 构造函数中添加启动日志

增加显式的模型配置来源日志，方便未来快速诊断类似问题。

**修改文件**：[ocr-service.ts](file:///d:/trea项目/多平台账单对比系统/src/lib/ocr-service.ts) L63

**变更内容**：在现有日志 `[OCR服务] 模型列表` 之后，增加一条日志，打印 `KIMI_VISION_MODEL` 环境变量的实际值，明确区分是来自环境变量还是代码默认值。

### Step 3: 在同步脚本中添加 `.env` 关键字段差异检测

**可选增强**：在 `sync-docker.ps1` 中添加对 `docker/.env` 关键环境变量的差异检测。当检测到根目录 `.env` 与 `docker/.env` 的关键字段不一致时，给出警告提示。

**修改文件**：[sync-docker.ps1](file:///d:/trea项目/多平台账单对比系统/sync-docker.ps1) L101-115

**变更内容**：在 `.env` 检查步骤中，增加对 `KIMI_VISION_MODEL` 和 `SILICONFLOW_API_KEY` 等关键字段的 MD5 或直接内容对比，不一致时输出黄色警告信息（不自动覆盖，仅提示）。

### Step 4: 部署到 NAS

1. 运行同步脚本：`powershell -ExecutionPolicy Bypass -File ./sync-docker.ps1`
2. 更新版本号（4 处一致）
3. SSH 到 NAS，编辑 NAS 上的 `.env` 文件，更新 `KIMI_VISION_MODEL`
4. NAS 上执行 `docker-compose up -d --build` 重新构建部署

**或者**：直接通过 NAS 管理界面编辑持久化目录 `/volume1/docker/dptzddb/.env` 中的配置。

## 验证方法

1. 在 NAS 上重新部署后，查看日志确认第一行 `[OCR服务] 模型列表` 是否包含 `Qwen/Qwen3-VL-32B-Instruct` 而非 `moonshot-v1-vision-preview`
2. 确认日志中新增的模型来源日志显示正确的配置来源
3. 上传测试账单文件，确认 OCR 识别正常返回结果

## 假设与决策

- **不修改同步脚本的 `.env` 覆盖策略**：保持 `exists, not overwritten` 策略不变，这是一个安全保护机制，防止 `docker/.env` 中的密钥配置被意外覆盖。
- **增加警告而非自动修复**：同步脚本中增加差异检测警告，让用户手动处理，避免自动覆盖导致配置丢失。
- 这是一个一次性修复 + 长期预警的方案：Step 1-2 立即修复当前问题，Step 3 预防未来类似问题。