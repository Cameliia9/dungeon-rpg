/**
 * 探索场景: 双门抉择 + 事件 + 底部状态栏(可折叠) + 面板入口
 */
const ui = require('./ui')
const { COLORS, roundRect, text, hpBar, makeBtn, drawBtn, hitBtn } = ui
const GE = require('../utils/game-engine')
const Data = require('../utils/data')

let S = null // 共享状态

let leftEvent = null, rightEvent = null
let leftState = 'door', rightState = 'door'
let activeSide = null
let footerExpanded = true
let trapResult = null
let roomsPerFloor = 15
let enterTime = Date.now()   // 探索页入场时间(动画)

function init(shared) {
  S = shared
  enterTime = Date.now()
  if (!skipRegen) generateEvents()
  else skipRegen = false
}

let skipRegen = false

function ctx() { return S.ctx }

function genEvent() {
  // 85% 怪 / 15% 事件
  const types = ['treasure', 'spring', 'merchant', 'trap', 'camp', 'altar', 'deadend', 'coins', 'buffStone', 'oldGear']
  if (Math.random() < 0.85) {
    const m = GE.getRandomMonster(S.player.floor, S.player.difficulty)
    return { type: 'monster', monster: m }
  }
  const t = types[Math.floor(Math.random() * types.length)]
  return buildSimpleEvent(t)
}

function buildSimpleEvent(type) {
  const p = S.player
  const floor = p.floor
  switch (type) {
    case 'treasure': return { type, gold: Math.floor(15 + floor * 8 + Math.random() * floor * 15) }
    case 'coins': return { type, gold: Math.floor(10 + floor * 3 + Math.random() * floor * 8) }
    case 'spring': return { type, heal: Math.max(1, Math.floor((p.totalMaxHp - p.hp) * 0.3)) }
    case 'trap': return { type, damage: Math.max(1, Math.floor(p.hp * 0.15)), dodgeChance: 0.15 }
    case 'deadend': return { type }
    case 'buffStone': return { type, attackBonus: 2 }
    case 'oldGear': return { type, defense: 2, gold: Math.floor(5 + floor * 2) }
    case 'altar': return { type, cost: 30, maxCount: 3, altarCount: 0 }
    case 'camp': {
      const theme = Data.getThemeForFloor(floor)
      const goods = Data.themeMerchantGoods[theme.id]
      return { type: 'merchant', items: goods ? goods.items.map(g => ({ ...g })) : [], themeName: theme.name, merchantIcon: theme.icon }
    }
    default: return { type: 'deadend' }
  }
}

function generateEvents() {
  // 双门不同类型
  leftEvent = genEvent()
  rightEvent = genEvent()
  while (rightEvent.type === leftEvent.type) rightEvent = genEvent()
  leftState = 'door'
  rightState = 'door'
  activeSide = null
  trapResult = null
  roomsPerFloor = GE.getRoomsPerFloor(S.player.floor)
}

function buttons() { return [] }

function touch(x, y) {
  // 状态栏折叠箭头（状态栏顶部区域）
  if (y > S.LH - 148 && y < S.LH - 118) {
    footerExpanded = !footerExpanded
    return
  }
  // 面板按钮（仅展开时）
  if (footerExpanded) {
    const bw = S.LW * 0.43, bh = 26
    const bx1 = S.LW * 0.05, bx2 = S.LW * 0.52
    // 第一行: 商店 / 背包
    const by1 = S.LH - 46
    if (y > by1 && y < by1 + bh) {
      if (x > bx1 && x < bx1 + bw) openPanel('shop')
      else if (x > bx2 && x < bx2 + bw) openPanel('inventory')
      return
    }
    // 第二行: 铁匠铺 / 退出
    const by2 = S.LH - 12
    if (y > by2 && y < by2 + bh) {
      if (x > bx1 && x < bx1 + bw) openPanel('forge')
      else if (x > bx2 && x < bx2 + bw) exitExplore()
      return
    }
  }

  // 卡片区：根据状态分发
  const cardTop = 92
  const cardH = S.LH - 150 - 100
  if (y > cardTop && y < cardTop + cardH) {
    const isLeft = x < S.LW / 2
    const side = isLeft ? 'left' : 'right'
    const state = side === 'left' ? leftState : rightState
    const evt = side === 'left' ? leftEvent : rightEvent
    const cx = isLeft ? leftX() + cardW() / 2 : rightX() + cardW() / 2
    const cy = cardTop + cardH / 2

    if (state === 'door') {
      if (evt && evt.type === 'stairs') descend()
      else if (evt && evt.type === 'boss') startBattle(side, true)
      else pickSide(side)
    } else if (state === 'monster') {
      // 战斗/逃跑按钮
      if (y > cy + 58 && y < cy + 88) {
        if (x > cx - 70 && x < cx - 10) startBattle(side, false)
        else if (x > cx + 10 && x < cx + 70) fleeMonster(side)
      }
    } else if (state === 'result') {
      // 继续按钮
      if (y > cy + 50 && y < cy + 84) finishSide(side)
    } else if (state === 'deadend') {
      finishSide(side)
    } else if (state === 'merchant') {
      // 买/离开
      let yy = cy - 12
      for (let i = 0; i < evt.items.length; i++) {
        if (y > yy - 10 && y < yy + 10 && x > cx + 40 && x < cx + 80) { buyMerchant(side, i); return }
        yy += 28
      }
      if (y > cy + 70 && y < cy + 98) finishSide(side)
    } else if (state === 'altar') {
      if (y > cy + 40 && y < cy + 70 && evt.altarCount < evt.maxCount) {
        const p = S.player
        if (p.hp <= evt.cost) { wx.showToast({ title: '生命不足！', icon: 'none' }); return }
        p.hp -= evt.cost
        p.baseAttack += 1
        evt.altarCount++
        S.savePlayer()
        if (evt.altarCount >= evt.maxCount) setTimeout(() => finishSide(side), 400)
      } else if (y > cy + 80 && y < cy + 106) finishSide(side)
    }
  }
}

function cardW() { return S.LW * 0.46 }

function openPanel(name) {
  const panels = require('./panels')
  const p = panels.create(name, S)
  if (S.setPanels) S.setPanels(p)
}

function exitExplore() {
  S.player.tempAttackBuff = 0
  S.player.tempDefenseBuff = 0
  S.savePlayer()
  S.switchScene('menu')
}

// ==================== 事件处理 ====================
function setState(side, val) {
  if (side === 'left') leftState = val
  else rightState = val
}

function pickSide(side) {
  const evt = side === 'left' ? leftEvent : rightEvent
  if (!evt) return
  const key = side + 'State'
  activeSide = side
  const p = S.player

  switch (evt.type) {
    case 'treasure':
      p.gold += evt.gold; setState(side, 'result'); S.savePlayer(); break
    case 'coins':
      p.gold += evt.gold; setState(side, 'result'); S.savePlayer(); break
    case 'spring':
      p.heal(evt.heal); setState(side, 'result'); S.savePlayer(); break
    case 'trap': {
      const dodged = Math.random() < evt.dodgeChance
      let dmg = 0
      if (!dodged) { dmg = evt.damage; p.hp = Math.max(0, p.hp - dmg) }
      trapResult = { dodged, damage: dmg }
      setState(side, 'result')
      S.savePlayer()
      if (p.isDead()) { S.switchScene('menu'); return }
      break
    }
    case 'deadend':
      p.roomsExplored++
      setState(side, 'deadend')
      S.savePlayer()
      break
    case 'monster':
    case 'merchant':
      setState(side, evt.type)
      break
    case 'buffStone':
      p.tempAttackBuff = (p.tempAttackBuff || 0) + evt.attackBonus
      setState(side, 'result'); S.savePlayer(); break
    case 'oldGear':
      p.tempDefenseBuff = (p.tempDefenseBuff || 0) + evt.defense
      setState(side, 'result'); S.savePlayer(); break
    case 'camp':
      setState(side, 'result')
      p.heal(p.totalMaxHp)
      S.savePlayer()
      break
    case 'altar':
      setState(side, 'altar')
      break
  }
}

function finishSide(side) {
  const p = S.player
  p.roomsExplored++
  activeSide = null
  S.savePlayer()

  // 本层完成 → 楼梯/Boss
  if (p.roomsExplored >= roomsPerFloor) {
    const isBossFloor = p.floor % 5 === 0
    if (side === 'left') { leftEvent = { type: isBossFloor ? 'boss' : 'stairs' }; rightEvent = null }
    else { rightEvent = { type: isBossFloor ? 'boss' : 'stairs' }; leftEvent = null }
    leftState = 'door'; rightState = 'door'
    return
  }

  // 另一侧是死路/封锁 → 重新生成两侧
  const other = side === 'left' ? 'right' : 'left'
  const otherState = other === 'left' ? leftState : rightState
  if (otherState === 'deadend') {
    generateEvents()
    return
  }

  // 滑动: 完成侧换新事件
  if (side === 'left') {
    leftEvent = rightEvent
    leftState = rightState
    rightEvent = genEvent()
    rightState = 'door'
    // 避免同类型
    let guard = 0
    while (rightEvent.type === leftEvent.type && guard++ < 10) rightEvent = genEvent()
  } else {
    rightEvent = genEvent()
    rightState = 'door'
    let guard = 0
    while (rightEvent.type === leftEvent.type && guard++ < 10) rightEvent = genEvent()
  }
}

function descend() {
  const p = S.player
  p.floor++
  p.roomsExplored = 0
  p.tempAttackBuff = 0
  p.tempDefenseBuff = 0
  p.heal(Math.floor(p.totalMaxHp * 0.3))
  S.savePlayer()
  generateEvents()
}

function startBattle(side, isBoss) {
  const evt = side === 'left' ? leftEvent : rightEvent
  const m = isBoss ? GE.getBossForFloor(S.player.floor, S.player.difficulty) : evt.monster
  const battle = require('./battle')
  battle.start(S, m, isBoss, () => {
    // 战斗结束回调: 返回探索场景并保留双门状态
    skipRegen = true
    if (S.bossDefeated) {
      if (side === 'left') { leftEvent = { type: 'stairs' }; rightEvent = null }
      else { rightEvent = { type: 'stairs' }; leftEvent = null }
      leftState = 'door'; rightState = 'door'
      S.bossDefeated = false
    } else {
      finishSide(side)
    }
    S.switchScene('explore')
  })
  S.battleSide = side
  S.switchScene('battle')
}

// ==================== 绘制 ====================
function draw() {
  const ctx = S.ctx
  const p = S.player
  // 背景
  const g = S.ctx.createLinearGradient(0, 0, 0, S.LH)
  g.addColorStop(0, COLORS.bgTop)
  g.addColorStop(1, COLORS.bgBottom)
  S.ctx.fillStyle = g
  S.ctx.fillRect(0, 0, S.LW, S.LH)

  // 顶部: 楼层 + 主题 (入场动画 0s)
  const theme = Data.getThemeForFloor(p.floor)
  const dur = 600, dist = 30
  const ph = ui.animProgress(enterTime, 0, dur)
  text(ctx, '🏰 地牢第 ' + p.floor + ' 层', S.LW / 2, 28 + (1 - ph) * dist, 20, COLORS.gold, 'center', true, ph)
  text(ctx, theme.icon + ' ' + theme.name, S.LW / 2, 52 + (1 - ph) * dist, 12, COLORS.textDim, 'center', false, ph)
  text(ctx, '已探索 ' + p.roomsExplored + ' / ' + roomsPerFloor, S.LW / 2, 72 + (1 - ph) * dist, 11, COLORS.textDark, 'center', false, ph)

  // 双门卡片 (左 0.1s 右 0.2s 滑入)
  const cardTop = 92
  const cardH = S.LH - 150 - 100
  const cardW = S.LW * 0.46
  const gap = S.LW * 0.04
  const pL = ui.animProgress(enterTime, 100, 600)
  const pR = ui.animProgress(enterTime, 200, 600)
  drawCard(leftX(), cardTop, cardW, cardH, 'left', (1 - pL) * 36)
  drawCard(rightX(), cardTop, cardW, cardH, 'right', (1 - pR) * 36)

  // 底部状态栏 (0.3s 上滑)
  drawFooter()
}

function leftX() { return S.LW * 0.04 }
function rightX() { return S.LW - S.LW * 0.04 - S.LW * 0.46 }

function drawCard(x, y, w, h, side, slideIn) {
  const ctx = S.ctx
  const p = S.player
  const evt = side === 'left' ? leftEvent : rightEvent
  const state = side === 'left' ? leftState : rightState
  const scale = activeSide === side ? 1.05 : activeSide ? 0.92 : 1
  const cw = w * scale, ch = h * scale
  const cx = x + w / 2, cy = y + h / 2 + (slideIn || 0)

  // 卡片渐变背景(对齐原版 .card)
  roundRect(ctx, cx - cw / 2, cy - ch / 2, cw, ch, 14, ui.cardFill(ctx, cx - cw / 2, cy - ch / 2, cw, ch), activeSide === side ? COLORS.goldBright : COLORS.cardBorder, activeSide === side ? 2 : 1.5)

  if (state === 'door') {
    if (evt && evt.type === 'stairs') {
      text(ctx, '🪜', cx, cy - 20, 40)
      text(ctx, '发现楼梯！', cx, cy + 20, 15, COLORS.goldBright, 'center', true)
      text(ctx, '⬇️ 下到 ' + (p.floor + 1) + ' 层', cx, cy + 45, 12, COLORS.textDim)
    } else if (evt && evt.type === 'boss') {
      text(ctx, '👑', cx, cy - 20, 40)
      text(ctx, '⚠️ Boss 拦路！', cx, cy + 20, 15, COLORS.red, 'center', true)
      text(ctx, '⚔️ 挑战 Boss', cx, cy + 45, 12, COLORS.textDim)
    } else {
      text(ctx, '🚪', cx, cy - 15, 44)
      text(ctx, '前进探索', cx, cy + 30, 13, COLORS.textDim)
    }
  } else if (state === 'deadend') {
    text(ctx, '🚧', cx, cy - 20, 36)
    text(ctx, '死路', cx, cy + 20, 15, COLORS.textDim)
  } else if (state === 'result') {
    drawResultCard(cx, cy, evt)
  } else if (state === 'monster') {
    drawMonsterCard(cx, cy, evt.monster)
  } else if (state === 'merchant') {
    drawMerchantCard(cx, cy, evt, side)
  } else if (state === 'altar') {
    drawAltarCard(cx, cy, evt, side)
  }
}

function drawResultCard(cx, cy, evt) {
  const ctx = S.ctx
  if (!evt) return
  switch (evt.type) {
    case 'treasure': case 'coins':
      text(ctx, '🪙', cx, cy - 20, 36)
      text(ctx, '获得 ' + evt.gold + ' 金币！', cx, cy + 20, 15, COLORS.goldBright, 'center', true)
      break
    case 'spring':
      text(ctx, '💧', cx, cy - 20, 36)
      text(ctx, '生命泉水 +' + evt.heal, cx, cy + 20, 15, COLORS.green, 'center', true)
      break
    case 'trap':
      text(ctx, '⚠️', cx, cy - 20, 36)
      if (trapResult && trapResult.dodged) text(ctx, '闪避成功！', cx, cy + 20, 15, COLORS.green, 'center', true)
      else text(ctx, '触发陷阱 -' + (trapResult ? trapResult.damage : 0), cx, cy + 20, 15, COLORS.red, 'center', true)
      break
    case 'buffStone':
      text(ctx, '🗿', cx, cy - 20, 36)
      text(ctx, '攻击 +' + evt.attackBonus + '！', cx, cy + 20, 15, COLORS.goldBright, 'center', true)
      break
    case 'oldGear':
      text(ctx, '🛡️', cx, cy - 20, 36)
      text(ctx, '防御 +' + evt.defense + '！', cx, cy + 20, 15, COLORS.blue, 'center', true)
      break
    case 'camp':
      text(ctx, '⛺', cx, cy - 20, 36)
      text(ctx, '安全休息，生命回满！', cx, cy + 20, 15, COLORS.green, 'center', true)
      break
  }
  // 继续按钮
  drawBtn(ctx, makeBtn(cx - 60, cy + 50, 120, 34, '继续', () => finishSide(activeSide === 'left' ? 'left' : 'right'), ui.BTN.gold))
}

function drawMonsterCard(cx, cy, m) {
  const ctx = S.ctx
  text(ctx, m.icon, cx, cy - 30, 36)
  text(ctx, m.name + '  Lv.' + m.level, cx, cy, 15, COLORS.gold, 'center', true)
  text(ctx, '❤' + m.hp + '  ⚔' + m.attack + '  🛡' + m.defense, cx, cy + 22, 12, COLORS.textDim)
  text(ctx, '⚡' + m.critPercent + '%暴  💨' + m.dodgePercent + '%闪', cx, cy + 40, 11, COLORS.textDark)
  const side = activeSide
  // 战斗/逃跑按钮
  drawBtn(ctx, makeBtn(cx - 70, cy + 58, 60, 30, '⚔️战斗', () => startBattle(side, false), ui.BTN.primary))
  drawBtn(ctx, makeBtn(cx + 10, cy + 58, 60, 30, '🏃逃跑', () => fleeMonster(side), ui.BTN.secondary))
}

function fleeMonster(side) {
  const p = S.player
  const chance = Math.min(0.9, 0.4 + p.fleeFails * 0.1)
  if (Math.random() < chance) {
    p.fleeFails = 0
    S.savePlayer()
    finishSide(side)
  } else {
    p.fleeFails++
    S.savePlayer()
    startBattle(side, false)
  }
}

function drawMerchantCard(cx, cy, evt, side) {
  const ctx = S.ctx
  text(ctx, evt.merchantIcon || '🧙', cx, cy - 70, 30)
  text(ctx, evt.themeName + ' 商人', cx, cy - 40, 13, COLORS.gold, 'center', true)
  // 商品列表
  let yy = cy - 12
  for (let i = 0; i < evt.items.length; i++) {
    const it = evt.items[i]
    text(ctx, it.name + '  💰' + it.price, cx, yy, 11, COLORS.textDim)
    drawBtn(ctx, makeBtn(cx + 40, yy - 10, 40, 20, '买', () => buyMerchant(side, i), ui.BTN.gold))
    yy += 28
  }
  drawBtn(ctx, makeBtn(cx - 40, cy + 70, 80, 28, '离开', () => finishSide(side), ui.BTN.secondary))
}

function buyMerchant(side, idx) {
  const evt = side === 'left' ? leftEvent : rightEvent
  const item = evt.items[idx]
  const p = S.player
  if (!item) return
  if (p.gold < item.price) { wx.showToast({ title: '金币不足！', icon: 'none' }); return }
  p.gold -= item.price
  if (item.type === 'potion') {
    p.heal(Math.floor(p.totalMaxHp * (item.healPercent || 0.3)))
    if (item.curePoison) p.poisonTurns = 0
  } else {
    p.inventory.push({ ...item })
  }
  S.savePlayer()
  wx.showToast({ title: '购买成功！', icon: 'success' })
}

function drawAltarCard(cx, cy, evt, side) {
  const ctx = S.ctx
  const p = S.player
  text(ctx, '🕯️', cx, cy - 50, 30)
  text(ctx, '遗物祭坛', cx, cy - 20, 14, COLORS.gold, 'center', true)
  text(ctx, '献祭 30 生命: 攻击+1', cx, cy + 8, 11, COLORS.textDim)
  text(ctx, '(' + evt.altarCount + '/' + evt.maxCount + ')', cx, cy + 24, 11, COLORS.textDark)
  if (evt.altarCount < evt.maxCount) {
    drawBtn(ctx, makeBtn(cx - 45, cy + 40, 90, 30, '献祭', () => {
      const p = S.player
      if (p.hp <= evt.cost) { wx.showToast({ title: '生命不足！', icon: 'none' }); return }
      p.hp -= evt.cost
      p.baseAttack += 1
      evt.altarCount++
      S.savePlayer()
      if (evt.altarCount >= evt.maxCount) setTimeout(() => finishSide(side), 400)
    }, ui.BTN.danger))
  }
  drawBtn(ctx, makeBtn(cx - 40, cy + 80, 80, 26, '离开', () => finishSide(side), ui.BTN.secondary))
}

function drawFooter() {
  const ctx = S.ctx
  const p = S.player
  const slideIn = (1 - ui.animProgress(enterTime, 300, 600)) * 40
  const y = S.LH - 150 + slideIn
  // 状态栏卡片渐变背景
  roundRect(ctx, 0, y, S.LW, 150, 14, ui.cardFill(ctx, 0, y, S.LW, 150), '#2a2a4a', 1.5)

  // 收起行: 名字 + 血条 + 箭头（y+10 ~ y+30）
  text(ctx, '🧝 ' + p.name + ' · Lv.' + p.level, 16, y + 14, 13, COLORS.text, 'left')
  text(ctx, footerExpanded ? '▾' : '▴', S.LW - 20, y + 14, 16, COLORS.textDim)
  hpBar(ctx, 16, y + 26, S.LW - 32, 10, p.hp / p.totalMaxHp)
  text(ctx, '❤ ' + p.hp + ' / ' + p.totalMaxHp, S.LW / 2, y + 44, 10, COLORS.red)

  if (footerExpanded) {
    // 属性行（y+54 ~ y+90）
    text(ctx, '⚔' + p.totalAttack + '攻  🛡' + p.totalDefense + '防  ⚡' + Math.round(p.totalCrit * 100) + '%暴  💨' + Math.round(p.totalDodge * 100) + '%闪', S.LW / 2, y + 62, 10, COLORS.textDim)
    text(ctx, '💰 ' + p.gold + '  ⭐ ' + p.exp + ' / ' + p.expToLevel(), S.LW / 2, y + 80, 10, COLORS.textDim)

    // 2x2 按钮（固定 y: 第一行 S.LH-46, 第二行 S.LH-12，渐变配色对齐原版）
    const bw = S.LW * 0.43, bh = 26
    const bx1 = S.LW * 0.05, bx2 = S.LW * 0.52
    let by = S.LH - 46
    const b1 = makeBtn(bx1, by, bw, bh, '🏪 商店', null, { ...ui.BTN.gold, size: 12 })
    drawBtn(ctx, b1)
    const b2 = makeBtn(bx2, by, bw, bh, '🎒 背包', null, { ...ui.BTN.primary, size: 12 })
    drawBtn(ctx, b2)
    by = S.LH - 12
    const b3 = makeBtn(bx1, by, bw, bh, '⚒️ 铁匠铺', null, { ...ui.BTN.forge, size: 12 })
    drawBtn(ctx, b3)
    const b4 = makeBtn(bx2, by, bw, bh, '🚪 退出', null, { ...ui.BTN.secondary, size: 12 })
    drawBtn(ctx, b4)
  }
}

// 供 game.js 调用: 重新生成事件(下楼后)
function regen() { generateEvents() }

module.exports = { init, draw, touch, buttons, regen, generateEvents, descend, startBattle, finishSide }
