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
// 点击门后动画: 选中侧放大1.05+金色发光, 未选中侧缩小0.92+半透明

// ---- 探索状态持久化(防退出重进刷门/逃课) ----
const EXPLORE_KEY = 'explore_state'
function saveExploreState() {
  const p = S ? S.player : null
  if (!p) return
  try {
    wx.setStorageSync(EXPLORE_KEY, {
      floor: p.floor,
      leftEvent, rightEvent,
      leftState, rightState,
      trapResult,
      footerExpanded
    })
  } catch (e) {}
}
function restoreExploreState() {
  const p = S ? S.player : null
  if (!p) return false
  try {
    const st = wx.getStorageSync(EXPLORE_KEY)
    // 层数匹配且有事件才恢复(楼梯/Boss场景另一侧可为null)
    if (st && st.floor === p.floor && (st.leftEvent || st.rightEvent)) {
      leftEvent = st.leftEvent || null
      rightEvent = st.rightEvent || null
      leftState = st.leftState || 'door'
      rightState = st.rightState || 'door'
      trapResult = st.trapResult || null
      if (typeof st.footerExpanded === 'boolean') footerExpanded = st.footerExpanded
      activeSide = leftState !== 'door' ? 'left' : (rightState !== 'door' ? 'right' : null)
      cardAnim = { phase: 'idle', start: 0, side: null, dur: 400 }
      return true
    }
  } catch (e) {}
  return false
}
function clearExploreState() {
  try { wx.removeStorageSync(EXPLORE_KEY) } catch (e) {}
}

function init(shared) {
  S = shared
  enterTime = Date.now()
  if (!skipRegen) {
    // 优先恢复现场(防逃课), 无存档才重新随机
    if (!restoreExploreState()) {
      generateEvents()
      saveExploreState()
    }
  } else {
    skipRegen = false
    saveExploreState()
  }
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
    case 'treasure': return { type, gold: Math.floor((15 + floor * 8 + Math.random() * floor * 15) * 0.6) }  // 宝箱金币-40%
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
  saveExploreState()
}

function buttons() { return [] }

function touch(x, y) {
  const fh = footerH()
  const fy = S.LH - fh
  // 状态栏折叠箭头（顶部居中箭头区域, 带平滑动画）
  if (y > fy && y < fy + 22) {
    const curH = footerH()  // 切换前当前高度(动画中为插值)
    footerExpanded = !footerExpanded
    footerAnim = {
      start: Date.now(), dur: 300,
      from: curH,
      to: footerExpanded ? FOOTER_H_EXPAND : FOOTER_H_COLLAPSE
    }
    return
  }
  // 面板按钮（仅展开时, y+122 和 y+152 两行）
  if (footerExpanded) {
    const bw = S.LW * 0.42, bh = 40
    const bx1 = S.LW * 0.05, bx2 = S.LW * 0.53
    // 第一行: 商店 / 背包
    const by1 = fy + 176
    if (y > by1 && y < by1 + bh) {
      if (x > bx1 && x < bx1 + bw) openPanel('shop')
      else if (x > bx2 && x < bx2 + bw) openPanel('inventory')
      return
    }
    // 第二行: 铁匠铺 / 退出
    const by2 = fy + 226
    if (y > by2 && y < by2 + bh) {
      if (x > bx1 && x < bx1 + bw) openPanel('forge')
      else if (x > bx2 && x < bx2 + bw) exitExplore()
      return
    }
  }

  // 卡片区：根据状态分发（商人/祭坛内容超出卡片, 命中区向下扩展）
  const cardTop = 214 + 15
  const cardH = S.LH - FOOTER_H_EXPAND - 15 - cardTop
  const isLeft = x < S.LW / 2
  const side = isLeft ? 'left' : 'right'
  const state = side === 'left' ? leftState : rightState
  const evt = side === 'left' ? leftEvent : rightEvent
  const w = cardW()
  // 与绘制一致: 锚定外侧 + 内容缩放动画值(选中放大/未选中缩小)
  let cwX = w, dxT = 0, sy = 1, sx = 1
  if (cardAnim.phase === 'expand') {
    const t = Math.min(1, (Date.now() - cardAnim.start) / cardAnim.dur)
    const e = ui.easeOut(t)
    const activeEvt2 = cardAnim.side === 'left' ? leftEvent : rightEvent
    const at2 = activeEvt2 ? activeEvt2.type : ''
    const bigH2 = at2 === 'merchant' ? 0.14 : at2 === 'monster' ? 0.10 : 0.05
    const bigW2 = at2 === 'merchant' ? 0.20 : at2 === 'monster' ? 0.16 : 0
    const shrW2 = at2 === 'merchant' ? 0.24 : at2 === 'monster' ? 0.14 : 0
    if (cardAnim.side === side) {
      sy = 1 + bigH2 * e; sx = 1 + bigW2 * e
      if (at2 === 'merchant') sy = 1  // 商人内容不缩放(布局已加大)
    }
    else {
      // 未选中侧: 内容与卡片宽度同步(scale*scaleX), 等比不变形
      sy = (1 - 0.08 * e) * (1 - shrW2 * e)
      sx = (1 - 0.08 * e) * (1 - shrW2 * e)
    }
    cwX = w * sx
  } else if (cardAnim.phase === 'flyout' && cardAnim.side === side) {
    const t = Math.min(1, (Date.now() - cardAnim.start) / 450)
    dxT = 90 * ui.easeOut(t)
  }
  const cx = (isLeft ? leftX() + cwX / 2 : rightX() + w - cwX / 2) + dxT
  const cy = cardTop + cardH / 2
  // 内容缩放反变换(与绘制一致): 屏幕坐标 -> 未缩放坐标
  const xx = sy === 1 ? x : (x - cx) / sy + cx
  const yy = sy === 1 ? y : (y - cy) / sy + cy
  let hitBottom = cardTop + cardH
  if (state === 'merchant') hitBottom = cy + 235
  else if (state === 'altar') hitBottom = cy + 108
  else if (state === 'monster') hitBottom = cy + 86
  if (y > cardTop && y < hitBottom) {

    if (state === 'door') {
      // 另一侧事件进行中(怪物/商人/祭坛/结果)时, 本侧门不可点
      const otherState = side === 'left' ? rightState : leftState
      const busyOther = otherState === 'monster' || otherState === 'merchant' || otherState === 'altar' || otherState === 'result'
      if (evt && evt.type === 'stairs') {
        if (yy > cy + 38 && yy < cy + 76) {
          if (busyOther) { wx.showToast({ title: '请先完成当前事件', icon: 'none' }); return }
          descend()
        }
      } else if (evt && evt.type === 'boss') {
        if (yy > cy + 38 && yy < cy + 76) {
          if (busyOther) { wx.showToast({ title: '请先完成当前事件', icon: 'none' }); return }
          startBattle(side, true)
        }
      } else {
        if (yy > cy + 32 && yy < cy + 76) {
          if (busyOther) { wx.showToast({ title: '请先完成当前事件', icon: 'none' }); return }
          pickSide(side)
        }
      }
    } else if (state === 'monster') {
      // 战斗/逃跑按钮(上下排, 放大后同步)
      const mbw = w * 0.8
      if (yy > cy + 16 && yy < cy + 46) {
        if (xx > cx - mbw / 2 && xx < cx + mbw / 2) startBattle(side, false)
      } else if (yy > cy + 56 && yy < cy + 86) {
        if (xx > cx - mbw / 2 && xx < cx + mbw / 2) fleeMonster(side)
      }
    } else if (state === 'result') {
      // 好的按钮(红色80%, cy+34)
      if (yy > cy + 34 && yy < cy + 68) finishSide(side)
    } else if (state === 'deadend') {
      // 返回按钮(cy+42)
      if (yy > cy + 42 && yy < cy + 76) blockSide(side)
    } else if (state === 'merchant') {
      // 商品行(58px高, 购买按钮下行) + 离开按钮
      let yy2 = cy - 69
      for (let i = 0; i < evt.items.length; i++) {
        if (yy > yy2 - 2 && yy < yy2 + 56) {
          const iw = w * 0.96, ix = cx - iw / 2
          if (xx > ix + iw - 66 && xx < ix + iw - 10 && yy > yy2 + 42 && yy < yy2 + 66) { buyMerchant(side, i); return }
        }
        yy2 += 68
      }
      if (yy > yy2 + 6 && yy < yy2 + 42) finishSide(side)
    } else if (state === 'altar') {
      const bw = w * 0.8
      if (yy > cy + 4 && yy < cy + 34) altarOffer(side, 'attack', evt)
      else if (yy > cy + 40 && yy < cy + 70) altarOffer(side, 'defense', evt)
      else if (yy > cy + 76 && yy < cy + 106) finishSide(side)
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
      setState(side, evt.type)
      break
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
  saveExploreState()
}

// 封锁死路一侧（该侧不可再点击; 死路永久封锁）
function blockSide(side) {
  setState(side, 'blocked')
  activeSide = null
  S.savePlayer()
  // 两侧都封锁时强制重开(防卡死, 死路惩罚=白走+房间数)
  const otherState = side === 'left' ? rightState : leftState
  if (otherState === 'blocked') {
    generateEvents()
    saveExploreState()
    return
  }
  saveExploreState()
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

  // 死路永久封锁: 另一侧保持原样, 完成侧原地生成新事件
  if (side === 'left') {
    leftEvent = genEvent()
    leftState = 'door'
    let guard = 0
    while (rightEvent && leftEvent.type === rightEvent.type && guard++ < 10) leftEvent = genEvent()
  } else {
    rightEvent = genEvent()
    rightState = 'door'
    let guard = 0
    while (leftEvent && rightEvent.type === leftEvent.type && guard++ < 10) rightEvent = genEvent()
  }
  saveExploreState()
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
  // 背景: 分割线以上用卡片渐变, 以下用mini-rpg背景色(#0f0f1a)
  ctx.fillStyle = '#0f0f1a'
  ctx.fillRect(0, 0, S.LW, S.LH)
  roundRect(ctx, 0, 0, S.LW, 90, 0, ui.cardFill(ctx, 0, 0, S.LW, 90))

  // ============ 顶部区域(≈25%: 0~167) ============
  // 左上角白色返回箭头
  text(ctx, '←', 26, 72, 22, '#ffffff', 'center', true)
  // 顶部居中白色标题「探索地牢」(下移)
  text(ctx, '探索地牢', S.LW / 2, 72, 20, '#ffffff', 'center', true)
  // 分割线(白色1px, 画满全宽)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, 90)
  ctx.lineTo(S.LW, 90)
  ctx.stroke()

  // 楼层信息卡(稍浅于背景的深蓝, 大圆角, 宽松内边距, 内容居中)
  const theme = Data.getThemeForFloor(p.floor)
  const infoY = 118, infoH = 96
  roundRect(ctx, 16, infoY, S.LW - 32, infoH, 20, ui.cardFill(ctx, 16, infoY, S.LW - 32, infoH), 'rgba(255,255,255,0.06)', 1)
  // 第一行(整体居中): 🏰紧贴字 + 金色「地牢第X层」 + 主题图案紧贴名称
  const seg1 = '🏰 地牢第 ' + p.floor + ' 层'
  const seg2 = theme.icon + ' ' + theme.name
  const w1 = ui.textWidth(ctx, seg1, 18)
  const w2 = ui.textWidth(ctx, seg2, 14)
  const lineW = w1 + 16 + w2
  let lx = (S.LW - lineW) / 2
  text(ctx, seg1, lx + w1 / 2, infoY + 28, 18, '#e0c080', 'center', true)
  text(ctx, seg2, lx + w1 + 16 + w2 / 2, infoY + 28, 14, '#ffffff', 'center', true)
  // 第二行(居中): 浅灰描述
  text(ctx, theme.desc || '', S.LW / 2, infoY + 56, 13, '#8a8a9a', 'center')
  // 第三行(居中): 浅灰进度
  text(ctx, '已探索 ' + p.roomsExplored + ' / ' + roomsPerFloor + ' 个房间', S.LW / 2, infoY + 78, 11, '#8a8a9a', 'center')

  // ============ 中间探索区(≈50%: 167~500) ============
  const cardTop = 214 + 15
  const cardH = S.LH - FOOTER_H_EXPAND - 15 - cardTop
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
  if (cardAnim.phase === 'expand') {
    const t = Math.min(1, (now - cardAnim.start) / cardAnim.dur)
    const e = ui.easeOut(t)
    // 以选中侧事件类型决定缩放(怪物放大更大, 宽>高)
    const activeEvt = cardAnim.side === 'left' ? leftEvent : rightEvent
    const at = activeEvt ? activeEvt.type : ''
    // 放大分级: 商人最大(高1.14/宽1.20), 怪物(高1.10/宽1.16), 其他等比1.05
    const bigH = at === 'merchant' ? 0.14 : at === 'monster' ? 0.10 : 0.05
    const bigW = at === 'merchant' ? 0.20 : at === 'monster' ? 0.16 : 0
    const shrW = at === 'merchant' ? 0.24 : at === 'monster' ? 0.14 : 0
    if (cardAnim.side === side) {
      // 选中侧: 按事件类型放大(宽>高)
      scale = 1 + bigH * e
      scaleX = 1 + bigW * e
    } else {
      // 未选中侧: 缩小 + 半透明(宽度同步收缩)
      scale = 1 - 0.08 * e
      scaleX = 1 - shrW * e
      alpha = 1 - 0.4 * e
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
  // 横向锚定外侧边缘: 左卡锚左缘/右卡锚右缘 → 变的是中间空隙, 两边到屏幕距离不变
  const cx = (side === 'left' ? x + cw / 2 : x + w - cw / 2) + dx
  const cy = y + h / 2 + (slideIn || 0) + dy
  ctx.globalAlpha = alpha

  // 旋转支持(扑克牌飞出)
  if (rot !== 0) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(rot * Math.PI / 180)
    ctx.translate(-cx, -cy)
  }

  // 卡片渐变背景(对齐原版 .card; 选中侧金色发光)
  const isActive = cardAnim.side === side && cardAnim.phase !== 'flyout'
  if (isActive) { ctx.save(); ctx.shadowColor = 'rgba(240,192,64,0.75)'; ctx.shadowBlur = 16 }
  roundRect(ctx, cx - cw / 2, cy - ch / 2, cw, ch, 12, ui.cardFill(ctx, cx - cw / 2, cy - ch / 2, cw, ch), isActive ? COLORS.goldBright : COLORS.cardBorder, isActive ? 2 : 1.5)
  if (isActive) ctx.restore()

  // 内容随卡片缩放: 选中侧按高度(scale), 未选中侧跟随卡片宽度(scale*scaleX)同步缩小
  const zoomContent = cardAnim.phase === 'expand' && !(cardAnim.side === side && ((cardAnim.side === 'left' ? leftEvent : rightEvent) || {}).type === 'merchant')
  const zoomVal = cardAnim.side === side ? scale : scale * scaleX
  if (zoomContent) { ctx.save(); ctx.translate(cx, cy); ctx.scale(zoomVal, zoomVal); ctx.translate(-cx, -cy) }

  if (state === 'door') {
    if (evt && evt.type === 'stairs') {
      // 楼梯卡: 🪜 + 发现楼梯！(金色粗体) + 金色按钮
      text(ctx, '🪜', cx, cy - 55, 44)
      text(ctx, '发现楼梯！', cx, cy - 6, 16, '#f0c040', 'center', true)
      drawBtn(ctx, makeBtn(cx - w * 0.34, cy + 38, w * 0.68, 38, '⬇️ 下到 ' + (p.floor + 1) + ' 层', () => descend(), { ...ui.BTN.gold, r: 19 }))
    } else if (evt && evt.type === 'boss') {
      // Boss卡: 👑 + ⚠️ Boss拦路！(红粗) + 描述 + 红色按钮
      text(ctx, '👑', cx, cy - 55, 44)
      text(ctx, '⚠️ Boss 拦路！', cx, cy - 8, 16, '#ff5555', 'center', true)
      text(ctx, '击败它才能继续前进', cx, cy + 16, 11, COLORS.textDim)
      drawBtn(ctx, makeBtn(cx - w * 0.34, cy + 38, w * 0.68, 38, '⚔️ 挑战 Boss', () => startBattle(side, true), { ...ui.BTN.danger, r: 19 }))
    } else {
      // 普通门: 浅棕色木门图标(大) + 红色大圆角前进按钮
      text(ctx, '🚪', cx, cy - 48, 52)
      drawBtn(ctx, makeBtn(cx - w * 0.42, cy + 32, w * 0.84, 44, '前进探索', () => pickSide(side), { ...ui.BTN.primary, size: 15 }))
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

  // 恢复内容缩放
  if (zoomContent) ctx.restore()
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
  text(ctx, icon, cx, cy - 58, 36)
  text(ctx, title, cx, cy - 16, 16, COLORS.gold, 'center', true)
  text(ctx, desc, cx, cy + 10, 12, descColor)
  const side = activeSide || 'left'
  drawBtn(ctx, makeBtn(cx - w * 0.4, cy + 34, w * 0.8, 34, '好的', () => finishSide(side), ui.BTN.primary))
}

function drawMonsterCard(cx, cy, m, w) {
  const ctx = S.ctx
  // 居中布局(大一点但不满): 图标44/名字20/属性14, 按钮0.8w
  text(ctx, m.icon, cx, cy - 62, 44)
  // 名字 + Lv(橙色小字)
  text(ctx, m.name, cx, cy - 32, 20, COLORS.gold, 'center', true)
  text(ctx, 'Lv.' + m.level, cx + ui.textWidth(ctx, m.name, 20) / 2 + 18, cy - 32, 14, '#ffaa00')
  // 属性(暴击/闪避在战斗界面显示)
  text(ctx, '❤️' + m.hp + '  ⚔️' + m.attack + '  🛡️' + m.defense, cx, cy - 4, 14, COLORS.textDim)
  // 战斗/逃跑按钮（上下排, 间距4px, 宽0.8w）
  const bw = w * 0.8
  const side = activeSide || 'left'
  drawBtn(ctx, makeBtn(cx - bw / 2, cy + 16, bw, 30, '⚔️ 战斗', () => startBattle(side, false), ui.BTN.primary))
  drawBtn(ctx, makeBtn(cx - bw / 2, cy + 56, bw, 30, '🏃 逃跑(' + Math.round(Math.min(0.9, 0.4 + S.player.fleeFails * 0.1) * 100) + '%)', () => fleeMonster(side), ui.BTN.secondary))
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
  // 商人卡(特例: 内容加大, 卡片高度增加, 状态栏自动收起; 内容上移63居中)
  text(ctx, evt.merchantIcon || '🧙', cx, cy - 127, 40)
  text(ctx, evt.merchantName || '神秘商人', cx, cy - 97, 18, COLORS.gold, 'center', true)
  text(ctx, '来自【' + (evt.themeName || '') + '】的游商', cx, cy - 75, 12, COLORS.textDim)

  // 商品列表（两行: 名称+描述上行, 💰价格+购买按钮下行, 对齐原版不重叠）
  let yy = cy - 69
  for (let i = 0; i < evt.items.length; i++) {
    const it = evt.items[i]
    const iw = w * 0.96, ix = cx - iw / 2
    roundRect(ctx, ix, yy - 2, iw, 58, 6, '#1a1a2e', '#2a2a4a', 1)
    text(ctx, it.name, ix + 8, yy + 14, 15, COLORS.gold, 'left', true)
    text(ctx, it.desc || '', ix + 8, yy + 34, 11, COLORS.textDim, 'left')
    drawBtn(ctx, makeBtn(ix + iw - 66, yy + 42, 56, 24, '购买', () => buyMerchant(side, i), { ...ui.BTN.gold, size: 11 }))
    text(ctx, '💰 ' + it.price, ix + iw - 74, yy + 52, 15, '#f0c040', 'right', true)
    yy += 68
  }
  drawBtn(ctx, makeBtn(cx - w * 0.36, yy + 6, w * 0.72, 36, '离开', () => finishSide(side), ui.BTN.secondary))
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
  text(ctx, '🔮', cx, cy - 58, 36)
  text(ctx, '遗物祭坛', cx, cy - 34, 16, COLORS.gold, 'center', true)
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
  saveExploreState()
  wx.showToast({ title: '献祭成功！', icon: 'success' })
  if (evt.altarCount >= evt.maxCount) setTimeout(() => finishSide(side), 400)
}

// 状态栏高度常量: 展开279px(全部), 收起160px(血条+名称+属性, 不显示按钮)
const FOOTER_H_EXPAND = 279
const FOOTER_H_COLLAPSE = 160
let footerAnim = null  // 状态栏折叠动画 { start, dur, from, to }
function footerH() {
  if (footerAnim) {
    const t = Math.min(1, (Date.now() - footerAnim.start) / footerAnim.dur)
    const e = ui.easeOut(t)
    const h = footerAnim.from + (footerAnim.to - footerAnim.from) * e
    if (t >= 1) footerAnim = null
    return h
  }
  return footerExpanded ? FOOTER_H_EXPAND : FOOTER_H_COLLAPSE
}

function drawFooter() {
  const ctx = S.ctx
  const p = S.player
  const fh = footerH()
  const y = S.LH - fh
  // 状态栏面板: 深蓝纯色, 大圆角顶部
  roundRect(ctx, 0, y, S.LW, fh, 20, ui.cardFill(ctx, 0, y, S.LW, fh), 'rgba(255,255,255,0.06)', 1)

  // 顶部居中向下小三角
  text(ctx, footerExpanded ? '▾' : '▴', S.LW / 2, y + 16, 18, '#8a8a9a')

  // 第一行: 左侧角色头像 + 白色文字「名字·Lv.X」(图案x18与血条金币对齐)
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

  // 属性两行(始终显示): 图案x18/数值x34 与血条金币对齐
  text(ctx, '⚔️', 18, y + 96, 12)
  text(ctx, '' + p.totalAttack, 34, y + 96, 12, '#ffffff', 'left', true)
  text(ctx, '攻', 56, y + 96, 10, '#8a8a9a', 'left')
  text(ctx, '🛡️', 120, y + 96, 12)
  text(ctx, '' + p.totalDefense, 136, y + 96, 12, '#ffffff', 'left', true)
  text(ctx, '防', 158, y + 96, 10, '#8a8a9a', 'left')
  text(ctx, '⚡', 18, y + 120, 12)
  text(ctx, '' + Math.round(p.totalCrit * 100) + '%', 34, y + 120, 12, '#ffffff', 'left', true)
  text(ctx, '暴', 66, y + 120, 10, '#8a8a9a', 'left')
  text(ctx, '💨', 120, y + 120, 12)
  text(ctx, '' + Math.round(p.totalDodge * 100) + '%', 136, y + 120, 12, '#ffffff', 'left', true)
  text(ctx, '闪', 158, y + 120, 10, '#8a8a9a', 'left')

  // 资源行: 金币金色 + 经验黄色 (始终显示)
  text(ctx, '💰', 18, y + 144, 12)
  text(ctx, '' + p.gold, 34, y + 144, 12, '#f0c040', 'left', true)
  text(ctx, '⭐', 110, y + 144, 12)
  text(ctx, '' + p.exp + ' / ' + p.expToLevel(), 126, y + 144, 12, '#ffe080', 'left', true)

  // 2x2 功能按钮: 仅展开时显示 (商店黄/背包红/铁匠橙/退出深灰蓝, 文字放大15px)
  if (footerExpanded) {
    const bw = S.LW * 0.42, bh = 40
    const bx1 = S.LW * 0.05, bx2 = S.LW * 0.53
    const by1 = y + 176, by2 = y + 226
    // 左上: 黄色商店
    drawBtn(ctx, makeBtn(bx1, by1, bw, bh, '🏪 商店', null, { ...ui.BTN.gold, size: 15 }))
    // 右上: 红色背包
    drawBtn(ctx, makeBtn(bx2, by1, bw, bh, '🎒 背包 (' + p.inventory.length + ')', null, { ...ui.BTN.primary, size: 15 }))
    // 左下: 橙色铁匠铺
    drawBtn(ctx, makeBtn(bx1, by2, bw, bh, '⚒️ 铁匠铺', null, { ...ui.BTN.forge, size: 15 }))
    // 右下: 深灰蓝退出
    drawBtn(ctx, makeBtn(bx2, by2, bw, bh, '🚪 退出', null, { ...ui.BTN.secondary, size: 15 }))
  }
}

// 供 game.js 调用: 重新生成事件(下楼后)
function regen() { generateEvents() }

module.exports = { init, draw, touch, buttons, regen, generateEvents, descend, startBattle, finishSide }
