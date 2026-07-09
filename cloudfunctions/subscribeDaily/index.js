const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function getToday() {
  const d = new Date()
  const local = new Date(d.getTime() + 8 * 60 * 60000)
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`
}

function buildDefaultTemplateData(date) {
  return {
    thing1: { value: '今日成语新题已开局' },
    date2: { value: date },
    thing3: { value: '来盖今日印章，连胜别断档' },
  }
}

async function sendDailyReminders(event) {
  const date = event.date || getToday()
  const templateId = event.templateId || process.env.DAILY_REMINDER_TEMPLATE_ID || ''
  if (!templateId) return { ok: false, error: '缺少订阅消息模板 ID' }

  const limit = Math.min(Math.max(parseInt(event.limit) || 100, 1), 100)
  const page = event.page || 'pages/home/home'
  const miniprogramState = event.miniprogramState || 'formal'
  const templateData = event.templateData || buildDefaultTemplateData(date)

  const res = await db.collection('idiom_subscriptions')
    .where({ enabled: true, templateKey: event.templateKey || 'dailyReminder' })
    .limit(limit)
    .get()
  const list = res.data || []
  const result = { ok: true, date, total: list.length, sent: 0, skipped: 0, failed: 0, errors: [] }

  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (!event.force && item.lastSentDate === date) {
      result.skipped += 1
      continue
    }
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: item.openid,
        templateId,
        page,
        miniprogramState,
        data: templateData,
      })
      result.sent += 1
      await db.collection('idiom_subscriptions').doc(item._id).update({
        data: {
          lastSentDate: date,
          lastSentAt: new Date(),
          lastError: '',
        }
      })
    } catch (e) {
      result.failed += 1
      const message = e.errMsg || e.message || String(e)
      result.errors.push({ openid: item.openid, error: message })
      await db.collection('idiom_subscriptions').doc(item._id).update({
        data: {
          lastError: message,
          lastErrorAt: new Date(),
        }
      }).catch(() => {})
    }
  }
  return result
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = event.action || 'save'

  if (action === 'send') {
    try {
      return await sendDailyReminders(event)
    } catch (e) {
      console.error('sendDailyReminders error:', e)
      return { ok: false, error: e.message || e.errMsg || String(e) }
    }
  }
  if (!openid) return { ok: false, error: '缺少 openid' }

  try {
    if (action === 'cancel') {
      await db.collection('idiom_subscriptions').where({ openid }).remove()
      return { ok: true, cancelled: true }
    }

    const data = {
      openid,
      enabled: true,
      templateKey: event.templateKey || 'dailyReminder',
      updatedAt: new Date(),
    }
    const existed = await db.collection('idiom_subscriptions').where({ openid }).get()
    if (existed.data.length > 0) {
      await db.collection('idiom_subscriptions').doc(existed.data[0]._id).update({ data })
      return { ok: true, updated: true }
    }
    await db.collection('idiom_subscriptions').add({ data })
    return { ok: true, created: true }
  } catch (e) {
    console.error('subscribeDaily error:', e)
    return { ok: false, error: e.message }
  }
}
