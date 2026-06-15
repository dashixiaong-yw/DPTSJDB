# 全面系统流程检查与验证计划

## 一、当前状态分析

**当前版本**: 1.19  
**系统架构**: Next.js App Router + 内存存储 + 本地文件存储 + LLM OCR  
**核心流程**: 上传Excel → 解析Excel(提取图片) → 平台识别 → OCR识别(并发) → 数据比对 → 结果展示/下载

### 已发现的问题分类

经过全面代码审查，将问题按**严重程度**分为三级：

---

## 二、P0 - 必须修复的Bug（影响核心流程）

### P0-1: `storageDeleteDir` 在 tasks/route.ts 中被同步调用但函数是异步的

**文件**: [src/app/api/tasks/route.ts](file:///d:/trea项目/多平台账单对比系统/src/app/api/tasks/route.ts) L99  
**问题**: `storageDeleteDir` 是 async 函数返回 Promise，但调用时没有 `await`，导致目录删除可能未执行就被跳过  
**修复**: 添加 `await`

### P0-2: 抖音处理器 `shouldSkipField` 跳过了"店铺名"但 `getTableShopName` 需要读取它

**文件**: [src/lib/platforms/douyin.ts](file:///d:/trea项目/多平台账单对比系统/src/lib/platforms/douyin.ts) L361  
**问题**: `shouldSkipField` 包含 `'店铺名'` 关键词，会跳过表头为"店铺名"的列，但 `getTableShopName` 读取的是 `rowData['店铺名']`，两者不矛盾——跳过的是比对，不是读取。但 `shouldSkipField` 也跳过了 `'店铺名称'`，而 `getTableShopName` 读取 `rowData['店铺名称']`，同样不矛盾。  
**结论**: 逻辑正确，无需修改。但 `'刷单金额'` 被跳过可能导致用户期望比对的字段被忽略——这是业务决策，不是bug。

### P0-3: 拼多多 `not_full_month` 状态被映射为 `match`

**文件**: [src/lib/platforms/pinduoduo.ts](file:///d:/trea项目/多平台账单对比系统/src/lib/platforms/pinduoduo.ts) L258-260  
**问题**: 当 `monthMatch === 'not_full_month'` 时，`status` 被设为 `'match'`，但 `monthMatch` 字段保留了 `'not_full_month'`。前端 `result/route.ts` 中 `monthMatch` 的类型包含 `'not_full_month'`，前端结果页也能正确显示"非完整月份"标记。  
**结论**: 这是**有意设计**——月份本身匹配但日期不完整时，显示为"一致"但带"非完整月份"标记。逻辑正确。

### P0-4: `result/route.ts` 中 `isZeroValue` 的 falsy 判断问题

**文件**: [src/app/api/task/[taskId]/result/route.ts](file:///d:/trea项目/多平台账单对比系统/src/app/api/task/[taskId]/result/route.ts) L89  
**问题**: `item.is_zero_value || undefined` — 当 `is_zero_value` 为 `false` 时会被转为 `undefined`，但 `false` 不是有效值（只有 `true` 有意义），所以这个逻辑正确。  
**结论**: 无需修改。

### P0-5: 前端 `page.tsx` 轮询状态字段名不匹配

**文件**: [src/app/page.tsx](file:///d:/trea项目/多平台账单对比系统/src/app/page.tsx) L380-390  
**问题**: 轮询 `/api/task/${taskId}/status` 返回的字段名（如 `file_name`、`current_step`、`error_message`）与前端 `TaskStatus` 接口字段名（如 `fileName`、`currentStep`、`error`）不一致。代码中使用 `data.file_name ?? prev.fileName` 做了映射，但 `status` API 返回 `fileName`（驼峰）而非 `file_name`（下划线）。  
**验证**: 查看 status/route.ts L27-40，返回的是驼峰格式 `fileName`、`createdAt` 等，但 `currentStep`、`progress`、`totalImages` 也是驼峰。而 page.tsx 中使用 `data.current_step`（下划线）读取。  
**实际影响**: `data.current_step` 会是 `undefined`，因为 API 返回的是 `currentStep`。同理 `data.error_message` 也是 `undefined`，因为 API 返回 `error`。`data.file_name` 也是 `undefined`，因为 API 返回 `fileName`。  
**修复**: 修正 page.tsx 中轮询回调的字段名映射，与 status API 返回格式对齐。

### P0-6: 前端 `page.tsx` 历史记录中 `processing` 状态任务缺少轮询

**文件**: [src/app/page.tsx](file:///d:/trea项目/多平台账单对比系统/src/app/page.tsx) L831-839  
**问题**: 历史记录中 `processing` 状态的任务只显示"停止并删除"按钮，但没有启动轮询来更新状态。如果页面刷新后历史中有 `processing` 任务，状态永远不会自动更新。  
**修复**: 页面加载时检查历史任务中是否有 `processing` 状态的任务，如果有则启动轮询。

---

## 三、P1 - 应该修复的问题（影响用户体验或健壮性）

### P1-1: `download/route.ts` 缺少文件读取异常处理

**文件**: [src/app/api/task/[taskId]/download/route.ts](file:///d:/trea项目/多平台账单对比系统/src/app/api/task/[taskId]/download/route.ts) L45-50  
**问题**: `storageReadFile` 读取文件后转换为 ArrayBuffer 的过程没有 try-catch，如果文件损坏或不存在会导致未捕获异常  
**修复**: 在外层 try-catch 中已有处理，但建议添加更明确的文件存在性检查

### P1-2: `upload/route.ts` 中 `file` 类型断言不安全

**文件**: [src/app/api/upload/route.ts](file:///d:/trea项目/多平台账单对比系统/src/app/api/upload/route.ts) L33  
**问题**: `formData.get('file') as File` — 如果前端传了非 File 类型的值，会导致后续操作失败  
**修复**: 添加类型检查 `if (!(file instanceof File))`

### P1-3: `template/route.ts` 中 `file` 类型断言不安全

**文件**: [src/app/api/template/route.ts](file:///d:/trea项目/多平台账单对比系统/src/app/api/template/route.ts) L19  
**问题**: 同 P1-2，`formData.get('file') as File` 不安全  
**修复**: 添加类型检查

### P1-4: 前端 `ElapsedTime` 组件在 `startedAt` 为无效日期时会显示负数

**文件**: [src/app/page.tsx](file:///d:/trea项目/多平台账单对比系统/src/app/page.tsx) L60-63  
**问题**: 如果 `startedAt` 是无效日期字符串，`new Date(startedAt).getTime()` 返回 NaN，导致显示异常  
**修复**: 添加日期有效性检查

### P1-5: `ocr-service.ts` 中 `parseOCRResult` 对金额字段缺少数值验证

**文件**: [src/lib/ocr-service.ts](file:///d:/trea项目/多平台账单对比系统/src/lib/ocr-service.ts) L593-633  
**问题**: LLM 返回的 `amounts` 中的值可能是字符串或其他非数字类型，直接传递给比对逻辑可能导致错误  
**修复**: 在解析时对 amounts 中的值做数值转换和验证

### P1-6: `comparison-engine.ts` 已标记 `@deprecated` 但仍被导出

**文件**: [src/lib/comparison-engine.ts](file:///d:/trea项目/多平台账单对比系统/src/lib/comparison-engine.ts) L1  
**问题**: 该文件已废弃但仍在代码库中，可能被误用  
**修复**: 确认无引用后可安全删除（当前确认无引用）

### P1-7: 前端 `page.tsx` 中 `uploadProgress` 状态未被使用

**文件**: [src/app/page.tsx](file:///d:/trea项目/多平台账单对比系统/src/app/page.tsx) L85,542  
**问题**: `uploadProgress` 状态始终为 0，因为直接上传使用 FormData 没有 progress 事件。进度条 UI 永远不会显示。  
**修复**: 移除无用的进度条 UI 或实现真实的上传进度追踪

---

## 四、P2 - 建议改进（不影响功能但可提升质量）

### P2-1: `memory-store.ts` 中 `cleanupExpiredData` 不是事务性的

**文件**: [src/lib/memory-store.ts](file:///d:/trea项目/多平台账单对比系统/src/lib/memory-store.ts) L118-147  
**问题**: 清理过程中如果异常，可能导致部分清理、部分未清理的状态不一致  
**影响**: Node.js 单线程下实际风险极低，因为 Map 操作是同步的

### P2-2: `task-processor.ts` 中 `checkTaskAbort` 是 async 但内部无异步操作

**文件**: [src/lib/task-processor.ts](file:///d:/trea项目/多平台账单对比系统/src/lib/task-processor.ts) L20-23  
**问题**: 函数声明为 async 但只做同步的 Map 读取，调用方必须 await，增加了不必要的微任务开销  
**影响**: 性能影响可忽略，但代码不够清晰

### P2-3: 前端结果页 `filteredRows` 依赖 `data` 和自身，可能导致无限循环

**文件**: [src/app/result/[taskId]/page.tsx](file:///d:/trea项目/多平台账单对比系统/src/app/result/[taskId]/page.tsx) L127-151,154-164  
**问题**: `useEffect` 依赖 `filteredRows`，而 `filteredRows` 依赖 `data`。当 `data` 变化时 `filteredRows` 会重新计算，触发 useEffect 更新 `expandedRows`，但 `expandedRows` 变化不会触发 `filteredRows` 重新计算，所以不会无限循环。  
**结论**: 逻辑正确，但 `filteredRows` 作为 useEffect 依赖可能导致不必要的执行（每次 filter 变化都会重置展开状态）

### P2-4: 文件大小限制 100MB 硬编码

**文件**: [src/app/page.tsx](file:///d:/trea项目/多平台账单对比系统/src/app/page.tsx) L207, [src/app/api/upload/route.ts](file:///d:/trea项目/多平台账单对比系统/src/app/api/upload/route.ts) L74  
**问题**: 前后端都硬编码了 100MB 限制，如果需要调整需要改两处  
**影响**: 低优先级，当前业务场景下不需要频繁调整

---

## 五、修复计划

### Step 1: 修复 P0-5 — 前端轮询字段名不匹配（核心Bug）

**文件**: `src/app/page.tsx`  
**修改**: L380-390 的 `setCurrentTask` 调用，将 `data.file_name` 改为 `data.fileName`，`data.current_step` 改为 `data.currentStep`，`data.error_message` 改为 `data.error`，`data.started_at` 改为 `data.startedAt`，`data.completed_at` 改为 `data.completedAt`

### Step 2: 修复 P0-6 — 历史记录中 processing 任务缺少轮询

**文件**: `src/app/page.tsx`  
**修改**: 在 `loadHistory` 完成后检查是否有 `processing` 状态的任务，如果有则启动轮询

### Step 3: 修复 P0-1 — storageDeleteDir 缺少 await

**文件**: `src/app/api/tasks/route.ts`  
**修改**: L99 添加 `await`

### Step 4: 修复 P1-2/P1-3 — FormData file 类型断言不安全

**文件**: `src/app/api/upload/route.ts`, `src/app/api/template/route.ts`  
**修改**: 添加 `instanceof File` 检查

### Step 5: 修复 P1-4 — ElapsedTime 无效日期处理

**文件**: `src/app/page.tsx`  
**修改**: 添加日期有效性检查

### Step 6: 修复 P1-5 — OCR 结果金额数值验证

**文件**: `src/lib/ocr-service.ts`  
**修改**: 在 `parseOCRResult` 中对 amounts 值做数值转换

### Step 7: 修复 P1-7 — 移除无用的上传进度 UI

**文件**: `src/app/page.tsx`  
**修改**: 移除 `uploadProgress` 状态和进度条 UI，或添加注释说明

### Step 8: 删除 P1-6 — 废弃的 comparison-engine.ts

**文件**: `src/lib/comparison-engine.ts`  
**修改**: 确认无引用后删除

### Step 9: 验证

- 运行 `pnpm ts-check` 确保类型检查通过
- 运行 `pnpm lint` 确保代码规范通过
- 更新版本号（4处一致）
- 运行同步脚本

---

## 六、不修复项及原因

| 编号 | 问题 | 原因 |
|------|------|------|
| P0-2 | shouldSkipField 跳过店铺名 | 逻辑正确，跳过的是比对不是读取 |
| P0-3 | not_full_month 映射为 match | 有意设计，前端通过 monthMatch 字段区分 |
| P0-4 | isZeroValue falsy 判断 | false 不是有效值，逻辑正确 |
| P2-1 | cleanupExpiredData 非事务性 | Node.js 单线程下风险极低 |
| P2-2 | checkTaskAbort 多余 async | 性能影响可忽略 |
| P2-3 | filteredRows 依赖问题 | 不会无限循环 |
| P2-4 | 文件大小硬编码 | 低优先级 |

---

## 七、假设与决策

1. **假设**: `comparison-engine.ts` 确实没有被任何模块导入（代码注释标明 `@deprecated`，搜索确认无引用）
2. **决策**: P0-5 是最关键的 bug，因为轮询字段名不匹配会导致前端无法正确显示任务进度和状态
3. **决策**: P0-6 影响较小，因为 processing 任务在历史记录中较少见，但刷新页面后状态不更新会影响用户体验
4. **决策**: P1 级别问题虽然不影响核心流程，但修复后能显著提升系统健壮性
