const { getDailyIdiom, getToday, getHintPositions } = require('../../utils/daily')
const { getPlayerName } = require('../../utils/player')
const { logEvent } = require('../../utils/telemetry')
const { fetchDailyPuzzle } = require('../../utils/cloud')

Page({
  data: {
    dateDisplay: '',
    puzzleNumberText: '',
    statusText: '',
    statusClass: '',
    primaryCtaText: '',
    hintCells: [],
    revealedCountText: '',
    streakText: '',
    dailyNote: '',
    statusChips: [],
    playerName: '',
    playerInitial: '成',
    playerTitle: '童生',
    streakDisplay: '0天',
    todaySealText: '待破题',
    todayGoalText: '首胜 +1',
    actionCards: [],
    rallyText: '',
    streakDays: 0,
    todayPlayed: false,
    showGuide: false,
  },

  onLoad() {
    this.refreshHome()
  },

  onShow() {
    this.refreshHome()
    logEvent('enter_home', { date: getToday() })
  },

  refreshHome() {
    try {
      const today = getToday()
      const idiom = getDailyIdiom(today)
      const parts = today.split('-')
      const dateDisplay = `${parseInt(parts[1])}月${parseInt(parts[2])}日`
      const { hintCells, revealedCount } = this.buildHints(idiom)
      const streakDays = wx.getStorageSync('streakDays') || 0
      const lastPlayDate = wx.getStorageSync('lastPlayDate') || ''
      const todayPlayed = lastPlayDate === today
      const statusChips = this.buildStatusChips(streakDays, todayPlayed)
      const playerName = getPlayerName()

      this.setData({
        dateDisplay,
        puzzleNumberText: `第 ${idiom.puzzleNumber} 题`,
        statusText: todayPlayed ? '今日已通关' : '今日未破题',
        statusClass: todayPlayed ? 'status-done' : 'status-pending',
        primaryCtaText: todayPlayed ? '回看今日战绩' : '开猜今日成语',
        hintCells,
        revealedCountText: `已揭 ${revealedCount}/4`,
        streakText: streakDays > 0 ? `连胜 ${streakDays} 天` : '常见题池',
        dailyNote: this.pickDailyNote(idiom.puzzleNumber),
        statusChips,
        playerName,
        playerInitial: this.buildInitial(playerName),
        playerTitle: this.buildPlayerTitle(streakDays),
        streakDisplay: `${streakDays}天`,
        todaySealText: todayPlayed ? '已盖章' : '待破题',
        todayGoalText: todayPlayed ? '去好友局复仇' : '首胜 +1 印章',
        actionCards: this.buildActionCards(todayPlayed),
        rallyText: todayPlayed ? '今日已通关，去今日排行看看谁更快。' : '今日谜题已上新，先破主局再练手。',
        streakDays,
        todayPlayed,
      })
      this.refreshSecurePuzzle(today)
    } catch (e) {
      console.error('home onLoad error:', e)
      const playerName = getPlayerName()
      this.setData({
        dateDisplay: '今日',
        puzzleNumberText: '每日谜题',
        statusText: '稍后再试',
        statusClass: 'status-pending',
        primaryCtaText: '开猜今日成语',
        hintCells: this.buildFallbackCells(),
        revealedCountText: '已揭 0/4',
        streakText: '常见题池',
        dailyNote: '好题像一枚印章，落下去才知道轻重。',
        statusChips: [{ key: 'chance', text: '6 次机会' }],
        playerName,
        playerInitial: this.buildInitial(playerName),
        playerTitle: this.buildPlayerTitle(0),
        streakDisplay: '0天',
        todaySealText: '待破题',
        todayGoalText: '首胜 +1 印章',
        actionCards: this.buildActionCards(false),
        rallyText: '今日谜题已上新，先破主局再练手。',
      })
    }
  },

  refreshSecurePuzzle(today) {
    fetchDailyPuzzle(today).then(res => {
      if (!res.ok || !res.puzzle) return
      const { hintCells, revealedCount } = this.buildHints(res.puzzle)
      this.setData({
        puzzleNumberText: `第 ${res.puzzle.puzzleNumber} 题`,
        hintCells,
        revealedCountText: `已揭 ${revealedCount}/4`,
        dailyNote: this.pickDailyNote(res.puzzle.puzzleNumber),
      })
    })
  },

  buildInitial(name) {
    return Array.from(name || '成')[0] || '成'
  },

  buildPlayerTitle(streakDays) {
    if (streakDays >= 7) return '举人'
    if (streakDays >= 3) return '秀才'
    return '童生'
  },

  buildHints(idiom) {
    if (idiom.hintRadicals) {
      const indexLabels = ['一', '二', '三', '四']
      const hintCells = indexLabels.map((label, index) => {
        const radical = idiom.hintRadicals[index] || '?'
        const hasHint = radical !== '?'
        return {
          key: `cell-${index}`,
          indexLabel: label,
          radical,
          hasHint,
          toneClass: hasHint ? 'cell-revealed' : 'cell-hidden',
          positionClass: `hint-${idiom.hintPositions[index] || 'center'}`,
        }
      })
      return { hintCells, revealedCount: hintCells.filter(cell => cell.hasHint).length }
    }
    const rads = idiom.radicals || []
    const posData = idiom.radicalPositions || []
    const pickPos = getHintPositions(idiom.date, posData, rads, idiom.chars)
    const indexLabels = ['一', '二', '三', '四']
    const hintCells = indexLabels.map((label, index) => {
      const hasHint = Boolean(pickPos.includes(index) && rads[index])
      const position = posData[index] || 'center'
      return {
        key: `cell-${index}`,
        indexLabel: label,
        radical: hasHint ? rads[index] : '?',
        hasHint,
        toneClass: hasHint ? 'cell-revealed' : 'cell-hidden',
        positionClass: `hint-${position}`,
      }
    })
    const revealedCount = hintCells.filter(cell => cell.hasHint).length
    return { hintCells, revealedCount }
  },

  buildFallbackCells() {
    return ['一', '二', '三', '四'].map((label, index) => ({
      key: `cell-${index}`,
      indexLabel: label,
      radical: '?',
      hasHint: false,
      toneClass: 'cell-hidden',
      positionClass: 'hint-center',
    }))
  },

  buildStatusChips(streakDays, todayPlayed) {
    const chips = [{ key: 'chance', text: '6 次机会' }]
    if (streakDays > 0) {
      chips.push({ key: 'streak', text: `连胜 ${streakDays} 天` })
    }
    if (todayPlayed) {
      chips.push({ key: 'done', text: '战绩可回看' })
    } else {
      chips.push({ key: 'pool', text: '默认常见成语' })
    }
    return chips
  },

  buildActionCards(todayPlayed) {
    return [
      {
        key: 'hint',
        icon: '谜',
        name: '提示猜词',
        desc: '五条线索破题',
        badge: '新题',
        className: 'action-hint',
        action: 'hint',
      },
      {
        key: 'practice',
        icon: '练',
        name: '自由练习',
        desc: '常见题热身',
        badge: todayPlayed ? '再来' : '热身',
        className: 'action-practice',
        action: 'practice',
      },
      {
        key: 'two',
        icon: '友',
        name: '好友开局',
        desc: '邀好友互猜',
        badge: '可邀',
        className: 'action-two',
        action: 'two',
      },
    ]
  },

  pickDailyNote(puzzleNumber) {
    const notes = [
      '典故常把一瞬的选择，压成四个字。',
      '越像日常话的成语，越可能藏着古人的锋芒。',
      '部首像题面的裂缝，先看形，再听音。',
      '四个字排成一行，常常是一段故事的余音。',
      '好的谜面不急着揭晓，只把方向轻轻点亮。',
    ]
    return notes[puzzleNumber % notes.length]
  },

  onStartGame() {
    logEvent('start_daily', { date: getToday(), from: 'home' })
    wx.navigateTo({ url: '/pages/index/index' })
  },

  onStartPractice() {
    wx.navigateTo({ url: '/pages/index/index?mode=practice' })
  },

  onLeaderboard() {
    wx.reLaunch({ url: '/pages/history/history' })
  },

  onProfile() {
    wx.reLaunch({ url: '/pages/profile/profile' })
  },

  onIdiomMatch() {
    wx.navigateTo({ url: '/pages/idiom-match/idiom-match' })
  },

  onTwoPlayer() {
    wx.navigateTo({ url: '/pages/room-lobby/room-lobby' })
  },

  onActionTap(e) {
    const action = e.currentTarget.dataset.action
    if (action === 'hint') this.onIdiomMatch()
    else if (action === 'practice') this.onStartPractice()
    else if (action === 'two') this.onTwoPlayer()
  },

  onShowGuide() {
    this.setData({ showGuide: true })
  },

  onHideGuide() {
    this.setData({ showGuide: false })
  },

  onStopGuideTap() {},
})
