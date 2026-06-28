// 云函数：提交游戏结果到排行榜
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { date, answerText, attempts, won, playerName, avatar } = event

  if (!date || !answerText || attempts === undefined) {
    return { ok: false, error: '缺少必要参数' }
  }

  try {
    // 查询当天是否已有记录
    const exist = await db.collection('game_results')
      .where({ openid, date })
      .get()

    const record = {
      openid,
      date,
      answerText,
      attempts,
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
      if (old.won && won && old.attempts <= attempts) {
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
