// 成语猜猜猜 - 小程序入口
App({
  globalData: {
    // 今日谜题数据
    todayIdiom: null,
    // 用户连胜天数
    streakDays: 0,
    // 上次游戏日期
    lastPlayDate: '',
    // 云开发是否可用
    cloudReady: false,
  },

  onLaunch() {
    // 初始化云开发
    this.initCloud()

    // 读取本地存储的连胜数据
    const streak = wx.getStorageSync('streakDays') || 0
    const lastDate = wx.getStorageSync('lastPlayDate') || ''
    this.globalData.streakDays = streak
    this.globalData.lastPlayDate = lastDate

    // 检查是否跨天
    const today = this.getToday()
    if (lastDate && lastDate !== today) {
      const yesterday = this.getYesterday()
      if (lastDate !== yesterday) {
        this.globalData.streakDays = 0
        wx.setStorageSync('streakDays', 0)
      }
    }
  },

  initCloud() {
    // 检查是否已开通云开发
    if (!wx.cloud) {
      console.warn('当前基础库不支持云开发')
      return
    }
    try {
      wx.cloud.init({
        env: 'cloud1-d3g9lsq6x6ebb94c9',
        traceUser: true,
      })
      this.globalData.cloudReady = true
      console.log('云开发初始化成功')
    } catch (e) {
      console.warn('云开发初始化失败，使用本地模式:', e.message)
    }
  },

  getToday() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  },

  getYesterday() {
    const d = new Date(Date.now() - 86400000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  },
})
