/**
 * 玩家信息管理模块
 * 存储和读取玩家昵称、性别、城市、个性签名、头像等
 */
const PLAYER_KEY = 'idiom_player_info'
const AVATAR_DIR = 'idiom_user_avatar'

const DEFAULT_PLAYER = {
  nickname: '',
  gender: '',
  city: '',
  signature: '',
  avatar: '',
  updatedAt: '',
}

/** 加载玩家信息 */
function loadPlayer() {
  try {
    const data = wx.getStorageSync(PLAYER_KEY)
    if (data && data.nickname) {
      return { ...DEFAULT_PLAYER, ...data }
    }
  } catch (e) {}
  return { ...DEFAULT_PLAYER }
}

/** 保存玩家信息 */
function savePlayer(info) {
  const current = loadPlayer()
  const updated = {
    ...current,
    ...info,
    updatedAt: new Date().toISOString(),
  }
  try {
    wx.setStorageSync(PLAYER_KEY, updated)
    return { ok: true, data: updated }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/** 保存头像到本地永久路径，返回可访问的文件路径 */
function saveAvatar(tempFilePath) {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager()
    const savedPath = `${wx.env.USER_DATA_PATH}/${AVATAR_DIR}_${Date.now()}.jpg`
    fs.saveFile({
      tempFilePath,
      filePath: savedPath,
      success: (res) => resolve(res.savedFilePath),
      fail: (err) => reject(err),
    })
  })
}

/** 获取玩家显示名称 */
function getPlayerName() {
  const player = loadPlayer()
  if (player.nickname) return player.nickname
  const nickname = generateRandomName()
  savePlayer({ nickname })
  return nickname
}

function generateRandomName() {
  const adjectives = ['神秘', '逍遥', '无敌', '快乐', '聪明', '勇敢', '活泼', '文雅']
  const nouns = ['玩家', '高手', '达人', '侠客', '书生', '剑客', '墨客', '行者']
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  return adj + noun
}

module.exports = { loadPlayer, savePlayer, saveAvatar, getPlayerName, DEFAULT_PLAYER }
