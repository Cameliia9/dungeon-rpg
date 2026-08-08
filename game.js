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
const DPR = sysInfo.pixelRatio || 2
const LW = sysInfo.windowWidth    // 逻辑宽(如375)
const LH = sysInfo.windowHeight   // 逻辑高(如667)

const canvas = wx.createCanvas()
canvas.width = LW * DPR
canvas.height = LH * DPR
const ctx = canvas.getContext('2d')
ctx.scale(DPR, DPR)

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
  if (data && data.name) {
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
  if (name === 'menu') buildMenu()
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
  btns = []
  const bw = Math.min(220, LW * 0.7), bh = 48, cx = LW / 2
  let y = LH * 0.42
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '🆕 新游戏', () => switchScene('difficulty'), ui.BTN.primary)); y += bh + 16
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, savedGame ? '▶️ 继续游戏' : '▶️ 继续游戏（无存档）', () => {
    if (savedGame) { loadGame(); switchScene('game') }
  }, ui.BTN.primary)); y += bh + 16
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '⚙️ 设置', () => wx.showToast({ title: '暂无设置项', icon: 'none' }), ui.BTN.secondary)); y += bh + 16
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '🚪 退出', () => wx.exitMiniProgram(), ui.BTN.secondary))
}

function drawMenu() {
  // 背景渐变
  const g = ctx.createLinearGradient(0, 0, 0, LH)
  g.addColorStop(0, COLORS.bgTop)
  g.addColorStop(1, COLORS.bgBottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, LW, LH)

  // 入场动画: 交错 fadeSlideUp (对齐原版 delay)
  const dur = 450, dist = 28
  const p1 = ui.animProgress(sceneEnterTime, 0, dur)
  const p2 = ui.animProgress(sceneEnterTime, 80, dur)
  text(ctx, '⚔️', LW / 2, LH * 0.16 + (1 - p1) * dist, 48, COLORS.gold, 'center', false, p1)
  text(ctx, '地牢冒险', LW / 2, LH * 0.24 + (1 - p2) * dist, 28, COLORS.gold, 'center', true, p2)

  const delays = [160, 240, 320, 400]
  for (let i = 0; i < btns.length; i++) {
    const p = ui.animProgress(sceneEnterTime, delays[i], dur)
    // 只做淡入，不做位移（位移会导致点击区域与显示位置不一致）
    drawBtn(ctx, btns[i], null, p)
  }
}

// ==================== 难度选择 ====================
// 对齐原版: 标题32 说明14 按钮220 交错 0/0.06/0.12/0.18/0.24/0.3s
function buildDifficulty() {
  btns = []
  const bw = Math.min(220, LW * 0.7), bh = 56, cx = LW / 2
  let y = LH * 0.28
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '🟢 简单', () => startNew('easy'), { ...ui.BTN.primary, size: 15 })); y += bh + 12
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '🟡 困难', () => startNew('hard'), { ...ui.BTN.secondary, size: 15 })); y += bh + 12
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '🔴 噩梦', () => startNew('nightmare'), { ...ui.BTN.danger, size: 15 })); y += bh + 24
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '↩️ 返回', () => switchScene('menu'), ui.BTN.secondary))
}

function startNew(difficulty) {
  player = new GE.Player('冒险者', difficulty)
  if (difficulty === 'hard') { player.maxHp = 95; player.hp = 95; player.baseAttack = 11; player.gold = 35 }
  if (difficulty === 'nightmare') { player.maxHp = 90; player.hp = 90; player.baseAttack = 10; player.gold = 20 }
  savePlayer()
  switchScene('game')
}

// ==================== 游戏主页 (对齐原版 screen='game') ====================
function buildGame() {
  btns = []
  const bw = Math.min(220, LW * 0.7), bh = 50, cx = LW / 2
  let y = LH * 0.44
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '🏰 探索地牢', () => switchScene('explore'), ui.BTN.primary)); y += bh + 14
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '🎒 背包 (' + player.inventory.length + '件)', () => wx.showToast({ title: '背包', icon: 'none' }), ui.BTN.secondary)); y += bh + 14
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '🏪 商店', () => wx.showToast({ title: '商店', icon: 'none' }), ui.BTN.gold)); y += bh + 18
  btns.push(makeBtn(cx - bw / 2, y, bw, bh, '↩️ 返回菜单', () => switchScene('menu'), ui.BTN.secondary))
}

function drawGame() {
  const g = ctx.createLinearGradient(0, 0, 0, LH)
  g.addColorStop(0, COLORS.bgTop)
  g.addColorStop(1, COLORS.bgBottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, LW, LH)

  // 标题卡
  roundRect(ctx, 16, 16, LW - 32, 64, 12, ui.cardFill(ctx, 16, 16, LW - 32, 64), COLORS.cardBorder, 1.5)
  text(ctx, '⚔️ 地牢冒险 ⚔️', LW / 2, 36, 18, COLORS.gold, 'center', true)
  text(ctx, '第 ' + player.floor + ' 层 · Lv.' + player.level, LW / 2, 60, 12, COLORS.textDim)

  // 角色状态卡
  const cy = 96
  roundRect(ctx, 16, cy, LW - 32, 170, 12, ui.cardFill(ctx, 16, cy, LW - 32, 170), COLORS.cardBorder, 1.5)
  text(ctx, '🧝 ' + player.name, LW / 2, cy + 18, 15, COLORS.text, 'center', true)
  // 血量
  text(ctx, '❤️ 生命值', 32, cy + 42, 12, COLORS.textDim, 'left')
  text(ctx, player.hp + ' / ' + player.totalMaxHp, LW - 32, cy + 42, 12, COLORS.gold, 'right', true)
  hpBar(ctx, 32, cy + 52, LW - 64, 8, player.hp / player.totalMaxHp)
  // 经验
  text(ctx, '✨ 经验值', 32, cy + 74, 12, COLORS.textDim, 'left')
  text(ctx, player.exp + ' / ' + player.expToLevel(), LW - 32, cy + 74, 12, COLORS.gold, 'right', true)
  // 攻防暴闪
  text(ctx, '⚔️ 攻击 ' + player.totalAttack + '   🛡️ 防御 ' + player.totalDefense, 32, cy + 98, 12, COLORS.textDim, 'left')
  text(ctx, '⚡ 暴击 ' + Math.round(player.totalCrit * 100) + '%   💨 闪避 ' + Math.round(player.totalDodge * 100) + '%', 32, cy + 116, 12, COLORS.textDim, 'left')
  // 金币/击杀
  text(ctx, '💰 金币 ' + player.gold + '   💀 击杀 ' + player.kills, 32, cy + 134, 12, COLORS.textDim, 'left')
  // 装备一览
  text(ctx, '🗡️ 武器：' + (player.weapon ? player.weapon.name + ' (+' + player.weapon.attack + '攻)' : '无'), 32, cy + 154, 11, '#a080ff', 'left')

  for (const b of btns) drawBtn(ctx, b)
}

function savePlayer() {
  if (player) wx.setStorageSync(SAVE_KEY, GE.savePlayer(player))
}

function drawDifficulty() {
  const g = ctx.createLinearGradient(0, 0, 0, LH)
  g.addColorStop(0, COLORS.bgTop)
  g.addColorStop(1, COLORS.bgBottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, LW, LH)

  const dur = 450, dist = 28
  const p1 = ui.animProgress(sceneEnterTime, 0, dur)
  const p2 = ui.animProgress(sceneEnterTime, 60, dur)
  text(ctx, '选择难度', LW / 2, LH * 0.10 + (1 - p1) * dist, 32, COLORS.gold, 'center', true, p1)
  text(ctx, '难度越高，敌人越强（简单×1.0 · 困难×1.25 · 噩梦×1.5）', LW / 2, LH * 0.16 + (1 - p2) * dist, 12, COLORS.textDim, 'center', false, p2)

  const delays = [120, 180, 240, 300]
  for (let i = 0; i < btns.length; i++) {
    const p = ui.animProgress(sceneEnterTime, delays[i], dur)
    // 只做淡入，不做位移
    drawBtn(ctx, btns[i], null, p)
  }
}

// ==================== 探索场景(由 explore.js 提供) ====================
let explore = null
let battle = null

function buildExplore() {
  // 延迟加载避免循环依赖
  if (!explore) explore = require('./js/explore')
  explore.init({
    player, savePlayer, switchScene, canvas, ctx, LW, LH,
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

// 触摸
wx.onTouchStart((e) => {
  const t = e.touches[0]
  if (!t) return
  // 小游戏触摸坐标 = 逻辑像素(与 windowWidth 同坐标系)
  // 兜底: 若坐标明显超出逻辑宽(物理像素模式), 按比例换算
  let x = t.clientX, y = t.clientY
  if (x > LW * 1.5 && t.x) { x = t.x }
  if (y > LH * 1.5 && t.y) { y = t.y }
  if (x > LW || y > LH) {
    // 尝试用 canvas 物理尺寸换算
    const cw = canvas.width || LW
    const ch = canvas.height || LH
    if (cw > 0) x = x * LW / cw
    if (ch > 0) y = y * LH / ch
  }

  // 面板层优先
  if (panels) {
    panels.touch(x, y)
    return
  }
  if (scene === 'menu' || scene === 'difficulty') {
    const b = hitBtn(btns, x, y)
    if (b) b.cb()
  } else if (scene === 'explore' && explore) {
    explore.touch(x, y)
  } else if (scene === 'battle' && battle) {
    battle.touch(x, y)
  }
})

// 启动
if (loadGame()) savedGame = true
switchScene('menu')

// 渲染循环带异常保护，避免单帧错误卡死
// 双保险: requestAnimationFrame + setInterval(部分开发者工具环境 rAF 不触发)
function loop() {
  try {
    draw()
  } catch (err) {
    console.error('draw error:', err)
  }
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
setInterval(loop, 33) // 30fps 兜底，确保画面一定刷新
