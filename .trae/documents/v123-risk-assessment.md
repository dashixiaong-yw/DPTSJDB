# v1.23 逻辑修复 — 风险等级评估与执行计划

## 一、已完成修复确认（Steps 1-4）

| Step | 修复项 | 状态 | 风险 |
|------|--------|------|------|
| 1 | P0-2: processFileAsync 添加 .catch() 兜底 | ✅ 已完成 | 无风险 — 纯增量安全网，不影响正常流程 |
| 2 | P0-3: DELETE 只中断 processing 状态 | ✅ 已完成 | 无风险 — uploaded 状态本就不需要中断等待 |
| 3 | P0-4: markTaskFailed 保留进度值 | ✅ 已完成 | 无风险 — 移除了不必要的 `progress = 0` 重置 |
| 4 | P0-5: 统一使用 pollTaskStatusRef | ✅ 已完成 | 无风险 — ref 已在 L458 同步，调用方式一致 |

**已完成项总风险：无**

---

## 二、待执行修复风险评估

### Step 5: P0-6 cleanOldTasks 清理磁盘文件

**修改文件**: `src/app/api/tasks/route.ts` L12

**当前代码**:
```typescript
cleanOldTasks(48);  // 无 await，无文件清理
```

**修改为**:
```typescript
const deletedPaths = await cleanOldTasks(48);
for (const filePath of deletedPaths) {
  try { await storageDeleteFile(filePath); } catch (e) { console.error('清理过期文件失败:', e); }
}
```

**风险等级: 🟢 低风险**

| 维度 | 分析 |
|------|------|
| 修改范围 | 1行改3行，仅 tasks/route.ts GET handler |
| 功能影响 | 正向改进：之前过期任务的磁盘文件永远不会被清理，现在会清理 |
| 回退难度 | 极低，恢复1行即可 |
| 边界情况 | storageDeleteFile 已有 try-catch 容错（local-storage.ts L62-71），文件不存在不会报错 |
| 并发安全 | cleanOldTasks 遍历 Map 删除条目，Node.js 单线程无竞争 |

**额外发现**: 当前 `cleanOldTasks(48)` 没有 `await`，如果函数内部异常会成为 unhandled promise rejection。加 `await` 后异常会被外层 try-catch 捕获，更安全。

---

### Step 6: P1-1/P1-4 拒绝 .xls 格式

**修改文件**:
- `src/app/api/upload/route.ts` L59, L67, L102
- `src/app/page.tsx` L215, L225, L229, L520, L534

**当前行为**: 接受 .xlsx 和 .xls 文件
**修改为**: 仅接受 .xlsx 文件

**风险等级: 🟢 低风险**

| 维度 | 分析 |
|------|------|
| 修改范围 | 2个文件，约8处文本替换 |
| 功能影响 | 拒绝 ExcelJS 不支持的旧格式，提前报错而非解析时崩溃 |
| 技术依据 | ExcelJS 仅支持 .xlsx（Open XML），不支持 .xls（BIFF 二进制格式）。当前接受 .xls 会导致解析失败 |
| 回退难度 | 极低，恢复文本即可 |
| 用户体验 | 上传 .xls 时给出明确提示，优于上传后解析报错 |

---

### Step 7: P1-2 移除无效的 result_path/resultPath

**修改文件**: `src/app/page.tsx` L42, L49, L822

**当前代码**:
```typescript
// TaskStatus 接口
resultPath?: string;       // L42 — 后端 API 从未返回此字段

// HistoryTask 接口
result_path?: string;      // L49 — 后端 API 从未返回此字段

// "继续处理"按钮映射
resultPath: task.result_path,  // L822 — 始终为 undefined
```

**修改为**: 删除这3处

**风险等级: 🟢 低风险**

| 维度 | 分析 |
|------|------|
| 修改范围 | 删除3行，纯类型定义和映射 |
| 功能影响 | 无 — 后端 status API 和 tasks API 均不返回 result_path/resultPath |
| 验证依据 | Grep 搜索 `result_path|resultPath` 仅出现在 page.tsx 这3处 |
| 回退难度 | 极低 |

---

### Step 8: P1-3 移除不存在的 pending 状态

**修改文件**: `src/app/page.tsx` L31, L423, L463, L469, L477

**当前代码**:
```typescript
// L31: 类型定义包含不存在的 'pending'
status: 'uploaded' | 'pending' | 'processing' | 'completed' | 'failed';

// L423: 轮询中检查永远不会为真的条件
if (data.status === 'processing' || data.status === 'pending') {

// L463: 状态映射中包含不存在的状态
pending: { label: '等待中', variant: 'secondary' },

// L469: 未知状态回退到 pending
const config = statusMap[status] || statusMap.pending;

// L477: 图标映射中包含不存在的状态
case 'pending':
```

**修改方案**:
1. 类型定义移除 `'pending'`
2. 轮询条件移除 `|| data.status === 'pending'`
3. 状态映射移除 `pending` 条目，回退改为 `statusMap.uploaded`
4. 图标映射移除 `case 'pending'`

**风险等级: 🟢 低风险**

| 维度 | 分析 |
|------|------|
| 修改范围 | 5处修改，均在 page.tsx |
| 功能影响 | 无 — 后端 TaskStatus 类型为 `'uploaded' \| 'processing' \| 'completed' \| 'failed'`，从不返回 'pending' |
| 回退安全 | statusMap 回退从 pending 改为 uploaded，uploaded 的 variant 是 'outline'，视觉上更合理 |
| 边界情况 | 如果后端新增未知状态，回退到 uploaded（outline 样式）比 pending 更安全 |

---

### Step 9: P1-5 filteredRows 依赖修正

**修改文件**: `src/app/result/[taskId]/page.tsx` L154-164

**当前代码**:
```typescript
useEffect(() => {
  if (!data) return;
  const problemRows = new Set<string>();
  filteredRows.forEach((row) => { ... });
  setExpandedRows(problemRows);
}, [data, filteredRows]);
```

**分析**: `filteredRows` 是 `useMemo` 返回值，依赖 `[data, filter, searchQuery]`。当这些依赖变化时，`filteredRows` 产生新引用，useEffect 重新执行 — **这是正确行为**。

**结论: 🟢 无需修改** — 当前代码逻辑正确，`filteredRows` 作为依赖是合理的。筛选/搜索变化时重新计算展开行是预期行为。

---

### 额外发现: is_zero_value 使用 `||` 而非 `??`

**文件1**: `src/app/api/task/[taskId]/start/route.ts` L323
```typescript
is_zero_value: item.isZeroValue || null,  // false || null → null（丢失 false）
```

**文件2**: `src/app/api/task/[taskId]/result/route.ts` L89
```typescript
isZeroValue: item.is_zero_value || undefined,  // false || undefined → undefined（丢失 false）
```

**风险等级: 🟡 极低风险（当前无实际影响）**

| 维度 | 分析 |
|------|------|
| 当前影响 | 无 — isZeroValue 实际只会是 `true` 或 `undefined`，不会是 `false` |
| 潜在风险 | 如果未来 isZeroValue 可能显式为 `false`，`||` 会将其转为 null/undefined |
| 修复方案 | 改为 `??`：`item.isZeroValue ?? null` 和 `item.is_zero_value ?? undefined` |
| 建议 | 顺手修复，属于代码规范改进 |

---

## 三、总风险等级汇总

| Step | 修复项 | 风险等级 | 影响范围 |
|------|--------|---------|---------|
| 5 | cleanOldTasks 清理磁盘文件 | 🟢 低 | 1文件，3行 |
| 6 | 拒绝 .xls 格式 | 🟢 低 | 2文件，8处 |
| 7 | 移除 result_path/resultPath | 🟢 低 | 1文件，3行 |
| 8 | 移除 pending 状态 | 🟢 低 | 1文件，5处 |
| 9 | filteredRows 依赖 | 🟢 无需修改 | — |
| 额外 | is_zero_value `\|\|` → `??` | 🟡 极低 | 2文件，2处 |

**整体风险等级: 🟢 低风险**

所有修复均为：
1. **类型/接口对齐** — 移除后端不返回的字段和状态
2. **安全网增强** — 添加 await、文件清理、格式校验
3. **代码规范** — `||` → `??` 语义修正

没有任何修改会改变核心业务逻辑（比对引擎、OCR、平台处理器）。

---

## 四、执行步骤

1. Step 5: 更新 tasks/route.ts L12 — await cleanOldTasks + 清理磁盘文件
2. Step 6: upload/route.ts + page.tsx — 拒绝 .xls
3. Step 7: page.tsx — 移除 result_path/resultPath
4. Step 8: page.tsx — 移除 pending 状态
5. 额外: start/route.ts + result/route.ts — `||` → `??`
6. 验证: `pnpm ts-check` + `pnpm lint`
7. 版本号: 1.22 → 1.23（4处一致）
8. 同步: `sync-docker.ps1`
