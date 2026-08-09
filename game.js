/**
 * 地牢冒险 - 微信小游戏版入口
 * 场景: menu(主菜单) -> difficulty(难度) -> explore(探索) -> battle(战斗)
 *       explore 内可开 panels(商店/背包/铁匠铺)
 */
const ui = require('./js/ui')
const { COLORS, roundRect, text, hpBar, makeBtn, drawBtn, hitBtn } = ui
const GE = require('./utils/game-engine')
const Data = require('./utils/data')

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
  logoImg.onerror = () => { logoImg = null }
  logoImg.src = 'app-icon.png'
}
loadLogo()

// Logo弹跳动画(弹性方块): 进入主菜单从上方掉下, 全屏弹跳衰减, 最后缓动落到中间
let logoAnim = null
let logoSettledAt = 0  // logo落位完成时间(之后标题/按钮才逐渐浮现); 必须声明否则严格模式ReferenceError
const LOGO_SIZE = 76
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
    last: Date.now()
  }
}
function updateLogoAnim() {
  const a = logoAnim
  if (!a || a.phase === 'done') return
  const now = Date.now()
  let dt = (now - a.last) / 1000
  a.last = now
  if (dt > 0.05) dt = 0.05  // 卡顿保护: 单帧最多50ms
  const half = LOGO_SIZE / 2

  if (a.phase === 'bounce') {
    const G = 2600, REST = 0.68, WALL = 0.88
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
      }
    }
    // 撞左右墙: 反弹 + 横向压扁(横缩+纵伸)
    if (a.x <= half) { a.x = half; if (a.vx < 0) { a.vx = -a.vx * WALL; a.deformX = Math.min(a.deformX, -0.2); a.deformY = Math.max(a.deformY, 0.16) } }
    else if (a.x >= LW - half) { a.x = LW - half; if (a.vx > 0) { a.vx = -a.vx * WALL; a.deformX = Math.min(a.deformX, -0.2); a.deformY = Math.max(a.deformY, 0.16) } }
    // 撞顶: 轻反弹(几乎不弹, 只挡一下; 无压扁形变)
    if (a.y <= half) { a.y = half; if (a.vy < 0) a.vy = -a.vy * 0.4 }
    // 弹跳衰减到足够小 → 缓动落位(阈值更低, 弹够才落位)
    if (a.bounces >= 4 && Math.abs(a.vy) < 45 && Math.abs(a.vx) < 28) {
      a.phase = 'settle'
      a.settleT = 0
    }
  } else if (a.phase === 'settle') {
    a.settleT += dt
    const e = ui.easeOut(Math.min(1, a.settleT / 1.1))
    const tx = LW / 2, ty = LH * 0.24
    a.x += (tx - a.x) * e
    a.y += (ty - a.y) * e
    a.deformX *= Math.exp(-9 * dt)
    a.deformY *= Math.exp(-9 * dt)
    if (a.settleT >= 1.1) {
      a.phase = 'done'
      a.x = tx; a.y = ty
      a.deformX = 0.2   // 落定最后压一下(果冻收尾: 横伸)
      a.deformY = -0.15  // 纵缩
      logoSettledAt = Date.now()  // 落位完成: 标题/按钮从此刻起浮现
    }
  } else if (a.phase === 'done') {
    // 最后一下压扁恢复
    a.deformX *= Math.exp(-9 * dt)
    a.deformY *= Math.exp(-9 * dt)
    if (Math.abs(a.deformX) < 0.01 && Math.abs(a.deformY) < 0.01) { a.deformX = 0; a.deformY = 0 }
  }
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
  if (name === 'menu') { buildMenu(); startLogoAnim() }
  else if (name === 'difficulty') buildDifficulty()
  else if (name === 'game') buildGame()
  else if (name === 'explore') buildExplore()
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
  }, savedGame ? ui.BTN.primary : ui.BTN.disabled)
  if (!savedGame) contBtn.disabled = true  // 无存档彻底禁用
  btns.push(contBtn); y += bh + 16
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '⚙️ 设置', () => wx.showToast({ title: '暂无设置项', icon: 'none' }), ui.BTN.secondary)); y += bh + 16
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '🚪 退出', () => wx.exitMiniProgram(), ui.BTN.secondary))
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
  const dur = 900, dist = 28
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
  text(ctx, '地牢冒险', LW / 2, LH * 0.34 + (1 - p2) * dist, 42, COLORS.gold, 'center', true, p2)

  const delays = [160, 240, 320, 400]
  for (let i = 0; i < btns.length; i++) {
    const p = ui.animProgress(baseT, delays[i], dur)
    // 只做淡入，不做位移（位移会导致点击区域与显示位置不一致）
    drawBtn(ctx, btns[i], null, p)
  }
}

// ==================== 难度选择 ====================
// 对齐原版: 标题32 说明14 按钮220 交错 0/0.06/0.12/0.18/0.24/0.3s
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
  switchScene('game')
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

  // 入场动画(交错淡入): 标题卡 -> 状态卡 -> 按钮
  const dur = 900
  const p1 = ui.animProgress(sceneEnterTime, 0, dur)
  const p2 = ui.animProgress(sceneEnterTime, 120, dur)
  const p3 = ui.animProgress(sceneEnterTime, 240, dur)

  // 标题卡(下移+放大)
  ctx.globalAlpha = p1
  roundRect(ctx, 16, 120, LW - 32, 74, 12, ui.cardFill(ctx, 16, 120, LW - 32, 74), COLORS.cardBorder, 1.5)
  text(ctx, '⚔️ 地牢冒险 ⚔️', LW / 2, 148, 22, COLORS.gold, 'center', true)
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

  const dur = 900, dist = 28
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
  else if (scene === 'game') drawGame()
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
  if (scene === 'menu' || scene === 'difficulty' || scene === 'game') {
    const b = hitBtn(btns, x, y)
    if (b && !b.disabled) b.cb()
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
  if (scene === 'battle' && battle && battle.touchMove) battle.touchMove(x, y)
  else if (scene === 'explore' && explore && explore.touchMove) explore.touchMove(x, y)
})

wx.onTouchEnd(() => {
  if (panels) { if (panels.touchEnd) panels.touchEnd(); return }
  if (scene === 'battle' && battle && battle.touchEnd) battle.touchEnd()
  else if (scene === 'explore' && explore && explore.touchEnd) explore.touchEnd()
})

// 启动
if (loadGame()) savedGame = true
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
