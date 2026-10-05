/**
 * 术数内核 · 共享表
 *
 * 只放**跨多个术法共用**的表。私有数据（紫微星表、塔罗牌义、签谱、梦象…）
 * 由各方法模块自己带在 `methods/data/` 下，避免这个文件无限膨胀。
 *
 * 关于「吉凶倾向表」的诚实声明：
 * 六十四卦、建除、黄黑道这些表里的吉凶分是**公开通例的编辑取值**（依卦名语义、
 * 卜筮歌诀、黄历通书），不是某一秘本的原文数字。它们写在源码里、可改、可查，
 * 插件输出里也带 `fidelity` 标记。请按你自己的师承调整。
 */
import {
  GAN, ZHI, ZHI_WUXING, SHENG, KE, ZHI_LIUCHONG,
  NAYIN, CHANGSHENG, CHANGSHENG_START, mod,
} from './kit.js'

// ───────────────────────────── 八卦 ─────────────────────────────

/**
 * 八卦：bits 为自下而上的爻（1=阳）。
 * 先天数用伏羲次序（乾一兑二离三震四巽五坎六艮七坤八）。
 */
export const TRIGRAMS = [
  { name: '乾', bits: [1, 1, 1], xian: 1, hou: 6, wx: '金', sym: '☰', xiang: '天', dir: '西北', fam: '父', body: '首', virtue: '健' },
  { name: '兑', bits: [1, 1, 0], xian: 2, hou: 7, wx: '金', sym: '☱', xiang: '泽', dir: '西', fam: '少女', body: '口', virtue: '悦' },
  { name: '离', bits: [1, 0, 1], xian: 3, hou: 9, wx: '火', sym: '☲', xiang: '火', dir: '南', fam: '中女', body: '目', virtue: '丽' },
  { name: '震', bits: [1, 0, 0], xian: 4, hou: 3, wx: '木', sym: '☳', xiang: '雷', dir: '东', fam: '长男', body: '足', virtue: '动' },
  { name: '巽', bits: [0, 1, 1], xian: 5, hou: 4, wx: '木', sym: '☴', xiang: '风', dir: '东南', fam: '长女', body: '股', virtue: '入' },
  { name: '坎', bits: [0, 1, 0], xian: 6, hou: 1, wx: '水', sym: '☵', xiang: '水', dir: '北', fam: '中男', body: '耳', virtue: '陷' },
  { name: '艮', bits: [0, 0, 1], xian: 7, hou: 8, wx: '土', sym: '☶', xiang: '山', dir: '东北', fam: '少男', body: '手', virtue: '止' },
  { name: '坤', bits: [0, 0, 0], xian: 8, hou: 2, wx: '土', sym: '☷', xiang: '地', dir: '西南', fam: '母', body: '腹', virtue: '顺' },
]

/** 卦名 → 八卦对象。 */
export const TRI_BY_NAME = Object.fromEntries(TRIGRAMS.map((t) => [t.name, t]))
/** 先天数 → 八卦对象。 */
export const TRI_BY_XIAN = Object.fromEntries(TRIGRAMS.map((t) => [t.xian, t]))

/**
 * 由三爻（自下而上）取八卦名。
 * @param {number[]} bits 三爻。
 * @returns {string} 卦名。
 */
export function trigramOfBits(bits) {
  const key = bits.join('')
  const hit = TRIGRAMS.find((t) => t.bits.join('') === key)
  return hit ? hit.name : '乾'
}

// ───────────────────────────── 六十四卦 ─────────────────────────────

/** 上卦(行) × 下卦(列)，列序同 {@link TRIGRAMS}。 */
export const HEX_TABLE = [
  ['乾为天', '天泽履', '天火同人', '天雷无妄', '天风姤', '天水讼', '天山遁', '天地否'],
  ['泽天夬', '兑为泽', '泽火革', '泽雷随', '泽风大过', '泽水困', '泽山咸', '泽地萃'],
  ['火天大有', '火泽睽', '离为火', '火雷噬嗑', '火风鼎', '火水未济', '火山旅', '火地晋'],
  ['雷天大壮', '雷泽归妹', '雷火丰', '震为雷', '雷风恒', '雷水解', '雷山小过', '雷地豫'],
  ['风天小畜', '风泽中孚', '风火家人', '风雷益', '巽为风', '风水涣', '风山渐', '风地观'],
  ['水天需', '水泽节', '水火既济', '水雷屯', '水风井', '坎为水', '水山蹇', '水地比'],
  ['山天大畜', '山泽损', '山火贲', '山雷颐', '山风蛊', '山水蒙', '艮为山', '山地剥'],
  ['地天泰', '地泽临', '地火明夷', '地雷复', '地风升', '地水师', '地山谦', '坤为地'],
]

/** 周易通行本次序（卦序 1..64）。 */
export const HEX_SEQ = ('乾为天 坤为地 水雷屯 山水蒙 水天需 天水讼 地水师 水地比 风天小畜 天泽履 地天泰 天地否 '
  + '天火同人 火天大有 地山谦 雷地豫 泽雷随 山风蛊 地泽临 风地观 火雷噬嗑 山火贲 山地剥 地雷复 '
  + '天雷无妄 山天大畜 山雷颐 泽风大过 坎为水 离为火 泽山咸 雷风恒 天山遁 雷天大壮 火地晋 地火明夷 '
  + '风火家人 火泽睽 水山蹇 雷水解 山泽损 风雷益 泽天夬 天风姤 泽地萃 地风升 泽水困 水风井 '
  + '泽火革 火风鼎 震为雷 艮为山 风山渐 雷泽归妹 雷火丰 火山旅 巽为风 兑为泽 风水涣 水泽节 '
  + '风泽中孚 雷山小过 水火既济 火水未济').split(' ')

/** 卦名 → 卦序。 */
export const HEX_ORDER = Object.fromEntries(HEX_SEQ.map((n, i) => [n, i + 1]))

/**
 * 六十四卦吉凶倾向（-100..100）。
 * 取值依「卦名语义 + 传统卜筮通例」：泰/大有/谦/咸/益/既济 等为吉，
 * 否/剥/明夷/蹇/困/坎 等为凶。这是**本插件采用的公开通例表**，可按师承改。
 */
export const HEX_POLARITY = {
  乾为天: 55, 坤为地: 30, 水雷屯: -30, 山水蒙: -25, 水天需: 20, 天水讼: -35, 地水师: -10, 水地比: 35,
  风天小畜: 10, 天泽履: 5, 地天泰: 80, 天地否: -55, 天火同人: 45, 火天大有: 75, 地山谦: 70, 雷地豫: 45,
  泽雷随: 40, 山风蛊: -30, 地泽临: 55, 风地观: 15, 火雷噬嗑: 20, 山火贲: 25, 山地剥: -70, 地雷复: 50,
  天雷无妄: 25, 山天大畜: 40, 山雷颐: 20, 泽风大过: -35, 坎为水: -60, 离为火: 45, 泽山咸: 60, 雷风恒: 35,
  天山遁: -15, 雷天大壮: 30, 火地晋: 65, 地火明夷: -55, 风火家人: 40, 火泽睽: -20, 水山蹇: -55, 雷水解: 45,
  山泽损: -10, 风雷益: 65, 泽天夬: 10, 天风姤: -25, 泽地萃: 40, 地风升: 55, 泽水困: -60, 水风井: 20,
  泽火革: 35, 火风鼎: 45, 震为雷: 15, 艮为山: -10, 风山渐: 45, 雷泽归妹: -30, 雷火丰: 50, 火山旅: -25,
  巽为风: 30, 兑为泽: 45, 风水涣: 5, 水泽节: 15, 风泽中孚: 50, 雷山小过: -20, 水火既济: 60, 火水未济: -20,
}

/**
 * 由上卦、下卦名取卦名。
 * @param {string} upper 上卦名。
 * @param {string} lower 下卦名。
 * @returns {string} 卦名。
 */
export function hexNameOf(upper, lower) {
  const ui = TRIGRAMS.findIndex((t) => t.name === upper)
  const li = TRIGRAMS.findIndex((t) => t.name === lower)
  if (ui < 0 || li < 0) return '—'
  return HEX_TABLE[ui][li]
}

/**
 * 由六爻（自下而上，1=阳）取卦名。
 * @param {number[]} bits 六爻。
 * @returns {string} 卦名。
 */
export function hexNameOfBits(bits) {
  return hexNameOf(trigramOfBits(bits.slice(3, 6)), trigramOfBits(bits.slice(0, 3)))
}

/** 卦名 → 完整信息。 */
export function hexInfoOf(bits) {
  const name = hexNameOfBits(bits)
  const upper = trigramOfBits(bits.slice(3, 6))
  const lower = trigramOfBits(bits.slice(0, 3))
  return {
    name,
    order: HEX_ORDER[name] ?? 0,
    upper,
    lower,
    upperWx: TRI_BY_NAME[upper]?.wx ?? '',
    lowerWx: TRI_BY_NAME[lower]?.wx ?? '',
    polarity: HEX_POLARITY[name] ?? 0,
    wuxing: HEX_WUXING[name] ?? '',
    bits: bits.slice(),
    lines: bits.map((b) => (b ? '—' : '- -')).reverse().join(' '),
  }
}

// ───────────────────────────── 纳甲 / 八宫 / 世应 ─────────────────────────────

/** 京房纳甲：内卦（初二三）与外卦（四五六）的地支与天干。 */
export const NAJIA = {
  乾: { inner: ['子', '寅', '辰'], outer: ['午', '申', '戌'], iGan: '甲', oGan: '壬' },
  坎: { inner: ['寅', '辰', '午'], outer: ['申', '戌', '子'], iGan: '戊', oGan: '戊' },
  艮: { inner: ['辰', '午', '申'], outer: ['戌', '子', '寅'], iGan: '丙', oGan: '丙' },
  震: { inner: ['子', '寅', '辰'], outer: ['午', '申', '戌'], iGan: '庚', oGan: '庚' },
  巽: { inner: ['丑', '亥', '酉'], outer: ['未', '巳', '卯'], iGan: '辛', oGan: '辛' },
  离: { inner: ['卯', '丑', '亥'], outer: ['酉', '未', '巳'], iGan: '己', oGan: '己' },
  坤: { inner: ['未', '巳', '卯'], outer: ['丑', '亥', '酉'], iGan: '乙', oGan: '癸' },
  兑: { inner: ['巳', '卯', '丑'], outer: ['亥', '酉', '未'], iGan: '丁', oGan: '丁' },
}

/** 京房八宫卦序（每宫八位：本宫、一世…五世、游魂、归魂）。 */
export const PALACES = {
  乾: ['乾为天', '天风姤', '天山遁', '天地否', '风地观', '山地剥', '火地晋', '火天大有'],
  坎: ['坎为水', '水泽节', '水雷屯', '水火既济', '泽火革', '雷火丰', '地火明夷', '地水师'],
  艮: ['艮为山', '山火贲', '山天大畜', '山泽损', '火泽睽', '天泽履', '风泽中孚', '风山渐'],
  震: ['震为雷', '雷地豫', '雷水解', '雷风恒', '地风升', '水风井', '泽风大过', '泽雷随'],
  巽: ['巽为风', '风天小畜', '风火家人', '风雷益', '天雷无妄', '火雷噬嗑', '山雷颐', '山风蛊'],
  离: ['离为火', '火山旅', '火风鼎', '火水未济', '山水蒙', '风水涣', '天水讼', '天火同人'],
  坤: ['坤为地', '地雷复', '地泽临', '地天泰', '雷天大壮', '泽天夬', '水天需', '水地比'],
  兑: ['兑为泽', '泽水困', '泽地萃', '泽山咸', '水山蹇', '地山谦', '雷山小过', '雷泽归妹'],
}

/** 八宫位次 → 卦位名与世爻位（1..6）。 */
export const PALACE_STAGE = [
  { stage: '本宫', shi: 6 }, { stage: '一世', shi: 1 }, { stage: '二世', shi: 2 }, { stage: '三世', shi: 3 },
  { stage: '四世', shi: 4 }, { stage: '五世', shi: 5 }, { stage: '游魂', shi: 4 }, { stage: '归魂', shi: 3 },
]

/** 卦名 → 宫。 */
export const HEX_PALACE = (() => {
  const out = {}
  for (const [palace, list] of Object.entries(PALACES)) {
    list.forEach((n, i) => { out[n] = { palace, index: i, ...PALACE_STAGE[i] } })
  }
  return out
})()

/** 六十四卦的五行属性（按所属宫）。 */
export const HEX_WUXING = (() => {
  const out = {}
  for (const [palace, list] of Object.entries(PALACES)) {
    for (const name of list) out[name] = TRI_BY_NAME[palace].wx
  }
  return out
})()

/**
 * 由六爻装卦（纳甲、六亲、世应、六神）。
 * @param {number[]} bits 六爻（自下而上，1=阳）。
 * @param {string} dayGan 日干（起六神）。
 * @returns {object} 装卦结果。
 */
export function najiaOf(bits, dayGan) {
  const upper = trigramOfBits(bits.slice(3, 6))
  const lower = trigramOfBits(bits.slice(0, 3))
  const nu = NAJIA[upper]
  const nl = NAJIA[lower]
  const zhis = [...nl.inner, ...nu.outer]
  const gans = [nl.iGan, nl.iGan, nl.iGan, nu.oGan, nu.oGan, nu.oGan]
  const name = hexNameOf(upper, lower)
  const pal = HEX_PALACE[name] ?? { palace: upper, index: 0, stage: '本宫', shi: 6 }
  const meWx = TRI_BY_NAME[pal.palace]?.wx ?? '土'
  const shiPos = pal.shi
  const yingPos = ((shiPos - 1 + 3) % 6) + 1
  const lines = zhis.map((z, i) => {
    const wx = ZHI_WUXING[z]
    const qin = liuQinOf(meWx, wx)
    return {
      pos: i + 1,
      posName: ['初', '二', '三', '四', '五', '上'][i],
      yang: bits[i] === 1,
      gan: gans[i],
      zhi: z,
      gz: gans[i] + z,
      wuxing: wx,
      qin,
      shen: ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武'][(((GAN.indexOf(dayGan) < 0 ? 0 : [0, 0, 1, 1, 2, 3, 4, 4, 5, 5][GAN.indexOf(dayGan)]) + i) % 6)],
      isShi: i + 1 === shiPos,
      isYing: i + 1 === yingPos,
    }
  })
  return { name, upper, lower, palace: pal.palace, stage: pal.stage, palaceIndex: pal.index, meWx, shiPos, yingPos, lines }
}

/**
 * 六亲判定（以宫五行为我）。
 * @param {string} me 宫五行。
 * @param {string} other 爻五行。
 * @returns {string} 六亲。
 */
export function liuQinOf(me, other) {
  if (me === other) return '兄弟'
  if (SHENG[me] === other) return '子孙'
  if (SHENG[other] === me) return '父母'
  if (KE[me] === other) return '妻财'
  return '官鬼'
}

// ───────────────────────────── 择日体系 ─────────────────────────────

/** 建除十二神吉凶。 */
export const JIANCHU = {
  建: { score: 5, note: '诸事可为，唯不宜动土' },
  除: { score: 45, note: '除旧布新，宜扫除、疗病' },
  满: { score: 30, note: '宜祭祀、祈福，忌服药' },
  平: { score: 10, note: '平常之日，宜修饰垣墙' },
  定: { score: 40, note: '宜宴请、协议，忌诉讼' },
  执: { score: 35, note: '宜捕捉、收敛，忌出行' },
  破: { score: -60, note: '大耗之日，唯宜破屋坏垣' },
  危: { score: -15, note: '宜安床，忌登高涉险' },
  成: { score: 55, note: '成事之日，宜开市、嫁娶' },
  收: { score: 30, note: '宜收敛、纳财，忌开市' },
  开: { score: 60, note: '开通之日，宜祈福、开市' },
  闭: { score: -45, note: '闭塞之日，宜筑堤、埋穴' },
}

/** 黄黑道十二值日神。 */
export const HUANGHEIDAO = {
  青龙: { dao: '黄道', score: 55 }, 明堂: { dao: '黄道', score: 50 }, 天刑: { dao: '黑道', score: -50 },
  朱雀: { dao: '黑道', score: -45 }, 金匮: { dao: '黄道', score: 45 }, 天德: { dao: '黄道', score: 50 },
  白虎: { dao: '黑道', score: -55 }, 玉堂: { dao: '黄道', score: 45 }, 天牢: { dao: '黑道', score: -45 },
  玄武: { dao: '黑道', score: -40 }, 司命: { dao: '黄道', score: 45 }, 勾陈: { dao: '黑道', score: -45 },
}

/** 二十八宿（东方七宿起）。 */
export const XIU28 = [
  { name: '角', dir: '东', wx: '木', animal: '蛟', score: 55 }, { name: '亢', dir: '东', wx: '金', animal: '龙', score: -20 },
  { name: '氐', dir: '东', wx: '土', animal: '貉', score: -10 }, { name: '房', dir: '东', wx: '火', animal: '兔', score: 50 },
  { name: '心', dir: '东', wx: '火', animal: '狐', score: 30 }, { name: '尾', dir: '东', wx: '火', animal: '虎', score: 40 },
  { name: '箕', dir: '东', wx: '水', animal: '豹', score: 35 }, { name: '斗', dir: '北', wx: '木', animal: '獬', score: 45 },
  { name: '牛', dir: '北', wx: '金', animal: '牛', score: -25 }, { name: '女', dir: '北', wx: '土', animal: '蝠', score: -20 },
  { name: '虚', dir: '北', wx: '火', animal: '鼠', score: -45 }, { name: '危', dir: '北', wx: '火', animal: '燕', score: -35 },
  { name: '室', dir: '北', wx: '火', animal: '猪', score: 45 }, { name: '壁', dir: '北', wx: '水', animal: '獝', score: 40 },
  { name: '奎', dir: '西', wx: '木', animal: '狼', score: -30 }, { name: '娄', dir: '西', wx: '金', animal: '狗', score: 35 },
  { name: '胃', dir: '西', wx: '土', animal: '雉', score: 30 }, { name: '昴', dir: '西', wx: '火', animal: '鸡', score: -20 },
  { name: '毕', dir: '西', wx: '火', animal: '乌', score: 40 }, { name: '觜', dir: '西', wx: '火', animal: '猴', score: -30 },
  { name: '参', dir: '西', wx: '水', animal: '猿', score: 45 }, { name: '井', dir: '南', wx: '木', animal: '犴', score: 40 },
  { name: '鬼', dir: '南', wx: '金', animal: '羊', score: -35 }, { name: '柳', dir: '南', wx: '土', animal: '獐', score: -15 },
  { name: '星', dir: '南', wx: '火', animal: '马', score: -20 }, { name: '张', dir: '南', wx: '火', animal: '鹿', score: 45 },
  { name: '翼', dir: '南', wx: '火', animal: '蛇', score: 30 }, { name: '轸', dir: '南', wx: '水', animal: '蚓', score: 35 },
]

/** 六曜（中日同源的「六辉」）。 */
export const LIUYAO = {
  先胜: { score: 65, note: '大吉，诸事皆宜' }, 友引: { score: 25, note: '吉，宜友聚，忌丧葬' },
  先负: { score: -45, note: '凶，宜静不宜动' }, 仏灭: { score: -70, note: '大凶，诸事不宜' },
  大安: { score: 55, note: '吉，安稳顺遂' }, 赤口: { score: -40, note: '凶，防口舌官非' },
}
// 异体字别名：内置历法库返回的是「佛灭」(U+4F5B)，而通书多作「仏灭」(U+4ECF)。
// 不补这一条，六天里会有一天查表落空。
LIUYAO['佛灭'] = LIUYAO['仏灭']

/** 九星（紫白）。 */
export const NINE_STAR = [
  { num: 1, name: '一白', wx: '水', luck: '吉', note: '贪狼·官星桃花' },
  { num: 2, name: '二黑', wx: '土', luck: '凶', note: '巨门·病符' },
  { num: 3, name: '三碧', wx: '木', luck: '凶', note: '禄存·是非' },
  { num: 4, name: '四绿', wx: '木', luck: '吉', note: '文曲·文昌' },
  { num: 5, name: '五黄', wx: '土', luck: '大凶', note: '廉贞·正关煞' },
  { num: 6, name: '六白', wx: '金', luck: '吉', note: '武曲·权威' },
  { num: 7, name: '七赤', wx: '金', luck: '凶', note: '破军·口舌破财' },
  { num: 8, name: '八白', wx: '土', luck: '大吉', note: '左辅·财星' },
  { num: 9, name: '九紫', wx: '火', luck: '吉', note: '右弼·喜星' },
]

/** 二十四山（罗盘）。 */
export const SHAN24 = ('子 癸 丑 艮 寅 甲 卯 乙 辰 巽 巳 丙 午 丁 未 坤 申 庚 酉 辛 戌 乾 亥 壬').split(' ')

/** 二十四山 → 八卦（每卦三山）。 */
export const SHAN_PALACE = (() => {
  const out = {}
  const groups = [['坎', '壬', '子', '癸'], ['艮', '丑', '艮', '寅'], ['震', '甲', '卯', '乙'], ['巽', '辰', '巽', '巳'],
    ['离', '丙', '午', '丁'], ['坤', '未', '坤', '申'], ['兑', '庚', '酉', '辛'], ['乾', '戌', '乾', '亥']]
  for (const [g, ...list] of groups) for (const s of list) out[s] = g
  return out
})()

/** 东四命 / 西四命 卦组。 */
export const EAST_WEST = {
  东四: ['坎', '离', '震', '巽'],
  西四: ['乾', '坤', '艮', '兑'],
}

// ───────────────────────────── 其他共用小表 ─────────────────────────────

/** 五音 → 五行。 */
export const WUYIN = { 宫: '土', 商: '金', 角: '木', 徵: '火', 羽: '水' }

/** 十神（顺序固定，供统计）。 */
export const TEN_GODS = ['比肩', '劫财', '食神', '伤官', '偏财', '正财', '七杀', '正官', '偏印', '正印']

/** 紫微斗数十二宫（顺序固定）。 */
export const ZIWEI_PALACES = ['命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄', '迁移', '交友', '官禄', '田宅', '福德', '父母']

/** 西方占星十二宫。 */
export const ASTRO_HOUSES = ['命宫', '财帛', '兄弟', '田宅', '子女', '疾厄', '夫妻', '疾厄2', '迁移', '官禄', '福德', '玄秘']

/** 十二星座（日期区间，含起止）。 */
export const ZODIAC = [
  { name: '摩羯', from: [12, 22], to: [1, 19], wx: '土', element: '地' },
  { name: '水瓶', from: [1, 20], to: [2, 18], wx: '金', element: '风' },
  { name: '双鱼', from: [2, 19], to: [3, 20], wx: '水', element: '水' },
  { name: '白羊', from: [3, 21], to: [4, 19], wx: '火', element: '火' },
  { name: '金牛', from: [4, 20], to: [5, 20], wx: '土', element: '地' },
  { name: '双子', from: [5, 21], to: [6, 21], wx: '金', element: '风' },
  { name: '巨蟹', from: [6, 22], to: [7, 22], wx: '水', element: '水' },
  { name: '狮子', from: [7, 23], to: [8, 22], wx: '火', element: '火' },
  { name: '处女', from: [8, 23], to: [9, 22], wx: '土', element: '地' },
  { name: '天秤', from: [9, 23], to: [10, 23], wx: '金', element: '风' },
  { name: '天蝎', from: [10, 24], to: [11, 22], wx: '水', element: '水' },
  { name: '射手', from: [11, 23], to: [12, 21], wx: '火', element: '火' },
]

/** 太玄八十一首。 */
export const TAIXUAN_81 = ('中 周 礥 闲 少 戾 上 干 𤕠 羡 差 童 增 锐 达 交 䎡 徯 从 进 释 格 夷 乐 争 务 事 更 断 毅 装 众 密 亲 敛 强 睟 盛 居 法 应 迎 遇 灶 大 廓 文 礼 逃 唐 常 度 永 昆 减 唫 守 翕 聚 积 饰 疑 视 沈 内 去 晦 瞢 穷 割 止 坚 成 致 失 剧 驯 将 难 勤 养').split(' ')

/** 灵棋经十二棋位名。 */
export const LINGQI_POS = ['上四', '中四', '下四']

/** 董公择日「忌」日（月支 → 忌日支）。 */
export const DONGGONG_JI = { 寅: '申', 卯: '酉', 辰: '戌', 巳: '亥', 午: '子', 未: '丑', 申: '寅', 酉: '卯', 戌: '辰', 亥: '巳', 子: '午', 丑: '未' }

/** 杨公十三忌（农历月 → 日）。 */
export const YANGGONG_13 = { 1: 13, 2: 11, 3: 9, 4: 7, 5: 5, 6: 3, 7: 1, 8: 27, 9: 25, 10: 23, 11: 21, 12: 19 }

/** 五运六气：岁运（年干 → 运）。 */
export const WUYUN = { 甲: '土太过', 己: '土不及', 乙: '金不及', 庚: '金太过', 丙: '水太过', 辛: '水不及', 丁: '木不及', 壬: '木太过', 戊: '火太过', 癸: '火不及' }

/** 六气司天（年支 → 司天）。 */
export const LIUQI_SITIAN = {
  子: '少阴君火', 午: '少阴君火', 丑: '太阴湿土', 未: '太阴湿土',
  寅: '少阳相火', 申: '少阳相火', 卯: '阳明燥金', 酉: '阳明燥金',
  辰: '太阳寒水', 戌: '太阳寒水', 巳: '厥阴风木', 亥: '厥阴风木',
}

// ══════════════════════════════════════════════════════════════════════════════
// v2 新增 · 跨族共用表
//
// 纪律（见 docs/V2-CONTRACT.md §4）：
//   · 每张表上方写明出处（《书名·篇名》 / URL / 库@版本）；
//   · 凡本插件按「公开通例编辑取值」的表，source 明写，verified 记 'partial'；
//   · 查无可靠出处者一律写 null 并在 TABLES_META 记 verified:'no'，**绝不编数**；
//   · 全部表的核验状态见文件末尾 TABLES_META 与 docs/verification/tables-provenance.md。
// ══════════════════════════════════════════════════════════════════════════════

// ───────────────────────── 六爻 / 易卦共用 ─────────────────────────

/**
 * 世应全表（京房八宫位次 → 世爻 / 应爻 / 游魂归魂）。
 *
 * 世爻位次依八宫卦变：本宫取上爻、一世取初爻、二世二爻…五世五爻、游魂四爻、归魂三爻；
 * 应爻恒与世爻相隔三爻，即 `(世−1+3) mod 6 + 1`。
 * 本表由 v1 `PALACE_STAGE` **派生**（未改其值），只补出应爻与游魂/归魂标记。
 *
 * cite: 《卜筮正宗·卷一·世应诀》；八宫卦变次序见《京氏易传》
 *
 * @type {Array<{stage:string, shi:number, ying:number, gui:string|null}>}
 */
export const SHI_YING = PALACE_STAGE.map((s) => ({
  stage: s.stage,
  shi: s.shi,
  ying: ((s.shi - 1 + 3) % 6) + 1,
  gui: s.stage === '游魂' || s.stage === '归魂' ? s.stage : null,
}))

/**
 * 卦名 → 世应信息（宫、宫位次、卦位名、世爻、应爻、游魂/归魂）。
 * cite: 同上（由 v1 `HEX_PALACE` + {@link SHI_YING} 派生）
 */
export const SHI_YING_BY_HEX = Object.fromEntries(
  Object.entries(HEX_PALACE).map(([name, p]) => [name, {
    palace: p.palace,
    index: p.index,
    stage: p.stage,
    shi: p.shi,
    ying: ((p.shi - 1 + 3) % 6) + 1,
    gui: p.stage === '游魂' || p.stage === '归魂' ? p.stage : null,
  }]),
)

/**
 * 取某卦的世应信息。
 * @param {string} hexName 卦名（如 `乾为天`）。
 * @returns {{palace:string,index:number,stage:string,shi:number,ying:number,gui:string|null}|null} 世应信息。
 */
export function shiYingOf(hexName) {
  return SHI_YING_BY_HEX[hexName] ?? null
}

/**
 * 是否游魂卦（八宫第七位）。
 * @param {string} hexName 卦名。
 * @returns {boolean} 判定结果。
 */
export function isYouhun(hexName) {
  return SHI_YING_BY_HEX[hexName]?.gui === '游魂'
}

/**
 * 是否归魂卦（八宫第八位）。
 * @param {string} hexName 卦名。
 * @returns {boolean} 判定结果。
 */
export function isGuihun(hexName) {
  return SHI_YING_BY_HEX[hexName]?.gui === '归魂'
}

/**
 * 用神取象表：所占事类 → 取何六亲为用神。
 *
 * 六亲以卦宫五行为「我」判（见 {@link liuQinOf}）。同一事类男女取用不同者用 `altQin` 注明。
 * cite: 《增删卜易·卷首·用神章》及各事类分章（求财章／婚姻章／官讼章／疾病章／
 *       出行章／行人章／失物章／考试章／田宅章／胎产章）；《卜筮正宗·卷三·六亲取用》
 *
 * @type {Object<string,{qin:string,altQin?:string,note:string}>}
 */
export const YONGSHEN = {
  综合: { qin: '世爻', note: '无事类可归者以世爻为主，兼看用神与原神' },
  财运: { qin: '妻财', note: '占财以妻财为用；子孙为原神（财源），兄弟为忌神（劫财）' },
  求财: { qin: '妻财', note: '同上；世爻克财、财爻生世为得财之象' },
  事业: { qin: '官鬼', altQin: '父母', note: '占功名官位以官鬼为用，文书契约以父母为用' },
  工作: { qin: '官鬼', note: '求职、升迁以官鬼为用；官鬼旺相生世为得职' },
  婚姻: { qin: '妻财', altQin: '官鬼', note: '男占妇以妻财为用、女占夫以官鬼为用；世应相生为谐' },
  感情: { qin: '妻财', altQin: '官鬼', note: '同婚姻章；应爻为对方，世应比和相生则合' },
  官讼: { qin: '官鬼', altQin: '父母', note: '占讼以官鬼为用（官府）、父母为状纸；子孙为解神（息讼）' },
  诉讼: { qin: '官鬼', note: '同上；世克应则我胜，应克世则彼胜' },
  疾病: { qin: '官鬼', note: '占病以官鬼为用（病神）；子孙为医药、为解神，子孙旺则病愈' },
  健康: { qin: '官鬼', note: '同上；用神（世爻／病人）旺相则吉，入墓空破则凶' },
  出行: { qin: '父母', altQin: '世爻', note: '占行以父母为用（车船行李），兼看世爻与应爻（目的地）' },
  行人: { qin: '妻财', altQin: '父母', note: '占行人以妻财为用（《增删卜易·行人章》），父母为音信' },
  寻人: { qin: '妻财', note: '同行人章；用神入墓主困、逢冲主归' },
  失物: { qin: '妻财', note: '占失物以妻财为用；用神在内卦为未远、在外卦为已远' },
  考试: { qin: '父母', altQin: '官鬼', note: '占考以父母为用（文章）、官鬼为名次' },
  学业: { qin: '父母', note: '同考试章；父母旺相生世为学业有成' },
  田宅: { qin: '父母', note: '占宅以父母为用；占田土财帛兼看妻财' },
  房产: { qin: '父母', note: '同田宅章；父母爻旺相、生合世爻为得宅' },
  孕产: { qin: '子孙', note: '占胎产以子孙为用；男占妻孕兼看妻财，胎爻为用' },
  子嗣: { qin: '子孙', note: '占子以子孙为用；子孙旺相为有嗣' },
  父母: { qin: '父母', note: '占尊长以父母为用' },
  兄弟: { qin: '兄弟', note: '占同辈朋友以兄弟为用；兄弟为劫财之神，占财忌旺' },
  合伙: { qin: '兄弟', altQin: '妻财', note: '占合伙以兄弟为用（同辈合伙人），财为合伙之利' },
  买卖: { qin: '妻财', note: '占交易以妻财为用；世应比和易成，应空则对方无实意' },
  谈判: { qin: '应爻', note: '占谈判以应爻为对方，世应生克定向背' },
  盗贼: { qin: '官鬼', note: '占盗以官鬼为贼、子孙为捕役；鬼旺则贼势盛' },
  六畜: { qin: '子孙', note: '占六畜以子孙为用（子孙为畜类）' },
  天气: { qin: '父母', altQin: '子孙', note: '占雨以父母为用（雨）、子孙为晴；《增删卜易·天时章》' },
}

/**
 * 取某事类的用神（六亲名）。
 * @param {string} topic 事类（如 `财运`）。
 * @param {string} [gender] 求占者性别（`男`/`女`），用于婚姻类分取。
 * @returns {{qin:string, altQin?:string, note:string}} 用神描述；未收事类回落到「综合」。
 */
export function yongshenOf(topic, gender) {
  const hit = YONGSHEN[topic] ?? YONGSHEN['综合']
  if (hit.altQin && (topic === '婚姻' || topic === '感情')) {
    if (gender === '女') return { qin: hit.altQin, altQin: hit.qin, note: hit.note }
  }
  return hit
}

/**
 * 旺相休囚死（月令五行 → 五行状态）。
 *
 * 规则：当令者旺、令生者相、生令者休、克令者囚、令克者死
 * ——「旺」＝同月令五行；「相」＝月令所生；「休」＝生月令者；
 * 「囚」＝克月令者；「死」＝被月令所克者。
 * cite: 《渊海子平·卷一·论五行旺相休囚死》；《三命通会·卷二·论五行旺相休囚死》
 *
 * 说明：本表与 `kit.wangShuai()` 同规则，`WANGXIANG_SCORE` 即其分值（此处并列出来
 * 供方法层直接查表，避免各处重写系数）。已用穷举 5×5 组合与 `kit.wangShuai` 对拍一致。
 *
 * @type {Object<string,{旺:string,相:string,休:string,囚:string,死:string}>}
 */
export const WANGXIANG = (() => {
  const out = {}
  for (const m of ['木', '火', '土', '金', '水']) {
    out[m] = { 旺: m, 相: SHENG[m], 休: Object.keys(SHENG).find((k) => SHENG[k] === m), 囚: Object.keys(KE).find((k) => KE[k] === m), 死: KE[m] }
  }
  return out
})()

/** 旺相休囚死五级（由强到弱）。cite: 同 {@link WANGXIANG} */
export const WANGXIANG_STATES = ['旺', '相', '休', '囚', '死']

/** 旺衰状态 → 力量系数分（与 `kit.wangShuai` 的返回分值一致）。cite: 同 {@link WANGXIANG} */
export const WANGXIANG_SCORE = { 旺: 100, 相: 75, 休: 40, 囚: 25, 死: 10 }

/**
 * 判某五行的月令旺衰（查表法，等价于 `kit.wangShuai`）。
 * @param {string} wx 待判五行。
 * @param {string} monthWx 月令五行。
 * @returns {{state:string, score:number}} 状态与力量分。
 */
export function wangxiangOf(wx, monthWx) {
  const row = WANGXIANG[monthWx]
  if (!row) return { state: '平', score: 50 }
  for (const st of WANGXIANG_STATES) if (row[st] === wx) return { state: st, score: WANGXIANG_SCORE[st] }
  return { state: '平', score: 50 }
}

/**
 * 旬空判据表（空亡两支的常见断法）。
 * cite: 《增删卜易·旬空章》（「空在旬中，实出旬外」「旺不为空、动不为空」）
 *
 * @type {Object<string,string>}
 */
export const KONG_RULES = {
  旺不为空: '用神旺相虽空不空，出旬即用',
  动不为空: '发动之爻逢空，出旬值日必应',
  静而空: '静爻逢空为真空，事多落空',
  空逢冲: '空爻逢冲为冲实，即日可用',
  空逢合: '空爻逢合为合起，迟应',
  伏而空: '伏神逢空，所伏之事无根',
}

/**
 * 是否旬空（在空亡两支之列）。
 * @param {string} zhi 地支。
 * @param {string[]} kong 旬空两支（如 `['戌','亥']`）。
 * @returns {boolean} 判定结果。
 */
export function isKong(zhi, kong) {
  return Array.isArray(kong) ? kong.includes(zhi) : false
}

/**
 * 月建 / 月破 / 日建 / 日破 判据。
 * 月建＝与月支同、月破＝与月支相冲、日建＝与日支同、日破＝与日支相冲。
 * cite: 《增删卜易·月建章》《增删卜易·日建章》（月破即月建之冲，日破即日建之冲）
 *
 * @type {Object<string,{rule:string,note:string}>}
 */
export const JIAN_PO_RULES = {
  月建: { rule: '爻支 === 月支', note: '当令之神，能生克诸爻，力最大' },
  月破: { rule: '爻支 === 月支之冲', note: '月建所冲，静而破者到底空；动而逢冲为冲起' },
  日建: { rule: '爻支 === 日支', note: '司一日之权，能生克诸爻；日建不入空破' },
  日破: { rule: '爻支 === 日支之冲', note: '日建所冲，静爻逢之即破' },
  日合: { rule: '爻支与日支六合', note: '合则事缓，主牵连不进' },
  日墓: { rule: '爻支为日支之墓库', note: '用神入日墓主被困，待冲墓之日方出' },
}

/**
 * 判某爻支相对月建、日建的状态。
 * @param {string} zhi 爻支。
 * @param {string} monthZhi 月支。
 * @param {string} dayZhi 日支。
 * @returns {string[]} 命中的状态名（如 `['月破','日建']`）。
 */
export function jianPoOf(zhi, monthZhi, dayZhi) {
  const out = []
  if (zhi && zhi === monthZhi) out.push('月建')
  if (zhi && ZHI_LIUCHONG[zhi] === monthZhi) out.push('月破')
  if (zhi && zhi === dayZhi) out.push('日建')
  if (zhi && ZHI_LIUCHONG[zhi] === dayZhi) out.push('日破')
  return out
}

/** 六神（六兽）名录与起例基准。cite: 《卜筮正宗·卷一·六神诀》（按日干起，甲乙起青龙） */
export const LIUSHEN = ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武']

// ───────────────────────── 神煞总表（命理 / 易卦共用）─────────────────────────

/**
 * 地支三合局（水木火金四局，长生·帝旺·墓库三支）。
 * cite: 《三命通会·卷二·论三合会局》（申子辰合水、亥卯未合木、寅午戌合火、巳酉丑合金）
 * note: 与 `kit.ZHI_SANHE` 同值（此处并列，便于按局反查）。
 */
export const SANHE_GROUPS = {
  水: ['申', '子', '辰'],
  木: ['亥', '卯', '未'],
  火: ['寅', '午', '戌'],
  金: ['巳', '酉', '丑'],
}

/** 地支 → 所属三合局五行。 cite: 同 {@link SANHE_GROUPS} */
export const SANHE_GROUP = Object.fromEntries(
  Object.entries(SANHE_GROUPS).flatMap(([wx, zhis]) => zhis.map((z) => [z, wx])),
)

/**
 * 把「三合局 → 某支」的写法展开成「十二支 → 某支」的查表。
 * @param {Object<string,string>} perGroup 局五行 → 目标支。
 * @returns {Object<string,string>} 十二支 → 目标支。
 */
function spreadBySanhe(perGroup) {
  return Object.fromEntries(Object.entries(SANHE_GROUP).map(([zhi, wx]) => [zhi, perGroup[wx]]))
}

/**
 * 神煞总表（查法 + 出处 + 核验状态）。
 *
 * 每条字段：
 *   · `from`     ：以何为准（`年干`/`日干`/`年支`/`月支`/`三合`/`日柱`/`年支三合`…）；
 *   · `target`   ：`支`（查四支）或 `柱`（比对整柱干支）；
 *   · `map`      ：查法表（`from` 取值 → 目标支/柱或数组）；
 *   · `cite`     ：出处；
 *   · `verified` ：'yes' 与 kit.SHENSHA 或历法库对拍一致 / 'partial' 诸本有异或仅歌诀可依。
 *
 * cite: 《渊海子平·卷一·论诸神煞》；《三命通会·卷二·论诸神煞》；
 *       与 `kit.SHENSHA`（驿马·桃花·华盖·将星）及 `vendor/lunar.cjs` 神煞名目交叉核对，见
 *       docs/verification/tables-provenance.md
 *
 * @type {Object<string,{from:string,target:string,map:Object<string,string|string[]>,cite:string,verified:string,note?:string}>}
 */
export const SHENSHA_ALL = {
  天乙贵人: {
    from: '日干', alsoFrom: '年干', target: '支',
    map: { 甲: ['丑', '未'], 戊: ['丑', '未'], 庚: ['丑', '未'], 乙: ['子', '申'], 己: ['子', '申'], 丙: ['亥', '酉'], 丁: ['亥', '酉'], 壬: ['卯', '巳'], 癸: ['卯', '巳'], 辛: ['午', '寅'] },
    cite: '《渊海子平·卷一》天乙贵人歌：「甲戊庚牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸兔蛇藏，六辛逢马虎」',
    verified: 'yes',
    note: '甲戊庚见丑未、乙己见子申、丙丁见亥酉、壬癸见卯巳、辛见午寅',
  },
  太极贵人: {
    from: '日干', alsoFrom: '年干', target: '支',
    map: { 甲: ['子', '午'], 乙: ['子', '午'], 丙: ['卯', '酉'], 丁: ['卯', '酉'], 戊: ['辰', '戌', '丑', '未'], 己: ['辰', '戌', '丑', '未'], 庚: ['寅', '亥'], 辛: ['寅', '亥'], 壬: ['巳', '申'], 癸: ['巳', '申'] },
    cite: '《三命通会·卷二·论太极贵人》：「甲乙生人子午中，丙丁鸡兔定亨通，戊己两干临四季，庚辛寅亥禄丰隆，壬癸巳申偏喜美」',
    verified: 'yes',
  },
  禄神: {
    from: '日干', target: '支',
    map: { 甲: '寅', 乙: '卯', 丙: '巳', 戊: '巳', 丁: '午', 己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子' },
    cite: '《渊海子平·卷一》十干禄：「甲禄在寅，乙禄在卯，丙戊禄在巳，丁己禄在午，庚禄在申，辛禄在酉，壬禄在亥，癸禄在子」',
    verified: 'yes',
  },
  羊刃: {
    from: '日干', target: '支',
    map: { 甲: '卯', 乙: '寅', 丙: '午', 丁: '巳', 戊: '午', 己: '巳', 庚: '酉', 辛: '申', 壬: '子', 癸: '亥' },
    cite: '《三命通会·卷二·论羊刃》（羊刃即十干帝旺之位：甲卯乙寅丙午丁巳戊午己巳庚酉辛申壬子癸亥）',
    verified: 'partial',
    note: '通行本另有「阴干羊刃取禄后一位」（乙辰·丁未·己未·辛戌·癸丑）一说，本表取帝旺义。用者请按师承取舍。',
  },
  文昌贵人: {
    from: '日干', alsoFrom: '年干', target: '支',
    map: { 甲: '巳', 乙: '午', 丙: '申', 戊: '申', 丁: '酉', 己: '酉', 庚: '亥', 辛: '子', 壬: '寅', 癸: '卯' },
    cite: '《三命通会·卷二·论文昌贵人》：「甲乙巳午报君知，丙戊申宫丁己鸡，庚猪辛鼠壬逢虎，癸人见卯入云梯」',
    verified: 'yes',
  },
  金舆: {
    from: '日干', target: '支',
    map: { 甲: '辰', 乙: '巳', 丙: '未', 戊: '未', 丁: '申', 己: '申', 庚: '戌', 辛: '亥', 壬: '丑', 癸: '寅' },
    cite: '《三命通会·卷二·论金舆》：「甲龙乙蛇丙戊羊，丁己猴歌庚犬方，辛猪壬牛癸逢虎」（即禄前二位）',
    verified: 'yes',
  },
  国印贵人: {
    from: '日干', target: '支',
    map: { 甲: '戌', 乙: '亥', 丙: '丑', 丁: '寅', 戊: '丑', 己: '寅', 庚: '辰', 辛: '巳', 壬: '未', 癸: '申' },
    cite: '《三命通会·卷二·论国印贵人》（甲见戌、乙见亥、丙见丑、丁见寅、戊见丑、己见寅、庚见辰、辛见巳、壬见未、癸见申）',
    verified: 'partial',
    note: '各本十干次序微异（丙戊／丁己同宫之说），本表取常用本。',
  },
  红艳煞: {
    from: '日干', target: '支',
    map: { 甲: '午', 乙: '午', 丙: '寅', 丁: '未', 戊: '辰', 己: '辰', 庚: '戌', 辛: '酉', 壬: '子', 癸: '申' },
    cite: '《三命通会·卷二·论红艳煞》：「甲乙午申庚见戌，世间只是眷红妆；丙寅丁未兼壬子，戊己怕辰壬怕申」',
    verified: 'partial',
    note: '歌诀本身「甲乙午申」「壬子…壬怕申」重出互异，取通行排法（甲午乙午丙寅丁未戊辰己辰庚戌辛酉壬子癸申）。',
  },
  驿马: {
    from: '年支', alsoFrom: '日支', target: '支',
    map: spreadBySanhe({ 水: '寅', 木: '巳', 火: '申', 金: '亥' }),
    cite: '《渊海子平·卷一》驿马：「申子辰马在寅，寅午戌马在申，巳酉丑马在亥，亥卯未马在巳」',
    verified: 'yes',
    note: '与 kit.SHENSHA.驿马 同值（已逐支对拍）',
  },
  桃花: {
    from: '年支', alsoFrom: '日支', target: '支',
    map: spreadBySanhe({ 水: '酉', 木: '子', 火: '卯', 金: '午' }),
    cite: '《三命通会·卷二·论咸池》（咸池即桃花：「申子辰在酉，寅午戌在卯，巳酉丑在午，亥卯未在子」）',
    verified: 'yes',
    note: '与 kit.SHENSHA.桃花 同值',
  },
  华盖: {
    from: '年支', alsoFrom: '日支', target: '支',
    map: spreadBySanhe({ 水: '辰', 木: '未', 火: '戌', 金: '丑' }),
    cite: '《三命通会·卷二·论华盖》（三合局之墓库：申子辰见辰、亥卯未见未、寅午戌见戌、巳酉丑见丑）',
    verified: 'yes',
    note: '与 kit.SHENSHA.华盖 同值',
  },
  将星: {
    from: '年支', alsoFrom: '日支', target: '支',
    map: spreadBySanhe({ 水: '子', 木: '卯', 火: '午', 金: '酉' }),
    cite: '《三命通会·卷二·论将星》（三合局之帝旺：申子辰见子、亥卯未见卯、寅午戌见午、巳酉丑见酉）',
    verified: 'yes',
    note: '与 kit.SHENSHA.将星 同值',
  },
  劫煞: {
    from: '年支', alsoFrom: '日支', target: '支',
    map: spreadBySanhe({ 水: '巳', 木: '申', 火: '亥', 金: '寅' }),
    cite: '《三命通会·卷二·论劫煞》（三合局长生之前一位：申子辰见巳、亥卯未见申、寅午戌见亥、巳酉丑见寅）',
    verified: 'yes',
  },
  灾煞: {
    from: '年支', alsoFrom: '日支', target: '支',
    map: spreadBySanhe({ 水: '午', 木: '酉', 火: '子', 金: '卯' }),
    cite: '《三命通会·卷二·论灾煞》（三合局之胎位：申子辰见午、亥卯未见酉、寅午戌见子、巳酉丑见卯）',
    verified: 'yes',
  },
  亡神: {
    from: '年支', alsoFrom: '日支', target: '支',
    map: spreadBySanhe({ 水: '亥', 木: '寅', 火: '巳', 金: '申' }),
    cite: '《三命通会·卷二·论亡神》（三合局之临官位：申子辰见亥、亥卯未见寅、寅午戌见巳、巳酉丑见申）',
    verified: 'yes',
  },
  六厄: {
    from: '年支', alsoFrom: '日支', target: '支',
    map: spreadBySanhe({ 水: '卯', 木: '午', 火: '酉', 金: '子' }),
    cite: '《三命通会·卷二·论六厄》（三合局之死位：申子辰见卯、亥卯未见午、寅午戌见酉、巳酉丑见子）',
    verified: 'partial',
    note: '又名「剥职煞」，取死位之说；亦有以三合局败地为六厄者，本表取死位。',
  },
  月德贵人: {
    from: '月支', target: '干',
    map: spreadBySanhe({ 水: '壬', 木: '甲', 火: '丙', 金: '庚' }),
    cite: '《三命通会·卷二·论月德》（寅午戌月见丙、申子辰月见壬、亥卯未月见甲、巳酉丑月见庚）',
    verified: 'yes',
  },
  天德贵人: {
    from: '月支', target: '干或支',
    map: { 寅: '丁', 卯: '申', 辰: '壬', 巳: '辛', 午: '亥', 未: '甲', 申: '癸', 酉: '寅', 戌: '丙', 亥: '乙', 子: '巳', 丑: '庚' },
    cite: '《三命通会·卷二·论天德》（正月丁、二月申、三月壬、四月辛、五月亥、六月甲、七月癸、八月寅、九月丙、十月乙、十一月巳、十二月庚）',
    verified: 'yes',
    note: '四孟月与四季月取干、四仲月（卯午酉子）取支',
  },
  孤辰: {
    from: '年支', target: '支',
    map: { 亥: '寅', 子: '寅', 丑: '寅', 寅: '巳', 卯: '巳', 辰: '巳', 巳: '申', 午: '申', 未: '申', 申: '亥', 酉: '亥', 戌: '亥' },
    cite: '《三命通会·卷二·论孤辰寡宿》（北方亥子丑年孤在寅、东方寅卯辰年孤在巳、南方巳午未年孤在申、西方申酉戌年孤在亥）',
    verified: 'yes',
    note: '与 vendor/lunar.cjs i18n「sn.guChen=孤辰」名目一致（该库用于黄历日家神煞，同名异用）',
  },
  寡宿: {
    from: '年支', target: '支',
    map: { 亥: '戌', 子: '戌', 丑: '戌', 寅: '丑', 卯: '丑', 辰: '丑', 巳: '辰', 午: '辰', 未: '辰', 申: '未', 酉: '未', 戌: '未' },
    cite: '《三命通会·卷二·论孤辰寡宿》（北方年寡在戌、东方年在丑、南方年在辰、西方年在未）',
    verified: 'yes',
  },
  红鸾: {
    from: '年支', target: '支',
    map: { 子: '卯', 丑: '寅', 寅: '丑', 卯: '子', 辰: '亥', 巳: '戌', 午: '酉', 未: '申', 申: '未', 酉: '午', 戌: '巳', 亥: '辰' },
    cite: '《三命通会·卷二》红鸾天喜（卯宫起子年逆数至生年支为红鸾）',
    verified: 'yes',
  },
  天喜: {
    from: '年支', target: '支',
    map: { 子: '酉', 丑: '申', 寅: '未', 卯: '午', 辰: '巳', 巳: '辰', 午: '卯', 未: '寅', 申: '丑', 酉: '子', 戌: '亥', 亥: '戌' },
    cite: '《三命通会·卷二》天喜（红鸾对冲之支，子年在酉）',
    verified: 'yes',
  },
  魁罡: {
    from: '日柱', target: '柱', pick: 'self',
    map: { 庚辰: '魁罡', 庚戌: '魁罡', 壬辰: '魁罡', 戊戌: '魁罡' },
    cite: '《三命通会·卷六·论魁罡》（庚辰、庚戌、壬辰、戊戌四日）',
    verified: 'yes',
    note: '另有以壬戌代戊戌之说，本表取通行四日',
  },
  阴阳差错: {
    from: '日柱', target: '柱', pick: 'self',
    map: Object.fromEntries(['丙子', '丁丑', '戊寅', '辛卯', '壬辰', '癸巳', '丙午', '丁未', '戊申', '辛酉', '壬戌', '癸亥'].map((g) => [g, '阴阳差错'])),
    cite: '《三命通会·卷二·论阴阳差错》（丙子、丁丑、戊寅、辛卯、壬辰、癸巳、丙午、丁未、戊申、辛酉、壬戌、癸亥十二日）',
    verified: 'yes',
  },
  金神: {
    from: '时柱', alsoFrom: '日柱', target: '柱', pick: 'self',
    map: { 乙丑: '金神', 己巳: '金神', 癸酉: '金神' },
    cite: '《三命通会·卷二·论金神》（乙丑、己巳、癸酉三日时为金神，日柱见之亦论）',
    verified: 'yes',
  },
  十恶大败: {
    from: '日柱', target: '柱', pick: 'self',
    map: Object.fromEntries(['甲辰', '乙巳', '丙申', '丁亥', '戊戌', '己丑', '庚辰', '辛巳', '壬申', '癸亥'].map((g) => [g, '十恶大败'])),
    cite: '《三命通会·卷二·论十恶大败》（禄元被劫、干支配伍无禄之日：甲辰、乙巳、丙申、丁亥、戊戌、己丑、庚辰、辛巳、壬申、癸亥）',
    verified: 'yes',
  },
  天赦: {
    from: '月支', target: '柱',
    map: { 寅: '戊寅', 卯: '戊寅', 辰: '戊寅', 巳: '甲午', 午: '甲午', 未: '甲午', 申: '戊申', 酉: '戊申', 戌: '戊申', 亥: '甲子', 子: '甲子', 丑: '甲子' },
    cite: '《三命通会·卷二·论天赦》（春戊寅、夏甲午、秋戊申、冬甲子）',
    verified: 'yes',
    note: '以季节（月支）定，非以月建',
  },
  天医: {
    from: '月支', target: '支',
    map: Object.fromEntries(ZHI.map((z, i) => [z, ZHI[mod(i - 1, 12)]])),
    cite: '《三命通会·卷二·论天医》（月支退一位为天医：正月在丑、二月在寅，依此类推）',
    verified: 'partial',
    note: '另有「月支前一位」之说，本表取退一位（正月建寅见丑）通行本。',
  },
}

/**
 * 查某神煞在给定基准值下的目标（支或柱）。
 * @param {string} name 神煞名（{@link SHENSHA_ALL} 的键）。
 * @param {string} base 基准值（干、支或整柱干支）。
 * @returns {string[]} 命中目标（无则空数组）。
 */
export function shenshaHits(name, base) {
  const def = SHENSHA_ALL[name]
  if (!def || !def.map) return []
  const v = def.map[base]
  if (v == null) return []
  return Array.isArray(v) ? v.slice() : [v]
}

/**
 * 把神煞定义的 `from` 解析成实际基准值（只取该定义指定的柱，不外溢到其余柱）。
 * @param {object} def 神煞定义。
 * @param {object} p 四柱。
 * @returns {Array<[string,string]>} `[基准值, 该值取自哪一柱位]`。
 */
function shenshaBases(def, p) {
  const out = []
  const add = (v, pos) => { if (v) out.push([v, pos]) }
  for (const f of [def.from, def.alsoFrom].filter(Boolean)) {
    if (f === '年干') add(p.yearGan, '年')
    else if (f === '月干') add(p.monthGan, '月')
    else if (f === '日干') add(p.dayGan, '日')
    else if (f === '时干') add(p.hourGan, '时')
    else if (f === '年支') add(p.yearZhi, '年')
    else if (f === '月支') add(p.monthZhi, '月')
    else if (f === '日支') add(p.dayZhi, '日')
    else if (f === '时支') add(p.hourZhi, '时')
    else if (f === '年柱') add(p.yearGZ, '年')
    else if (f === '月柱') add(p.monthGZ, '月')
    else if (f === '日柱') add(p.dayGZ, '日')
    else if (f === '时柱') add(p.hourGZ, '时')
  }
  return out
}

/**
 * 汇总四柱命中的神煞（查法全部走 {@link SHENSHA_ALL}，此处只做基准与目标比对）。
 *
 * `target: '柱'` 有两种语义，用 `pick` 区分：
 *   · `pick === 'self'`：基准柱本身即在名单中（魁罡、阴阳差错、十恶大败、金神）；
 *   · 其余：`map` 的值是**目标柱干支**（天赦：某月支须逢戊寅／甲午／戊申／甲子日）。
 *
 * @param {{yearGan?:string,monthGan?:string,dayGan?:string,hourGan?:string,yearZhi?:string,monthZhi?:string,dayZhi?:string,hourZhi?:string,yearGZ?:string,monthGZ?:string,dayGZ?:string,hourGZ?:string}} p 四柱。
 * @returns {Object<string,string[]>} 神煞名 → 命中柱位（支类为 `年/月/日/时`，干类为 `年干/月干/…`）。
 */
export function shenshaAllOf(p) {
  const out = {}
  if (!p || typeof p !== 'object') return out
  const gans = [['年干', p.yearGan], ['月干', p.monthGan], ['日干', p.dayGan], ['时干', p.hourGan]].filter(([, v]) => v)
  const zhis = [['年', p.yearZhi], ['月', p.monthZhi], ['日', p.dayZhi], ['时', p.hourZhi]].filter(([, v]) => v)
  const gzs = [['年', p.yearGZ], ['月', p.monthGZ], ['日', p.dayGZ], ['时', p.hourGZ]].filter(([, v]) => v)
  for (const [name, def] of Object.entries(SHENSHA_ALL)) {
    const hits = []
    const bases = shenshaBases(def, p)
    if (def.target === '支') {
      for (const [bv] of bases) {
        const targets = shenshaHits(name, bv)
        for (const [pos, zv] of zhis) if (targets.includes(zv) && !hits.includes(pos)) hits.push(pos)
      }
    } else if (def.target === '干' || def.target === '干或支') {
      for (const [bv] of bases) {
        const targets = shenshaHits(name, bv)
        for (const [pos, gv] of gans) if (targets.includes(gv) && !hits.includes(pos)) hits.push(pos)
        if (def.target === '干或支') for (const [pos, zv] of zhis) if (targets.includes(zv) && !hits.includes(pos)) hits.push(pos)
      }
    } else if (def.target === '柱') {
      for (const [bv, pos] of bases) {
        if (def.pick === 'self') {
          if (bv in def.map && !hits.includes(pos)) hits.push(pos)
        } else {
          const targets = shenshaHits(name, bv)
          for (const [gpos, gv] of gzs) if (targets.includes(gv) && !hits.includes(gpos)) hits.push(gpos)
        }
      }
    }
    if (hits.length > 0) out[name] = hits
  }
  return out
}

// ───────────────────────── 人元司令分野 / 藏干力量 ─────────────────────────

/**
 * 人元司令分野（月支 × 节后日数 → 司令天干）。
 *
 * 每支列出该月节后各天干用事日数，合计 30 日（本插件按整月 30 日归一，
 * 实际节月长 29.5~31.5 日，此处为通行简化）。
 * cite: 《渊海子平·卷一·人元司令分野》（寅月戊七日半丙七日半甲十六日…丑月癸九日辛三日己十八日）
 *
 * 取值口径（本轮已与 `src/methods/mingli.js` 族内表逐月对齐）：
 *   · 四孟/四生地（寅巳申亥）用**通行本 7·7·16**：余气 7 日、中气 7 日、本气 16 日
 *     → 寅 戊7丙7甲16、巳 戊7庚7丙16、申 戊7壬7庚16、亥 戊7甲7壬16；
 *   · 四仲（卯酉）10·20、四季（辰戌丑未）9·3·18，两本相同。
 * note: 另有异本作 巳 戊5庚9丙16、申 戊5壬3庚22、亥 戊7甲5壬18（前两本即此事）。
 *       本表取**内部规则（四孟月 7·7·16 一致）且有旁证**的通行本，故 verified 仍记 'partial'。
 *
 * @type {Object<string,Array<{gan:string, days:number}>>}
 */
export const RENYUAN_30 = {
  寅: [{ gan: '戊', days: 7 }, { gan: '丙', days: 7 }, { gan: '甲', days: 16 }],
  卯: [{ gan: '甲', days: 10 }, { gan: '乙', days: 20 }],
  辰: [{ gan: '乙', days: 9 }, { gan: '癸', days: 3 }, { gan: '戊', days: 18 }],
  巳: [{ gan: '戊', days: 7 }, { gan: '庚', days: 7 }, { gan: '丙', days: 16 }],
  午: [{ gan: '丙', days: 10 }, { gan: '己', days: 9 }, { gan: '丁', days: 11 }],
  未: [{ gan: '丁', days: 9 }, { gan: '乙', days: 3 }, { gan: '己', days: 18 }],
  申: [{ gan: '戊', days: 7 }, { gan: '壬', days: 7 }, { gan: '庚', days: 16 }],
  酉: [{ gan: '庚', days: 10 }, { gan: '辛', days: 20 }],
  戌: [{ gan: '辛', days: 9 }, { gan: '丁', days: 3 }, { gan: '戊', days: 18 }],
  亥: [{ gan: '戊', days: 7 }, { gan: '甲', days: 7 }, { gan: '壬', days: 16 }],
  子: [{ gan: '壬', days: 10 }, { gan: '癸', days: 20 }],
  丑: [{ gan: '癸', days: 9 }, { gan: '辛', days: 3 }, { gan: '己', days: 18 }],
}

/**
 * 取某月支、节后第几日的人元司令。
 * @param {string} monthZhi 月支。
 * @param {number} daysAfterJie 节后日数（0 起算，第 1 日为 0）。
 * @returns {{gan:string, days:number, index:number, offset:number}|null} 司令干、该干用事日数、序位、已过日数。
 */
export function renyuanOf(monthZhi, daysAfterJie) {
  const list = RENYUAN_30[monthZhi]
  if (!list) return null
  const d = Number.isFinite(daysAfterJie) ? Math.max(0, daysAfterJie) : 0
  let acc = 0
  for (let i = 0; i < list.length; i += 1) {
    if (d < acc + list[i].days || i === list.length - 1) {
      return { gan: list[i].gan, days: list[i].days, index: i, offset: d - acc }
    }
    acc += list[i].days
  }
  return null
}

/**
 * 藏干力量权重（按 {@link RENYUAN_30} 用事日数 ÷ 合计日数 归一）。
 *
 * **派生表**：不含任何独立取值，故不另注出处——出处即 {@link RENYUAN_30}。
 * 用途：命理族判「本气/中气/余气」力量、六爻族判藏干助force 时共用同一套系数。
 *
 * 注意：卯（甲·乙）与酉（庚·辛）在本表中各含两干，而 `kit.ZHI_CANGGAN` 只收本气一支
 * （卯=[乙]、酉=[辛]）——两者都保留，取用者请自行决定是否折算；差异已记入 TABLES_META。
 *
 * @type {Object<string,Object<string,number>>}
 */
export const CANGGAN_W = (() => {
  const out = {}
  for (const [zhi, list] of Object.entries(RENYUAN_30)) {
    const total = list.reduce((a, x) => a + x.days, 0)
    out[zhi] = {}
    for (const x of list) out[zhi][x.gan] = Math.round((x.days / total) * 1000) / 1000
  }
  return out
})()

/** 藏干层级名（按权重降序）。cite: 《渊海子平·卷一》本气／中气／余气 */
export const CANGGAN_LEVEL = ['本气', '中气', '余气']

// ───────────────────────── 紫微斗数共用表 ─────────────────────────
//
// 本节的星曜位置类表（庙旺、四化、命主身主、五行局、起紫微）均与 oracle 对拍过：
//   oracle 为 `iztro@2.6.1`（MIT，D:\DSH\.divination-v2-deps\node_modules\iztro），
//   对拍脚本与结论见 docs/verification/tables-provenance.md。
//   iztro 表源自《紫微斗数全书》通行本；凡诸本有异者，下面逐条 `note` 写明。

/**
 * 十二宫地支序（紫微斗数宫位自寅宫起，索引 0 = 寅宫）。
 * cite: 《紫微斗数全书·安十二宫诀》（「寅起正月，顺数至生月，逆数生时为命宫」）
 */
export const ZIWEI_BRANCH_FROM_YIN = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑']

/**
 * 五行局表（纳音五行 → 局数与局名）。
 * cite: 《紫微斗数全书·安五行局诀》「水二局、木三局、金四局、土五局、火六局」
 * 注：已用 iztro@2.6.1 `astro/palace.js getFiveElementsClass` 的算术式（干支分半相加取模）
 *     对六十甲子逐一交叉核验，与「纳音五行 → 局数」等价。
 */
export const ZIWEI_JU = {
  水: { ju: 2, name: '水二局' },
  木: { ju: 3, name: '木三局' },
  金: { ju: 4, name: '金四局' },
  土: { ju: 5, name: '土五局' },
  火: { ju: 6, name: '火六局' },
}

/**
 * 由命宫干支取五行局（走纳音五行）。
 * cite: 同 {@link ZIWEI_JU}（纳音表见 `kit.NAYIN`，即《三命通会》六十甲子纳音）
 * @param {string} mingGongGZ 命宫干支（两字，如 `丙寅`）。
 * @returns {{ju:number, name:string, nayin:string, wx:string}|null} 局数、局名、纳音、纳音五行。
 */
export function ziweiJuOf(mingGongGZ) {
  const nayin = NAYIN[mingGongGZ]
  if (!nayin) return null
  const wx = nayin.slice(-1)
  const hit = ZIWEI_JU[wx]
  return hit ? { ju: hit.ju, name: hit.name, nayin, wx } : null
}

/**
 * 起紫微星「商数法」：自寅宫顺数（商−1）宫，再按补数奇偶进退。
 *
 * 歌诀：「六五四三二，酉午亥辰丑，局数除日数，商数宫前走；若见数无余，便要起虎口，
 *         日数小于局，还直宫中守。」
 * 算法与 iztro@2.6.1 `star/location.js getStartIndex` 逐日对拍一致（offset 自 0 起，
 * 求使 `(日 + offset) % 局 === 0` 的最小 offset；商 = (日+offset)/局；
 * 自寅进 `商−1` 宫；offset 偶则顺进 offset 宫、奇则逆退 offset 宫）。
 * cite: 《紫微斗数全书·安紫微星诀》；oracle 对拍：iztro@2.6.1 lib/star/location.js
 *
 * @param {number} ju 五行局数（2/3/4/5/6）。
 * @param {number} lunarDay 农历日（初一 = 1）。
 * @returns {{index:number, branch:string, tianfuIndex:number, tianfuBranch:string, quotient:number, offset:number}|null} 紫微／天府宫位（0 = 寅）。
 */
export function ziweiStarIndex(ju, lunarDay) {
  const j = Number(ju)
  const day = Number(lunarDay)
  if (!Number.isFinite(j) || j <= 0 || !Number.isFinite(day) || day <= 0) return null
  let offset = -1
  let quotient = 0
  let remainder = -1
  let guard = 0
  do {
    offset += 1
    const divisor = day + offset
    quotient = Math.floor(divisor / j)
    remainder = divisor % j
    guard += 1
  } while (remainder !== 0 && guard < 1000)
  quotient %= 12
  let idx = quotient - 1
  idx += offset % 2 === 0 ? offset : -offset
  const index = mod(idx, 12)
  const tianfuIndex = mod(-index, 12)
  return {
    index,
    branch: ZIWEI_BRANCH_FROM_YIN[index],
    tianfuIndex,
    tianfuBranch: ZIWEI_BRANCH_FROM_YIN[tianfuIndex],
    quotient,
    offset,
  }
}

/**
 * 十四主星按紫微／天府两系定位（相对宫位偏移，自本系起点顺/逆数）。
 * cite: 《紫微斗数全书》安紫微诸星诀「紫微逆去天机星，隔一太阳武曲辰，连接天同空二宫，
 *       廉贞居处方是真」；安天府诸星诀「天府顺行有太阴，贪狼而后巨门临，随来天相天梁继，
 *       七杀空三是破军」；偏移与 iztro@2.6.1 lib/star/majorStar.js 同构。
 */
export const ZIWEI_MAJOR_GROUP = {
  紫微系: [
    { star: '紫微', offset: 0 }, { star: '天机', offset: -1 }, { star: '太阳', offset: -3 },
    { star: '武曲', offset: -4 }, { star: '天同', offset: -5 }, { star: '廉贞', offset: -8 },
  ],
  天府系: [
    { star: '天府', offset: 0 }, { star: '太阴', offset: 1 }, { star: '贪狼', offset: 2 },
    { star: '巨门', offset: 3 }, { star: '天相', offset: 4 }, { star: '天梁', offset: 5 },
    { star: '七杀', offset: 6 }, { star: '破军', offset: 10 },
  ],
}

/**
 * 紫微斗数十四主星 + 六吉六煞的庙旺利陷（十二宫，**自寅宫起**）。
 * 取值：庙／旺／得／利／平／不／陷；`''` 表示该星不居此宫（擎羊不入四仲、陀罗不入四孟）。
 *
 * cite: iztro@2.6.1（MIT）lib/data/stars.js `STARS_INFO[*].brightness`（自寅起十二宫）；
 *       其表源为《紫微斗数全书》通行庙旺表；已用 iztro 逐星逐宫取得，非手工转录。
 * note: 庙旺诸本互异（中州派／全书派／飞星派各有出入），本表取 iztro 通行本，verified 记 'partial'。
 *
 * @type {Object<string,string[]>}
 */
export const ZIWEI_BRIGHTNESS = {
  紫微: ['旺', '旺', '得', '旺', '庙', '庙', '旺', '旺', '得', '旺', '平', '庙'],
  天机: ['得', '旺', '利', '平', '庙', '陷', '得', '旺', '利', '平', '庙', '陷'],
  太阳: ['旺', '庙', '旺', '旺', '旺', '得', '得', '平', '不', '陷', '陷', '不'],
  武曲: ['得', '利', '庙', '平', '旺', '庙', '得', '利', '庙', '平', '旺', '庙'],
  天同: ['利', '平', '平', '庙', '陷', '不', '旺', '平', '平', '庙', '旺', '不'],
  廉贞: ['庙', '平', '利', '陷', '平', '利', '庙', '平', '利', '陷', '平', '利'],
  天府: ['庙', '得', '庙', '得', '旺', '庙', '得', '旺', '庙', '得', '庙', '庙'],
  太阴: ['旺', '陷', '陷', '陷', '不', '不', '利', '旺', '旺', '庙', '庙', '庙'],
  贪狼: ['平', '利', '庙', '陷', '旺', '庙', '平', '利', '庙', '陷', '旺', '庙'],
  巨门: ['庙', '庙', '陷', '旺', '旺', '不', '庙', '庙', '陷', '旺', '旺', '不'],
  天相: ['庙', '陷', '得', '得', '庙', '得', '庙', '陷', '得', '得', '庙', '庙'],
  天梁: ['庙', '庙', '庙', '陷', '庙', '旺', '陷', '得', '庙', '陷', '庙', '旺'],
  七杀: ['庙', '旺', '庙', '平', '旺', '庙', '庙', '旺', '庙', '平', '旺', '庙'],
  破军: ['得', '陷', '旺', '平', '庙', '旺', '得', '陷', '旺', '平', '庙', '旺'],
  文昌: ['陷', '利', '得', '庙', '陷', '利', '得', '庙', '陷', '利', '得', '庙'],
  文曲: ['平', '旺', '得', '庙', '陷', '旺', '得', '庙', '陷', '旺', '得', '庙'],
  火星: ['庙', '利', '陷', '得', '庙', '利', '陷', '得', '庙', '利', '陷', '得'],
  铃星: ['庙', '利', '陷', '得', '庙', '利', '陷', '得', '庙', '利', '陷', '得'],
  擎羊: ['', '陷', '庙', '', '陷', '庙', '', '陷', '庙', '', '陷', '庙'],
  陀罗: ['陷', '', '庙', '陷', '', '庙', '陷', '', '庙', '陷', '', '庙'],
}

/**
 * 庙旺利陷七级（由强到弱）。cite: iztro@2.6.1 lib/i18n/locales/zh-CN/brightness.js
 */
export const ZIWEI_BRIGHTNESS_LEVELS = ['庙', '旺', '得', '利', '平', '不', '陷']

/**
 * 十干四化（生年干 → 禄、权、科、忌四星）。
 * cite: 《紫微斗数全书·安四化诀》（甲廉破武阳…癸破巨阴贪）；
 *       取值与 oracle iztro@2.6.1 lib/data/heavenlyStems.js `mutagen` 逐干一致（顺序＝禄权科忌）。
 * note: 庚干四化有「阳武阴同／阳武同阴（庚同）」异说，本表取 iztro 与《全书》通行的 阳武阴同。
 *
 * @type {Object<string,string[]>}
 */
export const ZIWEI_SIHUA = {
  甲: ['廉贞', '破军', '武曲', '太阳'],
  乙: ['天机', '天梁', '紫微', '太阴'],
  丙: ['天同', '天机', '文昌', '廉贞'],
  丁: ['太阴', '天同', '天机', '巨门'],
  戊: ['贪狼', '太阴', '右弼', '天机'],
  己: ['武曲', '贪狼', '天梁', '文曲'],
  庚: ['太阳', '武曲', '太阴', '天同'],
  辛: ['巨门', '太阳', '文曲', '文昌'],
  壬: ['天梁', '紫微', '左辅', '武曲'],
  癸: ['破军', '巨门', '太阴', '贪狼'],
}

/**
 * 命主（依命宫地支）与身主（依生年支）。
 * cite: 《紫微斗数全书·安命主身主诀》；取值与 oracle iztro@2.6.1 lib/data/earthlyBranches.js
 *       `soul`／`body` 逐支一致。
 *
 * @type {Object<string,{ming:string, shen:string}>}
 */
export const ZIWEI_MINGSHEN = {
  子: { ming: '贪狼', shen: '火星' },
  丑: { ming: '巨门', shen: '天相' },
  寅: { ming: '禄存', shen: '天梁' },
  卯: { ming: '文曲', shen: '天同' },
  辰: { ming: '廉贞', shen: '文昌' },
  巳: { ming: '武曲', shen: '天机' },
  午: { ming: '破军', shen: '火星' },
  未: { ming: '武曲', shen: '天相' },
  申: { ming: '廉贞', shen: '天梁' },
  酉: { ming: '文曲', shen: '天同' },
  戌: { ming: '禄存', shen: '文昌' },
  亥: { ming: '巨门', shen: '天机' },
}

/**
 * 天魁天钺（年干 → [魁, 钺]）。与「天乙贵人歌」同源，斗数以贵人分阴阳为魁钺。
 * cite: 《紫微斗数全书·安魁钺诀》（甲戊庚牛羊、乙己鼠猴乡、丙丁猪鸡位、壬癸兔蛇藏、六辛逢马虎）；
 *       与 iztro@2.6.1 lib/star/location.js `getKuiYueIndex` 逐干一致。
 *
 * @type {Object<string,string[]>}
 */
export const ZIWEI_KUI_YUE = {
  甲: ['丑', '未'], 戊: ['丑', '未'], 庚: ['丑', '未'], 乙: ['子', '申'], 己: ['子', '申'],
  丙: ['亥', '酉'], 丁: ['亥', '酉'], 壬: ['卯', '巳'], 癸: ['卯', '巳'], 辛: ['午', '寅'],
}

/**
 * 禄存（年干 → 宫支）= 十干禄神；擎羊＝禄存顺行一位、陀罗＝禄存逆行一位。
 * cite: 《紫微斗数全书·安禄存诀》（甲寅乙卯丙戊巳丁己午庚申辛酉壬亥癸子）；
 *       与 iztro@2.6.1 lib/star/location.js `getLuYangTuoMaIndex` 一致。
 *
 * @type {Object<string,string>}
 */
export const ZIWEI_LUCUN = { 甲: '寅', 乙: '卯', 丙: '巳', 戊: '巳', 丁: '午', 己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子' }

/**
 * 火星、铃星「子时起点」（年支三合 → [火, 铃]），再按生时顺数。
 * cite: 《紫微斗数全书》火铃诀「申子辰人寅戌扬，寅午戌人丑卯方，巳酉丑人卯戌位，亥卯未人酉戌房」；
 *       与 iztro@2.6.1 lib/star/location.js `getHuoLingIndex` 逐支一致。
 *
 * @type {Object<string,string[]>}
 */
export const ZIWEI_HUO_LING_START = {
  申: ['寅', '戌'], 子: ['寅', '戌'], 辰: ['寅', '戌'],
  寅: ['丑', '卯'], 午: ['丑', '卯'], 戌: ['丑', '卯'],
  巳: ['卯', '戌'], 酉: ['卯', '戌'], 丑: ['卯', '戌'],
  亥: ['酉', '戌'], 卯: ['酉', '戌'], 未: ['酉', '戌'],
}

/**
 * 紫微斗数诸星安法（口诀式，供方法层按歌诀定位；已与 iztro 实现逐条核对）。
 * cite: 《紫微斗数全书》安辅弼诀／安昌曲诀／安空劫诀／安火铃诀／安天马诀／安鸾喜诀；
 *       实现核对：iztro@2.6.1 lib/star/location.js
 *
 * @type {Object<{key:string,start:string,dir:'顺'|'逆',by:string,note:string}>}
 */
export const ZIWEI_MINOR_RULES = {
  左辅: { start: '辰', dir: '顺', by: '农历生月', note: '辰宫起正月，顺数至生月' },
  右弼: { start: '戌', dir: '逆', by: '农历生月', note: '戌宫起正月，逆数至生月' },
  文昌: { start: '戌', dir: '逆', by: '生时支', note: '戌宫起子时，逆数至生时' },
  文曲: { start: '辰', dir: '顺', by: '生时支', note: '辰宫起子时，顺数至生时' },
  地劫: { start: '亥', dir: '顺', by: '生时支', note: '亥宫起子时，顺数至生时' },
  地空: { start: '亥', dir: '逆', by: '生时支', note: '亥宫起子时，逆数至生时' },
  擎羊: { start: '—', dir: '顺', by: '年干（禄存）', note: '禄存顺行一位' },
  陀罗: { start: '—', dir: '逆', by: '年干（禄存）', note: '禄存逆行一位' },
  天魁: { start: '—', dir: '—', by: '年干', note: '查 ZIWEI_KUI_YUE 首项' },
  天钺: { start: '—', dir: '—', by: '年干', note: '查 ZIWEI_KUI_YUE 次项' },
  禄存: { start: '—', dir: '—', by: '年干', note: '查 ZIWEI_LUCUN' },
  火星: { start: '—', dir: '顺', by: '年支＋生时', note: '查 ZIWEI_HUO_LING_START 首项为子时位，顺数至生时' },
  铃星: { start: '—', dir: '顺', by: '年支＋生时', note: '查 ZIWEI_HUO_LING_START 次项为子时位，顺数至生时' },
  天马: { start: '—', dir: '—', by: '年支', note: '即驿马（寅午戌在申、申子辰在寅、巳酉丑在亥、亥卯未在巳）' },
  红鸾: { start: '卯', dir: '逆', by: '生年支', note: '卯宫起子年，逆数至生年支' },
  天喜: { start: '—', dir: '—', by: '生年支', note: '红鸾对宫（相冲之支）' },
}

// ───────────────────────── 风水（玄空 / 三合）共用表 ─────────────────────────

/**
 * 三元九运表（上元一运起于公元 1864 年甲子，每运 20 年，九运一周 180 年）。
 * cite: 《沈氏玄空学·论三元九运》；纪年锚点可验：1864 年确为甲子年（1860 庚申 + 4）
 *
 * @type {Array<{yuan:string, yun:number, from:number, to:number}>}
 */
export const XUANKONG_YUN = [
  { yuan: '上元', yun: 1, from: 1864, to: 1883 },
  { yuan: '上元', yun: 2, from: 1884, to: 1903 },
  { yuan: '上元', yun: 3, from: 1904, to: 1923 },
  { yuan: '中元', yun: 4, from: 1924, to: 1943 },
  { yuan: '中元', yun: 5, from: 1944, to: 1963 },
  { yuan: '中元', yun: 6, from: 1964, to: 1983 },
  { yuan: '下元', yun: 7, from: 1984, to: 2003 },
  { yuan: '下元', yun: 8, from: 2004, to: 2023 },
  { yuan: '下元', yun: 9, from: 2024, to: 2043 },
]

/**
 * 取公元某年所属元运（按 {@link XUANKONG_YUN}，一月一日为界，非立春分界）。
 * @param {number} year 公元年。
 * @returns {{yuan:string, yun:number, from:number, to:number}|null} 元运；超出表范围返回 null。
 */
export function xuankongYunOf(year) {
  const y = Number(year)
  if (!Number.isFinite(y)) return null
  return XUANKONG_YUN.find((r) => y >= r.from && y <= r.to) ?? null
}

/**
 * 洛书九宫飞泊轨迹（中宫起，依次 → 乾 → 兑 → 艮 → 离 → 坎 → 坤 → 震 → 巽）。
 * 用途：飞星顺飞/逆飞时「下一个宫位」的取法；配合 v1 `SHAN_PALACE` 与洛书宫数使用。
 * cite: 《沈氏玄空学·九宫飞星图》（洛书轨迹「五入中，六到乾，七到兑，八到艮，九到离…」）
 */
export const XUANKONG_FLY = ['中', '乾', '兑', '艮', '离', '坎', '坤', '震', '巽']

/**
 * 洛书九宫数（宫 → 数）。cite: 《洛书》（戴九履一、左三右七、二四为肩、六八为足）
 */
export const LUOSHU_GONG = { 坎: 1, 坤: 2, 震: 3, 巽: 4, 中: 5, 乾: 6, 兑: 7, 艮: 8, 离: 9 }

/**
 * 二十四山三元龙（天元／地元／人元）与阴阳（阳顺阴逆的判据）。
 * cite: 《沈氏玄空学·论三元龙》；天元＝四正四维（子午卯酉乾坤艮巽）、地元＝四孟之干（甲庚丙壬）
 *       与四库（辰戌丑未）、人元＝四生（寅申巳亥）与四仲之干（乙辛丁癸）
 *
 * @type {Object<string,{long:string, yinyang:'阳'|'阴'}>}
 */
export const SHAN24_SANYUAN = (() => {
  const out = {}
  const tianYang = ['乾', '坤', '艮', '巽']
  const tianYin = ['子', '午', '卯', '酉']
  const diYang = ['甲', '庚', '丙', '壬']
  const diYin = ['辰', '戌', '丑', '未']
  const renYang = ['寅', '申', '巳', '亥']
  const renYin = ['乙', '辛', '丁', '癸']
  for (const s of tianYang) out[s] = { long: '天元', yinyang: '阳' }
  for (const s of tianYin) out[s] = { long: '天元', yinyang: '阴' }
  for (const s of diYang) out[s] = { long: '地元', yinyang: '阳' }
  for (const s of diYin) out[s] = { long: '地元', yinyang: '阴' }
  for (const s of renYang) out[s] = { long: '人元', yinyang: '阳' }
  for (const s of renYin) out[s] = { long: '人元', yinyang: '阴' }
  return out
})()

/**
 * 二十四山双山五行（三合局）。
 * 双山：坤申·壬子·乙辰 属水局，艮寅·丙午·辛戌 属火局，
 *       巽巳·庚酉·癸丑 属金局，乾亥·甲卯·丁未 属木局。
 * cite: 《地理五诀·卷三》双山五行（三合水法以双山论局，口诀「坤壬乙（辰）水、艮丙辛（戌）火、
 *       巽庚癸（丑）金、乾甲丁（未）木」）
 * note: 双山五行与「三合局」（申子辰水等）同源而配山方式各书表述不同，此处按《地理五诀》通行配法。
 *
 * @type {Object<string,string>}
 */
export const SHAN24_SANHE = (() => {
  const out = {}
  const groups = [
    ['水', ['坤', '申', '壬', '子', '乙', '辰']],
    ['火', ['艮', '寅', '丙', '午', '辛', '戌']],
    ['金', ['巽', '巳', '庚', '酉', '癸', '丑']],
    ['木', ['乾', '亥', '甲', '卯', '丁', '未']],
  ]
  for (const [wx, list] of groups) for (const s of list) out[s] = wx
  return out
})()

/**
 * 四大局十二长生水法（局 → 十二长生 → 地支）。
 * 起点：水局长生在申、木局在亥、火局在寅、金局在巳（即阳干壬申·甲亥·丙寅·庚巳之长生）；
 * 阳局顺行（与 `kit.CHANGSHENG_START` 同一套十干长生，此处按局取阳干）。
 * cite: 《地理五诀·卷四·十二长生水法》；长生起点见《三命通会·卷一》十干长生
 *
 * 派生表：由 `kit.CHANGSHENG` + `kit.CHANGSHENG_START` + 阳顺推得，无独立取值。
 *
 * @type {Object<string,Object<string,string>>}
 */
export const SANHE_CHANGSHENG = (() => {
  const startGan = { 水: '壬', 木: '甲', 火: '丙', 金: '庚' }
  const out = {}
  for (const [ju, gan] of Object.entries(startGan)) {
    const start = CHANGSHENG_START[gan]
    const row = {}
    for (let i = 0; i < 12; i += 1) row[CHANGSHENG[i]] = ZHI[mod(ZHI.indexOf(start) + i, 12)]
    out[ju] = row
  }
  return out
})()

/**
 * 玄空兼向替卦表：**故意留空**。
 * 兼向替卦（起星）各谱（《沈氏玄空学》与中州派、无常派）取替规则互异，本插件无可核原表，
 * 按契约「没有可靠来源的表不要写」——此处写 null，verified:'no'，需要者请在族内自带表并标 approx。
 *
 * @type {null}
 */
export const XUANKONG_TIGUA = null

// ───────────────────────── 应期：措辞 → 半开区间（跨族共用）─────────────────────────

/**
 * 应期措辞 → **半开区间** `[lo, hi)`（单位：日）。
 *
 * 规格口径（`skills/108-divination/SKILL.md` §六）：应期要给**窗口**而非点估计，
 * 字段为 `timing[i].lo` / `hi`（**hi 不含**）；方法层应给 `detail.timingLo/timingHi`。
 * 多数族历史上只给了措辞串（「三日内」「旬日」「次月应」…），故此处把常见措辞**折算**成窗口端点。
 * cite: **本插件编辑取值**（措辞→天数的折算口径，公开可查、可改）；折算取上界、宁宽不窄；
 *   凡措辞无明确日数（如「需待水月方有转机」）**不给端点**（双 null），输出须如实说"只有措辞、没有区间"。
 *
 * @type {Object<string,[number,number]>}
 */
export const DURATION_DAYS = {
  即时: [0, 1], 即日: [0, 1], 当日: [0, 1], 即时应验: [0, 1],
  三日内: [0, 3], 三日: [0, 3], 七日内: [0, 7], 旬日内: [0, 10], 旬日: [0, 10], 十日内: [0, 10],
  月内: [0, 30], 本月内: [0, 30], 一月内: [0, 30], 近期: [0, 30],
  次月: [30, 60], 两月: [30, 60], 季内: [0, 90], 三月内: [0, 90],
  半年内: [0, 180], 年内: [0, 365], 年余: [180, 365],
}

/**
 * 由应期措辞取半开区间端点（日）。
 *
 * 三级口径（次序即优先级）：
 *   1. `DURATION_DAYS` 的固定措辞（「三日内」「旬日」「次月」…）；
 *   2. **数值措辞**：`6日` → `[6, 7)`、`3天` → `[3, 4)`、`2月` → `[60, 90)`、`1年` → `[365, 730)`——
 *      方法层给的是一个**点估计**，半开区间下就是该点所在的单位窗口（不假装它有跨度）；
 *   3. 其余（「需待木月方有转机」这类无明确日数者）→ **双 null**，输出须如实说"只有措辞、没有区间"。
 * @param {string} text 应期文本。
 * @returns {{lo:number|null, hi:number|null}} 端点。
 */
export function durationOf(text) {
  const t = String(text ?? '')
  /** 候选窗口（同一串里可能命中多个措辞，如「即日至三日内」→ 即时[0,1) 与 三日内[0,3)）。 */
  const cands = []
  for (const [k, span] of Object.entries(DURATION_DAYS)) {
    if (t.includes(k)) cands.push(span)
  }
  const day = /(?:约)?([0-9]{1,4})\s*(?:日|天)/.exec(t)
  if (day) {
    const n = Number(day[1])
    cands.push([n, n + 1])
  }
  const month = /(?:约)?([0-9]{1,2})\s*个?月/.exec(t)
  if (month) {
    const n = Number(month[1])
    cands.push([n * 30, (n + 1) * 30])
  }
  const year = /(?:约)?([0-9]{1,2})\s*年/.exec(t)
  if (year) {
    const n = Number(year[1])
    cands.push([n * 365, (n + 1) * 365])
  }
  if (cands.length === 0) return { lo: null, hi: null }
  // 多个窗口措辞并存时取**最宽**者（并集语义：宁可宽不窄，不假装更精确）
  const best = cands.reduce((a, b) => (b[1] > a[1] ? b : a))
  return { lo: best[0], hi: best[1] }
}

// ───────────────────────── 姓名（五格剖象）共用表 ─────────────────────────

/**
 * 五格 81 数理吉凶（1..81 → 数理名 + 吉／半吉／凶）。
 *
 * **来源与核验（重要，请连读）**：
 *   · 体系出处：熊崎健翁《姓名の神秘》（1929 年前后）创「五格剖象法」81 数理；
 *     与宋·蔡沈《洪范皇极内篇》的八十一数推筮系统**只是同用 81 之数，内容无关**。
 *   · 本表取值取自两处公开汇编并逐数对照：
 *     [1] 琴鹤堂国学《五格剖象姓名学81数理吉凶表》 https://m.sohu.com/a/448617276_100084723/
 *     [2] 顺时知识库《八十一數理》 https://shunshi.ai/zh-tw/wiki/naming/wuge/shuli_81
 *   · 两源在各数上的**吉／凶两侧基本一致**，但档位细分常不同：凡两源档位不同者，
 *     本表 `luck` 取 [1]，并把 [2] 的档位（大吉/凶/大凶归并为 吉/凶）写入 `alt`；
 *     凡两源**跨侧冲突**者另标 `disputed: true`（共 9 数：27·36·40·42·53·55·72·75·78），
 *     这些数各谱判法确有分歧，用者应据师承取舍，不要当成定论。
 *   · verified:'partial'：表本身网络二手汇编可查、两源互校；非原书影印，且分档有异说。
 *
 * @type {Object<number,{name:string, luck:'吉'|'半吉'|'凶', alt?:string, disputed?:boolean}>}
 */
export const WUGE_81 = {
  1: { name: '太极之数', luck: '吉' },
  2: { name: '两仪之数', luck: '凶' },
  3: { name: '三才之数', luck: '吉' },
  4: { name: '四象之数', luck: '凶' },
  5: { name: '五行之数', luck: '吉' },
  6: { name: '六爻之数', luck: '吉' },
  7: { name: '七政之数', luck: '吉' },
  8: { name: '八卦之数', luck: '半吉', alt: '吉' },
  9: { name: '大成之数', luck: '凶' },
  10: { name: '终结之数', luck: '凶' },
  11: { name: '旱苗逢雨', luck: '吉' },
  12: { name: '掘井无泉', luck: '凶' },
  13: { name: '春日牡丹', luck: '吉' },
  14: { name: '破兆', luck: '凶' },
  15: { name: '福寿', luck: '吉' },
  16: { name: '厚重', luck: '吉' },
  17: { name: '刚强', luck: '半吉', alt: '吉' },
  18: { name: '铁镜重磨', luck: '半吉', alt: '吉' },
  19: { name: '多难', luck: '凶' },
  20: { name: '屋下藏金', luck: '凶' },
  21: { name: '明月中天', luck: '吉' },
  22: { name: '秋草逢霜', luck: '凶' },
  23: { name: '壮丽', luck: '吉' },
  24: { name: '掘藏得金', luck: '吉' },
  25: { name: '荣俊', luck: '半吉', alt: '吉' },
  26: { name: '变怪', luck: '凶' },
  27: { name: '增长', luck: '凶', alt: '半吉', disputed: true },
  28: { name: '阔水浮萍', luck: '凶' },
  29: { name: '智谋', luck: '吉' },
  30: { name: '非运', luck: '半吉' },
  31: { name: '春日花开', luck: '吉' },
  32: { name: '宝马金鞍', luck: '吉' },
  33: { name: '旭日升天', luck: '吉' },
  34: { name: '破家', luck: '凶' },
  35: { name: '高楼望月', luck: '吉' },
  36: { name: '波澜重叠', luck: '半吉', alt: '凶', disputed: true },
  37: { name: '猛虎出林', luck: '吉' },
  38: { name: '磨铁成针', luck: '半吉', alt: '吉' },
  39: { name: '富贵荣华', luck: '半吉', alt: '吉' },
  40: { name: '退安', luck: '凶', alt: '半吉', disputed: true },
  41: { name: '有德', luck: '吉' },
  42: { name: '寒蝉在柳', luck: '凶', alt: '半吉', disputed: true },
  43: { name: '散财破产', luck: '凶' },
  44: { name: '烦闷', luck: '凶' },
  45: { name: '顺风', luck: '吉' },
  46: { name: '浪里淘金', luck: '凶' },
  47: { name: '点石成金', luck: '吉' },
  48: { name: '古松立鹤', luck: '吉' },
  49: { name: '转变', luck: '半吉' },
  50: { name: '小舟入海', luck: '半吉' },
  51: { name: '沉浮', luck: '半吉' },
  52: { name: '达眼', luck: '吉' },
  53: { name: '曲卷难星', luck: '凶', alt: '半吉', disputed: true },
  54: { name: '石上栽花', luck: '凶' },
  55: { name: '善恶', luck: '半吉', alt: '凶', disputed: true },
  56: { name: '浪里行舟', luck: '凶' },
  57: { name: '日照春松', luck: '吉' },
  58: { name: '晚行遇月', luck: '半吉' },
  59: { name: '寒蝉悲风', luck: '凶' },
  60: { name: '无谋', luck: '凶' },
  61: { name: '牡丹芙蓉', luck: '吉' },
  62: { name: '衰败', luck: '凶' },
  63: { name: '舟归平海', luck: '吉' },
  64: { name: '非命', luck: '凶' },
  65: { name: '巨流归海', luck: '吉' },
  66: { name: '岩头步马', luck: '凶' },
  67: { name: '顺风通达', luck: '吉' },
  68: { name: '顺风吹帆', luck: '吉' },
  69: { name: '非业', luck: '凶' },
  70: { name: '残菊逢霜', luck: '凶' },
  71: { name: '石上金花', luck: '半吉' },
  72: { name: '劳苦', luck: '半吉', alt: '凶', disputed: true },
  73: { name: '无勇', luck: '半吉', alt: '吉' },
  74: { name: '残菊经霜', luck: '凶' },
  75: { name: '退守', luck: '凶', alt: '半吉', disputed: true },
  76: { name: '离散', luck: '凶' },
  77: { name: '半吉', luck: '半吉' },
  78: { name: '晚苦', luck: '凶', alt: '半吉', disputed: true },
  79: { name: '云头望月', luck: '凶' },
  80: { name: '遁吉', luck: '凶' },
  81: { name: '万物回春', luck: '吉' },
}

/** 五格数理吉凶档位。cite: 同 {@link WUGE_81} */
export const WUGE_LUCK_LEVELS = ['吉', '半吉', '凶']

/** 五格数理吉凶档 → 倾向分（-100..100，本插件的编辑取值，供聚合用）。cite: 本插件取值 */
export const WUGE_LUCK_SCORE = { 吉: 55, 半吉: 10, 凶: -55 }

/**
 * 数理五行（按尾数）：1·2 木、3·4 火、5·6 土、7·8 金、9·0 水。
 * cite: 顺时知识库《八十一數理·數理五行》 https://shunshi.ai/zh-tw/wiki/naming/wuge/shuli_81
 * note: 该规则在熊崎式姓名学中通用；三才配置即由天格·人格·地格三数的五行组合而成。
 */
export const WUGE_WUXING_BY_TAIL = { 1: '木', 2: '木', 3: '火', 4: '火', 5: '土', 6: '土', 7: '金', 8: '金', 9: '水', 0: '水' }

/**
 * 取某数的数理五行。
 * @param {number} n 数（1..81，或更大）。
 * @returns {string} 五行。
 */
export function wugeWuxingOf(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return ''
  return WUGE_WUXING_BY_TAIL[mod(Math.trunc(v), 10)] ?? ''
}

/**
 * 五格取数行规：数超过 81 者减 80 复归（85 按 5 论、90 按 10 论、81 与 1 同为吉）。
 * cite: 顺时知识库《八十一數理·超過 81 減 80 復歸》 https://shunshi.ai/zh-tw/wiki/naming/wuge/shuli_81
 * note: 该库亦如实说明此条是「表只做到 81 的工程补丁」，非由原理推出；本插件照行规执行并照实标注。
 * @param {number} n 格数。
 * @returns {number} 1..81 的数。
 */
export function wugeReduce(n) {
  const v = Math.trunc(Number(n))
  if (!Number.isFinite(v) || v <= 0) return 0
  const r = mod(v, 80)
  return r === 0 ? 80 : r
}

/**
 * 三才配置表：**故意留空**。
 * 三才（天格·人格·地格五行）125 种组合的吉凶档，熊崎原表与中文各传本（《姓名学宝典》、
 * 《慧缘姓名学》等）并不完全一致，本插件无可核原表，按契约不写数值。
 * 需要者请用 {@link SANCAI_RULE} 的三才五行生克判据自行定档，并在 detail 里标 approx。
 *
 * @type {null}
 */
export const SANCAI_TABLE = null

/**
 * 三才判据（可推导部分）：三才 = 天格·人格·地格各自的数理五行；吉凶取「三格之间的生克关系」。
 * 本表只给**关系与五行**（可由 {@link wugeWuxingOf} 与 `kit.relation` 推出），不给吉凶分值。
 * cite: 顺时知识库《五格剖象·三才配置》 https://shunshi.ai/zh-tw/wiki/naming/wuge/sancai_intro
 *
 * @type {{fields:string[], derive:string, levels:string[]}}
 */
export const SANCAI_RULE = {
  fields: ['天格', '人格', '地格'],
  derive: '各格数走 wugeReduce → wugeWuxingOf 得五行，再以 kit.relation(人格, 天格/地格) 得比和·我生·生我·我克·克我',
  levels: ['三才相生（吉）', '三才比和（吉）', '一克一生（半吉）', '三才相克（凶）'],
  note: '通行原则：相生相比为吉、相克为凶；具体档位各谱互异，本插件不下数值',
}

/** 生肖喜忌部首（生肖姓名学用字宜忌）。cite: —（无可核出处，故意留空；见 TABLES_META） */
export const SHENGXIAO_BUSHOU = null

// ───────────────────────── 二十八宿扩展 ─────────────────────────

/**
 * 二十八宿顺序索引（角 = 0 … 轸 = 27）。cite: 同 v1 {@link XIU28}（东方七宿起）
 */
export const XIU28_ORDER = Object.fromEntries(XIU28.map((x, i) => [x.name, i]))

/**
 * 二十八宿四象分组。cite: 《史记·天官书》《汉书·律历志》二十八宿四象分野（东方苍龙、北方玄武、
 * 西方白虎、南方朱雀，各七宿）
 *
 * @type {Object<string,string[]>}
 */
export const XIU28_GROUP = {
  东方苍龙: ['角', '亢', '氐', '房', '心', '尾', '箕'],
  北方玄武: ['斗', '牛', '女', '虚', '危', '室', '壁'],
  西方白虎: ['奎', '娄', '胃', '昴', '毕', '觜', '参'],
  南方朱雀: ['井', '鬼', '柳', '星', '张', '翼', '轸'],
}

/**
 * 二十八宿吉凶（通书「二十八宿吉凶歌」的吉/凶判）。
 * cite: vendor/lunar.cjs（lunar-javascript）`LunarUtil.XIU_LUCK`（角吉、亢凶、氐凶、房吉、心凶、
 *       尾吉、箕吉、斗吉、牛凶、女凶、虚凶、危凶、室吉、壁吉、奎凶、娄吉、胃吉、昴凶、毕吉、
 *       觜凶、参吉、井吉、鬼凶、柳凶、星凶、张吉、翼凶、轸吉）；
 *       其 XIU_SONG 即通行本《二十八宿吉凶歌》原文（同文件，未转录以避免大段辞书搬运）。
 * note: **与 v1 `XIU28[].score` 有 2 处不一致**：心宿（v1 +30 吉 / 本表 凶）、
 *       翼宿（v1 +30 吉 / 本表 凶）。通书歌诀「心星造作大为凶」「翼星不利架高堂」支持本表。
 *       v1 分值本轮**未改动**（避免影响在写的方法族），差异已记入 docs/verification/tables-provenance.md，
 *       由 Lead 决定是否修正。
 *
 * @type {Object<string,'吉'|'凶'>}
 */
export const XIU28_LUCK = {
  角: '吉', 亢: '凶', 氐: '凶', 房: '吉', 心: '凶', 尾: '吉', 箕: '吉',
  斗: '吉', 牛: '凶', 女: '凶', 虚: '凶', 危: '凶', 室: '吉', 壁: '吉',
  奎: '凶', 娄: '吉', 胃: '吉', 昴: '凶', 毕: '吉', 觜: '凶', 参: '吉',
  井: '吉', 鬼: '凶', 柳: '凶', 星: '凶', 张: '吉', 翼: '凶', 轸: '吉',
}

/**
 * 二十八宿宜忌（逐宿宜某事忌某事）。**故意留空**。
 * 逐宿宜忌需《协纪辨方书》《象吉通书》等辞书原表，本插件手上无可靠版本，
 * 按契约不伪造；方法层若需「宜忌」请只用通书歌诀的关键词提取并标 approx。
 *
 * @type {null}
 */
export const XIU28_YIJI = null

// ══════════════════════════════════════════════════════════════════════════════
// TABLES_META · 表级溯源账本
//
// 每张导出表一条：{ source: 出处, verified: 'yes'|'partial'|'no', note: 争议/限制 }
// verified 的含义（严格按契约 §4）：
//   'yes'     —— 有明确文献或可核 oracle 出处，且本插件做过机械核验（对拍/穷举/合计校验）；
//   'partial' —— 出处存在但为公开通例编辑取值、或诸本互异、或仅网络二手汇编可查；
//   'no'      —— 查无可靠出处，**故意写 null**，绝不编数。
// 本表的机器可读版即下方 TABLES_META，叙述版见 docs/verification/tables-provenance.md。
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 表级溯源账本（表名 → 出处／核验状态／限制说明）。
 * @type {Object<string,{source:string, verified:'yes'|'partial'|'no', note:string}>}
 */
export const TABLES_META = {
  TABLES_META: { source: '本文件自述（人工维护）', verified: 'yes', note: '表级账本；叙述版见 docs/verification/tables-provenance.md' },
  // ── v1 既有表 ──
  TRIGRAMS: { source: '《周易·说卦传》八卦取象；先天数用伏羲次序（乾一兑二…坤八）', verified: 'yes', note: '五行/方位/卦德取通行配属' },
  TRI_BY_NAME: { source: '派生自 TRIGRAMS', verified: 'yes', note: '纯索引，无独立取值' },
  TRI_BY_XIAN: { source: '派生自 TRIGRAMS', verified: 'yes', note: '纯索引' },
  HEX_TABLE: { source: '《周易》六十四卦上下卦组合（通行本）', verified: 'yes', note: '上卦行×下卦列，列序同 TRIGRAMS' },
  HEX_SEQ: { source: '《周易》通行本卦序（王弼本·朱熹《周易本义》）', verified: 'yes', note: '乾一…未济六十四' },
  HEX_ORDER: { source: '派生自 HEX_SEQ', verified: 'yes', note: '纯索引' },
  HEX_POLARITY: { source: '依卦名语义＋传统卜筮通例的编辑取值（源码注释已声明）', verified: 'partial', note: '非某一秘本原文数字，可按师承改；已在文件头声明' },
  NAJIA: { source: '京房纳甲（《京氏易传》；《增删卜易·卷首》纳甲例）', verified: 'yes', note: '乾坤纳甲用甲壬/乙癸，与通行本一致' },
  PALACES: { source: '京房八宫卦序（本宫·一世…五世·游魂·归魂）', verified: 'yes', note: '八宫六十四卦归属' },
  PALACE_STAGE: { source: '八宫卦变世爻位次（《卜筮正宗·世应诀》）', verified: 'yes', note: '世爻：本宫上爻、一世初爻…游魂四爻、归魂三爻' },
  HEX_PALACE: { source: '派生自 PALACES × PALACE_STAGE', verified: 'yes', note: '纯索引' },
  HEX_WUXING: { source: '派生自 PALACES（卦宫五行）', verified: 'yes', note: '纯派生' },
  JIANCHU: { source: '《协纪辨方书·卷十》建除十二神宜忌', verified: 'partial', note: 'score 为本插件编辑取值；宜忌说明取自通书通行语' },
  HUANGHEIDAO: { source: '《协纪辨方书》黄黑道十二神（青龙…勾陈）', verified: 'partial', note: '黄黑道归类为通行；score 为本插件编辑取值' },
  XIU28: { source: '二十八宿名/方位/禽曜/正五行：通书通行表；lunar.cjs XIU_SONG 可校', verified: 'partial', note: 'score 为本插件编辑取值；**心宿·翼宿 score 与 XIU28_LUCK 冲突**（详见 XIU28_LUCK.note 与核验文档）' },
  LIUYAO: { source: '六曜（中日同源「六辉」，日本旧历）；`佛灭`/`仏灭` 互为异体别名', verified: 'partial', note: 'score 为本插件编辑取值；别名行不得删（smoke 断言）' },
  NINE_STAR: { source: '紫白九星（《洛书》；《沈氏玄空学》九星名）', verified: 'partial', note: '星名/五行/吉凶归类通行；luck 文字为本插件编辑取值' },
  SHAN24: { source: '罗盘二十四山（八干四维十二支）', verified: 'yes', note: '自子起顺行，与通行罗盘一致' },
  SHAN_PALACE: { source: '派生自二十四山八卦分宫（壬子癸坎、丑艮寅艮…）', verified: 'yes', note: '纯派生' },
  EAST_WEST: { source: '《八宅明镜》东西四命（坎离震巽东四、乾坤艮兑西四）', verified: 'yes', note: '' },
  WUYIN: { source: '五音配五行（《礼记·月令》／律吕：宫土商金角木徵火羽水）', verified: 'yes', note: '' },
  TEN_GODS: { source: '《渊海子平·卷一》十神（比肩劫财食神伤官偏财正财七杀正官偏印正印）', verified: 'yes', note: '顺序供统计用' },
  ZIWEI_PALACES: { source: '《紫微斗数全书》十二宫（命兄夫子财疾迁友官田福父）', verified: 'yes', note: '' },
  ASTRO_HOUSES: { source: '西方占星十二宫（现代占星通行名，本插件汉译）', verified: 'partial', note: 'v1 第 7 位作「疾厄2」占位（实为第七宫·夫妻），本轮**未改动**以保持 v1 兼容，差异记档' },
  ZODIAC: { source: '十二星座日期区间（现代占星通行，含起止日）', verified: 'partial', note: '边界各书有 1 日出入（如摩羯 12/22 起）' },
  TAIXUAN_81: { source: '扬雄《太玄经》八十一首首名', verified: 'yes', note: '首名用通行本字形' },
  LINGQI_POS: { source: '《灵棋经》十二棋位（上四·中四·下四）', verified: 'partial', note: 'v1 只有三组名，非逐棋位（十二位）全表' },
  DONGGONG_JI: { source: '《董公选要》董公择日忌日（月支冲日）', verified: 'partial', note: '各本董公表详略不同，本表仅取「忌」日支一列' },
  YANGGONG_13: { source: '杨公十三忌通行表（正月初三…十二月十九）', verified: 'yes', note: '与通书十三日一致' },
  WUYUN: { source: '《黄帝内经·素问·天元纪大论／五常政大论》五运（十干化运太过不及）', verified: 'yes', note: '' },
  LIUQI_SITIAN: { source: '《黄帝内经·素问·五运行大论》六气司天（子午少阴君火…）', verified: 'yes', note: '' },

  // ── v2 新增 ──
  SHI_YING: { source: '派生自 PALACE_STAGE（世应相隔三爻）', verified: 'yes', note: '应爻 = (世−1+3) mod 6 + 1；未改 v1 值' },
  SHI_YING_BY_HEX: { source: '派生自 HEX_PALACE × SHI_YING', verified: 'yes', note: '覆盖 64 卦' },
  YONGSHEN: { source: '《增删卜易·用神章》及求财/婚姻/官讼/疾病/出行/行人/失物/考试/田宅/胎产各章；《卜筮正宗·卷三·六亲取用》', verified: 'partial', note: '28 事类取用为归纳表；婚姻类依性别分取已用 altQin 标注' },
  WANGXIANG: { source: '《渊海子平·卷一·论五行旺相休囚死》；《三命通会·卷二》', verified: 'yes', note: '已穷举 5×5 与 kit.wangShuai 对拍，0 差异' },
  WANGXIANG_STATES: { source: '同 WANGXIANG', verified: 'yes', note: '' },
  WANGXIANG_SCORE: { source: '与 kit.wangShuai 分值一致（旺100 相75 休40 囚25 死10）', verified: 'yes', note: '系数属本插件取值，但与既有 kernel 保持一致' },
  KONG_RULES: { source: '《增删卜易·旬空章》', verified: 'partial', note: '断语为通行语归纳，非原文引用' },
  JIAN_PO_RULES: { source: '《增删卜易·月建章／日建章》', verified: 'partial', note: '判据为规则式，说明文字为归纳' },
  LIUSHEN: { source: '《卜筮正宗·卷一·六神诀》（甲乙起青龙…）', verified: 'yes', note: '与 kit.liuShenOf 起例一致' },
  SANHE_GROUPS: { source: '《三命通会·卷二·论三合会局》', verified: 'yes', note: '与 kit.ZHI_SANHE 同值' },
  SANHE_GROUP: { source: '派生自 SANHE_GROUPS', verified: 'yes', note: '纯派生' },
  SHENSHA_ALL: { source: '《渊海子平·卷一》神煞歌诀；《三命通会·卷二·论诸神煞》', verified: 'partial', note: "共 27 条；驿马/桃花/华盖/将星 已与 kit.SHENSHA 逐支对拍 0 差异；标 partial 的 6 条：羊刃(阴干异说)、国印(次序异)、红艳(歌诀互异)、六厄(死位/败地异)、天医(前退一位异)、魁罡(壬戌/戊戌异)" },
  RENYUAN_30: { source: '《渊海子平·卷一·人元司令分野》', verified: 'partial', note: '四孟月取通行本 7·7·16（寅巳申亥余7中7本16），四仲 10·20、四季 9·3·18；另有异本（巳5·9·16、申5·3·22、亥7·5·18）。**已与 src/methods/mingli.js 族内表逐月同值对齐**（形状不同：本表 [{gan,days}]、族内 [[gan,days]]）。十二月合计均 =30（已机械校验）；卯含甲、酉含庚，较 kit.ZHI_CANGGAN 多一干' },
  CANGGAN_W: { source: '派生自 RENYUAN_30（用事日数 ÷ 合计 30）', verified: 'yes', note: '无独立取值；覆盖 kit.ZHI_CANGGAN 全键（已校验）' },
  CANGGAN_LEVEL: { source: '《渊海子平·卷一》本气／中气／余气', verified: 'yes', note: '' },
  ZIWEI_BRANCH_FROM_YIN: { source: '《紫微斗数全书·安十二宫诀》', verified: 'yes', note: '索引 0 = 寅宫' },
  ZIWEI_JU: { source: '《紫微斗数全书·安五行局诀》；oracle iztro@2.6.1 astro/palace.js getFiveElementsClass', verified: 'yes', note: '六十甲子已与 iztro 算术式逐一对拍，与纳音五行判局等价' },
  ZIWEI_MAJOR_GROUP: { source: '《紫微斗数全书》安紫微诸星诀／安天府诸星诀；iztro@2.6.1 lib/star/majorStar.js', verified: 'yes', note: '相对偏移，两系共 14 主星' },
  ZIWEI_BRIGHTNESS: { source: 'iztro@2.6.1（MIT）lib/data/stars.js STARS_INFO[*].brightness（源为《紫微斗数全书》庙旺表）', verified: 'partial', note: '20 星 × 12 宫已逐星对拍 0 差异；庙旺各派互异（全书/中州/飞星），取 iztro 通行本' },
  ZIWEI_BRIGHTNESS_LEVELS: { source: 'iztro@2.6.1 lib/i18n/locales/zh-CN/brightness.js', verified: 'yes', note: '庙旺得利平不陷七级' },
  ZIWEI_SIHUA: { source: '《紫微斗数全书·安四化诀》；iztro@2.6.1 lib/data/heavenlyStems.js mutagen', verified: 'yes', note: '十干逐干对拍 0 差异；庚干取「阳武阴同」，另有异说已在表头注明' },
  ZIWEI_MINGSHEN: { source: '《紫微斗数全书·安命主身主诀》；iztro@2.6.1 lib/data/earthlyBranches.js soul/body', verified: 'yes', note: '十二支逐支对拍 0 差异' },
  ZIWEI_KUI_YUE: { source: '《紫微斗数全书·安魁钺诀》（与天乙贵人歌同源）；iztro getKuiYueIndex', verified: 'yes', note: '逐干对拍 0 差异' },
  ZIWEI_LUCUN: { source: '《紫微斗数全书·安禄存诀》（即十干禄神）；iztro getLuYangTuoMaIndex', verified: 'yes', note: '逐干对拍 0 差异' },
  ZIWEI_HUO_LING_START: { source: '《紫微斗数全书》火铃诀「申子辰人寅戌扬…」；iztro getHuoLingIndex', verified: 'partial', note: '逐支对拍 0 差异，但火铃起法诸本有异（另有按年支起丑卯不入年局者）' },
  ZIWEI_MINOR_RULES: { source: '《紫微斗数全书》安辅弼／昌曲／空劫／火铃／鸾喜诀；iztro@2.6.1 lib/star/location.js', verified: 'partial', note: '口诀与 iztro 实现逐条核对；「阳男阴女顺行」一类性别相关法则不属本表' },
  XUANKONG_YUN: { source: '《沈氏玄空学·论三元九运》（1864 甲子起一运，每运 20 年）', verified: 'yes', note: '1864 为甲子年可验（1860 庚申 + 4）' },
  XUANKONG_FLY: { source: '《沈氏玄空学》九宫飞泊轨迹（中→乾→兑→艮→离→坎→坤→震→巽）', verified: 'yes', note: '' },
  LUOSHU_GONG: { source: '《洛书》九宫数（戴九履一、左三右七、二四为肩、六八为足）', verified: 'yes', note: '' },
  SHAN24_SANYUAN: { source: '《沈氏玄空学·论三元龙》（天元四正四维、地元四孟干与四库、人元四生与四仲干）', verified: 'partial', note: '三元龙阴阳配属各本表述略异，本表取通行配法' },
  SHAN24_SANHE: { source: '《地理五诀·卷三》双山五行（坤壬乙辰水、艮丙辛戌火、巽庚癸丑金、乾甲丁未木）', verified: 'partial', note: '双山配山方式各书表述不同，取《地理五诀》通行配法' },
  SANHE_CHANGSHENG: { source: '派生自 kit.CHANGSHENG × CHANGSHENG_START（阳干长生：壬申·甲亥·丙寅·庚巳）', verified: 'yes', note: '无独立取值；起点与《地理五诀·十二长生水法》一致' },
  XUANKONG_TIGUA: { source: '—（无可核原表）', verified: 'no', note: '兼向替卦各谱互异，故意留 null，勿编' },
  WUGE_81: { source: '熊崎健翁《姓名の神秘》(1929) 五格剖象法；取值汇编 [1] 琴鹤堂国学 sohu / [2] 顺时知识库 shunshi.ai（两源互校）', verified: 'partial', note: '网络二手汇编互校，非原书影印；16 数两源档位不同（已记 alt），其中 9 数跨侧冲突（disputed）' },
  WUGE_LUCK_LEVELS: { source: '同 WUGE_81', verified: 'partial', note: '' },
  WUGE_LUCK_SCORE: { source: '本插件编辑取值（吉55 半吉10 凶-55）', verified: 'partial', note: '仅供聚合，非典籍数值' },
  WUGE_WUXING_BY_TAIL: { source: '顺时知识库《八十一數理·數理五行》（尾数 1·2 木 3·4 火 5·6 土 7·8 金 9·0 水）', verified: 'partial', note: '熊崎式通用规则，来源为网络汇编' },
  SANCAI_TABLE: { source: '—（无可核原表）', verified: 'no', note: '125 组三才吉凶各传本不一致，故意留 null；用 SANCAI_RULE 自行定档并标 approx' },
  SANCAI_RULE: { source: '顺时知识库《五格剖象·三才配置》（相生相比为吉、相克为凶）', verified: 'partial', note: '只给可推导的关系判据，不给分值' },
  SHENGXIAO_BUSHOU: { source: '—（无可核出处）', verified: 'no', note: '生肖姓名学用字宜忌属近代俗说，各谱互异，故意留 null' },
  XIU28_ORDER: { source: '派生自 XIU28', verified: 'yes', note: '角=0 … 轸=27' },
  XIU28_GROUP: { source: '《史记·天官书》《汉书·律历志》二十八宿四象分野', verified: 'yes', note: '' },
  XIU28_LUCK: { source: 'vendor/lunar.cjs（lunar-javascript）LunarUtil.XIU_LUCK；XIU_SONG 即通书《二十八宿吉凶歌》', verified: 'yes', note: '与 v1 XIU28.score 有 2 处冲突（心·翼），v1 值本轮未改，差异记档待 Lead 裁' },
  XIU28_YIJI: { source: '—（需《协纪辨方书》等辞书原表）', verified: 'no', note: '逐宿宜忌无可靠版本，故意留 null' },

  // ── 有意不在本文件（避免与族内表重复）──
  _三式与六壬表: { source: '见 src/methods/sanshi.js 族内表（m-sanshi 自帶出处）', verified: 'no', note: '按契约 §5 族内专用表归族内；m-sanshi 明确要求不要在 tables.js 重复（奇门局数/月将过宫/九宗门等属师承敏感表）' },
  _风水族内表: { source: '见 src/methods/fengshui.js 族内表（若 m-fengshui 起后新增）', verified: 'partial', note: 'm-fengshui 本轮未起，故玄空/三合跨族部分暂放本文件，供风水族 import' },
}
