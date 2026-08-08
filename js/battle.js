/**
 * 战斗场景: 玩家 vs 怪物, 暴击/闪避/中毒/Boss技能
 */
const ui = require('./ui')
const { COLORS, roundRect, text, hpBar, makeBtn, drawBtn, hitBtn } = ui
const GE = require('../utils/game-engine')

let S = null
let battle = null
let monster = null
let isBoss = false
let logs = []
let onDone = null
let result = 'fighting' // fighting | victory | defeat | fled
let enterTime = Date.now()
// 血条动画: 显示血量平滑趋近实际血量(每次伤害后血条滑落而不是瞬间跳变)
let dispMonHp = 0
let dispPlayerHp = 0

function start(shared, m, boss, done) {
  S = shared
  monster = m
  isBoss = boss
  onDone = done
  result = 'fighting'
  logs = []
  battleLogs = []
  S.lastReward = null
  enterTime = Date.now()
  battle = new GE.Battle(S.player, m)
  dispMonHp = m.hp
  dispPlayerHp = S.player.hp
  logs.push(isBoss ? '👑 ' + m.name + ' 拦住了去路！' : m.icon + ' ' + m.name + ' 出现了！')
  syncLogs()
}

// 按钮纵向布局: 攻击/防御/逃跑(非Boss), 宽约原一半居中, 间距大
const BTN_W = 230
const BTN_H = 44
const BTN_GAP = 22
function btnX() { return (S.LW - BTN_W) / 2 }
// 动态布局: 怪卡与玩家卡间距大(32), 玩家卡加高(140), 按钮下移, 日志区加高
function layoutY() {
  const my = 80
  const mh = 215            // 怪卡加高(攻防数据回到卡内)
  const gap = 32
  const py = my + mh + gap
  const ph = 140
  const btn1 = py + ph + 32
  const btn2 = btn1 + BTN_H + BTN_GAP
  const btn3 = btn2 + BTN_H + BTN_GAP
  // 按钮卡片(三按钮在内, 加高)
  const btnCardY = btn1 - 16
  const btnCardH = btn3 + BTN_H - btn1 + 32
  // 日志贴屏幕底部, 高度上限100
  const logH = Math.min(100, Math.max(0, S.LH - btn3 - BTN_H - 22))
  const logY = S.LH - logH - 10
  return { my, mh, py, ph, btn1, btn2, btn3, btnCardY, btnCardH, logY, logH }
}
// 日志滑动状态
let logScroll = 0
let dragY = null
let dragScroll = 0

function touch(x, y) {
  const L = layoutY()
  if (result === 'fighting') {
    const bx = btnX()
    if (x < bx || x > bx + BTN_W) return
    if (y > L.btn1 && y < L.btn1 + BTN_H) { attack(); return }
    if (y > L.btn2 && y < L.btn2 + BTN_H) { defend(); return }
    if (!isBoss && y > L.btn3 && y < L.btn3 + BTN_H) { flee(); return }
  } else {
    // 结果信息在按钮卡内: 返回按钮 = 原逃跑按钮位置
    const bx = btnX()
    if (y > L.btn3 && y < L.btn3 + BTN_H && x > bx && x < bx + BTN_W) {
      if (result === 'defeat') {
        S.player = null
        S.switchScene('menu')
      } else {
        finish()
      }
    }
  }
}

// 日志区上下滑动
function touchMove(x, y) {
  const L = layoutY()
  if (result !== 'fighting') return
  if (y < L.logY || y > L.logY + L.logH) { dragY = null; return }
  if (dragY === null) { dragY = y; dragScroll = logScroll }
  const lineH = 14
  const viewLines = Math.max(0, Math.floor((L.logH - 30) / lineH))
  const maxScroll = Math.max(0, Math.max(0, battleLogs.length - viewLines) * lineH)
  logScroll = Math.max(0, Math.min(maxScroll, dragScroll - (y - dragY)))
}

function touchEnd() { dragY = null }

// 同步引擎战斗日志到界面(伤害/暴击/闪避/中毒/技能)
function syncLogs() {
  if (battle && battle.logs) {
    battleLogs = battle.logs.slice()
    logs = battle.logs.map(l => l.msg || l)
  }
}

function attack() {
  // 中毒结算
  const poisonDmg = battle.tickPoison()
  if (poisonDmg > 0) {
    if (battle.player.isDead()) { defeat(); return }
  }
  const r1 = battle.playerAttack()
  syncLogs()
  if (r1 === 'victory') { victory(); return }
  const r2 = isBoss && Math.random() < 0.3 ? battle.monsterSkillAttack() : battle.monsterAttack()
  syncLogs()
  if (r2 === 'defeat') { defeat(); return }
}

function defend() {
  // 防御: 本回合怪物伤害减半(对齐原版)
  const p = battle.player
  const m = battle.monster
  // 玩家闪避判定
  if (Math.random() < p.totalDodge) {
    battle.log('你侧身躲开了 ' + m.name + ' 的攻击！', 'dodge')
    syncLogs()
    return
  }
  // 基础伤害(防御姿态减半)
  let base = m.dealDamage(p.totalDefense)
  const isCrit = Math.random() < m.critChance
  if (isCrit) base = Math.floor(base * 1.5)
  const dmg = Math.max(1, Math.floor(base / 2))
  p.hp = Math.max(0, p.hp - dmg)
  battle.log(isCrit
    ? '你进入防御姿态，' + m.name + ' 暴击造成 ' + dmg + ' 点伤害'
    : '你进入防御姿态，' + m.name + ' 造成 ' + dmg + ' 点伤害', isCrit ? 'crit' : 'info')
  syncLogs()
  if (p.isDead()) { defeat(); return }
  // 防御后玩家反击
  const r1 = battle.playerAttack()
  syncLogs()
  if (r1 === 'victory') { victory(); return }
}

function flee() {
  const p = S.player
  const chance = Math.min(0.9, 0.2 + p.fleeFails * 0.1)
  if (Math.random() < chance) {
    p.fleeFails = 0
    logs.push('你成功逃脱了！')
    result = 'fled'
    S.savePlayer()
    // 不自动返回: 显示结果卡, 等玩家手动点返回探索
  } else {
    p.fleeFails++
    logs.push('逃跑失败！下次成功率 ' + Math.min(0.9, chance + 0.1) * 100 + '%')
    syncLogs()
    const r2 = battle.monsterAttack()
    syncLogs()
    if (r2 === 'defeat') { defeat(); return }
  }
}

function usePotion() {
  const p = S.player
  // 检查背包药水
  const idx = p.inventory.findIndex(i => i.type === 'potion')
  if (idx < 0) { logs.push('背包里没有治疗药水'); return }
  const potion = p.inventory[idx]
  p.inventory.splice(idx, 1)
  p.heal(Math.floor(p.totalMaxHp * (potion.healPercent || 0.3)))
  logs.push('使用' + potion.name + '，回复生命！')
  syncLogs()
  // 怪物反击
  const r2 = isBoss && Math.random() < 0.3 ? battle.monsterSkillAttack() : battle.monsterAttack()
  syncLogs()
  if (r2 === 'defeat') { defeat(); return }
}

function victory() {
  const p = S.player
  const goldGain = Math.floor(monster.gold * (monster.goldMul || 1))
  const expGain = Math.floor(monster.exp * (monster.expMul || 1))
  p.kills++
  p.gold += goldGain
  const leveled = p.addExp(expGain)
  p.poisonTurns = 0
  result = 'victory'
  S.lastReward = { gold: goldGain, exp: expGain, leveled: leveled, bossLoot: isBoss && monster.loot ? monster.loot : null }
  logs.push('🎉 击败 ' + monster.name + '！ +' + goldGain + '💰 +' + expGain + '经验')
  if (leveled) logs.push('🎊 升级到 Lv.' + p.level + '！')
  if (isBoss && monster.loot) {
    p.inventory.push({ ...monster.loot, type: monster.loot.type })
    logs.push('💎 掉落: ' + monster.loot.name)
  }
  S.savePlayer()
  // 不自动返回: 显示结果卡, 等玩家手动点返回探索
}

function defeat() {
  result = 'defeat'
  logs.push('💀 你被打倒了...')
  wx.removeStorageSync('dungeon_save')
  try { wx.removeStorageSync('explore_state') } catch (e) {}  // 死亡清除探索存档
}

function finish() {
  if (onDone) onDone()
}

function draw() {
  const ctx = S.ctx
  const p = S.player
  // 血条平滑动画: 显示血量每帧趋近实际血量(15%步进, 约200ms滑落)
  if (monster) {
    dispMonHp += (monster.hp - dispMonHp) * 0.15
    if (Math.abs(monster.hp - dispMonHp) < 0.5) dispMonHp = monster.hp
  }
  dispPlayerHp += (p.hp - dispPlayerHp) * 0.15
  if (Math.abs(p.hp - dispPlayerHp) < 0.5) dispPlayerHp = p.hp
  const g = ctx.createLinearGradient(0, 0, 0, S.LH)
  g.addColorStop(0, '#2a0a0a')
  g.addColorStop(1, '#1a1a2e')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S.LW, S.LH)

  const cw = S.LW - 32   // 卡片宽(16边距)
  const cx = S.LW / 2
  const cxp = 16         // 卡片x
  const L = layoutY()
  const { my, mh, py, ph, btn1, btn2, btn3, btnCardY, btnCardH, logY, logH } = L

  // ============ 1. 怪物卡 (对齐原版: icon 48px 居中 + 名字 + Lv掉落 + 生命值 + 血条 + 攻防暴闪) ============
  roundRect(ctx, cxp, my, cw, mh, 12, ui.cardFill(ctx, cxp, my, cw, mh), isBoss ? COLORS.red : COLORS.cardBorder, isBoss ? 2 : 1.5)
  text(ctx, monster.icon || '👹', cx, my + 44, 48)
  if (isBoss) text(ctx, '⚠️ BOSS ⚠️', cx, my + 82, 11, '#ff4444', 'center', true)
  text(ctx, monster.name, cx, my + 104, 20, isBoss ? '#ff5555' : COLORS.gold, 'center', true)
  text(ctx, 'Lv.' + monster.level + (isBoss && monster.loot ? ' · 掉落：' + monster.loot.name : ''), cx, my + 128, 12, COLORS.textDim)
  // 生命值行
  text(ctx, '生命值', cxp + 16, my + 154, 12, COLORS.textDim, 'left')
  text(ctx, monster.hp + ' / ' + monster.maxHp, cxp + cw - 16, my + 154, 12, COLORS.gold, 'right', true)
  hpBar(ctx, cxp + 16, my + 164, cw - 32, 10, dispMonHp / monster.maxHp, isBoss ? '#ff8800' : '#ff4444')
  // 攻防/暴闪
  text(ctx, '⚔️ ' + monster.attack + '攻 🛡️ ' + monster.defense + '防', cxp + 16, my + 190, 12, COLORS.textDim, 'left')
  text(ctx, '⚡' + monster.critPercent + '%暴 💨' + monster.dodgePercent + '%闪', cxp + cw - 16, my + 190, 12, COLORS.textDim, 'right')

  // ============ 2. 玩家卡 (加高140, 内容分散不紧凑) ============
  roundRect(ctx, cxp, py, cw, ph, 12, ui.cardFill(ctx, cxp, py, cw, ph), COLORS.cardBorder, 1.5)
  text(ctx, '🧝', cx, py + 38, 44)
  // 名字 + 血量
  text(ctx, '❤️ ' + p.name, cxp + 16, py + 32, 14, COLORS.textDim, 'left')
  text(ctx, p.hp + ' / ' + p.totalMaxHp, cxp + cw - 16, py + 32, 14, COLORS.gold, 'right', true)
  hpBar(ctx, cxp + 16, py + 48, cw - 32, 12, dispPlayerHp / p.totalMaxHp)
  // 暴闪
  text(ctx, '⚡' + Math.round(p.totalCrit * 100) + '%暴 💨' + Math.round(p.totalDodge * 100) + '%闪', cxp + 16, py + 78, 13, COLORS.textDim, 'left')
  if (p.poisonTurns > 0) text(ctx, '☠️ 中毒 ' + p.poisonTurns + ' 回合', cxp + cw - 16, py + 78, 13, COLORS.purple, 'right', true)
  // 攻防
  text(ctx, '⚔️ ' + p.totalAttack + '攻 🛡️ ' + p.totalDefense + '防', cxp + 16, py + 108, 13, COLORS.textDim, 'left')
  text(ctx, '💾 ' + p.gold + '金', cxp + cw - 16, py + 108, 13, COLORS.textDim, 'right')

  // ============ 3. 操作/结果区 ============
  if (result === 'fighting') {
    // 三个按钮共用一个卡片背景(加高)
    roundRect(ctx, cxp, btnCardY, cw, btnCardH, 12, ui.cardFill(ctx, cxp, btnCardY, cw, btnCardH), COLORS.cardBorder, 1.5)
    // 按钮居中(宽约原一半), 间距大
    const bx = btnX()
    drawBtn(ctx, makeBtn(bx, btn1, BTN_W, BTN_H, '⚔️ 攻击', null, ui.BTN.primary))
    // 防御按钮: 主文字 + 小字描述(本回合减伤50%)
    {
      const defBtn = makeBtn(bx, btn2, BTN_W, BTN_H, '', null, ui.BTN.secondary)
      drawBtn(ctx, defBtn)
      text(ctx, '🛡️ 防御', bx + BTN_W / 2, btn2 + 17, 15, '#cccccc', 'center', true)
      text(ctx, '本回合减少50%伤害', bx + BTN_W / 2, btn2 + 33, 10, '#8a8a9a', 'center')
    }
    if (!isBoss) {
      const fleePct = Math.round(Math.min(0.9, 0.2 + p.fleeFails * 0.1) * 100)
      drawBtn(ctx, makeBtn(bx, btn3, BTN_W, BTN_H, '🏃 逃跑（' + fleePct + '%成功率）', null, ui.BTN.danger))
    }
  } else {
    // 结果信息显示在按钮卡片内(三按钮消失, 卡片原位显示)
    roundRect(ctx, cxp, btnCardY, cw, btnCardH, 12, ui.cardFill(ctx, cxp, btnCardY, cw, btnCardH), COLORS.cardBorder, 1.5)
    const rc = btnCardY
    if (result === 'victory') {
      text(ctx, '🎉', cx, rc + 44, 40)
      text(ctx, '胜利！', cx, rc + 78, 20, COLORS.gold, 'center', true)
      text(ctx, '获得 ' + S.lastReward.gold + ' 金币', cx, rc + 106, 13, '#f0c040')
      text(ctx, '获得 ' + S.lastReward.exp + ' 经验', cx, rc + 128, 13, COLORS.blue)
      if (S.lastReward.leveled) text(ctx, '🎊 升级到 Lv.' + p.level + '！', cx, rc + 150, 13, COLORS.goldBright)
    } else if (result === 'fled') {
      text(ctx, '🏃', cx, rc + 44, 40)
      text(ctx, '逃脱成功！', cx, rc + 78, 20, COLORS.green, 'center', true)
      text(ctx, '暂时远离了危险', cx, rc + 102, 13, COLORS.textDim)
    } else if (result === 'defeat') {
      text(ctx, '💀', cx, rc + 44, 40)
      text(ctx, '你被打倒了...', cx, rc + 78, 20, COLORS.red, 'center', true)
      text(ctx, '冒险到此结束，一切重来', cx, rc + 102, 13, COLORS.textDim)
    }
    drawBtn(ctx, makeBtn(btnX(), btn3, BTN_W, BTN_H, '↩️ 返回探索', null, result === 'defeat' ? ui.BTN.danger : ui.BTN.primary))
  }

  // ============ 4. 战斗日志(可上下滑动) ============
  roundRect(ctx, cxp, logY, cw, logH, 12, '#101024', '#2a2a4a', 1.5)
  text(ctx, '战斗日志：', cxp + 14, logY + 14, 12, COLORS.gold, 'left', true)
  const lineH = 14
  const viewLines = Math.max(0, Math.floor((logH - 30) / lineH))
  const total = battleLogs.length
  const maxScroll = Math.max(0, Math.max(0, total - viewLines) * lineH)
  logScroll = Math.max(0, Math.min(maxScroll, logScroll))
  const scrollLines = Math.round(logScroll / lineH)
  const startIdx = Math.max(0, total - viewLines - scrollLines)
  const show = battleLogs.slice(startIdx, Math.min(total, startIdx + viewLines))
  for (let i = 0; i < show.length; i++) {
    const item = show[i]
    const msg = typeof item === 'string' ? item : item.msg
    const type = typeof item === 'string' ? '' : (item.type || '')
    let color = COLORS.textDim
    if (type === 'dodge') color = COLORS.blue
    else if (type === 'crit') color = '#ffaa00'
    else if (type === 'poison') color = COLORS.purple
    else if (type === 'skill') color = COLORS.red
    else if (type === 'loot') color = COLORS.goldBright
    text(ctx, msg, cxp + 14, logY + 30 + i * lineH, 10, color, 'left')
  }
  // 滚动条(可滑动提示)
  if (maxScroll > 0) {
    const barH = Math.max(8, (logH - 30) * (viewLines / total))
    const barY = logY + 30 + (logH - 30 - barH) * (logScroll / maxScroll)
    roundRect(ctx, cxp + cw - 6, barY, 3, barH, 1.5, 'rgba(255,255,255,0.35)')
  }
}

// 引擎战斗日志(含类型)
let battleLogs = []

module.exports = { start, draw, touch, touchMove, touchEnd }
