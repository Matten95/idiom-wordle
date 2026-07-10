// 云函数：可信每日局 + 已验证排行榜成绩
const cloud = require('wx-server-sdk')
const {
  MAX_ATTEMPTS,
  PUZZLE_VERSION,
  getToday,
  getConfiguredSecret,
  getSecureDailyAnswer,
  getAnswerById,
  buildSessionId,
  buildPublicPuzzle,
  buildSafeGame,
  buildVerifiedResult,
  scoreGuess,
  validateGuessText,
} = require('./game-service')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const SESSION_COLLECTION = 'daily_game_sessions'
const RESULT_COLLECTION = 'game_results'

function createError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function isMissingDocument(error) {
  const message = String(error && (error.errMsg || error.message) || '')
  return error && (error.errCode === -502005 || error.code === 'DATABASE_DOCUMENT_NOT_EXIST' || /not exist|不存在/i.test(message))
}

async function readDocument(ref) {
  try {
    const result = await ref.get()
    if (Array.isArray(result.data)) return result.data[0] || null
    return result.data && Object.keys(result.data).length ? result.data : null
  } catch (error) {
    if (isMissingDocument(error)) return null
    throw error
  }
}

function normalizeDate(value) {
  const date = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw createError('INVALID_DATE', '日期格式不正确')
  if (date !== getToday()) throw createError('DAILY_GAME_EXPIRED', '只能挑战今天的每日题')
  return date
}

function createSession(openid, date, answer) {
  const now = new Date()
  return {
    openid,
    date,
    status: 'playing',
    attempts: [],
    maxAttempts: MAX_ATTEMPTS,
    answerId: answer.id,
    puzzleVersion: PUZZLE_VERSION,
    createdAt: now,
    updatedAt: now,
  }
}

async function getOrCreateSession(openid, date, answer) {
  const sessionId = buildSessionId(openid, date)
  const session = await db.runTransaction(async transaction => {
    const ref = transaction.collection(SESSION_COLLECTION).doc(sessionId)
    const current = await readDocument(ref)
    if (current) return current
    const created = createSession(openid, date, answer)
    await ref.set({ data: created })
    return created
  })
  return { sessionId, session }
}

async function submitVerifiedGuess(openid, date, guessText, playerName, avatar, fallbackAnswer) {
  const sessionId = buildSessionId(openid, date)
  return db.runTransaction(async transaction => {
    const sessionRef = transaction.collection(SESSION_COLLECTION).doc(sessionId)
    const current = await readDocument(sessionRef)
    if (!current) throw createError('GAME_NOT_STARTED', '请先开始今日挑战')
    if (current.openid !== openid || current.date !== date) throw createError('SESSION_MISMATCH', '本局身份校验失败')
    if (current.puzzleVersion !== PUZZLE_VERSION) throw createError('PUZZLE_VERSION_CHANGED', '今日题目已更新，请重新进入')
    const answer = getAnswerById(current.answerId) || fallbackAnswer
    if (!answer) throw createError('PUZZLE_NOT_FOUND', '今日题目数据不完整')
    if (current.status !== 'playing') return { session: current, answerId: answer.id }

    const attempts = Array.isArray(current.attempts) ? current.attempts.slice() : []
    if (attempts.some(attempt => attempt.guessText === guessText)) {
      throw createError('DUPLICATE_GUESS', '这条猜过了，换个方向试试')
    }
    if (attempts.length >= MAX_ATTEMPTS) throw createError('MAX_ATTEMPTS_REACHED', '今天的机会已经用完')

    const result = scoreGuess(guessText, answer)
    attempts.push({
      guessText,
      chars: Array.from(guessText),
      pinyin: result.chars.map(item => item.pinyin || ''),
      result,
      attemptNumber: attempts.length + 1,
    })

    let status = 'playing'
    if (result.summary.isWin) status = 'won'
    else if (attempts.length >= MAX_ATTEMPTS) status = 'lost'

    const { _id, ...currentData } = current
    const updated = {
      ...currentData,
      answerId: answer.id,
      attempts,
      status,
      updatedAt: new Date(),
    }
    await sessionRef.set({ data: updated })

    if (status !== 'playing') {
      const resultRecord = {
        ...buildVerifiedResult(updated, playerName, avatar),
        openid,
      }
      await transaction.collection(RESULT_COLLECTION).doc(sessionId).set({ data: resultRecord })
    }
    return { session: updated, answerId: answer.id }
  })
}

exports.main = async event => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = String(event && event.action || '')

  try {
    if (!openid) throw createError('OPENID_MISSING', '无法识别当前玩家')
    if (!['puzzle', 'start', 'guess'].includes(action)) {
      throw createError('LEGACY_SUBMISSION_REJECTED', '成绩必须通过服务端逐次判分，不能直接上报')
    }

    const date = normalizeDate(event.date || getToday())
    const secret = getConfiguredSecret()
    const answer = getSecureDailyAnswer(date, secret)

    if (action === 'puzzle') {
      return { ok: true, puzzle: buildPublicPuzzle(date, answer) }
    }

    if (action === 'start') {
      const { session } = await getOrCreateSession(openid, date, answer)
      const lockedAnswer = getAnswerById(session.answerId) || answer
      return { ok: true, game: buildSafeGame(session, lockedAnswer) }
    }

    const validation = validateGuessText(event.guessText)
    if (!validation.ok) throw createError('INVALID_GUESS', validation.error)
    const outcome = await submitVerifiedGuess(openid, date, validation.text, event.playerName, event.avatar, answer)
    const lockedAnswer = getAnswerById(outcome.answerId) || answer
    return { ok: true, game: buildSafeGame(outcome.session, lockedAnswer) }
  } catch (error) {
    console.error('submitResult error:', error)
    return {
      ok: false,
      code: error.code || 'SUBMIT_RESULT_FAILED',
      error: error.message || '今日挑战暂时不可用',
    }
  }
}
