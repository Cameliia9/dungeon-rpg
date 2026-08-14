/**
 * 音频管理: SFX 短音效 + BGM 循环 + 音量控制 + 静音开关
 * 微信小游戏 InnerAudioContext; 设置持久化到 storage
 *
 * 用法:
 *   audio.init()          — 启动时调用(读取设置, 开始 BGM)
 *   audio.play('hit')     — 播放音效(受音效音量/开关控制)
 *   audio.startBgm()      — 开始背景音乐(受音乐音量/开关控制)
 *   audio.stopBgm()       — 停止背景音乐
 *   audio.getSettings()   — 读取当前设置
 *   audio.setSettings({}) — 更新设置(静音/音量), 立即生效并持久化
 */
const SETTINGS_KEY = 'audio_settings'

// 音效文件映射(文件名不含扩展名)
const SFX_FILES = ['click', 'hit', 'crit', 'dodge', 'hurt', 'levelup', 'enhance', 'coin', 'victory', 'defeat', 'boss']

let settings = { sfxOn: true, bgmOn: true, sfxVol: 0.8, bgmVol: 0.5 }
let bgmCtx = null        // BGM InnerAudioContext(单实例循环)
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

/** 播放音效(name 见 SFX_FILES) */
function play(name) {
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
    ctx.volume = settings.sfxVol  // 实时应用音量
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
    }
    bgmCtx.volume = settings.bgmVol
    if (settings.bgmOn) {
      try { bgmCtx.play() } catch (e) {}
    } else {
      try { bgmCtx.stop() } catch (e) {}
    }
  } catch (e) {}
}

/** 停止背景音乐 */
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
}

function getSettings() { return { ...settings } }

module.exports = { init, play, startBgm, stopBgm, setSettings, getSettings, SFX_FILES }
