/**
 * 诊断脚本 - 分析抖店账单文件解析流程
 */

import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { createHash } from 'crypto';

const billPath = '2026年分销账单（抖店）+收集表 (1).xlsx';

async function testExcelParse() {
  console.log('===== 开始诊断抖店账单文件 =====\n');
  
  // 1. 检查文件是否存在
  if (!fs.existsSync(billPath)) {
    console.error(`❌ 文件不存在: ${billPath}`);
    return;
  }
  
  const fileBuffer = fs.readFileSync(billPath) as unknown as Buffer;
    console.log(`📄 文件大小: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
  
  // 2. 解析Excel结构
  console.log('\n--- 步骤1: 解析Excel结构 ---');
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);
    
    console.log(`📊 工作表数量: ${workbook.worksheets.length}`);
    
    const worksheet = workbook.worksheets[0];
    console.log(`📋 工作表名称: ${worksheet.name}`);
    
    // 读取表头
    const headers: string[] = [];
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      headers.push(cell.value?.toString() || `列${colNumber}`);
    });
    console.log(`📝 表头列数: ${headers.length}`);
    console.log(`🔍 前20列表头: ${headers.slice(0, 20).join(', ')}`);
    
    // 检查关键字段位置
    const keyColumns = ['店铺名', '店铺名称', '店铺', '账单月份', '月份', '成交金额', '退款金额', '投放消耗', '支出金额'];
    console.log('\n🔑 关键字段位置:');
    keyColumns.forEach(key => {
      const idx = headers.findIndex(h => h.includes(key));
      if (idx >= 0) {
        const colLetter = String.fromCharCode(65 + idx);
        console.log(`  - ${key}: 第${idx + 1}列 (${colLetter})`);
      }
    });
    
    // 检查图片列
    console.log('\n🖼️ 图片相关列:');
    const imageColumns = ['截图', '图片', '月度数据', '支出总额'];
    imageColumns.forEach(key => {
      const idx = headers.findIndex(h => h.includes(key));
      if (idx >= 0) {
        const colLetter = String.fromCharCode(65 + idx);
        console.log(`  - ${headers[idx]}: 第${idx + 1}列 (${colLetter}, 索引${idx})`);
      }
    });
    
    // 检查数据行数
    const dataRows: string[][] = [];
    let rowCount = 0;
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      rowCount++;
      if (rowCount <= 3) {
        const rowData: string[] = [];
        row.eachCell((cell) => {
          rowData.push(cell.value?.toString().substring(0, 20) || '');
        });
        dataRows.push(rowData);
      }
    });
    console.log(`\n📈 数据行数: ${rowCount}`);
    console.log('🔍 前3行数据预览:');
    dataRows.forEach((row, i) => {
      console.log(`  行${i + 2}: ${row.slice(0, 10).join(' | ')}`);
    });
    
  } catch (error) {
    console.error('❌ Excel解析失败:', error);
    return;
  }
  
  // 3. 检查嵌入图片
  console.log('\n--- 步骤2: 检查嵌入图片 ---');
  try {
    const zip = await JSZip.loadAsync(fileBuffer);
    const imageFiles = Object.keys(zip.files).filter(f => f.startsWith('xl/media/') && !zip.files[f].dir);
    console.log(`🖼️ 图片文件数量: ${imageFiles.length}`);
    
    imageFiles.forEach((f, i) => {
      console.log(`  - ${f}`);
    });
    
    // 检查cellimages.xml（WPS格式）
    if (zip.files['xl/cellimages.xml']) {
      console.log('\n✅ 检测到cellimages.xml (WPS格式)');
      const content = await zip.files['xl/cellimages.xml'].async('text');
      const picCount = (content.match(/<xdr:pic>/g) || []).length;
      console.log(`  图片数量: ${picCount}`);
    } else {
      console.log('\n❌ 未检测到cellimages.xml');
    }
    
    // 检查drawing1.xml（标准格式）
    if (zip.files['xl/drawings/drawing1.xml']) {
      console.log('✅ 检测到drawing1.xml (标准格式)');
    } else {
      console.log('❌ 未检测到drawing1.xml');
    }
    
    // 检查sheet1.xml中的DISPIMG
    if (zip.files['xl/worksheets/sheet1.xml']) {
      const content = await zip.files['xl/worksheets/sheet1.xml'].async('text');
      const dispImgCount = (content.match(/DISPIMG/g) || []).length;
      const idCount = (content.match(/ID_[A-F0-9]+/gi) || []).length;
      console.log(`\n📊 sheet1.xml分析:`);
      console.log(`  DISPIMG公式数量: ${dispImgCount}`);
      console.log(`  图片ID数量: ${idCount}`);
    }
    
  } catch (error) {
    console.error('❌ ZIP解析失败:', error);
    return;
  }
  
  // 4. 检查平台识别
  console.log('\n--- 步骤3: 平台识别测试 ---');
  const fileName = '2026年分销账单（抖店）+收集表 (1).xlsx';
  const fileNameLower = fileName.toLowerCase();
  
  console.log(`📁 文件名: ${fileName}`);
  
  if (fileNameLower.includes('抖音') || fileNameLower.includes('douyin') || fileNameLower.includes('抖店')) {
    console.log('✅ 根据文件名识别为: 抖音');
  } else {
    console.log('❌ 文件名无法识别平台');
  }
  
  console.log('\n===== 诊断完成 =====');
}

testExcelParse().catch(console.error);
