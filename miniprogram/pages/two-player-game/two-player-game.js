/**
 * 双人提示猜词 — 游戏主页面
 * 提示者/猜词者双视图，实时同步
 */
const { watchRoom, watchHints } = require('../../utils/room-sync')
const { isCloudReady } = require('../../utils/cloud')
const { getPlayerName } = require('../../utils/player')

const MAX_HINTS = 5

function splitIdiomChars(text) {
  return Array.from(text || '')
}

function buildFinalResults(room) {
  const gameState = room.gameState || {}
  return {
    players: room.players || [],
    rounds: gameState.roundResults || [],
  }
}

Page({
  data: {
    // 身份
    roomCode: '',
    playerName: '',
    myRole: '',           // 'hinter' | 'guesser'
    opponentName: '',

    // 游戏状态
    currentRound: 0,
    totalRounds: 5,
    idiomText: '',        // 仅提示者可见
    idiomChars: [],
    idiomMasked: '',      // 猜词者看到的结构提示 (如 "????")

    // 提示
    hints: [],            // [{word, submittedAt}]
    hintSlots: [0, 1, 2, 3, 4],
    hintInput: '',
    hintSubmitted: false,

    // 猜词
    inputText: '',
    inputChars: ['', '', '', ''],
    inputSlots: [0, 1, 2, 3],
    inputFocused: false,
    canSubmit: false,

    // 计时
    roundSeconds: 0,
    timerText: '00:00',

    // 比分
    myScore: 0,
    opponentScore: 0,

    // 状态
    status: 'loading',    // 'loading' | 'playing' | 'round_end' | 'finished'
    showResult: false,
    roundResult: null,
    finalResults: null,

    // 输入验证
    hintError: '',
    guessError: '',
  },

  _roomWatcher: null,
  _hintWatcher: null,
  _roundTimer: null,
  _playerOpenid: '',

  onLoad(options) {
    const roomCode = options.roomCode || ''
    if (!roomCode) {
      wx.showToast({ title: '房间码缺失', icon: 'none' })
      setTimeout(() => wx.reLaunch({ url: '/pages/home/home' }), 1000)
      return
    }

    // 获取自己的 openid（通过云函数）
    wx.cloud.callFunction({
      name: 'getRoomState',
      data: { roomCode }
    }).then(res => {
      if (!res.result || !res.result.ok) {
        wx.showToast({ title: '房间不存在', icon: 'none' })
        setTimeout(() => wx.reLaunch({ url: '/pages/home/home' }), 1000)
        return
      }
      const room = res.result.room
      const playerName = getPlayerName()
      this._playerOpenid = res.result.openid || ''
      const { me, opponent } = this._getPlayerPair(room, playerName)
      const idiomText = me.role === 'hinter' ? room.gameState.currentIdiom : ''

      this.setData({
        roomCode,
        playerName,
        myRole: me.role || 'guesser',
        opponentName: opponent.playerName || '对手',
        currentRound: room.gameState.currentRound,
        totalRounds: room.gameState.totalRounds,
        idiomText,
        idiomChars: splitIdiomChars(idiomText),
        idiomMasked: me.role === 'guesser' ? '？？？？' : '',
        myScore: me.score || 0,
        opponentScore: opponent.score || 0,
        status: 'playing',
      })

      this._startSync()
      this._startTimer()
    }).catch(e => {
      console.error('load game error:', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
      setTimeout(() => wx.reLaunch({ url: '/pages/home/home' }), 1000)
    })
  },

  onUnload() {
    this._stopSync()
    this._stopTimer()
  },

  /** ========== 实时同步 ========== */
  _startSync() {
    const roomCode = this.data.roomCode

    // 监听房间状态（提示者用）
    this._roomWatcher = watchRoom(roomCode, {
      onUpdate: (room) => {
        this._handleRoomUpdate(room)
      },
      onError: (err) => {
        console.warn('Room sync error in game:', err)
      }
    })

    // 监听提示词（猜词者用）
    this._hintWatcher = watchHints(roomCode, this.data.currentRound, {
      onUpdate: (hints) => {
        this.setData({ hints })
      },
      onError: (err) => {
        console.warn('Hints sync error in game:', err)
      }
    })
  },

  _stopSync() {
    if (this._roomWatcher) { this._roomWatcher.close(); this._roomWatcher = null }
    if (this._hintWatcher) { this._hintWatcher.close(); this._hintWatcher = null }
  },

  _getPlayerPair(room, playerName) {
    const players = room.players || []
    let me = this._playerOpenid
      ? players.find(p => p.openid === this._playerOpenid)
      : null
    if (!me) me = players.find(p => p.playerName === playerName) || players[0] || {}
    const opponent = players.find(p => p.openid && p.openid !== me.openid) ||
      players.find(p => p.playerName !== me.playerName) ||
      {}
    return { me, opponent }
  },

  _handleRoomUpdate(room) {
    if (room.status === 'finished') {
      this._stopSync()
      this._stopTimer()
      const { me, opponent } = this._getPlayerPair(room, this.data.playerName)
      this.setData({
        status: 'finished',
        showResult: true,
        finalResults: buildFinalResults(room),
        myScore: me.score || 0,
        opponentScore: opponent.score || 0,
      })
      return
    }

    // 更新回合信息
    const { me, opponent } = this._getPlayerPair(room, this.data.playerName)

    if (room.gameState.currentRound !== this.data.currentRound) {
      // 新回合开始
      this._stopTimer()
      const idiomText = me.role === 'hinter' ? room.gameState.currentIdiom : ''
      this.setData({
        currentRound: room.gameState.currentRound,
        myRole: me.role,
        opponentName: opponent.playerName || '对手',
        idiomText,
        idiomChars: splitIdiomChars(idiomText),
        idiomMasked: me.role === 'guesser' ? '？？？？' : '',
        hints: [],
        hintInput: '',
        hintError: '',
        hintSubmitted: false,
        inputText: '',
        inputChars: ['', '', '', ''],
        canSubmit: false,
        guessError: '',
        status: 'playing',
        showResult: false,
        roundSeconds: 0,
      })
      this._startTimer()
      // 重新监听新回合的 hints
      if (this._hintWatcher) { this._hintWatcher.close() }
      this._hintWatcher = watchHints(this.data.roomCode, room.gameState.currentRound, {
        onUpdate: (hints) => { this.setData({ hints }) },
        onError: (err) => { console.warn('Hints sync error:', err) }
      })
    } else {
      // 同回合内更新：检查是否有猜中结果
      const lastResult = room.gameState.roundResults[room.gameState.roundResults.length - 1]
      if (lastResult && lastResult.round === this.data.currentRound && lastResult.guessedCorrectly) {
        this._stopTimer()
        this.setData({
          status: 'round_end',
          showResult: true,
          roundResult: lastResult,
          myScore: me.score,
          opponentScore: opponent.score,
        })
      }
    }
  },

  /** ========== 计时器 ========== */
  _startTimer() {
    this._stopTimer()
    this._roundTimer = setInterval(() => {
      const sec = this.data.roundSeconds + 1
      const mins = Math.floor(sec / 60)
      const remain = sec % 60
      this.setData({
        roundSeconds: sec,
        timerText: String(mins).padStart(2, '0') + ':' + String(remain).padStart(2, '0'),
      })
    }, 1000)
  },

  _stopTimer() {
    if (this._roundTimer) { clearInterval(this._roundTimer); this._roundTimer = null }
  },

  /** ========== 提示者操作 ========== */
  onHintInput(e) {
    const val = (e.detail.value || '').slice(0, 2)
    this.setData({ hintInput: val, hintError: '' })
  },

  async onSubmitHint() {
    if (this.data.myRole !== 'hinter') return
    const hintWord = this.data.hintInput.trim()
    if (hintWord.length !== 2) {
      this.setData({ hintError: '请输入2个汉字' })
      return
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'submitHint',
        data: {
          roomCode: this.data.roomCode,
          hintWord,
        }
      })

      if (res.result && res.result.ok) {
        this.setData({ hintInput: '', hintError: '', hintSubmitted: true })
        setTimeout(() => this.setData({ hintSubmitted: false }), 1500)
      } else {
        this.setData({ hintError: res.result.reason || res.result.error || '提交失败' })
      }
      wx.vibrateShort({ type: 'light' })
    } catch (e) {
      console.error('submitHint error:', e)
      this.setData({ hintError: '网络错误，请重试' })
    }
  },

  /** ========== 猜词者操作 ========== */
  onInputChange(e) {
    const text = (e.detail.value || '').slice(0, 4)
    const allChars = Array.from(text)
    const chars = ['', '', '', '']
    allChars.forEach((c, i) => { if (i < 4) chars[i] = c })
    const canSubmit = allChars.length === 4
    this.setData({ inputText: text, inputChars: chars, canSubmit, guessError: '' })
  },

  onInputFocus() {
    this.setData({ inputFocused: true })
  },

  onInputBlur() {
    this.setData({ inputFocused: false })
  },

  onTapInputArea() {
    this.setData({ inputFocused: true })
  },

  onClearInput() {
    this.setData({ inputText: '', inputChars: ['', '', '', ''], inputFocused: true, canSubmit: false, guessError: '' })
  },

  async onSubmitGuess() {
    if (this.data.myRole !== 'guesser' || !this.data.canSubmit) return
    const guessWord = this.data.inputChars.join('')

    try {
      const res = await wx.cloud.callFunction({
        name: 'submitGuess',
        data: {
          roomCode: this.data.roomCode,
          guessWord,
        }
      })

      if (res.result && res.result.ok) {
        if (res.result.correct) {
          wx.vibrateShort({ type: 'heavy' })
          this.setData({
            status: 'round_end',
            showResult: true,
            roundResult: res.result.roundResult,
            myScore: (res.result.room.players.find(p => p.playerName === this.data.playerName) || {}).score || 0,
          })
        } else {
          wx.vibrateShort({ type: 'light' })
          this.setData({ guessError: '不对，再想想～' })
          setTimeout(() => this.setData({ guessError: '' }), 2000)
        }
      } else {
        this.setData({ guessError: res.result.error || '提交失败' })
      }
    } catch (e) {
      console.error('submitGuess error:', e)
      this.setData({ guessError: '网络错误，请重试' })
    }
  },

  /** ========== 回合推进 ========== */
  async onNextRound() {
    const data = this.data
    this.setData({ showResult: false, roundResult: null, status: 'loading' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageRoom',
        data: {
          action: 'advance',
          roomCode: data.roomCode,
        }
      })

      if (res.result && res.result.ok) {
        if (res.result.finished) {
          this._stopTimer()
          this.setData({
            status: 'finished',
            showResult: true,
            finalResults: buildFinalResults(res.result.room || {}),
          })
        } else {
          const room = res.result.room
          const { me, opponent } = this._getPlayerPair(room, data.playerName)
          const idiomText = me.role === 'hinter' ? room.gameState.currentIdiom : ''
          this.setData({
            currentRound: room.gameState.currentRound,
            myRole: me.role,
            opponentName: opponent.playerName || '对手',
            idiomText,
            idiomChars: splitIdiomChars(idiomText),
            idiomMasked: me.role === 'guesser' ? '？？？？' : '',
            hints: [],
            hintInput: '',
            hintError: '',
            hintSubmitted: false,
            inputText: '',
            inputChars: ['', '', '', ''],
            canSubmit: false,
            guessError: '',
            status: 'playing',
            myScore: me.score,
            opponentScore: opponent.score,
          })
          this._startTimer()
          // 更新 hints 监听
          if (this._hintWatcher) { this._hintWatcher.close() }
          this._hintWatcher = watchHints(data.roomCode, room.gameState.currentRound, {
            onUpdate: (hints) => { this.setData({ hints }) },
            onError: (err) => { console.warn('Hints sync error:', err) }
          })
        }
      }
    } catch (e) {
      console.error('advanceRound error:', e)
    }
  },

  /** 退出游戏 */
  onQuit() {
    wx.showModal({
      title: '退出游戏',
      content: '确定退出当前游戏吗？',
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'manageRoom',
            data: { action: 'end', roomCode: this.data.roomCode }
          }).catch(() => {})
          wx.reLaunch({ url: '/pages/home/home' })
        }
      }
    })
  },

  /** 再来一局 */
  onPlayAgain() {
    wx.reLaunch({ url: '/pages/home/home' })
  },

  onShareGame() {
    const d = this.data
    return {
      title: '双人提示猜词\n' + d.myScore + ' vs ' + d.opponentScore + '\n来挑战我吧',
      path: '/pages/room-lobby/room-lobby',
    }
  },

  onShareAppMessage() { return this.onShareGame() },
})
