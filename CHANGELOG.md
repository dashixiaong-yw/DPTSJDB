# 变更日志

所有重要更改均记录在此文件中。

版本号规则：主版本.次版本（次版本 1-99，满 99 后主版本+1、次版本归 1

## 1.42 (2026-06-16)

### 修改
- 抖音平台图片处理方式从合并比对改为分组独立比对（与拼多多模式一致）
  - 店铺月度数据截图（L列）：独立比对成交金额、退款金额、投放消耗 + 店铺名称 + 月份
  - 支出总额截图（N列）：独立比对支出金额 + 店铺名称
  - 每组比对项使用各自图片的 imageKey，避免两张图片数据混合
- 删除 mergeOcrResults 和 extractOcrValueByField 合并逻辑，消除数据混合风险
- 使用 extractOCRValue 统一提取OCR值（与拼多多/淘宝一致）

## 1.41 (2026-06-16)

### 修复
- 移除代码默认备用模型中的 PaddleOCR-VL-1.5（表现差，与 CHANGELOG v1.36 描述一致）
- 修正 route.ts 过时注释（48小时→12小时）

## 1.40 (2026-06-16)

### 修复
- 修复刷新页面后进行中的任务丢失的问题
  - 根因：Next.js standalone 模式下不同 API 路由获取到 taskStore Map 的不同实例
  - 方案：将 memory-store.ts 中 4 个 Map 改为 globalThis 单例模式，确保所有路由共享同一实例

## 1.39 (2026-06-16)

### 新增
- 新增自动清理功能：系统启动时和每小时定时清理超过12小时的文件与缓存
- 新增孤儿文件清理：删除无对应任务的上传目录（带1小时保护期）
- 新增 cleanupAll 全量清理函数（内存+磁盘+OCR缓存+无主结果）

### 修改
- 任务数据保留时间从24小时缩短为12小时
- API 获取任务列表时清理阈值从48小时改为12小时

## 1.38 (2026-06-16)

### 修复
- 修复 OCR 请求并发过多导致全部超时（Request was aborted）的问题
  - 降低并发数：5 → 2，避免 SiliconFlow API 限流
  - 增加超时时间：30s → 60s，适应 NAS 网络延迟

## 1.37 (2026-06-16)

### 修复
- 修复大 Excel 文件（37MB+）解析时内存溢出（OOM）导致进程崩溃的问题
  - Dockerfile 添加 NODE_OPTIONS="--max-old-space-size=4096" 增大堆内存
  - package.json dev 脚本增加 --max-old-space-size=4096 配置

## 1.36 (2026-06-16)

### 优化
- 精简备用模型列表，移除表现差的模型（GLM-4.5V、PaddleOCR-VL-1.5、DeepSeek-OCR）
- 保留高准确率模型：Qwen3-VL-30B-A3B-Instruct、Qwen3-VL-8B-Instruct
- 测试验证主模型 Qwen3-VL-32B-Instruct 准确率达到 100%

## 1.35 (2026-06-15)

### 优化
- OCR 服务移除"金额全为0"重试/回退逻辑，表格值为 0 时 OCR 返回 0 不再触发模型切换

## 1.34 (2026-06-15)

### 修复
- 修复 NAS 部署后 OCR 仍使用旧模型 moonshot-v1-vision-preview 的问题
  - 根因：docker/.env 文件未随同步更新，仍保存旧模型配置
- 更新 docker/.env 为正确的模型配置（Qwen/Qwen3-VL-32B-Instruct + 备用模型）

### 修改
- ocr-service.ts 新增启动日志，打印模型配置来源（环境变量 vs 代码默认值）
- sync-docker.ps1 新增 .env 关键字段差异检测（[3.5/4] 步骤），避免未来再次遗漏

## 1.33 (2026-06-15)

### 修改
- 所有平台OCR提示词增加金额格式识别规则：明确区分千位分隔符逗号（,）和小数点（.）
- 统一金额转换说明：逗号是千位分隔符（如3,628.75应转为3628.75），禁止误转为362875
- normalizeAmounts后处理（fixAmountError）适用于所有平台，自动修复金额识别错误

## 1.32 (2026-06-15)

### 修复
- 修复抖音店铺月度数据截图OCR识别：增加店铺名称识别指引（顶部左侧带图标位置）
- 增加日期范围识别：通过数据趋势图X轴日期判断月份和是否为整月
- 增加金额格式识别规则：明确区分千位分隔符逗号和小数点，防止3,628.75被识别成362875
- 增加normalizeAmounts后处理：自动修复大于10万且无小数位的异常金额（除以100）
- 更新抖音支出总额截图提示词，增加金额格式示例和识别规则

## 1.31 (2026-06-15)

### 修复
- 检测并更新SiliconFlow平台OCR视觉模型配置
- 移除已下架模型（Qwen2.5-VL-72B-Instruct、Pro/Qwen2.5-VL-7B-Instruct，返回403）
- 更新.env.example中过时的模型名（qwen-vl-plus、llava-1.5-7b等已停用）
- 更新代码默认模型列表，确保与平台实际可用模型一致
- 备用模型按价格排序：Qwen3-VL-8B-Instruct（最便宜）→ Qwen3-VL-30B-A3B-Instruct（MoE）→ PaddleOCR-VL-1.5（免费）

## 1.30 (2026-06-15)

### 修复
- 修复抖店OCR识别结果缺失/全为0的问题
- 增加抖音店铺月度数据截图的缓存完整性检查规则
- 优化OCR提示词，增加分步识别指引和金额识别强调
- 增加金额全为0时的自动重试逻辑，重试失败后自动切换备用模型
- 增加图片大小检查，跳过异常小图（<1KB）
- 缩短模型失败缓存时间从1小时到5分钟，避免一次失败导致后续全部不可用
- 更新备用模型列表为SiliconFlow平台实际可用的视觉模型

## 1.29 (2026-06-16)

### 新增
- 所有备用模型都不可使用时在前端显示显著错误提示（红色横幅 + 醒目标识 + 解决建议）

### 修改
- [ocr-service.ts](file:///d:/trea项目/多平台账单对比系统/src/lib/ocr-service.ts)：添加 `[MODEL_ALL_FAILED]` 错误消息前缀标识
- [task-processor.ts](file:///d:/trea项目/多平台账单对比系统/src/lib/task-processor.ts)：在 `markTaskFailed` 中检测并设置 `model_all_failed` 标志
- [status/route.ts](file:///d:/trea项目/多平台账单对比系统/src/app/api/task/%5BtaskId%5D/status/route.ts)：添加 `modelAllFailed` 返回字段
- [page.tsx](file:///d:/trea项目/多平台账单对比系统/src/app/page.tsx)：添加模型全部失败时的红色横幅错误提示组件

## 1.28 (2026-06-15)

### 修改
- 更新默认 OCR 模型：`moonshot-v1-vision-preview` → `qwen-vl-plus`（原模型已在 SiliconFlow 平台停用）
- 更新备用模型列表，移除已停用的模型，添加 `qwen-vl-max`、`cogvlm-chat` 等可用模型

## 1.27 (2026-06-15)

### 新增
- 添加 OCR 模型兜底机制：当主模型失败时自动切换到备用模型
- 支持配置多个备用模型（按价格从低到高排序）
- 添加失败模型缓存机制（1小时内不再尝试失败模型）

### 修改
- [.env.example](file:///d:/trea项目/多平台账单对比系统/.env.example)：添加 `BACKUP_VISION_MODELS` 配置项
- [ocr-service.ts](file:///d:/trea项目/多平台账单对比系统/src/lib/ocr-service.ts)：重写 `recognizeImage` 方法，支持多模型切换

## 1.26 (2026-06-15)

### 修复
- 修复抖音平台比对结果为空的问题：当图片存在但OCR识别失败时，不再跳过该行，而是保存比对结果（表格值有值但OCR值缺失，状态为missing）

## 1.25 (2026-06-15)

### 修复
- 修复 Docker 部署上传文件权限拒绝问题（volume 挂载覆盖容器内目录权限）
- 添加 entrypoint 脚本，容器启动时自动修复 /app/data 目录权限

## 1.24 (2026-06-14)

### 新增
- OCR 调用自动重试机制（3次指数退避 1s/2s/4s），网络波动不再导致永久失败
- OCR 并发限制（Semaphore 模式，最多5个并发请求），防止 API 过载
- OCR 单次调用超时（30s），防止请求无限挂起

### 优化
- OCR 缓存键增加平台+图片类型维度（MD5:platform:imageType），避免跨平台缓存错乱
- OCR 缓存完整性检查按图片类型差异化（支出截图只需 amounts，不需要 shop_name/month）

## 1.23 (2026-06-14)

### 修复
- 修复 processFileAsync 未捕获异常导致任务卡死（添加 .catch() 兜底）
- 修复删除任务时 uploaded 状态不需要中断等待的逻辑
- 修复 markTaskFailed 不必要地重置进度值为 0
- 修复前端轮询统一使用 pollTaskStatusRef 避免闭包问题
- 修复 cleanOldTasks 未清理磁盘文件且缺少 await 的问题
- 拒绝 .xls 格式上传（ExcelJS 不支持旧版 BIFF 格式，仅接受 .xlsx）
- 移除前端无效的 result_path/resultPath 字段（后端从未返回）
- 移除前端不存在的 pending 状态（后端 TaskStatus 不包含 pending）
- 修复 is_zero_value 使用 `||` 导致 false 值丢失的问题（改为 `??`）

## 1.22 (2026-06-14)

### 删除
- 删除废弃文件 comparison-engine.ts（966行，@deprecated，零引用）
- 删除 excel-parser.ts 中4个无效导出：uploadImages、PLATFORM_FEATURES、identifyPlatform、identifyScreenshotColumns
- 删除 platforms/base.ts 中2个无效导出：compareUtils、getImageType（与 excel-parser.ts 重复）
- 删除 platforms/types.ts 中无效接口 CompareUtils
- 删除 platforms/index.ts 中2个无效导出：getHandler、getRegisteredPlatforms
- 删除 memory-store.ts 中无效函数 saveTaskResults（实际使用 appendTaskResults）
- 删除 local-storage.ts 中无效函数 fileExists
- 清理 services.ts 中对应的无效 re-export

## 1.21 (2026-06-14)

### 修复
- 修复前端轮询状态字段名不匹配导致进度/步骤/错误信息无法更新的核心Bug
- 修复页面刷新后历史记录中 processing 任务不会自动轮询更新的问题
- 修复删除任务时 storageDeleteDir 缺少 await 导致目录可能未被删除
- 修复 upload/template API 中 FormData file 类型断言不安全的问题
- 修复 ElapsedTime 组件在无效日期时显示异常
- 修复 OCR 返回的金额字段可能为字符串类型导致比对错误
- 移除无用的上传进度 UI（uploadProgress 状态始终为0）

## 1.22 (2026-06-14)

### 修改
- 封版规则新增"批量修复原则"：同一任务P0/P1/P2全部完成后再提交，禁止逐级提交

## 1.21 (2026-06-14)

### 修复
- 清理剩余 lint 警告：eslint 配置允许下划线前缀未使用变量、移除 ocrCacheStore 未使用导入
- 修复 excel-parser 重复类型定义，统一从 platforms/types 导入

## 1.19 (2026-06-14)

### 新增
- OCR 并发调用：拼多多/抖音/淘宝三平台改为 Promise.all 并发上传+识别，多图片耗时大幅缩短
- 内存淘汰机制：添加 cleanupExpiredData 自动清理 24h 过期任务、OCR 缓存 LRU 淘汰（500条上限）、无主结果清理
- 轮询指数退避：任务状态轮询从固定 2s 改为 1→2→4→8→10s 指数退避，减少无效请求
- ElapsedTime 隔离渲染：提取为独立 memo 组件，避免每秒触发整个页面重渲染
- API 响应压缩：next.config.ts 启用 compress: true

### 修改
- 删除分片上传功能（chunk/chunk-v2 API），简化为直接 FormData 上传（本地部署无需分片）
- 前端上传逻辑从 ~100 行简化为 ~15 行
- 清理未使用的 UI 组件（accordion、dialog、sidebar 等 40+ 组件）和 hooks
- 清理过期的计划文档

### 修复
- 修复 API 路由中时间格式和错误处理的小问题

## 1.18 (2026-06-14)

### 修复
- 修复路径遍历安全漏洞：local-storage.ts 添加路径校验，tasks/route.ts 添加 UUID 格式校验
- 修复抖音处理器图片查找逻辑完全失效：改用 imageType 键查找，与拼多多/淘宝处理器一致
- 修复内存存储自旋锁导致死锁：移除 acquireLock/releaseLock，Node.js 单线程下无需锁
- 修复错误堆栈和详情暴露给用户的安全问题
- 修复 taobao.ts 和 excel-parser.ts 列索引转字母不支持超过 Z 列（AA、AB 等）
- 修复 saveResults 缺少 is_zero_value 字段
- 修复下载标记文件 cellRef 为空时无法高亮，支持多 sheet 标记
- 修复 compareValues 容差不一致（< 0.01 → <= 0.01）
- 修复 checkIsFullMonth 时区解析错误（强制本地时间解析）
- 修复前端轮询无清理机制、snake_case/camelCase 字段冲突、历史记录映射遗漏
- 修复下载报告按钮无功能
- 修复 storageDeleteFile 缺少 await
- 修复 fieldMapping 缓存导致跨任务残留旧映射
- 修复 ElapsedTime 组件 setState-in-effect lint 错误

### 修改
- comparison-engine.ts 添加 @deprecated 注释（已被平台处理器架构替代）
- excel-parser.ts 中 getImageType 和 identifyPlatform 添加 @deprecated 注释
- OCR 缓存统一使用 JSON.stringify/parse 序列化
- JSON 导出时间改为正确的北京时间格式
- excel-parser.ts cell.value 类型转换改用 extractCellValue 函数
- ocrValue 空字符串不再被误转为 undefined
- 正则 `/[月份月]/g` 改为 `/月份?/g`
- extractMonthFromDateRange 时区修复
- 删除 template/route.ts 中未使用的 calculateSimilarity 函数
- 删除 page.tsx 中未使用的 fetchWithRetry 函数

## 1.17 (2026-06-14)

### 新增
- OCR 并发调用：拼多多/抖音/淘宝三平台改为 Promise.all 并发上传+识别，多图片耗时大幅缩短
- 内存淘汰机制：添加 cleanupExpiredData 自动清理 24h 过期任务、OCR 缓存 LRU 淘汰（500条上限）、无主结果清理
- 轮询指数退避：任务状态轮询从固定 2s 改为 1→2→4→8→10s 指数退避，减少无效请求
- ElapsedTime 隔离渲染：提取为独立 memo 组件，避免每秒触发整个页面重渲染
- API 响应压缩：next.config.ts 启用 compress: true

### 修改
- 删除分片上传功能（chunk/chunk-v2 API），简化为直接 FormData 上传（本地部署无需分片）
- 前端上传逻辑从 ~100 行简化为 ~15 行

## 1.17 (2026-06-14)

### 修复
- 修复分片上传文件大小不匹配时，delete 在读取响应数据之前执行的逻辑顺序问题
- 修复平台处理器实例复用时字段映射缓存导致映射不更新的问题（抖音、拼多多、淘宝）

## 1.16 (2026-06-14)

### 修改
- 仅对比第一个sheet页，忽略其余sheet页（图片提取和下载导出同步限制）

### 修复
- `isZeroValue` 字段端到端传递：从淘宝平台处理器到前端显示完整链路修复
- `ocr_value` 为 `"0"` 时不再被误转为 `undefined`
- 筛选切换后自动展开有问题的行
- `useEffect` 依赖数组修复，消除 lint 警告
- 导出 JSON 报告时间改为北京时间（UTC+8）

## 1.15 (2026-06-14)

### 新增
- 重新设计对比结果详情页：手风琴折叠式布局，问题项优先展示
- 环形图统计卡片，直观展示比对分布
- 筛选标签（全部/不一致/缺失）+ 字段搜索
- 有问题的行默认展开，全部一致的行默认折叠
- 移动端自适应：小屏下表格切换为卡片布局

## 1.14 (2026-06-14)

### 修复
- Docker 端口映射恢复为 `3080:3080`

## 1.13 (2026-06-14)

### 修改
- Docker 端口映射从 `3080:3080` 改为 `3000:3080`（主机访问端口 3000，容器内部 3080）

## 1.12 (2026-06-14)

### 新增
- 同步脚本自动从 `.env.example` 生成 `.env`（如果不存在；已存在则不覆盖）

## 1.11 (2026-06-14)

### 修改
- Docker 端口从 3000 迁移到 3080，统一更新 docker-compose、Dockerfile、package.json 中所有端口配置

## 1.10 (2026-06-13)

### 修改
- 同步脚本改为增量同步：不再清空 docker/，仅更新变更文件、删除根目录已移除的文件
- 目录同步改用 robocopy /MIR，文件同步使用 MD5 哈希对比

## 1.9 (2026-06-13)

### 修改
- OCR 服务从 Coze Kimi 2.5 迁移到硅基流动（SiliconFlow）Kimi Vision API
- 移除 coze-coding-dev-sdk，改用 openai SDK
- 更新 .env.example 添加硅基流动配置项

## 1.8 (2026-06-13)

### 修改
- 规则文档新增：docker-compose.yml/yaml 双文件机制说明（NAS GUI 兼容）

## 1.7 (2026-06-13)

### 删除
- 删除 `.babelrc` 文件（使用 SWC 默认编译器，避免 NAS 构建降级到 Babel 20min+）

### 修改
- 重写 Dockerfile：采用多阶段构建 + BuildKit 缓存 + BUILD_VERSION 参数 + 健康检查 + 关闭 Telemetry
- 重写 docker-compose.yml：添加 build.args 传递版本号 + DOCKER_BUILDKIT=1 + healthcheck
- 优化 .dockerignore：移除 `*.md` 粗粒度忽略（避免误排除 CHANGELOG.md），改为精确忽略列表
- 更新 sync-docker.ps1：从同步清单移除已删除的 `.babelrc`
- 规则文档更新：版本号一致从 5 处改为 4 处（Dockerfile 不再硬编码版本，由 docker-compose.yml 传参）
- 规则文档新增：Docker 部署关键配置说明（BuildKit 缓存、standalone 模式、禁止事项）

## 1.6 (2026-06-13)

### 修改
- 规则文档更新：核心原则从"三处一致"改为"五处一致"（新增 docker-compose.yml 和 Dockerfile
- 开发修改流程细化：明确 5 处版本号文件的修改位置和格式
- Git 操作规范修正：默认分支从 main 改为 master
- Docker 部署补充版本号同步说明

## 1.5 (2026-06-13)

### 新增
- 在 docker-compose.yml 中添加版本号（image: dptsjdb:1.5，container_name: dptsjdb-1.5）
- 在 Dockerfile 中添加版本号标签（ARG VERSION=1.5，LABEL version）

### 修改
- 将 Docker 版本号纳入版本号管理范围，确保与 VERSION、package.json 同步

## 1.4 (2026-06-13)

### 修改
- 合并 5 个分散的规则文档为单个精简文件（.trae/rules/README.md），避免 AI 每次调用多个文件
- 删除 .trae/rules/ 下多余的 5 个 md 文件，仅保留单一入口文件

## 1.3 (2026-06-13)

### 新增
- 将主规范文档移至 `.trae/rules/` 目录，供 AI 每次操作前调用
- 创建规则索引文件（.trae/rules/README.md）
- 创建版本号管理规则（.trae/rules/01-version-control.md）
- 创建开发修改流程规范（.trae/rules/02-development-workflow.md）
- 创建 Docker 部署同步流程（.trae/rules/03-docker-sync.md）
- 创建 Git 操作与远程仓库规范（.trae/rules/04-git-operations.md）
- 创建项目结构与文件说明（.trae/rules/05-project-structure.md）

## 1.2 (2026-06-13)

### 新增
- 创建 rules/ 项目规则文档目录
- 新增版本号管理规则（rules/version-control.md）
- 新增开发修改流程规范（rules/development-workflow.md）
- 新增 Docker 部署同步流程（rules/docker-sync.md）
- 新增 Git 操作与远程仓库规范（rules/git-operations.md）
- 新增项目结构与文件说明（rules/project-structure.md）

## 1.1 (2026-06-13)

### 新增
- 创建项目文档体系（VERSION、CHANGELOG.md）
- 建立版本号管理规范
