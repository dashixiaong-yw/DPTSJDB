# 项目开发规范

## ⛔ 强制流程门禁（任何 AI 必须遵守）

> **换 AI 后最常被跳过的步骤**：知识图谱查询（改前）、字段一致性验证（改中）、知识图谱更新（改后）。
> 以下每步都有 **🚫 禁止跳过** 标记，未完成禁止进入下一步。

```
┌─────────────────────────────────────────────────────────────────┐
│                    强制执行流程（不可跳过任何步骤）                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🚫 Step 0: 查知识图谱 ──→ 未查禁止改代码                         │
│       ↓                                                         │
│  🚫 Step 0.5: 方案审查门禁 ──→ 首次方案出具后强制二次验证，未通过禁止改代码 │
│       ↓                                                         │
│  Step 1: 修改代码                                                │
│       ↓                                                         │
│  🚫 Step 1.5: 验证字段一致性 ──→ 涉及字段变更时强制，未验证禁止继续  │
│       ↓                                                         │
│  Step 2: 更新版本号（version.ts + changelog.ts + docker-compose.yml）│
│       ↓                                                         │
│  Step 3: 同步 docker-deploy（sync-to-docker-deploy.ps1 -Force）  │
│       ↓                                                         │
│  🚫 Step 3.5: 验证 BUILD_VERSION ──→ 版本号不一致禁止 git commit  │
│       ↓                                                         │
│  🚫 Step 4: 更新知识图谱 MCP ──→ 未更新禁止 git commit           │
│       ↓                                                         │
│  Step 5: Git 提交推送                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step 0: 查询知识图谱 MCP 🚫 禁止跳过

**为什么必须做**：不了解当前版本号和模块依赖，改代码可能破坏已有功能。

**执行方式**（按优先级）：
1. **首选**：`mcp_fund-memory_search_nodes` 搜索相关模块
2. **备选**：直接读取 `.trae/memory/knowledge_graph.jsonl`

**必查内容**：
- ☐ 当前版本号（确认从哪个版本开始修改）
- ☐ 即将修改的模块是否有已知坑点（搜索 `"entityType":"decision"` 中的教训）
- ☐ 影响的 API 路由/组件/库是否已有历史决策记录
- ☐ 评估影响范围（确定需要更新哪些 entity）

**门禁**：未执行本步骤禁止修改任何代码文件。

---

## Step 0.5: 方案审查门禁 🚫 首次方案出具后强制二次验证

**为什么必须做**：AI 首次出具的方案常存在以下问题：
- 只修复表面症状，未找到真正的根本原因（如本次非交易日问题有双重根因）
- 修复方案可能引入回归 bug，破坏其他模块的正常功能
- 修复涉及的字段与现有四层链路不匹配

**触发时机**：首次出具修复/变更方案后，**必须**按以下4个维度逐条验证，全部通过后才可进入 Step 1。

### 维度1：根因验证（Root Cause Validation）

- ☐ **症状 ≠ 根因**：用户描述的现象是症状，必须追问"为什么会出现这个症状"，至少追问2层
- ☐ **多重根因排查**：同一症状可能由多个独立根因共同导致，必须检查是否存在2个以上的独立根因
- ☐ **时序还原**：按时间线还原问题发生的过程，确认根因在时序上能完整解释症状
- ☐ **反证法**：假设修复了找到的根因，问题是否必然不再出现？如果不确定，说明根因未找全

### 维度2：回归风险评估（Regression Risk Assessment）

- ☐ **影响范围清单**：列出本次修改涉及的所有文件和函数
- ☐ **调用方排查**：搜索所有调用被修改函数的代码，确认修改不会破坏现有调用方
- ☐ **条件分支覆盖**：修改涉及 if/switch 条件时，列出所有分支路径，确认每个路径的行为符合预期
- ☐ **边界条件**：修改涉及数值/日期/状态判断时，列出边界值（如0、null、周末、节假日、首尾情况），确认不会产生意外行为

### 维度3：字段一致性预检（Field Consistency Pre-check）

- ☐ **字段变更清单**：本次修改是否新增、删除、重命名了任何数据库列/API字段/前端类型字段？
  - 如果**是** → 必须执行 Step 1.5 的四层链路验证
  - 如果**否** → 仅修改逻辑/条件/计算，不涉及字段变更，跳过 Step 1.5
- ☐ **隐式字段依赖**：即使不直接修改字段，修改逻辑是否改变了某些字段的写入时机或写入值？如果是，确认下游消费方不受影响

### 维度4：方案完整性自检（Solution Completeness Self-check）

- ☐ **修复后验证步骤**：方案是否包含具体的验证步骤（不只是"验证功能正常"，而是"检查X表的Y字段值为Z"）
- ☐ **部分失败处理**：如果修复涉及批量操作，是否考虑了部分失败的情况（如5只基金更新成功、其余失败）
- ☐ **幂等性**：修复操作是否可以安全重复执行？重复执行是否会产生重复数据或错误？

**门禁**：4个维度的所有 ☐ 项全部通过后，方可进入 Step 1。如有任何项未通过，必须修正方案后重新审查。

---

## Step 1: 修改代码

- 在主项目目录（`d:\trea项目\在线基金管理\`）编辑源文件
- ❌ 禁止在 `docker-deploy` 目录修改代码

---

## Step 1.5: 验证字段一致性 🚫 涉及字段变更时强制

**触发条件**：任何涉及数据库列、Drizzle Schema、API 返回字段、前端类型的变更。

**四层链路**：
```
数据库列名 (snake_case) → Drizzle Schema (camelCase映射) → API Response (camelCase) → 前端类型 (camelCase)
```

**必查清单**：
- ☐ 列出本次变更涉及的所有字段名变化
- ☐ 从数据库列名出发，逐层追踪到 Drizzle Schema → API Response → 前端
- ☐ Drizzle Schema 列名映射与数据库列名一致
- ☐ API Route 返回的 JSON key 与 Drizzle Schema 属性名一致
- ☐ 前端消费代码的类型定义与 API key 一致

**验证命令**：
```powershell
& "C:\Program Files\nodejs\node.exe" scripts\validate-schema-consistency.mjs
```

**门禁**：涉及字段变更时，未逐层验证禁止继续。

---

## Step 2: 更新版本号

**三个文件必须同时更新**：

| 文件 | 修改内容 |
|------|---------|
| `src/lib/version.ts` | `APP_VERSION` 递增 + `BUILD_DATE` 更新 |
| `src/lib/changelog.ts` | 在 `changelog` 数组开头追加一条更新记录 |
| `docker-compose.yml` | 两处 `BUILD_VERSION` 更新（online-fund-management + fund-refresh-cron） |

**版本号规则**：三段式 `主.次.修订`，每段最大 99，超过进位。修订号用于 bug 修复，次版本号用于新功能。

---

## Step 3: 同步到 docker-deploy

```powershell
.\scripts\sync-to-docker-deploy.ps1 -Force
```

---

## Step 3.5: 验证 BUILD_VERSION 🚫 禁止跳过

```powershell
Select-String "BUILD_VERSION" docker-deploy/docker-compose.yml
Select-String "BUILD_VERSION" docker-deploy/docker-compose.yaml
```

**门禁**：两个文件都必须是最新版本号（与 `version.ts` 一致），否则禁止 git commit。

---

## Step 4: 更新知识图谱 MCP 🚫 禁止跳过

**为什么必须做**：v1.4.58-1.4.60 的知识图谱就是因为 AI 跳过了这步，导致后续 AI 无法准确评估影响范围。

**必须更新的三项内容**（缺一不可）：

| 序号 | 更新内容 | MCP 工具 |
|:----:|---------|---------|
| ① | 项目实体 `"在线基金管理"` 的 observations：追加 `当前版本: vX.Y.Z` + `vX.Y.Z: [摘要]` | `mcp_fund-memory_add_observations` |
| ② | 决策实体：命名 `"[描述] - vX.Y.Z"`，含修改原因/内容/影响/教训 | `mcp_fund-memory_create_entities` |
| ③ | 关联关系：`from:"决策实体名", to:"在线基金管理", relationType:"relates_to"` | `mcp_fund-memory_create_relations` |

**更新后验证**（强制）：
```powershell
# 1. 版本号检查（最新一条应为当前版本）
Select-String "当前版本: v" .trae/memory/knowledge_graph.jsonl | Select-Object -Last 1

# 2. JSONL 格式完整性检查（0 行解析错误）
& "C:\Program Files\nodejs\node.exe" -e "const fs=require('fs');const c=fs.readFileSync('.trae/memory/knowledge_graph.jsonl','utf8');const l=c.split('\n').filter(Boolean);let e=0;l.forEach((x,i)=>{try{JSON.parse(x)}catch(err){e++;console.log('Line '+(i+1)+' ERROR:',err.message.substring(0,80))}});if(e===0)console.log('All '+l.length+' lines valid JSONL');else console.log(e+' error(s) found!');"
```

**门禁**：
- ☐ 版本号已更新为最新
- ☐ JSONL 格式完整性检查通过（0 行解析错误）
- ☐ **未更新知识图谱或格式有误，禁止 git commit**

---

## Step 5: Git 提交推送

```powershell
git add src/lib/version.ts src/lib/changelog.ts docker-compose.yml .trae/memory/knowledge_graph.jsonl [其他修改的文件] docker-deploy/
git commit -m "[描述] - v[版本号]"
git push
```

⚠️ PowerShell 中禁止使用 `&&` 语法和 heredoc（`<<'EOF'`），用 `;` 分隔命令。

---

## Supabase 数据库 MCP 使用规范

- ✅ **必须使用**本项目专用的 `fund-supabase` MCP（`project_ref=fgxcvyrixluxdlfnciva`）
- ✅ DDL 操作（建表、加列、加约束等）必须通过 `mcp_fund-supabase_apply_migration` 执行
- ❌ **禁止**其他项目的 Supabase MCP 操作本项目数据库
- ❌ **禁止**使用独立脚本直接访问 Supabase REST API 进行数据库管理
- ⚠️ 运行时 CRUD 操作（API 路由中）仍使用 `@/storage/database/supabase-client.ts`

---

## Docker 构建注意事项

- ❌ **禁止**在 Dockerfile 中 `rm -rf .next`（强制清缓存导致冷编译 15min+）
- ✅ 使用 `RUN --mount=type=cache,target=/app/.next/cache pnpm run build`
- ❌ **禁止** .babelrc 文件（强制降级为 Babel，NAS 上构建 20min+）
- ✅ docker-compose.yml 中需设置 `DOCKER_BUILDKIT=1`

---

## 统一规范

- ✅ **必须**每次修改都 git add / commit / push
- ❌ **不要**使用 `docker-compose.yaml`（由同步脚本自动从 `.yml` 生成）
- ✅ 版本号只在 `src/lib/version.ts` 中维护
- ✅ `docker-deploy` 目录就是完整可部署包

---

## 时间使用规范

- ✅ **必须**使用 `@/lib/date-utils` 中的 `getBeijingTime()` 获取当前时间
- ❌ **禁止**直接使用 `new Date()` 进行时间判断
- ❌ **禁止**手动时区转换（如 `getUTCHours() + 8`）

| 函数名 | 用途 | 示例 |
|--------|------|------|
| `getBeijingTime(date?)` | 获取北京时间 Date 对象 | `const now = getBeijingTime()` |
| `getBeijingDateString()` | 获取日期字符串 | `2024-01-15` |
| `getBeijingToday()` | 获取今天日期字符串 | `2024-01-15` |

---

## 版本号编码规则

- 三段式：`主.次.修订`（如 `1.2.3`）
- 每段最大 99，超过进位（`1.0.99` → `1.1.1`）
- 修订号：bug 修复 | 次版本号：新功能 | 主版本号：重大架构变更

---

## ⚠️ 端到端字段一致性规范

**历史教训**：`fund_holdings.is_holding` 列在 DB 已存在但 Drizzle Schema 未定义，运行时静默返回 `undefined`。`data_date` 列已重命名为 `date` 但代码仍引用旧列名。

**检查清单**（每次字段变更时使用）：
- ☐ 列出本次变更涉及的所有字段
- ☐ 从数据库列名 → Drizzle Schema → API Route → 前端类型，逐层验证
- ☐ Drizzle Schema 列名映射与数据库列名一致
- ☐ API Route 返回的 JSON key 与 Drizzle Schema 属性名一致
- ☐ 前端消费代码的类型定义与 API key 一致

---

## ⚠️ 表格样式一致性规范

**历史教训**：v1.4.91-1.4.92 表格对齐方式混用（CSS text-center + flex justify-center + inline style），导致每次优化表格都出现对齐不一致。

**核心原则：单层对齐，禁止双重对齐**

- ✅ 对齐**只在** `<td>` / `<th>` 的 `className` 层设置
- ❌ **禁止**在单元格内部再用 `flex justify-center` / `flex items-center` 做二次对齐
- ❌ **禁止**使用 `style={{ textAlign }}`
- ❌ **禁止** `text-center` 与 `flex justify-center` 同时出现

**对齐方式与列类型绑定**：

| 列类型 | 对齐方式 | 示例 |
|--------|---------|------|
| 文本列 | `text-left` | 基金名称、备注 |
| 数值列 | `text-right` | 收益率、净值、金额 |
| 操作列/标签列 | `text-center` | 操作按钮、类型标签 |

**单元格内容结构**：
- 单值：直接输出，由 `<td>` 的 `text-*` 控制对齐
- 多元素同行：用 `<span className="inline-flex items-center gap-1">`，不用 block flex
- 多行内容：用 `flex-col items-center`，但此时 `<td>` **不设** `text-center`

**详细规则见 Skill**：`.trae/skills/table-styling/SKILL.md`
