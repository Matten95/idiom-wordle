// 云函数：提交提示词（含服务端验证）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

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
    const res = await db.collection('idiom_rooms').where({ roomCode }).get()
    if (res.data.length === 0) return { ok: false, error: '房间不存在' }

    const room = res.data[0]
    if (room.status !== 'playing') return { ok: false, error: '游戏未在进行中' }

    // 验证角色：只有提示者可以提交
    const player = room.players.find(p => p.openid === openid)
    if (!player) return { ok: false, error: '你不在这个房间' }
    if (player.role !== 'hinter') return { ok: false, error: '只有提示者可以提交提示词' }

    // 验证提示词
    const validation = validateHint(hintWord, room.gameState.currentIdiom)
    if (!validation.ok) return validation

    // 检查是否重复
    const dupCheck = room.gameState.currentHints.filter(h => h.word === hintWord)
    if (dupCheck.length > 0) return { ok: false, reason: '提示词已存在' }

    // 检查是否超过5个
    if (room.gameState.currentHints.length >= 5) {
      return { ok: false, reason: '本轮提示词已达上限' }
    }

    const submittedAt = new Date()

    // 写入 hints 集合（用于实时推送）
    await db.collection('idiom_hints_live').add({
      data: {
        roomCode,
        round: room.gameState.currentRound,
        hintWord,
        submittedAt
      }
    })

    // 更新房间中的 currentHints
    await db.collection('idiom_rooms').doc(room._id).update({
      data: {
        'gameState.currentHints': _.push({ word: hintWord, submittedAt })
      }
    })

    return { ok: true, hintIndex: room.gameState.currentHints.length + 1 }
  } catch (e) {
    console.error('submitHint error:', e)
    return { ok: false, error: e.message }
  }
}
