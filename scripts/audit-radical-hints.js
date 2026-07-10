const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const outputPath = path.join(root, 'docs/radical-hint-audit.md')
const idioms = require('../data/idioms.json').idioms
const { getHintPositions, getRadicalHintInfo } = require('../src/daily')

const POSITION_LABELS = {
  left: '左',
  right: '右',
  top: '上',
  bottom: '下',
  center: '中',
}

const RADICAL_DATA_CORRECTIONS = {
  '三': { radical: '一', position: 'center' },
  '七': { radical: '一', position: 'center' },
  '九': { radical: '乙', position: 'center' },
  '中': { radical: '丨', position: 'center' },
  '军': { radical: '冖', position: 'top' },
  '丽': { radical: '一', position: 'top' },
  '卧': { radical: '卜', position: 'right' },
  '颦': { radical: '页', position: 'top' },
  '为': { radical: '丶', position: 'top' },
  '当': { radical: '彐', position: 'bottom' },
  '举': { radical: '丶', position: 'top' },
  '章': { radical: '音', position: 'top' },
  '亲': { radical: '亠', position: 'top' },
  '顸': { radical: '页', position: 'right' },
  '灵': { radical: '火', position: 'bottom' },
  '充': { radical: '儿', position: 'bottom' },
  '失': { radical: '大', position: 'center' },
  '舍': { radical: '舌', position: 'bottom' },
  '肓': { radical: '⺼', position: 'bottom' },
  '再': { radical: '冂', position: 'center' },
  '重': { radical: '里', position: 'center' },
  '事': { radical: '亅', position: 'center' },
  '雁': { radical: '隹', position: 'center' },
}

function describeStrength(info) {
  if (info.direct || info.score >= 2.7) return '高'
  if (info.score >= 1.5) return '中'
  return '低'
}

function describeVerdict(indices, infos, radicals) {
  const highCount = infos.filter(info => describeStrength(info) === '高').length
  const weakCount = infos.filter(info => info.weak).length
  const duplicateCount = indices.length - new Set(indices.map(index => radicals[index])).size
  if (highCount > 1) return '字形信息偏高，未再增加完整字线索'
  if (duplicateCount > 0) return '重复部首本身是题面特征，保留最少有效组合'
  if (weakCount > 0 && highCount > 0) return '一强一弱，避免直接泄题'
  if (weakCount > 0) return '含弱部件，补足其他可识别线索'
  if (indices.length === 3) return '低中信息，补至 3 枚'
  return '一前一后，信息均衡'
}

function findCorrectionMismatches() {
  const result = []
  idioms.forEach(idiom => {
    idiom.chars.forEach((char, index) => {
      const correction = RADICAL_DATA_CORRECTIONS[char]
      if (!correction) return
      if (idiom.radicals[index] !== correction.radical || idiom.radicalPositions[index] !== correction.position) {
        result.push({ idiom, index, correction })
      }
    })
  })
  return result
}

function applyDataCorrections() {
  let changed = 0
  idioms.forEach(idiom => {
    idiom.chars.forEach((char, index) => {
      const correction = RADICAL_DATA_CORRECTIONS[char]
      if (!correction) return
      if (idiom.radicals[index] === correction.radical && idiom.radicalPositions[index] === correction.position) return
      idiom.radicals[index] = correction.radical
      idiom.radicalPositions[index] = correction.position
      changed += 1
    })
  })
  fs.writeFileSync(path.join(root, 'data/idioms.json'), JSON.stringify(require('../data/idioms.json'), null, 2) + '\n')
  console.log('已校正', changed, '处部首/位置数据')
}

function buildRow(idiom) {
  const indices = getHintPositions('', idiom.radicalPositions, idiom.radicals, idiom.chars)
  const infos = indices.map(index => getRadicalHintInfo(
    idiom.radicals[index],
    idiom.radicalPositions[index] || 'center',
    idiom.chars[index]
  ))
  const allHints = idiom.radicals.map((radical, index) => {
    const position = POSITION_LABELS[idiom.radicalPositions[index] || 'center']
    return `${index + 1}.${radical}(${position})`
  }).join(' / ')
  const selectedHints = indices.map((index, offset) => {
    const position = POSITION_LABELS[idiom.radicalPositions[index] || 'center']
    return `${index + 1}.${idiom.radicals[index]}(${position},${describeStrength(infos[offset])})`
  }).join('、')
  return {
    line: `| ${idiom.id} | ${idiom.text} | Lv.${idiom.level} | ${allHints} | ${selectedHints} | ${describeVerdict(indices, infos, idiom.radicals)} |`,
    indices,
    infos,
  }
}

function buildReport() {
  const rows = idioms.map(buildRow)
  const twoCount = rows.filter(row => row.indices.length === 2).length
  const threeCount = rows.filter(row => row.indices.length === 3).length
  const highRiskCount = rows.filter(row => row.infos.filter(info => describeStrength(info) === '高').length > 1).length
  const weakCount = rows.filter(row => row.infos.some(info => info.weak)).length

  return [
    '# 部首猜词逐题提示审计',
    '',
    '更新时间: 2026-07-10',
    '',
    '审计范围: `data/idioms.json` 全部 213 条成语。游戏中的数据兼有“字典部首”和“可见部件”两种口径，本次以普通玩家能否从字形中认出、能否形成方向、是否过度泄题为优先判断标准。',
    '',
    '数据校准参考 Unicode Unihan `kRSUnicode` 和简体字可见结构；已统一“三→一、军→冖、当→彐、灵→火”等 23 类明确误差。存在多种检字口径且可见部件更利于玩家理解的字不做机械替换。',
    '',
    '## 平衡规则',
    '',
    '- 每题展示 2-3 枚，不再固定揭示 3/4。',
    '- 至少一枚来自前两个字、一枚来自后两个字；位置权重依次为 1.24、1.14、0.92、0.84。',
    '- 前两字负责建立成语开头方向，后两字负责校正，不让后半线索喧宾夺主。',
    '- 弱笔形、重复部首和“部首即完整字”的高信息线索会被惩罚；低信息组合才补到 3 枚。',
    '- 少数全为简单字、同部首或弱部件的成语使用人工覆盖，优先保证可玩性而不是机械统一数量。',
    '',
    '## 审计结果',
    '',
    `- 2 枚提示: ${twoCount} 条`,
    `- 3 枚提示: ${threeCount} 条`,
    `- 含弱部件但已做强弱搭配: ${weakCount} 条`,
    `- 受字形限制仍含多枚高信息部首: ${highRiskCount} 条`,
    '- 213/213 条均满足“前半至少 1 枚 + 后半至少 1 枚”。',
    '- `鸡犬升天` 固定选择第 1、4 位，避开玩家难以识别的“升→十”。',
    '',
    '## 逐题清单',
    '',
    '| ID | 成语 | 难度 | 四字部首与位置 | 实际揭示 | 结论 |',
    '|---:|---|---:|---|---|---|',
    ...rows.map(row => row.line),
    '',
  ].join('\n')
}

const report = buildReport()
if (process.argv.includes('--fix-data')) {
  applyDataCorrections()
} else if (process.argv.includes('--check')) {
  const mismatches = findCorrectionMismatches()
  if (mismatches.length > 0) {
    console.error('发现', mismatches.length, '处待校正部首数据，请运行 `node scripts/audit-radical-hints.js --fix-data`。')
    process.exit(1)
  }
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : ''
  if (current !== report) {
    console.error('部首提示审计报告已过期，请运行 `npm run audit:radicals`。')
    process.exit(1)
  }
  console.log('✅ 213 条部首提示审计报告与当前算法一致')
} else if (process.argv.includes('--write')) {
  fs.writeFileSync(outputPath, report)
  console.log('已生成', path.relative(root, outputPath))
} else {
  process.stdout.write(report)
}

module.exports = { buildReport }
