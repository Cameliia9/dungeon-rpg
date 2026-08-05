const GameEngine = require('./utils/game-engine')

App({
  onLaunch() {
    // 加载存档
    const saveData = wx.getStorageSync('dungeon_save')
    if (saveData) {
      this.globalData.player = GameEngine.loadPlayer(saveData)
      console.log('存档已加载，等级:', this.globalData.player.level)
    } else {
      this.globalData.player = new GameEngine.Player('冒险者')
      console.log('新冒险开始！')
    }
  },

  globalData: {
    player: null
  },

  // 保存游戏
  saveGame() {
    const data = GameEngine.savePlayer(this.globalData.player)
    wx.setStorageSync('dungeon_save', data)
  },

  // 获取玩家实例
  getPlayer() {
    return this.globalData.player
  }
})
