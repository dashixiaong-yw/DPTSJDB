/**
 * 抖音平台处理器
 * 
 * 【独立模块】修改此文件不会影响其他平台（拼多多、淘宝等）
 * 
 * 功能：
 * - 通过工作表名称识别抖音平台
 * - 支持两张图片：
 *   - 店铺月度数据截图（L列）：识别成交金额、退款金额、投放消耗
 *   - 支出总额截图（N列）：识别支出金额
 * - 数据缺失返回0
 */

import { 
  PlatformHandler, 
  RowContext, 
  PlatformServices, 
  ComparisonItem,
  ExcelImage 
} from './types';
import type { RowData } from '@/types/global';
import { OCRResult } from '../ocr-service';
import { 
  getBuiltinFieldMapping, 
  compareShopNames, 
  compareMonth, 
  getComparisonStatus 
} from './base';

/**
 * 图片类型配置
 * 注意：K列作为L列的备选，如果L列没有图片则使用K列
 */
const IMAGE_CONFIGS = {
  // 店铺月度数据截图（L列，索引11；K列备选，索引10）
  SHOP_MONTHLY_DATA: {
    colIndex: 11, // L列（主）
    backupColIndex: 10, // K列（备选）
    colLetter: 'L',
    backupColLetter: 'K',
    imageType: '店铺月度数据截图',
    fields: ['成交金额', '退款金额', '投放消耗'], // 该图片识别的字段
  },
  // 支出总额截图（N列，索引13）
  EXPENSE_TOTAL: {
    colIndex: 13, // N列
    colLetter: 'N',
    imageType: '支出总额截图',
    fields: ['支出金额'], // 该图片识别的字段
  },
};

/**
 * 抖音平台处理器
 */
export class DouyinHandler implements PlatformHandler {
  readonly name = '抖音';
  
  /** 字段映射缓存 */
  private fieldMapping: Map<string, string> = new Map();
  
  /**
   * 识别是否为抖音平台
   */
  identify(sheetName: string, headers: string[]): boolean {
    const sheetLower = sheetName.toLowerCase();
    const headersStr = headers.join(',').toLowerCase();
    
    // 通过工作表名称识别
    if (sheetLower.includes('抖店') || sheetLower.includes('抖音')) {
      return true;
    }
    
    // 通过表头识别
    if (headersStr.includes('抖店')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 处理单行数据
   * 
   * 抖音平台特点：
   * - 两张图片：店铺月度数据截图（L列）、支出总额截图（N列）
   * - 店铺月度数据截图识别：成交金额、退款金额、投放消耗
   * - 支出总额截图识别：支出金额
   * - 数据缺失返回0
   */
  async processRow(
    context: RowContext,
    services: PlatformServices
  ): Promise<{ detailCount: number }> {
    const { taskId, sheetName, rowIndex, rowData, imagesForRow, headers } = context;
    
    console.log(`\n[抖音] 处理行${rowIndex}`);
    
    // 加载字段映射（每次重新加载，避免实例复用时缓存旧映射）
    this.fieldMapping = getBuiltinFieldMapping(this.name);
    
    // OCR结果缓存
    const ocrResults: Record<string, OCRResult & { imageKey?: string }> = {};
    
    try {
      // 并发处理两张图片的OCR识别（提升性能）
      const shopMonthlyImage = imagesForRow.get(IMAGE_CONFIGS.SHOP_MONTHLY_DATA.imageType) || null;
      const expenseImage = imagesForRow.get(IMAGE_CONFIGS.EXPENSE_TOTAL.imageType) || null;
      
      const shopMonthlyTask = shopMonthlyImage 
        ? this.processImage(shopMonthlyImage, IMAGE_CONFIGS.SHOP_MONTHLY_DATA.imageType, taskId, rowIndex, services)
        : null;
      const expenseTask = expenseImage
        ? this.processImage(expenseImage, IMAGE_CONFIGS.EXPENSE_TOTAL.imageType, taskId, rowIndex, services)
        : null;

      const [shopMonthlyResult, expenseResult] = await Promise.all([shopMonthlyTask, expenseTask]);
      
      // 如果没有任何图片，跳过
      if (!shopMonthlyImage && !expenseImage) {
        console.log(`[抖音] 行${rowIndex} 无任何图片，跳过`);
        return { detailCount: 0 };
      }
      
      // 记录OCR结果
      if (shopMonthlyResult) {
        console.log(`[抖音] 行${rowIndex} 店铺月度数据截图OCR完成`);
        ocrResults.shopMonthly = shopMonthlyResult;
      } else if (shopMonthlyImage) {
        console.log(`[抖音] 行${rowIndex} 店铺月度数据截图OCR失败`);
      } else {
        console.log(`[抖音] 行${rowIndex} 无店铺月度数据截图`);
      }
      
      if (expenseResult) {
        console.log(`[抖音] 行${rowIndex} 支出总额截图OCR完成`);
        ocrResults.expense = expenseResult;
      } else if (expenseImage) {
        console.log(`[抖音] 行${rowIndex} 支出总额截图OCR失败`);
      } else {
        console.log(`[抖音] 行${rowIndex} 无支出总额截图（N列）`);
      }
      
      // 提取表格数据
      const tableShopName = this.getTableShopName(rowData);
      const tableMonth = this.getTableMonth(rowData) || ocrResults.shopMonthly?.month || '';
      
      // 合并OCR数据
      const mergedOcrResult = this.mergeOcrResults(ocrResults);
      
      // 构建比对项
      const details: ComparisonItem[] = [];
      const mainImageKey = ocrResults.shopMonthly?.imageKey || ocrResults.expense?.imageKey || '';
      
      // 比对数值字段
      headers.forEach((header, colIndex) => {
        // 跳过不需要比对的列
        if (this.shouldSkipField(header)) {
          return;
        }
        
        const value = this.getFieldValue(rowData, header);
        if (value === undefined || value === null || value === '') {
          return;
        }
        
        const ocrValue = this.extractOcrValueByField(header, mergedOcrResult);
        const status = getComparisonStatus(value, ocrValue);
        
        details.push({
          shopName: tableShopName,
          fieldName: header,
          tableValue: value,
          ocrValue,
          status,
          sheetName,
          rowIndex,
          colIndex,
          cellRef: `${String.fromCharCode(65 + colIndex)}${rowIndex}`,
          month: tableMonth,
          imageKey: mainImageKey,
        });
        
        console.log(`[抖音]   ${header}: 表格=${value}, OCR=${ocrValue}, 状态=${status}`);
      });
      
      // 按列号排序
      details.sort((a, b) => a.colIndex - b.colIndex);
      
      // 添加店铺名称比对（使用店铺月度数据截图的识别结果）
      if (ocrResults.shopMonthly) {
        const shopNameMatch = compareShopNames(tableShopName, ocrResults.shopMonthly.shop_name);
        details.unshift({
          shopName: tableShopName,
          fieldName: '店铺名称',
          tableValue: tableShopName,
          ocrValue: ocrResults.shopMonthly.shop_name ? 0 : undefined,
          status: shopNameMatch === 'match' ? 'match' : 'mismatch',
          sheetName,
          rowIndex,
          colIndex: -1,
          cellRef: '',
          imageKey: mainImageKey,
          ocrShopName: ocrResults.shopMonthly.shop_name,
          shopNameMatch,
          month: tableMonth,
        });
        console.log(`[抖音]   店铺名称: 表格="${tableShopName}" vs OCR="${ocrResults.shopMonthly.shop_name}" => ${shopNameMatch}`);
        
        // 添加月份比对
        if (tableMonth) {
          const monthMatch = compareMonth(tableMonth, ocrResults.shopMonthly);
          details.splice(1, 0, {
            shopName: tableShopName,
            fieldName: '月份',
            tableValue: tableMonth,
            ocrValue: ocrResults.shopMonthly.month ? 0 : undefined,
            status: monthMatch === 'match' ? 'match' : 'mismatch',
            sheetName,
            rowIndex,
            colIndex: -1,
            cellRef: '',
            imageKey: mainImageKey,
            ocrShopName: ocrResults.shopMonthly.shop_name,
            month: tableMonth,
            ocrMonth: ocrResults.shopMonthly.month,
            ocrDateRange: ocrResults.shopMonthly.date_range,
            monthMatch,
          });
          console.log(`[抖音]   月份: 表格="${tableMonth}" vs OCR="${ocrResults.shopMonthly.month}" => ${monthMatch}`);
        }
      }
      
      // 保存结果
      if (details.length > 0) {
        await services.resultService.saveResults(taskId, details, mainImageKey, tableMonth);
      }
      
      return { detailCount: details.length };
      
    } catch (error) {
      console.error(`[抖音] 处理行${rowIndex}失败:`, error);
      return { detailCount: 0 };
    }
  }
  
  /**
   * 处理单张图片
   */
  private async processImage(
    image: ExcelImage,
    imageType: string,
    taskId: string,
    rowIndex: number,
    services: PlatformServices
  ): Promise<(OCRResult & { imageKey: string }) | null> {
    try {
      // 上传图片
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const imageFileName = `douyin_${imageType}_row_${rowIndex}_${randomSuffix}.png`;
      const imageKey = await services.storageService.uploadFile({
        fileContent: image.imageBuffer,
        fileName: imageFileName,
      });
      console.log(`[抖音] 上传图片: ${imageFileName} -> ${imageKey}`);
      
      // OCR识别
      const ocrResult = await services.ocrService.recognizeImage(
        imageKey,
        this.name,
        imageType,
        image.md5
      );
      console.log(`[抖音] OCR结果(${imageType}):`, JSON.stringify(ocrResult.amounts || {}));
      
      if (ocrResult.error) {
        console.error(`[抖音] OCR识别失败(${imageType}):`, ocrResult.error);
        return null;
      }
      
      return {
        ...ocrResult,
        imageKey,
      };
    } catch (error) {
      console.error(`[抖音] 处理图片失败(${imageType}):`, error);
      return null;
    }
  }
  
  /**
   * 合并多个OCR结果
   */
  private mergeOcrResults(ocrResults: Record<string, OCRResult>): Partial<OCRResult> {
    const merged: Partial<OCRResult> & { amounts: Record<string, number> } = {
      shop_name: '',
      month: '',
      amounts: {},
    };
    
    // 店铺月度数据截图的结果
    if (ocrResults.shopMonthly) {
      merged.shop_name = ocrResults.shopMonthly.shop_name || '';
      merged.month = ocrResults.shopMonthly.month || '';
      merged.date_range = ocrResults.shopMonthly.date_range;
      if (ocrResults.shopMonthly.amounts) {
        Object.assign(merged.amounts, ocrResults.shopMonthly.amounts);
      }
    }
    
    // 支出总额截图的结果
    if (ocrResults.expense) {
      if (!merged.shop_name && ocrResults.expense.shop_name) {
        merged.shop_name = ocrResults.expense.shop_name;
      }
      if (!merged.month && ocrResults.expense.month) {
        merged.month = ocrResults.expense.month;
      }
      if (ocrResults.expense.amounts) {
        Object.assign(merged.amounts, ocrResults.expense.amounts);
      }
    }
    
    return merged;
  }
  
  /**
   * 根据字段名提取OCR值
   */
  private extractOcrValueByField(fieldName: string, ocrResult: OCRResult): number | undefined {
    if (!ocrResult || !ocrResult.amounts) {
      return undefined;
    }
    
    // 字段名映射
    const fieldMapping: Record<string, string[]> = {
      '成交金额': ['成交金额', '成交额', '成交'],
      '退款金额': ['退款金额', '退款'],
      '投放消耗': ['投放消耗', '投放', '消耗'],
      '支出金额': ['支出金额', '支出', '总支出', '支出总额'],
    };
    
    const aliases = fieldMapping[fieldName] || [fieldName];
    for (const alias of aliases) {
      for (const key of Object.keys(ocrResult.amounts)) {
        if (key.includes(alias) || alias.includes(key)) {
          const value = ocrResult.amounts[key];
          if (typeof value === 'number' && !isNaN(value)) {
            return value;
          }
        }
      }
    }
    
    return undefined;
  }
  
  /**
   * 判断是否跳过该字段
   */
  private shouldSkipField(fieldName: string): boolean {
    const skipKeywords = [
      '负责人', '店铺名', '店铺名称', '月份', '账单月份',
      '备注', '提交者', '提交时间',
      '截图', '图片', '上传', '凭证', '影像',
      '小额打款后台数据',  // 图片项，不需要比对
      '刷单金额',  // 不需要比对的数据项
      '小额打款',  // 不需要比对的数据项
      '其他费用',  // 不需要比对的数据项
      '刷单记录',  // 图片项
    ];
    return skipKeywords.some(skip => fieldName.includes(skip));
  }
  
  /**
   * 获取表格中的店铺名称
   */
  private getTableShopName(rowData: RowData): string {
    return String(rowData['店铺名'] || rowData['店铺名称'] || rowData['店铺'] || '未知店铺');
  }
  
  /**
   * 获取表格中的月份
   */
  private getTableMonth(rowData: RowData): string | undefined {
    const month = rowData['账单月份'] || rowData['月份'];
    return month !== undefined && month !== null ? String(month) : undefined;
  }
  
  /**
   * 获取字段值（支持模糊匹配）
   */
  private getFieldValue(rowData: RowData, fieldPattern: string): string | number | null | undefined {
    // 精确匹配
    if (rowData[fieldPattern] !== undefined) {
      return rowData[fieldPattern];
    }
    // 模糊匹配
    for (const key of Object.keys(rowData)) {
      if (key.includes(fieldPattern) || fieldPattern.includes(key)) {
        return rowData[key];
      }
    }
    return undefined;
  }
}

// 导出单例
export const douyinHandler = new DouyinHandler();
