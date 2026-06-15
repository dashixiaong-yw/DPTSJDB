/**
 * 测试完整处理流程
 */

const fs = require('fs');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const path = require('path');

const billPath = '2026年分销账单（抖店）+收集表 (1).xlsx';

// 模拟代码中的列配置
const K_COL_INDEX = 10; // K列 - 刷单记录
const L_COL_INDEX = 11; // L列 - 店铺月度数据截图
const N_COL_INDEX = 13; // N列 - 支出总额截图

async function simulateProcessFlow() {
  console.log('===== 模拟完整处理流程 =====\n');
  
  const fileBuffer = fs.readFileSync(billPath);
  
  // 步骤1: 解析Excel
  console.log('--- 步骤1: 解析Excel ---');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  
  const worksheet = workbook.worksheets[0];
  const headers = [];
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    headers.push(cell.value?.toString() || `列${colNumber}`);
  });
  
  // 读取数据行
  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rowData = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber - 1];
      rowData[header] = cell.value?.toString() || '';
    });
    rows.push({ rowNumber, rowData });
  });
  
  console.log(`数据行数: ${rows.length}`);
  
  // 步骤2: 提取图片
  console.log('\n--- 步骤2: 提取图片 ---');
  const images = [];
  
  // 使用ZIP方式提取（模拟extractEmbeddedImagesFromXlsx）
  const zip = await JSZip.loadAsync(fileBuffer);
  
  // 提取所有图片文件
  const imageDataMap = new Map();
  const fileNames = Object.keys(zip.files);
  for (const fileName of fileNames) {
    if (fileName.startsWith('xl/media/') && !zip.files[fileName].dir) {
      const match = fileName.match(/image(\d+)\.(png|jpg|jpeg|gif|bmp)$/i);
      if (match) {
        const imageNumber = parseInt(match[1], 10);
        const imageData = await zip.files[fileName].async('nodebuffer');
        imageDataMap.set(imageNumber, imageData);
      }
    }
  }
  
  // 解析cellimages.xml
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
  
  // 解析rels文件
  const ridToImage = new Map();
  if (zip.files['xl/_rels/cellimages.xml.rels']) {
    const relsContent = await zip.files['xl/_rels/cellimages.xml.rels'].async('text');
    const relMatches = relsContent.matchAll(/Id="(rId\d+)"[^>]*Target="media\/image(\d+)\.[^"]*"/g);
    for (const match of relMatches) {
      ridToImage.set(match[1], parseInt(match[2], 10));
    }
  }
  
  // 解析sheet1.xml中的DISPIMG
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
  
  // 构建完整映射
  const imageByCell = new Map();
  for (const [cellRef, imageId] of cellToId) {
    const rid = idToRid.get(imageId);
    if (rid) {
      const imageNum = ridToImage.get(rid);
      if (imageNum !== undefined) {
        const buffer = imageDataMap.get(imageNum);
        if (buffer) {
          imageByCell.set(cellRef, { buffer, imageNum });
        }
      }
    }
  }
  
  console.log(`提取到图片: ${imageByCell.size} 张`);
  console.log('图片分布:');
  for (const [cellRef, info] of imageByCell) {
    console.log(`  ${cellRef} -> image${info.imageNum}`);
  }
  
  // 步骤3: 构建行到图片的映射（模拟buildRowImagesMap）
  console.log('\n--- 步骤3: 构建行到图片的映射 ---');
  const rowImagesMap = new Map();
  
  for (const [cellRef, info] of imageByCell) {
    const match = cellRef.match(/([A-Z]+)(\d+)/);
    if (match) {
      const colLetter = match[1];
      const rowNum = parseInt(match[2]);
      const colNum = colLetter.split('').reduce((acc, char) => acc * 26 + char.charCodeAt(0) - 64, 0) - 1;
      
      // 确定图片类型
      let imageType = '其他';
      if (colNum === L_COL_INDEX) {
        imageType = '店铺月度数据截图';
      } else if (colNum === N_COL_INDEX) {
        imageType = '支出总额截图';
      } else if (colNum === K_COL_INDEX) {
        imageType = '店铺月度数据截图(备选)';
      }
      
      if (!rowImagesMap.has(rowNum)) {
        rowImagesMap.set(rowNum, new Map());
      }
      rowImagesMap.get(rowNum).set(imageType, {
        cellRef,
        imageType,
        buffer: info.buffer,
        colNum
      });
    }
  }
  
  console.log('每行的图片分布:');
  for (const [rowNum, imagesForRow] of rowImagesMap) {
    const types = Array.from(imagesForRow.keys()).join(', ');
    console.log(`  行${rowNum}: ${types}`);
  }
  
  // 步骤4: 收集需要处理的行（模拟collectRowsToProcess）
  console.log('\n--- 步骤4: 收集需要处理的行 ---');
  const rowsToProcess = [];
  
  rows.forEach(({ rowNumber, rowData }) => {
    const imagesForRow = rowImagesMap.get(rowNumber);
    if (imagesForRow && imagesForRow.size > 0) {
      rowsToProcess.push({ rowNumber, imagesForRow, rowData });
    }
  });
  
  console.log(`需要处理的行数: ${rowsToProcess.length}`);
  rowsToProcess.forEach(r => {
    const shopName = r.rowData['店铺名'] || r.rowData['店铺名称'] || '未知';
    const types = Array.from(r.imagesForRow.keys()).join(', ');
    console.log(`  行${r.rowNumber}: ${shopName} - ${types}`);
  });
  
  // 步骤5: 分析问题
  console.log('\n--- 步骤5: 问题分析 ---');
  
  // 检查哪些行缺少店铺月度数据截图
  const rowsMissingMonthly = rowsToProcess.filter(r => 
    !r.imagesForRow.has('店铺月度数据截图') && !r.imagesForRow.has('店铺月度数据截图(备选)')
  );
  
  if (rowsMissingMonthly.length > 0) {
    console.log('❌ 缺少店铺月度数据截图的行:');
    rowsMissingMonthly.forEach(r => {
      const shopName = r.rowData['店铺名'] || '未知';
      const types = Array.from(r.imagesForRow.keys()).join(', ');
      console.log(`  行${r.rowNumber}: ${shopName} - 只有 ${types}`);
    });
  } else {
    console.log('✅ 所有行都有店铺月度数据截图');
  }
  
  // 检查API密钥配置
  console.log('\n--- 步骤6: 检查API配置 ---');
  const envPath = '.env';
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const apiKeyMatch = envContent.match(/SILICONFLOW_API_KEY=(.+)/);
    if (apiKeyMatch) {
      const apiKey = apiKeyMatch[1].trim();
      if (apiKey === 'your_siliconflow_api_key_here') {
        console.log('❌ API密钥未配置（仍为默认值）');
        console.log('   这会导致OCR识别失败，所有数据行被跳过');
      } else {
        console.log('✅ API密钥已配置');
      }
    }
  } else {
    console.log('❌ .env文件不存在');
  }
  
  console.log('\n===== 流程模拟完成 =====');
}

simulateProcessFlow().catch(console.error);
