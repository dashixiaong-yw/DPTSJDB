FROM node:20-alpine AS base
WORKDIR /app

# ========== 构建阶段 ==========
FROM base AS builder
RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# BUILD_VERSION 参数：版本号变化时触发重新构建（重要避免缓存旧代码）
ARG BUILD_VERSION

COPY . .

# BuildKit 缓存 /app/.next/cache，实现增量编译（避免冷编译 15min+）
RUN --mount=type=cache,target=/app/.next/cache \
    pnpm run build

# ========== 运行阶段 ==========
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# 增大堆内存，避免解析大 Excel 文件时 OOM（默认约1.7GB不够用）
ENV NODE_OPTIONS="--max-old-space-size=4096"

# 健康检查需要 curl，su-exec 用于入口脚本切换用户
RUN apk add --no-cache curl su-exec

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 创建数据目录（文件上传使用）
RUN mkdir -p /app/data/uploads && chown nextjs:nodejs /app/data/uploads

# 入口脚本：以 root 修复挂载卷权限后切换到 nextjs 用户运行
COPY <<'EOF' /app/entrypoint.sh
#!/bin/sh
mkdir -p /app/data/uploads
chown -R nextjs:nodejs /app/data 2>/dev/null || true
exec su-exec nextjs "$@"
EOF
RUN chmod +x /app/entrypoint.sh

EXPOSE 3080
ENV PORT=3080
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]
