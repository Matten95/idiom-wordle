/**
 * 每日谜题选择器 — 所有人同一天猜同一个词（类似 Wordle）
 */
const IDIOMS_DATA = require('../data/idioms')
const DEFAULT_MAX_LEVEL = 2

function hashDate(dateStr) {
  let hash = 0
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash) + dateStr.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash)
}

function getToday() {
  const d = new Date()
  const local = new Date(d.getTime() + 8 * 60 * 60000)
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`
}

function getYesterday(dateStr) {
  const base = dateStr ? new Date(dateStr + 'T00:00:00+08:00') : new Date()
  const d = new Date(base.getTime() - 86400000)
  const local = new Date(d.getTime() + 8 * 60 * 60000)
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`
}

const EPOCH = '2026-01-01'
const DAILY_SHUFFLE_SEED = 'idiom-daily-v2'

function getDailyIdiom(dateStr) {
  const date = dateStr || getToday()
  // 所有人同一天同一道题，默认只从大众难度题池中选
  const pool = getDefaultPool()
  const puzzleNumber = calculatePuzzleNumber(date)
  const sequence = getDailySequence(pool)
  const idiom = JSON.parse(JSON.stringify(sequence[(puzzleNumber - 1) % sequence.length]))

  return { ...idiom, date, puzzleNumber }
}

function calculatePuzzleNumber(date) {
  const d = new Date(date + 'T00:00:00+08:00')
  const epoch = new Date(EPOCH + 'T00:00:00+08:00')
  return Math.floor((d - epoch) / 86400000) + 1
}

function seededRandom(seed) {
  let value = hashDate(seed) || 1
  return function () {
    value = (value * 1664525 + 1013904223) % 4294967296
    return value / 4294967296
  }
}

function getDailySequence(pool) {
  const result = pool.slice()
  const random = seededRandom(DAILY_SHUFFLE_SEED + ':' + pool.length)
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const temp = result[i]
    result[i] = result[j]
    result[j] = temp
  }
  return result
}

function getDefaultPool() {
  return IDIOMS_DATA.idioms.filter(item => item.level <= DEFAULT_MAX_LEVEL)
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

const RADICAL_FREQUENCIES = IDIOMS_DATA.idioms.reduce((result, idiom) => {
  ;(idiom.radicals || []).forEach(radical => {
    if (radical) result[radical] = (result[radical] || 0) + 1
  })
  return result
}, {})

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
  return { score, direct, weak, frequency }
}

/**
 * 每个成语固定选 2-3 个均衡部首位：
 * - 至少一枚来自前两个字、一枚来自后两个字；
 * - 前两字权重略高，但惩罚弱部件、重复部首和多枚高泄题部首；
 * - 低信息题补到 3 枚，高信息题保持 2 枚。
 */
function getHintPositions(dateStr, radicalPositions, radicals, chars) {
  const positions = radicalPositions || []
  const values = radicals || []
  const answerChars = chars || []
  const idiomText = answerChars.join('')
  if (RADICAL_HINT_OVERRIDES[idiomText]) return RADICAL_HINT_OVERRIDES[idiomText].slice()

  let best = null
  RADICAL_HINT_SUBSETS.forEach(indices => {
    if (!indices.some(index => index < 2) || !indices.some(index => index >= 2)) return
    if (!indices.every(index => values[index])) return

    const infos = indices.map(index => getRadicalHintInfo(values[index], positions[index] || 'center', answerChars[index]))
    const total = indices.reduce((sum, index, offset) => {
      return sum + infos[offset].score * RADICAL_POSITION_WEIGHTS[index]
    }, 0)
    const directCount = infos.filter(info => info.direct).length
    const duplicateCount = indices.length - new Set(indices.map(index => values[index])).size
    let cost = Math.abs(total - RADICAL_HINT_TARGET)
    cost += Math.max(0, directCount - 1) * 2.8
    cost += duplicateCount * 1.6
    cost += indices.length === 3 ? 0.3 : 0
    infos.forEach((info, offset) => {
      if (!info.weak) return
      const index = indices[offset]
      cost += (positions[index] || 'center') === 'center' ? 2.3 : 1
    })
    if (indices.includes(0)) cost -= 0.4
    if (indices.includes(1)) cost -= 0.12
    if (indices[0] === 1 && !indices.includes(0)) cost += 0.15

    const tieSeed = hashDate((idiomText || dateStr || getToday()) + ':' + indices.join(''))
    if (!best || cost < best.cost || (cost === best.cost && tieSeed < best.tieSeed)) {
      best = { indices, cost, tieSeed }
    }
  })

  return best ? best.indices.slice() : [0, 2]
}

function getRandomIdiom(level) {
  const pool = level
    ? IDIOMS_DATA.idioms.filter(i => i.level === level)
    : getDefaultPool()
  const idx = Math.floor(Math.random() * pool.length)
  return JSON.parse(JSON.stringify(pool[idx]))
}

module.exports = {
  getDailyIdiom,
  getRandomIdiom,
  getToday,
  getYesterday,
  hashDate,
  getHintPositions,
  getRadicalHintInfo,
  getDailySequence,
  calculatePuzzleNumber,
}
