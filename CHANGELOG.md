# 变更日志

所有重要更改均记录在此文件中。

版本号规则：主版本.次版本（次版本 1-99，满 99 后主版本+1、次版本归 1

## 1.6 (2026-06-13)

### 修改
- 规则文档更新：核心原则从"三处一致"改为"五处一致"（新增 docker-compose.yml 和 Dockerfile
- 开发修改流程细化：明确 5 处版本号文件的修改位置和格式
- Git 操作规范修正：默认分支从 main 改为 master
- Docker 部署补充版本号同步说明

## 1.5 (2026-06-13)

### 新增
- 在 docker-compose.yml 中添加版本号（image: dptsjdb:1.5，container_name: dptsjdb-1.5）
- 在 Dockerfile 中添加版本号标签（ARG VERSION=1.5，LABEL version）

### 修改
- 将 Docker 版本号纳入版本号管理范围，确保与 VERSION、package.json 同步

## 1.4 (2026-06-13)

### 修改
- 合并 5 个分散的规则文档为单个精简文件（.trae/rules/README.md），避免 AI 每次调用多个文件
- 删除 .trae/rules/ 下多余的 5 个 md 文件，仅保留单一入口文件

## 1.3 (2026-06-13)

### 新增
- 将主规范文档移至 `.trae/rules/` 目录，供 AI 每次操作前调用
- 创建规则索引文件（.trae/rules/README.md）
- 创建版本号管理规则（.trae/rules/01-version-control.md）
- 创建开发修改流程规范（.trae/rules/02-development-workflow.md）
- 创建 Docker 部署同步流程（.trae/rules/03-docker-sync.md）
- 创建 Git 操作与远程仓库规范（.trae/rules/04-git-operations.md）
- 创建项目结构与文件说明（.trae/rules/05-project-structure.md）

## 1.2 (2026-06-13)

### 新增
- 创建 rules/ 项目规则文档目录
- 新增版本号管理规则（rules/version-control.md）
- 新增开发修改流程规范（rules/development-workflow.md）
- 新增 Docker 部署同步流程（rules/docker-sync.md）
- 新增 Git 操作与远程仓库规范（rules/git-operations.md）
- 新增项目结构与文件说明（rules/project-structure.md）

## 1.1 (2026-06-13)

### 新增
- 创建项目文档体系（VERSION、CHANGELOG.md）
- 建立版本号管理规范
