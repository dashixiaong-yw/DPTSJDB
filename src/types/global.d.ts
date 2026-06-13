/**
 * 全局行数据类型
 * 替代 Record<string, any>，用于 Excel 数据行
 * 覆盖范围：string | number | null（Excel 单元格实际值范围）
 * boolean/Date 理论上可能出现但财务场景中不会出现
 */
export type RowData = Record<string, string | number | null | undefined>;

/**
 * ExcelJS 类型补充声明
 * 修复 getImages() 返回类型缺失、load() Buffer 类型兼容性问题
 */
import 'exceljs';

declare module 'exceljs' {
  interface Xlsx {
    load(buffer: Buffer<ArrayBufferLike>, options?: Partial<XlsxReadOptions>): Promise<Workbook>;
  }

  interface Worksheet {
    getImages(): Array<{
      imageId: number;
      range: {
        tl: { col: number; row: number };
        br: { col: number; row: number };
      };
    }>;
  }
}
