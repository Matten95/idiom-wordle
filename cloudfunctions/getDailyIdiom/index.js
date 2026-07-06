// 云函数：获取今日谜题
// 所有用户同一天拿到同一道题
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 内联词库（120条，从 idioms.json 精简）
const IDIOMS = require('./idioms.json')
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
  const offset = 8 * 60 // UTC+8
  const local = new Date(d.getTime() + offset * 60000)
  const y = local.getUTCFullYear()
  const m = String(local.getUTCMonth() + 1).padStart(2, '0')
  const day = String(local.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

exports.main = async (event, context) => {
  const date = event.date || getToday()
  const pool = IDIOMS.idioms.filter(item => item.level <= DEFAULT_MAX_LEVEL)
  const index = hashDate(date) % pool.length
  const idiom = JSON.parse(JSON.stringify(pool[index]))

  return {
    date,
    idiom,
    hintRadicals: idiom.radicals,
    hintPositions: idiom.radicalPositions || [],
  }
}
