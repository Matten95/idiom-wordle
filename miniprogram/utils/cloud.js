/**
 * 云开发辅助模块
 * 封装云函数调用，自动降级到本地存储
 */
const { loadHistory, saveGameResult } = require('./engine')

function isCloudReady() {
  var app = getApp()
  return app && app.globalData && app.globalData.cloudReady
}

/** 提交游戏结果（云端 + 本地双写） */
function submitGameResult(game) {
  // 始终保存本地记录
  saveGameResult(game)

  // 尝试同步到云端
  if (isCloudReady()) {
    var getPlayerName = require('./player').getPlayerName
    return wx.cloud.callFunction({
      name: 'submitResult',
      data: {
        date: game.date,
        answerText: game.answer ? game.answer.text : '',
        attempts: game.attempts.length,
        won: game.status === 'won',
        playerName: getPlayerName(),
      },
    }).then(function (res) {
      return { cloud: res.result, local: true }
    }).catch(function (e) {
      console.warn('云端提交失败，仅保存本地:', e.message)
      return { local: true }
    })
  }
  return Promise.resolve({ local: true })
}

/** 获取排行榜（优先云端，降级本地） */
function fetchRanking(date) {
  if (isCloudReady()) {
    return wx.cloud.callFunction({
      name: 'getRanking',
      data: { date: date, limit: 50 },
    }).then(function (res) {
      if (res.result && res.result.ok && res.result.rankList && res.result.rankList.length > 0) {
        return { source: 'cloud', rankList: res.result.rankList }
      }
      // 云端返回空，降级本地
      return loadLocalRanking()
    }).catch(function (e) {
      console.warn('云端排行获取失败，使用本地:', e.message)
      return loadLocalRanking()
    })
  }
  return Promise.resolve(loadLocalRanking())
}

function fetchDailyStats(date) {
  if (isCloudReady()) {
    return wx.cloud.callFunction({
      name: 'getRanking',
      data: { date: date, onlyStats: true },
    }).then(function (res) {
      if (res.result && res.result.ok && res.result.stats) {
        return { source: 'cloud', stats: res.result.stats }
      }
      return { source: 'local', stats: buildLocalStats(date) }
    }).catch(function (e) {
      console.warn('云端统计获取失败，使用本地:', e.message)
      return { source: 'local', stats: buildLocalStats(date) }
    })
  }
  return Promise.resolve({ source: 'local', stats: buildLocalStats(date) })
}

function buildLocalStats(date) {
  var history = loadHistory().filter(function (h) { return !date || h.date === date })
  var won = history.filter(function (h) { return h.won })
  var attemptDist = [0, 0, 0, 0, 0, 0]
  won.forEach(function (h) {
    if (h.attempts >= 1 && h.attempts <= 6) attemptDist[h.attempts - 1] += 1
  })
  return {
    total: history.length,
    winCount: won.length,
    loseCount: history.length - won.length,
    winRate: history.length > 0 ? Math.round(won.length * 100 / history.length) : 0,
    attemptDist: attemptDist,
  }
}

function loadLocalRanking() {
  var getPlayerName = require('./player').getPlayerName
  var history = loadHistory()
  history.sort(function (a, b) { return b.date.localeCompare(a.date) })
  var rankList = history.map(function (h, idx) {
    return {
      rank: idx + 1,
      player: getPlayerName(),
      answerText: h.answerText || '???',
      attempts: h.attempts,
      won: h.won,
      date: h.date,
    }
  })
  return { source: 'local', rankList: rankList }
}

module.exports = { submitGameResult, fetchRanking, fetchDailyStats, isCloudReady }
