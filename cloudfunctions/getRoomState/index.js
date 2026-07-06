// 云函数：获取房间状态（轮询降级方案）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { roomCode } = event

  if (!roomCode) return { ok: false, error: '缺少房间码' }

  try {
    // 读取房间
    const roomRes = await db.collection('idiom_rooms').where({ roomCode }).get()
    if (roomRes.data.length === 0) return { ok: false, error: '房间不存在' }

    const room = roomRes.data[0]

    // 读取当前轮次的提示词
    const hintsRes = await db.collection('idiom_hints_live')
      .where({
        roomCode,
        round: room.gameState.currentRound
      })
      .orderBy('submittedAt', 'asc')
      .get()

    const hints = hintsRes.data.map(doc => ({
      word: doc.hintWord,
      submittedAt: doc.submittedAt
    }))

    const me = (room.players || []).find(p => p.openid === wxContext.OPENID) || null
    const opponent = me
      ? (room.players || []).find(p => p.openid !== wxContext.OPENID) || null
      : null

    return { ok: true, room, hints, openid: wxContext.OPENID, me, opponent }
  } catch (e) {
    console.error('getRoomState error:', e)
    return { ok: false, error: e.message }
  }
}
