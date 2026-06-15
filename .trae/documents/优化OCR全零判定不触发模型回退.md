# 优化：表格值为 0 时 OCR 返回 0 不再触发模型回退

## 摘要

当前 OCR 服务中，当模型识别结果的全部金额字段均为 0 时，会触发同模型重试（最多 3 次，指数退避间隔 1s、2s、4s），重试仍为 0 则返回 error 触发备用模型切换。这在表格真实值为 0 的场景下（如当月无支出）浪费了 API 调用和处理时间。本计划消除这一不必要的重试/回退逻辑。

## 当前状态分析

### 问题定位

[src/lib/ocr-service.ts](file:///d:/trea项目/多平台账单对比系统/src/lib/ocr-service.ts) L298-312：

```typescript
// 检查金额是否全为0（可能是识别不准确）
if (result.amounts && Object.keys(result.amounts).length > 0) {
  const allZero = Object.values(result.amounts).every(v => v === 0);
  if (allZero) {
    if (attempt < this.maxRetries) {
      console.warn(`[OCR服务] 模型 ${model} 识别的金额全为0，可能识别不准确，重试中...`);
      const delay = this.retryDelay * Math.pow(2, attempt);
      await this.sleep(delay);
      continue;  // 同模型内重试
    }
    // 重试次数用完仍全为0，返回error让外层尝试备用模型
    console.warn(`[OCR服务] 模型 ${model} 重试${this.maxRetries}次后金额仍全为0，尝试备用模型`);
    return { error: '金额识别全为0，可能识别不准确' };
  }
}
```

**流程**：模型返回全部字段为 0 → 同模型重试（最多 3 次，每次间隔 1s、2s、4s 指数退避）→ 仍为 0 → 返回 error → `recognize()` 方法（L220-228）检测到 `result.error` → `markModelFailed()` → 切换到下一个备用模型

### 全量影响追踪

| 追踪维度 | 发现 |
|---------|------|
| `"金额识别全为0"` 错误字符串引用 | 仅 [ocr-service.ts L310](file:///d:/trea项目/多平台账单对比系统/src/lib/ocr-service.ts#L310) 一处，全局唯一 |
| `tryModel()` 调用者 | 仅 [ocr-service.ts L218](file:///d:/trea项目/多平台账单对比系统/src/lib/ocr-service.ts#L218) 的 `recognize()` 方法一处 |
| `recognize()` 调用者 | 各平台处理器（douyin.ts、taobao.ts、pinduoduo.ts 的 processRow 方法） |
| 错误传播路径 | `tryModel` 返回 `{ error: ... }` → `recognize` 的 L220 检查 `result.error` → `markModelFailed()` + 尝试下一模型 |
| 下游依赖 | 无其他模块检查这个具体错误字符串；`[MODEL_ALL_FAILED]` 前缀由 task-processor.ts 检查，但那只在所有模型均失败时触发 |

## 回归风险逐场景分析

| # | 场景 | 触发全零判断？ | 当前行为 | 修改后行为 | 是否回归 |
|---|------|---------------|---------|-----------|---------|
| 1 | 表格值 = 0，OCR 正确返回 0 | **是** | 重试 3 次 + 可能切备用模型，浪费 API | 直接接受结果，比较为 `match` | **正向修复** |
| 2 | 表格值 ≠ 0，OCR 正确返回非 0 | 否 | 正常返回 | 不变 | 无影响 |
| 3 | 表格值 ≠ 0，模型误读全为 0（极低概率，需 ALL 字段均误读） | **是** | 重试 → 备用模型 → 可能纠正 | 接受 0 → 与表格值比较为 `mismatch` | ⚠️ **可接受差异** |
| 4 | 网络超时 / API 错误 | 否（走 catch 分支） | 重试 → error | 不变（catch 分支 L320-330） | 无影响 |
| 5 | 模型返回格式错误无法解析 | 否（parseOCRResult 返回空/无 amounts） | 走到 `Object.keys().length > 0` 为 false，跳过 | 不变 | 无影响 |
| 6 | 模型成功但仅部分字段为 0 | 否（需 ALL 字段为 0） | 正常返回 | 不变 | 无影响 |
| 7 | `fixAmountError` 触发的金额修正 | 否（修正后值非 0 或触发条件不同） | 正常执行 | 不变 | 无影响 |

### 场景 3 的详细论证

场景 3 的完整路径：模型准确读取图像中所有数字并全部返回 0，而实际截图中这些金额全都非 0。

**概率评估**：极低。
- 现代的视觉语言模型（Qwen-VL、DeepSeek-VL 等）对数字识别准确率非常高
- 需满足：图像清晰 → 模型正确解析 JSON → **每一个金额字段都被准确读取为 0**，而实际值非 0
- 这与"模型完全无法读取图像"不同，后者属于场景 4/5（API 异常或格式错误）

**即使发生的影响**：该行的比对结果显示为 `mismatch`（不匹配），用户在前端看到差异后可以手动核验。这不是数据丢失或静默错误。

**权衡**：
- 当前成本：每个"全零"截图浪费 3 次重试 + 最多 N 个备用模型调用 = 每次至少浪费 7-20 秒 + API 配额
- 变更成本：极低概率下的一个可见 `mismatch` 标记

### 结论

变更安全。不存在静默错误或数据丢失的风险。`mismatch` 是用户可见的状态，用户可据此手动核验。

## 修改方案

### 唯一修改：`src/lib/ocr-service.ts`

**改动位置**：L298-312 的 `if (allZero)` 分支

**改动内容**：移除整个"金额全为 0"的 retry + error 返回逻辑。当模型返回全部金额为 0 时，直接接受结果，走到 L314 的缓存和返回逻辑。

**原因**：
1. OCR prompt 已包含"找不到则为 0"指令，返回 0 是符合指令的正常行为（而非模型故障）
2. `fixAmountError` 函数已处理了小数点缺失的已知边缘情况
3. 如果模型真正失败（网络错误/超时/格式错误），catch 分支已经捕获并触发重试，不受影响
4. 淘宝平台已有处理器层优化（[taobao.ts L284-291](file:///d:/trea项目/多平台账单对比系统/src/lib/platforms/taobao.ts#L284-L291)）——表格值为 0 时跳过 OCR 比对

**不涉及的文件**：所有平台处理器文件无需修改。`recognize()` 不再收到 `result.error`，直接返回全零的 `OCRResult` 给调用方，调用方正常提取字段值并与表格值比较即可。

## 验证步骤

1. **`pnpm ts-check`** — 确认无类型错误
2. **`pnpm lint`** — 确认无代码规范问题
3. **代码审查**：确认 `tryModel` 方法移除全零判断后，路径为：
   - L298-312 判断块被移除
   - 当 `allZero == true` 时直接走到 L314 `cacheResult` → L318 `return result`
   - `recognize()` 的 L220 `result.error` 检查通过 → 返回给调用方
4. **版本更新**：按 5 步流程更新版本号并同步
