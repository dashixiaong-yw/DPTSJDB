# OCR 模型兜底机制实现计划

## 问题分析
当前 OCR 服务只配置了单一模型 `moonshot-v1-vision-preview`，当该模型变更或停用时，整个系统的 OCR 功能将失效。需要实现模型自动切换机制。

## 解决方案
1. **配置多模型优先级列表**：在环境变量中配置多个视觉模型，按价格排序
2. **模型失败自动切换**：当主模型调用失败时，自动尝试下一个模型
3. **模型状态缓存**：缓存失败的模型，避免重复尝试

## 修改文件

### 1. .env.example - 添加备用模型配置
```
# OCR模型配置
KIMI_VISION_MODEL=moonshot-v1-vision-preview
# 备用模型列表（逗号分隔，按价格从低到高排序）
BACKUP_VISION_MODELS=qwen-vl-plus,llava-1.5-7b,moonshot-v1-8k
```

### 2. src/lib/ocr-service.ts - 添加模型兜底逻辑
- 添加模型列表解析
- 修改 recognizeImage 方法，支持多模型重试
- 添加模型状态追踪（避免重复失败）

## 模型优先级建议（按价格从低到高）

| 模型名称 | 价格（元/千token） | 说明 |
|---------|-------------------|------|
| qwen-vl-plus | ~0.01 | 阿里云通义千问视觉模型 |
| llava-1.5-7b | ~0.02 | LLaVA 开源视觉模型 |
| moonshot-v1-8k | ~0.03 | Kimi 8K 模型 |
| moonshot-v1-vision-preview | ~0.05 | Kimi 视觉预览模型（原主模型） |

## 实现步骤

1. 修改 .env.example 添加备用模型配置
2. 修改 ocr-service.ts 添加模型切换逻辑
3. 更新版本号并同步 Docker