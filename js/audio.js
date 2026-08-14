/**
 * 音频管理: SFX 短音效 + BGM 循环 + 音量控制 + 静音开关
 * 微信小游戏 InnerAudioContext; 设置持久化到 storage
 *
 * 用法:
 *   audio.init()          — 启动时调用(读取设置, 开始 BGM)
 *   audio.play('hit')     — 播放音效(受音效音量/开关控制)
 *   audio.startBgm()      — 开始背景音乐(受音乐音量/开关控制; 战斗退出后从保存进度继续)
 *   audio.stopBgm()       — 停止背景音乐(普通BGM)
 *   audio.startBattleBgm()— 进入战斗: 保存普通BGM进度并暂停, 播战斗BGM(每场从头)
 *   audio.stopAll()       — 停止全部BGM(普通+战斗)
 *   audio.getSettings()   — 读取当前设置
 *   audio.setSettings({}) — 更新设置(静音/音量), 立即生效并持久化
 */
const SETTINGS_KEY = 'audio_settings'

// 音效文件映射(文件名不含扩展名)
const SFX_FILES = ['click', 'hit', 'crit', 'dodge', 'hurt', 'bounce', 'levelup', 'enhance', 'coin', 'victory', 'defeat', 'boss']

let settings = { sfxOn: true, bgmOn: true, sfxVol: 0.8, bgmVol: 0.5 }
let bgmCtx = null        // 普通BGM InnerAudioContext(单实例循环)
let battleBgmCtx = null  // 战斗BGM InnerAudioContext(独立实例, 互不干扰)
let bgmResumePos = 0     // 普通BGM暂停位置(进战斗时保存, 退出后 seek 恢复, 不从头播)
let sfxPool = {}         // name -> InnerAudioContext 实例(复用, 播放前 stop 重置)

function loadSettings() {
  try {
    const st = wx.getStorageSync(SETTINGS_KEY)
    if (st && typeof st === 'object') {
      if (typeof st.sfxOn === 'boolean') settings.sfxOn = st.sfxOn
      if (typeof st.bgmOn === 'boolean') settings.bgmOn = st.bgmOn
      if (typeof st.sfxVol === 'number') settings.sfxVol = Math.max(0, Math.min(1, st.sfxVol))
      if (typeof st.bgmVol === 'number') settings.bgmVol = Math.max(0, Math.min(1, st.bgmVol))
    }
  } catch (e) {}
}

function saveSettings() {
  try { wx.setStorageSync(SETTINGS_KEY, settings) } catch (e) {}
}

/** 初始化: 读取设置(不自动播 BGM, 由场景决定) */
function init() {
  loadSettings()
}

/** 播放音效(name 见 SFX_FILES; vol 可选 0~1 单次音量, 默认满音量=设置音量) */
function play(name, vol) {
  if (!settings.sfxOn) return
  if (!SFX_FILES.includes(name)) return
  try {
    let ctx = sfxPool[name]
    if (!ctx) {
      ctx = wx.createInnerAudioContext()
      ctx.src = 'assets/sfx/' + name + '.wav'
      ctx.volume = settings.sfxVol
      sfxPool[name] = ctx
    }
    // 单次音量 = 全局设置音量 × 本次音量系数(如弹跳音按撞击力度渐弱)
    const v = vol === undefined ? 1 : Math.max(0, Math.min(1, vol))
    ctx.volume = settings.sfxVol * v  // 实时应用音量
    try { ctx.stop() } catch (e) {}  // 重播前重置(支持连续触发)
    ctx.play()
  } catch (e) {}
}

/** 开始背景音乐(循环) */
function startBgm() {
  try {
    if (!bgmCtx) {
      bgmCtx = wx.createInnerAudioContext()
      bgmCtx.src = 'assets/sfx/bgm.wav'
      bgmCtx.loop = true
      bgmCtx.onEnded(() => {})  // 占位, 防 iOS 无 onEnded 处理警告
      bgmCtx.onTimeUpdate(() => {})  // 触发 currentTime 持续更新(进度保存需要)
    }
    try { if (battleBgmCtx) battleBgmCtx.stop() } catch (e) {}  // 退出战斗必须停战斗BGM, 否则两首叠播
    bgmCtx.volume = settings.bgmVol
    if (settings.bgmOn) {
      // 战斗退出后从保存位置继续(不从头重播)
      if (bgmResumePos > 0.5) {
        try { bgmCtx.seek(bgmResumePos) } catch (e) {}
        bgmResumePos = 0
      }
      try { bgmCtx.play() } catch (e) {}
    } else {
      try { bgmCtx.stop() } catch (e) {}
    }
  } catch (e) {}
}

/** 进入战斗: 保存普通BGM进度并暂停, 切换战斗BGM(每场从头播) */
function startBattleBgm() {
  try {
    // 1. 保存普通BGM当前进度并暂停(退出战斗后 seek 恢复)
    if (bgmCtx) {
      try { bgmResumePos = bgmCtx.currentTime || 0 } catch (e) { bgmResumePos = 0 }
      try { bgmCtx.pause() } catch (e) {}
    }
    // 2. 战斗BGM(独立实例, 从头播)
    if (!battleBgmCtx) {
      battleBgmCtx = wx.createInnerAudioContext()
      battleBgmCtx.src = 'assets/sfx/battle_bgm.wav'
      battleBgmCtx.loop = true
      battleBgmCtx.onEnded(() => {})
    }
    battleBgmCtx.volume = settings.bgmVol
    if (settings.bgmOn) {
      try { battleBgmCtx.seek(0) } catch (e) {}  // 每场战斗从头开始
      try { battleBgmCtx.play() } catch (e) {}
    } else {
      try { battleBgmCtx.stop() } catch (e) {}
    }
  } catch (e) {}
}

/** 停止全部BGM(普通+战斗) */
function stopAll() {
  try { if (bgmCtx) bgmCtx.stop() } catch (e) {}
  try { if (battleBgmCtx) battleBgmCtx.stop() } catch (e) {}
}

/** 停止背景音乐(普通BGM) */
function stopBgm() {
  try { if (bgmCtx) bgmCtx.stop() } catch (e) {}
}

/** 应用设置变化(音量/开关), 持久化 */
function setSettings(patch) {
  if (patch.sfxOn !== undefined) settings.sfxOn = !!patch.sfxOn
  if (patch.bgmOn !== undefined) settings.bgmOn = !!patch.bgmOn
  if (patch.sfxVol !== undefined) settings.sfxVol = Math.max(0, Math.min(1, patch.sfxVol))
  if (patch.bgmVol !== undefined) settings.bgmVol = Math.max(0, Math.min(1, patch.bgmVol))
  saveSettings()
  // 立即生效: BGM 按开关/音量调整; 音效下次播放生效
  if (bgmCtx) {
    try { bgmCtx.volume = settings.bgmVol } catch (e) {}
    if (settings.bgmOn) { try { bgmCtx.play() } catch (e) {} }
    else { try { bgmCtx.stop() } catch (e) {} }
  }
  if (battleBgmCtx) {
    try { battleBgmCtx.volume = settings.bgmVol } catch (e) {}
    if (settings.bgmOn) { try { battleBgmCtx.play() } catch (e) {} }
    else { try { battleBgmCtx.stop() } catch (e) {} }
  }
}

function getSettings() { return { ...settings } }

module.exports = { init, play, startBgm, stopBgm, startBattleBgm, stopAll, setSettings, getSettings, SFX_FILES }
