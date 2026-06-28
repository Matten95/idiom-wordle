const { getDailyIdiom, getToday, getHintPositions } = require('../../utils/daily')

Page({
  data: {
    dateDisplay: '',
    hintRadicals: ['?', '?', '?', '?'],
    hintPositions: ['', '', '', ''],
    streakDays: 0,
    todayPlayed: false,
  },

  onLoad() {
    try {
      const today = getToday()
      const idiom = getDailyIdiom(today)
      const parts = today.split('-')
      const dateDisplay = `${parseInt(parts[1])}月${parseInt(parts[2])}日`
      const { radicals, positions } = this.buildHints(idiom)
      const streakDays = wx.getStorageSync('streakDays') || 0
      const lastPlayDate = wx.getStorageSync('lastPlayDate') || ''
      const todayPlayed = lastPlayDate === today
      this.setData({ dateDisplay, hintRadicals: radicals, hintPositions: positions, streakDays, todayPlayed })
    } catch (e) {
      console.error('home onLoad error:', e)
      this.setData({ dateDisplay: '...' })
    }
  },

  buildHints(idiom) {
    const rads = idiom.radicals || []
    const posData = idiom.radicalPositions || []
    const pickPos = getHintPositions(undefined, posData)
    const radicals = ['?', '?', '?', '?']
    const positions = ['', '', '', '']
    pickPos.forEach(p => {
      radicals[p] = rads[p]
      positions[p] = posData[p] || 'center'
    })
    return { radicals, positions }
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
})
