// 云函数：房间生命周期管理（创建/加入/开始/下一轮/结束）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 成语提示词数据（嵌入云函数，避免额外文件依赖）
const idiomHints = require('./idiom-hints')
const idiomsData = require('./idioms.json')
const DEFAULT_MAX_DIFFICULTY = idiomHints.__meta.defaultMaxDifficulty || 2
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
    const exist = await db.collection('idiom_rooms').where({ roomCode, status: 'waiting' }).count()
    if (exist.total === 0) break
    if (i === 4) return { ok: false, error: '生成房间码失败，请重试' }
  }

  const room = {
    roomCode,
    mode: 'practice',
    status: 'waiting',
    createdAt: new Date(),
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
    gameState: {
      currentRound: 0,
      totalRounds: event.totalRounds || 5,
      currentIdiom: '',
      currentHints: [],
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

  const res = await db.collection('idiom_rooms').where({ roomCode }).get()
  if (res.data.length === 0) return { ok: false, error: '房间不存在' }

  const room = res.data[0]
  if (room.status !== 'waiting') return { ok: false, error: '游戏已开始' }
  if (room.players.length >= room.maxPlayers) return { ok: false, error: '房间已满' }

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

  await db.collection('idiom_rooms').doc(room._id).update({
    data: { players: _.push(player) }
  })

  const updated = await db.collection('idiom_rooms').doc(room._id).get()
  return { ok: true, room: updated.data }
}

/** 开始游戏 */
async function startGame(openid, event) {
  const { roomCode } = event
  const res = await db.collection('idiom_rooms').where({ roomCode }).get()
  if (res.data.length === 0) return { ok: false, error: '房间不存在' }

  const room = res.data[0]
  if (room.createdBy !== openid) return { ok: false, error: '只有房主可以开始游戏' }
  if (room.players.length < 2) return { ok: false, error: '至少需要2名玩家' }

  const keys = getDefaultHintEntries()
  const pick = keys[Math.floor(Math.random() * keys.length)]

  await db.collection('idiom_rooms').doc(room._id).update({
    data: {
      status: 'playing',
      gameState: {
        currentRound: 1,
        totalRounds: room.gameState.totalRounds,
        currentIdiom: pick,
        currentHints: [],
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
  const res = await db.collection('idiom_rooms').where({ roomCode }).get()
  if (res.data.length === 0) return { ok: false, error: '房间不存在' }

  const room = res.data[0]
  const nextRound = room.gameState.currentRound + 1

  if (nextRound > room.gameState.totalRounds) {
    await db.collection('idiom_rooms').doc(room._id).update({
      data: { status: 'finished' }
    })
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

  await db.collection('idiom_rooms').doc(room._id).update({
    data: {
      players,
      gameState: {
        currentRound: nextRound,
        totalRounds: room.gameState.totalRounds,
        currentIdiom: pick,
        currentHints: [],
        roundStartTime: new Date(),
        roundResults: room.gameState.roundResults
      }
    }
  })

  const updated = await db.collection('idiom_rooms').doc(room._id).get()
  return { ok: true, room: updated.data }
}

/** 结束游戏 */
async function endGame(openid, event) {
  const { roomCode } = event
  const res = await db.collection('idiom_rooms').where({ roomCode }).get()
  if (res.data.length === 0) return { ok: false, error: '房间不存在' }

  const room = res.data[0]

  try {
    await db.collection('idiom_hints_live').where({ roomCode }).remove()
  } catch (e) { /* ignore */ }

  await db.collection('idiom_rooms').doc(room._id).update({
    data: { status: 'finished' }
  })

  const updated = await db.collection('idiom_rooms').doc(room._id).get()
  return { ok: true, room: updated.data, finished: true }
}
