const app = getApp()
const { generateTwoRoomEvents } = require('../../utils/game-engine')

Page({
  data: {
    player: null,
    leftEvent: null,       // 左路事件
    rightEvent: null,      // 右路事件
    activeEvent: null,     // 当前激活的事件
    currentChoice: null,   // 'left' | 'right' | null (未选)
    trapResult: null,      // 陷阱结果
    canDescend: false,
    roomsExplored: 0,
    totalAttack: 0,
    totalDefense: 0,
    totalMaxHp: 0
  },

  onLoad() {
    this.refreshPlayer()
    this.generateEvents()
    this.checkDead()
  },

  onShow() {
    this.refreshPlayer()
    // 兜底清理
    if (this.data.activeEvent && this.data.activeEvent.type === 'monster' && !app.globalData.currentMonsterData) {
      this.setData({ activeEvent: null, currentChoice: null })
      this.generateEvents()
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
      totalMaxHp: player.totalMaxHp
    })
  },

  checkDead() {
    const player = app.getPlayer()
    if (player && player.isDead()) {
      wx.removeStorageSync('dungeon_save')
      app.globalData.player = null
      this.setData({ activeEvent: null, currentChoice: null })
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
    this.setData({ leftEvent: left, rightEvent: right, currentChoice: null, activeEvent: null })
  },

  // ==================== 方向选择 ====================

  goLeft() {
    this.pickEvent('left')
  },

  goRight() {
    this.pickEvent('right')
  },

  pickEvent(side) {
    const event = side === 'left' ? this.data.leftEvent : this.data.rightEvent
    if (!event) return

    const player = app.getPlayer()
    let handled = false

    // 自动类事件：立即生效
    switch (event.type) {
      case 'treasure':
        player.gold += event.gold
        handled = true
        break
      case 'spring':
        player.heal(event.heal)
        handled = true
        break
      case 'trap':
        const dodged = Math.random() < event.dodgeChance
        let dmg = 0
        if (!dodged) {
          dmg = Math.max(1, Math.floor(player.hp * 0.15))
          player.hp = Math.max(0, player.hp - dmg)
        }
        app.saveGame()
        this.setData({
          activeEvent: event,
          currentChoice: side,
          trapResult: { dodged, damage: dmg }
        })
        this.refreshPlayer()
        return
      case 'deadend':
        handled = true
        break
      case 'coins':
        player.gold += event.gold
        handled = true
        break
      case 'buffStone':
        player.tempAttackBuff = (player.tempAttackBuff || 0) + event.attackBonus
        handled = true
        break
    }

    app.saveGame()

    if (handled) {
      this.setData({ activeEvent: event, currentChoice: side })
      this.refreshPlayer()
      this.advanceRoom()
    } else {
      // 交互类事件：设 activeEvent，等待用户操作
      this.setData({ activeEvent: event, currentChoice: side })
    }

    // 检查死亡
    if (player.isDead()) {
      this.refreshPlayer()
      this.checkDead()
    }
  },

  // ==================== 房间推进 ====================

  advanceRoom() {
    const rooms = this.data.roomsExplored + 1
    if (rooms >= 3) {
      this.setData({ canDescend: true, roomsExplored: rooms })
    } else {
      this.setData({ roomsExplored: rooms })
    }
  },

  nextRound() {
    if (this.data.canDescend) return
    const player = app.getPlayer()
    if (!player || player.isDead()) {
      this.checkDead()
      return
    }
    this.setData({ activeEvent: null, currentChoice: null })
    this.generateEvents()
    this.refreshPlayer()
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

    wx.navigateTo({
      url: '/pages/battle/battle',
      events: {
        battleResolved: () => {
          if (this.data.activeEvent && this.data.activeEvent.type === 'monster') {
            this.nextRound()
          }
          if (this.data.activeEvent && this.data.activeEvent.type === 'camp_ambush') {
            this.nextRound()
          }
        }
      }
    })
  },

  runAway() {
    if (Math.random() < 0.5) {
      wx.showToast({ title: '逃跑成功！', icon: 'success' })
      this.nextRound()
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
    player.heal(player.totalMaxHp) // 回满
    app.saveGame()
    this.refreshPlayer()

    if (Math.random() < this.data.activeEvent.ambushChance) {
      wx.showToast({ title: '休息时遭遇怪物袭击！', icon: 'error' })
      this.setData({
        activeEvent: {
          type: 'camp_ambush',
          monster: this.data.activeEvent.ambushMonster
        }
      })
    } else {
      wx.showToast({ title: '安全休息，生命回满！', icon: 'success' })
      this.nextRound()
    }
  },

  // ==================== 祭坛交互 ====================

  altarSacrifice(e) {
    const sacType = e.currentTarget.dataset.type
    const player = app.getPlayer()
    const cost = Math.max(1, Math.floor(player.hp * 0.1))

    player.hp = Math.max(1, player.hp - cost) // 至少剩1血

    if (sacType === 'attack') {
      player.baseAttack += 1
      wx.showToast({ title: `献祭${cost}生命！攻击力 +1`, icon: 'success' })
    } else {
      player.baseDefense += 1
      wx.showToast({ title: `献祭${cost}生命！防御力 +1`, icon: 'success' })
    }

    app.saveGame()
    this.refreshPlayer()

    if (player.isDead()) {
      this.checkDead()
      return
    }
    this.nextRound()
  },

  // ==================== 破旧装备交互 ====================

  wearOldGear() {
    const player = app.getPlayer()
    player.tempDefenseBuff += this.data.activeEvent.defense
    wx.showToast({ title: `穿上破旧装备，防御 +${this.data.activeEvent.defense}！`, icon: 'success' })
    app.saveGame()
    this.refreshPlayer()
    this.nextRound()
  },

  scrapOldGear() {
    const player = app.getPlayer()
    player.gold += this.data.activeEvent.gold
    wx.showToast({ title: `拆解获得 ${this.data.activeEvent.gold} 金币！`, icon: 'success' })
    app.saveGame()
    this.refreshPlayer()
    this.nextRound()
  },

  // ==================== 下楼 ====================

  descend() {
    const player = app.getPlayer()
    player.floor++
    player.tempAttackBuff = 0     // 清临时buff
    player.tempDefenseBuff = 0    // 清临时buff
    player.heal(Math.floor(player.totalMaxHp * 0.3))
    app.saveGame()
    this.refreshPlayer()
    this.setData({
      activeEvent: null,
      currentChoice: null,
      canDescend: false,
      roomsExplored: 0
    })
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
