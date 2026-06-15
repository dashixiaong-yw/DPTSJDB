/**
 * 测试OCR识别流程 - 模拟抖音店铺月度数据截图识别
 */

const fs = require('fs');
const JSZip = require('jszip');

const apiKey = 'sk-fcduifoesykghqpnxuhftqomikojlqhavrprkuwbwafgoseh';
const BILL_FILE = '2026年分销账单（抖店）+收集表 (1).xlsx';

async function testOCRFlow() {
  console.log('===== 测试OCR识别流程 =====\n');
  
  try {
    // 1. 提取L列的第一张图片（店铺月度数据截图）
    console.log('1. 提取L列图片...');
    const fileBuffer = fs.readFileSync(BILL_FILE);
    const zip = await JSZip.loadAsync(fileBuffer);
    
    let lColImages = [];
    for (const fileName of Object.keys(zip.files)) {
      if (fileName.startsWith('xl/media/') && !zip.files[fileName].dir) {
        const match = fileName.match(/image(\d+)\.(png|jpg|jpeg|gif|bmp)$/i);
        if (match) {
          const imageNumber = parseInt(match[1], 10);
          const imageData = await zip.files[fileName].async('nodebuffer');
          lColImages.push({ imageNumber, data: imageData });
        }
      }
    }
    
    if (lColImages.length === 0) {
      console.log('❌ 未找到图片');
      return;
    }
    
    // 获取第一张图片（L2）
    const firstImage = lColImages[0];
    console.log(`✅ 找到图片 image${firstImage.imageNumber} (${firstImage.data.length} bytes)`);
    
    // 2. 测试OCR识别
    console.log('\n2. 测试OCR识别（店铺月度数据截图）...');
    const base64Image = firstImage.data.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;
    
    const prompt = `你是一个专业的OCR数据提取专家。这是一张抖音电商平台的"店铺月度数据截图"。

## 核心任务：识别以下信息

### 1. 店铺名称
- 观察页面顶部或左侧，识别店铺名称
- 店铺名称通常显示在页面标题或账户信息区域

### 2. 成交金额（核心识别字段）
- 查找"成交金额"或"成交额"字段
- 识别其对应的数值
- 金额转换为纯数字格式（去掉逗号、¥符号等）
- **如果没有此字段或数值为空，设为0**
- 示例：显示"成交金额 ¥51,086.50"，输出 51086.50

### 3. 退款金额（核心识别字段）
- 查找"退款金额"或"退款"字段
- 识别其对应的数值
- 金额转换为纯数字格式
- **如果没有此字段或数值为空，设为0**
- 示例：显示"退款金额 ¥9,741.97"，输出 9741.97

### 4. 投放消耗（核心识别字段）
- 查找"投放消耗"或"投放"或"消耗"字段
- 识别其对应的数值
- 金额转换为纯数字格式
- **如果没有此字段或数值为空，设为0**
- 示例：显示"投放消耗 ¥1,688.22"，输出 1688.22

### 5. 月份
- 识别截图对应的具体月份
- 格式：X月 或 XX月（如：1月、2月、12月）

## 输出格式：
只输出JSON，不要有任何其他说明文字：
{
  "shop_name": "店铺名称",
  "month": "月份（如：4月）",
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
              {
                type: 'text',
                text: prompt,
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
      console.log(`❌ OCR调用失败 (${response.status}):`, errorText);
      return;
    }
    
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    
    console.log('✅ OCR响应内容:');
    console.log(content);
    
    // 3. 解析OCR结果
    console.log('\n3. 解析OCR结果...');
    try {
      // 尝试提取JSON
      const jsonMatch = content?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const ocrResult = JSON.parse(jsonMatch[0]);
        console.log('✅ JSON解析成功:');
        console.log('   店铺名称:', ocrResult.shop_name || '未识别');
        console.log('   月份:', ocrResult.month || '未识别');
        console.log('   金额:', JSON.stringify(ocrResult.amounts || {}));
      } else {
        console.log('❌ 未找到JSON格式结果');
      }
    } catch (error) {
      console.log('❌ JSON解析失败:', error.message);
    }
    
    console.log('\n===== 测试完成 =====');
    
  } catch (error) {
    console.error('测试过程中发生错误:', error.message);
    console.error(error.stack);
  }
}

testOCRFlow().catch(console.error);
