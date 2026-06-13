import { NextRequest, NextResponse } from 'next/server';
import { taskStore, getTaskResults } from '@/lib/services';

/**
 * 字段排序优先级（非淘宝平台使用）
 * 数字越小越靠前
 * 
 * 排序规则：
 * 1. 店铺名称相关字段最优先（不同平台可能有不同的命名方式）
 * 2. 月份相关字段第二优先
 * 3. 其他字段按 colIndex 排序
 */
const FIELD_ORDER: Record<string, number> = {
  // 店铺名称相关（最优先）
  '店铺名称': 1,
  '店铺名称（月度报表）': 1,
  '店铺名称（多多账单）': 2,
  // 月份相关（第二优先）
  '月份': 10,
  '月份核对': 10,
};

/**
 * 获取字段排序值（非淘宝平台使用）
 */
function getFieldOrder(fieldName: string): number {
  // 店铺名称相关字段最优先（包含"店铺名称"）
  if (fieldName.includes('店铺名称')) {
    // 精确匹配
    if (FIELD_ORDER[fieldName] !== undefined) {
      return FIELD_ORDER[fieldName];
    }
    return 1; // 其他店铺名称字段
  }
  
  // 月份相关字段第二优先
  if (fieldName.includes('月份')) {
    return 10;
  }
  
  // 其他字段按 colIndex 排序（返回100，由调用方处理）
  return 100;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    
    if (!taskId) {
      return NextResponse.json(
        { error: '缺少任务ID' },
        { status: 400 }
      );
    }

    const task = taskStore.get(taskId);

    if (!task) {
      return NextResponse.json(
        { error: '任务不存在' },
        { status: 404 }
      );
    }

    // 获取比对结果
    const results = getTaskResults(taskId);

    // 转换为前端格式
    const mappedResults = results.map(item => ({
      shopName: item.shop_name,
      fieldName: item.field_name,
      tableValue: item.table_value,
      ocrValue: item.ocr_value != null ? item.ocr_value : undefined,
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
      isZeroValue: item.is_zero_value || undefined,
    }));
    
    // 判断平台类型
    const isTaobao = task.platform === '淘宝';

    // 统计数据
    const stats = {
      total: mappedResults.length,
      matched: mappedResults.filter(r => r.status === 'match').length,
      mismatched: mappedResults.filter(r => r.status === 'mismatch').length,
      missing: mappedResults.filter(r => r.status === 'missing').length,
    };

    // 按行号分组（而不是按店铺分组）
    const groupedByRow = mappedResults.reduce((acc, item) => {
      const rowNum = item.rowIndex || 0;
      const key = `行${rowNum}`;
      if (!acc[key]) {
        acc[key] = {
          rowIndex: rowNum,
          shopName: item.shopName,
          month: item.month,
          imageKey: item.imageKey, // 图片标识
          items: [],
        };
      }
      acc[key].items.push(item);
      return acc;
    }, {} as Record<string, { rowIndex: number; shopName: string; month?: string; imageKey?: string; items: typeof mappedResults }>);

    // 按行号排序，并对每行的items按字段顺序排序
    const sortedRows = Object.values(groupedByRow)
      .sort((a, b) => a.rowIndex - b.rowIndex)
      .map(row => ({
        ...row,
        items: row.items.sort((a, b) => {
          // 淘宝平台：直接按 colIndex 排序
          if (isTaobao) {
            return (a.colIndex || 0) - (b.colIndex || 0);
          }
          
          // 其他平台：按优先级排序，优先级相同时按 colIndex 排序
          const orderA = getFieldOrder(a.fieldName);
          const orderB = getFieldOrder(b.fieldName);
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          return (a.colIndex || 0) - (b.colIndex || 0);
        }),
      }));

    return NextResponse.json({
      task: {
        id: task.id,
        fileName: task.file_name,
        platform: task.platform,
        status: task.status,
        createdAt: task.created_at,
        completedAt: task.completed_at,
      },
      stats,
      groupedByRow: sortedRows,
      details: mappedResults,
    });

  } catch (error) {
    console.error('获取比对结果错误:', error);
    return NextResponse.json(
      { error: '获取结果失败' },
      { status: 500 }
    );
  }
}
