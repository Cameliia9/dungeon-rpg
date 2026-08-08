/**
 * 小游戏 UI 绘制工具
 * 深色奇幻风格，与小程序版一致
 */
const COLORS = {
  bgTop: '#1a1a2e',
  bgBottom: '#0f0f1a',
  card: '#141428',
  cardBorder: '#2a2a4a',
  gold: '#e0c080',
  goldBright: '#f0c040',
  text: '#e8e8f0',
  textDim: '#8a8a9a',
  textDark: '#6a6a7a',
  red: '#e74c3c',
  green: '#2ecc71',
  blue: '#3498db',
  purple: '#9b59b6',
  orange: '#ff8c1a',
  crit: '#ffaa00',
  dodge: '#3498db'
}

/** 卡片渐变背景(对齐原版 .card: linear-gradient 135deg #1a1a2e→#16213e) */
function cardFill(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h)
  g.addColorStop(0, '#1a1a2e')
  g.addColorStop(1, '#16213e')
  return g
}

/** 圆角矩形 */
function roundRect(ctx, x, y, w, h, r, fill, stroke, lineW) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineW || 2; ctx.stroke() }
}

/** 文本（居中/左对齐）；可选动画：alpha 透明度, offsetY 上滑偏移 */
function text(ctx, str, x, y, size, color, align, bold, alpha, offsetY) {
  ctx.globalAlpha = alpha === undefined ? 1 : alpha
  ctx.fillStyle = color || COLORS.text
  ctx.font = (bold ? 'bold ' : '') + size + 'px sans-serif'
  ctx.textAlign = align || 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(str, x, y + (offsetY || 0))
  ctx.globalAlpha = 1
}

/** 血条 */
function hpBar(ctx, x, y, w, h, ratio, color) {
  roundRect(ctx, x, y, w, h, h / 2, '#2a2a3a')
  if (ratio > 0) {
    const c = color || (ratio > 0.5 ? COLORS.green : ratio > 0.25 ? COLORS.goldBright : COLORS.red)
    roundRect(ctx, x + 2, y + 2, (w - 4) * Math.max(0, Math.min(1, ratio)), h - 4, (h - 4) / 2, c)
  }
}

/** 按钮（返回点击区域） */
function makeBtn(x, y, w, h, label, cb, style) {
  return { x, y, w, h, label, cb, style: style || {} }
}

/** 绘制按钮（渐变背景，对齐小程序原版）；可选动画：alpha, offsetY */
function drawBtn(ctx, b, theme, alpha, offsetY) {
  const s = b.style
  const bg1 = s.bg1 || s.bg || COLORS.card
  const bg2 = s.bg2 || bg1
  const border = s.border || COLORS.cardBorder
  const fg = s.fg || COLORS.text
  const oy = offsetY || 0
  ctx.globalAlpha = alpha === undefined ? 1 : alpha
  // 渐变背景
  const g = ctx.createLinearGradient(b.x, b.y + oy, b.x + b.w, b.y + oy + b.h)
  g.addColorStop(0, bg1)
  g.addColorStop(1, bg2)
  ctx.fillStyle = g
  ctx.beginPath()
  const r = s.r || 8
  const x = b.x, y = b.y + oy, w = b.w, h = b.h
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1.5; ctx.stroke() }
  text(ctx, b.label, b.x + b.w / 2, b.y + oy + b.h / 2, s.size || 15, fg, 'center', s.bold)
  ctx.globalAlpha = 1
}

/** 检测点击是否命中按钮 */
function hitBtn(btns, x, y) {
  for (const b of btns) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      return b
    }
  }
  return null
}

/** easeOut 缓动 */
function easeOut(t) {
  return 1 - Math.pow(1 - t, 3)
}

/** 入场动画进度: 0~1（含 delay 交错），超出返回 1 */
function animProgress(startTime, delay, duration) {
  const now = Date.now()
  const t = (now - startTime - delay) / duration
  if (t <= 0) return 0
  if (t >= 1) return 1
  return easeOut(t)
}

/** 按钮配色（对齐小程序原版渐变） */
const BTN = {
  primary: { bg1: '#c0392b', bg2: '#e74c3c', border: 'rgba(255,255,255,0.15)', fg: '#ffffff' },
  secondary: { bg1: '#2c3e50', bg2: '#34495e', border: 'rgba(255,255,255,0.1)', fg: '#cccccc' },
  gold: { bg1: '#d4a017', bg2: '#f0c040', border: 'rgba(255,255,255,0.25)', fg: '#1a1a2e' },
  danger: { bg1: '#8b0000', bg2: '#c0392b', border: 'rgba(255,255,255,0.15)', fg: '#ffffff' },
  forge: { bg1: '#b34700', bg2: '#ff8c1a', border: 'rgba(255,255,255,0.2)', fg: '#ffffff' }
}

module.exports = { COLORS, roundRect, text, hpBar, makeBtn, drawBtn, hitBtn, BTN, cardFill, easeOut, animProgress }
