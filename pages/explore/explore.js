const app = getApp()
const { generateRoomEvent } = require('../../utils/game-engine')

Page({
  data: {
    player: null,
    event: null,
    canDescend: false,
    roomsExplored: 0
  },

  onLoad() {
    this.setData({ player: app.getPlayer() })
  },

  onShow() {
    this.setData({ player: app.getPlayer() })
  },

  // 探索房间
  explore() {
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
    this.setData({
      event,
      player,
      canDescend: rooms >= 3 && !player.isDead(),
      roomsExplored: rooms
    })
  },

  // 进入战斗
  goBattle() {
    const player = app.getPlayer()
    // 将怪物数据暂存到全局
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
    const player = app.getPlayer()
    if (player.isDead()) {
      this.setData({ player, event: null, canDescend: false })
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
    const player = app.getPlayer()
    player.floor++
    player.heal(Math.floor(player.totalMaxHp * 0.3)) // 下楼回30%血
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
