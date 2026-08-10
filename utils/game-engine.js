/**
 * 地牢远征 - 游戏核心引擎
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

// ==================== 词缀系统 ====================
// 怪物随机附加词缀，改变属性与名字
const AFFIXES = [
  { name: '强壮', hpMul: 1.4, atkMul: 1.2, desc: '血厚攻高' },
  { name: '迅捷', dodgeAdd: 0.15, desc: '闪避+15%' },
  { name: '暴虐', critAdd: 0.15, desc: '暴击+15%' },
  { name: '铁壁', defMul: 1.5, desc: '防御+50%' },
  { name: '剧毒', poison: true, atkMul: 1.1, desc: '攻击附加中毒' },
  { name: '精英', hpMul: 1.3, atkMul: 1.3, defMul: 1.3, expMul: 2, goldMul: 2, desc: '全属性提升，奖励翻倍' }
]

// 根据层数与难度决定是否附加词缀（越深越容易遇到）
function rollAffix(floor, difficulty) {
  const base = 0.08 + floor * 0.012
  const diffBonus = difficulty === 'nightmare' ? 0.1 : difficulty === 'hard' ? 0.05 : 0
  if (Math.random() < base + diffBonus) {
    return AFFIXES[Math.floor(Math.random() * AFFIXES.length)]
  }
  return null
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
    this.top = null        // 上衣
    this.pants = null      // 裤子
    this.accessory1 = null // 饰品1
    this.accessory2 = null // 饰品2
    this.inventory = []
    this.floor = 1
    this.kills = 0
    this.roomsExplored = 0 // 当前层已探索房间数
    this.tempAttackBuff = 0  // 增益石碑临时攻击加成
    this.tempDefenseBuff = 0 // 破旧装备临时防御加成
    this.tempDodgeBuff = 0   // 主题药水临时闪避加成
    this.fleeFails = 0       // 本次遭遇逃跑失败次数（每失败+10%成功率）
    this.poisonTurns = 0     // 中毒剩余回合
  }

  get totalAttack() {
    let a = this.baseAttack + this.level * 2 + this.tempAttackBuff
    if (this.weapon) a += this.weapon.attack + this.getEnhanceBonus(this.weapon)
    return a
  }

  get totalDefense() {
    let d = this.baseDefense + Math.floor(this.level * 1.5) + this.tempDefenseBuff
    for (const slot of ['top', 'pants']) {
      if (this[slot]) d += this[slot].defense + this.getEnhanceBonus(this[slot])
    }
    return d
  }

  get totalMaxHp() {
    let h = this.maxHp + this.level * 10
    for (const slot of ['accessory1', 'accessory2']) {
      if (this[slot]) h += (this[slot].hp || 0) + this.getEnhanceBonus(this[slot])  // 无血量饰品(暴击/闪避款)加0
    }
    return h
  }

  // 总暴击率 = 基础 + 装备
  get totalCrit() {
    let c = this.baseCrit
    for (const slot of ['weapon', 'top', 'pants', 'accessory1', 'accessory2']) {
      if (this[slot]) c += this[slot].critChance || 0
    }
    return Math.min(0.6, c)
  }

  // 总闪避率 = 基础 + 装备 + 临时增益
  get totalDodge() {
    let d = this.baseDodge
    for (const slot of ['weapon', 'top', 'pants', 'accessory1', 'accessory2']) {
      if (this[slot]) d += this[slot].dodgeChance || 0
    }
    if (this.tempDodgeBuff) d += this.tempDodgeBuff
    return Math.min(0.5, d)
  }

  expToLevel() {
    return this.level * 140 + 60  // 升级变难: 1级升2级需200exp(约13只小史莱姆)
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
    this.baseAttack += 2  // 方案2: 成长放缓, 装备驱动
    this.baseDefense += 1
    this.maxHp += 8
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
      case 'top':
      case 'armor':  // 兼容旧存档装备
        if (this.top) this.inventory.push(this.top)
        this.top = item
        if (this.top.type === 'armor') this.top.type = 'top'
        break
      case 'pants':
        if (this.pants) this.inventory.push(this.pants)
        this.pants = item
        break
      case 'accessory':
        if (!this.accessory1) this.accessory1 = item
        else if (!this.accessory2) this.accessory2 = item
        else { if (this.accessory1) this.inventory.push(this.accessory1); this.accessory1 = item }
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

  // ============ 铁匠铺强化 ============

  // 强化等级上限：随层数解锁（1-5层=1级, 6-10层=2级, ... 21-25层=5级）
  get maxEnhanceLevel() {
    return Math.min(Math.ceil(this.floor / 5), 5)
  }

  // 强化加成：每级武器+3攻 / 护甲+3防 / 饰品+15生命
  getEnhanceBonus(item) {
    if (!item || !item.enhanceLevel) return 0
    const lv = item.enhanceLevel
    if (item.type === 'weapon') return lv * 3
    if (item.type === 'top' || item.type === 'pants' || item.type === 'armor') return lv * 3
    if (item.type === 'accessory') return lv * 15
    return 0
  }

  // 强化费用：基础价 × 0.4 × (当前等级+1)，随等级递增
  getEnhanceCost(item) {
    // 固定50一次, 每强化一次+50 (50/100/150...)
    const lv = item.enhanceLevel || 0
    return 50 * (lv + 1)
  }

  // 强化装备：返回 true/false
  enhance(item) {
    if (!item) return false
    const lv = item.enhanceLevel || 0
    if (lv >= this.maxEnhanceLevel) return false
    const cost = this.getEnhanceCost(item)
    if (this.gold < cost) return false
    this.gold -= cost
    item.enhanceLevel = lv + 1
    return true
  }
}

// ==================== 怪物类 ====================
class Monster {
  constructor(template) {
    this.name = template.name
    this.icon = template.icon || '👹'  // 怪物图案（默认魔鬼）
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
    // 词缀
    this.affix = template.affix || null
    this.poison = !!template.poison // 攻击附带中毒
    this.expMul = template.expMul || 1
    this.goldMul = template.goldMul || 1
    // 应用词缀
    if (this.affix) this._applyAffix(this.affix)
  }

  _applyAffix(affix) {
    if (affix.hpMul) { this.hp = Math.floor(this.hp * affix.hpMul); this.maxHp = this.hp }
    if (affix.atkMul) this.attack = Math.floor(this.attack * affix.atkMul)
    if (affix.defMul) this.defense = Math.floor(this.defense * affix.defMul)
    if (affix.critAdd) { this.critChance = Math.min(0.6, this.critChance + affix.critAdd); this.critPercent = Math.round(this.critChance * 100) }
    if (affix.dodgeAdd) { this.dodgeChance = Math.min(0.5, this.dodgeChance + affix.dodgeAdd); this.dodgePercent = Math.round(this.dodgeChance * 100) }
    if (affix.poison) this.poison = true
    if (affix.expMul) this.expMul = affix.expMul
    if (affix.goldMul) this.goldMul = affix.goldMul
    // 名字加前缀
    this.name = affix.name + this.name
    this.desc = `${affix.desc}。${this.desc}`
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
    // 玩家中毒状态：poisonTurns > 0 时每回合扣血
    if (!this.player.poisonTurns) this.player.poisonTurns = 0
  }

  // 玩家中毒结算：每回合开始扣血（剧毒词缀怪造成）
  tickPoison() {
    const p = this.player
    if (p.poisonTurns > 0) {
      const poisonDmg = Math.max(1, Math.floor(p.totalMaxHp * 0.03))
      p.hp = Math.max(0, p.hp - poisonDmg)
      p.poisonTurns--
      this.log(`中毒发作！你损失了 ${poisonDmg} 点生命（剩余 ${p.poisonTurns} 回合）`, 'poison')
      return poisonDmg
    }
    return 0
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

  // 怪物攻击: 先判玩家闪避，再判怪物暴击，剧毒怪附加中毒
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

    // 剧毒词缀怪：攻击附加中毒（持续3回合）
    if (this.monster.poison) {
      p.poisonTurns = 3
      this.log(`${this.monster.name} 的剧毒侵蚀了你！接下来 3 回合将持续掉血`, 'poison')
    }

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
      // 神秘商人：卖该层主题的专属商品（商店买不到）
      const theme = GameData.getThemeForFloor(floor)
      const goods = GameData.themeMerchantGoods[theme.id]
      const items = goods ? goods.items.map(g => ({ ...g })) : []
      // 按层数调整价格
      for (const it of items) {
        it.price = Math.floor(it.price * (1 + (floor - 1) * 0.02))
      }
      return { type: 'merchant', items, themeName: theme.name, merchantName: theme.merchantName || '神秘商人', merchantIcon: theme.merchantIcon || '🧙' }
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

// 根据层数获取随机怪物（按主题过滤 + 层数加权 + 词缀 + 难度缩放）
function getRandomMonster(floor, difficulty) {
  const d = DIFFICULTY_MULT[difficulty] || DIFFICULTY_MULT.easy
  // 按主题取怪物池（不修改原数组）
  const theme = GameData.getThemeForFloor(floor)
  const pool = [...(GameData.monsters[theme.id] || GameData.monsters.slime)].sort((a, b) => a.level - b.level)

  // ---- 层数加权：同主题内，弱怪在浅层占比高，越深强怪越多 ----
  // 主题内层数 1-5（如 1-5层=主题第1-5层, 6-10层=第1-5层）
  const floorInTheme = ((floor - 1) % 5) + 1
  // 权重：怪物强度位置(1-5)越接近当前层数权重越高
  const weights = pool.map((m, i) => {
    const dist = Math.abs((i + 1) - floorInTheme)
    return Math.max(0.15, 1 - dist * 0.35)
  })
  const totalW = weights.reduce((s, w) => s + w, 0)
  let roll = Math.random() * totalW
  let template = pool[pool.length - 1]
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]
    if (roll <= 0) { template = pool[i]; break }
  }

  // ---- 等级随层偏移：同种怪在主题内越深等级越高 ----
  // displayLevel = 基础等级 + (主题内层数-1)，封顶主题内最高等级，且不低于基础等级
  const themeMaxLevel = Math.max(...pool.map(m => m.level))
  const levelOffset = Math.min(floorInTheme - 1, themeMaxLevel - template.level)
  const displayLevel = template.level + Math.max(0, levelOffset)

  const scaled = { ...template }
  // 按等级成长：每级血+15% 攻+10% 防+8% 经验金币+10%
  const grow = displayLevel - template.level
  if (grow > 0) {
    scaled.hp = Math.floor(template.hp * Math.pow(1.15, grow))
    scaled.attack = Math.floor(template.attack * Math.pow(1.10, grow))
    scaled.defense = Math.floor(template.defense * Math.pow(1.08, grow))
    scaled.exp = Math.floor(template.exp * Math.pow(1.10, grow))
    scaled.gold = Math.floor(template.gold * Math.pow(1.10, grow))
  }
  scaled.level = displayLevel
  // 难度缩放: 攻击/防御/奖励大幅，HP 小幅
  if (d.atk > 1 || d.hp > 1) {
    scaled.hp = Math.floor(scaled.hp * d.hp)
    scaled.attack = Math.floor(scaled.attack * d.atk)
    scaled.defense = Math.floor(scaled.defense * d.atk)
    scaled.exp = Math.floor(scaled.exp * d.atk)
    scaled.gold = Math.floor(scaled.gold * d.atk)
  }
  // 词缀
  const affix = rollAffix(floor, difficulty)
  if (affix) scaled.affix = affix
  return new Monster(scaled)
}

// 获取当前层对应的 Boss（每5层一个，超过25层后强化最后一个Boss，按难度缩放）
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

// 获取随机装备（按当前层 tier，只出当前主题能获得的最好装备）
function getRandomEquipment(floor) {
  const types = ['weapon', 'top', 'pants', 'accessory']
  const type = types[Math.floor(Math.random() * types.length)]
  // tier 与层数绑定：1-5层=tier1, 6-10=tier2, ... 21-25=tier5
  const tier = Math.min(Math.ceil(floor / 5), 5)
  const pool = GameData.equipment[type].filter(e => e.tier === tier)
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
    top: player.top,
    pants: player.pants,
    accessory1: player.accessory1,
    accessory2: player.accessory2,
    inventory: player.inventory,
    floor: player.floor,
    kills: player.kills,
    roomsExplored: player.roomsExplored,
    tempAttackBuff: player.tempAttackBuff,
    tempDefenseBuff: player.tempDefenseBuff,
    tempDodgeBuff: player.tempDodgeBuff || 0,
    fleeFails: player.fleeFails,
    poisonTurns: player.poisonTurns || 0
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
  // 槽位迁移: 旧存档 armor->top(上衣), accessory->accessory1(饰品1)
  p.weapon = data.weapon
  p.top = data.top || data.armor || null
  if (p.top && p.top.type === 'armor') p.top.type = 'top'
  p.pants = data.pants || null
  p.accessory1 = data.accessory1 || data.accessory || null
  p.accessory2 = data.accessory2 || null
  p.inventory = (data.inventory || []).map(it => it && it.type === 'armor' ? { ...it, type: 'top' } : it)
  p.floor = data.floor
  p.kills = data.kills
  p.roomsExplored = data.roomsExplored || 0
  p.tempAttackBuff = data.tempAttackBuff || 0
  p.tempDefenseBuff = data.tempDefenseBuff || 0
  p.tempDodgeBuff = data.tempDodgeBuff || 0
  p.fleeFails = data.fleeFails || 0
  p.poisonTurns = data.poisonTurns || 0
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
