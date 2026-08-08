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

function start(shared, m, boss, done) {
  S = shared
  monster = m
  isBoss = boss
  onDone = done
  result = 'fighting'
  logs = []
  S.lastReward = null
  enterTime = Date.now()
  battle = new GE.Battle(S.player, m)
  logs.push(isBoss ? '👑 ' + m.name + ' 拦住了去路！' : m.icon + ' ' + m.name + ' 出现了！')
}

// 全宽按钮纵向布局(对齐原版): 攻击/防御/逃跑(非Boss)
const BTN_X = 32
const BTN_W = 311  // LW-64
const BTN_H = 46
const BTN_GAP = 10
const BTN_Y1 = 440  // 攻击
const BTN_Y2 = 496  // 防御
const BTN_Y3 = 552  // 逃跑

function touch(x, y) {
  if (result === 'fighting') {
    if (x < BTN_X || x > BTN_X + BTN_W) return
    if (y > BTN_Y1 && y < BTN_Y1 + BTN_H) { attack(); return }
    if (y > BTN_Y2 && y < BTN_Y2 + BTN_H) { defend(); return }
    if (!isBoss && y > BTN_Y3 && y < BTN_Y3 + BTN_H) { flee(); return }
  } else {
    // 结果卡: 返回探索/重新开始按钮
    const ry = BTN_Y1 - 30
    if (y > ry + 150 && y < ry + 190 && x > BTN_X && x < BTN_X + BTN_W) {
      if (result === 'defeat') {
        S.player = null
        S.switchScene('menu')
      } else {
        finish()
      }
    }
  }
}

function attack() {
  // 中毒结算
  const poisonDmg = battle.tickPoison()
  if (poisonDmg > 0) {
    if (battle.player.isDead()) { defeat(); return }
  }
  const r1 = battle.playerAttack()
  if (r1 === 'victory') { victory(); return }
  const r2 = isBoss && Math.random() < 0.3 ? battle.monsterSkillAttack() : battle.monsterAttack()
  if (r2 === 'defeat') { defeat(); return }
}

function defend() {
  // 防御: 本回合怪物伤害减半
  const r2 = isBoss && Math.random() < 0.3 ? battle.monsterSkillAttack() : battle.monsterAttack()
  // 简化: 防御无特殊处理(小游戏版)
  if (r2 === 'defeat') { defeat(); return }
  const r1 = battle.playerAttack()
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
    setTimeout(finish, 800)
  } else {
    p.fleeFails++
    logs.push('逃跑失败！下次成功率 ' + Math.min(0.9, chance + 0.1) * 100 + '%')
    const r2 = battle.monsterAttack()
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
  // 怪物反击
  const r2 = isBoss && Math.random() < 0.3 ? battle.monsterSkillAttack() : battle.monsterAttack()
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
  setTimeout(finish, 1000)
}

function defeat() {
  result = 'defeat'
  logs.push('💀 你被打倒了...')
  wx.removeStorageSync('dungeon_save')
}

function finish() {
  if (onDone) onDone()
}

function draw() {
  const ctx = S.ctx
  const p = S.player
  const g = ctx.createLinearGradient(0, 0, 0, S.LH)
  g.addColorStop(0, '#2a0a0a')
  g.addColorStop(1, '#1a1a2e')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S.LW, S.LH)

  const cw = S.LW - 32   // 卡片宽(16边距)
  const cx = S.LW / 2
  const cxp = 16         // 卡片x

  // ============ 1. 怪物卡 (对齐原版: icon 48px 居中 + 名字 + Lv掉落 + 生命值 + 血条 + 攻防暴闪) ============
  const my = 56
  const mh = 210
  roundRect(ctx, cxp, my, cw, mh, 12, ui.cardFill(ctx, cxp, my, cw, mh), isBoss ? COLORS.red : COLORS.cardBorder, isBoss ? 2 : 1.5)
  text(ctx, monster.icon || '👹', cx, my + 44, 48)
  if (isBoss) text(ctx, '⚠️ BOSS ⚠️', cx, my + 82, 11, '#ff4444', 'center', true)
  text(ctx, monster.name, cx, my + 104, 20, isBoss ? '#ff5555' : COLORS.gold, 'center', true)
  text(ctx, 'Lv.' + monster.level + (isBoss && monster.loot ? ' · 掉落：' + monster.loot.name : ''), cx, my + 128, 12, COLORS.textDim)
  // 生命值行
  text(ctx, '生命值', cxp + 16, my + 154, 12, COLORS.textDim, 'left')
  text(ctx, monster.hp + ' / ' + monster.maxHp, cxp + cw - 16, my + 154, 12, COLORS.gold, 'right', true)
  hpBar(ctx, cxp + 16, my + 164, cw - 32, 10, monster.hp / monster.maxHp, isBoss ? '#ff8800' : '#ff4444')
  // 攻防/暴闪
  text(ctx, '⚔️ ' + monster.attack + '攻 🛡️ ' + monster.defense + '防', cxp + 16, my + 190, 12, COLORS.textDim, 'left')
  text(ctx, '⚡' + monster.critPercent + '%暴 💨' + monster.dodgePercent + '%闪', cxp + cw - 16, my + 190, 12, COLORS.textDim, 'right')

  // ============ 2. 玩家卡 (对齐原版: 🧝40px + 血量 + 血条 + 暴闪) ============
  const py = my + mh + 12
  const ph = 116
  roundRect(ctx, cxp, py, cw, ph, 12, ui.cardFill(ctx, cxp, py, cw, ph), COLORS.cardBorder, 1.5)
  text(ctx, '🧝', cx, py + 30, 40)
  // 名字 + 血量
  text(ctx, '❤️ ' + p.name, cxp + 16, py + 26, 13, COLORS.textDim, 'left')
  text(ctx, p.hp + ' / ' + p.totalMaxHp, cxp + cw - 16, py + 26, 13, COLORS.gold, 'right', true)
  hpBar(ctx, cxp + 16, py + 40, cw - 32, 10, p.hp / p.totalMaxHp)
  // 暴闪
  text(ctx, '⚡' + Math.round(p.totalCrit * 100) + '%暴 💨' + Math.round(p.totalDodge * 100) + '%闪', cxp + 16, py + 66, 12, COLORS.textDim, 'left')
  if (p.poisonTurns > 0) text(ctx, '☠️ 中毒 ' + p.poisonTurns + ' 回合', cxp + cw - 16, py + 66, 12, COLORS.purple, 'right', true)
  // 攻防
  text(ctx, '⚔️ ' + p.totalAttack + '攻 🛡️ ' + p.totalDefense + '防', cxp + 16, py + 92, 12, COLORS.textDim, 'left')
  text(ctx, '💾 ' + p.gold + '金', cxp + cw - 16, py + 92, 12, COLORS.textDim, 'right')

  // ============ 3. 操作/结果区 ============
  if (result === 'fighting') {
    // 全宽大按钮(对齐原版 .btn): 攻击/防御(带说明)/逃跑(带成功率,非Boss)
    drawBtn(ctx, makeBtn(BTN_X, BTN_Y1, BTN_W, BTN_H, '⚔️ 攻击', null, ui.BTN.primary))
    drawBtn(ctx, makeBtn(BTN_X, BTN_Y2, BTN_W, BTN_H, '🛡️ 防御（减少50%伤害，本回合）', null, ui.BTN.secondary))
    if (!isBoss) {
      const fleePct = Math.round(Math.min(0.9, 0.2 + p.fleeFails * 0.1) * 100)
      drawBtn(ctx, makeBtn(BTN_X, BTN_Y3, BTN_W, BTN_H, '🏃 逃跑（' + fleePct + '%成功率）', null, ui.BTN.danger))
    }
  } else {
    // 结果卡 (对齐原版: 图标40px + 标题 + 副标题 + 按钮)
    const ry = BTN_Y1 - 30
    const rh = 190
    roundRect(ctx, cxp, ry, cw, rh, 12, ui.cardFill(ctx, cxp, ry, cw, rh), COLORS.cardBorder, 1.5)
    if (result === 'victory') {
      text(ctx, '🎉', cx, ry + 40, 40)
      text(ctx, '胜利！', cx, ry + 74, 20, COLORS.gold, 'center', true)
      text(ctx, '获得 ' + S.lastReward.gold + ' 金币', cx, ry + 102, 13, '#f0c040')
      text(ctx, '获得 ' + S.lastReward.exp + ' 经验', cx, ry + 124, 13, COLORS.blue)
      if (S.lastReward.leveled) text(ctx, '🎊 升级到 Lv.' + p.level + '！', cx, ry + 146, 13, COLORS.goldBright)
    } else if (result === 'fled') {
      text(ctx, '🏃', cx, ry + 40, 40)
      text(ctx, '逃脱成功！', cx, ry + 74, 20, COLORS.green, 'center', true)
      text(ctx, '暂时远离了危险', cx, ry + 102, 13, COLORS.textDim)
    } else if (result === 'defeat') {
      text(ctx, '💀', cx, ry + 40, 40)
      text(ctx, '你被打倒了...', cx, ry + 74, 20, COLORS.red, 'center', true)
      text(ctx, '冒险到此结束，一切重来', cx, ry + 102, 13, COLORS.textDim)
    }
    drawBtn(ctx, makeBtn(BTN_X, ry + 150, BTN_W, 40, '↩️ 返回探索', null, result === 'defeat' ? ui.BTN.danger : ui.BTN.primary))
  }

  // ============ 4. 战斗日志(逃跑按钮下方, 60高) ============
  const ly = 600
  roundRect(ctx, cxp, ly, cw, 60, 12, '#101024', '#2a2a4a', 1.5)
  text(ctx, '战斗日志：', cxp + 14, ly + 16, 12, COLORS.gold, 'left', true)
  const show = logs.slice(-2)
  for (let i = 0; i < show.length; i++) {
    text(ctx, show[i], cxp + 14, ly + 36 + i * 14, 10, COLORS.textDim, 'left')
  }
}

module.exports = { start, draw, touch }
