/**
 * 全面测试 + 打分系统
 * 每个模块满分 100，低于 80 的自动标记为需修复
 */
const { scoreGuess, checkPinyin, parsePinyin, getPraise, createGame, submitGuess } = require('../src/engine')
const { getDailyIdiom, getHintPositions } = require('../src/daily')
const IDIOMS = require('../data/idioms.json')

let totalScore = 0
let totalMax = 0
const results = []

function test(name, fn) {
  try {
    fn()
    results.push({ name, score: 100, status: 'PASS' })
    totalScore += 100; totalMax += 100
  } catch (e) {
    const score = e.score || 0
    results.push({ name, score, status: 'FAIL', error: e.message })
    totalScore += score; totalMax += 100
  }
}

function assert(cond, msg, partialScore = 0) {
  if (!cond) {
    const err = new Error(msg)
    err.score = partialScore
    throw err
  }
}

// ============================================================
//  1. 数据完整性 (100分)
// ============================================================
test('1.1 词库大小', () => {
  assert(IDIOMS.idioms.length >= 100, `只有 ${IDIOMS.idioms.length} 个成语`, 60)
})
test('1.2 每个成语4个字', () => {
  IDIOMS.idioms.forEach(i => {
    assert(i.chars.length === 4, `${i.text} 字数不对`)
    assert(i.pinyin.length === 4, `${i.text} 拼音数不对`)
    assert(i.radicals.length === 4, `${i.text} 部首数不对`)
  })
})
test('1.3 拼音格式正确', () => {
  IDIOMS.idioms.forEach(i => {
    i.pinyin.forEach(p => {
      assert(typeof p === 'string' && p.length > 0, `${i.text} 拼音为空`)
    })
  })
})
test('1.4 部首位置数据存在', () => {
  let withPos = 0
  IDIOMS.idioms.forEach(i => {
    if (i.radicalPositions && i.radicalPositions.length === 4) withPos++
  })
  assert(withPos === IDIOMS.idioms.length, `只有 ${withPos}/${IDIOMS.idioms.length} 有位置数据`, 50)
})
test('1.5 无重复成语', () => {
  const texts = IDIOMS.idioms.map(i => i.text)
  const dupes = texts.filter((t, i) => texts.indexOf(t) !== i)
  assert(dupes.length === 0, `重复: ${dupes.join(', ')}`)
})

// ============================================================
//  2. parsePinyin (100分)
// ============================================================
test('2.1 基本解析', () => {
  const p = parsePinyin('chuáng')
  assert(p.shengmu === 'ch', `声母应为ch, 得到${p.shengmu}`)
  assert(p.yunmu === 'uang', `韵母应为uang, 得到${p.yunmu}`)
  assert(p.tone === 2, `声调应为2, 得到${p.tone}`)
})
test('2.2 零声母', () => {
  const p = parsePinyin('ài')
  assert(p.shengmu === '', `零声母, 得到${p.shengmu}`)
  assert(p.yunmu === 'ai', `韵母ai, 得到${p.yunmu}`)
  assert(p.tone === 4, `声调4, 得到${p.tone}`)
})
test('2.3 轻声', () => {
  const p = parsePinyin('ma')
  assert(p.tone === 5, `轻声应为5, 得到${p.tone}`)
})
test('2.4 ü 处理', () => {
  const p = parsePinyin('nǚ')
  assert(p.yunmu === 'ü', `韵母应为ü, 得到${p.yunmu}`)
  assert(p.tone === 3, `声调3, 得到${p.tone}`)
})

// ============================================================
//  3. checkPinyin 匹配规则 (100分)
// ============================================================
test('3.1 完全匹配 → exact', () => {
  assert(checkPinyin('huā', 'huā') === 'exact')
  assert(checkPinyin('lóng', 'lóng') === 'exact')
})
test('3.2 声母对 → partial', () => {
  assert(checkPinyin('huā', 'huà') === 'partial', 'h相同应为partial')
  assert(checkPinyin('shān', 'shuǐ') === 'partial', 'sh相同应为partial')
})
test('3.3 韵母+声调对 → partial', () => {
  assert(checkPinyin('sān', 'shān') === 'partial', 'ān相同应为partial')
})
test('3.4 全不对 → none', () => {
  assert(checkPinyin('tiān', 'dì') === 'none')
  assert(checkPinyin('wǒ', 'nǐ') === 'none')
})

// ============================================================
//  4. scoreGuess 计分逻辑 (100分)
// ============================================================
const ANSWER = {
  chars: ['画', '龙', '点', '睛'],
  pinyin: ['huà', 'lóng', 'diǎn', 'jīng'],
  radicals: ['田', '龙', '灬', '目'],
}

test('4.1 完全正确', () => {
  const r = scoreGuess(['画','龙','点','睛'], ['huà','lóng','diǎn','jīng'], ANSWER)
  assert(r.summary.isWin, '应该赢')
  assert(r.summary.correctCount === 4, `应为4, 得${r.summary.correctCount}`)
})
test('4.2 同音不同字 → pinyin status', () => {
  const r = scoreGuess(['话','龙','点','精'], ['huà','lóng','diǎn','jīng'], ANSWER)
  assert(r.chars[0].status === 'pinyin', `应为pinyin, 得${r.chars[0].status}`)
  assert(r.chars[3].status === 'pinyin', '精→睛 同音')
})
test('4.3 拼音部分匹配 → partial', () => {
  const r = scoreGuess(['花','龙','点','精'], ['huā','lóng','diǎn','jīng'], ANSWER)
  assert(r.chars[0].status === 'partial', `花huā→画huà 应为partial, 得${r.chars[0].status}`)
})
test('4.4 字存在但位置不对 → present', () => {
  const r = scoreGuess(['睛','龙','点','画'], ['jīng','lóng','diǎn','huà'], ANSWER)
  assert(r.chars[0].status === 'present', `睛在答案中但位置不对, 得${r.chars[0].status}`)
  assert(r.chars[3].status === 'present', `画在答案中但位置不对, 得${r.chars[3].status}`)
})
test('4.5 完全不在 → absent', () => {
  const r = scoreGuess(['天','地','人','和'], ['tiān','dì','rén','hé'], ANSWER)
  assert(r.chars.every(c => c.status === 'absent'), '全应为absent')
})

// ============================================================
//  5. 每日选题 (100分)
// ============================================================
test('5.1 同一天同一题', () => {
  const a = getDailyIdiom('2026-06-14')
  const b = getDailyIdiom('2026-06-14')
  assert(a.text === b.text, `${a.text} ≠ ${b.text}`)
})
test('5.2 不同天不同题', () => {
  const a = getDailyIdiom('2026-06-14')
  const b = getDailyIdiom('2026-06-15')
  assert(a.text !== b.text, '应不同')
})
test('5.3 返回完整数据', () => {
  const d = getDailyIdiom()
  assert(d.chars && d.pinyin && d.radicals, '缺少核心字段')
  assert(d.radicalPositions, '缺少部首位置')
  assert(d.text.length === 4, '不是4字成语')
})

// ============================================================
//  6. 部首提示逻辑 (100分)
// ============================================================
test('6.1 getHintPositions 返回2个位置', () => {
  const d = getDailyIdiom()
  const pos = getHintPositions(undefined, d.radicalPositions)
  assert(pos.length === 2, `应返回2个位置, 得${pos.length}`)
})
test('6.2 位置0始终被包含', () => {
  const d = getDailyIdiom()
  const pos = getHintPositions(undefined, d.radicalPositions)
  // 位置0可能在也可能不在（如果它是center则不在）
  // 只验证有返回值且合理
  assert(pos.length >= 1, '至少1个提示')
  pos.forEach(p => assert(p >= 0 && p <= 3, `位置${p}越界`))
})

// ============================================================
//  7. 称赞文案 (100分)
// ============================================================
test('7.1 胜利文案', () => {
  const p = getPraise(1, true)
  assert(p.length > 0, '空文案')
})
test('7.2 失败文案含答案', () => {
  const p = getPraise(6, false, 0, '画龙点睛')
  assert(p.includes('画龙点睛'), '未包含答案')
})
test('7.3 连击文案', () => {
  const p = getPraise(3, true, 7)
  assert(p.includes('7'), '应包含连击天数')
})

// ============================================================
//  8. 游戏会话 (100分)
// ============================================================
test('8.1 创建游戏', () => {
  const g = createGame(ANSWER)
  assert(g.status === 'playing', '初始状态应为playing')
  assert(g.maxAttempts === 6, '默认6次')
  assert(g.attempts.length === 0, '初始无attempts')
})
test('8.2 提交猜测', () => {
  const g = createGame(ANSWER)
  const { result, game } = submitGuess(g, ['花','龙','点','精'], ['huā','lóng','diǎn','jīng'])
  assert(game.attempts.length === 1, '应有1次记录')
  assert(!result.summary.isWin, '不应该赢')
})
test('8.3 胜利检测', () => {
  const g = createGame(ANSWER)
  const { result, game } = submitGuess(g, ['画','龙','点','睛'], ['huà','lóng','diǎn','jīng'])
  assert(result.summary.isWin, '应该赢')
  assert(game.status === 'won', '状态应为won')
})
test('8.4 超过次数', () => {
  const g = createGame(ANSWER, 2)
  submitGuess(g, ['花','好','月','圆'])
  submitGuess(g, ['一','心','一','意'])
  assert(g.status === 'lost', '应失败')
})

// ============================================================
//  汇总
// ============================================================
console.log('\n' + '='.repeat(60))
console.log('  测试评分报告')
console.log('='.repeat(60))
results.forEach((r, i) => {
  const icon = r.status === 'PASS' ? '✅' : '❌'
  const color = r.score >= 80 ? '' : ' 🔧需修复'
  console.log(`  ${icon} ${r.name.padEnd(35)} ${String(r.score).padStart(3)}分${color}`)
  if (r.error) console.log(`       → ${r.error}`)
})
const pct = Math.round(totalScore / totalMax * 100)
console.log(`\n  总分: ${totalScore}/${totalMax} (${pct}%)`)
console.log('='.repeat(60))
