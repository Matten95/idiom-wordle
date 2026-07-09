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

const WEAK_RADICALS = new Set(['一', '丨', '丶', '丿', '乙', '亅', '亠', '冂', '冖', '凵', '彡'])

/** 用日期种子确定性地选 3 个部首提示位
 *  优先选有明确位置且信息量高的部首，避免固定暴露首字和重复部首。
 */
function getHintPositions(dateStr, radicalPositions, radicals) {
  const date = dateStr || getToday()
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
  pool.forEach(item => {
    if (result.length >= 3) return
    if (item.radical && usedRadicals.has(item.radical)) return
    result.push(item.index)
    if (item.radical) usedRadicals.add(item.radical)
  })
  pool.forEach(item => {
    if (result.length >= 3) return
    if (!result.includes(item.index)) result.push(item.index)
  })

  while (result.length < 3) {
    const fallback = [0, 1, 2, 3].find(index => !result.includes(index))
    if (fallback === undefined) break
    result.push(fallback)
  }
  return result
}

function getRandomIdiom(level) {
  const pool = level
    ? IDIOMS_DATA.idioms.filter(i => i.level === level)
    : getDefaultPool()
  const idx = Math.floor(Math.random() * pool.length)
  return JSON.parse(JSON.stringify(pool[idx]))
}

module.exports = { getDailyIdiom, getRandomIdiom, getToday, getYesterday, hashDate, getHintPositions, getDailySequence, calculatePuzzleNumber }
