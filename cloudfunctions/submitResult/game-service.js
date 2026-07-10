const crypto = require('crypto')
const idiomsData = require('./idioms.json')

const DEFAULT_MAX_LEVEL = 2
const MAX_ATTEMPTS = 6
const EPOCH = '2026-01-01'
const PUZZLE_VERSION = 'secure-daily-v1'

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

const WEAK_RADICALS = new Set(['一', '丨', '丶', '丿', '乙', '亅', '亠', '冂', '冖', '凵', '彡', '十', '乚', '乛'])
const RADICAL_POSITION_WEIGHTS = [1.24, 1.14, 0.92, 0.84]
const RADICAL_HINT_TARGET = 5.5
const RADICAL_HINT_SUBSETS = [
  [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3],
  [0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3],
]
const RADICAL_HINT_OVERRIDES = {
  '三心二意': [0, 3],
  '九牛一毛': [0, 3],
  '龙飞凤舞': [1, 2],
  '鸡犬升天': [0, 3],
  '魑魅魍魉': [0, 2],
  '举案齐眉': [0, 1, 3],
  '鸿鹄之志': [0, 3],
  '葭莩之亲': [0, 2, 3],
  '樗栎庸材': [0, 2, 3],
  '才高八斗': [0, 3],
  '乐不思蜀': [1, 2, 3],
  '手不释卷': [1, 2],
  '一目十行': [0, 2],
  '螳螂捕蝉': [0, 2],
}

const DEFAULT_POOL = idiomsData.idioms.filter(item => item.level <= DEFAULT_MAX_LEVEL)
const RADICAL_FREQUENCIES = idiomsData.idioms.reduce((result, idiom) => {
  ;(idiom.radicals || []).forEach(radical => {
    if (radical) result[radical] = (result[radical] || 0) + 1
  })
  return result
}, {})
const CHAR_PINYIN = idiomsData.idioms.reduce((result, idiom) => {
  ;(idiom.chars || []).forEach((char, index) => {
    if (char && !result[char]) result[char] = idiom.pinyin[index] || ''
  })
  return result
}, {})

function getToday() {
  const local = new Date(Date.now() + 8 * 60 * 60000)
  const y = local.getUTCFullYear()
  const m = String(local.getUTCMonth() + 1).padStart(2, '0')
  const d = String(local.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function calculatePuzzleNumber(date) {
  const current = new Date(date + 'T00:00:00+08:00')
  const epoch = new Date(EPOCH + 'T00:00:00+08:00')
  return Math.floor((current - epoch) / 86400000) + 1
}

function getConfiguredSecret() {
  const secret = String(process.env.DAILY_GAME_SECRET || '')
  if (secret.length < 32) {
    const error = new Error('每日谜题密钥未配置或长度不足')
    error.code = 'DAILY_GAME_SECRET_MISSING'
    throw error
  }
  return secret
}

function createSecretRandom(secret, scope) {
  let value = crypto.createHmac('sha256', secret).update(scope).digest().readUInt32BE(0) || 1
  return function () {
    value = (value * 1664525 + 1013904223) % 4294967296
    return value / 4294967296
  }
}

function getSecureDailySequence(secret) {
  const result = DEFAULT_POOL.slice()
  const random = createSecretRandom(secret, `${PUZZLE_VERSION}:${result.length}`)
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const current = result[i]
    result[i] = result[j]
    result[j] = current
  }
  return result
}

function getSecureDailyAnswer(date, secret) {
  const puzzleNumber = calculatePuzzleNumber(date)
  const sequence = getSecureDailySequence(secret)
  return sequence[(puzzleNumber - 1) % sequence.length]
}

function getAnswerById(id) {
  return idiomsData.idioms.find(item => item.id === id) || null
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function buildSessionId(openid, date) {
  return hashText(`${openid}:${date}:${PUZZLE_VERSION}`).slice(0, 32)
}

function getRadicalHintInfo(radical, position, char) {
  const direct = Boolean(radical && char && radical === char)
  const weak = Boolean(radical && WEAK_RADICALS.has(radical) && !direct)
  const frequency = RADICAL_FREQUENCIES[radical] || 1
  let score = 0
  if (direct) score = 4
  else if (weak) score = position === 'center' ? 0.25 : 0.8
  else if (frequency >= 20) score = 1.2
  else if (frequency >= 12) score = 1.6
  else if (frequency >= 7) score = 2
  else if (frequency >= 4) score = 2.35
  else if (frequency >= 2) score = 2.7
  else score = 3
  if (!direct && !weak && position === 'center') score *= 0.72
  return { score, direct, weak }
}

function getHintPositions(date, idiom) {
  if (RADICAL_HINT_OVERRIDES[idiom.text]) return RADICAL_HINT_OVERRIDES[idiom.text].slice()
  const positions = idiom.radicalPositions || []
  const radicals = idiom.radicals || []
  const chars = idiom.chars || []
  let best = null

  RADICAL_HINT_SUBSETS.forEach(indices => {
    if (!indices.some(index => index < 2) || !indices.some(index => index >= 2)) return
    if (!indices.every(index => radicals[index])) return
    const infos = indices.map(index => getRadicalHintInfo(radicals[index], positions[index] || 'center', chars[index]))
    const total = indices.reduce((sum, index, offset) => sum + infos[offset].score * RADICAL_POSITION_WEIGHTS[index], 0)
    const directCount = infos.filter(info => info.direct).length
    const duplicateCount = indices.length - new Set(indices.map(index => radicals[index])).size
    let cost = Math.abs(total - RADICAL_HINT_TARGET)
    cost += Math.max(0, directCount - 1) * 2.8
    cost += duplicateCount * 1.6
    cost += indices.length === 3 ? 0.3 : 0
    infos.forEach((info, offset) => {
      if (!info.weak) return
      cost += (positions[indices[offset]] || 'center') === 'center' ? 2.3 : 1
    })
    if (indices.includes(0)) cost -= 0.4
    if (indices.includes(1)) cost -= 0.12
    if (indices[0] === 1 && !indices.includes(0)) cost += 0.15
    const tieSeed = parseInt(hashText(`${date}:${idiom.text}:${indices.join('')}`).slice(0, 8), 16)
    if (!best || cost < best.cost || (cost === best.cost && tieSeed < best.tieSeed)) {
      best = { indices, cost, tieSeed }
    }
  })
  return best ? best.indices.slice() : [0, 2]
}

function buildPublicPuzzle(date, answer) {
  const picked = getHintPositions(date, answer)
  const hintRadicals = ['?', '?', '?', '?']
  const hintPositions = ['', '', '', '']
  picked.forEach(index => {
    hintRadicals[index] = answer.radicals[index]
    hintPositions[index] = (answer.radicalPositions || [])[index] || 'center'
  })
  return {
    date,
    puzzleNumber: calculatePuzzleNumber(date),
    maxAttempts: MAX_ATTEMPTS,
    hintRadicals,
    hintPositions,
    puzzleVersion: PUZZLE_VERSION,
  }
}

function parsePinyin(py) {
  if (!py) return { shengmu: '', yunmu: '', tone: 0 }
  let tone = 0
  let base = ''
  for (const char of py) {
    if (TONE_MAP[char]) {
      const mapped = TONE_MAP[char]
      base += mapped[0] === 'v' ? 'ü' : mapped[0]
      tone = Number(mapped[1])
    } else {
      base += char
    }
  }
  if (tone === 0) tone = 5
  let shengmu = ''
  let yunmu = base
  for (const item of SHENGMU) {
    if (!base.startsWith(item)) continue
    shengmu = item
    yunmu = base.slice(item.length)
    break
  }
  return { shengmu, yunmu, tone }
}

function checkPinyin(guess, answer) {
  if (guess === answer) return 'exact'
  const g = parsePinyin(guess)
  const a = parsePinyin(answer)
  if (g.shengmu === a.shengmu) return 'partial'
  if (g.yunmu === a.yunmu && g.tone === a.tone) return 'partial'
  return 'none'
}

function lookupPinyin(chars) {
  const text = chars.join('')
  const idiom = idiomsData.idioms.find(item => item.text === text)
  if (idiom) return idiom.pinyin.slice()
  return chars.map(char => CHAR_PINYIN[char] || '')
}

function scoreGuess(guessText, answer) {
  const guessChars = Array.from(guessText)
  const guessPinyin = lookupPinyin(guessChars)
  const answerChars = answer.chars.slice()
  const answerPinyin = answer.pinyin.slice()
  const used = [false, false, false, false]
  const chars = new Array(4)

  for (let i = 0; i < 4; i++) {
    if (guessChars[i] !== answerChars[i]) continue
    chars[i] = { char: guessChars[i], status: 'correct', label: '正确', emoji: '🟩', color: 'correct', pinyin: answerPinyin[i] }
    used[i] = true
  }
  for (let i = 0; i < 4; i++) {
    if (chars[i] || !guessPinyin[i]) continue
    const level = checkPinyin(guessPinyin[i], answerPinyin[i])
    if (level === 'exact') {
      chars[i] = { char: guessChars[i], status: 'pinyin', label: '同音', emoji: '🟦', color: 'pinyin', pinyin: guessPinyin[i], answerPinyin: answerPinyin[i] }
    } else if (level === 'partial') {
      chars[i] = { char: guessChars[i], status: 'partial', label: '近音', emoji: '🟪', color: 'partial', pinyin: guessPinyin[i], answerPinyin: answerPinyin[i] }
    }
  }
  for (let i = 0; i < 4; i++) {
    if (chars[i]) continue
    const position = answerChars.findIndex((char, index) => char === guessChars[i] && !used[index])
    if (position < 0) continue
    chars[i] = { char: guessChars[i], status: 'present', label: '错位', emoji: '🟨', color: 'present', pinyin: guessPinyin[i] || null, correctPosition: position + 1 }
    used[position] = true
  }
  for (let i = 0; i < 4; i++) {
    if (chars[i]) continue
    chars[i] = { char: guessChars[i], status: 'absent', label: '不在', emoji: '⬛', color: 'absent', pinyin: guessPinyin[i] || null }
  }

  const correctCount = chars.filter(item => item.status === 'correct').length
  return {
    chars,
    summary: {
      isWin: correctCount === 4,
      correctCount,
      pinyinCount: chars.filter(item => item.status === 'pinyin').length,
      partialCount: chars.filter(item => item.status === 'partial').length,
      presentCount: chars.filter(item => item.status === 'present').length,
    },
    emojiString: chars.map(item => item.emoji).join(''),
  }
}

function validateGuessText(value) {
  const text = String(value || '').trim()
  if (!/^[一-鿿]{4}$/.test(text)) return { ok: false, error: '请输入四个汉字' }
  return { ok: true, text }
}

function sanitizePlayerName(value) {
  const name = String(value || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 12)
  return name || '匿名玩家'
}

function buildAnswerReveal(answer) {
  return {
    text: answer.text,
    pinyin: answer.pinyin.slice(),
    meaning: answer.meaning || '',
    source: answer.source || '',
  }
}

function buildSafeGame(session, answer) {
  const game = {
    ...buildPublicPuzzle(session.date, answer),
    status: session.status,
    attempts: session.attempts || [],
    verified: true,
  }
  if (session.status !== 'playing') game.answer = buildAnswerReveal(answer)
  return game
}

function buildVerifiedResult(session, playerName, avatar) {
  return {
    date: session.date,
    attempts: session.attempts.length,
    won: session.status === 'won',
    emojiGrid: session.attempts.map(attempt => attempt.result.emojiString),
    playerName: sanitizePlayerName(playerName),
    avatar: typeof avatar === 'string' && avatar.length <= 500 ? avatar : '',
    verified: true,
    puzzleVersion: PUZZLE_VERSION,
    updatedAt: new Date(),
  }
}

module.exports = {
  MAX_ATTEMPTS,
  PUZZLE_VERSION,
  getToday,
  getConfiguredSecret,
  getSecureDailyAnswer,
  getAnswerById,
  buildSessionId,
  buildPublicPuzzle,
  buildSafeGame,
  buildVerifiedResult,
  scoreGuess,
  validateGuessText,
  sanitizePlayerName,
}
