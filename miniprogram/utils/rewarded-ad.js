const config = require('../config')
const { logEvent } = require('./telemetry')

function shouldBypassRewardedAd() {
  try {
    if (!wx.getAccountInfoSync) return false
    const info = wx.getAccountInfoSync()
    const mini = info && info.miniProgram
    const envVersion = mini && mini.envVersion
    const appId = mini && mini.appId
    return !appId || (envVersion && envVersion !== 'release')
  } catch (e) {
    return false
  }
}

function getRewardedAdUnitId(key) {
  const ids = config.rewardedVideoAds || {}
  return ids[key] || ''
}

function isConfigured(adUnitId) {
  return adUnitId && adUnitId.indexOf('xxxxxxxx') === -1
}

function watchRewardedAd(options) {
  const opts = options || {}
  const placement = opts.placement || 'reward'
  const adUnitId = opts.adUnitId || getRewardedAdUnitId(opts.adKey)

  if (shouldBypassRewardedAd()) {
    logEvent('watch_ad_done', { placement, source: 'dev_bypass' })
    return Promise.resolve({ ok: true, source: 'dev_bypass' })
  }
  if (!isConfigured(adUnitId)) {
    logEvent('watch_ad_done', { placement, source: 'unconfigured' })
    return Promise.resolve({ ok: true, source: 'unconfigured' })
  }
  if (!wx.createRewardedVideoAd) {
    return Promise.resolve({ ok: true, source: 'unsupported' })
  }

  return new Promise(resolve => {
    let settled = false
    let ad = null

    function done(result) {
      if (settled) return
      settled = true
      if (ad && ad.offClose) ad.offClose(onClose)
      if (ad && ad.offError) ad.offError(onError)
      if (result.ok) logEvent('watch_ad_done', { placement, source: result.source || 'ad' })
      resolve(result)
    }

    function onClose(res) {
      if (!res || res.isEnded) {
        done({ ok: true, source: 'ad' })
        return
      }
      done({ ok: false, cancelled: true, source: 'ad' })
    }

    function onError(err) {
      console.warn('rewarded ad error:', err)
      done({ ok: true, source: 'fallback', error: err && (err.errMsg || err.message) })
    }

    try {
      ad = wx.createRewardedVideoAd({ adUnitId })
      ad.onClose(onClose)
      ad.onError(onError)
      ad.show().catch(() => {
        ad.load()
          .then(() => ad.show())
          .catch(onError)
      })
    } catch (err) {
      onError(err)
    }
  })
}

module.exports = {
  getRewardedAdUnitId,
  shouldBypassRewardedAd,
  watchRewardedAd,
}
