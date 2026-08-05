/**
 * 地牢冒险 - 游戏核心引擎
 * 角色、战斗、装备系统
 */

const GameData = require('./data')

// ==================== 玩家类 ====================
class Player {
  constructor(name) {
    this.name = name
    this.level = 1
    this.exp = 0
    this.maxHp = 100
    this.hp = 100
    this.baseAttack = 12
    this.baseDefense = 5
    this.gold = 50
    this.weapon = null   // {name, attack, price, desc}
    this.armor = null    // {name, defense, price, desc}
    this.accessory = null // {name, hp, price, desc}
    this.inventory = []  // 背包中的装备
    this.floor = 1       // 当前层数
    this.kills = 0       // 击杀数
  }

  // 计算总攻击力
  get totalAttack() {
    let a = this.baseAttack + this.level * 3
    if (this.weapon) a += this.weapon.attack
    return a
  }

  // 计算总防御力
  get totalDefense() {
    let d = this.baseDefense + Math.floor(this.level * 1.5)
    if (this.armor) d += this.armor.defense
    return d
  }

  // 计算总血量上限
  get totalMaxHp() {
    let h = this.maxHp + this.level * 25
    if (this.accessory) h += this.accessory.hp
    return h
  }

  // 当前等级所需经验
  expToLevel() {
    return this.level * 80 + 20
  }

  // 增加经验，检查升级
  addExp(amount) {
    this.exp += amount
    let leveled = false
    while (this.exp >= this.expToLevel()) {
      this.exp -= this.expToLevel()
      this.levelUp()
      leveled = true
    }
    return leveled
  }

  // 升级
  levelUp() {
    this.level++
    this.baseAttack += 3
    this.baseDefense += 1
    this.maxHp += 20
    this.hp = this.totalMaxHp  // 升级回满血
  }

  // 受到伤害
  takeDamage(rawDamage) {
    const reduced = Math.max(1, rawDamage - this.totalDefense)
    const actual = Math.floor(reduced * (0.9 + Math.random() * 0.2)) // ±10%
    this.hp = Math.max(0, this.hp - actual)
    return actual
  }

  // 恢复生命
  heal(amount) {
    const oldHp = this.hp
    this.hp = Math.min(this.totalMaxHp, this.hp + amount)
    return this.hp - oldHp
  }

  // 是否死亡
  isDead() {
    return this.hp <= 0
  }

  // 装备物品
  equip(item) {
    switch (item.type) {
      case 'weapon':
        if (this.weapon) this.inventory.push(this.weapon)
        this.weapon = item
        break
      case 'armor':
        if (this.armor) this.inventory.push(this.armor)
        this.armor = item
        break
      case 'accessory':
        if (this.accessory) this.inventory.push(this.accessory)
        this.accessory = item
        break
    }
    // 从背包移除
    const idx = this.inventory.findIndex(i => i === item)
    if (idx >= 0) this.inventory.splice(idx, 1)
  }

  // 卸下装备
  unequip(slot) {
    const item = this[slot]
    if (item) {
      this.inventory.push(item)
      this[slot] = null
      return item
    }
    return null
  }
}

// ==================== 怪物类 ====================
class Monster {
  constructor(template) {
    this.name = template.name
    this.hp = template.hp
    this.maxHp = template.hp
    this.attack = template.attack
    this.defense = template.defense
    this.exp = template.exp
    this.gold = template.gold
    this.desc = template.desc
    this.level = template.level || 1
  }

  takeDamage(rawDamage) {
    const actual = Math.max(1, rawDamage - this.defense)
    this.hp = Math.max(0, this.hp - actual)
    return actual
  }

  isDead() {
    return this.hp <= 0
  }

  // 怪物攻击（返回原始伤害值，不直接修改 player）
  dealDamage(targetDefense) {
    const raw = this.attack * (0.8 + Math.random() * 0.4)
    return Math.max(1, Math.floor(raw - targetDefense * 0.5))
  }
}

// ==================== 战斗系统 ====================
class Battle {
  constructor(player, monster) {
    this.player = player
    this.monster = monster
    this.logs = []
    this.turn = 0
  }

  // 玩家攻击 — 只负责伤害计算和日志，奖励由页面层统一处理
  playerAttack() {
    const dmg = this.monster.takeDamage(this.player.totalAttack)
    this.log(`你对 ${this.monster.name} 造成了 ${dmg} 点伤害`, 'damage')
    this.turn++

    if (this.monster.isDead()) {
      this.log(`你击败了 ${this.monster.name}！`, 'loot')
      return 'victory'
    }
    return 'continue'
  }

  // 怪物攻击
  monsterAttack() {
    const dmg = this.player.takeDamage(this.monster.dealDamage(this.player.totalDefense))
    this.log(`${this.monster.name} 对你造成了 ${dmg} 点伤害`, 'damage')
    this.turn++

    if (this.player.isDead()) {
      this.log('你被打倒了...', 'info')
      return 'defeat'
    }
    return 'continue'
  }

  log(msg, type) {
    this.logs.push({ msg, type, turn: this.turn })
  }
}

// ==================== 地牢事件 ====================
function generateRoomEvent(player) {
  const roll = Math.random()
  const floor = player.floor

  // 根据层数决定事件概率
  if (roll < 0.45) {
    // 遭遇怪物 - 根据层数选择难度
    return { type: 'monster', monster: getRandomMonster(floor) }
  } else if (roll < 0.65) {
    // 发现宝箱
    return { type: 'treasure', gold: Math.floor(10 + floor * 5 + Math.random() * floor * 10) }
  } else if (roll < 0.75) {
    // 休息点
    return { type: 'rest', heal: Math.floor(player.totalMaxHp * (0.2 + Math.random() * 0.3)) }
  } else if (roll < 0.85) {
    // 装备掉落
    const item = getRandomEquipment(floor)
    return { type: 'equipment', item }
  } else {
    // 陷阱
    const dmg = Math.floor(10 + floor * 3 + Math.random() * floor * 5)
    return { type: 'trap', damage: dmg }
  }
}

// 根据层数获取随机怪物
function getRandomMonster(floor) {
  const available = GameData.monsters.filter(m => m.level <= floor + 2 && m.level >= floor - 1)
  if (available.length === 0) return GameData.monsters[GameData.monsters.length - 1]
  const template = available[Math.floor(Math.random() * available.length)]
  // 高层怪物有属性加成
  const scaled = { ...template }
  if (floor > template.level) {
    const scale = 1 + (floor - template.level) * 0.3
    scaled.hp = Math.floor(template.hp * scale)
    scaled.attack = Math.floor(template.attack * scale)
    scaled.defense = Math.floor(template.defense * scale)
    scaled.exp = Math.floor(template.exp * scale)
    scaled.gold = Math.floor(template.gold * scale)
  }
  return new Monster(scaled)
}

// 获取随机装备
function getRandomEquipment(floor) {
  const types = ['weapon', 'armor', 'accessory']
  const type = types[Math.floor(Math.random() * types.length)]
  const tier = Math.min(Math.floor((floor - 1) / 3), 3) // 0-3档
  const pool = GameData.equipment[type].filter(e => e.tier <= tier + 1)
  if (pool.length === 0) return GameData.equipment[type][0]
  const template = pool[Math.floor(Math.random() * pool.length)]
  return { ...template, type }
}

// ==================== 存档系统 ====================
function savePlayer(player) {
  return {
    name: player.name,
    level: player.level,
    exp: player.exp,
    maxHp: player.maxHp,
    hp: player.hp,
    baseAttack: player.baseAttack,
    baseDefense: player.baseDefense,
    gold: player.gold,
    weapon: player.weapon,
    armor: player.armor,
    accessory: player.accessory,
    inventory: player.inventory,
    floor: player.floor,
    kills: player.kills
  }
}

function loadPlayer(data) {
  const p = new Player(data.name)
  p.level = data.level
  p.exp = data.exp
  p.maxHp = data.maxHp
  p.hp = data.hp
  p.baseAttack = data.baseAttack
  p.baseDefense = data.baseDefense
  p.gold = data.gold
  p.weapon = data.weapon
  p.armor = data.armor
  p.accessory = data.accessory
  p.inventory = data.inventory || []
  p.floor = data.floor
  p.kills = data.kills
  return p
}

module.exports = {
  Player,
  Monster,
  Battle,
  generateRoomEvent,
  getRandomMonster,
  getRandomEquipment,
  savePlayer,
  loadPlayer
}
