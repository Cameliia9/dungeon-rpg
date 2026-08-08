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

// ---- 卡片交互动画状态机 ----
// phase: 'idle'(两卡相等) | 'expand'(选中放大/另一侧缩小) | 'flyout'(完成向右上旋出)
let cardAnim = { phase: 'idle', start: 0, side: null, dur: 400 }
// 各事件类型的选中放大比例(神秘商人最大)
function expandScale(type) {
  switch (type) {
    case 'merchant': return 1.14
    case 'monster': return 1.06
    case 'altar': return 1.08
    case 'result': return 1.05
    case 'deadend': return 1.0
    default: return 1.05
  }
}
// 未选中侧缩小比例
const SHRINK_SCALE = 0.86

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
  cardAnim = { phase: 'idle', start: 0, side: null, dur: 400 }
  roomsPerFloor = GE.getRoomsPerFloor(S.player.floor)
}

function buttons() { return [] }

function touch(x, y) {
  const fh = footerH()
  const fy = S.LH - fh
  // 状态栏折叠箭头（顶部居中箭头区域）
  if (y > fy && y < fy + 22) {
    footerExpanded = !footerExpanded
    return
  }
  // 面板按钮（仅展开时, y+122 和 y+152 两行）
  if (footerExpanded) {
    const bw = S.LW * 0.42, bh = 32
    const bx1 = S.LW * 0.05, bx2 = S.LW * 0.53
    // 第一行: 商店 / 背包
    const by1 = fy + 170
    if (y > by1 && y < by1 + bh) {
      if (x > bx1 && x < bx1 + bw) openPanel('shop')
      else if (x > bx2 && x < bx2 + bw) openPanel('inventory')
      return
    }
    // 第二行: 铁匠铺 / 退出
    const by2 = fy + 220
    if (y > by2 && y < by2 + bh) {
      if (x > bx1 && x < bx1 + bw) openPanel('forge')
      else if (x > bx2 && x < bx2 + bw) exitExplore()
      return
    }
  }

  // 卡片区：根据状态分发（坐标与绘制一致）
  const cardTop = 174
  const cardH = 200
  if (y > cardTop && y < cardTop + cardH) {
    const isLeft = x < S.LW / 2
    const side = isLeft ? 'left' : 'right'
    const state = side === 'left' ? leftState : rightState
    const evt = side === 'left' ? leftEvent : rightEvent
    const w = cardW()
    const cx = isLeft ? leftX() + w / 2 : rightX() + w / 2
    const cy = cardTop + cardH / 2

    if (state === 'door') {
      if (evt && evt.type === 'stairs') {
        // 楼梯按钮 cy+23~cy+57 (绘制 cy+40 高34)
        if (y > cy + 23 && y < cy + 57) descend()
      } else if (evt && evt.type === 'boss') {
        // Boss按钮 cy+25~cy+59 (绘制 cy+42 高34)
        if (y > cy + 25 && y < cy + 59) startBattle(side, true)
      } else {
        // 前进按钮 cy+13~cy+47 (绘制 cy+30 高34: cy+30~cy+64)
        if (y > cy + 13 && y < cy + 64) pickSide(side)
      }
    } else if (state === 'monster') {
      // 战斗/逃跑按钮(并排, cy+52)
      if (y > cy + 52 && y < cy + 84) {
        if (x > cx - w * 0.36 - 4 && x < cx - 4) startBattle(side, false)
        else if (x > cx + 4 && x < cx + w * 0.36 + 4) fleeMonster(side)
      }
    } else if (state === 'result') {
      // 好的按钮(红色80%, cy+34)
      if (y > cy + 34 && y < cy + 68) finishSide(side)
    } else if (state === 'deadend') {
      // 返回按钮(cy+42)
      if (y > cy + 42 && y < cy + 76) blockSide(side)
    } else if (state === 'merchant') {
      // 商品行(46px高) + 离开按钮
      let yy = cy - 8
      for (let i = 0; i < evt.items.length; i++) {
        if (y > yy && y < yy + 46) {
          const iw = w * 0.9, ix = cx - iw / 2
          if (x > ix + iw - 60 && x < ix + iw - 10 && y > yy + 20 && y < yy + 40) { buyMerchant(side, i); return }
        }
        yy += 50
      }
      if (y > yy + 8 && y < yy + 40) finishSide(side)
    } else if (state === 'altar') {
      const bw = w * 0.8
      if (y > cy + 4 && y < cy + 34) altarOffer(side, 'attack', evt)
      else if (y > cy + 40 && y < cy + 70) altarOffer(side, 'defense', evt)
      else if (y > cy + 76 && y < cy + 106) finishSide(side)
    } else if (state === 'blocked') {
      // 封锁不可点击
    }
  }
}

function cardW() { return S.LW * 0.43 }

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
  // 启动展开动画(选中放大/另一侧缩小)
  cardAnim = { phase: 'expand', start: Date.now(), side: side, dur: 350 }
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

// 封锁死路一侧（该侧不可再点击）
function blockSide(side) {
  setState(side, 'blocked')
  activeSide = null
  S.savePlayer()
}

// 事件完成: 先播扑克牌飞出动画, 动画结束后推进逻辑
function finishSide(side) {
  if (cardAnim.phase === 'flyout') return  // 防重复触发
  cardAnim = { phase: 'flyout', start: Date.now(), side: side, dur: 450 }
  setTimeout(() => {
    doFinishSide(side)
    // 动画结束后: 两卡恢复相等
    cardAnim = { phase: 'idle', start: 0, side: null, dur: 400 }
  }, 460)
}

function doFinishSide(side) {
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
  // 背景: 纯净深藏蓝纯色(无渐变, 暗黑简约地牢风)
  ctx.fillStyle = '#0d1b2a'
  ctx.fillRect(0, 0, S.LW, S.LH)

  // ============ 顶部区域(≈25%: 0~167) ============
  // 左上角白色返回箭头
  text(ctx, '←', 26, 44, 22, '#ffffff', 'center', true)
  // 顶部居中白色标题「探索地牢」
  text(ctx, '探索地牢', S.LW / 2, 44, 20, '#ffffff', 'center', true)

  // 楼层信息卡(稍浅于背景的深蓝, 大圆角, 宽松内边距)
  const theme = Data.getThemeForFloor(p.floor)
  const infoY = 64, infoH = 98
  roundRect(ctx, 16, infoY, S.LW - 32, infoH, 20, '#16263a', 'rgba(255,255,255,0.06)', 1)
  // 第一行: 左侧🏰+金色「地牢第X层」, 右侧绿色圆点+白色主题名
  text(ctx, '🏰 地牢第 ' + p.floor + ' 层', 36, infoY + 28, 17, '#e0c080', 'left', true)
  text(ctx, '●', S.LW - 70, infoY + 28, 10, '#2ecc71', 'left')
  text(ctx, theme.name, S.LW - 56, infoY + 28, 13, '#ffffff', 'left', true)
  // 第二行: 浅灰描述
  text(ctx, theme.desc || '', 36, infoY + 58, 11, '#8a8a9a', 'left')
  // 第三行: 浅灰进度
  text(ctx, '已探索 ' + p.roomsExplored + ' / ' + roomsPerFloor + ' 个房间', 36, infoY + 82, 11, '#8a8a9a', 'left')

  // ============ 中间探索区(≈50%: 167~500) ============
  const cardTop = 174
  const cardH = 200
  const cardW = S.LW * 0.43
  const pL = ui.animProgress(enterTime, 100, 600)
  const pR = ui.animProgress(enterTime, 200, 600)
  drawCard(leftX(), cardTop, cardW, cardH, 'left', (1 - pL) * 36)
  drawCard(rightX(), cardTop, cardW, cardH, 'right', (1 - pR) * 36)

  // ============ 底部状态栏(≈25%: 500~667) ============
  drawFooter()
}

function leftX() { return S.LW * 0.05 }
function rightX() { return S.LW * 0.52 }

function drawCard(x, y, w, h, side, slideIn) {
  const ctx = S.ctx
  const p = S.player
  const evt = side === 'left' ? leftEvent : rightEvent
  const state = side === 'left' ? leftState : rightState

  // ---- 交互动画: 计算 scale/scaleX/旋转/位移/透明度 ----
  let scale = 1, scaleX = 1, rot = 0, dx = 0, dy = 0, alpha = 1
  const now = Date.now()
  const evtType = evt ? evt.type : ''
  if (cardAnim.phase === 'expand') {
    const t = Math.min(1, (now - cardAnim.start) / cardAnim.dur)
    const e = ui.easeOut(t)
    if (cardAnim.side === side) {
      // 选中侧: 放大到事件类型比例
      const target = expandScale(evtType)
      scale = 1 + (target - 1) * e
    } else {
      // 未选中侧: 缩小 + 横向压缩
      scale = 1 + (SHRINK_SCALE - 1) * e
      scaleX = 1 + (0.82 - 1) * e
    }
  } else if (cardAnim.phase === 'flyout' && cardAnim.side === side) {
    // 完成侧: 向右上旋转滑出(扑克牌式)
    const t = Math.min(1, (now - cardAnim.start) / 450)
    const e = ui.easeOut(t)
    scale = 1 + (1.1 - 1) * e
    rot = 18 * e
    dx = 90 * e
    dy = -70 * e
    alpha = 1 - e
  } else if (cardAnim.phase === 'idle') {
    // 两卡相等
    scale = 1; scaleX = 1
  }

  const cw = w * scale * scaleX, ch = h * scale
  const cx = x + w / 2 + dx, cy = y + h / 2 + (slideIn || 0) + dy
  ctx.globalAlpha = alpha

  // 旋转支持(扑克牌飞出)
  if (rot !== 0) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(rot * Math.PI / 180)
    ctx.translate(-cx, -cy)
  }

  // 卡片渐变背景(对齐原版 .card)
  roundRect(ctx, cx - cw / 2, cy - ch / 2, cw, ch, 12, ui.cardFill(ctx, cx - cw / 2, cy - ch / 2, cw, ch), cardAnim.side === side && cardAnim.phase !== 'flyout' ? COLORS.goldBright : COLORS.cardBorder, cardAnim.side === side && cardAnim.phase !== 'flyout' ? 2 : 1.5)

  if (state === 'door') {
    if (evt && evt.type === 'stairs') {
      // 楼梯卡: 🪜 + 发现楼梯！(金色粗体) + 金色按钮
      text(ctx, '🪜', cx, cy - 58, 44)
      text(ctx, '发现楼梯！', cx, cy - 6, 16, '#f0c040', 'center', true)
      drawBtn(ctx, makeBtn(cx - w * 0.34, cy + 40, w * 0.68, 38, '⬇️ 下到 ' + (p.floor + 1) + ' 层', () => descend(), { ...ui.BTN.gold, r: 19 }))
    } else if (evt && evt.type === 'boss') {
      // Boss卡: 👑 + ⚠️ Boss拦路！(红粗) + 描述 + 红色按钮
      text(ctx, '👑', cx, cy - 62, 44)
      text(ctx, '⚠️ Boss 拦路！', cx, cy - 8, 16, '#ff5555', 'center', true)
      text(ctx, '击败它才能继续前进', cx, cy + 16, 11, COLORS.textDim)
      drawBtn(ctx, makeBtn(cx - w * 0.34, cy + 42, w * 0.68, 38, '⚔️ 挑战 Boss', () => startBattle(side, true), { ...ui.BTN.danger, r: 19 }))
    } else {
      // 普通门: 浅棕色木门图标(大) + 红色大圆角前进按钮
      text(ctx, '🚪', cx, cy - 48, 52)
      drawBtn(ctx, makeBtn(cx - w * 0.42, cy + 34, w * 0.84, 44, '前进探索', () => pickSide(side), { ...ui.BTN.primary, r: 22, size: 15 }))
    }
  } else if (state === 'deadend') {
    // 死路: 🚧 + 死路 + 描述 + 灰色返回按钮
    text(ctx, '🚧', cx, cy - 56, 36)
    text(ctx, '死路', cx, cy - 8, 16, COLORS.gold, 'center', true)
    text(ctx, '前方没有路了，只能从另一边前进', cx, cy + 16, 11, COLORS.textDim)
    drawBtn(ctx, makeBtn(cx - w * 0.34, cy + 42, w * 0.68, 34, '💨 返回', () => blockSide(side), ui.BTN.secondary))
  } else if (state === 'blocked') {
    // 封锁: 🔒 + 此路不通
    text(ctx, '🔒', cx, cy - 30, 36)
    text(ctx, '此路不通', cx, cy + 20, 13, '#555565')
  } else if (state === 'result') {
    drawResultCard(cx, cy, evt, w)
  } else if (state === 'monster') {
    drawMonsterCard(cx, cy, evt.monster, w)
  } else if (state === 'merchant') {
    drawMerchantCard(cx, cy, evt, side, w)
  } else if (state === 'altar') {
    drawAltarCard(cx, cy, evt, side, w)
  }

  // 恢复旋转/透明度
  if (rot !== 0) ctx.restore()
  ctx.globalAlpha = 1
}

function drawResultCard(cx, cy, evt, w) {
  const ctx = S.ctx
  if (!evt) return
  let icon = '❓', title = '', desc = '', descColor = COLORS.textDim
  switch (evt.type) {
    case 'treasure': icon = '📦'; title = '宝箱'; desc = '获得' + evt.gold + '金币'; descColor = '#f0c040'; break
    case 'coins': icon = '🪙'; title = '散落金币'; desc = '捡到' + evt.gold + '金币'; descColor = '#f0c040'; break
    case 'spring': icon = '💧'; title = '生命泉水'; desc = '恢复' + evt.heal + '生命'; descColor = '#2ecc71'; break
    case 'trap':
      icon = '⚠️'; title = trapResult && trapResult.dodged ? '闪避成功' : '触发陷阱'
      desc = trapResult && trapResult.dodged ? '毫发无伤' : '受到' + (trapResult ? trapResult.damage : 0) + '伤害'
      descColor = trapResult && trapResult.dodged ? '#2ecc71' : '#e74c3c'
      break
    case 'buffStone': icon = '🗿'; title = '增益石碑'; desc = '攻击+' + evt.attackBonus; descColor = '#f0c040'; break
    case 'oldGear': icon = '🦺'; title = '破旧装备'; desc = '防御+' + evt.defense; descColor = COLORS.blue; break
    case 'camp': icon = '🏕️'; title = '休息营地'; desc = '安全休息，生命回满'; descColor = '#2ecc71'; break
  }
  // 对齐原版: 图标36px + 标题16px金色粗体 + 描述12px彩色 + 好的按钮(红色80%)
  text(ctx, icon, cx, cy - 64, 36)
  text(ctx, title, cx, cy - 16, 16, COLORS.gold, 'center', true)
  text(ctx, desc, cx, cy + 10, 12, descColor)
  const side = activeSide || 'left'
  drawBtn(ctx, makeBtn(cx - w * 0.4, cy + 34, w * 0.8, 34, '好的', () => finishSide(side), ui.BTN.primary))
}

function drawMonsterCard(cx, cy, m, w) {
  const ctx = S.ctx
  // 对齐原版怪物卡
  text(ctx, m.icon, cx, cy - 78, 30)
  // 名字 + Lv(橙色小字)
  text(ctx, m.name, cx, cy - 36, 15, COLORS.gold, 'center', true)
  text(ctx, 'Lv.' + m.level, cx + ui.textWidth(ctx, m.name, 15) / 2 + 14, cy - 36, 12, '#ffaa00')
  // 描述
  text(ctx, m.desc || '', cx, cy - 12, 11, COLORS.textDim)
  // 属性
  text(ctx, '❤️' + m.hp + '  ⚔️' + m.attack + '  🛡️' + m.defense, cx, cy + 12, 12, COLORS.textDim)
  text(ctx, '⚡' + m.critPercent + '%暴  💨' + m.dodgePercent + '%闪', cx, cy + 30, 11, '#7a7a8a')
  // 战斗/逃跑按钮（并排）
  const bw = w * 0.36
  const side = activeSide || 'left'
  drawBtn(ctx, makeBtn(cx - bw - 4, cy + 52, bw, 32, '⚔️ 战斗', () => startBattle(side, false), ui.BTN.primary))
  drawBtn(ctx, makeBtn(cx + 4, cy + 52, bw, 32, '🏃 逃跑(' + Math.round(Math.min(0.9, 0.4 + S.player.fleeFails * 0.1) * 100) + '%)', () => fleeMonster(side), ui.BTN.secondary))
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

function drawMerchantCard(cx, cy, evt, side, w) {
  const ctx = S.ctx
  // 对齐原版商人卡
  text(ctx, evt.merchantIcon || '🧙', cx, cy - 96, 36)
  text(ctx, evt.merchantName || '神秘商人', cx, cy - 52, 16, COLORS.gold, 'center', true)
  text(ctx, '来自【' + (evt.themeName || '') + '】的游商', cx, cy - 30, 11, COLORS.textDim)

  // 商品列表（每项: 名称金色13px+desc灰10px / 💰价格+金色购买按钮）
  let yy = cy - 8
  for (let i = 0; i < evt.items.length; i++) {
    const it = evt.items[i]
    const iw = w * 0.9, ix = cx - iw / 2
    roundRect(ctx, ix, yy - 2, iw, 46, 6, '#1a1a2e', '#2a2a4a', 1)
    text(ctx, it.name, ix + 8, yy + 10, 13, COLORS.gold, 'left', true)
    text(ctx, it.desc || '', ix + 8, yy + 26, 10, COLORS.textDim, 'left')
    text(ctx, '💰 ' + it.price, ix + iw - 56, yy + 10, 13, '#f0c040', 'left', true)
    drawBtn(ctx, makeBtn(ix + iw - 60, yy + 20, 50, 20, '购买', () => buyMerchant(side, i), { ...ui.BTN.gold, size: 10 }))
    yy += 50
  }
  drawBtn(ctx, makeBtn(cx - w * 0.34, yy + 8, w * 0.68, 32, '离开', () => finishSide(side), ui.BTN.secondary))
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

function drawAltarCard(cx, cy, evt, side, w) {
  const ctx = S.ctx
  const p = S.player
  // 对齐原版祭坛卡
  text(ctx, '🔮', cx, cy - 84, 36)
  text(ctx, '遗物祭坛', cx, cy - 36, 16, COLORS.gold, 'center', true)
  text(ctx, '献祭' + evt.cost + '血（' + evt.altarCount + '/' + evt.maxCount + '次）', cx, cy - 12, 11, COLORS.textDim)
  const bw = w * 0.8
  const disabled = evt.altarCount >= evt.maxCount || p.hp <= evt.cost
  drawBtn(ctx, makeBtn(cx - bw / 2, cy + 4, bw, 30, '⚔️ +1攻击', () => altarOffer(side, 'attack', evt), disabled ? { ...ui.BTN.secondary, size: 12 } : { ...ui.BTN.primary, size: 12 }))
  drawBtn(ctx, makeBtn(cx - bw / 2, cy + 40, bw, 30, '🛡️ +1防御', () => altarOffer(side, 'defense', evt), disabled ? { ...ui.BTN.secondary, size: 12 } : { ...ui.BTN.primary, size: 12 }))
  drawBtn(ctx, makeBtn(cx - bw / 2, cy + 76, bw, 30, '离开', () => finishSide(side), ui.BTN.secondary))
}

function altarOffer(side, type, evt) {
  const p = S.player
  if (evt.altarCount >= evt.maxCount || p.hp <= evt.cost) {
    wx.showToast({ title: '无法献祭', icon: 'none' })
    return
  }
  p.hp -= evt.cost
  if (type === 'attack') p.baseAttack += 1
  else p.baseDefense = (p.baseDefense || 0) + 1
  evt.altarCount++
  S.savePlayer()
  wx.showToast({ title: '献祭成功！', icon: 'success' })
  if (evt.altarCount >= evt.maxCount) setTimeout(() => finishSide(side), 400)
}

// 状态栏高度: 固定167px(≈页面25%), 展开时显示全部, 收起时折叠按钮区
function footerH() {
  return footerExpanded ? 267 : 66
}

function drawFooter() {
  const ctx = S.ctx
  const p = S.player
  const fh = footerH()
  const y = S.LH - fh
  // 状态栏面板: 深蓝纯色, 大圆角顶部
  roundRect(ctx, 0, y, S.LW, fh, 20, '#16263a', 'rgba(255,255,255,0.06)', 1)

  // 顶部居中向下小三角
  text(ctx, footerExpanded ? '▾' : '▴', S.LW / 2, y + 16, 18, '#8a8a9a')

  // 第一行: 左侧角色头像 + 白色文字「名字·Lv.X」
  text(ctx, '🧝', 18, y + 44, 22)
  text(ctx, p.name + ' · Lv.' + p.level, 46, y + 44, 14, '#ffffff', 'left', true)

  // 第二行: 左侧红心+红色数值, 右侧红色进度条(底深灰)
  text(ctx, '❤️', 18, y + 70, 12)
  text(ctx, p.hp + '/' + p.totalMaxHp, 34, y + 70, 12, '#ff6b6b', 'left', true)
  // 红色进度条(右侧, 底色深灰)
  const barX = 96, barW = S.LW - 96 - 16
  roundRect(ctx, barX, y + 64, barW, 12, 6, '#2a2a3a')
  const ratio = Math.max(0, Math.min(1, p.hp / p.totalMaxHp))
  if (ratio > 0) roundRect(ctx, barX, y + 64, barW * ratio, 12, 6, '#e74c3c')

  if (footerExpanded) {
    // 属性两行(带图标+白色文字)
    text(ctx, '⚔️ 攻击', 18, y + 96, 12, '#ffffff', 'left')
    text(ctx, '' + p.totalAttack, 78, y + 96, 12, '#ffffff', 'left', true)
    text(ctx, '🛡️ 防御', 140, y + 96, 12, '#ffffff', 'left')
    text(ctx, '' + p.totalDefense, 200, y + 96, 12, '#ffffff', 'left', true)
    text(ctx, '⚡ 暴击', 18, y + 120, 12, '#ffffff', 'left')
    text(ctx, '' + Math.round(p.totalCrit * 100) + '%', 78, y + 120, 12, '#ffffff', 'left', true)
    text(ctx, '💨 闪避', 140, y + 120, 12, '#ffffff', 'left')
    text(ctx, '' + Math.round(p.totalDodge * 100) + '%', 200, y + 120, 12, '#ffffff', 'left', true)

    // 资源行: 金币金色 + 经验黄色
    text(ctx, '💰', 18, y + 144, 12)
    text(ctx, '' + p.gold, 34, y + 144, 12, '#f0c040', 'left', true)
    text(ctx, '⭐', 110, y + 144, 12)
    text(ctx, '' + p.exp + ' / ' + p.expToLevel(), 126, y + 144, 12, '#ffe080', 'left', true)

    // 2x2 功能按钮: 商店黄/背包红/铁匠橙/退出深灰蓝 (白色文字, 均等)
    const bw = S.LW * 0.42, bh = 32
    const bx1 = S.LW * 0.05, bx2 = S.LW * 0.53
    const by1 = y + 170, by2 = y + 220
    // 左上: 黄色商店
    drawBtn(ctx, makeBtn(bx1, by1, bw, bh, '🏪 商店', null, { ...ui.BTN.gold, size: 12 }))
    // 右上: 红色背包
    drawBtn(ctx, makeBtn(bx2, by1, bw, bh, '🎒 背包 (' + p.inventory.length + ')', null, { ...ui.BTN.primary, size: 12 }))
    // 左下: 橙色铁匠铺
    drawBtn(ctx, makeBtn(bx1, by2, bw, bh, '⚒️ 铁匠铺', null, { ...ui.BTN.forge, size: 12 }))
    // 右下: 深灰蓝退出
    drawBtn(ctx, makeBtn(bx2, by2, bw, bh, '🚪 退出', null, { ...ui.BTN.secondary, size: 12 }))
  }
}

// 供 game.js 调用: 重新生成事件(下楼后)
function regen() { generateEvents() }

module.exports = { init, draw, touch, buttons, regen, generateEvents, descend, startBattle, finishSide }
