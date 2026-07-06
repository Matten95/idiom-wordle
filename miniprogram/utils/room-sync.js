/**
 * 房间实时同步工具
 * 封装云数据库 .watch() + polling 降级
 */
const { isCloudReady } = require('./cloud')

const POLL_INTERVAL_MS = 2000

/** 判断是否需要降级到 polling */
function shouldUsePolling() {
  try {
    const sys = wx.getSystemInfoSync()
    if (sys.platform === 'devtools') return true
    return false
  } catch (e) {
    return true
  }
}

/**
 * 监听房间状态变更
 * @param {string} roomCode
 * @param {object} callbacks - { onUpdate(room), onError(err) }
 * @returns {{ close: function }} 调用 close() 停止监听
 */
function watchRoom(roomCode, callbacks) {
  if (!isCloudReady()) {
    console.warn('Cloud not ready, using polling for room watch')
    return _pollRoom(roomCode, callbacks)
  }

  if (shouldUsePolling()) {
    return _pollRoom(roomCode, callbacks)
  }

  var db = wx.cloud.database()
  var watcher = db.collection('idiom_rooms')
    .where({ roomCode: roomCode })
    .watch({
      onChange: function (snapshot) {
        if (snapshot.docs && snapshot.docs.length > 0) {
          callbacks.onUpdate(snapshot.docs[0])
        }
      },
      onError: function (err) {
        console.warn('Room watch error, falling back to polling:', err)
        watcher.close()
        _pollRoom(roomCode, callbacks)
      }
    })

  return {
    close: function () {
      try { watcher.close() } catch (e) { /* ignore */ }
    }
  }
}

/** Polling 降级：定时读取房间状态 */
function _pollRoom(roomCode, callbacks) {
  var timer = setInterval(function () {
    wx.cloud.callFunction({
      name: 'getRoomState',
      data: { roomCode: roomCode }
    }).then(function (res) {
      if (res.result && res.result.ok && res.result.room) {
        callbacks.onUpdate(res.result.room)
      }
    }).catch(function (err) {
      console.warn('Room poll error:', err)
      if (callbacks.onError) callbacks.onError(err)
    })
  }, POLL_INTERVAL_MS)

  return {
    close: function () { clearInterval(timer) }
  }
}

/**
 * 监听当前轮次的提示词（用于猜词者侧）
 * @param {string} roomCode
 * @param {number} round
 * @param {object} callbacks - { onUpdate(hints[]), onError(err) }
 * @returns {{ close: function }}
 */
function watchHints(roomCode, round, callbacks) {
  if (!isCloudReady()) {
    return _pollHints(roomCode, round, callbacks)
  }

  if (shouldUsePolling()) {
    return _pollHints(roomCode, round, callbacks)
  }

  var db = wx.cloud.database()
  var watcher = db.collection('idiom_hints_live')
    .where({ roomCode: roomCode, round: round })
    .watch({
      onChange: function (snapshot) {
        var hints = (snapshot.docs || [])
          .map(function (doc) { return { word: doc.hintWord, submittedAt: doc.submittedAt } })
          .sort(function (a, b) { return (a.submittedAt || 0) - (b.submittedAt || 0) })
        callbacks.onUpdate(hints)
      },
      onError: function (err) {
        console.warn('Hints watch error, falling back to polling:', err)
        watcher.close()
        _pollHints(roomCode, round, callbacks)
      }
    })

  return {
    close: function () {
      try { watcher.close() } catch (e) { /* ignore */ }
    }
  }
}

/** Polling 降级：定时读取 hints */
function _pollHints(roomCode, round, callbacks) {
  var lastCount = -1
  var timer = setInterval(function () {
    wx.cloud.callFunction({
      name: 'getRoomState',
      data: { roomCode: roomCode }
    }).then(function (res) {
      if (res.result && res.result.ok) {
        var hints = (res.result.hints || [])
          .map(function (doc) { return { word: doc.hintWord, submittedAt: doc.submittedAt } })
          .sort(function (a, b) { return (a.submittedAt || 0) - (b.submittedAt || 0) })
        if (hints.length !== lastCount) {
          lastCount = hints.length
          callbacks.onUpdate(hints)
        }
      }
    }).catch(function (err) {
      console.warn('Hints poll error:', err)
      if (callbacks.onError) callbacks.onError(err)
    })
  }, POLL_INTERVAL_MS)

  return {
    close: function () { clearInterval(timer) }
  }
}

module.exports = { watchRoom, watchHints }
