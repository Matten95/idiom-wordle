const config = require('../config')
const { getToday, getYesterday } = require('./daily')
const { logEvent } = require('./telemetry')
const { watchRewardedAd } = require('./rewarded-ad')

const REMINDER_KEY = 'idiom_daily_reminder_enabled'
const SHIELD_KEY = 'idiom_streak_shields'
const SHIELD_CLAIM_KEY = 'idiom_streak_shield_claimed_date'
const STREAK_RECOVER_KEY = 'idiom_streak_recoverable'

function requestDailyReminder() {
  const tmplId = config.subscribeTemplates.dailyReminder
  if (!tmplId || !wx.requestSubscribeMessage) {
    try { wx.setStorageSync(REMINDER_KEY, true) } catch (e) {}
    logEvent('subscribe_daily', { configured: false })
    return Promise.resolve({ ok: true, fallback: true })
  }
  return new Promise(resolve => {
    wx.requestSubscribeMessage({
      tmplIds: [tmplId],
      success(res) {
        const accepted = res[tmplId] === 'accept'
        try { wx.setStorageSync(REMINDER_KEY, accepted) } catch (e) {}
        logEvent('subscribe_daily', { configured: true, accepted })
        if (accepted && isCloudReady()) {
          wx.cloud.callFunction({
            name: 'subscribeDaily',
            data: { action: 'save', templateKey: 'dailyReminder' },
          }).catch(function (e) {
            console.warn('subscribeDaily failed:', e.message || e.errMsg || e)
          })
        }
        resolve({ ok: true, accepted })
      },
      fail(err) {
        logEvent('subscribe_daily', { configured: true, failed: true })
        resolve({ ok: false, error: err.errMsg || err.message || '订阅失败' })
      },
    })
  })
}

function isCloudReady() {
  const app = getApp()
  return app && app.globalData && app.globalData.cloudReady && wx.cloud
}

function getShieldCount() {
  try { return wx.getStorageSync(SHIELD_KEY) || 0 } catch (e) { return 0 }
}

function grantStreakShield(source) {
  const today = getToday()
  try {
    const claimed = wx.getStorageSync(SHIELD_CLAIM_KEY) || ''
    if (claimed === today) return { ok: false, reason: 'today_claimed', count: getShieldCount() }
    const count = Math.min(3, getShieldCount() + 1)
    wx.setStorageSync(SHIELD_KEY, count)
    wx.setStorageSync(SHIELD_CLAIM_KEY, today)
    logEvent('claim_streak_shield', { source: source || 'result', count })
    return { ok: true, count }
  } catch (e) {
    return { ok: false, reason: e.message || 'storage_failed', count: getShieldCount() }
  }
}

function markStreakRecoverable(today, lastDate, streak) {
  if (!today || !lastDate) return
  try {
    wx.setStorageSync(STREAK_RECOVER_KEY, {
      date: today,
      lastDate,
      streakBeforeBreak: streak || 0,
      createdAt: Date.now(),
    })
  } catch (e) {}
}

function clearStreakRecoverable() {
  try { wx.removeStorageSync(STREAK_RECOVER_KEY) } catch (e) {}
}

function getStreakRecoverable(today) {
  try {
    const data = wx.getStorageSync(STREAK_RECOVER_KEY)
    if (!data || data.date !== (today || getToday())) return null
    return data
  } catch (e) {
    return null
  }
}

function tryUseStreakShield(today) {
  const date = today || getToday()
  const lastDate = wx.getStorageSync('lastPlayDate') || ''
  if (!lastDate || lastDate === date || lastDate === getYesterday(date)) return { used: false }

  const count = getShieldCount()
  if (count <= 0) return { used: false }

  const streak = wx.getStorageSync('streakDays') || 0
  wx.setStorageSync(SHIELD_KEY, count - 1)
  wx.setStorageSync('lastPlayDate', getYesterday(date))
  wx.setStorageSync('streakDays', Math.max(1, streak))
  logEvent('use_streak_shield', { lastDate, date, left: count - 1 })
  return { used: true, left: count - 1 }
}

function repairStreakWithReward(source) {
  const today = getToday()
  const recoverable = getStreakRecoverable(today)
  if (!recoverable) return { ok: false, reason: 'not_recoverable' }
  const currentLastDate = wx.getStorageSync('lastPlayDate') || ''
  const currentStreak = wx.getStorageSync('streakDays') || 0
  const base = Math.max(1, recoverable.streakBeforeBreak || 0)
  const repaired = currentLastDate === today
    ? Math.max(currentStreak, base + 1)
    : Math.max(currentStreak, base)
  wx.setStorageSync('streakDays', repaired)
  wx.setStorageSync('lastPlayDate', currentLastDate === today ? today : getYesterday(today))
  clearStreakRecoverable()
  logEvent('repair_streak', { source: source || 'rewarded_ad', streak: repaired })
  return { ok: true, streak: repaired }
}

function claimShieldOrRepairWithAd(source) {
  return watchRewardedAd({ adKey: 'streakShield', placement: 'streak_shield' }).then(function (adRes) {
    if (!adRes.ok) return { ok: false, cancelled: true }
    const recoverable = getStreakRecoverable()
    if (recoverable) {
      const repaired = repairStreakWithReward(source || adRes.source)
      return { ...repaired, repaired: true, adSource: adRes.source }
    }
    const shield = grantStreakShield(source || adRes.source || 'rewarded_ad')
    return { ...shield, repaired: false, adSource: adRes.source }
  })
}

function getRetentionState() {
  let reminderEnabled = false
  try { reminderEnabled = Boolean(wx.getStorageSync(REMINDER_KEY)) } catch (e) {}
  const recoverable = getStreakRecoverable()
  return {
    reminderEnabled,
    shieldCount: getShieldCount(),
    streakRecoverable: Boolean(recoverable),
    recoverableStreak: recoverable ? recoverable.streakBeforeBreak || 0 : 0,
  }
}

module.exports = {
  requestDailyReminder,
  grantStreakShield,
  markStreakRecoverable,
  tryUseStreakShield,
  claimShieldOrRepairWithAd,
  clearStreakRecoverable,
  getRetentionState,
}
