const data = require('../data/idioms.json')

function fail(message) {
  console.error(message)
  process.exitCode = 1
}

const seen = new Set()
;(data.idioms || []).forEach((item, index) => {
  const label = item.text || `#${index + 1}`
  if (!item.text || Array.from(item.text).length !== 4) fail(label + ' 必须是 4 字成语')
  if (seen.has(item.text)) fail(label + ' 重复')
  seen.add(item.text)

  ;['chars','pinyin','radicals','strokes','structures','radicalPositions'].forEach(field => {
    if (!Array.isArray(item[field]) || item[field].length !== 4) {
      fail(label + ' 字段 ' + field + ' 必须是长度为 4 的数组')
    }
  })
  if (!item.meaning) fail(label + ' 缺少 meaning')
  if (!item.source) fail(label + ' 缺少 source')
  if (!Number.isInteger(item.level) || item.level < 1 || item.level > 4) fail(label + ' level 必须是 1-4')
})

const defaultPool = data.idioms.filter(item => item.level <= 2)
console.log('Idiom lint complete:', data.idioms.length + ' total,', defaultPool.length + ' daily-pool')
