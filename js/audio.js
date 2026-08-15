/**
 * 音频管理: SFX 短音效 + BGM(单实例换src, 物理上不可能重叠) + 音量控制 + 静音开关
 * 微信小游戏 InnerAudioContext; 设置持久化到 storage
 *
 * ⚠️ 单实例设计(2026-08-15): 真机测试Boss战出现"所有音乐混在一起"——
 * 多实例方案切歌时旧实例 stop() 在真机异步不立即生效, 多个 loop 同时响。
 * 改为唯一 bgmCtx 换 src 播放, 同一实例不可能两首同响。
 *
 * 用法:
 *   audio.init()              — 启动时调用(读取设置)
 *   audio.play('hit')         — 播放音效(受音效音量/开关控制)
 *   audio.startBgm()          — 主页BGM(主菜单/难度选择, bgm.mp3)
 *   audio.startExploreBgm()   — 探索BGM(游戏主页/探索过程, explore_bgm.mp3)
 *   audio.startStoryBgm()     — 故事BGM(故事背景页, story_bgm.mp3)
 *   audio.startBattleBgm()    — 进战斗: 保存当前BGM进度, 切战斗曲(每场从头)
 *   audio.startBossBgm()      — Boss战: 切Boss曲(替换普通战斗曲)
 *   audio.resumeBgm(delay)    — 战斗结束: 立即停战斗曲, delay毫秒后恢复战斗前的BGM(进度接续)
 *   audio.playDefeatBgm()     — 死亡落幕曲(单次不循环)
 *   audio.stopAll()           — 停止BGM(单实例)
 *   audio.getSettings() / audio.setSettings({}) — 音量/开关, 立即生效并持久化
 */
const SETTINGS_KEY = 'audio_settings'

// 音效文件映射(文件名不含扩展名)
const SFX_FILES = ['click', 'hit', 'crit', 'dodge', 'hurt', 'bounce', 'levelup', 'enhance', 'coin', 'victory', 'defeat', 'boss', 'bossatk']

// BGM 曲目表: key -> src(单实例换 src 用)
const BGM_SRC = {
  main: 'assets/sfx/bgm.mp3',
  story: 'assets/sfx/story_bgm.mp3',
  explore: 'assets/sfx/explore_bgm.mp3',
  battle: 'assets/sfx/battle_bgm.mp3',
  boss: 'assets/sfx/boss_bgm.mp3',
  defeat: 'assets/sfx/defeat_bgm.mp3'
}

let settings = { sfxOn: true, bgmOn: true, sfxVol: 0.8, bgmVol: 0.5 }
let bgmCtx = null           // 唯一 BGM InnerAudioContext(换 src 复用)
let currentBgm = ''         // 当前在播曲目 key('' = 无)
let bgmResumePos = 0        // 进战斗前保存的进度(战斗结束恢复用)
let bgmResumeKind = ''      // 进战斗前在播的曲目 key(''|'main'|'explore')
let bgmResumeTimer = null   // 战斗结束延迟恢复定时器
let sfxPool = {}            // name -> InnerAudioContext 实例(复用, 播放前 stop 重置)

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
      ctx.src = 'assets/sfx/' + name + '.mp3'
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

/**
 * 核心: 唯一 BGM 实例播放指定曲目(换 src 自动停旧曲, 物理上不可能重叠)
 * opts.resumePos — 播放前 seek 到该位置(战斗结束接续用)
 */
function playBgm(key, opts) {
  opts = opts || {}
  if (!BGM_SRC[key]) return
  try {
    if (!bgmCtx) {
      bgmCtx = wx.createInnerAudioContext()
      bgmCtx.onEnded(() => {})
      bgmCtx.onTimeUpdate(() => {})  // 触发 currentTime 持续更新(进度保存需要)
    }
    if (currentBgm !== key) {
      currentBgm = key
      bgmCtx.src = BGM_SRC[key]  // 换 src: 同一实例停止旧曲, 不可能两首同响
    }
    bgmCtx.loop = key !== 'defeat'  // 死亡曲单次
    bgmCtx.volume = settings.bgmVol
    if (opts.resumePos != null && opts.resumePos > 0.5) {
      try { bgmCtx.seek(opts.resumePos) } catch (e) {}
    }
    try { bgmCtx.play() } catch (e) {}
  } catch (e) {}
}

/** 主页BGM(主菜单/难度选择) */
function startBgm() {
  playBgm('main')
}

/** 探索BGM(游戏主页/探索过程); 战斗结束后从保存进度接续 */
function startExploreBgm() {
  const pos = (bgmResumeKind === 'explore' && bgmResumePos > 0) ? bgmResumePos : null
  if (bgmResumeKind === 'explore') bgmResumePos = 0  // 消费进度(无论是否seek)
  playBgm('explore', pos != null ? { resumePos: pos } : {})
}

/** 故事BGM(故事背景页, 一次性场景从头播) */
function startStoryBgm() {
  playBgm('story')
}

/** 进入战斗: 保存当前BGM进度+曲目, 切普通战斗曲(每场从头) */
function startBattleBgm() {
  clearTimeout(bgmResumeTimer)
  bgmResumeKind = currentBgm === 'main' ? 'main' : 'explore'  // 战斗只从探索/主页进入
  bgmResumePos = (bgmCtx && bgmCtx.currentTime) ? bgmCtx.currentTime : 0
  playBgm('battle')
}

/** Boss战: 切Boss曲(替换普通战斗曲, 从头) */
function startBossBgm() {
  playBgm('boss')
}

/** 战斗结束: 立即停战斗曲(换空), delay毫秒后恢复战斗前的BGM(进度接续) */
function resumeBgm(delay) {
  clearTimeout(bgmResumeTimer)
  try { if (bgmCtx) bgmCtx.stop() } catch (e) {}  // 战斗音乐立即结束
  currentBgm = ''
  if (delay && delay > 0) {
    bgmResumeTimer = setTimeout(() => { _resumeNow() }, delay)
  } else {
    _resumeNow()
  }
}

function _resumeNow() {
  if (bgmResumeKind === 'explore') startExploreBgm()
  else if (bgmResumeKind === 'main') startBgm()
  else startExploreBgm()  // 无记录(如设置页测Boss)回探索曲
}

/** 死亡落幕曲(单次不循环) */
function playDefeatBgm() {
  playBgm('defeat')
}

/** 停止BGM(单实例) */
function stopAll() {
  try { if (bgmCtx) bgmCtx.stop() } catch (e) {}
  currentBgm = ''
}

/** 停止主页BGM(兼容旧调用) */
function stopBgm() {
  stopAll()
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

module.exports = { init, play, startBgm, stopBgm, startExploreBgm, startStoryBgm, startBattleBgm, startBossBgm, resumeBgm, playDefeatBgm, stopAll, setSettings, getSettings, SFX_FILES }
