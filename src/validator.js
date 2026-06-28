/**
 * 输入验证器
 *
 * 验证用户输入的猜测是否合法：
 *   1. 是否恰好 4 个汉字
 *   2. 是否是真实存在的成语（在词库中）
 *   3. 拼音是否正确匹配
 *
 * 同时提供「宽松模式」：允许猜非成语的 4 个汉字组合
 * （降低门槛，让玩家即使不知道成语也能瞎猜）
 */

const idiomsData = require('../data/idioms.json')

// 构建成语快查集合（O(1) 查找）
const IDIOM_SET = new Set(idiomsData.idioms.map((i) => i.text))

// 构建成语快查映射（O(1) 查找完整对象）
const IDIOM_MAP = new Map(idiomsData.idioms.map((i) => [i.text, i]))

// 构建所有字符集（用于宽松模式：验证每个字是不是合法汉字）
const ALL_CHARS_SET = new Set()
idiomsData.idioms.forEach((i) => {
  i.chars.forEach((c) => ALL_CHARS_SET.add(c))
})

/**
 * 判断一个字符是否为汉字
 * Unicode 范围：基本汉字 0x4E00-0x9FFF，扩展 A 0x3400-0x4DBF
 */
function isChineseChar(char) {
  const code = char.charCodeAt(0)
  return (code >= 0x4E00 && code <= 0x9FFF) ||
         (code >= 0x3400 && code <= 0x4DBF) ||
         char === '〇'
}

// ============================================================
//  验证函数
// ============================================================

/**
 * 验证猜测的合法性
 *
 * @param {string}   input      - 用户输入（可以是 4 字字符串，或空格分隔）
 * @param {object}   options    - 验证选项
 * @param {boolean}  options.strict     - 严格模式：必须恰好是词库中的成语
 * @param {boolean}  options.allowPinyin - 是否允许拼音输入（暂未实现）
 * @returns {object} 验证结果
 */
function validateGuess(input, options = {}) {
  const { strict = false } = options

  const result = {
    valid: false,
    chars: [],
    errors: [],
    hints: [],
  }

  // 1. 清洗输入
  if (typeof input !== 'string' || input.trim().length === 0) {
    result.errors.push('输入不能为空')
    return result
  }

  // 去除空格
  const cleaned = input.replace(/\s+/g, '')

  // 2. 检查字符数
  if (cleaned.length !== 4) {
    result.errors.push(`需要恰好 4 个汉字，当前为 ${cleaned.length} 个字符`)
    return result
  }

  // 3. 检查每个字是否是汉字
  const chars = [...cleaned]
  for (let i = 0; i < chars.length; i++) {
    if (!isChineseChar(chars[i])) {
      result.errors.push(`第 ${i + 1} 个字「${chars[i]}」不是汉字`)
    }
  }

  if (result.errors.length > 0) {
    return result
  }

  result.chars = chars

  // 4. 严格模式：检查是否是词库中的成语
  const idiomText = chars.join('')
  if (strict && !IDIOM_SET.has(idiomText)) {
    result.errors.push(`「${idiomText}」不在成语词库中`)
    result.hints.push('试试换一个你知道的成语？')
    return result
  }

  // 5. 词库中查找拼音
  const idiom = IDIOM_MAP.get(idiomText)
  if (idiom) {
    result.pinyin = [...idiom.pinyin]
    result.idiom = idiom
    result.inBank = true
  } else {
    result.pinyin = null
    result.inBank = false
    result.hints.push('这个词不在我们的词库中，但可以作为猜测提交（宽松模式）')
  }

  result.valid = true
  return result
}

/**
 * 批量验证多个猜测（用于导入、测试等）
 */
function validateBatch(inputs, options = {}) {
  return inputs.map((input) => validateGuess(input, options))
}

/**
 * 给出反馈建议
 * 当用户猜了好几次还没中，帮他分析如何缩小范围
 */
function suggestNextGuess(gameHistory) {
  const suggestions = []

  if (gameHistory.length === 0) {
    suggestions.push('可以从数字成语开始尝试，如「一心一意」「三心二意」')
    suggestions.push('试试包含常见部首的成语，如口、扌、氵')
    return suggestions
  }

  const lastResult = gameHistory[gameHistory.length - 1].result

  // 统计已知信息
  const knownChars = lastResult.chars.filter((c) => c.status === 'correct')
  const pinyinMatches = lastResult.chars.filter((c) => c.status === 'pinyin')
  const presentChars = lastResult.chars.filter((c) => c.status === 'present')

  if (knownChars.length > 0) {
    suggestions.push(`已确定 ${knownChars.length} 个字的位置，继续保持！`)
  }

  if (pinyinMatches.length > 0) {
    suggestions.push(
      `拼音正确但字不对：${pinyinMatches.map((c) => `「${c.char}→?(${c.pinyin})」`).join('、')}，` +
      '想想同音字有哪些？'
    )
  }

  if (presentChars.length > 0) {
    suggestions.push(
      `有 ${presentChars.length} 个字在成语中但位置不对，试试换位置？`
    )
  }

  if (knownChars.length === 0 && pinyinMatches.length === 0 && presentChars.length === 0) {
    const absentChars = lastResult.chars.map((c) => c.char).join('')
    suggestions.push(`上一轮的 ${absentChars} 都不在答案中，下一轮尽量避开这些字`)
  }

  return suggestions
}

module.exports = {
  validateGuess,
  validateBatch,
  suggestNextGuess,
  isChineseChar,
  IDIOM_SET,
  IDIOM_MAP,
  ALL_CHARS_SET,
}
