/**
 * 地牢冒险 - 游戏数据
 * 五层主题区域：黏液沼泽 → 骸骨墓穴 → 暗影回廊 → 深渊火狱 → 龙之巢穴
 * 属性: critChance 暴击率 / dodgeChance 闪避率
 */

// ==================== 主题区域 ====================
// 每 5 层一个主题，floorRange 为该主题覆盖的层数
const THEMES = [
  {
    id: 'slime',
    name: '黏液沼泽',
    icon: '🟢',
    floorRange: [1, 5],
    desc: '湿滑的沼泽地，空气中弥漫着酸味',
    merchantDesc: '沼泽商贩',
    merchantIcon: '🐸'
  },
  {
    id: 'bone',
    name: '骸骨墓穴',
    icon: '💀',
    floorRange: [6, 10],
    desc: '阴森的墓穴，白骨堆积如山',
    merchantDesc: '墓穴游商',
    merchantIcon: '🦴'
  },
  {
    id: 'shadow',
    name: '暗影回廊',
    icon: '🌑',
    floorRange: [11, 15],
    desc: '永恒的黑暗，只有阴影在流动',
    merchantDesc: '暗影商人',
    merchantIcon: '🌫️'
  },
  {
    id: 'abyss',
    name: '深渊火狱',
    icon: '🔥',
    floorRange: [16, 20],
    desc: '滚烫的熔岩与烈焰交织',
    merchantDesc: '深渊贩子',
    merchantIcon: '😈'
  },
  {
    id: 'dragon',
    name: '龙之巢穴',
    icon: '🐉',
    floorRange: [21, 25],
    desc: '巨龙的领地，鳞片在暗处闪光',
    merchantDesc: '龙裔行商',
    merchantIcon: '🗡️'
  }
]

// 获取层数对应的主题
function getThemeForFloor(floor) {
  const index = Math.min(Math.floor((floor - 1) / 5), THEMES.length - 1)
  return THEMES[index]
}

// ==================== 怪物（按主题分组） ====================
const monsters = {
  // ---- 1-5层 黏液沼泽 ----
  slime: [
    { name: '小史莱姆', hp: 45, attack: 14, defense: 2, exp: 16, gold: 4, level: 1, critChance: 0.05, dodgeChance: 0.05, desc: '一滩会动的绿色黏液', icon: '🟢' },
    { name: '大史莱姆', hp: 70, attack: 18, defense: 4, exp: 28, gold: 7, level: 2, critChance: 0.06, dodgeChance: 0.04, desc: '体型庞大的黏稠怪物', icon: '🟩' },
    { name: '毒液史莱姆', hp: 60, attack: 22, defense: 5, exp: 34, gold: 9, level: 3, critChance: 0.12, dodgeChance: 0.08, desc: '体表泛着危险紫光的剧毒史莱姆', icon: '🟣' },
    { name: '黏土怪', hp: 90, attack: 24, defense: 10, exp: 40, gold: 11, level: 3, critChance: 0.05, dodgeChance: 0, desc: '由沼泽淤泥凝聚成的怪物，皮糙肉厚', icon: '🟤' },
    { name: '巨鼠', hp: 80, attack: 26, defense: 5, exp: 44, gold: 12, level: 4, critChance: 0.10, dodgeChance: 0.15, desc: '沼泽边长大的巨型老鼠，动作敏捷', icon: '🐀' }
  ],

  // ---- 6-10层 骸骨墓穴 ----
  bone: [
    { name: '骷髅兵', hp: 90, attack: 30, defense: 8, exp: 50, gold: 14, level: 6, critChance: 0.08, dodgeChance: 0.02, desc: '死去冒险者的遗骸，挥剑有力', icon: '💀' },
    { name: '骷髅射手', hp: 80, attack: 34, defense: 6, exp: 56, gold: 16, level: 6, critChance: 0.15, dodgeChance: 0.08, desc: '弓弦崩响，骨箭破空而来', icon: '🏹' },
    { name: '腐尸', hp: 120, attack: 32, defense: 12, exp: 60, gold: 17, level: 7, critChance: 0.05, dodgeChance: 0, desc: '散发着恶臭的不死生物，动作迟缓', icon: '🧟' },
    { name: '食尸鬼', hp: 100, attack: 38, defense: 8, exp: 66, gold: 19, level: 8, critChance: 0.12, dodgeChance: 0.10, desc: '饥渴的食尸者，扑食速度极快', icon: '👺' },
    { name: '墓穴僵尸', hp: 150, attack: 36, defense: 14, exp: 72, gold: 21, level: 9, critChance: 0.05, dodgeChance: 0, desc: '被墓穴诅咒复活的巨型僵尸', icon: '🧟♂️' }
  ],

  // ---- 11-15层 暗影回廊 ----
  shadow: [
    { name: '暗影蝙蝠', hp: 90, attack: 44, defense: 6, exp: 76, gold: 22, level: 10, critChance: 0.12, dodgeChance: 0.28, desc: '在黑暗中飞行的吸血蝙蝠，极难命中', icon: '🦇' },
    { name: '暗影刺客', hp: 110, attack: 50, defense: 8, exp: 84, gold: 25, level: 11, critChance: 0.25, dodgeChance: 0.22, desc: '来去无踪的暗杀者，暴击极高', icon: '🥷' },
    { name: '怨灵', hp: 100, attack: 48, defense: 5, exp: 80, gold: 24, level: 11, critChance: 0.15, dodgeChance: 0.25, desc: '虚幻的亡灵，刀剑难以触及', icon: '👻' },
    { name: '暗影狼', hp: 140, attack: 54, defense: 10, exp: 90, gold: 27, level: 12, critChance: 0.15, dodgeChance: 0.12, desc: '由暗影凝成的狼群猎手', icon: '🐺' },
    { name: '夜魔', hp: 170, attack: 58, defense: 14, exp: 98, gold: 30, level: 13, critChance: 0.18, dodgeChance: 0.08, desc: '暗影回廊的巡逻者，双目血红', icon: '👿' }
  ],

  // ---- 16-20层 深渊火狱 ----
  abyss: [
    { name: '小恶魔', hp: 150, attack: 60, defense: 12, exp: 104, gold: 32, level: 14, critChance: 0.12, dodgeChance: 0.10, desc: '尖牙利爪的深渊幼魔', icon: '😈' },
    { name: '地狱犬', hp: 180, attack: 64, defense: 14, exp: 112, gold: 35, level: 15, critChance: 0.15, dodgeChance: 0.10, desc: '三头燃火的深渊猎犬', icon: '🐕' },
    { name: '熔岩怪', hp: 240, attack: 62, defense: 22, exp: 118, gold: 37, level: 16, critChance: 0.08, dodgeChance: 0, desc: '由滚烫熔岩构成的庞然大物', icon: '🌋' },
    { name: '火元素', hp: 190, attack: 70, defense: 16, exp: 126, gold: 40, level: 17, critChance: 0.18, dodgeChance: 0.05, desc: '纯粹火焰构成的元素生物', icon: '🔥' },
    { name: '炎魔', hp: 260, attack: 76, defense: 20, exp: 140, gold: 45, level: 18, critChance: 0.20, dodgeChance: 0.03, desc: '来自深渊的火焰恶魔', icon: '👹' }
  ],

  // ---- 21-25层 龙之巢穴 ----
  dragon: [
    { name: '幼龙', hp: 220, attack: 76, defense: 18, exp: 148, gold: 48, level: 19, critChance: 0.15, dodgeChance: 0.10, desc: '尚未成年的小龙，已具龙威', icon: '🐲' },
    { name: '龙人战士', hp: 260, attack: 82, defense: 22, exp: 160, gold: 52, level: 20, critChance: 0.15, dodgeChance: 0.05, desc: '披鳞执盾的龙裔战士', icon: '🐉' },
    { name: '龙人法师', hp: 240, attack: 88, defense: 18, exp: 168, gold: 55, level: 21, critChance: 0.20, dodgeChance: 0.08, desc: '吟唱龙语的龙裔施法者', icon: '🧙' },
    { name: '亚龙', hp: 320, attack: 86, defense: 24, exp: 176, gold: 58, level: 22, critChance: 0.15, dodgeChance: 0.08, desc: '接近成年龙的强大亚龙', icon: '🦖' },
    { name: '精英龙裔', hp: 280, attack: 92, defense: 20, exp: 190, gold: 62, level: 23, critChance: 0.22, dodgeChance: 0.10, desc: '龙裔中的精锐战士', icon: '⚔️' }
  ]
}

// ==================== Boss（每5层一个，主题对应） ====================
const bosses = [
  {
    name: '史莱姆之王',
    hp: 260, attack: 46, defense: 12, exp: 200, gold: 90,
    level: 5,
    floorOfAppearance: 5,
    critChance: 0.15, dodgeChance: 0.08,
    desc: '黏液沼泽的统治者，通体翠绿的巨型史莱姆', icon: '🐸',
    skills: [
      { type: 'heavy', name: '黏液重压', multiplier: 1.6 },
      { type: 'drain', name: '分裂再生', percent: 0.35 }
    ],
    loot: {
      name: '王浆之核', type: 'accessory', hp: 100, price: 320, dodgeChance: 0.05,
      tier: 1, desc: '史莱姆之王的核心，蕴含着沼泽的生命力，闪避+5%'
    }
  },
  {
    name: '墓穴领主',
    hp: 480, attack: 62, defense: 22, exp: 420, gold: 170,
    level: 8,
    floorOfAppearance: 10,
    critChance: 0.12, dodgeChance: 0.03,
    desc: '骸骨墓穴的主宰，统御着无数亡灵', icon: '🦴',
    skills: [
      { type: 'heavy', name: '骸骨冲击', multiplier: 1.8 },
      { type: 'rage', name: '亡灵狂怒', multiplier: 1.3 }
    ],
    loot: {
      name: '骸骨王冠', type: 'armor', defense: 22, price: 480, critChance: 0.05,
      tier: 2, desc: '墓穴领主之冠，亡者之力加身，暴击+5%'
    }
  },
  {
    name: '死灵法师',
    hp: 720, attack: 80, defense: 30, exp: 680, gold: 270,
    level: 11,
    floorOfAppearance: 15,
    critChance: 0.18, dodgeChance: 0.08,
    desc: '操控亡灵的黑暗法师，法术能汲取你的生命力', icon: '🪄',
    skills: [
      { type: 'drain', name: '死亡汲取', percent: 0.5 }
    ],
    loot: {
      name: '亡魂法杖', type: 'weapon', attack: 40, price: 650, critChance: 0.08,
      tier: 3, desc: '缠绕着亡魂的法杖，攻击附带灵魂之力，暴击+8%'
    }
  },
  {
    name: '深渊恶魔',
    hp: 1050, attack: 100, defense: 40, exp: 1080, gold: 430,
    level: 14,
    floorOfAppearance: 20,
    critChance: 0.22, dodgeChance: 0.05,
    desc: '来自深渊的火焰恶魔，是第二十层的绝对主宰', icon: '👹',
    skills: [
      { type: 'heavy', name: '烈焰吐息', multiplier: 2.0 },
      { type: 'rage', name: '恶魔狂暴', multiplier: 1.3 }
    ],
    loot: {
      name: '恶魔之翼', type: 'armor', defense: 32, price: 950, dodgeChance: 0.10,
      tier: 4, desc: '深渊恶魔的双翼，能吸收火焰的伤害，闪避+10%'
    }
  },
  {
    name: '远古邪龙',
    hp: 1500, attack: 130, defense: 50, exp: 1600, gold: 680,
    level: 18,
    floorOfAppearance: 25,
    critChance: 0.20, dodgeChance: 0.15,
    desc: '地牢最深处的远古巨龙，龙息足以毁灭一切', icon: '🐉',
    skills: [
      { type: 'heavy', name: '毁灭龙息', multiplier: 2.5 },
      { type: 'drain', name: '龙血汲取', percent: 0.4 },
      { type: 'rage', name: '龙之狂暴', multiplier: 1.4 }
    ],
    loot: {
      name: '龙神之心', type: 'accessory', hp: 250, price: 1600, critChance: 0.10, dodgeChance: 0.05,
      tier: 5, desc: '远古邪龙的心脏，跳动着永恒的生命力，暴击+10% 闪避+5%'
    }
  }
]

// ==================== 装备（按 tier 分层，tier1-5 对应 1-25层） ====================
const equipment = {
  weapon: [
    // tier 1 (1-5层)
    { name: '木剑', attack: 5, price: 20, tier: 1, desc: '新手冒险者的第一把武器' },
    { name: '短剑', attack: 9, price: 40, tier: 1, desc: '轻便的近战武器' },
    // tier 2 (6-10层)
    { name: '铁剑', attack: 15, price: 90, tier: 2, desc: '铁匠铺的标准制品' },
    { name: '阔剑', attack: 22, price: 160, tier: 2, desc: '沉重但威力十足' },
    // tier 3 (11-15层)
    { name: '秘银长剑', attack: 30, price: 260, tier: 3, desc: '闪烁着银光的魔法武器' },
    { name: '暗影之刃', attack: 38, price: 400, tier: 3, critChance: 0.10, desc: '刀刃上缠绕着黑暗能量，暴击率+10%' },
    // tier 4 (16-20层)
    { name: '龙牙战斧', attack: 48, price: 580, tier: 4, critChance: 0.05, desc: '用龙牙锻造的传奇巨斧，暴击率+5%' },
    { name: '烈焰之刃', attack: 56, price: 750, tier: 4, critChance: 0.10, desc: '缠绕着火焰的魔刃，暴击率+10%' },
    // tier 5 (21-25层)
    { name: '灭神之剑', attack: 66, price: 950, tier: 5, critChance: 0.15, desc: '传说中能斩杀神明的圣剑，暴击率+15%' },
    { name: '龙魂巨刃', attack: 78, price: 1250, tier: 5, critChance: 0.10, desc: '寄宿着龙魂的巨刃，暴击率+10%' }
  ],
  armor: [
    // tier 1
    { name: '布甲', defense: 3, price: 20, tier: 1, desc: '聊胜于无的防护' },
    { name: '皮甲', defense: 6, price: 50, tier: 1, desc: '猎人们常用的轻便护甲' },
    // tier 2
    { name: '锁子甲', defense: 11, price: 110, tier: 2, desc: '由金属环编织而成' },
    { name: '板甲', defense: 16, price: 190, tier: 2, desc: '厚重的全身铁甲' },
    // tier 3
    { name: '秘银护甲', defense: 23, price: 300, tier: 3, desc: '轻如鸿毛，坚如磐石' },
    { name: '暗影斗篷', defense: 20, price: 270, tier: 3, dodgeChance: 0.12, desc: '能吸收部分伤害的魔法斗篷，闪避率+12%' },
    // tier 4
    { name: '龙鳞铠甲', defense: 32, price: 580, tier: 4, dodgeChance: 0.08, desc: '镶嵌着龙鳞的终极铠甲，闪避率+8%' },
    { name: '深渊铠甲', defense: 38, price: 780, tier: 4, critChance: 0.05, desc: '深渊玄铁铸造的重甲，暴击率+5%' },
    // tier 5
    { name: '龙神战甲', defense: 46, price: 1100, tier: 5, dodgeChance: 0.10, desc: '灌注龙神之力的战甲，闪避率+10%' },
    { name: '圣龙护甲', defense: 52, price: 1400, tier: 5, critChance: 0.05, desc: '圣龙祝福的究极护甲，暴击率+5%' }
  ],
  accessory: [
    // tier 1
    { name: '铜戒指', hp: 20, price: 30, tier: 1, desc: '普通的铜制戒指' },
    { name: '生命护符', hp: 40, price: 70, tier: 1, desc: '蕴含微弱生命力的护符' },
    // tier 2
    { name: '银项链', hp: 65, price: 130, tier: 2, desc: '做工精美的银项链' },
    { name: '红宝石戒指', hp: 90, price: 220, tier: 2, critChance: 0.05, desc: '镶嵌着血红宝石的戒指，暴击率+5%' },
    // tier 3
    { name: '凤凰羽毛', hp: 130, price: 350, tier: 3, dodgeChance: 0.10, desc: '传说中凤凰的尾羽，闪避率+10%' },
    { name: '暗影之心', hp: 110, price: 320, tier: 3, critChance: 0.08, desc: '凝聚暗影之力的宝石，暴击率+8%' },
    // tier 4
    { name: '熔岩核心', hp: 180, price: 620, tier: 4, critChance: 0.08, desc: '深渊熔岩凝结的核心，暴击率+8%' },
    { name: '恶魔之眼', hp: 150, price: 560, tier: 4, dodgeChance: 0.08, desc: '凝视深渊的恶魔之眼，闪避率+8%' },
    // tier 5
    { name: '龙神之心', hp: 260, price: 1300, tier: 5, critChance: 0.10, dodgeChance: 0.05, desc: '蕴含着巨龙的生命精华，暴击+10% 闪避+5%' },
    { name: '永恒龙晶', hp: 320, price: 1700, tier: 5, critChance: 0.12, desc: '传说中龙神留下的结晶，暴击率+12%' }
  ]
}

// ==================== 神秘商人（探索中遇到，卖主题商品） ====================
// 每个主题的专属商品：商店买不到，与该层主题相关
const themeMerchantGoods = {
  slime: {
    items: [
      { name: '黏液解毒剂', desc: '恢复50%生命值，并清除中毒状态', price: 45, type: 'potion', healPercent: 0.5, curePoison: true },
      { name: '沼泽护符', desc: '佩戴后闪避+8%', price: 120, type: 'accessory', hp: 30, dodgeChance: 0.08, tier: 1 },
      { name: '剧毒短刃', desc: '淬毒的匕首，暴击率+8%', price: 160, type: 'weapon', attack: 12, critChance: 0.08, tier: 1 }
    ]
  },
  bone: {
    items: [
      { name: '亡者灵药', desc: '恢复60%生命值', price: 60, type: 'potion', healPercent: 0.6 },
      { name: '白骨戒指', desc: '生命+70，暴击率+5%', price: 180, type: 'accessory', hp: 70, critChance: 0.05, tier: 2 },
      { name: '骸骨战锤', desc: '沉重的骨锤，攻击+18', price: 220, type: 'weapon', attack: 18, tier: 2 }
    ]
  },
  shadow: {
    items: [
      { name: '影雾药剂', desc: '恢复50%生命，闪避+10%（持续本层）', price: 80, type: 'potion', healPercent: 0.5, dodgeBuff: 0.10 },
      { name: '暗影符咒', desc: '暴击率+10%，闪避+5%', price: 260, type: 'accessory', hp: 60, critChance: 0.10, dodgeChance: 0.05, tier: 3 },
      { name: '幽影匕首', desc: '无形之刃，暴击率+12%', price: 320, type: 'weapon', attack: 32, critChance: 0.12, tier: 3 }
    ]
  },
  abyss: {
    items: [
      { name: '熔岩酒', desc: '恢复60%生命，攻击+5（持续本层）', price: 100, type: 'potion', healPercent: 0.6, attackBuff: 5 },
      { name: '恶魔印记', desc: '暴击率+12%，生命+80', price: 400, type: 'accessory', hp: 80, critChance: 0.12, tier: 4 },
      { name: '地狱烈焰刃', desc: '火焰缠绕之刃，暴击率+10%', price: 480, type: 'weapon', attack: 48, critChance: 0.10, tier: 4 }
    ]
  },
  dragon: {
    items: [
      { name: '龙血药剂', desc: '恢复80%生命值', price: 140, type: 'potion', healPercent: 0.8 },
      { name: '龙鳞符', desc: '防御+12，闪避+8%', price: 550, type: 'armor', defense: 12, dodgeChance: 0.08, tier: 5 },
      { name: '龙牙短刃', desc: '以龙牙打造，暴击率+15%', price: 650, type: 'weapon', attack: 60, critChance: 0.15, tier: 5 }
    ]
  }
}

module.exports = { THEMES, getThemeForFloor, monsters, bosses, equipment, themeMerchantGoods }
