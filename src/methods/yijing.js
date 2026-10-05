/**
 * 方法模块 · 易卦类（24 法，#1–#24）· v2 重写
 *
 * ## 契约（`src/core/runner.js`）
 * ```js
 * export const engines = { engineName(chart, entry, rand) { return { score, essence, keys, wuxing, timing, detail, fidelity } } }
 * ```
 * - **纯函数**：不读时钟/文件/网络；时刻一律从 `chart` 取。
 * - **不得抛异常**：确实无法算 → `return null`（运行器记「未起」）。本模块另有一层
 *   `guard()`：族内表或 `chart` 字段意外缺位时返回**结构完整的降级结果**（并在
 *   `detail.异常` 里写明），而不是让「108 法全起」因本族崩掉。
 * - **确定性**：一切随机只走 `rand`（`makeRand(seedBase|entryId)`），禁用 `Math.random()`。
 *
 * ## 本模块共用的起卦与断卦口径（写在明处，可改）
 * - 爻值：`6` 老阴(交·动) / `7` 少阳(单) / `8` 少阴(拆) / `9` 老阳(重·动)；`1`=阳，`0`=阴。
 * - 动爻：`6` 与 `9`。变卦 = 动爻取反。互卦 = 二三四为下、三四五为上。
 * - 卦德：`HEX_POLARITY`（-100..100，依卦名语义与传统卜筮通例的编辑取值）。
 * - 月令旺衰：`wangShuai(卦五行, 月令五行)`；卦五行为**京房八宫所属宫之五行**。
 *   ⚠ **本插件不使用「卦气」说**（孟喜六日七分/卦气值日）：`docs/research/yijing-spec.md §F3` 查遍 9 个
 *   仓库均无卦气表或公式，属【未核实】，故不凭记忆补表；一切「旺衰」只取月令（旺相休囚死）。
 *   十二消息卦（十二辟卦）配月建另有其表，本插件仅用于 #17 皇极经世与 #20 先天易数，并如实标名。
 * - 体用：**动爻所在之卦为用、不动之卦为体**（《梅花易数·体用总诀》）。
 * - 六爻：以**月建为提纲、日辰为主宰**（《增删卜易》），用神得日月生扶则吉、空破受克则凶。
 *
 * ## 防御式接入
 * `chart.astro / chart.renyuan / chart.shenshaAll / chart.dayBoundary / chart.solarTrue` 由
 * kernel-astro 并行开发；`core/tables.js` 由 kernel-tables 并行重写。本模块对这些**只作可选读取**
 * （`?.` + 形状校验），缺位时走文件顶部的族内表，**不因此返回 null，也不因此抛异常**。
 * 族内表全部带出处注释；跨族共用表只读不改。
 */

import * as K from '../core/kit.js'
import * as T from '../core/tables.js'
// 只借 `detectTopic` 做「所问事类」判定（与聚合器同源，避免同问在方法与合盘里归到不同类）。
// 命名空间导入 + 调用期校验：kernel 若改名/缺位，自动落到族内关键词表。
import * as A from '../core/aggregate.js'

// ═════════════════════════ 0. 防御式基础层 ═════════════════════════

/** 取内核函数（缺位则用本地兜底）。 */
const kfn = (name, fallback) => (typeof K[name] === 'function' ? K[name] : fallback)

/** 数值夹取。 */
const clamp = kfn('clamp', (n, a, b) => { const v = Number.isFinite(n) ? n : 0; return v < a ? a : v > b ? b : v })
/** 取模（恒非负）。 */
const mod = kfn('mod', (n, m) => ((n % m) + m) % m)

// ── 干支基础（cite: 《渊海子平》干支五行；与 core/kit.js 同源，作为兜底） ──
const L_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
const L_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
const L_GAN_WUXING = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' }
const L_ZHI_WUXING = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' }
const L_SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }
const L_KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }
const L_LIUCHONG = { 子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅', 卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳' }

const GAN = (Array.isArray(K.GAN) && K.GAN.length === 10) ? K.GAN : L_GAN
const ZHI = (Array.isArray(K.ZHI) && K.ZHI.length === 12) ? K.ZHI : L_ZHI
const GAN_WUXING = (K.GAN_WUXING && K.GAN_WUXING['甲']) ? K.GAN_WUXING : L_GAN_WUXING
const ZHI_WUXING = (K.ZHI_WUXING && K.ZHI_WUXING['子']) ? K.ZHI_WUXING : L_ZHI_WUXING
const SHENG = (K.SHENG && K.SHENG['木']) ? K.SHENG : L_SHENG
const KE = (K.KE && K.KE['木']) ? K.KE : L_KE
const ZHI_LIUCHONG = (K.ZHI_LIUCHONG && K.ZHI_LIUCHONG['子']) ? K.ZHI_LIUCHONG : L_LIUCHONG
const WUXING = (Array.isArray(K.WUXING) && K.WUXING.length === 5) ? K.WUXING : ['木', '火', '土', '金', '水']
const ZHI_YANG = (K.ZHI_YANG && K.ZHI_YANG['子'] !== undefined) ? K.ZHI_YANG
  : { 子: true, 丑: false, 寅: true, 卯: false, 辰: true, 巳: false, 午: true, 未: false, 申: true, 酉: false, 戌: true, 亥: false }

/** 五行关系（以 a 为主体）。 */
function lRelation(a, b) {
  if (a === b) return '比和'
  if (SHENG[a] === b) return '我生'
  if (SHENG[b] === a) return '生我'
  if (KE[a] === b) return '我克'
  return '克我'
}
const relation = kfn('relation', lRelation)

/** 月令旺衰（当令旺、令生相、生令休、克令囚、令克死）。 */
function lWangShuai(wx, monthWx) {
  if (wx === monthWx) return { state: '旺', score: 100 }
  if (SHENG[monthWx] === wx) return { state: '相', score: 75 }
  if (SHENG[wx] === monthWx) return { state: '休', score: 40 }
  if (KE[wx] === monthWx) return { state: '囚', score: 25 }
  return { state: '死', score: 10 }
}
function wangShuai(wx, monthWx) {
  const f = K.wangShuai
  if (typeof f === 'function') {
    try {
      const r = f(wx, monthWx)
      if (r && typeof r.state === 'string' && Number.isFinite(r.score)) return r
    } catch { /* 落到本地兜底 */ }
  }
  return lWangShuai(wx, monthWx)
}

/** 空五行表。 */
function emptyWuxing() {
  const o = {}
  for (const w of WUXING) o[w] = 0
  return o
}

/** 带符号整数（证据链用）。 */
const signed = (n) => `${n > 0 ? '+' : ''}${Math.round(n)}`
/** 爻位名。 */
const POS_NAMES = ['初', '二', '三', '四', '五', '上']

// ═════════════════════════ 1. 族内专用表（带出处） ═════════════════════════

/**
 * 八卦：`bits` 自下而上（1=阳）。
 * cite: 《周易·说卦传》「乾为天…坤为地」；先天数依《皇极经世》伏羲次序（乾一兑二离三震四巽五坎六艮七坤八）；
 *       后天数依《洛书》九宫配后天八卦（坎一坤二震三巽四中五乾六兑七艮八离九）。
 */
const L_TRIGRAMS = [
  { name: '乾', bits: [1, 1, 1], xian: 1, hou: 6, wx: '金', sym: '☰', xiang: '天', dir: '西北', fam: '父', body: '首', virtue: '健', animal: '马' },
  { name: '兑', bits: [1, 1, 0], xian: 2, hou: 7, wx: '金', sym: '☱', xiang: '泽', dir: '西', fam: '少女', body: '口', virtue: '悦', animal: '羊' },
  { name: '离', bits: [1, 0, 1], xian: 3, hou: 9, wx: '火', sym: '☲', xiang: '火', dir: '南', fam: '中女', body: '目', virtue: '丽', animal: '雉' },
  { name: '震', bits: [1, 0, 0], xian: 4, hou: 3, wx: '木', sym: '☳', xiang: '雷', dir: '东', fam: '长男', body: '足', virtue: '动', animal: '龙' },
  { name: '巽', bits: [0, 1, 1], xian: 5, hou: 4, wx: '木', sym: '☴', xiang: '风', dir: '东南', fam: '长女', body: '股', virtue: '入', animal: '鸡' },
  { name: '坎', bits: [0, 1, 0], xian: 6, hou: 1, wx: '水', sym: '☵', xiang: '水', dir: '北', fam: '中男', body: '耳', virtue: '陷', animal: '豕' },
  { name: '艮', bits: [0, 0, 1], xian: 7, hou: 8, wx: '土', sym: '☶', xiang: '山', dir: '东北', fam: '少男', body: '手', virtue: '止', animal: '狗' },
  { name: '坤', bits: [0, 0, 0], xian: 8, hou: 2, wx: '土', sym: '☷', xiang: '地', dir: '西南', fam: '母', body: '腹', virtue: '顺', animal: '牛' },
]

/** 内核表若可用，只借其 `wx`（五行须全系统一致）；bits 以本表为准（定义性数据）。 */
let TRI = L_TRIGRAMS.map((t) => {
  const k = Array.isArray(T.TRIGRAMS) ? T.TRIGRAMS.find((x) => x && x.name === t.name) : null
  if (!k) return { ...t }
  return { ...t, wx: (typeof k.wx === 'string' && k.wx) ? k.wx : t.wx }
})
let TRI_BY_NAME = Object.fromEntries(TRI.map((t) => [t.name, t]))
let TRI_BY_BITS = Object.fromEntries(TRI.map((t) => [t.bits.join(''), t]))
/** 取八卦（未知名 → 乾，永不抛）。 */
const tri = (name) => TRI_BY_NAME[name] ?? TRI_BY_NAME['乾']
/** 三爻 → 八卦名。 */
const triNameOfBits = (b) => TRI_BY_BITS[[b[0] ? 1 : 0, b[1] ? 1 : 0, b[2] ? 1 : 0].join('')]?.name ?? '乾'

/** 上卦(行) × 下卦(列)。cite: 《周易》通行本六十四卦名。 */
const L_HEX_ROWS = [
  ['乾为天', '天泽履', '天火同人', '天雷无妄', '天风姤', '天水讼', '天山遁', '天地否'],
  ['泽天夬', '兑为泽', '泽火革', '泽雷随', '泽风大过', '泽水困', '泽山咸', '泽地萃'],
  ['火天大有', '火泽睽', '离为火', '火雷噬嗑', '火风鼎', '火水未济', '火山旅', '火地晋'],
  ['雷天大壮', '雷泽归妹', '雷火丰', '震为雷', '雷风恒', '雷水解', '雷山小过', '雷地豫'],
  ['风天小畜', '风泽中孚', '风火家人', '风雷益', '巽为风', '风水涣', '风山渐', '风地观'],
  ['水天需', '水泽节', '水火既济', '水雷屯', '水风井', '坎为水', '水山蹇', '水地比'],
  ['山天大畜', '山泽损', '山火贲', '山雷颐', '山风蛊', '山水蒙', '艮为山', '山地剥'],
  ['地天泰', '地泽临', '地火明夷', '地雷复', '地风升', '地水师', '地山谦', '坤为地'],
]
const L_HEX_BY_NAME = (() => {
  const out = {}
  const order = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤']
  order.forEach((up, i) => { out[up] = {}; order.forEach((lo, j) => { out[up][lo] = L_HEX_ROWS[i][j] }) })
  return out
})()

/** 周易通行本次序。cite: 《周易》上下经卦序。 */
const L_HEX_SEQ = ('乾为天 坤为地 水雷屯 山水蒙 水天需 天水讼 地水师 水地比 风天小畜 天泽履 地天泰 天地否 '
  + '天火同人 火天大有 地山谦 雷地豫 泽雷随 山风蛊 地泽临 风地观 火雷噬嗑 山火贲 山地剥 地雷复 '
  + '天雷无妄 山天大畜 山雷颐 泽风大过 坎为水 离为火 泽山咸 雷风恒 天山遁 雷天大壮 火地晋 地火明夷 '
  + '风火家人 火泽睽 水山蹇 雷水解 山泽损 风雷益 泽天夬 天风姤 泽地萃 地风升 泽水困 水风井 '
  + '泽火革 火风鼎 震为雷 艮为山 风山渐 雷泽归妹 雷火丰 火山旅 巽为风 兑为泽 风水涣 水泽节 '
  + '风泽中孚 雷山小过 水火既济 火水未济').split(' ')
const L_HEX_ORDER = Object.fromEntries(L_HEX_SEQ.map((n, i) => [n, i + 1]))

/**
 * 六十四卦吉凶倾向（-100..100）。
 * cite: 依卦名语义 + 传统卜筮通例的**编辑取值**（与 core/tables.js HEX_POLARITY 同源）；
 *       本表仅在内核表缺位/退化时兜底，优先用内核表以保持全系统一致。
 */
const L_HEX_POL = {
  乾为天: 55, 坤为地: 30, 水雷屯: -30, 山水蒙: -25, 水天需: 20, 天水讼: -35, 地水师: -10, 水地比: 35,
  风天小畜: 10, 天泽履: 5, 地天泰: 80, 天地否: -55, 天火同人: 45, 火天大有: 75, 地山谦: 70, 雷地豫: 45,
  泽雷随: 40, 山风蛊: -30, 地泽临: 55, 风地观: 15, 火雷噬嗑: 20, 山火贲: 25, 山地剥: -70, 地雷复: 50,
  天雷无妄: 25, 山天大畜: 40, 山雷颐: 20, 泽风大过: -35, 坎为水: -60, 离为火: 45, 泽山咸: 60, 雷风恒: 35,
  天山遁: -15, 雷天大壮: 30, 火地晋: 65, 地火明夷: -55, 风火家人: 40, 火泽睽: -20, 水山蹇: -55, 雷水解: 45,
  山泽损: -10, 风雷益: 65, 泽天夬: 10, 天风姤: -25, 泽地萃: 40, 地风升: 55, 泽水困: -60, 水风井: 20,
  泽火革: 35, 火风鼎: 45, 震为雷: 15, 艮为山: -10, 风山渐: 45, 雷泽归妹: -30, 雷火丰: 50, 火山旅: -25,
  巽为风: 30, 兑为泽: 45, 风水涣: 5, 水泽节: 15, 风泽中孚: 50, 雷山小过: -20, 水火既济: 60, 火水未济: -20,
}
const kHexPol = (T.HEX_POLARITY && typeof T.HEX_POLARITY === 'object' && Object.keys(T.HEX_POLARITY).length >= 60) ? T.HEX_POLARITY : null
const kHexOrder = (T.HEX_ORDER && typeof T.HEX_ORDER === 'object' && Object.keys(T.HEX_ORDER).length >= 60) ? T.HEX_ORDER : null
const polarityOf = (name) => {
  const v = kHexPol?.[name]
  return Number.isFinite(v) ? v : (L_HEX_POL[name] ?? 0)
}
const orderOf = (name) => {
  const v = kHexOrder?.[name]
  return Number.isFinite(v) ? v : (L_HEX_ORDER[name] ?? 0)
}

/**
 * 京房八宫卦次：本宫 → 一世 → 二世 → 三世 → 四世 → 五世 → 游魂 → 归魂。
 * 生成规则（**由本宫卦逐爻变出**，非查表抄录）：
 *   一世变初爻、二世再变二爻、三世再变三爻、四世再变四爻、五世再变五爻；
 *   游魂自五世卦**复变四爻**；归魂自游魂卦**复变初二三爻**（还归本宫下卦）。
 * cite: 《京房易传》八宫卦次；《火珠林》「一世二世三世四世五世游魂归魂」；
 *       与 core/tables.js PALACES 对拍一致（见 docs/verification/yijing.md）。
 */
const PALACE_HEAD = ['乾', '坎', '艮', '震', '巽', '离', '坤', '兑']
const PALACE_STAGE_SHI = [6, 1, 2, 3, 4, 5, 4, 3]
const PALACE_STAGE_NAME = ['本宫', '一世', '二世', '三世', '四世', '五世', '游魂', '归魂']
const flipAt = (bits, idxs) => bits.map((v, i) => (idxs.includes(i) ? 1 - v : v))
const PALACE_MAP = (() => {
  const out = {}
  for (const head of PALACE_HEAD) {
    const b = tri(head).bits.slice()
    const six = [...b, ...b]   // 本宫卦（八纯卦）六爻 = 八卦自重
    const seq = [
      six.slice(),
      flipAt(six, [0]),
      flipAt(six, [0, 1]),
      flipAt(six, [0, 1, 2]),
      flipAt(six, [0, 1, 2, 3]),
      flipAt(six, [0, 1, 2, 3, 4]),
      flipAt(flipAt(six, [0, 1, 2, 3, 4]), [3]),
      flipAt(flipAt(flipAt(six, [0, 1, 2, 3, 4]), [3]), [0, 1, 2]),
    ]
    seq.forEach((bits, i) => {
      const up = triNameOfBits(bits.slice(3, 6))
      const lo = triNameOfBits(bits.slice(0, 3))
      const name = L_HEX_BY_NAME[up]?.[lo]
      if (!name) return
      out[name] = { palace: head, index: i, stage: PALACE_STAGE_NAME[i], shi: PALACE_STAGE_SHI[i], headBits: six.slice() }
    })
  }
  return out
})()

/**
 * 卦名 → 八宫位次（世应）。
 * 优先用 kernel-tables 的 `SHI_YING_BY_HEX`（跨族一致），形状不合再落族内**生成式**表。
 * @param {string} name 卦名。
 * @returns {{palace:string,index:number,stage:string,shi:number,ying:number,headBits:number[]}}
 */
function palaceOf(name) {
  const lp = PALACE_MAP[name]
  const kp = T.SHI_YING_BY_HEX?.[name]
  const okKp = kp && typeof kp.palace === 'string' && TRI_BY_NAME[kp.palace]
    && Number.isFinite(kp.shi) && kp.shi >= 1 && kp.shi <= 6
  if (okKp) {
    const shi = kp.shi
    const ying = Number.isFinite(kp.ying) && kp.ying >= 1 && kp.ying <= 6 ? kp.ying : mod(shi - 1 + 3, 6) + 1
    return {
      palace: kp.palace,
      index: Number.isFinite(kp.index) ? kp.index : (lp?.index ?? 0),
      stage: typeof kp.stage === 'string' && kp.stage ? kp.stage : (lp?.stage ?? PALACE_STAGE_NAME[kp.index] ?? '本宫'),
      shi, ying,
      headBits: tri(kp.palace).bits.slice(),
    }
  }
  if (lp) return { ...lp, ying: mod(lp.shi - 1 + 3, 6) + 1 }
  return { palace: '乾', index: 0, stage: '本宫', shi: 6, ying: 3, headBits: tri('乾').bits.slice() }
}

/** 卦之五行 = 所属宫之五行。cite: 《京房易传》八宫五行。 */
const hexWuxing = (name) => tri(palaceOf(name).palace).wx

/**
 * 京房纳甲：内卦（初二三）/外卦（四五六）地支与天干。
 * cite: 《京房易传》纳甲法；《增删卜易·卷首·纳甲例》；《卜筮正宗·纳甲》。
 *       甲/壬配乾、乙/癸配坤、戊配坎、己配离、丙配艮、丁配兑、庚配震、辛配巽。
 */
const NAJIA = {
  乾: { inner: ['子', '寅', '辰'], outer: ['午', '申', '戌'], iGan: '甲', oGan: '壬' },
  坎: { inner: ['寅', '辰', '午'], outer: ['申', '戌', '子'], iGan: '戊', oGan: '戊' },
  艮: { inner: ['辰', '午', '申'], outer: ['戌', '子', '寅'], iGan: '丙', oGan: '丙' },
  震: { inner: ['子', '寅', '辰'], outer: ['午', '申', '戌'], iGan: '庚', oGan: '庚' },
  巽: { inner: ['丑', '亥', '酉'], outer: ['未', '巳', '卯'], iGan: '辛', oGan: '辛' },
  离: { inner: ['卯', '丑', '亥'], outer: ['酉', '未', '巳'], iGan: '己', oGan: '己' },
  坤: { inner: ['未', '巳', '卯'], outer: ['丑', '亥', '酉'], iGan: '乙', oGan: '癸' },
  兑: { inner: ['巳', '卯', '丑'], outer: ['亥', '酉', '未'], iGan: '丁', oGan: '丁' },
}

/** 六神起点（甲乙青龙、丙丁朱雀、戊勾陈、己螣蛇、庚辛白虎、壬癸玄武）。cite: 《增删卜易·六神》。 */
const LIUSHEN = ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武']
const LIUSHEN_START = { 甲: 0, 乙: 0, 丙: 1, 丁: 1, 戊: 2, 己: 3, 庚: 4, 辛: 4, 壬: 5, 癸: 5 }

/** 六亲（以宫五行为我）。cite: 《增删卜易·六亲》。 */
function liuQinOf(me, other) {
  if (me === other) return '兄弟'
  if (SHENG[me] === other) return '子孙'
  if (SHENG[other] === me) return '父母'
  if (KE[me] === other) return '妻财'
  return '官鬼'
}

/** 进神/退神（同五行相临）。cite: 《增删卜易·进神退神》；四生四正（亥子·寅卯·巳午·申酉）四源一致（spec §C5）。 */
const JINSHEN = { 寅: '卯', 巳: '午', 申: '酉', 亥: '子', 丑: '辰', 辰: '未', 未: '戌', 戌: '丑' }
const TUISHEN = Object.fromEntries(Object.entries(JINSHEN).map(([a, b]) => [b, a]))

/**
 * 土爻（辰戌丑未）化进/化退开关。
 * **默认 false（关闭）**：spec §C5【D·存疑】——4 个独立实现给出 4 种互不相同的四土进退说法
 * （R1 循环 丑→辰→未→戌→丑；R3 皆归戌；R4 辰→丑、未→戌；R5 戌→未、丑→辰），
 * 无法从来源内部裁决。四生四正（亥→子、寅→卯、巳→午、申→酉）四源完全一致，照常判定。
 * 开启时采用 R1 的四土循环（本插件不声称其为定论，输出改标「存疑-已启用」）。
 */
const TUXI_JINSHEN_ENABLED = false
/** 土爻之支。 */
const TU_ZHI = ['辰', '戌', '丑', '未']

/** 三合局。cite: spec §C8（R1/R3/R5 三源一致）。申子辰水、亥卯未木、寅午戌火、巳酉丑金。 */
const SANHE = [
  { ju: '水', zhis: ['申', '子', '辰'] }, { ju: '木', zhis: ['亥', '卯', '未'] },
  { ju: '火', zhis: ['寅', '午', '戌'] }, { ju: '金', zhis: ['巳', '酉', '丑'] },
]

/** 地支六合对。cite: spec §C8（R1/R2/R4/R5 一致）：子丑·寅亥·卯戌·辰酉·巳申·午未。 */
const LIUHE_PAIRS = { 子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯', 辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午' }

/**
 * 六冲卦 / 六合卦 **golden 名单**——**只用于回归对拍**（见 docs/verification/yijing.md），
 * 运行时一律按「初-四、二-五、三-上三对纳甲地支皆冲/皆合」现算（spec §Z3 第 4 条：
 * 硬编码名单正是 repo4 出错的原因）。
 * cite: spec §C8【A·已验证】——六冲恰 10 卦（八纯卦 + 天雷无妄 + 雷天大壮），六合恰 8 卦。
 */
const LIUCHONG_GUA_GOLDEN = ['乾为天', '坤为地', '震为雷', '巽为风', '坎为水', '离为火', '艮为山', '兑为泽', '天雷无妄', '雷天大壮']
const LIUHE_GUA_GOLDEN = ['地天泰', '天地否', '雷地豫', '地雷复', '泽水困', '水泽节', '火山旅', '山火贲']

/**
 * 运行时判定整卦的六冲/六合（纳甲三对穷举）。
 * @param {object} g 装卦结果（`zhuangGua` 产物）。
 * @returns {'六冲卦'|'六合卦'|''} 判定。
 */
function chongHeOf(g) {
  if (!g || !Array.isArray(g.lines) || g.lines.length < 6) return ''
  let chong = true; let he = true
  for (let i = 0; i < 3; i += 1) {
    const a = g.lines[i].zhi; const b = g.lines[i + 3].zhi
    if (ZHI_LIUCHONG[a] !== b) chong = false
    if (LIUHE_PAIRS[a] !== b) he = false
  }
  if (chong) return '六冲卦'
  if (he) return '六合卦'
  return ''
}

/** 变卦合冲四态。cite: spec §C8（R1 `hexagramPatternTransition` 四态枚举）。 */
function chongHeTransition(before, after) {
  if (before === '六冲卦' && after === '六合卦') return '六冲变六合：先散后聚'
  if (before === '六合卦' && after === '六冲卦') return '六合变六冲：先合后散'
  if (before === '六冲卦' && after === '六冲卦') return '六冲变六冲：彻底散'
  if (before === '六合卦' && after === '六合卦') return '六合变六合：顺利持久'
  return ''
}

/** 十二消息卦（十二辟卦）配月建。cite: 《周易》十二辟卦；《皇极经世》以十二会配之。 */
const XIAOXI_BY_ZHI = {
  子: '地雷复', 丑: '地泽临', 寅: '地天泰', 卯: '雷天大壮', 辰: '泽天夬', 巳: '乾为天',
  午: '天风姤', 未: '天山遁', 申: '天地否', 酉: '风地观', 戌: '山地剥', 亥: '坤为地',
}

/**
 * 太玄数（玄空/择日家通用）。cite: 《太玄经》数「甲己子午九、乙庚丑未八、丙辛寅申七、
 * 丁壬卯酉六、戊癸辰戌五、巳亥单四」。
 */
const TAIXUAN_NUM_GAN = { 甲: 9, 己: 9, 乙: 8, 庚: 8, 丙: 7, 辛: 7, 丁: 6, 壬: 6, 戊: 5, 癸: 5 }
const TAIXUAN_NUM_ZHI = { 子: 9, 午: 9, 丑: 8, 未: 8, 寅: 7, 申: 7, 卯: 6, 酉: 6, 辰: 5, 戌: 5, 巳: 4, 亥: 4 }
/** 太玄八十一首名（内核表优先，缺位用族内兜底）。cite: 《太玄经》八十一首。 */
const L_TAIXUAN_81 = ('中 周 礥 闲 少 戾 上 干 𤕠 羡 差 童 增 锐 达 交 䎡 徯 从 进 释 格 夷 乐 争 务 事 更 断 毅 装 众 密 亲 敛 强 睟 盛 居 法 应 迎 遇 灶 大 廓 文 礼 逃 唐 常 度 永 昆 减 唫 守 翕 聚 积 饰 疑 视 沈 内 去 晦 瞢 穷 割 止 坚 成 致 失 剧 驯 将 难 勤 养').split(' ')
const TAIXUAN_81 = (Array.isArray(T.TAIXUAN_81) && T.TAIXUAN_81.length === 81) ? T.TAIXUAN_81 : L_TAIXUAN_81

/** 归藏/元包八卦次序：坤、乾、兑、艮、离、坎、巽、震（以坤为首）。cite: 《归藏》佚文；卫元嵩《元包》以坤为首。 */
const YUANBAO_ORDER = ['坤', '乾', '兑', '艮', '离', '坎', '巽', '震']

/** 灵棋经：十二棋分上四/中四/下四三组，正为阳、反为阴。cite: 《灵棋经》「十二棋，上中下各四」。 */
const LINGQI_GROUPS = [
  { pos: '上四', xiang: '天·君·父·外·远', weight: 1.35 },
  { pos: '中四', xiang: '人·己·事·中', weight: 1.0 },
  { pos: '下四', xiang: '地·臣·子·内·近', weight: 0.8 },
]

/** 说卦传类象（外应/大象取象用）。cite: 《周易·说卦传》。 */
const XIANG_KEYWORD = [
  { re: /天|日|晴|马|父|君|西北|头|首|金玉|圆/, tri: '乾' },
  { re: /泽|雨|口|舌|少女|西|羊|悦|笑|歌|碎|缺|毁|金属/, tri: '兑' },
  { re: /火|灯|光|电|目|眼|中女|南|雉|文书|礼|热|红/, tri: '离' },
  { re: /雷|震|声|响|长男|东|龙|足|车|动|惊/, tri: '震' },
  { re: /风|气|长女|东南|鸡|股|绳|木|入|香/, tri: '巽' },
  { re: /水|雨|河|中男|北|豕|耳|陷|险|寒|血|泪|夜/, tri: '坎' },
  { re: /山|石|门|狗|少男|东北|手|止|阻|坟|寺|楼/, tri: '艮' },
  { re: /地|土|母|牛|西南|腹|众|田|布|方|厚/, tri: '坤' },
]

// ═════════════════════════ 2. 盘基取数（全部可选链） ═════════════════════════

/** 月令五行（取月支五行，六爻「月建」正统口径；人元司令只作 detail 参考）。 */
const monthWxOf = (chart) => chart?.monthWx ?? ZHI_WUXING[chart?.monthZhi] ?? '土'
/** 日辰五行。 */
const dayWxOf = (chart) => ZHI_WUXING[chart?.dayZhi] ?? '土'
/** 年支序 1..12。 */
const yearZhiNum = (chart) => mod(ZHI.indexOf(chart?.yearZhi ?? '子'), 12) + 1
/** 时支序 1..12。 */
const hourZhiNum = (chart) => mod(ZHI.indexOf(chart?.hourZhi ?? '子'), 12) + 1
/** 农历月（闰月为负，取绝对值）。 */
const lunarMonth = (chart) => {
  const m = Number(chart?.lunar?.month)
  return Number.isFinite(m) && m !== 0 ? Math.abs(Math.round(m)) : 1
}
/** 农历日。 */
const lunarDay = (chart) => {
  const d = Number(chart?.lunar?.day)
  return Number.isFinite(d) && d > 0 ? Math.round(d) : 1
}
/**
 * 旬空两支。
 * 优先用历法层/kernel 给出的值；两者皆缺时按六十甲子闭式自算。
 * 闭式（本族实算）：日干支在六十甲子中序号 i ≡ gi (mod 10)、i ≡ zi (mod 12)，旬首为 i − gi，
 * 故**旬首之支序 = (zi − gi) mod 12**，空亡即其后两位。
 * ⚠ 不可用 `min(gi, zi)` 退位：那只在 gi ≤ zi 时正确，六十甲子中有 20/60 会算错
 *    （例：丙子 gi=2>zi=0，退位得「丙子」而非旬首「甲戌」，旬空应变申酉而非戌亥）。
 * cite: spec §C7【A·已验证·3 源一致】旬空闭式与六旬表（甲子旬戌亥、甲戌旬申酉…）。
 * @param {object} chart 盘基。
 * @returns {string[]} 两个空亡地支。
 */
function kongOf(chart) {
  const d = chart?.xunKong?.day
  if (typeof d === 'string' && d.length >= 2) return [d[0], d[1]]
  const k = chart?.xun?.kong
  if (Array.isArray(k) && k.length >= 2) return [String(k[0]), String(k[1])]
  const gz = chart?.ganzhi?.day
  if (typeof gz === 'string' && gz.length === 2) {
    const gi = GAN.indexOf(gz[0]); const zi = ZHI.indexOf(gz[1])
    if (gi >= 0 && zi >= 0) {
      const xunZhi = mod(zi - gi, 12)
      return [ZHI[mod(xunZhi + 10, 12)], ZHI[mod(xunZhi + 11, 12)]]
    }
  }
  return []
}
/** 节气名（应期措辞用）。 */
const jieqiOf = (chart) => chart?.jieqi?.next || chart?.jieqi?.current || chart?.jieqi?.prev || ''

/** 爻支旬空判定：优先 kernel `isKong`，缺位用族内数组判定。 */
function isKongZhi(zhi, kong) {
  if (typeof T.isKong === 'function') {
    try {
      const r = T.isKong(zhi, kong)
      if (typeof r === 'boolean') return r
    } catch { /* 落本地 */ }
  }
  return Array.isArray(kong) ? kong.includes(zhi) : false
}

/** 建破：优先 kernel `jianPoOf(zhi, 月支, 日支)`。cite: 《增删卜易》月建·月破·日建·日破。 */
function jianPoOf(zhi, monthZhi, dayZhi) {
  if (typeof T.jianPoOf === 'function') {
    try {
      const r = T.jianPoOf(zhi, monthZhi, dayZhi)
      if (Array.isArray(r) && r.every((x) => typeof x === 'string')) return r
    } catch { /* 落本地 */ }
  }
  const out = []
  if (zhi && zhi === monthZhi) out.push('月建')
  if (zhi && ZHI_LIUCHONG[zhi] === monthZhi) out.push('月破')
  if (zhi && zhi === dayZhi) out.push('日建')
  if (zhi && ZHI_LIUCHONG[zhi] === dayZhi) out.push('日破')
  return out
}

/** 三合局表：优先 kernel `SANHE_GROUPS`。 */
const SANHE_LIST = (() => {
  const k = T.SANHE_GROUPS
  if (k && typeof k === 'object') {
    const list = Object.entries(k)
      .filter(([, zs]) => Array.isArray(zs) && zs.length === 3)
      .map(([ju, zhis]) => ({ ju, zhis: zhis.slice() }))
    if (list.length === 4) return list
  }
  return SANHE
})()

/** kernel 标 `verified: 'partial'` 的神煞（诸本有异）——输出须如实标注。 */
const PARTIAL_SHENSHA = (() => {
  const all = T.SHENSHA_ALL
  if (!all || typeof all !== 'object') return new Set(['羊刃', '国印贵人', '红艳煞', '六厄', '天医'])
  return new Set(Object.entries(all)
    .filter(([, v]) => v && typeof v === 'object' && v.verified && v.verified !== 'yes')
    .map(([k]) => k))
})()

/**
 * 爻支所带神煞（用 `chart.shenshaAll`；kernel-astro 产物，缺位则空）。
 * `chart.shenshaAll = { 神煞名: ['年','月','日','时'] }` —— 按「哪个柱带此神煞」查，
 * 不把月支类神煞套到别的柱上（kernel-tables 已按基准柱算好）。
 * @param {object} chart 盘基。
 * @param {string} zhi 爻支。
 * @returns {{hits:string[], partial:string[]}} 命中之神煞。
 */
function shenshaOfZhi(chart, zhi) {
  const all = chart?.shenshaAll
  if (!all || typeof all !== 'object' || !zhi) return { hits: [], partial: [] }
  const pillarZhi = { 年: chart?.yearZhi, 月: chart?.monthZhi, 日: chart?.dayZhi, 时: chart?.hourZhi }
  const hits = []
  for (const [name, pillars] of Object.entries(all)) {
    if (!Array.isArray(pillars)) continue
    if (pillars.some((p) => pillarZhi[p] === zhi)) hits.push(name)
  }
  return { hits, partial: hits.filter((n) => PARTIAL_SHENSHA.has(n)) }
}

/** 神煞文本（partial 者加 ⚠ 标注）。 */
function shenshaText(chart, zhi) {
  const { hits, partial } = shenshaOfZhi(chart, zhi)
  if (hits.length === 0) return ''
  return hits.map((n) => (partial.includes(n) ? `${n}(⚠诸本有异)` : n)).join('、')
}

/** 四柱天干地支。 */
function pillarsOf(chart) {
  const gz = chart?.ganzhi ?? {}
  const list = [gz.year, gz.month, gz.day, gz.hour].map((s) => (typeof s === 'string' && s.length === 2 ? s : ''))
  return list
}

// ═════════════════════════ 3. 起卦原语 ═════════════════════════

/** 揲四取余（余 0 作 4）。 */
const rm4 = (n) => (n % 4 === 0 ? 4 : n % 4)

/**
 * 大衍筮法 · 一变：分二 → 挂一 → 揲四 → 归奇。
 * cite: 《周易·系辞上》「大衍之数五十，其用四十有九。分而为二以象两，挂一以象三，
 *       揲之以四以象四时，归奇于扐以象闰」；《易学启蒙·明蓍策》。
 * @param {number} sticks 本变可用策数。
 * @param {object} rand 确定性随机源。
 * @returns {object} 本变明细。
 */
function yarrowChange(sticks, rand) {
  const before = sticks
  const left = 1 + rand.below(Math.max(1, sticks - 2))
  const right = Math.max(0, before - left - 1)
  const rl = rm4(left)
  const rr = right === 0 ? 0 : rm4(right)
  const take = rl + rr + 1
  return { 策前: before, 左: left, 右: right, 挂一: 1, 左余: rl, 右余: rr, 归奇: take, 策后: before - take }
}

/**
 * 大衍筮法 · 三变成一爻（十八变成卦）。
 * 第一变归奇 5 或 9 → 余 44 或 40；二三变归奇 4 或 8 → 末得 36/32/28/24，除以四得 9/8/7/6。
 * @returns {{value:number, sticks:number, steps:object[]}} 爻值与本爻三变明细。
 */
function yarrowLine(rand) {
  let sticks = 49
  const steps = []
  for (let k = 0; k < 3; k += 1) {
    const st = yarrowChange(sticks, rand)
    steps.push({ 变: k + 1, ...st })
    sticks = st.策后
  }
  const value = Math.round(sticks / 4)
  return { value: [6, 7, 8, 9].includes(value) ? value : 8, sticks, steps }
}

/**
 * 大衍概率：通例值 vs 本法（真摸蓍草）的**精确分布**。
 * cite: 《易学启蒙·明蓍策》三变成爻之数；通例概率 老阳3/16、少阴7/16、少阳5/16、老阴1/16。
 *
 * 本法为真离散模拟（分二均匀、挂一、揲四、归奇），其精确分布可由 DP 求得：
 * - 第一变：去五（→44 策）概率 36/47、去九（→40 策）概率 11/47（L 均匀取 1..47，仅 L≡0 mod 4 那 11 例去九）；
 * - 第 N 变：去四之概率 = #{L∈[1,S−2] : L mod 4 ∈ {1,2}} / (S−2)，S=44→11/21、40→10/19、36→9/17、32→8/15（≈0.524–0.533，**并非恰好 1/2**）；
 * - 三变合成：老阳 36 策 21.117%、少阴 32 策 44.836%、少阳 28 策 28.874%、老阴 24 策 5.174%。
 * 折 16 为 3.379 : 7.174 : 4.620 : 0.828，与经典化约 3:7:5:1 一致而**不完全相等**——差额来自
 * 有限堆数的余数效应（经典值隐含「去四/去八各半」的理想化）。20 万次实测复核落在该精确值上（见 docs/verification/yijing.md）。
 */
const DAYAN_PROB = [
  { 爻值: 9, 名: '老阳（重·动）', 策: 36, 通例概率: '3/16 = 0.1875', 本法精确概率: '21.117%（3.379/16）' },
  { 爻值: 8, 名: '少阴（拆）', 策: 32, 通例概率: '7/16 = 0.4375', 本法精确概率: '44.836%（7.174/16）' },
  { 爻值: 7, 名: '少阳（单）', 策: 28, 通例概率: '5/16 = 0.3125', 本法精确概率: '28.874%（4.620/16）' },
  { 爻值: 6, 名: '老阴（交·动）', 策: 24, 通例概率: '1/16 = 0.0625', 本法精确概率: '5.174%（0.828/16）' },
]

/**
 * 金钱卦 · 掷一爻（三枚铜钱）。
 * cite: 《火珠林》以钱代蓍；《增删卜易·以钱代蓍法》——背为阳面，三背为重(老阳9)、
 *       两背为拆(少阴8)、一背为单(少阳7)、三字为交(老阴6)。
 * @returns {{value:number, backs:number, faces:string[]}} 爻值、背数与三枚钱面。
 */
function coinLine(rand) {
  const faces = [rand.chance(0.5), rand.chance(0.5), rand.chance(0.5)]
  const backs = faces.filter(Boolean).length
  return { value: 6 + backs, backs, faces: faces.map((f) => (f ? '背' : '字')) }
}

/** 爻值 → 阴阳（1 阳 / 0 阴）。 */
const bitOf = (v) => (v === 7 || v === 9 ? 1 : 0)
/** 爻值 → 是否动爻。 */
const isMoving = (v) => v === 6 || v === 9

/**
 * 六爻掷卦（蓍草或金钱），支持 `chart.coins` 回放。
 * @returns {{values:number[], bits:number[], changed:number[], moving:number[], tosses:object[], replay:boolean}}
 */
function castSix(rand, method, coins) {
  const canReplay = Array.isArray(coins) && coins.length >= 6 && coins.slice(0, 6).every((v) => [6, 7, 8, 9].includes(Number(v)))
  const values = []; const tosses = []
  for (let i = 0; i < 6; i += 1) {
    if (canReplay) {
      values.push(Number(coins[i]))
      tosses.push({ 位: i + 1, 回放: true })
    } else if (method === 'yarrow') {
      const y = yarrowLine(rand)
      values.push(y.value)
      tosses.push({ 位: i + 1, 得策: y.sticks, 变: y.steps })
    } else {
      const c = coinLine(rand)
      values.push(c.value)
      tosses.push({ 位: i + 1, 钱面: c.faces.join(''), 背数: c.backs })
    }
  }
  const bits = values.map(bitOf)
  const changed = bits.map((b, i) => (isMoving(values[i]) ? 1 - b : b))
  const moving = values.map((v, i) => (isMoving(v) ? i + 1 : 0)).filter((x) => x > 0)
  return { values, bits, changed, moving, tosses, replay: canReplay }
}

/** 余 0 作 8（梅花上/下卦）。 */
const m8 = (n) => { const r = mod(Math.round(n), 8); return r === 0 ? 8 : r }
/** 余 0 作 6（动爻）。 */
const m6 = (n) => { const r = mod(Math.round(n), 6); return r === 0 ? 6 : r }

/**
 * 由三数起卦（梅花通用）。
 * cite: 《梅花易数·卷三》「以数起卦」——上卦数除八取余、下卦数除八取余、动爻数除六取余，余零作八/六。
 */
function guaFromNumbers(a, b, c) {
  const upN = m8(a); const loN = m8(b); const mv = m6(c)
  const upT = TRI.find((t) => t.xian === upN) ?? TRI[0]
  const loT = TRI.find((t) => t.xian === loN) ?? TRI[0]
  const bits = [...loT.bits, ...upT.bits]
  const changed = bits.slice()
  changed[mv - 1] = 1 - changed[mv - 1]
  return { bits, changed, movePos: mv, upN, loN, upT, loT }
}

/** 互卦：二三四爻为下卦、三四五爻为上卦。cite: 《梅花易数·互卦》。 */
const huGua = (bits) => [bits[1], bits[2], bits[3], bits[2], bits[3], bits[4]]
/** 错卦（六爻全变，即反对之象）。 */
const cuoGua = (bits) => bits.map((b) => 1 - b)
/** 综卦（六爻倒置，即反易之象）。 */
const zongGua = (bits) => bits.slice().reverse()

/** 六爻 → 卦信息（全部走族内表，永不抛）。 */
function hexInfoOf(bits) {
  const b = Array.isArray(bits) ? bits.slice(0, 6).map((x) => (x ? 1 : 0)) : []
  while (b.length < 6) b.push(0)
  const upper = triNameOfBits(b.slice(3, 6))
  const lower = triNameOfBits(b.slice(0, 3))
  const name = L_HEX_BY_NAME[upper]?.[lower] ?? '—'
  return {
    name,
    order: orderOf(name),
    upper,
    lower,
    upperWx: tri(upper).wx,
    lowerWx: tri(lower).wx,
    polarity: polarityOf(name),
    wuxing: hexWuxing(name),
    bits: b,
    lines: b.map((x) => (x ? '—' : '- -')).reverse().join(' '),
  }
}

/**
 * 体用：**动爻所在之卦为用，不动之卦为体**。
 * cite: 《梅花易数·体用总诀》「体为己身之兆，用为应事之端」；动爻在下卦则下卦为用。
 */
function tiYongOf(bits, movePos) {
  const pos = movePos >= 1 && movePos <= 6 ? movePos : 1
  const loName = triNameOfBits(bits.slice(0, 3))
  const upName = triNameOfBits(bits.slice(3, 6))
  const ti = pos <= 3 ? upName : loName
  const yong = pos <= 3 ? loName : upName
  const tiWx = tri(ti).wx; const yongWx = tri(yong).wx
  const rel = relation(tiWx, yongWx)
  const score = { 生我: 70, 比和: 45, 我克: 25, 我生: -15, 克我: -75 }[rel] ?? 0
  return {
    ti, yong, tiWx, yongWx, rel, score, pos,
    posName: POS_NAMES[pos - 1],
    rule: '动爻所在之卦为用、不动之卦为体；用生体最吉、体用比和次吉、体克用小吉、体生用小凶、用克体大凶',
  }
}

/** 体用断语。cite: 《梅花易数·体用生克篇》。 */
const TIYONG_JUDGE = {
  生我: '用生体，得外力之助，事顺而成，大吉',
  比和: '体用比和，谋事顺遂而稍缓，吉',
  我克: '体克用，我能制事，事可成而须用力，小吉',
  我生: '体生用，耗我之力以应外事，小凶',
  克我: '用克体，事来克我，力不从心，大凶',
}

// ═════════════════════════ 4. 六爻装卦（完整） ═════════════════════════

/**
 * 完整装卦：八宫归属 → 世应 → 纳甲干支 → 六亲 → 六神 → 旬空 → 月建日辰旺衰。
 * cite: 《京房易传》纳甲世应；《增删卜易·卷首》装卦例；《卜筮正宗》六亲六神。
 * @param {number[]} bits 六爻（自下而上）。
 * @param {object} chart 盘基。
 * @param {object} [over] 覆盖项（如强制用某宫）。 
 * @returns {object} 装卦结果。
 */
function zhuangGua(bits, chart, over = {}) {
  const info = hexInfoOf(bits)
  const pal = over.palaceInfo ?? palaceOf(info.name)
  const meWx = tri(pal.palace).wx
  const nl = NAJIA[info.lower] ?? NAJIA['乾']
  const nu = NAJIA[info.upper] ?? NAJIA['乾']
  const zhis = [...nl.inner, ...nu.outer]
  const gans = [nl.iGan, nl.iGan, nl.iGan, nu.oGan, nu.oGan, nu.oGan]
  const dayGan = chart?.dayGan ?? ''
  const start = LIUSHEN_START[dayGan] ?? 0
  const kong = kongOf(chart)
  const mZhi = chart?.monthZhi ?? ''
  const dZhi = chart?.dayZhi ?? ''
  const mWx = monthWxOf(chart)
  const dWx = dayWxOf(chart)
  const shiPos = over.shiPos ?? pal.shi
  const yingPos = mod(shiPos - 1 + 3, 6) + 1
  const lines = zhis.map((z, i) => {
    const wx = ZHI_WUXING[z] ?? '土'
    const ws = wangShuai(wx, mWx)
    const riRel = relation(dWx, wx)
    const jp = jianPoOf(z, mZhi, dZhi)
    const yueChong = jp.includes('月破')
    const riChong = jp.includes('日破')
    const linYue = jp.includes('月建')
    const linRi = jp.includes('日建')
    const isKong = isKongZhi(z, kong)
    const ssha = shenshaOfZhi(chart, z)
    /** 爻之力量（本插件通例权重，可改）：月令六成 + 临建/临日 + 日辰生克 − 月破/日破/空亡。 */
    const power = (ws.score - 55) * 0.6
      + (linYue ? 18 : 0) + (linRi ? 16 : 0)
      + (riRel === '生我' ? 12 : riRel === '比和' ? 8 : riRel === '克我' ? -14 : 0)
      - (yueChong ? 22 : 0) - (riChong ? 12 : 0) - (isKong ? 18 : 0)
    return {
      pos: i + 1,
      posName: POS_NAMES[i],
      yang: bits[i] === 1,
      gan: gans[i],
      zhi: z,
      gz: gans[i] + z,
      wuxing: wx,
      qin: liuQinOf(meWx, wx),
      shen: LIUSHEN[mod(start + i, 6)],
      isShi: i + 1 === shiPos,
      isYing: i + 1 === yingPos,
      kong: isKong,
      yueChong,
      riChong,
      linYue,
      linRi,
      jianPo: jp,
      shensha: ssha.hits,
      shenshaPartial: ssha.partial,
      wangShuai: ws.state,
      riRel,
      power: Math.round(power * 10) / 10,
    }
  })
  return {
    ...info, bits: bits.slice(),
    palace: pal.palace, stage: pal.stage, palaceIndex: pal.index,
    meWx, shiPos, yingPos, lines, kong, monthZhi: mZhi, dayZhi: dZhi, monthWx: mWx, dayWx: dWx,
    headBits: pal.headBits ?? tri(pal.palace).bits.slice(),
  }
}

/** 一行装卦文本。 */
function lineText(g, i, values, changedZhi) {
  const l = g.lines[i]
  const v = Array.isArray(values) ? values[i] : null
  const flags = []
  if (l.isShi) flags.push('世')
  if (l.isYing) flags.push('应')
  if (isMoving(v)) flags.push(v === 9 ? '○老阳动' : '×老阴动')
  if (l.kong) flags.push('旬空')
  if (l.yueChong) flags.push('月破')
  if (l.riChong) flags.push('日破')
  if (l.linRi) flags.push('临日')
  if (l.linYue) flags.push('临月')
  const bian = changedZhi ? ` →变${changedZhi}` : ''
  return `${l.posName}爻 ${l.yang ? '阳' : '阴'} ${l.gan}${l.zhi}${l.wuxing} ${l.qin} ${l.shen}${flags.length ? ' [' + flags.join(' ') + ']' : ''}${bian}`
}

/** 用神取象。 */
const YONGSHEN_RULES = [
  {
    god: '妻财',
    kw: ['财', '钱', '投资', '生意', '买卖', '回款', '收入', '工资', '奖金', '价格', '股票', '基金', '债', '赚', '亏', '利', '资产', '订单', '客户', '货', '打款', '报价', '存', '屋租', '租金'],
    why: '占求财、买卖、货物、妻妾、仆役，以妻财为用神',
  },
  {
    god: '官鬼',
    kw: ['工作', '事业', '官职', '升职', '职位', '功名', '名次', '诉讼', '官司', '官', '上司', '领导', '鬼', '邪', '贼', '盗', '小人是非', '录用', '面试', '考公', '公职', '调动', '丈夫'],
    why: '占功名、官讼、疾病之忧、盗贼、夫（女占），以官鬼为用神',
  },
  {
    god: '父母',
    kw: ['房', '宅', '屋', '文书', '合同', '学业', '考试', '学位', '文章', '学校', '父母', '长辈', '车', '船', '消息', '信', '证件', '手续', '批', '保险', '契', '书', '邮', '籍'],
    why: '占父母长辈、文书契约、房产车船、学业考试、音信，以父母为用神',
  },
  {
    god: '子孙',
    kw: ['子', '女', '孕', '生育', '健康', '平安', '福', '药', '医', '医', '解', '顺', '晚辈', '学生', '徒弟', '宠物', '免灾', '和解', '出狱', '僧', '道', '喜'],
    why: '占子孙晚辈、医药、福解忧患、僧道，以子孙为用神',
  },
  {
    god: '兄弟',
    kw: ['兄弟', '朋友', '同行', '同辈', '同事', '同学', '姐妹', '合伙', '合作方', '竞争', '对手', '分家', '破财', '口舌'],
    why: '占兄弟同辈、朋友竞争、合伙分财，以兄弟为用神',
  },
]

/**
 * 按所问事类取用神。
 *
 * 三级取用（**先跨族一致、后族内细分**）：
 * 1. `SELF_GOD_TOPICS`：用神旺衰方向与吉凶**相反**或需以「己身」为主的事类
 *    （疾病/健康/官讼/诉讼/盗贼/谈判）→ 一律取**世爻**为用神，另立 `alt` 记病神/官府/贼/对方，
 *    避免「官鬼旺＝病重」被当吉断的方向性错误；
 * 2. kernel-tables `YONGSHEN`（28 事类，键由 `aggregate.detectTopic` 给出）→ 与其余 7 族同源；
 * 3. 族内关键词表（事类归「综合」时补足细分）。
 *
 * cite: 《增删卜易·用神章》「凡占某事，即取某事之用神」；《卜筮正宗·用神问答》；
 *       婚姻：男占以妻财为妻、女占以官鬼为夫（《增删卜易·婚姻章》）。
 * @param {object} chart 盘基。
 * @returns {{god:string, why:string, cite:string, alt?:string|null, topic?:string}} 用神。
 */
const SELF_GOD_TOPICS = {
  疾病: { alt: '官鬼', why: '占自身之病以世爻为用神；官鬼为病神、子孙为医药（鬼旺反主病重，故不以鬼为吉凶用神）' },
  健康: { alt: '官鬼', why: '占自身之疾以世爻为用神；官鬼为病神、子孙为医药（鬼旺反主病重）' },
  官讼: { alt: '官鬼', why: '占讼以世爻为己身、应爻为对方、官鬼为官府（世克应则我胜）' },
  诉讼: { alt: '官鬼', why: '同词讼章：世为己、应为他、官鬼为官府' },
  盗贼: { alt: '官鬼', why: '占盗以世爻为己、官鬼为贼、子孙为捕役（鬼旺则贼势盛，故不以鬼旺为吉）' },
  谈判: { alt: '应爻', why: '占谈判以世爻为己、应爻为对方；世应生克定向背' },
}

/** 事类判定：优先 `aggregate.detectTopic`（与合盘同源），缺位落族内关键词。 */
function topicOf(chart) {
  const q = String(chart?.question ?? '')
  if (typeof A.detectTopic === 'function') {
    try {
      const r = A.detectTopic(q)
      if (r && typeof r.topic === 'string' && r.topic) return r.topic
    } catch { /* 落本地 */ }
  }
  if (/姻缘|感情|婚姻|结婚|夫妻|复合|对象/.test(q)) return '姻缘'
  if (/财|钱|投资|赚|亏|生意|买卖|收入/.test(q)) return '财运'
  if (/病|疾|健康|身体|医|痛/.test(q)) return '健康'
  if (/工作|事业|职|升|考|官/.test(q)) return '事业'
  return '综合'
}

/** `aggregate.detectTopic` 的事类名 → kernel `YONGSHEN` 键名的别名（两表键名不完全相同）。 */
const TOPIC_ALIAS = {
  姻缘: '婚姻', 感情: '感情', 财运: '财运', 事业: '事业', 健康: '疾病', 出行: '出行',
  考试: '考试', 诉讼: '官讼', 寻物: '失物', 家宅: '田宅', 孕产: '孕产', 天时: '天气', 国事: '事业',
}

/** kernel YONGSHEN 取用神（形状校验 + 事类别名；失败返回 null）。 */
function kernelUseGod(topic, gender) {
  if (typeof T.yongshenOf !== 'function') return null
  const keys = [TOPIC_ALIAS[topic], topic].filter((k, i, a) => k && a.indexOf(k) === i)
  for (const key of keys) {
    try {
      const r = T.yongshenOf(key, gender)
      if (!r || typeof r.qin !== 'string' || !r.qin) continue
      return {
        god: r.qin,
        alt: typeof r.altQin === 'string' && r.altQin ? r.altQin : null,
        why: typeof r.note === 'string' && r.note ? r.note : '依用神取象表取用神',
        cite: 'core/tables.js YONGSHEN（跨族一致）＋《增删卜易·用神章》',
        topic: key,
      }
    } catch { /* 试下一个键 */ }
  }
  return null
}

function useGodOf(chart) {
  const q = String(chart?.question ?? '')
  const gender = chart?.gender === '女' ? '女' : '男'
  const topic = topicOf(chart)
  // 1. 需以己身为主 / 用神旺衰方向与吉凶相反者
  const selfRule = SELF_GOD_TOPICS[topic]
  if (selfRule) {
    return { god: '世爻', alt: selfRule.alt, why: selfRule.why, cite: '《增删卜易·用神章》', topic }
  }
  // 1b. 族内「占自身」特例（detectTopic 可能归到别类）
  if (/出行|旅行|出差|搬迁|动身|远行/.test(q) && !topic.includes('出行')) {
    return { god: '世爻', alt: '父母', why: '占出行以世爻为己身（父母为车船行李）', cite: '《增删卜易·出行章》', topic }
  }
  // 1c. 婚姻（男占妇以妻财、女占夫以官鬼）——与 kernel 同结论，此处保底
  if (/姻缘|婚姻|结婚|嫁|娶|夫妻|对象|感情|复合|恋爱|相亲|心上人|老公|老婆|男友|女友/.test(q)) {
    const female = chart?.gender === '女'
    return {
      god: female ? '官鬼' : '妻财',
      alt: female ? '妻财' : '官鬼',
      why: female ? '女占婚姻以官鬼为夫（妻财为辅）' : '男占婚姻以妻财为妻（官鬼为辅）',
      cite: '《增删卜易·婚姻章》',
      topic,
    }
  }
  // 2. 跨族一致路径
  const k = kernelUseGod(topic, gender)
  if (k && k.god !== '世爻') return k
  // 3. 族内细分关键词
  for (const t of YONGSHEN_RULES) {
    if (t.kw.some((kw) => q.includes(kw))) return { god: t.god, alt: null, why: t.why, cite: '《增删卜易·用神章》', topic }
  }
  // 4. kernel 的「综合→世爻」或最终兜底
  if (k) return k
  return { god: '世爻', alt: null, why: '事类不明，以世爻为己身用神', cite: '《增删卜易·用神章》', topic }
}

/** 按用神名取爻（世爻特殊）。 */
function pickYong(g, god) {
  if (god === '世爻') return g.lines.find((l) => l.isShi) ?? null
  return g.lines.find((l) => l.qin === god) ?? null
}

/** 生用神之六亲 = 原神；克用神之六亲 = 忌神；生忌神且克原神者 = 仇神。cite: 《卜筮正宗·原忌仇神》。 */
function shenRoleOf(g, yongWx) {
  const names = ['兄弟', '子孙', '妻财', '官鬼', '父母']
  const byQin = {}
  for (const q of names) {
    const l = g.lines.find((x) => x.qin === q)
    if (l) byQin[q] = l
  }
  const yuan = names.find((q) => byQin[q] && relation(byQin[q].wuxing, yongWx) === '生我')
  const ji = names.find((q) => byQin[q] && relation(byQin[q].wuxing, yongWx) === '克我')
  return {
    yuan: yuan ? byQin[yuan] : null,
    ji: ji ? byQin[ji] : null,
    yuanQin: yuan ?? '',
    jiQin: ji ?? '',
    table: names.map((q) => ({ 六亲: q, 五行: byQin[q]?.wuxing ?? '不上卦', 与用神: byQin[q] ? relation(byQin[q].wuxing, yongWx) : '—' })),
  }
}

/**
 * 伏神：用神不上卦时，伏于**本宫首卦（八纯卦）**同爻位之下；本卦该位之爻为飞神。
 * 判定「缺」按**全卦六亲集合**是否出现该六亲（非按位比较）——三源一致（spec §C4）。
 * 出伏四条件：①日辰冲飞神 ②日辰值伏神 ③飞神空破 ④伏神旺相。cite: spec §C4 / 《增删卜易·伏神》。
 * @returns {object|null} 伏神盘。
 */
function fuShenOf(bits, chart, god) {
  if (god === '世爻' || !god) return null
  const g = zhuangGua(bits, chart)
  if (g.lines.some((l) => l.qin === god)) return null
  const headBits = [...g.headBits]
  const headGua = zhuangGua(headBits, chart, { palaceInfo: { palace: g.palace, index: 0, stage: '本宫', shi: 6, headBits } })
  const fu = headGua.lines.find((l) => l.qin === god)
  if (!fu) return null
  const fei = g.lines[fu.pos - 1]
  const st = feiFuState(fei.wuxing, fu.wuxing)
  const dZhi = chart?.dayZhi ?? ''
  const chongFei = ZHI_LIUCHONG[dZhi] === fei.zhi
  const zhiFu = dZhi === fu.zhi
  const feiKongPo = fei.kong || fei.yueChong || fei.riChong
  const fuWang = fu.wangShuai === '旺' || fu.wangShuai === '相'
  const ways = []
  if (chongFei) ways.push('日辰冲飞神')
  if (zhiFu) ways.push('日辰值伏神')
  if (feiKongPo) ways.push('飞神空破（伏居空地，事不待冲）')
  if (fuWang) ways.push('伏神旺相得月建生扶')
  return {
    伏神: `${fu.posName}爻 ${fu.gan}${fu.zhi}(${fu.wuxing}) ${fu.qin}`,
    飞神: `${fei.posName}爻 ${fei.gan}${fei.zhi}(${fei.wuxing}) ${fei.qin}`,
    伏飞关系: `${st.name}（${st.judge}）`,
    出伏: ways.length ? `可出伏：${ways.join('、')}` : '四条件皆未备，伏神暂难出',
    出伏条件: ways,
    应期支: ZHI_LIUCHONG[fei.zhi] ?? '',
    pos: fu.pos,
    zhi: fu.zhi,
    /* 兼容旧字段名（v1 曾用） */
    关系: st.name,
    delta: st.delta,
  }
}

/**
 * 进神/退神（动爻与其变爻同五行相临）。
 * cite: spec §C5——四生四正（亥→子、寅→卯、巳→午、申→酉）四源一致；
 *       四土（辰戌丑未）4 源 4 说，**默认不判**（见 `TUXI_JINSHEN_ENABLED`）。
 * @returns {Array<object>} 逐动爻的进退神结论。
 */
function jinTuiOf(g, changedBits, moving) {
  const out = []
  for (const p of moving) {
    const a = g.lines[p - 1]
    if (!a) continue
    const bz = changedZhiOf(g, changedBits, p)
    if (!bz) continue
    const isTu = TU_ZHI.includes(a.zhi) || TU_ZHI.includes(bz)
    if (isTu && !TUXI_JINSHEN_ENABLED) {
      out.push({ 位: a.posName, 象: '存疑', 断: `${a.zhi}化${bz}属四土进退，4 源 4 说（spec §C5【D·存疑】），本插件默认不判` })
      continue
    }
    if (JINSHEN[a.zhi] === bz) out.push({ 位: a.posName, 象: '进神', 断: `${a.zhi}化${bz}，进神，事进有力` })
    else if (TUISHEN[a.zhi] === bz) out.push({ 位: a.posName, 象: '退神', 断: `${a.zhi}化${bz}，退神，事退无力` })
  }
  return out
}

/** 变卦同爻位之地支。 */
function changedZhiOf(g, changedBits, pos) {
  const bg = zhuangGua(changedBits, { dayGan: '' })
  return bg.lines[pos - 1]?.zhi ?? ''
}

/**
 * 反吟 / 伏吟。cite: spec §C6【B】——爻反吟＝动爻地支与变爻地支**六冲**；爻伏吟＝动爻与变爻**同支**；
 * 卦反吟＝本卦与变卦**互为六冲**；卦伏吟＝**全卦无动爻**（六爻皆静）。断：反吟主反覆忧虑不安，伏吟主愁闷停滞。
 * @returns {object} 四类判定与断语。
 */
function fanFuOf(g, bits, changedBits, moving) {
  const bg = zhuangGua(changedBits, { dayGan: '' })
  const yaoFan = []; const yaoFu = []
  for (const p of moving) {
    const a = g.lines[p - 1]?.zhi; const b = bg.lines[p - 1]?.zhi
    if (!a || !b) continue
    if (ZHI_LIUCHONG[a] === b) yaoFan.push(`${POS_NAMES[p - 1]}爻 ${a}化${b}（六冲）`)
    if (a === b) yaoFu.push(`${POS_NAMES[p - 1]}爻 ${a}化${b}（同支）`)
  }
  const benPattern = chongHeOf(g)
  const bianPattern = chongHeOf(bg)
  const guaFan = benPattern === '六冲卦' && bianPattern === '六冲卦'
  const guaFu = moving.length === 0
  const kinds = []
  if (yaoFan.length) kinds.push('爻反吟')
  if (yaoFu.length) kinds.push('爻伏吟')
  if (guaFan) kinds.push('卦反吟')
  if (guaFu) kinds.push('卦伏吟')
  const detail = []
  if (yaoFan.length) detail.push(`爻反吟：${yaoFan.join('、')}`)
  if (yaoFu.length) detail.push(`爻伏吟：${yaoFu.join('、')}`)
  if (guaFan) detail.push('卦反吟：本卦与变卦互为六冲（大反覆）')
  if (guaFu) detail.push('卦伏吟：六爻皆静，事停滞无进展')
  return {
    象: kinds.length ? kinds.join('+') : '无',
    断: kinds.length ? detail.join('；') : '非反吟亦非伏吟',
    爻反吟: yaoFan, 爻伏吟: yaoFu, 卦反吟: guaFan, 卦伏吟: guaFu,
    本卦格局: benPattern || '常卦', 变卦格局: bianPattern || '常卦',
  }
}

/**
 * 旬空性质（真空 / 假空 / 动则不空 / 真破）。
 * cite: spec §C7【A·三源一致】——旺相空＝假空（有气之空，出空即用）；休囚空＝真空（无力）；
 *       动爻旬空＝**动则不空**；月破逢空＝真空真破；空逢冲则实。
 * @param {object} line 装卦爻。
 * @param {boolean} isMoving 是否动爻。
 * @returns {{kind:string, delta:number, note:string}} 空亡之性质与分值修正。
 */
function kongEffect(line, isMoving) {
  if (!line || !line.kong) return { kind: '不空', delta: 0, note: '不空' }
  if (line.yueChong) return { kind: '真空真破', delta: -26, note: '月破逢空，真空真破，完全无力' }
  if (isMoving) return { kind: '动则不空', delta: -4, note: '动爻旬空：动则不空，发动之力仍有效，冲空/出空时应验' }
  const wang = line.wangShuai === '旺' || line.wangShuai === '相'
  if (wang) return { kind: '假空（旺相空）', delta: -6, note: '旺相而空＝有气之空，出空即用' }
  return { kind: '真空（休囚空）', delta: -20, note: '休囚而空＝真空无力，出空亦难恢复' }
}

/**
 * 伏飞五态。cite: spec §C4【A·多源一致】——飞生伏（大吉）／伏生飞（泄气）／飞克伏（大凶）／
 * 伏克飞（出暴）／飞伏比和（平）。以**飞神为主体**判五行关系。
 * @param {string} feiWx 飞神五行。
 * @param {string} fuWx 伏神五行。
 * @returns {{rel:string, name:string, judge:string, delta:number}} 飞伏关系。
 */
function feiFuState(feiWx, fuWx) {
  const rel = relation(feiWx, fuWx)
  const table = {
    我生: { name: '飞来生伏', judge: '大吉：伏神得长生，用之有力', delta: 8 },
    生我: { name: '伏去生飞', judge: '泄气：伏神力量外泄，事需主动', delta: -3 },
    我克: { name: '飞来克伏', judge: '大凶：伏神被压制，难以出头', delta: -10 },
    克我: { name: '伏去克飞', judge: '出暴：冲出即有斩获，但费力', delta: 4 },
    比和: { name: '飞伏比和', judge: '平：事可成但需时机', delta: 0 },
  }[rel] ?? { name: '—', judge: '—', delta: 0 }
  return { rel, ...table }
}

/** 卦中三合局（含动变之支）。cite: 《增删卜易·三合局》。表优先 kernel `SANHE_GROUPS`。 */
function sanheOf(zhis) {
  for (const g of SANHE_LIST) if (g.zhis.every((z) => zhis.includes(z))) return g
  return null
}

/**
 * 三合局之「结构候选」口径（保守）。cite: spec §C8——成局条件：①三支俱全 ②至少一支为动爻或与月/日支同
 * ③月/日可补足缺字；R1 建议以 `conclusionScope: "structure_candidate_only"` 标注「结构事实 ≠ 结论」。
 * @param {string[]} zhis 卦中（含动变）之地支。
 * @param {string} monthZhi 月支。
 * @param {string} dayZhi 日支。
 * @returns {{complete:object|null, half:object[], scope:string}} 候选。
 */
function sanheCandidate(zhis, monthZhi, dayZhi) {
  const rows = SANHE_LIST.map((g) => {
    const have = g.zhis.filter((z) => zhis.includes(z))
    const missing = g.zhis.filter((z) => !zhis.includes(z) && z !== monthZhi && z !== dayZhi)
    return { ju: g.ju, zhis: g.zhis, have, missing }
  })
  return {
    complete: rows.find((r) => r.missing.length === 0 && r.have.length >= 2) ?? null,
    half: rows.filter((r) => r.have.length === 2 && r.missing.length > 0),
    scope: 'structure_candidate_only',
  }
}

/**
 * 回头生克（变爻只对本位动爻回头作用，不直接作用于他爻）。
 * cite: spec §C3【A·两源一致】——作用顺序：①变爻先作用于本位动爻 → ②动爻再作用他爻 →
 * ③**若动爻被变爻回头克，则该动爻无力生克他爻**。
 * @returns {{list:object[], blocked:number[]}} 回头作用明细与被阻断的动爻位。
 */
function huiTouOf(g, changedBits, moving) {
  const bg = zhuangGua(changedBits, { dayGan: '' })
  const list = []; const blocked = []
  for (const p of moving) {
    const a = g.lines[p - 1]; const b = bg.lines[p - 1]
    if (!a || !b) continue
    const rel = relation(b.wuxing, a.wuxing) // 以变爻为主体作用于本位动爻
    const kinds = []
    if (rel === '我生') kinds.push({ 型: '回头生', 义: '变爻生动爻，得力' })
    if (rel === '我克') { kinds.push({ 型: '回头克', 义: '变爻克动爻，大凶，动爻无力生克他爻' }); blocked.push(p) }
    if (LIUHE_PAIRS[a.zhi] === b.zhi) kinds.push({ 型: '回头合', 义: '变爻与动爻六合，动爻被合住，暂失生克之能' })
    if (ZHI_LIUCHONG[a.zhi] === b.zhi) kinds.push({ 型: '回头冲', 义: '变爻与动爻六冲，动爻不稳' })
    if (kinds.length === 0) kinds.push({ 型: '本爻制变', 义: rel === '生我' ? '本爻生变爻（泄气）' : rel === '克我' ? '本爻克变爻（耗力）' : '无回头作用' })
    list.push({ 位: a.posName, 本: `${a.zhi}(${a.wuxing})`, 变: `${b.zhi}(${b.wuxing})`, 型: kinds.map((k) => k.型).join('+'), 义: kinds.map((k) => k.义).join('；') })
  }
  return { list, blocked }
}

/**
 * 动爻格局（独发 / 独静 / 两爻动 / 多爻动 / 六爻全动 / 六爻全静）。
 * cite: spec §C9【B·两源一致】。
 * @returns {{name:string, note:string, key:string}} 格局。
 */
function movingPattern(moving) {
  const n = Array.isArray(moving) ? moving.length : 0
  if (n === 0) return { name: '六爻全静', key: '安静', note: '只看用神旺衰＋日月生克＋世应关系；卦伏吟之象，事停滞' }
  if (n === 1) return { name: '独发', key: `${POS_NAMES[moving[0] - 1]}爻独发`, note: `独发之爻（${POS_NAMES[moving[0] - 1]}爻）为卦之核心，一切分析从此爻展开` }
  if (n === 2) return { name: '两爻动', key: '两爻动', note: '以与用神关系更直接的动爻为主；两动爻之间亦有生克' }
  if (n === 5) return { name: '独静', key: '独静', note: '五爻动而一爻静：以不动之爻（唯一稳定因素）为纲' }
  if (n === 6) return { name: '六爻全动', key: '六爻全动', note: '以变卦为主断：本卦为起因、变卦为结果' }
  return { name: '多爻动', key: '多爻动', note: '局势复杂，以用神本身状态为主，变卦意义加重' }
}

/**
 * 间爻（世应之间两爻）。cite: spec §C10【C·单源·可选流派】——间爻宜静不宜动，发动则所求之事受阻隔。
 * @returns {{pos:number[], moving:number[], note:string}} 间爻。
 */
function jianYaoOf(g) {
  const a = Math.min(g.shiPos, g.yingPos); const b = Math.max(g.shiPos, g.yingPos)
  const pos = []
  for (let i = a + 1; i < b; i += 1) pos.push(i)
  return { pos, note: '间爻＝世应之间两爻，宜静不宜动（发动则事受阻隔）【C·单源·可选流派】' }
}

/**
 * 应期机制候选（地支级候选，不落具体日期）。
 * cite: spec §D1 应期表 / §D2 高级应期法则 / R1 `_timing_candidates()` 的 mechanism 命名
 *       （全仓唯一可执行实现）。R1 显式标注 `conditional_timing_candidates_not_guaranteed_dates`
 *       ——「地支候选」与「保证日期」分离，本插件沿用该边界。
 * @returns {{candidates:object[], primary:string, scope:string}} 应期候选。
 */
function timingCandidatesOf(g, yong, moving, fanFu) {
  if (!yong) return { candidates: [], primary: '', scope: 'conditional_timing_candidates_not_guaranteed_dates' }
  const z = yong.zhi
  const out = []
  if (yong.isShi) out.push({ mechanism: 'yongshen_value', triggerBranch: z, scope: '主', note: '用神持世：临值月/日优先（不得被辅助触发点淹没）' })
  if (yong.kong) {
    const wang = yong.wangShuai === '旺' || yong.wangShuai === '相'
    out.push({ mechanism: 'void_fill', triggerBranch: z, scope: '主', note: '用神旬空 → 出空填实之日' })
    if (!wang) out.push({ mechanism: 'void_clash', triggerBranch: ZHI_LIUCHONG[z] ?? '', scope: '辅助', note: '用神休囚而空 → 冲空之日（旺相则单以出旬为主）' })
  }
  if (yong.yueChong) {
    out.push({ mechanism: 'month_break_value', triggerBranch: z, scope: '主', note: '用神月破 → 逢值之日/月' })
    out.push({ mechanism: 'month_break_harmony', triggerBranch: LIUHE_PAIRS[z] ?? '', scope: '辅助', note: '用神月破 → 逢合之日' })
    out.push({ mechanism: 'month_break_exit', triggerBranch: ZHI_LIUCHONG[g.monthZhi] ?? '', scope: '辅助', note: '用神月破 → 出当月令' })
  }
  const ws = yong.wangShuai
  if (ws === '旺' || ws === '相') out.push({ mechanism: 'prosperous_harmony', triggerBranch: LIUHE_PAIRS[z] ?? '', scope: '主', note: '用神旺相：旺不待生，逢合则应' })
  else out.push({ mechanism: 'weak_support', triggerBranch: ZHI_LIUCHONG[z] ?? '', scope: '辅助', note: '用神休囚：逢生旺之日/月应' })
  if (!moving.length) {
    out.push({
      mechanism: 'static_clash', triggerBranch: ZHI_LIUCHONG[z] ?? '', scope: '主',
      note: `用神安静：逢冲之日应（${ws === '旺' || ws === '相' ? '旺相作「冲起」' : '休囚作「冲破」'}）`,
    })
  }
  for (const p of moving) {
    const ml = g.lines[p - 1]
    if (!ml) continue
    out.push({ mechanism: 'moving_value', triggerBranch: ml.zhi, scope: ml.pos === yong.pos ? '主' : '辅助', note: `动爻${POS_NAMES[p - 1]}(${ml.zhi})逢值` })
    out.push({ mechanism: 'moving_harmony', triggerBranch: LIUHE_PAIRS[ml.zhi] ?? '', scope: '辅助', note: `动爻逢合（${LIUHE_PAIRS[ml.zhi] ?? '—'}）` })
  }
  if (Array.isArray(fanFu?.爻反吟) && fanFu.爻反吟.length) {
    out.push({ mechanism: 'yao_fan_yin', triggerBranch: ZHI_LIUCHONG[z] ?? '', scope: '辅助', note: '爻反吟：事多反复，逢冲合解之期' })
  }
  const primary = out.find((c) => c.scope === '主')?.triggerBranch || z
  return { candidates: out, primary, scope: 'conditional_timing_candidates_not_guaranteed_dates' }
}

/** 应期三层（主应期 / 辅助节点 / 风险窗口）。cite: spec §D2「主应期不得被辅助触发点淹没」。 */
function timingWindowOf(cands, g, ug, yong) {
  const fmt = (c) => `${c.triggerBranch || '—'}（${c.mechanism}）`
  const risks = []
  if (yong) {
    const jiQin = yong.qin === '妻财' ? '兄弟' : yong.qin === '官鬼' ? '子孙' : ''
    if (jiQin) {
      const ji = g.lines.find((l) => l.qin === jiQin)
      if (ji) risks.push(`忌神${jiQin}(${ji.zhi})临值/出空/发动之日`)
    }
    if (yong.kong && yong.yueChong) risks.push('用神真空真破：实破则无望')
    if (yong.yueChong) risks.push('用神月破未填实前不宜用事')
  }
  return {
    主应期: cands.filter((c) => c.scope === '主').map(fmt).slice(0, 3),
    辅助节点: cands.filter((c) => c.scope === '辅助').map(fmt).slice(0, 4),
    风险窗口: risks,
    应期单位: `急事看日、缓事看月、远事看年（本局用神${yong ? `「${yong.wangShuai}」` : '不上卦'}，问「${ug?.why ?? ''}」量其缓急）`,
  }
}

// ═════════════════════════ 5. 共用断卦 ═════════════════════════

/**
 * 通用断卦（卦德 + 月令旺衰 + 体用 + 变卦趋向）。
 * 权重为**公开通例的组合方式**（可改），逐项写进 `evidence` 以便复核。
 * @returns {{score:number, keys:string[], detail:object, wuxing:object, ben:object, bian:object, hu:object, ty:object, evidence:string[]}}
 */
function judgeGua(chart, bits, moving, opt = {}) {
  const moves = Array.isArray(moving) ? moving.slice() : []
  const changed = bits.slice()
  for (const p of moves) if (p >= 1 && p <= 6) changed[p - 1] = 1 - changed[p - 1]
  const ben = hexInfoOf(bits)
  const bian = hexInfoOf(changed)
  const hu = hexInfoOf(huGua(bits))
  const cuo = hexInfoOf(cuoGua(bits))
  const zong = hexInfoOf(zongGua(bits))
  const ty = tiYongOf(bits, moves[0] ?? 1)
  const mWx = monthWxOf(chart)
  const gas = wangShuai(ben.wuxing, mWx)
  const evidence = []

  let score = ben.polarity * 0.45 + bian.polarity * 0.25
  evidence.push(`《易》卦德：本卦${ben.name}${signed(ben.polarity)}×0.45、变卦${bian.name}${signed(bian.polarity)}×0.25 → ${signed(ben.polarity * 0.45 + bian.polarity * 0.25)}`)
  const gasPart = (gas.score - 55) * 0.35
  score += gasPart
  evidence.push(`月令旺衰：${ben.wuxing}（${ben.name}属${palaceOf(ben.name).palace}宫）值月令${mWx}为「${gas.state}」→ ${signed(gasPart)}`)
  const tyPart = (ty.score - 20) * 0.40
  score += tyPart
  evidence.push(`体用：体${ty.ti}(${ty.tiWx}) 用${ty.yong}(${ty.yongWx}) 为「${ty.rel}」→ ${signed(tyPart)}`)
  let movePart = 0
  if (moves.length === 1) movePart += 6
  else if (moves.length >= 4) movePart -= 8
  if (moves.length === 6) movePart -= 6
  if (moves.length === 0) movePart += 0
  score += movePart
  if (movePart !== 0) evidence.push(`动爻数：${moves.length} 爻动 → ${signed(movePart)}`)
  score = clamp(score, -100, 100)

  const keys = [ben.name]
  if (bian.name !== ben.name) keys.push(`之${bian.name}`)
  if (ty.rel) keys.push(ty.rel)
  keys.push(`月令旺衰${gas.state}`)
  if (hu.name && hu.name !== ben.name) keys.push(`互${hu.name}`)

  const wuxing = emptyWuxing()
  wuxing[ben.wuxing] = (wuxing[ben.wuxing] ?? 0) + 2
  wuxing[bian.wuxing] = (wuxing[bian.wuxing] ?? 0) + 1
  wuxing[mWx] = (wuxing[mWx] ?? 0) + 1

  return {
    score,
    keys: [...new Set(keys)].slice(0, 6),
    wuxing,
    ben,
    bian,
    hu,
    cuo,
    zong,
    ty,
    gas,
    evidence,
    detail: {
      本卦: `${ben.name}（序${ben.order}，上${ben.upper}${tri(ben.upper).xiang}下${ben.lower}${tri(ben.lower).xiang}，宫五行${ben.wuxing}）`,
      卦画: ben.lines,
      动爻: moves.length ? moves.map((p) => `第${p}爻`).join('、') : '六爻安静',
      变卦: bian.name === ben.name ? `（无动爻，卦不变）` : `${bian.name}（${bian.wuxing}）`,
      互卦: `${hu.name}（上${hu.upper}下${hu.lower}）`,
      错卦: cuo.name,
      综卦: zong.name,
      体用: `体${ty.ti}(${ty.tiWx}) 用${ty.yong}(${ty.yongWx}) → ${ty.rel}`,
      体用断: TIYONG_JUDGE[ty.rel] ?? '—',
      月令旺衰: `${gas.state}（月令${mWx}）`,
      卦德: `${ben.name}${signed(ben.polarity)} → ${bian.name}${signed(bian.polarity)}`,
      cite: '《周易》卦名卦德；《梅花易数》体用、互卦；《增删卜易》月令旺衰旺衰',
    },
  }
}

// ═════════════════════════ 6. 各法引擎 ═════════════════════════

/** 结果包装：保证 `makeOutcome` 必得合规输入（评分/五行/keys 已自洽）。 */
function ok(o) {
  const wuxing = emptyWuxing()
  const src = o?.wuxing ?? {}
  for (const w of WUXING) {
    const v = Number(src[w])
    if (Number.isFinite(v)) wuxing[w] = v
  }
  return {
    score: clamp(Number(o?.score) || 0, -100, 100),
    essence: String(o?.essence ?? '—').slice(0, 60),
    keys: (Array.isArray(o?.keys) ? o.keys.filter((k) => typeof k === 'string' && k) : []).slice(0, 6),
    wuxing,
    timing: typeof o?.timing === 'string' && o.timing ? o.timing : null,
    detail: (o?.detail && typeof o.detail === 'object' && Object.keys(o.detail).length > 0) ? o.detail : { 说明: '本法无补充盘面' },
    ...(o?.fidelity ? { fidelity: o.fidelity } : {}),
  }
}

/** 异常兜底：族内表/盘基意外缺位时给出**结构完整的降级结果**，绝不返回 null、绝不抛出。 */
function guard(fn, tag) {
  return function guarded(chart, entry, rand) {
    try {
      return fn(chart, entry, rand)
    } catch (err) {
      return ok({
        score: 0,
        essence: `${tag}·盘面缺字段，已降级为平断`,
        keys: [tag, '降级'],
        wuxing: {},
        fidelity: 'approx',
        detail: {
          cite: '—',
          rule: '本族防御层：chart 字段或族内表缺位时降级，不抛异常',
          异常: `${err?.name ?? 'Error'}: ${err?.message ?? String(err)}`,
          说明: '该法本局按平断处理，盘面细节缺失（详见「异常」）',
        },
      })
    }
  }
}

/** 卦数（上下卦先天数之和）→ 梅花应期「以卦数定应期」。cite: 《梅花易数·应期》。 */
function guaNumTiming(bits) {
  const upN = tri(triNameOfBits(bits.slice(3, 6))).xian
  const loN = tri(triNameOfBits(bits.slice(0, 3))).xian
  return `${upN + loN}日`
}

export const engines = {
  // ─────────────── #1 大衍筮法 ───────────────
  yarrow: guard(function yarrow(chart, entry, rand) {
    const lines = []
    for (let i = 0; i < 6; i += 1) lines.push(yarrowLine(rand))
    const values = lines.map((l) => l.value)
    const bits = values.map(bitOf)
    const moving = values.map((v, i) => (isMoving(v) ? i + 1 : 0)).filter((x) => x > 0)
    const j = judgeGua(chart, bits, moving)
    const 变数 = lines.reduce((s, l) => s + l.steps.length, 0)
    const evidence = [
      ...j.evidence,
      `十八变：6 爻 × 3 变 = ${变数} 变；得策 ${lines.map((l) => l.sticks).join('/')} ÷ 4 → 爻值 ${values.join('/')}`,
    ]
    return ok({
      score: j.score,
      essence: `大衍·${j.ben.name}${moving.length ? `之${j.bian.name}` : '（六爻安静）'}·${j.ty.rel}`,
      keys: ['大衍', ...j.keys].slice(0, 6),
      wuxing: j.wuxing,
      timing: guaNumTiming(bits),
      fidelity: 'full',
      detail: {
        cite: '《周易·系辞上》「大衍之数五十，其用四十有九」；《易学启蒙·明蓍策》三变成爻、十八变成卦',
        rule: '五十蓍草去一用四十九；每爻三变（分二·挂一·揲四·归奇），十八变成一卦',
        evidence,
        得爻: values.join(' ') + '（6老阴7少阳8少阴9老阳）',
        动爻: moving.length ? moving.map((p) => `第${p}爻`).join('、') : '无（六爻安静）',
        概率表: DAYAN_PROB,
        概率说明: '通例概率 老阳3/16、少阴7/16、少阳5/16、老阴1/16；本法的**精确分布**为 '
          + '老阳21.117%、少阴44.836%、少阳28.874%、老阴5.174%（折16 = 3.379:7.174:4.620:0.828），'
          + '与通例一致而不完全相等——差额来自第一变 36/47 与「去四概率 0.524–0.533 而非恰好 1/2」的有限堆数余数效应。',
        三变明细: lines.map((l, i) => `第${i + 1}爻：${l.steps.map((s) => `第${s.变}变 ${s.左}+${s.右} 挂1 余${s.左余}+${s.右余} 归奇${s.归奇} → 余${s.策后}策`).join('；')} → ${l.sticks}策 = ${l.value}`),
        随机纪律: '本爻象由 rand（种子＝问题｜时刻｜法号）真随机摸出，同问同刻可复现；随问题改变',
        ...j.detail,
      },
    })
  }, '大衍'),

  // ─────────────── #2 金钱卦 ───────────────
  coinHex: guard(function coinHex(chart, entry, rand) {
    const g = castSix(rand, 'coin', chart?.coins)
    const j = judgeGua(chart, g.bits, g.moving)
    const detail = {
      cite: '《火珠林》以钱代蓍；《增删卜易·以钱代蓍法》',
      rule: '三枚铜钱掷六次；背为阳面：三背＝老阳(重·9)、两背＝少阴(拆·8)、一背＝少阳(单·7)、三字＝老阴(交·6)',
      evidence: [
        ...j.evidence,
        `六掷钱面：${g.tosses.map((t, i) => `${i + 1}掷${t.回放 ? '（回放）' : t.钱面}→${g.values[i]}`).join('，')}`,
        '概率：老阳1/8、少阴3/8、少阳3/8、老阴1/8（三枚均半之组合数 1:3:3:1）',
      ],
      六掷: g.values.join(' '),
      钱面: g.tosses.map((t) => t.回放 ? '回放' : t.钱面).join(' '),
      概率: '老阳1/8、少阴3/8、少阳3/8、老阴1/8（《增删卜易》三枚钱正反组合 1:3:3:1）',
      随机纪律: '六掷由 rand 逐枚真掷（rand.chance(0.5) 三枚），随问题改变；若传入 chart.coins 则按钱面回放',
      ...j.detail,
    }
    if (g.replay) detail.回放 = '使用用户给出的六爻钱面（chart.coins）复现本卦'
    return ok({
      score: j.score,
      essence: `金钱·${j.ben.name}${g.moving.length ? `之${j.bian.name}·动${g.moving.length}爻` : '·无动爻'}`,
      keys: ['金钱卦', ...j.keys].slice(0, 6),
      wuxing: j.wuxing,
      timing: guaNumTiming(g.bits),
      fidelity: 'full',
      detail,
    })
  }, '金钱'),

  // ─────────────── #3 六爻纳甲 ───────────────
  najia: guard(function najia(chart, entry, rand) {
    const g = castSix(rand, 'coin', chart?.coins)
    const gua = zhuangGua(g.bits, chart)
    const bianGua = zhuangGua(g.changed, chart)
    const ug = useGodOf(chart)
    const yong = pickYong(gua, ug.god)
    const kong = gua.kong
    const mWx = monthWxOf(chart)
    const dWx = dayWxOf(chart)
    const evidence = []
    let score = 0

    const de = polarityOf(gua.name)
    score += de * 0.20
    evidence.push(`卦德：${gua.name}(${gua.palace}宫${gua.stage})${signed(de)}×0.20 → ${signed(de * 0.2)}`)

    // 动爻格局（独发/独静/多爻动…）——spec §C9
    const mp = movingPattern(g.moving)
    const mpPart = { 独发: 6, 独静: 2, 安静: 0, 两爻动: 0, 多爻动: -6, 六爻全动: -10 }[mp.name] ?? 0
    score += mpPart
    evidence.push(`动爻格局：${mp.name}——${mp.note} → ${signed(mpPart)}`)

    if (yong) {
      const yWs = wangShuai(yong.wuxing, mWx)
      const ke = kongEffect(yong, g.moving.includes(yong.pos))
      score += yong.power * 0.85
      evidence.push(`用神：${ug.god}（${ug.why}）落${yong.posName}爻 ${yong.gan}${yong.zhi}(${yong.wuxing})，`
        + `月建${gua.monthZhi}为「${yWs.state}」、日辰${gua.dayZhi}与用神为「${yong.riRel}」、力量分${yong.power}×0.85`)
      if (yong.kong) {
        evidence.push(`用神旬空性质：${ke.kind}——${ke.note} → ${signed(ke.delta)}`)
        score += ke.delta
      }
      if (yong.yueChong) { evidence.push('用神逢月破 → 根基受损（月破在力量分里已计）') }
      if (yong.linRi) evidence.push('用神临日建 → 当日得气')
    } else {
      score -= 14
      evidence.push(`用神${ug.god}不上卦 → 事无主，求诸伏神（−14）`)
    }

    // 世应
    const shi = gua.lines.find((l) => l.isShi)
    const ying = gua.lines.find((l) => l.isYing)
    let shiRel = '—'
    if (shi && ying) {
      shiRel = relation(shi.wuxing, ying.wuxing)
      const v = { 生我: 26, 比和: 16, 我克: 14, 我生: -6, 克我: -26 }[shiRel] ?? 0
      score += v * 0.5
      evidence.push(`世应：世${shi.zhi}(${shi.wuxing}) 应${ying.zhi}(${ying.wuxing}) 为「${shiRel}」→ ${signed(v * 0.5)}`)
      if (ZHI_LIUCHONG[shi.zhi] === ying.zhi) { score -= 18; evidence.push('世应相冲：矛盾对立 → −18') }
      const sk = kongEffect(shi, g.moving.includes(shi.pos))
      if (shi.kong) { score += sk.delta * 0.6; evidence.push(`世爻旬空性质：${sk.kind} → ${signed(sk.delta * 0.6)}`) }
    }

    // 回头生克：变爻只对本位动爻作用；被回头克之动爻**无力生克他爻**（spec §C3）
    const ht = huiTouOf(gua, g.changed, g.moving)
    for (const x of ht.list) {
      if (x.型.includes('回头生')) { score += 8; evidence.push(`回头生：${x.位} ${x.本}←${x.变} → +8`) }
      if (x.型.includes('回头克')) { score -= 12; evidence.push(`回头克：${x.位} ${x.本}←${x.变} → −12，且该动爻无力生克他爻`) }
      if (x.型.includes('回头合')) { score -= 6; evidence.push(`回头合：${x.位} ${x.本}←${x.变} → 动爻被合住 −6`) }
      if (x.型.includes('回头冲')) { score -= 6; evidence.push(`回头冲：${x.位} ${x.本}←${x.变} → 动爻不稳 −6`) }
    }

    // 动爻对用神的生克（被回头克的动爻不参与）
    for (const p of g.moving) {
      const ml = gua.lines[p - 1]
      if (!ml || (yong && ml.pos === yong.pos)) continue
      if (ht.blocked.includes(p)) { evidence.push(`动爻${ml.posName}(${ml.zhi})被回头克，无力生克他爻（不计入）`); continue }
      const r = yong ? relation(ml.wuxing, yong.wuxing) : '比和'
      if (r === '生我') { score += 12; evidence.push(`动爻${ml.posName}(${ml.zhi})生用神 → +12`) }
      if (r === '克我') { score -= 14; evidence.push(`动爻${ml.posName}(${ml.zhi})克用神 → −14`) }
    }

    // 进神退神（四土默认不判，见 TUXI_JINSHEN_ENABLED）
    const jt = jinTuiOf(gua, g.changed, g.moving)
    for (const x of jt) {
      if (x.象 === '进神') { score += 10; evidence.push(`${x.断} → +10`) }
      else if (x.象 === '退神') { score -= 10; evidence.push(`${x.断} → −10`) }
      else evidence.push(`存疑项：${x.断}（不计分）`)
    }
    // 反吟伏吟（spec §C6 四类）
    const ff = fanFuOf(gua, g.bits, g.changed, g.moving)
    if (ff.爻反吟.length) { score -= 8 * Math.min(2, ff.爻反吟.length); evidence.push(`${ff.断} → 爻反吟 −8/爻`) }
    if (ff.爻伏吟.length) { score -= 5 * Math.min(2, ff.爻伏吟.length); evidence.push(`爻伏吟：${ff.爻伏吟.join('、')} → −5/爻`) }
    if (ff.卦反吟) { score -= 16; evidence.push('卦反吟：本卦与变卦互为六冲，大反覆 → −16') }
    if (ff.卦伏吟) { score -= 6; evidence.push('卦伏吟：六爻皆静，事停滞 → −6') }
    // 三合局（结构候选口径）/ 六冲六合（运行时穷举）
    const allZhis = [...gua.lines.map((l) => l.zhi), ...g.moving.map((p) => changedZhiOf(gua, g.changed, p))]
    const shc = sanheCandidate(allZhis, gua.monthZhi, gua.dayZhi)
    const he = shc.complete
    if (he) { score += 8; evidence.push(`卦中成${he.ju}局三合（${he.zhis.join('')}，含日月补字）→ +8`) }
    else if (shc.half.length) evidence.push(`三合局结构候选（不成局，${shc.half.map((h) => `${h.ju}局缺${h.missing.join('')}`).join('；')}）——仅记结构，不计分`)
    const chongHe = chongHeOf(gua)
    const chongHeBian = chongHeOf(bianGua)
    if (chongHe === '六冲卦') { score -= 10; evidence.push('本卦为六冲卦（纳甲三对全冲穷举判定）：主冲散、事多反复、主快不持久 → −10') }
    else if (chongHe === '六合卦') { score += 10; evidence.push('本卦为六合卦（纳甲三对全合穷举判定）：主和合、事易成、主持久 → +10') }
    const transition = chongHeTransition(chongHe, chongHeBian)
    if (transition) {
      if (transition.includes('先散后聚') || transition.includes('顺利持久')) score += 8
      else score -= 8
      evidence.push(`变卦合冲：${transition} → ${transition.includes('先散后聚') || transition.includes('顺利持久') ? '+8' : '−8'}`)
    }
    // 间爻（可选流派，单源）
    const jy = jianYaoOf(gua)
    const jyMoving = jy.pos.filter((p) => g.moving.includes(p))
    if (jyMoving.length) { score -= 6 * jyMoving.length; evidence.push(`间爻（${jy.pos.join('、')}）发动：所求之事受阻隔 → −6/爻【C·单源·可选流派】`) }

    // 伏神（用神不上卦）
    const fu = yong ? null : fuShenOf(g.bits, chart, ug.god)
    if (fu) {
      score += fu.delta ?? 0
      evidence.push(`伏神：${fu.伏神} 伏于 ${fu.飞神} 之下，伏飞关系「${fu.伏飞关系}」→ ${fu.出伏} → ${signed(fu.delta ?? 0)}`)
    }

    score = clamp(score, -100, 100)
    const wuxing = emptyWuxing()
    for (const l of gua.lines) wuxing[l.wuxing] += 0.5
    wuxing[mWx] += 1
    if (yong) wuxing[yong.wuxing] += 1.5

    // 应期：地支候选 + 三层结构（spec §D1/§D2，边界标注沿用 R1）
    const tw = timingCandidatesOf(gua, yong, g.moving, ff)
    const tWindow = timingWindowOf(tw.candidates, gua, ug, yong)

    const yongWs = yong ? wangShuai(yong.wuxing, mWx) : null
    return ok({
      score,
      essence: `纳甲·${gua.name}（${gua.palace}宫${gua.stage}）${ug.god}${yong ? yongWs.state + (yong.kong ? kongEffect(yong, g.moving.includes(yong.pos)).kind.slice(0, 2) : '') : '不上卦'}`,
      keys: [gua.name, `${gua.palace}宫${gua.stage}`, ug.god, yong ? `用神${yongWs.state}` : '用神伏藏', mp.key, ...(shiRel !== '—' ? [`世应${shiRel}`] : [])].slice(0, 6),
      wuxing,
      timing: tw.primary ? `${tw.primary}日` : (fu ? `${fu.zhi}日` : null),
      fidelity: 'full',
      detail: {
        cite: '《京房易传》纳甲世应；《增删卜易·卷首》装卦例、用神章；《卜筮正宗》六亲六神；'
          + '规则校订依 docs/research/yijing-spec.md §A/§C/§D（含六冲六合穷举、回头生克作用顺序、四土进退存疑）',
        rule: '八宫定归属与世应 → 纳甲配干支 → 宫五行定六亲 → 日干起六神 → 月建日辰判旺衰 → '
          + '先算变爻对本位动爻的回头作用，再以未被回头克的动爻生克用神；六冲六合按纳甲三对穷举现算',
        evidence,
        用神流派: `${ug.topic ?? '—'} → ${ug.god}${ug.alt ? `（辅：${ug.alt}）` : ''}｜${ug.cite}`,
        卦: `${gua.name}（${gua.palace}宫·${gua.stage}，世${gua.shiPos}应${gua.yingPos}）`,
        变卦: g.moving.length ? `${bianGua.name}（${bianGua.palace}宫${bianGua.stage}）` : '无动爻',
        用神: `${ug.god} — ${ug.why}（${ug.cite}）`,
        用神爻: yong ? `${yong.posName}爻 ${yong.gan}${yong.zhi}(${yong.wuxing}) ${yong.qin} ${yong.shen}` : '不上卦，取伏神',
        伏神: fu ? `${fu.伏神} 伏于 ${fu.飞神}（${fu.伏飞关系}；${fu.出伏}）` : '无（用神上卦）',
        神煞: (() => {
          const z = yong?.zhi ?? shi?.zhi ?? ''
          const t = shenshaText(chart, z)
          return t ? `${z}支见：${t}` : `${z}支未见所载神煞`
        })(),
        岁君: pillarsOf(chart).join(' '),
        月建: `${chart?.ganzhi?.month ?? ''}（${mWx}）`,
        日辰: `${chart?.ganzhi?.day ?? ''}（${dWx}）`,
        人元司令: chart?.renyuan ? `${chart.renyuan.gan}（${chart.renyuan.days}日，月支${chart.renyuan.monthZhi}）` : '（chart.renyuan 未提供）',
        旬空: kong.join(''),
        六神: gua.lines.map((l) => `${l.posName}:${l.shen}`).join(' '),
        装卦: gua.lines.map((l, i) => lineText(gua, i, g.values, g.moving.includes(l.pos) ? bianGua.lines[i].zhi : '')),
        动变: g.moving.length ? g.moving.map((p) => `${gua.lines[p - 1].zhi} → ${bianGua.lines[p - 1].zhi}`).join('、') : '六爻安静',
        动爻格局: `${mp.name}——${mp.note}`,
        回头生克: ht.list.length ? ht.list.map((x) => `${x.位} ${x.本}→${x.变} ${x.型}（${x.义}）`).join('；') : '无动爻',
        进退神: jt.length ? jt.map((x) => `${x.位}:${x.象}—${x.断}`).join('；') : '无',
        存疑: TUXI_JINSHEN_ENABLED ? '土爻进退已启用（R1 四土循环），仍属【D·存疑】' : '土爻化进/化退默认不判：4 源 4 说，无法裁决（spec §C5【D·存疑】）',
        反吟伏吟: ff.象 === '无' ? '非反吟亦非伏吟' : ff.断,
        六冲六合: `${chongHe || '常卦'}${chongHeBian ? ` → 变卦${chongHeBian}` : ''}${transition ? `（${transition}）` : ''}`,
        三合局: he ? `${he.ju}局（${he.zhis.join('')}）` : (shc.half.length ? `结构候选：${shc.half.map((h) => `${h.ju}局缺${h.missing.join('')}`).join('；')}（conclusionScope=${shc.scope}）` : '不成局'),
        间爻: jy.pos.length ? `${jy.pos.map((p) => POS_NAMES[p - 1]).join('、')}爻——${jy.note}` : '世应紧邻，无间爻',
        应期候选: tw.candidates.map((c) => `${c.scope}｜${c.mechanism}｜${c.triggerBranch}｜${c.note}`),
        应期三层: tWindow,
        timingScope: tw.scope,
        断法权重: `卦德0.20 ｜ 用神力量0.85 ｜ 空亡性质 −4/−6/−20/−26 ｜ 世应0.5± ｜ 世应冲−18 ｜ 动爻格局 ${signed(mpPart)} ｜ `
          + '回头生+8/克−12/合−6/冲−6 ｜ 进退神±10 ｜ 爻反吟−8 爻伏吟−5 卦反吟−16 卦伏吟−6 ｜ 三合+8 ｜ 六冲−10 六合+10 ｜ 变卦合冲±8 ｜ 间爻−6',
      },
    })
  }, '纳甲'),

  // ─────────────── #4 六爻·世应六亲 ───────────────
  shiying: guard(function shiying(chart, entry, rand) {
    const g = castSix(rand, 'coin', chart?.coins)
    const gua = zhuangGua(g.bits, chart)
    const shi = gua.lines.find((l) => l.isShi)
    const ying = gua.lines.find((l) => l.isYing)
    const rel = relation(shi.wuxing, ying.wuxing)
    const mWx = monthWxOf(chart)
    const evidence = []
    const base = { 生我: 55, 比和: 40, 我克: 30, 我生: -12, 克我: -58 }[rel] ?? 0
    let score = base
    evidence.push(`世应关系：世${shi.zhi}(${shi.wuxing}) 应${ying.zhi}(${ying.wuxing}) 为「${rel}」→ ${signed(base)}`)

    const wsShi = wangShuai(shi.wuxing, mWx)
    score += (wsShi.score - 55) * 0.4
    evidence.push(`世爻月建旺衰：世${shi.wuxing}值月令${mWx}为「${wsShi.state}」→ ${signed((wsShi.score - 55) * 0.4)}`)
    const wsYing = wangShuai(ying.wuxing, mWx)
    evidence.push(`应爻月建旺衰：应${ying.wuxing}为「${wsYing.state}」`)

    const skShi = kongEffect(shi, g.moving.includes(shi.pos))
    const skYing = kongEffect(ying, g.moving.includes(ying.pos))
    if (shi.kong) { score += skShi.delta * 0.8; evidence.push(`世爻旬空性质：${skShi.kind}（${skShi.note}）→ ${signed(skShi.delta * 0.8)}`) }
    if (ying.kong) { score += skYing.delta * 0.35; evidence.push(`应爻旬空性质：${skYing.kind} → ${signed(skYing.delta * 0.35)}`) }
    const chongHeSY = chongHeOf(gua)
    if (chongHeSY === '六冲卦') { score -= 12; evidence.push('本卦六冲：世应相冲之局，主散 → −12') }
    else if (chongHeSY === '六合卦') { score += 12; evidence.push('本卦六合：世应相合之局，主成 → +12') }
    if (ZHI_LIUCHONG[shi.zhi] === ying.zhi) { score -= 16; evidence.push('世应地支相冲：矛盾对立（spec §F4）→ −16') }
    if (shi.yueChong) { score -= 16; evidence.push('世爻月破 → −16') }
    if (shi.riChong) { score -= 10; evidence.push('世爻日破 → −10') }
    for (const p of g.moving) {
      const ml = gua.lines[p - 1]
      if (!ml || ml.pos === shi.pos) continue
      const r = relation(ml.wuxing, shi.wuxing)
      if (r === '克我') { score -= 16; evidence.push(`动爻${ml.posName}(${ml.zhi})克世 → −16`) }
      if (r === '生我') { score += 12; evidence.push(`动爻${ml.posName}(${ml.zhi})生世 → +12`) }
    }
    const rYingShi = relation(ying.wuxing, shi.wuxing)
    if (rYingShi === '生我') evidence.push('应生世：他方来助我')
    if (rYingShi === '克我') evidence.push('应克世：他方来制我')
    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[shi.wuxing] += 2
    wuxing[ying.wuxing] += 1.5
    wuxing[mWx] += 1

    const stageJudge = {
      本宫: '本宫卦，纯而不杂，事有主体',
      一世: '一世卦，事方起步，变动之初',
      二世: '二世卦，事渐展开',
      三世: '三世卦，事已过半，内外交接',
      四世: '四世卦，事近外卦，渐入尾声',
      五世: '五世卦，事至高位，将变',
      游魂: '游魂卦，心神不定、事多游移反复',
      归魂: '归魂卦，事复归本位、有返还之象',
    }[gua.stage] ?? '—'

    return ok({
      score,
      essence: `世应·世${shi.qin}${shi.zhi}${wsShi.state} 应${ying.zhi}·${rel}`,
      keys: [`世应${rel}`, `${gua.stage}`, `世${shi.qin}`, `世${wsShi.state}`, shi.kong ? '世空' : `应${ying.qin}`].slice(0, 6),
      wuxing,
      timing: `${ying.zhi}日`,
      fidelity: 'full',
      detail: {
        cite: '《增删卜易·世应章》「世为己，应为彼」；《卜筮正宗》世应生克',
        rule: '以世爻为己、应爻为彼；应生世/比和则彼助我，应克世则彼制我；再参世爻旺衰与日月空破',
        evidence,
        卦: `${gua.name}（${gua.palace}宫·${gua.stage}）`,
        世爻: `${shi.posName}爻 ${shi.gan}${shi.zhi}(${shi.wuxing}) ${shi.qin} ${shi.shen}｜${wsShi.state}${shi.kong ? `·旬空(${skShi.kind})` : ''}${shi.yueChong ? '·月破' : ''}`,
        应爻: `${ying.posName}爻 ${ying.gan}${ying.zhi}(${ying.wuxing}) ${ying.qin} ${ying.shen}｜${wsYing.state}${ying.kong ? `·旬空(${skYing.kind})` : ''}`,
        世应关系: rel,
        世应冲合: ZHI_LIUCHONG[shi.zhi] === ying.zhi ? '世应地支相冲（矛盾对立）' : LIUHE_PAIRS[shi.zhi] === ying.zhi ? '世应地支六合（和合）' : `世应无冲无合（关系取五行「${rel}」）`,
        旬空: gua.kong.join(''),
        卦之冲合: chongHeSY || '常卦',
        宫位断: stageJudge,
        六亲: gua.lines.map((l) => `${l.posName}:${l.qin}${l.zhi}`).join(' '),
        六亲不缺: [...new Set(gua.lines.map((l) => l.qin))].join('、'),
        神煞: shenshaText(chart, shi.zhi) ? `世${shi.zhi}见：${shenshaText(chart, shi.zhi)}` : `世${shi.zhi}未见所载神煞`,
        断: rel === '生我' ? '应生世，他方助我，事可成'
          : rel === '克我' ? '应克世，他方制我，事多阻'
            : rel === '比和' ? '世应比和，同心可成，然亦主无甚助力'
              : rel === '我克' ? '世克应，我能制彼，事在我手' : '世生应，我耗力于彼，宜节力',
        装卦: gua.lines.map((l, i) => lineText(gua, i, g.values, '')),
      },
    })
  }, '世应'),

  // ─────────────── #5–#8 梅花易数（时间/报数/外应/字占） ───────────────
  meihua: guard(function meihua(chart, entry, rand) {
    const mode = entry?.params?.mode ?? 'time'
    const y = yearZhiNum(chart)
    const mo = lunarMonth(chart)
    const d = lunarDay(chart)
    const h = hourZhiNum(chart)
    let a; let b; let c; let how; let cite; let penNote = ''
    let fidelity = 'full'

    if (mode === 'number') {
      const nums = Array.isArray(chart?.numbers) ? chart.numbers.map(Number).filter(Number.isFinite) : []
      if (nums.length < 2) return null // 运行器按 need:['numbers'] 已拦；此处双保险
      if (nums.length >= 3) {
        a = nums[0]; b = nums[1]; c = nums[2]
        how = `报数三数：${nums[0]} / ${nums[1]} / ${nums[2]}`
        cite = '《梅花易数·卷三》三数起卦（上卦取第一数、下卦取第二数、动爻取第三数）'
      } else {
        a = nums[0]; b = nums[1]; c = a + b + h
        how = `报数二数：${nums[0]} / ${nums[1]}，加时支${chart?.hourZhi ?? ''}(${h}) 取动爻`
        cite = '《梅花易数·卷三》报数起卦（上卦第一数、下卦第二数、两数加时数取动爻）'
      }
      penNote = '⚠ 取数公式【未核实】：本轮调研 9 个仓库无任何报数卦取数实现（spec §E4），'
        + '本插件按公开通行的《梅花易数》报数口诀实现，公式已在上方「起卦」原文列出以便核对'
    } else if (mode === 'word') {
      const nums = Array.isArray(chart?.numbers) ? chart.numbers.map(Number).filter(Number.isFinite) : []
      const zi = extractChar(chart?.question)
      const chars = countHanzi(chart?.question)
      if (nums.length >= 2) {
        a = nums[0]; b = nums[1]
        // 《梅花易数·二字占》：上字笔画为上卦、下字笔画为下卦，**两字笔画之和加时数**取动爻
        c = nums[0] + nums[1] + h
        how = `报数当笔画：${nums.join(' / ')}（用户所报即笔画数）；动爻＝${nums[0]}+${nums[1]}+时支${h}`
        cite = '《梅花易数·卷三·二字占》以笔画起卦、两字笔画之和加时数取动爻；用户所报数字直接充当笔画数'
        penNote = '笔画取自用户所报数字'
      } else if (zi) {
        // 一字占：无笔画表 → 以该字之「字数(1) + 字位 + 时数」取象，明标降级
        a = 1 + h
        b = 1 + d
        c = 1 + h + d
        how = `一字占「${zi}」：未报笔画，按字数(1)+时支(${h})+日(${d}) 取象`
        cite = '《梅花易数·卷三》字占（原以笔画起卦）'
        fidelity = 'approx'
        penNote = '⚠ 未内置汉字笔画表且用户未报笔画，本局以「字数＋时数」取象代替笔画，非笔画正法'
      } else {
        a = Math.max(1, Math.ceil(chars / 2)) + h
        b = Math.max(1, chars - Math.ceil(chars / 2)) + d
        c = chars + h
        how = `字数占：所问共 ${chars} 字，分半加时日取数`
        cite = '《梅花易数·卷三》字占（原以笔画起卦）'
        fidelity = 'approx'
        penNote = `⚠ 未内置汉字笔画表且用户未报笔画（所问 ${chars} 字），本局以「字数分半＋时数」取象代替笔画`
      }
    } else if (mode === 'waiying') {
      const wai = extractWaiYing(chart?.question)
      if (wai.found) {
        const t = tri(wai.tri)
        a = t.xian + h
        b = countHanzi(wai.text) + d
        c = countHanzi(wai.text) + h + d
        how = `已报外应「${wai.text}」→ 取象${wai.tri}(${t.xiang})，配时支${h}、日${d}`
        cite = '《梅花易数·卷三》外应取数；物象配卦依《说卦传》类象'
        penNote = '⚠ 外应取数公式【未核实】：本轮调研无任何仓库给出外应取数实现（spec §E4）。'
          + '本插件以「物象所属八卦之先天数 + 时支」取上卦、以「外应语字数 + 日」取下卦，公式已列于「起卦」以便核对'
      } else {
        // 未报外应 → 按时刻取象。**取象依据只锚到「时支＋日支＋月支」，绝不含分钟**：
        // 分钟一变就换一套卦，等于同一时辰内反复求占得到互不相干的卦象，而外应取象
        // 本是「当下所见所闻」的替代，不该以分钟为粒度（同辰稳定、跨辰可变）。
        a = h + d
        b = h + d + mo
        c = h + d + mo
        how = `未报外应：按时刻取象（时支${h}＋日支序${d}＋月${mo}，不含分钟）`
        cite = '《梅花易数·卷三》外应取数（须有真实外应；本局无外应可用）'
        fidelity = 'approx'
      }
    } else {
      a = y + mo + d
      b = a + h
      c = b
      how = `时间起卦：年支${chart?.yearZhi ?? ''}(${y}) + 月${mo} + 日${d} = ${a}；再加时支${chart?.hourZhi ?? ''}(${h}) = ${b}`
      cite = '《梅花易数·卷三·年月日时起例》'
    }

    const g = guaFromNumbers(a, b, c)
    const j = judgeGua(chart, g.bits, [g.movePos])
    const hu = hexInfoOf(huGua(g.bits))
    const bian = hexInfoOf(g.changed)
    // 互卦/变卦对体的生克（中程与终局）
    const tWx = j.ty.tiWx
    const huRel = relation(tWx, hu.wuxing)
    const bianRel = relation(tWx, bian.wuxing)
    const huPart = ({ 生我: 14, 比和: 8, 我克: 4, 我生: -6, 克我: -16 }[huRel] ?? 0)
    const bianPart = ({ 生我: 18, 比和: 10, 我克: 6, 我生: -8, 克我: -22 }[bianRel] ?? 0)
    const score = clamp(j.score + huPart + bianPart, -100, 100)
    const evidence = [
      `起卦：${how} → 上卦${g.upT.name}(${g.upN})、下卦${g.loT.name}(${g.loN})、动爻第${g.movePos}爻（${c}÷6）`,
      ...j.evidence,
      `互卦${hu.name}(${hu.wuxing})对体${tWx}为「${huRel}」→ ${signed(huPart)}（主中程）`,
      `变卦${bian.name}(${bian.wuxing})对体${tWx}为「${bianRel}」→ ${signed(bianPart)}（主终局）`,
    ]
    const tags = { time: '梅时', number: '梅数', waiying: '梅应', word: '梅字' }
    const prefix = tags[mode] ?? '梅花'

    if (mode === 'waiying' && !extractWaiYing(chart?.question).found) {
      return ok({
        score, essence: `未报外应·取象：${j.ben.name}之${bian.name}·体${j.ty.ti}用${j.ty.yong}${j.ty.rel}`,
        keys: ['未报外应', j.ben.name, `之${bian.name}`, j.ty.rel, `体${j.ty.ti}`].slice(0, 6),
        wuxing: j.wuxing, timing: guaNumTiming(g.bits), fidelity: 'approx',
        detail: {
          cite, rule: '外应卦须有真实外应方能取数；用户未报外应时，本法降为 approx 并以时刻取象代替',
          evidence: [...evidence, '⚠ 用户未报外应：本局无外应可取，按时刻（时支/日支/月）取象代替，不冒充真实外应；取象依据不含分钟，故同辰内稳定、跨辰可变'],
          取象方式: '时刻取象（非真实外应；锚于时支＋日支＋月，不含分钟）',
          说明: '《梅花易数》外应取数必凭当下所见所闻之物。本局用户未报外应，故按时刻取象并如实标注，'
            + '结论仅供参考，勿当真实外应之断。取象依据锚于时支、日支与月（**不含分钟**）：'
            + '同一时辰内反复求占得同一卦，跨时辰方变 —— 外应取象不以分钟为粒度。',
          ...j.detail,
        },
      })
    }

    return ok({
      score,
      essence: `${prefix}·${j.ben.name}之${bian.name}·体${j.ty.ti}用${j.ty.yong}${j.ty.rel}`,
      keys: [prefix, j.ben.name, `之${bian.name}`, `体${j.ty.ti}`, j.ty.rel, `互${hu.name}`].slice(0, 6),
      wuxing: j.wuxing,
      timing: guaNumTiming(g.bits),
      fidelity,
      detail: {
        cite,
        rule: '上卦数÷8取余（余0作8）为上卦、下卦数÷8取余为下卦、动爻数÷6取余（余0作6）为动爻；'
          + '动爻所在之卦为用、不动之卦为体；互卦主中程、变卦主终局',
        evidence,
        起卦: how,
        上卦: `${g.upT.name}（先天${g.upN}·${g.upT.xiang}·${g.upT.wx}）`,
        下卦: `${g.loT.name}（先天${g.loN}·${g.loT.xiang}·${g.loT.wx}）`,
        动爻: `第${g.movePos}爻（${POS_NAMES[g.movePos - 1]}爻）`,
        互卦: `${hu.name}（上${hu.upper}下${hu.lower}）对体「${huRel}」`,
        变卦: `${bian.name}（${bian.wuxing}）对体「${bianRel}」`,
        错卦: j.cuo.name,
        综卦: j.zong.name,
        体用断: TIYONG_JUDGE[j.ty.rel] ?? '—',
        ...(penNote ? { 笔画说明: penNote } : {}),
        ...(mode === 'waiying' ? { 外应: extractWaiYing(chart?.question).text } : {}),
        ...j.detail,
      },
    })
  }, '梅花'),

  // ─────────────── #9 梅花·体用生克 ───────────────
  tiyong: guard(function tiyong(chart, entry, rand) {
    const y = yearZhiNum(chart); const mo = lunarMonth(chart); const d = lunarDay(chart); const h = hourZhiNum(chart)
    const g = guaFromNumbers(y + mo + d, y + mo + d + h, y + mo + d + h)
    const j = judgeGua(chart, g.bits, [g.movePos])
    const ty = j.ty
    const mWx = monthWxOf(chart)
    const gasTi = wangShuai(ty.tiWx, mWx)
    const gasYong = wangShuai(ty.yongWx, mWx)
    const hu = hexInfoOf(huGua(g.bits))
    const bian = hexInfoOf(g.changed)
    const huRel = relation(ty.tiWx, hu.wuxing)
    const bianRel = relation(ty.tiWx, bian.wuxing)

    let score = ty.score
    const evidence = [
      `体用定义：动爻第${ty.pos}爻在下卦 → 下卦${ty.yong}为用、上卦${ty.ti}为体（《梅花易数·体用总诀》）`,
      `体${ty.ti}(${ty.tiWx}) 用${ty.yong}(${ty.yongWx}) 为「${ty.rel}」→ 基础分${ty.score}`,
    ]
    const tiGas = (gasTi.score - 55) * 0.45
    const yongGas = (gasYong.score - 55) * 0.30
    score += tiGas - yongGas
    evidence.push(`体之月令旺衰：体${ty.tiWx}值月令${mWx}为「${gasTi.state}」→ ${signed(tiGas)}`)
    evidence.push(`用之月令旺衰：用${ty.yongWx}为「${gasYong.state}」→ 体旺用衰则吉，此处 ${signed(-yongGas)}`)
    const huPart = ({ 生我: 14, 比和: 8, 我克: 4, 我生: -6, 克我: -16 }[huRel] ?? 0)
    const bianPart = ({ 生我: 18, 比和: 10, 我克: 6, 我生: -8, 克我: -22 }[bianRel] ?? 0)
    score += huPart + bianPart
    evidence.push(`互卦${hu.name}(${hu.wuxing})与体「${huRel}」→ ${signed(huPart)}（中程）`)
    evidence.push(`变卦${bian.name}(${bian.wuxing})与体「${bianRel}」→ ${signed(bianPart)}（终局）`)
    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[ty.tiWx] += 2.5
    wuxing[ty.yongWx] += 1.5
    wuxing[mWx] += 1
    wuxing[hu.wuxing] += 0.5

    return ok({
      score,
      essence: `体用·体${ty.ti}(${ty.tiWx})${gasTi.state} 用${ty.yong}${gasYong.state}·${ty.rel}`,
      keys: [`体${ty.ti}`, `用${ty.yong}`, ty.rel, `体${gasTi.state}`, `互${hu.name}`].slice(0, 6),
      wuxing,
      timing: guaNumTiming(g.bits),
      fidelity: 'full',
      detail: {
        cite: '《梅花易数·体用生克篇》《体用总诀》',
        rule: '体为己、用为事；用生体/比和则吉，体生用/用克体则凶；再参体用月令旺衰旺衰、互卦（中程）、变卦（终局）',
        evidence,
        卦: `${j.ben.name}之${bian.name}`,
        体: `${ty.ti}（${ty.tiWx}·${gasTi.state}·${tri(ty.ti).xiang}）`,
        用: `${ty.yong}（${ty.yongWx}·${gasYong.state}·${tri(ty.yong).xiang}）`,
        关系: ty.rel,
        互卦: `${hu.name}（${hu.wuxing}）与体「${huRel}」`,
        变卦: `${bian.name}（${bian.wuxing}）与体「${bianRel}」`,
        错卦: j.cuo.name,
        综卦: j.zong.name,
        断: TIYONG_JUDGE[ty.rel] ?? '—',
        简断: '体宜旺相、用宜衰静；体受生制之别，即事之成败迟速',
      },
    })
  }, '体用'),

  // ─────────────── #10 京房易传·八宫 ───────────────
  palace: guard(function palace(chart, entry, rand) {
    const g = castSix(rand, 'coin', chart?.coins)
    const name = hexInfoOf(g.bits).name
    const pal = palaceOf(name)
    const gua = zhuangGua(g.bits, chart)
    const shi = gua.lines.find((l) => l.isShi)
    const ying = gua.lines.find((l) => l.isYing)
    const mWx = monthWxOf(chart)
    const ws = wangShuai(shi.wuxing, mWx)
    const palWx = tri(pal.palace).wx
    const palGas = wangShuai(palWx, mWx)
    const stageBias = { 本宫: 18, 一世: 8, 二世: 6, 三世: 0, 四世: -4, 五世: -8, 游魂: -16, 归魂: -6 }[pal.stage] ?? 0
    const evidence = [
      `八宫归属：${name}属${pal.palace}宫第${pal.index + 1}位（${pal.stage}），宫之五行${palWx}`,
      `宫气：${palWx}值月令${mWx}为「${palGas.state}」→ ${signed((palGas.score - 55) * 0.5)}`,
      `世爻：第${pal.shi}爻 ${shi.gan}${shi.zhi}(${shi.wuxing}) ${shi.qin}，月建「${ws.state}」→ ${signed((ws.score - 55) * 0.5)}`,
      `位次修正：${pal.stage} → ${signed(stageBias)}`,
    ]
    let score = polarityOf(name) * 0.45 + (palGas.score - 55) * 0.5 + (ws.score - 55) * 0.5 + stageBias
    if (shi.kong) {
      const sk = kongEffect(shi, g.moving.includes(shi.pos))
      score += sk.delta * 0.6
      evidence.push(`世爻旬空性质：${sk.kind}（${sk.note}）→ ${signed(sk.delta * 0.6)}`)
    }
    // 飞伏：飞神＝本卦世位之爻；伏神＝本宫首卦（八纯卦）同位之爻。五态依 spec §C4
    const headBits = [...pal.headBits]
    const headGua = zhuangGua(headBits, chart, { palaceInfo: { palace: pal.palace, index: 0, stage: '本宫', shi: 6, headBits } })
    const fei = shi
    const fu = headGua.lines[pal.shi - 1]
    const ffSt = feiFuState(fei.wuxing, fu.wuxing)
    score += ffSt.delta
    evidence.push(`飞伏五态：飞神（本卦${pal.shi}爻）${fei.gan}${fei.zhi}(${fei.wuxing}) ／ 伏神（本宫首卦${pal.shi}爻）${fu.gan}${fu.zhi}(${fu.wuxing}) → ${ffSt.name}：${ffSt.judge} → ${signed(ffSt.delta)}`)
    score = clamp(score, -100, 100)

    const stageJudge = {
      本宫: '本宫卦：纯一不杂，事有正主，气厚',
      一世: '一世卦：事方萌动，一阳初起',
      二世: '二世卦：事渐成形，内外始交',
      三世: '三世卦：内外卦交界，事已过半',
      四世: '四世卦：事入外卦，渐见结果',
      五世: '五世卦：事至高位，成败将分',
      游魂: '游魂卦：神魂游移，事多反复变易、去而不返',
      归魂: '归魂卦：事复归本，去者复返、返本还原',
    }[pal.stage] ?? '—'

    return ok({
      score,
      essence: `八宫·${pal.palace}宫${pal.stage} 世${shi.qin}${shi.zhi}${ws.state}`,
      keys: [`${pal.palace}宫`, pal.stage, `世${shi.qin}`, `宫气${palGas.state}`, `世${ws.state}`].slice(0, 6),
      wuxing: { [palWx]: 2.5, [shi.wuxing]: 1.5, [mWx]: 1 },
      timing: `${shi.zhi}日`,
      fidelity: 'full',
      detail: {
        cite: '《京房易传》八宫卦次、世应飞伏；《火珠林》游魂归魂之义',
        rule: '八宫卦次定世位与位次；宫之五行按**月令**判旺衰；世爻旺衰与飞伏定主体之情',
        evidence,
        卦: name,
        宫: `${pal.palace}宫（五行${palWx}）`,
        位次: `${pal.index + 1}/8 · ${pal.stage}`,
        世爻: `第${pal.shi}爻 ${shi.gan}${shi.zhi}(${shi.wuxing}) ${shi.qin} ${shi.shen}`,
        应爻: `第${((pal.shi - 1 + 3) % 6) + 1}爻 ${ying.gan}${ying.zhi}(${ying.wuxing}) ${ying.qin}`,
        飞伏: `飞 ${fei.gan}${fei.zhi}(${fei.wuxing}) ／ 伏 ${fu.gan}${fu.zhi}(${fu.wuxing}) → ${ffSt.name}（${ffSt.judge}）`,
        八宫卦序: PALACE_HEAD.includes(pal.palace)
          ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const hb = tri(pal.palace).bits.slice()
            const seq = [hb.slice(), flipAt(hb, [0]), flipAt(hb, [0, 1]), flipAt(hb, [0, 1, 2]), flipAt(hb, [0, 1, 2, 3]), flipAt(hb, [0, 1, 2, 3, 4]), flipAt(flipAt(hb, [0, 1, 2, 3, 4]), [3]), flipAt(flipAt(flipAt(hb, [0, 1, 2, 3, 4]), [3]), [0, 1, 2])][i]
            return `${PALACE_STAGE_NAME[i]}:${L_HEX_BY_NAME[triNameOfBits(hb.slice(3, 6))] && hexInfoOf(seq).name}`
          }).join(' → ')
          : '—',
        位次断: stageJudge,
        月令旺衰: `宫${palWx}为「${palGas.state}」`,
        旬空: gua.kong.join(''),
        神煞: shenshaText(chart, shi.zhi) ? `世${shi.zhi}见：${shenshaText(chart, shi.zhi)}` : `世${shi.zhi}未见所载神煞`,
      },
    })
  }, '八宫'),

  // ─────────────── #11 火珠林古法 ───────────────
  huozhulin: guard(function huozhulin(chart, entry, rand) {
    const g = castSix(rand, 'coin', chart?.coins)
    const gua = zhuangGua(g.bits, chart)
    const ug = useGodOf(chart)
    const yong = pickYong(gua, ug.god)
    const mZhi = chart?.monthZhi ?? ''
    const dZhi = chart?.dayZhi ?? ''
    const mWx = monthWxOf(chart)
    const dWx = dayWxOf(chart)
    const evidence = ['火珠林要旨：「月建为提纲，日辰为主宰」——先看月建生克，再看日辰生克，次论空破与动变']
    let score = 0

    if (yong) {
      const mws = wangShuai(yong.wuxing, mWx)
      const dws = wangShuai(yong.wuxing, dWx)
      score += (mws.score - 55) * 0.7 + (dws.score - 55) * 0.6
      evidence.push(`用神${ug.god}落${yong.posName}爻(${yong.zhi}${yong.wuxing})：月建${mZhi}为「${mws.state}」→ ${signed((mws.score - 55) * 0.7)}；日辰${dZhi}为「${dws.state}」→ ${signed((dws.score - 55) * 0.6)}`)
      if (mws.state === '旺' && (dws.state === '旺' || dws.state === '相')) { score += 18; evidence.push('月建日辰俱旺用神 → 得时得势（+18）') }
      if (mws.state === '死' || mws.state === '囚') { score -= 16; evidence.push(`用神月令「${mws.state}」失时 → −16`) }
      if (yong.yueChong) { score -= 24; evidence.push('用神逢月破：月建冲之，根基已伤（−24）') }
      if (yong.riChong) { score -= 14; evidence.push('用神逢日破：日辰冲之（−14）') }
      if (yong.kong) { score -= 18; evidence.push('用神旬空：待出空之期方应（−18）') }
      if (yong.linRi) { score += 16; evidence.push('用神临日建：当日得气（+16）') }
      if (yong.linYue) { score += 18; evidence.push('用神临月建：当月当令（+18）') }
    } else {
      score -= 16
      evidence.push(`用神${ug.god}不上卦（−16）；古法以伏神论之`)
    }

    const jt = jinTuiOf(gua, g.changed, g.moving)
    for (const x of jt) {
      if (x.象 === '进神') { score += 12; evidence.push(`古法重进退：${x.断} → +12`) }
      else if (x.象 === '退神') { score -= 12; evidence.push(`古法重进退：${x.断} → −12`) }
      else evidence.push(`存疑项：${x.断}（四土进退默认不判，不计分）`)
    }
    const ff = fanFuOf(gua, g.bits, g.changed, g.moving)
    if (ff.爻反吟.length) { score -= 8 * Math.min(2, ff.爻反吟.length); evidence.push(`爻反吟：${ff.爻反吟.join('、')} → −8/爻（古法主反覆）`) }
    if (ff.爻伏吟.length) { score -= 6 * Math.min(2, ff.爻伏吟.length); evidence.push(`爻伏吟：${ff.爻伏吟.join('、')} → −6/爻`) }
    if (ff.卦反吟) { score -= 16; evidence.push('卦反吟：本卦与变卦互为六冲 → −16') }
    if (ff.卦伏吟) { score -= 8; evidence.push('卦伏吟：六爻皆静，事停滞 → −8') }
    const chongHeHL = chongHeOf(gua)
    if (chongHeHL === '六冲卦') { score -= 10; evidence.push('本卦六冲（纳甲三对全冲穷举判定）：主散、主快 → −10') }
    else if (chongHeHL === '六合卦') { score += 10; evidence.push('本卦六合（纳甲三对全合穷举判定）：主合、主成 → +10') }
    score = clamp(score, -100, 100)

    const mws0 = yong ? wangShuai(yong.wuxing, mWx) : null
    const wuxing = emptyWuxing()
    wuxing[mWx] += 2
    wuxing[dWx] += 2
    if (yong) wuxing[yong.wuxing] += 1.5

    return ok({
      score,
      essence: `火珠林·${gua.name} ${ug.god}${mws0 ? `月${mws0.state}` : '不上卦'}${yong?.kong ? '空' : ''}`,
      keys: [gua.name, '日月为纲', ug.god, ...(mws0 ? [`月${mws0.state}`] : []), ...(yong?.kong ? ['用神空亡'] : [])].slice(0, 6),
      wuxing,
      timing: yong ? `${yong.zhi}日` : null,
      fidelity: 'core',
      detail: {
        cite: '《火珠林》古法六爻；《增删卜易·月建日辰》「月建为提纲，日辰为主宰」',
        rule: '不重卦名吉凶，先以月建判用神得令与否、再以日辰判当下之力，次论旬空/月破/日破/进退神/反吟伏吟',
        未核实说明: '《火珠林》原文：本轮调研 9 个仓库全文检索 **0 命中**（spec「未核实清单」），'
          + '故本法的规则骨架取自《增删卜易》月建日辰体系，**不冒充《火珠林》条文**。',
        evidence,
        卦: `${gua.name}（${gua.palace}宫${gua.stage}）`,
        月建: `${chart?.ganzhi?.month ?? ''}（${mWx}）`,
        日辰: `${chart?.ganzhi?.day ?? ''}（${dWx}）`,
        用神: `${ug.god}（${ug.why}）`,
        用神状态: yong ? `${yong.posName}爻 ${yong.gan}${yong.zhi}(${yong.wuxing}) ${yong.qin}｜月${mws0.state}${yong.riChong ? ' 日破' : ''}${yong.yueChong ? ' 月破' : ''}${yong.kong ? ` 旬空(${kongEffect(yong, g.moving.includes(yong.pos)).kind})` : ''}${yong.linRi ? ' 临日' : ''}` : '不上卦',
        装卦: gua.lines.map((l, i) => lineText(gua, i, g.values, '')),
        进退神: jt.length ? jt.map((x) => `${x.位}:${x.象}—${x.断}`).join('；') : '无',
        反吟伏吟: ff.象 === '无' ? '非反吟亦非伏吟' : ff.断,
        六冲六合: chongHeHL || '常卦（纳甲三对全冲/全合穷举）',
        旬空: gua.kong.join(''),
        神煞: (() => {
          const z = yong?.zhi ?? ''
          const t = shenshaText(chart, z)
          return t ? `用神${z}见：${t}` : `用神${z || '—'}未见所载神煞（chart.shenshaAll 缺位或未命中）`
        })(),
        古法要旨: '以钱代蓍，专重月建提纲、日辰主宰；用神得日月生扶则吉，空破受克则凶',
      },
    })
  }, '火珠林'),

  // ─────────────── #12 文王卦·用神法 ───────────────
  yongshen: guard(function yongshen(chart, entry, rand) {
    const g = castSix(rand, 'coin', chart?.coins)
    const gua = zhuangGua(g.bits, chart)
    const ug = useGodOf(chart)
    const yong = pickYong(gua, ug.god)
    const alt = ug.alt ? pickYong(gua, ug.alt) : null
    const mWx = monthWxOf(chart)
    const evidence = []
    let score = 0

    if (yong) {
      const ws = wangShuai(yong.wuxing, mWx)
      score += (ws.score - 55) * 0.8
      evidence.push(`用神：${ug.god}（${ug.why}）落${yong.posName}爻 ${yong.zhi}(${yong.wuxing})，月令「${ws.state}」→ ${signed((ws.score - 55) * 0.8)}`)
      const roles = shenRoleOf(gua, yong.wuxing)
      evidence.push(`六亲角色：原神＝${roles.yuanQin || '无'}（生用神）、忌神＝${roles.jiQin || '无'}（克用神）`)
      if (roles.yuan) {
        const yws = wangShuai(roles.yuan.wuxing, mWx)
        const v = (yws.score - 55) * 0.45 + 6
        score += v
        evidence.push(`原神${roles.yuan.posName}爻(${roles.yuan.zhi}${roles.yuan.wuxing})月令「${yws.state}」→ 生扶用神 ${signed(v)}`)
      } else { evidence.push('原神不上卦：用神无生扶之源') }
      if (roles.ji) {
        const jws = wangShuai(roles.ji.wuxing, mWx)
        const v = -((jws.score - 55) * 0.45 + 6)
        score += v
        evidence.push(`忌神${roles.ji.posName}爻(${roles.ji.zhi}${roles.ji.wuxing})月令「${jws.state}」→ 克害用神 ${signed(v)}`)
      } else { evidence.push('忌神不上卦：克害无力') }
      if (yong.kong) { score -= 16; evidence.push('用神旬空 → 事暂虚（−16）') }
      if (yong.yueChong) { score -= 18; evidence.push('用神月破 → −18') }
      if (!roles.yuan && !roles.ji) evidence.push('无原无忌：吉凶专看用神自身旺衰')
    } else {
      score -= 18
      evidence.push(`用神${ug.god}不上卦（−18）：须取伏神或另寻他爻`)
    }
    if (alt) {
      const aws = wangShuai(alt.wuxing, mWx)
      evidence.push(`辅用神（${ug.alt}）：${alt.posName}爻 ${alt.zhi}(${alt.wuxing}) 月令「${aws.state}」`)
    }

    const shi = gua.lines.find((l) => l.isShi)
    const ying = gua.lines.find((l) => l.isYing)
    const sr = relation(shi.wuxing, ying.wuxing)
    const sv = { 生我: 22, 比和: 12, 我克: 16, 我生: -6, 克我: -22 }[sr] ?? 0
    score += sv * 0.5
    evidence.push(`世应：世${shi.zhi}(${shi.wuxing}) 应${ying.zhi}(${ying.wuxing}) 为「${sr}」→ ${signed(sv * 0.5)}`)

    const fu = yong ? null : fuShenOf(g.bits, chart, ug.god)
    if (fu) { evidence.push(`取伏神：${fu.伏神} 伏于 ${fu.飞神}（${fu.伏飞关系}；${fu.出伏}）`); score -= 6 }
    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    if (yong) wuxing[yong.wuxing] += 3
    wuxing[mWx] += 1
    const yws0 = yong ? wangShuai(yong.wuxing, mWx) : null

    return ok({
      score,
      essence: `用神·${ug.god}${yong ? `${yong.zhi}${yws0.state}` : '不上卦'}${yong?.kong ? '空' : ''}${sRoleTxt(gua, yong)}`,
      keys: [ug.god, ...(yong ? [`用神${yws0.state}`] : ['用神不上卦']), ...(sRoleTxt(gua, yong) ? [sRoleTxt(gua, yong)] : []), `世应${sr}`].slice(0, 6),
      wuxing,
      timing: yong ? `${yong.zhi}日` : (fu ? `${fu.zhi}日` : null),
      fidelity: 'core',
      detail: {
        cite: '《卜筮正宗·用神章》《原神忌神仇神章》；《增删卜易·用神章》',
        rule: '先按所问事类取用神；用神旺相有原神生扶则吉，忌神当权克害则凶；再参世应旺衰与空破',
        evidence,
        卦: `${gua.name}（${gua.palace}宫${gua.stage}）`,
        用神: `${ug.god} — ${ug.why}（${ug.cite}）`,
        用神爻: yong ? `${yong.posName}爻 ${yong.gan}${yong.zhi}(${yong.wuxing}) ${yong.qin} ${yong.shen}｜${yws0.state}${yong.kong ? '·旬空' : ''}` : '不上卦，取伏神',
        辅用神: ug.alt ? `${ug.alt}${alt ? `：${alt.posName}爻 ${alt.zhi}(${alt.wuxing})` : '（不上卦）'}` : '—',
        六亲角色: shenRoleOf(gua, yong?.wuxing ?? gua.meWx).table,
        伏神: fu ? `${fu.伏神} 伏于 ${fu.飞神}（${fu.伏飞关系}）` : '无',
        世应: `世${gua.shiPos}爻${shi.zhi} 应${gua.yingPos}爻${ying.zhi} → ${sr}`,
        装卦: gua.lines.map((l, i) => lineText(gua, i, g.values, '')),
        神煞: shenshaText(chart, yong?.zhi ?? '') ? `用神${yong?.zhi}见：${shenshaText(chart, yong?.zhi)}` : '用神之支未见所载神煞',
        旬空: gua.kong.join(''),
      },
    })
  }, '用神'),

  // ─────────────── #13 焦氏易林·卦变 ───────────────
  yilin: guard(function yilin(chart, entry, rand) {
    const g = castSix(rand, 'coin', chart?.coins)
    const ben = hexInfoOf(g.bits)
    const bian = hexInfoOf(g.changed)
    const linIndex = (orderOf(ben.name) - 1) * 64 + orderOf(bian.name)
    const mWx = monthWxOf(chart)
    const gas = wangShuai(ben.wuxing, mWx)
    const gasBian = wangShuai(bian.wuxing, mWx)
    const delta = bian.polarity - ben.polarity
    const moveCount = g.moving.length
    const evidence = [
      `林序：以本卦为「林」、之卦为「条」→ (${orderOf(ben.name)}−1)×64 + ${orderOf(bian.name)} = ${linIndex} / 4096`,
      `卦德：本卦${ben.name}${signed(ben.polarity)}、之卦${bian.name}${signed(bian.polarity)}，落差 ${signed(delta)}`,
      `月令旺衰：本卦五行${ben.wuxing}为「${gas.state}」、之卦五行${bian.wuxing}为「${gasBian.state}」`,
      `动爻：${moveCount} 爻动（之卦由此而出）`,
    ]
    const score = clamp(
      ben.polarity * 0.42 + bian.polarity * 0.38 + (gas.score - 55) * 0.25 + delta * 0.12
      - (moveCount >= 4 ? 6 : 0),
      -100, 100,
    )
    const wuxing = emptyWuxing()
    wuxing[ben.wuxing] += 2
    wuxing[bian.wuxing] += 2
    wuxing[mWx] += 1

    return ok({
      score,
      essence: `易林·${ben.name}之${bian.name}（林${linIndex}）${delta > 15 ? '趋吉' : delta < -15 ? '转凶' : '平变'}`,
      keys: [ben.name, `之${bian.name}`, `林${linIndex}`, delta > 15 ? '趋吉' : delta < -15 ? '转凶' : '平变'].slice(0, 6),
      wuxing,
      timing: guaNumTiming(g.bits),
      fidelity: 'approx',
      detail: {
        cite: '《焦氏易林》六十四卦各系六十四辞、共四千九十六林辞；「之」法见《左传》筮例',
        rule: '本卦为林、之卦为条；本插件未内置 4096 林辞原文，故以「本卦德 × 之卦德 × 月令旺衰 × 卦变落差」'
          + '的结构关系断吉凶，**不冒充林辞原文**',
        evidence,
        本卦: `${ben.name}（序${ben.order}·${ben.wuxing}·卦德${signed(ben.polarity)}）`,
        之卦: `${bian.name}（序${bian.order}·${bian.wuxing}·卦德${signed(bian.polarity)}）`,
        林序: `${linIndex} / 4096`,
        动爻: g.moving.length ? g.moving.map((p) => `第${p}爻`).join('、') : '无动爻（林辞取本卦）',
        卦变断: delta > 15 ? '由滞转通，事态向好' : delta < -15 ? '由顺转逆，宜早收手' : '事态平变，无大起落',
        '⚠': '⚠ 无林辞原文，本条为结构断语（fidelity=approx），非《易林》原辞',
        卦画: `${ben.lines} → ${bian.lines}`,
      },
    })
  }, '易林'),

  // ─────────────── #14 太玄数 ───────────────
  taixuan: guard(function taixuan(chart, entry, rand) {
    const ps = pillarsOf(chart)
    const nian = ps[0] || ''; const ri = ps[2] || ''; const shi = ps[3] || ''
    const numOf = (gz) => (gz.length === 2
      ? (TAIXUAN_NUM_GAN[gz[0]] ?? 5) + (TAIXUAN_NUM_ZHI[gz[1]] ?? 5)
      : 5)
    const nY = numOf(nian); const nS = numOf(ri); const nH = numOf(shi)
    const mZhiNum = mod(ZHI.indexOf(chart?.monthZhi ?? '子'), 12) + 1
    const sum = nY + nS + nH + mZhiNum + lunarDay(chart)
    const idx = mod(sum - 1, 81)           // 0..80
    const shou = TAIXUAN_81[idx] ?? '中'
    // 「一玄三方九州二十七部八十一家」：81 首 = 3 方 × 3 州 × 3 部 × 3 家
    const fang = Math.floor(idx / 27) + 1
    const zhou = Math.floor((idx % 27) / 9) + 1
    const bu = Math.floor((idx % 9) / 3) + 1
    const jia = (idx % 3) + 1
    const odd = (idx + 1) % 2 === 1
    const wuxingOfShou = ['木', '火', '土', '金', '水'][fang - 1]
    const mWx = monthWxOf(chart)
    const gas = wangShuai(wuxingOfShou, mWx)
    const evidence = [
      `取数：太玄数（甲己子午九、乙庚丑未八、丙辛寅申七、丁壬卯酉六、戊癸辰戌五、巳亥四）`
        + `→ 年柱${nian}=${nY}、日柱${ri}=${nS}、时柱${shi}=${nH}，加月支序${mZhiNum}与农历日${lunarDay(chart)} = ${sum}`,
      `定首：(${sum} − 1) mod 81 = ${idx}（0 起）→ 第 ${idx + 1} 首「${shou}」`,
      `部位：「一玄三方九州二十七部八十一家」→ ${fang}方 ${zhou}州 ${bu}部 ${jia}家`,
      `首序奇偶：${idx + 1} 为${odd ? '奇（阳）' : '偶（阴）'}`,
      `首之五行（按方配）：${wuxingOfShou}，值月令${mWx}为「${gas.state}」`,
    ]
    let score = (odd ? 16 : -16) + (fang === 2 ? 10 : -4) + (bu === 2 ? 8 : 0) + (gas.score - 55) * 0.3
    if (bu === 3) score -= 6
    score = clamp(score, -100, 100)
    return ok({
      score,
      essence: `太玄·第${idx + 1}首「${shou}」${fang}方${zhou}州${bu}部${jia}家·${odd ? '奇' : '偶'}${gas.state}`,
      keys: [`首${shou}`, `${fang}方${zhou}州`, `${bu}部${jia}家`, odd ? '奇' : '偶', `气${gas.state}`].slice(0, 6),
      wuxing: { [wuxingOfShou]: 3, [mWx]: 1 },
      timing: `${jia + bu}日`,
      fidelity: 'approx',
      detail: {
        cite: '《太玄经》八十一首、三方九州二十七部八十一家；太玄数（玄空家通用）',
        rule: '以四柱之太玄数取和、mod 81 定首；方州部家定位；首序奇偶与方之五行配月令定吉凶倾向',
        evidence,
        首名: `${idx + 1}. ${shou}`,
        方州部家: `${fang}方 ${zhou}州 ${bu}部 ${jia}家`,
        太玄数: { 年柱: `${nian}=${nY}`, 日柱: `${ri}=${nS}`, 时柱: `${shi}=${nH}`, 月支序: mZhiNum, 农历日: lunarDay(chart), 和: sum },
        '⚠': '⚠ 八十一首首辞原文未内置；吉凶按首序奇偶、方州部家之位置通例取值（fidelity=approx）。'
          + '另：《太玄》本经自有揲蓍法，本插件未采用（未能核实），取数口径见上',
      },
    })
  }, '太玄'),

  // ─────────────── #15 元包数 ───────────────
  yuanbao: guard(function yuanbao(chart, entry, rand) {
    const g = castSix(rand, 'coin', chart?.coins)
    const ben = hexInfoOf(g.bits)
    const mWx = monthWxOf(chart)
    const gas = wangShuai(ben.wuxing, mWx)
    // 元包以坤为首，八卦次序为归藏序：坤乾兑艮离坎巽震
    const upIdx = YUANBAO_ORDER.indexOf(ben.upper)
    const loIdx = YUANBAO_ORDER.indexOf(ben.lower)
    const ybOrder = upIdx * 8 + loIdx + 1
    const evidence = [
      '元包八卦次序（归藏序，以坤为首）：坤乾兑艮离坎巽震',
      `${ben.name}：上卦${ben.upper}居归藏第${upIdx + 1}、下卦${ben.lower}居第${loIdx + 1} → 元包位序 ${ybOrder} / 64`,
      `卦德：${ben.name}${signed(ben.polarity)}；月令旺衰：${ben.wuxing}值月令${mWx}为「${gas.state}」`,
    ]
    let score = ben.polarity * 0.55 + (gas.score - 55) * 0.35
    // 坤为首：得坤（位序1）者主顺、主静守；乾坤为首卦，气厚
    if (ben.name === '坤为地') { score += 14; evidence.push('元包首卦坤，得坤者主顺静厚载 → +14') }
    if (ben.name === '乾为天') { score += 10; evidence.push('归藏次乾，得乾者主健 → +10') }
    score = clamp(score, -100, 100)
    return ok({
      score,
      essence: `元包·${ybOrder}/64 ${ben.name}（归藏序，坤为首）${gas.state}`,
      keys: ['元包', `序${ybOrder}`, ben.name, `气${gas.state}`].slice(0, 6),
      wuxing: { [ben.wuxing]: 3, [mWx]: 1 },
      timing: guaNumTiming(g.bits),
      fidelity: 'approx',
      detail: {
        cite: '卫元嵩《元包》以坤为首（归藏序：坤乾兑艮离坎巽震）；《归藏》佚文八卦次序',
        rule: '按归藏八卦序重排六十四位得元包位序；以周易卦德与月令旺衰推吉凶倾向',
        evidence,
        卦: ben.name,
        元包位序: `${ybOrder} / 64`,
        归藏序: YUANBAO_ORDER.join(' '),
        '⚠': '⚠ 《元包》自有卦名与卦辞（如「太阴」「太阳」等），本插件未内置，故不冒充元包原文，'
          + '仅按归藏位序与卦德取象（fidelity=approx）',
        卦画: ben.lines,
      },
    })
  }, '元包'),

  // ─────────────── #16 潜虚数 ───────────────
  qianxu: guard(function qianxu(chart, entry, rand) {
    const g = castSix(rand, 'coin', chart?.coins)
    const ben = hexInfoOf(g.bits)
    const y = yearZhiNum(chart); const mo = lunarMonth(chart); const d = lunarDay(chart); const h = hourZhiNum(chart)
    const mZhiNum = mod(ZHI.indexOf(chart?.monthZhi ?? '子'), 12) + 1
    // 潜虚五十五名：以五行×十一位为结构；无原文可据 → 只用名序结构
    const base = y + mo + d + h + mZhiNum + ben.order
    const idx = mod(base - 1, 55) + 1
    const xing = ['水', '火', '木', '金', '土'][Math.floor((idx - 1) / 11)]
    const wei = ((idx - 1) % 11) + 1
    const mWx = monthWxOf(chart)
    const gas = wangShuai(xing, mWx)
    const evidence = [
      '潜虚结构：司马光《潜虚》以五行为本、共五十五名（五行各十一名）',
      `取数：年支${y}+月${mo}+日${d}+时支${h}+月支序${mZhiNum}+卦序${ben.order} = ${base}；mod 55 → 第 ${idx} 名`,
      `名属：第 ${Math.floor((idx - 1) / 11) + 1} 行（${xing}）第 ${wei} 位`,
      `卦：${ben.name}（卦德${signed(ben.polarity)}）；名之五行值月令${mWx}为「${gas.state}」`,
    ]
    let score = ben.polarity * 0.45 + (gas.score - 55) * 0.35
    if (wei <= 3) score += 8
    if (wei >= 9) score -= 8
    score = clamp(score, -100, 100)
    return ok({
      score,
      essence: `潜虚·第${idx}名（${xing}行${wei}位）${ben.name}${gas.state}`,
      keys: ['潜虚', `名${idx}`, `${xing}行`, `气${gas.state}`].slice(0, 6),
      wuxing: { [xing]: 2.5, [ben.wuxing]: 2, [mWx]: 1 },
      timing: `${wei}日`,
      fidelity: 'approx',
      detail: {
        cite: '司马光《潜虚》五十五名（以五行各十一名为结构）',
        rule: '以时数加卦序 mod 55 定名序；按名序所在之行（五行）与位次、并参卦德月令旺衰取吉凶',
        evidence,
        卦: ben.name,
        名序: `${idx} / 55`,
        名之行位: `${xing}行 第${wei}位`,
        取数: `年支${y} 月${mo} 日${d} 时支${h} 月支序${mZhiNum} 卦序${ben.order} → ${base}`,
        '⚠': '⚠ 《潜虚》五十五名之名目与名辞原文未内置，本插件仅用「五行×十一位」的名序结构，'
          + '不冒充原文（fidelity=approx）',
      },
    })
  }, '潜虚'),

  // ─────────────── #17 皇极经世 ───────────────
  huangji: guard(function huangji(chart, entry, rand) {
    // 一元十二会、一会三十运、一运十二世、一世三十年
    const BASE = 67017 // 一元之始纪元（通行推算：公元前 67017 年，未核实原书）
    const year = Number(chart?.solar?.y)
    const y0 = Number.isFinite(year) ? year : 1
    const elapsed = y0 + BASE
    const shiTotal = Math.floor(elapsed / 30)
    const yunTotal = Math.floor(shiTotal / 12)
    const huiTotal = Math.floor(yunTotal / 30)
    const yuanTotal = Math.floor(huiTotal / 12)
    const hui = mod(huiTotal, 12) + 1          // 1..12
    const yun = mod(yunTotal, 30) + 1          // 1..30
    const shi = mod(shiTotal, 12) + 1          // 1..12
    const zhiName = ZHI[hui - 1]
    const xiaoxi = XIAOXI_BY_ZHI[zhiName] ?? ''
    // 十二会配十二辟卦：子会一阳生（复）→ 巳会纯阳（乾）→ 午会一阴生（姤）→ 亥会纯阴（坤）
    const yangPhase = hui <= 6
    const phaseScore = yangPhase ? 10 + (hui - 1) * 8 : -10 - (hui - 7) * 8
    const yunHalf = yun <= 15
    const evidence = [
      '元会运世：1元=12会=360运=4320世=129600年；1会=30运；1运=12世；1世=30年',
      `纪元：一元之始取公元前 ${BASE} 年（通行推算值，⚠未核实原书）→ 公元 ${y0} 年值第 ${yuanTotal + 1} 元`,
      `定位：第 ${huiTotal + 1} 会（${zhiName}会）第 ${yun} 运第 ${shi} 世`,
      `十二会配十二辟卦：${zhiName}会值「${xiaoxi}」，${yangPhase ? '阳长之期' : '阴长之期'}`,
      `运位：本会第 ${yun} 运，${yunHalf ? '运居前半（进气）' : '运居后半（退气）'}`,
    ]
    const score = clamp(phaseScore + (yunHalf ? 8 : -8) + (shi <= 6 ? 4 : -4), -100, 100)
    const wx = ['水', '木', '火', '土'][(hui - 1) % 4]
    return ok({
      score,
      essence: `皇极·${huiTotal + 1}会${yun}运${shi}世（${zhiName}会${xiaoxi}）${yangPhase ? '阳长' : '阴长'}`,
      keys: [`${huiTotal + 1}会`, `${yun}运`, xiaoxi, yangPhase ? '阳长' : '阴长', `${zhiName}会`].slice(0, 6),
      wuxing: { [wx]: 3 },
      timing: null,
      fidelity: 'core',
      detail: {
        cite: '邵雍《皇极经世书·观物篇》「一元十二会、一会三十运、一运十二世、一世三十年」；十二会配十二辟卦',
        rule: '以纪元基准推元会运世之位；十二会配十二辟卦定阴阳消长，运居前后半与世之先后定进退',
        evidence,
        元会运世: `${yuanTotal + 1}元 ${hui}会 ${yun}运 ${shi}世`,
        值会: `${zhiName}会 · ${xiaoxi}`,
        气运: `${yangPhase ? '阳长' : '阴长'}之期 · 运居${yunHalf ? '前' : '后'}半`,
        值年: y0,
        '⚠': `⚠ 一元之始纪元取公元前 ${BASE} 年（通行推算值），未核实《皇极经世》原书推算，`
          + '元会运世之绝对位次或与别本不同；阴阳消长结构不受影响',
      },
    })
  }, '皇极'),

  // ─────────────── #18 河洛理数·先天卦 ───────────────
  heluo: guard(function heluo(chart, entry, rand) {
    const ps = pillarsOf(chart)
    const nayinWx = (gz) => {
      const g = gz[0] ?? ''
      return GAN_WUXING[g] ?? '土'
    }
    const heTuNum = (wx, yang) => ({ 水: yang ? 1 : 6, 火: yang ? 2 : 7, 木: yang ? 3 : 8, 金: yang ? 4 : 9, 土: yang ? 5 : 10 }[wx] ?? 5)
    const isYangGan = (g) => [0, 2, 4, 6, 8].includes(GAN.indexOf(g))
    const nYear = heTuNum(nayinWx(ps[0] || ''), isYangGan((ps[0] || '甲')[0]))
    const nMonth = heTuNum(nayinWx(ps[1] || ''), isYangGan((ps[1] || '甲')[0]))
    const nDay = heTuNum(nayinWx(ps[2] || ''), isYangGan((ps[2] || '甲')[0]))
    const nHour = heTuNum(nayinWx(ps[3] || ''), isYangGan((ps[3] || '甲')[0]))
    const mZhiNum = mod(ZHI.indexOf(chart?.monthZhi ?? '子'), 12) + 1
    const upN = m8(nYear + nMonth + lunarMonth(chart))
    const loN = m8(nDay + nHour + lunarDay(chart))
    const mv = m6(nYear + nMonth + nDay + nHour + mZhiNum)
    const g = guaFromNumbers(upN, loN, mv)
    const j = judgeGua(chart, g.bits, [g.movePos])
    const mWx = monthWxOf(chart)
    const heTuWx = (n) => ['水', '火', '木', '金', '土'][(n - 1) % 5]
    const wxUp = heTuWx(upN); const wxLo = heTuWx(loN)
    const gasUp = wangShuai(wxUp, mWx)
    const evidence = [
      '河图生成数：天一生水地六成之、地二生火天七成之、天三生木地八成之、地四生金天九成之、天五生土地十成之'
        + '（1/6水 2/7火 3/8木 4/9金 5/10土）',
      `四柱河图数：年${ps[0] ?? ''}=${nYear}、月${ps[1] ?? ''}=${nMonth}、日${ps[2] ?? ''}=${nDay}、时${ps[3] ?? ''}=${nHour}`,
      `上卦数 = 年数${nYear} + 月数${nMonth} + 农历月${lunarMonth(chart)} = ${nYear + nMonth + lunarMonth(chart)} → ÷8 余 ${upN}（${g.upT.name}）`,
      `下卦数 = 日数${nDay} + 时数${nHour} + 农历日${lunarDay(chart)} = ${nDay + nHour + lunarDay(chart)} → ÷8 余 ${loN}（${g.loT.name}）`,
      `动爻 = (${nYear}+${nMonth}+${nDay}+${nHour}+月支序${mZhiNum}) = ${nYear + nMonth + nDay + nHour + mZhiNum} → ÷6 余 ${mv}`,
      `河图五行：上卦${wxUp}值月令${mWx}为「${gasUp.state}」`,
      ...j.evidence,
    ]
    const score = clamp(j.score + (gasUp.score - 55) * 0.3, -100, 100)
    const wuxing = emptyWuxing()
    wuxing[wxUp] += 2; wuxing[wxLo] += 2; wuxing[mWx] += 1
    return ok({
      score,
      essence: `河洛·${j.ben.name}之${j.bian.name}·河图${wxUp}${gasUp.state}`,
      keys: [j.ben.name, `河图${wxUp}`, `气${gasUp.state}`, j.ty.rel, `之${j.bian.name}`].slice(0, 6),
      wuxing,
      timing: guaNumTiming(g.bits),
      fidelity: 'core',
      detail: {
        cite: '《河图》《洛书》生成数；《河洛理数》（蔡元定）以河洛数化卦之体例；后天八卦配洛书数',
        rule: '四柱干支取河图生成数（阳干取生数、阴干取成数）→ 上卦取年+月数、下卦取日+时数 → 除八取余；'
          + '动爻由四数与月支序总和除六取余；吉凶参卦德、体用与河图五行之月令旺衰',
        evidence,
        数: `年${nYear} 月${nMonth} 日${nDay} 时${nHour}`,
        上卦: `${g.upT.name}（河图${wxUp}·${gasUp.state}）`,
        下卦: `${g.loT.name}（河图${wxLo}）`,
        动爻: `第${mv}爻`,
        体用: `${j.ty.ti}(${j.ty.tiWx}) / ${j.ty.yong}(${j.ty.yongWx}) → ${j.ty.rel}`,
        '⚠': '⚠ 《河洛理数》全书另有天地数、四柱纳音与命卦体例，本插件未采其全法；'
          + '此处只用河图生成数与八卦数起卦，体例见「rule」',
        ...j.detail,
      },
    })
  }, '河洛'),

  // ─────────────── #19 灵棋经 ───────────────
  lingqi: guard(function lingqi(chart, entry, rand) {
    const groups = LINGQI_GROUPS.map((gd) => {
      const coins = [0, 1, 2, 3].map(() => (rand.chance(0.5) ? 1 : 0))
      const yang = coins.reduce((a, b) => a + b, 0)
      return { pos: gd.pos, xiang: gd.xiang, weight: gd.weight, coins, yang }
    })
    const totalYang = groups.reduce((s, g) => s + g.yang, 0)
    const weightYang = groups.reduce((s, g) => s + g.yang * g.weight, 0)
    const weightMax = groups.reduce((s, g) => s + 4 * g.weight, 0)
    const keIndex = groups[0].yang * 25 + groups[1].yang * 5 + groups[2].yang
    const mWx = monthWxOf(chart)
    const evidence = [
      '十二棋分上四/中四/下四三组，每组四枚，正为阳、反为阴（《灵棋经》）',
      `三组正反：上四${groups[0].yang}阳、中四${groups[1].yang}阳、下四${groups[2].yang}阳 → 共 ${totalYang} / 12 阳`,
      `课象位序：上×25 + 中×5 + 下 = ${keIndex}（0–124，共 125 位；通行本录 124 课）`,
      `加权（上四权重1.35、中四1.0、下四0.8）：${weightYang.toFixed(1)} / ${weightMax.toFixed(1)}`,
      '上为天·君·父·外·远，中为人·己·事，下为地·臣·子·内·近',
    ]
    const mid = weightMax / 2
    let score = ((weightYang - mid) / mid) * 70
    if (groups[1].yang === 4) { score += 8; evidence.push('中四全阳：人事得主，事有主宰 → +8') }
    if (groups[1].yang === 0) { score -= 10; evidence.push('中四全阴：人事无主，事缺主张 → −10') }
    if (groups[0].yang >= 3) { score += 6; evidence.push('上四多阳：得时得势于外 → +6') }
    if (groups[2].yang >= 3) { score += 5; evidence.push('下四多阳：根基厚实 → +5') }
    if (totalYang === 6) { score -= 6; evidence.push('阴阳各半：势均而多疑，事难决（−6）') }
    score = clamp(score, -100, 100)
    const wx = totalYang >= 6 ? '火' : '水'
    return ok({
      score,
      essence: `灵棋·${groups.map((g) => g.yang).join('-')}（${totalYang}阳/12）${totalYang > 6 ? '阳盛主吉' : totalYang < 6 ? '阴盛主滞' : '阴阳各半'}`,
      keys: [`${groups[0].yang}${groups[1].yang}${groups[2].yang}`, `阳${totalYang}`, totalYang > 6 ? '阳盛' : totalYang < 6 ? '阴盛' : '阴阳各半', `课${keIndex}`].slice(0, 6),
      wuxing: { [wx]: 3, [mWx]: 1 },
      timing: `${12 - totalYang}日`,
      fidelity: 'approx',
      detail: {
        cite: '《灵棋经》十二棋、上中下各四；124 课之课象组合',
        rule: '掷十二棋（三组各四）成课；以上中下三组之阳数组合定课象位序，按阳数多寡与三位之象断吉凶',
        evidence,
        十二棋: groups.map((g) => `${g.pos} ${g.coins.map((c) => (c ? '正' : '反')).join('')}（阳${g.yang}）`).join(' | '),
        阳数: `${totalYang} / 12（加权 ${weightYang.toFixed(1)}）`,
        课象位序: `${keIndex} / 124（0–124 共 125 位，通行本录 124 课）`,
        三位之象: groups.map((g) => `${g.pos}：${g.xiang}（阳${g.yang}）`).join('；'),
        '⚠': '⚠ 灵棋经 124 课之课辞原文未内置，本插件不冒充课辞；吉凶由三组阳数结构与三位之象推得'
          + '（fidelity=approx）',
      },
    })
  }, '灵棋'),

  // ─────────────── #20 先天易数 ───────────────
  xiantian: guard(function xiantian(chart, entry, rand) {
    const y = yearZhiNum(chart); const mo = lunarMonth(chart); const d = lunarDay(chart); const h = hourZhiNum(chart)
    const upN = m8(y + mo)
    const loN = m8(mo + d)
    const mv = m6(d + h)
    const g = guaFromNumbers(upN, loN, mv)
    const j = judgeGua(chart, g.bits, [g.movePos])
    const mZhi = chart?.monthZhi ?? '子'
    const xiaoxi = XIAOXI_BY_ZHI[mZhi] ?? ''
    const xiaoxiInfo = hexInfoOf(parseHexNameToBits(xiaoxi))
    const mWx = monthWxOf(chart)
    const gasX = wangShuai(xiaoxiInfo.wuxing, mWx)
    const benGas = wangShuai(j.ben.wuxing, mWx)
    const evidence = [
      '先天八卦数（《皇极经世》伏羲次序）：乾1 兑2 离3 震4 巽5 坎6 艮7 坤8',
      `上卦数 = 年支${y} + 月${mo} = ${y + mo} → ÷8 余 ${upN}（${g.upT.name}）`,
      `下卦数 = 月${mo} + 日${d} = ${mo + d} → ÷8 余 ${loN}（${g.loT.name}）`,
      `动爻 = 日${d} + 时支${h} = ${d + h} → ÷6 余 ${mv}`,
      `月建辟卦（十二消息卦）：月建${mZhi}值「${xiaoxi}」（${xiaoxiInfo.wuxing}）为「${gasX.state}」`,
      ...j.evidence,
    ]
    // 先天卦与辟卦同类（五行相同）为「气合」，主顺
    const hePart = xiaoxiInfo.wuxing === j.ben.wuxing ? 14 : relation(xiaoxiInfo.wuxing, j.ben.wuxing) === '生我' ? 8 : -6
    evidence.push(`先天卦${j.ben.name}(${j.ben.wuxing}) 与值月辟卦${xiaoxi}(${xiaoxiInfo.wuxing}) 相较 → ${signed(hePart)}`)
    const score = clamp(j.score + hePart + (benGas.score - 55) * 0.2, -100, 100)
    const wuxing = emptyWuxing()
    wuxing[j.ben.wuxing] += 2; wuxing[xiaoxiInfo.wuxing] += 2; wuxing[mWx] += 1
    return ok({
      score,
      essence: `先天·${j.ben.name}之${j.bian.name}·辟卦${xiaoxi}${xiaoxiInfo.wuxing === j.ben.wuxing ? '气合' : ''}`,
      keys: [j.ben.name, `辟卦${xiaoxi}`, `气${gasX.state}`, j.ty.rel].slice(0, 6),
      wuxing,
      timing: guaNumTiming(g.bits),
      fidelity: 'core',
      detail: {
        cite: '《皇极经世》先天八卦数；十二辟卦（十二消息卦）配月建',
        rule: '先天数起上下卦与动爻；再以**月建所值十二消息卦**之五行与先天卦相较（气合则顺、相克则滞）',
        未核实说明: '「卦气」一词各家定义不一（孟喜六日七分卦气说有值日表，本轮调研 9 仓库均无此表 →【未核实】）；'
          + '本插件不用卦气，只用《周易》十二消息卦配月建，故此处标名「月建辟卦」而非「卦气」',
        evidence,
        起数: `上${y}+${mo}=${y + mo} ／ 下${mo}+${d}=${mo + d} ／ 动${d}+${h}=${d + h}`,
        先天数: '乾1 兑2 离3 震4 巽5 坎6 艮7 坤8',
        值月辟卦: `${mZhi}月 → ${xiaoxi}（${xiaoxiInfo.wuxing}·${gasX.state}）`,
        体用: `${j.ty.ti}(${j.ty.tiWx}) / ${j.ty.yong}(${j.ty.yongWx}) → ${j.ty.rel}`,
        ...j.detail,
      },
    })
  }, '先天'),

  // ─────────────── #21 大象占 ───────────────
  daxiang: guard(function daxiang(chart, entry, rand) {
    const y = yearZhiNum(chart); const mo = lunarMonth(chart); const d = lunarDay(chart)
    const upN = m8(y + mo + d)
    const loN = m8(y + mo + d + 1)
    const upT = TRI.find((t) => t.xian === upN) ?? TRI[0]
    const loT = TRI.find((t) => t.xian === loN) ?? TRI[0]
    const bits = [...loT.bits, ...upT.bits]
    const info = hexInfoOf(bits)
    const mWx = monthWxOf(chart)
    const gasUp = wangShuai(upT.wx, mWx)
    const gasLo = wangShuai(loT.wx, mWx)
    const rel = relation(upT.wx, loT.wx)
    const relBase = { 比和: 34, 生我: 48, 我生: -12, 我克: 26, 克我: -46 }[rel] ?? 0
    const evidence = [
      `取象：上卦${upT.name}${upT.xiang}（${upT.wx}·${upT.dir}·${upT.fam}·象${upT.body}·德${upT.virtue}），下卦${loT.name}${loT.xiang}（同列）`,
      `组合：${upT.xiang}上${loT.xiang}下 → ${info.name}（卦德${signed(info.polarity)}）`,
      `上下五行：上${upT.wx} 下${loT.wx} 为「${rel}」→ ${signed(relBase)}`,
      `月令旺衰：上卦${upT.wx}为「${gasUp.state}」、下卦${loT.wx}为「${gasLo.state}」`,
    ]
    let score = info.polarity * 0.4 + relBase * 0.55 + (gasUp.score - 55) * 0.3 + (gasLo.score - 55) * 0.2
    // 大象义：以上下之象叠合取事象
    const xiangHe = `${upT.xiang}${loT.xiang}`
    const daxiangTable = {
      天地: '天地否隔，上下不交，事多阻隔', 地天: '地天交泰，上下通泰，事顺',
      天水: '天与水违行，讼之象，争而不和', 水天: '云上于天，需待之象，宜待时',
      山泽: '山泽通气，损之象，宜损己益人', 泽山: '泽上有山，咸之象，感应而通',
      雷风: '雷风相薄，恒之象，久而不变', 风雷: '风雷相益，益之象，事有增益',
      火水: '水火相息，未济之象，事未成', 水火: '水火既济，事已成而宜守',
      地雷: '雷出地奋，豫之象，动而有声', 雷地: '雷入地中，复之象，一阳来复',
    }[xiangHe] ?? ''
    if (daxiangTable) evidence.push(`大象义：${xiangHe} → ${daxiangTable}`)
    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[upT.wx] += 2; wuxing[loT.wx] += 2; wuxing[mWx] += 1
    return ok({
      score,
      essence: `大象·${xiangHe}（上${upT.name}下${loT.name}）${rel}·${info.name}`,
      keys: [`${upT.name}${upT.xiang}`, `${loT.name}${loT.xiang}`, rel, info.name, `气${gasUp.state}`].slice(0, 6),
      wuxing,
      timing: `${loT.xian + upT.xian}日`,
      fidelity: 'full',
      detail: {
        cite: '《周易·说卦传》八卦类象；《周易》大象「天行健」「地势坤」之例',
        rule: '以八卦类象取上下之象：上象主外·远·表·先，下象主内·近·里·后；上下五行生克与月令旺衰定吉凶',
        evidence,
        上卦: `${upT.name}（${upT.sym}）象${upT.xiang}·${upT.wx}·方位${upT.dir}·家人${upT.fam}·身体${upT.body}·德${upT.virtue}·动物${upT.animal}`,
        下卦: `${loT.name}（${loT.sym}）象${loT.xiang}·${loT.wx}·方位${loT.dir}·家人${loT.fam}·身体${loT.body}·德${loT.virtue}·动物${loT.animal}`,
        组合: `${xiangHe}相叠 → ${info.name}（序${info.order}）`,
        大象义: daxiangTable || '（本插件大象义表未收录此组合，仅按五行生克与卦德断）',
        关系: `${rel}（上${upT.wx} / 下${loT.wx}）`,
        断: `大象取象：${upT.xiang}在上主外主远、${loT.xiang}在下主内主近；`
          + (rel === '生我' ? '下生上，内助外，事得根本之助' : rel === '克我' ? '下克上，内耗外，事多内阻' : rel === '比和' ? '上下比和，内外一气，事顺' : rel === '我克' ? '上克下，外制内，事在我手' : '上生下，外耗于内，宜节力'),
      },
    })
  }, '大象'),

  // ─────────────── #22 爻辞占 ───────────────
  yaoci: guard(function yaoci(chart, entry, rand) {
    const g = castSix(rand, 'coin', chart?.coins)
    const ben = hexInfoOf(g.bits)
    const bian = hexInfoOf(g.changed)
    const mWx = monthWxOf(chart)
    const gas = wangShuai(ben.wuxing, mWx)
    // 义理爻例：《系辞下》「二多誉，四多惧…三多凶，五多功」；当位/中正/相应
    const WEIYI = { 1: 4, 2: 20, 3: -16, 4: -18, 5: 24, 6: -4 }
    const YANG_POS = [1, 3, 5]
    let score; let evidence; let yaoInfo = '—'; let rule
    if (g.moving.length === 0) {
      rule = '六爻安静：取本卦彖辞（卦辞）断一卦之全体'
      score = ben.polarity * 0.7 + (gas.score - 55) * 0.3
      evidence = [
        rule,
        `本卦${ben.name}卦德${signed(ben.polarity)}×0.7、月令旺衰${ben.wuxing}为「${gas.state}」`,
      ]
    } else if (g.moving.length === 1) {
      const pos = g.moving[0]
      const l = g.bits[pos - 1]
      const dangWei = (l === 1) === YANG_POS.includes(pos)
      const zhong = pos === 2 || pos === 5
      const opp = pos <= 3 ? pos + 3 : pos - 3
      const ying = l !== g.bits[opp - 1]
      const base = WEIYI[pos] ?? 0
      const dScore = dangWei ? 10 : -8
      const zScore = zhong ? 10 : 0
      const yScore = ying ? 8 : -6
      rule = '独发之爻取爻辞，一爻专断；本插件无爻辞原文，改以**爻位义例**断之'
        + '（当位/失位、得中、相应，并参《系辞下》「二多誉、四多惧、三多凶、五多功」）'
      evidence = [
        `动爻：第${pos}爻（${POS_NAMES[pos - 1]}爻）${l ? '阳' : '阴'}`,
        `位义（《系辞下》）：${POS_NAMES[pos - 1]}爻 → ${base > 0 ? '多誉/多功' : '多惧/多凶'} ${signed(base)}`,
        `当位：阳爻居初三五、阴爻居二四六为当位 → ${dangWei ? '当位' : '失位'} ${signed(dScore)}`,
        `得中：二爻为下卦之中、五爻为上卦之中 → ${zhong ? '得中' : '不得中'} ${signed(zScore)}`,
        `相应：与第${opp}爻阴阳相异为有应 → ${ying ? '有应' : '无应'} ${signed(yScore)}`,
        `卦德：${ben.name}${signed(ben.polarity)}×0.35；变卦${bian.name}${signed(bian.polarity)}×0.25`,
        `月令旺衰：${ben.wuxing}值月令${mWx}为「${gas.state}」`,
      ]
      yaoInfo = `${POS_NAMES[pos - 1]}爻 ${l ? '阳' : '阴'}｜${dangWei ? '当位' : '失位'}·${zhong ? '得中' : '不得中'}·${ying ? '有应' : '无应'}`
      score = ben.polarity * 0.35 + bian.polarity * 0.25 + base + dScore + zScore + yScore + (gas.score - 55) * 0.3
    } else {
      rule = '多爻动：取变卦彖辞，观事之终局；本插件无彖辞原文，改以卦德与动爻数断之'
      score = ben.polarity * 0.32 + bian.polarity * 0.48 + (gas.score - 55) * 0.25 - (g.moving.length >= 4 ? 10 : 0)
      evidence = [
        `多爻动（${g.moving.length} 爻）：取变卦彖辞之例`,
        `本卦${ben.name}${signed(ben.polarity)}×0.32、变卦${bian.name}${signed(bian.polarity)}×0.48`,
        `月令旺衰：${ben.wuxing}为「${gas.state}」`,
        `动爻数修正：${g.moving.length >= 4 ? '四爻以上动，事杂多变 −10' : '二至三爻动，事有反复 −0'}`,
      ]
      yaoInfo = `动爻 ${g.moving.join('、')}`
    }
    score = clamp(score, -100, 100)
    const wuxing = emptyWuxing()
    wuxing[ben.wuxing] += 2; wuxing[bian.wuxing] += 1; wuxing[mWx] += 1
    return ok({
      score,
      essence: `爻占·${ben.name}${g.moving.length === 1 ? `${POS_NAMES[g.moving[0] - 1]}爻独发` : g.moving.length === 0 ? '六爻安静' : `动${g.moving.length}爻之${bian.name}`}`,
      keys: [ben.name, ...(g.moving.length === 1 ? [`${POS_NAMES[g.moving[0] - 1]}爻动`] : g.moving.length === 0 ? ['安静', '彖辞'] : [`之${bian.name}`, '多爻动']), `气${gas.state}`].slice(0, 6),
      wuxing,
      timing: g.moving.length === 1 ? `${g.moving[0]}日` : guaNumTiming(g.bits),
      fidelity: 'approx',
      detail: {
        cite: '《周易·系辞下》「二多誉，四多惧…三多凶，五多功」；《易》例当位·得中·相应；《左传》筮例（一爻专断、多爻取变卦）',
        rule,
        evidence,
        本卦: `${ben.name}（序${ben.order}）`,
        动爻: yaoInfo,
        变卦: g.moving.length ? `${bian.name}` : '（无动爻）',
        卦画: ben.lines,
        '⚠': '⚠ 本插件未内置六十四卦爻辞与彖辞原文，**不伪造辞句**；本局以爻位义例（当位/得中/相应/位义）'
          + '作结构性断语（fidelity=approx）',
      },
    })
  }, '爻占'),

  // ─────────────── #23 之卦占 ───────────────
  zhigua: guard(function zhigua(chart, entry, rand) {
    const g = castSix(rand, 'coin', chart?.coins)
    const ben = hexInfoOf(g.bits)
    const bian = hexInfoOf(g.changed)
    const mWx = monthWxOf(chart)
    const gasB = wangShuai(ben.wuxing, mWx)
    const gasN = wangShuai(bian.wuxing, mWx)
    const delta = bian.polarity - ben.polarity
    // 贞悔：内卦为贞、外卦为悔（《左传》筮例）
    const zhenWx = tri(ben.lower).wx
    const huiWx = tri(ben.upper).wx
    const zhenRel = relation(zhenWx, huiWx)
    const bianZhen = tri(bian.lower).wx
    const bianHui = tri(bian.upper).wx
    const zhenDelta = relation(bianZhen, bianHui)
    const evidence = [
      '之卦之义：本卦为现在，变卦（之卦）为将来；「之」即爻变之所往（《左传》筮例）',
      `卦德落差：本卦${ben.name}${signed(ben.polarity)} → 之卦${bian.name}${signed(bian.polarity)}，落差 ${signed(delta)}`,
      `贞悔：内卦为贞（${ben.lower}${zhenWx}）、外卦为悔（${ben.upper}${huiWx}）→ 本卦贞悔「${zhenRel}」；之卦贞悔「${zhenDelta}」`,
      `月令旺衰：本卦${ben.wuxing}为「${gasB.state}」、之卦${bian.wuxing}为「${gasN.state}」`,
      `动爻：${g.moving.length} 爻动${g.moving.length ? `（${g.moving.join('、')}）` : '（无动则不变）'}`,
    ]
    let score = ben.polarity * 0.30 + bian.polarity * 0.42 + delta * 0.18
      + (gasB.score - 55) * 0.20 + (gasN.score - 55) * 0.15
    const zhenPart = ({ 生我: 10, 比和: 6, 我克: 4, 我生: -4, 克我: -12 }[zhenDelta] ?? 0)
    score += zhenPart
    evidence.push(`之卦贞悔「${zhenDelta}」→ ${signed(zhenPart)}（内为本、外为末，之卦之贞悔主将来之本末）`)
    // 变卦合冲四态（spec §C8，R1 `hexagramPatternTransition`）
    const heb = chongHeOf(zhuangGua(g.bits, chart))
    const hen = chongHeOf(zhuangGua(g.changed, chart))
    const trans = chongHeTransition(heb, hen)
    if (trans) {
      const good = trans.includes('先散后聚') || trans.includes('顺利持久')
      score += good ? 10 : -10
      evidence.push(`变卦合冲四态：${trans} → ${signed(good ? 10 : -10)}`)
    }
    score = clamp(score, -100, 100)
    const wuxing = emptyWuxing()
    wuxing[ben.wuxing] += 2; wuxing[bian.wuxing] += 2; wuxing[mWx] += 1
    const dir = delta > 15 ? '趋吉' : delta < -15 ? '转凶' : '平变'
    return ok({
      score,
      essence: `之卦·${ben.name}→${bian.name}（${signed(delta)}）${dir}`,
      keys: [ben.name, `之${bian.name}`, dir, `贞悔${zhenDelta}`].slice(0, 6),
      wuxing,
      timing: g.moving.length ? `${g.moving.length}日` : `${orderOf(ben.name) % 12 || 12}日`,
      fidelity: 'full',
      detail: {
        cite: '《左传》筮例「贞，事之干也；悔，事之枝也」（内卦为贞、外卦为悔）；《周易》「之卦」之义',
        rule: '本卦为现在、之卦为将来；以两者卦德落差与贞悔（内本外末）之变断事势趋向',
        evidence,
        本卦: `${ben.name}（现况·${ben.wuxing}·卦德${signed(ben.polarity)}）`,
        之卦: `${bian.name}（趋向·${bian.wuxing}·卦德${signed(bian.polarity)}）`,
        卦德落差: `${signed(ben.polarity)} → ${signed(bian.polarity)}（${signed(delta)}）`,
        贞悔: `本卦 内贞${ben.lower}(${zhenWx}) 外悔${ben.upper}(${huiWx}) → ${zhenRel}；之卦 内贞${bian.lower}(${bianZhen}) 外悔${bian.upper}(${bianHui}) → ${zhenDelta}`,
        动爻: g.moving.length ? g.moving.map((p) => `${POS_NAMES[p - 1]}爻`).join('、') : '无（无动则不变）',
        变卦合冲: trans || `本卦${heb || '常卦'}／之卦${hen || '常卦'}`,
        断: delta > 15 ? '由滞转通，事态向好，宜进' : delta < -15 ? '由顺转逆，宜早收手' : '事态平稳，无大起落',
        卦画: `${ben.lines} → ${bian.lines}`,
      },
    })
  }, '之卦'),

  // ─────────────── #24 互卦占 ───────────────
  huagua: guard(function huagua(chart, entry, rand) {
    const g = castSix(rand, 'coin', chart?.coins)
    const ben = hexInfoOf(g.bits)
    const hu = hexInfoOf(huGua(g.bits))
    const hu2 = hexInfoOf(huGua(hu.bits))
    const mWx = monthWxOf(chart)
    const gasB = wangShuai(ben.wuxing, mWx)
    const gasH = wangShuai(hu.wuxing, mWx)
    const ty = tiYongOf(g.bits, g.moving[0] ?? 1)
    const huRel = relation(ty.tiWx, hu.wuxing)
    const huPart = ({ 生我: 18, 比和: 10, 我克: 6, 我生: -8, 克我: -20 }[huRel] ?? 0)
    const evidence = [
      '互卦取法：二三四爻为互下卦、三四五爻为互上卦（《梅花易数·互卦》）',
      `本卦${ben.name} → 互卦上${hu.upper}下${hu.lower} = ${hu.name}`,
      `再互（互卦之互）：${hu2.name}（更深一层的过程）`,
      `互卦五行${hu.wuxing}对体${ty.tiWx}（体${ty.ti}）为「${huRel}」→ ${signed(huPart)}`,
      `月令旺衰：本卦${ben.wuxing}为「${gasB.state}」、互卦${hu.wuxing}为「${gasH.state}」`,
    ]
    const score = clamp(ben.polarity * 0.32 + hu.polarity * 0.42 + huPart + (gasH.score - 55) * 0.25, -100, 100)
    const wuxing = emptyWuxing()
    wuxing[ben.wuxing] += 1.5; wuxing[hu.wuxing] += 2.5; wuxing[mWx] += 1
    const mid = hu.polarity > 20 ? '顺' : hu.polarity < -20 ? '滞' : '平'
    return ok({
      score,
      essence: `互卦·${ben.name}互${hu.name}（中程${mid}·${huRel}）`,
      keys: [ben.name, `互${hu.name}`, `中程${mid}`, huRel, `互2${hu2.name}`].slice(0, 6),
      wuxing,
      timing: `${tri(hu.upper).xian + tri(hu.lower).xian}日`,
      fidelity: 'full',
      detail: {
        cite: '《梅花易数·互卦》《体用总诀》「互卦为事之中间」；《周易》中爻取象之例',
        rule: '互卦主事情的中段过程与内部情由；以互卦卦德、互卦对体之生克、再互之象断中程吉凶',
        evidence,
        本卦: `${ben.name}（上${ben.upper}下${ben.lower}）`,
        互卦: `${hu.name}（上${hu.upper}下${hu.lower}·${hu.wuxing}·卦德${signed(hu.polarity)}）`,
        再互: hu2.name,
        体用: `体${ty.ti}(${ty.tiWx}) 用${ty.yong}(${ty.yongWx}) → ${ty.rel}；互卦与体「${huRel}」`,
        动爻: g.moving.length ? g.moving.map((p) => `${POS_NAMES[p - 1]}爻`).join('、') : '六爻安静',
        断: hu.polarity > 20 ? '中程顺遂，过程无阻' : hu.polarity < -20 ? '中程多阻，事有反复' : '中程平常，无甚波折',
        卦画: `本 ${ben.lines} ／ 互 ${hu.lines}`,
      },
    })
  }, '互卦'),
}

// ═════════════════════════ 7. 内部小工具 ═════════════════════════

/** 从问句里提「所测之字」（「测字：明」「拆字：明」）。 */
function extractChar(question) {
  const q = String(question ?? '')
  const m = q.match(/(?:测字|拆字|问字|字占)\s*[：:，,、\s]*([\u4e00-\u9fa5])/)
  if (m) return m[1]
  const m2 = q.match(/^([\u4e00-\u9fa5])字[，,、\s]/)
  return m2 ? m2[1] : ''
}

/** 问句中的汉字个数（不含标点与拉丁字母）。 */
function countHanzi(question) {
  const s = String(question ?? '').replace(/[^\u4e00-\u9fa5]/g, '')
  return s.length
}

/**
 * 外应识别：从问句里检出用户**所报**的外应物象。
 *
 * 允许关键词之间有少量填充字（「左眼**一直**跳」须能命中），否则会出现
 * 「#96 眼跳占认为用户报了外应、#7 梅花外应卦却标『未报外应』」的自相矛盾。
 * 物象 → 八卦依《说卦传》类象（目属离、耳属坎、犬属艮、鸡属巽、雷属震、风属巽…）。
 * @param {string} question 所问。
 * @returns {{found:boolean, text:string, tri:string}} 识别结果。
 */
const WAIYING_PATTERNS = [
  /(左|右)?(眼|眼皮|眼睛)[^。！？，,；;、\s]{0,4}跳/,
  /(打)?喷嚏/,
  /(耳|耳朵)[^。！？，,；;、\s]{0,4}(鸣|响|热|烫|堵)/,
  /(心|胸口|眼皮)[^。！？，,；;、\s]{0,3}(跳|慌|惊|悸)/,
  /(肉|肌肉|眉|手指)[^。！？，,；;、\s]{0,3}跳/,
  /鸟|鹊|鸦|鸡鸣|犬吠|狗叫|猫叫|猫头鹰/,
  /婴儿|小孩[^。！？，,；;、\s]{0,4}哭/,
  /哭声|笑声|唱|音乐|收音机/,
  /(打|摔|砸)?(破|碎|裂)|落地|掉下|翻倒/,
  /(灯|火|烛)[^。！？，,；;、\s]{0,3}(灭|闪|爆|熄)/,
  /打雷|雷声|闪电|刮风|风声|下雨|雨声|冰雹/,
  /(见|出|流)血/,
  /闻到|听到|看到|瞥见|忽(然|地)|突(然|兀)|猛(然|地)/,
  /(门|铃|手机|电话|警报)[^。！？，,；;、\s]{0,3}(响|震|叫|鸣)/,
  /敲门|叫门|有人喊|有人在叫/,
  /梦(见|到)|做(了)?梦/,
  /(洒|泼|打翻)[^。！？，,；;、\s]{0,3}(水|茶|酒|油)/,
]

function extractWaiYing(question) {
  const q = String(question ?? '')
  let m = null
  for (const re of WAIYING_PATTERNS) { m = q.match(re); if (m) break }
  if (!m) return { found: false, text: '', tri: '乾' }
  // 取外应关键词前后各 4 字作上下文（外应须记当下语境）
  const i = q.indexOf(m[0])
  const ctx = q.slice(Math.max(0, i - 4), Math.min(q.length, i + m[0].length + 4))
  const hit = XIANG_KEYWORD.find((x) => x.re.test(ctx)) ?? XIANG_KEYWORD.find((x) => x.re.test(m[0]))
  return { found: true, text: ctx, tri: hit?.tri ?? '乾' }
}

/** 卦名 → 六爻 bits（十二辟卦等已知名用；未知返回全阴）。 */
function parseHexNameToBits(name) {
  const n = String(name ?? '')
  for (const up of TRI) {
    for (const lo of TRI) {
      if (L_HEX_BY_NAME[up.name]?.[lo.name] === n) return [...lo.bits, ...up.bits]
    }
  }
  return [0, 0, 0, 0, 0, 0]
}

/** 原神/忌神简述（essence 用）。 */
function sRoleTxt(g, yong) {
  if (!yong) return ''
  const r = shenRoleOf(g, yong.wuxing)
  if (r.yuan && r.ji) return '·有原有忌'
  if (r.yuan) return '·原神生扶'
  if (r.ji) return '·忌神当权'
  return '·无原无忌'
}

/**
 * 仅供验收/对拍使用（`test/v2-crosscheck.mjs`、`docs/verification/yijing.md`）：
 * 暴露族内表与派生表，便于与 `core/tables.js`、oracle 逐项对拍。运行器不使用它。
 */
export const DEBUG_TABLES = {
  TRI, L_HEX_BY_NAME, L_HEX_ORDER, L_HEX_POL, POLARITY: (n) => polarityOf(n), ORDER: (n) => orderOf(n),
  PALACE_MAP, PALACE_HEAD, NAJIA, JINSHEN, TUISHEN, TUXI_JINSHEN_ENABLED, SANHE_LIST, SANHE,
  XIAOXI_BY_ZHI, LIUHE_PAIRS,
  LIUCHONG_GUA_GOLDEN, LIUHE_GUA_GOLDEN, chongHeOf, chongHeTransition,
  YUANBAO_ORDER, TAIXUAN_81, TAIXUAN_NUM_GAN, TAIXUAN_NUM_ZHI,
  DAYAN_PROB, LINGQI_GROUPS, YONGSHEN_RULES, SELF_GOD_TOPICS, TOPIC_ALIAS, PARTIAL_SHENSHA,
  movingPattern, huiTouOf, kongEffect, feiFuState, jianYaoOf, sanheCandidate, timingCandidatesOf, timingWindowOf,
  parseHexNameToBits, L_HEX_SEQ,
  hexInfoOf, palaceOf, zhuangGua, huGua, cuoGua, zongGua, tiYongOf, useGodOf, topicOf, shenshaOfZhi,
  yarrowLine, coinLine, castSix, guaFromNumbers, yarrowChange,
}

export default engines
