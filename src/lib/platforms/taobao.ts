/**
 * 淘宝平台处理器
 * 
 * 【独立模块】修改此文件不会影响其他平台（抖音、拼多多等）
 * 
 * 功能：
 * - 通过工作表名称识别淘宝平台
 * - 每行多张图片，分别对应不同的数据字段
 * - 支持店铺名称模糊匹配、月份核对
 * 
 * 数据字段与图片映射关系：
 * - 营业额、退款、淘宝客 → 店铺数据截图（列22）
 * - 万相台无界 → 万相台无界版截图（列23）
 * - 小额打款 → 小额打款后台数据（列24）
 * - 红包签到 → 红包签到佣金截图（列26）
 * - 公益宝贝 → 公益宝贝佣金截图（列27）
 * - 先用后付、技术服务费 → 淘宝平台技术截图（列29）
 * - 商家集运 → 偏远集运仓截图（列30）
 * - 跨境服务 → 跨境服务截图（列31）
 * - 淘金币服务 → 淘金币服务截图（列32）
 * 
 * 跳过比对的字段：
 * - 刷单、新客礼金、售后运费
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
 * 图片类型定义
 */
interface ImageTypeConfig {
  imageType: string;
  fields: string[];
  colIndex: number; // 用于排序的列索引
}

/**
 * 所有图片类型配置（按表格列顺序）
 */
const IMAGE_TYPE_CONFIGS: ImageTypeConfig[] = [
  { imageType: '店铺数据截图', fields: ['营业额', '退款', '淘宝客'], colIndex: 5 },
  { imageType: '万相台无界版截图', fields: ['万相台无界'], colIndex: 9 },
  { imageType: '小额打款后台数据', fields: ['小额打款'], colIndex: 10 },
  { imageType: '红包签到佣金截图', fields: ['红包签到'], colIndex: 12 },
  { imageType: '公益宝贝佣金截图', fields: ['公益宝贝'], colIndex: 13 },
  // 淘宝平台技术截图包含：先用后付、技术服务费、跨境服务、淘金币服务（都在同一张截图中）
  { imageType: '淘宝平台技术截图', fields: ['先用后付', '技术服务费', '跨境服务', '淘金币服务'], colIndex: 15 },
  { imageType: '偏远集运仓截图', fields: ['商家集运'], colIndex: 17 },
];

/**
 * 字段到图片类型的映射
 */
const FIELD_TO_IMAGE_TYPE: Record<string, string> = {};
IMAGE_TYPE_CONFIGS.forEach(config => {
  config.fields.forEach(field => {
    FIELD_TO_IMAGE_TYPE[field] = config.imageType;
  });
});

/**
 * 跳过比对的字段
 */
const SKIP_FIELDS = ['刷单', '新客礼金', '售后运费'];

/**
 * 淘宝平台处理器
 */
export class TaobaoHandler implements PlatformHandler {
  readonly name = '淘宝';
  
  /** 字段映射缓存 */
  private fieldMapping: Map<string, string> = new Map();
  
  /** OCR结果缓存（同一张图片可能对应多个字段） */
  private ocrCache: Map<string, OCRResult> = new Map();
  
  /**
   * 识别是否为淘宝平台
   */
  identify(sheetName: string, headers: string[]): boolean {
    const sheetLower = sheetName.toLowerCase();
    const headersStr = headers.join(',').toLowerCase();
    
    // 通过工作表名称识别
    if (sheetLower.includes('淘宝') || sheetLower.includes('天猫')) {
      return true;
    }
    
    // 通过表头识别 - 淘宝特有的字段
    if (headersStr.includes('万相台无界') || headersStr.includes('淘宝客') || headersStr.includes('淘金币服务')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 处理单行数据
   * 
   * 淘宝平台特点：
   * - 按图片类型处理，每个图片都核对店铺名称
   * - 每个数据字段按表格列顺序显示
   */
  async processRow(
    context: RowContext,
    services: PlatformServices
  ): Promise<{ detailCount: number }> {
    const { taskId, sheetName, rowIndex, rowData, imagesForRow, headers: _headers } = context;
    
    console.log(`\n[淘宝] 处理行${rowIndex}`);
    
    // 清理缓存
    this.ocrCache.clear();
    
    // 加载字段映射（每次重新加载，避免实例复用时缓存旧映射）
    this.fieldMapping = getBuiltinFieldMapping(this.name);
    
    // 提取表格数据
    const tableShopName = this.getTableShopName(rowData);
    const tableMonth = this.getTableMonth(rowData);
    
    console.log(`[淘宝] 店铺: ${tableShopName}, 月份: ${tableMonth}`);
    
    if (imagesForRow.size === 0) {
      console.log(`[淘宝] 行${rowIndex} 无图片，跳过`);
      return { detailCount: 0 };
    }
    
    // 构建比对项
    const details: ComparisonItem[] = [];
    
    // 第一阶段：收集所有需要OCR的图片，并发上传和识别
    const ocrTasks: Array<{
      config: typeof IMAGE_TYPE_CONFIGS[number];
      image: ExcelImage;
      task: Promise<{ imageKey: string; ocrResult: OCRResult } | null>;
    }> = [];
    
    for (const config of IMAGE_TYPE_CONFIGS) {
      const { imageType, fields, colIndex } = config;
      const image = imagesForRow.get(imageType);
      if (!image) continue;
      
      // 预先检查该图片类型下所有字段的值
      const fieldValues: Array<{ fieldName: string; colIndex: number; value: number | string }> = [];
      for (let i = 0; i < fields.length; i++) {
        const fieldName = fields[i];
        const fieldColIndex = colIndex + i;
        if (SKIP_FIELDS.some(f => fieldName.includes(f))) continue;
        const tableValue = this.getTableValue(rowData, fieldName);
        if (tableValue === '' || tableValue === null || tableValue === undefined) continue;
        fieldValues.push({ fieldName, colIndex: fieldColIndex, value: tableValue });
      }
      
      // 判断是否需要OCR
      const needOCR = imageType === '店铺数据截图' || 
        fieldValues.some(fv => fv.value !== 0 && fv.value !== '0');
      
      if (!needOCR && fieldValues.length > 0) {
        // 所有字段值都是0，直接填写0，不需要OCR识别
        console.log(`[淘宝] 图片类型 ${imageType} 所有字段值为0，跳过OCR直接填写`);
        for (const fv of fieldValues) {
          details.push({
            shopName: tableShopName,
            fieldName: fv.fieldName,
            tableValue: 0,
            ocrValue: 0,
            status: 'match',
            sheetName,
            rowIndex,
            colIndex: fv.colIndex,
            cellRef: this.colIndexToRef(fv.colIndex, rowIndex),
            imageKey: '',
            month: tableMonth,
            isZeroValue: true,
          });
        }
        continue;
      }
      
      // 需要OCR，加入并发任务队列
      if (needOCR) {
        ocrTasks.push({
          config,
          image,
          task: (async () => {
            const imageKey = await this.uploadImage(image, rowIndex, imageType, services);
            if (!imageKey) return null;
            const ocrResult = await this.getOCRResult(imageKey, imageType, services, image.md5);
            if (!ocrResult) return null;
            return { imageKey, ocrResult };
          })(),
        });
      }
    }
    
    // 并发等待所有OCR任务完成
    const ocrResults = await Promise.all(ocrTasks.map(t => t.task));
    
    // 第二阶段：使用OCR结果构建比对项
    for (let i = 0; i < ocrTasks.length; i++) {
      const { config } = ocrTasks[i];
      const { imageType, fields, colIndex } = config;
      const result = ocrResults[i];
      
      if (!result) continue;
      const { imageKey, ocrResult } = result;
      
      // 重新收集该图片类型的字段值
      const fieldValues: Array<{ fieldName: string; colIndex: number; value: number | string }> = [];
      for (let j = 0; j < fields.length; j++) {
        const fieldName = fields[j];
        const fieldColIndex = colIndex + j;
        if (SKIP_FIELDS.some(f => fieldName.includes(f))) continue;
        const tableValue = this.getTableValue(rowData, fieldName);
        if (tableValue === '' || tableValue === null || tableValue === undefined) continue;
        fieldValues.push({ fieldName, colIndex: fieldColIndex, value: tableValue });
      }
      
      // 店铺数据截图特殊处理：店铺名称 + 月份
      if (imageType === '店铺数据截图') {
        // 处理店铺名称
        const shopNameMatch = compareShopNames(tableShopName, ocrResult.shop_name);
        console.log(`[淘宝] 店铺比对: 表格="${tableShopName}" vs OCR="${ocrResult.shop_name}" => ${shopNameMatch}`);
        details.push({
          shopName: tableShopName,
          fieldName: '店铺名称',
          tableValue: tableShopName,
          ocrValue: 0,
          status: shopNameMatch === 'match' ? 'match' : 'mismatch',
          sheetName,
          rowIndex,
          colIndex: 3,
          cellRef: 'D' + rowIndex,
          imageKey,
          ocrShopName: ocrResult.shop_name,
          shopNameMatch,
        });
        
        // 处理月份
        if (tableMonth) {
          const monthMatch = compareMonth(tableMonth, ocrResult);
          console.log(`[淘宝] 月份比对: 表格="${tableMonth}" vs OCR="${ocrResult.month || '未识别'}" => ${monthMatch}`);
          details.push({
            shopName: tableShopName,
            fieldName: '月份',
            tableValue: tableMonth || '',
            ocrValue: 0,
            status: monthMatch === 'match' ? 'match' : 'mismatch',
            sheetName,
            rowIndex,
            colIndex: 4,
            cellRef: 'E' + rowIndex,
            imageKey,
            ocrMonth: ocrResult.month,
            ocrDateRange: ocrResult.date_range,
            monthMatch,
            month: tableMonth,
          });
        }
      }
      
      // 处理数据字段
      for (const fv of fieldValues) {
        // 营业额字段必须进行OCR识别，即使表格值为0
        const isYingYeE = fv.fieldName === '营业额';
        
        // 如果表格值为0且不是营业额字段，直接填写0，不需要比对
        if ((fv.value === 0 || fv.value === '0') && !isYingYeE) {
          console.log(`[淘宝] 字段 ${fv.fieldName} 表格值为0，直接填写`);
          details.push({
            shopName: tableShopName,
            fieldName: fv.fieldName,
            tableValue: 0,
            ocrValue: 0,
            status: 'match',
            sheetName,
            rowIndex,
            colIndex: fv.colIndex,
            cellRef: this.colIndexToRef(fv.colIndex, rowIndex),
            imageKey,
            month: tableMonth,
            isZeroValue: true,
          });
          continue;
        }
        
        // 营业额字段或非0值，进行OCR比对
        const ocrValue = extractOCRValue(fv.fieldName, ocrResult, this.fieldMapping);
        const status = getComparisonStatus(fv.value, ocrValue);
        
        console.log(`[淘宝] ${fv.fieldName}: 表格=${fv.value}, OCR=${ocrValue}, 状态=${status}`);
        
        details.push({
          shopName: tableShopName,
          fieldName: fv.fieldName,
          tableValue: fv.value,
          ocrValue,
          status,
          sheetName,
          rowIndex,
          colIndex: fv.colIndex,
          cellRef: this.colIndexToRef(fv.colIndex, rowIndex),
          imageKey,
          month: tableMonth,
        });
      }
    }
    
    // 保存结果
    if (details.length > 0) {
      await services.resultService.saveResults(taskId, details);
      console.log(`[淘宝] 行${rowIndex} 保存了 ${details.length} 条比对结果`);
    }
    
    return { detailCount: details.length };
  }
  
  /**
   * 上传图片并返回key
   */
  private async uploadImage(
    image: ExcelImage,
    rowIndex: number,
    imageType: string,
    services: PlatformServices
  ): Promise<string | undefined> {
    try {
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const safeTypeName = imageType.replace(/[\/\\?%*:|"<>]/g, '_');
      const imageFileName = `taobao_row_${rowIndex}_${safeTypeName}_${randomSuffix}.png`;
      
      const imageKey = await services.storageService.uploadFile({
        fileContent: image.imageBuffer,
        fileName: imageFileName,
      });
      
      console.log(`[淘宝] 上传图片: ${imageFileName} -> ${imageKey}`);
      return imageKey;
    } catch (error) {
      console.error(`[淘宝] 图片上传失败:`, error);
      return undefined;
    }
  }
  
  /**
   * 获取OCR结果（带缓存）
   */
  private async getOCRResult(
    imageKey: string,
    imageType: string,
    services: PlatformServices,
    imageMd5?: string
  ): Promise<OCRResult> {
    // 检查本地缓存（使用MD5作为缓存键）
    const cacheKey = imageMd5 || imageKey;
    const cached = this.ocrCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    
    const ocrResult = await services.ocrService.recognizeImage(
      imageKey,
      this.name,
      imageType,
      imageMd5
    );
    
    // 缓存结果
    this.ocrCache.set(cacheKey, ocrResult);
    
    return ocrResult;
  }
  
  /**
   * 列索引转单元格引用（支持多字母列如 AA、AB 等）
   */
  private colIndexToRef(colIndex: number, rowIndex: number): string {
    let colLetter = '';
    let num = colIndex + 1; // 转为1-based
    while (num > 0) {
      const mod = (num - 1) % 26;
      colLetter = String.fromCharCode(65 + mod) + colLetter;
      num = Math.floor((num - 1) / 26);
    }
    return `${colLetter}${rowIndex}`;
  }
  
  /**
   * 获取表格中的店铺名称
   */
  private getTableShopName(rowData: RowData): string {
    return String(rowData['店铺名称'] || rowData['店铺'] || '').trim();
  }
  
  /**
   * 获取表格中的月份
   */
  private getTableMonth(rowData: RowData): string {
    return String(rowData['月份'] || '').trim();
  }
  
  /**
   * 获取表格中的数值
   */
  private getTableValue(rowData: RowData, fieldName: string): number | string {
    const value = rowData[fieldName];
    
    if (value === null || value === undefined || value === '') {
      return '';
    }
    
    if (typeof value === 'number') {
      return value;
    }
    
    // 尝试解析为数字
    const numValue = parseFloat(String(value).replace(/,/g, ''));
    return isNaN(numValue) ? value : numValue;
  }
}

// 导出单例
export const taobaoHandler = new TaobaoHandler();
