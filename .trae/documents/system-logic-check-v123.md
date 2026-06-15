# 系统全面逻辑检查计划（v1.23）

## 一、当前状态

**当前版本**: 1.22  
**前两轮**: v1.21 修复7个Bug，v1.22 清理~1100行死代码  
本轮重点：**逻辑严谨性、流程完整性、边界条件、状态一致性**

---

## 二、发现的逻辑问题

### P0-1: `result/route.ts` 中 `isZeroValue` 映射丢失 `true` 值

**文件**: [src/app/api/task/[taskId]/result/route.ts](file:///d:/trea项目/多平台账单对比系统/src/app/api/task/[taskId]/result/route.ts) L89  
**问题**: `isZeroValue: item.is_zero_value || undefined` — 当 `is_zero_value` 为 `true` 时，`true || undefined` = `true`，正确。但当为 `false` 时，`false || undefined` = `undefined`，也正确（false 不是有效值）。  
**但**: 当 `is_zero_value` 为 `null` 时，`null || undefined` = `undefined`，也正确。  
**结论**: 逻辑正确，无需修改。

### P0-2: `start/route.ts` 中 `processFileAsync` 是 fire-and-forget，异常无法传播

**文件**: [src/app/api/task/[taskId]/start/route.ts](file:///d:/trea项目/多平台账单对比系统/src/app/api/task/[taskId]/start/route.ts) L46  
**问题**: `processFileAsync(taskId, task.file_path, task.file_name)` 没有 await，也没有 `.catch()`。虽然函数内部有 try-catch，但如果 `markTaskFailed` 本身抛出异常（极不可能但可能），任务会永远停留在 `processing` 状态。  
**修复**: 添加 `.catch()` 兜底，确保异常时任务状态不会卡死。

### P0-3: `tasks/route.ts` DELETE 中 `uploaded` 状态的任务不需要中断等待

**文件**: [src/app/api/tasks/route.ts](file:///d:/trea项目/多平台账单对比系统/src/app/api/tasks/route.ts) L58  
**问题**: `if (task?.status === 'processing' || task?.status === 'uploaded')` — `uploaded` 状态的任务没有在处理中，不需要请求中断和等待3秒。当前逻辑会浪费3秒等待一个不可能改变的状态。  
**修复**: 只对 `processing` 状态请求中断和等待。

### P0-4: `markTaskFailed` 将 `progress` 重置为 0

**文件**: [src/lib/task-processor.ts](file:///d:/trea项目/多平台账单对比系统/src/lib/task-processor.ts) L91  
**问题**: `task.progress = 0` — 任务失败时进度重置为0，前端会显示0%进度条，用户无法知道任务处理到了多少。  
**修复**: 保留当前进度值，不重置。

### P0-5: 前端 `page.tsx` 中 `handleStartComparison` 使用 `pollTaskStatus` 而非 `pollTaskStatusRef.current`

**文件**: [src/app/page.tsx](file:///d:/trea项目/多平台账单对比系统/src/app/page.tsx) L380  
**问题**: `pollCleanupRef.current = pollTaskStatus(currentTask.id)` — 直接调用 `pollTaskStatus` 函数。由于 `pollTaskStatus` 是 `useCallback`，在 `handleStartComparison` 被调用时，`pollTaskStatus` 引用的是当前渲染周期的版本，这是正确的。但 `loadHistory` 中使用 `pollTaskStatusRef.current`，两者不一致。  
**修复**: 统一使用 `pollTaskStatusRef.current`，保持一致性。

### P0-6: `cleanOldTasks` 只清理内存不清理文件

**文件**: [src/lib/memory-store.ts](file:///d:/trea项目/多平台账单对比系统/src/lib/memory-store.ts) L91-99  
**问题**: `cleanOldTasks` 只从 `taskStore` 和 `resultStore` 删除记录，但不删除磁盘上的上传文件。随着时间推移，磁盘上的文件会不断积累。  
**修复**: 在 `cleanOldTasks` 中收集要删除的文件路径，返回给调用方进行文件清理。

### P1-1: `download/route.ts` 中 `.xls` 格式文件无法被 ExcelJS 正确加载

**文件**: [src/app/api/task/[taskId]/download/route.ts](file:///d:/trea项目/多平台账单对比系统/src/app/api/task/[taskId]/download/route.ts) L53-54  
**问题**: `workbook.xlsx.load(arrayBuffer)` — ExcelJS 的 `xlsx.load` 只支持 `.xlsx` 格式。如果用户上传了 `.xls` 格式（老版 Excel），加载会失败。  
**修复**: 在 `upload/route.ts` 中拒绝 `.xls` 格式，或在 `download/route.ts` 中添加格式检查和友好错误提示。

### P1-2: 前端 `HistoryTask` 接口包含 `result_path` 但 `TaskRecord` 不包含此字段

**文件**: [src/app/page.tsx](file:///d:/trea项目/多平台账单对比系统/src/app/page.tsx) L49  
**问题**: `HistoryTask` 接口定义了 `result_path?: string`，但 `TaskRecord` 接口中没有 `result_path` 字段。前端 L822 行 `resultPath: task.result_path` 永远是 `undefined`。  
**修复**: 从 `HistoryTask` 接口中移除 `result_path`，以及 `TaskStatus` 中的 `resultPath`。

### P1-3: 前端 `HistoryTask` 接口 `status` 缺少 `'uploaded'` 类型

**文件**: [src/app/page.tsx](file:///d:/trea项目/多平台账单对比系统/src/app/page.tsx) L45  
**问题**: `HistoryTask extends TaskStatus`，`TaskStatus.status` 包含 `'uploaded' | 'pending' | 'processing' | 'completed' | 'failed'`，但 `TaskRecord.status`（后端）只有 `'uploaded' | 'processing' | 'completed' | 'failed'`（无 `'pending'`）。前端多了一个 `'pending'` 状态但后端永远不会返回。  
**修复**: 从 `TaskStatus.status` 中移除 `'pending'`。

### P1-4: `upload/route.ts` 允许 `.xls` 格式上传但系统实际不支持

**文件**: [src/app/api/upload/route.ts](file:///d:/trea项目/多平台账单对比系统/src/app/api/upload/route.ts) L59  
**问题**: 前后端都允许 `.xls` 格式，但 ExcelJS 不支持 `.xls` 格式（只支持 `.xlsx`），下载标记文件时会失败。  
**修复**: 前后端统一拒绝 `.xls` 格式，只允许 `.xlsx`。

### P1-5: `result/[taskId]/page.tsx` 中 `filteredRows` 作为 `useEffect` 依赖导致每次过滤都重置展开状态

**文件**: [src/app/result/[taskId]/page.tsx](file:///d:/trea项目/多平台账单对比系统/src/app/result/[taskId]/page.tsx) L154-164  
**问题**: `useEffect` 依赖 `filteredRows`，每次切换筛选条件时 `filteredRows` 变化，触发 `setExpandedRows`，导致用户手动折叠的行被重新展开。  
**修复**: 将 `filteredRows` 从依赖中移除，改为只在 `data` 变化时自动展开问题行。

---

## 三、修复步骤

### Step 1: 修复 P0-2 — processFileAsync 添加 .catch() 兜底

**文件**: `src/app/api/task/[taskId]/start/route.ts`  
**修改**: L46 添加 `.catch()` 处理未捕获异常

### Step 2: 修复 P0-3 — uploaded 状态不需要中断等待

**文件**: `src/app/api/tasks/route.ts`  
**修改**: L58 条件改为只检查 `processing` 状态

### Step 3: 修复 P0-4 — markTaskFailed 保留进度值

**文件**: `src/lib/task-processor.ts`  
**修改**: L91 删除 `task.progress = 0`

### Step 4: 修复 P0-5 — 统一使用 pollTaskStatusRef

**文件**: `src/app/page.tsx`  
**修改**: L380 改为 `pollTaskStatusRef.current(currentTask.id)`

### Step 5: 修复 P0-6 — cleanOldTasks 清理磁盘文件

**文件**: `src/lib/memory-store.ts`, `src/app/api/tasks/route.ts`  
**修改**: `cleanOldTasks` 返回被删除任务的文件路径列表，调用方负责删除文件

### Step 6: 修复 P1-1/P1-4 — 拒绝 .xls 格式

**文件**: `src/app/api/upload/route.ts`, `src/app/page.tsx`  
**修改**: 前后端统一只允许 `.xlsx` 格式

### Step 7: 修复 P1-2 — 移除无效的 result_path/resultPath

**文件**: `src/app/page.tsx`  
**修改**: 从 `HistoryTask` 和 `TaskStatus` 中移除 `result_path`/`resultPath`

### Step 8: 修复 P1-3 — 移除不存在的 pending 状态

**文件**: `src/app/page.tsx`  
**修改**: 从 `TaskStatus.status` 中移除 `'pending'`

### Step 9: 修复 P1-5 — filteredRows 不应作为 useEffect 依赖

**文件**: `src/app/result/[taskId]/page.tsx`  
**修改**: 将 `filteredRows` 从依赖中移除，改用 `data` 和 `filter`

### Step 10: 验证

- 运行 `pnpm ts-check`
- 运行 `pnpm lint`
- 更新版本号到 1.23（4处一致）
- 运行同步脚本

---

## 四、风险等级评估

每项修复的风险等级和影响分析：

| 修复项 | 风险等级 | 修改范围 | 影响分析 | 回滚难度 |
|--------|---------|---------|---------|---------|
| P0-2: processFileAsync .catch() | **极低** | 1行代码 | 仅添加兜底异常处理，不改变正常流程。processFileAsync 内部已有 try-catch，.catch() 只处理 markTaskFailed 自身异常的极端情况 | 1行还原 |
| P0-3: uploaded 不中断等待 | **极低** | 1个条件判断 | uploaded 状态的任务没有异步处理在运行，请求中断和等待3秒是无效操作。移除后 uploaded 任务删除更快 | 1行还原 |
| P0-4: markTaskFailed 保留进度 | **极低** | 删除1行 | 删除 `task.progress = 0`，让失败任务保留当前进度值。前端已有 `status === 'failed'` 判断，进度值仅用于显示 | 1行还原 |
| P0-5: 统一 pollTaskStatusRef | **极低** | 1行 | `pollTaskStatus` 是 useCallback，`pollTaskStatusRef.current` 始终指向最新版本。两者在功能上等价，统一仅为代码一致性 | 1行还原 |
| P0-6: cleanOldTasks 清理文件 | **低** | 2个文件 | 修改 cleanOldTasks 返回文件路径，调用方删除文件。文件删除有 try-catch 保护，删除失败不影响主流程 | 2处还原 |
| P1-1/P1-4: 拒绝 .xls 格式 | **低** | 2个文件 | 当前系统实际上不支持 .xls（ExcelJS 会报错），拒绝 .xls 是让错误提前到上传阶段而非下载阶段。不影响已有 .xlsx 文件 | 2处还原 |
| P1-2: 移除 result_path | **极低** | 2行 | `result_path` 从未被赋值（永远是 undefined），移除是纯清理 | 2行还原 |
| P1-3: 移除 pending 状态 | **极低** | 1行 | 后端 TaskStatus 类型无 'pending'，前端定义了但从未使用。移除是纯类型修正 | 1行还原 |
| P1-5: filteredRows 依赖修正 | **低** | 2行 | 修改 useEffect 依赖，只在 data 变化时自动展开问题行，切换筛选不再重置展开状态。改善用户体验 | 2行还原 |

**总结**：
- 所有9项修复均为**极低~低风险**
- 每项修改都是1-2行代码，回滚简单
- 不涉及核心业务逻辑（比对、OCR、解析）的修改
- `pnpm ts-check` 和 `pnpm lint` 会自动验证类型安全

---

## 五、不做的事项

| 项目 | 原因 |
|------|------|
| P0-1 isZeroValue 映射 | 逻辑正确，无需修改 |
| 拆分大文件 | 功能高度内聚，风险大于收益 |
| 移除 console.log | 生产环境日志有价值 |
