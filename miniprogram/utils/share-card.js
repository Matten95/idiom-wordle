function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawText(ctx, text, x, y, size, color, bold) {
  ctx.setFillStyle(color)
  ctx.setFontSize(size)
  ctx.font = (bold ? 'bold ' : '') + size + 'px sans-serif'
  ctx.fillText(text, x, y)
}

function drawShareCard(page, data) {
  return new Promise(resolve => {
    if (!wx.createCanvasContext || !wx.canvasToTempFilePath) {
      resolve('')
      return
    }
    const canvasId = 'shareCanvas'
    const ctx = wx.createCanvasContext(canvasId, page)
    const width = 600
    const height = 480
    const attempts = data.attempts || []
    const colors = {
      '🟩': '#23856d',
      '🟦': '#315fb5',
      '🟨': '#d88c2e',
      '🟪': '#7a67b7',
      '⬛': '#8b93a1',
    }

    ctx.setFillStyle('#eaf4ff')
    ctx.fillRect(0, 0, width, height)
    ctx.setFillStyle('#fff8ea')
    ctx.fillRect(0, 130, width, height - 130)

    drawText(ctx, '成语日课', 48, 72, 34, '#18213d', true)
    drawText(ctx, data.dateDisplay + ' · 第 ' + data.puzzleNumber + ' 题', 48, 110, 22, '#59647a')

    ctx.setFillStyle('#e45b58')
    drawRoundRect(ctx, 430, 38, 122, 70, 20)
    ctx.fill()
    drawText(ctx, data.scoreText, 454, 84, 24, '#ffffff', true)

    const cell = 44
    const gap = 12
    const startX = 48
    const startY = 172
    attempts.forEach((row, rowIndex) => {
      Array.from(row.result.emojiString || '').forEach((emoji, colIndex) => {
        ctx.setFillStyle(colors[emoji] || '#d7dee9')
        drawRoundRect(ctx, startX + colIndex * (cell + gap), startY + rowIndex * (cell + gap), cell, cell, 10)
        ctx.fill()
      })
    })

    drawText(ctx, data.resultText, 48, 390, 30, '#18213d', true)
    drawText(ctx, '无剧透战绩卡，来比今天谁更快破题', 48, 430, 22, '#59647a')

    ctx.draw(false, function () {
      wx.canvasToTempFilePath({
        canvasId,
        width,
        height,
        destWidth: width,
        destHeight: height,
        success(res) { resolve(res.tempFilePath || '') },
        fail() { resolve('') },
      }, page)
    })
  })
}

function drawHintMatchShareCard(page, data) {
  return new Promise(resolve => {
    if (!wx.createCanvasContext || !wx.canvasToTempFilePath) {
      resolve('')
      return
    }
    const canvasId = 'shareCanvas'
    const ctx = wx.createCanvasContext(canvasId, page)
    const width = 600
    const height = 480
    const hintChain = data.hintChain || []

    ctx.setFillStyle('#eaf4ff')
    ctx.fillRect(0, 0, width, height)
    ctx.setFillStyle('#fff8ea')
    ctx.fillRect(0, 132, width, height - 132)

    drawText(ctx, '提示猜词', 48, 72, 34, '#18213d', true)
    drawText(ctx, '五条线索猜一个成语', 48, 110, 22, '#59647a')

    ctx.setFillStyle(data.won ? '#23856d' : '#e45b58')
    drawRoundRect(ctx, 426, 36, 126, 76, 20)
    ctx.fill()
    drawText(ctx, data.won ? data.score + '分' : '复盘', data.won ? 458 : 462, 84, 24, '#ffffff', true)

    drawText(ctx, data.resultText || '同题挑战', 48, 178, 32, '#18213d', true)
    drawText(ctx, data.won ? ('用了 ' + data.hintsUsed + ' 条线索破题') : '我差一点，换你来破局', 48, 216, 22, '#59647a')

    const startY = 258
    hintChain.slice(0, 5).forEach((item, index) => {
      const y = startY + index * 38
      ctx.setFillStyle(index < data.hintsUsed ? '#f0a641' : '#d7dee9')
      drawRoundRect(ctx, 48, y - 24, 44, 30, 15)
      ctx.fill()
      drawText(ctx, String(index + 1), 65, y - 3, 18, '#ffffff', true)
      drawText(ctx, item.word || '线索', 112, y, 22, '#18213d', true)
    })

    drawText(ctx, '无剧透挑战卡，好友打开就是同一道题', 48, 440, 22, '#59647a')

    ctx.draw(false, function () {
      wx.canvasToTempFilePath({
        canvasId,
        width,
        height,
        destWidth: width,
        destHeight: height,
        success(res) { resolve(res.tempFilePath || '') },
        fail() { resolve('') },
      }, page)
    })
  })
}

function drawDuelShareCard(page, data) {
  return new Promise(resolve => {
    if (!wx.createCanvasContext || !wx.canvasToTempFilePath) {
      resolve('')
      return
    }
    const canvasId = 'shareCanvas'
    const ctx = wx.createCanvasContext(canvasId, page)
    const width = 600
    const height = 480
    const rounds = data.rounds || []

    ctx.setFillStyle('#eaf4ff')
    ctx.fillRect(0, 0, width, height)
    ctx.setFillStyle('#fff8ea')
    ctx.fillRect(0, 132, width, height - 132)

    drawText(ctx, '成语好友局', 48, 72, 34, '#18213d', true)
    drawText(ctx, data.roomText || '好友对局收桌', 48, 110, 22, '#59647a')

    ctx.setFillStyle('#315fb5')
    drawRoundRect(ctx, 48, 160, 504, 82, 20)
    ctx.fill()
    drawText(ctx, data.myName || '我', 82, 210, 26, '#ffffff', true)
    drawText(ctx, String(data.myScore || 0), 240, 211, 30, '#ffffff', true)
    drawText(ctx, ':', 294, 210, 28, '#ffffff', true)
    drawText(ctx, String(data.opponentScore || 0), 326, 211, 30, '#ffffff', true)
    drawText(ctx, data.opponentName || '好友', 396, 210, 26, '#ffffff', true)

    drawText(ctx, data.resultText || '来复仇开一桌', 48, 292, 30, '#18213d', true)
    rounds.slice(0, 4).forEach((round, index) => {
      const y = 334 + index * 28
      drawText(ctx, '第' + round.round + '局', 48, y, 18, '#59647a')
      drawText(ctx, round.statusText || '', 128, y, 18, '#18213d')
      drawText(ctx, round.idiom || '', 260, y, 18, '#59647a')
    })

    drawText(ctx, '好友局战绩卡，来一局看谁更快破题', 48, 440, 22, '#59647a')

    ctx.draw(false, function () {
      wx.canvasToTempFilePath({
        canvasId,
        width,
        height,
        destWidth: width,
        destHeight: height,
        success(res) { resolve(res.tempFilePath || '') },
        fail() { resolve('') },
      }, page)
    })
  })
}

module.exports = { drawShareCard, drawHintMatchShareCard, drawDuelShareCard }
