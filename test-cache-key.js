/**
 * 测试缓存键构建逻辑
 */

const crypto = require('crypto');

// 模拟 buildCacheKey
function buildCacheKey(baseKey, platform, imageType) {
  const isValidMd5 = (key) => /^[a-f0-9]{32}$/i.test(key) && !key.includes('/') && !key.includes('\\');
  const md5 = isValidMd5(baseKey) ? baseKey : crypto.createHash('md5').update(baseKey).digest('hex');
  
  if (imageType) {
    return `${md5}:${platform}:${imageType}`;
  }
  return `${md5}:${platform}`;
}

// 测试场景1：使用MD5作为baseKey
const md5Key = '59e49b638621ad2679774413bbc1f2a4';
console.log('场景1: 使用MD5作为baseKey');
console.log(`  店铺月度数据截图: ${buildCacheKey(md5Key, '抖音', '店铺月度数据截图')}`);
console.log(`  支出总额截图: ${buildCacheKey(md5Key, '抖音', '支出总额截图')}`);

// 测试场景2：使用imageKey作为baseKey
const imageKey = 'douyin_店铺月度数据截图_row_2_abc123.png';
console.log('\n场景2: 使用imageKey作为baseKey');
console.log(`  店铺月度数据截图: ${buildCacheKey(imageKey, '抖音', '店铺月度数据截图')}`);

// 关键问题：同一张图片在不同调用中可能使用不同的baseKey
// 第一次调用：使用md5
// 第二次调用：使用imageKey
// 这会导致缓存键不同，无法命中缓存

console.log('\n=== 关键发现 ===');
console.log('processImage方法中:');
console.log('  1. 先上传图片，得到imageKey');
console.log('  2. 调用recognizeImage(imageKey, platform, imageType, md5)');
console.log('  3. recognizeImage中: cacheKey = buildCacheKey(md5 || imageKey, platform, imageType)');
console.log('');
console.log('如果md5存在，cacheKey使用md5');
console.log('如果md5不存在，cacheKey使用imageKey的hash');
console.log('');
console.log('问题：每次上传图片时imageKey不同（包含随机后缀），');
console.log('  但md5相同，所以缓存应该能命中。');
console.log('');
console.log('但是！isCacheComplete检查可能有问题：');
console.log('  对于抖音店铺月度数据截图，默认检查需要shop_name + month + amounts');
console.log('  如果OCR返回了amounts但缺少month，缓存会被认为不完整');
console.log('  然后重新识别，但结果还是缺少month，形成死循环');
