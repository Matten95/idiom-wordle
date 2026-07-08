// 云函数：提交提示词（含服务端验证）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
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

/** 判断字符是否为中文 */
function isChineseChar(c) {
  return /^[一-鿿]$/.test(c)
}

/** 验证提示词：不能含答案中的任何字 */
function validateHint(hintWord, idiomText) {
  if (!hintWord || hintWord.length !== 2) return { ok: false, reason: '提示词必须为2个汉字' }
  if (!isChineseChar(hintWord[0]) || !isChineseChar(hintWord[1])) {
    return { ok: false, reason: '提示词必须为汉字' }
  }
  const chars = hintWord.split('')
  const idiomChars = idiomText.split('')
  for (let i = 0; i < chars.length; i++) {
    if (idiomChars.includes(chars[i])) {
      return { ok: false, reason: '提示词不能包含答案中的字「' + chars[i] + '」' }
    }
  }
  return { ok: true }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { roomCode, hintWord } = event

  if (!roomCode || !hintWord) return { ok: false, error: '缺少参数' }

  try {
    // 找房间
    const res = await db.collection('idiom_rooms')
      .where({ roomCode })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()
    if (res.data.length === 0) return { ok: false, error: '房间不存在' }

    const room = res.data[0]
    if (isRoomExpired(room)) return { ok: false, error: '这桌好友局已经收桌，重新开一桌吧' }
    if (room.status !== 'playing') return { ok: false, error: '游戏未在进行中' }

    // 验证角色：只有提示者可以提交
    const player = room.players.find(p => p.openid === openid)
    if (!player) return { ok: false, error: '你不在这个房间' }
    if (player.role !== 'hinter') return { ok: false, error: '只有提示者可以提交提示词' }

    // 验证提示词
    const validation = validateHint(hintWord, room.gameState.currentIdiom)
    if (!validation.ok) return validation

    const currentHints = room.gameState.currentHints || []
    const hintWords = room.gameState.hintWords || currentHints.map(h => h.word)

    // 检查是否重复
    const dupCheck = currentHints.filter(h => h.word === hintWord)
    if (dupCheck.length > 0) return { ok: false, reason: '提示词已存在' }
    if (hintWords.includes(hintWord)) return { ok: false, reason: '提示词已存在' }
    const liveDup = await db.collection('idiom_hints_live')
      .where({ roomCode, round: room.gameState.currentRound, hintWord })
      .count()
    if (liveDup.total > 0) return { ok: false, reason: '提示词已存在' }

    // 检查是否超过5个
    const hintCount = typeof room.gameState.hintCount === 'number' ? room.gameState.hintCount : currentHints.length
    if (hintCount >= 5) {
      return { ok: false, reason: '本轮提示词已达上限' }
    }

    const submittedAt = new Date()

    // 更新房间中的 currentHints，先用原子条件锁住轮次、上限和重复词
    const updateRes = await db.collection('idiom_rooms')
      .where({
        _id: room._id,
        status: 'playing',
        'gameState.currentRound': room.gameState.currentRound,
        'gameState.hintCount': _.lt(5),
        'gameState.hintWords': _.nin([hintWord])
      })
      .update({
      data: {
        'gameState.currentHints': _.push({ word: hintWord, submittedAt }),
        'gameState.hintCount': _.inc(1),
        'gameState.hintWords': _.push(hintWord),
        lastActiveAt: submittedAt
      }
    })
    if (!updateRes.stats || updateRes.stats.updated === 0) {
      return { ok: false, reason: '提示词已存在或本轮提示词已达上限' }
    }

    // 写入 hints 集合（用于实时推送）
    try {
      await db.collection('idiom_hints_live').add({
        data: {
          roomCode,
          round: room.gameState.currentRound,
          hintWord,
          submittedAt
        }
      })
    } catch (e) {
      console.warn('live hint add failed:', e)
    }

    return { ok: true, hintIndex: hintCount + 1 }
  } catch (e) {
    console.error('submitHint error:', e)
    return { ok: false, error: e.message }
  }
}
