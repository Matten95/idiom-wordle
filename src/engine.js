/**
 * 成语 Wordle 核心猜词引擎（精简版）
 *
 * 反馈规则：
 *   🟩 绿色 — 汉字完全正确
 *   🟦 蓝色 — 同音不同字（拼音完全匹配）
 *   🟨 黄色 — 汉字存在但位置不对
 *   🟪 紫色 — 拼音部分匹配（声母或韵母+声调 有一个对）
 *   ⬛ 灰色 — 全不对
 *
 * 使用示例：
 *   const result = scoreGuess(['花','好','月','圆'], guessPinyin, answerIdiom)
 */

// ============================================================
//  声母表
// ============================================================
const SHENGMU = [
  'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
  'g', 'k', 'h', 'j', 'q', 'x',
  'zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'y', 'w',
]

// 声调标记 → 基础字母
const TONE_MAP = {
  'ā': 'a1', 'á': 'a2', 'ǎ': 'a3', 'à': 'a4',
  'ē': 'e1', 'é': 'e2', 'ě': 'e3', 'è': 'e4',
  'ī': 'i1', 'í': 'i2', 'ǐ': 'i3', 'ì': 'i4',
  'ō': 'o1', 'ó': 'o2', 'ǒ': 'o3', 'ò': 'o4',
  'ū': 'u1', 'ú': 'u2', 'ǔ': 'u3', 'ù': 'u4',
  'ǖ': 'v1', 'ǘ': 'v2', 'ǚ': 'v3', 'ǜ': 'v4',
}

// ============================================================
//  拼音解析：拆成 { shengmu, yunmu, tone }
// ============================================================
function parsePinyin(pinyin) {
  if (!pinyin) return { shengmu: '', yunmu: '', tone: 0 }

  // 去声调，提取基础字母和声调值
  let tone = 0
  let normalized = ''
  for (const ch of pinyin) {
    if (TONE_MAP[ch]) {
      const [base, t] = TONE_MAP[ch]
      normalized += base === 'v' ? 'ü' : base
      tone = parseInt(t)
    } else {
      normalized += ch
    }
  }
  if (tone === 0) tone = 5 // 轻声

  // 提取声母
  let shengmu = ''
  let rest = normalized
  for (const sm of SHENGMU) {
    if (normalized.startsWith(sm)) {
      shengmu = sm
      rest = normalized.slice(sm.length)
      break
    }
  }

  return { shengmu, yunmu: rest, tone }
}

// ============================================================
//  拼音匹配判定（你定义的 3 级规则）
// ============================================================

/**
 * @param {string} guessPy - 猜测的拼音
 * @param {string} answerPy - 答案的拼音
 * @returns {'exact'|'partial'|'none'}
 */
function checkPinyin(guessPy, answerPy) {
  // 完全一致 → 绿色
  if (guessPy === answerPy) return 'exact'

  const g = parsePinyin(guessPy)
  const a = parsePinyin(answerPy)

  // 声母对 → 紫色（部分匹配）
  if (g.shengmu === a.shengmu) return 'partial'

  // 韵母+声调对 → 紫色（部分匹配）
  if (g.yunmu === a.yunmu && g.tone === a.tone) return 'partial'

  // 都不对 → 灰色
  return 'none'
}

// ============================================================
//  核心计分函数
// ============================================================
function scoreGuess(guessChars, guessPinyin, answer) {
  const answerChars = [...answer.chars]
  const answerPinyin = [...answer.pinyin]
  const used = [false, false, false, false]

  const chars = new Array(4)

  // ── 第一遍：汉字完全匹配 → 🟩 ──
  for (let i = 0; i < 4; i++) {
    if (guessChars[i] === answerChars[i]) {
      chars[i] = {
        char: guessChars[i],
        status: 'correct',
        label: '正确',
        emoji: '🟩',
        pinyin: answerPinyin[i],
      }
      used[i] = true
    }
  }

  // ── 第二遍：字不对，看拼音 ──
  const hasPinyin = guessPinyin && guessPinyin.length === 4
  for (let i = 0; i < 4; i++) {
    if (chars[i]) continue
    if (!hasPinyin || !guessPinyin[i]) continue

    const level = checkPinyin(guessPinyin[i], answerPinyin[i])

    if (level === 'exact') {
      chars[i] = {
        char: guessChars[i],
        status: 'pinyin',
        label: '同音不同字',
        emoji: '🟦',
        pinyin: guessPinyin[i],
        answerPinyin: answerPinyin[i],
      }
    } else if (level === 'partial') {
      chars[i] = {
        char: guessChars[i],
        status: 'partial',
        label: '拼音部分正确',
        emoji: '🟪',
        pinyin: guessPinyin[i],
        answerPinyin: answerPinyin[i],
      }
    }
    // level === 'none' → 不标记，继续后续
  }

  // ── 第三遍：汉字存在但位置不对 → 🟨 ──
  for (let i = 0; i < 4; i++) {
    if (chars[i]) continue

    const pos = answerChars.findIndex((c, j) => c === guessChars[i] && !used[j])
    if (pos !== -1) {
      chars[i] = {
        char: guessChars[i],
        status: 'present',
        label: '位置不对',
        emoji: '🟨',
        pinyin: hasPinyin && guessPinyin[i] ? guessPinyin[i] : null,
        correctPosition: pos + 1,
      }
      used[pos] = true
    }
  }

  // ── 第四遍：完全不在 → ⬛ ──
  for (let i = 0; i < 4; i++) {
    if (chars[i]) continue

    chars[i] = {
      char: guessChars[i],
      status: 'absent',
      label: '不存在',
      emoji: '⬛',
      pinyin: hasPinyin && guessPinyin[i] ? guessPinyin[i] : null,
    }
  }

  // ── 汇总 ──
  const correctCount = chars.filter((c) => c.status === 'correct').length
  const pinyinCount = chars.filter((c) => c.status === 'pinyin').length
  const partialCount = chars.filter((c) => c.status === 'partial').length
  const presentCount = chars.filter((c) => c.status === 'present').length

  return {
    chars,
    summary: {
      isWin: correctCount === 4,
      correctCount,
      pinyinCount,
      partialCount,
      presentCount,
      absentCount: 4 - correctCount - pinyinCount - partialCount - presentCount,
    },
    emojiString: chars.map((c) => c.emoji).join(''),
  }
}

// ============================================================
//  游戏会话
// ============================================================
function createGame(answer, maxAttempts = 6) {
  return {
    answer,
    maxAttempts,
    attempts: [],
    status: 'playing',
    startTime: new Date().toISOString(),
  }
}

function submitGuess(game, chars, pinyin = []) {
  if (game.status !== 'playing') throw new Error(`游戏已结束: ${game.status}`)
  if (game.attempts.length >= game.maxAttempts) throw new Error(`已达最大尝试次数`)

  const result = scoreGuess(chars, pinyin, game.answer)
  game.attempts.push({ chars, pinyin, result, attemptNumber: game.attempts.length + 1 })

  if (result.summary.isWin) game.status = 'won'
  else if (game.attempts.length >= game.maxAttempts) game.status = 'lost'

  return { result, game }
}

// ============================================================
//  称赞文案
// ============================================================
const PRAISE_MESSAGES = {
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

function getPraiseMessage(attempts, won, streakDays = 0, answerText = '') {
  if (won && streakDays >= 3) {
    const keys = Object.keys(PRAISE_MESSAGES.streak).map(Number).sort((a, b) => b - a)
    for (const t of keys) { if (streakDays >= t) return PRAISE_MESSAGES.streak[t] }
  }
  if (won) {
    const msgs = PRAISE_MESSAGES.attempts[attempts] || PRAISE_MESSAGES.attempts[6]
    return msgs[Math.floor(Math.random() * msgs.length)]
  }
  return PRAISE_MESSAGES.failed[Math.floor(Math.random() * PRAISE_MESSAGES.failed.length)]
    .replace('{answer}', answerText)
}

function generateShareContent(game) {
  const lines = game.attempts.map((a) => a.result.emojiString)
  const won = game.status === 'won'
  const n = game.attempts.length
  return {
    text: `${won ? `🏮 成语猜猜猜 · ${n}/6` : '🏮 成语猜猜猜 · X/6'}\n\n${lines.join('\n')}\n\n${getPraiseMessage(n, won, 0, game.answer.text)}`,
    emojiGrid: lines,
    praise: getPraiseMessage(n, won, 0, game.answer.text),
    attempts: n,
    won,
  }
}

// ============================================================
//  部首 / 笔画 提示
// ============================================================
function getRadicalHint(answer, index = -1) {
  if (index >= 0) return { radical: answer.radicals[index], strokes: answer.strokes[index], structure: answer.structures[index] }
  return { radicals: [...answer.radicals], strokes: [...answer.strokes], structures: [...answer.structures] }
}

function compareStrokes(guess, answer) {
  if (guess === answer) return 'equal'
  return guess > answer ? 'higher' : 'lower'
}

// ============================================================
//  导出
// ============================================================
module.exports = {
  scoreGuess, submitGuess, createGame,
  parsePinyin, checkPinyin,
  getRadicalHint, compareStrokes,
  getPraiseMessage, getPraise: getPraiseMessage, generateShareContent, PRAISE_MESSAGES,
}
