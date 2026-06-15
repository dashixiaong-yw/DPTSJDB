# 检测硅基流动平台OCR模型可用性并修正配置

## 摘要

检测SiliconFlow API中所有视觉模型的可用性，修正`.env`、`.env.example`和代码中的模型配置，确保OCR回退机制正常工作。

## 当前状态分析

### 配置现状

| 位置 | 主模型 | 备用模型 |
|------|--------|----------|
| `.env` | `Qwen/Qwen3-VL-32B-Instruct` | `Qwen/Qwen2.5-VL-72B-Instruct,Pro/Qwen/Qwen2.5-VL-7B-Instruct` |
| `.env.example` | `qwen-vl-plus`（已停用） | `llava-1.5-7b,qwen-vl-max,cogvlm-chat`（已停用） |
| 代码默认值 | `qwen-vl-plus`（已停用） | `Qwen/Qwen3-VL-8B-Instruct,Qwen/Qwen2.5-VL-72B-Instruct,Pro/Qwen/Qwen2.5-VL-7B-Instruct` |

### 已知问题

1. **备用模型403错误**：`Qwen/Qwen2.5-VL-72B-Instruct` 和 `Pro/Qwen/Qwen2.5-VL-7B-Instruct` 在上次测试中返回403
2. **`.env.example`严重过时**：所有模型名都是旧格式，在SiliconFlow平台已不存在
3. **代码默认值不可靠**：`qwen-vl-plus`作为默认主模型已停用，备用模型中部分返回403
4. **模型命名规范变化**：SiliconFlow已统一使用 `厂商/模型名` 格式（如 `Qwen/Qwen3-VL-32B-Instruct`）

## 执行步骤

### Step 1: 调用SiliconFlow API获取可用视觉模型列表

使用API Key调用 `GET https://api.siliconflow.cn/v1/models`，筛选出支持视觉/多模态的模型。

```powershell
$headers = @{ "Authorization" = "Bearer sk-fcduifoesykghqpnxuhftqomikojlqhavrprkuwbwafgoseh" }
$response = Invoke-RestMethod -Uri "https://api.siliconflow.cn/v1/models" -Headers $headers
# 筛选包含 vision/vl/image/multimodal 关键词的模型
```

### Step 2: 逐个测试配置中的模型可用性

对以下模型发送一个简单的视觉识别请求，验证是否可用：

- `Qwen/Qwen3-VL-32B-Instruct`（当前主模型）
- `Qwen/Qwen3-VL-8B-Instruct`（代码默认备用1）
- `Qwen/Qwen2.5-VL-72B-Instruct`（.env备用1）
- `Pro/Qwen/Qwen2.5-VL-7B-Instruct`（.env备用2）

测试方法：发送一个包含小尺寸测试图片的chat completion请求，检查是否返回200。

### Step 3: 从API返回的模型列表中筛选可用的视觉模型

根据Step 1的模型列表，找出所有支持视觉输入的模型，按价格排序。

### Step 4: 更新配置文件

根据测试结果更新以下文件：

1. **`.env`** — 更新 `KIMI_VISION_MODEL` 和 `BACKUP_VISION_MODELS` 为实际可用的模型
2. **`.env.example`** — 同步更新，并修正注释中的模型说明
3. **`src/lib/ocr-service.ts`** — 更新代码中的默认模型列表（L49-52），确保与.env.example一致

### Step 5: 验证

- 重启开发服务器
- 用测试账单文件运行一次OCR识别
- 确认主模型和备用模型都能正常工作

## 假设与决策

1. **假设**：SiliconFlow API的 `/v1/models` 端点返回完整的模型列表，包含模型能力信息
2. **决策**：备用模型按价格从低到高排序，优先使用低成本模型
3. **决策**：`.env.example` 中的模型名必须与SiliconFlow平台实际可用的模型名完全一致
4. **决策**：代码默认值应与 `.env.example` 保持一致，作为未配置环境变量时的兜底

## 涉及文件

| 文件 | 修改内容 |
|------|---------|
| `.env` | 更新 KIMI_VISION_MODEL 和 BACKUP_VISION_MODELS |
| `.env.example` | 更新模型名和注释说明 |
| `src/lib/ocr-service.ts` L49-52 | 更新代码默认模型列表 |
