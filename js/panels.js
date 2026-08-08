/**
 * 面板层: 商店 / 背包 / 铁匠铺
 * 从探索页底部状态栏打开
 */
const ui = require('./ui')
const { COLORS, roundRect, text, hpBar, makeBtn, drawBtn, hitBtn } = ui
const Data = require('../utils/data')

let S = null
let type = null   // shop | inventory | forge
let list = []     // 当前列表项
let btns = []
let scroll = 0
let sections = []   // 商店分类(武器/护甲/饰品)
let layout = []     // 预计算布局 [{kind:'header'|'item', text/item, y}]
let contentH = 0    // 内容总高
let shopTier = 1
let themeName = ''
const M = 16        // 边距
const PW = () => S.LW - 32

function create(name, shared) {
  S = shared
  type = name
  scroll = 0
  btns = []
  build()
  return this
}

function build() {
  const p = S.player
  btns = []
  scroll = 0
  sections = []
  layout = []
  if (type === 'shop') {
    // 对齐原版: 按当前层数阶数显示三分类装备
    shopTier = Math.min(Math.ceil(p.floor / 5), 5)
    themeName = Data.getThemeForFloor(p.floor).name
    sections = [
      { title: '🗡️ 武器', items: Data.equipment.weapon.filter(e => e.tier === shopTier).map(e => ({ ...e, type: 'weapon' })) },
      { title: '🛡️ 护甲', items: Data.equipment.armor.filter(e => e.tier === shopTier).map(e => ({ ...e, type: 'armor' })) },
      { title: '💍 饰品', items: Data.equipment.accessory.filter(e => e.tier === shopTier).map(e => ({ ...e, type: 'accessory' })) }
    ]
    let y = 128
    for (const sec of sections) {
      layout.push({ kind: 'header', text: sec.title, y }); y += 30
      for (const it of sec.items) {
        layout.push({ kind: 'item', item: it, y, h: 68 }); y += 68
      }
    }
    contentH = y
  } else if (type === 'inventory') {
    // 对齐原版: 当前装备区 + 物品列表
    list = p.inventory.map((it, i) => ({ ...it, invIdx: i }))
    layout.push({ kind: 'eqHeader', y: 148 })
    let y = 148 + 42
    layout.push({ kind: 'eqRow', slot: 'weapon', item: p.weapon, y, h: 40 }); y += 40
    layout.push({ kind: 'eqRow', slot: 'armor', item: p.armor, y, h: 40 }); y += 40
    layout.push({ kind: 'eqRow', slot: 'accessory', item: p.accessory, y, h: 40 }); y += 40
    layout.push({ kind: 'invHeader', count: list.length, y: y + 6 }); y += 34
    for (const it of list) {
      layout.push({ kind: 'item', item: it, y, h: 62 }); y += 62
    }
    contentH = y
  } else if (type === 'forge') {
    list = ['weapon', 'armor', 'accessory'].map(slot => ({ slot, item: p[slot] }))
    let y = 148
    for (const it of list) {
      layout.push({ kind: 'item', item: it, y, h: 68 }); y += 68
    }
    contentH = y
  }
}

function touch(x, y) {
  // ✕ 关闭(右上角)
  if (x > S.LW - 60 && y > M && y < M + 50) { close(); return }
  // 底部返回按钮(对齐原版 ↩️ 返回)
  if (y > S.LH - 60 && y < S.LH - 16 && x > M && x < M + PW()) { close(); return }
  // 列表区: 顶部上滑 / 底部下滑 / 点击项
  const th = type === 'shop' ? 100 : 58
  const topY = M + th + 10
  const bottomY = S.LH - 70
  if (y > topY && y < bottomY) {
    if (y < topY + 24) { scroll = Math.max(0, scroll - 40); return }
    if (y > bottomY - 24) { scroll = Math.min(Math.max(0, contentH - (bottomY - topY)), scroll + 40); return }
    const cy = y + scroll
    for (const el of layout) {
      if (el.kind === 'item' && cy > el.y && cy < el.y + el.h) {
        handleItem(el.item)
        return
      }
      if (el.kind === 'eqRow' && cy > el.y && cy < el.y + el.h) {
        if (el.item && x > S.LW - M - 80 && x < S.LW - M - 16) { unequipSlot(el.slot); return }
      }
    }
  }
}

function unequipSlot(slot) {
  const p = S.player
  if (!p[slot]) return
  p.inventory.push({ ...p[slot], type: slot })
  p[slot] = null
  S.savePlayer()
  wx.showToast({ title: '已卸下', icon: 'success' })
  build()
}

function handleItem(it) {
  const p = S.player
  if (!it) return

  if (type === 'shop') {
    if (p.gold < it.price) { wx.showToast({ title: '金币不足！', icon: 'none' }); return }
    const cur = p[it.type]
    const curVal = cur ? (cur.attack || cur.defense || cur.hp || 0) : 0
    const itVal = it.attack || it.defense || it.hp || 0
    if (cur && curVal >= itVal) { wx.showToast({ title: '已有更好装备', icon: 'none' }); return }
    p.gold -= it.price
    p.inventory.push({ ...it })
    S.savePlayer()
    wx.showToast({ title: '购买 ' + it.name, icon: 'success' })
  } else if (type === 'inventory') {
    if (it.type === 'potion') {
      p.inventory.splice(it.invIdx, 1)
      p.heal(Math.floor(p.totalMaxHp * (it.healPercent || 0.3)))
      if (it.curePoison) p.poisonTurns = 0
      S.savePlayer()
      wx.showToast({ title: '使用 ' + it.name, icon: 'success' })
    } else {
      p.equip(it)
      S.savePlayer()
      wx.showToast({ title: '装备 ' + it.name, icon: 'success' })
    }
    build()
  } else if (type === 'forge') {
    const item = it.item
    if (!item) { wx.showToast({ title: '未装备' + (it.slot === 'weapon' ? '武器' : it.slot === 'armor' ? '护甲' : '饰品'), icon: 'none' }); return }
    if ((item.enhanceLevel || 0) >= p.maxEnhanceLevel) { wx.showToast({ title: '已达上限', icon: 'none' }); return }
    const cost = p.getEnhanceCost(item)
    if (p.gold < cost) { wx.showToast({ title: '金币不足 ' + cost, icon: 'none' }); return }
    p.enhance(item)
    S.savePlayer()
    wx.showToast({ title: '强化 +' + (item.enhanceLevel || 1), icon: 'success' })
    build()
  }
}

function close() {
  if (S.setPanels) S.setPanels(null)
  else S.panels = null
}

function draw() {
  const ctx = S.ctx
  const p = S.player
  // 半透明遮罩
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(0, 0, S.LW, S.LH)

  // ===== 标题卡(对齐原版: 标题+金币+区域/阶数) =====
  const th = type === 'shop' ? 100 : 58
  roundRect(ctx, M, M, PW(), th, 12, ui.cardFill(ctx, M, M, PW(), th), COLORS.goldBright, 1.5)
  if (type === 'shop') {
    text(ctx, '🏪 冒险者商店', S.LW / 2, M + 26, 20, COLORS.gold, 'center', true)
    text(ctx, '金币：' + p.gold + ' 💰', S.LW / 2, M + 50, 13, COLORS.goldBright)
    text(ctx, '当前区域：' + themeName + ' · 第 ' + shopTier + ' 阶装备', S.LW / 2, M + 74, 12, '#6a6a7a')
  } else if (type === 'inventory') {
    text(ctx, '🎒 背包', S.LW / 2, M + 24, 20, COLORS.gold, 'center', true)
    text(ctx, '金币：' + p.gold + ' 💰', S.LW / 2, M + 44, 12, COLORS.goldBright)
  } else {
    text(ctx, '⚒️ 铁匠铺', S.LW / 2, M + 24, 20, COLORS.gold, 'center', true)
    text(ctx, '金币：' + p.gold + ' 💰', S.LW / 2, M + 44, 12, COLORS.goldBright)
  }
  // ✕ 关闭
  text(ctx, '✕', S.LW - M - 22, M + 22, 22, COLORS.red, 'center', true)

  // ===== 列表区(可滚动, 裁剪) =====
  const topY = M + th + 10
  const bottomY = S.LH - 70
  ctx.save()
  ctx.beginPath()
  ctx.rect(M, topY, PW(), bottomY - topY)
  ctx.clip()
  for (const el of layout) {
    const ey = el.y - scroll
    if (ey < topY - 80 || ey > bottomY + 10) continue
    if (el.kind === 'header') {
      text(ctx, el.text, M + 6, ey + 16, 16, '#e0c080', 'left', true)
    } else if (el.kind === 'eqHeader') {
      text(ctx, '当前装备', M + 6, ey + 16, 16, '#e0c080', 'left', true)
    } else if (el.kind === 'eqRow') {
      drawEquipRow(ctx, el, ey)
    } else if (el.kind === 'invHeader') {
      text(ctx, '背包物品（' + el.count + '件）', M + 6, ey + 16, 16, '#e0c080', 'left', true)
      if (el.count === 0) text(ctx, '背包空空如也，去地牢冒险获取装备吧！', S.LW / 2, ey + 42, 12, '#666666')
    } else if (el.kind === 'item') {
      drawItemRow(ctx, el.item, ey, el.h)
    }
  }
  ctx.restore()

  // 滚动提示
  if (contentH > bottomY - topY) {
    text(ctx, '↑ 上滑 / ↓ 下滑', S.LW / 2, bottomY + 8, 11, COLORS.textDark)
  }

  // ===== 底部返回按钮(对齐原版 ↩️ 返回) =====
  drawBtn(ctx, makeBtn(M, S.LH - 60, PW(), 44, '↩️ 返回', null, ui.BTN.secondary))
}

// 装备项(商店/背包/铁匠铺, 对齐原版)
function drawItemRow(ctx, it, y, h) {
  const p = S.player
  // 原版: 背景#141428 边框#2a2a4a 圆角8
  roundRect(ctx, M, y, PW(), h - 10, 8, '#141428', '#2a2a4a', 1)
  const x = M + 14
  if (type === 'shop') {
    // 名称粗体 + 主属性(红/蓝/绿) + 副属性(暴击/闪避) + desc + 右侧💰价格金按钮
    text(ctx, it.name, x, y + 18, 14, COLORS.text, 'left', true)
    let prop = '', propColor = COLORS.textDim
    if (it.attack) { prop = '攻击 +' + it.attack; propColor = '#e74c3c' }
    else if (it.defense) { prop = '防御 +' + it.defense; propColor = '#3498db' }
    else if (it.hp) { prop = '生命上限 +' + it.hp; propColor = '#2ecc71' }
    text(ctx, prop, x, y + 38, 12, propColor, 'left', true)
    let sub = ''
    if (it.critChance) sub += '⚡暴击 +' + Math.round(it.critChance * 100) + '% '
    if (it.dodgeChance) sub += '💨闪避 +' + Math.round(it.dodgeChance * 100) + '%'
    text(ctx, sub, x, y + 54, 11, '#ffaa00', 'left')
    text(ctx, it.desc || '', x + (sub ? ui.textWidth(ctx, sub, 11) + 8 : 0), y + 54, 11, '#666666', 'left')
    drawBtn(ctx, makeBtn(S.LW - M - 96, y + 14, 80, 34, '💰 ' + it.price, null, { ...ui.BTN.gold, size: 12 }))
  } else if (type === 'inventory') {
    // 图标+名称 + 属性 + desc + 右侧装备按钮
    const icon = it.type === 'weapon' ? '🗡️' : it.type === 'armor' ? '🛡️' : it.type === 'accessory' ? '💍' : '🧪'
    text(ctx, icon + ' ' + it.name, x, y + 18, 14, COLORS.text, 'left', true)
    let prop = ''
    if (it.type === 'potion') prop = '治疗'
    else {
      if (it.attack) prop += '攻击+' + it.attack + ' '
      if (it.defense) prop += '防御+' + it.defense + ' '
      if (it.hp) prop += '生命+' + it.hp
    }
    text(ctx, prop, x, y + 38, 12, '#8a8a9a', 'left')
    text(ctx, it.desc || '', x, y + 54, 11, '#666666', 'left')
    drawBtn(ctx, makeBtn(S.LW - M - 90, y + 14, 74, 34, '装备', null, it.type === 'potion' ? ui.BTN.gold : ui.BTN.primary))
  } else {
    // forge
    const slotName = it.slot === 'weapon' ? '🗡️ 武器' : it.slot === 'armor' ? '🛡️ 护甲' : '💍 饰品'
    if (it.item) {
      const it2 = it.item
      text(ctx, slotName + ' ' + it2.name + (it2.enhanceLevel ? ' +' + it2.enhanceLevel : ''), x, y + 20, 14, COLORS.text, 'left', true)
      const stat = it.slot === 'weapon' ? '攻+' + (it2.attack + (it2.enhanceLevel || 0) * 3) : it.slot === 'armor' ? '防+' + (it2.defense + (it2.enhanceLevel || 0) * 3) : '血+' + (it2.hp + (it2.enhanceLevel || 0) * 15)
      text(ctx, stat + '  (' + (it2.enhanceLevel || 0) + '/' + p.maxEnhanceLevel + ')', x, y + 42, 12, COLORS.textDim, 'left')
      const cost = p.getEnhanceCost(it2)
      const canUp = (it2.enhanceLevel || 0) < p.maxEnhanceLevel
      drawBtn(ctx, makeBtn(S.LW - M - 90, y + 18, 74, 30, canUp ? '💰' + cost : '已满级', null, canUp ? ui.BTN.forge : ui.BTN.secondary))
    } else {
      text(ctx, slotName + ': 未装备', x, y + 28, 13, COLORS.textDark, 'left')
    }
  }
}

// 背包当前装备行(对齐原版: 紫色槽位名 + 名称(+X) + 卸下按钮)
function drawEquipRow(ctx, el, y) {
  roundRect(ctx, M, y, PW(), el.h - 4, 8, '#1a1a3e')
  const x = M + 14
  const slotName = el.slot === 'weapon' ? '🗡️ 武器' : el.slot === 'armor' ? '🛡️ 护甲' : '💍 饰品'
  text(ctx, slotName, x, y + 18, 13, '#a080ff', 'left', true)
  if (el.item) {
    const it = el.item
    const stat = el.slot === 'weapon' ? '(+' + it.attack + '攻)' : el.slot === 'armor' ? '(+' + it.defense + '防)' : '(+' + it.hp + '血)'
    text(ctx, it.name + ' ' + stat, x + 76, y + 18, 13, COLORS.text, 'left', true)
    drawBtn(ctx, makeBtn(S.LW - M - 80, y + 7, 64, 26, '卸下', null, ui.BTN.secondary))
  } else {
    text(ctx, '空', x + 76, y + 18, 13, '#666666', 'left')
  }
}

module.exports = { create, draw, touch }
