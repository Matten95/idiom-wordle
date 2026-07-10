// 云函数：获取排行榜
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { date, onlyStats = false } = event
  const requestedLimit = Number(event.limit)
  const limit = Number.isInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50

  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
      return { ok: false, error: '排行榜日期必填', rankList: [] }
    }
    // 只展示由服务端逐次判分产生的可信成绩。
    const where = { date, verified: true }

    const statsResult = await db.collection('game_results')
      .where(where)
      .limit(1000)
      .get()
    const stats = buildStats(statsResult.data)

    if (onlyStats) {
      return { ok: true, stats }
    }

    // 获取结果，排序：赢的排前面，猜次数越少越靠前
    const result = await db.collection('game_results')
      .where(where)
      .orderBy('won', 'desc')      // 赢的在前
      .orderBy('attempts', 'asc')  // 猜次数少的在前
      .orderBy('updatedAt', 'asc') // 先完成的在前
      .limit(limit)
      .get()

    // 计算排名
    const rankList = result.data.map((item, index) => ({
      rank: index + 1,
      player: item.playerName || '匿名玩家',
      avatar: item.avatar || '',
      attempts: item.attempts,
      won: item.won,
      date: item.date,
      emojiGrid: item.emojiGrid || [],
      verified: true,
    }))

    return {
      ok: true,
      rankList,
      stats,
      total: stats.total,
    }
  } catch (e) {
    console.error('getRanking error:', e)
    return { ok: false, error: e.message, rankList: [] }
  }
}

function buildStats(records) {
  const total = records.length
  const winCount = records.filter(item => item.won).length
  const attemptDist = [0, 0, 0, 0, 0, 0]
  records.forEach(item => {
    if (item.won && item.attempts >= 1 && item.attempts <= 6) {
      attemptDist[item.attempts - 1] += 1
    }
  })
  return {
    total,
    winCount,
    loseCount: total - winCount,
    winRate: total > 0 ? Math.round(winCount * 100 / total) : 0,
    attemptDist,
  }
}
