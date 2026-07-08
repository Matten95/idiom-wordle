// 云函数：获取房间状态（轮询降级方案）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ROOM_TTL_MS = 2 * 60 * 60 * 1000

function getTime(value) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  if (typeof value === 'string') return new Date(value).getTime()
  return 0
}

function isRoomExpired(room) {
  if (!room || room.status === 'finished') return false
  const expiresAt = getTime(room.expiresAt)
  if (expiresAt) return expiresAt <= Date.now()
  const createdAt = getTime(room.createdAt)
  return createdAt > 0 && Date.now() - createdAt > ROOM_TTL_MS
}

function sanitizeRoomForPlayer(room, me) {
  const safeRoom = JSON.parse(JSON.stringify(room))
  if (!safeRoom.gameState) return safeRoom
  if (!me || me.role !== 'hinter') {
    safeRoom.gameState.currentIdiom = ''
  }
  return safeRoom
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { roomCode } = event

  if (!roomCode) return { ok: false, error: '缺少房间码' }

  try {
    // 读取房间
    const roomRes = await db.collection('idiom_rooms')
      .where({ roomCode })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()
    if (roomRes.data.length === 0) return { ok: false, error: '房间不存在' }

    const room = roomRes.data[0]
    if (isRoomExpired(room)) {
      try {
        await db.collection('idiom_rooms').doc(room._id).update({
          data: {
            status: 'finished',
            finishedReason: 'expired',
            lastActiveAt: new Date()
          }
        })
      } catch (e) { /* ignore */ }
      return { ok: false, error: '这桌好友局已经收桌，重新开一桌吧' }
    }

    // 读取当前轮次的提示词；实时集合失败时用房间内缓存兜底
    let liveHints = []
    try {
      const hintsRes = await db.collection('idiom_hints_live')
        .where({
          roomCode,
          round: room.gameState.currentRound
        })
        .orderBy('submittedAt', 'asc')
        .get()
      liveHints = hintsRes.data.map(doc => ({
        word: doc.hintWord,
        submittedAt: doc.submittedAt
      }))
    } catch (e) {
      console.warn('live hints read failed:', e)
    }
    const hintMap = {}
    ;(room.gameState.currentHints || []).forEach(hint => {
      if (hint && hint.word) hintMap[hint.word] = { word: hint.word, submittedAt: hint.submittedAt }
    })
    liveHints.forEach(hint => {
      if (hint && hint.word) hintMap[hint.word] = hint
    })
    const hints = Object.keys(hintMap)
      .map(word => hintMap[word])
      .sort((a, b) => (getTime(a.submittedAt) || 0) - (getTime(b.submittedAt) || 0))

    const me = (room.players || []).find(p => p.openid === wxContext.OPENID) || null
    const opponent = me
      ? (room.players || []).find(p => p.openid !== wxContext.OPENID) || null
      : null

    const safeRoom = sanitizeRoomForPlayer(room, me)
    const myView = {
      role: me ? me.role : '',
      canSeeAnswer: Boolean(me && me.role === 'hinter'),
      currentIdiom: me && me.role === 'hinter' ? room.gameState.currentIdiom : ''
    }

    return { ok: true, room: safeRoom, hints, openid: wxContext.OPENID, me, opponent, myView }
  } catch (e) {
    console.error('getRoomState error:', e)
    return { ok: false, error: e.message }
  }
}
