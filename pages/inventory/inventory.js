const app = getApp()

Page({
  data: {
    player: null
  },

  onShow() {
    this.setData({ player: app.getPlayer() })
  },

  // 装备物品
  equipItem(e) {
    const index = e.currentTarget.dataset.index
    const player = app.getPlayer()
    const item = player.inventory[index]
    if (item) {
      player.equip(item)
      app.saveGame()
      this.setData({ player })
      wx.showToast({ title: `装备了 ${item.name}`, icon: 'success' })
    }
  },

  // 卸下装备
  unequipWeapon() {
    const player = app.getPlayer()
    player.unequip('weapon')
    app.saveGame()
    this.setData({ player })
    wx.showToast({ title: '已卸下武器', icon: 'success' })
  },

  unequipArmor() {
    const player = app.getPlayer()
    player.unequip('armor')
    app.saveGame()
    this.setData({ player })
    wx.showToast({ title: '已卸下护甲', icon: 'success' })
  },

  unequipAccessory() {
    const player = app.getPlayer()
    player.unequip('accessory')
    app.saveGame()
    this.setData({ player })
    wx.showToast({ title: '已卸下饰品', icon: 'success' })
  },

  goBack() {
    wx.navigateBack()
  }
})
