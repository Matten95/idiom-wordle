/**
 * 提示猜词 — 单人版
 * 逐个展示提示词，用户根据提示猜成语
 */
const idiomHints = require('../../data/idiom-hints')
const idiomsData = require('../../data/idioms')

const MATCH_PLAYED_KEY = 'idiom_match_played_count'
const DEFAULT_MAX_DIFFICULTY = idiomHints.__meta.defaultMaxDifficulty || 2
const IDIOM_LEVELS = idiomsData.idioms.reduce((result, item) => {
  result[item.text] = item.level
  return result
}, {})

function isDefaultEligible(raw, difficulty) {
  if (raw && !Array.isArray(raw) && raw.defaultEligible === false) return false
  if (raw && !Array.isArray(raw) && raw.defaultEligible === true) return true
  return difficulty <= DEFAULT_MAX_DIFFICULTY
}

function normalizeEntry(idiomText, raw) {
  if (Array.isArray(raw)) {
    const difficulty = IDIOM_LEVELS[idiomText] || 2
    return {
      idiomText,
      hints: raw,
      difficulty,
      theme: '经典',
      storyHook: '五条线索会逐步揭开谜底。',
      source: '本地题库',
      curated: false,
      defaultEligible: isDefaultEligible(raw, difficulty),
    }
  }
  const difficulty = raw.difficulty || 2
  return {
    idiomText,
    hints: raw.hints || [],
    difficulty,
    theme: raw.theme || '精选',
    storyHook: raw.storyHook || '五条线索会逐步揭开谜底。',
    source: raw.source || '本地题库',
    curated: true,
    defaultEligible: isDefaultEligible(raw, difficulty),
  }
}

function buildEntries() {
  return Object.keys(idiomHints)
    .filter(key => key.indexOf('__') !== 0)
    .map(key => normalizeEntry(key, idiomHints[key]))
    .filter(entry => entry.hints.length >= 5)
}

function buildIdiomSet() {
  const texts = idiomsData.idioms.map(item => item.text)
  Object.keys(idiomHints)
    .filter(key => key.indexOf('__') !== 0)
    .forEach(key => { texts.push(key) })
  return new Set(texts)
}

function pickEntry(entries) {
  let pool = entries.filter(entry => entry.defaultEligible)
  if (pool.length === 0) pool = entries
  return pool[Math.floor(Math.random() * pool.length)]
}

function buildHintCards(hints, visible, currentIndex) {
  return hints.map((word, index) => {
    const isVisible = visible[index]
    const isCurrent = index === currentIndex
    let className = isVisible ? 'visible' : 'hidden'
    if (isCurrent) className += ' current'
    return {
      word,
      className,
      displayText: isVisible ? word : '？？',
    }
  })
}

function buildProgressDots(currentIndex) {
  return [0, 1, 2, 3, 4].map(index => ({
    className: index < currentIndex + 1 ? 'done' : '',
  }))
}

function buildInputBoxes(chars) {
  return chars.map(char => ({
    char,
    className: char ? 'has-char' : '',
  }))
}

function buildSkipText(skipEnabled, timerSeconds, currentIndex) {
  if (skipEnabled) return currentIndex >= 4 ? '查看结果' : '查看下一条提示'
  return '还可思考 ' + Math.max(0, timerSeconds) + ' 秒'
}

Page({
  data: {
    idiomText: '',
    storyHook: '',
    sourceName: '',
    themeName: '',
    difficultyText: '',
    hints: [],
    hintVisible: [true, false, false, false, false],
    hintCards: [],
    status: 'playing',
    currentHintIndex: 0,
    currentHintNumber: 1,
    progressDots: [],
    timerSeconds: 10,
    totalSeconds: 0,
    skipEnabled: false,
    skipText: '还可思考 10 秒',
    timerUrgent: false,
    inputText: '',
    inputChars: ['', '', '', ''],
    inputBoxes: buildInputBoxes(['', '', '', '']),
    inputFocused: false,
    canSubmit: false,
    inputStatus: '',
    showResult: false,
    score: 0,
    rating: '',
    ratingEmoji: '',
    hintsUsed: 0,
    hintChain: [],
  },

  _timer: null,
  _idiomSet: null,

  onLoad() {
    this._idiomSet = buildIdiomSet()
    this.initGame()
  },

  onUnload() {
    this.stopTimer()
  },

  initGame() {
    this.stopTimer()
    const entries = buildEntries()
    const entry = pickEntry(entries)
    const hints = entry.hints.slice(0, 5)
    const hintVisible = [true, false, false, false, false]

    this.setData({
      idiomText: entry.idiomText,
      storyHook: entry.storyHook,
      sourceName: entry.source,
      themeName: entry.theme,
      difficultyText: 'Lv.' + entry.difficulty,
      hints,
      hintVisible,
      hintCards: buildHintCards(hints, hintVisible, 0),
      status: 'playing',
      currentHintIndex: 0,
      currentHintNumber: 1,
      progressDots: buildProgressDots(0),
      timerSeconds: 10,
      totalSeconds: 0,
      skipEnabled: false,
      skipText: buildSkipText(false, 10, 0),
      timerUrgent: false,
      inputText: '',
      inputChars: ['', '', '', ''],
      inputBoxes: buildInputBoxes(['', '', '', '']),
      inputFocused: false,
      canSubmit: false,
      inputStatus: '',
      showResult: false,
      hintChain: [],
    })
    this.startTimer()
  },

  startTimer() {
    this.stopTimer()
    this._timer = setInterval(() => {
      let sec = this.data.timerSeconds - 1
      let total = this.data.totalSeconds + 1
      let skip = false
      let urgent = sec <= 3
      if (sec <= 0) {
        this.stopTimer()
        this.setData({
          timerSeconds: 0,
          totalSeconds: total,
          skipEnabled: true,
          skipText: buildSkipText(true, 0, this.data.currentHintIndex),
          timerUrgent: false,
        })
        return
      }
      this.setData({
        timerSeconds: sec,
        totalSeconds: total,
        skipEnabled: skip,
        skipText: buildSkipText(skip, sec, this.data.currentHintIndex),
        timerUrgent: urgent,
      })
    }, 1000)
  },

  stopTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  },

  onSkip() {
    if (!this.data.skipEnabled) return
    this.stopTimer()
    this.advanceHint()
  },

  advanceHint() {
    const nextIdx = this.data.currentHintIndex + 1
    if (nextIdx >= 5) { this.endGame(false); return }
    const visible = [...this.data.hintVisible]
    visible[nextIdx] = true
    this.setData({
      hintVisible: visible,
      hintCards: buildHintCards(this.data.hints, visible, nextIdx),
      currentHintIndex: nextIdx,
      currentHintNumber: nextIdx + 1,
      progressDots: buildProgressDots(nextIdx),
      timerSeconds: 10,
      skipEnabled: false,
      skipText: buildSkipText(false, 10, nextIdx),
      timerUrgent: false,
    })
    this.startTimer()
  },

  onInputChange(e) {
    const text = e.detail.value || ''
    const allChars = Array.from(text).slice(0, 4)
    const chars = ['', '', '', '']
    allChars.forEach((c, i) => { chars[i] = c })
    const canSubmit = allChars.length === 4
    let inputStatus = ''
    if (canSubmit) {
      const guessText = allChars.join('')
      if (this._idiomSet.has(guessText)) inputStatus = 'valid'
      else if (allChars.every(c => /^[一-鿿]$/.test(c))) inputStatus = 'loose'
    }
    const inputBoxes = buildInputBoxes(chars).map(box => ({
      char: box.char,
      className: box.className + (this.data.inputFocused ? ' active' : ''),
    }))
    this.setData({ inputText: allChars.join(''), inputChars: chars, inputBoxes, canSubmit, inputStatus })
  },

  onInputFocus() {
    const inputBoxes = buildInputBoxes(this.data.inputChars).map(box => ({
      char: box.char,
      className: box.className + ' active',
    }))
    this.setData({ inputFocused: true, inputBoxes })
  },

  onInputBlur() {
    this.setData({ inputFocused: false, inputBoxes: buildInputBoxes(this.data.inputChars) })
  },

  onTapInputArea() {
    this.setData({ inputFocused: true })
  },

  onClearInput() {
    const chars = ['', '', '', '']
    this.setData({ inputText: '', inputChars: chars, inputBoxes: buildInputBoxes(chars), inputFocused: true, canSubmit: false, inputStatus: '' })
  },

  onSubmitGuess() {
    if (!this.data.canSubmit || this.data.status !== 'playing') return
    const guess = this.data.inputChars.join('')
    if (guess === this.data.idiomText) {
      this.stopTimer()
      this.endGame(true)
    } else {
      wx.showToast({ title: '这个答案不太像，换个方向想想', icon: 'none', duration: 1800 })
      wx.vibrateShort({ type: 'light' })
    }
  },

  endGame(won) {
    const hintsUsed = this.data.currentHintIndex + 1
    const totalSec = this.data.totalSeconds
    let score = 0
    if (won) score = Math.max(0, 1000 - (hintsUsed - 1) * 150 - Math.floor(totalSec / 10) * 10)

    let rating
    if (score >= 950) rating = '成语大师'
    else if (score >= 800) rating = '博学多才'
    else if (score >= 600) rating = '渐入佳境'
    else if (score >= 400) rating = '再接再厉'
    else rating = '继续努力'

    this.setData({ status: won ? 'won' : 'lost', showResult: true, score, rating, ratingEmoji: '', hintsUsed })
    const playedCount = wx.getStorageSync(MATCH_PLAYED_KEY) || 0
    wx.setStorageSync(MATCH_PLAYED_KEY, playedCount + 1)
    this.setData({
      hintChain: this.data.hints.slice(0, hintsUsed).map((word, index) => ({
        index: index + 1,
        word,
      })),
    })
    if (won) wx.vibrateShort({ type: 'heavy' })
  },

  onPlayAgain() { this.initGame() },
  onGoHome() { wx.reLaunch({ url: '/pages/home/home' }) },

  onShare() {
    if (this.data.status === 'playing' || !this.data.showResult) {
      return {
        title: '提示猜词 · 五条线索猜一个成语\n来挑战这一题',
        path: '/pages/idiom-match/idiom-match',
      }
    }
    const chain = this.data.hints.slice(0, this.data.hintsUsed).join(' → ')
    const resultLine = this.data.status === 'won'
      ? this.data.hintsUsed + '/5 · ' + this.data.score + '分'
      : '5/5 · 差一点'
    return {
      title: `提示猜词 · ${resultLine}\n${this.data.rating}\n线索：${chain}\n来猜这个成语`,
      path: '/pages/idiom-match/idiom-match',
    }
  },

  onShareAppMessage() { return this.onShare() },
})
