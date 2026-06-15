/**
 * 测试Qwen3-VL模型
 */

const fs = require('fs');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');

const apiKey = 'sk-fcduifoesykghqpnxuhftqomikojlqhavrprkuwbwafgoseh';

async function testQwenVL() {
  console.log('===== 测试Qwen3-VL模型 =====\n');
  
  try {
    // 提取第一张图片
    const billPath = '2026年分销账单（抖店）+收集表 (1).xlsx';
    const fileBuffer = fs.readFileSync(billPath);
    const zip = await JSZip.loadAsync(fileBuffer);
    
    let firstImageBuffer = null;
    for (const fileName of Object.keys(zip.files)) {
      if (fileName.startsWith('xl/media/') && !zip.files[fileName].dir) {
        firstImageBuffer = await zip.files[fileName].async('nodebuffer');
        break;
      }
    }
    
    if (!firstImageBuffer) {
      console.log('❌ 未找到图片');
      return;
    }
    
    console.log(`✅ 找到测试图片 (${firstImageBuffer.length} bytes)`);
    
    const base64Image = firstImageBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;
    
    // 测试 Qwen3-VL-32B-Instruct
    console.log('\n测试 Qwen3-VL-32B-Instruct...');
    let result = await testModel('Qwen/Qwen3-VL-32B-Instruct', dataUrl);
    if (!result) {
      console.log('测试 Qwen3-VL-8B-Instruct...');
      result = await testModel('Qwen/Qwen3-VL-8B-Instruct', dataUrl);
    }
    if (!result) {
      console.log('测试 Qwen3-VL-30B-A3B-Instruct...');
      result = await testModel('Qwen/Qwen3-VL-30B-A3B-Instruct', dataUrl);
    }
    
    if (result) {
      console.log('\n===== 找到可用模型 =====');
    } else {
      console.log('\n===== 所有模型都测试失败 =====');
    }
    
  } catch (error) {
    console.error('测试过程中发生错误:', error.message);
  }
}

async function testModel(modelName, dataUrl) {
  try {
    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '请识别这张图片中的文字内容，输出JSON格式：{"description": "图片描述", "shop_name": "店铺名称(如有)", "amounts": {金额字段}}',
              },
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl,
                },
              },
            ],
          },
        ],
        max_tokens: 500,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`  ❌ ${modelName} 失败 (${response.status}):`, errorText.substring(0, 200));
      return false;
    }
    
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    
    if (content) {
      console.log(`  ✅ ${modelName} 成功!`);
      console.log(`     响应: ${content.substring(0, 300)}...`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.log(`  ❌ ${modelName} 异常:`, error.message);
    return false;
  }
}

testQwenVL().catch(console.error);
