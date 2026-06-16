/**
 * 抖音平台处理器
 * 
 * 【独立模块】修改此文件不会影响其他平台（拼多多、淘宝等）
 * 
 * 功能：
 * - 通过工作表名称识别抖音平台
 * - 支持两张图片，按图片分组独立比对：
 *   - 店铺月度数据截图（L列）：识别成交金额、退款金额、投放消耗 + 店铺名称 + 月份
 *   - 支出总额截图（N列）：识别支出金额 + 店铺名称
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
  extractOCRValue,
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
   * 抖音平台特点（分组比对模式，与拼多多一致）：
   * - 店铺月度数据截图（L列）：独立比对成交金额、退款金额、投放消耗 + 店铺名称 + 月份
   * - 支出总额截图（N列）：独立比对支出金额 + 店铺名称
   * - 每组比对项使用各自图片的 imageKey，避免数据混合
   */
  async processRow(
    context: RowContext,
    services: PlatformServices
  ): Promise<{ detailCount: number }> {
    const { taskId, sheetName, rowIndex, rowData, imagesForRow, headers } = context;
    
    console.log(`\n[抖音] 处理行${rowIndex}`);
    
    // 加载字段映射（每次重新加载，避免实例复用时缓存旧映射）
    this.fieldMapping = getBuiltinFieldMapping(this.name);
    
    // 提取表格数据
    const tableShopName = this.getTableShopName(rowData);
    const tableMonth = this.getTableMonth(rowData);
    
    // 获取两张图片
    const shopMonthlyImage = imagesForRow.get(IMAGE_CONFIGS.SHOP_MONTHLY_DATA.imageType) || null;
    const expenseImage = imagesForRow.get(IMAGE_CONFIGS.EXPENSE_TOTAL.imageType) || null;
    
    if (!shopMonthlyImage && !expenseImage) {
      console.log(`[抖音] 行${rowIndex} 无任何图片，跳过`);
      return { detailCount: 0 };
    }
    
    try {
      // 并发处理两张图片的OCR识别
      const shopMonthlyTask = shopMonthlyImage 
        ? this.processImage(shopMonthlyImage, IMAGE_CONFIGS.SHOP_MONTHLY_DATA.imageType, taskId, rowIndex, services)
        : null;
      const expenseTask = expenseImage
        ? this.processImage(expenseImage, IMAGE_CONFIGS.EXPENSE_TOTAL.imageType, taskId, rowIndex, services)
        : null;

      const [shopMonthlyResult, expenseResult] = await Promise.all([shopMonthlyTask, expenseTask]);
      
      const details: ComparisonItem[] = [];
      
      // === L列 - 店铺月度数据截图：独立比对 ===
      if (shopMonthlyResult) {
        const monthlyImageKey = shopMonthlyResult.imageKey;
        const resolvedMonth = tableMonth || shopMonthlyResult.month || '';
        
        console.log(`[抖音] [L列 - 店铺月度数据截图]`);
        
        // 店铺名称比对
        const shopNameMatch = compareShopNames(tableShopName, shopMonthlyResult.shop_name);
        details.push({
          shopName: tableShopName,
          fieldName: '店铺名称（月度数据截图）',
          tableValue: tableShopName,
          ocrValue: shopMonthlyResult.shop_name ? 0 : undefined,
          status: shopNameMatch === 'match' ? 'match' : 'mismatch',
          sheetName,
          rowIndex,
          colIndex: -1,
          cellRef: '',
          imageKey: monthlyImageKey,
          ocrShopName: shopMonthlyResult.shop_name,
          shopNameMatch,
          month: resolvedMonth,
        });
        console.log(`[抖音]   店铺名称: 表格="${tableShopName}" vs OCR="${shopMonthlyResult.shop_name}" => ${shopNameMatch}`);
        
        // 月份比对
        if (resolvedMonth) {
          const monthMatch = compareMonth(resolvedMonth, shopMonthlyResult);
          details.push({
            shopName: tableShopName,
            fieldName: '月份',
            tableValue: resolvedMonth,
            ocrValue: shopMonthlyResult.month ? 0 : undefined,
            status: monthMatch === 'match' ? 'match' : 'mismatch',
            sheetName,
            rowIndex,
            colIndex: -1,
            cellRef: '',
            imageKey: monthlyImageKey,
            ocrShopName: shopMonthlyResult.shop_name,
            month: resolvedMonth,
            ocrMonth: shopMonthlyResult.month,
            ocrDateRange: shopMonthlyResult.date_range,
            monthMatch,
          });
          console.log(`[抖音]   月份: 表格="${resolvedMonth}" vs OCR="${shopMonthlyResult.month}" => ${monthMatch}`);
        }
        
        // 数值字段比对：成交金额、退款金额、投放消耗
        for (const fieldName of IMAGE_CONFIGS.SHOP_MONTHLY_DATA.fields) {
          const tableValue = this.getFieldValue(rowData, fieldName);
          if (!this.hasValue(tableValue)) continue;
          
          const ocrValue = extractOCRValue(fieldName, shopMonthlyResult, this.fieldMapping);
          const status = getComparisonStatus(tableValue, ocrValue);
          const colIndex = this.getColIndex(headers, fieldName);
          
          details.push({
            shopName: tableShopName,
            fieldName,
            tableValue,
            ocrValue,
            status,
            sheetName,
            rowIndex,
            colIndex,
            cellRef: `${String.fromCharCode(65 + colIndex)}${rowIndex}`,
            imageKey: monthlyImageKey,
            month: resolvedMonth,
            ocrShopName: shopMonthlyResult.shop_name,
          });
          console.log(`[抖音]   ${fieldName}: 表格=${tableValue}, OCR=${ocrValue}, 状态=${status}`);
        }
      } else if (shopMonthlyImage) {
        console.log(`[抖音] 行${rowIndex} 店铺月度数据截图OCR失败`);
      }
      
      // === N列 - 支出总额截图：独立比对 ===
      if (expenseResult) {
        const expenseImageKey = expenseResult.imageKey;
        const resolvedMonth = tableMonth || expenseResult.month || '';
        
        console.log(`[抖音] [N列 - 支出总额截图]`);
        
        // 店铺名称比对
        const shopNameMatch = compareShopNames(tableShopName, expenseResult.shop_name);
        details.push({
          shopName: tableShopName,
          fieldName: '店铺名称（支出总额截图）',
          tableValue: tableShopName,
          ocrValue: expenseResult.shop_name ? 0 : undefined,
          status: shopNameMatch === 'match' ? 'match' : 'mismatch',
          sheetName,
          rowIndex,
          colIndex: -1,
          cellRef: '',
          imageKey: expenseImageKey,
          ocrShopName: expenseResult.shop_name,
          shopNameMatch,
          month: resolvedMonth,
        });
        console.log(`[抖音]   店铺名称: 表格="${tableShopName}" vs OCR="${expenseResult.shop_name}" => ${shopNameMatch}`);
        
        // 数值字段比对：支出金额
        for (const fieldName of IMAGE_CONFIGS.EXPENSE_TOTAL.fields) {
          const tableValue = this.getFieldValue(rowData, fieldName);
          if (!this.hasValue(tableValue)) continue;
          
          const ocrValue = extractOCRValue(fieldName, expenseResult, this.fieldMapping);
          const status = getComparisonStatus(tableValue, ocrValue);
          const colIndex = this.getColIndex(headers, fieldName);
          
          details.push({
            shopName: tableShopName,
            fieldName,
            tableValue,
            ocrValue,
            status,
            sheetName,
            rowIndex,
            colIndex,
            cellRef: `${String.fromCharCode(65 + colIndex)}${rowIndex}`,
            imageKey: expenseImageKey,
            month: resolvedMonth,
            ocrShopName: expenseResult.shop_name,
          });
          console.log(`[抖音]   ${fieldName}: 表格=${tableValue}, OCR=${ocrValue}, 状态=${status}`);
        }
      } else if (expenseImage) {
        console.log(`[抖音] 行${rowIndex} 支出总额截图OCR失败`);
      }
      
      // 保存结果
      if (details.length > 0) {
        const mainImageKey = shopMonthlyResult?.imageKey || expenseResult?.imageKey || '';
        const resolvedMonth = tableMonth || shopMonthlyResult?.month || expenseResult?.month || '';
        await services.resultService.saveResults(taskId, details, mainImageKey, resolvedMonth);
        console.log(`[抖音] 行${rowIndex} 比对完成，共${details.length}个字段`);
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
      // 检查图片大小，跳过异常小图
      const MIN_IMAGE_SIZE = 1024; // 1KB
      if (image.imageBuffer.length < MIN_IMAGE_SIZE) {
        console.warn(`[抖音] 图片过小(${image.imageBuffer.length} bytes)，跳过OCR识别: ${imageType} 行${rowIndex}`);
        return null;
      }

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
  private getFieldValue(rowData: RowData, fieldPattern: string): string | number | undefined {
    // 精确匹配
    if (rowData[fieldPattern] !== undefined) {
      return rowData[fieldPattern] ?? undefined;
    }
    // 模糊匹配（支持带后缀如"成交金额（必填）"）
    for (const key of Object.keys(rowData)) {
      if (key.includes(fieldPattern)) {
        return rowData[key] ?? undefined;
      }
    }
    return undefined;
  }
  
  /**
   * 判断值是否有效
   */
  private hasValue(value: unknown): value is string | number {
    return value !== undefined && value !== null && value !== '';
  }
  
  /**
   * 获取列索引
   */
  private getColIndex(headers: string[], fieldName: string): number {
    // 精确匹配
    const exactIndex = headers.findIndex(h => h === fieldName);
    if (exactIndex >= 0) return exactIndex;
    // 模糊匹配
    const fuzzyIndex = headers.findIndex(h => h.includes(fieldName));
    return fuzzyIndex >= 0 ? fuzzyIndex : 0;
  }
}

// 导出单例
export const douyinHandler = new DouyinHandler();
