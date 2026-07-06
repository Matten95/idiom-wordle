/**
 * 成语 Wordle 引擎 — 小程序版
 *
 * 反馈规则：
 *   🟩 correct — 汉字完全正确
 *   🟦 pinyin  — 同音不同字（拼音完全匹配）
 *   🟨 present — 汉字存在但位置不对
 *   🟪 partial — 拼音部分匹配
 *   ⬛ absent  — 全不对
 */

const SHENGMU = [
  'b','p','m','f','d','t','n','l',
  'g','k','h','j','q','x',
  'zh','ch','sh','r','z','c','s','y','w',
]

const TONE_MAP = {
  'ā':'a1','á':'a2','ǎ':'a3','à':'a4',
  'ē':'e1','é':'e2','ě':'e3','è':'e4',
  'ī':'i1','í':'i2','ǐ':'i3','ì':'i4',
  'ō':'o1','ó':'o2','ǒ':'o3','ò':'o4',
  'ū':'u1','ú':'u2','ǔ':'u3','ù':'u4',
  'ǖ':'v1','ǘ':'v2','ǚ':'v3','ǜ':'v4',
}

/** 拆拼音 → { shengmu, yunmu, tone } */
function parsePinyin(py) {
  if (!py) return { shengmu: '', yunmu: '', tone: 0 }
  let tone = 0, base = ''
  for (const ch of py) {
    if (TONE_MAP[ch]) {
      const [b, t] = TONE_MAP[ch]
      base += b === 'v' ? 'ü' : b
      tone = parseInt(t)
    } else { base += ch }
  }
  if (tone === 0) tone = 5
  let sm = '', rest = base
  for (const s of SHENGMU) {
    if (base.startsWith(s)) { sm = s; rest = base.slice(s.length); break }
  }
  return { shengmu: sm, yunmu: rest, tone }
}

/** 拼音匹配判定: exact | partial | none */
function checkPinyin(guessPy, answerPy) {
  if (guessPy === answerPy) return 'exact'
  const g = parsePinyin(guessPy), a = parsePinyin(answerPy)
  if (g.shengmu === a.shengmu) return 'partial'
  if (g.yunmu === a.yunmu && g.tone === a.tone) return 'partial'
  return 'none'
}

/** 核心计分 */
function scoreGuess(guessChars, guessPinyin, answer) {
  const answerChars = [...answer.chars]
  const answerPinyin = [...answer.pinyin]
  const used = [false, false, false, false]
  const chars = new Array(4)
  const hasPinyin = guessPinyin && guessPinyin.length === 4

  // 第一遍：汉字完全匹配 → 🟩
  for (let i = 0; i < 4; i++) {
    if (guessChars[i] === answerChars[i]) {
      chars[i] = { char: guessChars[i], status: 'correct', label: '正确', emoji: '🟩', color: 'correct', pinyin: answerPinyin[i] }
      used[i] = true
    }
  }

  // 第二遍：字不对，看拼音
  for (let i = 0; i < 4; i++) {
    if (chars[i]) continue
    if (!hasPinyin || !guessPinyin[i]) continue
    const level = checkPinyin(guessPinyin[i], answerPinyin[i])
    if (level === 'exact') {
      chars[i] = { char: guessChars[i], status: 'pinyin', label: '同音', emoji: '🟦', color: 'pinyin', pinyin: guessPinyin[i], answerPinyin: answerPinyin[i] }
    } else if (level === 'partial') {
      chars[i] = { char: guessChars[i], status: 'partial', label: '近音', emoji: '🟪', color: 'partial', pinyin: guessPinyin[i], answerPinyin: answerPinyin[i] }
    }
  }

  // 第三遍：汉字存在但位置不对 → 🟨
  for (let i = 0; i < 4; i++) {
    if (chars[i]) continue
    const pos = answerChars.findIndex((c, j) => c === guessChars[i] && !used[j])
    if (pos !== -1) {
      chars[i] = { char: guessChars[i], status: 'present', label: '错位', emoji: '🟨', color: 'present', pinyin: hasPinyin && guessPinyin[i] ? guessPinyin[i] : null, correctPosition: pos + 1 }
      used[pos] = true
    }
  }

  // 第四遍：完全不在 → ⬛
  for (let i = 0; i < 4; i++) {
    if (chars[i]) continue
    chars[i] = { char: guessChars[i], status: 'absent', label: '不在', emoji: '⬛', color: 'absent', pinyin: hasPinyin && guessPinyin[i] ? guessPinyin[i] : null }
  }

  const correctCount = chars.filter(c => c.status === 'correct').length
  return {
    chars,
    summary: {
      isWin: correctCount === 4,
      correctCount,
      pinyinCount: chars.filter(c => c.status === 'pinyin').length,
      partialCount: chars.filter(c => c.status === 'partial').length,
      presentCount: chars.filter(c => c.status === 'present').length,
    },
    emojiString: chars.map(c => c.emoji).join(''),
  }
}

// ============ 称赞文案 ============
const PRAISE = {
  attempts: {
    1: ['🎉 一猜即中！活字典！', '🏆 闻一知十，说的就是你！', '👑 汉语学家认证！'],
    2: ['⚡ 才思敏捷！两下就猜中了！', '🎯 博学多才！'],
    3: ['👍 融会贯通！', '🧠 敏而好学！', '🎓 学识渊博！'],
    4: ['💪 胸有成竹，渐入佳境！', '🌱 步步为营，稳扎稳打！'],
    5: ['🤔 殚精竭虑，终得真知！'],
    6: ['💪 柳暗花明又一村！坚持到最后！'],
  },
  failed: [
    '😅 今天的成语是「{answer}」，明天再战！',
    '📚 学无止境！今天答案是「{answer}」，记住了吗？',
  ],
  streak: {
    3: '🔥 连续 3 天！滴水穿石！',
    7: '🌟 连续 7 天！韦编三绝！',
    30: '👑 满月连击！学富五车！',
    100: '💎 百日连击！成语活化石！',
  },
}

function getPraise(attempts, won, streak = 0, answer = '') {
  if (won && streak >= 3) {
    const keys = Object.keys(PRAISE.streak).map(Number).sort((a, b) => b - a)
    for (const t of keys) { if (streak >= t) return PRAISE.streak[t] }
  }
  if (won) {
    const msgs = PRAISE.attempts[attempts] || PRAISE.attempts[6]
    return msgs[Math.floor(Math.random() * msgs.length)]
  }
  return PRAISE.failed[Math.floor(Math.random() * PRAISE.failed.length)].replace('{answer}', answer)
}

// ============ 历史记录管理 ============
const HISTORY_KEY = 'idiom_wordle_history'

function loadHistory() {
  try { return wx.getStorageSync(HISTORY_KEY) || [] } catch (e) { return [] }
}

function saveGameResult(game) {
  const history = loadHistory()
  const record = {
    date: game.date || '',
    answerText: game.answer?.text || '',
    attempts: game.attempts.length,
    won: game.status === 'won',
    emojiGrid: game.attempts.map(a => a.result.emojiString),
    time: new Date().toISOString(),
  }
  // 覆盖同一天的记录
  const idx = history.findIndex(h => h.date === record.date)
  if (idx >= 0) history[idx] = record
  else history.unshift(record)
  try { wx.setStorageSync(HISTORY_KEY, history) } catch (e) {}
  return history
}

module.exports = { scoreGuess, checkPinyin, parsePinyin, getPraise, loadHistory, saveGameResult }
