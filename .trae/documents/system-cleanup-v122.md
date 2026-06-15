# 系统全面检查与清理计划（v1.22）

## 一、当前状态

**当前版本**: 1.21  
**上一轮修复**: v1.21 修复了7个Bug  
本轮重点：**清理无效代码/模块、消除重复逻辑、确保流程流畅**

---

## 二、安全验证结果（逐项 Grep 精确验证）

每一项删除都经过 `Grep` 全项目搜索，确认零外部引用后才标记为安全。

| 删除项 | Grep 搜索关键词 | 搜索结果 | 安全？ |
|--------|----------------|----------|--------|
| `comparison-engine.ts` 整文件 | `comparison-engine\|ComparisonEngine\|ComparisonResult\|compareRows` | 仅文件自身5处，零外部引用 | **安全** |
| `uploadImages` | `uploadImages` | 仅定义1处，零调用 | **安全** |
| `PLATFORM_FEATURES` | `PLATFORM_FEATURES` | 定义1处 + 内部使用1处（在 identifyPlatform 内），两者一起删 | **安全** |
| `identifyPlatform`(excel-parser) | `identifyPlatform` | start/route.ts 导入的是 platforms/index.ts 的，excel-parser 的零外部引用 | **安全** |
| `identifyScreenshotColumns` | `identifyScreenshotColumns` | 仅定义1处，零调用 | **安全** |
| `compareUtils` | `compareUtils` | 仅定义1处，零调用 | **安全** |
| `CompareUtils` 接口 | `CompareUtils` | base.ts import + types.ts 定义，删除 compareUtils 后可一起删 | **安全** |
| `getImageType`(base.ts) | `getImageType` | excel-parser.ts 有私有同名函数（3处使用），base.ts 的仅定义1处零调用 | **安全** |
| `getHandler` | `getHandler\|getRegisteredPlatforms` | 仅定义2处，零调用 | **安全** |
| `saveTaskResults` | `saveTaskResults` | memory-store.ts 定义 + services.ts re-export，零实际调用 | **安全** |
| `fileExists` | `fileExists` | local-storage.ts 定义 + services.ts re-export，零实际调用 | **安全** |

**结论：所有12项删除均经过精确验证，零外部引用，不会影响任何运行时功能。**

---

## 三、修复步骤

### Step 1: 删除废弃文件 comparison-engine.ts（966行）

**文件**: `src/lib/comparison-engine.ts`  
**操作**: 删除整个文件  
**验证**: Grep 确认 `ComparisonEngine`、`ComparisonResult`、`comparison-engine` 零外部引用

### Step 2: 清理 excel-parser.ts 中的4个无效导出（约75行）

**文件**: `src/lib/excel-parser.ts`  
**操作**: 删除以下导出：
- `uploadImages` 函数
- `PLATFORM_FEATURES` 常量（仅被 identifyPlatform 内部使用）
- `identifyPlatform` 函数（@deprecated，使用了 PLATFORM_FEATURES）
- `identifyScreenshotColumns` 函数

**验证**: Grep 确认 `uploadImages`、`PLATFORM_FEATURES`、`identifyPlatform`(from excel-parser)、`identifyScreenshotColumns` 零外部引用

### Step 3: 清理 platforms/base.ts 中的2个无效导出（约60行）

**文件**: `src/lib/platforms/base.ts`  
**操作**:
- 删除 `compareUtils` 对象导出
- 删除 `getImageType` 函数（excel-parser.ts 有自己的私有同名函数在用）
- 删除 `import { CompareUtils } from './types'` 行

**验证**: Grep 确认 `compareUtils`、`getImageType`(from base.ts) 零外部引用

### Step 4: 清理 platforms/types.ts 中的 CompareUtils 接口（约15行）

**文件**: `src/lib/platforms/types.ts`  
**操作**: 删除 `CompareUtils` 接口定义  
**前提**: Step 3 已删除 base.ts 中的 import 和实现

### Step 5: 清理 platforms/index.ts 中的2个无效导出（约15行）

**文件**: `src/lib/platforms/index.ts`  
**操作**: 删除 `getHandler` 和 `getRegisteredPlatforms` 函数  
**验证**: Grep 确认零外部引用

### Step 6: 清理 memory-store.ts 中的 saveTaskResults（约3行）

**文件**: `src/lib/memory-store.ts`  
**操作**: 删除 `saveTaskResults` 函数  
**验证**: Grep 确认零调用（实际使用的是 `appendTaskResults`）

### Step 7: 清理 local-storage.ts 中的 fileExists（约10行）

**文件**: `src/lib/local-storage.ts`  
**操作**: 删除 `fileExists` 函数  
**验证**: Grep 确认零调用

### Step 8: 清理 services.ts 中的无效 re-export

**文件**: `src/lib/services.ts`  
**操作**: 从 re-export 列表中移除 `saveTaskResults` 和 `fileExists`  
**前提**: Step 6 和 Step 7 已删除原始定义

### Step 9: 验证

- 运行 `pnpm ts-check` — 确保类型检查通过（最关键，验证无遗漏引用）
- 运行 `pnpm lint` — 确保代码规范通过
- 更新版本号到 1.22（4处一致）
- 运行同步脚本

---

## 四、不做的事项及原因

| 项目 | 原因 |
|------|------|
| 拆分 ocr-service.ts（1285行） | 功能高度内聚，拆分风险大于收益 |
| 拆分 excel-parser.ts | 核心解析逻辑不宜拆分，留待后续专项优化 |
| 移除 console.log | 生产环境日志有价值 |
| 移除 eslint-disable | 唯一一处是合理的 |
| template/route.ts | 后端接口保留供未来使用 |
| fieldMappingStore | template/route.ts 使用 |

---

## 五、预期效果

| 指标 | 修改前 | 修改后 |
|------|--------|--------|
| 废弃文件 | 1个（966行） | 0 |
| 无效导出 | 12个 | 0 |
| 重复代码 | 2处（getImageType、identifyPlatform） | 0 |
| 总删除代码行数 | - | ~1100行 |
