import ExcelJS from 'exceljs';
import { storageUploadFile, generateFilePath } from './services';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import type { RowData } from '@/types/global';

export interface ExcelSheet {
  name: string;
  headers: string[];
  rows: RowData[];
  images: ExcelImage[];
}

export interface ExcelImage {
  sheetName: string;
  cellRef: string; // 单元格引用，如 "M2", "N2"
  imageBuffer: Buffer;
  imageKey?: string; // 存储到对象存储后的key
  md5?: string;
  imageId?: string; // DISPIMG中的图片ID
  imageType?: string; // 图片类型（用于区分不同截图，如"月度数据报表"、"多多账单"）
  colHeader?: string; // 列标题（如"月度数据报表截图（必填）"）
}

export interface ParseResult {
  sheets: ExcelSheet[];
  platform?: string; // 平台类型：抖音、拼多多、淘宝
  error?: string;
}

/**
 * 检测平台类型（根据工作表名称或表头判断）
 */
function detectPlatform(sheetName: string, headers: string[]): string {
  const sheetLower = sheetName.toLowerCase();
  const headersStr = headers.join(',').toLowerCase();
  
  if (sheetLower.includes('拼多多') || headersStr.includes('多多账单')) {
    return '拼多多';
  }
  if (sheetLower.includes('抖店') || sheetLower.includes('抖音') || headersStr.includes('抖店')) {
    return '抖音';
  }
  if (sheetLower.includes('淘宝') || sheetLower.includes('天猫')) {
    return '淘宝';
  }
  
  return '未知';
}

/**
 * 获取图片类型（根据列标题判断）
 */
function getImageType(colHeader: string): string {
  const headerLower = colHeader.toLowerCase();
  
  // 拼多多平台
  if (headerLower.includes('月度数据报表') || headerLower.includes('月度报表')) {
    return '月度数据报表';
  }
  if (headerLower.includes('多多账单') || headerLower.includes('账单截图')) {
    return '多多账单';
  }
  
  // 淘宝平台
  if (headerLower.includes('店铺数据截图') || headerLower.includes('店铺数据')) {
    return '店铺数据截图';
  }
  if (headerLower.includes('万相台无界') || headerLower.includes('万相台')) {
    return '万相台无界版截图';
  }
  if (headerLower.includes('小额打款')) {
    return '小额打款后台数据';
  }
  if (headerLower.includes('红包签到')) {
    return '红包签到佣金截图';
  }
  if (headerLower.includes('公益宝贝')) {
    return '公益宝贝佣金截图';
  }
  if (headerLower.includes('淘宝平台技术') || headerLower.includes('平台技术截图')) {
    return '淘宝平台技术截图';
  }
  if (headerLower.includes('偏远集运') || headerLower.includes('集运仓')) {
    return '偏远集运仓截图';
  }
  if (headerLower.includes('跨境服务')) {
    return '跨境服务截图';
  }
  if (headerLower.includes('淘金币')) {
    return '淘金币服务截图';
  }
  
  // 通用
  if (headerLower.includes('刷单')) {
    return '刷单记录';
  }
  if (headerLower.includes('截图') || headerLower.includes('图片')) {
    return '数据截图';
  }
  
  return '其他';
}

/**
 * 从单元格值中提取DISPIMG公式中的图片ID
 * 格式: =DISPIMG("ID_xxx", 1)
 */
function extractDispImgId(value: unknown): string | null {
  if (!value) return null;
  
  const strValue = value.toString();
  
  // 匹配 =DISPIMG("ID_xxx", 1) 格式
  const match = strValue.match(/DISPIMG\s*\(\s*"([^"]+)"\s*,\s*\d+\s*\)/i);
  if (match && match[1]) {
    return match[1]; // 返回图片ID，如 "ID_FAA54BCDEB774806AE60BD80E56AEC3D"
  }
  
  // 也尝试匹配直接包含ID_开头的情况
  const idMatch = strValue.match(/(ID_[A-F0-9]+)/i);
  if (idMatch) {
    return idMatch[1];
  }
  
  return null;
}

/**
 * 解析cellimages.xml格式（WPS特殊格式）
 * 返回: Map<imageId, rId>
 */
async function parseCellImages(zip: JSZip): Promise<Map<string, string>> {
  const idToRid = new Map<string, string>();
  
  try {
    const cellImagesFile = 'xl/cellimages.xml';
    if (!zip.files[cellImagesFile]) {
      return idToRid;
    }
    
    const content = await zip.files[cellImagesFile].async('text');
    
    // 解析每个xdr:pic
    const picMatches = content.matchAll(/<xdr:pic>([\s\S]*?)<\/xdr:pic>/g);
    for (const match of picMatches) {
      const picContent = match[1];
      
      // 获取ID (name属性)
      const idMatch = picContent.match(/name="(ID_[A-F0-9]+)"/i);
      // 获取rId
      const ridMatch = picContent.match(/r:embed="(rId\d+)"/i);
      
      if (idMatch && ridMatch) {
        idToRid.set(idMatch[1], ridMatch[1]);
        console.log(`CellImages: ${idMatch[1]} -> ${ridMatch[1]}`);
      }
    }
    
    console.log(`解析cellimages.xml完成，获得 ${idToRid.size} 个ID-rId映射`);
  } catch (error) {
    console.error('解析cellimages.xml失败:', error);
  }
  
  return idToRid;
}

/**
 * 解析sheet1.xml获取DISPIMG公式中的单元格与图片ID映射
 * 返回: Map<cellRef, imageId>
 */
async function parseDispImgFromSheet(zip: JSZip): Promise<Map<string, string>> {
  const cellToId = new Map<string, string>();
  
  try {
    const sheetFile = 'xl/worksheets/sheet1.xml';
    if (!zip.files[sheetFile]) {
      return cellToId;
    }
    
    const content = await zip.files[sheetFile].async('text');
    
    // 查找包含DISPIMG的单元格
    // 用 </c> 分割，然后在每个片段中找最后一个 <c r="..."> 标签
    // 这样可以正确处理连续的自闭合标签情况
    const lines = content.split('</c>');
    for (const line of lines) {
      if (line.includes('DISPIMG') || line.includes('ID_')) {
        // 从后向前找最后一个 <c r="..." 
        // 使用 matchAll 获取所有匹配，取最后一个
        const cellMatches = line.matchAll(/<c\s+r="([A-Z]+\d+)"/g);
        let lastCellMatch = null;
        for (const m of cellMatches) {
          lastCellMatch = m;
        }
        
        const idMatch = line.match(/(ID_[A-F0-9]+)/i);
        
        if (lastCellMatch && idMatch) {
          cellToId.set(lastCellMatch[1], idMatch[1]);
          console.log(`DISPIMG: ${lastCellMatch[1]} -> ${idMatch[1]}`);
        }
      }
    }
    
    console.log(`解析sheet.xml完成，获得 ${cellToId.size} 个单元格-ID映射`);
  } catch (error) {
    console.error('解析sheet.xml失败:', error);
  }
  
  return cellToId;
}

/**
 * 解析cellimages.xml.rels获取rId与图片文件的映射
 * 返回: Map<rId, imageNumber>
 */
async function parseCellImagesRels(zip: JSZip): Promise<Map<string, number>> {
  const ridToImage = new Map<string, number>();
  
  try {
    const relsFile = 'xl/_rels/cellimages.xml.rels';
    if (!zip.files[relsFile]) {
      return ridToImage;
    }
    
    const content = await zip.files[relsFile].async('text');
    
    const relMatches = content.matchAll(/Id="(rId\d+)"[^>]*Target="media\/image(\d+)\.[^"]*"/g);
    for (const match of relMatches) {
      ridToImage.set(match[1], parseInt(match[2], 10));
      console.log(`Rels: ${match[1]} -> image${match[2]}`);
    }
    
    console.log(`解析cellimages.xml.rels完成，获得 ${ridToImage.size} 个rId-image映射`);
  } catch (error) {
    console.error('解析cellimages.xml.rels失败:', error);
  }
  
  return ridToImage;
}

/**
 * 从xlsx文件中提取所有嵌入的图片及其单元格位置
 * 支持多种格式：cellimages.xml（WPS）、drawing.xml（标准）、DISPIMG公式
 * 返回: Map<cellRef, imageBuffer>
 */
async function extractEmbeddedImagesFromXlsx(fileBuffer: Buffer, headers: string[] = []): Promise<Map<string, Buffer>> {
  const imageByCell = new Map<string, Buffer>(); // cellRef -> imageBuffer
  
  try {
    const zip = await JSZip.loadAsync(fileBuffer);
    
    // 第一步：提取所有图片文件
    const imageDataMap = new Map<number, Buffer>(); // imageNumber -> buffer
    const fileNames = Object.keys(zip.files);
    
    for (const fileName of fileNames) {
      if (fileName.startsWith('xl/media/') && !zip.files[fileName].dir) {
        const match = fileName.match(/image(\d+)\.(png|jpg|jpeg|gif|bmp)$/i);
        if (match) {
          const imageNumber = parseInt(match[1], 10);
          const imageData = await zip.files[fileName].async('nodebuffer');
          imageDataMap.set(imageNumber, imageData);
          console.log(`提取图片: image${imageNumber} (${imageData.length} bytes)`);
        }
      }
    }
    
    // 第二步：尝试多种映射方式（合并所有方式的结果）
    // 方式1: cellimages.xml格式（WPS特殊格式）+ DISPIMG公式
    const idToRid = await parseCellImages(zip);
    const cellToId = await parseDispImgFromSheet(zip);
    const ridToImage = await parseCellImagesRels(zip);
    
    if (cellToId.size > 0 && idToRid.size > 0 && ridToImage.size > 0) {
      // 有完整的cellimages映射链：cellRef -> imageId -> rId -> imageNumber
      console.log(`使用cellimages.xml映射方式`);
      
      for (const [cellRef, imageId] of cellToId) {
        const rid = idToRid.get(imageId);
        if (rid) {
          const imageNum = ridToImage.get(rid);
          if (imageNum !== undefined) {
            const buffer = imageDataMap.get(imageNum);
            if (buffer) {
              imageByCell.set(cellRef, buffer);
              console.log(`CellImages映射: ${cellRef} -> image${imageNum}`);
            }
          }
        }
      }
      
      console.log(`CellImages映射完成，共 ${imageByCell.size} 张图片`);
      // 不返回，继续尝试方式2，合并结果
    }
    
    // 方式2: 标准drawing.xml格式（补充方式1没有找到的图片）
    const imageToCell = await parseDrawingRelations(zip);
    
    if (imageToCell.size > 0) {
      console.log(`使用drawing.xml映射方式（补充）`);
      let addedCount = 0;
      for (const [imageNum, cellRef] of imageToCell) {
        // 只添加还没有图片的单元格
        if (!imageByCell.has(cellRef)) {
          const buffer = imageDataMap.get(imageNum);
          if (buffer) {
            imageByCell.set(cellRef, buffer);
            console.log(`Drawing映射: ${cellRef} -> image${imageNum}`);
            addedCount++;
          }
        }
      }
      
      if (addedCount > 0) {
        console.log(`Drawing映射补充了 ${addedCount} 张图片，总计 ${imageByCell.size} 张图片`);
      }
    }
    
    // 方式3: 回退到顺序分配（仅当仍然没有图片时）
    if (imageByCell.size === 0) {
      console.log(`无映射关系，按顺序分配图片`);
      const sortedImages: Array<{ num: number; buffer: Buffer }> = [];
      for (const [num, buffer] of imageDataMap.entries()) {
        sortedImages.push({ num, buffer });
      }
      sortedImages.sort((a, b) => a.num - b.num);
      
      // 检测是否为抖音平台，根据表头判断应从哪列开始分配
      let startCol = 'J'; // 默认从J列开始（刷单记录列）
      const headersStr = headers.join(',').toLowerCase();
      if (headersStr.includes('店铺月度数据截图') && !headersStr.includes('刷单')) {
        // 如果只有店铺月度数据截图列，没有刷单列，从K列开始
        startCol = 'K';
      } else if (headersStr.includes('抖店') || headersStr.includes('抖音')) {
        // 抖店平台优先使用K列（店铺月度数据截图）
        startCol = 'K';
      }
      
      for (let i = 0; i < sortedImages.length; i++) {
        const rowNum = i + 2; // 从第2行开始
        const cellRef = `${startCol}${rowNum}`; // 从对应列开始
        imageByCell.set(cellRef, sortedImages[i].buffer);
        console.log(`顺序映射: ${cellRef} -> image${sortedImages[i].num}`);
      }
    }
    
  } catch (error) {
    console.error('提取嵌入图片失败:', error);
  }
  
  return imageByCell;
}

/**
 * 将列号转换为字母（支持任意列号）
 * 例如：0->A, 25->Z, 26->AA, 27->AB
 */
function columnToLetter(col: number): string {
  let result = '';
  col++; // 转换为1基
  while (col > 0) {
    const remainder = (col - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    col = Math.floor((col - 1) / 26);
  }
  return result;
}

/**
 * 解析drawing文件，获取图片与单元格的正确映射（标准格式）
 */
async function parseDrawingRelations(zip: JSZip): Promise<Map<number, string>> {
  const imageToCell = new Map<number, string>(); // imageNumber -> cellRef
  const rIdToCell = new Map<string, string>(); // rId -> cellRef
  
  try {
    // 第一步：解析drawing XML获取 rId -> cellRef 映射
    const drawingFiles = Object.keys(zip.files).filter(f => 
      f.includes('drawing') && f.endsWith('.xml') && !f.includes('_rels')
    );
    
    for (const drawingFile of drawingFiles) {
      const content = await zip.files[drawingFile].async('text');
      
      const anchorMatches = content.matchAll(/<xdr:(?:twoCellAnchor|oneCellAnchor)[^>]*>([\s\S]*?)<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g);
      
      for (const anchorMatch of anchorMatches) {
        const anchorContent = anchorMatch[1];
        
        const fromMatch = anchorContent.match(/<xdr:from>([\s\S]*?)<\/xdr:from>/);
        if (fromMatch) {
          const colMatch = fromMatch[1].match(/<xdr:col>(\d+)<\/xdr:col>/);
          const rowMatch = fromMatch[1].match(/<xdr:row>(\d+)<\/xdr:row>/);
          
          if (colMatch && rowMatch) {
            const col = parseInt(colMatch[1], 10);
            const row = parseInt(rowMatch[1], 10);
            const cellRef = `${columnToLetter(col)}${row + 1}`;
            
            const blipMatch = anchorContent.match(/<a:blip[^>]*r:embed="([^"]+)"/);
            if (blipMatch) {
              const embedId = blipMatch[1];
              console.log(`Drawing: rId=${embedId} -> 单元格${cellRef}`);
              rIdToCell.set(embedId, cellRef);
            }
          }
        }
      }
    }
    
    // 第二步：解析rels文件获取 rId -> imageNumber 映射
    const relsFiles = Object.keys(zip.files).filter(f => 
      f.includes('drawing') && f.endsWith('.rels')
    );
    
    for (const relsFile of relsFiles) {
      const content = await zip.files[relsFile].async('text');
      
      const relMatches = content.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="[^"]*image(\d+)\.[^"]*"[^>]*\/>/g);
      
      for (const relMatch of relMatches) {
        const rId = relMatch[1];
        const imageNum = parseInt(relMatch[2], 10);
        const cellRef = rIdToCell.get(rId);
        
        if (cellRef) {
          imageToCell.set(imageNum, cellRef);
          console.log(`Rels: rId=${rId} -> image${imageNum} -> 单元格${cellRef}`);
        }
      }
    }
    
    console.log(`解析drawing完成，获得 ${imageToCell.size} 个图片-单元格映射`);
    
  } catch (error) {
    console.error('解析drawing关系失败:', error);
  }
  
  return imageToCell;
}

/**
 * 快速识别平台（仅读取表头，不解析图片）
 */
async function quickIdentifyPlatform(fileBuffer: Buffer): Promise<{ platform: string; headers: string[]; sheetName: string }> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);
    
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return { platform: '未知', headers: [], sheetName: '' };
    }
    
    const sheetName = worksheet.name;
    const headers: string[] = [];
    
    // 读取第一行表头
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      headers.push(cell.value?.toString() || `列${colNumber}`);
    });
    
    const platform = detectPlatform(sheetName, headers);
    console.log(`快速识别平台: ${platform} (工作表: ${sheetName})`);
    console.log(`表头: ${headers.slice(0, 10).join(', ')}${headers.length > 10 ? '...' : ''}`);
    
    return { platform, headers, sheetName };
  } catch (error) {
    console.error('快速识别平台失败:', error);
    return { platform: '未知', headers: [], sheetName: '' };
  }
}

/**
 * 解析Excel文件，提取表格数据和嵌入图片
 * 优化：先识别平台，再根据平台选择解析策略
 */
export async function parseExcelFile(
  fileBuffer: Buffer,
  taskId: string
): Promise<ParseResult> {
  try {
    console.log(`\n===== 开始解析Excel文件 =====`);
    console.log(`文件大小: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    
    // 步骤1：快速识别平台（仅读取表头）
    const { platform, headers: quickHeaders, sheetName: quickSheetName } = await quickIdentifyPlatform(fileBuffer);
    console.log(`平台识别完成: ${platform}`);
    
    // 步骤2：根据平台选择解析策略
    if (platform === '拼多多') {
      console.log(`使用拼多多专用解析策略...`);
      return await parsePDDExcel(fileBuffer, taskId, quickHeaders, quickSheetName);
    } else if (platform === '抖音') {
      console.log(`使用抖音专用解析策略...`);
      return await parseDouyinExcel(fileBuffer, taskId, quickHeaders, quickSheetName);
    } else {
      console.log(`使用通用解析策略...`);
      return await parseGenericExcel(fileBuffer, taskId);
    }
  } catch (error) {
    console.error('解析Excel失败:', error);
    return {
      sheets: [],
      error: error instanceof Error ? error.message : '解析失败',
    };
  }
}

/**
 * 拼多多专用解析（每行两张图片：M列月度报表 + N列多多账单）
 */
async function parsePDDExcel(
  fileBuffer: Buffer, 
  taskId: string,
  quickHeaders: string[],
  sheetName: string
): Promise<ParseResult> {
  console.log(`\n--- 拼多多解析开始 ---`);
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  
  const worksheet = workbook.worksheets[0];
  const headers = quickHeaders;
  const rows: RowData[] = [];
  const images: ExcelImage[] = [];
  
  // 获取数据行
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // 跳过表头
    
    const rowData: RowData = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber - 1];
      rowData[header] = cell.value as string | number | null | undefined;
    });
    rows.push(rowData);
  });
  
  console.log(`数据行数: ${rows.length}`);
  
  // 提取图片 - 使用ZIP方式（拼多多表格通常是WPS格式）
  try {
    console.log(`开始提取图片...`);
    const embeddedImages = await extractEmbeddedImagesFromXlsx(fileBuffer, headers);
    console.log(`从ZIP提取到 ${embeddedImages.size} 张图片`);
    
    // 为每张图片设置类型
    for (const [cellRef, imageBuffer] of embeddedImages) {
      const colLetter = cellRef.match(/^[A-Z]+/)?.[0] || '';
      const colIndex = colLetter.split('').reduce((acc, char) => acc * 26 + char.charCodeAt(0) - 64, 0) - 1;
      
      // 边界检查：防止索引越界
      if (colIndex < 0 || colIndex >= headers.length) {
        console.warn(`列索引${colIndex}超出范围(${headers.length}列)，跳过图片: ${cellRef}`);
        continue;
      }
      
      const colHeader = headers[colIndex] || '';
      const imageType = getImageType(colHeader);
      
      images.push({
        sheetName,
        cellRef,
        imageBuffer,
        md5: createHash('md5').update(imageBuffer).digest('hex'),
        imageType,
        colHeader,
      });
      
      console.log(`图片映射: ${cellRef} (${colHeader}) -> ${imageType}`);
    }
  } catch (error) {
    console.error('提取图片失败:', error);
  }
  
  console.log(`--- 拼多多解析完成 ---\n`);
  
  return {
    sheets: [{ name: sheetName, headers, rows, images }],
    platform: '拼多多',
  };
}

/**
 * 抖音专用解析（处理L列和N列）
 * - L列（索引11）：店铺月度数据截图 - 识别成交金额、退款金额、投放消耗
 * - N列（索引13）：支出总额截图 - 识别支出金额
 */
async function parseDouyinExcel(
  fileBuffer: Buffer, 
  taskId: string,
  quickHeaders: string[],
  sheetName: string
): Promise<ParseResult> {
  console.log(`\n--- 抖音解析开始 ---`);
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  
  const worksheet = workbook.worksheets[0];
  const headers = quickHeaders;
  const rows: RowData[] = [];
  const images: ExcelImage[] = [];
  
  // 新的列索引定义
  // K列 = 第11列（索引10）：刷单记录表格/截图（备选：店铺月度数据截图）
  // L列 = 第12列（索引11）：店铺月度数据截图（必填）
  // N列 = 第14列（索引13）：支出总额截图
  const K_COL_INDEX = 10; // 刷单记录/店铺月度数据截图（备选）
  const L_COL_INDEX = 11; // 店铺月度数据截图
  const N_COL_INDEX = 13; // 支出总额截图
  
  const kColHeader = headers[K_COL_INDEX] || '刷单记录表格/截图';
  const lColHeader = headers[L_COL_INDEX] || '店铺月度数据截图（必填）';
  const nColHeader = headers[N_COL_INDEX] || '支出总额截图';
  
  console.log(`抖音平台处理列:`);
  console.log(`  K列(索引${K_COL_INDEX}): ${kColHeader} (备选店铺月度数据)`);
  console.log(`  L列(索引${L_COL_INDEX}): ${lColHeader}`);
  console.log(`  N列(索引${N_COL_INDEX}): ${nColHeader}`);
  
  // 用于追踪是否有L列图片
  let hasLColImage = false;
  
  // 获取数据行
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    
    const rowData: RowData = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber - 1];
      rowData[header] = cell.value as string | number | null | undefined;
    });
    rows.push(rowData);
  });
  
  console.log(`数据行数: ${rows.length}`);
  
  // 提取图片 - 处理K列、L列、N列（K列作为L列备选）
  try {
    console.log(`开始提取图片（K列备选 + L列 + N列）...`);
    
    // 方法1：ExcelJS - 提取K列、L列、N列的图片
    const worksheetImages = worksheet.getImages();
    console.log(`ExcelJS检测到 ${worksheetImages.length} 张图片`);
    
    for (const img of worksheetImages) {
      const range = img.range;
      let cellRef = '';
      
      if (range.tl) {
        const colNum = Math.floor(Number(range.tl.col));
        const rowNum = Math.floor(Number(range.tl.row)) + 1;
        const colLetter = String.fromCharCode(65 + colNum);
        cellRef = `${colLetter}${rowNum}`;
        
        // 处理K列、L列、N列
        if (colNum !== K_COL_INDEX && colNum !== L_COL_INDEX && colNum !== N_COL_INDEX) {
          console.log(`跳过非目标列图片: ${cellRef} (列为${colLetter}, colNum=${colNum})`);
          continue;
        }
      }
      
      const imageData = workbook.getImage(img.imageId);
      if (imageData && imageData.buffer) {
        const imageBuffer = Buffer.from(imageData.buffer);
        
        // 确定图片类型
        const colNum = Math.floor(Number(range.tl.col));
        let imageType: string;
        let colHeader: string;
        
        if (colNum === L_COL_INDEX) {
          imageType = '店铺月度数据截图';
          colHeader = lColHeader;
          hasLColImage = true;
        } else if (colNum === N_COL_INDEX) {
          imageType = '支出总额截图';
          colHeader = nColHeader;
        } else {
          // K列暂时标记为备选，稍后决定是否使用
          imageType = '店铺月度数据截图(备选)';
          colHeader = kColHeader;
        }
        
        images.push({
          sheetName,
          cellRef,
          imageBuffer,
          md5: createHash('md5').update(imageBuffer).digest('hex'),
          imageType,
          colHeader,
        });
        console.log(`添加图片: ${cellRef} (${imageType})`);
      }
    }
    
    // 方法2：ZIP提取（备用）
    if (images.length === 0) {
      console.log(`ExcelJS未检测到图片，尝试ZIP提取...`);
      const embeddedImages = await extractEmbeddedImagesFromXlsx(fileBuffer, headers);
      
      for (const [cellRef, imageBuffer] of embeddedImages) {
        const colLetter = cellRef.match(/^[A-Z]+/)?.[0] || '';
        const colNum = colLetter.split('').reduce((acc, char) => acc * 26 + char.charCodeAt(0) - 64, 0) - 1;
        
        // 处理K列、L列、N列
        if (colNum !== K_COL_INDEX && colNum !== L_COL_INDEX && colNum !== N_COL_INDEX) {
          console.log(`跳过非目标列图片: ${cellRef} (colNum=${colNum})`);
          continue;
        }
        
        // 确定图片类型
        let imageType: string;
        let colHeader: string;
        
        if (colNum === L_COL_INDEX) {
          imageType = '店铺月度数据截图';
          colHeader = lColHeader;
          hasLColImage = true;
        } else if (colNum === N_COL_INDEX) {
          imageType = '支出总额截图';
          colHeader = nColHeader;
        } else {
          // K列暂时标记为备选
          imageType = '店铺月度数据截图(备选)';
          colHeader = kColHeader;
        }
        
        images.push({
          sheetName,
          cellRef,
          imageBuffer,
          md5: createHash('md5').update(imageBuffer).digest('hex'),
          imageType,
          colHeader,
        });
        console.log(`添加图片(ZIP): ${cellRef} (${imageType})`);
      }
    }
    
    // 后处理：如果没有L列图片，将K列备选图片转为正式的店铺月度数据截图
    if (!hasLColImage) {
      console.log(`L列无图片，启用K列备选图片作为店铺月度数据截图`);
      for (const img of images) {
        if (img.imageType === '店铺月度数据截图(备选)') {
          img.imageType = '店铺月度数据截图';
          console.log(`K列图片 ${img.cellRef} 已转为店铺月度数据截图`);
        }
      }
    } else {
      // 有L列图片，移除K列备选图片
      const kColImagesCount = images.filter(img => img.imageType === '店铺月度数据截图(备选)').length;
      if (kColImagesCount > 0) {
        console.log(`L列有图片，移除${kColImagesCount}张K列备选图片`);
        // 使用filter替代splice，避免索引偏移问题
        const filteredImages = images.filter(img => img.imageType !== '店铺月度数据截图(备选)');
        images.length = 0;
        images.push(...filteredImages);
      }
    }
  } catch (error) {
    console.error('提取图片失败:', error);
  }
  
  console.log(`--- 抖音解析完成，共提取 ${images.length} 张图片（K列备选 + L列 + N列） ---\n`);
  
  return {
    sheets: [{ name: sheetName, headers, rows, images }],
    platform: '抖音',
  };
}

/**
 * 通用解析（淘宝等其他平台）
 * 注意：只处理第一个sheet页，其余sheet页过滤掉
 */
async function parseGenericExcel(fileBuffer: Buffer, taskId: string): Promise<ParseResult> {
  console.log(`\n--- 通用解析开始 ---`);
  
  // 先快速识别表头（用于回退分配）
  const { headers: quickHeaders } = await quickIdentifyPlatform(fileBuffer);
  
  // 先提取图片（需要headers用于回退分配）
  const embeddedImages = await extractEmbeddedImagesFromXlsx(fileBuffer, quickHeaders);
  console.log(`从ZIP提取到 ${embeddedImages.size} 张图片`);
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  
  const sheets: ExcelSheet[] = [];
  
  // 只处理第一个sheet，过滤掉其余sheet页
  const worksheet = workbook.worksheets[0];
  if (worksheet) {
    const sheetName = worksheet.name;
    const headers: string[] = [];
    const rows: RowData[] = [];
    const images: ExcelImage[] = [];
    
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      headers.push(cell.value?.toString() || `列${colNumber}`);
    });
    
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      
      const rowData: RowData = {};
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1];
        rowData[header] = cell.value as string | number | null | undefined;
      });
      rows.push(rowData);
    });
    
    // 映射图片
    for (const [cellRef, imageBuffer] of embeddedImages) {
      const colLetter = cellRef.match(/^[A-Z]+/)?.[0] || '';
      const colIndex = colLetter.split('').reduce((acc, char) => acc * 26 + char.charCodeAt(0) - 64, 0) - 1;
      const colHeader = headers[colIndex] || '';
      
      images.push({
        sheetName,
        cellRef,
        imageBuffer,
        md5: createHash('md5').update(imageBuffer).digest('hex'),
        imageType: getImageType(colHeader),
        colHeader,
      });
    }
    
    sheets.push({ name: sheetName, headers, rows, images });
    console.log(`只处理第一个sheet: ${sheetName}`);
  }
  
  const platform = sheets.length > 0 ? detectPlatform(sheets[0].name, sheets[0].headers) : '未知';
  
  console.log(`--- 通用解析完成 ---\n`);
  
  return { sheets, platform };
}

/**
 * 上传图片到对象存储
 */
export async function uploadImages(
  images: ExcelImage[],
  taskId: string
): Promise<void> {
  for (const image of images) {
    try {
      const ext = image.imageBuffer[0] === 0x89 ? 'png' : 
                  image.imageBuffer[0] === 0xFF ? 'jpg' : 'png';
      const fileName = `${image.sheetName}_${image.cellRef}_${Date.now()}.${ext}`;
      const filePath = generateFilePath(taskId, 'image', fileName);
      
      const imageKey = await storageUploadFile({
        fileContent: image.imageBuffer,
        fileName: filePath,
        contentType: `image/${ext}`,
      });

      image.imageKey = imageKey;
      console.log(`上传图片成功: ${fileName} -> ${imageKey}`);
    } catch (error) {
      console.error('上传图片失败:', error);
    }
  }
}

/**
 * 平台特征库
 */
export const PLATFORM_FEATURES = {
  '抖音': ['成交金额', '支出金额', '刷单金额', '店铺月度数据截图', '抖店', '分销'],
  '拼多多': ['营业额', '提现金额', '多多账单截图', '账单中退款金额'],
  '淘宝': ['净营业额', '淘宝客', '无界总费用', '淘金币服务费'],
};

/**
 * 识别平台
 */
export function identifyPlatform(headers: string[], sheetName?: string): string | null {
  // 首先检查工作表名称
  if (sheetName) {
    if (sheetName.includes('抖店') || sheetName.includes('抖音')) {
      return '抖音';
    }
    if (sheetName.includes('拼多多') || sheetName.includes('多多')) {
      return '拼多多';
    }
    if (sheetName.includes('淘宝')) {
      return '淘宝';
    }
  }
  
  let bestMatch: { platform: string; score: number } | null = null;

  for (const [platform, features] of Object.entries(PLATFORM_FEATURES)) {
    // 计算Jaccard相似度
    const intersection = headers.filter(h => 
      features.some(f => h.includes(f) || f.includes(h))
    );
    const union = new Set([...headers, ...features]);
    const score = intersection.length / union.size;

    if (score > 0.2 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { platform, score };
    }
  }

  return bestMatch?.platform || null;
}

/**
 * 提取可能的截图列
 */
export function identifyScreenshotColumns(headers: string[]): string[] {
  const screenshotKeywords = ['截图', '图片', '账单', '数据'];
  return headers.filter(h => 
    screenshotKeywords.some(k => h.includes(k))
  );
}
