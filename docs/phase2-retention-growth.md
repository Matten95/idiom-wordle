# 第二阶段：留存与传播配置清单

代码侧订阅提醒、补签护盾、Canvas 分享图、朋友圈分享、今日全网对比和基础埋点已接入；本文只保留微信后台配置、真机验证和灰度观察这些未完成事项。

## 真机测试前置

1. 微信开发者工具点击「上传」，在小程序后台把该版本设为体验版。
2. 小程序后台「成员管理」添加测试者微信号为体验成员。
3. 如果只用「预览」二维码，二维码过期后需要在开发者工具重新扫码生成。

## 数据库集合

| 集合 | 用途 | 建议权限 |
|---|---|---|
| `idiom_subscriptions` | 订阅提醒登记 | 仅管理端可读写 |
| `idiom_events` | 留存/传播埋点 | 仅管理端可读写 |
| `game_results` | 今日榜与全网对比 | 仅管理端可读写 |

## 订阅消息

1. 在小程序后台申请「每日提醒」类订阅消息模板。
2. 将模板 ID 写入 `miniprogram/config.js` 的 `subscribeTemplates.dailyReminder`。
3. 部署 `subscribeDaily` 云函数。
4. 在云开发环境变量中配置 `DAILY_REMINDER_TEMPLATE_ID`，或在定时触发器事件里传 `templateId`。
5. 配置云函数定时触发器，每天固定时间调用：

```json
{
  "action": "send",
  "templateKey": "dailyReminder",
  "page": "pages/home/home",
  "miniprogramState": "formal"
}
```

`subscribeDaily` 会读取 `idiom_subscriptions`，调用订阅消息发送接口，并写入 `lastSentDate` 防止同一天重复推送。

模板 ID 未配置时，前端会降级为本地提醒状态，不阻塞结算流程。

## 激励视频

1. 在微信广告后台创建激励视频广告位。
2. 将广告位 ID 写入 `miniprogram/config.js`：
   - `rewardedVideoAds.storyHint`：提示猜词方向锦囊。
   - `rewardedVideoAds.streakShield`：主局结算页补签/护盾。
3. 开发版、体验版、广告位未配置时会自动降级发放奖励；正式版需要完整观看广告才发放。
4. 断签当天优先展示「看广告补签」；没有断签时展示「看广告领护盾」。

## 分享传播

- 主局结算后会尝试生成无剧透战绩图。
- 提示猜词结算后会生成同题挑战卡。
- 双人局结束后会生成好友比分卡。
- Canvas 生成失败时自动回退为文字分享，不影响分享入口。
- `onShareTimeline` 已接入，发布前需在真机验证朋友圈卡片样式。

## 灰度观察

优先看这些事件：

- `share_tap`
- `share_image_ready`
- `share_open`
- `subscribe_daily`
- `claim_streak_shield`
- `use_streak_shield`
- `daily_compare_loaded`

建议 5-10 人灰度时记录：首日完成率、分享点击率、分享回流数、订阅授权率、第二天回访率。
