# P0 可信每日局上线清单

更新时间：2026-07-10

代码已经完成“隐藏每日答案、服务端逐次判分、可信成绩入榜”。正式环境还必须完成以下配置，否则主局会显示“离线练习，不计入今日榜”。

## 1. 创建云数据库集合

新增集合：

- `daily_game_sessions`：保存每位玩家当天最多 6 次服务端猜测。
- `game_results`：沿用现有集合，只展示新产生的 `verified: true` 成绩。

两个集合都设置为客户端不可直接读写：

```json
{
  "read": false,
  "write": false
}
```

`daily_game_sessions` 使用服务端生成的确定性文档 ID，不需要额外唯一索引。

## 2. 配置每日谜题密钥

在终端生成 64 位十六进制随机密钥：

```bash
openssl rand -hex 32
```

进入微信开发者工具或云开发控制台：云函数 -> `submitResult` -> 配置 -> 环境变量，新增：

```text
DAILY_GAME_SECRET=<刚生成的随机值>
```

要求：

- 长度至少 32 个字符。
- 不写入仓库、前端代码或截图。
- 当天有玩家开局后不要轮换；会话已经锁定 `answerId`，但首页新访客仍应保持同一密钥。
- 正式环境与测试环境使用不同密钥。

## 3. 配置排行榜复合索引

在 `game_results` 创建复合索引，字段顺序：

| 字段 | 排序 |
| --- | --- |
| `date` | 升序 |
| `verified` | 升序 |
| `won` | 降序 |
| `attempts` | 升序 |
| `updatedAt` | 升序 |

旧成绩没有 `verified: true`，上线后不会进入可信今日榜。可先保留作备份，确认新链路正常后再归档或删除。

## 4. 重新部署云函数

必须重新上传并部署：

1. `submitResult`：选择“云端安装依赖”，确保 `game-service.js` 和最新 `idioms.json` 一起上传。
2. `getRanking`：启用只读可信成绩、移除 `answerText` 返回字段。

本次不需要部署 `getDailyIdiom`；首页和主局通过 `submitResult` 的 `puzzle/start/guess` 动作获取脱敏题面。

## 5. 上线前验收

1. 进入首页，部首正常出现，主局顶部不能显示“离线练习，不计入今日榜”。
2. 打开主局，在控制台读取页面 data：游戏进行中 `answerText` 必须为空。
3. 提交一次猜测，`daily_game_sessions` 应出现一条记录，`attempts.length` 为 1。
4. 完成游戏后，`game_results` 应出现同文档 ID 的 `verified: true` 记录，且没有 `answerText`。
5. 打开今日排行，网络返回与页面都不能出现今日答案。
6. 直接调用旧参数应返回 `LEGACY_SUBMISSION_REJECTED`：

```js
wx.cloud.callFunction({
  name: 'submitResult',
  data: { date: '当天日期', answerText: '任意成语', attempts: 1, won: true },
})
```

7. 两台真机同时操作同一账号或连续快速点击，确认不会重复增加猜测或写出两条成绩。

## 6. 回滚方式

如新云函数部署异常，先回滚 `submitResult` 和 `getRanking` 到上一版本。前端会在可信服务不可用时进入不计榜的本地练习，不会继续写入未验证排行榜成绩。
