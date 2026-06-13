# 计划：清理项目无用文件、死代码和重复内容

## 一、当前状态分析

### 1. 无用文件（可删除）

| 文件 | 类型 | 原因 |
|------|------|------|
| `trae/documents/docker-端口更换-3000-to-3080.md` | 过时文档 | 旧目录结构残留，端口已改为3080，信息已在规则文档中 |
| `DOCKER_COMPOSE_YML_VS_YAML.md` | 重复文档 | 内容已被 `.trae/rules/README.md` 第六节覆盖，且引用了旧路径 `docker-deploy/` 和 `scripts/sync-to-docker-deploy.ps1` |
| `.trae/documents/` 下14个计划文件 | 过时计划 | 全部是历史会话的计划文档，已完成，无参考价值 |

**.trae/documents/ 文件清单**（全部可删除）：
1. `any类型清理计划.md`
2. `check-coze-dependencies.md`
3. `docker-deployment-config.md`
4. `first-sheet-only-plan.md`
5. `fix-version-freeze-rule.md`
6. `ocr-replacement-plan.md`
7. `performance-optimization.md`
8. `project-docs-and-versioning.md`
9. `rename-and-remove-coze-branding.md`
10. `reorganize-project-to-root.md`
11. `result-page-redesign.md`
12. `v115-regression-review.md`
13. `代码审查计划_系统bug检查.md`
14. `全面系统检查计划.md`

### 2. 未使用的 UI 组件（可删除）

项目有 60 个 UI 组件文件，实际只使用了 **8 个**：

**正在使用的组件**（保留）：
| 组件 | 使用位置 |
|------|---------|
| `button.tsx` | page.tsx, result/page.tsx |
| `card.tsx` | page.tsx, result/page.tsx |
| `badge.tsx` | page.tsx, result/page.tsx |
| `progress.tsx` | page.tsx |
| `alert.tsx` | page.tsx |
| `input.tsx` | result/page.tsx |
| `sonner.tsx` | layout.tsx |

**间接使用的组件**（保留，被 sidebar.tsx 引用，但 sidebar 本身未使用）：
- `separator.tsx` — 被 sidebar.tsx 引用
- `sheet.tsx` — 被 sidebar.tsx 引用
- `skeleton.tsx` — 被 sidebar.tsx 引用
- `tooltip.tsx` — 被 sidebar.tsx 引用

**sidebar.tsx 自身未被任何页面使用**，但它引用了上述4个组件。如果删除 sidebar，则这4个组件也可删除。

**未使用的组件**（共 48 个，可删除）：
1. `accordion.tsx`
2. `alert-dialog.tsx`
3. `aspect-ratio.tsx`
4. `avatar.tsx`
5. `breadcrumb.tsx`
6. `button-group.tsx`
7. `calendar.tsx`
8. `carousel.tsx`
9. `chart.tsx`
10. `checkbox.tsx`
11. `collapsible.tsx`
12. `command.tsx`
13. `context-menu.tsx`
14. `dialog.tsx`
15. `drawer.tsx`
16. `dropdown-menu.tsx`
17. `empty.tsx`
18. `field.tsx`
19. `form.tsx`
20. `hover-card.tsx`
21. `input-group.tsx`
22. `input-otp.tsx`
23. `item.tsx`
24. `kbd.tsx`
25. `label.tsx`
26. `menubar.tsx`
27. `navigation-menu.tsx`
28. `pagination.tsx`
29. `popover.tsx`
30. `radio-group.tsx`
31. `resizable.tsx`
32. `scroll-area.tsx`
33. `select.tsx`
34. `separator.tsx`（仅 sidebar 用，sidebar 未使用）
35. `sheet.tsx`（仅 sidebar 用，sidebar 未使用）
36. `sidebar.tsx`（未被任何页面使用）
37. `skeleton.tsx`（仅 sidebar 用，sidebar 未使用）
38. `slider.tsx`
39. `spinner.tsx`
40. `switch.tsx`
41. `table.tsx`
42. `tabs.tsx`
43. `textarea.tsx`
44. `toggle-group.tsx`
45. `toggle.tsx`
46. `tooltip.tsx`（仅 sidebar 用，sidebar 未使用）

### 3. 未使用的 hooks/模块

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/hooks/use-toast.ts` | **未使用** | 项目使用 sonner 做 toast，此文件无任何引用 |
| `src/hooks/use-mobile.ts` | **仅 sidebar 使用** | sidebar 未使用则可删除 |

### 4. 重复类型定义

| 类型 | 位置1 | 位置2 | 说明 |
|------|-------|-------|------|
| `ParseResult` | `src/lib/excel-parser.ts:25` | `src/lib/platforms/types.ts:65` | 完全相同的接口定义 |
| `ExcelSheet` | `src/lib/excel-parser.ts:7` | `src/lib/platforms/types.ts:55` | 完全相同的接口定义 |
| `ExcelImage` | `src/lib/excel-parser.ts:14` | `src/lib/platforms/types.ts:41` | 完全相同的接口定义 |

**修复方案**：删除 `excel-parser.ts` 中的重复定义，统一从 `platforms/types.ts` 导入。

### 5. 未使用的导出函数（lint 警告中的死代码）

| 函数 | 文件 | 说明 |
|------|------|------|
| `extractDispImgId` | `excel-parser.ts:109` | 定义但未使用 |
| `extractMonthFromDateRange` | `platforms/base.ts:155` | 定义但未使用（ocr-service.ts 有自己的同名私有方法） |
| `imageKey` | `comparison-engine.ts:163` | 赋值但未使用 |
| `result` | `page.tsx:416` | 赋值但未使用 |
| `useRef` | `page.tsx:3` | 导入但未使用 |
| `rowNum`, `colNum` | `download/route.ts:68-69` | 解构但未使用 |
| `PlatformHandler` | `start/route.ts:11` | 导入但未使用 |
| `ocrCacheStore` | `tasks/route.ts:2` | 导入但未使用 |
| `request` | `tasks/route.ts:9` | 参数未使用 |
| `e` | `tasks/route.ts:100` | catch 变量未使用 |
| `calculateSimilarity` | `template/route.ts:267` | 定义但未使用 |
| `compareValues`, `extractOCRValue` | `douyin.ts:25,28` | 导入但未使用 |
| `ParseResult` | `platforms/index.ts:12` | 导入但未使用 |
| `FieldDefinition` | `taobao.ts:47` | 导入但未使用 |
| `headers` | `taobao.ts:134` | 赋值但未使用 |
| `TaskRecord` | `task-processor.ts:5` | 导入但未使用 |
| `actionTypes` | `use-toast.ts:17` | 赋值但仅用作类型 |
| `path` | `next.config.ts:2` | 导入但未使用 |

### 6. robots.ts

`src/app/robots.ts` 是 Next.js 标准 SEO 文件，用于生成 `/robots.txt`，**应保留**。

## 二、修改方案

### Step 1：删除无用文件（16个文件）

删除以下文件：
- `trae/documents/docker-端口更换-3000-to-3080.md`（及 `trae/` 空目录）
- `DOCKER_COMPOSE_YML_VS_YAML.md`
- `.trae/documents/` 下全部14个计划文件（保留 `.trae/documents/` 目录本身，因为后续计划还会写入）

### Step 2：删除未使用的 UI 组件（48个文件）

删除 `src/components/ui/` 下48个未使用的组件文件，保留8个正在使用的。

### Step 3：删除未使用的 hooks（2个文件）

- `src/hooks/use-toast.ts`
- `src/hooks/use-mobile.ts`

### Step 4：修复重复类型定义

- 删除 `src/lib/excel-parser.ts` 中的 `ParseResult`、`ExcelSheet`、`ExcelImage` 接口定义
- 在 `excel-parser.ts` 中添加 `import { ParseResult, ExcelSheet, ExcelImage } from './platforms/types'`
- 检查所有从 `excel-parser` 导入这些类型的文件，改为从 `platforms/types` 导入

### Step 5：清理未使用的导出/导入（lint 警告修复）

逐文件修复 lint 警告中的未使用变量/导入：
- 删除未使用的 import 语句
- 删除未使用的函数定义
- 用 `_` 前缀标记必须保留但未使用的参数（如 catch 的 e、request 参数）

### Step 6：验证 + 版本号更新 + Docker同步 + Git提交

- `pnpm ts-check` 和 `pnpm lint` 必须通过
- 版本号 1.17 → 1.18
- 运行同步脚本
- Git 提交推送

## 三、假设与决策

| 项目 | 决策 | 理由 |
|------|------|------|
| 未使用的 shadcn/ui 组件是否删除 | 是，全部删除 | 需要时可通过 `npx shadcn@latest add xxx` 重新添加 |
| sidebar.tsx 及其依赖是否删除 | 是 | sidebar 未被任何页面使用，其依赖的4个组件也可删除 |
| .trae/documents/ 目录是否保留 | 是，保留空目录 | 后续计划文件还需要写入此目录 |
| 重复类型定义保留哪个 | 保留 `platforms/types.ts` | 这是平台模块的统一类型定义文件，更合理 |
| robots.ts 是否保留 | 是 | Next.js 标准 SEO 文件 |
| local-storage.ts 是否删除 | 否 | 被 services.ts 和 ocr-service.ts 引用，正在使用 |
| services.ts 是否删除 | 否 | 被8个 API 路由文件引用，正在使用 |

## 四、验证步骤

1. `pnpm ts-check` 通过
2. `pnpm lint` 通过（0 errors，warnings 大幅减少）
3. 4处版本号一致（1.18）
4. Docker 同步成功
5. Git 提交推送成功
