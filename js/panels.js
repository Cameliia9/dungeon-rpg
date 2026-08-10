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
let enterTime = Date.now()  // 面板打开时间(渐显动画)
let touchStartY = null  // 拖动滚动状态
let touchStartX = 0
let dragged = false
let dragBase = 0
let bounce = null   // 回弹动画 {from, target, t0}: 滑过边界松手弹回
const M = 16        // 边距
const PW = () => S.LW - 32

function create(name, shared) {
  S = shared
  type = name
  scroll = 0
  btns = []
  enterTime = Date.now()
  build()
  return this
}

function build() {
  const p = S.player
  btns = []
  scroll = 0
  bounce = null
  sections = []
  layout = []
  if (type === 'shop') {
    // 对齐原版: 按当前层数阶数显示三分类装备
    shopTier = Math.min(Math.ceil(p.floor / 5), 5)
    themeName = Data.getThemeForFloor(p.floor).name
    sections = [
      { title: '🗡️ 武器', items: Data.equipment.weapon.filter(e => e.tier === shopTier).map(e => ({ ...e, type: 'weapon' })) },
      { title: '👕 上衣', items: Data.equipment.top.filter(e => e.tier === shopTier).map(e => ({ ...e, type: 'top' })) },
      { title: '👖 裤子', items: Data.equipment.pants.filter(e => e.tier === shopTier).map(e => ({ ...e, type: 'pants' })) },
      { title: '💍 饰品', items: Data.equipment.accessory.filter(e => e.tier === shopTier).map(e => ({ ...e, type: 'accessory' })) }
    ]
    let y = 208  // 标题卡下移后同步(卡顶200, 距标题卡底180为20px)
    for (let si = 0; si < sections.length; si++) {
      const sec = sections[si]
      const hi = layout.length
      layout.push({ kind: 'header', text: sec.title, y, endY: 0 }); y += 30
      for (const it of sec.items) {
        layout.push({ kind: 'item', item: it, y, h: 86 }); y += 94
      }
      layout[hi].endY = y - 8  // 分类卡底(卡间8px, 不重叠); 商品卡间隙靠行距94留出
      if (si < sections.length - 1) y += 8  // 分类间距8px(用户指定)
    }
    contentH = y
  } else if (type === 'inventory') {
    // 对齐原版: 当前装备区 + 物品列表
    list = p.inventory.map((it, i) => ({ ...it, invIdx: i }))
    layout.push({ kind: 'eqHeader', y: 168, endY: 0 })
    let y = 168 + 42
    layout.push({ kind: 'eqRow', slot: 'weapon', item: p.weapon, y, h: 46 }); y += 46
    layout.push({ kind: 'eqRow', slot: 'top', item: p.top, y, h: 46 }); y += 46
    layout.push({ kind: 'eqRow', slot: 'pants', item: p.pants, y, h: 46 }); y += 46
    layout.push({ kind: 'eqRow', slot: 'accessory1', item: p.accessory1, y, h: 46 }); y += 46
    layout.push({ kind: 'eqRow', slot: 'accessory2', item: p.accessory2, y, h: 46 }); y += 46
    layout[0].endY = y + 12  // 饰品行下方留白, 卡片加高
    const invHi = layout.length
    const invY = y + 52
    layout.push({ kind: 'invHeader', count: list.length, y: invY, endY: 0 })
    y = invY + 34  // 后续元素从标题卡内下方开始(原bug: y+=34导致与标题重叠)
    if (list.length === 0) {
      layout.push({ kind: 'invEmpty', y: y + 24 })
      y += 60
    } else {
      for (const it of list) {
        layout.push({ kind: 'item', item: it, y, h: 86 }); y += 94
      }
    }
    layout[invHi].endY = y - 8  // 分类卡底(对齐商店, 不重叠)
    contentH = y
  } else if (type === 'forge') {
    // 对齐原版: 武器/护甲/饰品三分类卡
    list = ['weapon', 'top', 'pants', 'accessory1', 'accessory2'].map(slot => ({ slot, item: p[slot] }))
    const titles = ['🗡️ 武器', '👕 上衣', '👖 裤子', '💍 饰品1', '💍 饰品2']
    let y = 208
    for (let si = 0; si < list.length; si++) {
      const hi = layout.length
      layout.push({ kind: 'header', text: titles[si], y, endY: 0 }); y += 30
      layout.push({ kind: 'item', item: list[si], y, h: 86 }); y += 94
      layout[hi].endY = y - 8  // 分类卡底(对齐商店, 不重叠)
      if (si < list.length - 1) y += 8  // 分类间距8px(对齐商店)
    }
    contentH = y
  }
}

function touch(x, y) {
  // ✕ 关闭(右上角)
  if (x > S.LW - 60 && y > M && y < M + 50) { close(); return }
  // 底部返回按钮(对齐原版 ↩️ 返回)
  if (y > S.LH - 60 && y < S.LH - 16 && x > M && x < M + PW()) { close(); return }
  // 列表区
  const th = type === 'shop' ? 100 : 58
  const topY = 80 + th + 10
  const bottomY = S.LH - 70
  if (y < topY || y > bottomY) return
  // 记录起点(点击/拖动统一在 touchEnd 判定; 边缘翻页也走这里, item优先)
  bounce = null  // 触摸打断回弹
  touchStartY = y
  touchStartX = x
  dragged = false
  dragBase = scroll
}

// 拖动滚动(重写): 轻触阈值12px, 拖动跟手
function touchMove(x, y) {
  if (touchStartY === null) return
  const dy = y - touchStartY
  if (Math.abs(dy) > 12) dragged = true
  if (dragged) {
    const th = type === 'shop' ? 100 : 58
    const topY = 80 + th + 10
    const bottomY = S.LH - 70
    const maxS = Math.max(0, contentH - (bottomY - topY))
    let target = dragBase - dy
    // 超出边界带阻尼(回弹效果): 超出部分衰减35%
    if (target < 0) target = target * 0.35
    else if (target > maxS) target = maxS + (target - maxS) * 0.35
    scroll = target
  }
}

// 鼠标滚轮滚动(开发者工具/模拟器): delta>0 向下滚
function wheel(delta) {
  const th = type === 'shop' ? 100 : 58
  const topY = 80 + th + 10
  const bottomY = S.LH - 70
  const maxS = Math.max(0, contentH - (bottomY - topY))
  scroll = Math.max(0, Math.min(maxS, scroll + (delta || 0)))
}

// 松手(重写): 未拖动=点击。先命中 item/eqRow(边缘的item也能点), 未命中再边缘翻页
function touchEnd() {
  if (touchStartY === null) return
  if (!dragged) {
    const cy = touchStartY + scroll
    let hit = false
    for (const el of layout) {
      if (el.kind === 'item' && cy > el.y && cy < el.y + el.h) {
        handleItem(el.item)
        hit = true
        break
      }
      if (el.kind === 'eqRow' && cy > el.y && cy < el.y + el.h) {
        const cx0 = M + 15, cw = PW() - 30
        if (el.item && touchStartX > cx0 + cw - 76 && touchStartX < cx0 + cw - 12) {
          unequipSlot(el.slot)
          hit = true
          break
        }
      }
    }
    // 未命中任何项: 顶部/底部边缘空白点击翻页
    if (!hit) {
      const th = type === 'shop' ? 100 : 58
      const topY = 80 + th + 10
      const bottomY = S.LH - 70
      const maxS = Math.max(0, contentH - (bottomY - topY))
      if (touchStartY < topY + 22) scroll = Math.max(0, scroll - 60)
      else if (touchStartY > bottomY - 22) scroll = Math.min(maxS, scroll + 60)
    }
  }
  // 松手: 超出边界启动回弹(250ms easeOut弹回)
  const th = type === 'shop' ? 100 : 58
  const topY = 80 + th + 10
  const bottomY = S.LH - 70
  const maxS = Math.max(0, contentH - (bottomY - topY))
  if (scroll < 0 || scroll > maxS) {
    bounce = { from: scroll, target: scroll < 0 ? 0 : maxS, t0: Date.now() }
  }
  touchStartY = null
}

function unequipSlot(slot) {
  const p = S.player
  if (!p[slot]) return
  const t = slot === 'accessory1' || slot === 'accessory2' ? 'accessory' : slot
  p.inventory.push({ ...p[slot], type: t })
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
    // 已有更好装备检查: 武器/上衣/裤子比单槽; 饰品比双槽(两槽都更好才拦截)
    let curVal = 0
    if (it.type === 'accessory') {
      const vs = [p.accessory1, p.accessory2].map(a => a ? (a.attack || a.defense || a.hp || 0) : 0)
      curVal = Math.min(...vs)
    } else {
      const cur = p[it.type]
      curVal = cur ? (cur.attack || cur.defense || cur.hp || 0) : 0
    }
    const itVal = it.attack || it.defense || it.hp || 0
    if (it.type !== 'accessory' ? !!p[it.type] && curVal >= itVal : (p.accessory1 && p.accessory2) && curVal >= itVal) { wx.showToast({ title: '已有更好装备', icon: 'none' }); return }
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
      // 用背包原对象equip(副本===匹配不上, 会导致装备后不移除)
      const orig = p.inventory[it.invIdx]
      if (orig) p.equip(orig)
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
  // 回弹动画(滑过边界松手弹回, 250ms easeOut)
  if (bounce) {
    const t = Math.min(1, (Date.now() - bounce.t0) / 250)
    const e = ui.easeOut(t)
    scroll = bounce.from + (bounce.target - bounce.from) * e
    if (t >= 1) { scroll = bounce.target; bounce = null }
  }
  // 打开渐显动画: 标题卡先淡入, 然后卡片逐个交错出现(对齐难度按钮风格)
  const p0 = ui.animProgress(enterTime, 0, 400)
  ctx.globalAlpha = p0
  // 背景: 探索页同款#0f0f1a
  ctx.fillStyle = '#0f0f1a'
  ctx.fillRect(0, 0, S.LW, S.LH)

  // ✕ 关闭(右上角悬浮)
  text(ctx, '✕', S.LW - M - 22, M + 22, 22, COLORS.red, 'center', true)

  // ===== 标题卡(下移到✕下方, 对齐原版: 标题+金币+区域/阶数) =====
  const th = (type === 'shop' || type === 'forge') ? 100 : 58
  const headY = 80
  roundRect(ctx, M, headY, PW(), th, 12, ui.cardFill(ctx, M, headY, PW(), th), COLORS.goldBright, 1.5)
  if (type === 'shop') {
    text(ctx, '🏪 冒险者商店', S.LW / 2, headY + 26, 20, COLORS.gold, 'center', true)
    text(ctx, '金币：' + p.gold + ' 💰', S.LW / 2, headY + 50, 13, COLORS.goldBright)
    text(ctx, '当前区域：' + themeName + ' · 第 ' + shopTier + ' 阶装备', S.LW / 2, headY + 74, 12, '#6a6a7a')
  } else if (type === 'inventory') {
    text(ctx, '🎒 背包', S.LW / 2, headY + 24, 20, COLORS.gold, 'center', true)
    text(ctx, '金币：' + p.gold + ' 💰', S.LW / 2, headY + 44, 12, COLORS.goldBright)
  } else {
    text(ctx, '⚒️ 铁匠铺', S.LW / 2, headY + 24, 20, COLORS.gold, 'center', true)
    text(ctx, '金币：' + p.gold + ' 💰', S.LW / 2, headY + 48, 12, COLORS.goldBright)
    text(ctx, '本层强化上限：+' + p.maxEnhanceLevel + '（每过5层解锁+1）', S.LW / 2, headY + 70, 11, '#6a6a7a')
  }
  ctx.globalAlpha = 1

  // ===== 列表区(可滚动, 裁剪) =====
  const topY = headY + th + 10
  const bottomY = S.LH - 70
  ctx.save()
  ctx.beginPath()
  ctx.rect(M, topY, PW(), bottomY - topY)
  ctx.clip()
  let elIdx = 0
  for (const el of layout) {
    const ey = el.y - scroll
    // 分类卡: 按整卡范围判断可见性(标题滚出屏幕但卡背景还在可视区时必须继续绘制, 否则背景消失)
    if (el.kind === 'header' || el.kind === 'eqHeader' || el.kind === 'invHeader') {
      const cardH2 = el.endY - el.y + 8
      const cardTop = ey - 8
      if (cardTop + cardH2 < topY - 80 || cardTop > bottomY + 10) continue
    } else {
      if (ey < topY - 80 || ey > bottomY + 10) continue
    }
    // 每个卡片逐个淡入(80ms递增, 400ms完成, 对齐难度按钮)
    const elFade = ui.animProgress(enterTime, 80 + elIdx * 70, 400)
    ctx.globalAlpha = elFade
    if (el.kind === 'header' || el.kind === 'eqHeader' || el.kind === 'invHeader') {
      // 分类卡片背景(对齐原版 .card 渐变, 包住标题+其下内容)
      const cardH2 = el.endY - el.y + 8
      roundRect(ctx, M, ey - 8, PW(), cardH2, 12, ui.cardFill(ctx, M, ey - 8, PW(), cardH2), COLORS.cardBorder, 1.5)
      text(ctx, el.kind === 'header' ? el.text : el.kind === 'eqHeader' ? '当前装备' : '背包物品（' + el.count + '件）', M + 12, ey + 14, 15, '#e0c080', 'left', true)
    } else if (el.kind === 'eqRow') {
      drawEquipRow(ctx, el, ey)
    } else if (el.kind === 'item') {
      drawItemRow(ctx, el.item, ey, el.h)
    } else if (el.kind === 'invEmpty') {
      text(ctx, '背包空空如也，去地牢冒险获取装备吧！', S.LW / 2, ey, 12, '#666666')
    }
    ctx.globalAlpha = 1
    elIdx++
  }
  ctx.restore()

  // 右侧滚动条(淡入); 滚动靠拖动/鼠标滚轮
  ctx.globalAlpha = ui.animProgress(enterTime, 500, 400)
  const maxS = Math.max(0, contentH - (bottomY - topY))
  if (maxS > 0) {
    const barH = Math.max(22, (bottomY - topY) * (bottomY - topY) / contentH)
    const barY = topY + (bottomY - topY - barH) * (scroll / maxS)
    roundRect(ctx, S.LW - 10, barY, 4, barH, 2, 'rgba(255,255,255,0.45)')
  }

  // ===== 底部返回按钮(对齐原版 ↩️ 返回, 最后淡入) =====
  ctx.globalAlpha = ui.animProgress(enterTime, 600, 400)
  drawBtn(ctx, makeBtn(M, S.LH - 60, PW(), 44, '↩️ 返回', null, ui.BTN.secondary))
  ctx.globalAlpha = 1
}

// 装备项(商店/背包/铁匠铺, 4行舒展布局, 卡片不顶两边)
function drawItemRow(ctx, it, y, h) {
  const p = S.player  // forge分支需要(漏了会导致ReferenceError, 铁匠铺画不全)
  // 原版: 背景#141428 边框#2a2a4a 圆角8; 卡内缩进10px不顶两边
  const cx0 = M + 15, cw = PW() - 30
  roundRect(ctx, cx0, y, cw, h - 10, 8, '#141428', '#2a2a4a', 1)
  const x = cx0 + 14
  const btnW = type === 'shop' ? 80 : 72
  const btnX = cx0 + cw - btnW - 12
  const rightEdge = btnX - 10  // 文本右边界(按钮左侧)
  if (type === 'shop') {
    // 行1: 名称(粗体, 截断)
    let name = it.name
    while (name.length > 1 && ui.textWidth(ctx, name, 15) > rightEdge - x) name = name.slice(0, -1)
    text(ctx, name, x, y + 18, 15, COLORS.text, 'left', true)
    // 行2: 主属性(攻红/防蓝/血绿)
    let prop = '', propColor = COLORS.textDim
    if (it.attack) { prop = '攻击 +' + it.attack; propColor = '#e74c3c' }
    else if (it.defense) { prop = '防御 +' + it.defense; propColor = '#3498db' }
    else if (it.hp) { prop = '生命上限 +' + it.hp; propColor = '#2ecc71' }
    text(ctx, prop, x, y + 38, 13, propColor, 'left', true)
    // 行3: 副属性(暴击黄/闪避蓝) + 描述紧随同行
    let sub = ''
    if (it.critChance) sub += '⚡暴击+' + Math.round(it.critChance * 100) + '% '
    if (it.dodgeChance) sub += '💨闪避+' + Math.round(it.dodgeChance * 100) + '%'
    const subW = ui.textWidth(ctx, sub, 11)
    let desc = it.desc || ''
    while (desc.length > 1 && ui.textWidth(ctx, sub + desc, 11) > rightEdge - x) desc = desc.slice(0, -1)
    text(ctx, sub, x, y + 55, 11, '#ffaa00', 'left')
    text(ctx, desc, x + subW + 6, y + 55, 11, '#666666', 'left')
    // 右侧💰价格金按钮(垂直居中)
    drawBtn(ctx, makeBtn(btnX, y + 21, btnW, 34, '💰 ' + it.price, null, { ...ui.BTN.gold, size: 12 }))
  } else if (type === 'inventory') {
    const icon = it.type === 'weapon' ? '🗡️' : (it.type === 'top' || it.type === 'pants' || it.type === 'armor') ? '🛡️' : it.type === 'accessory' ? '💍' : '🧪'
    let name = icon + ' ' + it.name
    while (name.length > 2 && ui.textWidth(ctx, name, 15) > rightEdge - x) name = name.slice(0, -1)
    text(ctx, name, x, y + 18, 15, COLORS.text, 'left', true)
    let prop = ''
    if (it.type === 'potion') prop = '治疗'
    else {
      if (it.attack) prop += '攻击+' + it.attack + ' '
      if (it.defense) prop += '防御+' + it.defense + ' '
      if (it.hp) prop += '生命+' + it.hp
    }
    text(ctx, prop, x, y + 38, 13, '#8a8a9a', 'left')
    // 行3: 副属性(暴击黄/闪避蓝) + 描述紧随同行
    let sub2 = ''
    if (it.type === 'potion') sub2 = it.desc || ''
    else {
      if (it.critChance) sub2 += '⚡暴击+' + Math.round(it.critChance * 100) + '% '
      if (it.dodgeChance) sub2 += '💨闪避+' + Math.round(it.dodgeChance * 100) + '%'
    }
    const subW2 = ui.textWidth(ctx, sub2, 11)
    let desc = it.desc || ''
    while (desc.length > 1 && ui.textWidth(ctx, sub2 + desc, 11) > rightEdge - x) desc = desc.slice(0, -1)
    text(ctx, sub2, x, y + 55, 11, '#ffaa00', 'left')
    text(ctx, desc, x + subW2 + 6, y + 55, 11, '#666666', 'left')
    drawBtn(ctx, makeBtn(btnX, y + 21, btnW, 34, it.type === 'potion' ? '使用' : '装备', null, it.type === 'potion' ? ui.BTN.gold : ui.BTN.primary))
  } else {
    // forge (对齐原版: 名称+强化等级 / 主属性彩色 / 当前强化行 + 强化按钮)
    if (it.item) {
      const it2 = it.item
      let name = it2.name
      while (name.length > 1 && ui.textWidth(ctx, name, 15) > rightEdge - x) name = name.slice(0, -1)
      text(ctx, name, x, y + 18, 15, COLORS.text, 'left', true)
      if (it2.enhanceLevel) text(ctx, '+' + it2.enhanceLevel, x + ui.textWidth(ctx, name, 15) + 6, y + 18, 13, '#ffaa00', 'left', true)
      // 主属性(攻红/防蓝/血绿)
      let stat = '', statColor = COLORS.textDim
      if (it.slot === 'weapon') { stat = '攻击 +' + (it2.attack + (it2.enhanceLevel || 0) * 3); statColor = '#e74c3c' }
      else if (it.slot === 'top' || it.slot === 'pants') { stat = '防御 +' + ((it2.defense || 0) + (it2.enhanceLevel || 0) * 3); statColor = '#3498db' }
      else { stat = '生命上限 +' + ((it2.hp || 0) + (it2.enhanceLevel || 0) * 15); statColor = '#2ecc71' }
      text(ctx, stat, x, y + 38, 13, statColor, 'left', true)
      // 当前强化
      text(ctx, '当前强化：+' + (it2.enhanceLevel || 0) + ' / +' + p.maxEnhanceLevel, x, y + 55, 11, '#8a8a9a', 'left')
      // 强化按钮
      const cost = p.getEnhanceCost(it2)
      const canUp = (it2.enhanceLevel || 0) < p.maxEnhanceLevel
      drawBtn(ctx, makeBtn(btnX, y + 21, btnW, 34, canUp ? '💰 ' + cost + ' 强化' : '已满级', null, canUp ? ui.BTN.forge : ui.BTN.secondary))
    } else {
      // 未装备(对齐原版: 居中灰字)
      const slotName = it.slot === 'weapon' ? '武器' : it.slot === 'top' ? '上衣' : it.slot === 'pants' ? '裤子' : '饰品'
      text(ctx, '未装备' + slotName, S.LW / 2, y + 32, 13, '#555555')
    }
  }
}

// 背包当前装备行(对齐原版: 紫色槽位名 + 名称(+X) + 卸下按钮)
function drawEquipRow(ctx, el, y) {
  const cx0 = M + 15, cw = PW() - 30
  roundRect(ctx, cx0, y, cw, el.h - 4, 8, '#1a1a3e')
  const x = cx0 + 14
  const slotName = el.slot === 'weapon' ? '🗡️ 武器' : el.slot === 'top' ? '👕 上衣' : el.slot === 'pants' ? '👖 裤子' : '💍 饰品'
  text(ctx, slotName, x, y + 18, 13, '#a080ff', 'left', true)
  if (el.item) {
    const it = el.item
    let stat = ''
    if (el.slot === 'weapon') stat = '(+' + it.attack + '攻)'
    else if (el.slot === 'top' || el.slot === 'pants') stat = '(+' + (it.defense || 0) + '防)'
    else {
      if (it.hp) stat = '(+' + it.hp + '血)'
      else if (it.attack) stat = '(+' + it.attack + '攻)'
      else if (it.defense) stat = '(+' + it.defense + '防)'
      else if (it.critChance) stat = '(暴+' + Math.round(it.critChance * 100) + '%)'
      else if (it.dodgeChance) stat = '(闪+' + Math.round(it.dodgeChance * 100) + '%)'
    }
    text(ctx, it.name + ' ' + stat, x + 76, y + 18, 13, COLORS.text, 'left', true)
    drawBtn(ctx, makeBtn(cx0 + cw - 76, y + 7, 64, 26, '卸下', null, ui.BTN.secondary))
  } else {
    text(ctx, '空', x + 76, y + 18, 13, '#666666', 'left')
  }
}

module.exports = { create, draw, touch, touchMove, touchEnd, wheel }
