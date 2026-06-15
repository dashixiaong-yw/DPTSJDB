/**
 * 查找可用的视觉模型
 */

const fs = require('fs');

const apiKey = 'sk-fcduifoesykghqpnxuhftqomikojlqhavrprkuwbwafgoseh';

async function findVisionModels() {
  console.log('===== 查找可用的视觉模型 =====\n');
  
  try {
    const modelsResponse = await fetch('https://api.siliconflow.cn/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    
    if (!modelsResponse.ok) {
      const errorText = await modelsResponse.text();
      console.log(`❌ 查询失败 (${modelsResponse.status}):`, errorText);
      return;
    }
    
    const models = await modelsResponse.json();
    console.log(`共 ${models.data?.length || 0} 个模型\n`);
    
    // 查找视觉相关模型
    const visionKeywords = ['vision', 'vl', 'visual', 'kimi', 'moonshot', 'qwen-vl', 'glm-4v', 'cogvlm', 'internvl'];
    const visionModels = models.data?.filter(m => {
      const id = m.id?.toLowerCase() || '';
      return visionKeywords.some(kw => id.includes(kw));
    });
    
    if (visionModels && visionModels.length > 0) {
      console.log('可用的视觉模型:');
      visionModels.forEach(m => console.log(`  - ${m.id}`));
    } else {
      console.log('未找到视觉模型，列出所有模型:');
      models.data?.forEach(m => console.log(`  - ${m.id}`));
    }
    
  } catch (error) {
    console.error('查询失败:', error.message);
  }
}

findVisionModels().catch(console.error);
