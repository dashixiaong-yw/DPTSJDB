# 项目规则

> 多平台账单对比系统（DPTSJDB）操作规范

---

## 一、核心原则

⚠️

1. **所有修改只能在项目根目录进行，禁止在 `docker/` 或其他子目录直接修改代码
2. **每次修改必须更新版本号，遵循 `VERSION`、`package.json`、`CHANGELOG.md` 三处一致
3. **`docker/` 目录由脚本同步生成，不纳入 Git 版本控制

---

## 二、版本号管理

**格式**：`主版本.次版本`，次版本 1-99，满 99 后主版本+1、次版本归 1

**递增示例**：1.1 → 1.2 → ... → 1.99 → 2.1 → ...

**三处必须一致**：

| 位置 | 格式 | 示例 |
|------|------|
| [VERSION](file:///d:/trea项目/多平台账单对比系统/VERSION) | 纯文本 | `1.3` |
| [package.json](file:///d:/trea项目/多平台账单对比系统/package.json) | JSON 字段 | `"version": "1.3"` |
| [CHANGELOG.md](file:///d:/trea项目/多平台账单对比系统/CHANGELOG.md) | 在文件顶部追加新版本 | `## 1.3 (2026-06-13)` |

**CHANGELOG 格式**：

```markdown
## 版本号 (YYYY-MM-DD)

### 新增
- 新增内容

### 修改
- 修改内容

### 修复
- 修复内容
```

---

## 三、开发修改流程

```
修改代码 → 验证(ts-check/lint) → 更新版本号 → 同步到 docker/ → Git提交推送
```

**步骤**：

1. 在项目根目录（`d:\trea项目\多平台账单对比系统`）修改代码
2. 验证：`pnpm ts-check`、`pnpm lint`、`pnpm dev`
3. 更新版本号：递增 [VERSION](file:///d:/trea项目/多平台账单对比系统/VERSION)、[package.json](file:///d:/trea项目/多平台账单对比系统/package.json)、[CHANGELOG.md](file:///d:/trea项目/多平台账单对比系统/CHANGELOG.md)
4. 如需部署，运行同步脚本 `powershell -ExecutionPolicy Bypass -File ./sync-docker.ps1`
5. Git 提交：`git commit -m "v版本号: 变更描述"`、`git push origin main`

**任务分级**：

| 级别 | 判断标准 | 操作方式 |
|------|---------|---------|
| 小任务 | 涉及文件 ≤1 | 直接做 |
| 中任务 | 涉及文件 2-5 | 先列步骤再动手 |
| 大任务 | 涉及文件 >5 | 先写计划再执行 |

---

## 四、Git 操作

**远程仓库**：`https://github.com/dashixiaong-yw/DPTSJDB`
**默认分支**：`main`

**Commit 消息格式**：`v版本号: 变更描述`
**示例**：`v1.3: 创建规则文档体系`

**禁止事项**：

- ❌ 禁止提交 `.env`（含密钥
- ❌ 禁止提交 `node_modules/`
- ❌ 禁止提交 `docker/`（同步生成产物
- ❌ 禁止 force push 到 main 分支
- ❌ 禁止修改已推送的 commit 历史

---

## 五、代码规范

- 变量/函数名使用小驼峰，组件名使用 PascalCase
- 代码注释使用中文
- 单个文件不超过 500 行，函数不超过 40 行
- 所有函数必须包含类型注解，禁止使用 `any`
- 异步操作必须 try-except，禁止裸 except
- 时间格式必须使用北京时间（UTC+8）

---

## 六、Docker 部署

**同步脚本**：[sync-docker.ps1](file:///d:/trea项目/多平台账单对比系统/sync-docker.ps1)（项目根目录）

**同步内容**：

| 类型 | 内容 |
|------|------|
| 目录 | `src/`、`public/` |
| 配置文件 | `package.json`、`pnpm-lock.yaml`、`next.config.ts`、`tsconfig.json`、`next-env.d.ts`、`postcss.config.mjs`、`eslint.config.mjs`、`components.json`、`.babelrc`、`.npmrc` |
| Docker 配置 | `Dockerfile`、`docker-compose.yml`、`.dockerignore` |
| 环境配置 | `.env.example` |
| 版本信息 | `VERSION`、`CHANGELOG.md` |

**部署步骤**：
1. 运行同步脚本：`powershell -ExecutionPolicy Bypass -File ./sync-docker.ps1`
2. 进入 docker 目录：`cd docker`
3. 从 `.env.example` 创建 `.env` 并填入实际密钥
4. 构建并启动：`docker-compose up -d --build`

---

## 七、项目结构速览

```
多平台账单对比系统/
├── .trae/rules/README.md   ← 本文件（唯一规则入口）
├── src/                   ← 源代码
│   ├── app/             ← Next.js App Router
│   ├── lib/             ← 核心业务逻辑
│   └── components/     ← UI 组件
├── public/              ← 静态资源
├── docker/              ← 同步脚本生成（Git忽略）
├── CHANGELOG.md         ← 变更日志
├── VERSION             ← 版本号
├── package.json         ← 项目配置
├── pnpm-lock.yaml       ← 依赖锁定
├── next.config.ts       ← Next.js 配置
├── tsconfig.json        ← TypeScript 配置
├── postcss.config.mjs   ← PostCSS 配置
├── eslint.config.mjs    ← ESLint 配置
├── components.json      ← shadcn UI 配置
├── .babelrc            ← Babel 配置
├── .npmrc              ← npm 配置
├── Dockerfile          ← Docker 构建配置
├── docker-compose.yml  ← Docker Compose 编排
├── .dockerignore       ← Docker 忽略规则
├── .env.example        ← 环境变量模板
├── .gitignore          ← Git 忽略规则
└── sync-docker.ps1     ← Docker 同步脚本（新增）
```

**核心模块**：

| 模块 | 文件 |
|------|------|
| 数据比对 | [src/lib/comparison-engine.ts](file:///d:/trea项目/多平台账单对比系统/src/lib/comparison-engine.ts) |
| Excel 解析 | [src/lib/excel-parser.ts](file:///d:/trea项目/多平台账单对比系统/src/lib/excel-parser.ts) |
| OCR 识别 | [src/lib/ocr-service.ts](file:///d:/trea项目/多平台账单对比系统/src/lib/ocr-service.ts) |
| 任务管理 | [src/lib/task-processor.ts](file:///d:/trea项目/多平台账单对比系统/src/lib/task-processor.ts) |
| 平台解析 | [src/lib/platforms/](file:///d:/trea项目/多平台账单对比系统/src/lib/platforms/) |

---

## 八、开发命令

| 命令 | 说明 |
|------|------|
| `pnpm install` | 安装依赖 |
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 生产构建 |
| `pnpm lint` | 代码检查 |
| `pnpm ts-check` | TypeScript 类型检查 |

---

## 九、验证清单（每次修改后检查）

- [ ] VERSION 与 package.json 版本号一致
- [ ] CHANGELOG.md 顶部已追加新版本记录
- [ ] 所有修改均在根目录完成
- [ ] 修改已验证通过（ts-check / lint）
- [ ] 如需部署，已运行同步脚本生成 docker/
- [ ] Git commit 消息符合格式
