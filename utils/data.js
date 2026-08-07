/**
 * 地牢冒险 - 游戏数据
 * 怪物、Boss、装备库
 * 属性说明: critChance 暴击率(0-1) / dodgeChance 闪避率(0-1)
 */

const monsters = [
  { name: '史莱姆', hp: 50, attack: 15, defense: 2, exp: 18, gold: 4, level: 1, critChance: 0.05, dodgeChance: 0.03, desc: '一团黏糊糊的绿色生物' },
  { name: '大老鼠', hp: 55, attack: 17, defense: 2, exp: 22, gold: 5, level: 1, critChance: 0.08, dodgeChance: 0.12, desc: '体型硕大的地牢老鼠，动作敏捷' },
  { name: '骷髅兵', hp: 65, attack: 20, defense: 5, exp: 32, gold: 7, level: 2, critChance: 0.08, dodgeChance: 0.02, desc: '死去冒险者的遗骸，挥剑有力' },
  { name: '暗影蝙蝠', hp: 60, attack: 22, defense: 3, exp: 34, gold: 7, level: 2, critChance: 0.12, dodgeChance: 0.28, desc: '在黑暗中飞行的吸血蝙蝠，极难命中' },
  { name: '哥布林战士', hp: 85, attack: 26, defense: 7, exp: 44, gold: 11, level: 3, critChance: 0.10, dodgeChance: 0.05, desc: '手持生锈短剑的哥布林' },
  { name: '腐尸', hp: 90, attack: 28, defense: 10, exp: 52, gold: 12, level: 3, critChance: 0.05, dodgeChance: 0, desc: '散发着恶臭的不死生物，动作迟缓但皮糙肉厚' },
  { name: '石像鬼', hp: 100, attack: 35, defense: 12, exp: 66, gold: 16, level: 4, critChance: 0.05, dodgeChance: 0, desc: '会动的石像，爪牙锋利，皮糙肉厚' },
  { name: '暗影刺客', hp: 110, attack: 40, defense: 8, exp: 72, gold: 17, level: 5, critChance: 0.25, dodgeChance: 0.22, desc: '来去无踪的暗杀者，暴击极高' },
  { name: '食人魔', hp: 140, attack: 38, defense: 12, exp: 84, gold: 22, level: 5, critChance: 0.08, dodgeChance: 0.02, desc: '体型庞大的丑陋巨人，蛮力惊人' },
  { name: '死亡骑士', hp: 200, attack: 50, defense: 18, exp: 110, gold: 30, level: 7, critChance: 0.15, dodgeChance: 0.05, desc: '堕落的骑士，身穿黑甲' },
  { name: '炎魔', hp: 260, attack: 62, defense: 22, exp: 150, gold: 44, level: 9, critChance: 0.20, dodgeChance: 0.03, desc: '来自深渊的火焰恶魔' },
  { name: '远古巨龙', hp: 400, attack: 90, defense: 30, exp: 240, gold: 80, level: 12, critChance: 0.18, dodgeChance: 0.10, desc: '地牢最深处的守护者，龙威摄人' }
]

// ==================== Boss ====================
// floorOfAppearance: 该 Boss 出现的层数（每5层一个）
const bosses = [
  {
    name: '哥布林王',
    hp: 220, attack: 48, defense: 12, exp: 180, gold: 75,
    level: 5,
    floorOfAppearance: 5,
    critChance: 0.15, dodgeChance: 0.05,
    desc: '盘踞在第五层的哥布林之王，手持黄金战锤',
    skills: [
      { type: 'heavy', name: '狂暴重击', multiplier: 1.5 }
    ],
    loot: {
      name: '王权之冠', type: 'accessory', hp: 100, price: 300, critChance: 0.05,
      tier: 3, desc: '哥布林王的黄金王冠，蕴含着王者之力'
    }
  },
  {
    name: '石像鬼领主',
    hp: 420, attack: 62, defense: 22, exp: 360, gold: 150,
    level: 8,
    floorOfAppearance: 10,
    critChance: 0.12, dodgeChance: 0.03,
    desc: '第十层的守卫者，石像鬼中的领主，双目燃烧着幽火',
    skills: [
      { type: 'heavy', name: '石化凝视', multiplier: 2.0 }
    ],
    loot: {
      name: '石肤护符', type: 'armor', defense: 25, price: 450, dodgeChance: 0.05,
      tier: 3, desc: '由石像鬼核心铸成的护符，坚不可摧'
    }
  },
  {
    name: '死灵法师',
    hp: 650, attack: 80, defense: 30, exp: 600, gold: 240,
    level: 11,
    floorOfAppearance: 15,
    critChance: 0.18, dodgeChance: 0.08,
    desc: '操控亡灵的黑暗法师，法术能汲取你的生命力',
    skills: [
      { type: 'drain', name: '死亡汲取', percent: 0.5 }
    ],
    loot: {
      name: '亡魂法杖', type: 'weapon', attack: 40, price: 600, critChance: 0.08,
      tier: 3, desc: '缠绕着亡魂的法杖，攻击附带灵魂之力'
    }
  },
  {
    name: '深渊恶魔',
    hp: 950, attack: 100, defense: 40, exp: 960, gold: 380,
    level: 14,
    floorOfAppearance: 20,
    critChance: 0.22, dodgeChance: 0.05,
    desc: '来自深渊的火焰恶魔，是第二十层的绝对主宰',
    skills: [
      { type: 'heavy', name: '烈焰吐息', multiplier: 2.0 },
      { type: 'rage', name: '恶魔狂暴', multiplier: 1.3 }
    ],
    loot: {
      name: '恶魔之翼', type: 'armor', defense: 35, price: 900, dodgeChance: 0.10,
      tier: 3, desc: '深渊恶魔的双翼，能吸收火焰的伤害'
    }
  },
  {
    name: '远古邪龙',
    hp: 1400, attack: 130, defense: 50, exp: 1440, gold: 600,
    level: 18,
    floorOfAppearance: 25,
    critChance: 0.20, dodgeChance: 0.15,
    desc: '地牢最深处的远古巨龙，龙息足以毁灭一切',
    skills: [
      { type: 'heavy', name: '毁灭龙息', multiplier: 2.5 },
      { type: 'drain', name: '龙血汲取', percent: 0.4 },
      { type: 'rage', name: '龙之狂暴', multiplier: 1.4 }
    ],
    loot: {
      name: '龙神之心', type: 'accessory', hp: 250, price: 1500, critChance: 0.10, dodgeChance: 0.05,
      tier: 3, desc: '远古邪龙的心脏，跳动着永恒的生命力'
    }
  }
]

const equipment = {
  weapon: [
    { name: '木剑', attack: 5, price: 20, tier: 0, desc: '新手冒险者的第一把武器' },
    { name: '短剑', attack: 9, price: 40, tier: 0, desc: '轻便的近战武器' },
    { name: '铁剑', attack: 14, price: 80, tier: 1, desc: '铁匠铺的标准制品' },
    { name: '阔剑', attack: 20, price: 140, tier: 1, desc: '沉重但威力十足' },
    { name: '秘银长剑', attack: 27, price: 220, tier: 2, desc: '闪烁着银光的魔法武器' },
    { name: '暗影之刃', attack: 35, price: 350, tier: 2, critChance: 0.10, desc: '刀刃上缠绕着黑暗能量，暴击率+10%' },
    { name: '龙牙战斧', attack: 45, price: 520, tier: 3, critChance: 0.05, desc: '用龙牙锻造的传奇巨斧，暴击率+5%' },
    { name: '灭神之剑', attack: 60, price: 800, tier: 3, critChance: 0.15, desc: '传说中能斩杀神明的圣剑，暴击率+15%' }
  ],
  armor: [
    { name: '布甲', defense: 3, price: 20, tier: 0, desc: '聊胜于无的防护' },
    { name: '皮甲', defense: 6, price: 45, tier: 0, desc: '猎人们常用的轻便护甲' },
    { name: '锁子甲', defense: 10, price: 90, tier: 1, desc: '由金属环编织而成' },
    { name: '板甲', defense: 15, price: 160, tier: 1, desc: '厚重的全身铁甲' },
    { name: '秘银护甲', defense: 21, price: 250, tier: 2, desc: '轻如鸿毛，坚如磐石' },
    { name: '暗影斗篷', defense: 18, price: 230, tier: 2, dodgeChance: 0.12, desc: '能吸收部分伤害的魔法斗篷，闪避率+12%' },
    { name: '龙鳞铠甲', defense: 30, price: 500, tier: 3, dodgeChance: 0.08, desc: '镶嵌着龙鳞的终极铠甲，闪避率+8%' }
  ],
  accessory: [
    { name: '铜戒指', hp: 20, price: 30, tier: 0, desc: '普通的铜制戒指' },
    { name: '生命护符', hp: 35, price: 60, tier: 0, desc: '蕴含微弱生命力的护符' },
    { name: '银项链', hp: 55, price: 110, tier: 1, desc: '做工精美的银项链' },
    { name: '红宝石戒指', hp: 80, price: 190, tier: 1, critChance: 0.05, desc: '镶嵌着血红宝石的戒指，暴击率+5%' },
    { name: '凤凰羽毛', hp: 120, price: 300, tier: 2, dodgeChance: 0.10, desc: '传说中凤凰的尾羽，闪避率+10%' },
    { name: '龙心护符', hp: 180, price: 480, tier: 3, critChance: 0.10, dodgeChance: 0.05, desc: '蕴含着巨龙的生命精华，暴击+10% 闪避+5%' }
  ]
}

module.exports = { monsters, bosses, equipment }
