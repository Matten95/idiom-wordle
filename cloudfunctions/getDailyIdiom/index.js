// 云函数：获取今日谜题
// 所有用户同一天拿到同一道题
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 内联词库（120条，从 idioms.json 精简）
const IDIOMS = require('./idioms.json')
const DEFAULT_MAX_LEVEL = 2
const EPOCH = '2026-01-01'
const DAILY_SHUFFLE_SEED = 'idiom-daily-v2'

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
  const offset = 8 * 60 // UTC+8
  const local = new Date(d.getTime() + offset * 60000)
  const y = local.getUTCFullYear()
  const m = String(local.getUTCMonth() + 1).padStart(2, '0')
  const day = String(local.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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

exports.main = async (event, context) => {
  const date = event.date || getToday()
  const pool = IDIOMS.idioms.filter(item => item.level <= DEFAULT_MAX_LEVEL)
  const puzzleNumber = calculatePuzzleNumber(date)
  const sequence = getDailySequence(pool)
  const idiom = JSON.parse(JSON.stringify(sequence[(puzzleNumber - 1) % sequence.length]))

  return {
    date,
    puzzleNumber,
    idiom,
    hintRadicals: idiom.radicals,
    hintPositions: idiom.radicalPositions || [],
  }
}
