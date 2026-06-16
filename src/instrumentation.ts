/**
 * Next.js Instrumentation Hook
 * 服务器启动时注册定时清理任务
 */

export async function register(): Promise<void> {
  // 仅在 Node.js 运行时执行（排除 Edge Runtime）
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { cleanupAll } = await import('./lib/memory-store');

    // 启动时立即执行一次清理
    try {
      await cleanupAll();
      console.log('[定时清理] 启动清理完成');
    } catch (error) {
      console.error('[定时清理] 启动清理失败:', error);
    }

    // 每小时执行一次清理
    const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
    setInterval(async () => {
      try {
        await cleanupAll();
        console.log('[定时清理] 定时清理完成');
      } catch (error) {
        console.error('[定时清理] 定时清理失败:', error);
      }
    }, CLEANUP_INTERVAL_MS);

    console.log(`[定时清理] 已注册，间隔 ${CLEANUP_INTERVAL_MS / 1000 / 60} 分钟`);
  }
}
