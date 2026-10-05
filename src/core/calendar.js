/**
 * 术数内核 · 历法层
 *
 * 把「一个时刻 + 一个问题」变成所有术法共用的**盘基**（Chart）。
 * 108 法都从这里取干支、节气、月令、空亡、神煞、天象……不再各自推算历法。
 *
 * 历法本体交给内置的 `lunar-javascript`（vendor/lunar.cjs，寿星天文历，六年节气/农历/神煞表），
 * 天文量（日月五星视黄经、ΔT、均时差、二十八宿入宿度）交给 `src/core/astro.js`
 * （底层是 vendor/astronomy.cjs = astronomy-engine 2.1.19）。本层只做四件事：
 *   1. **归一化**：把库的分散 getter 收成一张扁平、稳定的盘；
 *   2. **补算**：真太阳时、人元司令分野、五行力量、完整神煞等库没有的派生量；
 *   3. **对拍**：季令边界（立春换年）与节气时刻来自寿星历，天象来自 astronomy-engine，
 *      两条独立通路互相印证（见 docs/verification/kernel-astro-crosscheck.md）；
 *   4. **容错**：库版本差异时，缺哪个字段就留空，绝不因为一个 getter 抛错让整盘失败。
 *
 * ── v2 相对 v1 的变化（契约 §3.1：只增不改）────────────────────────────
 * | 字段 | 变化 |
 * |---|---|
 * | `astro` | 新增：日月五星视黄经、ΔT、均时差、二十八宿入宿度（astro.js 产出） |
 * | `solarTrue` | 新增：真太阳时（均时差改用 Meeus 精算，取代 v1 的 NOAA 三项近似，年内差可达 ~78 s） |
 * | `renyuan` | 新增：人元司令分野（表来自 core/tables.js，kernel-tables 维护） |
 * | `shenshaAll` | 新增：完整神煞命中表（28 种） |
 * | `dayBoundary` | 新增：早/晚子时归属与两种日柱流派 |
 * | `wuxing` | **改算法**：天干各 1 + 月支按人元司令分野比例 ×2 + 其余地支按本/中/余气 1/0.4/0.2 |
 * | 其余 v1 字段 | 一字不动（名字、类型、语义全部保持；smoke/host 直接断言） |
 */

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  GAN, ZHI, GAN_WUXING, ZHI_WUXING, ZHI_ANIMAL, ZHI_CANGGAN,
  NAYIN, xunOf, shenShaOf, mod, emptyWuxing, hash32, tenGodOf,
} from './kit.js'
import { renyuanOf, CANGGAN_W } from './tables.js'
import { computeAstro, equationOfTimeMin, ASTRO_SOURCE, ASTRO_FRAME } from './astro.js'

const require = createRequire(import.meta.url)
const HERE = dirname(fileURLToPath(import.meta.url))
/** @type {any} 内置历法库（CommonJS，故用 require 载入，避免 ESM 默认导出歧义）。 */
const LunarLib = require(join(HERE, '..', '..', 'vendor', 'lunar.cjs'))

/** 调用库方法，失败返回兜底值（版本差异不该让整盘崩掉）。 */
function safe(fn, fallback = null) {
  try {
    const v = fn()
    return v === undefined || v === null ? fallback : v
  } catch {
    return fallback
  }
}

/** 标准时区中央经线（东八区 = 120°E）。 */
const STD_MERIDIAN = 120

// ───────────────────────────── 真太阳时 ─────────────────────────────

/**
 * 年积日。
 * @param {Date} d 日期（按本地分量取）。
 * @returns {number} 1..366。
 */
function dayOfYear(d) {
  const start = Date.UTC(d.getFullYear(), 0, 0)
  const cur = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((cur - start) / 86400000)
}

/**
 * 均时差（分钟）——真太阳时校正的第二项。
 *
 * v2 改用 astro.js 的精算法（Meeus《Astronomical Algorithms》ch.28：EoT = 4×(L0 − α_视)），
 * 取代 v1 的 NOAA 三项三角近似。实测两条式子在 2026 全年最大差 78 s（近似式自身误差），
 * 精算式与天文年历一致到数秒，故 v2 以精算式为准；符号约定与 v1 相同（11 月初 ≈ +16 min）。
 *
 * @param {Date} d 时刻。
 * @returns {number} 分钟（可为负）。
 */
function equationOfTime(d) {
  return equationOfTimeMin(d)
}

/**
 * 真太阳时校正量。
 * 真太阳时 = 平太阳时 + (经度 − 中央经线) × 4 分钟 + 均时差。
 * @param {Date} d 平太阳时（本机时区）。
 * @param {number} longitude 当地经度（东经为正）。
 * @returns {{minutes:number, text:string, lonPart:number, eotMin:number}} 总校正分钟数与说明。
 */
export function trueSolarOffset(d, longitude) {
  const lonPart = (longitude - STD_MERIDIAN) * 4
  const eot = equationOfTime(d)
  const total = lonPart + eot
  return {
    minutes: total,
    text: `经度差 ${lonPart >= 0 ? '+' : ''}${lonPart.toFixed(1)}′ 均时差 ${eot >= 0 ? '+' : ''}${eot.toFixed(1)}′`,
    lonPart,
    eotMin: eot,
  }
}

// ───────────────────────────── 五行力量 ─────────────────────────────

/**
 * 统计一组干支的五行力量（v1 版，保留供兼容）。
 * 天干各记 1，地支按本气 1、中气 0.4、余气 0.2。
 * @param {string[]} gzs 干支字符串数组。
 * @returns {{木:number,火:number,土:number,金:number,水:number}} 五行计数。
 */
export function wuxingCount(gzs) {
  const out = emptyWuxing()
  for (const gz of gzs) {
    if (typeof gz !== 'string' || gz.length < 2) continue
    const [g, z] = [gz[0], gz[1]]
    if (GAN_WUXING[g]) out[GAN_WUXING[g]] += 1
    const hidden = ZHI_CANGGAN[z] ?? []
    const weights = [1, 0.4, 0.2]
    hidden.forEach((hg, i) => {
      const wx = GAN_WUXING[hg]
      if (wx) out[wx] += weights[i] ?? 0.2
    })
  }
  return out
}

/** 月支在日主力量里额外加权（月令最重）。 */
const MONTH_BRANCH_WEIGHT = 2.0

/**
 * v2 五行力量：**天干 + 藏干权重 + 人元司令分野**。
 *
 * 权重设计（可解释、可复核）：
 *   · 四柱天干：各 1.0（透干为显）；
 *   · 月支：按 `CANGGAN_W[月支]`（= 人元司令分野的用事日数 ÷ 30，tables.js 派生表）中每干比例 ×2.0
 *     —— 月令最重，且"哪一干司令"由《渊海子平·卷一·人元司令分野》的日数决定；
 *   · 其余三支：本气 1.0、中气 0.4、余气 0.2（与 v1 一致，便于版本间对比）。
 * 与 v1 的差别仅在于月支：v1 月支也是 1/0.4/0.2，v2 改成按分野比例放大。
 *
 * @param {Array<{name:string, gz:string}>} pillars 四柱（含 name 便于识别月支）。
 * @returns {{木:number,火:number,土:number,金:number,水:number}} 五行力量（非整数，全部有限数）。
 */
export function wuxingWeighted(pillars) {
  const out = emptyWuxing()
  const add = (wx, w) => { if (wx && Number.isFinite(w)) out[wx] += w }
  for (const p of pillars) {
    const gz = p.gz ?? ''
    const g = gz[0]
    const z = gz[1]
    add(GAN_WUXING[g], 1)
    if (p.name === '月') {
      const w = CANGGAN_W[z]
      if (w) {
        for (const [hg, frac] of Object.entries(w)) add(GAN_WUXING[hg], frac * MONTH_BRANCH_WEIGHT)
      } else {
        // 表缺失时退回 v1 口径，保证「五行统计非零」
        const hidden = ZHI_CANGGAN[z] ?? []
        hidden.forEach((hg, i) => add(GAN_WUXING[hg], [1, 0.4, 0.2][i] ?? 0.2))
      }
    } else {
      const hidden = ZHI_CANGGAN[z] ?? []
      hidden.forEach((hg, i) => add(GAN_WUXING[hg], [1, 0.4, 0.2][i] ?? 0.2))
    }
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 1000) / 1000
  return out
}

// ───────────────────────────── 神煞全表 ─────────────────────────────

/**
 * 神煞规则（v2 新增，共 28 种；`chart.shensha` 仍只保留驿马/桃花/华盖/将星 4 项）。
 *
 * 规则形状：
 *   `from`：查表基准（'年干'/'月支'/'日柱'… 即"以谁的什么去查"）
 *   `kind`：目标比对方式 —— '支'（比地支）/ '干'（比天干）/ '干支'（干或支任一命中）/ '柱'（比整柱干支）
 *   `pick`：基准值 → 目标数组（对象表，或函数）
 *
 * cite（通则）：《三命通会》（明·万民英）卷二「论诸神煞」、《渊海子平》卷一「神煞」通行口诀。
 * ⚠ 溯源状态：本表为**通行口诀表**（各本互有异文），逐条 cite 写在每条的 `cite` 字段；
 *   `note` 标注存在异说者。表本身**未经影印本逐字校勘**，故整体在 `meta.shenshaSource` 里
 *   标 `verified:'common-form'`——即"用的是通行本，不是校勘本"。方法层若据此下重断，请自行降 fidelity。
 */
const SHENSHA_RULES = [
  {
    name: '天乙贵人',
    from: ['日干', '年干'],
    kind: '支',
    cite: '《渊海子平·卷一》口诀「甲戊兼牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸兔蛇藏，庚辛逢马虎」',
    note: '异说：「甲戊庚牛羊」（庚作丑未）见《三命通会》本；本表从《渊海子平》本',
    pick: { 甲: ['丑', '未'], 乙: ['子', '申'], 丙: ['亥', '酉'], 丁: ['亥', '酉'], 戊: ['丑', '未'], 己: ['子', '申'], 庚: ['午', '寅'], 辛: ['午', '寅'], 壬: ['卯', '巳'], 癸: ['卯', '巳'] },
  },
  {
    name: '天德贵人',
    from: ['月支'],
    kind: '干支',
    cite: '《三命通会·卷二·论天德月德》',
    note: '逐月所值或为天干或为地支（如卯月见申、午月见亥），故以干或支任一命中为准',
    pick: { 寅: ['丁'], 卯: ['申'], 辰: ['壬'], 巳: ['辛'], 午: ['亥'], 未: ['甲'], 申: ['癸'], 酉: ['寅'], 戌: ['丙'], 亥: ['乙'], 子: ['巳'], 丑: ['庚'] },
  },
  {
    name: '月德贵人',
    from: ['月支'],
    kind: '干',
    cite: '《三命通会·卷二·论天德月德》口诀「寅午戌月丙，申子辰月壬，亥卯未月甲，巳酉丑月庚」',
    pick: { 寅: ['丙'], 午: ['丙'], 戌: ['丙'], 申: ['壬'], 子: ['壬'], 辰: ['壬'], 亥: ['甲'], 卯: ['甲'], 未: ['甲'], 巳: ['庚'], 酉: ['庚'], 丑: ['庚'] },
  },
  {
    name: '文昌贵人',
    from: ['日干', '年干'],
    kind: '支',
    cite: '《渊海子平·卷一》口诀「甲乙巳午报君知，丙戊申宫丁己鸡，庚猪辛鼠壬逢虎，癸人见卯入云梯」',
    pick: { 甲: ['巳'], 乙: ['午'], 丙: ['申'], 丁: ['酉'], 戊: ['申'], 己: ['酉'], 庚: ['亥'], 辛: ['子'], 壬: ['寅'], 癸: ['卯'] },
  },
  {
    name: '太极贵人',
    from: ['日干', '年干'],
    kind: '支',
    cite: '《三命通会·卷二》口诀「甲乙生人子午中，丙丁鸡兔定亨通，戊己两干临四季，庚辛寅亥禄丰隆，壬癸巳申偏喜美」',
    pick: { 甲: ['子', '午'], 乙: ['子', '午'], 丙: ['卯', '酉'], 丁: ['卯', '酉'], 戊: ['辰', '戌', '丑', '未'], 己: ['辰', '戌', '丑', '未'], 庚: ['寅', '亥'], 辛: ['寅', '亥'], 壬: ['巳', '申'], 癸: ['巳', '申'] },
  },
  {
    name: '国印贵人',
    from: ['日干', '年干'],
    kind: '支',
    cite: '《三命通会·卷二》口诀「甲见戌，乙见亥，丙见丑，丁见寅，戊见丑，己见寅，庚见辰，辛见巳，壬见未，癸见申」',
    pick: { 甲: ['戌'], 乙: ['亥'], 丙: ['丑'], 丁: ['寅'], 戊: ['丑'], 己: ['寅'], 庚: ['辰'], 辛: ['巳'], 壬: ['未'], 癸: ['申'] },
  },
  {
    name: '金舆',
    from: ['日干', '年干'],
    kind: '支',
    cite: '《三命通会·卷二》口诀「甲龙乙蛇丙戊羊，丁己见猴庚犬方，辛猪壬牛癸逢虎」（禄前二位）',
    pick: { 甲: ['辰'], 乙: ['巳'], 丙: ['未'], 丁: ['申'], 戊: ['未'], 己: ['申'], 庚: ['戌'], 辛: ['亥'], 壬: ['丑'], 癸: ['寅'] },
  },
  {
    name: '禄神',
    from: ['日干', '年干'],
    kind: '支',
    cite: '《三命通会·卷二·论禄》十干临官位',
    pick: { 甲: ['寅'], 乙: ['卯'], 丙: ['巳'], 丁: ['午'], 戊: ['巳'], 己: ['午'], 庚: ['申'], 辛: ['酉'], 壬: ['亥'], 癸: ['子'] },
  },
  {
    name: '羊刃',
    from: ['日干'],
    kind: '支',
    cite: '《三命通会·卷二·论羊刃》阳干帝旺位（甲卯乙辰丙午丁未戊午己未庚酉辛戌壬子癸丑）',
    note: '阴干取刃诸本不一（有取临官者），本表从通行「阳刃帝旺、阴刃冠带」本',
    pick: { 甲: ['卯'], 乙: ['辰'], 丙: ['午'], 丁: ['未'], 戊: ['午'], 己: ['未'], 庚: ['酉'], 辛: ['戌'], 壬: ['子'], 癸: ['丑'] },
  },
  {
    name: '驿马',
    from: ['年支', '日支'],
    kind: '支',
    cite: '《三命通会·卷二》三合局长生冲位（申子辰马在寅、寅午戌马在申、巳酉丑马在亥、亥卯未马在巳）',
    pick: (k) => { const v = shenShaOf('驿马', k); return v ? [v] : [] },
  },
  {
    name: '桃花',
    from: ['年支', '日支'],
    kind: '支',
    cite: '《三命通会·卷二》三合局沐浴位（又名咸池）',
    pick: (k) => { const v = shenShaOf('桃花', k); return v ? [v] : [] },
  },
  {
    name: '华盖',
    from: ['年支', '日支'],
    kind: '支',
    cite: '《三命通会·卷二》三合局墓库位',
    pick: (k) => { const v = shenShaOf('华盖', k); return v ? [v] : [] },
  },
  {
    name: '将星',
    from: ['年支', '日支'],
    kind: '支',
    cite: '《三命通会·卷二》三合局帝旺位（三合局中神）',
    pick: (k) => { const v = shenShaOf('将星', k); return v ? [v] : [] },
  },
  {
    name: '劫煞',
    from: ['年支', '日支'],
    kind: '支',
    cite: '《三命通会·卷二》三合局绝位（申子辰见巳、寅午戌见亥、巳酉丑见寅、亥卯未见申）',
    pick: { 申: ['巳'], 子: ['巳'], 辰: ['巳'], 寅: ['亥'], 午: ['亥'], 戌: ['亥'], 巳: ['寅'], 酉: ['寅'], 丑: ['寅'], 亥: ['申'], 卯: ['申'], 未: ['申'] },
  },
  {
    name: '亡神',
    from: ['年支', '日支'],
    kind: '支',
    cite: '《三命通会·卷二》三合局临官位（与劫煞相对）',
    pick: { 申: ['亥'], 子: ['亥'], 辰: ['亥'], 寅: ['巳'], 午: ['巳'], 戌: ['巳'], 巳: ['申'], 酉: ['申'], 丑: ['申'], 亥: ['寅'], 卯: ['寅'], 未: ['寅'] },
  },
  {
    name: '孤辰',
    from: ['年支'],
    kind: '支',
    cite: '《三命通会·卷二》方局孤位（亥子丑见寅、寅卯辰见巳、巳午未见申、申酉戌见亥）',
    pick: { 亥: ['寅'], 子: ['寅'], 丑: ['寅'], 寅: ['巳'], 卯: ['巳'], 辰: ['巳'], 巳: ['申'], 午: ['申'], 未: ['申'], 申: ['亥'], 酉: ['亥'], 戌: ['亥'] },
  },
  {
    name: '寡宿',
    from: ['年支'],
    kind: '支',
    cite: '《三命通会·卷二》方局寡位（亥子丑见戌、寅卯辰见丑、巳午未见辰、申酉戌见未）',
    pick: { 亥: ['戌'], 子: ['戌'], 丑: ['戌'], 寅: ['丑'], 卯: ['丑'], 辰: ['丑'], 巳: ['辰'], 午: ['辰'], 未: ['辰'], 申: ['未'], 酉: ['未'], 戌: ['未'] },
  },
  {
    name: '天医',
    from: ['月支'],
    kind: '支',
    cite: '《三命通会·卷二》月支退一位（正月生见丑、二月生见寅……）',
    pick: { 寅: ['丑'], 卯: ['寅'], 辰: ['卯'], 巳: ['辰'], 午: ['巳'], 未: ['午'], 申: ['未'], 酉: ['申'], 戌: ['酉'], 亥: ['戌'], 子: ['亥'], 丑: ['子'] },
  },
  {
    name: '天赦',
    from: ['月支'],
    kind: '柱',
    cite: '《三命通会·卷二·论天赦》「春戊寅、夏甲午、秋戊申、冬甲子」',
    pick: { 寅: ['戊寅'], 卯: ['戊寅'], 辰: ['戊寅'], 巳: ['甲午'], 午: ['甲午'], 未: ['甲午'], 申: ['戊申'], 酉: ['戊申'], 戌: ['戊申'], 亥: ['甲子'], 子: ['甲子'], 丑: ['甲子'] },
  },
  {
    name: '十恶大败',
    from: ['日柱'],
    kind: '柱',
    cite: '《三命通会·卷三·论十恶大败》所列十日（甲辰乙巳丙申丁亥戊戌己丑庚辰辛巳壬申癸亥）',
    note: '诸本所列十日一致，但"是否成立"需看禄马有无，本表只报"日柱见之"',
    pick: (k) => (['甲辰', '乙巳', '丙申', '丁亥', '戊戌', '己丑', '庚辰', '辛巳', '壬申', '癸亥'].includes(k) ? [k] : []),
  },
  {
    name: '阴阳差错',
    from: ['日柱', '时柱'],
    kind: '柱',
    cite: '《三命通会·卷三·论阴阳差错》所列十二日（丙子丁丑戊寅辛卯壬辰癸巳丙午丁未戊申辛酉壬戌癸亥）',
    pick: (k) => (['丙子', '丁丑', '戊寅', '辛卯', '壬辰', '癸巳', '丙午', '丁未', '戊申', '辛酉', '壬戌', '癸亥'].includes(k) ? [k] : []),
  },
  {
    name: '魁罡',
    from: ['日柱'],
    kind: '柱',
    cite: '《三命通会·卷三·论魁罡》四日「庚辰、庚戌、壬辰、戊戌」',
    pick: (k) => (['庚辰', '庚戌', '壬辰', '戊戌'].includes(k) ? [k] : []),
  },
  {
    name: '天罗',
    from: ['年支', '月支', '日支', '时支'],
    kind: '支',
    cite: '《三命通会·卷二·论天罗地网》「辰为天罗，戌为地网」',
    pick: { 辰: ['辰'] },
  },
  {
    name: '地网',
    from: ['年支', '月支', '日支', '时支'],
    kind: '支',
    cite: '《三命通会·卷二·论天罗地网》「辰为天罗，戌为地网」',
    pick: { 戌: ['戌'] },
  },
  {
    name: '红鸾',
    from: ['年支'],
    kind: '支',
    cite: '通书《红鸾天喜》表（红鸾自卯宫起子年逆行：子见卯、丑见寅、寅见丑……）',
    pick: { 子: ['卯'], 丑: ['寅'], 寅: ['丑'], 卯: ['子'], 辰: ['亥'], 巳: ['戌'], 午: ['酉'], 未: ['申'], 申: ['未'], 酉: ['午'], 戌: ['巳'], 亥: ['辰'] },
  },
  {
    name: '天喜',
    from: ['年支'],
    kind: '支',
    cite: '通书《红鸾天喜》表（天喜与红鸾对宫：子见酉、丑见申、寅见未……）',
    pick: { 子: ['酉'], 丑: ['申'], 寅: ['未'], 卯: ['午'], 辰: ['巳'], 巳: ['辰'], 午: ['卯'], 未: ['寅'], 申: ['丑'], 酉: ['子'], 戌: ['亥'], 亥: ['戌'] },
  },
  {
    name: '血刃',
    from: ['月支'],
    kind: '支',
    cite: '通书《血刃》表（正月丑、二月未、三月寅、四月申、五月卯、六月酉、七月辰、八月戌、九月巳、十月亥、十一月午、十二月子）',
    note: '通书异本略有出入；本表未与影印本逐字核对',
    pick: { 寅: ['丑'], 卯: ['未'], 辰: ['寅'], 巳: ['申'], 午: ['卯'], 未: ['酉'], 申: ['辰'], 酉: ['戌'], 戌: ['巳'], 亥: ['亥'], 子: ['午'], 丑: ['子'] },
  },
]

/** 三奇贵人：天上三奇甲戊庚 / 地下三奇乙丙丁 / 人中三奇壬癸辛，须在四柱天干**顺排相邻**。 */
const SANQI = [['甲', '戊', '庚', '天上三奇'], ['乙', '丙', '丁', '地下三奇'], ['壬', '癸', '辛', '人中三奇']]

/** 取神煞基准值（'日干' → 日柱天干，'日柱' → 日柱干支）。 */
function basisValue(src, ctx) {
  const p = src[0]
  const k = src[1]
  if (k === '干') return ctx.gan[p] ?? ''
  if (k === '支') return ctx.zhi[p] ?? ''
  return ctx.gz[p] ?? ''
}

/**
 * 计算完整神煞命中表。
 * @param {Array<{name:string, gz:string}>} pillars 四柱。
 * @returns {Record<string, string[]>} 神煞名 → 命中的柱名数组（'年'/'月'/'日'/'时'）。
 */
export function shenshaAllOf(pillars) {
  const ctx = { gan: {}, zhi: {}, gz: {} }
  for (const p of pillars) {
    ctx.gz[p.name] = p.gz ?? ''
    ctx.gan[p.name] = (p.gz ?? '')[0] ?? ''
    ctx.zhi[p.name] = (p.gz ?? '')[1] ?? ''
  }
  const names = pillars.map((p) => p.name)
  const out = {}
  for (const rule of SHENSHA_RULES) {
    const targets = new Set()
    for (const src of rule.from) {
      const key = basisValue(src, ctx)
      if (!key) continue
      const list = typeof rule.pick === 'function' ? rule.pick(key, ctx) : (rule.pick[key] ?? [])
      for (const t of list ?? []) targets.add(t)
    }
    const hits = []
    if (targets.size > 0) {
      for (const p of names) {
        const g = ctx.gan[p]
        const z = ctx.zhi[p]
        const gz = ctx.gz[p]
        const hit = rule.kind === '支' ? targets.has(z)
          : rule.kind === '干' ? targets.has(g)
            : rule.kind === '柱' ? targets.has(gz)
              : (targets.has(z) || targets.has(g))
        if (hit) hits.push(p)
      }
    }
    out[rule.name] = hits
  }
  // 三奇贵人：四柱天干顺排相邻（如 年甲·月戊·日庚）
  const gans = names.map((p) => ctx.gan[p])
  const sanqi = []
  for (const [a, b, c] of SANQI) {
    for (let i = 0; i + 2 < gans.length; i += 1) {
      if (gans[i] === a && gans[i + 1] === b && gans[i + 2] === c) sanqi.push(names[i], names[i + 1], names[i + 2])
    }
  }
  out.三奇贵人 = [...new Set(sanqi)]
  return out
}

/** 出生时刻的固定参考时区：**UTC+8（东八区/北京时间）**。
 * 口径理由：`birth` 只有「年/月/日/时/分」五个数字，没有时区信息；本插件是中国术数工具，
 * 用户给「1990-05-12 09:30」按惯例即北京时间。**必须按固定 +8 解释，不许查时区数据库**——
 * 否则历史夏令时（如中国 1986–1991 年实行过 DST）会再次引入不可复现性：
 * 实测 `Asia/Shanghai` 与 `Etc/GMT-8` 对 1990-05-12 09:30 会差 1 小时（51.03899° vs 51.07922°）。
 * @type {number} 分钟
 */
const BIRTH_UTC_OFFSET_MIN = 8 * 60

/**
 * 民用时刻（无时区数字）→ 毫秒数。**只用 Date.UTC，绝不用本地 Date 构造**。
 * 两端同口径时，其差值即"民用时间差"，与宿主时区、历史 DST 均无关。
 * @param {number} y 年 @param {number} m 月（1–12） @param {number} d 日
 * @param {number} [h] 时 @param {number} [mi] 分 @param {number} [s] 秒
 * @returns {number} 毫秒数（仅用于求差）。
 */
function civilMs(y, m, d, h = 0, mi = 0, s = 0) {
  return Date.UTC(y, m - 1, d, h, mi, s)
}

/**
 * 出生民用时刻（按固定 UTC+8 解释）→ 绝对瞬间 Date。
 *
 * **不要**改回 `new Date(y, m-1, d, h, mi)`：那会把宿主时区（含其历史 DST 规则）带进来，
 * 使同一份出生资料在不同机器上得到不同的日月五星黄经，破坏跨机器可复现。
 * @param {number} y 年 @param {number} m 月 @param {number} d 日 @param {number} h 时 @param {number} mi 分
 * @returns {Date} 绝对瞬间。
 */
function birthInstant(y, m, d, h, mi) {
  return new Date(civilMs(y, m, d, h, mi) - BIRTH_UTC_OFFSET_MIN * 60000)
}

// ───────────────────────────── 人元司令分野 ─────────────────────────────

/**
 * 人元司令分野（月令中"哪一个藏干当权"）。
 * 表与查表函数由 kernel-tables 维护（core/tables.js `renyuanOf`），
 * cite: 《渊海子平·卷一·人元司令分野》（诸本日数有异，tables.js 已标 verified:'partial'）。
 *
 * 自节令起的整日数用**民用时刻差**（`civilMs` 两端同口径）计算，故与宿主时区、历史 DST 无关。
 * @param {object} lunar 寿星历 Lunar 对象（用来取上一节令时刻）。
 * @param {{y:number,m:number,d:number,h:number,mi:number,s?:number}} civil 参考民用时刻（无时区数字）。
 * @param {string} monthZhi 月支。
 * @returns {{gan:string, days:number, monthZhi:string, elapsed:number, jie:string, jieAt:string, index:number}|null}
 */
function renyuanOfChartCivil(lunar, civil, monthZhi) {
  const prevJie = safe(() => lunar.getPrevJie(), null)
  if (!prevJie) return null
  const js = safe(() => prevJie.getSolar(), null)
  if (!js) return null
  const jieCivil = {
    y: safe(() => js.getYear(), 0), m: safe(() => js.getMonth(), 1), d: safe(() => js.getDay(), 1),
    h: safe(() => js.getHour(), 0), mi: safe(() => js.getMinute(), 0), s: safe(() => js.getSecond(), 0),
  }
  const elapsedDays = Math.floor(
    (civilMs(civil.y, civil.m, civil.d, civil.h, civil.mi, civil.s ?? 0)
      - civilMs(jieCivil.y, jieCivil.m, jieCivil.d, jieCivil.h, jieCivil.mi, jieCivil.s)) / 86400000,
  )
  const r = safe(() => renyuanOf(monthZhi, elapsedDays), null)
  if (!r) return null
  return {
    gan: r.gan,
    days: r.days,                 // 该司令干**用事日数**（段长，非已过日数）
    monthZhi,
    index: r.index,               // 第几段（0 起）
    elapsed: r.offset,            // 本段已过日数
    daysSinceJie: elapsedDays,    // 自节令起的整日数
    jie: safe(() => prevJie.getName(), ''),
    jieAt: safe(() => prevJie.getSolar()?.toYmdHms(), ''),
  }
}

/**
 * 五鼠遁：由日干与时辰地支起时干（口诀「甲己还加甲，乙庚丙作初……」）。
 * 时干序 = (日干序 × 2 + 时支序) mod 10，子 = 0。
 * cite: 《渊海子平·卷一·五鼠遁》。
 * @param {string} dayGan 日干。
 * @param {string} hourZhi 时支。
 * @returns {string} 时柱干支；参数非法返回空串。
 */
export function hourGZByWuShu(dayGan, hourZhi) {
  const di = GAN.indexOf(dayGan)
  const zi = ZHI.indexOf(hourZhi)
  if (di < 0 || zi < 0) return ''
  return GAN[mod(di * 2 + zi, 10)] + hourZhi
}

// ───────────── 建除 / 黄黑道（月建口径可切换，见 almanac 注释） ─────────────

/** 建除十二神，自「建」起顺行。cite: 《协纪辨方书》卷十·建除十二神；通书「建满平收黑，除危定执黄…」。 */
export const JIANCHU12 = ['建', '除', '满', '平', '定', '执', '破', '危', '成', '收', '开', '闭']
/** 黄黑道十二神，自「青龙」起顺行。cite: 《协纪辨方书》卷七·黄道黑道。 */
export const HUANGHEI12 = ['青龙', '明堂', '天刑', '朱雀', '金匮', '天德', '白虎', '玉堂', '天牢', '玄武', '司命', '勾陈']
/** 黄道六神（余六为黑道）。cite: 同上，「青龙明堂金匮天德玉堂司命」为黄道。 */
const HUANGDAO = new Set(['青龙', '明堂', '金匮', '天德', '玉堂', '司命'])

/**
 * 建除十二神：**月建之日为建**，其后依次除、满、平、定、执、破、危、成、收、开、闭。
 * 即 index = (日支序 − 月支序) mod 12。
 * cite: 《协纪辨方书》卷十；《淮南子·天文训》「正月建寅…」。
 * @param {string} monthZhi 月建（由节令**时刻**定，即 chart.monthZhi）。
 * @param {string} dayZhi 日支。
 * @returns {string} 建除十二神之一；参数非法返回空串。
 */
export function jianchuOf(monthZhi, dayZhi) {
  const mi = ZHI.indexOf(monthZhi)
  const di = ZHI.indexOf(dayZhi)
  if (mi < 0 || di < 0) return ''
  return JIANCHU12[mod(di - mi, 12)]
}

/**
 * 黄黑道十二神（值日天神）。
 * 起例：青龙起点随月建 —— 正/七月（寅、申月）起子，二/八月（卯、酉）起寅，三/九月（辰、戌）起辰，
 * 四/十月（巳、亥）起午，五/十一月（午、子）起申，六/十二月（未、丑）起戌；
 * 即「青龙所值日支 = (月支序 − 2) × 2 mod 12」，其后顺行十二神。
 * cite: 《协纪辨方书》卷七·黄道黑道；通书「青龙起例」口诀。
 * 本函数用**月支序 0=子**，与 `chart.monthZhi`（节令时刻口径）配套。
 * @param {string} monthZhi 月建。
 * @param {string} dayZhi 日支。
 * @returns {{name:string, type:'黄道'|'黑道', luck:'吉'|'凶'}} 天神与黄黑道、吉凶。
 */
export function huangheidaoOf(monthZhi, dayZhi) {
  const mi = ZHI.indexOf(monthZhi)
  const di = ZHI.indexOf(dayZhi)
  if (mi < 0 || di < 0) return { name: '', type: '', luck: '' }
  const start = mod((mi - 2) * 2, 12)
  const name = HUANGHEI12[mod(di - start, 12)]
  const isHuang = HUANGDAO.has(name)
  return { name, type: isHuang ? '黄道' : '黑道', luck: isHuang ? '吉' : '凶' }
}

// ───────────────────────────── 盘基 ─────────────────────────────

/**
 * 自动柱详情（v1 字段 + v2 追加藏干/十神）。
 * @param {Array<{name:string, gz:string}>} pillars 四柱。
 * @param {string} dayGan 日主天干（十神基准）。
 * @returns {object[]} 每柱详情。
 */
function makePillarDetail(pillars, dayGan) {
  return pillars.map(({ name, gz }) => {
    const gan = gz[0] ?? ''
    const zhi = gz[1] ?? ''
    const hidden = ZHI_CANGGAN[zhi] ?? []
    const weights = [1, 0.4, 0.2]
    return {
      name,
      gz,
      gan,
      zhi,
      ganWx: GAN_WUXING[gan] ?? '',
      zhiWx: ZHI_WUXING[zhi] ?? '',
      nayin: NAYIN[gz] ?? '',
      animal: ZHI_ANIMAL[zhi] ?? '',
      // ── v2 追加 ──
      cangGan: hidden.map((hg, i) => ({
        gan: hg,
        wx: GAN_WUXING[hg] ?? '',
        level: ['本气', '中气', '余气'][i] ?? '余气',
        weight: weights[i] ?? 0.2,
        god: dayGan ? tenGodOf(dayGan, hg) : '',
      })),
      tenGod: name === '日' ? '日主' : (dayGan && gan ? tenGodOf(dayGan, gan) : ''),
    }
  })
}

/**
 * 构建盘基。
 *
 * @param {object} input 求占输入。
 * @param {string} [input.question] 所问之事（进入随机种子，保证同问同时刻同结果）。
 * @param {string} [input.seed] 显式种子 → **seed 复现模式**（同问同刻 + 同 seed 必得同一结果）。
 *   缺省 → **随机模式**：每次调用取一次 OS 加密熵，同一人同问同刻多次调用**允许不同**（正常）。
 * @param {Date} [input.when] 求占时刻，缺省为当前时刻。
 * @param {number} [input.longitude] 当地经度（做真太阳时校正；缺省不校正）。
 * @param {string} [input.longitudeFrom] 经度来源说明（如「用户当前位置」「手动指定」；
 *   缺省按「显式给了经度→手动指定 / 没给→未提供」推定，不臆造）。
 * @param {'男'|'女'} [input.gender] 性别（命理类需要）。
 * @param {{y:number,m:number,d:number,h:number,mi:number,longitude?:number}} [input.birth] 出生资料（命理类需要）。
 * @param {number[]} [input.numbers] 报数（梅花/测字等需要）。
 * @param {number[]} [input.coins] 指定六爻钱面（回放用）。
 * @param {string|number} [input.seed] 显式种子（覆盖默认派生）。
 * @returns {Chart} 盘基。
 */
export function buildChart(input = {}) {
  const question = typeof input.question === 'string' ? input.question.trim() : ''
  const when = input.when instanceof Date && !Number.isNaN(input.when.getTime())
    ? input.when
    : (input.when ? new Date(input.when) : new Date())
  const longitude = Number.isFinite(input.longitude) ? input.longitude : null
  /** 经度来源说明：显式给了就用它；否则按"给了经度=手动指定 / 没给=未提供"推定，不臆造。 */
  const longitudeFrom = typeof input.longitudeFrom === 'string' && input.longitudeFrom.trim() !== ''
    ? input.longitudeFrom.trim().slice(0, 120)
    : (longitude === null ? '未提供' : '手动指定（未说明来源）')

  // ── 真太阳时校正：仅当给了经度才动，否则用平太阳时（避免"猜经度"）。 ──
  let solarDate = when
  let solarNote = '未校正（未提供经度）'
  if (longitude !== null) {
    const tso = trueSolarOffset(when, longitude)
    solarDate = new Date(when.getTime() + tso.minutes * 60000)
    solarNote = tso.text
  }

  const solar = LunarLib.Solar.fromYmdHms(
    solarDate.getFullYear(), solarDate.getMonth() + 1, solarDate.getDate(),
    solarDate.getHours(), solarDate.getMinutes(), solarDate.getSeconds(),
  )
  const lunar = solar.getLunar()
  const ec = safe(() => lunar.getEightChar(), null)

  // ── 年柱：必须按**立春**换年，不是按农历正月初一 ──
  // 这是术数里最常踩的坑：2026-02-05 农历仍算乙巳年，但立春已过，四柱年柱应为丙午。
  // `getYearInGanZhi()` 是农历年；`getYearInGanZhiExact()` 才是立春换年（且精确到时刻）。
  // 四柱/紫白/太岁/五运六气都要立春年；生肖民俗用农历年，故两者都留在盘上。
  const yearGZ = safe(() => lunar.getYearInGanZhiExact(), '') || safe(() => lunar.getYearInGanZhi(), '')
  const lunarYearGZ = safe(() => lunar.getYearInGanZhi(), '')
  // ── 月柱：必须按**节令时刻**换月（定气法），不是按"节令那一天" ──
  // 实测（vendor/lunar.cjs）：`getMonthInGanZhi()` 在节令当日 0 点就换月（如 1900-07-07 08:42
  // 小暑尚未到，它已给未月），而 `getMonthInGanZhiExact()` 才是按**精确时刻**换月。
  // 年柱既然按立春时刻，月柱没有理由按"日"；v2 改用 Exact（对拍 tyme4ts 与太阳视黄经分宫一致）。
  const monthGZ = safe(() => lunar.getMonthInGanZhiExact(), '') || safe(() => lunar.getMonthInGanZhi(), '')
  const dayGZ = safe(() => lunar.getDayInGanZhi(), '')
  const hourGZ = safe(() => lunar.getTimeInGanZhi(), '')
  const pillars = [yearGZ, monthGZ, dayGZ, hourGZ]

  const dayGan = dayGZ[0] ?? ''
  const dayZhi = dayGZ[1] ?? ''
  const monthZhi = monthGZ[1] ?? ''
  const yearZhi = yearGZ[1] ?? ''
  const hourZhi = hourGZ[1] ?? ''

  const prevJieQi = safe(() => lunar.getPrevJieQi(), null)
  const nextJieQi = safe(() => lunar.getNextJieQi(), null)

  const monthWx = ZHI_WUXING[monthZhi] ?? '土'
  const { xun, kong } = xunOf(dayGZ || '甲子')
  /** v2：黄黑道十二神（与四柱同口径，见 almanac 注释）。 */
  const hh = huangheidaoOf(monthZhi, dayZhi)

  /** v2：五行力量改按人元司令分野 + 藏干权重（见 wuxingWeighted 注释）。 */
  const named = [
    { name: '年', gz: yearGZ },
    { name: '月', gz: monthGZ },
    { name: '日', gz: dayGZ },
    { name: '时', gz: hourGZ },
  ]
  const wx = wuxingWeighted(named)

  /** v2：人元司令分野（月令当权之干）。 */
  const renyuan = renyuanOfChartCivil(lunar, {
    y: solarDate.getFullYear(), m: solarDate.getMonth() + 1, d: solarDate.getDate(),
    h: solarDate.getHours(), mi: solarDate.getMinutes(), s: solarDate.getSeconds(),
  }, monthZhi)

  /** v2：完整神煞（≥20 种）；v1 的 shensha 四键另算，保持恰 4 键。 */
  const shenshaAll = shenshaAllOf(named)

  /** 四柱详细。 */
  const pillarDetail = makePillarDetail(named, dayGan)

  /** 神煞（以年支与日支各查一遍）——v1 形状，**恰好 4 个键**。 */
  const shensha = {}
  for (const kind of ['驿马', '桃花', '华盖', '将星']) {
    const byYear = shenShaOf(kind, yearZhi)
    const byDay = shenShaOf(kind, dayZhi)
    shensha[kind] = { byYear, byDay, hit: byYear === byDay ? byYear : `${byYear ?? '—'}/${byDay ?? '—'}` }
  }

  /** v2：早/晚子时归属。
   *
   * 对拍发现（见 docs/verification/kernel-astro-crosscheck.md）：`vendor/lunar.cjs`
   * 在 23:00–24:00（晚子时）**日柱与时柱不同源**——
   *   · `getDayInGanZhi()`（v1 日柱用的）返回**当日**干支（流派二）；
   *   · `getTimeInGanZhi()`（v1 时柱用的）却用**次日**日干起子时（流派一的口径）。
   * 即 v1 盘在晚子时是"两派各取一半"的混合盘，101 法里的日建/旬空/时干会互相打架。
   * v2 **不改 v1 的 `ganzhi.day`/`ganzhi.hour`**（契约 §3.1 只许加不许改，且改日柱会波及全法），
   * 但把两派的**自洽解**都算出来放在这里，命理类可自选；`selfConsistent` 标出 v1 是否同源。
   */
  const solarHour = solarDate.getHours()
  const lateZi = hourZhi === '子' && solarHour === 23
  const earlyZi = hourZhi === '子' && solarHour === 0
  const dayGZSchool1 = safe(() => lunar.getDayInGanZhiExact(), '')   // 晚子时算次日
  const dayGZSchool2 = safe(() => lunar.getDayInGanZhiExact2(), '')  // 晚子时算当日
  const hourGZSchool1 = hourGZByWuShu(dayGZSchool1[0] ?? '', hourZhi)
  const hourGZSchool2 = hourGZByWuShu(dayGZSchool2[0] ?? '', hourZhi)
  const selfConsistent = hourGZ === hourGZByWuShu(dayGan, hourZhi)
  const dayBoundary = {
    lateZi,
    earlyZi,
    hourZhi,
    hour: solarHour,
    convention: '晚子时日柱算当日（流派二）',
    dayGZ,
    dayGZSchool1,
    dayGZSchool2,
    hourGZ,
    /** 流派一自洽解：日柱进次日，时柱由次日日干起（子平主流）。 */
    school1: { day: dayGZSchool1, hour: hourGZSchool1 },
    /** 流派二自洽解：日柱算当日，时柱由当日日干起。 */
    school2: { day: dayGZSchool2, hour: hourGZSchool2 },
    /** v1 的 (日柱, 时柱) 是否同源；晚子时为 false（本轮对拍发现的既有缺陷，未擅改）。 */
    selfConsistent,
    note: lateZi
      ? `晚子时。本盘日柱/时柱沿用 v1：日柱 ${dayGZ}（流派二·当日），时柱 ${hourGZ}。`
        + `注意 v1 两柱不同源（selfConsistent=${selfConsistent}）；自洽解：流派一 ${hourGZSchool1}，流派二 ${hourGZSchool2}。`
      : earlyZi
        ? '早子时（0 时后），日柱与时柱同日，两派无分歧。'
        : `非子时（时支 ${hourZhi || '—'}），无早晚子时归属问题。`,
  }

  /** 大运（仅当有出生资料时算）。 */
  let yun = null
  if (input.birth && ec) {
    const genderNum = input.gender === '女' ? 0 : 1
    const y = safe(() => ec.getYun(genderNum), null)
    if (y) {
      yun = {
        startYear: safe(() => y.getStartYear(), 0),
        startMonth: safe(() => y.getStartMonth(), 0),
        startDay: safe(() => y.getStartDay(), 0),
        startSolar: safe(() => safe(() => y.getStartSolar().toYmdHms(), ''), ''),
        daYun: safe(() => (y.getDaYun() || []).slice(0, 9).map((d) => ({
          gz: safe(() => d.getGanZhi(), ''),
          startAge: safe(() => d.getStartAge(), 0),
          endAge: safe(() => d.getEndAge(), 0),
          startYear: safe(() => d.getStartYear(), 0),
        })), []),
      }
    }
  }

  /** 出生盘（命理类）。 */
  let birthChart = null
  if (input.birth) {
    const b = input.birth
    const bs = safe(() => LunarLib.Solar.fromYmdHms(b.y, b.m, b.d, b.h ?? 12, b.mi ?? 0, 0), null)
    if (bs) {
      const bl = bs.getLunar()
      const bec = safe(() => bl.getEightChar(), null)
      const bgz = [
        safe(() => bl.getYearInGanZhi(), ''),
        safe(() => bl.getMonthInGanZhi(), ''),
        safe(() => bl.getDayInGanZhi(), ''),
        safe(() => bl.getTimeInGanZhi(), ''),
      ]
      const bDayGan = bgz[2][0] ?? ''
      const bMonthZhi = bgz[1][1] ?? ''
      // 出生时刻按**固定 UTC+8** 解释（见文件头「时间口径」与 birthInstant 注释）。
      // 绝不可退回 new Date(y, m-1, d, h, mi)：那会引入宿主时区与历史 DST，跨机器不可复现。
      const birthDate = birthInstant(b.y, b.m, b.d, b.h ?? 12, b.mi ?? 0)
      const bCivil = { y: b.y, m: b.m, d: b.d, h: b.h ?? 12, mi: b.mi ?? 0, s: 0 }
      const bNamed = [
        { name: '年', gz: bgz[0] }, { name: '月', gz: bgz[1] },
        { name: '日', gz: bgz[2] }, { name: '时', gz: bgz[3] },
      ]
      birthChart = {
        solar: `${b.y}-${String(b.m).padStart(2, '0')}-${String(b.d).padStart(2, '0')} ${String(b.h ?? 12).padStart(2, '0')}:${String(b.mi ?? 0).padStart(2, '0')}`,
        lunar: safe(() => bl.toString(), ''),
        pillars: bgz,
        dayGan: bDayGan,
        yearZhi: bgz[0][1] ?? '',
        monthZhi: bMonthZhi,
        dayZhi: bgz[2][1] ?? '',
        hourZhi: bgz[3][1] ?? '',
        wuxing: wuxingWeighted(bNamed),
        nayin: bgz.map((g) => NAYIN[g] ?? ''),
        taiYuan: safe(() => bec?.getTaiYuan(), ''),
        mingGong: safe(() => bec?.getMingGong(), ''),
        shenGong: safe(() => bec?.getShenGong(), ''),
        tenGods: bgz.map((g, i) => (i === 2 ? '日主' : safe(() => [
          bec?.getYearShiShenGan?.(), bec?.getMonthShiShenGan?.(), null, bec?.getTimeShiShenGan?.(),
        ][i], '—'))),
        // ── v2 追加 ──
        pillarDetail: makePillarDetail(bNamed, bDayGan),
        renyuan: renyuanOfChartCivil(bl, bCivil, bMonthZhi),
        shenshaAll: shenshaAllOf(bNamed),
        /** 出生瞬间的真实天象（西占/七政用；缺时刻精度时自降 fidelity，方法层自行判断）。 */
        astro: safe(() => computeAstro(birthDate), null),
        /** 时间口径自证：出生民用时刻固定按 UTC+8 解释，与宿主时区无关（跨机器可复现）。 */
        tz: 'UTC+8（固定偏移，不查时区库；出生民用时刻 ' + `${b.y}-${String(b.m).padStart(2, '0')}-${String(b.d).padStart(2, '0')} ${String(b.h ?? 12).padStart(2, '0')}:${String(b.mi ?? 0).padStart(2, '0')}`
          + ' ⇒ UTC ' + (birthDate ? birthDate.toISOString() : '—') + '）',
      }
    }
  }

  /** 随机性来源（用户 2026-02 直接更正，规格级）。
   *
   * ── 口径 ────────────────────────────────────────────────────────────
   * **默认 = 真随机**：术法里「心诚」是变量 —— 同一人、同一问、同一刻，心意不同结果也可能不同。
   * 故默认模式**不从 (question|when|longitude) 派生种子**，而是每次调用取一次 **OS/加密熵**
   * （`crypto.randomUUID()`）；同一人同问同刻多次调用**允许不同，这是正常的**。
   * **传了 `seed` = 复现模式**：结果可复现，供测试/复核/留档用；此时各法种子仍按
   * `seedBase|法号`（`runner.js`）派生，派生方式不变。
   *
   * ⚠ 术法层纪律与种子来源无关：各引擎仍然只准用注入的 `rand`、禁止 `Math.random()`（见 runner.js 契约）。
   * ⚠ 模式必须自证：`meta.mode` / `meta.randomMode` / `meta.seedUsed` / `meta.modeNote`。
   *
   * 另（Lead 对拍台查出的旧问题，仍成立）：seed 模式下种子只由**用户输入**派生，
   * 不锚定真太阳时等派生量 —— v1 曾用校正后的 `solarDate` 当种子，均时差公式一精化就整体漂移、不可复现。
   */
  const seedExplicit = input.seed !== undefined && String(input.seed) !== ''
  const randomMode = !seedExplicit
  const seedBase = seedExplicit
    ? String(input.seed)
    : `rnd-${randomUUID()}`

  // ── 天象：用**求占的绝对时刻** when（真太阳时是"改钟不改天"，不影响天体位置） ──
  const astro = safe(() => computeAstro(when), null)

  // ── 真太阳时（v2 字段；与 v1 的 solarDate 只在"未给经度"时有别，见 solarTrue 注释） ──
  const tstEotMin = equationOfTime(when)
  const lonPartMin = longitude === null ? 0 : (longitude - STD_MERIDIAN) * 4
  const tstOffsetMin = lonPartMin + tstEotMin
  const tst = new Date(when.getTime() + tstOffsetMin * 60000)

  const now = new Date()

  return {
    // 输入
    question,
    when,
    solarDate,
    longitude,
    longitudeFrom,
    solarNote,
    /** 位置口径（可见化）：经度来源 + 是否真太阳时校正。缺省「未提供」时如实说明未校正。 */
    position: {
      longitude,
      from: longitudeFrom,
      corrected: longitude !== null,
      note: longitude === null
        ? `未提供经度（来源：${longitudeFrom}）→ **未做真太阳时校正**，四柱用平太阳时`
        : `经度 ${longitude}（来源：${longitudeFrom}）→ 已做真太阳时校正：${solarNote}`,
    },
    /** 求占者：本版**不引入**求占者要素（用户 2026-02 更正：「根本不需要限制一致性」，该设计作废）。 */
    asker: undefined,
    gender: input.gender === '女' ? '女' : '男',
    numbers: Array.isArray(input.numbers) ? input.numbers.map(Number).filter(Number.isFinite) : [],
    coins: Array.isArray(input.coins) ? input.coins.map(Number).filter(Number.isFinite) : [],
    seedBase,

    // 公历 / 农历
    solar: {
      y: solarDate.getFullYear(), m: solarDate.getMonth() + 1, d: solarDate.getDate(),
      h: solarDate.getHours(), mi: solarDate.getMinutes(),
      weekday: ['日', '一', '二', '三', '四', '五', '六'][solarDate.getDay()],
      text: `${solarDate.getFullYear()}-${String(solarDate.getMonth() + 1).padStart(2, '0')}-${String(solarDate.getDate()).padStart(2, '0')} ${String(solarDate.getHours()).padStart(2, '0')}:${String(solarDate.getMinutes()).padStart(2, '0')}`,
    },
    lunar: {
      year: safe(() => lunar.getYear(), 0),
      month: safe(() => lunar.getMonth(), 0),
      day: safe(() => lunar.getDay(), 0),
      text: safe(() => lunar.toString(), ''),
      monthName: safe(() => lunar.getMonthInChinese(), ''),
      dayName: safe(() => lunar.getDayInChinese(), ''),
      season: safe(() => lunar.getSeason(), ''),
    },

    // ── v2 新增：真太阳时 ──
    /**
     * 真太阳时 = 平太阳时 + 经度差 + 均时差。
     * · 给了经度时：与 v1 的 `solarDate` 同值（v1 也只做这两项修正），可用来核对 `solar`；
     * · 未给经度时：`solar` 保持 v1 的"不校正"，而本字段仍做**均时差**修正
     *   （等价于以标准经线 120°E 为准），故两者会差 ±16 分钟内 —— 这是刻意的，
     *   不校正经度不等于"太阳时=钟表时"。
     */
    solarTrue: {
      y: tst.getFullYear(), m: tst.getMonth() + 1, d: tst.getDate(),
      h: tst.getHours(), mi: tst.getMinutes(),
      text: `${tst.getFullYear()}-${String(tst.getMonth() + 1).padStart(2, '0')}-${String(tst.getDate()).padStart(2, '0')} ${String(tst.getHours()).padStart(2, '0')}:${String(tst.getMinutes()).padStart(2, '0')}`,
      offsetMin: Math.round(tstOffsetMin * 1000) / 1000,
      lonPartMin: Math.round(lonPartMin * 1000) / 1000,
      eotMin: Math.round(tstEotMin * 1000) / 1000,
      note: longitude === null
        ? `未提供经度：仅做均时差 ${tstEotMin >= 0 ? '+' : ''}${tstEotMin.toFixed(1)}′ 修正（等价于以 120°E 为准）`
        : `平太阳时 ${tstOffsetMin >= 0 ? '+' : ''}${tstOffsetMin.toFixed(1)}′（经度差 ${lonPartMin >= 0 ? '+' : ''}${lonPartMin.toFixed(1)}′ + 均时差 ${tstEotMin >= 0 ? '+' : ''}${tstEotMin.toFixed(1)}′）`,
    },

    // ── v2 新增：天象 ──
    astro,

    // 四柱（年柱已按立春换年，见上文注释）
    ganzhi: { year: yearGZ, month: monthGZ, day: dayGZ, hour: hourGZ },
    /** 农历年干支（生肖民俗用；与四柱年柱在立春前后会不同）。 */
    lunarYearGZ,
    lunarYearZhi: lunarYearGZ[1] ?? '',
    /** 立春年与农历年是否一致（不一致时，命理类与生肖类会给出不同的年）。 */
    yearBoundarySplit: yearGZ !== lunarYearGZ,
    pillars,
    pillarDetail,
    dayGan, dayZhi, monthZhi, yearZhi, hourZhi,
    dayMasterWx: GAN_WUXING[dayGan] ?? '',
    monthWx,
    wuxing: wx,
    /** v2：人元司令分野（月令当权之干与其用事日数）。 */
    renyuan,
    /** v2：早/晚子时归属与两种日柱流派。 */
    dayBoundary,
    /** v2：完整神煞命中表（28 种）。 */
    shenshaAll,
    birthChart,
    yun,

    // 节气
    jieqi: {
      prev: safe(() => prevJieQi?.getName(), ''),
      prevAt: safe(() => prevJieQi?.getSolar()?.toYmdHms(), ''),
      next: safe(() => nextJieQi?.getName(), ''),
      nextAt: safe(() => nextJieQi?.getSolar()?.toYmdHms(), ''),
      current: safe(() => lunar.getJieQi(), ''),
      hou: safe(() => lunar.getHou(), ''),
      wuhou: safe(() => lunar.getWuHou(), ''),
    },

    // 旬空
    xun: { name: xun, kong },
    xunKong: {
      day: safe(() => lunar.getDayXunKong(), kong.join('')),
      time: safe(() => lunar.getTimeXunKong(), ''),
      year: safe(() => lunar.getYearXunKong(), ''),
    },

    // 择日 / 黄历
    almanac: {
      zhiXing: safe(() => lunar.getZhiXing(), ''),                 // 建除十二神
      tianShen: safe(() => lunar.getDayTianShen(), ''),            // 黄黑道值日神
      tianShenType: safe(() => lunar.getDayTianShenType(), ''),    // 黄道/黑道
      tianShenLuck: safe(() => lunar.getDayTianShenLuck(), ''),    // 吉/凶
      xiu: safe(() => lunar.getXiu(), ''),                         // 二十八宿
      xiuLuck: safe(() => lunar.getXiuLuck(), ''),
      xiuSong: safe(() => lunar.getXiuSong(), ''),
      zheng: safe(() => lunar.getZheng(), ''),
      animal: safe(() => lunar.getAnimal(), ''),
      nineStar: safe(() => lunar.getDayNineStar()?.toString(), ''),  // 日九星
      nineStarNum: safe(() => lunar.getDayNineStar()?.getNumber(), 0),
      timeNineStar: safe(() => lunar.getTimeNineStar?.()?.toString(), ''),
      yi: safe(() => lunar.getDayYi(), []),
      ji: safe(() => lunar.getDayJi(), []),
      jiShen: safe(() => lunar.getDayJiShen(), []),
      xiongSha: safe(() => lunar.getDayXiongSha(), []),
      pengZuGan: safe(() => lunar.getPengZuGan(), ''),
      pengZuZhi: safe(() => lunar.getPengZuZhi(), ''),
      liuYao: safe(() => lunar.getLiuYao(), ''),                    // 六曜
      shou: safe(() => lunar.getShou(), ''),
      positionXi: safe(() => lunar.getDayPositionXi(), ''),
      positionCai: safe(() => lunar.getDayPositionCai(), ''),
      positionTai: safe(() => lunar.getDayPositionTai(), ''),
      positionFu: safe(() => lunar.getDayPositionFu?.(), ''),

      // ── v2 追加：月建口径对照 ──
      // 库的 `zhiXing`/`tianShen` 走**通书口径**（交节日当天即换月建，日粒度）；
      // 而四柱 `monthZhi` 走**节令时刻口径**。两者在交节后约一天内会不同 —— 是口径差异，不是谁错：
      // 择日/黄历按通书（日粒度）看，八字/六爻/奇门按节令时刻看。故两套都留在盘上。
      // 详见 docs/verification/kernel-astro-crosscheck.md「通书口径 vs 四柱口径」。
      /** 库内部用的月支（通书口径，日粒度换月建）。 */
      monthZhiTongshu: safe(() => String(lunar.getMonthInGanZhi() ?? '')[1] ?? '', ''),
      /** 建除十二神（**与四柱同口径**：按节令时刻换月建）。 */
      zhiXingExact: jianchuOf(monthZhi, dayZhi),
      /** 黄黑道十二神（与四柱同口径）。 */
      tianShenExact: hh.name,
      tianShenExactType: hh.type,
      tianShenExactLuck: hh.luck,
      /** 通书口径与四柱口径是否一致（交节后约一天内为 false）。 */
      tongshuAgrees: safe(() => String(lunar.getMonthInGanZhi() ?? '')[1] ?? '', '') === monthZhi,
    },

    // 神煞（v1 四键；完整表见 shenshaAll）
    shensha,

    // 元信息
    meta: {
      builtAt: now.toISOString(),
      hash: hash32(seedBase),
      // ── v2 溯源自证 ──
      astroSource: ASTRO_SOURCE,
      astroFrame: ASTRO_FRAME,
      wuxingMethod: '天干各1 + 月支按人元司令分野比例×2（tables.CANGGAN_W）+ 其余支本/中/余气1/0.4/0.2',
      renyuanSource: '《渊海子平·卷一·人元司令分野》（core/tables.js，verified:partial）',
      /** 时间口径自证：`when` 是绝对瞬间；`birth` 是按固定 UTC+8 解释的民用时刻。 */
      timeConvention: 'when=绝对瞬间（跨时区本就代表不同瞬间）｜birth=民用时刻按固定 UTC+8 解释（不查时区库，免历史 DST 干扰）｜农历/四柱只吃无时区数字，从来不受宿主时区影响',
      shenshaSource: '《三命通会》《渊海子平》通行口诀 28 种（verified:common-form，异说见各条 note）',
      monthBoundary: '四柱月柱按节令**时刻**换月（lunar.getMonthInGanZhiExact，定气法）；almanac.zhiXing/tianShen 为通书日粒度口径，对照值见 zhiXingExact/tianShenExact/tongshuAgrees',
      seedAnchor: randomMode
        ? '**随机模式**：seedBase = rnd-<crypto.randomUUID()>（每次调用取一次 OS 加密熵，故同一人同问同刻多次调用允许不同）'
        : '**seed 复现模式**：seedBase = 用户显式传入的 seed（各法种子仍按 seedBase|法号 派生，不锚定真太阳时等派生量）',
      determinism: '随机性口径（用户 2026-02 更正）：**默认真随机** —— 术法里「心诚」是变量，同一人同问同刻也可能不同，故不保证一致；**传 seed 才可复现**（测试/复核/留档用）。各法仍只准用注入的 rand、禁止 Math.random()。',
      randomMode,
      mode: randomMode ? 'random' : 'seed',
      seedUsed: seedBase,
      modeNote: randomMode
        ? '本次为**随机模式**（真实随机源：OS 加密熵 / crypto.randomUUID）。同问同刻重复求占允许不同，属正常。记下 seedUsed 并回传 seed 可复现本次结果。'
        : `本次为 **seed 复现模式**（seed = ${seedBase}）：同问同刻 + 同 seed 必得同一结果。`,
      longitudeSource: longitudeFrom,
      dayOfYear: dayOfYear(solarDate),
    },
  }
}

/**
 * @typedef {ReturnType<typeof buildChart>} Chart
 */

/**
 * 把干支序号转成干支串（供各法起卦用）。
 * @param {number} i 序号。
 * @returns {string} 干支。
 */
export function gz(i) {
  return GAN[mod(i, 10)] + ZHI[mod(i, 12)]
}

export { LunarLib }
