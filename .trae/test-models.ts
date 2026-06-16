import { OCRService } from '../src/lib/ocr-service';
import * as fs from 'fs';

async function testModels() {
  const service = new OCRService();
  
  const testImages = [
    'data/uploads/douyin_端端礼品伴手礼_月度账单_row_2_9krxta.png',
    'data/uploads/douyin_端端礼品伴手礼_月度账单_row_2_grrtov.png',
    'data/uploads/douyin_端端礼品伴手礼_月度账单_row_2_jep53p.png',
    'data/uploads/douyin_端端礼品伴手礼_月度账单_row_2_pkfw73.png',
  ];
  
  const modelsToTest = [
    'Qwen/Qwen3-VL-32B-Instruct',
    'Qwen/Qwen3-VL-8B-Instruct',
    'Qwen/Qwen3-VL-30B-A3B-Instruct',
    'PaddlePaddle/PaddleOCR-VL-1.5',
    'deepseek-ai/DeepSeek-OCR',
    'zai-org/GLM-4.5V',
  ];
  
  const expectedValues = {
    '成交金额': 32183.70,
    '退款金额': 7003.60,
    '投放消耗': 0,
  };
  
  for (const imagePath of testImages) {
    if (!fs.existsSync(imagePath)) {
      console.log(`跳过：${imagePath} 不存在`);
      continue;
    }
    
    console.log(`\n=== 测试图片：${imagePath} ===`);
    
    const base64 = fs.readFileSync(imagePath).toString('base64');
    const imageUrl = `data:image/png;base64,${base64}`;
    
    for (const model of modelsToTest) {
      console.log(`\n--- 模型：${model} ---`);
      
      try {
        const result = await service.recognize(imageUrl, '抖音', '店铺月度数据截图', model);
        
        if (result.error) {
          console.log(`  ❌ 错误：${result.error}`);
          continue;
        }
        
        console.log(`  📋 店铺名称：${result.shop_name || '未识别'}`);
        console.log(`  📅 月份：${result.month || '未识别'}`);
        console.log(`  💰 金额识别结果：`);
        
        if (result.amounts) {
          for (const [key, value] of Object.entries(result.amounts)) {
            const expected = expectedValues[key as keyof typeof expectedValues];
            const status = expected !== undefined 
              ? Math.abs((value as number) - expected) < 0.01 ? '✅' : '❌'
              : '➖';
            const diff = expected !== undefined ? ` (期望: ${expected})` : '';
            console.log(`    ${status} ${key}: ${value}${diff}`);
          }
        }
        
        if (result.raw_text && result.raw_text.length > 0) {
          console.log(`  📝 原始文本（前200字符）：${result.raw_text.substring(0, 200)}...`);
        }
        
      } catch (error) {
        console.log(`  ❌ 异常：${error}`);
      }
    }
  }
}

testModels().catch(console.error);
