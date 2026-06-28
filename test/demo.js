/**
 * 成语 Wordle 完整演示
 * 运行: node test/demo.js
 */

const { createGame, submitGuess, parsePinyin, checkPinyin, getPraiseMessage, generateShareContent } = require('../src/engine')
const { getDailyIdiom, getBankStats } = require('../src/daily')
const { validateGuess, suggestNextGuess } = require('../src/validator')
const { generateTextShare } = require('../src/share')

const c = {
  bold: '\x1b[1m', green: '\x1b[32m', yellow: '\x1b[33m',
  gray: '\x1b[90m', cyan: '\x1b[36m', red: '\x1b[31m', reset: '\x1b[0m',
}

// ============================================================
//  Demo 1: 核心猜词 + 拼音反馈
// ============================================================
console.log(c.bold + '\n═══════════════════════════════════════')
console.log('  Demo 1: 猜词引擎 + 拼音反馈')
console.log('═══════════════════════════════════════\n' + c.reset)

const answer = {
  text: '画龙点睛',
  chars: ['画', '龙', '点', '睛'],
  pinyin: ['huà', 'lóng', 'diǎn', 'jīng'],
  radicals: ['一', '龙', '灬', '目'],
  strokes: [8, 5, 9, 13],
  structures: ['半包围', '独体', '上下', '左右'],
}

const game = createGame(answer, 6)

// 第 1 次: 花龙点精
console.log(c.cyan + '第 1 次: 花(huā) 龙(lóng) 点(diǎn) 精(jīng)' + c.reset)
const { result: r1 } = submitGuess(game, ['花', '龙', '点', '精'], ['huā', 'lóng', 'diǎn', 'jīng'])
showResult(r1)

// 第 2 次: 根据声调反馈修正
console.log(c.cyan + '\n第 2 次: 画(huà) 龙(lóng) 点(diǎn) 睛(jīng)' + c.reset)
console.log(c.gray + '  上次反馈: huā → 声母对但声调错(1≠4)，试试 huà 的同音字...' + c.reset)
const { result: r2 } = submitGuess(game, ['画', '龙', '点', '睛'], ['huà', 'lóng', 'diǎn', 'jīng'])
showResult(r2)

console.log(c.green + `\n  🎉 ${game.attempts.length}/6 次猜中！` + c.reset)

function showResult(r) {
  const icons = { correct: '🟩', pinyin: '🟦', partial: '🟪', present: '🟨', absent: '⬛' }
  r.chars.forEach((ch, i) => {
    const icon = icons[ch.status]
    const py = ch.pinyin ? `(${ch.pinyin})` : ''
    const extra = ch.answerPinyin && ch.answerPinyin !== ch.pinyin
      ? c.yellow + ` → 答案拼音是 ${ch.answerPinyin}` + c.reset : ''
    console.log(`    位置${i + 1}: ${icon} 「${ch.char}」${py} ${ch.label}${extra}`)
  })
  console.log(`    ${r.emojiString}`)
}

// ============================================================
//  Demo 2: 拼音三种情况一览
// ============================================================
console.log(c.bold + '\n\n═══════════════════════════════════════')
console.log('  Demo 2: 拼音匹配三种情况')
console.log('═══════════════════════════════════════\n' + c.reset)

const tests = [
  { g: 'huā', a: 'huà', desc: '声母对(h)，韵母对(ua)，声调错(1≠4)' },
  { g: 'jīng', a: 'jīng', desc: '完全一样' },
  { g: 'shān', a: 'shuǐ', desc: '声母对(sh)，韵母不对(an≠ui)' },
  { g: 'sān', a: 'shān', desc: '声母不对(s≠sh)，韵母+声调对(ān=ān)' },
  { g: 'zhōng', a: 'zōng', desc: '声母不对(zh≠z)，韵母不对(ōng≠ōng...等等声调对?)' },
  { g: 'tiān', a: 'dì', desc: '全不对' },
]

console.log('  猜测拼音  答案拼音  结果  |  说明')
console.log('  ' + '─'.repeat(55))
tests.forEach(({ g, a, desc }) => {
  const level = checkPinyin(g, a)
  const icon = { exact: '🟦', partial: '🟪', none: '⬛' }[level]
  console.log(`  ${icon} ${g.padEnd(8)} → ${a.padEnd(8)} | ${desc}`)
})

// ============================================================
//  Demo 3: 拼音解析
// ============================================================
console.log(c.bold + '\n\n═══════════════════════════════════════')
console.log('  Demo 3: 拼音拆分')
console.log('═══════════════════════════════════════\n' + c.reset)
;['chuáng', 'xiǎo', 'shuǐ', 'yī'].forEach((py) => {
  const p = parsePinyin(py)
  console.log(`  ${py.padEnd(8)} → 声母:${(p.shengmu || '(零)').padEnd(5)} 韵母:${p.yunmu.padEnd(5)} 声调:${p.tone}`)
})

// ============================================================
//  Demo 4: 每日选题
// ============================================================
console.log(c.bold + '\n\n═══════════════════════════════════════')
console.log('  Demo 4: 每日谜题')
console.log('═══════════════════════════════════════\n' + c.reset)

const today = getDailyIdiom()
console.log(`  日期: ${today.date}  #${today.puzzleNumber}`)
console.log(`  难度: Lv.${today.level}  ${today.text}`)
console.log(`  拼音: ${today.pinyin.join(' ')}`)
console.log(`  词库: ${getBankStats().total} 个成语`)

// ============================================================
//  Demo 5: 验证 & 称赞 & 分享
// ============================================================
console.log(c.bold + '\n\n═══════════════════════════════════════')
console.log('  Demo 5: 称赞 & 分享')
console.log('═══════════════════════════════════════\n' + c.reset)

console.log('  不同成绩:')
for (let n = 1; n <= 6; n++) console.log(`    ${n}/6 → ${getPraiseMessage(n, true)}`)
console.log(`    失败  → ${getPraiseMessage(6, false, 0, '画龙点睛')}`)

console.log('\n  连击:')
;[3, 7, 30].forEach((d) => console.log(`    🔥 ${d}天 → ${getPraiseMessage(3, true, d)}`))

console.log('\n  分享文案:')
const shareText = generateTextShare(game, { streak: 7 })
console.log(shareText.split('\n').map((l) => '    ' + l).join('\n'))

// ============================================================
//  Demo 6: 输入验证
// ============================================================
console.log(c.bold + '\n\n═══════════════════════════════════════')
console.log('  Demo 6: 输入验证')
console.log('═══════════════════════════════════════\n' + c.reset)
;['一心一意', 'abc', '胸有成竹'].forEach((s) => {
  const v = validateGuess(s)
  console.log(`    ${v.valid ? '✅' : '❌'} "${s}" → ${v.valid ? '合法' : v.errors.join(', ')}`)
})

// 智能建议
console.log('\n  猜测过程中的建议:')
suggestNextGuess(game.attempts).forEach((s) => console.log(`    💡 ${s}`))

console.log(c.green + '\n\n✅ 全部 Demo 运行完成！\n' + c.reset)
