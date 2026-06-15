const taskId = '75b2e61d-64dc-4847-b2bb-12c4c46f766a';
fetch(`http://localhost:3080/api/task/${taskId}/result`)
  .then(r => r.json())
  .then(result => {
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
  });
