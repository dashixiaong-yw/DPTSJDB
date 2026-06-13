import { NextRequest, NextResponse } from 'next/server';
import { taskStore, getTaskResults, storageReadFile } from '@/lib/services';
import type { ComparisonRecord } from '@/lib/memory-store';
import ExcelJS from 'exceljs';

/** 将列索引（0起始）转换为 Excel 列字母，如 0→A, 25→Z, 26→AA */
function columnToLetter(colIndex: number): string {
  let letter = '';
  let num = colIndex + 1;
  while (num > 0) {
    const mod = (num - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    num = Math.floor((num - 1) / 26);
  }
  return letter;
}

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    
    if (!taskId) {
      return NextResponse.json({ error: '缺少任务ID' }, { status: 400 });
    }

    // 获取任务信息
    const task = taskStore.get(taskId);

    if (!task) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    // 获取比对结果
    const results = getTaskResults(taskId);

    // 下载原始文件
    console.log('下载原始文件:', task.file_path);
    const fileBuffer = await storageReadFile(task.file_path);
    
    // 转换为 ArrayBuffer
    const arrayBuffer = fileBuffer instanceof Buffer 
      ? fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength)
      : fileBuffer;
    
    // 使用 ExcelJS 加载并标记文件
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer as Uint8Array);

    // 创建结果映射，cellRef 为空时按 rowIndex/colIndex 计算
    const resultMap = new Map<string, ComparisonRecord>();
    (results || []).forEach((r: ComparisonRecord) => {
      const cellRef = r.cell_ref || `${columnToLetter(r.col_index)}${r.row_index}`;
      const key = `${r.sheet_name}!${cellRef}`;
      resultMap.set(key, r);
    });

    // 遍历所有 sheet 进行标记
    workbook.worksheets.forEach((worksheet) => {
      const sheetName = worksheet.name;
      
      worksheet.eachRow((row, rowNum) => {
        row.eachCell((cell, colNum) => {
          const cellRef = cell.address;
          const key = `${sheetName}!${cellRef}`;
          const result = resultMap.get(key);
          
          if (result) {
            // 添加批注标记比对结果
            if (result.status === 'match') {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE6F4EA' } // 浅绿色
              };
            } else if (result.status === 'mismatch') {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFCE8E8' } // 浅红色
              };
              // 添加批注显示OCR值
              cell.note = {
                texts: [{ text: `OCR识别值: ${result.ocr_value}` }],
                margins: { inset: [0.1, 0.1, 0.1, 0.1] }
              };
            } else if (result.status === 'missing') {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFF3CD' } // 浅黄色
              };
            }
          }
        });
      });
    });

    // 添加图例工作表
    const legendSheet = workbook.addWorksheet('比对图例');
    legendSheet.addRow(['颜色说明']);
    legendSheet.addRow([]);
    legendSheet.addRow(['绿色', '数据一致']);
    legendSheet.addRow(['红色', '数据不一致']);
    legendSheet.addRow(['黄色', '数据缺失']);
    
    // 设置图例颜色
    const greenCell = legendSheet.getCell('A3');
    greenCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6F4EA' }
    };
    
    const redCell = legendSheet.getCell('A4');
    redCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFCE8E8' }
    };
    
    const yellowCell = legendSheet.getCell('A5');
    yellowCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF3CD' }
    };

    // 导出为 Buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // 返回文件
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(task.file_name.replace('.xlsx', '_marked.xlsx'))}"`,
        'Content-Length': buffer.byteLength.toString(),
      },
    });

  } catch (error) {
    console.error('生成标记文件失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成标记文件失败' },
      { status: 500 }
    );
  }
}
