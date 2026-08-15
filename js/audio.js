/**
 * 音频管理: SFX 短音效 + 三套 BGM(主页/探索/战斗) + 音量控制 + 静音开关
 * 微信小游戏 InnerAudioContext; 设置持久化到 storage
 *
 * 用法:
 *   audio.init()              — 启动时调用(读取设置)
 *   audio.play('hit')         — 播放音效(受音效音量/开关控制)
 *   audio.startBgm()          — 主页BGM(主菜单/难度选择, bgm.wav)
 *   audio.startExploreBgm()   — 探索BGM(游戏主页/探索过程, explore_bgm.wav 地牢探险风)
 *   audio.startBattleBgm()    — 进入战斗: 保存当前非战斗BGM进度+类型, 播战斗BGM(每场从头)
 *   audio.resumeBgm(delay)    — 战斗结束: 立即停战斗BGM, 停顿delay毫秒后恢复战斗前的BGM(进度接续)
 *   audio.stopAll()           — 停止全部BGM
 *   audio.getSettings() / audio.setSettings({}) — 音量/开关, 立即生效并持久化
 */
const SETTINGS_KEY = 'audio_settings'

// 音效文件映射(文件名不含扩展名)
const SFX_FILES = ['click', 'hit', 'crit', 'dodge', 'hurt', 'bounce', 'levelup', 'enhance', 'coin', 'victory', 'defeat', 'boss']

let settings = { sfxOn: true, bgmOn: true, sfxVol: 0.8, bgmVol: 0.5 }
let mainBgmCtx = null       // 主页BGM bgm.wav(主菜单/难度)
let exploreBgmCtx = null    // 探索BGM explore_bgm.wav(游戏主页/探索过程)
let battleBgmCtx = null     // 战斗BGM battle_bgm.wav(独立实例)
let bgmResumePos = 0        // 进战斗前保存的进度(战斗结束恢复用)
let bgmResumeKind = 'main'  // 进战斗前在播的BGM: 'main' | 'explore'
let bgmResumeTimer = null   // 战斗结束延迟恢复定时器
let sfxPool = {}            // name -> InnerAudioContext 实例(复用, 播放前 stop 重置)

function makeBgmCtx(src) {
  const ctx = wx.createInnerAudioContext()
  ctx.src = src
  ctx.loop = true
  ctx.onEnded(() => {})  // 占位, 防 iOS 无 onEnded 处理警告
  ctx.onTimeUpdate(() => {})  // 触发 currentTime 持续更新(进度保存需要)
  return ctx
}

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

/** 主页BGM(主菜单/难度选择) */
function startBgm() {
  try {
    if (!mainBgmCtx) mainBgmCtx = makeBgmCtx('assets/sfx/bgm.wav')
    try { if (battleBgmCtx) battleBgmCtx.stop() } catch (e) {}
    try { if (exploreBgmCtx) exploreBgmCtx.pause() } catch (e) {}  // 同场景只播一首
    mainBgmCtx.volume = settings.bgmVol
    if (settings.bgmOn) {
      // 主页不接续战斗进度(战斗只在探索发生, 恢复走 startExploreBgm)
      if (bgmResumeKind === 'main') bgmResumePos = 0
      try { mainBgmCtx.play() } catch (e) {}
    } else {
      try { mainBgmCtx.stop() } catch (e) {}
    }
  } catch (e) {}
}

/** 探索BGM(游戏主页/探索过程, 地牢探险风); 战斗结束后从保存进度接续 */
function startExploreBgm() {
  try {
    if (!exploreBgmCtx) exploreBgmCtx = makeBgmCtx('assets/sfx/explore_bgm.wav')
    try { if (battleBgmCtx) battleBgmCtx.stop() } catch (e) {}
    try { if (mainBgmCtx) mainBgmCtx.pause() } catch (e) {}  // 同场景只播一首
    exploreBgmCtx.volume = settings.bgmVol
    if (settings.bgmOn) {
      // 战斗结束后从保存进度继续(不从头重播); 已消费的进度不再 seek
      if (bgmResumeKind === 'explore' && bgmResumePos > 0.5) {
        try { exploreBgmCtx.seek(bgmResumePos) } catch (e) {}
      }
      if (bgmResumeKind === 'explore') bgmResumePos = 0  // 消费进度(无论是否seek)
      try { exploreBgmCtx.play() } catch (e) {}
    } else {
      try { exploreBgmCtx.stop() } catch (e) {}
    }
  } catch (e) {}
}

/** 进入战斗: 保存当前非战斗BGM(探索优先)进度+类型并暂停, 战斗BGM从头播 */
function startBattleBgm() {
  try {
    clearTimeout(bgmResumeTimer)
    // 判断刚在播的是探索还是主页BGM(currentTime 持续增长者为活跃)
    const exActive = exploreBgmCtx && (exploreBgmCtx.currentTime || 0) > 0.3
    bgmResumeKind = exActive ? 'explore' : 'main'
    const src = exActive ? exploreBgmCtx : mainBgmCtx
    if (src) {
      try { bgmResumePos = src.currentTime || 0 } catch (e) { bgmResumePos = 0 }
    } else {
      bgmResumePos = 0
    }
    try { if (mainBgmCtx) mainBgmCtx.pause() } catch (e) {}
    try { if (exploreBgmCtx) exploreBgmCtx.pause() } catch (e) {}
    // 战斗BGM(独立实例, 从头播)
    if (!battleBgmCtx) battleBgmCtx = makeBgmCtx('assets/sfx/battle_bgm.wav')
    battleBgmCtx.volume = settings.bgmVol
    if (settings.bgmOn) {
      try { battleBgmCtx.seek(0) } catch (e) {}  // 每场战斗从头开始
      try { battleBgmCtx.play() } catch (e) {}
    } else {
      try { battleBgmCtx.stop() } catch (e) {}
    }
  } catch (e) {}
}

/** 战斗结束: 立即停战斗BGM; delay>0 时停顿delay毫秒再恢复战斗前的BGM(进度接续) */
function resumeBgm(delay) {
  clearTimeout(bgmResumeTimer)
  try { if (battleBgmCtx) battleBgmCtx.stop() } catch (e) {}  // 战斗音乐立即结束
  if (delay && delay > 0) {
    bgmResumeTimer = setTimeout(() => { _resumeNow() }, delay)
  } else {
    _resumeNow()
  }
}

function _resumeNow() {
  if (bgmResumeKind === 'explore') startExploreBgm()
  else startBgm()
}

/** 停止全部BGM(主页+探索+战斗) */
function stopAll() {
  try { if (mainBgmCtx) mainBgmCtx.stop() } catch (e) {}
  try { if (exploreBgmCtx) exploreBgmCtx.stop() } catch (e) {}
  try { if (battleBgmCtx) battleBgmCtx.stop() } catch (e) {}
}

/** 停止主页BGM(兼容旧调用) */
function stopBgm() {
  try { if (mainBgmCtx) mainBgmCtx.stop() } catch (e) {}
}

/** 应用设置变化(音量/开关), 持久化 */
function setSettings(patch) {
  if (patch.sfxOn !== undefined) settings.sfxOn = !!patch.sfxOn
  if (patch.bgmOn !== undefined) settings.bgmOn = !!patch.bgmOn
  if (patch.sfxVol !== undefined) settings.sfxVol = Math.max(0, Math.min(1, patch.sfxVol))
  if (patch.bgmVol !== undefined) settings.bgmVol = Math.max(0, Math.min(1, patch.bgmVol))
  saveSettings()
  // 立即生效: BGM 按开关/音量调整; 音效下次播放生效
  if (mainBgmCtx) {
    try { mainBgmCtx.volume = settings.bgmVol } catch (e) {}
    if (settings.bgmOn) { try { mainBgmCtx.play() } catch (e) {} }
    else { try { mainBgmCtx.stop() } catch (e) {} }
  }
  if (exploreBgmCtx) {
    try { exploreBgmCtx.volume = settings.bgmVol } catch (e) {}
    if (settings.bgmOn) { try { exploreBgmCtx.play() } catch (e) {} }
    else { try { exploreBgmCtx.stop() } catch (e) {} }
  }
  if (battleBgmCtx) {
    try { battleBgmCtx.volume = settings.bgmVol } catch (e) {}
    if (settings.bgmOn) { try { battleBgmCtx.play() } catch (e) {} }
    else { try { battleBgmCtx.stop() } catch (e) {} }
  }
}

function getSettings() { return { ...settings } }

module.exports = { init, play, startBgm, stopBgm, startExploreBgm, startBattleBgm, resumeBgm, stopAll, setSettings, getSettings, SFX_FILES }
