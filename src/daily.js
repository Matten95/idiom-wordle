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
  const index = hashDate(date) % pool.length
  const idiom = JSON.parse(JSON.stringify(pool[index]))

  return {
    ...idiom,
    date,
    puzzleNumber: calculatePuzzleNumber(date),
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

/** 部首提示位选择 */
function getHintPositions(dateStr, radicalPositions) {
  const date = dateStr || getTodayString()
  const seed = hashDate(date + '_hint')
  const result = []
  if (radicalPositions && radicalPositions[0] && radicalPositions[0] !== 'center') {
    result.push(0)
  }
  const candidates = []
  for (let i = 1; i <= 3; i++) {
    const pos = radicalPositions ? radicalPositions[i] : 'center'
    if (pos && pos !== 'center') candidates.push(i)
  }
  if (candidates.length === 0) {
    for (let i = 1; i <= 3; i++) candidates.push(i)
  }
  const pick = candidates[seed % candidates.length]
  if (!result.includes(pick)) result.push(pick)
  if (result.length < 2) {
    const fallbackCandidates = [0, 1, 2, 3].filter((index) => !result.includes(index))
    const fallback = fallbackCandidates[(seed + 1) % fallbackCandidates.length]
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
}
