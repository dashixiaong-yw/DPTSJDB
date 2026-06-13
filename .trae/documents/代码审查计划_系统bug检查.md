# 代码审查计划：多平台账单对比系统

## 一、审查范围

| 模块 | 文件 | 说明 |
|------|------|------|
| 核心比对引擎 | src/lib/comparison-engine.ts | 数据比对核心逻辑 |
| Excel解析 | src/lib/excel-parser.ts | Excel文件解析和图片提取 |
| OCR服务 | src/lib/ocr-service.ts | 图片OCR识别 |
| 任务处理器 | src/lib/task-processor.ts | 任务状态管理 |
| 内存存储 | src/lib/memory-store.ts | 数据存储 |
| 平台处理器 | src/lib/platforms/*.ts | 各平台特定处理 |
| API路由 | src/app/api/**/*.ts | 接口定义 |
| 前端页面 | src/app/page.tsx | 主页面 |

## 二、已发现的Bug和缺陷

### 🔴 严重Bug

#### 1. ExcelParser - 图片索引越界
**文件**: `src/lib/excel-parser.ts` L540-541
```typescript
const colIndex = colLetter.split('').reduce((acc, char) => acc * 26 + char.charCodeAt(0) - 64, 0) - 1;
const colHeader = headers[colIndex] || '';
```
**问题**: 当列索引超过headers数组长度时，`headers[colIndex]` 返回 `undefined`，后续 `getImageType(undefined)` 导致无法正确识别图片类型。

**修复**: 添加边界检查：
```typescript
if (colIndex < 0 || colIndex >= headers.length) {
  console.warn(`列索引${colIndex}超出范围，跳过图片`);
  continue;
}
```

#### 2. ExcelParser - 列号转换算法缺陷
**文件**: `src/lib/excel-parser.ts` L385
```typescript
const cellRef = `${String.fromCharCode(65 + col)}${row + 1}`;
```
**问题**: 算法只能处理单字母列（A-Z），对于 AA、AB 等双字母列会生成错误的字符。例如 col=26 时输出 '[' 而不是 'AA'。

**修复**: 使用标准列号转字母算法处理任意列。

#### 3. OCRService - MD5缓存键验证缺陷
**文件**: `src/lib/ocr-service.ts` L688-689
```typescript
const isMd5 = /^[a-f0-9]{32}$/i.test(cacheKey);
const md5 = isMd5 ? cacheKey : createHash('md5').update(cacheKey).digest('hex');
```
**问题**: 仅通过长度和字符验证是否为MD5。如果 `imageKey` 恰好是32位十六进制字符串（如 `a1b2c3d4e5f6...`），会被错误地当作已MD5处理。

**修复**: 添加更严格的验证或使用不同的缓存键策略。

#### 4. MemoryStore - 并发竞态条件
**文件**: `src/lib/memory-store.ts` L105-108
```typescript
export function appendTaskResults(taskId: string, results: ComparisonRecord[]): void {
  const existing = resultStore.get(taskId) || [];
  resultStore.set(taskId, [...existing, ...results]);
}
```
**问题**: 在高并发场景下，两个任务同时调用 `appendTaskResults` 可能导致数据丢失。`get` 和 `set` 操作之间没有原子性保证。

**修复**: 使用互斥锁或合并为单个操作。

### 🟡 中等缺陷

#### 5. ComparisonEngine - 提现金额默认值处理不一致
**文件**: `src/lib/comparison-engine.ts` L811
```typescript
const actualOcr提现 = ocr提现 ?? 0;
```
**问题**: 使用 `??` 运算符意味着只有 `null` 或 `undefined` 会被替换为 0。但如果 OCR 正确识别出 `0`（表示没有提现），会被正确保留。逻辑本身正确，但注释说明不清晰。

**修复**: 添加更清晰的注释说明业务逻辑。

#### 6. TaskProcessor - 中断等待循环可能阻塞
**文件**: `src/lib/task-processor.ts` L59-68
```typescript
while (waited < maxWaitTime) {
  await new Promise(resolve => setTimeout(resolve, checkInterval));
  waited += checkInterval;
  const currentTask = taskStore.get(taskId);
  if (!currentTask || currentTask.status !== 'processing') {
    break;
  }
}
```
**问题**: 虽然有超时机制，但如果任务状态一直是 'processing'（比如任务卡住），循环会一直等到超时。

**修复**: 增加最大重试次数限制而不仅是时间限制。

#### 7. ExcelParser - 图片类型识别回退分配逻辑复杂
**文件**: `src/lib/excel-parser.ts` L726-746
```typescript
if (!hasLColImage) {
  // 将K列备选图片转为正式的店铺月度数据截图
} else {
  // 有L列图片，移除K列备选图片
  const kColImages = images.filter(img => img.imageType === '店铺月度数据截图(备选)');
  if (kColImages.length > 0) {
    for (const img of kColImages) {
      const index = images.indexOf(img);
      if (index > -1) {
        images.splice(index, 1);
      }
    }
  }
}
```
**问题**: 使用 `splice` 在循环中删除元素会导致索引偏移问题。此外，K列和L列的列索引定义是硬编码的常量，如果Excel格式变化会导致问题。

**修复**: 使用 `filter` 替代 `splice` 删除，或使用索引倒序删除。

#### 8. Page.tsx - 使用 `any` 类型
**文件**: `src/app/page.tsx` L267, L412等
```typescript
const response = await fetch(url, options);
const responseText = await response.text();
try {
  data = JSON.parse(responseText);
} catch { ... }
```
**问题**: API响应类型使用 `any`，没有类型定义。违反了规则18（禁止使用any类型）。

**修复**: 定义具体的响应接口类型。

### 🟢 轻微问题

#### 9. 误差值硬编码
**文件**: `src/lib/comparison-engine.ts` L412
```typescript
return Math.abs(tableNum - ocrValue) <= 0.01;
```
**问题**: 数值比对的允许误差 0.01 硬编码，没有配置化。

#### 10. 日期解析使用 new Date()
**文件**: 多处使用 `new Date()`
**问题**: 根据项目规范，应使用北京时间获取方式，禁止直接使用 `new Date()`。

#### 11. 缺少异常类型指定
**文件**: 多处 `catch (error)`
**问题**: 使用裸 `catch (error)` 而不是 `catch (error: Error)` 或特定的异常类型。

## 三、代码规范违反统计

| 规范 | 规则编号 | 违反数量 |
|------|---------|---------|
| 禁止使用 any 类型 | #18 | 约50+ 处 |
| 函数不超过40行 | #17 | 约10+ 个函数超标 |
| 异步操作必须 try-except | #15 | 部分未遵守 |
| 时间使用北京时间 | #14 | 多处使用 new Date() |
| 类型注解必须包含 | #18 | 部分函数缺失 |

## 四、修复优先级

| 优先级 | Bug编号 | 修复工作量 |
|--------|---------|-----------|
| P0 - 立即修复 | #1, #2, #3, #4 | 较大 |
| P1 - 高优先级 | #5, #6, #7 | 中等 |
| P2 - 中优先级 | #8 | 中等 |
| P3 - 低优先级 | #9, #10, #11 | 较小 |

## 五、验证步骤

1. 运行 `pnpm ts-check` 验证类型错误
2. 运行 `pnpm lint` 检查代码规范
3. 手动测试各平台处理流程：
   - 抖音：上传包含L列/N列图片的Excel
   - 拼多多：上传包含M列/N列图片的Excel
   - 淘宝：上传包含多类型截图的Excel
4. 验证并发场景下结果存储正确性
5. 验证图片列索引转换正确性（特别是AA、AB等列）
