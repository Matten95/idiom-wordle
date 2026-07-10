const { getToday } = require('../../utils/daily')
const { getPlayerName } = require('../../utils/player')
const { fetchRanking } = require('../../utils/cloud')

Page({
  data: {
    dateTitle: '',
    dateSubtitle: '',
    rankList: [],
    source: 'cloud',
    loading: false,
    unavailable: false,
  },

  onShow() {
    this.loadData()
  },

  loadData() {
    const today = getToday()
    const parts = today.split('-')
    const dateTitle = `${parseInt(parts[1])}月${parseInt(parts[2])}日 今日榜`

    this.setData({
      dateTitle,
      dateSubtitle: '正在翻开今日榜册...',
      rankList: [],
      loading: true,
      unavailable: false,
    })

    fetchRanking(today).then(result => {
      if (result.unavailable) {
        this.setData({
          dateSubtitle: '全网榜暂时没有连上',
          rankList: [],
          loading: false,
          unavailable: true,
          source: 'unavailable',
        })
        return
      }
      const rankList = (result.rankList || []).map(h => ({
        rank: h.rank || 1,
        player: h.player || getPlayerName(),
        attempts: h.attempts,
        won: h.won,
        verified: h.verified === true,
        resultText: h.won ? `${h.attempts} 次破题` : '今日未破',
        boxes: this.buildBoxes(h.won, h.attempts, h.emojiGrid),
      }))
      this.setData({
        dateSubtitle: rankList.length > 0 ? `收录 ${rankList.length} 位今日玩家` : '还没有可信成绩，等你来开榜',
        rankList,
        source: 'cloud',
        loading: false,
        unavailable: false,
      })
    })
  },

  buildBoxes(won, attempts, emojiGrid) {
    if (emojiGrid && emojiGrid.length > 0) {
      const lastRow = emojiGrid[emojiGrid.length - 1]
      const map = { '🟩': 'correct', '🟦': 'pinyin', '🟨': 'present', '🟪': 'partial', '⬛': 'absent' }
      return Array.from(lastRow).map(emoji => map[emoji] || 'empty')
    }
    const boxes = []
    for (let i = 1; i <= 6; i++) {
      if (!won && i <= attempts) boxes.push('absent')
      else if (!won) boxes.push('empty')
      else if (i < attempts) boxes.push('absent')
      else if (i === attempts) boxes.push('correct')
      else boxes.push('empty')
    }
    return boxes
  },

  onGoHome() {
    wx.reLaunch({ url: '/pages/home/home' })
  },

  onGoProfile() {
    wx.reLaunch({ url: '/pages/profile/profile' })
  },
})
