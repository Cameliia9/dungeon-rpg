/**
 * 地牢远征 - 微信小游戏版入口
 * 场景: menu(主菜单) -> difficulty(难度) -> explore(探索) -> battle(战斗)
 *       explore 内可开 panels(商店/背包/铁匠铺)
 */
const ui = require('./js/ui')
const { COLORS, roundRect, text, hpBar, makeBtn, drawBtn, hitBtn } = ui
const GE = require('./utils/game-engine')
const Data = require('./utils/data')
const audio = require('./js/audio')

// ==================== 画布 ====================
// 显式设置 canvas 物理尺寸 = 逻辑尺寸 × DPR，再 scale(DPR)
// 不显式设置时部分环境下主 canvas 尺寸异常 → 黑屏
const sysInfo = wx.getSystemInfoSync()
// DPR上限2x: 真机3x时每帧填充像素是1x的9倍(帧率杀手), 2x平衡清晰度与帧率
const DPR = Math.min(sysInfo.pixelRatio || 2, 2)
const LW = sysInfo.windowWidth    // 逻辑宽(如375)
const LH = sysInfo.windowHeight   // 逻辑高(如667)

const canvas = wx.createCanvas()
canvas.width = LW * DPR
canvas.height = LH * DPR
const ctx = canvas.getContext('2d')
ctx.scale(DPR, DPR)

// ==================== 主菜单Logo ====================
// 用app-icon.png(金色交叉双剑)替代emoji: 真机measureText对emoji宽度测量不可靠导致图案偏移
let logoImg = null, logoReady = false
function loadLogo() {
  logoImg = wx.createImage()
  logoImg.onload = () => { logoReady = true }
  logoImg.onerror = () => {
    logoImg = null
    audio.startBgm()  // logo加载失败: 无弹跳动画, 直接播BGM
  }
  logoImg.src = 'app-icon.png'
}
loadLogo()

// Logo弹跳动画(弹性方块): 进入主菜单从上方掉下, 全屏弹跳衰减, 最后缓动落到中间
let logoAnim = null
let logoSettledAt = 0  // logo落位完成时间(之后标题/按钮才逐渐浮现); 必须声明否则严格模式ReferenceError
let storySkipAt = 0    // 故事页轻触跳过: 0=动画中 | 1=已跳过或自然播完(立即全显, 按钮可点); 必须声明否则严格模式ReferenceError
let lastBounceAt = 0   // bounce 音效冷却时间戳(最后几下密集小弹跳防重叠连音)
const LOGO_SIZE = 76
// 弹跳音: 按撞击速度控制音量(越大力越响→越来越轻), 速度太小静音(小球快停时无声音)
// 冷却 140ms 防止音效(190ms)未放完就被截断重播 → 碎片连音(用户报"最后几下声音连在一起")
function playBounceSound(sp) {
  const now = Date.now()
  if (sp < 150 || now - lastBounceAt < 140) return
  lastBounceAt = now
  audio.play('bounce', Math.min(1, sp / 800))
}
function startLogoAnim() {
  logoSettledAt = 0
  logoAnim = {
    x: LW / 2 + (Math.random() - 0.5) * 60,  // 顶部中间偏一点落下
    y: -LOGO_SIZE,                            // 屏幕上方外
    vx: (Math.random() - 0.5) * 160,
    vy: 0,
    deformX: 0,       // 横向形变(+伸/-缩), 碰撞设置后指数衰减恢复
    deformY: 0,       // 纵向形变(+伸/-缩)
    phase: 'bounce',  // bounce(物理弹跳) | settle(缓动落位) | done(静止)
    bounces: 0,
    settleT: 0,
    startX: 0, startY: 0,  // settle 起点(切换时记录)
    last: Date.now()
  }
}
function updateLogoAnim() {
  const a = logoAnim
  if (!a) return
  const now = Date.now()
  let dt = (now - a.last) / 1000
  a.last = now
  if (dt > 0.05) dt = 0.05  // 卡顿保护: 单帧最多50ms
  const half = LOGO_SIZE / 2

  if (a.phase === 'bounce') {
    const G = 2000, REST = 0.68, WALL = 0.88
    a.vy += G * dt
    a.x += a.vx * dt
    a.y += a.vy * dt
    // 形变阻尼恢复(快): 碰撞形变约0.3s弹回
    a.deformX *= Math.exp(-9 * dt)
    a.deformY *= Math.exp(-9 * dt)
    // 撞地: 反弹 + 纵向压扁(横伸+纵缩), 冲击越大压得越扁
    if (a.y >= LH - half) {
      a.y = LH - half
      if (a.vy > 0) {
        a.vy = -a.vy * REST
        a.vx *= 0.86  // 地面摩擦(小, 横向多弹几个来回)
        a.bounces++
        const d = Math.min(0.4, Math.abs(a.vy) / 1600)
        a.deformX = d * 1.15
        a.deformY = -d * 0.85
        if (a.bounces === 1) a.vx += (Math.random() < 0.5 ? -1 : 1) * 340  // 首次落地给横向推动, 开始四处弹
        playBounceSound(Math.abs(a.vy))  // 撞地弹跳音(按速度渐弱, 小弹跳静音防连音)
      }
    }
    // 撞左右墙: 反弹 + 横向压扁(横缩+纵伸)
    if (a.x <= half) { a.x = half; if (a.vx < 0) { a.vx = -a.vx * WALL; a.deformX = Math.min(a.deformX, -0.2); a.deformY = Math.max(a.deformY, 0.16); playBounceSound(Math.abs(a.vx)) } }
    else if (a.x >= LW - half) { a.x = LW - half; if (a.vx > 0) { a.vx = -a.vx * WALL; a.deformX = Math.min(a.deformX, -0.2); a.deformY = Math.max(a.deformY, 0.16); playBounceSound(Math.abs(a.vx)) } }
    // 撞顶: 轻反弹(几乎不弹, 只挡一下; 无压扁形变)
    if (a.y <= half) { a.y = half; if (a.vy < 0) a.vy = -a.vy * 0.4 }
    // 弹跳衰减到足够小 → 缓动落位(阈值更低, 弹够才落位)
    if (a.bounces >= 4 && Math.abs(a.vy) < 45 && Math.abs(a.vx) < 28) {
      a.phase = 'settle'
      a.settleT = 0
      a.startX = a.x  // 记录起点, 基于起点插值(原指数逼近前0.6s就走完, 后段像等待)
      a.startY = a.y
    }
  } else if (a.phase === 'settle') {
    a.settleT += dt
    const t = Math.min(1, a.settleT / 2.0)
    const e = ui.easeOut(t)
    const tx = LW / 2, ty = LH * 0.24
    a.x = a.startX + (tx - a.startX) * e
    a.y = a.startY + (ty - a.startY) * e
    a.deformX *= Math.exp(-9 * dt)
    a.deformY *= Math.exp(-9 * dt)
    if (a.settleT >= 2.0) {
      a.phase = 'done'
      a.x = tx; a.y = ty
      a.deformX = 0   // 落位即静止, 无果冻形变(用户: 没有图案复位这段)
      a.deformY = 0
      logoSettledAt = Date.now()  // 图案复位后标题立即出现, 按钮逐个浮现(用户指定)
      audio.startBgm()  // logo落位, 元素开始浮现 → 开始播放BGM
    }
  } else if (a.phase === 'done') {
    // 形变恒0(无注入), 防御性衰减
    a.deformX *= Math.exp(-9 * dt)
    a.deformY *= Math.exp(-9 * dt)
    if (Math.abs(a.deformX) < 0.005 && Math.abs(a.deformY) < 0.005) { a.deformX = 0; a.deformY = 0 }
  }
}

// 轻触跳过弹跳动画: logo直接落位, 标题/按钮立即开始浮现
function skipLogoAnim() {
  const a = logoAnim
  if (!a || a.phase === 'done') return
  a.phase = 'done'
  a.x = LW / 2
  a.y = LH * 0.24
  a.deformX = 0
  a.deformY = 0
  logoSettledAt = Date.now()
  audio.startBgm()  // 跳过弹跳也立即开始BGM
}

// ==================== 全局状态 ====================
let player = null          // 当前玩家
let scene = 'menu'         // 当前场景
let btns = []              // 当前场景按钮
let savedGame = false      // 是否有存档
let panels = null          // 面板层(商店/背包/铁匠铺), null=无

const SAVE_KEY = 'dungeon_save'

// ==================== 存档 ====================
function loadGame() {
  const data = wx.getStorageSync(SAVE_KEY)
  // 0血存档视为无效(历史bug留下), 防止继续游戏0血
  if (data && data.name && data.hp > 0) {
    player = GE.loadPlayer(data)
    savedGame = true
    return true
  }
  savedGame = false
  return false
}

// ==================== 场景切换 ====================
let sceneEnterTime = Date.now()   // 场景进入时间(用于入场动画)

function switchScene(name) {
  scene = name
  panels = null
  btns = []
  sceneEnterTime = Date.now()
  // BGM: 主菜单/难度/故事=主页BGM; 游戏主页/探索=探索BGM(地牢探险风); 战斗=战斗BGM
  // 主菜单特殊——logo弹跳期间静音, 落位后(startLogoAnim完成/skip)才播
  if (name === 'settings') audio.stopAll()
  else if (name === 'menu') audio.stopAll()  // ⚠️ 无条件停(不判断logoReady: 加载中也是false会误播), 兜底在loadLogo的onerror
  else if (name === 'battle') audio.startBattleBgm()
  else if (name === 'difficulty') audio.startBgm()  // 难度选择用主页BGM
  else if (name === 'story') audio.startStoryBgm()  // 故事背景页: 专属传说叙事BGM(不是主页曲)
  else audio.startExploreBgm()  // game/explore: 探索BGM(战斗结束后从保存进度接续)
  if (name === 'menu') { buildMenu(); startLogoAnim() }
  else if (name === 'difficulty') buildDifficulty()
  else if (name === 'story') buildStory()
  else if (name === 'game') buildGame()
  else if (name === 'explore') buildExplore()
  else if (name === 'settings') buildSettings()
  else if (name === 'battle') {
    if (!battle) battle = require('./js/battle')
  }
}

// ==================== 主菜单 ====================
// 对齐小程序原版: 居中, ⚔️48px 标题28px, 按钮220px 交错动画 0/0.08/0.16/0.24/0.32/0.4s
function buildMenu() {
  // 实时检查存档(死亡/清档后按钮状态同步; 0血存档视为无效)
  const saveData = wx.getStorageSync(SAVE_KEY)
  savedGame = !!(saveData && saveData.name && saveData.hp > 0)
  btns = []
  const bw = Math.min(220, LW * 0.7), bh = 48, cx = LW / 2
  let y = LH * 0.48
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '🆕 新游戏', () => switchScene('difficulty'), ui.BTN.primary)); y += bh + 16
  const contBtn = makeBtn(cx - bw / 2, y, bw, bh, savedGame ? '▶️ 继续游戏' : '▶️ 继续游戏（无存档）', () => {
    if (savedGame) { loadGame(); switchScene('game') }
  }, savedGame ? ui.BTN.gold : ui.BTN.disabled)
  if (!savedGame) contBtn.disabled = true  // 无存档彻底禁用
  btns.push(contBtn); y += bh + 16
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '⚙️ 设置', () => switchScene('settings'), ui.BTN.secondary)); y += bh + 16
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '🚪 退出', () => wx.exitMiniProgram(), ui.BTN.disabled))
}

let bgGrad = null  // 背景渐变缓存(每帧重建开销大)
function bgGradient() {
  if (!bgGrad) {
    bgGrad = ctx.createLinearGradient(0, 0, 0, LH)
    bgGrad.addColorStop(0, COLORS.bgTop)
    bgGrad.addColorStop(1, COLORS.bgBottom)
  }
  return bgGrad
}

function drawMenu() {
  // 背景渐变(缓存)
  ctx.fillStyle = bgGradient()
  ctx.fillRect(0, 0, LW, LH)

  // 入场动画: 弹跳期间只有logo, 落位后标题/按钮才交错浮现(落位前 p=0 不显示)
  // logo不可用(未加载/失败)时按sceneEnterTime正常入场, 不等待弹跳
  const dur = 1500, dist = 28  // 文字淡入1.5s(用户指定)
  const logoActive = !!(logoReady && logoImg && logoAnim)
  const baseT = logoActive ? (logoSettledAt > 0 ? logoSettledAt : Infinity) : sceneEnterTime
  const p1 = ui.animProgress(baseT, 0, dur)
  const p2 = ui.animProgress(baseT, 80, dur)
  // 主菜单Logo: 优先图片(弹跳动画+精确居中), 加载中回退emoji
  if (logoReady && logoImg) {
    updateLogoAnim()
    const a = logoAnim
    const s = LOGO_SIZE
    const lx = a ? a.x : LW / 2
    const ly = a ? a.y : LH * 0.24
    // 果冻形变: 撞地横伸纵缩, 撞墙横缩纵伸, 各自阻尼恢复
    let sx = 1, sy = 1
    if (a) { sx = 1 + a.deformX; sy = 1 + a.deformY }
    // logo自身淡入用sceneEnterTime(弹跳期间就要可见), 不跟随baseT
    const logoFade = ui.animProgress(sceneEnterTime, 0, 300)
    const la = Math.min(1, logoFade * 2)
    ctx.save()
    ctx.globalAlpha = la
    ctx.translate(lx, ly)
    ctx.scale(sx, sy)
    ctx.drawImage(logoImg, -s / 2, -s / 2, s, s)
    ctx.restore()
    ctx.globalAlpha = 1
  } else {
    text(ctx, '⚔️', LW / 2, LH * 0.24 + (1 - p1) * dist, 68, COLORS.gold, 'center', false, p1)
  }
  // 右下角提示: 弹跳期间可轻触跳过
  if (logoActive && logoSettledAt === 0) {
    text(ctx, '轻触跳过', LW - 16, LH - 20, 12, 'rgba(255,255,255,0.35)', 'right')
  }
  text(ctx, '地牢远征', LW / 2, LH * 0.34 + (1 - p1) * dist, 42, COLORS.gold, 'center', true, p1)

  const delays = [160, 240, 320, 400]
  for (let i = 0; i < btns.length; i++) {
    const p = ui.animProgress(baseT, delays[i], dur)
    // 只做淡入，不做位移（位移会导致点击区域与显示位置不一致）
    drawBtn(ctx, btns[i], null, p)
  }
}

// ==================== 难度选择 ====================
// 对齐原版: 标题32 说明14 按钮220 交错 0/0.06/0.12/0.18/0.24/0.3s
// ==================== 设置面板(音效/音乐开关 + 音量滑条) ====================
let settingsDrag = null  // 拖动中的滑条: 'sfx' | 'bgm' | null
function buildSettings() {
  btns = []
  settingsDrag = null
  audio.init()
}
function drawSettings() {
  ctx.fillStyle = bgGradient()
  ctx.fillRect(0, 0, LW, LH)
  const dur = 500, dist = 20
  const p1 = ui.animProgress(sceneEnterTime, 0, dur)
  text(ctx, '⚙️ 设置', LW / 2, LH * 0.14 + (1 - p1) * dist, 32, COLORS.gold, 'center', true, p1)

  const st = audio.getSettings()
  const cw = Math.min(300, LW - 60), cx = LW / 2
  // 面板背景
  const panelTop = LH * 0.22, panelH = 300
  roundRect(ctx, cx - cw / 2, panelTop, cw, panelH, 14, '#151528', '#2a2a4a', 1.5)

  let y = panelTop + 42
  const rowH = 44
  // 音效开关行
  text(ctx, '🔊 音效', cx - cw / 2 + 22, y + 12, 15, COLORS.text, 'left')
  const sfxOn = st.sfxOn
  drawBtn(ctx, makeBtn(cx + cw / 2 - 96, y, 72, 30, sfxOn ? '开' : '关', () => {
    audio.setSettings({ sfxOn: !sfxOn })
    if (!sfxOn) audio.play('click')
  }, sfxOn ? ui.BTN.gold : ui.BTN.secondary))
  // 音效音量滑条
  y += rowH
  text(ctx, '音效音量', cx - cw / 2 + 22, y + 14, 13, COLORS.textDim, 'left')
  drawSlider(ctx, cx - cw / 2 + 22, y + 26, cw - 44, st.sfxVol, '#ffd700')
  // 音乐开关行
  y += rowH + 12
  const bgmOn = st.bgmOn
  text(ctx, '🎵 音乐', cx - cw / 2 + 22, y + 12, 15, COLORS.text, 'left')
  drawBtn(ctx, makeBtn(cx + cw / 2 - 96, y, 72, 30, bgmOn ? '开' : '关', () => {
    audio.setSettings({ bgmOn: !bgmOn })
  }, bgmOn ? ui.BTN.gold : ui.BTN.secondary))
  // 音乐音量滑条
  y += rowH
  text(ctx, '音乐音量', cx - cw / 2 + 22, y + 14, 13, COLORS.textDim, 'left')
  drawSlider(ctx, cx - cw / 2 + 22, y + 26, cw - 44, st.bgmVol, '#5aa7ff')

  // 返回按钮
  drawBtn(ctx, makeBtn(cx - 90, panelTop + panelH + 24, 180, 42, '↩️ 返回', () => switchScene('menu'), ui.BTN.secondary))
}

// 音量滑条(轨道+填充+圆钮)
function drawSlider(ctx, x, y, w, val, color) {
  const trackH = 5, cy = y + trackH / 2
  roundRect(ctx, x, cy - trackH / 2, w, trackH, 2.5, '#333350')  // 轨道
  roundRect(ctx, x, cy - trackH / 2, w * val, trackH, 2.5, color)  // 填充
  // 圆钮
  const nx = x + w * val
  ctx.beginPath()
  ctx.arc(nx, cy, 9, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
}

// 设置面板触摸: 开关按钮走 hitBtn, 滑条拖动
function touchSettings(x, y) {
  const cw = Math.min(300, LW - 60), cx = LW / 2
  const panelTop = LH * 0.22, panelH = 300
  // 返回按钮
  if (x > cx - 90 && x < cx + 90 && y > panelTop + panelH + 24 && y < panelTop + panelH + 66) {
    switchScene('menu')
    return
  }
  // 开关按钮(音效/音乐行)
  // ⚠️ 与绘制同步: 音效开关 y=rowY, 音乐开关 y=rowY+rowH*2+12(中间隔音效音量行44+12)
  let rowY = panelTop + 42
  const rowH = 44
  if (x > cx + cw / 2 - 96 && x < cx + cw / 2 - 24) {
    if (y > rowY && y < rowY + 30) {
      const st = audio.getSettings()
      audio.setSettings({ sfxOn: !st.sfxOn })
      if (!st.sfxOn) audio.play('click')
      return
    }
    if (y > rowY + rowH * 2 + 12 && y < rowY + rowH * 2 + 42) {
      const st = audio.getSettings()
      audio.setSettings({ bgmOn: !st.bgmOn })
      return
    }
  }
  // 滑条轨道区域(与绘制同步: 音效滑条 y=rowY+rowH+26, 音乐滑条 y=rowY+rowH*3+12+26)
  const sliderX = cx - cw / 2 + 22, sliderW = cw - 44
  const sfxSliderY = rowY + rowH + 26
  const bgmSliderY = rowY + rowH * 3 + 12 + 26
  if (y > sfxSliderY - 14 && y < sfxSliderY + 14 && x > sliderX - 10 && x < sliderX + sliderW + 10) {
    const val = Math.max(0, Math.min(1, (x - sliderX) / sliderW))
    audio.setSettings({ sfxVol: val })
    settingsDrag = 'sfx'
    audio.play('click')
    return
  }
  if (y > bgmSliderY - 14 && y < bgmSliderY + 14 && x > sliderX - 10 && x < sliderX + sliderW + 10) {
    const val = Math.max(0, Math.min(1, (x - sliderX) / sliderW))
    audio.setSettings({ bgmVol: val })
    settingsDrag = 'bgm'
    return
  }
}
function touchMoveSettings(x, y) {
  if (!settingsDrag) return
  const cw = Math.min(300, LW - 60), cx = LW / 2
  const sliderX = cx - cw / 2 + 22, sliderW = cw - 44
  const val = Math.max(0, Math.min(1, (x - sliderX) / sliderW))
  audio.setSettings(settingsDrag === 'sfx' ? { sfxVol: val } : { bgmVol: val })
}
function touchEndSettings() { settingsDrag = null }

function buildDifficulty() {
  btns = []
  // 对齐原版: 每个难度按钮带属性描述(HP/ATK/GOLD/敌人倍率)
  const bw = Math.min(220, LW * 0.7), bh = 64, cx = LW / 2
  let y = LH * 0.30
  btns.push({
    ...makeBtn(cx - bw / 2, y, bw, bh, '', () => startNew('easy'), { ...ui.BTN.primary, size: 15 }),
    mainLabel: '🟢 简单', desc: 'HP 100 · ATK 12 · GOLD 50 · 敌人×1.0', descColor: '#a0ffa0'
  }); y += bh + 12
  btns.push({
    ...makeBtn(cx - bw / 2, y, bw, bh, '', () => startNew('hard'), { ...ui.BTN.secondary, size: 15 }),
    mainLabel: '🟡 困难', desc: 'HP 95 · ATK 11 · GOLD 35 · 敌人攻×1.25', descColor: '#ffe080'
  }); y += bh + 12
  btns.push({
    ...makeBtn(cx - bw / 2, y, bw, bh, '', () => startNew('nightmare'), { ...ui.BTN.danger, size: 15 }),
    mainLabel: '🔴 噩梦', desc: 'HP 90 · ATK 10 · GOLD 20 · 敌人攻×1.5', descColor: '#ff8080'
  }); y += bh + 24
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '↩️ 返回', () => switchScene('menu'), ui.BTN.secondary))
}

function startNew(difficulty) {
  player = new GE.Player('冒险者', difficulty)
  if (difficulty === 'hard') { player.maxHp = 95; player.hp = 95; player.baseAttack = 11; player.gold = 35 }
  if (difficulty === 'nightmare') { player.maxHp = 90; player.hp = 90; player.baseAttack = 10; player.gold = 20 }
  savePlayer()
  try { wx.removeStorageSync('explore_state') } catch (e) {}  // 新游戏清除探索存档
  switchScene('story')  // 先展示故事背景, 点"开始远征"再进游戏主页
}

// ==================== 故事背景(选完难度后, 文字逐行浮现, 最后"前进吧,冒险者") ====================
const STORY_LINES = [
  '千年前,精灵一族封存了至宝「星辉圣冠」',
  '在大陆深处的地牢,世代守卫看护。',
  '一场灾变后,封印崩坏,地牢被黑暗吞噬——',
  '入口是🫧黏液沼泽,越深处越是骇人:',
  '💀骸骨墓穴、🌑暗影回廊、🔥深渊火狱,',
  '直至最深处,🐉远古邪龙盘踞的龙之巢穴。',
  '千年过去,大地开始枯死。而你,最后的精灵冒险者,',
  '握着祖传的剑,踏入通往地底的深渊,',
  '一层层向下,直到星辉圣冠重新闪耀。'
]
const STORY_FINAL = '前进吧,冒险者。'
const STORY_ICON_Y = LH * 0.16   // 🧝 图标中线(整体下移, 原0.105)
const STORY_TITLE_Y = LH * 0.16 + 62
const STORY_BODY_Y0 = LH * 0.16 + 110  // 正文首行中线
const STORY_LINE_H = 26                  // 行距(15px 字阅读舒适)
const STORY_BTN_Y = STORY_BODY_Y0 + STORY_LINES.length * STORY_LINE_H + 52  // 正文底+金色句行距+间距
const STORY_END = 500 + (STORY_LINES.length + 1) * 1600 + 800 + 700  // 按钮完全浮现时刻(~18s), 自然完成判定用

function buildStory() {
  btns = []
  const bw = Math.min(220, LW * 0.7), bh = 46, cx = LW / 2
  btns.push(makeBtn(cx - bw / 2, STORY_BTN_Y, bw, bh, '⚔️ 开始远征', () => switchScene('game'), ui.BTN.primary))
}

function drawStory() {
  ctx.fillStyle = bgGradient()
  ctx.fillRect(0, 0, LW, LH)
  // 自然播放完成(按钮已完全浮现)标记, 之后触摸不再拦截(按钮正常可点)
  if (storySkipAt === 0 && ui.animProgress(sceneEnterTime, STORY_END, 1) >= 1) storySkipAt = 1
  // 时间基准: 轻触跳过/自然完成后用"极远的过去"→ 所有 delay 立即满足, 文字按钮瞬间全显
  const base = storySkipAt === 0 ? sceneEnterTime : sceneEnterTime - 100000
  const dur = 900
  // 图标 + 标题(先浮现)
  const pTitle = ui.animProgress(base, 0, dur)
  if (pTitle > 0) {
    ctx.globalAlpha = pTitle
    text(ctx, '🧝', LW / 2, STORY_ICON_Y, 56, '#ffffff', 'center')
    text(ctx, '📜 星辉圣冠', LW / 2, STORY_TITLE_Y, 26, COLORS.gold, 'center', true)
    ctx.globalAlpha = 1
  }
  // 正文逐行浮现(每行浮现800ms + 停留800ms阅读, 一行一行慢慢来)
  STORY_LINES.forEach((line, idx) => {
    const p = ui.animProgress(base, 500 + idx * 1600, 800)
    if (p <= 0) return
    ctx.globalAlpha = p
    text(ctx, line, LW / 2, STORY_BODY_Y0 + idx * STORY_LINE_H, 15, '#c8c8d8', 'center')
    ctx.globalAlpha = 1
  })
  // 最后"前进吧,冒险者"(金色强调, 最后浮现)
  const pFinal = ui.animProgress(base, 500 + STORY_LINES.length * 1600, 800)
  if (pFinal > 0) {
    ctx.globalAlpha = pFinal
    text(ctx, STORY_FINAL, LW / 2, STORY_BODY_Y0 + STORY_LINES.length * STORY_LINE_H, 18, COLORS.gold, 'center', true)
    ctx.globalAlpha = 1
  }
  // 开始远征按钮(文字全部浮现完才出现)
  const pBtn = ui.animProgress(base, 500 + (STORY_LINES.length + 1) * 1600 + 800, 700)
  if (pBtn > 0 && btns[0]) drawBtn(ctx, btns[0], null, pBtn)
  // 轻触跳过提示(动画进行中显示, 跳过/完成后消失)
  if (storySkipAt === 0) text(ctx, '轻触跳过', LW - 16, LH - 20, 12, 'rgba(255,255,255,0.35)', 'right')
}

// ==================== 面板层(商店/背包/铁匠铺) ====================
function openPanel(name) {
  const panelsMod = require('./js/panels')
  const shared = {
    player, LW, LH, ctx, DPR,
    savePlayer,
    setPanels: (p) => { panels = p },
    getPanels: () => panels
  }
  panels = panelsMod.create(name, shared)
}

// ==================== 游戏主页 (对齐原版 screen='game') ====================
function buildGame() {
  btns = []
  const bw = Math.min(220, LW * 0.7), bh = 46, cx = LW / 2
  let y = LH * 0.62
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '🏰 探索地牢', () => switchScene('explore'), ui.BTN.primary)); y += bh + 14
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '🎒 背包 (' + player.inventory.length + '件)', () => openPanel('inventory'), ui.BTN.secondary)); y += bh + 14
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '🏪 商店', () => openPanel('shop'), ui.BTN.gold)); y += bh + 18
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '↩️ 返回菜单', () => switchScene('menu'), ui.BTN.secondary))
}

function drawGame() {
  ctx.fillStyle = bgGradient()
  ctx.fillRect(0, 0, LW, LH)

  // 背包按钮数量实时刷新(商店买装备后返回主界面, btns不重建导致数量不更新)
  const bagBtn = btns.find(b => b.label && b.label.indexOf('背包') >= 0)
  if (bagBtn) bagBtn.label = '🎒 背包 (' + player.inventory.length + '件)'

  // 入场动画(交错淡入): 标题卡 -> 状态卡 -> 按钮
  const dur = 900
  const p1 = ui.animProgress(sceneEnterTime, 0, dur)
  const p2 = ui.animProgress(sceneEnterTime, 120, dur)
  const p3 = ui.animProgress(sceneEnterTime, 240, dur)

  // 标题卡(下移+放大)
  ctx.globalAlpha = p1
  roundRect(ctx, 16, 120, LW - 32, 74, 12, ui.cardFill(ctx, 16, 120, LW - 32, 74), COLORS.cardBorder, 1.5)
  text(ctx, '⚔️ 地牢远征 ⚔️', LW / 2, 148, 22, COLORS.gold, 'center', true)
  text(ctx, '第 ' + player.floor + ' 层 · Lv.' + player.level, LW / 2, 176, 13, COLORS.textDim)
  ctx.globalAlpha = 1

  // 角色状态卡(高度随屏幕动态, 上限240; 字号加大)
  const cy = 206
  const cardH2 = Math.min(240, LH * 0.62 - 14 - cy)
  ctx.globalAlpha = p2
  roundRect(ctx, 16, cy, LW - 32, cardH2, 12, ui.cardFill(ctx, 16, cy, LW - 32, cardH2), COLORS.cardBorder, 1.5)
  text(ctx, '🧝 ' + player.name, LW / 2, cy + 22, 17, COLORS.text, 'center', true)
  // 血量
  text(ctx, '❤️ 生命值', 32, cy + 54, 14, COLORS.textDim, 'left')
  text(ctx, player.hp + ' / ' + player.totalMaxHp, LW - 32, cy + 54, 14, COLORS.gold, 'right', true)
  hpBar(ctx, 32, cy + 64, LW - 64, 10, player.hp / player.totalMaxHp)
  // 经验
  text(ctx, '✨ 经验值', 32, cy + 90, 14, COLORS.textDim, 'left')
  text(ctx, player.exp + ' / ' + player.expToLevel(), LW - 32, cy + 90, 14, COLORS.gold, 'right', true)
  // 攻防暴闪
  text(ctx, '⚔️攻击 ' + player.totalAttack + '   🛡️防御 ' + player.totalDefense, 32, cy + 114, 14, COLORS.textDim, 'left')
  text(ctx, '⚡ 暴击 ' + Math.round(player.totalCrit * 100) + '%   💨 闪避 ' + Math.round(player.totalDodge * 100) + '%', 32, cy + 136, 14, COLORS.textDim, 'left')
  // 金币/击杀
  text(ctx, '💰 金币 ' + player.gold + '   💀 击杀 ' + player.kills, 32, cy + 158, 14, COLORS.textDim, 'left')
  // 装备一览
  text(ctx, '🗡️ 武器：' + (player.weapon ? player.weapon.name + ' (+' + player.weapon.attack + '攻)' : '无'), 32, cy + 182, 13, '#a080ff', 'left')
  ctx.globalAlpha = 1

  for (const b of btns) drawBtn(ctx, b, null, p3)
}

function savePlayer() {
  if (player) wx.setStorageSync(SAVE_KEY, GE.savePlayer(player))
}

function drawDifficulty() {
  ctx.fillStyle = bgGradient()
  ctx.fillRect(0, 0, LW, LH)

  const dur = 1500, dist = 28  // 文字淡入1.5s(用户指定)
  const p1 = ui.animProgress(sceneEnterTime, 0, dur)
  const p2 = ui.animProgress(sceneEnterTime, 60, dur)
  text(ctx, '选择难度', LW / 2, LH * 0.14 + (1 - p1) * dist, 32, COLORS.gold, 'center', true, p1)
  text(ctx, '难度越高，敌人越强（简单×1.0 · 困难×1.25 · 噩梦×1.5）', LW / 2, LH * 0.20 + (1 - p2) * dist, 12, COLORS.textDim, 'center', false, p2)

  const delays = [120, 180, 240, 300]
  for (let i = 0; i < btns.length; i++) {
    const p = ui.animProgress(sceneEnterTime, delays[i], dur)
    // 只做淡入，不做位移
    drawBtn(ctx, btns[i], null, p)
    // 难度按钮: 主文字 + 属性描述(对齐原版)
    if (btns[i].mainLabel) {
      const b = btns[i]
      text(ctx, b.mainLabel, b.x + b.w / 2, b.y + 20, 15, COLORS.text, 'center', true, p)
      text(ctx, b.desc, b.x + b.w / 2, b.y + 41, 11, b.descColor, 'center', true, p)
    }
  }
}

// ==================== 探索场景(由 explore.js 提供) ====================
let explore = null
let battle = null

function buildExplore() {
  // 延迟加载避免循环依赖
  if (!explore) explore = require('./js/explore')
  explore.init({
    player, savePlayer, switchScene, canvas, ctx, LW, LH, DPR,
    getPlayer: () => player, setPlayer: (p) => { player = p },
    setPanels: (p) => { panels = p }, getPanels: () => panels
  })
  btns = explore.buttons()
}

// ==================== 主循环 ====================
function draw() {
  ctx.clearRect(0, 0, LW, LH)
  if (panels) { panels.draw(); return }
  if (scene === 'menu') drawMenu()
  else if (scene === 'difficulty') drawDifficulty()
  else if (scene === 'story') drawStory()
  else if (scene === 'game') drawGame()
  else if (scene === 'settings') drawSettings()
  else if (scene === 'explore' && explore) explore.draw()
  else if (scene === 'battle' && battle) battle.draw()
}

// 触摸坐标归一化(物理像素 -> 逻辑像素)
function normTouch(t) {
  let x = t.clientX, y = t.clientY
  if (x > LW * 1.5 && t.x) { x = t.x }
  if (y > LH * 1.5 && t.y) { y = t.y }
  if (x > LW || y > LH) {
    const cw = canvas.width || LW
    const ch = canvas.height || LH
    if (cw > 0) x = x * LW / cw
    if (ch > 0) y = y * LH / ch
  }
  return { x, y }
}

// 触摸
wx.onTouchStart((e) => {
  const t = e.touches[0]
  if (!t) return
  const { x, y } = normTouch(t)

  // 面板层优先
  if (panels) {
    panels.touch(x, y)
    return
  }
  if (scene === 'menu' || scene === 'difficulty' || scene === 'story' || scene === 'game') {
    // ⚠️ logo 弹跳动画期间: 任何触摸都只跳过动画(含按钮位置), 不触发按钮跳界面
    // (用户: 轻触跳过期间碰到按钮会直接跳转, 应该触摸完停在正常主页)
    if (scene === 'menu' && logoAnim && logoSettledAt === 0) {
      skipLogoAnim()
      return
    }
    // ⚠️ 故事页文字浮现期间: 任何触摸都只跳过动画(轻触跳过=立即全显), 不触发按钮
    // (storySkipAt===0 动画中; 跳过/自然播完=1; 非0时按钮正常)
    if (scene === 'story' && storySkipAt === 0) {
      storySkipAt = 1
      return
    }
    const b = hitBtn(btns, x, y)
    if (b && !b.disabled && b.cb) { audio.play('click'); b.cb() }
  } else if (scene === 'settings') {
    touchSettings(x, y)
  } else if (scene === 'explore' && explore) {
    explore.touch(x, y)
  } else if (scene === 'battle' && battle) {
    battle.touch(x, y)
  }
})

// 触摸滑动(战斗日志/探索日志滚动)
wx.onTouchMove((e) => {
  const t = e.touches[0]
  if (!t) return
  const { x, y } = normTouch(t)
  if (panels) { if (panels.touchMove) panels.touchMove(x, y); return }
  if (scene === 'settings') touchMoveSettings(x, y)
  else if (scene === 'battle' && battle && battle.touchMove) battle.touchMove(x, y)
  else if (scene === 'explore' && explore && explore.touchMove) explore.touchMove(x, y)
})

wx.onTouchEnd(() => {
  if (panels) { if (panels.touchEnd) panels.touchEnd(); return }
  if (scene === 'settings') touchEndSettings()
  else if (scene === 'battle' && battle && battle.touchEnd) battle.touchEnd()
  else if (scene === 'explore' && explore && explore.touchEnd) explore.touchEnd()
})

// 鼠标滚轮(开发者工具/模拟器): 面板列表滚动, delta>0 向下
if (wx.onMouseWheel) wx.onMouseWheel((e) => {
  if (panels && panels.wheel) panels.wheel(e.delta || 0)
})

// 启动
if (loadGame()) savedGame = true
audio.init()
// ⚠️ 启动不播BGM: 直接进 menu, 由 switchScene('menu') 静音 + logo落位后才播。
// 曾在这里 startBgm 再 switchScene('menu') stopAll——真机上 InnerAudioContext.play()
// 是异步的, 紧跟的 stop() 拦不住刚发起的播放 → 一进去就响音乐(用户实测bug)
switchScene('menu')

// 渲染循环带异常保护，避免单帧错误卡死
// rAF 全速驱动(60fps): 每帧绘制, 丝滑
let lastDraw = 0
function loop() {
  lastDraw = Date.now()
  try {
    draw()
  } catch (err) {
    console.error('draw error:', err)
  }
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
// interval 仅兜底: 若 rAF 不触发(部分开发者工具环境), 30fps 保证刷新;
// rAF 正常时(16ms间隔)兜底帧距上次绘制<33ms直接跳过, 不重复绘制
setInterval(() => {
  const now = Date.now()
  if (now - lastDraw < 33) return
  lastDraw = now
  try {
    draw()
  } catch (err) {
    console.error('draw error:', err)
  }
}, 33)
