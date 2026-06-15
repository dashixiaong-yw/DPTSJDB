/**
 * 端到端测试 - 上传文件并检查结果
 */

const fs = require('fs');
const { Blob } = require('buffer');

const BILL_FILE = '2026年分销账单（抖店）+收集表 (1).xlsx';
const SERVER_URL = 'http://localhost:3080';

async function e2eTest() {
  console.log('===== 端到端测试 =====\n');
  
  try {
    // 1. 上传文件
    console.log('1. 上传文件...');
    const fileBuffer = fs.readFileSync(BILL_FILE);
    
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    formData.append('file', blob, BILL_FILE);
    
    const uploadResponse = await fetch(`${SERVER_URL}/api/upload`, {
      method: 'POST',
      body: formData,
    });
    
    if (!uploadResponse.ok) {
      console.log(`❌ 上传失败 (${uploadResponse.status}):`, await uploadResponse.text());
      return;
    }
    
    const uploadResult = await uploadResponse.json();
    const taskId = uploadResult.taskId || uploadResult.id;
    console.log(`✅ 上传成功, taskId: ${taskId}`);
    
    // 2. 启动任务
    console.log('\n2. 启动任务...');
    const startResponse = await fetch(`${SERVER_URL}/api/task/${taskId}/start`, {
      method: 'POST',
    });
    
    if (!startResponse.ok) {
      console.log(`❌ 启动失败 (${startResponse.status}):`, await startResponse.text());
      return;
    }
    
    console.log('✅ 任务已启动');
    
    // 3. 轮询状态
    console.log('\n3. 等待任务完成...');
    let attempts = 0;
    const maxAttempts = 90;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
      
      const statusResponse = await fetch(`${SERVER_URL}/api/task/${taskId}/status`);
      if (!statusResponse.ok) continue;
      
      const status = await statusResponse.json();
      process.stdout.write(`[${attempts * 5}s] 状态: ${status.status}, 进度: ${status.progress || 0}%\r`);
      
      if (status.status === 'completed') {
        console.log(`\n✅ 任务完成!`);
        break;
      } else if (status.status === 'failed') {
        console.log(`\n❌ 任务失败: ${status.error}`);
        return;
      }
    }
    
    // 4. 获取结果
    console.log('\n4. 获取结果...');
    const resultResponse = await fetch(`${SERVER_URL}/api/task/${taskId}/result`);
    
    if (!resultResponse.ok) {
      console.log(`❌ 获取结果失败 (${resultResponse.status}):`, await resultResponse.text());
      return;
    }
    
    const result = await resultResponse.json();
    
    // 检查OCR识别结果
    let totalItems = 0;
    let itemsWithOcrData = 0;
    let itemsWithZeroAmounts = 0;
    
    if (result.items && result.items.length > 0) {
      console.log(`\n结果项数: ${result.items.length}`);
      
      for (const item of result.items) {
        totalItems++;
        const hasOcrData = item.comparisons?.some(c => c.ocrValue !== undefined && c.ocrValue !== null);
        const hasZeroAmounts = item.comparisons?.some(c => c.ocrValue === 0);
        
        if (hasOcrData) itemsWithOcrData++;
        if (hasZeroAmounts) itemsWithZeroAmounts++;
        
        const shopName = item.tableShopName || item.shopName || '未知';
        console.log(`\n  店铺: ${shopName}`);
        if (item.comparisons) {
          for (const c of item.comparisons) {
            const ocrStr = c.ocrValue !== undefined && c.ocrValue !== null ? c.ocrValue : '缺失';
            console.log(`    ${c.fieldName}: 表格=${c.tableValue}, OCR=${ocrStr}, 状态=${c.status}`);
          }
        }
      }
    }
    
    console.log(`\n===== 测试结果 =====`);
    console.log(`总项数: ${totalItems}`);
    console.log(`有OCR数据的项: ${itemsWithOcrData}`);
    console.log(`OCR金额为0的项: ${itemsWithZeroAmounts}`);
    console.log(`\n结果页面: ${SERVER_URL}/result/${taskId}`);
    
  } catch (error) {
    console.error('测试失败:', error.message);
  }
}

e2eTest().catch(console.error);
