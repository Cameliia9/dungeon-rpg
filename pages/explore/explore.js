const app = getApp()
const { generateTwoRoomEvents } = require('../../utils/game-engine')
const ROOMS_PER_FLOOR = 10

Page({
  data: {
    player: null,
    leftEvent: null,
    rightEvent: null,
    leftState: 'door',     // door | result | monster | merchant | camp | altar | oldGear | camp_ambush
    rightState: 'door',
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
    this.setData({ leftEvent: left, rightEvent: right, leftState: 'door', rightState: 'door' })
  },

  generateNewRight() {
    const player = app.getPlayer()
    if (!player) return
    const [a, b] = generateTwoRoomEvents(player)
    const leftType = this.data.leftEvent && this.data.leftEvent.type
    const newRight = (a.type !== leftType) ? a : b
    this.setData({ rightEvent: newRight, rightState: 'door' })
  },

  // ==================== 左卡片操作 ====================

  goLeft() {
    if (this.data.rightState !== 'door') { wx.showToast({ title: '先完成当前事件', icon: 'none' }); return }
    this.pickSide('left')
  },
  finishLeft() { this.finishSide('left') },
  goBattleLeft() { this.startBattle('left') },
  runAwayLeft() { this.runAway('left') },
  buyItemLeft(e) { this.buyItem('left', e) },
  doRestLeft() { this.doRest('left') },
  altarLeft(e) { this.altarSacrifice('left', e) },
  wearLeft() { this.wearOldGear('left') },
  scrapLeft() { this.scrapOldGear('left') },

  // ==================== 右卡片操作 ====================

  goRight() {
    if (this.data.leftState !== 'door') { wx.showToast({ title: '先完成当前事件', icon: 'none' }); return }
    this.pickSide('right')
  },
  finishRight() { this.finishSide('right') },
  goBattleRight() { this.startBattle('right') },
  runAwayRight() { this.runAway('right') },
  buyItemRight(e) { this.buyItem('right', e) },
  doRestRight() { this.doRest('right') },
  altarRight(e) { this.altarSacrifice('right', e) },
  wearRight() { this.wearOldGear('right') },
  scrapRight() { this.scrapOldGear('right') },

  // ==================== 核心：选门 ====================

  pickSide(side) {
    const event = side === 'left' ? this.data.leftEvent : this.data.rightEvent
    if (!event) return
    const stateKey = side + 'State'
    const player = app.getPlayer()

    switch (event.type) {
      case 'treasure':
        player.gold += event.gold
        app.saveGame()
        this.setData({ [stateKey]: 'result' })
        break
      case 'spring':
        player.heal(event.heal)
        app.saveGame()
        this.setData({ [stateKey]: 'result' })
        break
      case 'trap': {
        const dodged = Math.random() < event.dodgeChance
        let dmg = 0
        if (!dodged) {
          dmg = Math.max(1, Math.floor(player.hp * 0.15))
          player.hp = Math.max(0, player.hp - dmg)
        }
        app.saveGame()
        this.setData({ [stateKey]: 'result', trapResult: { dodged, damage: dmg } })
        break
      }
      case 'deadend':
        app.saveGame()
        this.setData({ [stateKey]: 'result' })
        break
      case 'coins':
        player.gold += event.gold
        app.saveGame()
        this.setData({ [stateKey]: 'result' })
        break
      case 'buffStone':
        player.tempAttackBuff = (player.tempAttackBuff || 0) + event.attackBonus
        app.saveGame()
        this.setData({ [stateKey]: 'result' })
        break
      case 'monster':
      case 'camp_ambush':
        this.setData({ [stateKey]: event.type })
        break
      case 'merchant':
      case 'camp':
      case 'altar':
      case 'oldGear':
        this.setData({ [stateKey]: event.type })
        break
    }

    this.refreshPlayer()
    if (player.isDead()) this.checkDead()
  },

  // ==================== 完成事件 → 推门 ====================

  finishSide(side) {
    if (this.data.canDescend) return
    const player = app.getPlayer()
    if (!player || player.isDead()) { this.checkDead(); return }

    const rooms = this.data.roomsExplored + 1

    if (rooms >= ROOMS_PER_FLOOR) {
      this.setData({
        canDescend: true,
        roomsExplored: rooms,
        leftState: 'door',
        rightState: 'door'
      })
      return
    }

    if (side === 'left') {
      this.setData({
        leftEvent: this.data.rightEvent,
        leftState: 'door',
        roomsExplored: rooms
      })
      this.generateNewRight()
    } else {
      this.setData({
        rightState: 'door',
        roomsExplored: rooms
      })
      this.generateNewRight()
    }

    this.refreshPlayer()
  },

  // ==================== 战斗 ====================

  startBattle(side) {
    const event = side === 'left' ? this.data.leftEvent : this.data.rightEvent
    if (!event || !event.monster) return

    const m = event.monster
    app.globalData.currentMonsterData = {
      name: m.name, hp: m.maxHp,
      attack: m.attack, defense: m.defense,
      exp: m.exp, gold: m.gold,
      desc: m.desc, level: m.level
    }
    app.globalData.battleSide = side

    wx.navigateTo({
      url: '/pages/battle/battle',
      events: {
        battleResolved: () => {
          this.finishSide(app.globalData.battleSide)
        }
      }
    })
  },

  runAway(side) {
    if (Math.random() < 0.5) {
      wx.showToast({ title: '逃跑成功！', icon: 'success' })
      this.finishSide(side)
    } else {
      wx.showToast({ title: '逃跑失败！', icon: 'error' })
      this.startBattle(side)
    }
  },

  // ==================== 商人 ====================

  buyItem(side, e) {
    const event = side === 'left' ? this.data.leftEvent : this.data.rightEvent
    const index = e.currentTarget.dataset.index
    const item = event.items[index]
    const player = app.getPlayer()
    if (player.gold < item.price) { wx.showToast({ title: '金币不足！', icon: 'error' }); return }
    player.gold -= item.price
    if (item.type === 'potion') {
      player.heal(Math.floor(player.totalMaxHp * item.healPercent))
      wx.showToast({ title: `使用${item.name}！`, icon: 'success' })
    } else {
      player.inventory.push(item)
      wx.showToast({ title: `购买${item.name}！`, icon: 'success' })
    }
    app.saveGame()
    this.refreshPlayer()
  },

  // ==================== 营地 ====================

  doRest(side) {
    const player = app.getPlayer()
    player.heal(player.totalMaxHp)
    app.saveGame()
    this.refreshPlayer()

    const event = side === 'left' ? this.data.leftEvent : this.data.rightEvent
    const stateKey = side + 'State'

    if (Math.random() < event.ambushChance) {
      wx.showToast({ title: '遭遇怪物袭击！', icon: 'error' })
      this.setData({ [stateKey]: 'camp_ambush', [side + 'Event']: { type: 'camp_ambush', monster: event.ambushMonster } })
    } else {
      wx.showToast({ title: '安全休息！', icon: 'success' })
      this.finishSide(side)
    }
  },

  // ==================== 祭坛 ====================

  altarSacrifice(side, e) {
    const sacType = e.currentTarget.dataset.type
    const player = app.getPlayer()
    const evtKey = side + 'Event'
    const event = this.data[evtKey]
    if (!event || event.altarCount >= event.maxCount) return
    if (player.hp <= event.cost) { wx.showToast({ title: '生命不足！', icon: 'error' }); return }

    event.altarCount++
    player.hp -= event.cost
    if (sacType === 'attack') { player.baseAttack += 1; wx.showToast({ title: `献祭${event.cost}血！攻击+1 (${event.altarCount}/${event.maxCount})`, icon: 'success' }) }
    else { player.baseDefense += 1; wx.showToast({ title: `献祭${event.cost}血！防御+1 (${event.altarCount}/${event.maxCount})`, icon: 'success' }) }
    app.saveGame()
    this.refreshPlayer()

    // 更新祭坛数据到页面
    const upd = {}
    upd[evtKey] = event
    if (event.altarCount >= event.maxCount || player.hp <= event.cost) {
      upd[side + 'State'] = 'door'
      setTimeout(() => this.finishSide(side), 500)
    }
    this.setData(upd)
    if (player.isDead()) this.checkDead()
  },

  // ==================== 破旧装备 ====================

  wearOldGear(side) {
    const event = side === 'left' ? this.data.leftEvent : this.data.rightEvent
    const player = app.getPlayer()
    player.tempDefenseBuff += event.defense
    wx.showToast({ title: `防御 +${event.defense}！`, icon: 'success' })
    app.saveGame()
    this.refreshPlayer()
    this.finishSide(side)
  },

  scrapOldGear(side) {
    const event = side === 'left' ? this.data.leftEvent : this.data.rightEvent
    const player = app.getPlayer()
    player.gold += event.gold
    wx.showToast({ title: `获得${event.gold}金币！`, icon: 'success' })
    app.saveGame()
    this.refreshPlayer()
    this.finishSide(side)
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
    this.setData({ canDescend: false, roomsExplored: 0 })
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
