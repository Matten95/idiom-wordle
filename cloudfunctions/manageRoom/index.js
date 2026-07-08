// 云函数：房间生命周期管理（创建/加入/开始/下一轮/结束）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 成语提示词数据（嵌入云函数，避免额外文件依赖）
const idiomHints = require('./idiom-hints')
const idiomsData = require('./idioms.json')
const DEFAULT_MAX_DIFFICULTY = idiomHints.__meta.defaultMaxDifficulty || 2
const ROOM_TTL_MS = 2 * 60 * 60 * 1000
const IDIOM_LEVELS = idiomsData.idioms.reduce((result, item) => {
  result[item.text] = item.level
  return result
}, {})

function getHintEntries() {
  return Object.keys(idiomHints)
    .filter(key => key.indexOf('__') !== 0)
    .filter(key => {
      const value = idiomHints[key]
      return Array.isArray(value) || (value && Array.isArray(value.hints))
    })
}

function getHintDifficulty(key) {
  const value = idiomHints[key]
  if (Array.isArray(value)) return IDIOM_LEVELS[key] || 2
  return value.difficulty || 2
}

function isDefaultHintEntry(key) {
  const value = idiomHints[key]
  if (value && !Array.isArray(value) && value.defaultEligible === false) return false
  if (value && !Array.isArray(value) && value.defaultEligible === true) return true
  return getHintDifficulty(key) <= DEFAULT_MAX_DIFFICULTY
}

function getDefaultHintEntries() {
  const defaults = getHintEntries().filter(isDefaultHintEntry)
  return defaults.length > 0 ? defaults : getHintEntries()
}

/** 生成4位随机大写字母房间码 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // 排除 I,O 避免混淆
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function normalizeTotalRounds(value) {
  const rounds = parseInt(value) || 6
  if (rounds >= 10) return 10
  return 6
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

async function finishExpiredRoom(room) {
  try {
    await db.collection('idiom_rooms').doc(room._id).update({
      data: {
        status: 'finished',
        finishedReason: 'expired',
        lastActiveAt: new Date()
      }
    })
  } catch (e) { /* ignore */ }
}

function findLatestRoom(roomCode) {
  return db.collection('idiom_rooms')
    .where({ roomCode })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event

  try {
    switch (action) {
      case 'create': return await createRoom(openid, event)
      case 'join': return await joinRoom(openid, event)
      case 'start': return await startGame(openid, event)
      case 'advance': return await advanceRound(openid, event)
      case 'giveUp': return await giveUpRound(openid, event)
      case 'end': return await endGame(openid, event)
      default: return { ok: false, error: '未知操作: ' + action }
    }
  } catch (e) {
    console.error('manageRoom error:', e)
    return { ok: false, error: e.message }
  }
}

/** 创建房间 */
async function createRoom(openid, event) {
  const playerName = event.playerName || '匿名玩家'
  const avatar = event.avatar || ''

  let roomCode
  for (let i = 0; i < 5; i++) {
    roomCode = generateRoomCode()
    const exist = await db.collection('idiom_rooms')
      .where({ roomCode, status: _.in(['waiting', 'playing']) })
      .count()
    if (exist.total === 0) break
    if (i === 4) return { ok: false, error: '生成房间码失败，请重试' }
  }

  const now = new Date()
  const room = {
    roomCode,
    mode: 'practice',
    status: 'waiting',
    createdAt: now,
    expiresAt: new Date(now.getTime() + ROOM_TTL_MS),
    lastActiveAt: now,
    createdBy: openid,
    players: [{
      openid,
      playerName,
      avatar,
      role: 'hinter',
      isCreator: true,
      isReady: true,
      score: 0
    }],
    maxPlayers: 2,
    playerCount: 1,
    joinedOpenids: [openid],
    gameState: {
      currentRound: 0,
      totalRounds: normalizeTotalRounds(event.totalRounds),
      currentIdiom: '',
      currentDifficulty: 2,
      currentHints: [],
      hintCount: 0,
      hintWords: [],
      wrongGuessCount: 0,
      settledRound: 0,
      roundStartTime: null,
      roundResults: []
    }
  }

  const result = await db.collection('idiom_rooms').add({ data: room })
  return { ok: true, roomCode, roomId: result._id }
}

/** 加入房间 */
async function joinRoom(openid, event) {
  const { roomCode } = event
  if (!roomCode) return { ok: false, error: '请输入房间码' }

  const res = await findLatestRoom(roomCode)
  if (res.data.length === 0) return { ok: false, error: '房间不存在' }

  const room = res.data[0]
  if (isRoomExpired(room)) {
    await finishExpiredRoom(room)
    return { ok: false, error: '这桌好友局已经收桌，重新开一桌吧' }
  }
  if (room.status !== 'waiting') return { ok: false, error: '游戏已开始' }
  if (typeof room.playerCount !== 'number' || !Array.isArray(room.joinedOpenids)) {
    const joinedOpenids = (room.players || []).map(p => p.openid).filter(Boolean)
    await db.collection('idiom_rooms').doc(room._id).update({
      data: {
        playerCount: (room.players || []).length,
        joinedOpenids
      }
    })
    room.playerCount = (room.players || []).length
    room.joinedOpenids = joinedOpenids
  }
  const playerCount = typeof room.playerCount === 'number' ? room.playerCount : room.players.length
  if (playerCount >= room.maxPlayers) return { ok: false, error: '房间已满' }

  if (room.players.some(p => p.openid === openid)) {
    return { ok: true, room, alreadyIn: true }
  }

  const player = {
    openid,
    playerName: event.playerName || '匿名玩家',
    avatar: event.avatar || '',
    role: 'guesser',
    isCreator: false,
    isReady: true,
    score: 0
  }

  const joinRes = await db.collection('idiom_rooms')
    .where({
      _id: room._id,
      status: 'waiting',
      playerCount: _.lt(room.maxPlayers),
      joinedOpenids: _.nin([openid])
    })
    .update({
    data: {
      players: _.push(player),
      playerCount: _.inc(1),
      joinedOpenids: _.push(openid),
      lastActiveAt: new Date()
    }
  })
  if (!joinRes.stats || joinRes.stats.updated === 0) {
    const latest = await db.collection('idiom_rooms').doc(room._id).get()
    const current = latest.data || room
    if ((current.players || []).some(p => p.openid === openid)) {
      return { ok: true, room: current, alreadyIn: true }
    }
    return { ok: false, error: '房间已满' }
  }

  const updated = await db.collection('idiom_rooms').doc(room._id).get()
  return { ok: true, room: updated.data }
}

/** 开始游戏 */
async function startGame(openid, event) {
  const { roomCode } = event
  const res = await findLatestRoom(roomCode)
  if (res.data.length === 0) return { ok: false, error: '房间不存在' }

  const room = res.data[0]
  if (isRoomExpired(room)) {
    await finishExpiredRoom(room)
    return { ok: false, error: '这桌好友局已经收桌，重新开一桌吧' }
  }
  if (room.createdBy !== openid) return { ok: false, error: '只有房主可以开始游戏' }
  if (room.players.length < 2) return { ok: false, error: '至少需要2名玩家' }

  const keys = getDefaultHintEntries()
  const pick = keys[Math.floor(Math.random() * keys.length)]

  await db.collection('idiom_rooms').doc(room._id).update({
    data: {
      status: 'playing',
      lastActiveAt: new Date(),
      gameState: {
        currentRound: 1,
        totalRounds: room.gameState.totalRounds,
        currentIdiom: pick,
        currentDifficulty: getHintDifficulty(pick),
        currentHints: [],
        hintCount: 0,
        hintWords: [],
        wrongGuessCount: 0,
        settledRound: 0,
        roundStartTime: new Date(),
        roundResults: []
      }
    }
  })

  const updated = await db.collection('idiom_rooms').doc(room._id).get()
  return { ok: true, room: updated.data }
}

/** 进入下一轮（交换角色） */
async function advanceRound(openid, event) {
  const { roomCode } = event
  const res = await findLatestRoom(roomCode)
  if (res.data.length === 0) return { ok: false, error: '房间不存在' }

  const room = res.data[0]
  if (isRoomExpired(room)) {
    await finishExpiredRoom(room)
    return { ok: false, error: '这桌好友局已经收桌，重新开一桌吧' }
  }
  if (room.status !== 'playing') return { ok: false, error: '游戏未在进行中' }
  if (!room.players || !room.players.some(p => p.openid === openid)) {
    return { ok: false, error: '你不在这个房间' }
  }
  const lastResult = (room.gameState.roundResults || [])[room.gameState.roundResults.length - 1]
  if (!lastResult || lastResult.round !== room.gameState.currentRound) {
    return { ok: false, error: '本局还没结算，不能进入下一局' }
  }
  if (room.gameState.settledRound !== room.gameState.currentRound) {
    return { ok: false, error: '本局结算还在同步，稍后再进下一局' }
  }
  const nextRound = room.gameState.currentRound + 1

  if (nextRound > room.gameState.totalRounds) {
    const finishRes = await db.collection('idiom_rooms')
      .where({
        _id: room._id,
        status: 'playing',
        'gameState.currentRound': room.gameState.currentRound,
        'gameState.settledRound': room.gameState.currentRound
      })
      .update({
      data: {
        status: 'finished',
        lastActiveAt: new Date()
      }
    })
    if (!finishRes.stats || finishRes.stats.updated === 0) {
      const updated = await db.collection('idiom_rooms').doc(room._id).get()
      return { ok: true, room: updated.data, finished: updated.data.status === 'finished' }
    }
    const updated = await db.collection('idiom_rooms').doc(room._id).get()
    return { ok: true, room: updated.data, finished: true }
  }

  const players = room.players.map(p => ({
    ...p,
    role: p.role === 'hinter' ? 'guesser' : 'hinter'
  }))

  const usedIdioms = room.gameState.roundResults.map(r => r.idiom)
  const allKeys = getDefaultHintEntries()
  const keys = allKeys.filter(k => !usedIdioms.includes(k))
  const pick = keys.length > 0 ? keys[Math.floor(Math.random() * keys.length)] : allKeys[0]

  await db.collection('idiom_hints_live').where({ roomCode, round: room.gameState.currentRound }).remove()

  const advanceRes = await db.collection('idiom_rooms')
    .where({
      _id: room._id,
      status: 'playing',
      'gameState.currentRound': room.gameState.currentRound,
      'gameState.settledRound': room.gameState.currentRound
    })
    .update({
    data: {
      players,
      lastActiveAt: new Date(),
      gameState: {
        currentRound: nextRound,
        totalRounds: room.gameState.totalRounds,
        currentIdiom: pick,
        currentDifficulty: getHintDifficulty(pick),
        currentHints: [],
        hintCount: 0,
        hintWords: [],
        wrongGuessCount: 0,
        settledRound: 0,
        roundStartTime: new Date(),
        roundResults: room.gameState.roundResults
      }
    }
  })
  if (!advanceRes.stats || advanceRes.stats.updated === 0) {
    const updated = await db.collection('idiom_rooms').doc(room._id).get()
    return { ok: true, room: updated.data }
  }

  const updated = await db.collection('idiom_rooms').doc(room._id).get()
  return { ok: true, room: updated.data }
}

/** 猜词者认输，揭晓本局答案 */
async function giveUpRound(openid, event) {
  const { roomCode } = event
  const res = await findLatestRoom(roomCode)
  if (res.data.length === 0) return { ok: false, error: '房间不存在' }

  const room = res.data[0]
  if (isRoomExpired(room)) {
    await finishExpiredRoom(room)
    return { ok: false, error: '这桌好友局已经收桌，重新开一桌吧' }
  }
  if (room.status !== 'playing') return { ok: false, error: '游戏未在进行中' }
  const player = room.players.find(p => p.openid === openid)
  if (!player) return { ok: false, error: '你不在这个房间' }
  if (player.role !== 'guesser') return { ok: false, error: '只有猜词者可以揭晓答案' }

  const existed = (room.gameState.roundResults || []).find(result => result.round === room.gameState.currentRound)
  if (existed) return { ok: true, roundResult: existed, room }
  if (room.gameState.settledRound === room.gameState.currentRound) {
    return { ok: false, error: '本局已经结算' }
  }

  const roundStart = new Date(room.gameState.roundStartTime).getTime()
  const timeTaken = Math.floor((Date.now() - roundStart) / 1000)
  const hinter = room.players.find(p => p.role === 'hinter') || {}
  const roundResult = {
    round: room.gameState.currentRound,
    idiom: room.gameState.currentIdiom,
    hinter: hinter.openid || '',
    guesser: openid,
    hintsUsed: room.gameState.currentHints.length,
    difficulty: room.gameState.currentDifficulty || 2,
    wrongGuessCount: room.gameState.wrongGuessCount || 0,
    guessedCorrectly: false,
    timeTaken,
    roundScore: 0,
    scoreParts: null,
    gaveUp: true
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
      'gameState.roundResults': _.push(roundResult),
      'gameState.settledRound': room.gameState.currentRound,
      lastActiveAt: new Date()
    }
  })
  if (!updateRes.stats || updateRes.stats.updated === 0) {
    return { ok: false, error: '本局已经结算' }
  }

  const updated = await db.collection('idiom_rooms').doc(room._id).get()
  return { ok: true, roundResult, room: updated.data }
}

/** 结束游戏 */
async function endGame(openid, event) {
  const { roomCode } = event
  const res = await findLatestRoom(roomCode)
  if (res.data.length === 0) return { ok: false, error: '房间不存在' }

  const room = res.data[0]
  if (!room.players || !room.players.some(p => p.openid === openid)) {
    return { ok: false, error: '你不在这个房间' }
  }

  try {
    await db.collection('idiom_hints_live').where({ roomCode }).remove()
  } catch (e) { /* ignore */ }

  await db.collection('idiom_rooms').doc(room._id).update({
    data: {
      status: 'finished',
      lastActiveAt: new Date()
    }
  })

  const updated = await db.collection('idiom_rooms').doc(room._id).get()
  return { ok: true, room: updated.data, finished: true }
}
