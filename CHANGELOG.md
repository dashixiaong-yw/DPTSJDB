# 变更日志

所有重要更改均记录在此文件中。

版本号规则：主版本.次版本（次版本 1-99，满 99 后主版本+1、次版本归 1

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
