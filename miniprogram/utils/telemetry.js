const EVENT_QUEUE_KEY = 'idiom_event_queue'

function isCloudReady() {
  try {
    const app = getApp()
    return app && app.globalData && app.globalData.cloudReady && wx.cloud
  } catch (e) {
    return false
  }
}

function safePayload(payload) {
  const data = payload || {}
  try {
    return JSON.parse(JSON.stringify(data))
  } catch (e) {
    return { note: 'unserializable_payload' }
  }
}

function logEvent(name, payload) {
  if (!name) return Promise.resolve({ skipped: true })
  const event = {
    name,
    payload: safePayload(payload),
    clientTime: Date.now(),
  }

  try {
    const queue = wx.getStorageSync(EVENT_QUEUE_KEY) || []
    queue.push(event)
    wx.setStorageSync(EVENT_QUEUE_KEY, queue.slice(-50))
  } catch (e) { /* ignore */ }

  if (wx.reportEvent) {
    try {
      wx.reportEvent(name, event.payload)
    } catch (e) { /* ignore */ }
  }

  if (!isCloudReady()) return Promise.resolve({ local: true })
  return wx.cloud.callFunction({
    name: 'logEvent',
    data: event,
  }).then(res => res.result || { ok: true }).catch(e => {
    console.warn('logEvent failed:', e.message || e.errMsg || e)
    return { local: true }
  })
}

function reportError(source, error, extra) {
  const err = error || {}
  return logEvent('app_error', {
    source,
    message: err.message || err.errMsg || String(err),
    stack: err.stack || '',
    extra: safePayload(extra),
  })
}

module.exports = { logEvent, reportError }
