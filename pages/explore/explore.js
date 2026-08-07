const app = getApp()
const { generateTwoRoomEvents } = require('../../utils/game-engine')

Page({
  data: {
    player: null,
    leftEvent: null,
    rightEvent: null,
    activeEvent: null,
    activeSide: null,        // 'left' | 'right' | null
    trapResult: null,
    canDescend: false,
    roomsExplored: 0,
    totalAttack: 0,
    totalDefense: 0,
    totalMaxHp: 0,
    expToLevel: 0
  },

  onLoad() {
    this.refreshPlayer()
    this.generateEvents()
    this.checkDead()
  },

  onShow() {
    this.refreshPlayer()
    if (this.data.activeEvent && (this.data.activeEvent.type === 'monster' || this.data.activeEvent.type === 'camp_ambush') && !app.globalData.currentMonsterData) {
      this.finishEvent(this.data.activeSide || 'left')
    }
    this.checkDead()
  },

  refreshPlayer() {
    const player = app.getPlayer()
    if (!player) return
    this.setData({
      player,
      totalAttack: player.totalAttack,
      totalDefense: player.totalDefense,
      totalMaxHp: player.totalMaxHp,
      expToLevel: player.expToLevel()
    })
  },

  checkDead() {
    const player = app.getPlayer()
    if (player && player.isDead()) {
      wx.removeStorageSync('dungeon_save')
      app.globalData.player = null
      this.setData({ activeEvent: null, activeSide: null })
      wx.showModal({
        title: '你死在了地牢中...',
        content: '冒险到此结束，返回主菜单。',
        confirmText: '返回菜单',
        showCancel: false,
        success: () => { wx.reLaunch({ url: '/pages/index/index' }) }
      })
    }
  },

  // ==================== 事件生成 ====================

  generateEvents() {
    if (this.data.canDescend) return
    const player = app.getPlayer()
    if (!player || player.isDead()) return
    const [left, right] = generateTwoRoomEvents(player)
    this.setData({ leftEvent: left, rightEvent: right, activeEvent: null, activeSide: null })
  },

  // 生成一个新事件（和左门不同）
  generateNewRight() {
    const player = app.getPlayer()
    if (!player) return
    const [a, b] = generateTwoRoomEvents(player)
    // 确保和左门不同
    const leftType = this.data.leftEvent && this.data.leftEvent.type
    const newRight = (a.type !== leftType) ? a : b
    this.setData({ rightEvent: newRight })
  },

  // ==================== 方向选择 ====================

  goLeft() {
    if (this.data.activeEvent) return // 正在处理事件中
    this.pickEvent('left')
  },

  goRight() {
    if (this.data.activeEvent) return
    this.pickEvent('right')
  },

  pickEvent(side) {
    const event = side === 'left' ? this.data.leftEvent : this.data.rightEvent
    if (!event) return

    const player = app.getPlayer()

    // 自动类事件：立即生效
    switch (event.type) {
      case 'treasure':
        player.gold += event.gold
        app.saveGame()
        this.setActiveAndFinish(event, side)
        return
      case 'spring':
        player.heal(event.heal)
        app.saveGame()
        this.setActiveAndFinish(event, side)
        return
      case 'trap': {
        const dodged = Math.random() < event.dodgeChance
        let dmg = 0
        if (!dodged) {
          dmg = Math.max(1, Math.floor(player.hp * 0.15))
          player.hp = Math.max(0, player.hp - dmg)
        }
        app.saveGame()
        this.setData({ activeEvent: event, activeSide: side, trapResult: { dodged, damage: dmg } })
        this.refreshPlayer()
        if (player.isDead()) { this.checkDead(); return }
        return
      }
      case 'deadend':
        app.saveGame()
        this.setActiveAndFinish(event, side)
        return
      case 'coins':
        player.gold += event.gold
        app.saveGame()
        this.setActiveAndFinish(event, side)
        return
      case 'buffStone':
        player.tempAttackBuff = (player.tempAttackBuff || 0) + event.attackBonus
        app.saveGame()
        this.setActiveAndFinish(event, side)
        return
    }

    // 交互类：设 activeEvent，等待用户操作
    this.setData({ activeEvent: event, activeSide: side })
    if (player.isDead()) { this.refreshPlayer(); this.checkDead() }
  },

  // 显示自动事件结果，1.5秒后自动推进
  setActiveAndFinish(event, side) {
    this.setData({ activeEvent: event, activeSide: side })
    this.refreshPlayer()
    setTimeout(() => {
      this.finishEvent(side)
    }, 1500)
  },

  // ==================== 事件完成 → 推门 ====================

  finishEvent(side) {
    if (this.data.canDescend) return
    const player = app.getPlayer()
    if (!player || player.isDead()) { this.checkDead(); return }

    const rooms = this.data.roomsExplored + 1

    if (rooms >= 3) {
      // 3个房间后出楼梯
      this.setData({
        canDescend: true,
        roomsExplored: rooms,
        activeEvent: null,
        activeSide: null
      })
      return
    }

    // 滑动逻辑：选左→右变左+生新右；选右→生新右
    if (side === 'left') {
      this.setData({
        leftEvent: this.data.rightEvent,
        activeEvent: null,
        activeSide: null,
        roomsExplored: rooms
      })
      this.generateNewRight()
    } else {
      this.setData({
        activeEvent: null,
        activeSide: null,
        roomsExplored: rooms
      })
      this.generateNewRight()
    }

    this.refreshPlayer()
  },

  // WXML 按钮绑定用
  nextRound() {
    this.finishEvent(this.data.activeSide || 'left')
  },

  // ==================== 怪物交互 ====================

  goBattle() {
    const event = this.data.activeEvent
    if (!event || !event.monster) return

    const m = event.monster
    app.globalData.currentMonsterData = {
      name: m.name, hp: m.maxHp,
      attack: m.attack, defense: m.defense,
      exp: m.exp, gold: m.gold,
      desc: m.desc, level: m.level
    }

    const side = this.data.activeSide
    wx.navigateTo({
      url: '/pages/battle/battle',
      events: {
        battleResolved: () => {
          this.finishEvent(side)
        }
      }
    })
  },

  runAway() {
    if (Math.random() < 0.5) {
      wx.showToast({ title: '逃跑成功！', icon: 'success' })
      this.finishEvent(this.data.activeSide)
    } else {
      wx.showToast({ title: '逃跑失败！准备战斗', icon: 'error' })
      this.goBattle()
    }
  },

  // ==================== 商人交互 ====================

  buyItem(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.activeEvent.items[index]
    const player = app.getPlayer()

    if (player.gold < item.price) {
      wx.showToast({ title: '金币不足！', icon: 'error' })
      return
    }

    player.gold -= item.price
    if (item.type === 'potion') {
      const healAmount = Math.floor(player.totalMaxHp * item.healPercent)
      player.heal(healAmount)
      wx.showToast({ title: `使用了${item.name}，恢复${healAmount}点生命！`, icon: 'success' })
    } else {
      player.inventory.push(item)
      wx.showToast({ title: `购买了 ${item.name}！已放入背包`, icon: 'success' })
    }
    app.saveGame()
    this.refreshPlayer()
  },

  // ==================== 营地交互 ====================

  doRest() {
    const player = app.getPlayer()
    player.heal(player.totalMaxHp)
    app.saveGame()
    this.refreshPlayer()

    if (Math.random() < this.data.activeEvent.ambushChance) {
      wx.showToast({ title: '休息时遭遇怪物袭击！', icon: 'error' })
      this.setData({
        activeEvent: { type: 'camp_ambush', monster: this.data.activeEvent.ambushMonster }
      })
    } else {
      wx.showToast({ title: '安全休息，生命回满！', icon: 'success' })
      this.finishEvent(this.data.activeSide)
    }
  },

  // ==================== 祭坛交互 ====================

  altarSacrifice(e) {
    const sacType = e.currentTarget.dataset.type
    const player = app.getPlayer()
    const cost = Math.max(1, Math.floor(player.hp * 0.1))
    player.hp = Math.max(1, player.hp - cost)

    if (sacType === 'attack') {
      player.baseAttack += 1
      wx.showToast({ title: `献祭${cost}生命！攻击力 +1`, icon: 'success' })
    } else {
      player.baseDefense += 1
      wx.showToast({ title: `献祭${cost}生命！防御力 +1`, icon: 'success' })
    }
    app.saveGame()
    this.refreshPlayer()
    if (player.isDead()) { this.checkDead(); return }
    this.finishEvent(this.data.activeSide)
  },

  // ==================== 破旧装备交互 ====================

  wearOldGear() {
    const player = app.getPlayer()
    player.tempDefenseBuff += this.data.activeEvent.defense
    wx.showToast({ title: `穿上破旧装备，防御 +${this.data.activeEvent.defense}！`, icon: 'success' })
    app.saveGame()
    this.refreshPlayer()
    this.finishEvent(this.data.activeSide)
  },

  scrapOldGear() {
    const player = app.getPlayer()
    player.gold += this.data.activeEvent.gold
    wx.showToast({ title: `拆解获得 ${this.data.activeEvent.gold} 金币！`, icon: 'success' })
    app.saveGame()
    this.refreshPlayer()
    this.finishEvent(this.data.activeSide)
  },

  // ==================== 下楼 ====================

  descend() {
    const player = app.getPlayer()
    player.floor++
    player.tempAttackBuff = 0
    player.tempDefenseBuff = 0
    player.heal(Math.floor(player.totalMaxHp * 0.3))
    app.saveGame()
    this.refreshPlayer()
    this.setData({ activeEvent: null, activeSide: null, canDescend: false, roomsExplored: 0 })
    this.generateEvents()
    wx.showToast({ title: `进入第 ${player.floor} 层！`, icon: 'success' })
  },

  // ==================== 退出 ====================

  exitExplore() {
    const player = app.getPlayer()
    player.tempAttackBuff = 0
    player.tempDefenseBuff = 0
    app.saveGame()
    wx.navigateBack()
  }
})
