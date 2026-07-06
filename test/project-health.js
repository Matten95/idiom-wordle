const fs = require('fs')
const path = require('path')
const childProcess = require('child_process')

const root = path.resolve(__dirname, '..')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8')
}

function walk(dir, result = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, result)
    else result.push(full)
  })
  return result
}

function test(name, fn) {
  try {
    fn()
    console.log('✅ ' + name)
  } catch (e) {
    console.error('❌ ' + name)
    console.error('   ' + e.message)
    process.exitCode = 1
  }
}

test('派生成语词库与 data/idioms.json 同步', () => {
  childProcess.execFileSync('node', ['scripts/sync-data.js', '--check'], {
    cwd: root,
    stdio: 'pipe',
  })
})

test('小程序每日选题和引擎可在 Node 侧冒烟运行', () => {
  const daily = require('../miniprogram/utils/daily')
  const engine = require('../miniprogram/utils/engine')
  const idiom = daily.getDailyIdiom('2026-07-03')
  const result = engine.scoreGuess(idiom.chars, idiom.pinyin, idiom)
  assert(idiom.text === '卧薪尝胆', '2026-07-03 每日成语应保持稳定')
  assert(result.summary.isWin, '完全匹配的猜测应判定为胜利')
})

test('WXML 不直接调用 JS 方法', () => {
  const wxmlFiles = walk(path.join(root, 'miniprogram/pages'))
    .filter(file => file.endsWith('.wxml'))
  const banned = /\.(split|map|filter|reduce|join|slice|repeat|trim|toUpperCase|replace)\s*\(/
  const offenders = []

  wxmlFiles.forEach(file => {
    read(path.relative(root, file)).split('\n').forEach((line, index) => {
      if (banned.test(line)) {
        offenders.push(path.relative(root, file) + ':' + (index + 1) + ' ' + line.trim())
      }
    })
  })

  assert(offenders.length === 0, offenders.join('\n'))
})

test('主游戏格子颜色使用当前单元格状态', () => {
  const wxml = read('miniprogram/pages/index/index.wxml')
  assert(!wxml.includes('item.result.chars[0].color'), '不能用每行第一个字符颜色渲染整行')
  assert(wxml.includes('char-cell {{cell.color}}'), '应绑定当前 cell.color')
})

test('首页使用白玉靛蓝配色', () => {
  const wxss = read('miniprogram/pages/home/home.wxss')
  const appJson = read('miniprogram/app.json')
  assert(wxss.includes('#f1f5ff') && wxss.includes('#e4ebfb'), '首页背景应使用白玉靛蓝浅色体系')
  assert(wxss.includes('linear-gradient(135deg, #315fb5 0%, #5f73c7 100%)'), '首页主按钮应使用靛蓝到雾紫蓝的主渐变')
  assert(!wxss.includes('background: #a3442c;'), '首页主按钮不应沿用重朱砂主色')
  assert(!wxss.includes(['background: ', '#2f', '6f63;'].join('')), '首页主按钮不应沿用上一版松绿主色')
  assert(!wxss.includes('rgba(56, 44, 34, 0.88)'), '首页札记不应使用沉重深褐背景')
  assert(appJson.includes('"navigationBarBackgroundColor": "#F1F5FF"'), '全局导航底色应与白玉靛蓝浅色体系一致')
})

test('提示猜词精选题满足内容约束', () => {
  const hintBank = require('../miniprogram/data/idiom-hints')
  const curated = Object.keys(hintBank)
    .filter(key => key.indexOf('__') !== 0)
    .map(key => ({ idiom: key, entry: hintBank[key] }))
    .filter(item => !Array.isArray(item.entry))

  assert(curated.length >= 60, '至少需要 60 条精选谜面题')

  curated.forEach(({ idiom, entry }) => {
    assert(idiom.length === 4, idiom + ' 不是四字成语')
    assert(entry.source, idiom + ' 缺少 source')
    assert(entry.storyHook, idiom + ' 缺少 storyHook')
    assert(entry.difficulty >= 1 && entry.difficulty <= 4, idiom + ' difficulty 不合法')
    assert(Array.isArray(entry.hints) && entry.hints.length === 5, idiom + ' 必须有 5 条提示')
    const seen = new Set()
    entry.hints.forEach(hint => {
      assert(hint.length >= 2 && hint.length <= 4, idiom + ' 提示长度需为 2-4 字: ' + hint)
      assert(!seen.has(hint), idiom + ' 存在重复提示: ' + hint)
      seen.add(hint)
      Array.from(idiom).forEach(char => {
        assert(!hint.includes(char), idiom + ' 的提示包含答案字: ' + hint)
      })
    })
  })
})

test('提示猜词默认题池不包含高难冷僻题', () => {
  const hintBank = require('../miniprogram/data/idiom-hints')
  const idiomsData = require('../data/idioms.json')
  const defaultMax = hintBank.__meta.defaultMaxDifficulty
  const minSize = hintBank.__meta.defaultPoolMinSize
  const baseLevels = idiomsData.idioms.reduce((result, item) => {
    result[item.text] = item.level
    return result
  }, {})
  const highRiskIdioms = [
    '坠茵落溷',
    '渊渟岳峙',
    '镂月裁云',
    '鹤唳华亭',
    '燕颔虎颈',
    '姑射神人',
    '螽斯衍庆',
    '葳蕤繁祉',
    '黜陟幽明',
  ]
  const defaultEntries = Object.keys(hintBank)
    .filter(key => key.indexOf('__') !== 0)
    .map(key => {
      const entry = hintBank[key]
      return {
        idiom: key,
        difficulty: Array.isArray(entry) ? (baseLevels[key] || 2) : (entry.difficulty || 2),
        entry,
      }
    })
    .filter(({ difficulty, entry }) => {
      if (!Array.isArray(entry) && entry.defaultEligible === false) return false
      if (!Array.isArray(entry) && entry.defaultEligible === true) return true
      return difficulty <= defaultMax
    })

  assert(defaultMax <= 2, '默认提示题池最高难度不能超过 Lv.2')
  assert(defaultEntries.length >= minSize, '默认提示题池至少需要 ' + minSize + ' 条，当前 ' + defaultEntries.length + ' 条')
  assert(defaultEntries.every(item => item.difficulty <= defaultMax), '默认提示题池包含高难题')
  highRiskIdioms.forEach(idiom => {
    assert(!defaultEntries.some(item => item.idiom === idiom), '默认题池不能包含冷僻高难词: ' + idiom)
  })
})

test('提示猜词默认抽取大众题池', () => {
  const pageJs = read('miniprogram/pages/idiom-match/idiom-match.js')
  const roomJs = read('cloudfunctions/manageRoom/index.js')
  assert(pageJs.includes('DEFAULT_MAX_DIFFICULTY') && pageJs.includes('defaultEligible'), '单人提示猜词应从默认大众题池抽题')
  assert(!pageJs.includes('playedCount < 3'), '单人提示猜词不能按游玩次数自动放开高难题')
  assert(roomJs.includes('function getDefaultHintEntries') && roomJs.includes('DEFAULT_MAX_DIFFICULTY'), '双人房间应从默认大众题池抽题')
})

test('提示猜词展示来源并接受精选答案', () => {
  const pageJs = read('miniprogram/pages/idiom-match/idiom-match.js')
  const wxml = read('miniprogram/pages/idiom-match/idiom-match.wxml')
  assert(pageJs.includes('function buildIdiomSet') && pageJs.includes('Object.keys(idiomHints)'), '输入校验应包含精选谜面答案')
  assert(wxml.includes('{{sourceName}}'), '谜面卡片应展示来源信息')
})

test('提示卡不展示伪分类标签', () => {
  const pageJs = read('miniprogram/pages/idiom-match/idiom-match.js')
  const wxml = read('miniprogram/pages/idiom-match/idiom-match.wxml')
  const wxss = read('miniprogram/pages/idiom-match/idiom-match.wxss')
  const hintBank = require('../miniprogram/data/idiom-hints')
  const staleLabels = ['意象场景', '语义方向', '典故线索', '现代场景', '兜底线索']

  assert(!pageJs.includes('HINT_LABELS'), '提示猜词不应维护固定类型标签')
  assert(!pageJs.includes('label: HINT_LABELS'), '提示卡数据不应绑定伪分类标签')
  assert(!wxml.includes('hint-label') && !wxml.includes('{{item.label}}'), '提示卡不应展示意象/典故等分类标签')
  assert(!wxss.includes('.hint-label'), '提示卡样式不应保留已删除的分类标签')
  staleLabels.forEach(label => {
    assert(!hintBank.__meta.hintOrder.includes(label), '题库元信息不应保留伪分类: ' + label)
  })
})

test('返回首页动作使用稳定首页兜底', () => {
  const matchJs = read('miniprogram/pages/idiom-match/idiom-match.js')
  const lobbyJs = read('miniprogram/pages/room-lobby/room-lobby.js')
  const twoPlayerJs = read('miniprogram/pages/two-player-game/two-player-game.js')
  assert(matchJs.includes("wx.reLaunch({ url: '/pages/home/home' })"), '提示猜词返回首页不能只使用 navigateBack')
  assert(lobbyJs.includes("wx.reLaunch({ url: '/pages/home/home' })"), '房间大厅返回首页不能只使用 navigateBack')
  assert(twoPlayerJs.includes("wx.reLaunch({ url: '/pages/home/home' })"), '双人结果返回首页不能只使用 navigateBack')
})

test('双人分享深链可预填房间码', () => {
  const lobbyJs = read('miniprogram/pages/room-lobby/room-lobby.js')
  assert(lobbyJs.includes('function normalizeRoomCode'), '房间码应有统一清洗逻辑')
  assert(lobbyJs.includes('onLoad(options)') && lobbyJs.includes('options && options.code'), '房间大厅应消费分享路径中的 code')
  assert(lobbyJs.includes("mode: code ? 'join' : 'create'"), '带房间码冷启动应自动切到加入房间')
  assert(lobbyJs.includes('inputCode: code'), '带房间码冷启动应预填输入框')
  assert(lobbyJs.includes("path: '/pages/room-lobby/room-lobby?code=' + encodeURIComponent(this.data.roomCode)"), '分享房间路径应携带编码后的房间码')
})

test('每日和默认练习不抽高难冷僻题', () => {
  const daily = require('../miniprogram/utils/daily')
  const dailyJs = read('miniprogram/utils/daily.js')
  const cloudDailyJs = read('cloudfunctions/getDailyIdiom/index.js')

  for (let i = 0; i < 365; i++) {
    const date = new Date(Date.UTC(2026, 6, 1 + i))
    const dateStr = date.toISOString().slice(0, 10)
    const idiom = daily.getDailyIdiom(dateStr)
    assert(idiom.level <= 2, dateStr + ' 每日题不应为 Lv.' + idiom.level + ': ' + idiom.text)
  }

  for (let i = 0; i < 100; i++) {
    const idiom = daily.getRandomIdiom()
    assert(idiom.level <= 2, '默认练习不应抽到 Lv.' + idiom.level + ': ' + idiom.text)
  }

  assert(dailyJs.includes('DEFAULT_MAX_LEVEL = 2') && dailyJs.includes('getDefaultPool()'), '小程序每日题应使用大众难度池')
  assert(cloudDailyJs.includes('DEFAULT_MAX_LEVEL = 2') && cloudDailyJs.includes('level <= DEFAULT_MAX_LEVEL'), '云函数每日题应使用大众难度池')
})

test('提示猜词未结算分享不展示零分弱文案', () => {
  const pageJs = read('miniprogram/pages/idiom-match/idiom-match.js')
  assert(pageJs.includes("this.data.status === 'playing'") && pageJs.includes('来挑战这一题'), '未结算分享应使用邀请型文案')
  assert(!pageJs.includes('🎭 提示猜词'), '提示猜词分享文案不应依赖 emoji 装饰')
})

test('主流程按钮不使用 emoji 装饰', () => {
  const files = [
    'miniprogram/pages/index/index.wxml',
    'miniprogram/pages/idiom-match/idiom-match.wxml',
    'miniprogram/pages/room-lobby/room-lobby.wxml',
    'miniprogram/pages/two-player-game/two-player-game.wxml',
  ]
  const hasDecorativeSymbol = text => Array.from(text).some(char => {
    const code = char.codePointAt(0)
    return (
      code >= 0x1f000 ||
      (code >= 0x2600 && code <= 0x27bf) ||
      char === '⟲' ||
      char === '▶'
    )
  })
  const offenders = []

  files.forEach(file => {
    const content = read(file)
    const buttons = content.match(/<button[\s\S]*?<\/button>/g) || []
    buttons.forEach((button, index) => {
      if (hasDecorativeSymbol(button)) offenders.push(file + ' button#' + (index + 1))
    })
  })
  assert(offenders.length === 0, '按钮文案仍含 emoji: ' + offenders.join(', '))
})
