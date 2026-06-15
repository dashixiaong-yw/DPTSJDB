/**
 * 测试图片提取流程
 */

const fs = require('fs');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');

const billPath = '2026年分销账单（抖店）+收集表 (1).xlsx';

async function testImageExtraction() {
  console.log('===== 测试图片提取流程 =====\n');
  
  const fileBuffer = fs.readFileSync(billPath);
  
  // 1. 测试ExcelJS getImages方法
  console.log('--- 测试1: ExcelJS getImages() ---');
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);
    
    const worksheet = workbook.worksheets[0];
    const images = worksheet.getImages();
    console.log(`ExcelJS检测到图片数量: ${images.length}`);
    
    images.forEach((img, i) => {
      console.log(`  图片${i}:`, {
        imageId: img.imageId,
        range: img.range ? { 
          tl: img.range.tl ? { col: img.range.tl.col, row: img.range.tl.row } : null,
          br: img.range.br ? { col: img.range.br.col, row: img.range.br.row } : null
        } : null
      });
    });
    
    // 尝试获取图片数据
    if (images.length > 0) {
      const firstImage = images[0];
      const imageData = workbook.getImage(firstImage.imageId);
      console.log(`\n第一张图片数据:`, {
        hasBuffer: imageData && imageData.buffer ? true : false,
        bufferSize: imageData && imageData.buffer ? imageData.buffer.length : 0
      });
    }
    
  } catch (error) {
    console.error('❌ ExcelJS图片提取失败:', error.message);
  }
  
  // 2. 测试ZIP提取方法
  console.log('\n--- 测试2: ZIP直接提取 ---');
  try {
    const zip = await JSZip.loadAsync(fileBuffer);
    
    // 获取所有图片文件
    const imageFiles = Object.keys(zip.files).filter(f => f.startsWith('xl/media/') && !zip.files[f].dir);
    console.log(`ZIP中图片文件数量: ${imageFiles.length}`);
    
    // 解析cellimages.xml
    if (zip.files['xl/cellimages.xml']) {
      console.log('\n解析cellimages.xml...');
      const cellImagesContent = await zip.files['xl/cellimages.xml'].async('text');
      
      // 解析ID到rId映射
      const idToRid = new Map();
      const picMatches = cellImagesContent.matchAll(/<xdr:pic>([\s\S]*?)<\/xdr:pic>/g);
      for (const match of picMatches) {
        const picContent = match[1];
        const idMatch = picContent.match(/name="(ID_[A-F0-9]+)"/i);
        const ridMatch = picContent.match(/r:embed="(rId\d+)"/i);
        if (idMatch && ridMatch) {
          idToRid.set(idMatch[1], ridMatch[1]);
        }
      }
      console.log(`ID到rId映射数量: ${idToRid.size}`);
      
      // 解析rels文件
      if (zip.files['xl/_rels/cellimages.xml.rels']) {
        const relsContent = await zip.files['xl/_rels/cellimages.xml.rels'].async('text');
        const ridToImage = new Map();
        const relMatches = relsContent.matchAll(/Id="(rId\d+)"[^>]*Target="media\/image(\d+)\.[^"]*"/g);
        for (const match of relMatches) {
          ridToImage.set(match[1], parseInt(match[2], 10));
        }
        console.log(`rId到image映射数量: ${ridToImage.size}`);
        
        // 构建完整映射
        const idToImageNum = new Map();
        for (const [imageId, rid] of idToRid) {
          const imageNum = ridToImage.get(rid);
          if (imageNum !== undefined) {
            idToImageNum.set(imageId, imageNum);
          }
        }
        console.log(`完整ID到图片映射数量: ${idToImageNum.size}`);
      }
    }
    
    // 解析sheet1.xml中的DISPIMG公式
    if (zip.files['xl/worksheets/sheet1.xml']) {
      console.log('\n解析sheet1.xml中的DISPIMG...');
      const sheetContent = await zip.files['xl/worksheets/sheet1.xml'].async('text');
      
      // 找出所有包含DISPIMG的单元格
      const lines = sheetContent.split('</c>');
      const cellToId = new Map();
      
      for (const line of lines) {
        if (line.includes('DISPIMG') || line.includes('ID_')) {
          // 获取最后一个单元格引用
          const cellMatches = line.matchAll(/<c\s+r="([A-Z]+\d+)"/g);
          let lastCellMatch = null;
          for (const m of cellMatches) {
            lastCellMatch = m;
          }
          
          const idMatch = line.match(/(ID_[A-F0-9]+)/i);
          
          if (lastCellMatch && idMatch) {
            cellToId.set(lastCellMatch[1], idMatch[1]);
            // console.log(`  ${lastCellMatch[1]} -> ${idMatch[1]}`);
          }
        }
      }
      console.log(`单元格到ID映射数量: ${cellToId.size}`);
      
      // 输出映射结果
      console.log('\n单元格到图片映射:');
      const sortedCells = Array.from(cellToId.keys()).sort();
      sortedCells.forEach(cellRef => {
        console.log(`  ${cellRef} -> ${cellToId.get(cellRef)}`);
      });
    }
    
  } catch (error) {
    console.error('❌ ZIP提取失败:', error.message);
  }
  
  // 3. 测试图片提取后的处理流程
  console.log('\n--- 测试3: 模拟实际处理流程 ---');
  
  // 检查哪些行有图片
  console.log('期望的图片分布（7行数据）:');
  console.log('  K列(刷单记录): 可能有或没有图片');
  console.log('  L列(店铺月度数据截图): 必须有图片');
  console.log('  N列(支出总额截图): 可能有或没有图片');
  
  // 根据诊断，L列应该有7张图片（必填），N列可能有7张图片
  // 总共14张图片，说明L列和N列各7张
  
  console.log('\n从诊断结果看:');
  console.log('  总图片数: 14');
  console.log('  数据行数: 7');
  console.log('  推断: L列7张 + N列7张（K列没有图片）');
  
  // 检查代码中的图片列配置
  console.log('\n代码中配置的图片列:');
  console.log('  K_COL_INDEX = 10 (刷单记录/备选店铺月度数据)');
  console.log('  L_COL_INDEX = 11 (店铺月度数据截图 - 必填)');
  console.log('  N_COL_INDEX = 13 (支出总额截图)');
  
  console.log('\n===== 测试完成 =====');
}

testImageExtraction().catch(console.error);
