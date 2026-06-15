/**
 * 验证 isCacheComplete 逻辑
 */

// 模拟 isCacheComplete
function isCacheComplete(cached, platform, imageType) {
  if (!cached || cached.error) return false;
  
  // 支出总额截图：只需要 amounts
  if (platform === '抖音' && imageType === '支出总额截图') {
    return !!(cached.amounts && Object.keys(cached.amounts).length > 0);
  }
  
  // 默认：shop_name + month + amounts 全部需要
  return !!(
    cached.shop_name &&
    cached.month &&
    cached.amounts &&
    Object.keys(cached.amounts).length > 0
  );
}

// 测试场景
const testCases = [
  {
    name: '正常结果',
    cached: { shop_name: '梵仔礼品定制', month: '5月', amounts: { '成交金额': 115183.3 } },
    platform: '抖音',
    imageType: '店铺月度数据截图',
  },
  {
    name: 'month为空字符串',
    cached: { shop_name: '梵仔礼品定制', month: '', amounts: { '成交金额': 115183.3 } },
    platform: '抖音',
    imageType: '店铺月度数据截图',
  },
  {
    name: 'month为null',
    cached: { shop_name: '梵仔礼品定制', month: null, amounts: { '成交金额': 115183.3 } },
    platform: '抖音',
    imageType: '店铺月度数据截图',
  },
  {
    name: 'shop_name为空字符串',
    cached: { shop_name: '', month: '5月', amounts: { '成交金额': 115183.3 } },
    platform: '抖音',
    imageType: '店铺月度数据截图',
  },
  {
    name: 'amounts全为0',
    cached: { shop_name: '梵仔礼品定制', month: '5月', amounts: { '成交金额': 0, '退款金额': 0 } },
    platform: '抖音',
    imageType: '店铺月度数据截图',
  },
  {
    name: '支出总额截图-正常',
    cached: { shop_name: '', month: '', amounts: { '支出金额': 4.8 } },
    platform: '抖音',
    imageType: '支出总额截图',
  },
];

console.log('isCacheComplete 测试结果:');
console.log('='.repeat(60));
for (const tc of testCases) {
  const result = isCacheComplete(tc.cached, tc.platform, tc.imageType);
  console.log(`${result ? '✅' : '❌'} ${tc.name}: ${result}`);
  if (!result) {
    console.log(`   shop_name="${tc.cached.shop_name}" (${!!tc.cached.shop_name})`);
    console.log(`   month="${tc.cached.month}" (${!!tc.cached.month})`);
    console.log(`   amounts=${JSON.stringify(tc.cached.amounts)} (${!!(tc.cached.amounts && Object.keys(tc.cached.amounts).length > 0)})`);
  }
}
