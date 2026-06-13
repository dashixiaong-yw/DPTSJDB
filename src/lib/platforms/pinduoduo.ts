/**
 * 拼多多平台处理器
 * 
 * 【独立模块】修改此文件不会影响其他平台（抖音、淘宝等）
 * 
 * 功能：
 * - 通过工作表名称识别拼多多平台
 * - 每行两张图片：M列（月度数据报表）+ N列（多多账单）
 * - M列比对：营业额、退款金额、月份核对
 * - N列比对：账单中退款金额、提现金额、账单中支出总额
 */

import { 
  PlatformHandler, 
  RowContext, 
  PlatformServices, 
  ComparisonItem 
} from './types';
import type { RowData } from '@/types/global';
import { 
  getBuiltinFieldMapping, 
  compareShopNames, 
  compareMonth, 
  extractOCRValue, 
  getComparisonStatus 
} from './base';

/**
 * 拼多多平台处理器
 */
export class PinduoduoHandler implements PlatformHandler {
  readonly name = '拼多多';
  
  /** 字段映射缓存 */
  private fieldMapping: Map<string, string> = new Map();
  
  /**
   * 识别是否为拼多多平台
   */
  identify(sheetName: string, headers: string[]): boolean {
    const sheetLower = sheetName.toLowerCase();
    const headersStr = headers.join(',').toLowerCase();
    
    // 通过工作表名称识别
    if (sheetLower.includes('拼多多')) {
      return true;
    }
    
    // 通过表头识别
    if (headersStr.includes('多多账单')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 处理单行数据
   * 
   * 拼多多平台特点：
   * - 每行两张图片：月度数据报表（M列）+ 多多账单（N列）
   * - M列比对：营业额、退款金额、月份核对
   * - N列比对：账单中退款金额、提现金额、账单中支出总额
   */
  async processRow(
    context: RowContext,
    services: PlatformServices
  ): Promise<{ detailCount: number }> {
    const { taskId, sheetName, rowIndex, rowData, imagesForRow, headers } = context;
    
    console.log(`\n[拼多多] 处理行${rowIndex}`);
    
    // 加载字段映射（每次重新加载，避免实例复用时缓存旧映射）
    this.fieldMapping = getBuiltinFieldMapping(this.name);
    
    // 获取两张图片
    const monthlyReportImg = imagesForRow.get('月度数据报表');
    const billImg = imagesForRow.get('多多账单');
    
    if (!monthlyReportImg && !billImg) {
      console.log(`[拼多多] 行${rowIndex} 无图片，跳过`);
      return { detailCount: 0 };
    }
    
    // 提取表格数据
    const tableShopName = this.getTableShopName(rowData);
    const tableMonth = this.getTableMonth(rowData);
    
    console.log(`[拼多多] 店铺: ${tableShopName}, 月份: ${tableMonth}`);
    
    let ocrResultMonthly = null;
    let ocrResultBill = null;
    let monthlyImageKey: string | undefined = undefined;
    let billImageKey: string | undefined = undefined;
    
    try {
      // 处理月度数据报表截图（M列）
      if (monthlyReportImg) {
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const imageFileName = `pdd_row_${rowIndex}_monthly_${randomSuffix}.png`;
        monthlyImageKey = await services.storageService.uploadFile({
          fileContent: monthlyReportImg.imageBuffer,
          fileName: imageFileName,
        });
        console.log(`[拼多多] 上传月度报表图片: ${imageFileName} -> ${monthlyImageKey}`);
        
        // OCR识别
        ocrResultMonthly = await services.ocrService.recognizeImage(
          monthlyImageKey, 
          this.name, 
          '月度数据报表',
          monthlyReportImg.md5
        );
        console.log(`[拼多多] 月度报表OCR: 店铺=${ocrResultMonthly.shop_name}, 月份=${ocrResultMonthly.month}`);
      }
      
      // 处理多多账单截图（N列）
      if (billImg) {
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const imageFileName = `pdd_row_${rowIndex}_bill_${randomSuffix}.png`;
        billImageKey = await services.storageService.uploadFile({
          fileContent: billImg.imageBuffer,
          fileName: imageFileName,
        });
        console.log(`[拼多多] 上传账单图片: ${imageFileName} -> ${billImageKey}`);
        
        // OCR识别
        ocrResultBill = await services.ocrService.recognizeImage(
          billImageKey, 
          this.name, 
          '多多账单',
          billImg.md5
        );
        console.log(`[拼多多] 账单OCR: 店铺=${ocrResultBill.shop_name}`);
      }
      
      // 构建比对项
      const details: ComparisonItem[] = [];
      
      // === M列 - 月度数据报表店铺名称比对 ===
      if (ocrResultMonthly?.shop_name && ocrResultMonthly.shop_name.trim() !== '') {
        const monthlyShopNameMatch = compareShopNames(tableShopName, ocrResultMonthly.shop_name);
        console.log(`[拼多多] 月度报表店铺比对: 表格="${tableShopName}" vs OCR="${ocrResultMonthly.shop_name}" => ${monthlyShopNameMatch}`);
        
        details.push({
          shopName: tableShopName,
          fieldName: '店铺名称（月度报表）',
          tableValue: tableShopName,
          ocrValue: 0, // 占位符，前端使用ocrShopName显示
          status: monthlyShopNameMatch === 'match' ? 'match' : 'mismatch',
          sheetName,
          rowIndex,
          colIndex: -1,
          cellRef: '',
          imageKey: monthlyImageKey,
          ocrShopName: ocrResultMonthly.shop_name,
          shopNameMatch: monthlyShopNameMatch,
          month: tableMonth,
        });
      } else if (ocrResultMonthly) {
        // OCR执行了但没有识别到店铺名称
        console.log(`[拼多多] 月度报表店铺名称未识别`);
        details.push({
          shopName: tableShopName,
          fieldName: '店铺名称（月度报表）',
          tableValue: tableShopName,
          ocrValue: 0,
          status: 'missing',
          sheetName,
          rowIndex,
          colIndex: -1,
          cellRef: '',
          imageKey: monthlyImageKey,
          ocrShopName: '',
          month: tableMonth,
        });
      }
      
      // === N列 - 多多账单店铺名称比对 ===
      if (ocrResultBill?.shop_name && ocrResultBill.shop_name.trim() !== '') {
        const billShopNameMatch = compareShopNames(tableShopName, ocrResultBill.shop_name);
        console.log(`[拼多多] 多多账单店铺比对: 表格="${tableShopName}" vs OCR="${ocrResultBill.shop_name}" => ${billShopNameMatch}`);
        
        details.push({
          shopName: tableShopName,
          fieldName: '店铺名称（多多账单）',
          tableValue: tableShopName,
          ocrValue: 0, // 占位符，前端使用ocrShopName显示
          status: billShopNameMatch === 'match' ? 'match' : 'mismatch',
          sheetName,
          rowIndex,
          colIndex: -1,
          cellRef: '',
          imageKey: billImageKey,
          ocrShopName: ocrResultBill.shop_name,
          shopNameMatch: billShopNameMatch,
          month: tableMonth,
        });
      } else if (ocrResultBill) {
        // OCR执行了但没有识别到店铺名称
        console.log(`[拼多多] 多多账单店铺名称未识别`);
        details.push({
          shopName: tableShopName,
          fieldName: '店铺名称（多多账单）',
          tableValue: tableShopName,
          ocrValue: 0,
          status: 'missing',
          sheetName,
          rowIndex,
          colIndex: -1,
          cellRef: '',
          imageKey: billImageKey,
          ocrShopName: '',
          month: tableMonth,
        });
      }
      
      // === M列（月度数据报表）字段比对 ===
      if (ocrResultMonthly) {
        console.log(`[拼多多] [M列 - 月度数据报表]`);
        
        // 1. 营业额
        const ocr营业额 = extractOCRValue('营业额', ocrResultMonthly, this.fieldMapping);
        const table营业额 = this.getFieldValue(rowData, '营业额');
        if (this.hasValue(table营业额)) {
          const status = getComparisonStatus(table营业额, ocr营业额);
          details.push(this.createComparisonItem(
            tableShopName, '营业额', table营业额, ocr营业额, status,
            sheetName, rowIndex, headers, monthlyImageKey, ocrResultMonthly.shop_name, tableMonth
          ));
          console.log(`[拼多多]   营业额: 表格=${table营业额}, OCR=${ocr营业额}, 状态=${status}`);
        }
        
        // 2. 退款金额
        const ocr退款金额 = extractOCRValue('退款金额', ocrResultMonthly, this.fieldMapping);
        const table退款金额 = this.getFieldValue(rowData, '退款金额');
        if (this.hasValue(table退款金额)) {
          const status = getComparisonStatus(table退款金额, ocr退款金额);
          details.push(this.createComparisonItem(
            tableShopName, '退款金额', table退款金额, ocr退款金额, status,
            sheetName, rowIndex, headers, monthlyImageKey, ocrResultMonthly.shop_name, tableMonth
          ));
          console.log(`[拼多多]   退款金额: 表格=${table退款金额}, OCR=${ocr退款金额}, 状态=${status}`);
        }
        
        // 3. 月份核对
        if (tableMonth) {
          const monthMatch = compareMonth(tableMonth, ocrResultMonthly);
          // 根据monthMatch确定status：match=一致，not_full_month=日期不完整，mismatch=不一致
          let status: 'match' | 'mismatch' | 'missing';
          let displayValue = ocrResultMonthly.month || ocrResultMonthly.date_range?.actual_month || '';
          
          if (monthMatch === 'match') {
            status = 'match';
          } else if (monthMatch === 'not_full_month') {
            // 日期不完整但月份匹配时，显示为一致（因为月份本身是正确的）
            status = 'match';
            displayValue = `${ocrResultMonthly.month || ''}（日期不完整）`;
          } else {
            status = 'mismatch';
          }
          
          details.push({
            shopName: tableShopName,
            fieldName: '月份核对',
            tableValue: tableMonth,
            ocrValue: displayValue,
            status,
            sheetName,
            rowIndex,
            colIndex: this.getColIndex(headers, '账单月份'),
            cellRef: '',
            imageKey: monthlyImageKey,
            ocrShopName: ocrResultMonthly.shop_name,
            month: tableMonth,
            ocrMonth: ocrResultMonthly.month,
            ocrDateRange: ocrResultMonthly.date_range,
            monthMatch,
          });
          console.log(`[拼多多]   月份核对: 表格=${tableMonth}, OCR月份=${ocrResultMonthly.month}, 日期范围=${JSON.stringify(ocrResultMonthly.date_range)}, 状态=${monthMatch}`);
        }
      }
      
      // === N列（多多账单）字段比对 ===
      if (ocrResultBill) {
        console.log(`[拼多多] [N列 - 多多账单]`);
        
        // 1. 账单中退款金额
        const ocr账单退款 = extractOCRValue('账单中退款金额', ocrResultBill, this.fieldMapping) ||
                           extractOCRValue('退款金额', ocrResultBill, this.fieldMapping);
        const table账单退款 = this.getFieldValue(rowData, '账单中退款金额');
        if (this.hasValue(table账单退款)) {
          const status = getComparisonStatus(table账单退款, ocr账单退款);
          details.push(this.createComparisonItem(
            tableShopName, '账单中退款金额', table账单退款, ocr账单退款, status,
            sheetName, rowIndex, headers, billImageKey, ocrResultBill.shop_name, tableMonth
          ));
          console.log(`[拼多多]   账单中退款金额: 表格=${table账单退款}, OCR=${ocr账单退款}, 状态=${status}`);
        }
        
        // 2. 提现金额（精确匹配，如果OCR没有则默认为0）
        // 注意：OCR可能识别出"转账支出金额"，但这不是"提现金额"
        // 如果账单中没有"提现金额"选项，代表客户没有提现，默认为0
        const ocr提现 = extractOCRValue('提现金额', ocrResultBill, this.fieldMapping);
        const table提现 = this.getFieldValue(rowData, '提现金额');
        if (this.hasValue(table提现)) {
          // 如果OCR没有识别到"提现金额"，则默认为0（代表没有提现）
          const actualOcr提现 = ocr提现 ?? 0;
          const status = getComparisonStatus(table提现, actualOcr提现);
          details.push(this.createComparisonItem(
            tableShopName, '提现金额', table提现, actualOcr提现, status,
            sheetName, rowIndex, headers, billImageKey, ocrResultBill.shop_name, tableMonth
          ));
          console.log(`[拼多多]   提现金额: 表格=${table提现}, OCR=${actualOcr提现}${ocr提现 === undefined ? '（默认值，OCR未识别到提现金额）' : ''}, 状态=${status}`);
        }
        
        // 3. 账单中支出总额
        const ocr支出 = extractOCRValue('账单中支出总额', ocrResultBill, this.fieldMapping) ||
                        extractOCRValue('支出总额', ocrResultBill, this.fieldMapping) ||
                        extractOCRValue('支出', ocrResultBill, this.fieldMapping);
        const table支出 = this.getFieldValue(rowData, '账单中支出总额');
        if (this.hasValue(table支出)) {
          const status = getComparisonStatus(table支出, ocr支出);
          details.push(this.createComparisonItem(
            tableShopName, '账单中支出总额', table支出, ocr支出, status,
            sheetName, rowIndex, headers, billImageKey, ocrResultBill.shop_name, tableMonth
          ));
          console.log(`[拼多多]   账单中支出总额: 表格=${table支出}, OCR=${ocr支出}, 状态=${status}`);
        }
      }
      
      // 保存结果
      if (details.length > 0) {
        await services.resultService.saveResults(
          taskId, 
          details, 
          monthlyImageKey || billImageKey, 
          tableMonth
        );
        console.log(`[拼多多] 行${rowIndex} 比对完成，共${details.length}个字段`);
      } else {
        console.log(`[拼多多] 行${rowIndex} 无需比对的字段`);
      }
      
      return { detailCount: details.length };
      
    } catch (error) {
      console.error(`[拼多多] 处理行${rowIndex}失败:`, error);
      return { detailCount: 0 };
    }
  }
  
  /**
   * 创建比对项
   */
  private createComparisonItem(
    shopName: string,
    fieldName: string,
    tableValue: string | number,
    ocrValue: number | undefined,
    status: 'match' | 'mismatch' | 'missing',
    sheetName: string,
    rowIndex: number,
    headers: string[],
    imageKey?: string,
    ocrShopName?: string,
    month?: string
  ): ComparisonItem {
    return {
      shopName,
      fieldName,
      tableValue,
      ocrValue,
      status,
      sheetName,
      rowIndex,
      colIndex: this.getColIndex(headers, fieldName),
      cellRef: '',
      imageKey,
      ocrShopName,
      month,
    };
  }
  
  /**
   * 获取表格中的店铺名称
   */
  private getTableShopName(rowData: RowData): string {
    return String(rowData['店铺名称（必填）'] || rowData['店铺名称'] || rowData['店铺名'] || '未知店铺');
  }
  
  /**
   * 获取表格中的月份
   */
  private getTableMonth(rowData: RowData): string | undefined {
    const month = rowData['账单月份（必填）'] || rowData['账单月份'] || rowData['月份'];
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
    // 模糊匹配（支持带后缀如"营业额（必填）"）
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
export const pinduoduoHandler = new PinduoduoHandler();
