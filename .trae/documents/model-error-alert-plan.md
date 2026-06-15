# 所有备用模型不可用时前端显著提示 - 实施计划

## 一、需求分析

当OCR服务的所有模型（主模型 + 备用模型）都失败时，需要在前端显示醒目的错误提示，告知用户当前无法进行图片识别，并给出解决建议。

### 当前状态

1. **OCR服务** (`src/lib/ocr-service.ts`)：已实现多模型切换机制，当所有模型失败时返回错误消息 `所有OCR模型都失败: xxx`
2. **任务处理器** (`src/lib/task-processor.ts`)：负责更新任务状态，但未对"所有模型失败"这种特殊错误进行标记
3. **前端页面** (`src/app/page.tsx`)：已有错误提示组件，但未针对"所有模型失败"进行特殊处理

### 预期效果

当所有OCR模型都不可用时，前端应显示：
- 醒目的红色错误横幅
- 清晰的错误说明
- 具体的解决建议（检查API Key、网络、模型配置等）
- 视觉上显著区分于普通错误

---

## 二、实施步骤

### 步骤1：扩展OCR服务错误类型

**文件**: `src/lib/ocr-service.ts`

**修改内容**:
- 添加专门的错误消息标识，便于后续识别"所有模型失败"的情况
- 保持现有逻辑不变，仅在返回错误时使用统一的错误消息前缀

**修改位置**: 第233-235行（所有模型都失败的返回逻辑）

```typescript
// 修改前
return {
  error: `所有OCR模型都失败: ${errors.join('; ')}`,
};

// 修改后
return {
  error: `[MODEL_ALL_FAILED] 所有OCR模型都失败: ${errors.join('; ')}`,
};
```

### 步骤2：在任务处理器中检测模型全部失败

**文件**: `src/lib/task-processor.ts`

**修改内容**:
- 在 `markTaskFailed` 函数中检测错误消息是否包含 `[MODEL_ALL_FAILED]` 前缀
- 如果是，设置 `model_all_failed` 标志到任务状态中

**新增代码**:
```typescript
/**
 * 更新任务状态为失败（含模型全部失败检测）
 */
export async function markTaskFailed(
  taskId: string,
  errorMessage: string
) {
  const task = taskStore.get(taskId);
  if (!task) {
    console.error('更新任务失败状态失败: 任务不存在', taskId);
    return;
  }

  task.status = 'failed';
  task.error_message = errorMessage;
  
  // 检测是否为"所有模型都失败"的特殊错误
  if (errorMessage.includes('[MODEL_ALL_FAILED]')) {
    task.model_all_failed = true;
    // 清理错误消息前缀，便于前端显示
    task.error_message = errorMessage.replace('[MODEL_ALL_FAILED] ', '');
  }

  taskStore.set(taskId, task);
}
```

### 步骤3：扩展任务状态API返回模型失败标志

**文件**: `src/app/api/task/[taskId]/status/route.ts`

**修改内容**:
- 在返回的任务状态中包含 `model_all_failed` 字段

### 步骤4：前端添加显著错误提示组件

**文件**: `src/app/page.tsx`

**修改内容**:
- 在任务失败状态区域，检测 `model_all_failed` 标志
- 如果为真，显示特殊的红色横幅错误提示
- 包含醒目的图标、错误说明和解决建议

**新增组件结构**:
```tsx
{currentTask.status === 'failed' && currentTask.modelAllFailed && (
  <div className="bg-red-600 text-white p-6 rounded-lg mb-4">
    <div className="flex items-center gap-3 mb-3">
      <AlertCircle className="h-8 w-8" />
      <h3 className="text-lg font-bold">OCR服务不可用</h3>
    </div>
    <p className="text-red-100 text-sm mb-4">
      所有可用的OCR识别模型都无法使用，暂时无法处理图片识别任务。
    </p>
    <div className="bg-red-700 bg-opacity-50 rounded-lg p-4">
      <h4 className="font-medium mb-2">建议操作：</h4>
      <ul className="text-sm text-red-100 space-y-1">
        <li>• 检查 API Key 是否正确配置</li>
        <li>• 检查网络连接是否正常</li>
        <li>• 等待一段时间后重试（模型可能临时不可用）</li>
        <li>• 联系管理员检查模型配置</li>
      </ul>
    </div>
  </div>
)}
```

### 步骤5：更新任务状态接口返回字段

**文件**: `src/app/api/task/[taskId]/status/route.ts`

**修改内容**:
- 在返回对象中添加 `modelAllFailed` 字段

---

## 三、文件修改清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `src/lib/ocr-service.ts` | 修改 | 添加错误消息前缀 `[MODEL_ALL_FAILED]` |
| `src/lib/task-processor.ts` | 修改 | 在 `markTaskFailed` 中检测并设置 `model_all_failed` 标志 |
| `src/app/api/task/[taskId]/status/route.ts` | 修改 | 添加 `modelAllFailed` 返回字段 |
| `src/app/page.tsx` | 修改 | 添加模型全部失败时的显著错误提示组件 |

---

## 四、风险评估

| 风险 | 等级 | 说明 | 应对措施 |
|------|------|------|---------|
| 错误消息格式变更影响其他逻辑 | 中 | 修改错误消息格式可能影响现有错误处理 | 使用前缀标识，不改变原有错误内容 |
| 任务存储字段变更 | 低 | 添加新字段 `model_all_failed` | 内存存储支持动态字段，无兼容性问题 |
| UI样式冲突 | 低 | 新增的红色横幅可能与现有样式冲突 | 使用独立的样式类，避免全局污染 |

---

## 五、验证标准

1. 所有模型失败时，错误消息包含 `[MODEL_ALL_FAILED]` 前缀
2. 任务状态正确设置 `model_all_failed: true`
3. API返回包含 `modelAllFailed` 字段
4. 前端显示醒目的红色错误提示横幅
5. 错误提示包含解决建议列表

---

## 六、版本号更新

完成后需更新以下文件的版本号（当前版本 + 1）：
- `VERSION`
- `package.json`
- `CHANGELOG.md`
- `docker-compose.yml`