/**
 * 提示猜词 — 单人版
 * 逐个展示提示词，用户根据提示猜成语
 */
const idiomHints = require('../../data/idiom-hints')
const idiomsData = require('../../data/idioms')
const { logEvent } = require('../../utils/telemetry')

const MATCH_PLAYED_KEY = 'idiom_match_played_count'
const DEFAULT_MAX_DIFFICULTY = idiomHints.__meta.defaultMaxDifficulty || 2
const HINT_TIMER_SECONDS = 10
const EARLY_REVEAL_PENALTY = 5
const WRONG_GUESS_PENALTY = 4
const STORY_HINT_AD_UNIT_ID = 'adunit-xxxxxxxxxxxxxxxx'
const DIFFICULTY_SCORE_ADJUST = {
  1: -3,
  2: 0,
  3: 4,
  4: 7,
}
const IDIOM_DETAILS = idiomsData.idioms.reduce((result, item) => {
  result[item.text] = item
  return result
}, {})
const IDIOM_LEVELS = Object.keys(IDIOM_DETAILS).reduce((result, key) => {
  result[key] = IDIOM_DETAILS[key].level
  return result
}, {})
const SCORE_RULE_TEXT = '多看线索 -15 · 抢翻额外 -5 · 误猜 -4 · 用时每10秒 -1'

function isDefaultEligible(raw, difficulty) {
  if (raw && !Array.isArray(raw) && raw.defaultEligible === false) return false
  if (raw && !Array.isArray(raw) && raw.defaultEligible === true) return true
  return difficulty <= DEFAULT_MAX_DIFFICULTY
}

function buildStoryHook(idiomText) {
  const detail = IDIOM_DETAILS[idiomText]
  if (detail && detail.meaning) return '锦囊：' + detail.meaning
  return '锦囊：把已经出现的线索合在一起，先找共同语义，再想一个常见四字成语。'
}

function maskAnswerChars(text, idiomText) {
  let result = text || ''
  Array.from(idiomText || '').forEach(char => {
    result = result.split(char).join('□')
  })
  return result
}

function buildStoryHintText(entry) {
  const firstHint = entry.hints && entry.hints[0] ? entry.hints[0] : '首条线索'
  const sceneHint = entry.hints && entry.hints[2] ? entry.hints[2] : firstHint
  const hook = maskAnswerChars(entry.storyHook || buildStoryHook(entry.idiomText), entry.idiomText).replace(/^锦囊：/, '')
  return '锦囊：方向看「' + firstHint + '」，再连到「' + sceneHint + '」。排除只描写情绪或景物的四字词；典故影子是：' + hook
}

function getEntryTheme(idiomText) {
  const detail = IDIOM_DETAILS[idiomText]
  return detail && detail.tags && detail.tags[0] ? detail.tags[0] : '经典'
}

function getEntrySource(idiomText) {
  const detail = IDIOM_DETAILS[idiomText]
  return detail && detail.source ? detail.source : '本地题库'
}

function normalizeEntry(idiomText, raw) {
  if (Array.isArray(raw)) {
    const difficulty = IDIOM_LEVELS[idiomText] || 2
    return {
      idiomText,
      hints: raw,
      difficulty,
      theme: getEntryTheme(idiomText),
      storyHook: buildStoryHook(idiomText),
      source: getEntrySource(idiomText),
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
    storyHook: raw.storyHook || buildStoryHook(idiomText),
    source: raw.source || getEntrySource(idiomText),
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

function pickEntry(entries, sharedIdiomText) {
  if (sharedIdiomText) {
    const sharedEntry = entries.find(entry => entry.idiomText === sharedIdiomText)
    if (sharedEntry) return sharedEntry
  }
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

function buildSkipText(timerSeconds, currentIndex) {
  if (currentIndex >= 4) return timerSeconds > 0 ? '抢先收桌 -' + EARLY_REVEAL_PENALTY + '分' : '收桌看答案'
  if (timerSeconds > 0) return '抢翻线索 -' + EARLY_REVEAL_PENALTY + '分'
  return '翻下一张线索'
}

function buildSkipHintText(timerSeconds, currentIndex) {
  if (currentIndex >= 4) return timerSeconds > 0 ? '提前收桌只多扣抢翻分；五条线索已经计入分数' : '五条线索已齐，收桌不加抢翻扣分'
  if (timerSeconds > 0) return timerSeconds + ' 秒后免抢翻扣分；多看线索仍 -15'
  return '已免抢翻扣分；多看这一条仍按线索数计分'
}

function calcMatchScore(hintsUsed, totalSeconds, wrongGuessCount, earlyRevealCount, difficulty) {
  const safeHintsUsed = Math.max(1, hintsUsed)
  const hintPenalty = (safeHintsUsed - 1) * 15
  const timePenalty = Math.floor(totalSeconds / 10)
  const wrongPenalty = wrongGuessCount * WRONG_GUESS_PENALTY
  const revealPenalty = earlyRevealCount * EARLY_REVEAL_PENALTY
  const difficultyAdjust = DIFFICULTY_SCORE_ADJUST[difficulty] || 0
  const raw = 100 + difficultyAdjust - hintPenalty - timePenalty - wrongPenalty - revealPenalty
  return {
    score: Math.max(0, Math.min(100, raw)),
    hintPenalty,
    timePenalty,
    wrongPenalty,
    revealPenalty,
    difficultyAdjust,
  }
}

function buildScoreBreakdown(parts) {
  if (!parts) return ''
  const items = []
  if (parts.hintPenalty > 0) items.push('提示 -' + parts.hintPenalty)
  if (parts.revealPenalty > 0) items.push('提前 -' + parts.revealPenalty)
  if (parts.wrongPenalty > 0) items.push('误猜 -' + parts.wrongPenalty)
  if (parts.timePenalty > 0) items.push('用时 -' + parts.timePenalty)
  if (parts.difficultyAdjust !== 0) {
    items.push((parts.difficultyAdjust > 0 ? '难度 +' : '热身 ') + parts.difficultyAdjust)
  }
  return items.length ? items.join(' · ') : '首条命中，没有扣分'
}

function buildResultBurst(score, won) {
  if (!won) return '差一口气'
  if (score >= 95) return '天胡开局'
  if (score >= 80) return '漂亮收桌'
  if (score >= 60) return '稳稳拿下'
  return '守住一局'
}

function shouldBypassStoryHintAd() {
  try {
    if (!wx.getAccountInfoSync) return false
    const info = wx.getAccountInfoSync()
    const envVersion = info && info.miniProgram && info.miniProgram.envVersion
    const appId = info && info.miniProgram && info.miniProgram.appId
    return !appId || (envVersion && envVersion !== 'release')
  } catch (e) {
    return false
  }
}

function isStoryHintAdConfigured() {
  return STORY_HINT_AD_UNIT_ID && STORY_HINT_AD_UNIT_ID.indexOf('xxxxxxxx') === -1
}

Page({
  data: {
    idiomText: '',
    storyHook: '',
    storyHintText: '',
    storyHintUnlocked: false,
    storyHintLoading: false,
    storyHintButtonText: '看广告开锦囊',
    storyHintStatusText: '看广告得方向锦囊；不直接给答案，不扣分，但会帮你靠近典故。',
    sourceName: '',
    themeName: '',
    difficultyText: '',
    difficulty: 2,
    hints: [],
    hintVisible: [true, false, false, false, false],
    hintCards: [],
    status: 'playing',
    currentHintIndex: 0,
    currentHintNumber: 1,
    progressDots: [],
    timerSeconds: 10,
    totalSeconds: 0,
    skipText: '抢翻线索 -5分',
    skipHintText: '10 秒后免抢翻扣分；多看线索仍 -15',
    scoreRuleText: SCORE_RULE_TEXT,
    skipClassName: 'early',
    timerUrgent: false,
    inputText: '',
    inputChars: ['', '', '', ''],
    inputBoxes: buildInputBoxes(['', '', '', '']),
    inputFocused: false,
    canSubmit: false,
    inputStatus: '',
    guessAssistText: '',
    showResult: false,
    score: 0,
    scoreBreakdownText: '',
    resultRewardText: '',
    resultBurstText: '',
    rating: '',
    ratingEmoji: '',
    hintsUsed: 0,
    wrongGuessCount: 0,
    earlyRevealCount: 0,
    hintChain: [],
  },

  _timer: null,
  _idiomSet: null,
  _storyHintAd: null,
  _storyHintAdCloseHandler: null,
  _storyHintAdErrorHandler: null,
  _sharedIdiomText: '',

  onLoad(options) {
    if (options && options.idiom) {
      this._sharedIdiomText = decodeURIComponent(options.idiom)
      logEvent('share_open', { page: 'idiom_match', idiom: this._sharedIdiomText })
    }
    this._idiomSet = buildIdiomSet()
    this.initGame()
    this.setupStoryHintAd()
  },

  onUnload() {
    this.stopTimer()
    this.teardownStoryHintAd()
  },

  initGame() {
    this.stopTimer()
    const entries = buildEntries()
    const entry = pickEntry(entries, this._sharedIdiomText)
    const hints = entry.hints.slice(0, 5)
    const hintVisible = [true, false, false, false, false]

    this.setData({
      idiomText: entry.idiomText,
      storyHook: entry.storyHook,
      storyHintText: buildStoryHintText(entry),
      storyHintUnlocked: false,
      storyHintLoading: false,
      storyHintButtonText: '看广告开锦囊',
      storyHintStatusText: '看广告得方向锦囊；不直接给答案，不扣分，但会帮你靠近典故。',
      sourceName: entry.source,
      themeName: entry.theme,
      difficultyText: 'Lv.' + entry.difficulty,
      difficulty: entry.difficulty,
      hints,
      hintVisible,
      hintCards: buildHintCards(hints, hintVisible, 0),
      status: 'playing',
      currentHintIndex: 0,
      currentHintNumber: 1,
      progressDots: buildProgressDots(0),
      timerSeconds: HINT_TIMER_SECONDS,
      totalSeconds: 0,
      skipText: buildSkipText(HINT_TIMER_SECONDS, 0),
      skipHintText: buildSkipHintText(HINT_TIMER_SECONDS, 0),
      skipClassName: 'early',
      timerUrgent: false,
      inputText: '',
      inputChars: ['', '', '', ''],
      inputBoxes: buildInputBoxes(['', '', '', '']),
      inputFocused: false,
      canSubmit: false,
      inputStatus: '',
      guessAssistText: '',
      showResult: false,
      score: 0,
      scoreBreakdownText: '',
      resultRewardText: '',
      resultBurstText: '',
      hintsUsed: 0,
      wrongGuessCount: 0,
      earlyRevealCount: 0,
      hintChain: [],
    })
    this.startTimer()
  },

  setupStoryHintAd() {
    if (shouldBypassStoryHintAd()) {
      this.setData({
        storyHintButtonText: '打开锦囊',
        storyHintStatusText: '开发环境直接发放方向锦囊；正式版看广告获取。',
      })
      return
    }
    if (!isStoryHintAdConfigured()) {
      this.setData({
        storyHintButtonText: '打开锦囊',
        storyHintStatusText: '广告位尚未配置，本次可直接打开方向锦囊。',
      })
      return
    }
    if (!wx.createRewardedVideoAd) {
      this.setData({
        storyHintButtonText: '打开锦囊',
        storyHintStatusText: '当前环境不支持广告，本次可直接打开方向锦囊。',
      })
      return
    }
    try {
      this._storyHintAd = wx.createRewardedVideoAd({ adUnitId: STORY_HINT_AD_UNIT_ID })
    } catch (err) {
      console.warn('story hint rewarded ad init failed', err)
      this.setData({
        storyHintButtonText: '打开锦囊',
        storyHintStatusText: '广告暂时不可用，本次可直接打开方向锦囊。',
      })
      return
    }
    this._storyHintAdCloseHandler = res => {
      this.setData({ storyHintLoading: false, storyHintButtonText: '看广告开锦囊' })
      if (!res || res.isEnded) {
        this.unlockStoryHint('ad')
        return
      }
      wx.showToast({ title: '看完小视频才能打开锦囊', icon: 'none' })
    }
    this._storyHintAdErrorHandler = err => {
      console.warn('story hint rewarded ad error', err)
      this.setData({
        storyHintLoading: false,
        storyHintButtonText: '打开锦囊',
        storyHintStatusText: '广告暂时不可用，本次可直接打开方向锦囊。',
      })
    }
    this._storyHintAd.onClose(this._storyHintAdCloseHandler)
    this._storyHintAd.onError(this._storyHintAdErrorHandler)
    this._storyHintAd.load().catch(this._storyHintAdErrorHandler)
  },

  teardownStoryHintAd() {
    if (!this._storyHintAd) return
    if (this._storyHintAd.offClose && this._storyHintAdCloseHandler) {
      this._storyHintAd.offClose(this._storyHintAdCloseHandler)
    }
    if (this._storyHintAd.offError && this._storyHintAdErrorHandler) {
      this._storyHintAd.offError(this._storyHintAdErrorHandler)
    }
    this._storyHintAd = null
    this._storyHintAdCloseHandler = null
    this._storyHintAdErrorHandler = null
  },

  onUnlockStoryHint() {
    if (this.data.storyHintUnlocked || this.data.storyHintLoading) return
    if (!this._storyHintAd) {
      this.unlockStoryHint('fallback')
      return
    }
    this.setData({ storyHintLoading: true, storyHintButtonText: '广告加载中' })
    this._storyHintAd.show().catch(() => {
      this._storyHintAd.load()
        .then(() => this._storyHintAd.show())
        .catch(err => {
          this._storyHintAdErrorHandler(err)
          this.unlockStoryHint('fallback')
        })
    })
  },

  unlockStoryHint(source) {
    this.setData({
      storyHintUnlocked: true,
      storyHintLoading: false,
      storyHintButtonText: '锦囊已打开',
      storyHintStatusText: source === 'ad' ? '广告奖励已到账，方向锦囊不扣分。' : '方向锦囊已打开，本次不扣分。',
    })
    logEvent('use_hint', { mode: 'idiom_match', source, idiom: this.data.idiomText })
    if (source === 'ad') {
      logEvent('watch_ad_done', { placement: 'story_hint', idiom: this.data.idiomText })
    }
    wx.showToast({ title: '方向锦囊已打开', icon: 'none' })
  },

  startTimer() {
    this.stopTimer()
    this._timer = setInterval(() => {
      let sec = this.data.timerSeconds - 1
      let total = this.data.totalSeconds + 1
      let urgent = sec <= 3
      if (sec <= 0) {
        this.stopTimer()
        this.setData({
          timerSeconds: 0,
          totalSeconds: total,
          skipText: buildSkipText(0, this.data.currentHintIndex),
          skipHintText: buildSkipHintText(0, this.data.currentHintIndex),
          skipClassName: 'free',
          timerUrgent: false,
        })
        return
      }
      this.setData({
        timerSeconds: sec,
        totalSeconds: total,
        skipText: buildSkipText(sec, this.data.currentHintIndex),
        skipHintText: buildSkipHintText(sec, this.data.currentHintIndex),
        skipClassName: 'early',
        timerUrgent: urgent,
      })
    }, 1000)
  },

  stopTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  },

  onSkip() {
    if (this.data.status !== 'playing') return
    const isEarlyReveal = this.data.timerSeconds > 0 && this.data.currentHintIndex < 4
    this.stopTimer()
    this.advanceHint(isEarlyReveal)
  },

  advanceHint(isEarlyReveal) {
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
      timerSeconds: HINT_TIMER_SECONDS,
      skipText: buildSkipText(HINT_TIMER_SECONDS, nextIdx),
      skipHintText: buildSkipHintText(HINT_TIMER_SECONDS, nextIdx),
      skipClassName: 'early',
      timerUrgent: false,
      earlyRevealCount: this.data.earlyRevealCount + (isEarlyReveal ? 1 : 0),
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
    this.setData({ inputText: allChars.join(''), inputChars: chars, inputBoxes, canSubmit, inputStatus, guessAssistText: '' })
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
      const wrongGuessCount = this.data.wrongGuessCount + 1
      this.setData({
        wrongGuessCount,
        guessAssistText: '差一口气，先把已翻线索合成场景再猜常见成语 · -' + WRONG_GUESS_PENALTY,
      })
      wx.showToast({ title: '差一口气，换个常见成语', icon: 'none', duration: 1800 })
      wx.vibrateShort({ type: 'light' })
    }
  },

  endGame(won) {
    const hintsUsed = this.data.currentHintIndex + 1
    const totalSec = this.data.totalSeconds
    let score = 0
    let scoreParts = null
    if (won) {
      scoreParts = calcMatchScore(hintsUsed, totalSec, this.data.wrongGuessCount, this.data.earlyRevealCount, this.data.difficulty)
      score = scoreParts.score
    }

    let rating
    if (score >= 95) rating = '成语大师'
    else if (score >= 80) rating = '博学多才'
    else if (score >= 60) rating = '渐入佳境'
    else if (score >= 40) rating = '再接再厉'
    else rating = '继续努力'

    this.setData({
      status: won ? 'won' : 'lost',
      showResult: true,
      score,
      scoreBreakdownText: won ? buildScoreBreakdown(scoreParts) : '',
      resultRewardText: won ? (score >= 95 ? '高分印章到账 · 发给好友破局' : '印章到账 · 下一局冲 100') : '复盘已收好 · 换一题找手感',
      resultBurstText: buildResultBurst(score, won),
      rating,
      ratingEmoji: '',
      hintsUsed,
    })
    const playedCount = wx.getStorageSync(MATCH_PLAYED_KEY) || 0
    wx.setStorageSync(MATCH_PLAYED_KEY, playedCount + 1)
    this.setData({
      hintChain: this.data.hints.slice(0, hintsUsed).map((word, index) => ({
        index: index + 1,
        word,
      })),
    })
    if (won) wx.vibrateShort({ type: 'heavy' })
    logEvent(won ? 'win' : 'lose', {
      mode: 'idiom_match',
      idiom: this.data.idiomText,
      hintsUsed,
      score,
    })
  },

  onPlayAgain() { this.initGame() },
  onGoHome() { wx.reLaunch({ url: '/pages/home/home' }) },

  onShare() {
    logEvent('share_tap', { page: 'idiom_match', status: this.data.status, idiom: this.data.idiomText })
    const sharePath = '/pages/idiom-match/idiom-match?idiom=' + encodeURIComponent(this.data.idiomText)
    if (this.data.status === 'playing' || !this.data.showResult) {
      return {
        title: '提示猜词 · 五条线索猜一个成语\n来挑战这一题',
        path: sharePath,
      }
    }
    const resultLine = this.data.status === 'won'
      ? '我 ' + this.data.hintsUsed + ' 条线索猜中，' + this.data.score + '分'
      : '我差一点破题，来帮我赢回这局'
    return {
      title: '提示猜词 · ' + resultLine + '\n来同题挑战',
      path: sharePath,
    }
  },

  onShareAppMessage() { return this.onShare() },
})
