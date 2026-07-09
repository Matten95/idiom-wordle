# Idiom Wordle 项目知识库与评估

更新时间：2026-07-09

## 1. 当前状态快照

项目当前是一个原生微信小程序版“成语 Wordle / 成语日课”。核心体验包括每日猜成语、拼音反馈、部首提示、提示猜词、自由练习、双人对战、历史记录和个人资料。

本轮迭代后，产品经理子代理最终复评：

| 维度 | 分数 | 结论 |
|---|---:|---|
| 首页 | 93 / 100 | “成语日课 / 今日谜题笺 / 暖纸背景 / 单一主 CTA”成立 |
| 提示猜词 | 92 / 100 | 精选题、来源展示、递进提示链、视觉统一已达标 |
| 整体 | 92 / 100 | 达到本轮 92 分目标 |

2026-07-04 回归优化后，产品经理子代理复评本轮稳定性与质感优化为 90 / 100：返回首页、未结算分享、主流程按钮 emoji、提示手动揭示均达标；扣分项主要是精选题库尚未扩到 200+。

2026-07-04 “不要有冷僻高难词汇”迭代后，默认入口策略已收紧：单人提示猜词、双人提示猜词、每日题、默认练习都不再自动抽 Lv.3/Lv.4；提示猜词默认大众池扩充到 229 条，并通过健康检查防止高难题回流。

2026-07-05 体验优化后，提示猜词卡片已去掉“意象/典故/场景”等固定分类标签，只展示线索本身；首页配色从重暖黄和朱砂主色调整为米白、淡青绿、松绿、淡蓝和少量金色点缀，整体更清爽克制。

2026-07-09 上线闸门和留存传播的代码侧能力已大体落地：游戏日统一北京时间、每日题改为洗牌序列、`submitResult` 服务端校验、双人局猜词者视角脱敏、最小埋点与全局异常上报、订阅提醒登记/发送云函数、补签护盾、Canvas 战绩分享图、朋友圈分享、首启引导、昵称固化、今日全网对比均已纳入健康检查。主词库已扩到 213 条，每日题池 153 条；提示猜词题库完成典故专项清洗，当前 241 条，默认大众题池 201 条。

## 2. 最新产品形态

首页已经从旧的深蓝按钮列表，调整为新中式“今日谜题笺”：

- 首屏突出每日挑战。
- 使用米白/淡青绿底色、墨色正文、松绿主 CTA、淡蓝/金色点缀。
- 展示日期、题号、今日完成状态、4 个部首格、主按钮、三个次入口和今日札记。
- “竞技”降级为弱入口，不再抢主任务。

提示猜词已经完成第二轮产品化与典故专项清洗：

- 提示猜词题库当前 241 条，默认大众题池 201 条。
- 默认优先抽取 Lv.1-Lv.2 大众题，冷僻高难题不从普通入口自动出现。
- 已剔除一批泛四字词、同质词和冷僻雅词，补入常见典故题。
- 5 条提示按固定顺序递进，不再随机旋转，也不再显示“意象/典故/场景”等伪分类标签。
- 谜面卡片展示难度、主题和来源。
- 精选答案加入输入校验，不再误报“不在词库”。
- 分享文案不直接泄露答案。
- 页面视觉已统一为纸面、墨色、松绿、青蓝体系。
- 普通入口默认只抽 `defaultEligible` 题池，`defaultMaxDifficulty` 为 2。

## 3. 技术栈

| 层 | 实现 |
|---|---|
| 小程序 | 原生 WXML + WXSS + JS，`Page`/`App` 构造器 |
| 后端 | 微信云开发，独立云函数 + 云数据库 |
| 本地引擎 | Node.js CommonJS 脚本 |
| 数据 | `data/idioms.json` 作为主词库源，脚本同步到小程序和云函数 |
| 测试 | Node 脚本测试 + 项目健康检查 + 微信开发者工具自动化场景 |

## 4. 目录地图

| 路径 | 作用 |
|---|---|
| `miniprogram/app.json` | 页面注册、窗口配置、云开发开关 |
| `miniprogram/pages/home` | 首页，展示每日谜题部首提示和玩法入口 |
| `miniprogram/pages/index` | 每日挑战/自由练习主游戏页 |
| `miniprogram/pages/idiom-match` | 单人提示猜词玩法 |
| `miniprogram/pages/room-lobby` | 双人房间创建/加入/等待 |
| `miniprogram/pages/two-player-game` | 双人提示者/猜词者实时对局 |
| `miniprogram/data/idiom-hints.js` | 提示猜词题库，含精选谜面数据 |
| `cloudfunctions/manageRoom` | 双人房间生命周期与抽题 |
| `scripts/sync-data.js` | 同步主词库和提示词派生数据 |
| `test/project-health.js` | 项目健康检查，覆盖数据同步、WXML 约束、精选题质量 |

## 5. 核心数据流

### 每日挑战

1. `home` 调用 `miniprogram/utils/daily.getDailyIdiom()` 选出今日成语。
2. `getHintPositions()` 根据日期和 `radicalPositions` 选择部首提示位。
3. 用户进入 `index`，输入 4 个汉字。
4. `miniprogram/utils/engine.scoreGuess()` 产生每格反馈。
5. 结束后保存本地历史，并通过云函数同步排行榜。

### 单人提示猜词

1. `idiom-match` 从 `miniprogram/data/idiom-hints.js` 构建题池。
2. `pickEntry()` 永远从默认大众题池抽题；数组题会读取主词库 level，对象题读取 `difficulty/defaultEligible`。
3. 页面展示 `difficultyText`、`themeName`、`sourceName` 和故事化谜面。
4. 5 条提示固定递进展示。
5. 输入校验同时接受主成语词库和精选谜面答案。
6. 结算分享不直接泄露答案。

### 双人提示猜词

1. `manageRoom` 通过 `getDefaultHintEntries()` 从默认大众题池抽题，并通过同步过来的 `idioms.json` 识别数组题等级。
2. 房间状态通过云数据库同步，客户端用 `getRoomState` 获取当前用户视角。
3. 提示和猜测使用点路径更新 `gameState.currentHints`、`gameState.roundResults`，避免覆盖整个 `gameState`。

## 6. 已解决的重要问题

- 主游戏格子颜色已改为绑定当前 `cell.color`。
- WXML 中 `idiomText.split('')` 已移到 JS 端预计算。
- 双人云函数 `gameState` 嵌套字段更新已改为点路径。
- 双人身份识别不再只依赖昵称，服务端返回当前用户视角。
- 主词库同步脚本已加入，`npm test` 会检查派生数据同步。
- 提示猜词精选题会校验数量、5 条提示、提示长度和不包含答案字。
- 提示猜词默认大众池已校准为 201 条，并校验不包含 `坠茵落溷`、`渊渟岳峙`、`镂月裁云`、`鹤唳华亭` 等高难冷僻题。
- 每日题和默认练习已限制为 Lv.1-Lv.2，健康检查覆盖未来 365 天。
- 每日题已改为固定种子洗牌序列，一个题池周期内不重复。
- `submitResult` 已做服务端答案、日期、attempts 和未来日期校验。
- 双人局通过 `getRoomState` 按玩家视角脱敏，猜词者不会拿到答案。
- App 已接入全局异常上报，最小埋点事件通过 `logEvent` 云函数收口。
- 订阅提醒、补签护盾、激励广告降级、今日全网对比、Canvas 分享图和朋友圈分享已接入代码。
- 首页、主局、提示猜词、好友局、历史印记和我的印记册已统一到暖蓝纸感与朱红/金色强调的游戏化视觉。
- 首次进入主局已有 3 步引导，首页保留可打开的玩法说明入口。
- 随机昵称首次生成后会固化，避免房间和排行里的玩家名漂移。
- 每日部首提示会在明确位置不足时补一个未使用位置，保证主游戏始终返回 2 个提示位。
- 双人房间分享路径中的 `code` 已被房间大厅消费，冷启动会自动切到加入页并预填房间码。
- 提示猜词卡片已移除固定类别标签，题库元信息改为中性线索顺序，避免“伪意象/伪典故”显得不专业。
- 首页主按钮和整体配色已从重朱砂暖黄改为松绿与浅米青体系，并通过健康检查防回退。

## 7. 当前未完成 TODO

已合并到根目录 `TODO.md`，后续只维护这一份 TODO 清单。

## 8. 最新验证记录

本轮最终通过：

- `npm test`
- JS 语法检查
- `app.json` JSON 校验
- `git diff --check`
- 微信开发者工具首页场景自动化
- 微信开发者工具提示猜词场景自动化
- `getexceptions` 返回空数组
- `getlogs(type:error)` 返回空数组

2026-07-04 补充回归：

- 提示猜词倒计时结束后停留在当前提示，显示“查看下一条提示”，点击后才揭示下一条。
- 提示猜词结算弹层“返回首页”点击后稳定回到 `pages/home/home`。
- 主游戏结算弹层“返回首页”点击后稳定回到 `pages/home/home`。
- 房间大厅直开后顶部返回稳定回到 `pages/home/home`。
- 双人游戏无效房间码冷启动会兜底回首页，不会悬空。
- `page_callMethod('onShare')` 验证提示猜词未结算分享标题为邀请型文案。
- MCP `getLogs(error)` 和 `getLogs(exception)` 均为空。

2026-07-04 默认大众题池回归：

- `npm test` 通过，新增默认题池策略检查。
- JS 语法检查、`app.json` JSON 校验、`git diff --check` 均通过。
- 2026-07-05 日期切换后，`东施效颦` 曾暴露部首提示只返回 1 个位置的问题；已修复并重跑 `npm test` 到 3000/3000。
- MCP `reLaunch` 到 `pages/idiom-match/idiom-match` 后，曾抽样验证默认池未出现 Lv.3/Lv.4；其中旧样本里的四字词条后续已按“更偏典故成语”的口径剔除。
- `mp_getLogs(type=error)`、`mp_getLogs(type=exception)`、`getexceptions`、`getlogs(type=error)` 均为空。
- 回归截图：`screenshots/idiom_match_default_easy_pool.png`

2026-07-05 双人分享深链回归：

- `room-lobby` 会读取分享路径 `options.code`，统一清洗后切到加入房间并预填 `inputCode`。
- `onShareRoom()` 分享路径使用 `encodeURIComponent(this.data.roomCode)`。
- `npm test` 通过，新增“双人分享深链可预填房间码”健康检查。
- `node -c miniprogram/pages/room-lobby/room-lobby.js && node -c test/project-health.js` 通过。
- `git diff --check` 通过。
- 当前 `weapp_agent` 自动化会话仍卡在开发者工具连接层，`getexceptions` 与 `getlogs(type=error)` 为空。

2026-07-05 提示卡与首页视觉回归：

- 提示猜词页面删除 `HINT_LABELS` 和 `.hint-label`，卡片只居中展示提示词。
- `idiom-hints.__meta.hintOrder` 改为 `线索一` 到 `线索五`，并补充 `hintStyle` 说明不承诺固定内容类型。
- 首页配色更新为浅米白/淡青绿背景、松绿主 CTA、淡蓝和金色点缀，移除沉重深褐札记块。
- `npm test` 通过，新增“首页使用清爽克制的新配色”和“提示卡不展示伪分类标签”健康检查。
- JS 语法检查、`app.json` JSON 校验、`git diff --check` 均通过。
- 当前 `weapp_agent` 自动化会话仍断开，`getexceptions` 与 `getlogs(type=error)` 为空。

2026-07-09 上线闸门与题库清洗回归：

- `node scripts/curate-hint-bank-allusions.js && npm run sync:data && npm test` 通过。
- `node test/score.js` 保持 `3000/3000 (100%)`。
- `git diff --check` 通过。
- `node scripts/sync-data.js --check` 确认派生数据同步。
- 提示猜词题库校准为 241 条，默认可抽题池 201 条，题库元信息声明典故专项口径。
- MCP `getexceptions` 返回空数组，`getlogs(type=error)` 返回空数组，提示猜词页截图正常。

自动化截图：

- `screenshots/home_redesign_final.png`
- `screenshots/idiom_match_final_92.png`

## 9. 后续优先级

| 优先级 | 工作 | 预期收益 |
|---|---|---|
| P1 | 显式高难/典故挑战入口 | 让高难题有正确预期 |
| P1 | 继续人工复审新增大众题提示文案 | 提升内容品质 |
| P2 | 统一历史页、个人页、双人页视觉 | 产品一致性 |
| P2 | 完善双人房间异常流和状态机 | 上线稳定性 |
