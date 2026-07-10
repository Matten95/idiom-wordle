const assert = require('assert')
const idiomsData = require('../cloudfunctions/submitResult/idioms.json')
const {
  MAX_ATTEMPTS,
  getSecureDailyAnswer,
  buildSessionId,
  buildPublicPuzzle,
  buildSafeGame,
  buildVerifiedResult,
  scoreGuess,
  validateGuessText,
} = require('../cloudfunctions/submitResult/game-service')

const secret = 'test-secret-that-is-longer-than-32-characters'
const pool = idiomsData.idioms.filter(item => item.level <= 2)

function dateAt(offset) {
  return new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10)
}

const seen = new Set()
for (let i = 0; i < pool.length; i++) {
  seen.add(getSecureDailyAnswer(dateAt(i), secret).text)
}
assert.strictEqual(seen.size, pool.length, '隐藏洗牌应在一个大众题池周期内不重复')

const date = '2026-07-10'
const answer = getSecureDailyAnswer(date, secret)
const puzzle = buildPublicPuzzle(date, answer)
const puzzleJson = JSON.stringify(puzzle)
assert.strictEqual(puzzle.maxAttempts, MAX_ATTEMPTS)
assert.strictEqual(puzzle.hintRadicals.length, 4)
assert(!puzzleJson.includes(answer.text), '公开题面不能包含答案文本')
assert(!Object.prototype.hasOwnProperty.call(puzzle, 'chars'), '公开题面不能包含答案字符数组')
assert(!Object.prototype.hasOwnProperty.call(puzzle, 'pinyin'), '公开题面不能包含答案拼音')

const playingSession = { date, status: 'playing', attempts: [] }
const playingGame = buildSafeGame(playingSession, answer)
assert(!playingGame.answer, '进行中会话不能返回答案')

const winResult = scoreGuess(answer.text, answer)
assert.strictEqual(winResult.summary.isWin, true, '服务端应能判定正确答案')
const wonSession = {
  date,
  status: 'won',
  attempts: [{ guessText: answer.text, chars: answer.chars, pinyin: answer.pinyin, result: winResult }],
}
const completedGame = buildSafeGame(wonSession, answer)
assert.strictEqual(completedGame.answer.text, answer.text, '仅结算后向当前玩家揭晓答案')

const resultRecord = buildVerifiedResult(wonSession, '测试玩家', '')
assert.strictEqual(resultRecord.verified, true)
assert(!Object.prototype.hasOwnProperty.call(resultRecord, 'answerText'), '排行榜记录不应保存答案文本')
assert.strictEqual(resultRecord.attempts, 1)

assert.strictEqual(buildSessionId('openid-a', date), buildSessionId('openid-a', date), '会话文档 ID 应幂等')
assert.notStrictEqual(buildSessionId('openid-a', date), buildSessionId('openid-b', date), '不同玩家不能共享会话文档')
assert.strictEqual(validateGuessText('画龙点睛').ok, true)
assert.strictEqual(validateGuessText('abc').ok, false)

console.log('✅ 可信每日局安全测试通过')
