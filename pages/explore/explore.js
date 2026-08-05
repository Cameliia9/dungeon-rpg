const app = getApp()
const { generateRoomEvent } = require('../../utils/game-engine')

Page({
  data: {
    player: null,
    event: null,
    canDescend: false,
    roomsExplored: 0,
    dead: false,
    totalAttack: 0,
    totalDefense: 0,
    totalMaxHp: 0
  },

  onLoad() {
    this.refreshPlayer()
    this.checkDead()
  },

  onShow() {
    this.refreshPlayer()
    this.checkDead()
  },

  refreshPlayer() {
    const player = app.getPlayer()
    if (!player) return
    this.setData({
      player,
      totalAttack: player.totalAttack,
      totalDefense: player.totalDefense,
      totalMaxHp: player.totalMaxHp
    })
  },

  checkDead() {
    const player = app.getPlayer()
    if (player && player.isDead()) {
      wx.removeStorageSync('dungeon_save')
      app.globalData.player = new (require('../../utils/game-engine').Player)('冒险者')
      this.refreshPlayer()
      this.setData({ dead: true, event: null, canDescend: false })
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

  explore() {
    if (this.data.dead) return
    const player = app.getPlayer()
    const event = generateRoomEvent(player)

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

    if (player.isDead()) {
      this.refreshPlayer()
      this.setData({ event, roomsExplored: rooms })
      this.checkDead()
      return
    }

    this.refreshPlayer()
    this.setData({
      event,
      canDescend: rooms >= 3,
      roomsExplored: rooms
    })
  },

  goBattle() {
    if (this.data.dead) return
    app.globalData.currentMonster = this.data.event.monster
    wx.navigateTo({ url: '/pages/battle/battle' })
  },

  runAway() {
    if (Math.random() < 0.5) {
      wx.showToast({ title: '逃跑成功！', icon: 'success' })
      this.nextRoom()
    } else {
      wx.showToast({ title: '逃跑失败！准备战斗', icon: 'error' })
      this.goBattle()
    }
  },

  nextRoom() {
    if (this.data.dead) return
    const player = app.getPlayer()
    if (player.isDead()) {
      this.refreshPlayer()
      this.setData({ event: null, canDescend: false })
      this.checkDead()
      return
    }
    const rooms = this.data.roomsExplored
    if (rooms >= 3) {
      this.refreshPlayer()
      this.setData({ event: { type: 'stairs' }, canDescend: true })
    } else {
      this.refreshPlayer()
      this.setData({ event: null })
    }
  },

  descend() {
    if (this.data.dead) return
    const player = app.getPlayer()
    player.floor++
    player.heal(Math.floor(player.totalMaxHp * 0.3))
    app.saveGame()
    this.refreshPlayer()
    this.setData({
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
