/**
 * 验证列索引计算
 */

// 模拟代码中的列索引计算
function colLetterToIndex(colLetter) {
  return colLetter.split('').reduce((acc, char) => acc * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

const testCases = ['K', 'L', 'M', 'N', 'O'];
console.log('列字母 -> 索引:');
for (const letter of testCases) {
  const index = colLetterToIndex(letter);
  console.log(`  ${letter} -> ${index}`);
}

console.log('\n代码中的常量:');
console.log('  K_COL_INDEX = 10 (K列)');
console.log('  L_COL_INDEX = 11 (L列)');
console.log('  N_COL_INDEX = 13 (N列)');

console.log('\n验证:');
console.log(`  K列索引 ${colLetterToIndex('K')} === 10 ? ${colLetterToIndex('K') === 10}`);
console.log(`  L列索引 ${colLetterToIndex('L')} === 11 ? ${colLetterToIndex('L') === 11}`);
console.log(`  N列索引 ${colLetterToIndex('N')} === 13 ? ${colLetterToIndex('N') === 13}`);
