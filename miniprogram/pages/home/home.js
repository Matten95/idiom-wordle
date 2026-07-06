const { getDailyIdiom, getToday, getHintPositions } = require('../../utils/daily')

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
    streakDays: 0,
    todayPlayed: false,
  },

  onLoad() {
    this.refreshHome()
  },

  onShow() {
    this.refreshHome()
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

      this.setData({
        dateDisplay,
        puzzleNumberText: `第 ${idiom.puzzleNumber} 题`,
        statusText: todayPlayed ? '今日已完成' : '今日待挑战',
        statusClass: todayPlayed ? 'status-done' : 'status-pending',
        primaryCtaText: todayPlayed ? '查看今日战绩' : '开始今日挑战',
        hintCells,
        revealedCountText: `已揭 ${revealedCount}/4`,
        streakText: streakDays > 0 ? `连胜 ${streakDays} 天` : '大众题池',
        dailyNote: this.pickDailyNote(idiom.puzzleNumber),
        statusChips,
        streakDays,
        todayPlayed,
      })
    } catch (e) {
      console.error('home onLoad error:', e)
      this.setData({
        dateDisplay: '今日',
        puzzleNumberText: '每日谜题',
        statusText: '稍后再试',
        statusClass: 'status-pending',
        primaryCtaText: '开始今日挑战',
        hintCells: this.buildFallbackCells(),
        revealedCountText: '已揭 0/4',
        streakText: '大众题池',
        dailyNote: '好题像一枚印章，落下去才知道轻重。',
        statusChips: [{ key: 'chance', text: '6 次机会' }],
      })
    }
  },

  buildHints(idiom) {
    const rads = idiom.radicals || []
    const posData = idiom.radicalPositions || []
    const pickPos = getHintPositions(idiom.date, posData)
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
})
