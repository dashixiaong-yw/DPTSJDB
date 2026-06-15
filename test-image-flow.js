/**
 * 测试图片上传和data URL生成流程
 */

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const UPLOAD_DIR = path.join(__dirname, 'data', 'uploads');

async function testImageUploadFlow() {
  console.log('===== 测试图片上传流程 =====\n');
  
  try {
    // 1. 提取图片
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
    
    console.log(`1. 提取图片成功 (${firstImageBuffer.length} bytes)`);
    
    // 2. 模拟上传到本地存储
    const imageFileName = 'test_douyin_image.png';
    const fullPath = path.join(UPLOAD_DIR, imageFileName);
    
    // 确保目录存在
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    
    // 写入文件
    await fs.promises.writeFile(fullPath, firstImageBuffer);
    console.log(`2. 图片上传成功: ${fullPath}`);
    
    // 3. 模拟生成data URL
    const ext = path.extname(imageFileName).toLowerCase();
    const mimeMap = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
    };
    const mime = mimeMap[ext] || 'image/png';
    
    // 读取文件并生成data URL
    const buffer = await fs.promises.readFile(fullPath);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;
    
    console.log(`3. data URL生成成功`);
    console.log(`   MIME类型: ${mime}`);
    console.log(`   Base64长度: ${base64.length}`);
    console.log(`   data URL长度: ${dataUrl.length}`);
    
    // 4. 测试OCR识别
    console.log('\n4. 测试OCR识别...');
    
    const prompt = `你是一个专业的OCR数据提取专家。这是一张抖音电商平台的"店铺月度数据截图"。
请识别店铺名称和金额数据，输出JSON格式：{"shop_name": "...", "amounts": {"成交金额": 数值}}`;
    
    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer sk-fcduifoesykghqpnxuhftqomikojlqhavrprkuwbwafgoseh',
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
      const errorText = await response.text();
      console.log(`❌ OCR调用失败 (${response.status}):`, errorText);
      return;
    }
    
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    
    console.log('✅ OCR响应:');
    console.log(content);
    
    // 5. 清理测试文件
    await fs.promises.unlink(fullPath);
    console.log('\n5. 清理测试文件完成');
    
  } catch (error) {
    console.error('测试失败:', error.message);
    console.error(error.stack);
  }
}

testImageUploadFlow().catch(console.error);
