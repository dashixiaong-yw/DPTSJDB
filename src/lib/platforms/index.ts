/**
 * 平台处理器工厂
 * 
 * 【核心入口】用于识别平台并返回对应的处理器
 * 
 * 添加新平台步骤：
 * 1. 在 platforms/ 目录下创建新文件，如 taobao.ts
 * 2. 实现 PlatformHandler 接口
 * 3. 在此文件中导入并添加到 handlers 数组
 */

import { PlatformHandler, ParseResult } from './types';
import { douyinHandler } from './douyin';
import { pinduoduoHandler } from './pinduoduo';
import { taobaoHandler } from './taobao';

// 导出所有类型和工具
export * from './types';
export * from './base';
export { douyinHandler } from './douyin';
export { pinduoduoHandler } from './pinduoduo';
export { taobaoHandler } from './taobao';

/**
 * 已注册的平台处理器列表
 * 
 * 【注意】添加新平台时，在此数组末尾追加即可，不要修改已有项
 */
const handlers: PlatformHandler[] = [
  douyinHandler,      // 抖音
  pinduoduoHandler,   // 拼多多
  taobaoHandler,      // 淘宝
];

/**
 * 根据文件名识别平台（优先）
 * 文件名格式示例：拼多多账单.xlsx、抖音数据表格.xlsx
 */
export function identifyPlatformByFileName(
  fileName: string
): { platform: string; handler: PlatformHandler | null } {
  const fileNameLower = fileName.toLowerCase();
  
  console.log(`[平台识别] 文件名: "${fileName}"`);
  
  // 优先根据文件名判断
  if (fileNameLower.includes('拼多多') || fileNameLower.includes('pdd') || fileNameLower.includes('pinduoduo')) {
    console.log(`[平台识别] 根据文件名识别为: 拼多多`);
    return { platform: '拼多多', handler: pinduoduoHandler };
  }
  
  if (fileNameLower.includes('抖音') || fileNameLower.includes('douyin') || fileNameLower.includes('抖店')) {
    console.log(`[平台识别] 根据文件名识别为: 抖音`);
    return { platform: '抖音', handler: douyinHandler };
  }
  
  if (fileNameLower.includes('淘宝') || fileNameLower.includes('天猫') || fileNameLower.includes('taobao')) {
    console.log(`[平台识别] 根据文件名识别为: 淘宝`);
    return { platform: '淘宝', handler: taobaoHandler };
  }
  
  // 文件名无法识别，返回null，由调用方使用工作表名称判断
  console.log(`[平台识别] 文件名无法识别平台`);
  return { platform: '', handler: null };
}

/**
 * 根据工作表名称和表头识别平台（备用）
 */
export function identifyPlatform(
  sheetName: string, 
  headers: string[]
): { platform: string; handler: PlatformHandler | null } {
  console.log(`[平台识别] 工作表: "${sheetName}", 表头数量: ${headers.length}`);
  
  // 遍历所有处理器，找到匹配的平台
  for (const handler of handlers) {
    if (handler.identify(sheetName, headers)) {
      console.log(`[平台识别] 识别为: ${handler.name}`);
      return { platform: handler.name, handler };
    }
  }
  
  console.log(`[平台识别] 未能识别，使用未知平台`);
  return { platform: '未知', handler: null };
}

/**
 * 根据平台名称获取处理器
 */
export function getHandler(platformName: string): PlatformHandler | null {
  return handlers.find(h => h.name === platformName) || null;
}

/**
 * 获取所有已注册的平台名称
 */
export function getRegisteredPlatforms(): string[] {
  return handlers.map(h => h.name);
}
