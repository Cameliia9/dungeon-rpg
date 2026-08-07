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
    this.isBoss = !!data.isBoss
    this.battle = new Battle(player, monster)
    this.setData({
      player,
      monster,
      isBoss: this.isBoss,
      playerCritPercent: Math.round(player.totalCrit * 100),
      playerDodgePercent: Math.round(player.totalDodge * 100),
      // 战斗内逃跑成功率：基础 20%，每失败一次 +10%
      fleePercent: Math.round(Math.min(0.9, 0.2 + player.fleeFails * 0.1) * 100),
      monsterHpPercent: 100,
      playerHpPercent: Math.floor((player.hp / player.totalMaxHp) * 100),
      totalMaxHp: player.totalMaxHp
    })
  },

  attack() {
    if (this.data.result !== 'fighting') return

    // 先结算中毒（剧毒词缀怪造成）
    const poisonDmg = this.battle.tickPoison()
    if (poisonDmg > 0) {
      this.refreshUI()
      this.setData({ logs: [...this.battle.logs].reverse() })
      if (this.battle.player.isDead()) {
        this.onDefeat()
        return
      }
    }

    const r1 = this.battle.playerAttack()
    this.refreshUI()

    if (r1 === 'victory') {
      this.onVictory()
      return
    }

    // Boss：30% 概率释放技能
    const r2 = this.isBoss && Math.random() < 0.3
      ? this.battle.monsterSkillAttack()
      : this.battle.monsterAttack()
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

    // 玩家闪避判定
    if (Math.random() < player.totalDodge) {
      this.battle.log(`你侧身躲开了 ${monster.name} 的攻击！`, 'dodge')
      this.refreshUI()
      this.setData({ logs: [...this.battle.logs].reverse() })
      return
    }

    // 基础伤害（防御姿态减半）
    let base = monster.dealDamage(player.totalDefense)
    const isCrit = Math.random() < monster.critChance
    if (isCrit) base = Math.floor(base * 1.5)
    const dmg = Math.max(1, Math.floor(base / 2))
    player.hp = Math.max(0, player.hp - dmg)

    this.battle.log(isCrit
      ? `你进入防御姿态，${monster.name} 暴击造成 ${dmg} 点伤害`
      : `你进入防御姿态，${monster.name} 造成 ${dmg} 点伤害`, isCrit ? 'crit' : 'info')
    this.refreshUI()
    this.setData({ logs: [...this.battle.logs].reverse() })

    if (player.isDead()) {
      this.onDefeat()
    }
  },

  flee() {
    if (this.data.result !== 'fighting') return

    // Boss 战无法逃跑
    if (this.isBoss) {
      this.battle.log('Boss 拦住了去路，无法逃跑！', 'info')
      this.setData({ logs: [...this.battle.logs].reverse() })
      return
    }

    const player = this.battle.player
    // 战斗内逃跑：基础 20%，每失败一次 +10%（与战斗前共享累积）
    const chance = Math.min(0.9, 0.2 + player.fleeFails * 0.1)
    if (Math.random() < chance) {
      player.fleeFails = 0
      app.saveGame()
      this.battle.log('你成功逃脱了！', 'info')
      app.globalData.currentMonsterData = null
      this.setData({ result: 'fled', logs: [...this.battle.logs].reverse() })
    } else {
      player.fleeFails++
      app.saveGame()
      this.battle.log(`逃跑失败！下次成功率 ${Math.min(0.9, chance + 0.1) * 100}%`, 'info')
      const r2 = this.battle.monsterAttack()
      this.refreshUI()
      this.setData({
        fleePercent: Math.round(Math.min(0.9, 0.2 + player.fleeFails * 0.1) * 100),
        logs: [...this.battle.logs].reverse()
      })
      if (r2 === 'defeat') this.onDefeat()
    }
  },

  onVictory() {
    const player = this.battle.player
    const monster = this.battle.monster

    player.kills++
    // 词缀奖励倍率（精英怪双倍）
    const goldGain = Math.floor(monster.gold * (monster.goldMul || 1))
    const expGain = Math.floor(monster.exp * (monster.expMul || 1))
    player.gold += goldGain
    const leveled = player.addExp(expGain)
    // 战斗结束清除中毒
    player.poisonTurns = 0

    // Boss 掉落专属装备
    let bossLoot = null
    if (this.isBoss && monster.loot) {
      bossLoot = { ...monster.loot }
      player.inventory.push(bossLoot)
      app.globalData.bossDefeated = true
    }

    app.globalData.currentMonsterData = null
    app.saveGame()

    this.setData({
      result: 'victory',
      battleReward: { gold: goldGain, exp: expGain, leveled, bossLoot },
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
    wx.removeStorageSync('explore_state')
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

  // ★ 通过 EventChannel 通知 explore 页（防重复发射）
  _emitBattleResolved() {
    if (this._emitted) return
    this._emitted = true
    try {
      this.getOpenerEventChannel().emit('battleResolved')
    } catch (e) {}
  },

  goBack() {
    this._emitBattleResolved()
    app.globalData.currentMonsterData = null
    wx.navigateBack()
  },

  // 系统返回键/手势：不触发战斗结算，保留怪物状态
  onUnload() {
    // 不emit battleResolved，不清除 currentMonsterData
    // 用户通过返回键退出时，explore页保留怪物事件
  },

  // 重新开始（从失败页面 → 清栈回菜单）
  restartGame() {
    app.globalData.currentMonsterData = null
    wx.reLaunch({ url: '/pages/index/index' })
  }
})
