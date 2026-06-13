/**
 * 平台处理器基础工具
 * 
 * 共享的工具函数，所有平台都可以使用
 * 修改此文件会影响所有平台
 */

import { OCRResult } from '../ocr-service';
import { CompareUtils } from './types';

/**
 * 系统内置字段映射（各平台独立配置）
 */
export const BUILTIN_FIELD_MAPPINGS: Record<string, Record<string, string>> = {
  '抖音': {
    '用户支付金额': '用户支付金额',
    '成交金额': '成交额',  // 表格列名"成交金额"映射到OCR输出"成交额"
    '支出金额': '支出金额',  // 表格列名和OCR输出相同
    '退款金额': '退款金额',  // 表格列名和OCR输出相同
    '成交订单数': '成交订单数',
    '客单价': '客单价',
    '平台佣金（结算口径）': '平台佣金_结算口径',
    '平台佣金_结算口径': '平台佣金_结算口径',
    '达人佣金': '达人佣金',
    '智能优惠': '智能优惠',
    '电商平台优惠': '电商平台',
    '其他成交': '其他成交',
    '成交退款金额（支付时间）': '成交退款金额_支付时间',
    '成交退款金额_支付时间': '成交退款金额_支付时间',
    '商品曝光人数': '商品曝光人数',
    '商品点击人数': '商品点击人数',
    '成交人数': '成交人数',
  },
  '拼多多': {
    '营业额': '营业额',
    '退款金额': '退款金额',
    '账单中退款金额': '账单中退款金额',
    '提现金额': '提现金额',
    '账单中支出总额': '账单中支出总额',
  },
  '淘宝': {
    '营业额': '营业额',
    '退款': '退款',
    '淘宝客': '淘宝客',
    '淘宝客佣金': '淘宝客',  // OCR输出的是"淘宝客"
    '万相台无界': '万相台无界',
    '无界总费用': '万相台无界',  // OCR输出的是"万相台无界"
    '小额打款': '小额打款',
    '红包签到': '红包签到',
    '公益宝贝': '公益宝贝',
    '先用后付': '先用后付',
    '技术服务费': '技术服务费',
    '商家集运': '商家集运',
    '跨境服务': '跨境服务',
    '淘金币服务': '淘金币服务',
    '淘金币服务费': '淘金币服务',  // OCR输出的是"淘金币服务"
    '净营业额': '净营业额',
  },
};

/**
 * 获取内置字段映射
 */
export function getBuiltinFieldMapping(platform: string): Map<string, string> {
  const mapping = new Map<string, string>();
  const platformMapping = BUILTIN_FIELD_MAPPINGS[platform];
  
  if (platformMapping) {
    Object.entries(platformMapping).forEach(([tableField, ocrField]) => {
      mapping.set(tableField, ocrField);
    });
  }
  
  return mapping;
}

/**
 * 比较两个值是否相等（支持数字模糊匹配）
 */
export function compareValues(a: string | number, b: string | number | undefined): boolean {
  if (b === undefined) return false;
  
  const numA = typeof a === 'string' ? parseFloat(a.replace(/,/g, '')) : a;
  const numB = typeof b === 'string' ? parseFloat(b.replace(/,/g, '')) : b;
  
  if (!isNaN(numA) && !isNaN(numB)) {
    // 数值比较：允许0.01的误差
    return Math.abs(numA - numB) < 0.01;
  }
  
  // 字符串比较
  return a.toString().trim() === b.toString().trim();
}

/**
 * 比较店铺名称（模糊匹配）
 */
export function compareShopNames(
  tableShopName: string, 
  ocrShopName?: string
): 'match' | 'mismatch' | 'missing' {
  if (!ocrShopName) return 'missing';
  
  // 完全匹配
  if (tableShopName === ocrShopName) return 'match';
  
  // 规范化后匹配
  const normalizedTable = tableShopName.toLowerCase().replace(/\s+/g, '').trim();
  const normalizedOcr = ocrShopName.toLowerCase().replace(/\s+/g, '').trim();
  
  if (normalizedTable === normalizedOcr) return 'match';
  
  // OCR包含表格名称（表格是简称，OCR是全称）
  if (normalizedOcr.includes(normalizedTable)) return 'match';
  
  // 表格包含OCR名称
  if (normalizedTable.includes(normalizedOcr)) return 'match';
  
  return 'mismatch';
}

/**
 * 检查日期范围是否为完整月份
 */
function checkIsFullMonth(startDate?: string, endDate?: string): boolean {
  if (!startDate || !endDate) return false;
  
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
    
    const startDay = start.getDate();
    const endDay = end.getDate();
    const startMonth = start.getMonth();
    const endMonth = end.getMonth();
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    
    if (startYear === endYear && startMonth === endMonth) {
      const lastDayOfMonth = new Date(endYear, endMonth + 1, 0).getDate();
      return startDay === 1 && endDay === lastDayOfMonth;
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * 从日期范围提取月份
 */
function extractMonthFromDateRange(startDate?: string, endDate?: string): string | undefined {
  if (!startDate && !endDate) return undefined;
  
  try {
    const date = new Date((startDate || endDate || '') + 'T00:00:00');
    if (isNaN(date.getTime())) return undefined;
    
    return `${date.getMonth() + 1}月`;
  } catch {
    return undefined;
  }
}

/**
 * 比较月份
 */
export function compareMonth(
  tableMonth: string | undefined, 
  ocrResult: OCRResult
): 'match' | 'mismatch' | 'not_full_month' | 'missing' {
  if (!tableMonth) return 'missing';
  
  const ocrMonth = ocrResult.month || ocrResult.date_range?.actual_month;
  
  if (!ocrMonth && !ocrResult.date_range) return 'missing';
  
  // 检查日期范围是否为完整月份
  if (ocrResult.date_range) {
    const isFullMonth = ocrResult.date_range.is_full_month ?? 
      checkIsFullMonth(ocrResult.date_range.start_date, ocrResult.date_range.end_date);
    
    if (!isFullMonth) {
      return 'not_full_month';
    }
  }
  
  // 比较月份
  const normalizedTable = tableMonth.replace(/月份?/g, '');
  const normalizedOcr = (ocrMonth || '').replace(/月份?/g, '');
  
  if (normalizedTable === normalizedOcr) return 'match';
  
  return 'mismatch';
}

/**
 * 从OCR结果提取字段值
 */
/**
 * 精确匹配字段名列表（不使用模糊匹配）
 * 这些字段必须精确匹配，避免误识别
 */
const EXACT_MATCH_FIELDS = ['提现金额', '转账支出金额', '支出总额', '账单中支出总额'];

export function extractOCRValue(
  fieldName: string, 
  ocrResult: OCRResult, 
  fieldMapping: Map<string, string>
): number | undefined {
  if (!ocrResult.amounts) return undefined;

  // 1. 使用字段映射
  const mappedField = fieldMapping.get(fieldName);
  if (mappedField && ocrResult.amounts[mappedField] !== undefined) {
    return ocrResult.amounts[mappedField];
  }

  // 2. 直接匹配
  if (ocrResult.amounts[fieldName] !== undefined) {
    return ocrResult.amounts[fieldName];
  }

  // 3. 去除括号内容后匹配
  const simplifiedFieldName = fieldName.replace(/[（(][^）)]*[）)]/g, '').trim();
  if (ocrResult.amounts[simplifiedFieldName] !== undefined) {
    return ocrResult.amounts[simplifiedFieldName];
  }

  // 4. 模糊匹配（对于精确匹配字段，跳过模糊匹配）
  const isExactMatchField = EXACT_MATCH_FIELDS.some(f => 
    fieldName.includes(f) || simplifiedFieldName.includes(f)
  );
  
  if (!isExactMatchField) {
    const normalizedFieldName = simplifiedFieldName.toLowerCase().replace(/\s+/g, '');
    for (const [key, value] of Object.entries(ocrResult.amounts)) {
      const normalizedKey = key.toLowerCase().replace(/\s+/g, '');
      if (normalizedKey.includes(normalizedFieldName) || normalizedFieldName.includes(normalizedKey)) {
        return value;
      }
    }
  }

  return undefined;
}

/**
 * 获取比对状态
 */
export function getComparisonStatus(
  tableValue: string | number,
  ocrValue: number | undefined
): 'match' | 'mismatch' | 'missing' {
  if (ocrValue === undefined) {
    return 'missing';
  }
  return compareValues(tableValue, ocrValue) ? 'match' : 'mismatch';
}

/**
 * 获取图片类型（根据列标题判断）
 */
export function getImageType(colHeader: string): string {
  const headerLower = colHeader.toLowerCase();
  
  // 拼多多平台
  if (headerLower.includes('月度数据报表') || headerLower.includes('月度报表')) {
    return '月度数据报表';
  }
  if (headerLower.includes('多多账单') || headerLower.includes('账单截图')) {
    return '多多账单';
  }
  
  // 淘宝平台
  if (headerLower.includes('店铺数据截图') || headerLower.includes('店铺数据')) {
    return '店铺数据截图';
  }
  if (headerLower.includes('万相台无界') || headerLower.includes('万相台')) {
    return '万相台无界版截图';
  }
  if (headerLower.includes('小额打款')) {
    return '小额打款后台数据';
  }
  if (headerLower.includes('红包签到')) {
    return '红包签到佣金截图';
  }
  if (headerLower.includes('公益宝贝')) {
    return '公益宝贝佣金截图';
  }
  if (headerLower.includes('淘宝平台技术') || headerLower.includes('平台技术截图')) {
    return '淘宝平台技术截图';
  }
  if (headerLower.includes('偏远集运') || headerLower.includes('集运仓')) {
    return '偏远集运仓截图';
  }
  if (headerLower.includes('跨境服务')) {
    return '跨境服务截图';
  }
  if (headerLower.includes('淘金币')) {
    return '淘金币服务截图';
  }
  
  // 通用
  if (headerLower.includes('刷单')) {
    return '刷单记录';
  }
  if (headerLower.includes('截图') || headerLower.includes('图片')) {
    return '数据截图';
  }
  
  return '其他';
}

/**
 * 导出工具函数对象
 */
export const compareUtils: CompareUtils = {
  compareValues,
  compareShopNames,
  compareMonth,
  extractOCRValue,
  getComparisonStatus,
};
