# OCR 替换方案计划

## 任务目标
将 Coze 内置的 Kimi 2.5 OCR 识别服务替换为硅基流动（SiliconFlow）的 Kimi Vision API。

## 当前状态分析

**现有 OCR 实现**：
- 文件：`src/lib/ocr-service.ts`
- SDK：`coze-coding-dev-sdk` (v0.7.17)
- 调用方式：`LLMClient.invoke(messages, { model: 'kimi-k2-5-260127' })`
- 特点：通过 Coze 平台调用 Kimi K2.5 模型进行图片 OCR 识别

**问题**：
- 依赖 Coze 平台
- Coze 平台的 Kimi 2.5 OCR 不可用

## 替代方案

**选择：硅基流动（SiliconFlow）**

| 项目 | 说明 |
|------|------|
| API 地址 | `https://api.siliconflow.cn/v1` |
| SDK | `openai`（原生支持 OpenAI 兼容接口） |
| 模型 | Kimi Vision 模型（如 `moonshot-v1-vision-preview`） |
| 特点 | OpenAI 兼容格式，迁移成本极低 |

**优势**：
1. OpenAI 兼容接口，代码改动最小
2. 一个 API Key 可调用多种模型
3. 国内线路，速度快
4. 新用户赠送 2000 万 tokens 额度

## 实施步骤

### Step 1: 安装 OpenAI SDK
```bash
pnpm remove coze-coding-dev-sdk
pnpm add openai
```

### Step 2: 修改 ocr-service.ts
将 `src/lib/ocr-service.ts` 中的 SDK 从 `coze-coding-dev-sdk` 替换为 `openai`：

```typescript
// 旧代码
import { LLMClient, Config } from 'coze-coding-dev-sdk';

// 新代码
import OpenAI from 'openai';
```

### Step 3: 配置环境变量
在 `.env.example` 中添加：
```
SILICONFLOW_API_KEY=your_api_key
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
KIMI_VISION_MODEL=moonshot-v1-vision-preview
```

### Step 4: 更新 OCR 调用代码
修改 `src/lib/ocr-service.ts` 的 `recognizeImage` 方法：

```typescript
// 使用 OpenAI SDK 调用硅基流动的 Kimi Vision API
const client = new OpenAI({
  apiKey: process.env.SILICONFLOW_API_KEY,
  baseURL: process.env.SILICONFLOW_BASE_URL,
});

const response = await client.chat.completions.create({
  model: process.env.KIMI_VISION_MODEL || 'moonshot-v1-vision-preview',
  messages: messages, // 现有的 messages 格式可直接复用
});
```

### Step 5: 验证
- 运行 `pnpm ts-check` 确认类型正确
- 测试 OCR 识别功能

## 关键文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/ocr-service.ts` | 修改 | 替换 SDK，从 coze-coding-dev-sdk 改为 openai |
| `package.json` | 修改 | 移除 coze-coding-dev-sdk，添加 openai |
| `.env.example` | 添加 | 硅基流动 API 配置项 |
| `.trae/rules/README.md` | 更新 | 更新依赖说明 |

## 代码对比

### 旧代码（coze-coding-dev-sdk）
```typescript
import { LLMClient, Config } from 'coze-coding-dev-sdk';

const config = new Config();
const client = new LLMClient(config);

const response = await this.client.invoke(messages, {
  model: 'kimi-k2-5-260127',
  temperature: 0.6,
});
```

### 新代码（openai + 硅基流动）
```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.SILICONFLOW_API_KEY,
  baseURL: process.env.SILICONFLOW_BASE_URL,
});

const response = await client.chat.completions.create({
  model: process.env.KIMI_VISION_MODEL || 'moonshot-v1-vision-preview',
  messages: messages,
});
```

## 注意事项

1. **接口兼容**：硅基流动是 OpenAI 兼容接口，`messages` 格式完全兼容，无需修改提示词
2. **模型选择**：硅基流动可能使用 `moonshot-v1-vision-preview` 或类似模型名，需在控制台确认
3. **环境隔离**：API Key 通过 `.env` 配置，支持多环境切换
4. **平滑迁移**：可保留 Provider 抽象，便于后续切换其他 OCR 服务
