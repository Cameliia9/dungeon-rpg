const app = getApp()
const { equipment, getThemeForFloor } = require('../../utils/data')

Page({
  data: {
    player: null,
    weapons: [],
    armors: [],
    accessories: [],
    shopTier: 1,
    themeName: ''
  },

  onShow() {
    this.refreshShop()
  },

  // 根据玩家当前层数刷新商店（只显示当前 tier 的装备）
  refreshShop() {
    const player = app.getPlayer()
    if (!player) return
    const tier = Math.min(Math.ceil(player.floor / 5), 5)
    const theme = getThemeForFloor(player.floor)
    this.setData({
      player,
      shopTier: tier,
      themeName: theme.name,
      weapons: equipment.weapon.filter(e => e.tier === tier),
      armors: equipment.armor.filter(e => e.tier === tier),
      accessories: equipment.accessory.filter(e => e.tier === tier)
    })
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

    // 检查是否已有更好的装备（同类型同槽位比较主属性）
    const currentEquip = player[type]
    if (currentEquip) {
      const currentVal = currentEquip.attack || currentEquip.defense || currentEquip.hp || 0
      const itemVal = item.attack || item.defense || item.hp || 0
      if (currentVal >= itemVal) {
        wx.showToast({ title: '你已有更好的装备', icon: 'none' })
        return
      }
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
