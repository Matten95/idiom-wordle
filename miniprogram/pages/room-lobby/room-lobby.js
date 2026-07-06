/**
 * 房间大厅 — 创建/加入提示猜词-双人版房间
 */
const { isCloudReady } = require('../../utils/cloud')
const { watchRoom } = require('../../utils/room-sync')
const { getPlayerName } = require('../../utils/player')

function normalizeRoomCode(value) {
  return (value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
}

Page({
  data: {
    mode: 'create',        // 'create' | 'join' | 'waiting'
    roomCode: '',
    playerName: '',
    players: [],
    isCreator: false,
    canStart: false,
    totalRounds: 5,
    inputCode: '',
    errorMsg: '',
    loading: false,
  },

  _roomWatcher: null,

  onLoad(options) {
    const code = normalizeRoomCode(options && options.code)
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
    this.setData({ totalRounds: parseInt(e.currentTarget.dataset.rounds) })
  },

  /** 创建房间 */
  async onCreateRoom() {
    if (this.data.loading) return
    this.setData({ loading: true, errorMsg: '' })

    if (!isCloudReady()) {
      this.setData({ errorMsg: '云开发未就绪，请在真机上调试', loading: false })
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
        this.setData({ errorMsg: res.result.error || '创建失败', loading: false })
      }
    } catch (e) {
      console.error('createRoom error:', e)
      this.setData({ errorMsg: '网络错误，请重试', loading: false })
    }
  },

  /** 加入房间 */
  async onJoinRoom() {
    const code = normalizeRoomCode(this.data.inputCode)
    if (code.length !== 4) {
      this.setData({ errorMsg: '请输入4位房间码' })
      return
    }
    if (this.data.loading) return
    this.setData({ loading: true, errorMsg: '' })

    if (!isCloudReady()) {
      this.setData({ errorMsg: '云开发未就绪，请在真机上调试', loading: false })
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
        this.setData({ errorMsg: res.result.error || '加入失败', loading: false })
      }
    } catch (e) {
      console.error('joinRoom error:', e)
      this.setData({ errorMsg: '网络错误，请重试', loading: false })
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
        this.setData({ errorMsg: res.result.error || '开始失败', loading: false })
        this._startWatchRoom(this.data.roomCode)
      }
    } catch (e) {
      console.error('startGame error:', e)
      this.setData({ errorMsg: '网络错误，请重试', loading: false })
      this._startWatchRoom(this.data.roomCode)
    }
  },

  /** 复制房间码 */
  onCopyCode() {
    wx.setClipboardData({
      data: this.data.roomCode,
      success() { wx.showToast({ title: '房间码已复制', icon: 'success' }) }
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
      title: '双人提示猜词\n房间码：' + this.data.roomCode,
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
        this.setData({ players, canStart })
      },
      onError: (err) => {
        console.warn('Room watch error in lobby:', err)
      }
    })
  },
})
