/**
 * 测试SiliconFlow API密钥
 */

const fs = require('fs');
const path = require('path');

const apiKey = 'sk-fcduifoesykghqpnxuhftqomikojlqhavrprkuwbwafgoseh';

async function testApiKey() {
  console.log('===== 测试SiliconFlow API密钥 =====\n');
  
  try {
    // 1. 测试API密钥有效性（通过查询模型列表）
    console.log('1. 测试API密钥有效性...');
    const modelsResponse = await fetch('https://api.siliconflow.cn/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    
    if (!modelsResponse.ok) {
      const errorText = await modelsResponse.text();
      console.log(`❌ API密钥无效 (${modelsResponse.status}):`, errorText);
      return;
    }
    
    const models = await modelsResponse.json();
    console.log(`✅ API密钥有效，找到 ${models.data?.length || 0} 个可用模型`);
    
    // 检查Kimi模型是否可用
    const hasKimi = models.data?.some(m => m.id?.includes('kimi') || m.id?.includes('moonshot'));
    if (hasKimi) {
      console.log('✅ Kimi模型可用');
    } else {
      console.log('⚠️  未找到Kimi模型，可用的视觉模型:');
      models.data?.filter(m => m.id?.includes('vision') || m.id?.includes('vl'))
        .forEach(m => console.log(`  - ${m.id}`));
    }
    
    // 2. 提取第一张图片测试OCR
    console.log('\n2. 提取测试图片...');
    const ExcelJS = require('exceljs');
    const JSZip = require('jszip');
    
    const billPath = '2026年分销账单（抖店）+收集表 (1).xlsx';
    const fileBuffer = fs.readFileSync(billPath);
    const zip = await JSZip.loadAsync(fileBuffer);
    
    // 找到第一张图片
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
    
    // 3. 测试OCR识别
    console.log('\n3. 测试OCR识别...');
    const base64Image = firstImageBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;
    
    const ocrResponse = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'moonshot-v1-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '请识别这张图片中的文字内容，简短描述你看到了什么。',
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
        max_tokens: 200,
      }),
    });
    
    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      console.log(`❌ OCR调用失败 (${ocrResponse.status}):`, errorText);
      return;
    }
    
    const ocrResult = await ocrResponse.json();
    const content = ocrResult.choices?.[0]?.message?.content;
    
    if (content) {
      console.log('✅ OCR识别成功:');
      console.log(`   识别结果: ${content.substring(0, 200)}...`);
    } else {
      console.log('❌ OCR返回内容为空');
      console.log('   完整响应:', JSON.stringify(ocrResult, null, 2));
    }
    
    console.log('\n===== 测试完成 =====');
    console.log('✅ API密钥有效，OCR服务可用，可以进行账单处理');
    
  } catch (error) {
    console.error('测试过程中发生错误:', error.message);
  }
}

testApiKey().catch(console.error);
