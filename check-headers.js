/**
 * 检查Excel表头和图片映射
 */

const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const fs = require('fs');

const billPath = '2026年分销账单（抖店）+收集表 (1).xlsx';

async function checkHeadersAndImages() {
  console.log('===== 检查Excel表头和图片映射 =====\n');
  
  try {
    const fileBuffer = fs.readFileSync(billPath);
    
    // 1. 读取表头
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);
    const worksheet = workbook.worksheets[0];
    
    const headers = [];
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      headers.push({ colNumber, value: cell.value?.toString() || '' });
    });
    
    console.log('表头列表:');
    headers.forEach(h => {
      const colLetter = String.fromCharCode(64 + h.colNumber);
      console.log(`  ${colLetter}(${h.colNumber}): ${h.value}`);
    });
    
    // 2. 读取数据行
    console.log('\n数据行:');
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const shopName = row.getCell(1)?.value?.toString() || '';
      const month = row.getCell(2)?.value?.toString() || '';
      console.log(`  行${rowNumber}: ${shopName}, ${month}`);
    });
    
    // 3. 检查图片映射
    const zip = await JSZip.loadAsync(fileBuffer);
    
    // 解析cellimages.xml
    const cellToId = new Map();
    if (zip.files['xl/worksheets/sheet1.xml']) {
      const sheetContent = await zip.files['xl/worksheets/sheet1.xml'].async('text');
      const lines = sheetContent.split('</c>');
      for (const line of lines) {
        if (line.includes('DISPIMG') || line.includes('ID_')) {
          const cellMatches = line.matchAll(/<c\s+r="([A-Z]+\d+)"/g);
          let lastCellMatch = null;
          for (const m of cellMatches) {
            lastCellMatch = m;
          }
          const idMatch = line.match(/(ID_[A-F0-9]+)/i);
          if (lastCellMatch && idMatch) {
            cellToId.set(lastCellMatch[1], idMatch[1]);
          }
        }
      }
    }
    
    const idToRid = new Map();
    if (zip.files['xl/cellimages.xml']) {
      const cellImagesContent = await zip.files['xl/cellimages.xml'].async('text');
      const picMatches = cellImagesContent.matchAll(/<xdr:pic>([\s\S]*?)<\/xdr:pic>/g);
      for (const match of picMatches) {
        const picContent = match[1];
        const idMatch = picContent.match(/name="(ID_[A-F0-9]+)"/i);
        const ridMatch = picContent.match(/r:embed="(rId\d+)"/i);
        if (idMatch && ridMatch) {
          idToRid.set(idMatch[1], ridMatch[1]);
        }
      }
    }
    
    const ridToImage = new Map();
    if (zip.files['xl/_rels/cellimages.xml.rels']) {
      const relsContent = await zip.files['xl/_rels/cellimages.xml.rels'].async('text');
      const relMatches = relsContent.matchAll(/Id="(rId\d+)"[^>]*Target="media\/image(\d+)\.[^"]*"/g);
      for (const match of relMatches) {
        ridToImage.set(match[1], parseInt(match[2], 10));
      }
    }
    
    const imageByCell = new Map();
    for (const [cellRef, imageId] of cellToId) {
      const rid = idToRid.get(imageId);
      if (rid) {
        const imageNum = ridToImage.get(rid);
        if (imageNum !== undefined) {
          imageByCell.set(cellRef, imageNum);
        }
      }
    }
    
    console.log('\n图片位置映射:');
    for (const [cellRef, imageNum] of imageByCell) {
      const colLetter = cellRef.match(/^[A-Z]+/)[0];
      const colNum = colLetter.split('').reduce((acc, char) => acc * 26 + char.charCodeAt(0) - 64, 0) - 1;
      
      // 获取图片大小
      const imageFileName = `xl/media/image${imageNum}.png`;
      const imageData = await zip.files[imageFileName]?.async('nodebuffer');
      const size = imageData ? imageData.length : 0;
      
      // 确定图片类型
      let imageType = '未知';
      if (colNum === 10) imageType = 'K列(刷单记录/备选)';
      else if (colNum === 11) imageType = 'L列(店铺月度数据截图)';
      else if (colNum === 13) imageType = 'N列(支出总额截图)';
      else imageType = `${colLetter}列(非目标列)`;
      
      console.log(`  ${cellRef} -> image${imageNum} (${(size / 1024).toFixed(1)}KB) - ${imageType}`);
    }
    
    // 4. 分析哪些行有完整的图片
    console.log('\n每行图片完整性:');
    const rowImages = new Map();
    for (const [cellRef, imageNum] of imageByCell) {
      const rowNum = parseInt(cellRef.match(/\d+/)[0]);
      const colLetter = cellRef.match(/^[A-Z]+/)[0];
      if (!rowImages.has(rowNum)) rowImages.set(rowNum, {});
      rowImages.get(rowNum)[colLetter] = imageNum;
    }
    
    for (const [rowNum, cols] of rowImages) {
      const hasL = 'L' in cols;
      const hasN = 'N' in cols;
      const hasK = 'K' in cols;
      console.log(`  行${rowNum}: L=${hasL ? 'image' + cols.L : '❌'}, N=${hasN ? 'image' + cols.N : '❌'}, K=${hasK ? 'image' + cols.K : '❌'}`);
    }
    
  } catch (error) {
    console.error('检查失败:', error.message);
  }
}

checkHeadersAndImages().catch(console.error);
