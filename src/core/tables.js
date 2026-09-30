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
import { GAN, ZHI_WUXING, SHENG, KE } from './kit.js'

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
