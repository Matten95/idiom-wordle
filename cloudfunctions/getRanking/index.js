// 云函数：获取排行榜
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { date, limit = 50, onlyStats = false } = event

  try {
    // 查询条件
    const where = {}
    if (date) where.date = date

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
      answerText: item.answerText || '???',
      attempts: item.attempts,
      won: item.won,
      date: item.date,
    }))

    return {
      ok: true,
      rankList,
      stats,
      total: result.data.length,
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
