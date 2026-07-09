// 云函数：最小埋点与异常上报
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ALLOWED_EVENTS = new Set([
  'app_launch',
  'app_error',
  'enter_home',
  'start_daily',
  'submit_guess',
  'win',
  'lose',
  'use_hint',
  'watch_ad_done',
  'share_tap',
  'share_open',
  'share_image_ready',
  'subscribe_daily',
  'claim_streak_shield',
  'use_streak_shield',
  'repair_streak',
  'daily_compare_loaded',
  'create_room',
  'join_room',
])

function safeName(name) {
  return ALLOWED_EVENTS.has(name) ? name : 'unknown_event'
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const name = safeName(event.name)
  const payload = event.payload || {}

  try {
    await db.collection('idiom_events').add({
      data: {
        openid: wxContext.OPENID || '',
        appid: wxContext.APPID || '',
        name,
        payload,
        clientTime: event.clientTime || 0,
        createdAt: new Date(),
      }
    })
    return { ok: true }
  } catch (e) {
    console.error('logEvent error:', e)
    return { ok: false, error: e.message }
  }
}
