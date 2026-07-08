const { loadHistory } = require('../../utils/engine')
const { getToday } = require('../../utils/daily')
const { getPlayerName } = require('../../utils/player')
const { fetchRanking } = require('../../utils/cloud')

Page({
  data: {
    dateTitle: '',
    dateSubtitle: '',
    rankList: [],
    source: 'local',  // 'cloud' | 'local'
  },

  onShow() {
    this.loadData()
  },

  loadData() {
    const today = getToday()
    const parts = today.split('-')
    const dateTitle = `${parseInt(parts[1])}月${parseInt(parts[2])}日 历史印记`
    var self = this

    this.setData({
      dateTitle: dateTitle,
      dateSubtitle: '正在翻开今日印册...',
    })

    // 尝试从云端获取排行
    fetchRanking(today).then(function (result) {
      // 云端返回空结果时降级到本地
      if (!result.rankList || result.rankList.length === 0) {
        return loadLocalRanking()
      }
      var rankList = result.rankList.map(function (h) {
        return {
          rank: h.rank || 1,
          player: h.player || getPlayerName(),
          answerText: h.answerText || '???',
          attempts: h.attempts,
          won: h.won,
          boxes: self.buildBoxes(h.won, h.attempts, h.emojiGrid),
        }
      })
      self.setData({
        dateTitle: dateTitle,
        dateSubtitle: buildSubtitle(rankList.length),
        rankList: rankList,
        source: result.source || 'local',
      })
    }).catch(function () {
      loadLocalRanking()
    })

    function loadLocalRanking() {
      var history = loadHistory()
      history.sort(function (a, b) { return b.date.localeCompare(a.date) })
      var rankList = history.map(function (h, idx) {
        return {
          rank: idx + 1,
          player: getPlayerName(),
          answerText: h.answerText || '???',
          attempts: h.attempts,
          won: h.won,
          boxes: self.buildBoxes(h.won, h.attempts, h.emojiGrid),
        }
      })
      self.setData({ dateTitle: dateTitle, dateSubtitle: buildSubtitle(rankList.length), rankList: rankList, source: 'local' })
    }

    function buildSubtitle(count) {
      return count > 0 ? '收录 ' + count + ' 枚今日破题印记' : '还没有新的破题足迹'
    }
  },

  buildBoxes(won, attempts, emojiGrid) {
    // 有真实 emoji 数据时，取最后一行映射为颜色 class
    if (emojiGrid && emojiGrid.length > 0) {
      var lastRow = emojiGrid[emojiGrid.length - 1]
      var map = { '🟩': 'correct', '🟦': 'pinyin', '🟨': 'present', '🟪': 'partial', '⬛': 'absent' }
      return Array.from(lastRow).map(function(emoji) {
        return map[emoji] || 'empty'
      })
    }
    // 回退：云端记录没有 emoji 数据
    var boxes = []
    for (var i = 1; i <= 6; i++) {
      if (!won && i <= attempts) {
        boxes.push('absent')
      } else if (!won && i > attempts) {
        boxes.push('empty')
      } else if (i < attempts) {
        boxes.push('absent')
      } else if (i === attempts) {
        boxes.push('correct')
      } else {
        boxes.push('empty')
      }
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
