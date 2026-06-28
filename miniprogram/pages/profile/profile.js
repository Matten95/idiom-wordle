const { loadHistory } = require('../../utils/engine')
const { loadPlayer, savePlayer, saveAvatar } = require('../../utils/player')

Page({
  data: {
    player: { nickname: '', gender: '', city: '', signature: '', avatar: '' },
    showEditor: false,
    // 编辑器字段——平面化，仅 onShowEditor 时 setData 一次做初始值
    editNickname: '',
    editCity: '',
    editSignature: '',
    editGender: '',
    editAvatar: '',

    // 游戏统计
    totalPlayed: 0,
    totalWon: 0,
    winRate: 0,
    avgAttempts: '0',
    distBars: [],
    recentGames: [],
  },

  // 编辑期间实际值存这里，不触发 setData → 不打断输入法
  _nick: '',
  _city: '',
  _sig: '',

  onShow() {
    this.loadPlayerInfo()
    this.loadData()
  },

  loadPlayerInfo() {
    this.setData({ player: loadPlayer() })
  },

  // ========== 编辑器 ==========
  onShowEditor() {
    var p = this.data.player
    this._nick = p.nickname || ''
    this._city = p.city || ''
    this._sig = p.signature || ''
    // 仅设置一次初始值，后续不再通过 setData 更新
    this.setData({
      showEditor: true,
      editNickname: p.nickname || '',
      editCity: p.city || '',
      editSignature: p.signature || '',
      editGender: p.gender || '',
      editAvatar: p.avatar || '',
    })
  },

  onHideEditor() {
    this.setData({ showEditor: false })
  },

  onStopProp() {},

  // 输入事件：只存本地变量，绝不调 setData → 不打断 IME
  onNickInput: function (e) { this._nick = e.detail.value },
  onCityInput: function (e) { this._city = e.detail.value },
  onSigInput:  function (e) { this._sig = e.detail.value },

  // blur 事件：IME 已结束，安全同步到 data（仅用于 length 校验等 UI 需要）
  onNickBlur: function (e) { this._nick = e.detail.value },
  onCityBlur: function (e) { this._city = e.detail.value },
  onSigBlur:  function (e) { this._sig = e.detail.value },

  onSelectGender: function (e) {
    this.setData({ editGender: e.currentTarget.dataset.gender })
  },

  onChooseAvatar: function () {
    var self = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        self.setData({ editAvatar: res.tempFiles[0].tempFilePath })
      },
      fail: function (err) {
        if (err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '选取图片失败', icon: 'none' })
        }
      },
    })
  },

  // 保存：从本地变量 + data 中取值
  onSavePlayer: function () {
    var self = this
    var nickname = (this._nick || '').trim()
    var city = (this._city || '').trim()
    var signature = (this._sig || '').trim()
    var gender = this.data.editGender
    var avatarPath = this.data.editAvatar

    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    if (nickname.length > 12) {
      wx.showToast({ title: '昵称不能超过12个字', icon: 'none' })
      return
    }
    if (city.length > 20) {
      wx.showToast({ title: '城市名不能超过20个字', icon: 'none' })
      return
    }
    if (signature.length > 50) {
      wx.showToast({ title: '签名不能超过50个字', icon: 'none' })
      return
    }

    function doSave(avatar) {
      var r = savePlayer({ nickname: nickname, gender: gender, city: city, signature: signature, avatar: avatar })
      if (r.ok) {
        wx.showToast({ title: '保存成功', icon: 'success' })
        self.setData({ player: r.data, showEditor: false })
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    }

    if (avatarPath && (avatarPath.indexOf('http://tmp/') === 0 || avatarPath.indexOf('wxfile://tmp') === 0 || avatarPath.indexOf('tmp') > -1)) {
      wx.showLoading({ title: '保存头像...' })
      saveAvatar(avatarPath).then(function (p) { wx.hideLoading(); doSave(p) }).catch(function () { wx.hideLoading(); doSave(self.data.player.avatar || '') })
    } else {
      doSave(avatarPath)
    }
  },

  // ========== 游戏数据 ==========
  loadData: function () {
    var history = loadHistory()
    var won = history.filter(function (h) { return h.won })
    var total = history.length
    var dist = [0, 0, 0, 0, 0, 0]
    won.forEach(function (h) { var n = h.attempts; if (n >= 1 && n <= 6) dist[n - 1]++ })
    var maxCount = Math.max.apply(null, dist.concat([1]))
    var distBars = dist.map(function (c) { return { count: c, pct: Math.round((c / maxCount) * 100) } })
    var totalAttempts = won.reduce(function (s, h) { return s + h.attempts }, 0)
    var avgAttempts = won.length > 0 ? (totalAttempts / won.length).toFixed(1) : '0'
    var winRate = total > 0 ? Math.round((won.length / total) * 100) : 0
    var recentGames = history.slice(0, 20).map(function (h) {
      var p = h.date.split('-')
      return { dateDisplay: parseInt(p[1]) + '月' + parseInt(p[2]) + '日', answerText: h.answerText || '???', attempts: h.attempts, won: h.won, date: h.date }
    })
    this.setData({ totalPlayed: total, totalWon: won.length, winRate: winRate, avgAttempts: avgAttempts, distBars: distBars, recentGames: recentGames })
  },

  onClearHistory: function () {
    var self = this
    wx.showModal({
      title: '确认清除', content: '将清除所有游戏记录，此操作不可撤销', confirmText: '确认清除', confirmColor: '#EF4444',
      success: function (res) {
        if (res.confirm) { try { wx.removeStorageSync('idiom_wordle_history'); wx.showToast({ title: '已清除', icon: 'success' }); self.loadData() } catch (e) { wx.showToast({ title: '清除失败', icon: 'none' }) } }
      },
    })
  },

  onGoHome: function () { wx.reLaunch({ url: '/pages/home/home' }) },
  onGoRank: function () { wx.reLaunch({ url: '/pages/history/history' }) },
})
