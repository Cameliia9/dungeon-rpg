const app = getApp()
const { Battle, Monster } = require('../../utils/game-engine')

Page({
  data: {
    player: null,
    monster: null,
    monsterHpPercent: 100,
    playerHpPercent: 100,
    logs: [],
    result: 'fighting',
    battleReward: null
  },

  onLoad() {
    const player = app.getPlayer()
    const data = app.globalData.currentMonsterData

    if (!data) {
      wx.showToast({ title: '怪物数据丢失', icon: 'error' })
      setTimeout(() => wx.navigateBack(), 1000)
      return
    }

    // ★ 用数据副本重建 Monster 实例，不会污染 explore 页
    const monster = new Monster(data)
    this.battle = new Battle(player, monster)
    this.setData({
      player,
      monster,
      monsterHpPercent: 100,
      playerHpPercent: Math.floor((player.hp / player.totalMaxHp) * 100),
      totalMaxHp: player.totalMaxHp
    })
  },

  attack() {
    if (this.data.result !== 'fighting') return

    const r1 = this.battle.playerAttack()
    this.refreshUI()

    if (r1 === 'victory') {
      this.onVictory()
      return
    }

    const r2 = this.battle.monsterAttack()
    this.refreshUI()

    if (r2 === 'defeat') {
      this.onDefeat()
      return
    }

    this.setData({ logs: [...this.battle.logs].reverse() })
  },

  defend() {
    if (this.data.result !== 'fighting') return

    const player = this.battle.player
    const monster = this.battle.monster

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

  flee() {
    if (this.data.result !== 'fighting') return

    if (Math.random() < 0.3) {
      this.battle.log('你成功逃脱了！', 'info')
      app.globalData.currentMonsterData = null
      this.setData({ result: 'fled', logs: [...this.battle.logs].reverse() })
    } else {
      this.battle.log('逃跑失败！', 'info')
      const r2 = this.battle.monsterAttack()
      this.refreshUI()
      this.setData({ logs: [...this.battle.logs].reverse() })
      if (r2 === 'defeat') this.onDefeat()
    }
  },

  onVictory() {
    const player = this.battle.player
    const monster = this.battle.monster

    player.kills++
    player.gold += monster.gold
    const leveled = player.addExp(monster.exp)

    app.globalData.currentMonsterData = null
    app.saveGame()

    this.setData({
      result: 'victory',
      battleReward: { gold: monster.gold, exp: monster.exp, leveled },
      player,
      totalMaxHp: player.totalMaxHp,
      monsterHpPercent: 0,
      playerHpPercent: Math.floor((player.hp / player.totalMaxHp) * 100),
      logs: [...this.battle.logs].reverse()
    })
  },

  // 战斗失败：清除存档，回到主菜单
  onDefeat() {
    const monster = this.battle.monster
    wx.removeStorageSync('dungeon_save')
    app.globalData.player = null
    app.globalData.currentMonsterData = null

    this.setData({
      result: 'defeat',
      player: null,
      totalMaxHp: 100,
      playerHpPercent: 100,
      monsterHpPercent: 0,
      logs: [...this.battle.logs, {
        msg: `${monster.name} 击败了你... 冒险到此结束。`,
        type: 'info',
        turn: this.battle.turn
      }].reverse()
    })
  },

  refreshUI() {
    const monster = this.battle.monster
    const player = this.battle.player
    this.setData({
      monster,
      player,
      totalMaxHp: player.totalMaxHp,
      monsterHpPercent: Math.max(0, Math.floor((monster.hp / monster.maxHp) * 100)),
      playerHpPercent: Math.max(0, Math.floor((player.hp / player.totalMaxHp) * 100))
    })
  },

  // ★ 通过 EventChannel 通知 explore 页清除怪物事件
  goBack() {
    try {
      this.getOpenerEventChannel().emit('battleResolved')
    } catch (e) {
      console.warn('EventChannel emit failed:', e)
    }
    app.globalData.currentMonsterData = null
    wx.navigateBack()
  },

  // ★ 系统手势返回/物理返回键也发送通知
  onUnload() {
    try {
      this.getOpenerEventChannel().emit('battleResolved')
    } catch (e) {}
    app.globalData.currentMonsterData = null
  },

  // 重新开始（从失败页面 → 清栈回菜单）
  restartGame() {
    app.globalData.currentMonsterData = null
    wx.reLaunch({ url: '/pages/index/index' })
  }
})
