const app = getApp()

Page({
  data: {
    player: null,
    weapon: null,
    armor: null,
    accessory: null,
    maxEnhance: 1
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const player = app.getPlayer()
    if (!player) return
    // 预计算强化费用（WXML 不支持复杂表达式）
    const prep = (item) => {
      if (!item) return null
      return { ...item, cost: player.getEnhanceCost(item) }
    }
    this.setData({
      player,
      weapon: prep(player.weapon),
      armor: prep(player.armor),
      accessory: prep(player.accessory),
      maxEnhance: player.maxEnhanceLevel
    })
  },

  // 强化
  enhance(e) {
    const slot = e.currentTarget.dataset.slot
    const player = app.getPlayer()
    const item = player[slot]
    if (!item) { wx.showToast({ title: '还没有装备', icon: 'none' }); return }

    const lv = item.enhanceLevel || 0
    if (lv >= player.maxEnhanceLevel) {
      wx.showToast({ title: `已达本层强化上限(+${lv})`, icon: 'none' })
      return
    }

    const cost = player.getEnhanceCost(item)
    if (player.gold < cost) {
      wx.showToast({ title: `金币不足！需要 ${cost}💰`, icon: 'error' })
      return
    }

    player.enhance(item)
    app.saveGame()
    this.refresh()
    wx.showToast({ title: `强化成功！+${lv + 1}`, icon: 'success' })
  },

  goBack() {
    wx.navigateBack()
  }
})
