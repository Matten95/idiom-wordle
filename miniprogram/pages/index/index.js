const { getDailyIdiom, getRandomIdiom, getToday, getYesterday, getHintPositions } = require('../../utils/daily')
const { scoreGuess, getPraise } = require('../../utils/engine')
const { getPlayerName } = require('../../utils/player')
const { startDailyGame, submitDailyGuess, saveLocalGameResult, fetchDailyStats } = require('../../utils/cloud')
const { logEvent } = require('../../utils/telemetry')
const { requestDailyReminder, claimShieldOrRepairWithAd, getRetentionState } = require('../../utils/retention')
const { drawShareCard } = require('../../utils/share-card')
const idiomsData = require('../../data/idioms')

Page({
  data: {
    // 谜题信息
    dateDisplay: '',
    date: '',
    hintTitle: '今日部首',
    // 部首提示（按题面信息量显示 2-3 枚，其余为 '?'）
    hintRadicals: ['?', '?', '?', '?'],
    hintPositions: ['', '', '', ''],  // left/right/top/bottom/center

    // 游戏状态
    status: 'playing',     // playing | won | lost
    gameReady: false,
    submitting: false,
    rankingNotice: '',
    attempts: [],          // [{ chars, pinyin, result }]
    maxAttempts: 6,
    currentRow: 0,

    // 输入（统一输入框模式，不打断中文输入法）
    inputText: '',          // 原始输入文本
    inputChars: ['', '', '', ''],  // 拆成 4 个字的展示数组
    inputSlots: [0, 1, 2, 3],
    inputFocused: false,    // 输入框是否聚焦
    keyboardReady: true,
    canSubmit: false,
    inputStatus: '',        // '' | 'valid' | 'loose' | 'duplicate'

    // UI
    showPraise: false,
    praiseText: '',
    showAnswer: false,
    roundFeedback: '',
    resultReview: '',
    inputGuideText: '看部首猜 4 字成语，颜色会提示字、音、位置',
    // 提示系统
    showHint: false,
    hintMessages: [],

    // 分享
    shareText: '',
    shareImagePath: '',
    streakDays: 0,
    puzzleNumber: 0,
    comparisonText: '',
    comparisonBars: [],
    reminderStatusText: '',
    shieldStatusText: '',
    shieldActionText: '看广告领护盾',
    shieldTitleText: '连胜护盾',
    shieldDescText: '看完小视频得 1 枚护盾，断签时自动消耗。',
    shieldLoading: false,
    showFirstGuide: false,
    firstGuideSteps: [
      { key: 'radical', title: '先看部首', text: '已揭开的部首和位置，是第一轮破题方向。' },
      { key: 'color', title: '再看颜色', text: '绿是命中，蓝是同音，黄是错位，灰色尽量排除。' },
      { key: 'common', title: '先猜常见', text: '答案来自大众题池，别一上来冲冷僻词。' },
    ],
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
      this.setData({ practiceMode: true, hintTitle: '练习部首' })
    }
    this.maybeShowFirstGuide()
    this.initGame()
  },

  // ============ 初始化游戏 ============
  initGame() {
    const today = getToday()
    if (this._practiceMode) {
      this.initLocalGame(today, getRandomIdiom(), '')
      return
    }

    this.setData({
      dateDisplay: this.fmtDate(today),
      date: today,
      gameReady: false,
      submitting: false,
      rankingNotice: '正在连接今日榜...',
    })
    startDailyGame(today).then(res => {
      if (res.ok && res.game) {
        this.initRankedGame(res.game)
        return
      }
      console.warn('可信每日局不可用，切换为本地练习:', res.code || res.error || 'unknown')
      this.initLocalGame(today, getDailyIdiom(today), '离线练习，不计入今日榜')
    })
  },

  initRankedGame(game) {
    this._rankedMode = true
    const attempts = Array.isArray(game.attempts) ? game.attempts : []
    const status = game.status || 'playing'
    const answer = game.answer || null
    const lastAttempt = attempts[attempts.length - 1]
    this.answerIdiom = answer ? {
      text: answer.text,
      pinyin: answer.pinyin || [],
      meaning: answer.meaning || '',
      source: answer.source || '',
    } : null

    this.setData({
      dateDisplay: this.fmtDate(game.date),
      date: game.date,
      puzzleNumber: game.puzzleNumber,
      status,
      gameReady: true,
      submitting: false,
      rankingNotice: '',
      attempts,
      currentRow: attempts.length,
      maxAttempts: game.maxAttempts || 6,
      inputText: '',
      inputChars: ['', '', '', ''],
      inputFocused: false,
      canSubmit: false,
      inputStatus: '',
      showPraise: status !== 'playing',
      praiseText: status === 'won'
        ? getPraise(attempts.length, true, this.getStreak())
        : status === 'lost' ? getPraise(attempts.length, false, 0, answer ? answer.text : '') : '',
      showAnswer: status === 'lost' && Boolean(answer),
      answerText: answer ? answer.text : '',
      answerPinyin: answer && answer.pinyin ? answer.pinyin.join(' ') : '',
      answerMeaning: answer ? answer.meaning || '' : '',
      hintRadicals: game.hintRadicals || ['?', '?', '?', '?'],
      hintPositions: game.hintPositions || ['', '', '', ''],
      roundFeedback: status === 'playing' && lastAttempt ? this.buildRoundFeedback(lastAttempt.result, status) : '',
      resultReview: status !== 'playing' ? this.buildResultReview(attempts) : '',
      comparisonText: '',
      comparisonBars: [],
      shareImagePath: '',
      reminderStatusText: '',
    })
    if (status !== 'playing') {
      this.loadDailyStats(attempts, status)
      this.prepareShareImage(attempts, status)
      if (answer) this.saveCompletedGameLocally(attempts, status, answer)
    }
    this.refreshRetentionPanel()
  },

  initLocalGame(today, idiom, rankingNotice) {
    this._rankedMode = false

    // 检查是否有今日存档
    const saved = this._practiceMode ? null : this.loadSavedGame(today)

    if (saved) {
      const lastAttempt = saved.attempts[saved.attempts.length - 1]
      // 恢复游戏
      this.setData({
        dateDisplay: this.fmtDate(today),
        date: today,
        puzzleNumber: idiom.puzzleNumber,
        status: saved.status,
        gameReady: true,
        submitting: false,
        rankingNotice,
        attempts: saved.attempts,
        currentRow: saved.attempts.length,
        showPraise: saved.status !== 'playing',
        praiseText: saved.status === 'won'
          ? getPraise(saved.attempts.length, true, this.getStreak())
          : getPraise(saved.attempts.length, false, 0, idiom.text),
        showAnswer: saved.status === 'lost',
        roundFeedback: saved.status === 'playing' && lastAttempt ? this.buildRoundFeedback(lastAttempt.result, saved.status) : '',
        resultReview: saved.status !== 'playing' ? this.buildResultReview(saved.attempts) : '',
      })
      if (saved.status !== 'playing') {
        this.loadDailyStats(saved.attempts, saved.status)
        this.prepareShareImage(saved.attempts, saved.status)
      }
    } else {
      // 新游戏
      this.setData({
        dateDisplay: this.fmtDate(today),
        date: today,
        puzzleNumber: idiom.puzzleNumber,
        status: 'playing',
        gameReady: true,
        submitting: false,
        rankingNotice,
        attempts: [],
        currentRow: 0,
        inputText: '',
        inputChars: ['', '', '', ''],
        inputFocused: false,
        canSubmit: false,
        inputStatus: '',
        showPraise: false,
        showAnswer: false,
        roundFeedback: '',
        resultReview: '',
        comparisonText: '',
        comparisonBars: [],
        shareImagePath: '',
        reminderStatusText: '',
      })
    }

    // 计算部首提示（与首页一致）
    const posData = idiom.radicalPositions || []
    const positions = getHintPositions(today, posData, idiom.radicals, idiom.chars)
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
    this.refreshRetentionPanel()
  },

  // ============ 输入处理（统一输入框，不打断中文输入法） ============

  /** 输入框内容变化 — 核心：输入法连续组词不被打断 */
  onInputChange(e) {
    const text = e.detail.value || ''
    // 只把已选中的汉字放进四格，拼音组合态留给原生输入法候选栏处理。
    const allChars = Array.from(text).filter(c => /^[一-鿿]$/.test(c)).slice(0, 4)
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
    this.setData({ inputFocused: false, keyboardReady: false })
    setTimeout(() => {
      this.setData({
        inputText: '',
        inputChars: ['', '', '', ''],
        canSubmit: false,
        inputStatus: '',
        keyboardReady: true,
        inputFocused: true,
      })
    }, 100)
  },

  // ============ 提交猜测 ============

  async onSubmitGuess() {
    if (!this.data.canSubmit) return
    if (this.data.status !== 'playing') return
    if (!this.data.gameReady || this.data.submitting) return

    const chars = [...this.data.inputChars]
    const guessText = chars.join('')

    // 验证：不能重复提交相同猜测
    const isDuplicate = this.data.attempts.some(a => a.chars.join('') === guessText)
    if (isDuplicate) {
      wx.showToast({ title: '这条猜过了，换个方向试试', icon: 'none' })
      return
    }

    // 验证：必须是 4 个汉字
    const nonChinese = chars.findIndex(c => !/^[一-鿿]$/.test(c))
    if (nonChinese >= 0) {
      const hint = chars[nonChinese] ? `第${nonChinese + 1}个不是汉字，换成成语字` : '还差几个字，补齐 4 个再试'
      wx.showToast({ title: hint, icon: 'none', duration: 2000 })
      return
    }

    if (this._rankedMode) {
      await this.submitRankedGuess(chars, guessText)
      return
    }

    this.submitLocalGuess(chars, guessText)
  },

  async submitRankedGuess(chars, guessText) {
    this.setData({ submitting: true, canSubmit: false, inputFocused: false })
    const previousStatus = this.data.status
    const response = await submitDailyGuess(this.data.date, guessText)
    if (!response.ok || !response.game) {
      this.setData({ submitting: false, canSubmit: true, inputFocused: true })
      wx.showToast({ title: response.error || '这次没送上榜，再试一次', icon: 'none', duration: 2200 })
      return
    }

    const game = response.game
    const attempts = Array.isArray(game.attempts) ? game.attempts : []
    const lastAttempt = attempts[attempts.length - 1]
    const status = game.status || 'playing'
    const answer = game.answer || null
    if (answer) {
      this.answerIdiom = {
        text: answer.text,
        pinyin: answer.pinyin || [],
        meaning: answer.meaning || '',
        source: answer.source || '',
      }
    }

    if (status === 'won' && previousStatus === 'playing') this.updateStreak()
    const praiseText = status === 'won'
      ? getPraise(attempts.length, true, this.getStreak())
      : status === 'lost' ? getPraise(attempts.length, false, 0, answer ? answer.text : '') : ''

    this.setData({
      attempts,
      currentRow: attempts.length,
      status,
      submitting: false,
      showPraise: status !== 'playing',
      showAnswer: status === 'lost' && Boolean(answer),
      praiseText,
      answerText: answer ? answer.text : '',
      answerPinyin: answer && answer.pinyin ? answer.pinyin.join(' ') : '',
      answerMeaning: answer ? answer.meaning || '' : '',
      roundFeedback: lastAttempt ? this.buildRoundFeedback(lastAttempt.result, status) : '',
      resultReview: this.buildResultReview(attempts),
      inputText: '',
      inputChars: ['', '', '', ''],
      inputFocused: false,
      canSubmit: false,
      inputStatus: '',
    })

    logEvent('submit_guess', {
      mode: 'daily',
      date: this.data.date,
      row: attempts.length,
      validIdiom: Boolean(this._idiomSet && this._idiomSet.has(guessText)),
      verified: true,
    })

    if (status === 'playing') {
      setTimeout(() => { this.setData({ inputFocused: true }) }, 150)
    } else {
      if (answer) this.saveCompletedGameLocally(attempts, status, answer)
      logEvent(status === 'won' ? 'win' : 'lose', {
        mode: 'daily',
        date: this.data.date,
        attempts: attempts.length,
        verified: true,
      })
      this.loadDailyStats(attempts, status)
      this.prepareShareImage(attempts, status)
    }

    if (lastAttempt && lastAttempt.result.summary.isWin) {
      wx.vibrateShort({ type: 'heavy' })
    } else {
      wx.vibrateShort({ type: 'light' })
    }
  },

  submitLocalGuess(chars, guessText) {

    // 查找拼音
    const guessPinyin = this.lookupPinyin(chars)

    // 计分
    const result = scoreGuess(chars, guessPinyin, this.answerIdiom)
    logEvent('submit_guess', {
      mode: this._practiceMode ? 'practice' : 'daily',
      date: this.data.date,
      row: this.data.attempts.length + 1,
      validIdiom: Boolean(this._idiomSet && this._idiomSet.has(guessText)),
    })

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
      praiseText = getPraise(attempts.length, true, 0)
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
      roundFeedback: this.buildRoundFeedback(result, newStatus),
      resultReview: this.buildResultReview(attempts),
      inputText: '',
      inputChars: ['', '', '', ''],
      inputFocused: false,
      canSubmit: false,
      inputStatus: '',
    })

    if (newStatus === 'playing') {
      setTimeout(() => { this.setData({ inputFocused: true }) }, 150)
    }

    // 保存游戏
    this.saveGame({
      status: newStatus,
      attempts,
    })

    // 离线降级局只保存在本机，不进入今日榜或可信连胜。
    if (newStatus !== 'playing' && !this._practiceMode) {
      this.saveCompletedGameLocally(attempts, newStatus, this.answerIdiom)
      logEvent(newStatus === 'won' ? 'win' : 'lose', {
        mode: 'daily-offline',
        date: this.data.date,
        attempts: attempts.length,
        verified: false,
      })
      this.prepareShareImage(attempts, newStatus)
    }

    // 震动反馈
    if (result.summary.isWin) {
      wx.vibrateShort({ type: 'heavy' })
    } else {
      wx.vibrateShort({ type: 'light' })
    }
  },

  saveCompletedGameLocally(attempts, status, answer) {
    saveLocalGameResult({
      date: this.data.date,
      dateDisplay: this.data.dateDisplay,
      answer,
      attempts,
      status,
    })
  },

  buildRoundFeedback(result, status) {
    if (!result || !result.summary) return ''
    const s = result.summary
    if (status === 'won') return '猜中了！这局漂亮。'
    const pieces = []
    if (s.correctCount > 0) pieces.push(`${s.correctCount} 个字位置正确`)
    if (s.pinyinCount > 0) pieces.push(`${s.pinyinCount} 个读音对了`)
    if (s.partialCount > 0) pieces.push(`${s.partialCount} 个读音接近`)
    if (s.presentCount > 0) pieces.push(`${s.presentCount} 个字换个位置`)
    if (pieces.length > 0) return `方向不错：${pieces.join('，')}。`
    return '这次方向偏了，避开这些字再看部首。'
  },

  buildResultReview(attempts) {
    if (!attempts || attempts.length === 0) return ''
    const best = attempts.reduce((result, attempt) => {
      const s = attempt.result.summary
      return {
        correct: Math.max(result.correct, s.correctCount || 0),
        pinyin: Math.max(result.pinyin, (s.pinyinCount || 0) + (s.partialCount || 0)),
        present: Math.max(result.present, s.presentCount || 0),
      }
    }, { correct: 0, pinyin: 0, present: 0 })
    const parts = []
    if (best.correct > 0) parts.push(`最多命中 ${best.correct} 个位置`)
    if (best.pinyin > 0) parts.push(`${best.pinyin} 个读音线索`)
    if (best.present > 0) parts.push(`${best.present} 个错位字`)
    return parts.length ? `复盘：${parts.join('，')}。` : '复盘：这题偏难，下一局从常见成语试起。'
  },

  loadDailyStats(attempts, status) {
    if (this._practiceMode) return
    const self = this
    fetchDailyStats(this.data.date).then(function (res) {
      if (res.unavailable) {
        self.setData({ comparisonText: '全网数据暂时没连上，成绩已由服务端保存。', comparisonBars: [] })
        return
      }
      const stats = res.stats || {}
      const comparison = self.buildComparison(stats, attempts, status)
      self.setData({
        comparisonText: comparison.text,
        comparisonBars: comparison.bars,
      })
      logEvent('daily_compare_loaded', { date: self.data.date, source: res.source || 'unknown', total: stats.total || 0 })
    })
  },

  buildComparison(stats, attempts, status) {
    const total = stats.total || 0
    const dist = stats.attemptDist || [0, 0, 0, 0, 0, 0]
    const maxCount = Math.max.apply(null, dist.concat([1]))
    const bars = dist.map(function (count, index) {
      return {
        key: 'try-' + (index + 1),
        label: (index + 1) + '猜',
        count,
        width: Math.max(8, Math.round(count * 100 / maxCount)),
      }
    })
    if (!total) return { text: '你是今天第一批盖章的人。', bars }
    if (status !== 'won') {
      return { text: `今日已有 ${total} 人开局，通关率 ${stats.winRate || 0}%。`, bars }
    }
    const used = attempts.length
    const worseWins = dist.slice(used).reduce(function (sum, count) { return sum + count }, 0)
    const lost = stats.loseCount || 0
    const beat = Math.min(99, Math.max(1, Math.round((worseWins + lost) * 100 / total)))
    return { text: `你击败了约 ${beat}% 的今日玩家。`, bars }
  },

  prepareShareImage(attempts, status) {
    const self = this
    const scoreText = status === 'won' ? attempts.length + '/6' : 'X/6'
    drawShareCard(this, {
      attempts,
      dateDisplay: this.data.dateDisplay,
      puzzleNumber: this.data.puzzleNumber,
      scoreText,
      resultText: status === 'won' ? '今日已破题' : '今日差一点',
    }).then(function (path) {
      if (!path) return
      self.setData({ shareImagePath: path })
      logEvent('share_image_ready', { page: 'index', date: self.data.date })
    })
  },

  refreshRetentionPanel(keepStatusText) {
    const state = getRetentionState()
    const recoverable = state.streakRecoverable
    this.setData({
      shieldActionText: recoverable ? '看广告补签' : '看广告领护盾',
      shieldTitleText: recoverable ? '连胜补签' : '连胜护盾',
      shieldDescText: recoverable
        ? '昨天断签了，看完小视频可补回连胜。'
        : '看完小视频得 1 枚护盾，断签时自动消耗。',
      shieldStatusText: keepStatusText ? this.data.shieldStatusText : (recoverable
        ? '可补回 ' + Math.max(1, state.recoverableStreak) + ' 天连胜'
        : this.data.shieldStatusText),
    })
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
    logEvent('use_hint', {
      mode: this._practiceMode ? 'practice' : 'daily',
      date: this.data.date,
      attempts: this.data.attempts.length,
    })

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
      suggestions.push('答案仍是常见四字成语，先围绕已给部首想常见字')
    }
    if (this.data.attempts.length === 2 && suggestions.length < 2) {
      suggestions.push('先别猜冷僻词，把已命中的字音和部首放在一起想')
    }
    if (suggestions.length === 0) {
      suggestions.push('可以从常见成语开始尝试，如「一心一意」「画龙点睛」')
    }

    this.setData({ showHint: true, hintMessages: suggestions })
  },

  // ============ 分享 ============
  onShare() {
    logEvent('share_tap', { page: 'index', status: this.data.status, attempts: this.data.attempts.length })
    const grid = this.data.attempts.map(a => a.result.emojiString).join('\n')
    const won = this.data.status === 'won'
    const n = this.data.attempts.length
    const title = won
      ? `部首猜词 · ${n}/6`
      : `部首猜词 · X/6`

    return {
      title: `${title}\n${grid}\n\n${this.data.praiseText}`,
      path: '/pages/index/index',
      imageUrl: this.data.shareImagePath || '',
    }
  },

  onShareAppMessage() {
    return this.onShare()
  },

  onShareTimeline() {
    return {
      title: '成语日课 · 今日部首猜词',
      query: '',
      imageUrl: this.data.shareImagePath || '',
    }
  },

  /** 分享给好友 */
  onTapShare() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    })
  },

  onRequestReminder() {
    const self = this
    requestDailyReminder().then(function (res) {
      self.setData({ reminderStatusText: res.accepted || res.fallback ? '明日提醒已记下' : '提醒没开成，明天也欢迎手动来破题' })
      wx.showToast({ title: res.accepted || res.fallback ? '明日提醒已记下' : '稍后再试', icon: 'none' })
    })
  },

  onClaimShield() {
    if (this.data.shieldLoading) return
    const self = this
    this.setData({ shieldLoading: true, shieldActionText: '广告准备中' })
    claimShieldOrRepairWithAd('daily_result').then(function (result) {
      const state = getRetentionState()
      if (result.cancelled) {
        self.setData({ shieldStatusText: '看完小视频才会发放奖励' })
      } else if (result.repaired && result.ok) {
        self.setData({ streakDays: result.streak, shieldStatusText: `补签成功，连胜回到 ${result.streak} 天` })
        wx.showToast({ title: '补签成功', icon: 'none' })
      } else {
        self.setData({
          shieldStatusText: result.ok ? `护盾 +1，当前 ${state.shieldCount} 枚` : `当前已有 ${state.shieldCount} 枚护盾`,
        })
        wx.showToast({ title: result.ok ? '护盾已入册' : '今天已领过', icon: 'none' })
      }
      self.setData({ shieldLoading: false })
      self.refreshRetentionPanel(true)
    })
  },

  maybeShowFirstGuide() {
    if (this._practiceMode) return
    try {
      if (wx.getStorageSync('idiom_index_guide_seen')) return
      wx.setStorageSync('idiom_index_guide_seen', true)
      this.setData({ showFirstGuide: true })
    } catch (e) {}
  },

  onCloseFirstGuide() {
    this.setData({ showFirstGuide: false })
  },

  onStopGuideTap() {},

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
    if (this._practiceMode || this._rankedMode) return
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
    const yesterday = getYesterday(today)

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
