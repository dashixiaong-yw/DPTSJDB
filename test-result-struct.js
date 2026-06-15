/**
 * 检查结果API返回的数据结构
 */

async function checkResult() {
  const taskId = '3b65cd69-36ec-4b83-8d77-5a24a40e334b';
  const response = await fetch(`http://localhost:3080/api/task/${taskId}/result`);
  const result = await response.json();
  
  console.log('顶层键:', Object.keys(result));
  console.log('items 类型:', typeof result.items, Array.isArray(result.items));
  console.log('items 长度:', result.items?.length);
  
  if (result.items && result.items.length > 0) {
    console.log('\n第一个item的键:', Object.keys(result.items[0]));
    console.log('第一个item:', JSON.stringify(result.items[0], null, 2).substring(0, 500));
  }
  
  // 检查comparisons
  if (result.comparisons) {
    console.log('\ncomparisons 类型:', typeof result.comparisons, Array.isArray(result.comparisons));
    console.log('comparisons 长度:', result.comparisons.length);
  }
  
  // 打印完整结构（前2000字符）
  const jsonStr = JSON.stringify(result, null, 2);
  console.log('\n完整结构（前2000字符）:');
  console.log(jsonStr.substring(0, 2000));
}

checkResult().catch(console.error);
