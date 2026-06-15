/**
 * 分析问题图片的位置
 */

const fs = require('fs');
const JSZip = require('jszip');

const billPath = '2026年分销账单（抖店）+收集表 (1).xlsx';

async function analyzeImages() {
  console.log('===== 分析问题图片位置 =====\n');
  
  try {
    const fileBuffer = fs.readFileSync(billPath);
    const zip = await JSZip.loadAsync(fileBuffer);
    
    // 解析cellimages.xml获取图片位置映射
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
    
    // 构建完整映射
    console.log('图片位置映射:');
    console.log('----------------');
    
    const imageByCell = new Map();
    for (const [cellRef, imageId] of cellToId) {
      const rid = idToRid.get(imageId);
      if (rid) {
        const imageNum = ridToImage.get(rid);
        if (imageNum !== undefined) {
          imageByCell.set(cellRef, imageNum);
          console.log(`${cellRef} -> image${imageNum}`);
        }
      }
    }
    
    // 列出问题图片的位置
    console.log('\n问题图片分析:');
    console.log('----------------');
    
    const problemImages = {
      12: '只有802 bytes，可能是空白图片',
      13: 'OCR识别全为0',
      2: '是结算账单页面，不是店铺月度数据',
      3: '是赔付款项明细，不是店铺月度数据',
    };
    
    for (const [cellRef, imageNum] of imageByCell) {
      if (problemImages[imageNum]) {
        console.log(`${cellRef} -> image${imageNum}: ${problemImages[imageNum]}`);
      }
    }
    
    // 检查OCR结果为0的图片对应的行
    console.log('\nOCR识别为0的行:');
    console.log('----------------');
    
    const zeroOcrImages = [12, 13];
    for (const [cellRef, imageNum] of imageByCell) {
      if (zeroOcrImages.includes(imageNum)) {
        const rowNum = cellRef.match(/\d+/)[0];
        const colLetter = cellRef.match(/^[A-Z]+/)[0];
        console.log(`行${rowNum}${colLetter}: image${imageNum} - OCR识别失败`);
      }
    }
    
  } catch (error) {
    console.error('分析失败:', error.message);
  }
}

analyzeImages().catch(console.error);
