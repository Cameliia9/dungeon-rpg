const app = getApp()

Page({
  data: {
    player: null,
    hpPercent: 100,
    expPercent: 0,
    totalAttack: 0,
    totalDefense: 0,
    totalMaxHp: 0,
    expToLevel: 0
  },

  onShow() {
    this.refresh()
    this.checkDead()
  },

  refresh() {
    const player = app.getPlayer()
    if (!player) return
    this.setData({
      player,
      totalAttack: player.totalAttack,
      totalDefense: player.totalDefense,
      totalMaxHp: player.totalMaxHp,
      expToLevel: player.expToLevel(),
      hpPercent: Math.max(0, Math.floor((player.hp / player.totalMaxHp) * 100)),
      expPercent: Math.floor((player.exp / player.expToLevel()) * 100)
    })
  },

  checkDead() {
    const player = app.getPlayer()
    if (player && player.isDead()) {
      wx.removeStorageSync('dungeon_save')
      app.globalData.player = new (require('../../utils/game-engine').Player)('冒险者')
      app.saveGame()
      this.refresh()
      wx.showToast({ title: '冒险结束，已重置', icon: 'none' })
    }
  },

  goExplore() {
    const player = app.getPlayer()
    if (player.isDead()) {
      this.checkDead()
      return
    }
    wx.navigateTo({ url: '/pages/explore/explore' })
  },

  goInventory() {
    wx.navigateTo({ url: '/pages/inventory/inventory' })
  },

  goShop() {
    wx.navigateTo({ url: '/pages/shop/shop' })
  },

  restart() {
    wx.showModal({
      title: '确认重新开始？',
      content: '当前角色和所有进度将被清除。',
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('dungeon_save')
          app.globalData.player = new (require('../../utils/game-engine').Player)('冒险者')
          app.saveGame()
          this.refresh()
        }
      }
    })
  }
})
