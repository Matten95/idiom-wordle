/**
 * 双人提示猜词 — 游戏主页面
 * 提示者/猜词者双视图，实时同步
 */
const { watchRoom, watchHints } = require('../../utils/room-sync')
const { isCloudReady } = require('../../utils/cloud')
const { getPlayerName } = require('../../utils/player')
const { drawDuelShareCard } = require('../../utils/share-card')

const MAX_HINTS = 5

function splitIdiomChars(text) {
  return Array.from(text || '')
}

function buildFinalResults(room) {
  const gameState = room.gameState || {}
  const totalRounds = gameState.totalRounds || 1
  const maxScore = Math.max(1, totalRounds * 100)
  const players = (room.players || []).map(player => ({
    ...player,
    scorePercent: Math.round(((player.score || 0) / maxScore) * 100),
  })).sort((a, b) => (b.score || 0) - (a.score || 0))
  const topScore = players.length > 0 ? players[0].score || 0 : 0
  const tiedTopCount = players.filter(player => (player.score || 0) === topScore).length
  return {
    players: players.map(player => ({
      ...player,
      isWinner: topScore > 0 && (player.score || 0) === topScore,
      rankText: topScore > 0 && (player.score || 0) === topScore ? (tiedTopCount > 1 ? '平' : '胜') : '',
    })),
    rounds: (gameState.roundResults || []).map(round => ({
      ...round,
      statusText: round.guessedCorrectly ? '+' + round.roundScore + '/100' : '未猜中',
    })),
  }
}

function buildHinterGuide(hintsLength) {
  if (hintsLength <= 0) return '先递一枚 2 字线索，别含答案字。好友卡住时还能继续补线索。'
  if (hintsLength < MAX_HINTS) return '好友还没破题，可以再补 ' + (MAX_HINTS - hintsLength) + ' 条线索；提示越少，得分越高。'
  return '五枚线索已出齐，等好友收桌破题。'
}

function buildGuesserGuide(hintsLength) {
  if (hintsLength <= 0) return '等好友递第一枚线索，收到后就能开猜。'
  return '已收到 ' + hintsLength + '/' + MAX_HINTS + ' 枚线索，少看少错更容易冲高分。'
}

function buildRoundEndHint(result) {
  if (!result) return '本局已结算，准备下一桌。'
  if (result.guessedCorrectly) return '猜词者破题成功，提示者也获得协作分。'
  return '本局已揭晓，先复盘线索，再进下一局。'
}

function getFriendlyGameError(rawMsg) {
  const msg = rawMsg || ''
  if (msg.indexOf('云开发未就绪') > -1) return '好友桌暂时连不上云端，请回首页稍后再开。'
  if (msg.indexOf('FUNCTION_NOT_FOUND') > -1 || msg.indexOf('-501000') > -1) return '好友局云函数还没部署，请先上传双人局云函数。'
  if (msg.indexOf('房间不存在') > -1 || msg.indexOf('过期') > -1) return '这桌开局令已经失效，回大厅重新开一桌。'
  if (msg.indexOf('游戏未在进行中') > -1) return '这桌已经收起或还没开局，回大厅重新确认。'
  if (msg.indexOf('网络') > -1) return '好友桌连线有点慢，检查网络后再试。'
  return '好友桌暂时没连上，稍后再试。'
}

function redirectToLobby(roomCode, message) {
  wx.showToast({ title: message, icon: 'none' })
  setTimeout(() => {
    wx.redirectTo({
      url: '/pages/room-lobby/room-lobby?code=' + encodeURIComponent(roomCode),
    })
  }, 800)
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
    totalRounds: 6,
    idiomText: '',        // 仅提示者可见
    idiomChars: [],
    idiomMasked: '',      // 猜词者看到的结构提示 (如 "????")

    // 提示
    hints: [],            // [{word, submittedAt}]
    hintSlots: [0, 1, 2, 3, 4],
    hintInput: '',
    hintInputVisible: true,
    hintSubmitted: false,
    hinterGuideText: buildHinterGuide(0),

    // 猜词
    inputText: '',
    inputChars: ['', '', '', ''],
    inputSlots: [0, 1, 2, 3],
    inputFocused: false,
    canSubmit: false,
    guesserGuideText: buildGuesserGuide(0),
    surrenderLoading: false,

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
    syncStatusText: '正在摆好好友对局桌...',
    roundEndHintText: '',
    advancingRound: false,
    shareImagePath: '',

    // 输入验证
    hintError: '',
    guessError: '',
  },

  _roomWatcher: null,
  _hintWatcher: null,
  _roundTimer: null,
  _playerOpenid: '',
  _advancing: false,
  _hintInput: '',

  onLoad(options) {
    const roomCode = options.roomCode || ''
    if (!roomCode) {
      wx.showToast({ title: '房间码缺失', icon: 'none' })
      setTimeout(() => wx.reLaunch({ url: '/pages/home/home' }), 1000)
      return
    }
    if (!isCloudReady()) {
      this.setData({ status: 'loading', syncStatusText: getFriendlyGameError('云开发未就绪') })
      setTimeout(() => wx.reLaunch({ url: '/pages/home/home' }), 1200)
      return
    }

    // 获取自己的 openid（通过云函数）
    wx.cloud.callFunction({
      name: 'getRoomState',
      data: { roomCode }
    }).then(res => {
      if (!res.result || !res.result.ok) {
        wx.showToast({ title: getFriendlyGameError(res.result && res.result.error || '房间不存在'), icon: 'none' })
        setTimeout(() => wx.reLaunch({ url: '/pages/home/home' }), 1000)
        return
      }
      const room = res.result.room
      if (room.status !== 'playing' || !room.gameState || !room.gameState.currentIdiom) {
        this.setData({ status: 'loading', syncStatusText: '好友还没入席，先回大厅等开局。' })
        redirectToLobby(roomCode, '好友还没入席')
        return
      }
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
        syncStatusText: '好友局已同步，开猜吧。',
        hinterGuideText: buildHinterGuide(0),
        guesserGuideText: buildGuesserGuide(0),
      })

      this._startSync()
      this._startTimer()
    }).catch(e => {
      console.error('load game error:', e)
      wx.showToast({ title: getFriendlyGameError(e.errMsg || e.message || '网络错误'), icon: 'none' })
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
        this.setData({ syncStatusText: getFriendlyGameError(err && (err.errMsg || err.message) || '网络错误') + ' 正在重新连线。' })
      }
    })

    // 监听提示词（猜词者用）
    this._hintWatcher = watchHints(roomCode, this.data.currentRound, {
      onUpdate: (hints) => {
        this.setData({
          hints,
          hinterGuideText: buildHinterGuide(hints.length),
          guesserGuideText: buildGuesserGuide(hints.length),
          syncStatusText: hints.length > 0 ? '线索已同步，继续破题。' : this.data.syncStatusText,
        })
      },
      onError: (err) => {
        console.warn('Hints sync error in game:', err)
        this.setData({ syncStatusText: '线索同步有点慢，别急，正在补上。' })
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
      const finalResults = buildFinalResults(room)
      this.setData({
        status: 'finished',
        showResult: true,
        finalResults,
        myScore: me.score || 0,
        opponentScore: opponent.score || 0,
        syncStatusText: '这桌已收桌，可以分享战绩或再开一桌。',
      })
      this.prepareDuelShareImage(finalResults)
      return
    }

    if (room.status !== 'playing' || !room.gameState || !room.gameState.currentIdiom) {
      this._stopSync()
      this._stopTimer()
      this.setData({ status: 'loading', syncStatusText: '这桌还没开局，先回大厅等好友入席。' })
      redirectToLobby(this.data.roomCode, '好友还没入席')
      return
    }

    // 更新回合信息
    const { me, opponent } = this._getPlayerPair(room, this.data.playerName)

    if (room.gameState.currentRound !== this.data.currentRound) {
      // 新回合开始
      this._stopTimer()
      const idiomText = me.role === 'hinter' ? room.gameState.currentIdiom : ''
      this._hintInput = ''
      this.setData({
        currentRound: room.gameState.currentRound,
        myRole: me.role,
        opponentName: opponent.playerName || '对手',
        idiomText,
        idiomChars: splitIdiomChars(idiomText),
        idiomMasked: me.role === 'guesser' ? '？？？？' : '',
        hints: [],
        hintInput: '',
        hintInputVisible: true,
        hintError: '',
        hintSubmitted: false,
        inputText: '',
        inputChars: ['', '', '', ''],
        canSubmit: false,
        guessError: '',
        status: 'playing',
        showResult: false,
        roundSeconds: 0,
        syncStatusText: '新一局已开桌。',
        hinterGuideText: buildHinterGuide(0),
        guesserGuideText: buildGuesserGuide(0),
        surrenderLoading: false,
      })
      this._startTimer()
      // 重新监听新回合的 hints
      if (this._hintWatcher) { this._hintWatcher.close() }
      this._hintWatcher = watchHints(this.data.roomCode, room.gameState.currentRound, {
        onUpdate: (hints) => {
          this.setData({
            hints,
            hinterGuideText: buildHinterGuide(hints.length),
            guesserGuideText: buildGuesserGuide(hints.length),
          })
        },
        onError: (err) => {
          console.warn('Hints sync error:', err)
          this.setData({ syncStatusText: '线索同步有点慢，正在重连。' })
        }
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
          roundEndHintText: buildRoundEndHint(lastResult),
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
    this._hintInput = Array.from(e.detail.value || '').join('')
    if (this.data.hintError) this.setData({ hintError: '' })
  },

  onHintBlur(e) {
    this._hintInput = Array.from(e.detail.value || '').join('')
  },

  _clearHintInput() {
    this._hintInput = ''
    this.setData({ hintInput: '', hintInputVisible: false })
    setTimeout(() => {
      this.setData({ hintInputVisible: true })
    }, 30)
  },

  async onSubmitHint() {
    if (this.data.myRole !== 'hinter') return
    const hintWord = (this._hintInput || '').trim()
    if (Array.from(hintWord).length !== 2) {
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
        this._clearHintInput()
        this.setData({ hintError: '', hintSubmitted: true })
        setTimeout(() => this.setData({ hintSubmitted: false }), 1500)
      } else {
        this.setData({ hintError: res.result.reason || res.result.error || '这枚线索递不出去，换一个试试' })
      }
      wx.vibrateShort({ type: 'light' })
    } catch (e) {
      console.error('submitHint error:', e)
      this.setData({ hintError: '线索没送到好友桌上，检查网络再递一次' })
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
        this.setData({ guessError: res.result.error || '这次没送上桌，再点一次' })
      }
    } catch (e) {
      console.error('submitGuess error:', e)
      this.setData({ guessError: '答案没送到好友桌上，检查网络再猜一次' })
    }
  },

  async onGiveUpRound() {
    if (this.data.myRole !== 'guesser' || this.data.status !== 'playing' || this.data.surrenderLoading) return
    this.setData({ surrenderLoading: true, guessError: '' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageRoom',
        data: {
          action: 'giveUp',
          roomCode: this.data.roomCode,
        }
      })
      if (res.result && res.result.ok) {
        this._stopTimer()
        this.setData({
          status: 'round_end',
          showResult: true,
          roundResult: res.result.roundResult,
          roundEndHintText: buildRoundEndHint(res.result.roundResult),
          surrenderLoading: false,
        })
      } else {
        this.setData({ surrenderLoading: false, guessError: res.result.error || '暂时揭不开答案，再试一次' })
      }
    } catch (e) {
      console.error('giveUpRound error:', e)
      this.setData({ surrenderLoading: false, guessError: '答案揭晓失败，检查网络再试' })
    }
  },

  /** ========== 回合推进 ========== */
  async onNextRound() {
    if (this._advancing || this.data.advancingRound) return
    this._advancing = true
    const data = this.data
    this.setData({ showResult: false, status: 'loading', advancingRound: true, syncStatusText: '正在收桌，准备下一局...' })

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
          const finalResults = buildFinalResults(res.result.room || {})
          this.setData({
            status: 'finished',
            showResult: true,
            finalResults,
          })
          this.prepareDuelShareImage(finalResults)
        } else {
          const room = res.result.room
          const { me, opponent } = this._getPlayerPair(room, data.playerName)
          const idiomText = me.role === 'hinter' ? room.gameState.currentIdiom : ''
          this._hintInput = ''
          this.setData({
            currentRound: room.gameState.currentRound,
            myRole: me.role,
            opponentName: opponent.playerName || '对手',
            idiomText,
            idiomChars: splitIdiomChars(idiomText),
            idiomMasked: me.role === 'guesser' ? '？？？？' : '',
            hints: [],
            hintInput: '',
            hintInputVisible: true,
            hintError: '',
            hintSubmitted: false,
            inputText: '',
            inputChars: ['', '', '', ''],
            canSubmit: false,
            guessError: '',
            status: 'playing',
            myScore: me.score,
            opponentScore: opponent.score,
            advancingRound: false,
            syncStatusText: '新一局已开桌。',
            hinterGuideText: buildHinterGuide(0),
            guesserGuideText: buildGuesserGuide(0),
            surrenderLoading: false,
          })
          this._startTimer()
          // 更新 hints 监听
          if (this._hintWatcher) { this._hintWatcher.close() }
          this._hintWatcher = watchHints(data.roomCode, room.gameState.currentRound, {
            onUpdate: (hints) => {
              this.setData({
                hints,
                hinterGuideText: buildHinterGuide(hints.length),
                guesserGuideText: buildGuesserGuide(hints.length),
              })
            },
            onError: (err) => {
              console.warn('Hints sync error:', err)
              this.setData({ syncStatusText: '线索同步有点慢，正在重连。' })
            }
          })
        }
      } else {
        this.setData({
          status: 'round_end',
          showResult: true,
          advancingRound: false,
          syncStatusText: res.result && res.result.error ? res.result.error : '下一局暂时开不了，再点一次。',
        })
      }
    } catch (e) {
      console.error('advanceRound error:', e)
      this.setData({
        status: 'round_end',
        showResult: true,
        advancingRound: false,
        syncStatusText: '收桌失败，检查网络后再点下一局。',
      })
    } finally {
      this._advancing = false
    }
  },

  /** 退出游戏 */
  onQuit() {
    wx.showModal({
      title: '收起这桌？',
      content: '退出会结束当前好友局，好友也会看到本桌已收起。',
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

  prepareDuelShareImage(finalResults) {
    const d = this.data
    const results = finalResults || d.finalResults || { rounds: [] }
    drawDuelShareCard(this, {
      roomText: d.totalRounds + ' 局好友对战',
      myName: d.playerName || '我',
      opponentName: d.opponentName || '好友',
      myScore: d.myScore || 0,
      opponentScore: d.opponentScore || 0,
      resultText: d.myScore >= d.opponentScore ? '我赢了这桌' : '我差点翻盘',
      rounds: results.rounds || [],
    }).then(path => {
      if (path) this.setData({ shareImagePath: path })
    })
  },

  onShareGame() {
    const d = this.data
    if (d.status === 'finished') {
      const resultText = d.myScore >= d.opponentScore ? '我赢了这桌' : '我差点翻盘'
      return {
        title: '成语好友局 · ' + resultText + ' ' + d.myScore + ':' + d.opponentScore + '\n来复仇开一桌',
        path: '/pages/room-lobby/room-lobby',
        imageUrl: d.shareImagePath || '',
      }
    }
    const path = d.roomCode
      ? '/pages/room-lobby/room-lobby?code=' + encodeURIComponent(d.roomCode)
      : '/pages/room-lobby/room-lobby'
    return {
      title: '成语好友局 · 我在桌上等你\n比分 ' + d.myScore + ':' + d.opponentScore,
      path,
      imageUrl: d.shareImagePath || '',
    }
  },

  onShareAppMessage() { return this.onShareGame() },
  onShareTimeline() {
    return {
      title: '成语好友局 · 来复仇开一桌',
      query: '',
      imageUrl: this.data.shareImagePath || '',
    }
  },
})
