# 计划：修改网站名称 & 去除Coze水印

## 摘要
将网站名称改为"多平台账单对比系统"，去除所有Coze/扣子编程的水印和品牌信息（仅限用户可见部分，不动运行时依赖和配置）。

## 当前状态分析

### 需要修改的文件

| 文件 | 修改内容 |
|------|---------|
| `src/app/layout.tsx` | metadata 中的标题、描述、关键词、作者、generator、openGraph 全部含扣子编程水印 |
| `src/app/page.tsx` | 页面 h1 标题为"多平台数据智能比对系统"，需改为"多平台账单对比系统" |
| `next.config.ts` | `allowedDevOrigins` 含 `*.dev.coze.site`，`images.remotePatterns` 含 coze CDN |

### 不修改的文件（运行时依赖/环境变量，修改会破坏功能）

- `src/lib/ocr-service.ts` — `coze-coding-dev-sdk` 是 LLM 调用依赖
- `src/lib/services.ts` — `COZE_BUCKET_*` 环境变量是 S3 存储配置
- `src/storage/database/supabase-client.ts` — `COZE_SUPABASE_*` 环境变量是数据库配置
- `scripts/*.sh` — `COZE_WORKSPACE_PATH` 是部署脚本运行时变量
- `.coze` — Coze 平台部署配置文件，删除会影响部署
- `package.json` — `coze-coding-dev-sdk` 是运行时依赖
- `README.md` / `DEVELOPMENT_GUIDE.md` — 文档文件，按规则不主动修改

## 具体修改

### 1. `src/app/layout.tsx` — 替换所有 metadata

```typescript
// 修改前
title: { default: '新应用 | 扣子编程', template: '%s | 扣子编程' }
description: '扣子编程是一款...'
keywords: ['扣子编程', 'Coze Code', ...]
authors: [{ name: 'Coze Code Team', url: 'https://code.coze.cn' }]
generator: 'Coze Code'
openGraph: { title: '扣子编程 | ...', siteName: '扣子编程', url: 'https://code.coze.cn', ... }

// 修改后
title: { default: '多平台账单对比系统', template: '%s | 多平台账单对比系统' }
description: '支持抖音、拼多多、淘宝平台的Excel账单自动化比对系统'
keywords: ['账单对比', '多平台', '抖音', '拼多多', '淘宝', 'OCR', '数据比对']
authors: [{ name: '多平台账单对比系统' }]
generator: ''
openGraph: { title: '多平台账单对比系统', siteName: '多平台账单对比系统', url: '', ... }
```

同时将 `<html lang="en">` 改为 `<html lang="zh-CN">`。

### 2. `src/app/page.tsx` — 修改页面标题

```typescript
// 修改前 (L521)
<h1>多平台数据智能比对系统</h1>

// 修改后
<h1>多平台账单对比系统</h1>
```

### 3. `next.config.ts` — 去除 Coze 相关配置

```typescript
// 修改前
allowedDevOrigins: ['*.dev.coze.site'],
images: { remotePatterns: [{ protocol: 'https', hostname: 'lf-coze-web-cdn.coze.cn', pathname: '/**' }] }

// 修改后
allowedDevOrigins: [],
images: { remotePatterns: [] }
```

## 假设与决策

1. **只改用户可见的品牌信息**，不动运行时依赖（coze-coding-dev-sdk、COZE_* 环境变量、.coze 配置文件、部署脚本），避免破坏功能
2. **html lang 属性**顺便从 `en` 改为 `zh-CN`，因为这是中文站点
3. **openGraph url** 设为空字符串，因为没有自定义域名信息

## 验证步骤

1. 检查 `layout.tsx` 中不再包含"扣子编程"、"Coze Code"等字样
2. 检查 `page.tsx` 页面标题为"多平台账单对比系统"
3. 检查 `next.config.ts` 中不含 coze 相关域名
4. 浏览器标签页标题应显示"多平台账单对比系统"
5. 页面 h1 标题应显示"多平台账单对比系统"
