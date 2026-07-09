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

const WEAK_RADICALS = new Set(['一', '丨', '丶', '丿', '乙', '亅', '亠', '冂', '冖', '凵', '彡'])

/** 部首提示位选择：优先明确结构位和高信息部首，避免固定暴露首字与重复部首 */
function getHintPositions(dateStr, radicalPositions, radicals) {
  const date = dateStr || getTodayString()
  const seed = hashDate(date + '_hint')
  const start = seed % 4
  const candidates = []
  for (let i = 0; i <= 3; i++) {
    const pos = radicalPositions ? radicalPositions[i] : 'center'
    const radical = radicals ? radicals[i] : ''
    const positionScore = pos && pos !== 'center' ? 2 : 0
    const radicalScore = radical ? (WEAK_RADICALS.has(radical) ? 0 : 3) : 1
    const seededRank = (i - start + 4) % 4
    candidates.push({ index: i, radical, score: positionScore + radicalScore, seededRank })
  }
  const pool = candidates.sort((a, b) => (b.score - a.score) || (a.seededRank - b.seededRank))
  const result = []
  const usedRadicals = new Set()
  pool.forEach((item) => {
    if (result.length >= 3) return
    if (item.radical && usedRadicals.has(item.radical)) return
    result.push(item.index)
    if (item.radical) usedRadicals.add(item.radical)
  })
  pool.forEach((item) => {
    if (result.length >= 3) return
    if (!result.includes(item.index)) result.push(item.index)
  })
  while (result.length < 3) {
    const fallback = [0, 1, 2, 3].find((index) => !result.includes(index))
    if (fallback === undefined) break
    result.push(fallback)
  }
  return result
}

module.exports = {
  getDailyIdiom,
  getRandomIdiom,
  getBankStats,
  getTodayString,
  hashDate,
  getHintPositions,
  getDailySequence,
  calculatePuzzleNumber,
}
