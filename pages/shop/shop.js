const app = getApp()
const { equipment } = require('../../utils/data')

Page({
  data: {
    player: null,
    weapons: equipment.weapon,
    armors: equipment.armor,
    accessories: equipment.accessory
  },

  onShow() {
    this.setData({ player: app.getPlayer() })
  },

  // 购买武器
  buyWeapon(e) {
    this.buyItem(e.currentTarget.dataset.item, 'weapon')
  },

  // 购买护甲
  buyArmor(e) {
    this.buyItem(e.currentTarget.dataset.item, 'armor')
  },

  // 购买饰品
  buyAccessory(e) {
    this.buyItem(e.currentTarget.dataset.item, 'accessory')
  },

  buyItem(item, type) {
    const player = app.getPlayer()

    if (player.gold < item.price) {
      wx.showToast({ title: '金币不足！', icon: 'error' })
      return
    }

    // 检查是否已有更好的装备
    const currentEquip = player[type]
    if (currentEquip && currentEquip.price >= item.price) {
      wx.showToast({ title: '你已有更好的装备', icon: 'none' })
      return
    }

    player.gold -= item.price
    const boughtItem = { ...item, type }
    player.inventory.push(boughtItem)
    app.saveGame()
    this.setData({ player })
    wx.showToast({ title: `购买了 ${item.name}！已放入背包`, icon: 'success' })
  },

  goBack() {
    wx.navigateBack()
  }
})
