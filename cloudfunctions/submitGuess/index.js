// 云函数：提交猜测答案
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/** 计分公式：与 Phase 1 一致 */
function calcScore(hintsUsed, timeTakenSeconds) {
  return Math.max(0, 1000 - (hintsUsed - 1) * 150 - Math.floor(timeTakenSeconds / 10) * 10)
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { roomCode, guessWord } = event

  if (!roomCode || !guessWord) return { ok: false, error: '缺少参数' }

  try {
    const res = await db.collection('idiom_rooms').where({ roomCode }).get()
    if (res.data.length === 0) return { ok: false, error: '房间不存在' }

    const room = res.data[0]
    if (room.status !== 'playing') return { ok: false, error: '游戏未在进行中' }

    // 验证角色：只有猜词者可以猜
    const player = room.players.find(p => p.openid === openid)
    if (!player) return { ok: false, error: '你不在这个房间' }
    if (player.role !== 'guesser') return { ok: false, error: '只有猜词者可以提交答案' }

    const correct = guessWord === room.gameState.currentIdiom

    if (correct) {
      // 计算得分
      const hintsUsed = room.gameState.currentHints.length
      const roundStart = new Date(room.gameState.roundStartTime).getTime()
      const timeTaken = Math.floor((Date.now() - roundStart) / 1000)
      const roundScore = calcScore(hintsUsed, timeTaken)

      // 更新玩家分数
      const players = room.players.map(p => {
        if (p.openid === openid) return { ...p, score: p.score + roundScore }
        if (p.role === 'hinter') return { ...p, score: p.score + Math.floor(roundScore * 0.5) } // 提示者也得分
        return p
      })

      const roundResult = {
        round: room.gameState.currentRound,
        idiom: room.gameState.currentIdiom,
        hinter: room.players.find(p => p.role === 'hinter').openid,
        guesser: openid,
        hintsUsed,
        guessedCorrectly: true,
        timeTaken,
        roundScore
      }

      await db.collection('idiom_rooms').doc(room._id).update({
        data: {
          players,
          'gameState.roundResults': _.push(roundResult)
        }
      })

      const updated = await db.collection('idiom_rooms').doc(room._id).get()
      return { ok: true, correct: true, roundScore, roundResult, room: updated.data }
    }

    return { ok: true, correct: false }
  } catch (e) {
    console.error('submitGuess error:', e)
    return { ok: false, error: e.message }
  }
}
