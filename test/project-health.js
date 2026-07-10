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
  childProcess.execFileSync('node', ['scripts/lint-idioms.js'], {
    cwd: root,
    stdio: 'pipe',
  })
  childProcess.execFileSync('node', ['scripts/audit-radical-hints.js', '--check'], {
    cwd: root,
    stdio: 'pipe',
  })
})

test('小程序每日选题和引擎可在 Node 侧冒烟运行', () => {
  const daily = require('../miniprogram/utils/daily')
  const engine = require('../miniprogram/utils/engine')
  const idiom = daily.getDailyIdiom('2026-07-03')
  const result = engine.scoreGuess(idiom.chars, idiom.pinyin, idiom)
  assert(idiom.text === '心旷神怡', '2026-07-03 每日成语应保持稳定')
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

test('猜词输入保留中文输入法候选栏', () => {
  const pages = [
    'miniprogram/pages/index/index',
    'miniprogram/pages/idiom-match/idiom-match',
    'miniprogram/pages/two-player-game/two-player-game',
  ]

  pages.forEach(page => {
    const wxml = read(page + '.wxml')
    const wxss = read(page + '.wxss')
    const js = read(page + '.js')
    const keyboardRule = wxss.match(/\.keyboard-input\s*\{[\s\S]*?\}/)

    assert(wxml.includes('cursor-spacing="160"'), page + ' 输入框应给中文输入法候选栏预留距离')
    assert(wxml.includes('wx:if="{{keyboardReady}}"'), page + ' 输入框清空时应可重建原生 input')
    assert(keyboardRule, page + ' 缺少 keyboard-input 样式')
    assert(!keyboardRule[0].includes('opacity: 0'), page + ' 不能用透明 input 承接中文输入')
    assert(!keyboardRule[0].includes('width: 2rpx') && !keyboardRule[0].includes('height: 2rpx'), page + ' 不能用 2rpx 隐藏 input 承接中文输入')
    assert(keyboardRule[0].includes('height: 68rpx') && keyboardRule[0].includes('font-size: 30rpx'), page + ' 原生 input 应有可见高度和字号')
    assert(js.includes('keyboardReady'), page + ' 清空输入时应重建原生 input')
    assert(js.includes("filter(c => /^[一-鿿]$/.test(c)).slice(0, 4)"), page + ' 四格只应接收已选中的汉字')
  })
})

test('主游戏格子颜色使用当前单元格状态', () => {
  const wxml = read('miniprogram/pages/index/index.wxml')
  const wxss = read('miniprogram/pages/index/index.wxss')
  assert(!wxml.includes('item.result.chars[0].color'), '不能用每行第一个字符颜色渲染整行')
  assert(wxml.includes('char-cell {{cell.color}}'), '应绑定当前 cell.color')
  assert(wxss.includes('bottom: calc(132rpx + env(safe-area-inset-bottom))'), '部首猜词操作按钮应固定在底栏上方')
  assert(wxss.includes('padding: calc(72rpx + env(safe-area-inset-top)) 24rpx 280rpx'), '部首猜词页面应给底栏和操作条预留空间')
})

test('首页使用成语挑战大厅结构', () => {
  const wxml = read('miniprogram/pages/home/home.wxml')
  const wxss = read('miniprogram/pages/home/home.wxss')
  assert(wxml.includes('成语挑战大厅') && wxml.includes('player-strip'), '首页应有玩家条和游戏大厅标题')
  assert(wxml.includes('hero-card') && wxml.includes('mode-grid'), '首页应突出主玩法入口和玩法卡片')
  assert(wxml.includes('今日印章') && wxml.includes('我的印记') && wxml.includes('今日排行'), '首页应用章印/排行语义替代办公面板')
  assert(wxml.includes('guide-trigger') && wxml.includes('部首猜词怎么玩'), '首页应提供可点开的玩法说明书')
  assert(wxss.includes('.guide-card') && wxss.includes('.guide-color-item'), '玩法说明书应有游戏化弹层样式')
  assert(wxss.includes('#eaf4ff') && wxss.includes('#f8efe0'), '首页背景应使用暖蓝到纸感的游戏大厅配色')
  assert(wxss.includes('linear-gradient(135deg, #e45b58 0%, #f0a641 100%)'), '首页主按钮应使用朱红到金色的游戏化渐变')
  assert(wxss.includes('.mode-badge') && wxss.includes('.mode-icon'), '玩法入口应有角标和图标感')
  assert(!wxss.includes('width: fit-content'), '首页样式不应依赖小程序兼容性不稳的 fit-content')
  assert(!wxss.includes('rgba(56, 44, 34, 0.88)'), '首页札记不应使用沉重深褐背景')
})

test('项目配置包含 AppID 并避免无 AppID 触发广告 SDK', () => {
  const rootConfig = JSON.parse(read('project.config.json'))
  const miniConfig = JSON.parse(read('miniprogram/project.config.json'))
  const matchJs = read('miniprogram/pages/idiom-match/idiom-match.js')

  assert(rootConfig.appid, '根目录 project.config.json 必须包含 appid')
  assert(miniConfig.appid === rootConfig.appid, 'miniprogram/project.config.json 应与根目录 appid 保持一致')
  assert(matchJs.includes('return !appId') && matchJs.includes('isStoryHintAdConfigured'), '广告锦囊在无 AppID 或广告位未配置时应绕过广告 SDK')
})

test('第一阶段上线闸门具备最小安全与可观测性', () => {
  const appJs = read('miniprogram/app.js')
  const dailyJs = read('miniprogram/utils/daily.js')
  const telemetryJs = read('miniprogram/utils/telemetry.js')
  const logEventJs = read('cloudfunctions/logEvent/index.js')
  const submitResultJs = read('cloudfunctions/submitResult/index.js')
  const secureGameJs = read('cloudfunctions/submitResult/game-service.js')
  const cloudClientJs = read('miniprogram/utils/cloud.js')
  const getRankingJs = read('cloudfunctions/getRanking/index.js')
  const syncDataJs = read('scripts/sync-data.js')
  const getRoomStateJs = read('cloudfunctions/getRoomState/index.js')
  const roomSyncJs = read('miniprogram/utils/room-sync.js')

  assert(getRoomStateJs.includes('sanitizeRoomForPlayer') && getRoomStateJs.includes('canSeeAnswer'), 'getRoomState 应按玩家视角脱敏答案')
  assert(getRoomStateJs.includes('live hints read failed') && getRoomStateJs.includes('room.gameState.currentHints'), 'getRoomState 应在实时提示集合失败时用房间提示缓存兜底')
  assert(roomSyncJs.includes('return _pollRoom(roomCode, callbacks)') && !roomSyncJs.includes("collection('idiom_rooms')"), '房间状态同步不能直接 watch 敏感房间集合')
  assert(dailyJs.includes('getUTCFullYear') && appJs.includes("require('./utils/daily')"), '客户端游戏日应统一为北京时间口径')
  assert(appJs.includes('onError(error)') && appJs.includes('onUnhandledRejection'), 'App 应注册全局异常上报')
  assert(telemetryJs.includes("name: 'logEvent'") && logEventJs.includes('ALLOWED_EVENTS'), '埋点应通过 logEvent 云函数收口')
  ;['enter_home','start_daily','submit_guess','win','lose','use_hint','watch_ad_done','share_tap','share_open','create_room','join_room'].forEach(eventName => {
    assert(logEventJs.includes("'" + eventName + "'"), '最小埋点事件缺失: ' + eventName)
  })
  assert(submitResultJs.includes("['puzzle', 'start', 'guess']") && submitResultJs.includes('LEGACY_SUBMISSION_REJECTED'), 'submitResult 应拒绝客户端直接上报最终成绩')
  assert(submitResultJs.includes("SESSION_COLLECTION = 'daily_game_sessions'") && submitResultJs.includes('db.runTransaction') && submitResultJs.includes('submitVerifiedGuess'), 'submitResult 应通过事务维护服务端每日会话')
  assert(secureGameJs.includes('process.env.DAILY_GAME_SECRET') && secureGameJs.includes('createHmac') && secureGameJs.includes('buildPublicPuzzle'), '每日答案应使用仅云端可见的密钥洗牌并返回脱敏题面')
  assert(cloudClientJs.includes("callDailyGame('guess'") && !cloudClientJs.includes('answerText:') && !cloudClientJs.includes('won: game.status'), '客户端只能逐次提交猜测，不能上传答案和胜负')
  assert(getRankingJs.includes('verified: true') && !getRankingJs.includes('answerText:'), '排行榜只能读取可信成绩且不能返回今日答案')
  assert(syncDataJs.includes('cloudfunctions/submitResult/idioms.json'), 'submitResult 的校验词库应纳入同步脚本')
})

test('第二阶段留存与传播基础能力已接入', () => {
  const dailyJs = read('miniprogram/utils/daily.js')
  const nodeDailyJs = read('src/daily.js')
  const cloudDailyJs = read('cloudfunctions/getDailyIdiom/index.js')
  const submitResultJs = read('cloudfunctions/submitResult/index.js')
  const secureGameJs = read('cloudfunctions/submitResult/game-service.js')
  const indexJs = read('miniprogram/pages/index/index.js')
  const indexWxml = read('miniprogram/pages/index/index.wxml')
  const indexWxss = read('miniprogram/pages/index/index.wxss')
  const retentionJs = read('miniprogram/utils/retention.js')
  const rewardedAdJs = read('miniprogram/utils/rewarded-ad.js')
  const shareCardJs = read('miniprogram/utils/share-card.js')
  const playerJs = read('miniprogram/utils/player.js')
  const getRankingJs = read('cloudfunctions/getRanking/index.js')
  const logEventJs = read('cloudfunctions/logEvent/index.js')
  const subscribeDailyJs = read('cloudfunctions/subscribeDaily/index.js')
  const appJs = read('miniprogram/app.js')
  const configJs = read('miniprogram/config.js')
  const matchJs = read('miniprogram/pages/idiom-match/idiom-match.js')
  const matchWxml = read('miniprogram/pages/idiom-match/idiom-match.wxml')
  const twoPlayerJs = read('miniprogram/pages/two-player-game/two-player-game.js')
  const twoPlayerWxml = read('miniprogram/pages/two-player-game/two-player-game.wxml')
  const daily = require('../miniprogram/utils/daily')
  const pool = require('../data/idioms.json').idioms.filter(item => item.level <= 2)
  const seen = new Set()

  for (let i = 0; i < pool.length; i++) {
    const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
    seen.add(daily.getDailyIdiom(date).text)
  }

  assert(seen.size === pool.length, '洗牌选题应在一个题池周期内不重复')
  assert(dailyJs.includes('DAILY_SHUFFLE_SEED') && dailyJs.includes('getDailySequence'), '小程序每日题应使用固定种子洗牌序列')
  assert(nodeDailyJs.includes('DAILY_SHUFFLE_SEED') && cloudDailyJs.includes('DAILY_SHUFFLE_SEED'), '本地练习与旧云端取题应保留一致的公开轮换口径')
  assert(secureGameJs.includes('getSecureDailySequence') && secureGameJs.includes('PUZZLE_VERSION') && submitResultJs.includes('getSecureDailyAnswer'), '可信每日局应改用服务端隐藏洗牌口径')
  assert(indexJs.includes('requestDailyReminder') && retentionJs.includes('wx.requestSubscribeMessage'), '结算页应接入明日订阅提醒')
  assert(retentionJs.includes("name: 'subscribeDaily'") && subscribeDailyJs.includes('idiom_subscriptions'), '订阅提醒应登记到云端集合')
  assert(subscribeDailyJs.includes("action === 'send'") && subscribeDailyJs.includes('cloud.openapi.subscribeMessage.send') && subscribeDailyJs.includes('lastSentDate') && subscribeDailyJs.includes('DAILY_REMINDER_TEMPLATE_ID'), 'subscribeDaily 应支持定时批量发送订阅消息并防重复')
  assert(configJs.includes('rewardedVideoAds') && configJs.includes('streakShield') && rewardedAdJs.includes('wx.createRewardedVideoAd'), '补签/护盾应集中配置激励视频广告位')
  assert(appJs.includes('markStreakRecoverable') && retentionJs.includes('repairStreakWithReward'), '断签时应记录可补签状态，看广告后可修复连胜')
  assert(indexJs.includes('claimShieldOrRepairWithAd') && retentionJs.includes('tryUseStreakShield'), '结算页应通过激励广告发放补签或护盾')
  assert(indexJs.includes('fetchDailyStats') && getRankingJs.includes('buildStats') && indexWxml.includes('今日全网对比'), '结算页应展示今日全网对比分布')
  assert(indexJs.includes('drawShareCard') && shareCardJs.includes('canvasToTempFilePath') && indexWxml.includes('canvas-id="shareCanvas"'), '主局分享应生成无剧透战绩图')
  assert(shareCardJs.includes('drawHintMatchShareCard') && matchJs.includes('drawHintMatchShareCard') && matchWxml.includes('canvas-id="shareCanvas"'), '提示猜词应生成同题挑战分享图')
  assert(shareCardJs.includes('drawDuelShareCard') && twoPlayerJs.includes('drawDuelShareCard') && twoPlayerWxml.includes('canvas-id="shareCanvas"'), '双人局应生成好友比分分享图')
  assert(indexJs.includes('onShareTimeline') && matchJs.includes('onShareTimeline') && twoPlayerJs.includes('onShareTimeline'), '主局、提示猜词和双人局应支持朋友圈分享')
  assert(indexWxml.includes('三步读懂部首猜词') && indexJs.includes('idiom_index_guide_seen'), '主局应有首次进入引导')
  assert(playerJs.includes('savePlayer({ nickname })'), '随机昵称应首次生成后固化')
  ;['share_image_ready','subscribe_daily','claim_streak_shield','use_streak_shield','repair_streak','daily_compare_loaded'].forEach(eventName => {
    assert(logEventJs.includes("'" + eventName + "'"), '留存传播埋点事件缺失: ' + eventName)
  })
  assert(indexWxss.includes('.compare-panel') && indexWxss.includes('.retention-panel') && indexWxss.includes('.first-guide-card'), '留存传播 UI 应有游戏化样式')
})

test('二级页面使用印记和好友开局语义', () => {
  const profileWxml = read('miniprogram/pages/profile/profile.wxml')
  const historyWxml = read('miniprogram/pages/history/history.wxml')
  const historyJs = read('miniprogram/pages/history/history.js')
  const lobbyWxml = read('miniprogram/pages/room-lobby/room-lobby.wxml')
  const homeJs = read('miniprogram/pages/home/home.js')

  assert(profileWxml.includes('我的印记册') && profileWxml.includes('破题手感'), '我的页应包装成玩家印记册')
  assert(profileWxml.includes('profile-action-card') && profileWxml.includes('好友开局'), '我的页应有回流到挑战/好友局的强 CTA')
  assert(historyWxml.includes('history-banner') && historyJs.includes('今日榜'), '排行页应明确使用今日榜语义')
  assert(historyJs.includes('正在翻开今日榜册'), '排行页标题不应等待云排行返回后才出现')
  assert(historyWxml.includes('可信今日榜') && historyWxml.includes('继续破题盖章'), '排行页应说明可信判分规则并保留回流目标')
  assert(!historyJs.includes('loadHistory') && !historyWxml.includes('answerText'), '今日榜不能回退为本地历史或展示答案')
  assert(lobbyWxml.includes('好友开局大厅') && lobbyWxml.includes('room-steps'), '房间页应包装成好友开局大厅')
  assert(lobbyWxml.includes('room-social-card') && lobbyWxml.includes('好友席位'), '房间页应有好友在场/待邀请状态')
  assert(homeJs.includes('好友开局') && homeJs.includes('今日排行'), '首页入口文案应与二级页面一致')
})

test('全局页面沿用首页游戏化配色', () => {
  const wxssFiles = [
    'miniprogram/app.wxss',
    'miniprogram/pages/home/home.wxss',
    'miniprogram/pages/index/index.wxss',
    'miniprogram/pages/idiom-match/idiom-match.wxss',
    'miniprogram/pages/room-lobby/room-lobby.wxss',
    'miniprogram/pages/two-player-game/two-player-game.wxss',
    'miniprogram/pages/history/history.wxss',
    'miniprogram/pages/profile/profile.wxss',
  ]
  wxssFiles.forEach(file => {
    const wxss = read(file)
    assert(wxss.includes('#eaf4ff') && (file === 'miniprogram/app.wxss' || wxss.includes('#f8efe0')), file + ' 应使用首页同源暖蓝纸感背景')
    assert(wxss.includes('#e45b58') && wxss.includes('#f0a641'), file + ' 应保留朱红/金色游戏化强调色')
    assert(!wxss.toLowerCase().includes('#f1f5ff') && !wxss.toLowerCase().includes('#e4ebfb'), file + ' 不应回到旧办公蓝白背景')
  })
  const appJson = JSON.parse(read('miniprogram/app.json'))
  assert(appJson.window.navigationBarBackgroundColor === '#EAF4FF', '全局导航栏应使用首页暖蓝背景')
  assert(appJson.window.backgroundColor === '#EAF4FF', '小程序窗口背景应使用首页暖蓝背景')
})

test('提示猜词按百分制结算', () => {
  const matchJs = read('miniprogram/pages/idiom-match/idiom-match.js')
  const matchWxml = read('miniprogram/pages/idiom-match/idiom-match.wxml')
  const submitGuessJs = read('cloudfunctions/submitGuess/index.js')
  const manageRoomJs = read('cloudfunctions/manageRoom/index.js')
  const twoPlayerJs = read('miniprogram/pages/two-player-game/two-player-game.js')
  const twoPlayerWxml = read('miniprogram/pages/two-player-game/two-player-game.wxml')

  assert(matchJs.includes('DIFFICULTY_SCORE_ADJUST') && matchJs.includes('WRONG_GUESS_PENALTY'), '单人提示猜词得分应纳入难度和误猜成本')
  assert(matchJs.includes('EARLY_REVEAL_PENALTY') && matchJs.includes('抢翻线索 -'), '单人提示猜词应支持抢翻线索并扣分')
  assert(submitGuessJs.includes('DIFFICULTY_SCORE_ADJUST') && submitGuessJs.includes('WRONG_GUESS_PENALTY'), '双人提交云函数得分应纳入难度和误猜成本')
  assert(manageRoomJs.includes('currentDifficulty') && manageRoomJs.includes('wrongGuessCount'), '双人房间应记录当前难度和误猜次数')
  assert(!matchJs.includes('if (!this.data.skipEnabled) return'), '提示猜词不能硬等倒计时后才能查看下一条')
  assert(matchWxml.includes('{{skipHintText}}'), '提前揭示成本应在界面上说明')
  assert(matchWxml.includes('{{scoreRuleText}}') && matchJs.includes('多看线索 -15 · 抢翻额外 -5 · 误猜 -4 · 用时每10秒 -1'), '提示猜词应把主要扣分规则常显')
  assert(matchJs.includes('免抢翻扣分；多看线索仍 -15'), '免费等待文案应说明只免抢翻扣分，多看线索仍计分')
  assert(matchWxml.includes('scoreBreakdownText'), '单人结果页应展示扣分明细')
  assert(matchJs.includes('Math.min(100') && submitGuessJs.includes('Math.min(100'), '提示猜词得分应封顶 100')
  assert(!matchJs.includes('1000 -') && !submitGuessJs.includes('1000 -'), '不能保留千分制公式')
  assert(!matchJs.includes('score >= 950'), '百分制评级不能保留千分阈值')
  assert(matchWxml.includes('分 / 100'), '单人结果页应展示百分制上限')
  assert(twoPlayerJs.includes('scorePercent') && twoPlayerJs.includes('totalRounds * 100'), '双人最终成绩应折算百分制')
  assert(twoPlayerWxml.includes('scorePercent') && twoPlayerWxml.includes('分 / 100'), '双人结果页应展示百分制总评')
})

test('双人对局公平推进和结算可信', () => {
  const lobbyJs = read('miniprogram/pages/room-lobby/room-lobby.js')
  const lobbyWxml = read('miniprogram/pages/room-lobby/room-lobby.wxml')
  const twoPlayerJs = read('miniprogram/pages/two-player-game/two-player-game.js')
  const twoPlayerWxml = read('miniprogram/pages/two-player-game/two-player-game.wxml')
  const manageRoomJs = read('cloudfunctions/manageRoom/index.js')
  const getRoomStateJs = read('cloudfunctions/getRoomState/index.js')
  const submitHintJs = read('cloudfunctions/submitHint/index.js')
  const submitGuessJs = read('cloudfunctions/submitGuess/index.js')
  const roomSyncJs = read('miniprogram/utils/room-sync.js')

  assert(lobbyJs.includes('totalRounds: 6') && lobbyWxml.includes('6 局') && lobbyWxml.includes('10 局'), '好友局默认应使用偶数局，保证双方猜词次数一致')
  assert(lobbyJs.includes('normalizeTotalRounds') && manageRoomJs.includes('normalizeTotalRounds'), '前后端都应兜底规范好友局局数')
  assert(lobbyJs.includes('_enteringGame') && lobbyJs.includes("room.status === 'playing'") && lobbyJs.includes('redirectTo'), '非房主应在房主开局后自动入局')
  assert(twoPlayerJs.includes('sort((a, b) => (b.score || 0) - (a.score || 0))'), '双人最终结果应按真实分数排序')
  assert(twoPlayerWxml.includes('item.isWinner') && !twoPlayerWxml.includes('index === 0'), '胜者标记不能依赖玩家数组下标')
  assert(twoPlayerWxml.includes('onGiveUpRound') && manageRoomJs.includes("case 'giveUp'"), '双人猜词应有揭晓本局出口，避免卡死')
  assert(manageRoomJs.includes('本局还没结算，不能进入下一局'), '进入下一局前必须确认本局已结算')
  assert(submitGuessJs.includes('本局已经结算'), '本局结算后不能继续累计误猜')
  assert(manageRoomJs.includes('ROOM_TTL_MS') && getRoomStateJs.includes('ROOM_TTL_MS'), '好友房应有过期收桌兜底')
  assert(manageRoomJs.includes('finishedReason') && getRoomStateJs.includes('finishedReason'), '过期房间应被标记为已收桌')
  assert(manageRoomJs.includes('你不在这个房间') && manageRoomJs.includes('lastActiveAt'), '非房间玩家不能结束/推进房间，房间应记录最后活跃时间')
  assert(manageRoomJs.includes('playerCount') && manageRoomJs.includes('joinedOpenids') && manageRoomJs.includes('playerCount: _.lt') && manageRoomJs.includes('!Array.isArray(room.joinedOpenids)'), '加入房间应原子限制人数和重复 openid，并兼容旧等待房')
  assert(submitHintJs.includes('hintCount') && submitHintJs.includes('hintWords') && submitHintJs.includes("'gameState.hintCount': _.lt(5)"), '双人提示词应原子限制重复提交和 5 条上限')
  assert(manageRoomJs.includes('settledRound') && submitGuessJs.includes('settledRound'), '双人结算和推进应有回合级幂等锁')
  assert(!roomSyncJs.includes("collection('idiom_rooms')") && roomSyncJs.includes('_pollRoom(roomCode, callbacks)'), '房间状态同步应统一走脱敏云函数')
  assert(roomSyncJs.includes('doc.word || doc.hintWord'), '轮询线索同步应兼容状态接口和实时集合字段')
  assert(!twoPlayerWxml.includes('catchtap="onNextRound"'), '回合遮罩不能点击即推进，避免误触跳局')
  assert(twoPlayerJs.includes("room.status !== 'playing'") && twoPlayerJs.includes('redirectToLobby'), '等待房间不能被对局页渲染成假开局')
  assert(twoPlayerWxml.includes('hintInputVisible') && !twoPlayerWxml.includes('value="{{hintInput}}"') && !twoPlayerWxml.includes('maxlength="2"'), '双人线索输入不能使用受控 value/maxlength 打断中文输入法')
  assert(twoPlayerJs.includes('_hintInput') && twoPlayerJs.includes('onHintBlur') && twoPlayerJs.includes('_clearHintInput'), '双人线索输入应使用本地变量暂存并在成功后重建输入框清空')
})

test('提示猜词故事锦囊通过激励广告解锁', () => {
  const matchJs = read('miniprogram/pages/idiom-match/idiom-match.js')
  const matchWxml = read('miniprogram/pages/idiom-match/idiom-match.wxml')
  const matchWxss = read('miniprogram/pages/idiom-match/idiom-match.wxss')

  assert(matchJs.includes('STORY_HINT_AD_UNIT_ID'), '故事锦囊应集中配置激励视频广告位')
  assert(matchJs.includes('wx.createRewardedVideoAd'), '故事锦囊应接入微信激励视频广告接口')
  assert(matchJs.includes('getAccountInfoSync') && matchJs.includes("envVersion !== 'release'"), '开发环境应绕过广告并直接解锁锦囊')
  assert(matchJs.includes('buildStoryHook') && matchJs.includes('detail.meaning'), '旧格式题也应用成语释义生成真实锦囊')
  assert(matchJs.includes('onUnlockStoryHint') && matchJs.includes('unlockStoryHint'), '故事锦囊应有解锁入口和到账逻辑')
  assert(matchJs.includes('res.isEnded'), '必须完整观看广告后才发放锦囊奖励')
  assert(matchJs.includes('storyHintUnlocked: false'), '每局开局应默认锁住故事锦囊')
  assert(!matchJs.includes("storyHook: '五条线索会逐步揭开谜底。'"), '旧格式题的锦囊不能使用无信息量占位句')
  assert(matchJs.includes('maskAnswerChars') && matchJs.includes('方向锦囊'), '广告锦囊应给方向方法并遮蔽答案字，避免直接降低题目难度')
  assert(!matchJs.includes('这题和「') && !matchJs.includes('先往「'), '广告锦囊不能直接用主题标签缩小答案集合')
  assert(matchWxml.includes('wx:if="{{storyHintUnlocked}}"') && matchWxml.includes('{{storyHintText}}'), '解锁后应展示方向锦囊')
  assert(!matchWxml.includes('<text class="story-hook">{{storyHook}}</text>'), 'storyHook 不能开局常显')
  assert(!matchWxml.includes('<text class="story-hook" wx:if="{{storyHintUnlocked}}">{{storyHook}}</text>'), '广告锦囊不能直接展示完整 storyHook')
  assert(matchWxml.includes('result-story') && matchWxml.includes('{{storyHook}}'), '完整 storyHook 应只在结算复盘中展示')
  assert(matchWxml.includes('锦囊待解锁') && matchWxml.includes('bindtap="onUnlockStoryHint"'), '页面应展示可点击的锦囊解锁入口')
  assert(matchWxss.includes('.story-lock') && matchWxss.includes('.btn-story-hint'), '故事锦囊应有游戏化封存样式')
})

test('部首猜词首轮失败后提供轻救援', () => {
  const indexJs = read('miniprogram/pages/index/index.js')
  const indexWxml = read('miniprogram/pages/index/index.wxml')
  const homeWxml = read('miniprogram/pages/home/home.wxml')

  assert(indexWxml.includes("attempts.length >= 1"), '部首救援入口应在第一次尝试后出现')
  assert(indexJs.includes('看部首猜 4 字成语，颜色会提示字、音、位置'), '主局首屏输入引导应直接说明玩家当前该怎么猜')
  assert(indexJs.includes('答案仍是常见四字成语') && indexJs.includes('先别猜冷僻词'), '救援提示应提醒玩家回到常见成语范围')
  assert(homeWxml.includes('第一次猜错后，游戏页会出现“需要提示”'), '首页玩法说明应同步救援出现时机')
})

test('部首提示位更容易形成开局思路', () => {
  const miniDaily = read('miniprogram/utils/daily.js')
  const nodeDaily = read('src/daily.js')
  const daily = require('../miniprogram/utils/daily')
  const idioms = require('../data/idioms.json').idioms
  const target = idioms.find(item => item.text === '鸡犬升天')
  const targetPositions = daily.getHintPositions('', target.radicalPositions, target.radicals, target.chars)

  assert(miniDaily.includes('RADICAL_POSITION_WEIGHTS') && nodeDaily.includes('RADICAL_POSITION_WEIGHTS'), '前两字与后两字应使用不同提示权重')
  assert(miniDaily.includes('RADICAL_HINT_TARGET') && nodeDaily.includes('RADICAL_HINT_TARGET'), '部首提示应控制总信息量')
  assert(miniDaily.includes('WEAK_RADICALS') && nodeDaily.includes('WEAK_RADICALS'), '部首提示应弱化低信息量部首')
  assert(miniDaily.includes('RADICAL_HINT_OVERRIDES') && nodeDaily.includes('RADICAL_HINT_OVERRIDES'), '特殊字形题应允许人工校准')
  idioms.forEach(idiom => {
    const positions = daily.getHintPositions('', idiom.radicalPositions, idiom.radicals, idiom.chars)
    assert(positions.length >= 2 && positions.length <= 3, idiom.text + ' 应展示 2-3 枚部首')
    assert(positions.some(index => index < 2) && positions.some(index => index >= 2), idiom.text + ' 应同时覆盖前后半成语结构')
    assert(new Set(positions).size === positions.length, idiom.text + ' 提示位置不能重复')
  })
  assert(targetPositions.join(',') === '0,3', '鸡犬升天应避开低辨识度的“升→十”')
  assert(fs.existsSync(path.join(root, 'docs/radical-hint-audit.md')), '应保留全词库逐题部首审计报告')
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

test('提示词避免同义词堆叠', () => {
  const hintBank = require('../miniprogram/data/idiom-hints')
  const conflictGroups = [
    ['借势','仗势','倚仗'],
    ['白说','白讲','空谈'],
    ['挽回','挽救','修正','修复'],
    ['多疑','疑心','猜疑'],
    ['多虑','担心','过虑'],
    ['空论','理论','虚浮','不实','夸夸'],
    ['兼得','并举','两全','并用','齐美'],
    ['佩服','崇敬','折服','钦佩','崇拜'],
    ['短暂','刹那','倏忽','即逝','转瞬'],
  ]
  const entries = Object.keys(hintBank)
    .filter(key => key.indexOf('__') !== 0)
    .map(key => ({
      idiom: key,
      hints: Array.isArray(hintBank[key]) ? hintBank[key] : hintBank[key].hints,
    }))

  entries.forEach(({ idiom, hints }) => {
    conflictGroups.forEach(group => {
      const hits = hints.filter(hint => group.includes(hint))
      assert(hits.length <= 1, idiom + ' 提示同义堆叠: ' + hits.join('、'))
    })
  })
})

test('提示词避免固定模板和跨题高频复用', () => {
  const hintBank = require('../miniprogram/data/idiom-hints')
  const frequencies = {}
  const entries = Object.keys(hintBank)
    .filter(key => key.indexOf('__') !== 0)
    .map(key => Array.isArray(hintBank[key]) ? hintBank[key] : hintBank[key].hints)

  let negationTemplateCount = 0
  entries.forEach(hints => {
    hints.forEach(hint => {
      frequencies[hint] = (frequencies[hint] || 0) + 1
      if (hint.startsWith('非')) negationTemplateCount += 1
    })
    for (let i = 0; i < hints.length; i++) {
      for (let j = i + 1; j < hints.length; j++) {
        const shorter = hints[i].length <= hints[j].length ? hints[i] : hints[j]
        const longer = shorter === hints[i] ? hints[j] : hints[i]
        assert(!longer.includes(shorter), '同题提示不能互相包含: ' + shorter + ' / ' + longer)
      }
    }
  })

  assert(negationTemplateCount <= 10, '全库“非…”式提示不能形成固定模板，当前 ' + negationTemplateCount + ' 条')
  Object.keys(frequencies).forEach(hint => {
    assert(frequencies[hint] <= 5, '提示词跨题复用过多: ' + hint + ' × ' + frequencies[hint])
  })
})

test('提示猜词题库声明递进提示结构', () => {
  const hintBank = require('../miniprogram/data/idiom-hints')
  const pattern = hintBank.__meta.hintPattern
  assert(Array.isArray(pattern) && pattern.length === 5, '题库元信息应声明 5 段式提示结构')
  assert(JSON.stringify(pattern) === JSON.stringify(['抽象义','使用场景','典故物件','辨析转折','强指向']), '提示结构应覆盖抽象义/场景/典故/辨析/强指向')
  assert(hintBank.__meta.hintStyle.includes('最多 2 条近义词'), '提示规则应限制近义词数量')
  assert(hintBank.__meta.hintStyle.includes('不做同义词连发'), '提示规则应禁止同义词连发')
  assert(hintBank.__meta.hintStyle.includes('不固定句式'), '提示规则应禁止辨析线索使用固定句式')
  assert(hintBank.__meta.hintStyle.includes('误导'), '提示规则应要求线索脱离分类标签仍能成立')
})

test('提示猜词新增典故题已场景化', () => {
  const hintBank = require('../miniprogram/data/idiom-hints')
  const expected = {
    '洛阳纸贵': ['左思','三都','争抄','都城','文名'],
    '程门立雪': ['杨时','求教','寒深','静候','尊师'],
    '孟母三迁': ['择邻','教子','市肆','学宫','慈教'],
    '草船借箭': ['孔明','大雾','曹营','巧取','江面'],
  }
  const staleHints = ['态度','行动','口语','职场','做法','合作','共做','齐力','害怕','惊惧','发慌','不安','颤抖']

  Object.keys(expected).forEach(idiom => {
    const hints = hintBank[idiom].hints
    assert(JSON.stringify(hints) === JSON.stringify(expected[idiom]), idiom + ' 应改成场景化提示词')
    staleHints.forEach(hint => {
      assert(!hints.includes(hint), idiom + ' 不应保留同质解释词: ' + hint)
    })
  })
})

test('提示猜词题库剔除四字词和同质题', () => {
  const hintBank = require('../miniprogram/data/idiom-hints')
  const removedIdioms = [
    '自相矛盾','囫囵吞枣','女娲补天','马马虎虎','粗心大意','手忙脚乱','草长莺飞','铁杵成针',
    '有福同享','分秒必争','乐于助人','崇山峻岭','层峦叠嶂','奇花异草','心平气和','诚心诚意',
    '光明磊落','繁荣昌盛','昂首挺胸','骄阳似火','同心协力','齐心合力','万众一心','众志成城',
    '人山人海','团结一致','朝气蓬勃','生机勃勃','患难与共','亲密无间','兴高采烈','愁眉苦脸',
    '一心一意','花好月圆','三心二意','四面八方','五颜六色','七嘴八舌','千军万马','万紫千红',
    '风和日丽','鸟语花香','春暖花开','秋高气爽','心旷神怡','目瞪口呆','眉开眼笑','惊天动地',
    '聚精会神','助人为乐','形影不离','春色满园','蒸蒸日上','欣欣向荣','雪泥鸿爪','吉光片羽',
  ]
  removedIdioms.forEach(idiom => {
    assert(!hintBank[idiom], '提示猜词题库不应保留已剔除条目: ' + idiom)
  })
  ;['清心寡欲','坐怀不乱','乐不思蜀','叶公好龙','请君入瓮','负荆请罪','完璧归赵','毛遂自荐','一鼓作气','退避三舍','洛阳纸贵','程门立雪','孟母三迁','草船借箭'].forEach(idiom => {
    assert(hintBank[idiom], '题库应保留或补入更适合典故锦囊的成语: ' + idiom)
  })
  assert(hintBank.__meta.curationPolicy && hintBank.__meta.curationPolicy.includes('必须有典故影子'), '提示猜词题库应声明典故专项校准口径')
})

test('提示猜词人工校准避免泛化安全词', () => {
  const hintBank = require('../miniprogram/data/idiom-hints')
  const genericHints = new Set([
    '态度','行动','口语','职场','做法','好友','泥坑','方式','情况','状态','关系','变化',
    '结果','表现','感觉','问题','事情','道理','生活','日常','场面','说法','处理','选择',
  ])
  Object.keys(hintBank).forEach(idiom => {
    if (idiom.indexOf('__') === 0) return
    const entry = hintBank[idiom]
    const hints = Array.isArray(entry) ? entry : entry.hints
    ;(hints || []).forEach(hint => {
      assert(!genericHints.has(hint), idiom + ' 不应使用泛化安全词提示: ' + hint)
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
  assert(pageJs.includes("'pages/idiom-match/idiom-match?idiom=' + encodeURIComponent(this.data.idiomText)") || pageJs.includes("'/pages/idiom-match/idiom-match?idiom=' + encodeURIComponent(this.data.idiomText)"), '分享挑战应带当前题目，确保好友挑战同一题')
  assert(!pageJs.includes('🎭 提示猜词'), '提示猜词分享文案不应依赖 emoji 装饰')
})

test('分享与首页说明更像游戏邀请', () => {
  const homeJs = read('miniprogram/pages/home/home.js')
  const homeWxml = read('miniprogram/pages/home/home.wxml')
  const lobbyJs = read('miniprogram/pages/room-lobby/room-lobby.js')
  const twoPlayerJs = read('miniprogram/pages/two-player-game/two-player-game.js')

  assert(homeJs.includes('todayGoalText') && homeWxml.includes('今日目标'), '首页应把新手目标包装为每日目标')
  assert(homeWxml.includes('每次提交后看颜色') && homeWxml.includes('优先试常见成语'), '首页部首说明应短句化并聚焦部首猜词本身')
  assert(!homeWxml.includes('卡住后开锦囊，拿方向') && !homeWxml.includes('好友局轮流出题猜词'), '部首猜词说明不应混入提示猜词或好友局内容')
  assert(lobbyJs.includes('缺你上桌') && lobbyJs.includes("path: '/pages/room-lobby/room-lobby?code='"), '房间分享应像好友邀约并携带房间码')
  assert(twoPlayerJs.includes('来复仇开一桌') && twoPlayerJs.includes('我差点翻盘'), '双人结算分享应给玩家复仇动机')
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
