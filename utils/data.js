/**
 * 地牢冒险 - 游戏数据
 * 怪物、装备库（怪物掉落已整体降低）
 */

const monsters = [
  { name: '史莱姆', hp: 30, attack: 8, defense: 1, exp: 15, gold: 3, level: 1, desc: '一团黏糊糊的绿色生物' },
  { name: '大老鼠', hp: 40, attack: 10, defense: 2, exp: 20, gold: 4, level: 1, desc: '体型硕大的地牢老鼠' },
  { name: '骷髅兵', hp: 55, attack: 14, defense: 4, exp: 30, gold: 6, level: 2, desc: '死去冒险者的遗骸' },
  { name: '暗影蝙蝠', hp: 45, attack: 16, defense: 3, exp: 28, gold: 5, level: 2, desc: '在黑暗中飞行的吸血蝙蝠' },
  { name: '哥布林战士', hp: 70, attack: 18, defense: 6, exp: 40, gold: 9, level: 3, desc: '手持生锈短剑的哥布林' },
  { name: '腐尸', hp: 90, attack: 20, defense: 8, exp: 50, gold: 10, level: 3, desc: '散发着恶臭的不死生物' },
  { name: '石像鬼', hp: 110, attack: 25, defense: 12, exp: 65, gold: 15, level: 4, desc: '会动的石像，爪牙锋利' },
  { name: '暗影刺客', hp: 85, attack: 32, defense: 8, exp: 60, gold: 14, level: 5, desc: '来去无踪的暗杀者' },
  { name: '食人魔', hp: 160, attack: 28, defense: 15, exp: 80, gold: 20, level: 5, desc: '体型庞大的丑陋巨人' },
  { name: '死亡骑士', hp: 200, attack: 35, defense: 20, exp: 100, gold: 28, level: 7, desc: '堕落的骑士，身穿黑甲' },
  { name: '炎魔', hp: 280, attack: 42, defense: 25, exp: 140, gold: 40, level: 9, desc: '来自深渊的火焰恶魔' },
  { name: '远古巨龙', hp: 400, attack: 50, defense: 35, exp: 220, gold: 75, level: 12, desc: '地牢最深处的守护者' }
]

const equipment = {
  weapon: [
    { name: '木剑', attack: 5, price: 20, tier: 0, desc: '新手冒险者的第一把武器' },
    { name: '短剑', attack: 9, price: 40, tier: 0, desc: '轻便的近战武器' },
    { name: '铁剑', attack: 14, price: 80, tier: 1, desc: '铁匠铺的标准制品' },
    { name: '阔剑', attack: 20, price: 140, tier: 1, desc: '沉重但威力十足' },
    { name: '秘银长剑', attack: 27, price: 220, tier: 2, desc: '闪烁着银光的魔法武器' },
    { name: '暗影之刃', attack: 35, price: 350, tier: 2, desc: '刀刃上缠绕着黑暗能量' },
    { name: '龙牙战斧', attack: 45, price: 520, tier: 3, desc: '用龙牙锻造的传奇巨斧' },
    { name: '灭神之剑', attack: 60, price: 800, tier: 3, desc: '传说中能斩杀神明的圣剑' }
  ],
  armor: [
    { name: '布甲', defense: 3, price: 20, tier: 0, desc: '聊胜于无的防护' },
    { name: '皮甲', defense: 6, price: 45, tier: 0, desc: '猎人们常用的轻便护甲' },
    { name: '锁子甲', defense: 10, price: 90, tier: 1, desc: '由金属环编织而成' },
    { name: '板甲', defense: 15, price: 160, tier: 1, desc: '厚重的全身铁甲' },
    { name: '秘银护甲', defense: 21, price: 250, tier: 2, desc: '轻如鸿毛，坚如磐石' },
    { name: '暗影斗篷', defense: 18, price: 230, tier: 2, desc: '能吸收部分伤害的魔法斗篷' },
    { name: '龙鳞铠甲', defense: 30, price: 500, tier: 3, desc: '镶嵌着龙鳞的终极铠甲' }
  ],
  accessory: [
    { name: '铜戒指', hp: 20, price: 30, tier: 0, desc: '普通的铜制戒指' },
    { name: '生命护符', hp: 35, price: 60, tier: 0, desc: '蕴含微弱生命力的护符' },
    { name: '银项链', hp: 55, price: 110, tier: 1, desc: '做工精美的银项链' },
    { name: '红宝石戒指', hp: 80, price: 190, tier: 1, desc: '镶嵌着血红宝石的戒指' },
    { name: '凤凰羽毛', hp: 120, price: 300, tier: 2, desc: '传说中凤凰的尾羽' },
    { name: '龙心护符', hp: 180, price: 480, tier: 3, desc: '蕴含着巨龙的生命精华' }
  ]
}

module.exports = { monsters, equipment }
