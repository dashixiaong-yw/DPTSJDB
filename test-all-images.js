/**
 * 测试所有图片的OCR识别结果
 */

const fs = require('fs');
const JSZip = require('jszip');
const crypto = require('crypto');

const apiKey = 'sk-fcduifoesykghqpnxuhftqomikojlqhavrprkuwbwafgoseh';

async function testAllImages() {
  console.log('===== 测试所有图片的OCR识别 =====\n');
  
  try {
    const billPath = '2026年分销账单（抖店）+收集表 (1).xlsx';
    const fileBuffer = fs.readFileSync(billPath);
    const zip = await JSZip.loadAsync(fileBuffer);
    
    // 收集所有图片
    const images = [];
    for (const fileName of Object.keys(zip.files)) {
      if (fileName.startsWith('xl/media/') && !zip.files[fileName].dir) {
        const match = fileName.match(/image(\d+)/);
        const imageNumber = match ? parseInt(match[1]) : 0;
        const imageData = await zip.files[fileName].async('nodebuffer');
        images.push({ imageNumber, data: imageData });
      }
    }
    
    console.log(`找到 ${images.length} 张图片\n`);
    
    // 逐个测试
    for (const img of images) {
      const md5 = crypto.createHash('md5').update(img.data).digest('hex');
      
      console.log(`--- 测试图片 image${img.imageNumber} ---`);
      console.log(`大小: ${img.data.length} bytes`);
      console.log(`MD5: ${md5}`);
      
      const base64Image = img.data.toString('base64');
      const dataUrl = `data:image/png;base64,${base64Image}`;
      
      const prompt = `你是一个专业的OCR数据提取专家。这是一张抖音电商平台的"店铺月度数据截图"。

请识别店铺名称和金额，输出JSON：
{
  "shop_name": "店铺名称",
  "amounts": {
    "成交金额": 数值,
    "退款金额": 数值,
    "投放消耗": 数值
  }
}`;
      
      const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'Qwen/Qwen3-VL-32B-Instruct',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
          max_tokens: 200,
        }),
      });
      
      if (!response.ok) {
        console.log(`❌ OCR调用失败 (${response.status})`);
        continue;
      }
      
      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;
      
      try {
        const jsonMatch = content?.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const ocrResult = JSON.parse(jsonMatch[0]);
          console.log(`店铺名称: ${ocrResult.shop_name || '未识别'}`);
          console.log(`金额: ${JSON.stringify(ocrResult.amounts || {})}`);
          
          // 检查是否全为0
          if (ocrResult.amounts) {
            const allZero = Object.values(ocrResult.amounts).every(v => v === 0);
            if (allZero) {
              console.log('⚠️  所有金额都为0！');
            }
          }
        } else {
          console.log(`响应: ${content?.substring(0, 100)}...`);
        }
      } catch (error) {
        console.log(`解析失败: ${error.message}`);
        console.log(`原始响应: ${content?.substring(0, 100)}...`);
      }
      
      console.log('');
      
      // 延迟一下，避免请求过快
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
  } catch (error) {
    console.error('测试失败:', error.message);
  }
}

testAllImages().catch(console.error);
