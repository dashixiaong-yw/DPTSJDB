/**
 * 平台处理器共享类型定义
 * 
 * 所有平台处理器共享的类型，修改此处会影响所有平台
 */

import { OCRResult } from '../ocr-service';
import type { RowData } from '@/types/global';

/**
 * 比对项
 */
export interface ComparisonItem {
  shopName: string;
  fieldName: string;
  tableValue: string | number;
  ocrValue: string | number | undefined;
  status: 'match' | 'mismatch' | 'missing';
  sheetName: string;
  rowIndex: number;
  colIndex: number;
  cellRef: string;
  month?: string;
  imageKey?: string;
  ocrShopName?: string;
  shopNameMatch?: 'match' | 'mismatch' | 'missing';
  ocrMonth?: string;
  ocrDateRange?: {
    start_date?: string;
    end_date?: string;
    is_full_month?: boolean;
    actual_month?: string;
  };
  monthMatch?: 'match' | 'mismatch' | 'not_full_month' | 'missing';
  isZeroValue?: boolean; // 标记表格值为0的字段（无需核对）
}

/**
 * Excel图片信息
 */
export interface ExcelImage {
  sheetName: string;
  cellRef: string;
  imageBuffer: Buffer;
  imageKey?: string;
  md5?: string;
  imageId?: string;
  imageType?: string;
  colHeader?: string;
}

/**
 * Excel工作表数据
 */
export interface ExcelSheet {
  name: string;
  headers: string[];
  rows: RowData[];
  images: ExcelImage[];
}

/**
 * Excel解析结果
 */
export interface ParseResult {
  sheets: ExcelSheet[];
  platform?: string;
  error?: string;
}

/**
 * 行处理上下文 - 传递给处理器的上下文信息
 */
export interface RowContext {
  taskId: string;
  sheetName: string;
  rowIndex: number;
  rowData: RowData;
  imagesForRow: Map<string, ExcelImage>;
  headers: string[];
}

/**
 * 平台处理器接口
 * 
 * 每个平台必须实现此接口
 */
export interface PlatformHandler {
  /** 平台名称 */
  readonly name: string;
  
  /** 
   * 识别是否为此平台
   * @param sheetName 工作表名称
   * @param headers 表头数组
   * @returns 是否匹配
   */
  identify(sheetName: string, headers: string[]): boolean;
  
  /**
   * 处理单行数据
   * @param context 行上下文
   * @param services 服务依赖（OCR、存储等）
   * @returns 比对结果数量
   */
  processRow(
    context: RowContext,
    services: PlatformServices
  ): Promise<{ detailCount: number }>;
}

/**
 * 平台服务依赖 - 注入给处理器的服务
 */
export interface PlatformServices {
  /** OCR服务 */
  ocrService: {
    recognizeImage: (imageKey: string, platform: string, imageType?: string, imageMd5?: string) => Promise<OCRResult>;
  };
  
  /** 存储服务 */
  storageService: {
    uploadFile: (params: { fileContent: Buffer; fileName: string }) => Promise<string>;
  };
  
  /** 结果保存服务 */
  resultService: {
    saveResults: (taskId: string, details: ComparisonItem[], imageKey?: string, month?: string) => Promise<void>;
  };
}
