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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EPOCH = '2026-01-01'

function getDailyIdiom(dateStr) {
  const date = dateStr || getToday()
  // 所有人同一天同一道题，默认只从大众难度题池中选
  const pool = getDefaultPool()
  const index = hashDate(date) % pool.length
  const idiom = JSON.parse(JSON.stringify(pool[index]))

  const d = new Date(date + 'T00:00:00+08:00')
  const epoch = new Date(EPOCH + 'T00:00:00+08:00')
  const puzzleNumber = Math.floor((d - epoch) / 86400000) + 1

  return { ...idiom, date, puzzleNumber }
}

function getDefaultPool() {
  return IDIOMS_DATA.idioms.filter(item => item.level <= DEFAULT_MAX_LEVEL)
}

/** 用日期种子确定性地选 2 个部首提示位
 *  优先选有明确位置（left/right/top/bottom）的字
 */
function getHintPositions(dateStr, radicalPositions) {
  const date = dateStr || getToday()
  const seed = hashDate(date + '_hint')

  // 位置 0 固定（仅当它有明确位置时才提示）
  const result = []
  if (radicalPositions && radicalPositions[0] && radicalPositions[0] !== 'center') {
    result.push(0)
  }

  // 从位置 1-3 中，优先选有明确位置的
  const candidates = []
  for (let i = 1; i <= 3; i++) {
    const pos = radicalPositions ? radicalPositions[i] : 'center'
    if (pos && pos !== 'center') {
      candidates.push(i)  // 优先
    }
  }
  // 如果连候选都没有，退而求其次用 center 位置的
  if (candidates.length === 0) {
    for (let i = 1; i <= 3; i++) candidates.push(i)
  }

  const pick = candidates[seed % candidates.length]
  if (!result.includes(pick)) result.push(pick)
  if (result.length < 2) {
    const fallbackCandidates = [0, 1, 2, 3].filter(index => !result.includes(index))
    const fallback = fallbackCandidates[(seed + 1) % fallbackCandidates.length]
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

module.exports = { getDailyIdiom, getRandomIdiom, getToday, hashDate, getHintPositions }
