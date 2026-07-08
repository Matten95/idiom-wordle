// 云函数：提交猜测答案
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const WRONG_GUESS_PENALTY = 4
const EARLY_REVEAL_PENALTY = 5
const ROOM_TTL_MS = 2 * 60 * 60 * 1000
const DIFFICULTY_SCORE_ADJUST = {
  1: -3,
  2: 0,
  3: 4,
  4: 7,
}

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

/** 计分公式：每局按百分制结算 */
function calcScore(hintsUsed, timeTakenSeconds, wrongGuessCount, difficulty, earlyRevealCount) {
  const safeHintsUsed = Math.max(1, hintsUsed || 0)
  const hintPenalty = (safeHintsUsed - 1) * 15
  const timePenalty = Math.floor(timeTakenSeconds / 10)
  const wrongPenalty = (wrongGuessCount || 0) * WRONG_GUESS_PENALTY
  const revealPenalty = (earlyRevealCount || 0) * EARLY_REVEAL_PENALTY
  const difficultyAdjust = DIFFICULTY_SCORE_ADJUST[difficulty || 2] || 0
  const raw = 100 + difficultyAdjust - hintPenalty - timePenalty - wrongPenalty - revealPenalty
  return {
    score: Math.max(0, Math.min(100, raw)),
    hintPenalty,
    timePenalty,
    wrongPenalty,
    revealPenalty,
    difficultyAdjust
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { roomCode, guessWord } = event

  if (!roomCode || !guessWord) return { ok: false, error: '缺少参数' }

  try {
    const res = await db.collection('idiom_rooms')
      .where({ roomCode })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()
    if (res.data.length === 0) return { ok: false, error: '房间不存在' }

    const room = res.data[0]
    if (isRoomExpired(room)) return { ok: false, error: '这桌好友局已经收桌，重新开一桌吧' }
    if (room.status !== 'playing') return { ok: false, error: '游戏未在进行中' }

    // 验证角色：只有猜词者可以猜
    const player = room.players.find(p => p.openid === openid)
    if (!player) return { ok: false, error: '你不在这个房间' }
    if (player.role !== 'guesser') return { ok: false, error: '只有猜词者可以提交答案' }
    const existedResult = (room.gameState.roundResults || []).find(result => result.round === room.gameState.currentRound)
    if (existedResult) return { ok: false, error: '本局已经结算' }
    if (room.gameState.settledRound === room.gameState.currentRound) return { ok: false, error: '本局已经结算' }

    const correct = guessWord === room.gameState.currentIdiom

    if (correct) {
      // 计算得分
      const hintsUsed = room.gameState.currentHints.length
      const roundStart = new Date(room.gameState.roundStartTime).getTime()
      const timeTaken = Math.floor((Date.now() - roundStart) / 1000)
      const wrongGuessCount = room.gameState.wrongGuessCount || 0
      const scoreParts = calcScore(hintsUsed, timeTaken, wrongGuessCount, room.gameState.currentDifficulty || 2, 0)
      const roundScore = scoreParts.score

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
        difficulty: room.gameState.currentDifficulty || 2,
        wrongGuessCount,
        guessedCorrectly: true,
        timeTaken,
        roundScore,
        scoreParts
      }

      const updateRes = await db.collection('idiom_rooms')
        .where({
          _id: room._id,
          status: 'playing',
          'gameState.currentRound': room.gameState.currentRound,
          'gameState.settledRound': _.neq(room.gameState.currentRound)
        })
        .update({
        data: {
          players,
          'gameState.roundResults': _.push(roundResult),
          'gameState.settledRound': room.gameState.currentRound,
          lastActiveAt: new Date()
        }
      })
      if (!updateRes.stats || updateRes.stats.updated === 0) {
        return { ok: false, error: '本局已经结算' }
      }

      const updated = await db.collection('idiom_rooms').doc(room._id).get()
      return { ok: true, correct: true, roundScore, roundResult, room: updated.data }
    }

    const wrongRes = await db.collection('idiom_rooms')
      .where({
        _id: room._id,
        status: 'playing',
        'gameState.currentRound': room.gameState.currentRound,
        'gameState.settledRound': _.neq(room.gameState.currentRound)
      })
      .update({
      data: {
        'gameState.wrongGuessCount': _.inc(1),
        lastActiveAt: new Date()
      }
    })
    if (!wrongRes.stats || wrongRes.stats.updated === 0) {
      return { ok: false, error: '本局已经结算' }
    }

    return { ok: true, correct: false }
  } catch (e) {
    console.error('submitGuess error:', e)
    return { ok: false, error: e.message }
  }
}
