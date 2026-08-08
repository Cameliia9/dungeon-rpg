const app = getApp()
const { generateTwoRoomEvents, getBossForFloor, getRoomsPerFloor } = require('../../utils/game-engine')
const { getThemeForFloor } = require('../../utils/data')

Page({
  data: {
    player: null,
    leftEvent: null,
    rightEvent: null,
    leftState: 'door',     // door | result | monster | merchant | camp | altar | oldGear | camp_ambush
    rightState: 'door',
    activeSide: null,      // 当前放大的卡片: left | right | null
    trapResult: null,
    totalAttack: 0,
    totalDefense: 0,
    totalMaxHp: 0,
    expToLevel: 0,
    roomsPerFloor: 15,

    leftOut: false,
    rightOut: false
  },

  onLoad() {
    this.refreshPlayer()
    // 恢复上次的探索状态（防止退出重进刷门逃课）
    if (!this._restoreExploreState()) {
      this.generateEvents()
    }
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
      totalCritPercent: Math.round(player.totalCrit * 100),
      totalDodgePercent: Math.round(player.totalDodge * 100),
      // 战斗前逃跑成功率：基础 40%，每失败一次 +10%
      fleePercent: Math.round(Math.min(0.9, 0.4 + player.fleeFails * 0.1) * 100),
      totalMaxHp: player.totalMaxHp,
      expToLevel: player.expToLevel(),
      roomsPerFloor: getRoomsPerFloor(player.floor),
      // 主题信息
      themeName: getThemeForFloor(player.floor).name,
      themeIcon: getThemeForFloor(player.floor).icon,
      themeDesc: getThemeForFloor(player.floor).desc
    })
  },

  checkDead() {
    const player = app.getPlayer()
    if (player && player.isDead()) {
      wx.removeStorageSync('dungeon_save')
      wx.removeStorageSync('explore_state')
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

  // ==================== 探索状态持久化 ====================

  // 保存当前两扇门的内容与状态（防退出重进刷门）
  _saveExploreState() {
    const player = app.getPlayer()
    if (!player) return
    try {
      wx.setStorageSync('explore_state', {
        floor: player.floor,
        leftEvent: this.data.leftEvent,
        rightEvent: this.data.rightEvent,
        leftState: this.data.leftState,
        rightState: this.data.rightState,
        trapResult: this.data.trapResult || null
      })
    } catch (e) {}
  },

  // 恢复探索状态；层数不匹配（已下楼）则返回 false 重新生成
  _restoreExploreState() {
    const player = app.getPlayer()
    if (!player) return false
    try {
      const st = wx.getStorageSync('explore_state')
      if (st && st.floor === player.floor) {
        // 楼梯/Boss 场景：本层已完成，另一侧 Event 为 null（等下楼）
        // 只要任意一侧还有有效事件就恢复，防止楼梯被刷掉
        const hasEvent = !!(st.leftEvent || st.rightEvent)
        if (hasEvent) {
          this.setData({
            leftEvent: st.leftEvent || null,
            rightEvent: st.rightEvent || null,
            leftState: st.leftState || 'door',
            rightState: st.rightState || 'door',
            trapResult: st.trapResult || null
          })
          return true
        }
      }
    } catch (e) {}
    return false
  },

  _clearExploreState() {
    try { wx.removeStorageSync('explore_state') } catch (e) {}
  },

  // ==================== 事件生成 ====================

  generateEvents() {
    const player = app.getPlayer()
    if (!player || player.isDead()) return
    const [left, right] = generateTwoRoomEvents(player)
    this.setData({ leftEvent: left, rightEvent: right, leftState: 'door', rightState: 'door' })
    this._saveExploreState()
  },

  _animateCardOut(side) {
    this.setData({ [side + 'Out']: true })
    setTimeout(() => { this.setData({ [side + 'Out']: false }) }, 450)
  },

  generateNewRight() {
    const player = app.getPlayer()
    if (!player) return
    const [a, b] = generateTwoRoomEvents(player)
    const leftType = this.data.leftEvent && this.data.leftEvent.type
    const newRight = (a.type !== leftType) ? a : b
    this.setData({ rightEvent: newRight, rightState: 'door' })
    this._saveExploreState()
  },

  // ==================== 左卡片操作 ====================

  goLeft() {
    const rightState = this.data.rightState
    // 死路/封锁侧无需完成，放行
    if (rightState !== 'door' && rightState !== 'deadend' && rightState !== 'blocked') {
      wx.showToast({ title: '先完成当前事件', icon: 'none' }); return
    }
    this.pickSide('left')
  },
  finishLeft() { this.finishSide('left') },
  blockLeft() { this.blockSide('left') },
  goBattleLeft() { this.startBattle('left') },
  runAwayLeft() { this.runAway('left') },
  buyItemLeft(e) { this.buyItem('left', e) },
  doRestLeft() { this.doRest('left') },
  altarLeft(e) { this.altarSacrifice('left', e) },
  wearLeft() { this.wearOldGear('left') },
  scrapLeft() { this.scrapOldGear('left') },

  // ==================== 右卡片操作 ====================

  goRight() {
    const leftState = this.data.leftState
    // 死路/封锁侧无需完成，放行
    if (leftState !== 'door' && leftState !== 'deadend' && leftState !== 'blocked') {
      wx.showToast({ title: '先完成当前事件', icon: 'none' }); return
    }
    this.pickSide('right')
  },
  finishRight() { this.finishSide('right') },
  blockRight() { this.blockSide('right') },
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

    // 点开的卡片放大，另一张缩小（渐变）
    this.setData({ activeSide: side })

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
        // 死路：算作探索了一个房间，该侧进入死路状态（等待封锁）
        player.roomsExplored++
        app.saveGame()
        this.setData({ [stateKey]: 'deadend' })
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
      case 'stairs':
        this.descend()
        break
      case 'boss':
        this.startBattle(side, true)
        break
      case 'merchant':
      case 'camp':
      case 'altar':
      case 'oldGear':
        this.setData({ [stateKey]: event.type })
        break
    }

    this.refreshPlayer()
    this._saveExploreState()
    if (player.isDead()) this.checkDead()
  },

  // ==================== 死路封锁 ====================

  // 封锁死路一侧（该侧不可再点击）
  blockSide(side) {
    this.setData({ [side + 'State']: 'blocked', activeSide: null })
    this._saveExploreState()
  },

  // ==================== 完成事件 → 推门 ====================

  finishSide(side) {
    const player = app.getPlayer()
    if (!player || player.isDead()) { this.checkDead(); return }

    // 事件完成后两侧恢复原大小
    this.setData({ activeSide: null })

    player.roomsExplored++
    app.saveGame()
    this._animateCardOut(side)

    // 本层房间数达到上限 → 该卡片直接变楼梯（5的倍数层变 Boss 门）
    if (player.roomsExplored >= this.data.roomsPerFloor) {
      const evtKey = side + 'Event'
      const otherSide = side === 'left' ? 'right' : 'left'
      const isBossFloor = player.floor % 5 === 0
      this.setData({
        [evtKey]: { type: isBossFloor ? 'boss' : 'stairs' },
        [side + 'State']: 'door',
        [otherSide + 'State']: 'door',
        [otherSide + 'Event']: null
      })
      this._saveExploreState()
      this.refreshPlayer()
      return
    }

    // 另一侧是死路/封锁 → 重新生成两侧（死路侧恢复可点）
    const otherSide = side === 'left' ? 'right' : 'left'
    const otherState = this.data[otherSide + 'State']
    if (otherState === 'deadend' || otherState === 'blocked') {
      const [a, b] = generateTwoRoomEvents(player)
      this.setData({
        leftEvent: a,
        rightEvent: b,
        leftState: 'door',
        rightState: 'door'
      })
      this._saveExploreState()
      this.refreshPlayer()
      return
    }

    if (side === 'left') {
      this.setData({
        leftEvent: this.data.rightEvent,
        leftState: 'door'
      })
      this.generateNewRight()
    } else {
      this.setData({ rightState: 'door' })
      this.generateNewRight()
    }

    this._saveExploreState()
    this.refreshPlayer()
  },

  // ==================== 战斗 ====================

  startBattle(side, isBoss) {
    const event = side === 'left' ? this.data.leftEvent : this.data.rightEvent
    if (!event) return

    const player = app.getPlayer()
    // Boss 战：用当前层生成对应 Boss
    const m = isBoss ? getBossForFloor(player.floor, player.difficulty) : event.monster
    if (!m) return

    app.globalData.currentMonsterData = {
      name: m.name, icon: m.icon || '👹', hp: m.maxHp,
      attack: m.attack, defense: m.defense,
      exp: m.exp, gold: m.gold,
      desc: m.desc, level: m.level,
      critChance: m.critChance, dodgeChance: m.dodgeChance,
      isBoss: !!isBoss, skills: m.skills, loot: m.loot
    }
    app.globalData.battleSide = side

    wx.navigateTo({
      url: '/pages/battle/battle',
      events: {
        battleResolved: () => {
          // Boss 被打败 → 该卡片变楼梯
          if (isBoss && app.globalData.bossDefeated) {
            const evtKey = side + 'Event'
            const otherSide = side === 'left' ? 'right' : 'left'
            this.setData({
              [evtKey]: { type: 'stairs' },
              [side + 'State']: 'door',
              [otherSide + 'State']: 'door',
              [otherSide + 'Event']: null
            })
            app.globalData.bossDefeated = false
            this._saveExploreState()
            this.refreshPlayer()
            return
          }
          this.finishSide(app.globalData.battleSide)
        }
      }
    })
  },

  runAway(side) {
    const player = app.getPlayer()
    // 战斗前逃跑：基础 40%，每失败一次 +10%
    const chance = Math.min(0.9, 0.4 + player.fleeFails * 0.1)
    if (Math.random() < chance) {
      player.fleeFails = 0
      app.saveGame()
      wx.showToast({ title: '逃跑成功！', icon: 'success' })
      this.finishSide(side)
    } else {
      player.fleeFails++
      app.saveGame()
      wx.showToast({ title: `逃跑失败！下次成功率 ${Math.min(0.9, chance + 0.1) * 100}%`, icon: 'error' })
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
      // 主题药水：治疗 + 可能附带清毒/临时增益
      player.heal(Math.floor(player.totalMaxHp * (item.healPercent || 0.3)))
      if (item.curePoison) player.poisonTurns = 0
      if (item.dodgeBuff) player.tempDodgeBuff = (player.tempDodgeBuff || 0) + item.dodgeBuff
      if (item.attackBuff) player.tempAttackBuff = (player.tempAttackBuff || 0) + item.attackBuff
      wx.showToast({ title: `使用${item.name}！`, icon: 'success' })
    } else {
      player.inventory.push(item)
      wx.showToast({ title: `购买${item.name}！`, icon: 'success' })
    }
    app.saveGame()
    this.refreshPlayer()
    this._saveExploreState()
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
      this._saveExploreState()
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
    if (event.altarCount >= event.maxCount) {
      upd[side + 'State'] = 'door'
      setTimeout(() => this.finishSide(side), 500)
    }
    this.setData(upd)
    this._saveExploreState()
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
    player.roomsExplored = 0
    player.tempAttackBuff = 0
    player.tempDefenseBuff = 0
    player.heal(Math.floor(player.totalMaxHp * 0.3))
    app.saveGame()
    // 下楼后旧探索状态作废，清掉并生成新层事件
    this._clearExploreState()
    this.refreshPlayer()
    this.setData({ leftState: 'door', rightState: 'door' })
    this.generateEvents()
    wx.showToast({ title: `进入第 ${player.floor} 层！`, icon: 'success' })
  },

  // ==================== 退出 ====================

  // 游戏中随时打开商店
  openShop() {
    wx.navigateTo({ url: '/pages/shop/shop' })
  },

  // 游戏中随时打开背包
  openInventory() {
    wx.navigateTo({ url: '/pages/inventory/inventory' })
  },

  // 游戏中随时打开铁匠铺
  openForge() {
    wx.navigateTo({ url: '/pages/forge/forge' })
  },

  exitExplore() {
    const player = app.getPlayer()
    player.tempAttackBuff = 0
    player.tempDefenseBuff = 0
    app.saveGame()
    wx.navigateBack()
  }
})
