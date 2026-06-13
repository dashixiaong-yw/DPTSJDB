import { NextRequest, NextResponse } from 'next/server';
import { taskStore, storageReadFile, storageUploadFile, appendTaskResults } from '@/lib/services';
import {
  markTaskProcessing,
  markTaskCompleted,
  markTaskFailed,
  updateTaskProgress,
  checkTaskAbort,
  TaskAbortError
} from '@/lib/task-processor';
import { identifyPlatform, identifyPlatformByFileName, PlatformHandler, RowContext, ComparisonItem } from '@/lib/platforms';

export async function POST(
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

    if (task.status !== 'uploaded') {
      return NextResponse.json(
        { error: '任务状态不正确，只有已上传的任务可以开始处理' },
        { status: 400 }
      );
    }

    // 异步处理文件
    processFileAsync(taskId, task.file_path, task.file_name);

    return NextResponse.json({
      taskId: taskId,
      status: 'processing',
      message: '开始处理文件'
    });

  } catch (error) {
    console.error('启动任务失败:', error);
    return NextResponse.json(
      { error: '启动任务失败' },
      { status: 500 }
    );
  }
}

/**
 * 异步处理文件 - 使用平台处理器架构
 */
async function processFileAsync(taskId: string, filePath: string, fileName: string) {
  try {
    // 标记为处理中
    await markTaskProcessing(taskId);

    // 步骤1: 下载文件 (5%)
    await updateTaskProgress(taskId, 5, '正在下载文件...');
    console.log(`[任务${taskId}] 开始下载文件: ${filePath}`);
    
    const fileBuffer = await storageReadFile(filePath);
    console.log(`[任务${taskId}] 文件下载完成，大小: ${fileBuffer.length} bytes (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
    
    // 验证文件完整性
    if (fileBuffer.length < 4) {
      throw new Error(`文件太小 (${fileBuffer.length} bytes)，可能上传不完整`);
    }
    
    // 步骤2: 解析Excel文件 (10%)
    await updateTaskProgress(taskId, 10, '正在解析Excel文件...');
    const { parseExcelFile } = await import('@/lib/excel-parser');
    const parseResult = await parseExcelFile(fileBuffer, taskId);

    if (parseResult.error) {
      throw new Error(`Excel解析失败: ${parseResult.error}`);
    }

    const firstSheet = parseResult.sheets[0];
    if (!firstSheet) {
      throw new Error('Excel文件中没有工作表');
    }

    // 步骤3: 平台识别 (15%) - 优先使用文件名识别
    let { platform, handler } = identifyPlatformByFileName(fileName);
    
    // 如果文件名无法识别，使用工作表名称识别
    if (!handler) {
      const result = identifyPlatform(firstSheet.name, firstSheet.headers);
      platform = result.platform;
      handler = result.handler;
    }
    
    console.log(`[任务${taskId}] 识别平台: ${platform}`);
    
    await updateTaskProgress(taskId, 15, `识别到平台: ${platform}，正在准备处理...`);

    // 步骤4: 准备按行处理 (20%)
    await updateTaskProgress(taskId, 20, '正在准备按行比对...');
    
    // 构建行号到图片的映射
    const rowImagesMap = buildRowImagesMap(parseResult);
    
    // 收集需要处理的行
    const rowsToProcess = collectRowsToProcess(parseResult, rowImagesMap);
    
    const totalRows = rowsToProcess.length;
    console.log(`[任务${taskId}] 找到 ${totalRows} 行需要处理`);

    if (totalRows === 0) {
      throw new Error('未找到任何包含图片的数据行');
    }

    await updateTaskProgress(taskId, 25, `开始按行比对，共 ${totalRows} 行`, {
      platform,
      totalImages: totalRows,
    });

    // 步骤5: 准备服务依赖 (30%)
    const { ocrService } = await import('@/lib/ocr-service');
    
    // 平台服务依赖
    const platformServices = {
      ocrService: {
        recognizeImage: (imageKey: string, platformName: string, imageType?: string, imageMd5?: string) => 
          ocrService.recognizeImage(imageKey, platformName, imageType, imageMd5),
      },
      storageService: {
        uploadFile: (params: { fileContent: Buffer; fileName: string }) => 
          storageUploadFile(params),
      },
      resultService: {
        saveResults: (taskId: string, details: ComparisonItem[], imageKey?: string, month?: string) => 
          saveResults(taskId, details, imageKey, month),
      },
    };

    // 步骤6: 按行处理 (30%-90%)
    let processedCount = 0;
    
    for (const rowInfo of rowsToProcess) {
      try {
        // 检查是否被中断
        if (await checkTaskAbort(taskId)) {
          console.log(`[任务${taskId}] 检测到中断请求，停止处理`);
          await markTaskFailed(taskId, '任务已被用户中断');
          return;
        }
        
        // 更新进度
        const progress = 30 + Math.floor((processedCount / totalRows) * 60);
        await updateTaskProgress(taskId, progress, `正在处理第 ${processedCount + 1}/${totalRows} 行...`);
        
        // 构建行上下文
        const context: RowContext = {
          taskId,
          sheetName: rowInfo.sheetName,
          rowIndex: rowInfo.rowIndex,
          rowData: rowInfo.rowData,
          imagesForRow: rowInfo.imagesForRow,
          headers: rowInfo.headers,
        };
        
        // 使用平台处理器处理该行
        if (handler) {
          await handler.processRow(context, platformServices);
        } else {
          // 无匹配处理器时的默认处理
          console.log(`[任务${taskId}] 无平台处理器，跳过行${rowInfo.rowIndex}`);
        }
        
        processedCount++;
        
      } catch (rowError) {
        console.error(`[任务${taskId}] 处理行${rowInfo.rowIndex}失败:`, rowError);
        // 继续处理下一行
      }
    }

    // 步骤7: 完成 (100%)
    await updateTaskProgress(taskId, 95, '数据比对完成', {
      platform,
      totalImages: totalRows,
      processedImages: processedCount,
    });

    await markTaskCompleted(taskId, platform);

  } catch (error) {
    console.error('[任务处理失败]:', error);
    
    // 检查是否是中断错误
    if (error instanceof TaskAbortError) {
      console.log(`[任务${taskId}] 任务被用户中断`);
      await markTaskFailed(taskId, '任务已被用户中断');
      return;
    }
    
    let errorMessage = '处理失败';
    if (error instanceof Error) {
      errorMessage = error.message;
      if (error.stack) {
        const stackLines = error.stack.split('\n');
        if (stackLines.length > 1) {
          errorMessage += `\n\n错误堆栈:\n${stackLines.slice(0, 3).join('\n')}`;
        }
      }
    }
    
    await markTaskFailed(taskId, errorMessage);
  }
}

/**
 * 构建行号到图片的映射
 */
function buildRowImagesMap(parseResult: any): Map<number, Map<string, any>> {
  const rowImagesMap = new Map<number, Map<string, any>>();
  
  parseResult.sheets.forEach((sheet: any) => {
    sheet.images.forEach((img: any) => {
      const match = img.cellRef.match(/(\d+)/);
      if (match) {
        const rowNum = parseInt(match[1]);
        const imageType = img.imageType || '数据截图';
        
        if (!rowImagesMap.has(rowNum)) {
          rowImagesMap.set(rowNum, new Map());
        }
        rowImagesMap.get(rowNum)!.set(imageType, img);
      }
    });
  });
  
  return rowImagesMap;
}

/**
 * 收集需要处理的行
 */
function collectRowsToProcess(
  parseResult: any, 
  rowImagesMap: Map<number, Map<string, any>>
): Array<{
  sheetName: string;
  rowIndex: number;
  rowData: any;
  imagesForRow: Map<string, any>;
  headers: string[];
}> {
  const rowsToProcess: Array<{
    sheetName: string;
    rowIndex: number;
    rowData: any;
    imagesForRow: Map<string, any>;
    headers: string[];
  }> = [];
  
  parseResult.sheets.forEach((sheet: any) => {
    sheet.rows.forEach((row: any, rowIndex: number) => {
      const rowNum = rowIndex + 2; // Excel行号（从2开始，第1行是表头）
      const imagesForRow = rowImagesMap.get(rowNum);
      
      if (imagesForRow && imagesForRow.size > 0) {
        rowsToProcess.push({
          sheetName: sheet.name,
          rowIndex: rowNum,
          rowData: row,
          imagesForRow,
          headers: sheet.headers,
        });
      }
    });
  });
  
  return rowsToProcess;
}

/**
 * 保存比对结果到数据库
 */
async function saveResults(
  taskId: string, 
  details: ComparisonItem[], 
  imageKey?: string, 
  month?: string
): Promise<void> {
  const records = details.map((item: any) => ({
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
    month: item.month || month,
    image_key: item.imageKey || imageKey,
    ocr_shop_name: item.ocrShopName || null,
    shop_name_match: item.shopNameMatch || null,
    ocr_month: item.ocrMonth || null,
    ocr_date_range: item.ocrDateRange || null,
    month_match: item.monthMatch || null,
    created_at: new Date().toISOString(),
  }));
  
  appendTaskResults(taskId, records);
}
