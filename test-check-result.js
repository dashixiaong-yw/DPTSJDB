/**
 * 检查结果数据
 */

async function checkResult() {
  const taskId = '15749dd2-c6a5-4547-8be8-a869e371a346';
  const response = await fetch(`http://localhost:3080/api/task/${taskId}/result`);
  const result = await response.json();
  
  console.log('统计:', JSON.stringify(result.stats));
  console.log('分组行数:', result.groupedByRow?.length || 0);
  
  if (result.groupedByRow) {
    for (const row of result.groupedByRow) {
      console.log(`\n行${row.rowIndex}: ${row.shopName} (${row.month})`);
      for (const item of row.items) {
        const ocrStr = item.ocrValue !== undefined && item.ocrValue !== null ? item.ocrValue : '缺失';
        console.log(`  ${item.fieldName}: 表格=${item.tableValue}, OCR=${ocrStr}, 状态=${item.status}`);
      }
    }
  }
}

checkResult().catch(console.error);
