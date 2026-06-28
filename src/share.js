/**
 * 分享卡片生成器
 *
 * 生成可视化战绩分享图，支持：
 *   - Canvas 渲染（小程序端，需 wx.createCanvasContext）
 *   - 纯文本 emoji 版（任何端可用）
 *
 * 两种模式：
 *   textOnly: 返回纯文本分享文案（兼容所有场景）
 *   canvas:   返回 canvas 绘制参数（小程序/H5 使用）
 */

const { generateShareContent: engineShare } = require('./engine')

// ============================================================
//  纯文本 emoji 分享
// ============================================================

/**
 * 生成纯文本分享文案
 * @param {object} game - 游戏会话
 * @param {object} options
 * @param {number} options.streak - 连击天数
 * @returns {string}
 */
function generateTextShare(game, options = {}) {
  const { streak = 0 } = options
  const { text } = engineShare(game)

  let result = text

  if (streak >= 3) {
    result += `\n🔥 连击 ${streak} 天！`
  }

  result += `\n\n#成语猜猜猜`
  return result
}

module.exports = {
  generateTextShare,
}
