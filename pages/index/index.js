const app = getApp()

Page({
  data: {
    player: null,
    hpPercent: 100,
    expPercent: 0
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const player = app.getPlayer()
    this.setData({
      player,
      hpPercent: Math.max(0, Math.floor((player.hp / player.totalMaxHp) * 100)),
      expPercent: Math.floor((player.exp / player.expToLevel()) * 100)
    })
  },

  goExplore() {
    wx.navigateTo({ url: '/pages/explore/explore' })
  },

  goInventory() {
    wx.navigateTo({ url: '/pages/inventory/inventory' })
  },

  goShop() {
    wx.navigateTo({ url: '/pages/shop/shop' })
  },

  restart() {
    wx.removeStorageSync('dungeon_save')
    app.globalData.player = new (require('../../utils/game-engine').Player)('冒险者')
    app.saveGame()
    this.refresh()
  }
})
