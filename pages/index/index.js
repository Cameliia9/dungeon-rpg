const app = getApp()

Page({
  data: {
    // 界面状态: menu | difficulty | game
    screen: 'menu',
    // 难度: easy | hard | nightmare
    difficulty: 'easy',
    hasSavedGame: false,

    // 游戏界面数据
    player: null,
    hpPercent: 100,
    expPercent: 0,
    totalAttack: 0,
    totalDefense: 0,
    totalMaxHp: 0,
    expToLevel: 0
  },

  onShow() {
    // 检查是否有旧存档
    try {
      const save = wx.getStorageSync('dungeon_save')
      this.setData({ hasSavedGame: !!save })
    } catch (e) {
      this.setData({ hasSavedGame: false })
    }

    // 如果在游戏界面，刷新状态
    if (this.data.screen === 'game') {
      this.refreshGame()
      this.checkDead()
    }
    // 如果在菜单，但已有 player 且继续过游戏，自动显示菜单即可
  },

  // ==================== 菜单 ====================

  // 新游戏 → 弹出难度选择
  newGame() {
    this.setData({ screen: 'difficulty' })
  },

  // 继续游戏
  continueGame() {
    if (!this.data.hasSavedGame) return
    const save = wx.getStorageSync('dungeon_save')
    const { loadPlayer } = require('../../utils/game-engine')
    app.globalData.player = loadPlayer(save)
    this.setData({ screen: 'game' })
    this.refreshGame()
  },

  // 设置（占位）
  openSettings() {
    wx.showToast({ title: '设置功能开发中', icon: 'none' })
  },

  // 退出（小程序不能真退出，返回提示）
  exitGame() {
    wx.showModal({
      title: '退出',
      content: '确定要退出吗？',
      confirmText: '退出',
      success: (res) => {
        if (res.confirm) {
          // 微信小程序无法真退出，回到菜单
          this.setData({ screen: 'menu' })
        }
      }
    })
  },

  // ==================== 难度选择 ====================

  selectDifficulty(e) {
    const difficulty = e.currentTarget.dataset.level
    const { Player } = require('../../utils/game-engine')

    // 删除旧存档
    wx.removeStorageSync('dungeon_save')
    wx.removeStorageSync('explore_state')

    // 根据难度创建角色
    const player = new Player('冒险者', difficulty)

    switch (difficulty) {
      case 'easy':
        // 当前设定就是简单难度
        break
      case 'hard':
        // 玩家略弱，敌人攻×1.25 HP×1.1
        player.maxHp = 95
        player.hp = 95
        player.baseAttack = 11
        player.gold = 35
        break
      case 'nightmare':
        // 玩家更弱，敌人攻×1.5 HP×1.2
        player.maxHp = 90
        player.hp = 90
        player.baseAttack = 10
        player.gold = 20
        break
    }

    app.globalData.player = player
    app.saveGame()

    this.setData({ screen: 'game', difficulty })
    this.refreshGame()
  },

  // 返回菜单
  backToMenu() {
    this.setData({ screen: 'menu' })
  },

  // ==================== 游戏主页 ====================

  refreshGame() {
    const player = app.getPlayer()
    if (!player) return
    this.setData({
      player,
      totalAttack: player.totalAttack,
      totalDefense: player.totalDefense,
      totalCritPercent: Math.round(player.totalCrit * 100),
      totalDodgePercent: Math.round(player.totalDodge * 100),
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
      wx.removeStorageSync('explore_state')
      app.globalData.player = null
      this.setData({ screen: 'menu', hasSavedGame: false })
      wx.showToast({ title: '冒险结束，返回菜单', icon: 'none' })
    }
  },

  goExplore() {
    const player = app.getPlayer()
    if (player.isDead()) { this.checkDead(); return }
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
          wx.removeStorageSync('explore_state')
          app.globalData.player = new (require('../../utils/game-engine').Player)('冒险者')
          app.saveGame()
          this.refreshGame()
        }
      }
    })
  }
})
