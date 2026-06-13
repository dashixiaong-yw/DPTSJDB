# any 类型清理计划

## 一、总结

全面清理 `src/` 目录下约 58 处 `any` 类型使用，涉及 11 个文件。所有替换均为**纯类型层面变更**，不影响运行时行为。

**范围确定**：用户要求全面修复所有 any，仅在 `src/` 修复（docker/ 由同步脚本覆盖），新增全局 `RowData` 类型替代 `Record<string, any>`。

---

## 二、风险评估（核心结论）

**所有 58 处 any 替换后均不影响系统原有功能。**

这 58 处 any 全部属于"类型声明简化"性质，没有任何一处存在运行时行为依赖。理由如下：

| 文件 | any 数量 | 风险等级 | 理由 |
|------|:--------:|:--------:|------|
| excel-parser.ts | 15 | **低风险** | rows 来源为 Excel 单元格值(财务场景仅 string/number/null)，下游有防御性检查保护 |
| start/route.ts | 14 | **无风险** | 所有参数实际类型已定义(ParseResult/ExcelSheet/ExcelImage/RowData/ComparisonItem)，any 仅为类型简化 |
| douyin.ts | 9 | **低风险** | rowData 来源同上，hasValue() + getComparisonStatus() 双层保护 |
| taobao.ts | 5 | **低风险** | 同上 |
| pinduoduo.ts | 5 | **低风险** | 同上 |
| comparison-engine.ts | 3 | **无风险** | details 类型已明确是 ComparisonItem[]，仅 map 回调缺失类型标注 |
| download/route.ts | 3 | **低风险** | 类型源自 ComparisonRecord[]，非动态类型 |
| result/page.tsx | 2 | **无风险** | 接口定义中 any[] 替换为 ComparisonItem[]，类型可完全推导 |
| types.ts | 2 | **无风险** | 接口定义中 any 替换为 RowData/RowData[] |
| template/route.ts | 1 | **无风险** | reduce 累加器类型简化 |
| page.tsx (home) | 1 | **无风险** | data 变量接收 JSON.parse 结果，定义 ChunkUploadResponse 接口即可 |

### Excel 单元格值类型说明

`cell.value` 理论上可返回 `null | string | number | boolean | Date | CellError` 等，但：
- 财务表格场景下，实际单元格值只出现 `string | number | null`
- 所有下游通过 `!== undefined`、`!== null`、`!== ''` 防御性检查
- 即使出现 `boolean` 值，`hasValue()` 会通过且 `compareValues()` 中 `parseFloat(false)` 得到 `NaN` 返回 `false`，结果仅标记为 `mismatch`，**不会报错或崩溃**

### 总结

**无运行时功能影响 + 编译期类型安全提升 = 纯正向变更**

---

## 三、现状

### 全局统计

| 文件 | any 行数 | 主要问题类别 | 风险 |
|------|:--------:|-------------|:----:|
| excel-parser.ts | 15 | as any(7)、变量声明(6)、回调参数(2) | 🟢 低 |
| start/route.ts | 14 | 函数参数(9)、泛型(5) | 🟢 无 |
| douyin.ts | 9 | 返回值(4)、泛型(3)、回调参数(2) | 🟢 低 |
| taobao.ts | 5 | 泛型(3)、返回值(2) | 🟢 低 |
| pinduoduo.ts | 5 | 泛型(3)、返回值(2) | 🟢 低 |
| comparison-engine.ts | 3 | 回调参数(2)、泛型(1) | 🟢 无 |
| download/route.ts | 3 | as any(1)、泛型(2) | 🟢 低 |
| result/page.tsx | 2 | 接口定义(2) | 🟢 无 |
| types.ts | 2 | 接口定义(2) | 🟢 无 |
| template/route.ts | 1 | 泛型(1) | 🟢 无 |
| page.tsx (home) | 1 | 变量声明(1) | 🟢 无 |

### 关键前提

- **tsconfig.json**: `strict: true`（含 `noImplicitAny`）
- **ESLint**: 使用 `eslint-config-next/typescript` 默认规则（`@typescript-eslint/no-explicit-any` 为 error 级别）
- **ExcelJS**: 库类型定义不完整，需通过 `.d.ts` 声明补充解决 `as any`

---

## 四、变更方案

### 整体结构

```
新增:
  src/types/global.d.ts    — 全局 RowData 类型 + ExcelJS 类型补充

修改:
  src/lib/platforms/types.ts          — 接口定义中的 any
  src/lib/excel-parser.ts             — 全部 15 处 any
  src/lib/comparison-engine.ts        — 全部 3 处 any
  src/lib/platforms/douyin.ts         — 全部 9 处 any
  src/lib/platforms/pinduoduo.ts      — 全部 5 处 any
  src/lib/platforms/taobao.ts         — 全部 5 处 any
  src/app/api/task/[taskId]/start/route.ts     — 全部 14 处 any
  src/app/api/task/[taskId]/download/route.ts   — 全部 3 处 any
  src/app/api/template/route.ts       — 全部 1 处 any
  src/app/page.tsx                    — 全部 1 处 any
  src/app/result/[taskId]/page.tsx    — 全部 2 处 any
```

### 详细变更

---

#### Step 1: 新增全局类型文件

**文件**: `src/types/global.d.ts`

**新增内容**:

```typescript
/**
 * 全局行数据类型
 * 替代 Record<string, any>，用于 Excel 数据行
 * 覆盖范围：string | number | null（Excel 单元格实际值范围）
 * boolean/Date 理论上可能出现但财务场景中不会出现
 */
export type RowData = Record<string, string | number | null | undefined>;

/**
 * ExcelJS 类型补充声明
 * 修复 getImages() 返回类型缺失、Worksheet.load() 类型兼容性问题
 */
import 'exceljs';

declare module 'exceljs' {
  interface Worksheet {
    getImages(): Array<{
      imageId: number;
      range: {
        tl: { col: number; row: number };
        br: { col: number; row: number };
      };
    }>;
  }
}
```

**原因**: 统一定义 `RowData` 替代 12+ 处 `Record<string, any>`；补充 ExcelJS 缺失类型消除 3+ 处 `as any`。

---

#### Step 2: 修复 types.ts 接口定义

**文件**: `src/lib/platforms/types.ts`

| 行号 | 当前 | 改为 |
|------|------|------|
| L57 | `rows: any[]` | `rows: RowData[]` |
| L77 | `rowData: Record<string, any>` | `rowData: RowData` |

同时添加 `RowData` 的 import：
```typescript
import type { RowData } from '@/types/global';
```

---

#### Step 3: 修复 excel-parser.ts（15 处 any，最多）

| 类别 | 位置 | 当前 | 改为 |
|------|------|------|------|
| 接口 | L10 | `rows: any[]` | `rows: RowData[]` |
| 函数参数 | L109 | `value: any` | `value: unknown` |
| 变量声明 (×2) | L519、L607 | `const rowData: any = {}` | `const rowData: RowData = {}` |
| 变量声明 (×2) | L521、L612 | `const rows: any[] = []` | `const rows: RowData[] = []` |
| as any (×4) | L436、L511、L525、L603 | `fileBuffer as any` | `fileBuffer as unknown as Buffer`（ExcelJS 类型兼容） |
| as any | L631 | `img.range as any` | 由 Step1 的 getImages() 类型补充解决 |
| as any | L647 | `img.imageId as any as number` | 改为 `img.imageId`（类型已为 number） |
| as any | L585、L649 | `imageData.buffer as any` | 改为 `imageData.buffer`（声明已包含 buffer） |

**import 变更**: 添加 `import type { RowData } from '@/types/global';`

---

#### Step 4: 修复 start/route.ts（14 处 any）

**文件**: `src/app/api/task/[taskId]/start/route.ts`

| 位置 | 当前 | 改为 |
|------|------|------|
| L228 | `parseResult: any` | `parseResult: ParseResult` |
| L228 | `sheet: any` | `sheet: ExcelSheet` |
| L229 | `img: any` | `img: ExcelImage` |
| L231 | `row: any` | `row: RowData` |
| L232 | `rowImagesMap: Map<number, Map<string, any>>` | `Map<number, Map<string, ExcelImage>>` |
| L253 | `parseResult: any` | `parseResult: ParseResult` |
| L254 | `rowImagesMap: any` | `rowImagesMap: Map<number, Map<string, ExcelImage>>` |
| L258 | `sheet: any` | `sheet: ExcelSheet` |
| L259 | `row: any` | `row: RowData` |
| L265 | `item: any` | `item: ComparisonItem` |
| L266 | `item: any` | `item: ComparisonItem` |
| L270 | `item: any` | `item: ComparisonItem` |
| L271 | `item: any` | `item: ComparisonItem` |

**import 变更**: 添加:
```typescript
import type { RowData } from '@/types/global';
import type { ExcelSheet, ExcelImage, ComparisonItem } from '@/lib/platforms/types';
```

---

#### Step 5: 修复 comparison-engine.ts（3 处 any）

**文件**: `src/lib/comparison-engine.ts`

| 位置 | 当前 | 改为 |
|------|------|------|
| L660 | `details.map((item: any)` | `details.map((item: ComparisonItem)` |
| L682 | `getFieldValue(rowData: Record<string, any>` | `rowData: RowData` |
| L893 | `details.map((item: any)` | `details.map((item: ComparisonItem)` |

**import 变更**: 添加 `import type { RowData } from '@/types/global';`

---

#### Step 6: 修复 douyin.ts（9 处 any）

**文件**: `src/lib/platforms/douyin.ts`

| 位置 | 当前 | 改为 |
|------|------|------|
| L104 | `photo: any` | `photo: unknown` |
| L264 | `getFieldValue(rowData, fieldPattern): any` | 返回值: `string \| number \| null \| undefined` |
| L266 | `rowData: Record<string, any>` | `rowData: RowData` |
| L295 | `ocrResult: any` | `ocrResult: OCRResult` |
| L300 | `images: any[]` | `images: ImageInfo[]`（需定义本地类型或改用 ExcelImage[]） |
| L338 | `rowData: Record<string, any>` | `rowData: RowData` |
| L339 | `merged: any` | 改为具体 `OCRResult` 合并类型 |
| L374 | `rowData: Record<string, any>` | `rowData: RowData` |
| L422、L432、L439 | `rowData: Record<string, any>` | `rowData: RowData` |

**import 变更**: 添加 `import type { RowData } from '@/types/global';`

---

#### Step 7: 修复 pinduoduo.ts（5 处 any）

**文件**: `src/lib/platforms/pinduoduo.ts`

| 位置 | 当前 | 改为 |
|------|------|------|
| L360 | `tableValue: any` | `tableValue: string \| number \| null \| undefined` |
| L389 | `rowData: Record<string, any>` | `rowData: RowData` |
| L399 | `rowData: Record<string, any>` | `rowData: RowData` |
| L406 | `rowData: Record<string, any>` | `rowData: RowData` |
| L423 | `value: any` | `value: unknown` |

**import 变更**: 添加 `import type { RowData } from '@/types/global';`

---

#### Step 8: 修复 taobao.ts（5 处 any）

**文件**: `src/lib/platforms/taobao.ts`

| 位置 | 当前 | 改为 |
|------|------|------|
| L99 | `Promise<any>` | `Promise<unknown>` |
| L362 | `tableValue: any` | `tableValue: string \| number \| null \| undefined` |
| L393 | `rowData: Record<string, any>` | `rowData: RowData` |
| L400 | `rowData: Record<string, any>` | `rowData: RowData` |
| L407 | `rowData: Record<string, any>` | `rowData: RowData` |

**import 变更**: 添加 `import type { RowData } from '@/types/global';`

---

#### Step 9: 修复 download/route.ts（3 处 any）

**文件**: `src/app/api/task/[taskId]/download/route.ts`

| 位置 | 当前 | 改为 |
|------|------|------|
| L41 | `resultBuffer as any` | 改为 `resultBuffer as Uint8Array` |
| L44 | `Map<string, any>` | `Map<string, ComparisonRecord>` |
| L45 | `(r: any)` | `(r: ComparisonRecord)` |

**import 变更**: 添加 `import type { ComparisonRecord } from '@/lib/memory-store';`

---

#### Step 10: 修复 template/route.ts（1 处 any）

**文件**: `src/app/api/template/route.ts`

| 位置 | 当前 | 改为 |
|------|------|------|
| L250 | `Record<string, any[]>` | `Record<string, TemplateField[]>`（需定义本地接口） |

---

#### Step 11: 修复 result/page.tsx（2 处 any）

**文件**: `src/app/result/[taskId]/page.tsx`

| 位置 | 当前 | 改为 |
|------|------|------|
| L38 | `items: any[]` | `items: ComparisonItem[]` |
| L40 | `details: any[]` | `details: ComparisonItem[]` |

**import 变更**: 添加 `import type { ComparisonItem } from '@/lib/platforms/types';`

---

#### Step 12: 修复 page.tsx home（1 处 any）

**文件**: `src/app/page.tsx`

| 位置 | 当前 | 改为 |
|------|------|------|
| L267 | `data: any` | `data: ChunkUploadResponse`（新增本地接口） |

在文件内新增接口定义：

```typescript
interface ChunkUploadResponse {
  success: boolean;
  uploadId?: string;
  taskId?: string;
  isComplete?: boolean;
  fileSize?: number;
  error?: string;
}
```

---

## 五、验证步骤

```powershell
# 1. TypeScript 类型检查（零运行时变更验证）
pnpm ts-check

# 2. ESLint 检查（聚焦 no-explicit-any 错误数变化）
pnpm lint 2>&1 | Select-String "no-explicit-any"

# 3. 验证无新的 any 错误（预期无输出）
# 4. 运行同步脚本
powershell -ExecutionPolicy Bypass -File ./sync-docker.ps1
```

---

## 六、工作清单

| # | 步骤 | 文件 | 变更量 | 风险 |
|---|------|------|:------:|:----:|
| 1 | 创建全局类型文件 | src/types/global.d.ts | 新增 ~25 行 | 无风险 |
| 2 | 修复类型定义 | src/lib/platforms/types.ts | 改 2 处 + import | 无风险 |
| 3 | 修复核心解析器 | src/lib/excel-parser.ts | 改 15 处 | 低风险(编译可发现) |
| 4 | 修复任务启动路由 | src/app/api/task/[taskId]/start/route.ts | 改 14 处 | 无风险 |
| 5 | 修复比对引擎 | src/lib/comparison-engine.ts | 改 3 处 | 无风险 |
| 6 | 修复抖音处理器 | src/lib/platforms/douyin.ts | 改 9 处 | 低风险(编译可发现) |
| 7 | 修复拼多多处理器 | src/lib/platforms/pinduoduo.ts | 改 5 处 | 低风险(编译可发现) |
| 8 | 修复淘宝处理器 | src/lib/platforms/taobao.ts | 改 5 处 | 低风险(编译可发现) |
| 9 | 修复下载路由 | src/app/api/task/[taskId]/download/route.ts | 改 3 处 | 低风险 |
| 10 | 修复模板路由 | src/app/api/template/route.ts | 改 1 处 | 无风险 |
| 11 | 修复结果页面 | src/app/result/[taskId]/page.tsx | 改 2 处 | 无风险 |
| 12 | 修复首页 | src/app/page.tsx | 改 1 处 | 无风险 |
| 13 | 验证 | ts-check + lint | 通过 | -- |
