/**
 * 房间大厅 — 创建/加入提示猜词-双人版房间
 */
const { isCloudReady } = require('../../utils/cloud')
const { watchRoom } = require('../../utils/room-sync')
const { getPlayerName } = require('../../utils/player')
const { logEvent } = require('../../utils/telemetry')

function normalizeRoomCode(value) {
  return (value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
}

function normalizeTotalRounds(value) {
  const rounds = parseInt(value) || 6
  if (rounds >= 10) return 10
  return 6
}

function getFriendlyRoomError(rawMsg, action) {
  const msg = rawMsg || ''
  if (msg.indexOf('云开发未就绪') > -1) return '开局令暂时盖不上，请切到真机小馆再试。'
  if (msg.indexOf('FUNCTION_NOT_FOUND') > -1 || msg.indexOf('-501000') > -1 || msg.indexOf('FunctionName parameter could not be found') > -1) {
    return '开局令的云函数还没部署，请先上传 manageRoom。'
  }
  if (msg.indexOf('网络') > -1) return '开局令没送到，检查网络后再试一次。'
  if (msg.indexOf('房间不存在') > -1) return '这枚房间码没找到，请和好友再对一遍。'
  if (msg.indexOf('游戏已开始') > -1) return '这桌已经开局，换个房间码再入席。'
  if (msg.indexOf('房间已满') > -1) return '这桌好友局已坐满，另开一桌吧。'
  if (msg.indexOf('只有房主') > -1) return '开局令在房主手里，请等房主点开局。'
  if (msg.indexOf('至少需要2名玩家') > -1) return '好友还没入席，等他进来再开局。'
  if (msg.indexOf('生成房间码失败') > -1) return '开局令没盖好，再点一次试试。'
  if (msg.indexOf('请输入房间码') > -1 || msg.indexOf('请输入4位房间码') > -1) return '房间码差一笔，补齐 4 位再赴约。'
  if (action === 'create') return '开局令暂时没盖上，再试一次。'
  if (action === 'join') return '这桌暂时进不去，确认房间码后再试。'
  if (action === 'start') return '开局鼓还没敲响，稍后再试。'
  return '小馆这会儿有点忙，稍后再试。'
}

Page({
  data: {
    mode: 'create',        // 'create' | 'join' | 'waiting'
    roomCode: '',
    playerName: '',
    players: [],
    isCreator: false,
    canStart: false,
    totalRounds: 6,
    inputCode: '',
    errorMsg: '',
    loading: false,
  },

  _roomWatcher: null,
  _enteringGame: false,

  onLoad(options) {
    const code = normalizeRoomCode(options && options.code)
    if (code) logEvent('share_open', { page: 'room_lobby', roomCode: code })
    this.setData({
      playerName: getPlayerName(),
      mode: code ? 'join' : 'create',
      inputCode: code,
    })
  },

  onUnload() {
    if (this._roomWatcher) { this._roomWatcher.close(); this._roomWatcher = null }
  },

  /** 切换到创建房间 */
  onShowCreate() {
    this.setData({ mode: 'create', errorMsg: '' })
  },

  /** 切换到加入房间 */
  onShowJoin() {
    this.setData({ mode: 'join', errorMsg: '' })
  },

  /** 选择回合数 */
  onSelectRounds(e) {
    this.setData({ totalRounds: normalizeTotalRounds(e.currentTarget.dataset.rounds) })
  },

  /** 创建房间 */
  async onCreateRoom() {
    if (this.data.loading) return
    this.setData({ loading: true, errorMsg: '' })

    if (!isCloudReady()) {
      this.setData({ errorMsg: getFriendlyRoomError('云开发未就绪', 'create'), loading: false })
      return
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageRoom',
        data: {
          action: 'create',
          playerName: this.data.playerName,
          totalRounds: this.data.totalRounds,
        }
      })

      if (res.result && res.result.ok) {
        logEvent('create_room', { totalRounds: this.data.totalRounds })
        this.setData({
          roomCode: res.result.roomCode,
          mode: 'waiting',
          isCreator: true,
          players: [{ playerName: this.data.playerName, isCreator: true, isReady: true }],
          canStart: false,
          loading: false,
        })
        this._startWatchRoom(res.result.roomCode)
      } else {
        this.setData({ errorMsg: getFriendlyRoomError(res.result.error, 'create'), loading: false })
      }
    } catch (e) {
      console.error('createRoom error:', e)
      this.setData({ errorMsg: getFriendlyRoomError(e.errMsg || e.message || '网络错误', 'create'), loading: false })
    }
  },

  /** 加入房间 */
  async onJoinRoom() {
    const code = normalizeRoomCode(this.data.inputCode)
    if (code.length !== 4) {
      this.setData({ errorMsg: getFriendlyRoomError('请输入4位房间码', 'join') })
      return
    }
    if (this.data.loading) return
    this.setData({ loading: true, errorMsg: '' })

    if (!isCloudReady()) {
      this.setData({ errorMsg: getFriendlyRoomError('云开发未就绪', 'join'), loading: false })
      return
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageRoom',
        data: {
          action: 'join',
          roomCode: code,
          playerName: this.data.playerName,
        }
      })

      if (res.result && res.result.ok) {
        logEvent('join_room', { roomCode: code })
        const room = res.result.room
        this.setData({
          roomCode: code,
          mode: 'waiting',
          isCreator: false,
          players: room.players || [],
          canStart: false,
          loading: false,
        })
        this._startWatchRoom(code)
      } else {
        this.setData({ errorMsg: getFriendlyRoomError(res.result.error, 'join'), loading: false })
      }
    } catch (e) {
      console.error('joinRoom error:', e)
      this.setData({ errorMsg: getFriendlyRoomError(e.errMsg || e.message || '网络错误', 'join'), loading: false })
    }
  },

  /** 输入房间码 */
  onCodeInput(e) {
    const val = normalizeRoomCode(e.detail.value)
    this.setData({ inputCode: val, errorMsg: '' })
  },

  /** 开始游戏 */
  async onStartGame() {
    if (!this.data.canStart || this.data.loading) return
    this.setData({ loading: true, errorMsg: '' })

    if (this._roomWatcher) { this._roomWatcher.close(); this._roomWatcher = null }

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageRoom',
        data: {
          action: 'start',
          roomCode: this.data.roomCode,
        }
      })

      if (res.result && res.result.ok) {
        wx.redirectTo({
          url: '/pages/two-player-game/two-player-game?roomCode=' + this.data.roomCode + '&isCreator=' + (this.data.isCreator ? '1' : '0'),
        })
      } else {
        this.setData({ errorMsg: getFriendlyRoomError(res.result.error, 'start'), loading: false })
        this._startWatchRoom(this.data.roomCode)
      }
    } catch (e) {
      console.error('startGame error:', e)
      this.setData({ errorMsg: getFriendlyRoomError(e.errMsg || e.message || '网络错误', 'start'), loading: false })
      this._startWatchRoom(this.data.roomCode)
    }
  },

  /** 复制房间码 */
  onCopyCode() {
    wx.setClipboardData({
      data: this.data.roomCode,
      success() { wx.showToast({ title: '开局令已复制', icon: 'success' }) }
    })
  },

  /** 分享房间 */
  onShareRoom() {
    if (!this.data.roomCode) {
      return {
        title: '双人提示猜词 · 一起猜成语',
        path: '/pages/room-lobby/room-lobby',
      }
    }
    return {
      title: '我开了一桌成语局，缺你上桌\n房间码：' + this.data.roomCode,
      path: '/pages/room-lobby/room-lobby?code=' + encodeURIComponent(this.data.roomCode),
    }
  },

  onShareAppMessage() { return this.onShareRoom() },

  /** 返回首页 */
  onGoHome() { wx.reLaunch({ url: '/pages/home/home' }) },

  /** 监听房间状态 */
  _startWatchRoom(roomCode) {
    if (this._roomWatcher) { this._roomWatcher.close() }
    this._roomWatcher = watchRoom(roomCode, {
      onUpdate: (room) => {
        const players = room.players || []
        const canStart = players.length >= 2 && this.data.isCreator
        if (room.status === 'playing' && !this._enteringGame) {
          this._enteringGame = true
          if (this._roomWatcher) { this._roomWatcher.close(); this._roomWatcher = null }
          wx.redirectTo({
            url: '/pages/two-player-game/two-player-game?roomCode=' + roomCode + '&isCreator=' + (this.data.isCreator ? '1' : '0'),
          })
          return
        }
        if (room.status === 'finished') {
          this.setData({ errorMsg: '这桌好友局已经收桌，重新开一桌吧。', loading: false })
          return
        }
        this.setData({ players, canStart })
      },
      onError: (err) => {
        console.warn('Room watch error in lobby:', err)
        this.setData({ errorMsg: getFriendlyRoomError(err && (err.errMsg || err.message) || '网络错误', 'join') })
      }
    })
  },
})
