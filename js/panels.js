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
  if (type === 'shop') {
    const tier = Math.min(Math.ceil(p.floor / 5), 5)
    list = []
    for (const t of ['weapon', 'armor', 'accessory']) {
      for (const it of Data.equipment[t].filter(e => e.tier === tier)) {
        list.push({ ...it, type: t })
      }
    }
  } else if (type === 'inventory') {
    list = p.inventory.map((it, i) => ({ ...it, invIdx: i }))
  } else if (type === 'forge') {
    list = ['weapon', 'armor', 'accessory'].map(slot => ({ slot, item: p[slot] }))
  }
}

function touch(x, y) {
  // 返回按钮
  if (x > S.LW - 70 && y > 14 && y < 50) { close(); return }
  // 滚动
  if (y > 60 && y < S.LH - 80) {
    if (y < 90) { scroll = Math.max(0, scroll - 1); return }
    if (y > S.LH - 110) { scroll = Math.max(0, scroll - 2); return }
  }
  // 列表项点击
  const itemH = 56
  const startY = 70
  const visible = Math.floor((S.LH - 160) / itemH)
  for (let i = 0; i < visible; i++) {
    const idx = scroll + i
    if (idx >= list.length) break
    const iy = startY + i * itemH
    if (y > iy && y < iy + itemH - 6) {
      handleItem(idx)
      return
    }
  }
}

function handleItem(idx) {
  const p = S.player
  const it = list[idx]
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

  const pw = S.LW * 0.92, ph = S.LH * 0.9
  const px = (S.LW - pw) / 2, py = (S.LH - ph) / 2
  roundRect(ctx, px, py, pw, ph, 16, COLORS.card, COLORS.goldBright, 2)

  const title = type === 'shop' ? '🏪 冒险者商店' : type === 'inventory' ? '🎒 背包' : '⚒️ 铁匠铺'
  text(ctx, title, px + pw / 2, py + 32, 20, COLORS.gold, 'center', true)
  text(ctx, '💰 ' + p.gold, px + pw / 2, py + 54, 13, COLORS.goldBright)

  // 返回按钮
  text(ctx, '✕', px + pw - 30, py + 30, 22, COLORS.red, 'center', true)

  // 列表
  const itemH = 56
  const startY = py + 70
  const visible = Math.floor((ph - 160) / itemH)
  for (let i = 0; i < visible; i++) {
    const idx = scroll + i
    if (idx >= list.length) break
    const iy = startY + i * itemH
    const it = list[idx]
    roundRect(ctx, px + 12, iy, pw - 24, itemH - 8, 8, '#1a1a2e', '#2a2a4a', 1.5)

    if (type === 'shop' || type === 'inventory') {
      const icon = it.type === 'weapon' ? '🗡️' : it.type === 'armor' ? '🛡️' : it.type === 'accessory' ? '💍' : '🧪'
      const stat = it.type === 'weapon' ? '攻+' + (it.attack || 0) : it.type === 'armor' ? '防+' + (it.defense || 0) : it.type === 'accessory' ? '血+' + (it.hp || 0) : '治疗'
      text(ctx, icon + ' ' + it.name + (it.enhanceLevel ? ' +' + it.enhanceLevel : ''), px + 20, iy + 18, 13, COLORS.text, 'left', true)
      text(ctx, stat, px + 20, iy + 38, 11, COLORS.textDim, 'left')
      if (type === 'shop') {
        text(ctx, '💰' + it.price, px + pw - 24, iy + 18, 13, COLORS.goldBright, 'right')
        text(ctx, type === 'shop' ? (p[it.type] ? '已有' : '') : '', px + pw - 24, iy + 38, 10, COLORS.textDark, 'right')
      } else {
        text(ctx, '点击使用/装备', px + pw - 24, iy + 28, 10, COLORS.textDark, 'right')
      }
    } else {
      // forge
      const slotName = it.slot === 'weapon' ? '🗡️ 武器' : it.slot === 'armor' ? '🛡️ 护甲' : '💍 饰品'
      if (it.item) {
        const it2 = it.item
        text(ctx, slotName + ' ' + it2.name + (it2.enhanceLevel ? ' +' + it2.enhanceLevel : ''), px + 20, iy + 18, 13, COLORS.text, 'left', true)
        const stat = it.slot === 'weapon' ? '攻+' + (it2.attack + (it2.enhanceLevel || 0) * 3) : it.slot === 'armor' ? '防+' + (it2.defense + (it2.enhanceLevel || 0) * 3) : '血+' + (it2.hp + (it2.enhanceLevel || 0) * 15)
        text(ctx, stat + '  (' + (it2.enhanceLevel || 0) + '/' + p.maxEnhanceLevel + ')', px + 20, iy + 38, 11, COLORS.textDim, 'left')
        const cost = p.getEnhanceCost(it2)
        const canUp = (it2.enhanceLevel || 0) < p.maxEnhanceLevel
        text(ctx, canUp ? '💰' + cost + ' 强化' : '已满级', px + pw - 24, iy + 28, 12, canUp ? COLORS.goldBright : COLORS.textDark, 'right')
      } else {
        text(ctx, slotName + ': 未装备', px + 20, iy + 28, 13, COLORS.textDark, 'left')
      }
    }
  }

  // 滚动提示
  if (list.length > visible) {
    text(ctx, '↑ 上滑 / ↓ 下滑', px + pw / 2, py + ph - 24, 11, COLORS.textDark)
  }
}

module.exports = { create, draw, touch }
