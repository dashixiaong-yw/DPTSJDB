# 计划：整理项目文件并复制到根目录

## 摘要
将项目从 `project_20260613_172956/projects/` 子目录提取到根目录 `d:\trea项目\多平台账单对比系统\`，剔除不需要的文件，确保复制后的源代码可正常运行。

## 当前状态分析

当前项目结构：
```
d:\trea项目\多平台账单对比系统\
├── .trae/                          # Trae IDE 配置，保留
└── project_20260613_172956/
    └── projects/                    # 实际源代码在此
        ├── assets/                  # 测试图片和Excel样本（不需要）
        ├── public/                  # 静态资源（需要，但可精简）
        ├── scripts/                 # 构建脚本（需要，但部分可剔除）
        ├── src/                     # 源代码（需要）
        ├── .babelrc                 # Babel 配置（需要）
        ├── .coze                    # Coze 部署配置（需要，运行时依赖）
        ├── .gitignore               # Git 忽略配置（需要）
        ├── .npmrc                   # NPM 配置（需要）
        ├── DEVELOPMENT_GUIDE.md     # 开发文档（不需要）
        ├── README.md                # 说明文档（不需要）
        ├── analyze.js               # 测试脚本（不需要，未被引用）
        ├── analyze_pdd.js           # 测试脚本（不需要，未被引用）
        ├── analyze_template.js      # 测试脚本（不需要，未被引用）
        ├── components.json          # shadcn 配置（需要）
        ├── eslint.config.mjs        # ESLint 配置（需要）
        ├── next-env.d.ts            # Next.js 类型声明（需要）
        ├── next.config.ts           # Next.js 配置（需要）
        ├── package.json             # 包配置（需要）
        ├── pnpm-lock.yaml           # 锁文件（需要）
        ├── postcss.config.mjs       # PostCSS 配置（需要）
        └── tsconfig.json            # TypeScript 配置（需要）
```

## 需要剔除的文件

| 文件/目录 | 原因 |
|-----------|------|
| `assets/` 整个目录 | 测试图片和Excel样本，共30+个文件，不是运行时依赖 |
| `public/vercel.svg` | Vercel 品牌图标，与项目无关 |
| `public/file.svg`, `globe.svg`, `next.svg`, `window.svg` | Next.js 默认模板图标，项目未使用 |
| `analyze.js`, `analyze_pdd.js`, `analyze_template.js` | 测试脚本，未被任何源代码引用 |
| `scripts/check_results.ts`, `parse_template.ts`, `test_taobao.ts` | 测试脚本，未被任何源代码引用 |
| `DEVELOPMENT_GUIDE.md` | 开发文档，非运行必需 |
| `README.md` | 说明文档，非运行必需 |
| `project_20260613_172956.tar.gz` | 原始压缩包（如果存在） |

## 需要保留的文件（复制到根目录）

### 配置文件
- `.babelrc` — Babel 配置
- `.coze` — Coze 部署配置（运行时依赖，不可删除）
- `.gitignore` — Git 忽略规则
- `.npmrc` — NPM 镜像和依赖配置
- `components.json` — shadcn/ui 组件配置
- `eslint.config.mjs` — ESLint 配置
- `next-env.d.ts` — Next.js TypeScript 声明
- `next.config.ts` — Next.js 框架配置
- `package.json` — 项目依赖和脚本
- `pnpm-lock.yaml` — 依赖锁文件
- `postcss.config.mjs` — PostCSS 配置
- `tsconfig.json` — TypeScript 编译配置

### 源代码
- `src/` 整个目录（app、components、hooks、lib、storage）

### 脚本
- `scripts/build.sh` — 构建脚本
- `scripts/dev.sh` — 开发启动脚本
- `scripts/prepare.sh` — 依赖安装脚本
- `scripts/start.sh` — 生产启动脚本

### 静态资源
- `public/favicon.ico` — 网站图标（从 src/app/favicon.ico 复制而来，保留 public 目录结构）

## 执行步骤

### 步骤1：复制必需文件到根目录
将 `project_20260613_172956/projects/` 下的必需文件复制到 `d:\trea项目\多平台账单对比系统\`，保持目录结构：

```
d:\trea项目\多平台账单对比系统\
├── .trae/                          # 保留（已存在）
├── .babelrc
├── .coze
├── .gitignore
├── .npmrc
├── components.json
├── eslint.config.mjs
├── next-env.d.ts
├── next.config.ts
├── package.json
├── pnpm-lock.yaml
├── postcss.config.mjs
├── tsconfig.json
├── public/
│   └── favicon.ico                 # 仅保留 favicon
├── scripts/
│   ├── build.sh
│   ├── dev.sh
│   ├── prepare.sh
│   └── start.sh
└── src/
    ├── app/
    ├── components/
    ├── hooks/
    ├── lib/
    └── storage/
```

### 步骤2：验证
1. 确认所有源代码文件已复制
2. 确认 package.json 中的路径引用正确（`@/*` → `./src/*`）
3. 确认 tsconfig.json 中的路径引用正确
4. 确认 scripts/ 中的脚本路径正确

### 步骤3：清理旧目录
确认复制成功后，删除 `project_20260613_172956/` 目录

## 假设与决策

1. **public/ 目录**：Next.js 需要 public 目录存在，但默认模板 SVG 文件不需要，仅保留 favicon.ico
2. **.coze 文件**：保留，因为部署时需要此配置
3. **scripts/ 中的测试脚本**：check_results.ts、parse_template.ts、test_taobao.ts 未被任何代码引用，剔除
4. **assets/ 目录**：剔除，这些是测试用的图片和Excel样本
5. **pnpm-lock.yaml**：必须保留，确保依赖版本一致
6. **.trae/ 目录**：已存在于根目录，不覆盖

## 验证步骤

1. 检查根目录下所有必需文件是否存在
2. 检查 `src/` 目录完整性（所有子目录和文件）
3. 确认 `package.json` 中 `@/*` 路径映射指向 `./src/*`
4. 确认 `tsconfig.json` 中 `paths` 配置正确
5. 确认 `scripts/` 中 4 个必需脚本存在
6. 确认无遗漏的源代码文件
