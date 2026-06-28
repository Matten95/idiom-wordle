const { getDailyIdiom, getRandomIdiom, getToday, getHintPositions } = require('../../utils/daily')
const { scoreGuess, parsePinyin, getPraise, loadHistory } = require('../../utils/engine')
const { getPlayerName } = require('../../utils/player')
const { submitGameResult } = require('../../utils/cloud')
const idiomsData = require('../../data/idioms')

Page({
  data: {
    // 谜题信息
    dateDisplay: '',
    date: '',
    // 部首提示（2/4 显示，其余为 '?'）
    hintRadicals: ['?', '?', '?', '?'],
    hintPositions: ['', '', '', ''],  // left/right/top/bottom/center

    // 游戏状态
    status: 'playing',     // playing | won | lost
    attempts: [],          // [{ chars, pinyin, result }]
    maxAttempts: 6,
    currentRow: 0,

    // 输入（统一输入框模式，不打断中文输入法）
    inputText: '',          // 原始输入文本
    inputChars: ['', '', '', ''],  // 拆成 4 个字的展示数组
    inputFocused: false,    // 输入框是否聚焦
    canSubmit: false,
    inputStatus: '',        // '' | 'valid' | 'loose' | 'duplicate'

    // UI
    showPraise: false,
    praiseText: '',
    showAnswer: false,
    // 提示系统
    showHint: false,
    hintMessages: [],

    // 分享
    shareText: '',
    streakDays: 0,
    // 练习模式
    practiceMode: false,
  },

  fmtDate(d) {
    const parts = d.split('-')
    return `${parseInt(parts[1])}月${parseInt(parts[2])}日`
  },

  onLoad(options) {
    // 预建成语快查集（实时输入验证用）
    this._idiomSet = new Set(idiomsData.idioms.map(i => i.text))
    // 练习模式
    this._practiceMode = options && options.mode === 'practice'
    if (this._practiceMode) {
      this.setData({ practiceMode: true })
    }
    this.initGame()
  },

  // ============ 初始化游戏 ============
  initGame() {
    const today = getToday()
    const idiom = this._practiceMode ? getRandomIdiom() : getDailyIdiom(today)

    // 检查是否有今日存档
    const saved = this.loadSavedGame(today)

    if (saved) {
      // 恢复游戏
      this.setData({
        dateDisplay: this.fmtDate(today),
        date: today,
        status: saved.status,
        attempts: saved.attempts,
        currentRow: saved.attempts.length,
        showPraise: saved.status !== 'playing',
        praiseText: saved.status === 'won'
          ? getPraise(saved.attempts.length, true, this.getStreak())
          : getPraise(saved.attempts.length, false, 0, idiom.text),
        showAnswer: saved.status === 'lost',
      })
    } else {
      // 新游戏
      this.setData({
        dateDisplay: this.fmtDate(today),
        date: today,
        status: 'playing',
        attempts: [],
        currentRow: 0,
        inputText: '',
        inputChars: ['', '', '', ''],
        inputFocused: false,
        showPraise: false,
        showAnswer: false,
      })
    }

    // 计算部首提示（与首页一致）
    const posData = idiom.radicalPositions || []
    const positions = getHintPositions(today, posData)
    const hintRadicals = ['?', '?', '?', '?']
    const hintPositions = ['', '', '', '']
    positions.forEach(p => {
      hintRadicals[p] = idiom.radicals[p]
      hintPositions[p] = posData[p] || 'center'
    })

    // 保存答案
    this.answerIdiom = idiom
    this.setData({
      answerText: idiom.text,
      answerPinyin: idiom.pinyin.join(' '),
      answerMeaning: idiom.meaning,
      hintRadicals,
      hintPositions,
    })
  },

  // ============ 输入处理（统一输入框，不打断中文输入法） ============

  /** 输入框内容变化 — 核心：输入法连续组词不被打断 */
  onInputChange(e) {
    const text = e.detail.value || ''
    // 只取前 4 个字符（汉字可能多字节，用 Array.from 正确拆分）
    const allChars = Array.from(text).slice(0, 4)
    const chars = ['', '', '', '']
    allChars.forEach((c, i) => { chars[i] = c })
    const canSubmit = allChars.length === 4

    // 实时输入验证
    let inputStatus = ''
    if (canSubmit) {
      const guessText = allChars.join('')
      const isDup = this.data.attempts.some(a => a.chars.join('') === guessText)
      if (isDup) {
        inputStatus = 'duplicate'
      } else if (this._idiomSet.has(guessText)) {
        inputStatus = 'valid'
      } else if (allChars.every(c => /^[一-鿿]$/.test(c))) {
        inputStatus = 'loose'
      }
    }

    this.setData({
      inputText: allChars.join(''),
      inputChars: chars,
      canSubmit,
      inputStatus,
    })
  },

  /** 输入框获得焦点 */
  onInputFocus() {
    this.setData({ inputFocused: true })
  },

  /** 输入框失去焦点 */
  onInputBlur() {
    this.setData({ inputFocused: false })
  },

  /** 点击输入展示区，重新聚焦输入框 */
  onTapInputArea() {
    this.setData({ inputFocused: true })
  },

  /** 清空输入（非受控模式：通过切换 focus 清空原生输入框） */
  onClearInput() {
    this.setData({ inputFocused: false })
    setTimeout(() => {
      this.setData({
        inputText: '',
        inputChars: ['', '', '', ''],
        canSubmit: false,
        inputFocused: true,
      })
    }, 100)
  },

  // ============ 提交猜测 ============

  onSubmitGuess() {
    if (!this.data.canSubmit) return
    if (this.data.status !== 'playing') return

    const chars = [...this.data.inputChars]
    const guessText = chars.join('')

    // 验证：不能重复提交相同猜测
    const isDuplicate = this.data.attempts.some(a => a.chars.join('') === guessText)
    if (isDuplicate) {
      wx.showToast({ title: '已经猜过这个成语了', icon: 'none' })
      return
    }

    // 验证：必须是 4 个汉字
    const nonChinese = chars.findIndex(c => !/^[一-鿿]$/.test(c))
    if (nonChinese >= 0) {
      const hint = chars[nonChinese] ? `第${nonChinese + 1}个字"${chars[nonChinese]}"不是汉字` : '请填写完整'
      wx.showToast({ title: hint, icon: 'none', duration: 2000 })
      return
    }

    // 查找拼音
    const guessPinyin = this.lookupPinyin(chars)

    // 计分
    const result = scoreGuess(chars, guessPinyin, this.answerIdiom)

    // 更新 attempts
    const attempts = [...this.data.attempts, { chars, pinyin: guessPinyin, result }]
    const newRow = attempts.length

    let newStatus = 'playing'
    let showPraise = false
    let showAnswer = false
    let praiseText = ''

    if (result.summary.isWin) {
      newStatus = 'won'
      showPraise = true
      this.updateStreak()
      praiseText = getPraise(attempts.length, true, this.getStreak())
    } else if (newRow >= this.data.maxAttempts) {
      newStatus = 'lost'
      showPraise = true
      showAnswer = true
      praiseText = getPraise(attempts.length, false, 0, this.answerIdiom.text)
    }

    // 先失焦清空原生输入框，再恢复聚焦
    this.setData({
      attempts,
      currentRow: newRow,
      status: newStatus,
      showPraise,
      showAnswer,
      praiseText,
      inputText: '',
      inputChars: ['', '', '', ''],
      inputFocused: false,
      canSubmit: false,
    })

    if (newStatus === 'playing') {
      setTimeout(() => { this.setData({ inputFocused: true }) }, 150)
    }

    // 保存游戏
    this.saveGame({
      status: newStatus,
      attempts,
    })

    // 保存到历史记录（云端 + 本地双写）— 练习模式跳过
    if (newStatus !== 'playing' && !this._practiceMode) {
      submitGameResult({
        date: this.data.date,
        dateDisplay: this.data.dateDisplay,
        answer: this.answerIdiom,
        attempts,
        status: newStatus,
      })
    }

    // 震动反馈
    if (result.summary.isWin) {
      wx.vibrateShort({ type: 'heavy' })
    } else {
      wx.vibrateShort({ type: 'light' })
    }
  },

  // ============ 拼音查找 ============
  lookupPinyin(chars) {
    // 先在成语词库中查找
    const text = chars.join('')
    const idiom = idiomsData.idioms.find(i => i.text === text)
    if (idiom) return [...idiom.pinyin]

    // 不在词库中，尝试智能推断
    return chars.map(char => {
      // 在所有成语中搜索这个字
      for (const idiom of idiomsData.idioms) {
        const idx = idiom.chars.indexOf(char)
        if (idx >= 0) return idiom.pinyin[idx]
      }
      return '' // 找不到
    })
  },

  // ============ 渐进式提示 ============

  /** 点击「需要提示」按钮 */
  onRequestHint() {
    const lastAttempt = this.data.attempts[this.data.attempts.length - 1]
    if (!lastAttempt) return

    const result = lastAttempt.result
    const suggestions = []

    // 分析上一轮结果
    const knownChars = result.chars.filter(c => c.status === 'correct')
    const pinyinMatches = result.chars.filter(c => c.status === 'pinyin')
    const presentChars = result.chars.filter(c => c.status === 'present')

    if (knownChars.length > 0) {
      suggestions.push(`已确定 ${knownChars.length} 个字的位置：${knownChars.map(c => c.char).join('')}`)
    }
    if (pinyinMatches.length > 0) {
      suggestions.push(`拼音正确但字不对：${pinyinMatches.map(c => `「${c.char}→?(${c.pinyin})」`).join('、')}，想想同音字？`)
    }
    if (presentChars.length > 0) {
      suggestions.push(`有 ${presentChars.length} 个字在答案中但位置不对，试试换位置`)
    }
    if (knownChars.length === 0 && pinyinMatches.length === 0 && presentChars.length === 0) {
      const absentChars = result.chars.map(c => c.char).join('')
      suggestions.push(`上一轮的「${absentChars}」都不在答案中，尽量避开这些字`)
    }
    if (suggestions.length === 0) {
      suggestions.push('💡 可以从常见成语开始尝试，如「一心一意」「画龙点睛」')
    }

    this.setData({ showHint: true, hintMessages: suggestions })
  },

  // ============ 分享 ============
  onShare() {
    const grid = this.data.attempts.map(a => a.result.emojiString).join('\n')
    const won = this.data.status === 'won'
    const n = this.data.attempts.length
    const title = won
      ? `🏮 Wordle（成语版） · ${n}/6`
      : `🏮 Wordle（成语版） · X/6`

    return {
      title: `${title}\n${grid}\n\n${this.data.praiseText}`,
      path: '/pages/index/index',
      imageUrl: '', // 可生成分享图片
    }
  },

  onShareAppMessage() {
    return this.onShare()
  },

  /** 分享给好友 */
  onTapShare() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    })
  },

  // ============ 本地存档 ============
  SAVE_KEY: 'idiom_game_save',

  loadSavedGame(today) {
    try {
      const saved = wx.getStorageSync(this.SAVE_KEY)
      if (saved && saved.date === today) return saved
    } catch (e) {}
    return null
  },

  saveGame(state) {
    try {
      wx.setStorageSync(this.SAVE_KEY, {
        date: this.data.date,
        ...state,
      })
    } catch (e) {}
  },

  // ============ 连胜管理 ============
  getStreak() {
    try { return wx.getStorageSync('streakDays') || 0 } catch (e) { return 0 }
  },

  updateStreak() {
    const today = getToday()
    const lastDate = wx.getStorageSync('lastPlayDate') || ''

    let streak = this.getStreak()
    const yesterday = (() => {
      const d = new Date(Date.now() - 86400000)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

    if (lastDate === yesterday) {
      streak += 1
    } else if (lastDate === today) {
      // 今天已经玩过了，不增加
    } else {
      streak = 1
    }

    wx.setStorageSync('streakDays', streak)
    wx.setStorageSync('lastPlayDate', today)
    this.setData({ streakDays: streak })
  },

  // ============ 页面跳转（reLaunch 模拟 Tab 切换） ============
  onNavHome() {
    wx.reLaunch({ url: '/pages/home/home' })
  },
  onGoRank() {
    wx.reLaunch({ url: '/pages/history/history' })
  },
  onGoProfile() {
    wx.reLaunch({ url: '/pages/profile/profile' })
  },

  /** 练习模式：换一题 */
  onNewPractice() {
    this.setData({
      showPraise: false,
      showAnswer: false,
      status: 'playing',
      attempts: [],
      currentRow: 0,
      inputText: '',
      inputChars: ['', '', '', ''],
      canSubmit: false,
      inputStatus: '',
      showHint: false,
      hintMessages: [],
      streakDays: 0,
    })
    this.initGame()
  },
})
