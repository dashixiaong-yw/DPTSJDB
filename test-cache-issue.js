/**
 * 检查OCR缓存机制
 */

const fs = require('fs');
const JSZip = require('jszip');
const crypto = require('crypto');

const apiKey = 'sk-fcduifoesykghqpnxuhftqomikojlqhavrprkuwbwafgoseh';

async function testCacheIssue() {
  console.log('===== 检查OCR缓存问题 =====\n');
  
  try {
    // 1. 提取图片并计算MD5
    const billPath = '2026年分销账单（抖店）+收集表 (1).xlsx';
    const fileBuffer = fs.readFileSync(billPath);
    const zip = await JSZip.loadAsync(fileBuffer);
    
    let firstImageBuffer = null;
    let imageNumber = 0;
    for (const fileName of Object.keys(zip.files)) {
      if (fileName.startsWith('xl/media/') && !zip.files[fileName].dir) {
        const match = fileName.match(/image(\d+)/);
        if (match) imageNumber = parseInt(match[1]);
        firstImageBuffer = await zip.files[fileName].async('nodebuffer');
        break;
      }
    }
    
    if (!firstImageBuffer) {
      console.log('❌ 未找到图片');
      return;
    }
    
    const md5 = crypto.createHash('md5').update(firstImageBuffer).digest('hex');
    console.log(`图片信息:`);
    console.log(`  - 图片编号: image${imageNumber}`);
    console.log(`  - 大小: ${firstImageBuffer.length} bytes`);
    console.log(`  - MD5: ${md5}`);
    
    // 2. 构建缓存键
    const cacheKey = `${md5}:抖音:店铺月度数据截图`;
    console.log(`\n缓存键: ${cacheKey}`);
    
    // 3. 直接调用API测试（不使用缓存）
    console.log('\n3. 测试直接调用OCR API...');
    
    const base64Image = firstImageBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;
    
    const prompt = `你是一个专业的OCR数据提取专家。这是一张抖音电商平台的"店铺月度数据截图"。

## 核心任务：识别以下信息

### 1. 店铺名称
- 观察页面顶部或左侧，识别店铺名称

### 2. 成交金额
- 查找"成交金额"或"成交额"字段
- 金额转换为纯数字格式

### 3. 退款金额
- 查找"退款金额"或"退款"字段
- 金额转换为纯数字格式

### 4. 投放消耗
- 查找"投放消耗"或"投放"或"消耗"字段
- 金额转换为纯数字格式

### 5. 月份
- 识别截图对应的具体月份

## 输出格式：
只输出JSON：
{
  "shop_name": "店铺名称",
  "month": "月份",
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
        max_tokens: 500,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ OCR调用失败 (${response.status}):`, errorText);
      return;
    }
    
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    
    console.log('✅ OCR响应内容:');
    console.log(content);
    
    // 4. 解析结果
    try {
      const jsonMatch = content?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const ocrResult = JSON.parse(jsonMatch[0]);
        console.log('\n解析结果:');
        console.log('  店铺名称:', ocrResult.shop_name);
        console.log('  月份:', ocrResult.month);
        console.log('  金额:', JSON.stringify(ocrResult.amounts));
        
        // 检查金额是否为0
        if (ocrResult.amounts) {
          const allZero = Object.values(ocrResult.amounts).every(v => v === 0);
          if (allZero) {
            console.log('\n❌ 发现问题：所有金额都为0！');
            console.log('可能原因：');
            console.log('1. 提示词可能不够精确');
            console.log('2. 图片内容可能无法识别');
            console.log('3. API可能有问题');
          } else {
            console.log('\n✅ 金额识别正常');
          }
        }
      }
    } catch (error) {
      console.log('JSON解析失败:', error.message);
    }
    
  } catch (error) {
    console.error('测试失败:', error.message);
  }
}

testCacheIssue().catch(console.error);
