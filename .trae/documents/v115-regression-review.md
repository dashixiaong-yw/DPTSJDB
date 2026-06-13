# v1.15 结果页重写 — 回归审查报告（终版）

## 审查范围

v1.15 对 `src/app/result/[taskId]/page.tsx` 进行了完全重写（386行 → 637行），从原始表格展示改为手风琴折叠式布局。

## v1.15 新引入的问题

### 问题 1（中等）：筛选切换后展开状态不重置

**位置**：page.tsx L154-164

**描述**：用户切换筛选标签后，`filteredRows` 变化，但 `expandedRows` 状态不会更新。之前手动折叠的问题行在切换筛选后仍然折叠。

**修复方案**：在 `filter` 变化时，对筛选后有问题的行自动展开。

### 问题 2（轻微）：`useEffect` 缺少 `fetchResult` 依赖

**位置**：page.tsx L102-104

**描述**：ESLint 警告 `fetchResult` 未列入依赖数组。功能无影响，但持续产生 lint 警告。

**修复方案**：将 `fetchResult` 用 `useCallback` 包裹。

### 问题 3（中等）：导出 JSON 使用 UTC 时间

**位置**：page.tsx L208

**描述**：`new Date().toISOString()` 输出 UTC 时间，违反项目规则"时间格式必须使用北京时间（UTC+8）"。

**修复方案**：改为北京时间格式输出。

## 已存在的遗留 BUG（非 v1.15 引入，但应一并修复）

### 遗留 BUG 1（严重）：`isZeroValue` 字段端到端丢失

**数据流**：
```
taobao.ts 设置 isZeroValue: true
  → comparison-engine.ts saveResults() 未映射该字段 ❌
    → ComparisonRecord 没有 is_zero_value 字段 ❌
      → API result route 未返回 isZeroValue ❌
        → 前端 isZeroValue 永远为 undefined
```

**影响**：淘宝平台值为0的字段不会显示"无需核对"标签，被当作普通一致项展示。

**修复方案**：
1. `ComparisonRecord` 增加 `is_zero_value?: boolean | null`
2. `saveResults` 映射 `is_zero_value: item.isZeroValue || null`
3. API 映射增加 `isZeroValue: item.is_zero_value || undefined`

### 遗留 BUG 2（中等）：`ocr_value` 为 `"0"` 时被误转为 `undefined`

**位置**：result/route.ts L76 `item.ocr_value || undefined`

**描述**：`ocr_value` 为字符串 `"0"` 时，`||` 运算符将其视为 falsy，返回 `undefined`。多个平台设置 `ocrValue: 0`，保存为 `"0"`，但前端收到 `undefined`。

**修复方案**：改为 `item.ocr_value != null ? item.ocr_value : undefined`

## 非问题项确认

| 检查项 | 状态 | 说明 |
|--------|------|------|
| API 数据结构兼容 | ✅ | `ResultData` 接口与 API 返回结构一致 |
| 首页跳转链接 | ✅ | `router.push('/result/${id}')` 路径未变 |
| 下载标记文件 | ✅ | API 路径 `/api/task/${taskId}/download` 未变 |
| 导出 JSON 报告 | ✅ | 纯前端逻辑，数据来自 `data.groupedByRow` |
| 其他页面不受影响 | ✅ | 只修改了 result 页面，无跨页面依赖 |
| 类型安全 | ✅ | ts-check 通过，0 errors |
| lint | ✅ | 0 errors（warnings 为历史遗留） |
| 筛选逻辑正确性 | ✅ | 搜索+状态筛选组合逻辑正确 |
| 移动端适配 | ✅ | sm 断点下表格→卡片切换正常 |
| 手风琴展开/折叠 | ✅ | 状态管理正确，无内存泄漏 |
| DonutChart 边界 | ✅ | value=0 和 value=max 均正确渲染 |
| 空数据状态 | ✅ | total=0 时匹配率返回 0，筛选无结果时显示提示 |
| rowKey 唯一性 | ✅ | rowIndex 由 API 按行号分配，不会重复 |

## 修复计划

| 优先级 | 修复内容 | 涉及文件 |
|--------|---------|---------|
| P0 | `isZeroValue` 端到端传递 | `memory-store.ts`、`comparison-engine.ts`、`result/route.ts` |
| P0 | `ocr_value` 为 "0" 时误转 undefined | `result/route.ts` |
| P1 | 筛选切换时重置展开状态 | `result/[taskId]/page.tsx` |
| P1 | `useEffect` 依赖修复 | `result/[taskId]/page.tsx` |
| P1 | 导出 JSON 时间改为北京时间 | `result/[taskId]/page.tsx` |
