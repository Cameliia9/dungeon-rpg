/**
 * 地牢冒险 - 游戏核心引擎
 * 角色、战斗、装备系统 + 扩展事件池
 * 伤害公式: floor(攻击力 - 防御力 * 0.8)，保底 1
 */

const GameData = require('./data')

// 难度系数: 影响怪物强度（攻击/防御/经验/金币大幅，HP 小幅）
const DIFFICULTY_MULT = {
  easy: { atk: 1.0, hp: 1.0 },
  hard: { atk: 1.25, hp: 1.1 },
  nightmare: { atk: 1.5, hp: 1.2 }
}

// ==================== 玩家类 ====================
class Player {
  constructor(name, difficulty) {
    this.name = name
    this.difficulty = difficulty || 'easy'
    this.level = 1
    this.exp = 0
    this.maxHp = 100
    this.hp = 100
    this.baseAttack = 12
    this.baseDefense = 5
    this.baseCrit = 0.10   // 基础暴击率 10%
    this.baseDodge = 0.05  // 基础闪避率 5%
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
    this.fleeFails = 0       // 本次遭遇逃跑失败次数（每失败+10%成功率）
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

  // 总暴击率 = 基础 + 装备
  get totalCrit() {
    let c = this.baseCrit
    if (this.weapon) c += this.weapon.critChance || 0
    if (this.armor) c += this.armor.critChance || 0
    if (this.accessory) c += this.accessory.critChance || 0
    return Math.min(0.6, c)
  }

  // 总闪避率 = 基础 + 装备
  get totalDodge() {
    let d = this.baseDodge
    if (this.weapon) d += this.weapon.dodgeChance || 0
    if (this.armor) d += this.armor.dodgeChance || 0
    if (this.accessory) d += this.accessory.dodgeChance || 0
    return Math.min(0.5, d)
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

  // 升级回复比例（恢复已损失生命值的百分比，按难度）
  get levelUpHealRatio() {
    switch (this.difficulty) {
      case 'hard': return 0.6
      case 'nightmare': return 0.4
      default: return 0.8
    }
  }

  levelUp() {
    // 记录升级前的损失生命值
    const lostBefore = Math.max(0, this.totalMaxHp - this.hp)
    this.level++
    this.baseAttack += 3
    this.baseDefense += 1
    this.maxHp += 20
    // 升级不回复满血，只恢复已损失生命的比例（easy 80% / hard 60% / nightmare 40%）
    // 用整数百分比避免浮点误差（如 1-0.8=0.19999999999999996）
    const healPercent = Math.round(this.levelUpHealRatio * 100)
    const remaining = Math.floor(lostBefore * (100 - healPercent) / 100)
    this.hp = Math.max(1, this.totalMaxHp - remaining)
  }

  takeDamage(rawDamage) {
    const actual = Math.max(1, Math.floor(rawDamage))
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
    this.critChance = template.critChance || 0.05   // 暴击率
    this.dodgeChance = template.dodgeChance || 0    // 闪避率
    // 用于界面显示（WXML 不支持 Math.round）
    this.critPercent = Math.round(this.critChance * 100)
    this.dodgePercent = Math.round(this.dodgeChance * 100)
    this.isBoss = !!template.isBoss
    this.skills = template.skills || []
    this.loot = template.loot || null
  }

  takeDamage(rawDamage) {
    const actual = Math.max(1, Math.floor(rawDamage))
    this.hp = Math.max(0, this.hp - actual)
    return actual
  }

  isDead() {
    return this.hp <= 0
  }

  // 基础伤害: floor(攻击 - 防御*0.8)
  dealDamage(targetDefense) {
    return Math.max(1, Math.floor(this.attack - targetDefense * 0.8))
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

  // 玩家攻击: 先判怪物闪避，再判玩家暴击
  playerAttack() {
    const m = this.monster

    // 怪物闪避
    if (Math.random() < m.dodgeChance) {
      this.log(`${m.name} 灵巧地闪避了你的攻击！`, 'dodge')
      this.turn++
      return 'continue'
    }

    // 基础伤害 = floor(玩家攻击 - 怪物防御*0.8)
    let dmg = Math.max(1, Math.floor(this.player.totalAttack - m.defense * 0.8))

    // 玩家暴击
    const isCrit = Math.random() < this.player.totalCrit
    if (isCrit) dmg = Math.floor(dmg * 1.5)

    m.takeDamage(dmg)
    this.log(isCrit
      ? `你对 ${m.name} 造成暴击 ${dmg} 点伤害！`
      : `你对 ${m.name} 造成了 ${dmg} 点伤害`, isCrit ? 'crit' : 'damage')
    this.turn++
    if (m.isDead()) {
      this.log(`你击败了 ${m.name}！`, 'loot')
      return 'victory'
    }
    return 'continue'
  }

  // 怪物攻击: 先判玩家闪避，再判怪物暴击
  monsterAttack() {
    const p = this.player

    // 玩家闪避
    if (Math.random() < p.totalDodge) {
      this.log(`你侧身躲开了 ${this.monster.name} 的攻击！`, 'dodge')
      this.turn++
      return 'continue'
    }

    // 基础伤害 = floor(怪物攻击 - 玩家防御*0.8)
    let dmg = Math.max(1, Math.floor(this.monster.attack - p.totalDefense * 0.8))

    // 怪物暴击
    const isCrit = Math.random() < this.monster.critChance
    if (isCrit) dmg = Math.floor(dmg * 1.5)

    p.takeDamage(dmg)
    this.log(isCrit
      ? `${this.monster.name} 对你造成暴击 ${dmg} 点伤害！`
      : `${this.monster.name} 对你造成了 ${dmg} 点伤害`, isCrit ? 'crit' : 'damage')
    this.turn++
    if (p.isDead()) {
      this.log('你被打倒了...', 'info')
      return 'defeat'
    }
    return 'continue'
  }

  // Boss 释放技能（30%概率由调用方决定）
  monsterSkillAttack() {
    const skills = this.monster.skills
    if (!skills || skills.length === 0) return this.monsterAttack()
    const skill = skills[Math.floor(Math.random() * skills.length)]

    switch (skill.type) {
      case 'heavy': {
        const raw = this.monster.dealDamage(this.player.totalDefense) * skill.multiplier
        const dmg = this.player.takeDamage(raw)
        this.log(`${this.monster.name} 使出【${skill.name}】！对你造成 ${dmg} 点伤害！`, 'skill')
        break
      }
      case 'drain': {
        const dmg = this.player.takeDamage(this.monster.dealDamage(this.player.totalDefense))
        const healed = Math.min(this.monster.maxHp - this.monster.hp, Math.floor(dmg * skill.percent))
        this.monster.hp += healed
        this.log(`${this.monster.name} 使出【${skill.name}】！造成 ${dmg} 点伤害并恢复 ${healed} 点生命！`, 'skill')
        break
      }
      case 'rage': {
        this.monster.attack = Math.floor(this.monster.attack * skill.multiplier)
        this.log(`${this.monster.name} 使出【${skill.name}】！攻击力大幅提升！`, 'skill')
        break
      }
      default:
        return this.monsterAttack()
    }

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
  const otherTypes = EVENT_TYPES.filter(t => t !== 'monster')

  function pickOne() {
    if (Math.random() < 0.85) {
      return buildEvent('monster', player, floor)
    }
    const type = otherTypes[Math.floor(Math.random() * otherTypes.length)]
    return buildEvent(type, player, floor)
  }

  let left = pickOne()
  let right = pickOne()
  while (right.type === left.type) {
    right = pickOne()
  }
  return [left, right]
}

// 根据事件类型构建事件数据
function buildEvent(type, player, floor) {
  switch (type) {
    case 'monster':
      return { type: 'monster', monster: getRandomMonster(floor, player.difficulty) }

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
        ambushMonster: getRandomMonster(floor, player.difficulty)
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

// 根据层数获取随机怪物（按难度缩放）
function getRandomMonster(floor, difficulty) {
  const d = DIFFICULTY_MULT[difficulty] || DIFFICULTY_MULT.easy
  const available = GameData.monsters.filter(m => m.level <= floor + 1 && m.level >= floor - 1)
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
  // 难度缩放: 攻击/防御/奖励大幅，HP 小幅
  if (d.atk > 1 || d.hp > 1) {
    scaled.hp = Math.floor(scaled.hp * d.hp)
    scaled.attack = Math.floor(scaled.attack * d.atk)
    scaled.defense = Math.floor(scaled.defense * d.atk)
    scaled.exp = Math.floor(scaled.exp * d.atk)
    scaled.gold = Math.floor(scaled.gold * d.atk)
  }
  return new Monster(scaled)
}

// 获取当前层对应的 Boss（每5层一个，超过25层后强化远古邪龙，按难度缩放）
function getBossForFloor(floor, difficulty) {
  const d = DIFFICULTY_MULT[difficulty] || DIFFICULTY_MULT.easy
  const index = Math.floor((floor - 1) / 5)
  const bossIndex = Math.min(index, GameData.bosses.length - 1)
  const template = GameData.bosses[bossIndex]

  // 25层之后：每多5层，Boss 强化 15%
  const extra = Math.max(0, index - (GameData.bosses.length - 1))
  const atkScale = Math.pow(1.15, extra) * d.atk
  const hpScale = Math.pow(1.15, extra) * d.hp

  const scaled = {
    ...template,
    hp: Math.floor(template.hp * hpScale),
    attack: Math.floor(template.attack * atkScale),
    defense: Math.floor(template.defense * atkScale),
    exp: Math.floor(template.exp * atkScale),
    gold: Math.floor(template.gold * atkScale),
    level: Math.floor(template.level * atkScale)
  }
  const boss = new Monster(scaled)
  boss.isBoss = true
  return boss
}

// 每层需要探索的房间数：基础 15，每打完一个 Boss（第5/10/15...层）后续每层 +3
// 例：1-5层=15间，6-10层=18间，11-15层=21间
function getRoomsPerFloor(floor) {
  const bossesDefeated = Math.floor((floor - 1) / 5)
  return 15 + bossesDefeated * 3
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
    difficulty: player.difficulty,
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
    tempDefenseBuff: player.tempDefenseBuff,
    fleeFails: player.fleeFails
  }
}

function loadPlayer(data) {
  const p = new Player(data.name, data.difficulty || 'easy')
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
  p.fleeFails = data.fleeFails || 0
  return p
}

module.exports = {
  Player,
  Monster,
  Battle,
  DIFFICULTY_MULT,
  generateRoomEvent,
  generateTwoRoomEvents,
  getRandomMonster,
  getBossForFloor,
  getRandomEquipment,
  getRoomsPerFloor,
  savePlayer,
  loadPlayer
}
