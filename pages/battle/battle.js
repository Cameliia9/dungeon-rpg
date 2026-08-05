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
    this.updateBars()

    if (r1 === 'victory') {
      this.onVictory()
      return
    }

    // 怪物反击
    const r2 = this.battle.monsterAttack()
    this.updateBars()

    if (r2 === 'defeat') {
      this.onDefeat()
      return
    }

    this.setData({ logs: [...this.battle.logs].reverse() })
  },

  // 防御
  defend() {
    if (this.data.result !== 'fighting') return

    const player = app.getPlayer()
    // 防御姿态：受到伤害减半
    const dmg = Math.floor(player.takeDamage(
      this.battle.monster.dealDamage(player.totalDefense * 2)
    ) * 0.5)

    this.battle.log(`你进入防御姿态，${this.battle.monster.name} 造成 ${dmg} 点伤害`, 'info')
    this.updateBars()
    this.setData({ logs: [...this.battle.logs].reverse() })

    if (this.data.player.isDead()) {
      this.onDefeat()
    }
  },

  // 逃跑
  flee() {
    if (Math.random() < 0.3) {
      this.battle.log('你成功逃脱了！', 'info')
      this.setData({ result: 'fled', logs: [...this.battle.logs].reverse() })
    } else {
      this.battle.log('逃跑失败！', 'info')
      const r2 = this.battle.monsterAttack()
      this.updateBars()
      this.setData({ logs: [...this.battle.logs].reverse() })
      if (r2 === 'defeat') this.onDefeat()
    }
  },

  // 胜利
  onVictory() {
    const player = app.getPlayer()
    const monster = this.data.monster

    const reward = {
      gold: monster.gold,
      exp: monster.exp,
      leveled: player.addExp(monster.exp)
    }

    app.saveGame()
    this.setData({
      result: 'victory',
      battleReward: reward,
      player,
      monsterHpPercent: 0,
      logs: [...this.battle.logs].reverse()
    })
  },

  // 失败
  onDefeat() {
    const player = app.getPlayer()
    player.gold = Math.floor(player.gold / 2) // 失去一半金币
    player.hp = 1 // 保留1点血
    app.saveGame()
    this.setData({
      result: 'defeat',
      player,
      playerHpPercent: Math.floor((player.hp / player.totalMaxHp) * 100),
      logs: [...this.battle.logs].reverse()
    })
  },

  updateBars() {
    this.setData({
      monsterHpPercent: Math.max(0, Math.floor((this.data.monster.hp / this.data.monster.maxHp) * 100)),
      playerHpPercent: Math.max(0, Math.floor((this.data.player.hp / this.data.player.totalMaxHp) * 100))
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
