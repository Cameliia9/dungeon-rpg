const app = getApp()
const { Battle } = require('../../utils/game-engine')

Page({
  data: {
    player: null,
    monster: null,
    monsterHpPercent: 100,
    playerHpPercent: 100,
    logs: [],
    result: 'fighting', // fighting, victory, defeat, fled
    battleReward: null
  },

  onLoad() {
    const player = app.getPlayer()
    const monster = app.globalData.currentMonster

    if (!monster) {
      wx.showToast({ title: '怪物数据丢失', icon: 'error' })
      setTimeout(() => wx.navigateBack(), 1000)
      return
    }

    this.battle = new Battle(player, monster)
    this.setData({
      player,
      monster,
      monsterHpPercent: 100,
      playerHpPercent: Math.floor((player.hp / player.totalMaxHp) * 100)
    })
  },

  // 攻击
  attack() {
    if (this.data.result !== 'fighting') return

    // 玩家攻击
    const r1 = this.battle.playerAttack()
    this.refreshUI()

    if (r1 === 'victory') {
      this.onVictory()
      return
    }

    // 怪物反击
    const r2 = this.battle.monsterAttack()
    this.refreshUI()

    if (r2 === 'defeat') {
      this.onDefeat()
      return
    }

    this.setData({ logs: [...this.battle.logs].reverse() })
  },

  // 防御
  defend() {
    if (this.data.result !== 'fighting') return

    const player = this.battle.player
    const monster = this.battle.monster

    // 防御姿态：伤害减半
    const rawDmg = monster.dealDamage(player.totalDefense * 2)
    const dmg = Math.floor(rawDmg / 2)
    player.hp = Math.max(0, player.hp - dmg)

    this.battle.log(`你进入防御姿态，${monster.name} 造成 ${dmg} 点伤害`, 'info')
    this.refreshUI()
    this.setData({ logs: [...this.battle.logs].reverse() })

    if (player.isDead()) {
      this.onDefeat()
    }
  },

  // 逃跑
  flee() {
    if (this.data.result !== 'fighting') return

    if (Math.random() < 0.3) {
      this.battle.log('你成功逃脱了！', 'info')
      this.setData({ result: 'fled', logs: [...this.battle.logs].reverse() })
    } else {
      this.battle.log('逃跑失败！', 'info')
      const r2 = this.battle.monsterAttack()
      this.refreshUI()
      this.setData({ logs: [...this.battle.logs].reverse() })
      if (r2 === 'defeat') this.onDefeat()
    }
  },

  // 胜利 — 注意：Battle.playerAttack() 已经处理了金币和经验
  onVictory() {
    const player = this.battle.player
    const monster = this.battle.monster
    const leveled = player.level > (this.data.player.level || player.level)

    // 如果 playerAttack 没处理（比如旧逻辑），这里兜底
    // 但当前 playerAttack 已处理，只检查是否升级
    app.saveGame()
    this.setData({
      result: 'victory',
      battleReward: {
        gold: monster.gold,
        exp: monster.exp,
        leveled
      },
      player,
      monsterHpPercent: 0,
      playerHpPercent: Math.floor((player.hp / player.totalMaxHp) * 100),
      logs: [...this.battle.logs].reverse()
    })
  },

  // 失败
  onDefeat() {
    const player = this.battle.player
    player.gold = Math.floor(player.gold / 2)
    player.hp = 1
    app.saveGame()
    this.setData({
      result: 'defeat',
      player,
      playerHpPercent: 1,
      logs: [...this.battle.logs].reverse()
    })
  },

  // 统一刷新 UI 数据 — 始终从 this.battle 读取最新值
  refreshUI() {
    const monster = this.battle.monster
    const player = this.battle.player
    this.setData({
      monster,
      player,
      monsterHpPercent: Math.max(0, Math.floor((monster.hp / monster.maxHp) * 100)),
      playerHpPercent: Math.max(0, Math.floor((player.hp / player.totalMaxHp) * 100))
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
