# 项目规则

> 多平台账单对比系统（DPTSJDB）操作规范

---

## 一、核心原则

⚠️

1. **所有修改只能在项目根目录进行，禁止在 `docker/` 或其他子目录直接修改代码**
2. **每次修改必须更新版本号，确保 4 处一致（VERSION、package.json、CHANGELOG.md、docker-compose.yml BUILD_VERSION）**
3. **每次修改项目文件后必须运行同步脚本，将变更同步到 `docker/` 目录，否则部署时不会生效**
4. **`docker/` 目录由脚本同步生成，不纳入 Git 版本控制**
5. **Git 提交后即版本封版，该版本禁止再有任何代码修改；如需修改必须递增版本号重新走完整流程**

---

## 二、版本号管理

**格式**：`主版本.次版本`，次版本 1-99，满 99 后主版本+1、次版本归 1

**递增示例**：1.1 → 1.2 → ... → 1.99 → 2.1 → ...

**4处必须一致**：

| 位置 | 格式 | 示例 |
|------|------|------|
| [VERSION](file:///d:/trea项目/多平台账单对比系统/VERSION) | 纯文本 | `1.10` |
| [package.json](file:///d:/trea项目/多平台账单对比系统/package.json) | JSON 字段 | `"version": "1.10"` |
| [CHANGELOG.md](file:///d:/trea项目/多平台账单对比系统/CHANGELOG.md) | 文件顶部追加新版本 | `## 1.10 (2026-06-13)` |
| [docker-compose.yml](file:///d:/trea项目/多平台账单对比系统/docker-compose.yml) | BUILD_VERSION + container_name | `BUILD_VERSION: v1.10`、`container_name: dptsjdb-1.10` |

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
修改代码 → 验证(ts-check/lint) → 更新版本号(4处一致) → 同步到 docker/ → Git提交推送
```

**步骤（禁止跳过任何步骤）**：

| Step | 内容 | 说明 |
|:----:|------|------|
| 1 | 在项目根目录修改代码 | 禁止在 docker/ 或其他子目录修改 |
| 2 | 验证代码 | `pnpm ts-check`、`pnpm lint` 必须通过 |
| 3 | 更新版本号（4处必须一致） | VERSION + package.json + CHANGELOG.md + docker-compose.yml |
| 4 | **运行同步脚本** | `powershell -ExecutionPolicy Bypass -File ./sync-docker.ps1`（**必须执行，否则 docker/ 不会更新，部署不生效**） |
| 5 | Git 提交推送 | `git add .` → `git commit -m "v版本号: 变更描述"` → `git push origin master` |

**封版规则（Git 提交后强制执行）**：

| 规则 | 说明 |
|------|------|
| 禁止同版本二次修改 | Git 提交后，该版本代码封版，禁止再修改任何文件 |
| 新变更必须新版本 | 提交后发现需要修改，必须递增版本号，重新走完整 5 步流程 |
| 禁止重复版本号 | CHANGELOG.md 中同一版本号只能出现一次 |
| 提交前确认完整性 | 更新版本号前，必须确认所有代码修改已完成，不再有遗漏 |

**4处版本号更新位置**：

- [VERSION](file:///d:/trea项目/多平台账单对比系统/VERSION) — 递增纯文本版本号
- [package.json](file:///d:/trea项目/多平台账单对比系统/package.json) — 同步 `"version"` 字段
- [CHANGELOG.md](file:///d:/trea项目/多平台账单对比系统/CHANGELOG.md) — 顶部追加新版本记录
- [docker-compose.yml](file:///d:/trea项目/多平台账单对比系统/docker-compose.yml) — 更新 `BUILD_VERSION: v版本号` 和 `container_name: dptsjdb-版本号`

**任务分级**：

| 级别 | 判断标准 | 操作方式 |
|------|---------|---------|
| 小任务 | 涉及文件 ≤1 | 直接做 |
| 中任务 | 涉及文件 2-5 | 先列步骤再动手 |
| 大任务 | 涉及文件 >5 | 先写计划再执行 |

---

## 四、Git 操作

**远程仓库**：`https://github.com/dashixiaong-yw/DPTSJDB`
**默认分支**：`master`

**Commit 消息格式**：`v版本号: 变更描述`
**示例**：`v1.5: 项目初始化 - 版本号管理体系`

**禁止事项**：

- ❌ 禁止提交 `.env`（含密钥
- ❌ 禁止提交 `node_modules/`
- ❌ 禁止提交 `docker/`（同步生成产物
- ❌ 禁止 force push 到 master 分支
- ❌ 禁止修改已推送的 commit 历史

---

## 五、代码规范

- 变量/函数名使用小驼峰，组件名使用 PascalCase
- 代码注释使用中文
- 单个文件不超过 500 行，函数不超过 40 行
- 所有函数必须包含类型注解，禁止使用 `any`
- 异步操作必须 try-except，禁止裸 except
- 时间格式必须使用北京时间（UTC+8）

**时间使用规范**：

| 场景 | 规范 |
|------|------|
| 获取当前时间 | 使用 `new Date()` 后转换为北京时间 |
| 时间显示给用户 | 必须使用北京时间（UTC+8），禁止使用 UTC 时间 |
| 日志输出 | 使用北京时间 |
| 文件命名 | 使用北京时间（如日志文件 `20260613.log`） |

---

## 六、Docker 部署

**同步脚本**：[sync-docker.ps1](file:///d:/trea项目/多平台账单对比系统/sync-docker.ps1)（项目根目录）

**同步机制**：增量同步（不清空 docker/）
- 目录（src/、public/）：使用 `robocopy /MIR` 镜像同步，新增/更新/删除双向一致
- 文件：MD5 哈希对比，仅更新有变更的文件
- 删除同步：根目录文件被删除时，docker/ 中对应文件自动删除
- NAS 兼容：自动从 docker-compose.yml 生成 docker-compose.yaml
- **环境配置**：自动从 `.env.example` 生成 `.env`（如果不存在；已存在则不覆盖，保护密钥）

**同步内容**：

| 类型 | 内容 |
|------|------|
| 目录 | `src/`、`public/` |
| 配置文件 | `package.json`、`pnpm-lock.yaml`、`next.config.ts`、`tsconfig.json`、`next-env.d.ts`、`postcss.config.mjs`、`.npmrc` |
| Docker 配置 | `Dockerfile`、`docker-compose.yml`、`.dockerignore` |
| 环境配置 | `.env.example` |
| 版本信息 | `VERSION`、`CHANGELOG.md` |

**版本号一致要求（Docker 两处 + 项目三处）**：

| 文件 | 内容 |
|------|------|
| [VERSION](file:///d:/trea项目/多平台账单对比系统/VERSION) | `1.10` |
| [package.json](file:///d:/trea项目/多平台账单对比系统/package.json) | `"version": "1.10"` |
| [CHANGELOG.md](file:///d:/trea项目/多平台账单对比系统/CHANGELOG.md) | `## 1.10 (YYYY-MM-DD)` |
| [docker-compose.yml](file:///d:/trea项目/多平台账单对比系统/docker-compose.yml) | `BUILD_VERSION: v1.10`、`container_name: dptsjdb-1.10` |

**部署文件说明**：

| 文件 | 用途 |
|------|------|
| `docker/docker-compose.yml` | Docker CLI（命令行部署） |
| `docker/docker-compose.yaml` | NAS GUI（绿联 NAS 等图形界面，自动生成） |

> ⚠️ `docker-compose.yml` 是源头（只改它），`docker-compose.yaml` 是自动生成的副本（禁止手改，下次同步会被覆盖）

**部署步骤**：
1. 运行同步脚本：`powershell -ExecutionPolicy Bypass -File ./sync-docker.ps1`
   - 自动从 `.env.example` 生成 `.env`（如果不存在）
   - 如果 `.env` 已存在，不会覆盖（保护已配置的密钥）
2. 进入 docker 目录：`cd docker`
3. 编辑 `.env` 文件，填入实际密钥（首次部署时）
4. 构建并启动：`docker-compose up -d --build`

**关键配置说明**：

| 配置项 | 位置 | 作用 |
|--------|------|------|
| `output: 'standalone'` | [next.config.ts](file:///d:/trea项目/多平台账单对比系统/next.config.ts) | Next.js 生成独立可部署目录 |
| BuildKit 缓存 | [Dockerfile](file:///d:/trea项目/多平台账单对比系统/Dockerfile) L17-18 | 避免冷编译 15min+，增量构建 |
| `ARG BUILD_VERSION` | [Dockerfile](file:///d:/trea项目/多平台账单对比系统/Dockerfile) L12 | 版本号变化触发重新构建 |
| `DOCKER_BUILDKIT=1` | [docker-compose.yml](file:///d:/trea项目/多平台账单对比系统/docker-compose.yml) L17 | 启用 BuildKit 缓存 |
| healthcheck | [docker-compose.yml](file:///d:/trea项目/多平台账单对比系统/docker-compose.yml) L18-23 | 容器健康检查 |

**禁止事项**：
- ❌ 禁止添加 `.babelrc` 文件（会强制降级到 Babel 编译，NAS 构建 20min+）
- ❌ 禁止 `RUN rm -rf .next && pnpm run build`（强制清空缓存，冷编译）
- ❌ 禁止 `*.md` 粗粒度忽略（会误排除 CHANGELOG.md）
- ❌ 禁止将 `.env` 提交到 Git
- ❌ 禁止 Git 提交后对已提交版本再做代码修改（必须递增版本号重新走流程）
- ❌ 禁止 CHANGELOG.md 中同一版本号出现多条记录

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
├── next.config.ts       ← Next.js 配置（output: standalone）
├── tsconfig.json        ← TypeScript 配置
├── postcss.config.mjs   ← PostCSS 配置
├── eslint.config.mjs    ← ESLint 配置
├── components.json      ← shadcn UI 配置
├── .npmrc              ← npm 配置
├── Dockerfile          ← Docker 构建（BuildKit 缓存+健康检查）
├── docker-compose.yml  ← Docker Compose（BUILD_VERSION 传参+健康检查）
├── .dockerignore       ← Docker 忽略规则（精确，不排除 *.md）
├── .env.example        ← 环境变量模板
├── .gitignore          ← Git 忽略规则
└── sync-docker.ps1     ← Docker 同步脚本
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

**版本号一致性验证命令**：
```powershell
# 验证 VERSION
Get-Content VERSION

# 验证 package.json
Select-String '"version"' package.json

# 验证 CHANGELOG（最新版本标题）
Select-String '^## ' CHANGELOG.md | Select-Object -First 1

# 验证 docker-compose.yml
Select-String 'BUILD_VERSION\|container_name' docker-compose.yml
```

**检查项**：

- [ ] VERSION 与 package.json 版本号一致
- [ ] CHANGELOG.md 顶部已追加新版本记录
- [ ] docker-compose.yml 中 BUILD_VERSION 和 container_name 与 VERSION 一致
- [ ] 所有修改均在根目录完成
- [ ] 修改已验证通过（ts-check / lint）
- [ ] **已运行同步脚本，docker/ 目录已更新（未同步则部署不生效）**
- [ ] Git commit 消息符合格式 `v版本号: 变更描述`

**流程门禁（禁止跳过）**：

| 步骤 | 内容 | 门禁说明 |
|------|------|---------|
| 1 | 修改代码 | 在项目根目录修改 |
| 2 | 验证代码 | `pnpm ts-check`、`pnpm lint` 必须通过 |
| 3 | 更新版本号 | 4 处必须同时更新 |
| 4 | **运行同步脚本** | **必须执行！未同步则 docker/ 不更新，部署不生效** |
| 5 | 验证版本号一致性 | 上方 4 处验证命令全部通过 |
| 6 | Git 提交推送 | commit 消息符合格式 |
| 7 | **版本封版** | **Git 提交后该版本封版，如需修改必须递增版本号重新走完整流程** |
