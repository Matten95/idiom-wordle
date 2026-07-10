/**
 * 云开发辅助模块
 * 排行榜只接受服务端逐次判分的可信成绩；云端不可用时不伪装为全网数据。
 */
const { saveGameResult } = require('./engine')

function isCloudReady() {
  var app = getApp()
  return app && app.globalData && app.globalData.cloudReady
}

function unavailable(error) {
  return {
    ok: false,
    unavailable: true,
    code: error && error.code || 'CLOUD_UNAVAILABLE',
    error: error && (error.error || error.message) || '云端暂时不可用',
  }
}

function callDailyGame(action, data) {
  if (!isCloudReady()) return Promise.resolve(unavailable())
  return wx.cloud.callFunction({
    name: 'submitResult',
    data: Object.assign({ action: action }, data || {}),
  }).then(function (res) {
    return res.result && res.result.ok ? res.result : unavailable(res.result || {})
  }).catch(function (error) {
    console.warn('可信每日局调用失败:', error.message)
    return unavailable(error)
  })
}

function fetchDailyPuzzle(date) {
  return callDailyGame('puzzle', { date: date })
}

function startDailyGame(date) {
  return callDailyGame('start', { date: date })
}

function submitDailyGuess(date, guessText) {
  var getPlayerName = require('./player').getPlayerName
  return callDailyGame('guess', {
    date: date,
    guessText: guessText,
    playerName: getPlayerName(),
  })
}

function saveLocalGameResult(game) {
  saveGameResult(game)
  return { local: true }
}

function fetchRanking(date) {
  if (!isCloudReady()) return Promise.resolve({ source: 'unavailable', unavailable: true, rankList: [] })
  return wx.cloud.callFunction({
    name: 'getRanking',
    data: { date: date, limit: 50 },
  }).then(function (res) {
    if (res.result && res.result.ok) {
      return {
        source: 'cloud',
        rankList: res.result.rankList || [],
        stats: res.result.stats || {},
        total: res.result.total || 0,
      }
    }
    return { source: 'unavailable', unavailable: true, rankList: [], error: res.result && res.result.error }
  }).catch(function (error) {
    console.warn('云端排行获取失败:', error.message)
    return { source: 'unavailable', unavailable: true, rankList: [], error: error.message }
  })
}

function fetchDailyStats(date) {
  if (!isCloudReady()) return Promise.resolve({ source: 'unavailable', unavailable: true, stats: {} })
  return wx.cloud.callFunction({
    name: 'getRanking',
    data: { date: date, onlyStats: true },
  }).then(function (res) {
    if (res.result && res.result.ok && res.result.stats) {
      return { source: 'cloud', stats: res.result.stats }
    }
    return { source: 'unavailable', unavailable: true, stats: {} }
  }).catch(function (error) {
    console.warn('云端统计获取失败:', error.message)
    return { source: 'unavailable', unavailable: true, stats: {} }
  })
}

module.exports = {
  fetchDailyPuzzle,
  startDailyGame,
  submitDailyGuess,
  saveLocalGameResult,
  fetchRanking,
  fetchDailyStats,
  isCloudReady,
}
