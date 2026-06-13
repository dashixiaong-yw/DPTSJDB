import { LLMClient, Config } from 'coze-coding-dev-sdk';
import { generateDataUrl } from './local-storage';
import { ocrCacheStore } from './memory-store';
import { createHash } from 'crypto';

export interface OCRResult {
  shop_name?: string;
  month?: string; // 月份（如：1月、2月）
  amounts?: Record<string, number>;
  dates?: string[]; // 日期范围 [开始日期, 结束日期]
  date_range?: {
    start_date?: string; // 开始日期 YYYY-MM-DD
    end_date?: string; // 结束日期 YYYY-MM-DD
    is_full_month?: boolean; // 是否为完整月份
    actual_month?: string; // 实际月份（根据日期范围计算）
  };
  raw_text?: string;
  error?: string;
}

/**
 * OCR服务类 - 使用大语言模型识别图片中的数据
 */
export class OCRService {
  private client: LLMClient;

  constructor() {
    const config = new Config();
    this.client = new LLMClient(config);
  }
  
  /**
   * 通用的店铺名称识别提示词片段
   * 用于淘宝平台各图片类型
   */
  private getShopNamePromptSection(): string {
    return `## 核心任务：识别店铺名称

观察浏览器窗口最顶部的标签栏，识别【激活标签】中的店铺名称。

### 判断方法：比较差异

标签栏中有多个标签，其中有一个标签与其他标签明显不同。请按以下步骤识别：

**第一步：观察所有标签的整体外观**
浏览所有标签，注意它们之间的视觉差异。

**第二步：找出"与其他标签不同"的那个标签**
激活标签的特征：
- 背景颜色比其他标签更浅（更白）
- 文字颜色比其他标签更深（更黑）
- 与下方页面内容区域颜色相近，形成"连接"效果

**第三步：读取该标签中的店铺名称**

### 重要提示
- 不要单独判断某个标签的颜色，而是比较标签之间的差异
- 激活标签是"与其他标签不同"的那个
- 关注背景色的明暗差异，背景最亮的通常是激活标签
`;
  }

  /**
   * 识别图片中的数据
   * @param imageKey 图片在对象存储中的key
   * @param platform 平台（抖音/拼多多/淘宝）
   * @param imageType 图片类型（拼多多平台区分：月度数据报表、多多账单）
   * @param imageMd5 图片内容的MD5（用于缓存，优先使用）
   */
  async recognizeImage(imageKey: string, platform: string, imageType?: string, imageMd5?: string): Promise<OCRResult> {
    console.log(`开始OCR识别: ${imageKey}, 平台: ${platform}, 图片类型: ${imageType || '默认'}, MD5: ${imageMd5 || '无'}`);
    try {
      // 检查缓存（优先使用图片内容MD5）
      const cacheKey = imageMd5 || imageKey;
      const cached = await this.checkCache(cacheKey);
      
      // 如果缓存存在且结果完整（有 amounts 字段），使用缓存
      // 否则强制重新识别（避免缓存到不完整的结果）
      // 任意一个关键字段缺失都要触发重新识别
      const isCacheComplete = cached && 
        cached.shop_name && 
        cached.month && 
        cached.amounts && 
        Object.keys(cached.amounts).length > 0;
      
      if (isCacheComplete) {
        console.log(`使用缓存的OCR结果: ${cacheKey}`);
        return cached;
      }
      
      if (cached) {
        console.log(`缓存结果不完整（缺少关键字段），强制重新识别: ${cacheKey}`);
        console.log(`  - shop_name: ${cached.shop_name || '缺失'}`);
        console.log(`  - month: ${cached.month || '缺失'}`);
        console.log(`  - amounts: ${cached.amounts ? Object.keys(cached.amounts).join(', ') : '缺失'}`);
      }

      // 生成图片访问URL
      let imageUrl: string;
      if (imageKey.startsWith('data:')) {
        // 直接使用data URL
        imageUrl = imageKey;
        console.log(`使用data URL直接传递图片`);
      } else {
        // 从本地文件系统读取图片
        console.log(`生成图片访问URL: ${imageKey}`);
        imageUrl = await generateDataUrl(imageKey);
        console.log(`图片data URL已生成`);
      }

      // 构建识别提示词
      const prompt = this.buildPrompt(platform, imageType);

      // 调用 Kimi K2.5 模型进行OCR识别
      const messages = [
        {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: prompt },
            {
              type: 'image_url' as const,
              image_url: {
                url: imageUrl,
                detail: 'high' as const,
              },
            },
          ],
        },
      ];

      console.log(`调用LLM API进行OCR识别...`);
      const response = await this.client.invoke(messages, {
        model: 'kimi-k2-5-260127', // 使用 Kimi K2.5 最智能模型
        temperature: 0.6, // Kimi K2.5 固定温度（非thinking模式）
      });
      console.log(`LLM API响应长度: ${response.content?.length || 0} 字符`);
      console.log(`LLM API响应前500字符: ${response.content?.substring(0, 500)}`);

      // 解析结果
      const result = this.parseOCRResult(response.content);
      
      // 打印解析结果的关键字段
      console.log(`OCR解析结果:`);
      console.log(`  - 店铺名称: ${result.shop_name || '未识别'}`);
      console.log(`  - 月份: ${result.month || '未识别'}`);
      console.log(`  - 日期范围: ${JSON.stringify(result.date_range)}`);
      console.log(`  - 金额字段: ${result.amounts ? Object.keys(result.amounts).join(', ') : '无'}`);
      
      // 缓存结果（使用相同的缓存键）
      await this.cacheResult(cacheKey, result);
      console.log(`OCR识别完成并已缓存: ${cacheKey}`);

      return result;

    } catch (error) {
      console.error('OCR识别失败:', error);
      return {
        error: error instanceof Error ? error.message : 'OCR识别失败',
      };
    }
  }

  /**
   * 构建识别提示词 - 针对 Kimi K2.5 优化，支持不同图片类型
   */
  private buildPrompt(platform: string, imageType?: string): string {
    // 抖音平台特殊处理 - 支持两种图片类型
    if (platform === '抖音') {
      if (imageType === '店铺月度数据截图') {
        return this.buildDouyinShopMonthlyPrompt();
      } else if (imageType === '支出总额截图') {
        return this.buildDouyinExpensePrompt();
      }
      // 兼容旧类型
      return this.buildDouyinBillPrompt();
    }
    
    // 拼多多平台特殊处理
    if (platform === '拼多多') {
      if (imageType === '月度数据报表') {
        return this.buildPDDMonthlyReportPrompt();
      } else if (imageType === '多多账单') {
        return this.buildPDDBillPrompt();
      }
    }
    
    // 淘宝平台特殊处理
    if (platform === '淘宝') {
      if (imageType === '店铺数据截图') {
        return this.buildTaobaoShopDataPrompt();
      } else if (imageType === '万相台无界版截图') {
        return this.buildTaobaoWanxiangtaiPrompt();
      } else if (imageType === '小额打款后台数据') {
        return this.buildTaobaoSmallPaymentPrompt();
      } else if (imageType === '淘宝平台技术截图') {
        return this.buildTaobaoTechServicePrompt();
      } else if (imageType === '偏远集运仓截图') {
        return this.buildTaobaoMerchantShippingPrompt();
      } else if (imageType === '跨境服务截图') {
        return this.buildTaobaoCrossBorderPrompt();
      } else if (imageType === '淘金币服务截图') {
        return this.buildTaobaoGoldCoinPrompt();
      } else if (imageType === '红包签到佣金截图') {
        return this.buildTaobaoRedPacketPrompt();
      } else if (imageType === '公益宝贝佣金截图') {
        return this.buildTaobaoCharityPrompt();
      } else if (imageType) {
        // 其他淘宝图片类型使用通用提示词
        return this.buildTaobaoGenericPrompt(imageType);
      }
    }
    
    // 默认通用提示词
    const platformContext = {
      '抖音': '抖音电商平台的分销账单截图',
      '拼多多': '拼多多平台的分销账单截图',
      '淘宝': '淘宝平台的分销账单截图',
    };

    return `你是一个专业的OCR数据提取专家。这是一张${platformContext[platform as keyof typeof platformContext] || '电商平台'}的数据截图。

请仔细分析图片，提取所有关键信息，并严格按照以下JSON格式输出：

{
  "shop_name": "店铺名称（完整准确）",
  "month": "月份（如：1月、2月、12月等）",
  "date_range": {
    "start_date": "开始日期（YYYY-MM-DD格式）",
    "end_date": "结束日期（YYYY-MM-DD格式）",
    "is_full_month": true或false,
    "actual_month": "根据日期范围计算的实际月份（如：1月）"
  },
  "amounts": {
    "字段名1": 数值1,
    "字段名2": 数值2
  },
  "dates": ["开始日期", "结束日期"],
  "raw_text": "图片中的完整文字内容"
}

## 识别要求：

1. **店铺名称**（非常重要）：
   - **重点识别位置**：页面左上角区域，通常在"经营概况"模块上方，带有店铺图标
   - 准确识别图片中显示的店铺全称
   - 如果有"旗舰店"、"专营店"、"礼品店"等后缀，务必完整保留
   - 例如：如果显示"趣宝礼品店"，必须完整输出"趣宝礼品店"，不能只输出"趣宝"

2. **日期范围**（非常重要，用于月份验证）：
   - **查找位置**：通常在页面顶部或数据趋势图表附近，显示"时间"或"日期范围"
   - 识别截图的日期范围，格式必须是YYYY-MM-DD
   - **判断是否为完整月份**：
     * 完整月份示例：2026-01-01 至 2026-01-31（1月整月）
     * 不完整月份示例：2026-01-15 至 2026-01-31（只有半个月）
   - is_full_month字段：如果是整月数据设为true，否则设为false
   - actual_month字段：根据日期范围计算实际月份，如"1月"、"2月"

3. **月份**：
   - 识别截图对应的具体月份
   - 格式：X月 或 XX月（如：1月、2月、12月）
   - 如果日期范围显示"2026-01-01 至 2026-01-31"，月份为"1月"
   - 如果显示"2026年1月"，月份为"1月"

4. **金额字段**：
   - 识别所有金额相关的字段（如：成交金额、退款金额、支出金额、营业额、提现金额、佣金等）
   - 金额必须转换为纯数字格式（去掉逗号、货币符号等格式符号）
   - 保留小数点后两位精度

5. **原始文字**：
   - 完整记录图片中的所有可见文字

## 输出格式：
- 只输出JSON，不要有任何其他说明文字
- JSON必须格式正确，可以被解析
- 如果某项信息无法识别，对应字段设为null`;
  }

  /**
   * 抖音 - 账单截图识别提示词
   * 识别：店铺名称、成交额、支出金额、退款金额、月份
   */
  private buildDouyinBillPrompt(): string {
    return `你是一个专业的OCR数据提取专家。这是一张抖音电商平台的"经营概况"账单截图。

请仔细分析图片，提取所有关键信息，并严格按照以下JSON格式输出：

{
  "shop_name": "店铺名称（完整准确）",
  "month": "月份（如：1月、2月、12月等）",
  "date_range": {
    "start_date": "开始日期（YYYY-MM-DD格式）",
    "end_date": "结束日期（YYYY-MM-DD格式）",
    "is_full_month": true或false,
    "actual_month": "根据日期范围计算的实际月份（如：1月）"
  },
  "amounts": {
    "成交额": 数值,
    "支出金额": 数值,
    "退款金额": 数值
  },
  "dates": ["开始日期", "结束日期"],
  "raw_text": "图片中的完整文字内容"
}

## 识别要求（非常重要）

1. **店铺名称**：
   - **查找位置**：页面顶部左侧，带有店铺图标的位置
   - 准确识别图片中显示的店铺全称
   - 如果有"旗舰店"、"专营店"、"礼品店"等后缀，务必完整保留
   - 例如：显示"梵仔礼品定制"，则shop_name = "梵仔礼品定制"

2. **日期范围**（非常重要，用于月份验证）：
   - **查找位置**：页面顶部，通常显示时间范围或月份
   - 识别截图的日期范围，格式必须是YYYY-MM-DD
   - **判断是否为完整月份**：
     * 完整月份示例：2026-01-01 至 2026-01-31（1月整月）
     * 不完整月份示例：2026-01-15 至 2026-01-31（只有半个月）
   - is_full_month字段：如果是整月数据设为true，否则设为false
   - actual_month字段：根据日期范围计算实际月份，如"1月"

3. **成交额（核心识别字段）**：
   - **查找位置**：在"经营概况"数据卡片中，查找"成交额"或"成交金额"字段
   - 页面通常显示格式：¥51,086.50，较上期↑61.64%
   - **只需要识别"成交额"字段的数值，不要识别百分比**
   - 金额必须转换为纯数字格式（去掉逗号、¥符号等）
   - 保留小数点后两位
   - **示例**：如果页面显示"成交额 ¥51,086.50 较上期↑61.64%"，则输出 51086.50

4. **支出金额（核心识别字段）**：
   - **查找位置**：在"经营概况"数据卡片中，查找"支出金额"字段
   - 页面通常显示格式：¥1,688.22，较上期↑47.03%
   - **只需要识别"支出金额"字段的数值，不要识别百分比**
   - 金额必须转换为纯数字格式（去掉逗号、¥符号等）
   - 保留小数点后两位
   - **示例**：如果页面显示"支出金额 ¥1,688.22 较上期↑47.03%"，则输出 1688.22

5. **退款金额（核心识别字段）**：
   - **查找位置**：在"经营概况"数据卡片中，查找"退款金额"字段
   - 页面通常显示格式：¥9,741.97，较上期↑73.34%
   - **只需要识别"退款金额"字段的数值，不要识别百分比**
   - 金额必须转换为纯数字格式（去掉逗号、¥符号等）
   - 保留小数点后两位
   - **示例**：如果页面显示"退款金额 ¥9,741.97 较上期↑73.34%"，则输出 9741.97

6. **月份**：
   - 识别截图对应的具体月份
   - 格式：X月 或 XX月（如：1月、2月、12月）

## 输出格式：
- 只输出JSON，不要有任何其他说明文字
- JSON必须格式正确，可以被解析
- 如果某项信息无法识别，对应字段设为null`;
  }

  /**
   * 抖音 - 店铺月度数据截图识别提示词
   * 识别：店铺名称、成交金额、退款金额、投放消耗、月份
   */
  private buildDouyinShopMonthlyPrompt(): string {
    return `你是一个专业的OCR数据提取专家。这是一张抖音电商平台的"店铺月度数据截图"。

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
}

## 重要说明：
- 所有数值字段如果无法识别或为空，必须设为0，不能设为null
- 金额必须转换为纯数字（去掉逗号、¥符号等）
- 只输出JSON，不要有任何其他文字`;
  }

  /**
   * 抖音 - 支出总额截图识别提示词
   * 识别：支出金额（总支出）
   */
  private buildDouyinExpensePrompt(): string {
    return `你是一个专业的OCR数据提取专家。这是一张抖音电商平台的"支出总额截图"。

## 核心任务：识别支出总额

### 识别要点：
1. 这是一张支出汇总或账单截图
2. 找到"支出总额"、"总支出"、"支出金额"或"支出"字段
3. 识别该字段对应的数值
4. 金额转换为纯数字格式（去掉逗号、¥符号等）
5. **如果没有找到支出总额，设为0**

### 可能的显示格式：
- "支出总额：¥87,819.34"
- "总支出 87819.34元"
- "支出金额 -87819.34"

### 输出格式：
只输出JSON，不要有任何其他说明文字：
{
  "shop_name": "如果能看到店铺名称则识别，否则为空字符串",
  "month": "如果能看到月份则识别，否则为空字符串",
  "amounts": {
    "支出金额": 数值
  }
}

## 重要说明：
- 支出金额如果无法识别，必须设为0
- 金额必须转换为纯数字（去掉逗号、¥符号、负号等）
- 只输出JSON，不要有任何其他文字`;
  }

  /**
   * 拼多多 - 月度数据报表截图识别提示词
   */
  private buildPDDMonthlyReportPrompt(): string {
    return `你是一个专业的OCR数据提取专家。这是一张拼多多商家后台的"经营月报"或"月度数据报表"截图。

## 核心任务：识别店铺名称

观察浏览器窗口最顶部的标签栏，识别【激活标签】中的店铺名称。

### 判断方法：比较差异

标签栏中有多个标签，其中有一个标签与其他标签明显不同。请按以下步骤识别：

**第一步：观察所有标签的整体外观**
浏览所有标签，注意它们之间的视觉差异。

**第二步：找出"与其他标签不同"的那个标签**
激活标签的特征：
- 背景颜色比其他标签更浅（更白）
- 文字颜色比其他标签更深（更黑）
- 与下方页面内容区域颜色相近，形成"连接"效果

**第三步：读取该标签中的店铺名称**

### 重要提示
- 不要单独判断某个标签的颜色，而是比较标签之间的差异
- 激活标签是"与其他标签不同"的那个
- 关注背景色的明暗差异，背景最亮的通常是激活标签

### 输出格式
- 店铺名称：[激活标签中的店铺名]

---

## 其他信息识别

请仔细分析图片，提取所有关键信息，并严格按照以下JSON格式输出：

{
  "shop_name": "店铺名称（完整准确）",
  "month": "月份（如：1月、2月、12月等）",
  "date_range": {
    "start_date": "开始日期（YYYY-MM-DD格式）",
    "end_date": "结束日期（YYYY-MM-DD格式）",
    "is_full_month": true或false,
    "actual_month": "根据日期范围计算的实际月份（如：1月）"
  },
  "amounts": {
    "营业额": 数值,
    "退款金额": 数值
  },
  "dates": ["开始日期", "结束日期"],
  "raw_text": "图片中的完整文字内容"
}

## 识别要求：

1. **日期范围**（非常重要，用于月份验证）：
   - **查找位置**：在"经营月报"标题旁边，通常显示"2026-01"或"时间：XXXX-XX-XX 至 XXXX-XX-XX"
   - 识别截图的日期范围，格式必须是YYYY-MM-DD
   - **判断是否为完整月份**：
     * 完整月份：开始日期是当月第1天，结束日期是当月最后一天
     * 例如：2026-01-01 至 2026-01-31 → is_full_month: true
     * 例如：2026-01-15 至 2026-01-31 → is_full_month: false
   - actual_month字段：根据日期范围计算实际月份，如"1月"

2. **营业额**：
   - 在"经营月报"数据区域查找"成团金额"或"营业额"字段
   - 金额必须转换为纯数字格式（去掉逗号、货币符号）
   - 保留小数点后两位

3. **退款金额**：
   - 在"经营月报"数据区域查找"退款金额"或"退款"字段
   - 金额必须转换为纯数字格式（去掉逗号、货币符号）
   - 保留小数点后两位

## 输出格式：
- 只输出JSON，不要有任何其他说明文字
- JSON必须格式正确，可以被解析
- 如果某项信息无法识别，对应字段设为null`;
  }

  /**
   * 拼多多 - 多多账单截图识别提示词
   */
  private buildPDDBillPrompt(): string {
    return `你是一个专业的OCR数据提取专家。这是一张拼多多商家后台的"货款账单-月汇总"截图。

请仔细分析图片，提取所有关键信息，并严格按照以下JSON格式输出：

{
  "shop_name": "店铺名称（完整准确）",
  "amounts": {
    "账单中退款金额": 数值,
    "提现金额": 数值,
    "账单中支出总额": 数值
  },
  "raw_text": "图片中的完整文字内容"
}

## 识别要求：

1. **店铺名称**：
   - 识别页面顶部显示的店铺名称
   - 准确识别完整名称

2. **账单中退款金额**：
   - 在账单表格中查找"退款"相关字段
   - 如果没有找到退款金额或该字段为空，设为0（不是null）
   - 金额必须转换为纯数字格式（去掉逗号、货币符号）
   - 保留小数点后两位

3. **提现金额**（重要 - 不要混淆）：
   - **只查找"提现"字段**
   - **不要将"转账支出"识别为"提现"**
   - 如果账单中没有"提现"记录，设置为null
   - 金额必须转换为纯数字格式（去掉逗号、货币符号）
   - 保留小数点后两位

4. **账单中支出总额**（核心识别字段 - 重要）：
   - 这是最重要的识别字段！
   - 表格列标题是：**入账时间、收入(元)、收入笔数、支出(元)、支出笔数、收益(元)...**
   - **关键识别规则**：
     1. 首先查找表格中哪一行处于"展开/收起"状态（该行的按钮显示为"收起"）
     2. 如果有展开的行，取该展开行的"支出(元)"列数值
     3. 如果没有展开的行，取第一行（最新月份）的"支出(元)"列数值
     4. 支出列通常显示为负数（如：-87819.34），取绝对值（去掉负号）
   - **示例**：如果2026-04月是展开状态（按钮显示"收起"），则识别2026-04月的支出-87819.34，输出87819.34
   - **不要识别未展开行的支出金额**
   - 金额必须转换为纯数字格式（去掉逗号、货币符号）
   - 保留小数点后两位

## 输出格式：
- 只输出JSON，不要有任何其他说明文字
- JSON必须格式正确，可以被解析
- 如果某项信息无法识别，对应字段设为null`;
  }

  /**
   * 解析OCR结果
   */
  private parseOCRResult(content: string): OCRResult {
    try {
      // 尝试提取JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        
        // 处理date_range字段
        let dateRange = result.date_range;
        if (!dateRange && result.dates && result.dates.length >= 2) {
          // 如果没有date_range但有dates，尝试解析
          dateRange = {
            start_date: result.dates[0],
            end_date: result.dates[1],
            is_full_month: this.checkIsFullMonth(result.dates[0], result.dates[1]),
            actual_month: this.extractMonthFromDateRange(result.dates[0], result.dates[1]),
          };
        }
        
        return {
          shop_name: result.shop_name,
          month: result.month,
          amounts: result.amounts,
          dates: result.dates,
          date_range: dateRange,
          raw_text: result.raw_text,
        };
      }

      // 如果无法解析为JSON，返回原始文本
      return {
        raw_text: content,
      };

    } catch (error) {
      console.error('解析OCR结果失败:', error);
      return {
        raw_text: content,
      };
    }
  }

  /**
   * 检查日期范围是否为完整月份
   */
  private checkIsFullMonth(startDate?: string, endDate?: string): boolean {
    if (!startDate || !endDate) return false;
    
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
      
      // 检查是否为当月第一天到最后一天
      const startDay = start.getDate();
      const endDay = end.getDate();
      const startMonth = start.getMonth();
      const endMonth = end.getMonth();
      const startYear = start.getFullYear();
      const endYear = end.getFullYear();
      
      // 同年同月
      if (startYear === endYear && startMonth === endMonth) {
        // 获取该月最后一天
        const lastDayOfMonth = new Date(endYear, endMonth + 1, 0).getDate();
        return startDay === 1 && endDay === lastDayOfMonth;
      }
      
      return false;
    } catch {
      return false;
    }
  }

  /**
   * 从日期范围提取月份
   */
  private extractMonthFromDateRange(startDate?: string, endDate?: string): string | undefined {
    if (!startDate && !endDate) return undefined;
    
    try {
      const date = new Date(startDate || endDate || '');
      if (isNaN(date.getTime())) return undefined;
      
      return `${date.getMonth() + 1}月`;
    } catch {
      return undefined;
    }
  }

  /**
   * 检查OCR缓存
   * @param cacheKey 缓存键（可以是图片MD5或imageKey）
   */
  private async checkCache(cacheKey: string): Promise<OCRResult | null> {
    try {
      const isMd5 = /^[a-f0-9]{32}$/i.test(cacheKey);
      const md5 = isMd5 ? cacheKey : createHash('md5').update(cacheKey).digest('hex');

      const cached = ocrCacheStore.get(md5);
      if (!cached) {
        return null;
      }

      const cachedData = cached.result_json;
      if (typeof cachedData === 'string') {
        try {
          return JSON.parse(cachedData);
        } catch {
          console.error('缓存数据解析失败');
          return null;
        }
      }

      return cachedData as OCRResult;

    } catch (error) {
      console.error('检查缓存失败:', error);
      return null;
    }
  }

  /**
   * 缓存OCR结果
   * @param cacheKey 缓存键（可以是图片MD5或imageKey）
   */
  private async cacheResult(cacheKey: string, result: OCRResult): Promise<void> {
    try {
      const isMd5 = /^[a-f0-9]{32}$/i.test(cacheKey);
      const md5 = isMd5 ? cacheKey : createHash('md5').update(cacheKey).digest('hex');

      ocrCacheStore.set(md5, {
        image_md5: md5,
        result_json: result,
        created_at: new Date().toISOString(),
      });

    } catch (error) {
      console.error('缓存OCR结果失败:', error);
    }
  }

  /**
   * 批量识别图片
   */
  async recognizeBatch(
    images: Array<{ imageKey: string; platform: string }>
  ): Promise<Map<string, OCRResult>> {
    const results = new Map<string, OCRResult>();

    // 并发处理，每批最多5个
    const batchSize = 5;
    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(img => this.recognizeImage(img.imageKey, img.platform))
      );

      batch.forEach((img, index) => {
        results.set(img.imageKey, batchResults[index]);
      });
    }

    return results;
  }

  /**
   * 淘宝 - 店铺数据截图识别提示词
   * 识别：营业额、退款、淘宝客、店铺名称、月份
   */
  private buildTaobaoShopDataPrompt(): string {
    return `你是一个专业的OCR数据提取专家。这是一张淘宝商家后台的"店铺数据"或"经营概况"截图。

## 核心任务：识别店铺名称

**店铺名称位于页面顶部的蓝色导航栏中**

查找位置：
- 找到页面顶部蓝色导航栏中的"生意参谋"文字
- 在"生意参谋"右侧显示的店铺名称就是目标店铺名称
- 店铺名称后面可能带有"主店"等标识，**只提取店铺名称，不包含标识**

例如：
- "生意参谋"右侧显示"鑫宇文具礼品 主店"，则shop_name = "鑫宇文具礼品"
- "生意参谋"右侧显示"瑞福临门庭 主店"，则shop_name = "瑞福临门庭"

---

## 其他信息识别

请仔细分析图片，提取所有关键信息，并严格按照以下JSON格式输出：

{
  "shop_name": "店铺名称（完整准确）",
  "month": "月份（如：1月、2月、12月等）",
  "date_range": {
    "start_date": "开始日期（YYYY-MM-DD格式）",
    "end_date": "结束日期（YYYY-MM-DD格式）",
    "is_full_month": true或false,
    "actual_month": "根据日期范围计算的实际月份（如：1月）"
  },
  "amounts": {
    "营业额": 数值,
    "退款": 数值,
    "淘宝客": 数值
  },
  "dates": ["开始日期", "结束日期"],
  "raw_text": "图片中的完整文字内容"
}

## 识别要求：

1. **营业额**：
   - 在数据区域查找"营业额"、"成交金额"、"交易额"、"净营业额"等字段
   - 注意区分"营业额"和"净营业额"，优先识别"营业额"
   - 金额必须转换为纯数字格式（去掉逗号、货币符号）
   - 保留小数点后两位

2. **退款（非常重要）**：
   - **关键**：页面上可能显示多个退款金额字段，必须识别"**退款金额（完结时间）**"这个字段
   - 常见的退款金额字段有：
     - "退款金额（完结时间）" ← **这是需要识别的字段**
     - "退款金额（支付时间）" ← 不要识别这个
   - **识别步骤**：
     1. 在数据区域查找"退款金额"相关字段
     2. 如果有多个退款金额字段，找到"退款金额（完结时间）"
     3. 读取该字段的数值
   - 金额必须转换为纯数字格式（去掉逗号、货币符号）
   - 保留小数点后两位

3. **淘宝客（重要）**：
   - 在数据区域查找"淘宝客"、"淘宝客佣金"、"淘宝客推广"字段
   - 这个字段通常显示推广佣金支出
   - **如果找不到"淘宝客"相关字段或截图中没有淘宝客数据，设为0（不是null）**
   - 金额必须转换为纯数字格式

4. **日期范围**：
   - 识别截图的日期范围，判断是否为完整月份
   - 格式必须是YYYY-MM-DD

## 输出格式：
- 只输出JSON，不要有任何其他说明文字
- JSON必须格式正确，可以被解析
- 如果某项信息无法识别，对应字段设为null`;
  }

  /**
   * 淘宝 - 万相台无界版截图识别提示词
   */
  private buildTaobaoWanxiangtaiPrompt(): string {
    return `你是一个专业的OCR数据提取专家。这是一张淘宝商家后台"万相台无界"的数据截图。

请仔细分析图片，提取关键信息，并严格按照以下JSON格式输出：

{
  "amounts": {
    "万相台无界": 数值
  },
  "raw_text": "图片中的完整文字内容"
}

## 识别要求：

**万相台无界费用（非常重要）**：
- **关键**：优先识别"现金花费"字段的金额
- 页面通常会显示多个费用字段：
  - "总花费" 或 "消耗"（总推广费用）
  - "现金花费"（实际现金支出，**这是我们需要识别的字段**）
- **识别顺序**：
  1. 首先查找"现金花费"字段
  2. 如果没有"现金花费"，则查找"花费"、"消耗"字段
  3. 如果有多个花费值，选择"现金"相关的那个
- 金额必须转换为纯数字格式（去掉逗号、货币符号）
- 保留小数点后两位
- **示例**：如果页面显示"总花费: 2261.51" 和 "现金花费: 2259.86"，应该输出 2259.86

## 输出格式：
- 只输出JSON，不要有任何其他说明文字
- 如果某项信息无法识别，对应字段设为null`;
  }

  /**
   * 淘宝 - 小额打款后台数据识别提示词
   * 注意：识别的是"累计打款金额"，不是下方列表中的单笔"打款金额"
   */
  private buildTaobaoSmallPaymentPrompt(): string {
    return `你是一个专业的OCR数据提取专家。这是一张淘宝商家后台"小额打款-打款记录"的数据截图。

请仔细分析图片，提取关键信息，并严格按照以下JSON格式输出：

{
  "amounts": {
    "小额打款": 数值
  },
  "raw_text": "图片中的完整文字内容"
}

## 小额打款金额识别要求：
- 重要：识别的是页面顶部的"累计打款金额"字段的数值，不是下方列表中的单笔"打款金额"
- 查找"累计打款金额"或"累计打款"字段对应的数值
- 不要识别下方打款记录列表中单笔的"打款金额"列的数值
- 金额必须转换为纯数字格式（去掉逗号、货币符号）
- 保留小数点后两位

## 输出格式：
- 只输出JSON，不要有任何其他说明文字
- 如果某项信息无法识别，对应字段设为null`;
  }

  /**
   * 淘宝 - 淘宝平台技术截图识别提示词
   * 识别：先用后付、技术服务费、跨境服务、淘金币服务
   * 这四项费用都在同一张截图中（支出账单月汇总）
   */
  private buildTaobaoTechServicePrompt(): string {
    return `你是一个专业的OCR数据提取专家。这是一张淘宝商家后台的支出账单月汇总截图。

请仔细分析图片，提取关键信息，并严格按照以下JSON格式输出：

{
  "amounts": {
    "先用后付": 数值,
    "技术服务费": 数值,
    "跨境服务": 数值,
    "淘金币服务": 数值
  },
  "raw_text": "图片中的完整文字内容"
}

## 费用识别要求（非常重要）

所有费用都从表格的"本月付款"列读取。如果某项在截图中不存在，该项设为0。

### 1. 先用后付
- 在表格中查找"**先用后付技术服务费**"行
- 读取该行的"**本月付款**"列的值
- 如果没有这一行，设为0

### 2. 技术服务费
- 在表格中查找"**基础软件服务费**"行
- 读取该行的"**本月付款**"列的值
- 金额可能是正数或负数，如实识别
- 如果没有这一行，设为0

### 3. 跨境服务（计算两项之和）
跨境服务 = 淘宝天猫跨境服务增值费 + 淘宝天猫跨境服务基础费

识别步骤：
1. 在表格中查找"**淘宝天猫跨境服务增值费**"行，读取"本月付款"列的值
2. 在表格中查找"**淘宝天猫跨境服务基础费**"行，读取"本月付款"列的值
3. 将两者相加得到跨境服务金额

如果某行不存在，该行金额视为0。如果两行都不存在，跨境服务设为0。

### 4. 淘金币服务
- 在表格中查找"**淘金币软件服务费**"行
- 读取该行的"**本月付款**"列的值
- 如果没有这一行，设为0

## 示例

假设表格内容如下：
| 业务大类 | 本月付款 |
|---------|---------|
| 先用后付技术服务费 | 26.87 |
| 淘宝天猫跨境服务增值费 | 307.96 |
| 基础软件服务费 | 359.48 |
| 淘宝天猫跨境服务基础费 | 154.02 |

则输出：
{
  "amounts": {
    "先用后付": 26.87,
    "技术服务费": 359.48,
    "跨境服务": 461.98,  // 307.96 + 154.02
    "淘金币服务": 0  // 没有淘金币软件服务费行
  }
}

## 输出格式：
- 只输出JSON，不要有任何其他说明文字
- 金额必须转换为纯数字格式（去掉逗号、货币符号、单位）
- 保留小数点后两位，负数保留负号
- 如果某项找不到对应行，设为0`;
  }

  /**
   * 淘宝 - 偏远集运仓截图识别提示词（商家集运）
   */
  private buildTaobaoMerchantShippingPrompt(): string {
    return `你是一个专业的OCR数据提取专家。这是一张淘宝商家后台"偏远集运仓"或"商家集运"的数据截图。

请仔细分析图片，提取关键信息，并严格按照以下JSON格式输出：

{
  "amounts": {
    "商家集运": 数值
  },
  "raw_text": "图片中的完整文字内容"
}

## 商家集运费用识别要求：
- 查找与"集运"、"偏远地区"、"集运仓"相关的费用
- 可能的字段名称：
  - "集运费用"、"偏远集运费用"
  - "集运补贴"、"偏远地区补贴"
  - "物流费用"、"运费补贴"
- 这是针对偏远地区的物流相关费用
- 金额必须转换为纯数字格式（去掉逗号、货币符号）
- 保留小数点后两位

## 输出格式：
- 只输出JSON，不要有任何其他说明文字
- 如果某项信息无法识别，对应字段设为null`;
  }

  /**
   * 淘宝 - 跨境服务截图识别提示词
   * 跨境服务 = 淘宝天猫跨境服务增值费 + 淘宝天猫跨境服务基础费
   */
  private buildTaobaoCrossBorderPrompt(): string {
    return `你是一个专业的OCR数据提取专家。这是一张淘宝商家后台的支出账单月汇总截图，包含跨境服务相关费用。

请仔细分析图片，提取关键信息，并严格按照以下JSON格式输出：

{
  "amounts": {
    "跨境服务": 数值
  },
  "raw_text": "图片中的完整文字内容"
}

## 跨境服务费用识别要求（非常重要）：

**跨境服务费用 = 淘宝天猫跨境服务增值费 + 淘宝天猫跨境服务基础费**

### 识别步骤：

1. 在表格中找到以下两行：
   - "淘宝天猫跨境服务增值费"行
   - "淘宝天猫跨境服务基础费"行

2. 分别读取这两行的"本月付款"列的值

3. 计算两者之和：
   - 跨境服务 = 增值费本月付款 + 基础费本月付款

### 示例：
- 如果"淘宝天猫跨境服务增值费"的本月付款 = 176.50
- 如果"淘宝天猫跨境服务基础费"的本月付款 = 88.24
- 则跨境服务 = 176.50 + 88.24 = 264.74

### 注意事项：
- 金额必须转换为纯数字格式（去掉逗号、货币符号）
- 保留小数点后两位
- 如果找不到某一行，该行金额视为0
- 如果两行都找不到，设为null

## 输出格式：
- 只输出JSON，不要有任何其他说明文字
- 如果某项信息无法识别，对应字段设为null`;
  }

  /**
   * 淘宝 - 淘金币服务截图识别提示词
   */
  private buildTaobaoGoldCoinPrompt(): string {
    return `你是一个专业的OCR数据提取专家。这是一张淘宝商家后台"收支账单-支出账单-月汇总"页面的截图。

请仔细分析图片，提取关键信息，并严格按照以下JSON格式输出：

{
  "amounts": {
    "淘金币服务": 数值
  },
  "raw_text": "图片中的完整文字内容"
}

## 淘金币服务费用识别要求（非常重要，必须精确识别）

### 页面结构说明
这是一个账单表格页面，表格结构如下：
- **表头列**：月份、业务大类、币种、本月付款、本月交易额、扣费金额合计(元)、退款金额、待开票金额
- **数据行**：可能包含多行，如"先用后付技术服务费"、"基础软件服务费"、"淘金币软件服务费"等

### 精确定位方法（必须按此方法识别）

**步骤一：找到行**
- 在表格的"业务大类"列中查找"**淘金币软件服务费**"
- 该行就是我们需要的数据行

**步骤二：找到列**
- 在表头中查找"**本月付款**"列
- 注意：不是"本月交易额"，也不是"扣费金额合计"

**步骤三：取交叉值**
- 取"淘金币软件服务费"行与"本月付款"列交叉位置的数值
- 这就是我们需要识别的淘金币服务费

### 重要：容易混淆的数值（必须避免）

根据实际页面，淘金币软件服务费行可能包含多个数值：
- **本月付款**：514.04 ✅ 这是正确的值
- 本月交易额：31,793.27 ❌ 这是交易流水，不是费用
- 扣费金额合计(元)：514.12 ❌ 这是扣费金额，包含退款前的金额
- 退款金额：0.08 ❌ 这是退款
- 待开票金额：514.04 ❌ 这是待开票金额

**为什么本月付款和扣费金额合计不同？**
- 扣费金额合计是原始扣费金额
- 本月付款 = 扣费金额合计 - 退款金额
- 我们需要的是实际付出的金额，即"本月付款"

### 页面顶部合计金额（不要识别）
页面顶部可能显示"扣费金额合计 839.56 CNY"，这是所有业务大类的合计，不是淘金币服务费，不要识别这个值。

### 输出要求
- 金额必须转换为纯数字格式（去掉逗号、货币符号、单位）
- 精确到小数点后两位
- 如果找不到"淘金币软件服务费"行，amounts.淘金币服务设为0

## 输出格式：
- 只输出JSON，不要有任何其他说明文字
- 如果某项信息无法识别，对应字段设为null`;
  }

  /**
   * 淘宝 - 红包签到佣金截图识别提示词
   */
  private buildTaobaoRedPacketPrompt(): string {
    return `你是一个专业的OCR数据提取专家。这是一张淘宝商家后台"红包签到"相关的支出账单截图。

请仔细分析图片，提取关键信息，并严格按照以下JSON格式输出：

{
  "amounts": {
    "红包签到": 数值
  },
  "raw_text": "图片中的完整文字内容"
}

## 红包签到费用识别要求（非常重要）：

**关键**：红包签到金额 = "每日必买"行的"支出金额合计（元）"列的值

### 识别步骤：

1. 在表格中找到"**每日必买**"这一行（在"业务大类"列）
2. 读取该行的"**支出金额合计（元）**"列的数值
3. 将该数值填入JSON的"红包签到"字段

### 示例：
- 如果"每日必买"行的"支出金额合计（元）"= 0.83
- 则红包签到 = 0.83

### 注意事项：
- 金额必须转换为纯数字格式（去掉逗号、货币符号）
- 保留小数点后两位
- 如果找不到"每日必买"行，设为0

## 输出格式：
- 只输出JSON，不要有任何其他说明文字
- 如果某项信息无法识别，对应字段设为null`;
  }

  /**
   * 淘宝 - 公益宝贝佣金截图识别提示词
   */
  private buildTaobaoCharityPrompt(): string {
    return `你是一个专业的OCR数据提取专家。这是一张淘宝商家后台"公益宝贝"的数据截图。

请仔细分析图片，提取关键信息，并严格按照以下JSON格式输出：

{
  "amounts": {
    "公益宝贝": 数值
  },
  "raw_text": "图片中的完整文字内容"
}

## 公益宝贝费用识别要求：
- 查找与"公益宝贝"、"公益捐赠"相关的费用
- 可能的字段名称：
  - "公益宝贝费用"、"公益宝贝"
  - "公益捐赠"、"捐赠金额"
  - "公益佣金"
- 这是公益宝贝计划相关的捐赠费用
- 金额必须转换为纯数字格式（去掉逗号、货币符号）
- 保留小数点后两位

## 输出格式：
- 只输出JSON，不要有任何其他说明文字
- 如果某项信息无法识别，对应字段设为null`;
  }

  /**
   * 淘宝 - 通用提示词（用于其他图片类型）
   */
  private buildTaobaoGenericPrompt(imageType: string): string {
    return `你是一个专业的OCR数据提取专家。这是一张淘宝商家后台"${imageType}"的数据截图。

## 核心任务：识别店铺名称

观察浏览器窗口最顶部的标签栏，识别【激活标签】中的店铺名称。

### 判断方法：比较差异

标签栏中有多个标签，其中有一个标签与其他标签明显不同。请按以下步骤识别：

**第一步：观察所有标签的整体外观**
浏览所有标签，注意它们之间的视觉差异。

**第二步：找出"与其他标签不同"的那个标签**
激活标签的特征：
- 背景颜色比其他标签更浅（更白）
- 文字颜色比其他标签更深（更黑）
- 与下方页面内容区域颜色相近，形成"连接"效果

**第三步：读取该标签中的店铺名称**

### 重要提示
- 不要单独判断某个标签的颜色，而是比较标签之间的差异
- 激活标签是"与其他标签不同"的那个
- 关注背景色的明暗差异，背景最亮的通常是激活标签

### 输出格式
- 店铺名称：[激活标签中的店铺名]

---

## 其他信息识别

请仔细分析图片，提取关键信息，并严格按照以下JSON格式输出：

{
  "shop_name": "店铺名称（从激活标签识别）",
  "amounts": {
    "${imageType}": 数值
  },
  "raw_text": "图片中的完整文字内容"
}

## 金额识别要求：
- 查找与"${imageType}"相关的费用或金额字段
- 金额必须转换为纯数字格式（去掉逗号、货币符号）
- 保留小数点后两位

## 输出格式：
- 只输出JSON，不要有任何其他说明文字
- 如果某项信息无法识别，对应字段设为null`;
  }
}

// 导出单例
export const ocrService = new OCRService();
