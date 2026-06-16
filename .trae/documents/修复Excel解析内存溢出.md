# 修复 Excel 解析内存溢出（OOM）

## 摘要

37.56 MB 的 Excel 文件解析时触发 `JavaScript heap out of memory`，Node.js 默认堆内存约 1.7GB 不够用。

## 根因分析

当前 [excel-parser.ts](file:///d:/trea项目/多平台账单对比系统/src/lib/excel-parser.ts) 的解析流程：

1. `quickIdentifyPlatform()` — `ExcelJS.Workbook.xlsx.load(fileBuffer)` 加载整个工作簿到内存
2. `parseDouyinExcel()` / `parsePDDExcel()` — 再次 `ExcelJS.Workbook.xlsx.load(fileBuffer)` 加载整个工作簿
3. `extractEmbeddedImagesFromXlsx()` — `JSZip.loadAsync(fileBuffer)` 解压整个 ZIP 到内存
4. 嵌入图片以 `Buffer` 形式保存在 `imageDataMap` 中

**内存峰值**：ExcelJS 工作簿 + JSZip 解压数据 + 图片 Buffer 数组 = 远超 1.7GB

## GitHub 优秀方案调研

### 方案1：ExcelJS 流式读取（`stream.xlsx.WorkbookReader`）

```javascript
const workbook = new ExcelJS.stream.xlsx.WorkbookReader(
  fs.createReadStream(file_path),
  { shareStrings: 'cache' }
);
for await (const worksheet of workbook) {
  for await (const row of worksheet) { /* 逐行处理 */ }
}
```

**优点**：内存占用极低，177MB 文件也能稳定运行
**缺点**：**无法提取嵌入图片**，流式读取只处理行数据

### 方案2：增大 Node.js 堆内存

```dockerfile
ENV NODE_OPTIONS="--max-old-space-size=4096"
```

**优点**：零代码改动，立即生效
**缺点**：治标不治本，更大的文件仍可能 OOM

### 方案3：分步解析 + 及时释放内存

**优点**：内存峰值减半
**缺点**：抖音解析中 `workbook.getImage()` 需要 workbook 存活，不能提前释放

## 风险评估

### 方案2（增大堆内存）的风险

| 风险项 | 评估 | 说明 |
|--------|------|------|
| 影响其他功能 | **无** | 仅增大内存上限，不改变任何业务逻辑 |
| 回归 Bug | **无** | 不修改任何代码逻辑 |
| 系统异常 | **极低** | 4GB 堆内存是 Node.js 常见配置，Docker 容器默认无内存限制 |
| NAS 兼容性 | **需确认** | NAS Docker 默认无内存限制，4GB 堆内存不影响 |

### 方案3（代码优化）的风险

| 风险项 | 评估 | 说明 |
|--------|------|------|
| 抖音解析 | **高风险** | `workbook.getImage()` 需要 workbook 存活，提前释放会导致图片提取失败 |
| 拼多多解析 | **低风险** | 拼多多用 JSZip 提取图片，可以先释放 workbook |
| `quickIdentifyPlatform` | **低风险** | 仅读取表头，释放 workbook 不影响后续流程 |
| 回归 Bug | **中风险** | 修改解析流程可能引入新的时序问题 |

## 推荐方案：仅方案2（增大堆内存）

**理由**：
1. **零风险**：不修改任何业务代码，不会造成回归 Bug
2. **立即生效**：37.56 MB 的 Excel 文件在 4GB 堆内存下完全够用
3. **NAS 兼容**：Docker 容器默认无内存限制，4GB 堆内存不影响其他容器
4. 方案3 对抖音解析有高风险，且收益有限（只减少 ~0.5GB 峰值）

## 修改方案

### 修改文件1：`Dockerfile`

在运行阶段添加 `NODE_OPTIONS` 环境变量：

```dockerfile
ENV NODE_OPTIONS="--max-old-space-size=4096"
```

**影响范围**：仅 Docker 运行环境，不影响开发环境

### 修改文件2：`package.json`

在 `dev` 脚本中增加内存配置，确保开发环境也不会 OOM：

```json
"dev": "node --max-old-space-size=4096 ./node_modules/.bin/next dev --turbopack -p 3080"
```

**影响范围**：仅开发环境启动命令，不影响生产构建

### 不修改的文件

- **`src/lib/excel-parser.ts`** — 不修改任何解析逻辑，避免回归风险

## 验证步骤

1. `pnpm ts-check` — 确认无类型错误
2. `pnpm lint` — 确认无代码规范问题
3. 重新上传 37.56 MB 的 Excel 文件测试
4. 版本更新：按 5 步流程更新版本号并同步
