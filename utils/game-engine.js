/**
 * 地牢冒险 - 游戏核心引擎
 * 角色、战斗、装备系统 + 扩展事件池
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
    this.weapon = null
    this.armor = null
    this.accessory = null
    this.inventory = []
    this.floor = 1
    this.kills = 0
    this.roomsExplored = 0 // 当前层已探索房间数
    this.tempAttackBuff = 0  // 增益石碑临时攻击加成
    this.tempDefenseBuff = 0 // 破旧装备临时防御加成
  }

  get totalAttack() {
    let a = this.baseAttack + this.level * 3 + this.tempAttackBuff
    if (this.weapon) a += this.weapon.attack
    return a
  }

  get totalDefense() {
    let d = this.baseDefense + Math.floor(this.level * 1.5) + this.tempDefenseBuff
    if (this.armor) d += this.armor.defense
    return d
  }

  get totalMaxHp() {
    let h = this.maxHp + this.level * 25
    if (this.accessory) h += this.accessory.hp
    return h
  }

  expToLevel() {
    return this.level * 80 + 20
  }

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

  levelUp() {
    this.level++
    this.baseAttack += 3
    this.baseDefense += 1
    this.maxHp += 20
    this.hp = this.totalMaxHp
  }

  takeDamage(rawDamage) {
    const reduced = Math.max(1, rawDamage - this.totalDefense)
    const actual = Math.floor(reduced * (0.9 + Math.random() * 0.2))
    this.hp = Math.max(0, this.hp - actual)
    return actual
  }

  heal(amount) {
    const oldHp = this.hp
    this.hp = Math.min(this.totalMaxHp, this.hp + amount)
    return this.hp - oldHp
  }

  isDead() {
    return this.hp <= 0
  }

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
    const idx = this.inventory.findIndex(i => i === item)
    if (idx >= 0) this.inventory.splice(idx, 1)
  }

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

// ==================== 事件池 ====================
// 所有事件类型
const EVENT_TYPES = [
  'monster',   // 怪物
  'treasure',  // 宝箱
  'spring',    // 生命泉水
  'merchant',  // 神秘商人
  'trap',      // 陷阱机关
  'camp',      // 休息营地
  'altar',     // 遗物祭坛
  'deadend',   // 迷途岔路
  'coins',     // 散落金币
  'buffStone', // 增益石碑
  'oldGear'    // 破旧装备
]

// 生成两个不同事件（怪物占60%权重）
function generateTwoRoomEvents(player) {
  const floor = player.floor
  const atStairs = (player.roomsExplored || 0) >= 10
  const otherTypes = EVENT_TYPES.filter(t => t !== 'monster')

  function pickOne() {
    if (Math.random() < 0.85) {
      return buildEvent('monster', player, floor)
    }
    const type = otherTypes[Math.floor(Math.random() * otherTypes.length)]
    return buildEvent(type, player, floor)
  }

  let left = pickOne()
  let right

  if (atStairs) {
    // 满10间后必有一扇是楼梯
    right = { type: 'stairs' }
  } else {
    right = pickOne()
    while (right.type === left.type) {
      right = pickOne()
    }
  }
  return [left, right]
}

// 根据事件类型构建事件数据
function buildEvent(type, player, floor) {
  switch (type) {
    case 'monster':
      return { type: 'monster', monster: getRandomMonster(floor) }

    case 'treasure':
      return { type: 'treasure', gold: Math.floor(15 + floor * 8 + Math.random() * floor * 15) }

    case 'spring': {
      const lost = player.totalMaxHp - player.hp
      const heal = Math.floor(lost * 0.3)
      return { type: 'spring', heal: Math.max(1, heal) }
    }

    case 'merchant': {
      // 随机生成1-3件商品
      const items = []
      const count = 1 + Math.floor(Math.random() * 3)
      for (let i = 0; i < count; i++) {
        if (Math.random() < 0.5) {
          // 回血药水
          items.push({
            name: '治疗药水',
            desc: '恢复30%生命值',
            price: Math.floor(15 + floor * 3),
            type: 'potion',
            healPercent: 0.3
          })
        } else {
          // 随机装备
          const eq = getRandomEquipment(floor)
          eq.price = Math.floor(eq.price * 0.7) // 商人打折
          items.push(eq)
        }
      }
      return { type: 'merchant', items }
    }

    case 'trap': {
      const dmg = Math.floor(player.hp * 0.15)
      const dodgeChance = 0.15
      return { type: 'trap', damage: Math.max(1, dmg), dodgeChance }
    }

    case 'camp':
      return {
        type: 'camp',
        ambushChance: 0.3,
        ambushMonster: getRandomMonster(floor)
      }

    case 'altar':
      return { type: 'altar', cost: 30, maxCount: 3, altarCount: 0 }

    case 'deadend':
      return { type: 'deadend' }

    case 'coins': {
      const gold = Math.floor(10 + floor * 3 + Math.random() * floor * 8)
      return { type: 'coins', gold }
    }

    case 'buffStone':
      return { type: 'buffStone', attackBonus: 2 }

    case 'oldGear': {
      const def = 2
      const gold = Math.floor(5 + floor * 2)
      return { type: 'oldGear', defense: def, gold }
    }

    default:
      return { type: 'deadend' }
  }
}

// 保留旧的 generateRoomEvent 兼容老代码
function generateRoomEvent(player) {
  return buildEvent(EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)], player, player.floor)
}

// 根据层数获取随机怪物
function getRandomMonster(floor) {
  const available = GameData.monsters.filter(m => m.level <= floor + 2 && m.level >= floor - 1)
  if (available.length === 0) return new Monster(GameData.monsters[GameData.monsters.length - 1])
  const template = available[Math.floor(Math.random() * available.length)]
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
  const tier = Math.min(Math.floor((floor - 1) / 3), 3)
  const pool = GameData.equipment[type].filter(e => e.tier <= tier + 1)
  if (pool.length === 0) return { ...GameData.equipment[type][0], type }
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
    kills: player.kills,
    roomsExplored: player.roomsExplored,
    tempAttackBuff: player.tempAttackBuff,
    tempDefenseBuff: player.tempDefenseBuff
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
  p.roomsExplored = data.roomsExplored || 0
  p.tempAttackBuff = data.tempAttackBuff || 0
  p.tempDefenseBuff = data.tempDefenseBuff || 0
  return p
}

module.exports = {
  Player,
  Monster,
  Battle,
  generateRoomEvent,
  generateTwoRoomEvents,
  getRandomMonster,
  getRandomEquipment,
  savePlayer,
  loadPlayer
}
