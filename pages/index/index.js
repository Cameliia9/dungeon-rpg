const ROOMS_PER_FLOOR = 10
const app = getApp()

Page({
  data: {
    screen: 'menu',
    difficulty: 'easy',
    hasSavedGame: false,

    player: null,
    hpPercent: 100,
    expPercent: 0,
    totalAttack: 0,
    totalDefense: 0,
    totalMaxHp: 0,
    expToLevel: 0,

    // 房间卡片堆叠
    roomCards: [],
    remainingRooms: 0,
    showStack: false
  },

  onShow() {
    try {
      const save = wx.getStorageSync('dungeon_save')
      this.setData({ hasSavedGame: !!save })
    } catch (e) {
      this.setData({ hasSavedGame: false })
    }
    if (this.data.screen === 'game') {
      this.refreshGame()
      this.checkDead()
    }
  },

  // ==================== 菜单 ====================

  newGame() { this.setData({ screen: 'difficulty' }) },

  continueGame() {
    if (!this.data.hasSavedGame) return
    const save = wx.getStorageSync('dungeon_save')
    const { loadPlayer } = require('../../utils/game-engine')
    app.globalData.player = loadPlayer(save)
    this.setData({ screen: 'game' })
    this.refreshGame()
  },

  openSettings() { wx.showToast({ title: '设置功能开发中', icon: 'none' }) },

  exitGame() {
    wx.showModal({
      title: '退出', content: '确定要退出吗？', confirmText: '退出',
      success: (res) => { if (res.confirm) this.setData({ screen: 'menu' }) }
    })
  },

  // ==================== 难度选择 ====================

  selectDifficulty(e) {
    const difficulty = e.currentTarget.dataset.level
    const { Player } = require('../../utils/game-engine')
    wx.removeStorageSync('dungeon_save')
    const player = new Player('冒险者')
    switch (difficulty) {
      case 'hard': player.maxHp = 80; player.hp = 80; player.baseAttack = 9; player.gold = 30; break
      case 'nightmare': player.maxHp = 60; player.hp = 60; player.baseAttack = 7; player.gold = 15; break
    }
    app.globalData.player = player
    app.saveGame()
    this.setData({ screen: 'game', difficulty })
    this.refreshGame()
  },

  backToMenu() { this.setData({ screen: 'menu' }) },

  // ==================== 游戏主页 ====================

  refreshGame() {
    const player = app.getPlayer()
    if (!player) return
    const explored = player.roomsExplored || 0
    const remaining = ROOMS_PER_FLOOR - explored
    const prevRemaining = this.data.remainingRooms

    // 生成房间卡片
    if (remaining !== prevRemaining || this.data.roomCards.length === 0) {
      this._buildCards(remaining, prevRemaining, explored)
    }

    this.setData({
      player,
      totalAttack: player.totalAttack,
      totalDefense: player.totalDefense,
      totalMaxHp: player.totalMaxHp,
      expToLevel: player.expToLevel(),
      hpPercent: Math.max(0, Math.floor((player.hp / player.totalMaxHp) * 100)),
      expPercent: Math.floor((player.exp / player.expToLevel()) * 100),
      remainingRooms: remaining
    })
  },

  _buildCards(remaining, prevRemaining, explored) {
    const currentLen = this.data.roomCards.length

    // 首次进入 or 房间数增加（下楼重置）→ 重建全部
    if (currentLen === 0 || remaining > currentLen) {
      const cards = []
      for (let i = 0; i < remaining; i++) {
        cards.push({ id: Date.now() + i, removing: false })
      }
      this.setData({ roomCards: cards, showStack: remaining > 0 })
      return
    }

    // 房间减少：标记多出的卡片为 removing，动画后移除
    if (remaining < currentLen) {
      const cards = this.data.roomCards.map((c, i) => {
        if (i >= remaining) return { ...c, removing: true }
        return c
      })
      this.setData({ roomCards: cards })
      setTimeout(() => {
        const cleaned = this.data.roomCards.filter(c => !c.removing)
        this.setData({ roomCards: cleaned, showStack: cleaned.length > 0 })
      }, 600)
    }
  },

  checkDead() {
    const player = app.getPlayer()
    if (player && player.isDead()) {
      wx.removeStorageSync('dungeon_save')
      app.globalData.player = null
      this.setData({ screen: 'menu', hasSavedGame: false, roomCards: [], showStack: false })
      wx.showToast({ title: '冒险结束，返回菜单', icon: 'none' })
    }
  },

  goExplore() {
    const player = app.getPlayer()
    if (player.isDead()) { this.checkDead(); return }
    wx.navigateTo({ url: '/pages/explore/explore' })
  },

  goInventory() { wx.navigateTo({ url: '/pages/inventory/inventory' }) },
  goShop() { wx.navigateTo({ url: '/pages/shop/shop' }) },

  restart() {
    wx.showModal({
      title: '确认重新开始？', content: '当前角色和所有进度将被清除。', confirmText: '确认', cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('dungeon_save')
          app.globalData.player = new (require('../../utils/game-engine').Player)('冒险者')
          app.saveGame()
          this.refreshGame()
        }
      }
    })
  }
})
