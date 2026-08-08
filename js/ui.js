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

/** 文本（居中/左对齐） */
function text(ctx, str, x, y, size, color, align, bold) {
  ctx.fillStyle = color || COLORS.text
  ctx.font = (bold ? 'bold ' : '') + size + 'px sans-serif'
  ctx.textAlign = align || 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(str, x, y)
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

/** 绘制按钮 */
function drawBtn(ctx, b, theme) {
  const s = b.style
  const bg = s.bg || COLORS.card
  const border = s.border || COLORS.cardBorder
  const fg = s.fg || COLORS.text
  roundRect(ctx, b.x, b.y, b.w, b.h, s.r || 10, bg, border, 1.5)
  text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2, s.size || 15, fg, 'center', s.bold)
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

/** 按钮配色 */
const BTN = {
  primary: { bg: 'linear', border: '#e74c3c', fg: '#fff' },
  secondary: { bg: '#2c3e50', border: '#34495e', fg: '#ccc' },
  gold: { bg: '#d4a017', border: '#f0c040', fg: '#1a1a2e' },
  danger: { bg: '#8b0000', border: '#ff4444', fg: '#fff' },
  forge: { bg: '#b34700', border: '#ff8c1a', fg: '#fff' }
}

module.exports = { COLORS, roundRect, text, hpBar, makeBtn, drawBtn, hitBtn, BTN }
