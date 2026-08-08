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

function start(shared, m, boss, done) {
  S = shared
  monster = m
  isBoss = boss
  onDone = done
  result = 'fighting'
  logs = []
  battle = new GE.Battle(S.player, m)
  logs.push(isBoss ? '👑 ' + m.name + ' 拦住了去路！' : m.icon + ' ' + m.name + ' 出现了！')
}

function touch(x, y) {
  if (result !== 'fighting') return
  const bw = 110, bh = 40
  const cx = S.LW / 2
  const y1 = S.LH - 140
  if (y > y1 - 20 && y < y1 + bh) {
    if (x > cx - bw * 1.7 && x < cx - bw * 0.6) attack()
    else if (x > cx - bw * 0.4 && x < cx + bw * 0.4) defend()
    else if (x > cx + bw * 0.6 && x < cx + bw * 1.7) {
      if (!isBoss) flee()
      else logs.push('Boss 拦住了去路，无法逃跑！')
    }
  }
  const y2 = S.LH - 90
  if (y > y2 - 20 && y < y2 + bh) {
    if (x > cx - bw * 0.5 && x < cx + bw * 0.5) usePotion()
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
  setTimeout(() => {
    S.player = null
    S.switchScene('menu')
  }, 1200)
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

  // 怪物卡
  const mw = S.LW * 0.8, mh = 130
  const mx = (S.LW - mw) / 2, my = 24
  roundRect(ctx, mx, my, mw, mh, 12, COLORS.card, isBoss ? COLORS.red : COLORS.cardBorder, 2)
  text(ctx, monster.icon, mx + 50, my + mh / 2, 44)
  text(ctx, monster.name + '  Lv.' + monster.level, mx + 130, my + 30, 16, isBoss ? COLORS.red : COLORS.gold, 'left', true)
  if (isBoss) text(ctx, '⚠️ BOSS ⚠️', mx + 130, my + 52, 11, COLORS.red, 'left', true)
  hpBar(ctx, mx + 130, my + 62, mw - 150, 10, monster.hp / monster.maxHp)
  text(ctx, monster.hp + ' / ' + monster.maxHp, mx + 130 + (mw - 150) / 2, my + 80, 11, COLORS.textDim)
  text(ctx, '⚔' + monster.attack + '  🛡' + monster.defense + '  ⚡' + monster.critPercent + '%暴  💨' + monster.dodgePercent + '%闪', mx + 130, my + 100, 10, COLORS.textDark, 'left')

  // 玩家卡
  const py = my + mh + 16
  roundRect(ctx, mx, py, mw, 100, 12, COLORS.card, COLORS.cardBorder, 2)
  text(ctx, '🧝 ' + p.name, mx + 50, py + 25, 14, COLORS.text, 'left', true)
  hpBar(ctx, mx + 100, py + 14, mw - 120, 10, p.hp / p.totalMaxHp)
  text(ctx, p.hp + ' / ' + p.totalMaxHp, mx + 100 + (mw - 120) / 2, py + 34, 11, COLORS.textDim)
  text(ctx, '⚔' + p.totalAttack + '  🛡' + p.totalDefense + '  ⚡' + Math.round(p.totalCrit * 100) + '%暴  💨' + Math.round(p.totalDodge * 100) + '%闪', mx + 100, py + 52, 10, COLORS.textDark, 'left')
  if (p.poisonTurns > 0) text(ctx, '☠️ 中毒 ' + p.poisonTurns + ' 回合', mx + 100, py + 72, 11, COLORS.purple, 'left', true)

  // 日志
  const ly = py + 110
  roundRect(ctx, mx, ly, mw, 90, 12, '#101024', '#2a2a4a', 1.5)
  text(ctx, '— 战斗日志 —', mx + mw / 2, ly + 16, 11, COLORS.textDark)
  const show = logs.slice(-3)
  for (let i = 0; i < show.length; i++) {
    text(ctx, show[i], mx + 12, ly + 36 + i * 20, 11, COLORS.textDim, 'left')
  }

  // 战斗按钮
  if (result === 'fighting') {
    const bw = 110, bh = 40
    const cx = S.LW / 2
    const y1 = S.LH - 140
    drawBtn(ctx, makeBtn(cx - bw * 1.7, y1, bw, bh, '⚔️ 攻击', null, ui.BTN.primary))
    drawBtn(ctx, makeBtn(cx - bw * 0.4, y1, bw, bh, '🛡️ 防御', null, ui.BTN.secondary))
    drawBtn(ctx, makeBtn(cx + bw * 0.6, y1, bw, bh, '🏃 逃跑', null, ui.BTN.secondary))
    const y2 = S.LH - 90
    drawBtn(ctx, makeBtn(cx - bw * 0.5, y2, bw, bh, '🧪 药水', null, ui.BTN.gold))
  } else if (result === 'victory') {
    text(ctx, '🎉 胜利！', S.LW / 2, S.LH - 120, 24, COLORS.gold, 'center', true)
  } else if (result === 'defeat') {
    text(ctx, '💀 你被打倒了...', S.LW / 2, S.LH - 120, 22, COLORS.red, 'center', true)
  } else if (result === 'fled') {
    text(ctx, '🏃 成功逃脱！', S.LW / 2, S.LH - 120, 22, COLORS.green, 'center', true)
  }
}

module.exports = { start, draw, touch }
