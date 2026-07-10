/**
 * 每日谜题选择器
 *
 * 仿 Wordle 每日同一道题的机制：
 *   - 根据日期哈希确定性地选择成语
 *   - 全球玩家每天同一道题
 *   - 支持按难度星期轮换
 */

const idiomsData = require('../data/idioms.json')
const DEFAULT_MAX_LEVEL = 2
const DAILY_SHUFFLE_SEED = 'idiom-daily-v2'

/**
 * 简单但稳定的日期哈希函数
 * 同一天全球所有用户得到相同的索引
 */
function hashDate(dateString) {
  let hash = 0
  for (let i = 0; i < dateString.length; i++) {
    const char = dateString.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

/**
 * 获取今天的日期字符串 (YYYY-MM-DD)
 * 使用中国时区 (UTC+8)，因为成语是中文游戏
 */
function getTodayString() {
  const now = new Date()
  // 转成北京时间（UTC+8）
  const chinaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000))
  const y = chinaTime.getUTCFullYear()
  const m = String(chinaTime.getUTCMonth() + 1).padStart(2, '0')
  const d = String(chinaTime.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 获取指定日期的每日成语
 *
 * @param {string} [dateStr] - YYYY-MM-DD 格式日期，默认为今天
 * @param {number} [level]   - 限定难度级别，不传则自动轮换
 * @returns {object} 成语对象 + 元信息
 */
function getDailyIdiom(dateStr) {
  const date = dateStr || getTodayString()
  // 所有人同一天同一个词，默认只从大众难度题池中选取
  const pool = getDefaultPool()
  const puzzleNumber = calculatePuzzleNumber(date)
  const sequence = getDailySequence(pool)
  const idiom = JSON.parse(JSON.stringify(sequence[(puzzleNumber - 1) % sequence.length]))

  return {
    ...idiom,
    date,
    puzzleNumber,
  }
}

function getDefaultPool() {
  return idiomsData.idioms.filter((item) => item.level <= DEFAULT_MAX_LEVEL)
}

/**
 * 计算谜题编号（从起始日期算起）
 */
const EPOCH_DATE = '2026-01-01'
function calculatePuzzleNumber(date) {
  const d = new Date(date + 'T00:00:00+08:00')
  const epoch = new Date(EPOCH_DATE + 'T00:00:00+08:00')
  return Math.floor((d - epoch) / (1000 * 60 * 60 * 24)) + 1
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

/**
 * 获取成语词库统计信息
 */
function getBankStats() {
  const byLevel = {}
  idiomsData.levels.forEach ? null : null

  Object.entries(idiomsData.levels).forEach(([key, info]) => {
    const count = idiomsData.idioms.filter((i) => i.level === parseInt(key)).length
    byLevel[key] = { ...info, actualCount: count }
  })

  return {
    total: idiomsData.idioms.length,
    byLevel,
    version: idiomsData.version,
  }
}

/**
 * 获取指定难度级别的随机成语（用于练习模式）
 */
function getRandomIdiom(level) {
  const pool = level
    ? idiomsData.idioms.filter((i) => i.level === level)
    : getDefaultPool()
  const idx = Math.floor(Math.random() * pool.length)
  return JSON.parse(JSON.stringify(pool[idx]))
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

const RADICAL_FREQUENCIES = idiomsData.idioms.reduce((result, idiom) => {
  ;(idiom.radicals || []).forEach((radical) => {
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

/** 部首提示位选择：前两字权重更高，并控制总信息量在 2-3 枚之间 */
function getHintPositions(dateStr, radicalPositions, radicals, chars) {
  const positions = radicalPositions || []
  const values = radicals || []
  const answerChars = chars || []
  const idiomText = answerChars.join('')
  if (RADICAL_HINT_OVERRIDES[idiomText]) return RADICAL_HINT_OVERRIDES[idiomText].slice()

  let best = null
  RADICAL_HINT_SUBSETS.forEach((indices) => {
    if (!indices.some((index) => index < 2) || !indices.some((index) => index >= 2)) return
    if (!indices.every((index) => values[index])) return

    const infos = indices.map((index) => getRadicalHintInfo(values[index], positions[index] || 'center', answerChars[index]))
    const total = indices.reduce((sum, index, offset) => {
      return sum + infos[offset].score * RADICAL_POSITION_WEIGHTS[index]
    }, 0)
    const directCount = infos.filter((info) => info.direct).length
    const duplicateCount = indices.length - new Set(indices.map((index) => values[index])).size
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

    const tieSeed = hashDate((idiomText || dateStr || getTodayString()) + ':' + indices.join(''))
    if (!best || cost < best.cost || (cost === best.cost && tieSeed < best.tieSeed)) {
      best = { indices, cost, tieSeed }
    }
  })
  return best ? best.indices.slice() : [0, 2]
}

module.exports = {
  getDailyIdiom,
  getRandomIdiom,
  getBankStats,
  getTodayString,
  hashDate,
  getHintPositions,
  getRadicalHintInfo,
  getDailySequence,
  calculatePuzzleNumber,
}
