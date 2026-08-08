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
// 微信官方标准: 显式设置 canvas 物理尺寸 = 逻辑尺寸 × DPR，再 scale(DPR)
// 不显式设置时主 canvas 默认 750x1334(物理), 若 DPR=1 则逻辑区域 750x1334,
// 按 375x667 绘制只占左上角 → 看起来空白
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
    if (savedGame) { loadGame(); switchScene('explore') }
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
    drawBtn(ctx, btns[i], null, p, (1 - p) * dist)
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
  switchScene('explore')
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
    drawBtn(ctx, btns[i], null, p, (1 - p) * dist)
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
  else if (scene === 'explore' && explore) explore.draw()
  else if (scene === 'battle' && battle) battle.draw()
}

// 触摸
wx.onTouchStart((e) => {
  const t = e.touches[0]
  if (!t) return
  // 小游戏触摸坐标 = 逻辑像素(与 windowWidth 同坐标系)
  const x = t.clientX, y = t.clientY

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
