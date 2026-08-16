/**
 * 探索场景: 双门抉择 + 事件 + 底部状态栏(可折叠) + 面板入口
 */
const ui = require('./ui')
const { COLORS, roundRect, text, hpBar, makeBtn, drawBtn, hitBtn } = ui
const GE = require('../utils/game-engine')
const Data = require('../utils/data')
const audio = require('./audio')

let S = null // 共享状态

let leftEvent = null, rightEvent = null
let leftState = 'door', rightState = 'door'
let activeSide = null
let footerExpanded = true
let trapResult = null
let springResult = null  // 神秘池子结果(2026-08-15): { drank:true, ok, amount } 显示结果卡用
let campResult = null    // 营地休息结果(2026-08-15): { ambush:true(遇怪先显示遭遇怪物再战斗) } | { ambush:false(安全回满) }
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
      springResult,
      campResult,
      footerExpanded,
      gate: gate ? { toFloor: gate.toFloor } : null
    })
  } catch (e) {}
}
function restoreExploreState() {
  const p = S ? S.player : null
  if (!p) return false
  try {
    const st = wx.getStorageSync(EXPLORE_KEY)
    // 层数匹配且有事件或大门才恢复(楼梯/Boss场景另一侧可为null)
    if (st && st.floor === p.floor && (st.leftEvent || st.rightEvent || st.gate)) {
      // 大门状态: 恢复后仍显示大门(点推开进目标主题)
      if (st.gate) {
        gate = { toFloor: st.gate.toFloor || 1 }
        leftEvent = null; rightEvent = null
        leftState = 'door'; rightState = 'door'
        activeSide = null
        cardAnim = { phase: 'idle', start: 0, side: null, dur: 400 }
        return true
      }
      gate = null
      leftEvent = st.leftEvent || null
      rightEvent = st.rightEvent || null
      leftState = st.leftState || 'door'
      rightState = st.rightState || 'door'
      trapResult = st.trapResult || null
      springResult = st.springResult || null
      campResult = st.campResult || null
      if (typeof st.footerExpanded === 'boolean') footerExpanded = st.footerExpanded
      activeSide = leftState !== 'door' ? 'left' : (rightState !== 'door' ? 'right' : null)
      // ⚠️ 切场景回来(背包/商店等)保持展开放大效果: activeSide 有展开事件时, cardAnim 设为 expand 终态
      // (start 设为过去, t>=1 → scale/scaleX 直接是放大终值), 而不是重置 idle 缩回原样
      if (activeSide) cardAnim = { phase: 'expand', start: Date.now() - 500, side: activeSide, dur: 350 }
      else cardAnim = { phase: 'idle', start: 0, side: null, dur: 400 }
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
    // 优先恢复现场(防逃课), 无存档才显示大门(点推开进第一主题)
    if (!restoreExploreState()) {
      gate = { toFloor: 1 }  // 进入地牢大门
      leftEvent = null; rightEvent = null
      leftState = 'door'; rightState = 'door'
      activeSide = null
      cardAnim = { phase: 'idle', start: 0, side: null, dur: 400 }
      saveExploreState()  // 持久化大门状态(退出重进保持大门)
    }
  } else {
    skipRegen = false
    saveExploreState()
  }
}

let skipRegen = false
// 大门状态: 非null时探索页显示主题大门大卡片(无信息卡/事件卡), 点"推开"进入下一主题
// { toFloor: 目标层数 } — 进入地牢=1, Boss打完=当前层+1
let gate = null
// 推开动画: 非null时卡片缓慢淡出(石门推开), 动画结束才真正切层
// { start, dur } — dur 与 gateOpen 音效时长一致(~0.75s)
let gateAnim = null

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
    case 'spring':
      // 神秘池子(2026-08-15用户设计): 喝/不喝二选一, 喝按难度概率赌
      // 简单: 60%回复30% / 40%扣10%; 困难: 50%回复30% / 50%扣10%; 噩梦: 40%回复20% / 60%扣15%
      if (p.difficulty === 'nightmare') return { type, successRate: 0.4, healPercent: 0.2, damagePercent: 0.15 }
      if (p.difficulty === 'hard') return { type, successRate: 0.5, healPercent: 0.3, damagePercent: 0.1 }
      return { type, successRate: 0.6, healPercent: 0.3, damagePercent: 0.1 }
    case 'trap': return { type, damage: Math.max(1, Math.floor(p.hp * 0.15)), dodgeChance: 0.15 }
    case 'deadend': return { type }
    case 'buffStone': return { type, attackBonus: 2 }
    case 'oldGear': return { type, defense: 2, gold: Math.floor(5 + floor * 2) }
    case 'altar': {
      // 献祭扣血随主题递增: 主题1=30, 每往后一个主题+20(主题2=50/3=70/4=90/5=110)
      const themeNum = Math.ceil(floor / 5)  // 1-5层=主题1, 6-10=2, 11-15=3, 16-20=4, 21-25=5
      return { type, cost: 30 + 20 * (themeNum - 1), maxCount: 3, altarCount: 0 }
    }
    case 'camp':
      // 营地: 休息/离开二选一(2026-08-15用户要求); 休息按难度概率遇该主题怪(easy30/hard40/nightmare50)
      // ⚠️ 修复史: 曾误返回merchant导致营地从未出现(玩家反馈), 已修
      return { type: 'camp', dangerRate: p.difficulty === 'nightmare' ? 0.5 : p.difficulty === 'hard' ? 0.4 : 0.3 }
    case 'merchant': {
      // ⚠️ 补上(2026-08-15): camp误返回merchant期间商人靠bug出现, 营地修复后必须补真正的商人case
      const theme = Data.getThemeForFloor(floor)
      const goods = Data.themeMerchantGoods[theme.id]
      const items = goods ? goods.items.map(g => ({ ...g })) : []
      for (const it of items) it.price = Math.floor(it.price * (1 + (floor - 1) * 0.02))
      return { type: 'merchant', items, themeName: theme.name, merchantName: theme.merchantName || '神秘商人', merchantIcon: theme.merchantIcon || '🧙' }
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
  springResult = null
  campResult = null
  cardAnim = { phase: 'idle', start: 0, side: null, dur: 400 }
  roomsPerFloor = GE.getRoomsPerFloor(S.player.floor)
  saveExploreState()
}

function buttons() { return [] }

function touch(x, y) {
  // 大门状态: 推开按钮→进入下一主题; footer区域(退出/折叠/面板)仍放行; 卡片区忽略
  if (gate) {
    // ⚠️ 与 drawGate 同公式: 入场动画只淡入无位移, 按钮坐标固定(绘制=touch 一致)
    const gw = S.LW * 0.84, gy = 118
    const gh = S.LH - FOOTER_H_EXPAND - 15 - gy
    const gc = gy + gh / 2
    const bw = gw * 0.6, bh = 44
    const bx = (S.LW - bw) / 2
    const by = gc + 76
    if (x > bx && x < bx + bw && y > by && y < by + bh) {
      openGate()
      return
    }
    // 非footer区域(卡片区/顶部)在大门状态下忽略
    if (y < S.LH - footerH()) return
    // footer 区域: 落到下方原有逻辑
  }
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
  } else if (cardAnim.phase === 'flyout') {
    const t = Math.min(1, (Date.now() - cardAnim.start) / 450)
    const e = ui.easeOut(t)
    if (cardAnim.side === side) {
      dxT = 90 * e  // 完成侧: 向右飞
    } else {
      // 未选中侧: 恢复动画与绘制一致(缩小->原状)
      const activeEvt2 = cardAnim.side === 'left' ? leftEvent : rightEvent
      const at2 = activeEvt2 ? activeEvt2.type : ''
      const shrW2 = at2 === 'merchant' ? 0.24 : at2 === 'monster' ? 0.14 : 0
      sy = (1 - 0.08 * (1 - e)) * (1 - shrW2 * (1 - e))
      sx = sy
      cwX = w * sx
    }
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
  else if (state === 'camp') hitBottom = cy + 106  // 营地: 离开按钮底(两行描述+按钮下移)
  else if (state === 'spring') hitBottom = cy + 106  // 神秘池子: 不喝按钮底(同营地布局)
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
      // 好的/应战按钮(红色80%, cy+34): 营地遇怪时"应战"→startBattle, 其他→finishSide
      if (yy > cy + 34 && yy < cy + 68) {
        if (evt && evt.type === 'camp' && campResult && campResult.ambush) startBattle(side, false)
        else finishSide(side)
      }
    } else if (state === 'camp') {
      // 营地: 休息(cy+38~68) / 离开(cy+76~106), 与 drawCampCard 同公式
      const mbw = w * 0.8
      if (yy > cy + 38 && yy < cy + 68) {
        if (xx > cx - mbw / 2 && xx < cx + mbw / 2) campRest(side, evt)
      } else if (yy > cy + 76 && yy < cy + 106) {
        if (xx > cx - mbw / 2 && xx < cx + mbw / 2) finishSide(side)
      }
    } else if (state === 'spring') {
      // 神秘池子: 喝一口(cy+38~68) / 不喝(cy+76~106), 与 drawSpringCard 同公式
      const mbw = w * 0.8
      if (yy > cy + 38 && yy < cy + 68) {
        if (xx > cx - mbw / 2 && xx < cx + mbw / 2) drinkSpring(side, evt)
      } else if (yy > cy + 76 && yy < cy + 106) {
        if (xx > cx - mbw / 2 && xx < cx + mbw / 2) finishSide(side)
      }
    } else if (state === 'deadend') {
      // 返回按钮(cy+42)
      if (yy > cy + 42 && yy < cy + 76) blockSide(side)
    } else if (state === 'merchant') {
      // 商品行(56px高: 名称+价格上行, 描述+购买按钮下行) + 离开按钮
      // ⚠️ 命中区与绘制同步(商品卡=整卡宽 iw=w, 按钮 yy+30~54, 行距60)
      let yy2 = cy - 69
      for (let i = 0; i < evt.items.length; i++) {
        if (yy > yy2 - 2 && yy < yy2 + 54) {
          const iw = w, ix = cx - iw / 2
          if (xx > ix + iw - 66 && xx < ix + iw - 10 && yy > yy2 + 30 && yy < yy2 + 54) { buyMerchant(side, i); return }
        }
        yy2 += 60
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
  audio.play('click')  // 点门音效
  // 启动展开动画(选中放大/另一侧缩小)
  cardAnim = { phase: 'expand', start: Date.now(), side: side, dur: 350 }
  const p = S.player

  switch (evt.type) {
    case 'treasure':
      p.gold += evt.gold; setState(side, 'result'); S.savePlayer(); break
    case 'coins':
      p.gold += evt.gold; setState(side, 'result'); S.savePlayer(); break
    case 'spring':
      // 神秘池子: 显示喝/不喝选项卡(2026-08-15用户设计, 不再直接回血)
      setState(side, 'spring')
      break
    case 'trap': {
      const dodged = Math.random() < evt.dodgeChance
      let dmg = 0
      if (!dodged) { dmg = evt.damage; p.hp = Math.max(0, p.hp - dmg) }
      trapResult = { dodged, damage: dmg }
      setState(side, 'result')
      // 先查死亡再存档: 陷阱致死不能把0血存档留下(否则继续游戏0血)
      if (p.isDead()) {
        clearExploreState()
        try { wx.removeStorageSync('dungeon_save') } catch (e) {}
        S.switchScene('menu')
        return
      }
      S.savePlayer()
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
      // 营地: 显示休息/离开选项卡(2026-08-15用户要求, 不再直接回满血)
      setState(side, 'camp')
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

  // 死路封锁只持续到下一回合: 另一侧完成时, 封锁侧同步恢复为新事件(不再是永久封锁)
  const otherSide = side === 'left' ? 'right' : 'left'
  const otherState = side === 'left' ? rightState : leftState
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
  // 下回合恢复: 被封锁的死路侧重新生成为新事件
  if (otherState === 'blocked') {
    if (otherSide === 'left') {
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

// 推开大门(动画版): 点击后播放石门推开动画+音效, 动画结束才真正进入下一主题
// ⚠️ 用户要求"原地消失": 卡片只淡出不位移; "消失速度过快"→ dur 1200ms 缓慢
function openGate() {
  if (gateAnim) return  // 动画播放中防重复触发
  gateAnim = { start: Date.now(), dur: 1200 }
  audio.play('gateOpen')  // 石门缓慢推开音效
  setTimeout(() => {
    gateAnim = null
    const p = S.player
    if (gate.toFloor > p.floor) {
      descend()
    } else {
      generateEvents()
    }
    gate = null
    // ⚠️ 刷新入场时间: 推开大门后信息卡/事件卡逐渐浮现(事件卡滑入动画基于 enterTime)
    enterTime = Date.now()
  }, 1210)
}

function startBattle(side, isBoss) {
  const evt = side === 'left' ? leftEvent : rightEvent
  const m = isBoss ? GE.getBossForFloor(S.player.floor, S.player.difficulty) : evt.monster
  const battle = require('./battle')
  S.battleSide = side
  // ⚠️ 必须先 switchScene 再 battle.start: switchScene('battle') 会分发普通战斗BGM,
  // start 里 isBoss 再切Boss曲——顺序颠倒会导致两首战斗曲重叠(用户实测)
  S.switchScene('battle')
  battle.start(S, m, isBoss, () => {
    // 战斗结束回调: 返回探索场景并保留双门状态
    skipRegen = true
    if (S.bossDefeated) {
      // Boss 击败 → 通往下一主题的大门(不再是楼梯)
      gate = { toFloor: S.player.floor + 1 }
      leftEvent = null; rightEvent = null
      leftState = 'door'; rightState = 'door'
      S.bossDefeated = false
    } else {
      finishSide(side)
    }
    S.switchScene('explore')
  })
}

// ==================== 绘制 ====================
// ===== 离屏缓存: 背景+标题+分割线+楼层信息卡(静态头部) =====
let staticCanvas = null
let staticKey = ''
const STATIC_H = 229  // 静态区高(0 ~ 信息卡底214 + 15空隙)

function buildStatic(p) {
  try {
    if (!staticCanvas) staticCanvas = wx.createCanvas()
    // 离屏canvas必须按DPR建物理尺寸, 否则drawImage到主canvas(已scale DPR)会被拉伸发糊
    const dpr = S.DPR || 2
    staticCanvas.width = S.LW * dpr
    staticCanvas.height = STATIC_H * dpr
    const c = staticCanvas.getContext('2d')
    c.scale(dpr, dpr)
    // 背景
    c.fillStyle = '#0f0f1a'
    c.fillRect(0, 0, S.LW, STATIC_H)
    roundRect(c, 0, 0, S.LW, 90, 0, ui.cardFill(c, 0, 0, S.LW, 90))
    // 顶部: 返回箭头 + 标题
    text(c, '←', 26, 72, 22, '#ffffff', 'center', true)
    text(c, '探索地牢', S.LW / 2, 72, 20, '#ffffff', 'center', true)
    // 分割线(白色1px, 画满全宽)
    c.strokeStyle = '#ffffff'
    c.lineWidth = 1
    c.beginPath()
    c.moveTo(0, 90)
    c.lineTo(S.LW, 90)
    c.stroke()
    // ⚠️ 楼层信息卡不在 staticCanvas 里画了(2026-08-15): 拆到 draw() 动态绘制,
    // 推开大门后信息卡/事件卡需要逐渐浮现动画(用户"推开以后信息卡和事件卡也应该逐渐出来")
  } catch (e) {
    staticCanvas = null
  }
}

// 楼层信息卡(动态绘制: 推开大门后淡入浮现; 数据随 floor/roomsExplored 变化)
function drawInfoCard(ctx, p) {
  // 渐入: 推开大门后 700ms 淡入(enterTime 在 openGate 切层时刷新)
  const infoP = ui.animProgress(enterTime, 0, 700)
  const theme = Data.getThemeForFloor(p.floor)
  const infoY = 118, infoH = 96
  const prevAlpha = ctx.globalAlpha
  ctx.globalAlpha = prevAlpha * infoP
  roundRect(ctx, 16, infoY, S.LW - 32, infoH, 20, ui.cardFill(ctx, 16, infoY, S.LW - 32, infoH), 'rgba(255,255,255,0.06)', 1)
  const seg1 = '🏰 地牢第 ' + p.floor + ' 层'
  const seg2 = theme.icon + ' ' + theme.name
  const w1 = ui.textWidth(ctx, seg1, 18)
  const w2 = ui.textWidth(ctx, seg2, 14)
  const lineW = w1 + 16 + w2
  const lx = (S.LW - lineW) / 2
  text(ctx, seg1, lx + w1 / 2, infoY + 28, 18, '#e0c080', 'center', true)
  text(ctx, seg2, lx + w1 + 16 + w2 / 2, infoY + 28, 14, '#ffffff', 'center', true)
  text(ctx, theme.desc || '', S.LW / 2, infoY + 56, 13, '#8a8a9a', 'center')
  text(ctx, '已探索 ' + p.roomsExplored + ' / ' + roomsPerFloor + ' 个房间', S.LW / 2, infoY + 78, 11, '#8a8a9a', 'center')
  ctx.globalAlpha = prevAlpha
}

function draw() {
  const ctx = S.ctx
  const p = S.player
  // 大门状态: 显示主题大门大卡片(无信息卡/事件卡), 推开后进入下一主题
  if (gate) {
    drawGate()
    drawFooter()
    return
  }
  // 静态头部: 楼层/房间变化时重建, 平时drawImage合成(省每帧重绘)
  const key = p.floor + '|' + p.roomsExplored
  if (staticKey !== key) { staticKey = key; buildStatic(p) }
  // 事件卡区域(staticCanvas下方)补#0f0f1a背景, 与信息卡周围一致
  ctx.fillStyle = '#0f0f1a'
  ctx.fillRect(0, STATIC_H, S.LW, S.LH - STATIC_H)
  if (staticCanvas) ctx.drawImage(staticCanvas, 0, 0, S.LW, STATIC_H)
  // 楼层信息卡(动态绘制, 推开大门后淡入浮现)
  drawInfoCard(ctx, p)

  // ============ 中间探索区(≈50%: 167~500) ============
  const cardTop = 214 + 15
  const cardH = S.LH - FOOTER_H_EXPAND - 15 - cardTop
  const cardW = S.LW * 0.43
  const pL = ui.animProgress(enterTime, 100, 900)
  const pR = ui.animProgress(enterTime, 200, 900)
  drawCard(leftX(), cardTop, cardW, cardH, 'left', (1 - pL) * 36)
  drawCard(rightX(), cardTop, cardW, cardH, 'right', (1 - pR) * 36)

  // ============ 底部状态栏(≈25%: 500~667) ============
  drawFooter()
}

// ===== 主题大门(进入地牢/Boss打完的过渡大卡片) =====
// 布局: 背景铺满 + 顶部标题行(同探索页) + 居中大门大卡片(无信息卡/事件卡)
// 入场动画: 原地逐渐淡入(无位移无缩放, 用户要求); 推开动画: 原地逐渐淡出
function drawGate() {
  const ctx = S.ctx
  const p = S.player
  const targetTheme = Data.getThemeForFloor(gate.toFloor)
  const isEntry = gate.toFloor === 1  // 进入地牢大门 vs Boss后大门

  // 入场动画: 原地逐渐淡入(无位移无缩放, 用户"原地逐渐显示"要求)
  const enterP = ui.animProgress(enterTime, 0, 900)

  // 推开动画: 卡片原地缓慢淡出(无位移, 用户"原地消失"要求); prevAlpha 乘算叠加
  let fadeA = enterP  // 入场淡入 × 推开淡出 乘算
  if (gateAnim) {
    const t = Math.min(1, (Date.now() - gateAnim.start) / gateAnim.dur)
    fadeA = enterP * (1 - ui.easeOut(t))
  }

  // 背景: 探索页同款分区
  ctx.fillStyle = '#0f0f1a'
  ctx.fillRect(0, 0, S.LW, S.LH)
  roundRect(ctx, 0, 0, S.LW, 90, 0, ui.cardFill(ctx, 0, 0, S.LW, 90))
  // 顶部: 返回箭头 + 标题
  text(ctx, '←', 26, 72, 22, '#ffffff', 'center', true)
  text(ctx, '探索地牢', S.LW / 2, 72, 20, '#ffffff', 'center', true)
  // 分割线
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, 90)
  ctx.lineTo(S.LW, 90)
  ctx.stroke()

  // 大门大卡片: 居中, 上接分割线下方, 下接状态栏顶(入场原地淡入/推开原地淡出)
  const gx = S.LW * 0.08
  const gw = S.LW * 0.84
  const gy = 118
  const gh = S.LH - FOOTER_H_EXPAND - 15 - gy  // 667: 118~373 高255
  const gc = gy + gh / 2
  // 卡片背景(金色边框突出大门); 推开动画时整卡淡出
  const prevAlpha = ctx.globalAlpha
  ctx.globalAlpha = prevAlpha * fadeA
  roundRect(ctx, gx, gy, gw, gh, 20, ui.cardFill(ctx, gx, gy, gw, gh), isEntry ? COLORS.goldBright : '#e0c080', 2)
  // 顶部大门图标(手动居中, 大号)
  centerEmoji(ctx, '🚪', S.LW / 2, gc - 78, 64, COLORS.gold)
  // 标题
  text(ctx, isEntry ? '地牢之门' : '通往下一地域', S.LW / 2, gc - 22, 24, COLORS.gold, 'center', true)
  // 主题名(带图标, 金色)
  const themeLine = targetTheme.icon + ' ' + targetTheme.name
  text(ctx, themeLine, S.LW / 2, gc + 14, 18, '#ffffff', 'center', true)
  // 描述(截断防溢出)
  let desc = targetTheme.desc || ''
  while (desc.length > 1 && ui.textWidth(ctx, desc, 13) > gw - 48) desc = desc.slice(0, -1)
  text(ctx, desc, S.LW / 2, gc + 46, 13, COLORS.textDim, 'center')
  // 推开按钮(金色)
  const bw = gw * 0.6, bh = 44
  const bx = (S.LW - bw) / 2
  const by = gc + 76
  drawBtn(ctx, makeBtn(bx, by, bw, bh, '🚪 推开大门', () => openGate(), { ...ui.BTN.gold, r: 22 }))
  ctx.globalAlpha = prevAlpha
}

function leftX() { return S.LW * 0.05 }
function rightX() { return S.LW * 0.52 }

// ⚠️ 大号 emoji 图标统一手动居中: textAlign 'center' 对 emoji 的宽度测量与实际渲染
// 不一致(真机偏左/偏右, 用户报"图案不在卡片居中"), 用 textWidth 半宽偏移 + left 对齐
function centerEmoji(ctx, str, cx, y, size, color) {
  let sw = ui.textWidth(ctx, str, size)
  // ⚠️ 符号型 emoji(带变体选择符 FE0F, 如 ⚠️)在真机 canvas 渲染自带内边距,
  // measureText 宽度偏小 → 左对齐时图标偏右(用户报 trap 危险图标不齐), 补偿 +15%
  if (str.indexOf('\uFE0F') >= 0) sw *= 1.15
  text(ctx, str, cx - sw / 2, y, size, color || COLORS.text, 'left')
}

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
  } else if (cardAnim.phase === 'flyout') {
    // 完成侧: 向右上旋转滑出(扑克牌式)
    // 未选中侧: 同时从缩小状态平滑恢复原状(不能瞬间弹回)
    const t = Math.min(1, (now - cardAnim.start) / 450)
    const e = ui.easeOut(t)
    if (cardAnim.side === side) {
      scale = 1 + (1.1 - 1) * e
      rot = 18 * e
      dx = 90 * e
      dy = -70 * e
      alpha = 1 - e
    } else {
      // 恢复动画: 从expand的缩小值(0.92/0.86等)渐变回1
      const activeEvt = cardAnim.side === 'left' ? leftEvent : rightEvent
      const at = activeEvt ? activeEvt.type : ''
      const shrW = at === 'merchant' ? 0.24 : at === 'monster' ? 0.14 : 0
      scale = 1 - 0.08 * (1 - e)
      scaleX = 1 - shrW * (1 - e)
      alpha = 1 - 0.4 * (1 - e)
    }
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

  // 卡片渐变背景(对齐原版 .card; 选中侧金色发光, 持续发光)
  const isActive = cardAnim.side === side && cardAnim.phase !== 'flyout'
  if (isActive) { ctx.save(); ctx.shadowColor = 'rgba(240,192,64,0.75)'; ctx.shadowBlur = 16 }
  roundRect(ctx, cx - cw / 2, cy - ch / 2, cw, ch, 12, ui.cardFill(ctx, cx - cw / 2, cy - ch / 2, cw, ch), isActive ? COLORS.goldBright : COLORS.cardBorder, isActive ? 2 : 1.5)
  if (isActive) ctx.restore()

  // 内容随卡片缩放: 选中侧按高度(scale), 未选中侧跟随卡片宽度(scale*scaleX)同步缩小
  const zoomContent = (cardAnim.phase === 'expand' || (cardAnim.phase === 'flyout' && cardAnim.side !== side)) && !(cardAnim.side === side && ((cardAnim.side === 'left' ? leftEvent : rightEvent) || {}).type === 'merchant')
  const zoomVal = cardAnim.side === side ? scale : scale * scaleX
  if (zoomContent) { ctx.save(); ctx.translate(cx, cy); ctx.scale(zoomVal, zoomVal); ctx.translate(-cx, -cy) }

  if (state === 'door') {
    if (evt && evt.type === 'stairs') {
      // 楼梯卡: 🪜 + 发现楼梯！(金色粗体) + 金色按钮
      centerEmoji(ctx, '🪜', cx, cy - 55, 44)
      text(ctx, '发现楼梯！', cx, cy - 6, 16, '#f0c040', 'center', true)
      drawBtn(ctx, makeBtn(cx - w * 0.34, cy + 38, w * 0.68, 38, '⬇️ 下到 ' + (p.floor + 1) + ' 层', () => descend(), { ...ui.BTN.gold, r: 19 }))
    } else if (evt && evt.type === 'boss') {
      // Boss卡: 👑 + ⚠️ Boss拦路！(红粗) + 描述 + 红色按钮
      centerEmoji(ctx, '👑', cx, cy - 55, 44)
      let bossTitle = '⚠️ Boss 拦路！'
      while (bossTitle.length > 1 && ui.textWidth(ctx, bossTitle, 16) > cw - 24) bossTitle = bossTitle.slice(0, -1)  // 防溢出
      text(ctx, bossTitle, cx, cy - 8, 16, '#ff5555', 'center', true)
      text(ctx, '击败它才能继续前进', cx, cy + 16, 11, COLORS.textDim)
      drawBtn(ctx, makeBtn(cx - w * 0.34, cy + 38, w * 0.68, 38, '⚔️ 挑战 Boss', () => startBattle(side, true), { ...ui.BTN.danger, r: 19 }))
    } else {
      // 普通门: 浅棕色木门图标(大) + 红色大圆角前进按钮
      centerEmoji(ctx, '🚪', cx, cy - 48, 52)
      drawBtn(ctx, makeBtn(cx - w * 0.42, cy + 32, w * 0.84, 44, '前进探索', () => pickSide(side), { ...ui.BTN.primary, size: 15 }))
    }
  } else if (state === 'deadend') {
    // 死路: 🚧 + 死路 + 描述 + 灰色返回按钮
    // ⚠️ 图标手动居中(textAlign center 对 emoji 测量不准会偏) + 上移防顶超卡边
    centerEmoji(ctx, '🚧', cx, cy - 54, 36)
    text(ctx, '死路', cx, cy - 8, 16, COLORS.gold, 'center', true)
    // ⚠️ 描述必须截断: 原"前方没有路了..."≈209px > 卡宽~161px, 文字溢出卡片(用户报)
    let deadDesc = '前方没有路了，只能从另一边前进'
    while (deadDesc.length > 1 && ui.textWidth(ctx, deadDesc, 11) > cw - 24) deadDesc = deadDesc.slice(0, -1)
    text(ctx, deadDesc, cx, cy + 16, 11, COLORS.textDim)
    drawBtn(ctx, makeBtn(cx - w * 0.34, cy + 38, w * 0.68, 34, '💨 返回', () => blockSide(side), ui.BTN.secondary))
  } else if (state === 'blocked') {
    // 封锁: 🔒 + 此路不通
    centerEmoji(ctx, '🔒', cx, cy - 30, 36)
    text(ctx, '此路不通', cx, cy + 20, 13, '#555565')
  } else if (state === 'result') {
    drawResultCard(cx, cy, evt, w)
  } else if (state === 'monster') {
    drawMonsterCard(cx, cy, evt.monster, w)
  } else if (state === 'merchant') {
    drawMerchantCard(cx, cy, evt, side, w)
  } else if (state === 'altar') {
    drawAltarCard(cx, cy, evt, side, w)
  } else if (state === 'camp') {
    drawCampCard(cx, cy, evt, side, w)
  } else if (state === 'spring') {
    drawSpringCard(cx, cy, evt, side, w)
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
    case 'spring':
      // 神秘池子结果(2026-08-15): 喝后显示回复/扣血(springResult)
      icon = '💧'
      title = springResult && springResult.ok ? '甘甜可口！' : '这是什么味道...'
      desc = springResult && springResult.ok ? '恢复' + springResult.amount + '生命' : '扣除' + springResult.amount + '生命'
      descColor = springResult && springResult.ok ? '#2ecc71' : '#e74c3c'
      break
    case 'trap':
      icon = '⚠️'; title = trapResult && trapResult.dodged ? '闪避成功' : '触发陷阱'
      desc = trapResult && trapResult.dodged ? '毫发无伤' : '受到' + (trapResult ? trapResult.damage : 0) + '伤害'
      descColor = trapResult && trapResult.dodged ? '#2ecc71' : '#e74c3c'
      break
    case 'buffStone': icon = '🗿'; title = '增益石碑'; desc = '攻击+' + evt.attackBonus; descColor = '#f0c040'; break
    case 'oldGear': icon = '🦺'; title = '破旧装备'; desc = '防御+' + evt.defense; descColor = COLORS.blue; break
    case 'camp':
      // 营地休息结果(2026-08-15): 遇怪先显示"遭遇怪物！"(不直接跳战斗), 安全则回满提示
      if (campResult && campResult.ambush) {
        icon = '⚠️'; title = '遭遇怪物！'; desc = '休息惊动了附近的怪物！'; descColor = '#e74c3c'
      } else {
        icon = '🏕️'; title = '休息营地'; desc = '安全休息，生命回满'; descColor = '#2ecc71'
      }
      break
  }
  // 对齐原版: 图标36px + 标题16px金色粗体 + 描述12px彩色 + 好的按钮(红色80%)
  centerEmoji(ctx, icon, cx, cy - 58, 36)
  text(ctx, title, cx, cy - 16, 16, COLORS.gold, 'center', true)
  while (desc.length > 1 && ui.textWidth(ctx, desc, 12) > w - 24) desc = desc.slice(0, -1)  // 防溢出
  text(ctx, desc, cx, cy + 10, 12, descColor)
  const side = activeSide || 'left'
  // 营地遇怪: 按钮变"⚔️ 应战"→点击进战斗; 其他(含安全休息)都是"好的"→finishSide
  const isAmbush = evt.type === 'camp' && campResult && campResult.ambush
  drawBtn(ctx, makeBtn(cx - w * 0.4, cy + 34, w * 0.8, 34, isAmbush ? '⚔️ 应战' : '好的', () => isAmbush ? startBattle(side, false) : finishSide(side), isAmbush ? ui.BTN.danger : ui.BTN.primary))
}

function drawMonsterCard(cx, cy, m, w) {
  const ctx = S.ctx
  // 居中布局(大一点但不满): 图标44/名字20/属性14, 按钮0.8w
  // ⚠️ 图标手动居中: textAlign center 对 emoji 测量不准, 真机图案会偏(用户报"图案不在卡片居中")
  centerEmoji(ctx, m.icon, cx, cy - 76, 44)
  // 名字 + Lv(橙色小字)
  text(ctx, m.name, cx, cy - 32, 20, COLORS.gold, 'center', true)
  text(ctx, 'Lv.' + m.level, cx + ui.textWidth(ctx, m.name, 20) / 2 + 18, cy - 32, 14, '#ffaa00')
  // 属性(暴击/闪避在战斗界面显示); ⚠️ 截断防溢出(后期怪血5位数+emoji可超卡宽)
  let monAttr = '❤️' + m.hp + '  ⚔️' + m.attack + '  🛡️' + m.defense
  while (monAttr.length > 1 && ui.textWidth(ctx, monAttr, 14) > w - 24) monAttr = monAttr.slice(0, -1)
  text(ctx, monAttr, cx, cy - 4, 14, COLORS.textDim)
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

  // 商品列表（名称+价格上行, 描述+按钮下行; 价格在购买按钮正上方, 对齐原版不重叠）
  let yy = cy - 69
  for (let i = 0; i < evt.items.length; i++) {
    const it = evt.items[i]
    const iw = w, ix = cx - iw / 2   // 商品卡=整卡宽(名称不再被截断)
    roundRect(ctx, ix, yy - 2, iw, 56, 6, '#1a1a2e', '#2a2a4a', 1)
    // 名称(左上, 全卡宽不再截断)
    text(ctx, it.name, ix + 8, yy + 10, 15, COLORS.gold, 'left', true)
    // 价格(购买按钮正上方: 按钮 x=ix+iw-66~ix+iw-10, 中心 ix+iw-38; 价格右对齐按钮中心)
    text(ctx, '💰 ' + it.price, ix + iw - 38, yy + 10, 15, '#f0c040', 'right', true)
    // 描述(左下, 截断到按钮左侧)
    let desc = it.desc || ''
    while (desc.length > 1 && ui.textWidth(ctx, desc, 11) > (ix + iw - 84) - (ix + 8)) desc = desc.slice(0, -1)
    text(ctx, desc, ix + 8, yy + 36, 11, COLORS.textDim, 'left')
    // 购买按钮(右下: 卡底=yy+54, 按钮 yy+30~54 卡内)
    drawBtn(ctx, makeBtn(ix + iw - 66, yy + 30, 56, 24, '购买', () => buyMerchant(side, i), { ...ui.BTN.gold, size: 11 }))
    yy += 60
  }
  // 离开按钮(卡片内: 最后商品卡底 yy-60+54=cy+39, 离开 y=cy+51 起 高36 => 底 cy+87)
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
  audio.play('coin')  // 商人购买金币音
  wx.showToast({ title: '购买成功！', icon: 'success' })
}

function drawAltarCard(cx, cy, evt, side, w) {
  const ctx = S.ctx
  const p = S.player
  // 对齐原版祭坛卡
  centerEmoji(ctx, '🔮', cx, cy - 58, 36)
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

function drawCampCard(cx, cy, evt, side, w) {
  const ctx = S.ctx
  const p = S.player
  const rate = Math.round((evt.dangerRate || 0.3) * 100)
  // 营地卡: 🏕️ 标题 + 后果描述(两行, 一行放不下会截断) + 休息/离开按钮(对齐怪兽卡风格)
  centerEmoji(ctx, '🏕️', cx, cy - 58, 36)
  text(ctx, '休息营地', cx, cy - 32, 16, COLORS.gold, 'center', true)
  // 后果描述分两行(用户指定: 遇到来时怪物; 单行约216px超卡片137px会截断)
  text(ctx, '休息可回满血，但 ' + rate + '%', cx, cy - 8, 12, '#ffaa55')
  text(ctx, '概率遇到来时怪物', cx, cy + 12, 12, '#ffaa55')
  const bw = w * 0.8
  drawBtn(ctx, makeBtn(cx - bw / 2, cy + 38, bw, 30, '🔥 休息', () => campRest(side, evt), ui.BTN.primary))
  drawBtn(ctx, makeBtn(cx - bw / 2, cy + 76, bw, 30, '🚶 离开', () => finishSide(side), ui.BTN.secondary))
}

// 营地休息: 按概率遇到来时怪物(遇怪进战斗)或安全回满血
function campRest(side, evt) {
  const p = S.player
  const rate = evt.dangerRate || 0.3
  if (Math.random() < rate) {
    // 遇怪: 生成该主题随机怪, 先显示"遭遇怪物！"信息卡(用户要求, 不直接跳战斗)
    // result卡的按钮变"⚔️ 应战", 点击后才 startBattle
    const m = GE.getRandomMonster(p.floor, p.difficulty)
    if (side === 'left') leftEvent = { type: 'monster', monster: m }
    else rightEvent = { type: 'monster', monster: m }
    campResult = { ambush: true }
    setState(side, 'result')
    S.savePlayer()
    saveExploreState()
  } else {
    // 安全: 回满血
    p.heal(p.totalMaxHp)
    campResult = { ambush: false }
    S.savePlayer()
    setState(side, 'result')
    saveExploreState()
    wx.showToast({ title: '安全休息，生命回满', icon: 'success' })
  }
}

// 神秘池子: 喝一口(按难度概率: 成功回复上限% / 失败扣当前生命%)
function drinkSpring(side, evt) {
  const p = S.player
  const ok = Math.random() < (evt.successRate || 0.6)
  if (ok) {
    const amount = Math.max(1, Math.floor(p.totalMaxHp * (evt.healPercent || 0.3)))
    p.heal(amount)
    springResult = { drank: true, ok: true, amount }
  } else {
    const dmg = Math.max(1, Math.floor(p.hp * (evt.damagePercent || 0.1)))
    p.hp = Math.max(0, p.hp - dmg)
    springResult = { drank: true, ok: false, amount: dmg }
  }
  setState(side, 'result')
  // 先查死亡再存档: 池子扣血致死不能把0血存档留下
  if (p.isDead()) {
    clearExploreState()
    try { wx.removeStorageSync('dungeon_save') } catch (e) {}
    S.switchScene('menu')
    return
  }
  S.savePlayer()
  saveExploreState()
}

function drawSpringCard(cx, cy, evt, side, w) {
  const ctx = S.ctx
  const p = S.player
  const success = Math.round((evt.successRate || 0.6) * 100)
  const healP = Math.round((evt.healPercent || 0.3) * 100)
  const dmgP = Math.round((evt.damagePercent || 0.1) * 100)
  // 神秘池子卡: 💧 标题 + 描述(神秘液体, 写明概率) + 喝/不喝按钮
  centerEmoji(ctx, '💧', cx, cy - 58, 36)
  text(ctx, '神秘池子', cx, cy - 32, 16, COLORS.gold, 'center', true)
  // 描述两行: 不明液体 + 概率后果(一行放不下会截断)
  text(ctx, '池中装着神秘液体', cx, cy - 8, 12, '#8ac4ff')
  text(ctx, success + '%回复' + healP + '%，' + (100 - success) + '%扣' + dmgP + '%', cx, cy + 12, 12, '#ffaa55')
  const bw = w * 0.8
  drawBtn(ctx, makeBtn(cx - bw / 2, cy + 38, bw, 30, '🫗 喝一口', () => drinkSpring(side, evt), ui.BTN.primary))
  drawBtn(ctx, makeBtn(cx - bw / 2, cy + 76, bw, 30, '🚶 不喝', () => finishSide(side), ui.BTN.secondary))
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
  // 折叠箭头: 胶囊背景 + 实心三角 + 两侧圆点(丰富一点)
  const aw = 64, ah = 18
  const ax = S.LW / 2 - aw / 2, ay = y + 7
  roundRect(ctx, ax, ay, aw, ah, 9, 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.28)', 1)
  // 两侧圆点
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath(); ctx.arc(ax + 14, y + 16, 2, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(ax + aw - 14, y + 16, 2, 0, Math.PI * 2); ctx.fill()
  // 实心三角(展开向下/收起向上)
  ctx.fillStyle = '#a0a0b5'
  ctx.beginPath()
  if (footerExpanded) {
    ctx.moveTo(S.LW / 2 - 7, y + 13)
    ctx.lineTo(S.LW / 2 + 7, y + 13)
    ctx.lineTo(S.LW / 2, y + 20)
  } else {
    ctx.moveTo(S.LW / 2 - 7, y + 19)
    ctx.lineTo(S.LW / 2 + 7, y + 19)
    ctx.lineTo(S.LW / 2, y + 12)
  }
  ctx.closePath()
  ctx.fill()

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
