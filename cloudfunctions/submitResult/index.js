// 云函数：提交游戏结果到排行榜
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const idiomsData = require('./idioms.json')

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
  const local = new Date(d.getTime() + 8 * 60 * 60000)
  const y = local.getUTCFullYear()
  const m = String(local.getUTCMonth() + 1).padStart(2, '0')
  const day = String(local.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDailyAnswer(date) {
  const pool = idiomsData.idioms.filter(item => item.level <= DEFAULT_MAX_LEVEL)
  const puzzleNumber = calculatePuzzleNumber(date)
  const sequence = getDailySequence(pool)
  return sequence[(puzzleNumber - 1) % sequence.length]
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

function normalizeAttempts(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return NaN
}

function validateResult(date, answerText, attempts, won) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '日期格式不正确'
  if (date > getToday()) return '不能提交未来日期'
  const count = normalizeAttempts(attempts)
  if (!Number.isFinite(count) || count < 1 || count > 6) return '尝试次数不合法'
  if (typeof won !== 'boolean') return '胜负状态不合法'
  const answer = getDailyAnswer(date)
  if (!answer || answer.text !== answerText) return '答案与每日题不匹配'
  return ''
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { date, answerText, attempts, won, playerName, avatar } = event

  if (!date || !answerText || attempts === undefined) {
    return { ok: false, error: '缺少必要参数' }
  }
  const validationError = validateResult(date, answerText, attempts, won)
  if (validationError) return { ok: false, error: validationError }
  const attemptCount = normalizeAttempts(attempts)

  try {
    // 查询当天是否已有记录
    const exist = await db.collection('game_results')
      .where({ openid, date })
      .get()

    const record = {
      openid,
      date,
      answerText,
      attempts: attemptCount,
      won,
      playerName: playerName || '匿名玩家',
      avatar: avatar || '',
      updatedAt: new Date(),
    }

    if (exist.data.length > 0) {
      // 更新已有记录（保留最好成绩）
      const old = exist.data[0]
      if (old.won && !won) {
        return { ok: true, kept: 'old', msg: '保留之前的最好成绩' }
      }
      if (old.won && won && old.attempts <= attemptCount) {
        return { ok: true, kept: 'old', msg: '保留之前的最好成绩' }
      }
      await db.collection('game_results').doc(old._id).update({ data: record })
      return { ok: true, updated: true }
    } else {
      await db.collection('game_results').add({ data: record })
      return { ok: true, created: true }
    }
  } catch (e) {
    console.error('submitResult error:', e)
    return { ok: false, error: e.message }
  }
}
