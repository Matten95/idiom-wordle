const path = require('path')
const { chromium } = require('playwright')
const sharp = require('sharp')

const themes = [
  { id: 'cinnabar', title: '01-cinnabar-zhusha-moyu', name: '朱砂墨玉', note: '成熟、强记忆点，适合国风成语品牌。' },
  { id: 'celadon', title: '02-celadon-qingci-qingyu', name: '青瓷晴雨', note: '清爽轻盈，适合每日轻游戏。' },
  { id: 'midnight', title: '03-midnight-yedu-jinmo', name: '夜读金墨', note: '强对比、夜间友好，更像游戏。' },
  { id: 'indigo', title: '04-indigo-baiyu-dianlan', name: '白玉靛蓝', note: '现代干净，靛蓝到雾紫蓝，看起来最稳。' },
  { id: 'tangerine', title: '05-tangerine-huozi-chengjin', name: '活字橙金', note: '更活泼，适合社交分享。' },
  { id: 'plum', title: '06-plum-meizi-xuanzhi', name: '梅子宣纸', note: '文艺柔和，有书卷气。' },
]

function esc(text) {
  return text.replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[ch])
}

async function buildOverview(root) {
  const width = 1320
  const pad = 36
  const gap = 36
  const rowGap = 34
  const cardW = 606
  const cardH = 650
  const thumbW = 230
  const thumbH = Math.round(thumbW * 1688 / 748)
  const height = pad * 2 + cardH * 3 + rowGap * 2

  const baseSvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#edf3ff"/>
          <stop offset="0.55" stop-color="#f6f2ec"/>
          <stop offset="1" stop-color="#f1e7f2"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#1b2438" flood-opacity="0.12"/>
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <text x="36" y="48" fill="#17203a" font-size="28" font-weight="800"
        font-family="-apple-system,BlinkMacSystemFont,PingFang SC,Microsoft YaHei,sans-serif">成语日课 UX 配色候选</text>
      <text x="36" y="78" fill="#667085" font-size="16"
        font-family="-apple-system,BlinkMacSystemFont,PingFang SC,Microsoft YaHei,sans-serif">每套左侧为首页，右侧为部首猜词主流程。</text>
    </svg>`

  const composites = []
  for (let i = 0; i < themes.length; i += 1) {
    const theme = themes[i]
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = pad + col * (cardW + gap)
    const y = 108 + row * (cardH + rowGap)
    const cardSvg = `
      <svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(255,255,255,0.72)" stroke="rgba(24,32,56,0.08)"/>
        <text x="24" y="38" fill="#17203a" font-size="25" font-weight="800"
          font-family="-apple-system,BlinkMacSystemFont,PingFang SC,Microsoft YaHei,sans-serif">${esc(theme.name)}</text>
        <text x="24" y="66" fill="#667085" font-size="15"
          font-family="-apple-system,BlinkMacSystemFont,PingFang SC,Microsoft YaHei,sans-serif">${esc(theme.note)}</text>
        <text x="76" y="626" fill="#667085" font-size="14" text-anchor="middle"
          font-family="-apple-system,BlinkMacSystemFont,PingFang SC,Microsoft YaHei,sans-serif">首页</text>
        <text x="${cardW - 76}" y="626" fill="#667085" font-size="14" text-anchor="middle"
          font-family="-apple-system,BlinkMacSystemFont,PingFang SC,Microsoft YaHei,sans-serif">游戏页</text>
      </svg>`
    composites.push({ input: Buffer.from(cardSvg), left: x, top: y })

    for (const [idx, screen] of ['home', 'game'].entries()) {
      const input = await sharp(path.join(root, `${theme.title}-${screen}.png`))
        .resize({ width: thumbW })
        .png()
        .toBuffer()
      composites.push({
        input,
        left: x + 38 + idx * (thumbW + 70),
        top: y + 82,
      })
    }
  }

  await sharp(Buffer.from(baseSvg))
    .composite(composites)
    .png()
    .toFile(path.join(root, '00-theme-overview.png'))
}

async function main() {
  const root = __dirname
  const html = `file://${path.join(root, 'theme-preview.html')}`
  const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const browser = await chromium.launch({ headless: true, executablePath: chromePath })
  const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 })

  for (const theme of themes) {
    for (const screen of ['home', 'game']) {
      await page.goto(`${html}?theme=${theme.id}&screen=${screen}`)
      await page.waitForLoadState('networkidle')
      await page.locator('.phone').screenshot({
        path: path.join(root, `${theme.title}-${screen}.png`),
      })
    }
  }

  await browser.close()
  await buildOverview(root)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
