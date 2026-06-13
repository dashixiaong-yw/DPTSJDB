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

# 健康检查需要 curl
RUN apk add --no-cache curl

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 创建数据目录（文件上传使用）
RUN mkdir -p /app/data/uploads && chown nextjs:nodejs /app/data/uploads

USER nextjs
EXPOSE 3080
ENV PORT=3080
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
