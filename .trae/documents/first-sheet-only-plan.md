# 计划：仅对比第一个Sheet页，忽略其余Sheet

## 现状分析

当前代码在**解析阶段**已经只处理第一个sheet（`workbook.worksheets[0]`），但存在以下问题：

1. **图片提取**：`parseDrawingRelations()` 遍历 ZIP 中**所有** drawing XML 文件（包括其他 sheet 的 drawing2.xml、drawing3.xml 等），可能将其他 sheet 的图片错误关联到第一个 sheet
2. **下载导出**：`download/route.ts` 使用 `workbook.eachSheet()` 遍历**所有** sheet 添加比对标记，虽然其他 sheet 没有比对结果不会被标记，但存在不必要的遍历
3. **缺乏明确日志**：拼多多和抖音解析函数没有明确记录"仅处理第一个sheet"的信息

## 回归风险分析

### 修改1：`parseDrawingRelations()` 仅处理 drawing1.xml

| 场景 | 当前行为 | 修改后行为 | 风险 |
|------|---------|-----------|------|
| 单sheet文件 | 只匹配 drawing1.xml | 不变 | 无 |
| 多sheet文件 | 匹配所有 drawing*.xml，其他sheet图片可能错误关联到第一个sheet | 只匹配 drawing1.xml，正确限制为第一个sheet | 无（修复了潜在bug） |
| drawing1.xml 不存在 | 无匹配，回退到顺序分配 | 同上 | 无 |

**结论**：低风险。修改是正确的，防止了其他sheet图片的错误关联。即使 drawing1.xml 缺失，方式3（顺序分配回退）仍然生效。

### 修改2：`download/route.ts` 仅遍历第一个sheet

| 场景 | 当前行为 | 修改后行为 | 风险 |
|------|---------|-----------|------|
| 单sheet文件 | 遍历1个sheet | 不变 | 无 |
| 多sheet文件 | 遍历所有sheet，但其他sheet无比对结果所以不标记 | 只遍历第一个sheet | 无 |
| 导出文件内容 | 所有sheet保留，仅第一个sheet有标记 | **完全相同**（workbook.writeBuffer 写出全部sheet） | 无 |

**关键点**：`workbook.xlsx.writeBuffer()` 写出整个工作簿（包含所有sheet），修改仅影响"标记遍历"范围，不影响输出文件内容。其他sheet仍然保留在下载文件中，只是没有比对标记（本来就没有）。

**结论**：无回归风险。输出文件行为完全一致。

### 修改3：添加日志

仅添加 console.log，不影响任何逻辑。**无风险**。

### 不需要修改的部分

| 代码位置 | 原因 |
|---------|------|
| `start/route.ts` 的 `buildRowImagesMap` | 使用 `parseResult.sheets.forEach`，但 parseResult 只包含第一个sheet，已正确 |
| `start/route.ts` 的 `collectRowsToProcess` | 同上 |
| `quickIdentifyPlatform` | 已使用 `workbook.worksheets[0]`，已正确 |
| `parseGenericExcel` | 已有注释和逻辑只处理第一个sheet |

## 修改方案

### 文件1：`src/lib/excel-parser.ts`

**修改1**：`parseDrawingRelations()` — 仅处理第一个 sheet 的 drawing 文件

- 当前（L380-382）：`f.includes('drawing') && f.endsWith('.xml') && !f.includes('_rels')` 匹配所有 drawing 文件
- 改为：仅匹配 `xl/drawings/drawing1.xml`（第一个 sheet 的 drawing）
- 同步修改 rels 文件过滤（L414-416），仅匹配 `xl/drawings/_rels/drawing1.xml.rels`
- 原因：避免其他 sheet 的图片被错误关联到第一个 sheet 的数据行

**修改2**：`parsePDDExcel()` 和 `parseDouyinExcel()` — 添加日志

- 在 `workbook.worksheets[0]` 获取后添加日志：
  ```
  仅处理第一个sheet: ${worksheet.name}，忽略其余 ${workbook.worksheets.length - 1} 个sheet
  ```

### 文件2：`src/app/api/task/[taskId]/download/route.ts`

**修改**：L52 `workbook.eachSheet()` → 仅处理第一个 sheet

- 当前：遍历所有 sheet 添加比对标记
- 改为：`const worksheet = workbook.worksheets[0];` 只处理第一个 sheet
- 原因：比对只针对第一个 sheet，其他 sheet 无需遍历（且遍历也不会产生任何标记）

## 验证步骤

1. `pnpm ts-check` 通过
2. `pnpm lint` 通过
3. 更新版本号（4处一致）
4. 运行同步脚本
