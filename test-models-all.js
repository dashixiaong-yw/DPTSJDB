/**
 * 多模型OCR测试 - 使用正确的截图
 * 同时测试两种提示词：带示例 vs 不带示例
 */

const fs = require('fs');

const apiKey = process.env.SILICONFLOW_API_KEY || 'sk-fcduifoesykghqpnxuhftqomikojlqhavrprkuwbwafgoseh';

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

// 提示词1: 项目现有的提示词（带示例）
const promptWithExamples = `你是一个专业的OCR数据提取专家。这是一张抖音电商平台的"店铺月度数据截图"。

## 核心任务：从截图中精确提取数值

这是一张抖音电商后台的经营概况或数据概览截图。页面中通常包含多个数据卡片，每个卡片显示一个指标名称和对应的数值。

### 识别步骤（必须严格按此步骤执行）

**第一步：找到数据区域**
- 页面中间或下方有数据卡片/指标区域
- 每个卡片包含：指标名称 + 数值 + 可能的同比/环比百分比

**第二步：逐个识别指标数值**
- 只识别数值部分，忽略百分比和趋势箭头
- 数值通常显示为 ¥51,086.50 或 51086.50 格式

**第三步：提取以下3个指标**

1. **成交金额**（最重要）
   - 查找包含"成交金额"或"成交额"的卡片
   - 提取其数值（去掉¥和逗号）
   - 示例：卡片显示"成交金额 ¥115,183.30 ↑61.64%"，提取 115183.30

2. **退款金额**
   - 查找包含"退款金额"或"退款"的卡片
   - 提取其数值
   - 示例：卡片显示"退款金额 ¥20,584.44 ↑73.34%"，提取 20584.44

3. **投放消耗**
   - 查找包含"投放消耗"或"投放"或"消耗"的卡片
   - 提取其数值
   - 如果没有此卡片，设为0

### 店铺名称
- 页面顶部左侧，带有店铺图标的位置
- 准确识别图片中显示的店铺全称
- 如果有"旗舰店"、"专营店"、"礼品店"等后缀，务必完整保留
- 例如：显示"梵仔礼品定制"，则shop_name = "梵仔礼品定制"

### 日期范围与月份判定（非常重要）
- **查找位置**：页面下方"数据趋势"区域的折线图/柱状图X轴
- X轴显示日期标签，如"05/01"、"05/06"、"05/11"..."05/31"
- 根据X轴日期判断：
  - 如果X轴显示的是同一月份（如都是5月），则month为"5月"
  - 如果X轴从当月1日开始到当月最后一天结束（如05/01到05/31），则is_full_month为true
  - 否则is_full_month为false
- 同时识别页面顶部或时间选择器中的月份信息

## 输出格式
只输出JSON，不要有任何其他文字：
{
  "shop_name": "店铺名称",
  "month": "月份",
  "date_range": {
    "start_date": "开始日期（YYYY-MM-DD格式）",
    "end_date": "结束日期（YYYY-MM-DD格式）",
    "is_full_month": true或false,
    "actual_month": "根据日期范围计算的实际月份（如：5月）"
  },
  "amounts": {
    "成交金额": 数值,
    "退款金额": 数值,
    "投放消耗": 数值
  }
}

## 关键规则
- 金额必须转换为纯数字（去掉¥、逗号等）
- 如果某个指标在截图中确实找不到，该项设为0
- 如果某个指标有数值，必须如实提取，不能设为0
- 只输出JSON，不要输出任何解释文字`;

// 提示词2: 移除示例（修复示例值污染问题）
const promptWithoutExamples = `你是一个专业的OCR数据提取专家。这是一张抖音电商平台的"店铺月度数据截图"。

## 核心任务：从截图中精确提取数值

这是一张抖音电商后台的经营概况或数据概览截图。页面中通常包含多个数据卡片，每个卡片显示一个指标名称和对应的数值。

### 识别步骤（必须严格按此步骤执行）

**第一步：找到数据区域**
- 页面中间或下方有数据卡片/指标区域
- 每个卡片包含：指标名称 + 数值 + 可能的同比/环比百分比

**第二步：逐个识别指标数值**
- 只识别数值部分，忽略百分比和趋势箭头
- 数值通常显示为 ¥51,086.50 或 51086.50 格式
- 金额必须转换为纯数字格式（去掉逗号、¥符号等）
- 保留小数点后两位

**第三步：提取以下3个指标**

1. **成交金额**（最重要）
   - 查找包含"成交金额"或"成交额"的卡片
   - 提取其数值

2. **退款金额**
   - 查找包含"退款金额"或"退款"的卡片
   - 提取其数值

3. **投放消耗**
   - 查找包含"投放消耗"或"投放"的卡片
   - 提取其数值
   - 如果没有此卡片，设为0

### 店铺名称
- 页面顶部左侧，带有店铺图标的位置
- 准确识别图片中显示的店铺全称

### 日期范围与月份判定
- 识别截图对应的月份
- X轴显示日期标签，根据日期范围判断月份

## 输出格式
只输出JSON，不要有任何其他文字：
{
  "shop_name": "店铺名称",
  "month": "月份",
  "amounts": {
    "成交金额": 数值,
    "退款金额": 数值,
    "投放消耗": 数值
  }
}

## 关键规则
- 金额必须转换为纯数字（去掉¥、逗号等）
- 不要使用提示词中任何示例值，必须严格从图片中提取
- 如果某个指标在截图中确实找不到，该项设为0
- 只输出JSON，不要输出任何解释文字`;

async function testModel(imagePath, model, prompt, promptName) {
  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString('base64');
  const dataUrl = `data:image/png;base64,${base64Image}`;

  try {
    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
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
      return { success: false, error: `${response.status} ${response.statusText}` };
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    try {
      const jsonMatch = content?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const ocrResult = JSON.parse(jsonMatch[0]);
        const scores = {};
        let totalCorrect = 0;
        let totalFields = 0;

        for (const [key, expected] of Object.entries(expectedValues)) {
          const actual = ocrResult.amounts?.[key];
          totalFields++;
          if (actual !== undefined && Math.abs(actual - expected) < 0.01) {
            scores[key] = `✅ ${actual}`;
            totalCorrect++;
          } else {
            scores[key] = `❌ ${actual} (期望: ${expected})`;
          }
        }

        return {
          success: true,
          shop_name: ocrResult.shop_name || '未识别',
          month: ocrResult.month || '未识别',
          amounts: ocrResult.amounts || {},
          scores,
          accuracy: (totalCorrect / totalFields * 100).toFixed(0) + '%',
        };
      } else {
        return { success: false, error: '无法解析JSON', rawContent: content?.substring(0, 200) };
      }
    } catch (e) {
      return { success: false, error: '解析失败: ' + e.message, rawContent: content?.substring(0, 200) };
    }
  } catch (e) {
    return { success: false, error: '请求失败: ' + e.message };
  }
}

async function main() {
  console.log('===== 多模型OCR测试 =====\n');
  console.log('期望结果:', JSON.stringify(expectedValues));
  console.log('店铺名期望: 端端礼品伴手礼');
  console.log('测试模型:', modelsToTest.length, '个\n');

  // 使用指定的测试图片
  const imagePath = 'WPS图片(1).png';
  if (!fs.existsSync(imagePath)) {
    console.error(`❌ 测试图片不存在: ${imagePath}`);
    process.exit(1);
  }
  console.log(`测试图片: ${imagePath}`);
  console.log(`图片大小: ${(fs.statSync(imagePath).size / 1024).toFixed(1)} KB\n`);
  console.log('期望结果：店铺名「端端礼品伴手礼」，成交金额 32183.7，退款金额 7003.6，投放消耗 0\n');

  const allResults = [];

  // 分别测试两种提示词
  const prompts = [
    { name: '提示词1（带示例-项目现有）', prompt: promptWithExamples },
    { name: '提示词2（移除示例）', prompt: promptWithoutExamples },
  ];

  for (const promptData of prompts) {
    console.log('\n========================================');
    console.log(`测试: ${promptData.name}\n`);

    const results = [];

    for (const model of modelsToTest) {
      console.log(`--- ${model} ---`);

      const result = await testModel(imagePath, model, promptData.prompt, promptData.name);

      if (result.success) {
        console.log(`  店铺: ${result.shop_name}`);
        console.log(`  月份: ${result.month}`);
        console.log(`  金额识别结果:`);
        for (const [key, score] of Object.entries(result.scores)) {
          console.log(`    ${key}: ${score}`);
        }
        console.log(`  准确率: ${result.accuracy}\n`);

        results.push({
          model: model,
          accuracy: parseInt(result.accuracy),
          scores: result.scores,
          shop_name: result.shop_name,
        });
      } else {
        console.log(`  ❌ ${result.error}`);
        if (result.rawContent) console.log(`  原始响应: ${result.rawContent}\n`);
        else console.log('');
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    allResults.push({ promptName: promptData.name, results });

    console.log(`\n--- ${promptData.name} 汇总 ---`);
    const sortedResults = results.sort((a, b) => b.accuracy - a.accuracy);
    sortedResults.forEach((r, i) => {
      console.log(`${i + 1}. ${r.model} - 准确率: ${r.accuracy}%`);
    });
  }

  console.log('\n\n========== 最终结论 ==========');
  console.log('\n对比两种提示词的效果：\n');

  for (const data of allResults) {
    const best = data.results.sort((a, b) => b.accuracy - a.accuracy)[0];
    console.log(`${data.promptName}:`);
    console.log(`  最佳模型: ${best?.model || '无'} (${best?.accuracy || 0}%)`);
    console.log();
  }

  // 找出全局最佳模型+提示词组合
  const flat = [];
  for (const data of allResults) {
    for (const r of data.results) {
      flat.push({ ...r, promptName: data.promptName });
    }
  }
  const overallBest = flat.sort((a, b) => b.accuracy - a.accuracy)[0];
  if (overallBest) {
    console.log(`\n推荐: ${overallBest.promptName} + ${overallBest.model} (准确率: ${overallBest.accuracy}%)`);
  }
}

main().catch(console.error);
