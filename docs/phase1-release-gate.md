# Phase 1 Release Gate

第一阶段目标是进入安全灰度。代码闸门由 `npm test` 和 `test/project-health.js` 覆盖，当前代码侧能力已接入；以下仅保留真机或微信后台配合完成的未完成 TODO。

## 真机双人全链路

- 云函数部署：`manageRoom`、`getRoomState`、`submitHint`、`submitGuess`、`submitResult`、`logEvent`。
- 数据库集合：`idiom_rooms`、`idiom_hints_live`、`game_results`、`idiom_events`。
- 权限策略：`idiom_rooms` 客户端不可直接读写，房间状态统一通过 `getRoomState` 获取；`idiom_hints_live` 仅保存公开提示词。
- 真机路径：A 建房 -> 分享房间码 -> B 从分享进入 -> A 开局 -> B 自动进局。
- 安全校验：B 作为猜词者时，`getRoomState` 返回的 `room.gameState.currentIdiom` 必须为空。
- 并发校验：双方同时点下一局、猜词者重复提交正确答案、提示者重复提交同一提示，均不得重复结算或跳轮。
- 断线校验：切后台 30 秒后回到房间，页面应轮询恢复；过期房间提示重新开桌。

## Logo / Icon

- 小程序头像在微信后台上传，仓库不直接控制线上头像。
- 风格要求：沿用首页游戏大厅的朱红、金色、暖蓝纸感；避免办公图标和纯文字标。
- 必备导出：小程序头像 144x144 PNG、分享封面 500x400 PNG、未来原生 tabBar 图标 81x81 PNG。
- 灰度前检查：PNG 单文件小于 40KB；深浅背景上都可辨认。

## 埋点与异常

- 微信后台确认 `idiom_events` 有 `app_launch`、`enter_home`、`submit_guess`、`win/lose`、`share_tap/share_open` 入库。
- 人为触发一次页面异常，确认 `app_error` 入库。
- 灰度时每日查看 `idiom_events`，优先关注：开始率、首猜后求助率、胜率、分享点击率、分享回流率。
