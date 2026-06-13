# 计划：仅对比第一个Sheet页，忽略其余Sheet

## 现状分析

当前代码在**解析阶段**已经只处理第一个sheet（`workbook.worksheets[0]`），但存在以下问题：

1. **图片提取**：`parseDrawingRelations()` 遍历 ZIP 中**所有** drawing XML 文件（包括其他 sheet 的 drawing2.xml、drawing3.xml 等），可能将其他 sheet 的图片错误关联到第一个 sheet
2. **下载导出**：`download/route.ts` 使用 `workbook.eachSheet()` 遍历**所有** sheet 添加比对标记，虽然其他 sheet 没有比对结果不会被标记，但存在不必要的遍历
3. **缺乏明确日志**：拼多多和抖音解析函数没有明确记录"仅处理第一个sheet"的信息

## 修改方案

### 文件1：`src/lib/excel-parser.ts`

**修改1**：`parseDrawingRelations()` — 仅处理第一个 sheet 的 drawing 文件

- 当前：`f.includes('drawing') && f.endsWith('.xml')` 匹配所有 drawing 文件
- 改为：仅匹配 `xl/drawings/drawing1.xml`（第一个 sheet 的 drawing）
- 原因：避免其他 sheet 的图片被错误关联到第一个 sheet 的数据行

**修改2**：`parsePDDExcel()` 和 `parseDouyinExcel()` — 添加日志

- 在 `workbook.worksheets[0]` 获取后添加日志：`仅处理第一个sheet: ${worksheet.name}，忽略其余 ${workbook.worksheets.length - 1} 个sheet`

### 文件2：`src/app/api/task/[taskId]/download/route.ts`

**修改**：`workbook.eachSheet()` → 仅处理第一个 sheet

- 当前：遍历所有 sheet 添加比对标记
- 改为：只获取第一个 worksheet 添加标记
- 原因：比对只针对第一个 sheet，其他 sheet 无需遍历

## 验证步骤

1. `pnpm ts-check` 通过
2. `pnpm lint` 通过
3. 更新版本号（4处一致）
4. 运行同步脚本
