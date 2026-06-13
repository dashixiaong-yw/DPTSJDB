import { OCRResult } from './ocr-service';
import { appendTaskResults, getTaskResults, type ComparisonRecord } from './memory-store';
import type { RowData } from '@/types/global';

export interface ComparisonItem {
  shopName: string;
  fieldName: string;
  tableValue: string | number;
  ocrValue: string | number | undefined;
  status: 'match' | 'mismatch' | 'missing';
  sheetName: string;
  rowIndex: number;
  colIndex: number; // 列号（用于字段排序）
  cellRef: string;
  month?: string; // 月份字段
  imageKey?: string; // 图片唯一标识（用于关联OCR识别结果）
  // 店铺名称比对相关
  ocrShopName?: string; // OCR识别的店铺名称
  shopNameMatch?: 'match' | 'mismatch' | 'missing'; // 店铺名称比对状态
  // 月份比对相关
  ocrMonth?: string; // OCR识别的月份
  ocrDateRange?: {
    start_date?: string;
    end_date?: string;
    is_full_month?: boolean;
    actual_month?: string;
  };
  monthMatch?: 'match' | 'mismatch' | 'not_full_month' | 'missing'; // 月份比对状态
}

export interface ComparisonResult {
  taskId: string;
  totalItems: number;
  matchedItems: number;
  mismatchedItems: number;
  missingItems: number;
  details: ComparisonItem[];
}

// 系统内置字段映射（经过测试验证的映射关系）
const BUILTIN_FIELD_MAPPINGS: Record<string, Record<string, string>> = {
  '抖音': {
    // 表格字段 -> OCR识别字段
    '用户支付金额': '用户支付金额',
    '成交金额': '成交金额',
    '成交订单数': '成交订单数',
    '客单价': '客单价',
    '支出金额': '支出金额',
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
    // M列（月度数据报表）
    '营业额': '营业额',
    '退款金额': '退款金额',
    // N列（多多账单）
    '账单中退款金额': '账单中退款金额',
    '提现金额': '提现金额',
    '账单中支出总额': '账单中支出总额',
  },
  '淘宝': {
    '净营业额': '净营业额',
    '淘宝客佣金': '淘宝客佣金',
    '无界总费用': '无界总费用',
    '淘金币服务费': '淘金币服务费',
  },
};

// OCR结果索引：key = "店铺名|月份", value = OCRResult
type OCRIndex = Map<string, OCRResult>;

/**
 * 获取内置字段映射
 */
function getBuiltinFieldMapping(platform: string): Map<string, string> {
  const mapping = new Map<string, string>();
  const platformMapping = BUILTIN_FIELD_MAPPINGS[platform];
  
  if (platformMapping) {
    Object.entries(platformMapping).forEach(([tableField, ocrField]) => {
      mapping.set(tableField, ocrField);
    });
  }
  
  console.log(`加载内置字段映射: ${platform}, 共 ${mapping.size} 条`);
  return mapping;
}

/**
 * 从字段名中提取月份
 */
function extractMonthFromFieldName(fieldName: string): string | undefined {
  // 匹配月份模式
  const patterns = [
    /(\d{1,2})月/,
    /(\d{1,2})月份/,
    /month(\d{1,2})/i,
    /m(\d{1,2})/i,
    /(\d{4})年(\d{1,2})月/, // 2024年1月
  ];
  
  for (const pattern of patterns) {
    const match = fieldName.match(pattern);
    if (match) {
      if (pattern.toString().includes('年')) {
        return `${match[1]}年${match[2]}月`;
      }
      return `${match[1]}月`;
    }
  }
  
  return undefined;
}

/**
 * 从OCR结果中提取月份
 */
function extractMonthFromOCR(ocrResult: OCRResult): string | undefined {
  // 优先使用OCR识别的month字段
  if (ocrResult.month) {
    return ocrResult.month;
  }
  
  // 从dates字段提取
  if (ocrResult.dates && ocrResult.dates.length > 0) {
    const dateStr = ocrResult.dates[0];
    // 尝试解析日期格式
    const match = dateStr.match(/(\d{4})[-\/年](\d{1,2})/);
    if (match) {
      return `${match[2]}月`;
    }
  }
  
  // 从raw_text中提取
  if (ocrResult.raw_text) {
    const match = ocrResult.raw_text.match(/(\d{1,2})月/);
    if (match) {
      return `${match[1]}月`;
    }
  }
  
  return undefined;
}

/**
 * 构建OCR索引
 * key格式: "店铺名|月份" 或 "店铺名"（如果月份未知）
 */
function buildOCRIndex(ocrResults: Map<string, OCRResult>): OCRIndex {
  const index: OCRIndex = new Map();
  
  for (const [imageKey, result] of ocrResults) {
    if (!result.shop_name) continue;
    
    const month = extractMonthFromOCR(result);
    const normalizedName = result.shop_name.toLowerCase().replace(/\s+/g, '').trim();
    
    // 同时建立带月份和不带月份的索引
    const keyWithMonth = `${normalizedName}|${month || ''}`;
    const keyWithoutMonth = normalizedName;
    
    // 如果有月份，优先使用带月份的索引
    if (month) {
      index.set(keyWithMonth, result);
    }
    // 同时也建立不带月份的索引（作为备选）
    if (!index.has(keyWithoutMonth)) {
      index.set(keyWithoutMonth, result);
    }
  }
  
  console.log(`构建OCR索引: ${index.size} 条记录`);
  return index;
}

/**
 * 数据比对引擎
 */
export class ComparisonEngine {
  private fieldMapping: Map<string, string> = new Map();
  private ocrIndex: OCRIndex = new Map();

  /**
   * 执行数据比对
   */
  async compare(
    taskId: string,
    tableData: Array<{
      shopName: string;
      fieldName: string;
      value: string | number;
      sheetName: string;
      rowIndex: number;
      cellRef: string;
    }>,
    ocrResults: Map<string, OCRResult>,
    platform: string = '拼多多'
  ): Promise<ComparisonResult> {
    // 加载字段映射
    this.fieldMapping = getBuiltinFieldMapping(platform);
    console.log(`加载了 ${this.fieldMapping.size} 条字段映射规则`);

    // 构建OCR索引
    this.ocrIndex = buildOCRIndex(ocrResults);

    const details: ComparisonItem[] = [];
    let matchedItems = 0;
    let mismatchedItems = 0;
    let missingItems = 0;

    // 遍历表格数据进行比对
    for (const item of tableData) {
      // 从字段名中提取月份
      const month = extractMonthFromFieldName(item.fieldName);
      
      // 查找对应的OCR结果（优先匹配店铺+月份）
      const ocrResult = this.findOCRResult(item.shopName, month);

      const comparisonItem: ComparisonItem = {
        shopName: item.shopName,
        fieldName: item.fieldName,
        tableValue: item.value,
        ocrValue: undefined,
        status: 'missing',
        sheetName: item.sheetName,
        rowIndex: item.rowIndex,
        colIndex: 0, // 老方法默认0
        cellRef: item.cellRef,
        month,
      };

      if (ocrResult) {
        // 记录OCR识别的店铺名称
        comparisonItem.ocrShopName = ocrResult.shop_name;
        
        // 店铺名称比对（表格店铺名 vs OCR识别店铺名）
        comparisonItem.shopNameMatch = this.compareShopNames(item.shopName, ocrResult.shop_name);
        
        // 记录OCR识别的月份和日期范围
        comparisonItem.ocrMonth = ocrResult.month;
        comparisonItem.ocrDateRange = ocrResult.date_range;
        
        // 月份比对（表格月份 vs OCR识别月份/日期范围）
        comparisonItem.monthMatch = this.compareMonth(month, ocrResult);
        
        // 尝试从OCR结果中提取对应字段的值
        const ocrValue = this.extractOCRValue(item.fieldName, ocrResult);
        comparisonItem.ocrValue = ocrValue;

        // 比对值
        if (ocrValue === undefined) {
          comparisonItem.status = 'missing';
          missingItems++;
        } else if (this.compareValues(item.value, ocrValue)) {
          comparisonItem.status = 'match';
          matchedItems++;
        } else {
          comparisonItem.status = 'mismatch';
          mismatchedItems++;
        }
      } else {
        missingItems++;
        comparisonItem.shopNameMatch = 'missing';
        comparisonItem.monthMatch = 'missing';
      }

      details.push(comparisonItem);
    }

    // 保存结果到数据库
    await this.saveResults(taskId, details);

    return {
      taskId,
      totalItems: details.length,
      matchedItems,
      mismatchedItems,
      missingItems,
      details,
    };
  }

  /**
   * 查找匹配的OCR结果（支持店铺+月份匹配，模糊匹配）
   */
  private findOCRResult(
    shopName: string,
    month?: string
  ): OCRResult | undefined {
    const normalizedShopName = shopName.toLowerCase().replace(/\s+/g, '').trim();
    
    // 收集所有候选结果
    const candidates: Array<{ result: OCRResult; score: number; key: string }> = [];
    
    for (const [key, result] of this.ocrIndex) {
      const [ocrShop, ocrMonth] = key.split('|');
      let score = 0;
      
      // 1. 店铺名匹配评分
      if (ocrShop === normalizedShopName) {
        score += 100; // 完全匹配
      } else if (ocrShop.includes(normalizedShopName)) {
        score += 80; // OCR店铺名包含表格店铺名（OCR是完整名称）
      } else if (normalizedShopName.includes(ocrShop)) {
        score += 70; // 表格店铺名包含OCR店铺名
      } else {
        // 检查是否有部分匹配
        const ocrParts = ocrShop.split(/[：:_\-]/);
        const tableParts = normalizedShopName.split(/[：:_\-]/);
        for (const ocrPart of ocrParts) {
          for (const tablePart of tableParts) {
            if (ocrPart.length >= 2 && tablePart.length >= 2) {
              if (ocrPart.includes(tablePart) || tablePart.includes(ocrPart)) {
                score += 50; // 部分匹配
              }
            }
          }
        }
      }
      
      // 2. 月份匹配评分（如果有月份）
      if (month && ocrMonth) {
        if (ocrMonth === month) {
          score += 30; // 月份完全匹配
        } else {
          score -= 10; // 月份不匹配
        }
      }
      
      if (score > 0) {
        candidates.push({ result, score, key });
      }
    }
    
    // 按分数排序，取最高分
    candidates.sort((a, b) => b.score - a.score);
    
    if (candidates.length > 0) {
      const best = candidates[0];
      console.log(`匹配结果: ${shopName} + ${month || ''} -> ${best.key} (分数: ${best.score})`);
      return best.result;
    }
    
    console.log(`未找到匹配: ${shopName} (月份: ${month || '未知'})`);
    return undefined;
  }

  /**
   * 从OCR结果中提取字段值
   */
  // 精确匹配字段名列表（不使用模糊匹配）
  private static readonly EXACT_MATCH_FIELDS = ['提现金额', '转账支出金额', '支出总额', '账单中支出总额'];

  private extractOCRValue(fieldName: string, ocrResult: OCRResult): number | undefined {
    if (!ocrResult.amounts) return undefined;

    // 1. 首先使用字段映射
    const mappedField = this.fieldMapping.get(fieldName);
    if (mappedField && ocrResult.amounts[mappedField] !== undefined) {
      return ocrResult.amounts[mappedField];
    }

    // 2. 尝试直接匹配
    if (ocrResult.amounts[fieldName] !== undefined) {
      return ocrResult.amounts[fieldName];
    }

    // 3. 尝试模糊匹配（去除括号内容）
    const simplifiedFieldName = fieldName.replace(/[（(][^）)]*[）)]/g, '').trim();
    if (ocrResult.amounts[simplifiedFieldName] !== undefined) {
      return ocrResult.amounts[simplifiedFieldName];
    }

    // 4. 模糊匹配（对于精确匹配字段，跳过模糊匹配）
    const isExactMatchField = ComparisonEngine.EXACT_MATCH_FIELDS.some(f => 
      fieldName.includes(f) || simplifiedFieldName.includes(f)
    );
    
    if (!isExactMatchField) {
      const normalizedField = fieldName.toLowerCase().replace(/\s+/g, '');
      for (const [key, value] of Object.entries(ocrResult.amounts)) {
        const normalizedKey = key.toLowerCase().replace(/\s+/g, '');
        if (normalizedKey.includes(normalizedField) || normalizedField.includes(normalizedKey)) {
          return value;
        }
      }
    }

    return undefined;
  }

  /**
   * 比对值（数值允许微小误差）
   */
  private compareValues(tableValue: string | number, ocrValue: number): boolean {
    // 转换为数值
    const tableNum = typeof tableValue === 'string' 
      ? parseFloat(tableValue.replace(/,/g, ''))
      : tableValue;

    if (isNaN(tableNum)) return false;

    // 允许误差 0.01
    return Math.abs(tableNum - ocrValue) <= 0.01;
  }

  /**
   * 比对店铺名称
   * 规则：OCR识别的店铺名称应包含表格中的店铺名简称
   * @param tableShopName 表格中的店铺名
   * @param ocrShopName OCR识别的店铺名
   * @returns 'match' | 'mismatch' | 'missing'
   */
  private compareShopNames(
    tableShopName: string,
    ocrShopName?: string
  ): 'match' | 'mismatch' | 'missing' {
    if (!ocrShopName) {
      return 'missing';
    }
    
    // 标准化处理
    const normalizedTable = tableShopName.toLowerCase().replace(/\s+/g, '').trim();
    const normalizedOCR = ocrShopName.toLowerCase().replace(/\s+/g, '').trim();
    
    // 完全匹配
    if (normalizedTable === normalizedOCR) {
      return 'match';
    }
    
    // OCR店铺名包含表格店铺名（表格是简称，OCR是完整名称）
    if (normalizedOCR.includes(normalizedTable)) {
      return 'match';
    }
    
    // 表格店铺名包含OCR店铺名
    if (normalizedTable.includes(normalizedOCR)) {
      return 'match';
    }
    
    // 部分匹配检查（处理特殊字符分隔的情况）
    const tableParts = normalizedTable.split(/[：:_\-\s]/);
    const ocrParts = normalizedOCR.split(/[：:_\-\s]/);
    
    for (const tablePart of tableParts) {
      if (tablePart.length < 2) continue;
      for (const ocrPart of ocrParts) {
        if (ocrPart.length < 2) continue;
        if (ocrPart.includes(tablePart) || tablePart.includes(ocrPart)) {
          return 'match';
        }
      }
    }
    
    // 不匹配
    console.log(`店铺名不匹配: 表格="${tableShopName}" vs OCR="${ocrShopName}"`);
    return 'mismatch';
  }

  /**
   * 比对月份
   * 规则：
   * 1. OCR识别的月份应与表格月份一致
   * 2. 日期范围应为完整月份
   * @param tableMonth 表格中的月份（如：1月）
   * @param ocrResult OCR识别结果
   * @returns 'match' | 'mismatch' | 'not_full_month' | 'missing'
   */
  private compareMonth(
    tableMonth: string | undefined,
    ocrResult: OCRResult
  ): 'match' | 'mismatch' | 'not_full_month' | 'missing' {
    if (!tableMonth) {
      // 如果表格没有月份，只检查OCR是否有日期范围
      if (ocrResult.date_range?.start_date && ocrResult.date_range?.end_date) {
        return ocrResult.date_range.is_full_month ? 'match' : 'not_full_month';
      }
      return 'missing';
    }
    
    // 标准化表格月份
    const normalizedTableMonth = tableMonth.replace(/月$/, '').trim();
    
    // 优先使用date_range判断
    if (ocrResult.date_range) {
      const { start_date, end_date, is_full_month, actual_month } = ocrResult.date_range;
      
      // 检查是否为完整月份
      if (start_date && end_date && !is_full_month) {
        console.log(`月份不完整: 表格="${tableMonth}", 日期范围="${start_date} 至 ${end_date}"`);
        return 'not_full_month';
      }
      
      // 检查月份是否匹配
      if (actual_month) {
        const normalizedOCRMonth = actual_month.replace(/月$/, '').trim();
        if (normalizedTableMonth === normalizedOCRMonth) {
          return 'match';
        }
      }
    }
    
    // 使用OCR识别的month字段
    if (ocrResult.month) {
      const normalizedOCRMonth = ocrResult.month.replace(/月$/, '').trim();
      if (normalizedTableMonth === normalizedOCRMonth) {
        return 'match';
      }
      console.log(`月份不匹配: 表格="${tableMonth}" vs OCR="${ocrResult.month}"`);
      return 'mismatch';
    }
    
    // 尝试从dates字段提取
    if (ocrResult.dates && ocrResult.dates.length >= 1) {
      const dateStr = ocrResult.dates[0];
      const monthMatch = dateStr.match(/(\d{4})[-\/年](\d{1,2})/);
      if (monthMatch) {
        const ocrMonth = monthMatch[2];
        if (normalizedTableMonth === ocrMonth) {
          return 'match';
        }
        console.log(`月份不匹配: 表格="${tableMonth}" vs OCR日期="${dateStr}"`);
        return 'mismatch';
      }
    }
    
    return 'missing';
  }

  /**
   * 比对单行数据 - 使用该行的OCR结果直接比对
   */
  async compareRow(
    taskId: string,
    rowData: Array<{
      shopName: string;
      fieldName: string;
      value: string | number;
      sheetName: string;
      rowIndex: number;
      colIndex: number; // 列号（用于排序）
      cellRef: string;
      month?: string;
    }>,
    ocrResult: OCRResult,
    platform: string = '拼多多',
    rowNum: number,
    imageKey?: string // 图片唯一标识
  ): Promise<void> {
    // 加载字段映射（使用缓存）
    if (this.fieldMapping.size === 0) {
      this.fieldMapping = getBuiltinFieldMapping(platform);
    }

    const details: ComparisonItem[] = [];

    for (const item of rowData) {
      const comparisonItem: ComparisonItem = {
        shopName: item.shopName,
        fieldName: item.fieldName,
        tableValue: item.value,
        ocrValue: undefined,
        status: 'missing',
        sheetName: item.sheetName,
        rowIndex: item.rowIndex,
        colIndex: item.colIndex, // 保存列号
        cellRef: item.cellRef,
        month: item.month || ocrResult.month,
      };

      // 从OCR结果中提取对应字段的值
      const ocrValue = this.extractOCRValue(item.fieldName, ocrResult);
      comparisonItem.ocrValue = ocrValue;

      // 比对值
      if (ocrValue === undefined) {
        comparisonItem.status = 'missing';
      } else if (this.compareValues(item.value, ocrValue)) {
        comparisonItem.status = 'match';
      } else {
        comparisonItem.status = 'mismatch';
      }

      details.push(comparisonItem);
      
      // 日志输出
      console.log(`  行${rowNum} [${item.fieldName}]: 表格=${item.value}, OCR=${ocrValue}, 状态=${comparisonItem.status}`);
    }

    // 添加店铺名称比对结果（作为特殊字段）
    const shopNameFromTable = rowData.length > 0 ? rowData[0].shopName : '';
    const shopNameMatch = this.compareShopNames(shopNameFromTable, ocrResult.shop_name);
    
    // 店铺名称比对项
    details.unshift({
      shopName: shopNameFromTable,
      fieldName: '店铺名称',
      tableValue: shopNameFromTable,
      ocrValue: ocrResult.shop_name ? 0 : undefined, // 使用0作为占位，实际显示字符串
      status: shopNameMatch === 'match' ? 'match' : 'mismatch',
      sheetName: rowData.length > 0 ? rowData[0].sheetName : '',
      rowIndex: rowNum,
      colIndex: -1, // 特殊标记，表示非表格列
      cellRef: '',
      imageKey,
      ocrShopName: ocrResult.shop_name,
      shopNameMatch,
      month: rowData.length > 0 ? rowData[0].month : undefined,
    });

    // 添加月份比对结果（作为特殊字段）
    const tableMonthValue = rowData.length > 0 ? rowData[0].month : '';
    if (tableMonthValue) {
      const monthMatch = this.compareMonth(tableMonthValue, ocrResult);
      
      details.splice(1, 0, {
        shopName: shopNameFromTable,
        fieldName: '月份',
        tableValue: tableMonthValue,
        ocrValue: ocrResult.month ? 0 : undefined, // 使用0作为占位
        status: monthMatch === 'match' ? 'match' : 'mismatch',
        sheetName: rowData.length > 0 ? rowData[0].sheetName : '',
        rowIndex: rowNum,
        colIndex: -1, // 特殊标记
        cellRef: '',
        imageKey,
        ocrShopName: ocrResult.shop_name,
        shopNameMatch,
        month: tableMonthValue,
        ocrMonth: ocrResult.month,
        ocrDateRange: ocrResult.date_range,
        monthMatch,
      });
    }

    console.log(`  行${rowNum} 店铺名称比对: 表格="${shopNameFromTable}" vs OCR="${ocrResult.shop_name}" => ${shopNameMatch}`);
    console.log(`  行${rowNum} 月份比对: 表格="${tableMonthValue}" vs OCR="${ocrResult.month}" => ${tableMonthValue ? (tableMonthValue === ocrResult.month ? 'match' : 'mismatch') : '无表格月份'}`);

    // 保存结果到数据库（包含imageKey和month）
    if (details.length > 0) {
      await this.saveResults(taskId, details, imageKey, ocrResult.month);
    }
  }

  /**
   * 比对拼多多单行数据 - 支持两张图片
   * M列（月度数据报表）：营业额、退款金额 + 月份核对
   * N列（多多账单）：账单中退款金额、提现金额、账单中支出总额
   */
  async comparePDDRow(
    taskId: string,
    rowData: RowData,
    ocrResultMonthly: OCRResult | null,
    ocrResultBill: OCRResult | null,
    platform: string,
    rowNum: number,
    monthlyImageKey?: string,
    billImageKey?: string,
    headers?: string[]
  ): Promise<void> {
    // 加载字段映射
    if (this.fieldMapping.size === 0) {
      this.fieldMapping = getBuiltinFieldMapping(platform);
    }

    const details: ComparisonItem[] = [];
    const shopName = String(rowData['店铺名称（必填）'] || rowData['店铺名称'] || rowData['店铺名'] || '未知店铺');
    const rawMonth = rowData['账单月份（必填）'] || rowData['账单月份'] || rowData['月份'];
    const tableMonth: string | undefined = rawMonth !== undefined && rawMonth !== null ? String(rawMonth) : undefined;
    
    console.log(`\n=== 拼多多行${rowNum} 比对 ===`);
    console.log(`店铺: ${shopName}, 月份: ${tableMonth}`);
    
    // 辅助函数：从rowData中获取字段值（支持模糊匹配）
    const getFieldValue = (fieldPattern: string): string | number | undefined => {
      // 1. 先尝试精确匹配
      if (rowData[fieldPattern] !== undefined) {
        return rowData[fieldPattern] ?? undefined;
      }
      // 2. 尝试匹配带后缀的字段名（如"营业额（必填）"）
      for (const key of Object.keys(rowData)) {
        if (key.includes(fieldPattern)) {
          return rowData[key] ?? undefined;
        }
      }
      return undefined;
    };

    // 店铺名称比对（使用两张图片的OCR结果）
    const ocrShopName = ocrResultMonthly?.shop_name || ocrResultBill?.shop_name;
    const shopNameMatch = this.compareShopNames(shopName, ocrShopName);
    console.log(`店铺比对: 表格="${shopName}" vs OCR="${ocrShopName}" => ${shopNameMatch}`);

    // === M列（月度数据报表）字段比对 ===
    if (ocrResultMonthly) {
      console.log(`\n[M列 - 月度数据报表]`);
      
      // 1. 营业额
      const ocr营业额 = this.extractOCRValue('营业额', ocrResultMonthly);
      const table营业额 = getFieldValue('营业额');
      if (table营业额 !== undefined && table营业额 !== '') {
        const status = this.getComparisonStatus(table营业额, ocr营业额);
        details.push({
          shopName,
          fieldName: '营业额',
          tableValue: table营业额,
          ocrValue: ocr营业额,
          status,
          sheetName: '拼多多',
          rowIndex: rowNum,
          colIndex: this.getColIndex(headers, '营业额'),
          cellRef: '',
          imageKey: monthlyImageKey,
          ocrShopName,
          shopNameMatch,
          month: tableMonth,
        });
        console.log(`  营业额: 表格=${table营业额}, OCR=${ocr营业额}, 状态=${status}`);
      }

      // 2. 退款金额
      const ocr退款金额 = this.extractOCRValue('退款金额', ocrResultMonthly);
      const table退款金额 = getFieldValue('退款金额');
      if (table退款金额 !== undefined && table退款金额 !== '') {
        const status = this.getComparisonStatus(table退款金额, ocr退款金额);
        details.push({
          shopName,
          fieldName: '退款金额',
          tableValue: table退款金额,
          ocrValue: ocr退款金额,
          status,
          sheetName: '拼多多',
          rowIndex: rowNum,
          colIndex: this.getColIndex(headers, '退款金额'),
          cellRef: '',
          imageKey: monthlyImageKey,
          ocrShopName,
          shopNameMatch,
          month: tableMonth,
        });
        console.log(`  退款金额: 表格=${table退款金额}, OCR=${ocr退款金额}, 状态=${status}`);
      }

      // 3. 月份核对（仅针对月度数据报表）
      const monthMatch = this.compareMonth(tableMonth, ocrResultMonthly);
      if (tableMonth) {
        details.push({
          shopName,
          fieldName: '月份核对',
          tableValue: tableMonth,
          ocrValue: ocrResultMonthly.month || ocrResultMonthly.date_range?.actual_month || '',
          status: monthMatch === 'match' ? 'match' : 'mismatch',
          sheetName: '拼多多',
          rowIndex: rowNum,
          colIndex: this.getColIndex(headers, '账单月份（必填）') || this.getColIndex(headers, '账单月份'),
          cellRef: '',
          imageKey: monthlyImageKey,
          ocrShopName,
          shopNameMatch,
          month: tableMonth,
          ocrMonth: ocrResultMonthly.month,
          ocrDateRange: ocrResultMonthly.date_range,
          monthMatch,
        });
        console.log(`  月份核对: 表格=${tableMonth}, OCR月份=${ocrResultMonthly.month}, 日期范围=${JSON.stringify(ocrResultMonthly.date_range)}, 状态=${monthMatch}`);
      }
    }

    // === N列（多多账单）字段比对 ===
    if (ocrResultBill) {
      console.log(`\n[N列 - 多多账单]`);
      
      // 1. 账单中退款金额
      const ocr账单退款 = this.extractOCRValue('账单中退款金额', ocrResultBill) || 
                           this.extractOCRValue('退款金额', ocrResultBill);
      const table账单退款 = getFieldValue('账单中退款金额');
      if (table账单退款 !== undefined && table账单退款 !== '') {
        const status = this.getComparisonStatus(table账单退款, ocr账单退款);
        details.push({
          shopName,
          fieldName: '账单中退款金额',
          tableValue: table账单退款,
          ocrValue: ocr账单退款,
          status,
          sheetName: '拼多多',
          rowIndex: rowNum,
          colIndex: this.getColIndex(headers, '账单中退款金额'),
          cellRef: '',
          imageKey: billImageKey,
          ocrShopName,
          shopNameMatch,
          month: tableMonth,
        });
        console.log(`  账单中退款金额: 表格=${table账单退款}, OCR=${ocr账单退款}, 状态=${status}`);
      }

      // 2. 提现金额（精确匹配，如果OCR没有则默认为0）
      // 注意：OCR可能识别出"转账支出金额"，但这不是"提现金额"
      // 如果账单中没有"提现金额"选项，代表客户没有提现，默认为0
      const ocr提现 = this.extractOCRValue('提现金额', ocrResultBill);
      const table提现 = getFieldValue('提现金额');
      if (table提现 !== undefined && table提现 !== '') {
        // 如果OCR没有识别到"提现金额"，则默认为0（代表没有提现）
        const actualOcr提现 = ocr提现 ?? 0;
        const status = this.getComparisonStatus(table提现, actualOcr提现);
        details.push({
          shopName,
          fieldName: '提现金额',
          tableValue: table提现,
          ocrValue: actualOcr提现,
          status,
          sheetName: '拼多多',
          rowIndex: rowNum,
          colIndex: this.getColIndex(headers, '提现金额'),
          cellRef: '',
          imageKey: billImageKey,
          ocrShopName,
          shopNameMatch,
          month: tableMonth,
        });
        console.log(`  提现金额: 表格=${table提现}, OCR=${actualOcr提现}${ocr提现 === undefined ? '（默认值，OCR未识别到提现金额）' : ''}, 状态=${status}`);
      }

      // 3. 账单中支出总额
      const ocr支出 = this.extractOCRValue('账单中支出总额', ocrResultBill) || 
                       this.extractOCRValue('支出总额', ocrResultBill) ||
                       this.extractOCRValue('支出', ocrResultBill);
      const table支出 = getFieldValue('账单中支出总额');
      if (table支出 !== undefined && table支出 !== '') {
        const status = this.getComparisonStatus(table支出, ocr支出);
        details.push({
          shopName,
          fieldName: '账单中支出总额',
          tableValue: table支出,
          ocrValue: ocr支出,
          status,
          sheetName: '拼多多',
          rowIndex: rowNum,
          colIndex: this.getColIndex(headers, '账单中支出总额'),
          cellRef: '',
          imageKey: billImageKey,
          ocrShopName,
          shopNameMatch,
          month: tableMonth,
        });
        console.log(`  账单中支出总额: 表格=${table支出}, OCR=${ocr支出}, 状态=${status}`);
      }
    }

    // 保存结果
    if (details.length > 0) {
      await this.saveResults(taskId, details, monthlyImageKey || billImageKey, tableMonth);
      console.log(`\n行${rowNum} 比对完成，共${details.length}个字段`);
    } else {
      console.log(`\n行${rowNum} 无需比对的字段`);
    }
  }

  /**
   * 获取比对状态
   */
  private getComparisonStatus(
    tableValue: string | number,
    ocrValue: number | undefined
  ): 'match' | 'mismatch' | 'missing' {
    if (ocrValue === undefined) {
      return 'missing';
    }
    return this.compareValues(tableValue, ocrValue) ? 'match' : 'mismatch';
  }

  /**
   * 获取列索引
   */
  private getColIndex(headers: string[] | undefined, fieldName: string): number {
    if (!headers) return 0;
    const index = headers.findIndex(h => h === fieldName || h.includes(fieldName));
    return index >= 0 ? index : 0;
  }

  /**
   * 保存比对结果到内存存储
   */
  private async saveResults(taskId: string, details: ComparisonItem[], imageKey?: string, month?: string): Promise<void> {
    try {
      const records: ComparisonRecord[] = details.map((item: ComparisonItem) => ({
        task_id: taskId,
        shop_name: item.shopName,
        field_name: item.fieldName,
        table_value: String(item.tableValue),
        ocr_value: item.ocrValue !== undefined ? String(item.ocrValue) : null,
        status: item.status,
        sheet_name: item.sheetName,
        row_index: item.rowIndex,
        col_index: item.colIndex,
        cell_ref: item.cellRef,
        image_key: item.imageKey || imageKey,
        month: item.month || month,
        ocr_shop_name: item.ocrShopName || null,
        shop_name_match: item.shopNameMatch || null,
        ocr_month: item.ocrMonth || null,
        ocr_date_range: item.ocrDateRange || null,
        month_match: item.monthMatch || null,
        created_at: new Date().toISOString(),
      }));

      appendTaskResults(taskId, records);

    } catch (error) {
      console.error('保存比对结果失败:', error);
    }
  }

  /**
   * 获取比对结果
   */
  async getResults(taskId: string): Promise<ComparisonItem[]> {
    try {
      const data = getTaskResults(taskId);

      // 按行号、列号排序
      const sorted = [...data].sort((a, b) => {
        if (a.row_index !== b.row_index) return a.row_index - b.row_index;
        return (a.col_index || 0) - (b.col_index || 0);
      });

      return sorted.map(item => ({
        shopName: item.shop_name,
        fieldName: item.field_name,
        tableValue: item.table_value,
        ocrValue: item.ocr_value || undefined,
        status: item.status,
        sheetName: item.sheet_name,
        rowIndex: item.row_index,
        colIndex: item.col_index || 0,
        cellRef: item.cell_ref,
        month: item.month || undefined,
        imageKey: item.image_key || undefined,
        ocrShopName: item.ocr_shop_name || undefined,
        shopNameMatch: item.shop_name_match || undefined,
        ocrMonth: item.ocr_month || undefined,
        ocrDateRange: item.ocr_date_range || undefined,
        monthMatch: item.month_match || undefined,
      }));

    } catch (error) {
      console.error('获取比对结果失败:', error);
      return [];
    }
  }
}

// 导出单例
export const comparisonEngine = new ComparisonEngine();
