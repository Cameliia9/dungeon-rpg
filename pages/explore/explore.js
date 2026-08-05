const app = getApp()
const { generateRoomEvent } = require('../../utils/game-engine')

Page({
  data: {
    player: null,
    event: null,
    canDescend: false,
    roomsExplored: 0,
    dead: false  // 死亡标记，阻止操作
  },

  onLoad() {
    this.setData({ player: app.getPlayer() })
    this.checkDead()
  },

  onShow() {
    const player = app.getPlayer()
    this.setData({ player })
    this.checkDead()
  },

  // 统一死亡检查：血量为0则清除存档，弹窗提示重新开始
  checkDead() {
    const player = app.getPlayer()
    if (player && player.isDead()) {
      // 清除存档
      wx.removeStorageSync('dungeon_save')
      app.globalData.player = new (require('../../utils/game-engine').Player)('冒险者')
      this.setData({ player: app.getPlayer(), dead: true, event: null, canDescend: false })
      wx.showModal({
        title: '你死在了地牢中...',
        content: '冒险到此结束。是否重新开始？',
        confirmText: '重新开始',
        cancelText: '返回主页',
        success: (res) => {
          if (res.confirm) {
            this.setData({ dead: false, roomsExplored: 0 })
          } else {
            wx.navigateBack()
          }
        }
      })
    }
  },

  // 探索房间
  explore() {
    if (this.data.dead) return
    const player = app.getPlayer()
    const event = generateRoomEvent(player)

    // 处理即时事件
    if (event.type === 'treasure') {
      player.gold += event.gold
    } else if (event.type === 'rest') {
      player.heal(event.heal)
    } else if (event.type === 'equipment') {
      player.inventory.push(event.item)
    } else if (event.type === 'trap') {
      player.takeDamage(event.damage)
    }

    app.saveGame()

    const rooms = this.data.roomsExplored + 1

    // 陷阱或任何事件后检查死亡
    if (player.isDead()) {
      this.setData({ event, player, roomsExplored: rooms })
      this.checkDead()
      return
    }

    this.setData({
      event,
      player,
      canDescend: rooms >= 3,
      roomsExplored: rooms
    })
  },

  // 进入战斗
  goBattle() {
    if (this.data.dead) return
    const player = app.getPlayer()
    app.globalData.currentMonster = this.data.event.monster
    wx.navigateTo({ url: '/pages/battle/battle' })
  },

  // 逃跑
  runAway() {
    if (Math.random() < 0.5) {
      wx.showToast({ title: '逃跑成功！', icon: 'success' })
      this.nextRoom()
    } else {
      wx.showToast({ title: '逃跑失败！准备战斗', icon: 'error' })
      this.goBattle()
    }
  },

  // 下一个房间
  nextRoom() {
    if (this.data.dead) return
    const player = app.getPlayer()
    if (player.isDead()) {
      this.setData({ player, event: null, canDescend: false })
      this.checkDead()
      return
    }
    const rooms = this.data.roomsExplored
    if (rooms >= 3) {
      this.setData({
        event: { type: 'stairs' },
        canDescend: true,
        player
      })
    } else {
      this.setData({ event: null, player })
    }
  },

  // 下楼
  descend() {
    if (this.data.dead) return
    const player = app.getPlayer()
    player.floor++
    player.heal(Math.floor(player.totalMaxHp * 0.3))
    app.saveGame()
    this.setData({
      player,
      event: null,
      canDescend: false,
      roomsExplored: 0
    })
    wx.showToast({ title: `进入第 ${player.floor} 层！`, icon: 'success' })
  },

  goBack() {
    wx.navigateBack()
  }
})
